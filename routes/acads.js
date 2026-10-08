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
const pubAd = (a) => ({ id: String(a._id), kind: a.kind, slot: a.slot, title: a.title, link: a.link, image: a.image, emoji: a.emoji || '', expiresAt: a.expiresAt });
const CONFIG = { billboard: A.BILLBOARD, sea: A.SEA, app: A.APP };
const mineAd = (a) => ({ ...pubAd(a), clicks: a.clicks || 0, startAt: a.startAt });
const hits = new Map();
const limited = (id) => { const n = Date.now(), a = (hits.get(id) || []).filter((t) => n - t < 60000); if (a.length >= 12) { hits.set(id, a); return true; } a.push(n); hits.set(id, a); return false; };

// Fields a player can set/change on their own ad.
function fields(b, kind, host) {
  const isApp = kind === 'app';
  const title = profanity.clean(String((b && b.title) || '').trim().slice(0, 60)), te = isApp ? A.appNameError(title) : A.titleError(title);
  if (te) return { error: te };
  const link = A.cleanUrl(b && b.link), image = A.cleanUrl(b && b.image);
  if (!link) return { error: 'Add a link that starts with https://' };
  if (image === null) return { error: isApp ? 'The logo must be an https:// image.' : 'The picture must be an https:// image link.' };
  if (!isApp) return { title, link, image };
  // an app runs the advertiser's site inside AllConnect: never our own pages (that would hand the site our session)
  if (new URL(link).hostname === host) return { error: 'Use your own website link.' };
  const emoji = A.cleanEmoji(b && b.emoji);
  if (emoji === null) return { error: 'That is not a valid emoji.' };
  if (!image && !emoji) return { error: 'Pick a logo: from your gallery, your device or an emoji.' };
  return { title, link, image, emoji: image ? '' : emoji };
}

// What every player sees (no owner info).
router.get('/board', async (req, res, next) => {
  try {
    await sweep();
    const rows = await ACAd.find().lean();
    res.json({ billboards: rows.filter((a) => a.kind === 'billboard').map(pubAd), plots: rows.filter((a) => a.kind === 'sea').map(pubAd), config: CONFIG });
  } catch (e) { next(e); }
});

// Ad apps shown on every player's phone
router.get('/apps', async (req, res, next) => {
  try { await sweep(); res.json({ apps: (await ACAd.find({ kind: 'app' }).sort({ slot: 1 }).lean()).map(pubAd), config: { app: A.APP } }); } catch (e) { next(e); }
});

router.get('/mine', async (req, res, next) => {
  try { await sweep(); res.json({ ads: (await ACAd.find({ owner: uid(req) }).sort({ expiresAt: 1 }).lean()).map(mineAd), config: CONFIG }); } catch (e) { next(e); }
});

router.post('/book', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const b = req.body || {}, kind = ['sea', 'billboard', 'app'].includes(b.kind) ? b.kind : null;
    if (!kind) return bad(res, 400, 'Pick a billboard, a sea plot or an app.');
    const f = fields(b, kind, req.hostname); if (f.error) return bad(res, 400, f.error);
    const cfg = CONFIG[kind], thing = kind === 'sea' ? 'sea plots' : kind === 'app' ? 'apps' : 'billboards';
    await sweep();
    const owned = await ACAd.countDocuments({ owner: uid(req), kind });
    let slots;
    if (kind === 'sea') { slots = A.plotList(b.plots); if (!slots.length) return bad(res, 400, 'Tap at least one free plot.'); }
    else { const taken = new Set((await ACAd.find({ kind }).select('slot').lean()).map((a) => a.slot)); const free = [...Array(cfg.slots).keys()].find((i) => !taken.has(i)); if (free === undefined) return bad(res, 409, `All ${kind === 'app' ? 'app spots are' : 'billboards are'} booked right now. Try again when one frees up.`); slots = [free]; }
    if (owned + slots.length > cfg.perUser) return bad(res, 409, `You can hold at most ${cfg.perUser} ${thing} at a time.`);
    const cost = cfg.price * slots.length;
    await ensureAC(uid(req));
    const paid = await User.findOneAndUpdate({ _id: uid(req), 'ac.cash': { $gte: cost } }, { $inc: { 'ac.cash': -cost } }, { new: true });
    if (!paid) return bad(res, 402, 'Not enough ₦.');
    const expiresAt = new Date(Date.now() + cfg.days * A.DAY_MS), made = [];
    for (const slot of slots) { try { made.push(await ACAd.create({ owner: uid(req), kind, slot, title: f.title, link: f.link, image: f.image, emoji: f.emoji || '', expiresAt })); } catch (e) { if (e.code !== 11000) throw e; } }
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
    const cur = await ACAd.findOne({ _id: req.params.id, owner: uid(req), expiresAt: { $gt: new Date() } }).select('kind').lean();
    if (!cur) return bad(res, 404, 'Ad not found or already ended.');
    const f = fields(req.body, cur.kind, req.hostname); if (f.error) return bad(res, 400, f.error);
    const ad = await ACAd.findOneAndUpdate({ _id: req.params.id, owner: uid(req), expiresAt: { $gt: new Date() } }, { $set: { title: f.title, link: f.link, image: f.image, emoji: f.emoji || '' } }, { new: true });
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
