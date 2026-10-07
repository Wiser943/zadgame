// Camera / gallery uploads. Photos go to imgbb (set IMGBB_KEY on Render). If imgbb is not configured or fails, the photo is
// kept in our own database instead, so saving never fails for the player. Admin panel -> Photo storage shows the real imgbb result.
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const ACPhoto = require('../models/ACPhoto');
const ACPhotoBlob = require('../models/ACPhotoBlob');
const ensureAuth = require('../middleware/auth');

const router = express.Router();

const MAX_BYTES = 4 * 1024 * 1024;      // decoded image size accepted
const MAX_DB_BYTES = 1.6 * 1024 * 1024; // biggest photo we keep ourselves as backup
const MAX_DB_PHOTOS = 80;               // backup photos per user
const MAX_LIBRARY = 300;                // photos kept per user
const hits = new Map();
const limited = (id) => {
  const now = Date.now(), arr = (hits.get(id) || []).filter((t) => now - t < 60000);
  if (arr.length >= 15) { hits.set(id, arr); return true; }
  arr.push(now); hits.set(id, arr); return false;
};
// Accept the usual variable names and tidy copy/paste mistakes (quotes, spaces, "key=" prefix).
const KEY_NAMES = ['IMGBB_KEY', 'IMGBB_API_KEY', 'IMGBB_APIKEY', 'IMGBB_TOKEN', 'IMGBB', 'IBB_KEY', 'IBB_API_KEY', 'IMGBB_API'];
const keyInfo = () => { for (const n of KEY_NAMES) { let v = process.env[n]; if (v && String(v).trim()) { v = String(v).trim().replace(/^["']|["']$/g, '').replace(/^key\s*=\s*/i, '').trim(); if (v) return { name: n, key: v }; } } return { name: '', key: '' }; };
const pub = (p) => ({ id: String(p._id), url: p.url, thumb: p.thumb || p.url, medium: p.medium || p.url, createdAt: p.createdAt, w: p.w, h: p.h });

const status = { lastOk: null, lastAt: null, lastError: '' };
// One imgbb upload attempt in a given body format. Never throws; returns { ok, data, status, error, keyBad }.
async function attempt(k, b64, name, mode) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
  try {
    let r;
    if (mode === 'multipart') { const f = new FormData(); f.append('image', b64); f.append('name', name); r = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(k), { method: 'POST', body: f, signal: ctl.signal }); }
    else { const f = new URLSearchParams(); f.set('key', k); f.set('image', b64); f.set('name', name); r = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: f, signal: ctl.signal }); }
    const text = await r.text(); let j = {}; try { j = JSON.parse(text); } catch (e) { /* html error page etc. */ }
    if (r.ok && j.success) return { ok: true, data: j.data || {}, status: r.status };
    const msg = (j && j.error && (j.error.message || j.error)) || text.slice(0, 160) || ('HTTP ' + r.status);
    return { ok: false, status: r.status, error: String(msg), keyBad: /api.*key|invalid.*key|key.*invalid/i.test(String(msg)) };
  } catch (e) { return { ok: false, status: 0, error: (e && e.name === 'AbortError') ? 'imgbb timed out' : ('network: ' + ((e && e.cause && e.cause.code) || (e && e.message) || e)), network: true }; }
  finally { clearTimeout(t); }
}
async function imgbbUpload(b64, name) {
  const { key: k } = keyInfo(); if (!k) return { ok: false, error: 'IMGBB_KEY is not set on the server', notConfigured: true };
  let r = await attempt(k, b64, name, 'multipart');
  if (!r.ok && !r.keyBad) { const r2 = await attempt(k, b64, name, 'urlencoded'); if (r2.ok || !r.status) r = r2; else r.error += ' / ' + r2.error; }
  status.lastAt = new Date(); status.lastOk = !!r.ok; status.lastError = r.ok ? '' : r.error;
  if (!r.ok) console.error('[imgbb] upload failed:', r.status, r.error);
  return r;
}

// Public image bytes for the backup storage (unguessable id, like an imgbb link).
router.get('/raw/:id', async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).end();
    const b = await ACPhotoBlob.findById(req.params.id).lean(); if (!b) return res.status(404).end();
    res.set('Content-Type', b.mime || 'image/jpeg'); res.set('Cache-Control', 'public, max-age=31536000, immutable'); res.send(Buffer.from(b.data.buffer || b.data));
  } catch (e) { next(e); }
});

router.use(ensureAuth);

router.get('/', async (req, res, next) => {
  try {
    const rows = await ACPhoto.find({ user: String(req.user.id) }).sort({ createdAt: -1 }).limit(MAX_LIBRARY).lean();
    res.json({ photos: rows.map(pub), configured: true });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const uid = String(req.user.id);
    if (limited(uid)) return res.status(429).json({ message: 'Slow down a little. Try again in a minute.' });
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String((req.body && req.body.image) || ''));
    if (!m) return res.status(400).json({ message: 'That is not a valid photo.' });
    const b64 = m[2].replace(/\s/g, ''), bytes = Math.floor(b64.length * 0.75);
    if (bytes > MAX_BYTES) return res.status(413).json({ message: 'Photo is too large.' });
    const count = await ACPhoto.countDocuments({ user: uid });
    if (count >= MAX_LIBRARY) return res.status(409).json({ message: `Your gallery is full (${MAX_LIBRARY} photos). Delete some first.` });

    const w = Number(req.body.w) || undefined, h = Number(req.body.h) || undefined;
    const r = await imgbbUpload(b64, `allconnect-${uid.slice(-6)}-${Date.now()}`);
    let doc;
    if (r.ok) {
      const d = r.data;
      doc = await ACPhoto.create({ user: uid, url: d.display_url || d.url, thumb: d.thumb && d.thumb.url, medium: d.medium && d.medium.url, deleteUrl: d.delete_url, imgbbId: d.id, w: w || d.width, h: h || d.height, store: 'imgbb' });
    } else {
      // backup: keep the bytes ourselves so the player never sees an error
      if (bytes > MAX_DB_BYTES) return res.status(502).json({ message: 'Could not save that photo right now. Try a smaller one, or try again.' });
      if (await ACPhoto.countDocuments({ user: uid, store: 'db' }) >= MAX_DB_PHOTOS) return res.status(502).json({ message: 'Photo storage is busy. Please try again later.' });
      const id = new mongoose.Types.ObjectId();
      await ACPhotoBlob.create({ _id: id, mime: 'image/' + (m[1] === 'jpeg' ? 'jpeg' : m[1]), data: Buffer.from(b64, 'base64') });
      const url = '/api/ac/photos/raw/' + id;
      doc = await ACPhoto.create({ user: uid, url, thumb: url, medium: url, w, h, store: 'db', imgbbId: String(id) });
    }
    res.json({ photo: pub(doc), storage: doc.store });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid photo.' });
    const p = await ACPhoto.findOneAndDelete({ _id: req.params.id, user: String(req.user.id) });
    if (!p) return res.status(404).json({ message: 'Photo not found.' });
    if (p.store === 'db') await ACPhotoBlob.deleteOne({ _id: p.imgbbId }).catch(() => {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// for the admin panel
router.keyInfo = keyInfo; router.status = status;
router.testUpload = async () => {
  const px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const r = await imgbbUpload(px, 'allconnect-test-' + crypto.randomBytes(3).toString('hex'));
  return { ok: !!r.ok, status: r.status || 0, message: r.ok ? 'imgbb accepted the test image.' : r.error, notConfigured: !!r.notConfigured };
};
module.exports = router;
