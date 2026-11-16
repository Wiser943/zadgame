// Age check: the player attests they are 18 or older and gives their date of birth.
// We keep the birth YEAR (for the 18+ rule) and the day + month (so we can celebrate their birthday). The time of the attestation is kept too.
const express = require('express');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');

const router = express.Router();
router.use(ensureAuth);

router.get('/', async (req, res, next) => {
  try {
    const u = await User.findById(req.user.id).select('ac.ageAt ac.bday ac.stateOrigin ac.stateCurrent').lean(), a = (u && u.ac) || {};
    res.json({ attested: !!a.ageAt, hasBirthday: !!(a.bday && a.bday.m && a.bday.d), hasStates: !!(a.stateOrigin && a.stateCurrent) });
  } catch (e) { next(e); }
});
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {}, y = Math.floor(Number(b.birthYear)), now = new Date(), ny = now.getUTCFullYear();
    if (!Number.isFinite(y) || y < ny - 110 || y > ny) return res.status(400).json({ message: 'Enter a valid year of birth.' });
    let m = null, d = null, age = ny - y;
    if (b.birthMonth != null && b.birthDay != null) {
      m = Math.floor(Number(b.birthMonth)); d = Math.floor(Number(b.birthDay));
      const dt = new Date(Date.UTC(y, m, d));
      if (!(m >= 0 && m <= 11) || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return res.status(400).json({ message: 'That date does not exist.' });
      age = ny - y - ((now.getUTCMonth() < m || (now.getUTCMonth() === m && now.getUTCDate() < d)) ? 1 : 0);
    }
    if (age < 18) return res.status(403).json({ message: 'You must be 18 or older to use AllConnect.' });
    await User.updateOne({ _id: req.user.id, 'ac.ageAt': null }, { $set: { 'ac.ageAt': new Date(), 'ac.birthYear': y } });
    // first time we learn the day and month: store it and switch the birthday card on (they can turn it off in Settings)
    if (m != null) await User.updateOne({ _id: req.user.id, $or: [{ 'ac.bday.m': 0 }, { 'ac.bday.m': null }, { 'ac.bday.m': { $exists: false } }] }, { $set: { 'ac.bday': { m: m + 1, d }, 'ac.prefs.showBirthday': true } });
    res.json({ attested: true });
  } catch (e) { next(e); }
});
module.exports = router;
