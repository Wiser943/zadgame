'use strict';

const express = require('express');
const ensureAuth = require('../middleware/auth');
const { searchMusic } = require('../services/music');

const router = express.Router();
router.use(ensureAuth);
const recentSearches = new Map();
function tooManySearches(req, now = Date.now()) {
  const user = req.user || {};
  const id = String(user._id || user.id || req.ip || 'unknown');
  const times = (recentSearches.get(id) || []).filter((t) => now - t < 60000);
  if (times.length >= 12) { recentSearches.set(id, times); return true; }
  times.push(now); recentSearches.set(id, times);
  if (recentSearches.size > 5000) recentSearches.delete(recentSearches.keys().next().value);
  return false;
}

router.get('/search', async (req, res, next) => {
  try {
    if (tooManySearches(req)) return res.status(429).json({ provider: null, results: [], errors: ['Too many song searches. Wait a moment and try again.'] });
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const result = await searchMusic(query);
    res.set('Cache-Control', 'private, max-age=30');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
