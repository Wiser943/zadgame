// Jobs app: pick a career, clock in for a real 9 to 5 workday (Lagos time), get paid once per full hour, get promoted as shifts add up.
// Pay is decided here, never by the client. Each hour is credited at most once: the credit is claimed in the database update itself.
const express = require('express');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const J = require('../utils/acjobs');
const L = require('../utils/aclagos');
const T = require('../utils/actransport');
const TR = require('./actransport');
const { queueCard, timeline } = require('../utils/accards');

const router = express.Router();
router.use(ensureAuth);
const bad = (res, code, message) => res.status(code).json({ message });
const SHIFT_MS = J.SHIFT_SECONDS * 1000, SLACK = 4000;      // slack = network jitter, so auto-work never misses a beat

function mine(u) {
  const a = u.ac || {}, shifts = (a.jobShifts && (a.jobShifts.get ? a.jobShifts.get(a.jobId) : a.jobShifts[a.jobId])) || 0;
  const d = a.jobId ? J.describe(a.jobId, shifts) : null;
  if (!d) return null;
  const today = J.dayKey(Date.now());
  const jb = J.jobOf(a.jobId), pk = jb && jb.requires ? T.pickVehicle(a.tr, jb.requires, Date.now(), 0.5) : null;      // transport careers need a vehicle that is ready
  return { ...d, blocked: pk && pk.err ? pk.err : '', needs: jb && jb.requires ? jb.requires : null, auto: a.autoWork !== false,
    clockedIn: !!a.clockAt, clockAt: a.clockAt ? new Date(a.clockAt).getTime() : 0, nextShiftAt: a.clockAt ? new Date(a.clockAt).getTime() + SHIFT_MS : 0, workEnd: J.endOf(Date.now()), hours: J.clockLabel(J.WORK_START) + ' to ' + J.clockLabel(J.WORK_END),
    shiftsToday: a.shiftDay === today ? a.shiftsToday || 0 : 0, maxPerDay: J.MAX_SHIFTS_PER_DAY, closed: a.clockAt ? '' : J.offDuty(Date.now()) };
}
const reply = (u, extra = {}) => ({ mine: mine(u), cash: u.ac.cash, now: Date.now(), shiftSeconds: J.SHIFT_SECONDS, ...extra });

router.get('/', async (req, res, next) => {
  try { let u = await ensureAC(req.user.id); if (u.ac.clockAt) u = (await settle(req.user.id, req.app.get('io'))).u || u; res.json({ jobs: J.catalogue(), ...reply(u) }); } catch (e) { next(e); }
});

router.post('/switch', async (req, res, next) => {
  try {
    const id = String((req.body && req.body.id) || ''), job = J.jobOf(id);
    if (!job) return bad(res, 400, 'Unknown job.');
    await ensureAC(req.user.id);
    const u = await User.findByIdAndUpdate(req.user.id, { $set: { 'ac.jobId': id } }, { new: true });   // lastShift is kept, so switching can't skip the cooldown
    res.json(reply(u));
  } catch (e) { next(e); }
});

router.post('/auto', async (req, res, next) => {
  try {
    await ensureAC(req.user.id);
    const u = await User.findByIdAndUpdate(req.user.id, { $set: { 'ac.autoWork': !!(req.body && req.body.on) } }, { new: true });
    res.json(reply(u));
  } catch (e) { next(e); }
});

/* ---------- the 9 to 5 workday ----------
   settle(): pays every FULL hour a clocked-in player has worked so far (up to 5 PM), once. Safe to call any time: from the Jobs screen, from /work,
   and from the background sweep in server.js, so you still get paid while the game is closed. */
async function settle(uid, io, now = Date.now()) {
  let u = await User.findById(uid); if (!u || !u.ac || !u.ac.clockAt || !u.ac.jobId) return { earned: 0, u };
  const a = u.ac, clockAt = new Date(a.clockAt), dayOfClock = J.dayKey(clockAt.getTime()), done = a.shiftDay === dayOfClock ? a.shiftsToday || 0 : 0;
  let n = J.dueShifts(clockAt, now, done); const dayOver = now >= J.endOf(clockAt.getTime()) || done + n >= J.MAX_SHIFTS_PER_DAY;
  const cur = mine(u), job = J.jobOf(a.jobId); if (!cur || !job) return { earned: 0, u };
  const pick = job.requires ? T.pickVehicle(a.tr, job.requires, now, 0.5) : null;          // taxi, delivery and boat shifts use a vehicle
  let stopMsg = '';
  if (pick && !pick.err && !pick.rental && n > 0) { const can = Math.min(n, Math.floor(pick.v.fuel / pick.burn), Math.floor(pick.v.cond / (pick.wear || 1))); if (can < n) { n = Math.max(0, can); stopMsg = 'Your vehicle ran low, so you clocked out early.'; } }
  else if (pick && pick.err && n > 0) { n = 0; stopMsg = pick.err; }
  const clockOut = dayOver || !!stopMsg;
  if (n <= 0) {
    if (clockOut) { await User.updateOne({ _id: uid, 'ac.clockAt': a.clockAt }, { $set: { 'ac.clockAt': null } }); u = await User.findById(uid); }
    return { earned: 0, u, clockedOut: clockOut, stopMsg };
  }
  const per = Math.round(cur.pay * L.jobMult(L.currentEvent(now), cur.field) * (pick && !pick.err ? 1 + T.tipPct(pick.v) / 100 : 1) / 100) * 100 || cur.pay, pay = per * n;
  const inc = { 'ac.cash': pay, ['ac.jobShifts.' + cur.id]: n }, set = { 'ac.shiftDay': dayOfClock, 'ac.lastShift': new Date(now), 'ac.clockAt': clockOut ? null : new Date(clockAt.getTime() + n * SHIFT_MS) };
  if (a.shiftDay === dayOfClock) inc['ac.shiftsToday'] = n; else set['ac.shiftsToday'] = n;
  const q = { _id: uid, 'ac.clockAt': a.clockAt, 'ac.jobId': cur.id };       // claims these hours: a second request in the same moment finds the clock already moved on
  if (pick && !pick.err && !pick.rental) { q['ac.tr.vehicles'] = { $elemMatch: { id: pick.v.id, fuel: { $gte: pick.burn * n }, cond: { $gte: (pick.wear || 0) * n } } }; inc['ac.tr.vehicles.$.fuel'] = -pick.burn * n; inc['ac.tr.vehicles.$.cond'] = -(pick.wear || 0) * n; }
  let upd = await User.findOneAndUpdate(q, { $inc: inc, $set: set }, { new: true });
  if (!upd) return { earned: 0, u: await User.findById(uid) };
  try {     // invite commission: whoever invited this player earns a small % of every shift, for a while after the friend joined
    const hb = upd.ac && upd.ac.hub, INV = require('../utils/achub').INVITE;
    if (hb && hb.invitedBy && hb.invitedAt && now - new Date(hb.invitedAt).getTime() < INV.commissionDays * 86400e3) {
      const cut = Math.max(10, Math.round(pay * INV.commissionPct / 100));
      const r = await User.updateOne({ _id: hb.invitedBy }, { $inc: { 'ac.cash': cut, 'ac.hub.inviteCommission': cut } });
      if (r.modifiedCount) await User.updateOne({ _id: uid }, { $inc: { 'ac.hub.commissionGiven': cut } });
    }
  } catch (e) { /* commission must never block pay */ }
  const inci = pick && !pick.err ? await TR.afterTrip(uid, pick.v, now) : null;      // a ticket or a small crash can follow a motor shift
  if (inci) upd = await User.findById(uid);
  const after = mine(upd), promoted = after.level > cur.level ? after.title : null;
  if (promoted) {
    timeline(uid, '🎉', 'Promoted to ' + promoted);
    queueCard(io, uid, { icon: '🎉', title: 'Promotion!', text: `You are now ${promoted}. Oga is proud of you.`, lines: [['New pay', '₦' + after.pay.toLocaleString('en-NG') + ' per shift']], tone: 'gold', btn: 'Let us go' }).catch(() => {});
  } else if (cur.shifts === 0) timeline(uid, '💼', 'Worked the first shift as ' + cur.title);
  if (clockOut && io) require('../utils/acnotify').notify(io, uid, { icon: '🏁', text: stopMsg || `Workday done. You earned ₦${pay.toLocaleString('en-NG')} in your last pay run.`, kind: 'good' }).catch(() => {});
  return { earned: pay, u: upd, promoted, incident: TR.incidentLine(inci), clockedOut: clockOut, stopMsg };
}

// "Work": clock in when you are not clocked in, otherwise collect the hours you have finished. Both are safe to press any time.
router.post('/work', async (req, res, next) => {
  try {
    const now = Date.now(), uid = req.user.id, io = req.app.get('io');
    let u = await ensureAC(uid); const cur = mine(u);
    if (!cur) return bad(res, 400, 'Pick a job first.');
    if (u.ac.clockAt) {
      const r = await settle(uid, io, now);
      return res.json(reply(r.u, { earned: r.earned, promoted: r.promoted || null, event: L.currentEvent(now).id, incident: r.incident || '', clockedOut: !!r.clockedOut, note: r.stopMsg || '' }));
    }
    const closed = J.offDuty(now); if (closed) return bad(res, 409, closed);
    const today = J.dayKey(now), done = u.ac.shiftDay === today ? u.ac.shiftsToday || 0 : 0;
    if (done >= J.MAX_SHIFTS_PER_DAY) return bad(res, 409, 'You have worked a full day. Rest and come back tomorrow.');
    const job = J.jobOf(cur.id), pick = job && job.requires ? T.pickVehicle(u.ac.tr, job.requires, now, 0.5) : null;
    if (pick && pick.err) return bad(res, 409, pick.err);
    const upd = await User.findOneAndUpdate({ _id: uid, 'ac.clockAt': null }, { $set: { 'ac.clockAt': new Date(now), ...(u.ac.shiftDay === today ? {} : { 'ac.shiftDay': today, 'ac.shiftsToday': 0 }) } }, { new: true });
    res.json(reply(upd || u, { earned: 0, clockedIn: true, note: `Clocked in. You are paid every full hour until ${J.clockLabel(J.WORK_END)}.` }));
  } catch (e) { next(e); }
});
router.post('/clockout', async (req, res, next) => {
  try {
    const now = Date.now(), uid = req.user.id, io = req.app.get('io'); await ensureAC(uid);
    const r = await settle(uid, io, now); await User.updateOne({ _id: uid }, { $set: { 'ac.clockAt': null } });
    res.json(reply(await User.findById(uid), { earned: r.earned, promoted: r.promoted || null, note: 'Clocked out. The part-hour you were in is not paid.' }));
  } catch (e) { next(e); }
});

router.settle = settle;
module.exports = router;
