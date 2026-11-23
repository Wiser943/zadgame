'use strict';
const express = require('express');
const ensureAuth = require('../middleware/auth');
const ACFeature = require('../models/ACFeature');
const router = express.Router();
router.use(ensureAuth);

const KINDS = new Set([
  'gist.draft', 'gist.schedule',
  'song.search', 'song.favorite', 'song.recent', 'song.playlist', 'song.queue', 'song.playnext',
  'pet.reminder', 'pet.activity',
  'city.place', 'city.route', 'city.event',
  'game.invite', 'game.rematch', 'chat.privacy'
]);
const uid = (req) => String(req.user.id || req.user._id);
const clean = (value, max = 10000) => String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const safePayload = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value).slice(0, 40)) {
    const key = clean(k, 50);
    if (!key || key.startsWith('$') || key.includes('.')) continue;
    if (typeof v === 'string') out[key] = clean(v, 4000);
    else if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
    else if (Array.isArray(v)) out[key] = v.slice(0, 100).map(x => typeof x === 'string' ? clean(x, 500) : (typeof x === 'number' || typeof x === 'boolean' ? x : null)).filter(x => x != null);
    else if (v && typeof v === 'object') out[key] = safePayload(v);
  }
  return out;
};
const bad = (res, message, status = 400) => res.status(status).json({ message });
const publicRow = (r) => ({ id: String(r._id), kind: r.kind, key: r.key, title: r.title, payload: r.payload || {}, members: r.members || [], visibility: r.visibility, status: r.status, dueAt: r.dueAt, createdAt: r.createdAt, updatedAt: r.updatedAt });
function kindOf(req) { const k = clean(req.params.kind || req.body?.kind, 40); return KINDS.has(k) ? k : ''; }
function memberIds(req) { return [...new Set((Array.isArray(req.body?.members) ? req.body.members : []).map(x => clean(x, 80)).filter(Boolean).slice(0, 50))]; }

router.get('/', async (req, res, next) => {
  try {
    const kind = req.query.kind ? clean(req.query.kind, 40) : '';
    if (kind && !KINDS.has(kind)) return bad(res, 'Unknown feature type.');
    const rows = await ACFeature.find({ $or: [{ owner: uid(req) }, { members: uid(req), visibility: 'shared' }], ...(kind ? { kind } : {}) }).sort({ updatedAt: -1 }).limit(200).lean();
    res.json({ features: rows.map(publicRow) });
  } catch (e) { next(e); }
});

router.post('/:kind', async (req, res, next) => {
  try {
    const kind = kindOf(req); if (!kind) return bad(res, 'Unknown feature type.');
    const p = safePayload(req.body?.payload || req.body);
    const visibility = req.body?.visibility === 'shared' ? 'shared' : 'private';
    const status = ['active', 'draft', 'scheduled', 'done', 'archived'].includes(req.body?.status) ? req.body.status : (kind.endsWith('.draft') ? 'draft' : kind.endsWith('.schedule') ? 'scheduled' : 'active');
    const dueAt = req.body?.dueAt ? new Date(req.body.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) return bad(res, 'The due date is invalid.');
    if (kind === 'chat.privacy' && visibility !== 'private') return bad(res, 'Privacy settings must stay private.');
    const row = await ACFeature.create({ owner: uid(req), kind, key: clean(req.body?.key, 120), title: clean(req.body?.title, 160), payload: p, members: visibility === 'shared' ? memberIds(req) : [], visibility, status, dueAt });
    res.status(201).json({ feature: publicRow(row) });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const set = {};
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'title')) set.title = clean(req.body.title, 160);
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'payload')) set.payload = safePayload(req.body.payload);
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'key')) set.key = clean(req.body.key, 120);
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'members')) set.members = memberIds(req);
    if (req.body && ['active', 'draft', 'scheduled', 'done', 'archived'].includes(req.body.status)) set.status = req.body.status;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'dueAt')) { const d = req.body.dueAt ? new Date(req.body.dueAt) : null; if (d && Number.isNaN(d.getTime())) return bad(res, 'The due date is invalid.'); set.dueAt = d; }
    set.updatedAt = new Date();
    const row = await ACFeature.findOneAndUpdate({ _id: req.params.id, owner: uid(req) }, { $set: set }, { new: true }).lean();
    if (!row) return bad(res, 'Feature record not found.', 404);
    res.json({ feature: publicRow(row) });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { const r = await ACFeature.deleteOne({ _id: req.params.id, owner: uid(req) }); if (!r.deletedCount) return bad(res, 'Feature record not found.', 404); res.json({ ok: true }); } catch (e) { next(e); }
});

// Named helpers make the product APIs self-documenting while sharing the same safe storage rules.
for (const kind of KINDS) {
  router.get('/by-kind/' + kind.replace('.', '-'), async (req, res, next) => {
    try { const rows = await ACFeature.find({ $or: [{ owner: uid(req) }, { members: uid(req), visibility: 'shared' }], kind }).sort({ updatedAt: -1 }).limit(200).lean(); res.json({ features: rows.map(publicRow) }); } catch (e) { next(e); }
  });
}
module.exports = router;
