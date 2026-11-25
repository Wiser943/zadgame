// Street extras: taxi and bus rides between places (the fare is worked out and charged here, never by the client).
const express = require('express');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const router = express.Router();
router.use(ensureAuth);

const { fare } = require('../utils/acstreet');
router.get('/quote', (req, res) => { const d = Number(req.query.dist) || 0; res.json({ taxi: fare('taxi', d), bus: fare('bus', d) }); });
router.post('/ride', async (req, res, next) => {
  try {
    const mode = req.body && req.body.mode === 'bus' ? 'bus' : 'taxi', price = fare(mode, req.body && req.body.dist);
    const u = await User.findOneAndUpdate({ _id: req.user.id, 'ac.cash': { $gte: price } }, { $inc: { 'ac.cash': -price } }, { new: true }).select('ac.cash');
    if (!u) return res.status(402).json({ message: 'Not enough naira for this ride.' });
    res.json({ fare: price, cash: u.ac.cash, mode });
  } catch (e) { next(e); }
});
module.exports = router;
