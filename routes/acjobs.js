// Jobs app: pick a career, work 1-hour shifts (manually or "Go automatically"), get promoted as shifts add up.
// Pay is decided here, never by the client. The cooldown between shifts is enforced in the database update itself.
const express = require('express');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const J = require('../utils/acjobs');
const L = require('../utils/aclagos');

const router = express.Router();
router.use(ensureAuth);
const bad = (res, code, message) => res.status(code).json({ message });
const SHIFT_MS = J.SHIFT_SECONDS * 1000, SLACK = 4000;      // slack = network jitter, so auto-work never misses a beat

function mine(u) {
  const a = u.ac || {}, shifts = (a.jobShifts && (a.jobShifts.get ? a.jobShifts.get(a.jobId) : a.jobShifts[a.jobId])) || 0;
  const d = a.jobId ? J.describe(a.jobId, shifts) : null;
  if (!d) return null;
  const today = J.dayKey(Date.now());
  return { ...d, auto: a.autoWork !== false, nextShiftAt: a.lastShift ? new Date(a.lastShift).getTime() + SHIFT_MS : 0,
    shiftsToday: a.shiftDay === today ? a.shiftsToday || 0 : 0, maxPerDay: J.MAX_SHIFTS_PER_DAY, closed: J.offDuty(Date.now()) };
}
const reply = (u, extra = {}) => ({ mine: mine(u), cash: u.ac.cash, now: Date.now(), shiftSeconds: J.SHIFT_SECONDS, ...extra });

router.get('/', async (req, res, next) => {
  try { const u = await ensureAC(req.user.id); res.json({ jobs: J.catalogue(), ...reply(u) }); } catch (e) { next(e); }
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

router.post('/work', async (req, res, next) => {
  try {
    const now = Date.now(), uid = req.user.id;
    let u = await ensureAC(uid);
    const cur = mine(u);
    if (!cur) return bad(res, 400, 'Pick a job first.');
    const closed = J.offDuty(now); if (closed) return bad(res, 409, closed);
    const today = J.dayKey(now);
    await User.updateOne({ _id: uid, 'ac.shiftDay': { $ne: today } }, { $set: { 'ac.shiftDay': today, 'ac.shiftsToday': 0 } });
    const pay = Math.round(cur.pay * L.jobMult(L.currentEvent(now), cur.field) / 100) * 100 || cur.pay;     // city events change what shifts pay
    const upd = await User.findOneAndUpdate(
      { _id: uid, 'ac.jobId': cur.id, 'ac.shiftsToday': { $lt: J.MAX_SHIFTS_PER_DAY }, $or: [{ 'ac.lastShift': null }, { 'ac.lastShift': { $lte: new Date(now - SHIFT_MS + SLACK) } }] },
      { $inc: { 'ac.cash': pay, ['ac.jobShifts.' + cur.id]: 1, 'ac.shiftsToday': 1 }, $set: { 'ac.lastShift': new Date(now) } }, { new: true });
    if (!upd) {
      u = await User.findById(uid); const m = mine(u);
      if (m && m.shiftsToday >= J.MAX_SHIFTS_PER_DAY) return bad(res, 409, 'You have worked enough shifts today. Rest and come back tomorrow.');
      return res.status(429).json({ message: 'Still on your break. Next shift is not ready yet.', ...reply(u) });
    }
    const after = mine(upd), promoted = after.level > cur.level ? after.title : null;
    res.json(reply(upd, { earned: pay, promoted, event: L.currentEvent(now).id }));
  } catch (e) { next(e); }
});

module.exports = router;
