const express = require('express');
const ensureAuth = require('../middleware/auth');
const registry = require('../games/registry');

const router = express.Router();

router.get('/me', ensureAuth, (req, res) => {
  const u = req.user;
  res.json({ user: {
    id: u.id, displayName: u.displayName, avatar: u.avatar,
    coins: u.coins, stats: u.stats
  } });
});

router.get('/games', ensureAuth, (req, res) => {
  res.json({ games: registry });
});

module.exports = router;
