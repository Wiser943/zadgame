// Voice notes: the browser records a short clip (MediaRecorder), uploads it here once, and then sends the returned
// { url, dur } with a chat message. Everything is checked on the server: size, length, type and send rate.
const express = require('express');
const ACVoiceBlob = require('../models/ACVoiceBlob');
const ensureAuth = require('../middleware/auth');

const router = express.Router();
const MAX_BYTES = 700 * 1024;   // decoded audio size
const MAX_SECONDS = 60;
const MAX_PER_USER = 150;       // oldest are dropped beyond this
const hits = new Map();
const limited = (id) => { const n = Date.now(), a = (hits.get(id) || []).filter((t) => n - t < 60000); if (a.length >= 10) { hits.set(id, a); return true; } a.push(n); hits.set(id, a); return false; };
const MIME = { webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4', mpeg: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', 'x-m4a': 'audio/mp4' };

router.post('/', ensureAuth, async (req, res, next) => {
  try {
    const uid = String(req.user.id);
    if (limited(uid)) return res.status(429).json({ message: 'Slow down a little. Try again in a minute.' });
    const m = /^data:audio\/(webm|ogg|mp4|mpeg|wav|aac|x-m4a)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\s]+)$/.exec(String((req.body && req.body.audio) || ''));
    if (!m) return res.status(400).json({ message: 'That is not a valid voice note.' });
    const b64 = m[2].replace(/\s/g, ''), bytes = Math.floor(b64.length * 0.75);
    if (bytes > MAX_BYTES) return res.status(413).json({ message: 'That voice note is too long. Keep it under a minute.' });
    if (bytes < 400) return res.status(400).json({ message: 'That voice note is empty.' });
    const dur = Math.max(1, Math.min(MAX_SECONDS, Math.round(Number(req.body.dur) || 1)));
    const doc = await ACVoiceBlob.create({ user: uid, mime: MIME[m[1]], dur, data: Buffer.from(b64, 'base64') });
    const old = await ACVoiceBlob.find({ user: uid }).sort({ createdAt: -1 }).skip(MAX_PER_USER).select('_id').lean();
    if (old.length) ACVoiceBlob.deleteMany({ _id: { $in: old.map((o) => o._id) } }).catch(() => {});
    res.json({ voice: { url: '/api/ac/voice/raw/' + doc._id, dur } });
  } catch (e) { next(e); }
});

// Streams the clip (with Range support, which phones need to play and seek audio).
router.get('/raw/:id', ensureAuth, async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.sendStatus(404);
    const d = await ACVoiceBlob.findById(req.params.id).lean();
    if (!d) return res.sendStatus(404);
    const buf = d.data.buffer ? Buffer.from(d.data.buffer) : Buffer.from(d.data), total = buf.length;
    res.setHeader('Content-Type', d.mime || 'audio/webm'); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Cache-Control', 'private, max-age=86400');
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (r && (r[1] || r[2])) {
      let s = r[1] ? parseInt(r[1], 10) : Math.max(0, total - parseInt(r[2], 10)), e = r[1] && r[2] ? parseInt(r[2], 10) : total - 1;
      e = Math.min(e, total - 1);
      if (s > e || s >= total) { res.setHeader('Content-Range', 'bytes */' + total); return res.sendStatus(416); }
      res.status(206); res.setHeader('Content-Range', `bytes ${s}-${e}/${total}`); res.setHeader('Content-Length', e - s + 1);
      return res.end(buf.subarray(s, e + 1));
    }
    res.setHeader('Content-Length', total); res.end(buf);
  } catch (e) { next(e); }
});
module.exports = router;
