const express = require('express');
const ensureAuth = require('../middleware/auth');
const registry = require('../games/registry');
const User = require('../models/User');

const router = express.Router();

// Only allow small base64 image/* data URIs — this keeps the request-size
// limit in server.js meaningful and stops someone posting arbitrary blobs
// into the avatar field.
const AVATAR_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_AVATAR_BYTES = 900 * 1024; // ~900KB of base64 (~650KB image) — plenty for a profile photo

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

// Update the signed-in user's own avatar and/or display name. The client
// compresses/resizes the image to a small JPEG data URI before sending it
// (see resizeImage() in public/index.html) — we just sanity-check it here.
router.post('/me/profile', ensureAuth, async (req, res) => {
  const { avatar, displayName } = req.body || {};
  const update = {};
  if (typeof avatar === 'string' && avatar) {
    if (avatar.length > MAX_AVATAR_BYTES) return res.status(413).json({ message: 'Image is too large. Try a smaller photo.' });
    if (!AVATAR_RE.test(avatar)) return res.status(400).json({ message: 'That doesn’t look like a valid image.' });
    update.avatar = avatar;
  }
  if (typeof displayName === 'string' && displayName.trim()) update.displayName = displayName.trim().slice(0, 40);
  if (!Object.keys(update).length) return res.status(400).json({ message: 'Nothing to update.' });
  const u = await User.findByIdAndUpdate(req.user.id, update, { new: true });
  res.json({ user: { id: u.id, displayName: u.displayName, avatar: u.avatar, coins: u.coins, stats: u.stats } });
});

// Read-only profile for any other player — used when you tap someone's
// avatar in a room so you can see their photo, name and win record.
router.get('/users/:id', ensureAuth, async (req, res) => {
  try {
    const u = await User.findById(req.params.id).select('displayName avatar stats createdAt');
    if (!u) return res.status(404).json({ message: 'Player not found.' });
    res.json({ user: { id: u.id, displayName: u.displayName, avatar: u.avatar, stats: u.stats, since: u.createdAt } });
  } catch { res.status(404).json({ message: 'Player not found.' }); }
});

module.exports = router;
