// Camera app: take a photo in the browser -> POST here -> we upload it to imgbb and keep the link in the user's library.
// Set IMGBB_KEY in your environment (Render -> Environment). Get a key at https://api.imgbb.com/
const express = require('express');
const ACPhoto = require('../models/ACPhoto');
const ensureAuth = require('../middleware/auth');

const router = express.Router();
router.use(ensureAuth);

const MAX_BYTES = 4 * 1024 * 1024;      // decoded image size
const MAX_LIBRARY = 300;                // photos kept per user
const hits = new Map();                 // userId -> [timestamps]  (simple per-user rate limit)
const limited = (id) => {
  const now = Date.now(), arr = (hits.get(id) || []).filter((t) => now - t < 60000);
  if (arr.length >= 15) { hits.set(id, arr); return true; }
  arr.push(now); hits.set(id, arr); return false;
};
const key = () => process.env.IMGBB_KEY || process.env.IMGBB_API_KEY || '';
const pub = (p) => ({ id: String(p._id), url: p.url, thumb: p.thumb || p.url, medium: p.medium || p.url, createdAt: p.createdAt, w: p.w, h: p.h });

router.get('/', async (req, res, next) => {
  try {
    const rows = await ACPhoto.find({ user: String(req.user.id) }).sort({ createdAt: -1 }).limit(MAX_LIBRARY).lean();
    res.json({ photos: rows.map(pub), configured: !!key() });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const k = key();
    if (!k) return res.status(503).json({ message: 'Photo storage is not set up yet. The site owner needs to add IMGBB_KEY.' });
    const uid = String(req.user.id);
    if (limited(uid)) return res.status(429).json({ message: 'Slow down a little. Try again in a minute.' });

    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String((req.body && req.body.image) || ''));
    if (!m) return res.status(400).json({ message: 'That is not a valid photo.' });
    const b64 = m[2].replace(/\s/g, '');
    if (Math.floor(b64.length * 0.75) > MAX_BYTES) return res.status(413).json({ message: 'Photo is too large.' });

    const count = await ACPhoto.countDocuments({ user: uid });
    if (count >= MAX_LIBRARY) return res.status(409).json({ message: `Your gallery is full (${MAX_LIBRARY} photos). Delete some first.` });

    const form = new URLSearchParams();
    form.set('image', b64);
    form.set('name', `allconnect-${uid.slice(-6)}-${Date.now()}`);
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
    let j;
    try {
      const r = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(k), { method: 'POST', body: form, signal: ctl.signal });
      j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) {
        console.error('imgbb upload failed:', r.status, j && j.error && j.error.message);
        return res.status(502).json({ message: 'Could not save the photo right now. Please try again.' });
      }
    } finally { clearTimeout(t); }

    const d = j.data || {};
    const p = await ACPhoto.create({
      user: uid, url: d.display_url || d.url, thumb: d.thumb && d.thumb.url, medium: d.medium && d.medium.url,
      deleteUrl: d.delete_url, imgbbId: d.id, w: Number(req.body.w) || d.width, h: Number(req.body.h) || d.height,
    });
    res.json({ photo: pub(p) });
  } catch (e) {
    if (e && e.name === 'AbortError') return res.status(504).json({ message: 'Photo upload timed out. Try again.' });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid photo.' });
    const r = await ACPhoto.deleteOne({ _id: req.params.id, user: String(req.user.id) });
    if (!r.deletedCount) return res.status(404).json({ message: 'Photo not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
