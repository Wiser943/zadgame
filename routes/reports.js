const express = require('express');
const FeatureReport = require('../models/FeatureReport');
const ensureAuth = require('../middleware/auth');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user && (req.user.id || req.user._id));
const fail = (res, status, message) => res.status(status).json({ message });

// Submit a feature idea, bug report, or improvement suggestion.
router.post('/features', async (req, res, next) => {
  try {
    const category = String(req.body?.category || 'feature');
    const title = String(req.body?.title || '').trim();
    const details = String(req.body?.details || '').trim();
    if (!['feature', 'bug', 'improvement', 'other'].includes(category)) return fail(res, 400, 'Choose a valid report category.');
    if (title.length < 4 || title.length > 100) return fail(res, 400, 'Title must be between 4 and 100 characters.');
    if (details.length < 10 || details.length > 2000) return fail(res, 400, 'Details must be between 10 and 2,000 characters.');

    const user = uid(req);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await FeatureReport.countDocuments({ user, createdAt: { $gte: since } });
    if (recent >= 5) return fail(res, 429, 'You have reached the limit of 5 reports per 24 hours. Please try again later.');

    const report = await FeatureReport.create({
      user,
      displayName: String(req.user.displayName || req.user.username || 'Player').trim().slice(0, 80),
      category,
      title,
      details
    });
    res.status(201).json({ ok: true, message: 'Thanks! Your report has been sent to the ZADGAME team.', report: { id: String(report._id), category: report.category, title: report.title, status: report.status, createdAt: report.createdAt } });
  } catch (err) { next(err); }
});

// Show the signed-in player's own submissions only.
router.get('/features/mine', async (req, res, next) => {
  try {
    const reports = await FeatureReport.find({ user: uid(req) }).sort({ createdAt: -1 }).limit(20).select('category title status createdAt').lean();
    res.json({ reports: reports.map((r) => ({ id: String(r._id), category: r.category, title: r.title, status: r.status, createdAt: r.createdAt })) });
  } catch (err) { next(err); }
});

module.exports = router;
