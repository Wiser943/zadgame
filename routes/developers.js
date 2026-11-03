const express = require('express');
const DeveloperProject = require('../models/DeveloperProject');
const ensureAuth = require('../middleware/auth');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user && (req.user.id || req.user._id));
const fail = (res, status, message) => res.status(status).json({ message });
function validHttpUrl(value) {
  try { const u = new URL(value); return (u.protocol === 'https:' || u.protocol === 'http:') && Boolean(u.hostname); }
  catch { return false; }
}

router.post('/projects', async (req, res, next) => {
  try {
    const projectType = String(req.body?.projectType || '');
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const projectUrl = String(req.body?.projectUrl || '').trim();
    const integrationNotes = String(req.body?.integrationNotes || '').trim();
    const monetization = String(req.body?.monetization || 'either');
    if (!['game', 'app', 'tool', 'experience'].includes(projectType)) return fail(res, 400, 'Choose a valid project type.');
    if (name.length < 3 || name.length > 80) return fail(res, 400, 'Project name must be between 3 and 80 characters.');
    if (description.length < 20 || description.length > 2000) return fail(res, 400, 'Description must be between 20 and 2,000 characters.');
    if (!validHttpUrl(projectUrl) || projectUrl.length > 500) return fail(res, 400, 'Enter a valid HTTP or HTTPS URL for your project.');
    if (integrationNotes.length > 1500) return fail(res, 400, 'Integration notes must be 1,500 characters or fewer.');
    if (!['traffic', 'revenue-share', 'either', 'free'].includes(monetization)) return fail(res, 400, 'Choose a valid monetization preference.');
    const user = uid(req);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (await DeveloperProject.countDocuments({ user, createdAt: { $gte: since } }) >= 3) return fail(res, 429, 'You have reached the limit of 3 project submissions per 24 hours.');
    const project = await DeveloperProject.create({
      user,
      displayName: String(req.user.displayName || req.user.username || 'Developer').trim().slice(0, 80),
      projectType, name, description, projectUrl, integrationNotes, monetization
    });
    res.status(201).json({ ok: true, message: 'Project submitted for review. We will review compatibility, safety, and monetization eligibility before publishing.', project: { id: String(project._id), name: project.name, projectType: project.projectType, status: project.status, createdAt: project.createdAt } });
  } catch (err) { next(err); }
});

router.get('/projects/mine', async (req, res, next) => {
  try {
    const projects = await DeveloperProject.find({ user: uid(req) }).sort({ createdAt: -1 }).limit(30).select('projectType name projectUrl status reviewNote monetization createdAt updatedAt').lean();
    res.json({ projects: projects.map(p => ({ id: String(p._id), projectType: p.projectType, name: p.name, projectUrl: p.projectUrl, status: p.status, reviewNote: p.reviewNote || '', monetization: p.monetization, createdAt: p.createdAt, updatedAt: p.updatedAt })) });
  } catch (err) { next(err); }
});

module.exports = router;
