const express = require('express');
const User = require('../models/User');
const ACStat = require('../models/ACStat');
const ensureAuth = require('../middleware/auth');
const { DEFAULT_AC, priceOf, sanitizeSave, publicAC } = require('../utils/allconnect');

const router = express.Router();
const who = (u) => ({ id: u.id, displayName: u.displayName, username: u.acUsername || '', avatar: u.avatar, coins: u.coins });

// Accounts created before AllConnect existed have no `ac` data yet: give them the defaults once.
async function ensureAC(id) {
  await User.updateOne({ _id: id, 'ac.cash': { $exists: false } }, { $set: { ac: { ...DEFAULT_AC(), gemsFound: 0 } } });
  return User.findById(id);
}

// Social links shown on the login footer + Settings. Edited in the admin panel; public (no login) because the splash needs them.
const ACSetting = require('../models/ACSetting');
const SOCIAL_KEYS = ['x', 'tiktok', 'instagram', 'linkedin'];
let socCache = { at: 0, v: {} };
async function getSocials() {
  if (Date.now() - socCache.at < 8000) return socCache.v;
  const d = await ACSetting.findById('socials').lean(); const v = {};
  SOCIAL_KEYS.forEach((k) => { const u = d && d.value && d.value[k]; if (typeof u === 'string' && /^https?:\/\//i.test(u)) v[k] = u; });
  socCache = { at: Date.now(), v }; return v;
}
router.get('/public-config', async (req, res) => { try { res.set('Cache-Control', 'no-cache'); res.json({ socials: await getSocials() }); } catch (e) { res.json({ socials: {} }); } });

// Server clock so the phone shows the same time for everyone (not the device clock).
router.get('/time', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ now: Date.now() }); });

router.get('/state', ensureAuth, async (req, res, next) => {
  try {
    const u = await ensureAC(req.user.id);
    const st = (await ACStat.findById('global').lean()) || { visits: 0, gems: 0 };
    res.json({ user: who(u), ac: publicAC(u.ac), stats: st });
  } catch (e) { next(e); }
});

router.post('/save', ensureAuth, async (req, res, next) => {
  try {
    const clean = sanitizeSave(req.body);
    const $set = Object.fromEntries(Object.entries(clean).map(([k, v]) => ['ac.' + k, v]));
    if (Object.keys($set).length) await User.updateOne({ _id: req.user.id }, { $set });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Atomic purchase: the price comes from the server catalogue, never from the client.
router.post('/buy', ensureAuth, async (req, res, next) => {
  try {
    const name = String(req.body?.name || ''), price = priceOf(name);
    if (price == null) return res.status(400).json({ message: 'Unknown item.' });
    await ensureAC(req.user.id);
    const u = await User.findOneAndUpdate(
      { _id: req.user.id, 'ac.cash': { $gte: price }, 'ac.owned': { $ne: name } },
      { $inc: { 'ac.cash': -price }, $push: { 'ac.owned': name } }, { new: true });
    if (!u) {
      const cur = await User.findById(req.user.id);
      return res.status(cur.ac.owned.includes(name) ? 409 : 402).json({ message: cur.ac.owned.includes(name) ? 'You already own that.' : 'Not enough ₦.' });
    }
    res.json({ ac: publicAC(u.ac) });
  } catch (e) { next(e); }
});

// "New life": resets the platform life-sim only. GameHub coins, stats and friends are untouched.
router.post('/new', ensureAuth, async (req, res, next) => {
  try {
    const u = await User.findByIdAndUpdate(req.user.id, { $set: { 'ac.cash': 2000000, 'ac.paint': '#d9a93a', 'ac.owned': ['Classic Cream'], 'ac.needs': [.9, .9, .9, .9, .9, .9], 'ac.min': 19 * 60, 'ac.jobId': '', 'ac.jobShifts': {}, 'ac.lastShift': null, 'ac.shiftsToday': 0 } }, { new: true });
    res.json({ ac: publicAC(u.ac) });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.ensureAC = ensureAC;
