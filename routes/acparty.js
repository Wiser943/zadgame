// House Party: GET /api/ac/party/state (host's own dashboard), POST /start, POST /join/:hostId.
// All money moves are atomic and server-side, same convention as Lagos Life / Invest.
const express = require('express');
const User = require('../models/User');
const ACTxn = require('../models/ACTxn');
const { Friendship } = require('../models/Social');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const { notify, emitUser } = require('../utils/acnotify');
const Z = require('../utils/acparty');
const { dayKey } = require('../utils/aclagos');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const naira = (n) => '₦' + Math.round(n || 0).toLocaleString('en-NG');
const PARTY_FIELDS = 'ac.party ac.cash ac.activeProperty';

// If the host's last party has ended and not been settled yet, pay everyone out and mark it settled.
async function settleIfDue(id, now = Date.now(), io = null) {
  const u = await User.findById(id).select(PARTY_FIELDS); if (!u) return null;
  const out = Z.settle(u.ac.party, now);
  if (!out) return u;
  for (const g of out.guests) {
    await User.updateOne({ _id: g.id }, { $inc: { 'ac.cash': Z.GUEST_REWARD } });
    await ACTxn.create({ user: g.id, kind: 'party', amount: Z.GUEST_REWARD, note: 'House party' }).catch(() => {});
    emitUser(io, g.id, 'cash', { delta: Z.GUEST_REWARD });
    notify(io, g.id, { icon: '🎉', text: `House party paid off: ${naira(Z.GUEST_REWARD)} for showing up.`, kind: 'good' }).catch(() => {});
  }
  const hostPay = out.hostBonus;
  if (hostPay) { await ACTxn.create({ user: id, kind: 'party', amount: hostPay, note: 'Hosted a house party' }).catch(() => {}); emitUser(io, id, 'cash', { delta: hostPay }); }
  return User.findOneAndUpdate({ _id: id }, { $inc: { 'ac.cash': hostPay }, $set: { 'ac.party.settled': true } }, { new: true }).select(PARTY_FIELDS);
}
function view(u, now) {
  const p = u.ac.party || {}, active = Z.isActive(p, now);
  return {
    cash: u.ac.cash,
    active, endsAt: active ? new Date(p.endsAt).getTime() : null, openHouse: !!p.openHouse,
    guests: active ? (p.guests || []).length : 0, maxGuests: Z.MAX_GUESTS,
    canStartToday: Z.canStart(p, true, now).ok, cost: Z.COST, durationMin: Z.DURATION_MS / 60000, guestReward: Z.GUEST_REWARD
  };
}

router.get('/state', async (req, res, next) => {
  try { const u = await settleIfDue(uid(req), Date.now(), req.app.get('io')); res.json(view(u, Date.now())); } catch (e) { next(e); }
});

router.post('/start', async (req, res, next) => {
  try {
    const id = uid(req), now = Date.now(); await settleIfDue(id, now, req.app.get('io'));
    const u = await ensureAC(id); const chk = Z.canStart(u.ac.party, true, now);
    if (!chk.ok) return bad(res, 409, chk.reason);
    const hit = await User.findOneAndUpdate({ _id: id, 'ac.cash': { $gte: Z.COST } },
      { $inc: { 'ac.cash': -Z.COST, 'ac.party.thrown': 1 },
        $set: { 'ac.party.endsAt': new Date(now + Z.DURATION_MS), 'ac.party.openHouse': !!(req.body && req.body.openHouse), 'ac.party.lastDay': dayKey(now), 'ac.party.guests': [], 'ac.party.settled': false } },
      { new: true }).select(PARTY_FIELDS);
    if (!hit) return bad(res, 402, `You need ${naira(Z.COST)} for drinks and snacks.`);
    emitUser(req.app.get('io'), id, 'cash', { delta: -Z.COST });
    // Tell friends the party has started — an open house also shows in theirs so friends-of-friends can come.
    Friendship.find({ status: 'accepted', $or: [{ requester: id }, { recipient: id }] }).lean()
      .then((rows) => { const io = req.app.get('io'); for (const r of rows) { const fid = String(r.requester) === id ? String(r.recipient) : String(r.requester); notify(io, fid, { icon: '🎉', text: 'A friend is throwing a house party! Join before it ends.', kind: 'info' }).catch(() => {}); } })
      .catch(() => {});
    res.json(view(hit, now));
  } catch (e) { next(e); }
});

router.post('/join/:hostId', async (req, res, next) => {
  try {
    const id = uid(req), hostId = String(req.params.hostId), now = Date.now();
    if (!/^[a-f0-9]{24}$/i.test(hostId)) return bad(res, 400, 'Bad host.');
    const host = await settleIfDue(hostId, now, req.app.get('io')); if (!host) return bad(res, 404, 'Host not found.');
    const friend = !!(await Friendship.exists({ status: 'accepted', $or: [{ requester: id, recipient: hostId }, { requester: hostId, recipient: id }] }));
    const chk = Z.canJoin(host.ac.party, id, hostId, friend, now);
    if (!chk.ok) return bad(res, 409, chk.reason);
    const upd = await User.findOneAndUpdate({ _id: hostId, 'ac.party.endsAt': host.ac.party.endsAt, 'ac.party.guests': { $not: { $elemMatch: { id } } } },
      { $push: { 'ac.party.guests': { id, at: new Date(now) } } }, { new: true }).select(PARTY_FIELDS);
    if (!upd) return bad(res, 409, 'That party just changed — try again.');
    notify(req.app.get('io'), hostId, { icon: '🎉', text: 'Someone just joined your party!', kind: 'good' }).catch(() => {});
    res.json({ ok: true, joined: true, endsAt: new Date(upd.ac.party.endsAt).getTime(), note: `Stay until the party ends to earn ${naira(Z.GUEST_REWARD)}.` });
  } catch (e) { next(e); }
});

module.exports = router;
