// Age check: the player attests they are 18 or older. Only the birth YEAR and the time of the attestation are kept.
const express = require('express');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');

const router = express.Router();
router.use(ensureAuth);

router.get('/', async (req, res, next) => {
  try { const u = await User.findById(req.user.id).select('ac.ageAt').lean(); res.json({ attested: !!(u && u.ac && u.ac.ageAt) }); } catch (e) { next(e); }
});
router.post('/', async (req, res, next) => {
  try {
    const y = Math.floor(Number((req.body || {}).birthYear)), now = new Date().getUTCFullYear();
    if (!Number.isFinite(y) || y < now - 110 || y > now) return res.status(400).json({ message: 'Enter a valid year of birth.' });
    if (now - y < 18) return res.status(403).json({ message: 'You must be 18 or older to use AllConnect.' });
    await User.updateOne({ _id: req.user.id, 'ac.ageAt': null }, { $set: { 'ac.ageAt': new Date(), 'ac.birthYear': y } });
    res.json({ attested: true });
  } catch (e) { next(e); }
});
module.exports = router;
