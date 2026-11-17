/* Batched sync for "tap now, tell the server later" actions (likes, saves, follows, comment likes).
   The browser keeps the tap instantly on screen, waits ~30 seconds so repeat taps cancel out, then sends everything that is left in ONE request.
   Each operation is replayed against the normal route (same checks, same rules); only a short allow-list of toggle routes is accepted. */
const express = require('express');
const ensureAuth = require('../middleware/auth');
const router = express.Router();
router.use(ensureAuth);

const OID = '[a-f0-9]{24}';
const ALLOWED = [
  new RegExp('^/api/ac/gist/posts/' + OID + '/react$'),
  new RegExp('^/api/ac/gist/posts/' + OID + '/save$'),
  new RegExp('^/api/ac/gist/follow/' + OID + '$'),
  new RegExp('^/api/ac/gist/comments/' + OID + '/like$')
];
const MAX_OPS = 40;
const hits = new Map();

router.post('/', express.json({ limit: '60kb' }), async (req, res) => {
  const ops = Array.isArray(req.body && req.body.ops) ? req.body.ops.slice(0, MAX_OPS) : [];
  const now = Date.now(), k = String(req.user.id), recent = (hits.get(k) || []).filter((t) => now - t < 60000);
  if (recent.length >= 12) return res.status(429).json({ message: 'Too many sync requests. Slow down a little.' });
  recent.push(now); hits.set(k, recent);
  const base = 'http://127.0.0.1:' + (req.socket.localPort || process.env.PORT || 3000), results = [];
  for (const op of ops) {
    const path = String((op && op.path) || '');
    if (!ALLOWED.some((r) => r.test(path))) { results.push({ ok: false, status: 400, message: 'Not allowed in a batch.' }); continue; }
    try {
      const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie: req.headers.cookie || '', 'x-forwarded-proto': 'https', 'x-forwarded-for': req.ip || '', 'user-agent': req.headers['user-agent'] || '' }, body: JSON.stringify(op.body || {}) });
      const txt = await r.text(); let data = {}; try { data = txt ? JSON.parse(txt) : {}; } catch (e) { /* keep empty */ }
      results.push({ ok: r.ok, status: r.status, data, message: r.ok ? undefined : data.message });
    } catch (e) { results.push({ ok: false, status: 502, message: 'Could not apply this change.' }); }
  }
  res.json({ results });
});
module.exports = router;
