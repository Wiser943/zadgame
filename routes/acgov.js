// State House API (mounted at /api/ac/gov): elections for Governor, Commissioner and President, announcements and policies.
const express = require('express');
const ensureAuth = require('../middleware/auth');
const gov = require('../services/govService');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const send = (res, e, next) => (e && e.expose ? res.status(e.code || 400).json({ message: e.message }) : next(e));

// tiny per-player limiter, same idea as routes/acgist.js
const buckets = new Map();
const limit = (name, max, ms) => (req, res, next) => {
  const k = name + ':' + uid(req), now = Date.now(), a = (buckets.get(k) || []).filter((t) => now - t < ms);
  if (a.length >= max) { buckets.set(k, a); return res.status(429).json({ message: 'Slow down a little and try again shortly.' }); }
  a.push(now); buckets.set(k, a); if (buckets.size > 5000) buckets.clear(); next();
};

router.get('/state', limit('state', 60, 60000), async (req, res, next) => {
  try { await gov.progress(req.app.get('io')); res.set('Cache-Control', 'no-store'); res.json(await gov.state(uid(req), req.query)); }
  catch (e) { send(res, e, next); }
});
router.post('/file', limit('file', 6, 60000), async (req, res, next) => {
  try { const b = req.body || {}; await gov.file(req.app.get('io'), uid(req), String(b.office || ''), b.slogan); res.json(await gov.state(uid(req))); }
  catch (e) { send(res, e, next); }
});
router.post('/support', limit('support', 40, 60000), async (req, res, next) => {
  try { const b = req.body || {}; await gov.support(uid(req), String(b.office || ''), b.candidate ? String(b.candidate) : ''); res.json(await gov.state(uid(req))); }
  catch (e) { send(res, e, next); }
});
router.post('/vote', limit('vote', 20, 60000), async (req, res, next) => {
  try { const b = req.body || {}; await gov.vote(uid(req), String(b.office || ''), String(b.candidate || '')); res.json(await gov.state(uid(req))); }
  catch (e) { send(res, e, next); }
});
router.post('/announce', limit('announce', 6, 60000), async (req, res, next) => {
  try { const b = req.body || {}; await gov.announce(req.app.get('io'), uid(req), String(b.office || ''), b.text); res.json(await gov.state(uid(req))); }
  catch (e) { send(res, e, next); }
});
router.post('/policy', limit('policy', 20, 60000), async (req, res, next) => {
  try { const b = req.body || {}; await gov.setPolicy(req.app.get('io'), uid(req), String(b.office || ''), String(b.slot || ''), String(b.option || '')); res.json(await gov.state(uid(req))); }
  catch (e) { send(res, e, next); }
});

module.exports = router;
