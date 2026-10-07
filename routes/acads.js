// Ads app: billboards and sea plots that every player sees on the Map. Price + duration come from utils/acads.js.
const express = require('express');
const User = require('../models/User');
const ACAd = require('../models/ACAd');
const ensureAuth = require('../middleware/auth');
const profanity = require('../utils/profanity');
const { ensureAC } = require('./allconnect');
const A = require('../utils/acads');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const isId = (s) => /^[a-f\d]{24}$/i.test(String(s));
const sweep = () => ACAd.deleteMany({ expiresAt: { $lte: new Date() } });
const pubAd = (a) => ({ id: String(a._id), kind: a.kind, slot: a.slot, title: a.title, link: a.link, image: a.image, expiresAt: a.expiresAt });
const mineAd = (a) => ({ ...pubAd(a), clicks: a.clicks || 0, startAt: a.startAt });
const hits = new Map();
const limited = (id) => { const n = Date.now(), a = (hits.get(id) || []).filter((t) => n - t < 60000); if (a.length >= 12) { hits.set(id, a); return true; } a.push(n); hits.set(id, a); return false; };

// Fields a player can set/change on their own ad.
function fields(b) {
  const title = profanity.clean(String((b && b.title) || '').trim().slice(0, 60)), te = A.titleError(title);
  if (te) return { error: te };
  const link = A.cleanUrl(b && b.link), image = A.cleanUrl(b && b.image);
  if (!link) return { error: 'Add a link that starts with https://' };
  if (image === null) return { error: 'The picture must be an https:// image link.' };
  return { title, link, image };
}

// What every player sees (no owner info).
router.get('/board', async (req, res, next) => {
  try {
    await sweep();
    const rows = await ACAd.find().lean();
    res.json({ billboards: rows.filter((a) => a.kind === 'billboard').map(pubAd), plots: rows.filter((a) => a.kind === 'sea').map(pubAd), config: { billboard: A.BILLBOARD, sea: A.SEA } });
  } catch (e) { next(e); }
});

router.get('/mine', async (req, res, next) => {
  try { await sweep(); res.json({ ads: (await ACAd.find({ owner: uid(req) }).sort({ expiresAt: 1 }).lean()).map(mineAd), config: { billboard: A.BILLBOARD, sea: A.SEA } }); } catch (e) { next(e); }
});

router.post('/book', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const b = req.body || {}, kind = b.kind === 'sea' ? 'sea' : b.kind === 'billboard' ? 'billboard' : null;
    if (!kind) return bad(res, 400, 'Pick a billboard or a sea plot.');
    const f = fields(b); if (f.error) return bad(res, 400, f.error);
    const cfg = kind === 'sea' ? A.SEA : A.BILLBOARD;
    await sweep();
    const owned = await ACAd.countDocuments({ owner: uid(req), kind });
    let slots;
    if (kind === 'sea') { slots = A.plotList(b.plots); if (!slots.length) return bad(res, 400, 'Tap at least one free plot.'); }
    else { const taken = new Set((await ACAd.find({ kind }).select('slot').lean()).map((a) => a.slot)); const free = [...Array(cfg.slots).keys()].find((i) => !taken.has(i)); if (free === undefined) return bad(res, 409, 'All billboards are booked right now. Try again when one frees up.'); slots = [free]; }
    if (owned + slots.length > cfg.perUser) return bad(res, 409, `You can hold at most ${cfg.perUser} ${kind === 'sea' ? 'sea plots' : 'billboards'} at a time.`);
    const cost = cfg.price * slots.length;
    await ensureAC(uid(req));
    const paid = await User.findOneAndUpdate({ _id: uid(req), 'ac.cash': { $gte: cost } }, { $inc: { 'ac.cash': -cost } }, { new: true });
    if (!paid) return bad(res, 402, 'Not enough ₦.');
    const expiresAt = new Date(Date.now() + cfg.days * A.DAY_MS), made = [];
    for (const slot of slots) { try { made.push(await ACAd.create({ owner: uid(req), kind, slot, title: f.title, link: f.link, image: f.image, expiresAt })); } catch (e) { if (e.code !== 11000) throw e; } }
    const refund = cfg.price * (slots.length - made.length);
    let cash = paid.ac.cash;
    if (refund) cash = (await User.findByIdAndUpdate(uid(req), { $inc: { 'ac.cash': refund } }, { new: true })).ac.cash;   // someone grabbed that plot first
    if (!made.length) return bad(res, 409, 'Those plots were just taken. You were not charged.');
    res.json({ ads: made.map(mineAd), cash, charged: cost - refund, skipped: slots.length - made.length });
  } catch (e) { next(e); }
});

router.post('/:id/update', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 400, 'Invalid ad.');
    const f = fields(req.body); if (f.error) return bad(res, 400, f.error);
    const ad = await ACAd.findOneAndUpdate({ _id: req.params.id, owner: uid(req), expiresAt: { $gt: new Date() } }, { $set: { title: f.title, link: f.link, image: f.image } }, { new: true });
    if (!ad) return bad(res, 404, 'Ad not found or already ended.');
    res.json({ ad: mineAd(ad) });
  } catch (e) { next(e); }
});

router.post('/:id/click', async (req, res) => {
  if (isId(req.params.id)) await ACAd.updateOne({ _id: req.params.id }, { $inc: { clicks: 1 } }).catch(() => {});
  res.json({ ok: true });
});

module.exports = router;
module.exports.SEA = A.SEA;
