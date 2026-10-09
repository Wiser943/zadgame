// Lagos Life: city events, weekly utility bills, starter quests and the daily streak. All money moves are atomic and server-side.
const express = require('express');
const User = require('../models/User');
const ACWallet = require('../models/ACWallet');
const ACTxn = require('../models/ACTxn');
const ACMessage = require('../models/ACMessage');
const { Friendship } = require('../models/Social');
const { GistPost } = require('../models/Gist');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const { makeRef } = require('../utils/acbank');
const { notify, emitUser } = require('../utils/acnotify');
const L = require('../utils/aclagos');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const STARTER_ITEMS = 8;

/* issue this cycle's bills if they do not exist yet (safe to call from several requests at once) */
async function issueBills(id, now = Date.now()) {
  const u = await ensureAC(id); if (!u) return null;
  const fresh = L.newBills(u, now);
  for (const b of fresh) {
    await User.updateOne({ _id: id, 'ac.bills': { $not: { $elemMatch: { cycle: b.cycle, key: b.key } } } }, { $push: { 'ac.bills': { $each: [b], $slice: -L.KEEP * 3 } } });
  }
  return fresh.length ? User.findById(id) : u;
}
const billList = (u, now) => (u.ac.bills || []).map((b) => L.billView(b, now)).sort((a, b) => (a.paid - b.paid) || (a.due - b.due));
const unpaidSummary = (u, now) => { const l = billList(u, now).filter((b) => !b.paid); return { count: l.length, total: l.reduce((s, b) => s + b.total, 0), overdue: l.filter((b) => b.overdue).length, powerCut: L.powerCut(u.ac.bills, now) }; };

router.get('/bills', async (req, res, next) => {
  try {
    const now = Date.now(), u = await issueBills(uid(req), now);
    res.json({ cash: u.ac.cash, bills: billList(u, now), summary: unpaidSummary(u, now), cycle: L.cycleOf(now).key, event: L.publicEvent(L.currentEvent(now)) });
  } catch (e) { next(e); }
});

async function payOne(me, cycle, key, now) {
  const u = await User.findById(me).select('ac.bills ac.cash'); if (!u) return { err: 'No account.' };
  const b = (u.ac.bills || []).find((x) => x.cycle === cycle && x.key === key);
  if (!b) return { err: 'No such bill.' };
  if (b.paidAt) return { err: 'That bill is already paid.', code: 409 };
  const fee = L.lateFee(b, now), total = b.amount + fee;
  const after = await User.findOneAndUpdate(
    { _id: me, 'ac.cash': { $gte: total }, 'ac.bills': { $elemMatch: { cycle, key, paidAt: null } } },
    { $inc: { 'ac.cash': -total }, $set: { 'ac.bills.$[b].paidAt': new Date(now), 'ac.bills.$[b].fee': fee } },
    { new: true, arrayFilters: [{ 'b.cycle': cycle, 'b.key': key, 'b.paidAt': null }] });
  if (!after) return { err: 'Not enough ₦ for this bill.', code: 402 };
  const d = L.BILLS[key];
  await ACTxn.create({ user: me, type: 'debit', amount: total, cpName: d.company, cpNum: '', note: `${d.name} bill${fee ? ' (incl. late fee)' : ''}`, ref: makeRef(), kind: 'bill' });
  return { total, fee, after };
}
router.post('/bills/pay', async (req, res, next) => {
  try {
    const me = uid(req), now = Date.now(), b = req.body || {};
    await issueBills(me, now);
    const targets = b.all ? (await User.findById(me).select('ac.bills')).ac.bills.filter((x) => !x.paidAt).map((x) => ({ cycle: x.cycle, key: x.key })) : [{ cycle: String(b.cycle || ''), key: String(b.key || '') }];
    if (!targets.length) return bad(res, 409, 'Nothing to pay. You are all up to date.');
    let paid = 0, spent = 0, last = null, firstErr = null;
    for (const t of targets) {
      const r = await payOne(me, t.cycle, t.key, now);
      if (r.err) { firstErr = firstErr || r; if (r.code === 402) break; continue }
      paid++; spent += r.total; last = r.after;
    }
    if (!paid) return bad(res, (firstErr && firstErr.code) || 400, (firstErr && firstErr.err) || 'Could not pay.');
    const u = last || await User.findById(me);
    emitUser(req.app.get('io'), me, 'cash', { delta: -spent });
    if (paid && !L.powerCut(u.ac.bills, now)) notify(req.app.get('io'), me, { icon: '💡', text: `Bill${paid > 1 ? 's' : ''} paid: ${naira(spent)}. Thank you!`, kind: 'good' }).catch(() => {});
    res.json({ paid, spent, cash: u.ac.cash, bills: billList(u, now), summary: unpaidSummary(u, now) });
  } catch (e) { next(e); }
});

/* ----- quests ----- */
async function questState(me) {
  const u = await ensureAC(me), a = u.ac, claimed = new Set(a.questsClaimed || []);
  const [w, fr, msg, gist] = await Promise.all([
    ACWallet.findOne({ user: me }).select('pinHash').lean(),
    Friendship.exists({ status: 'accepted', $or: [{ requester: me }, { recipient: me }] }),
    ACMessage.exists({ from: me }),
    GistPost.exists({ author: me })
  ]);
  const shifts = a.jobShifts ? [...(a.jobShifts.values ? a.jobShifts.values() : Object.values(a.jobShifts))].reduce((s, n) => s + (n || 0), 0) : 0;
  const done = { job: !!a.jobId, shift: shifts > 0, pin: !!(w && w.pinHash), furniture: (a.items || []).length > STARTER_ITEMS, friend: !!fr, message: !!msg, gist: !!gist, bill: (a.bills || []).some((b) => b.paidAt) };
  return { u, list: L.QUESTS.map((q) => ({ id: q.id, title: q.title, hint: q.hint, reward: q.reward, fa: q.fa, done: !!done[q.id], claimed: claimed.has(q.id) })) };
}
router.get('/quests', async (req, res, next) => { try { const { list } = await questState(uid(req)); res.json({ quests: list }); } catch (e) { next(e); } });
router.post('/quests/claim', async (req, res, next) => {
  try {
    const me = uid(req), id = String((req.body && req.body.id) || ''), q = L.QBYID[id];
    if (!q) return bad(res, 400, 'Unknown quest.');
    const { list } = await questState(me), s = list.find((x) => x.id === id);
    if (!s.done) return bad(res, 409, 'Not finished yet.');
    if (s.claimed) return bad(res, 409, 'Already claimed.');
    const u = await User.findOneAndUpdate({ _id: me, 'ac.questsClaimed': { $ne: id } }, { $inc: { 'ac.cash': q.reward }, $push: { 'ac.questsClaimed': id } }, { new: true });
    if (!u) return bad(res, 409, 'Already claimed.');
    await ACTxn.create({ user: me, type: 'credit', amount: q.reward, cpName: 'AllConnect', cpNum: '', note: 'Quest: ' + q.title, ref: makeRef(), kind: 'reward' });
    emitUser(req.app.get('io'), me, 'cash', { delta: q.reward });
    const st = await questState(me);
    res.json({ reward: q.reward, cash: u.ac.cash, quests: st.list });
  } catch (e) { next(e); }
});

/* ----- daily streak ----- */
router.post('/daily', async (req, res, next) => {
  try {
    const me = uid(req), now = Date.now(), u0 = await ensureAC(me), st = L.nextStreak(u0.ac, now);
    if (!st.claimable) return bad(res, 409, 'You already collected today. Come back tomorrow!');
    const amt = L.streakReward(st.streak);
    const u = await User.findOneAndUpdate({ _id: me, 'ac.lastDaily': { $in: [u0.ac.lastDaily || '', null] } }, { $inc: { 'ac.cash': amt }, $set: { 'ac.lastDaily': L.dayKey(now), 'ac.streak': st.streak } }, { new: true });
    if (!u) return bad(res, 409, 'Already collected.');
    await ACTxn.create({ user: me, type: 'credit', amount: amt, cpName: 'AllConnect', cpNum: '', note: `Daily bonus, day ${st.streak}`, ref: makeRef(), kind: 'reward' });
    emitUser(req.app.get('io'), me, 'cash', { delta: amt });
    res.json({ amount: amt, streak: st.streak, cash: u.ac.cash, daily: L.nextStreak(u.ac, now) });
  } catch (e) { next(e); }
});

/* ----- one call for the home screen: today's city event, bills, quests, streak ----- */
router.get('/city', async (req, res, next) => {
  try {
    const me = uid(req), now = Date.now(), u = await issueBills(me, now), ev = L.currentEvent(now);
    const q = await questState(me);
    res.json({
      now, event: L.publicEvent(ev), next: L.publicEvent(L.currentEvent(ev.endsAt + 1)),
      bills: unpaidSummary(u, now), daily: L.nextStreak(u.ac, now),
      quests: { done: q.list.filter((x) => x.done).length, total: q.list.length, claimable: q.list.filter((x) => x.done && !x.claimed).length, claimed: q.list.filter((x) => x.claimed).length }
    });
  } catch (e) { next(e); }
});

module.exports = router;
