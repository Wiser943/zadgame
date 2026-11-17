// Police app: your record + report another player. Reports land in the same admin Reports queue as every other report.
const express = require('express');
const User = require('../models/User');
const { Report } = require('../models/Social');
const ensureAuth = require('../middleware/auth');
const { normalizeUsername, validUsername } = require('../utils/allconnect');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const POLICE = 'POLICE';

router.get('/status', async (req, res, next) => {
  try {
    const open = await Report.countDocuments({ target: uid(req), status: 'open', roomCode: { $in: [POLICE, 'ALLCONN'] } });
    const record = open === 0 ? 'clean' : open < 3 ? 'watch' : 'wanted';
    res.json({ open, record });
  } catch (e) { next(e); }
});

router.post('/report', async (req, res, next) => {
  try {
    const name = normalizeUsername(String((req.body && req.body.username) || '').replace(/^@/, ''));
    if (!validUsername(name)) return res.status(400).json({ message: 'Enter a valid @username.' });
    const target = await User.findOne({ acUsername: name }).select('_id acUsername').lean();
    if (!target) return res.status(404).json({ message: 'No player has that @username.' });
    if (String(target._id) === uid(req)) return res.status(400).json({ message: 'You cannot report yourself.' });

    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const mine = await Report.countDocuments({ reporter: uid(req), roomCode: POLICE, createdAt: { $gte: since } });
    if (mine >= 10) return res.status(429).json({ message: 'You have filed 10 reports today. Try again tomorrow.' });
    const dup = await Report.countDocuments({ reporter: uid(req), target: String(target._id), roomCode: POLICE, status: 'open' });
    if (dup) return res.status(409).json({ message: 'You already have an open report on this player.' });

    const details = String((req.body && req.body.details) || '').trim().slice(0, 200);
    const r = await Report.create({ reporter: uid(req), target: String(target._id), roomCode: POLICE, reason: details ? 'Police report: ' + details : 'Police report' });
    res.json({ reportId: r.id, username: target.acUsername });
  } catch (e) { next(e); }
});

module.exports = router;
