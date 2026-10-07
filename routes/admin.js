const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const registry = require('../games/registry');
const ensureAdmin = require('../middleware/admin');
const { Report, Tournament } = require('../models/Social');
const Match = require('../models/Match');
const presence = require('../utils/presence');
const { effectiveGames, effectiveGame, saveGameSettings } = require('../config/gameSettings');
const router = express.Router();
// Hosting dashboards often leave stray spaces/newlines or quotes around values: clean them so login still matches.
const clean = (v) => String(v == null ? '' : v).trim().replace(/^["']|["']$/g, '').trim();
const ADMIN_PHONE = clean(process.env.ADMIN_PHONE);
const ADMIN_PIN = clean(process.env.ADMIN_PIN);
const phoneKey = (v) => clean(v).replace(/[\s-]/g, '');
const loginHits = new Map();
function tooMany(ip){ const now=Date.now(), a=(loginHits.get(ip)||[]).filter(t=>now-t<15*60*1000); loginHits.set(ip,a); return a.length>=10; }
function fail(ip){ const a=loginHits.get(ip)||[]; a.push(Date.now()); loginHits.set(ip,a); }   // only wrong attempts count
function same(a, b) { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
router.get('/status', (req, res) => res.json({ configured: !!(ADMIN_PHONE && ADMIN_PIN) }));
router.post('/login', (req, res) => {
  if (!ADMIN_PHONE || !ADMIN_PIN) return res.status(503).json({ message: 'Admin login is not configured. Set ADMIN_PHONE and ADMIN_PIN in the server environment, then redeploy.' });
  if (tooMany(req.ip)) return res.status(429).json({ message: 'Too many wrong attempts. Try again in 15 minutes.' });
  const { phone, pin } = req.body || {};
  if (!same(phoneKey(phone), phoneKey(ADMIN_PHONE)) || !same(clean(pin), ADMIN_PIN)) { fail(req.ip); return res.status(401).json({ message: 'Invalid admin credentials.' }); }
  req.session.isAdmin = true;
  req.session.save((err) => {
    if (err) { console.error('admin session save failed:', err.message); return res.status(500).json({ message: 'Signed in, but the session could not be saved (database problem). Check MONGODB_URI and the server logs.' }); }
    res.json({ ok: true });
  });
});
router.get('/session', (req, res) => res.json({ authenticated: req.session?.isAdmin === true }));
router.post('/logout', (req, res) => { req.session.isAdmin = false; req.session.save(() => res.json({ ok: true })); });
router.use(ensureAdmin);
router.get('/games', (req, res) => res.json({ games: effectiveGames() }));
router.put('/games/:key', async (req, res, next) => {
  try {
    const current = effectiveGame(req.params.key);
    if (!current) return res.status(404).json({ message: 'Game not found.' });
    const body = req.body || {};
    const available = typeof body.available === 'boolean' ? body.available : current.available;
    const playerCounts = Array.isArray(body.playerCounts) ? [...new Set(body.playerCounts.map(Number).filter(n => [2,3,4].includes(n)))].sort((a,b)=>a-b) : current.playerCounts;
    if (!playerCounts.length) return res.status(400).json({ message: 'Choose at least one player count.' });
    const rules = Array.isArray(body.rules) ? body.rules.map(x => String(x).trim()).filter(Boolean).slice(0, 20) : current.rules;
    res.json({ game: await saveGameSettings(current.key, { available, playerCounts, rules }) });
  } catch (err) { next(err); }
});
router.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = q ? { $or: [{ displayName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { phone: q }, { email: q.toLowerCase() }] } : {};
    const users = await User.find(filter).select('displayName phone email coins stats suspendedUntil penaltyPoints adminNote createdAt verified acUsername').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ users: users.map(u => ({ ...u, id: String(u._id) })) });
  } catch (err) { next(err); }
});
router.post('/users/:id/penalize', async (req, res, next) => {
  try {
    const coins = Math.max(0, Math.min(1000000, Number(req.body?.coins) || 0));
    const suspendMinutes = Math.max(0, Math.min(525600, Number(req.body?.suspendMinutes) || 0));
    const reason = String(req.body?.reason || '').trim().slice(0, 240);
    if (!coins && !suspendMinutes) return res.status(400).json({ message: 'Add a coin penalty or suspension duration.' });
    const update = { $inc: { coins: -coins, penaltyPoints: 1 }, $set: { adminNote: reason } };
    if (suspendMinutes) update.$set.suspendedUntil = new Date(Date.now() + suspendMinutes * 60000);
    let user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('displayName coins suspendedUntil penaltyPoints adminNote');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.coins < 0) { user.coins = 0; await user.save(); } // never leave a negative balance
    res.json({ user: { id: user.id, displayName: user.displayName, coins: user.coins, suspendedUntil: user.suspendedUntil, penaltyPoints: user.penaltyPoints, adminNote: user.adminNote } });
  } catch (err) { next(err); }
});

// ---------- analytics (privacy-conscious: aggregate counts only, no message content) ----------
// Photo storage health (imgbb) - shows the real reason when uploads fail
const acPhotos = require('./acphotos');
router.get('/ac/photo-status', (req, res) => {
  const k = acPhotos.keyInfo(); res.json({ configured: !!k.key, variable: k.name, keyPreview: k.key ? k.key.slice(0, 4) + '…' + k.key.slice(-3) + ` (${k.key.length} characters)` : '', last: acPhotos.status });
});
router.post('/ac/photo-test', async (req, res, next) => { try { res.json(await acPhotos.testUpload()); } catch (e) { next(e); } });

// Social links for the login footer + Settings (empty = nothing shown to players)
const ACSetting = require('../models/ACSetting');
const SOC = ['x', 'tiktok', 'instagram', 'linkedin'];
router.get('/ac/socials', async (req, res, next) => {
  try { const d = await ACSetting.findById('socials').lean(); res.json({ socials: (d && d.value) || {} }); } catch (e) { next(e); }
});
router.post('/ac/socials', async (req, res, next) => {
  try {
    const v = {}, b = (req.body && req.body.socials) || {};
    for (const k of SOC) {
      const u = String(b[k] || '').trim(); if (!u) continue;
      let ok = false; try { const x = new URL(u); ok = /^https?:$/.test(x.protocol) } catch (e) {}
      if (!ok || u.length > 200) return res.status(400).json({ message: `Enter a full link starting with https:// for ${k}.` });
      v[k] = u;
    }
    await ACSetting.findByIdAndUpdate('socials', { $set: { value: v } }, { upsert: true });
    res.json({ socials: v });
  } catch (e) { next(e); }
});

// Blue tick: only an admin can grant or remove it.
router.post('/users/:id/verify', async (req, res, next) => {
  try {
    const on = req.body && typeof req.body.verified === 'boolean' ? req.body.verified : true;
    const u = await User.findByIdAndUpdate(req.params.id, { $set: { verified: on } }, { new: true }).select('displayName verified');
    if (!u) return res.status(404).json({ message: 'User not found.' });
    res.json({ user: { id: u.id, displayName: u.displayName, verified: !!u.verified } });
  } catch (err) { next(err); }
});
router.get('/metrics', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 864e5), day = new Date(Date.now() - 864e5);
    const [byGame, totals, newUsers, active24, openReports, tourOpen, tourRunning] = await Promise.all([
      Match.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$game', matches: { $sum: 1 }, avgMs: { $avg: '$durationMs' } } }, { $sort: { matches: -1 } }]),
      Match.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: null, total: { $sum: 1 }, ranked: { $sum: { $cond: ['$ranked', 1, 0] } },
        withBot: { $sum: { $cond: [{ $gt: [{ $size: { $filter: { input: '$players', as: 'p', cond: '$$p.bot' } } }, 0] }, 1, 0] } },
        forfeits: { $sum: { $cond: [{ $in: ['$reason', ['forfeit', 'strikes']] }, 1, 0] } } } }]),
      User.countDocuments({ createdAt: { $gte: since } }),
      Match.distinct('players.userId', { createdAt: { $gte: day } }),
      Report.countDocuments({ status: 'open' }),
      Tournament.countDocuments({ status: 'open' }), Tournament.countDocuments({ status: 'running' })
    ]);
    const t = totals[0] || { total: 0, ranked: 0, withBot: 0, forfeits: 0 };
    res.json({
      windowDays: 7, matches: t.total, rankedMatches: t.ranked, botMatchShare: t.total ? Math.round(100 * t.withBot / t.total) : 0,
      abandonRate: t.total ? Math.round(100 * t.forfeits / t.total) : 0, newUsers,
      activePlayers24h: active24.filter((x) => !String(x).startsWith('bot:')).length, onlineNow: presence.count ? presence.count() : 0,
      openReports, tournaments: { open: tourOpen, running: tourRunning },
      games: byGame.map((g) => ({ game: g._id, matches: g.matches, avgMinutes: g.avgMs ? Math.round(g.avgMs / 6000) / 10 : null }))
    });
  } catch (err) { next(err); }
});

// ---------- report inbox ----------
const REPORT_STATUSES = ['open', 'resolved', 'dismissed', 'warned', 'suspended'];
router.get('/reports', async (req, res, next) => {
  try {
    const status = String(req.query.status || 'open');
    const filter = status === 'all' ? {} : { status: REPORT_STATUSES.includes(status) ? status : 'open' };
    const rows = await Report.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    const ids = [...new Set(rows.flatMap(r => [r.reporter, r.target]))].filter(x => /^[a-f\d]{24}$/i.test(x));
    const users = await User.find({ _id: { $in: ids } }).select('displayName penaltyPoints suspendedUntil').lean();
    const name = new Map(users.map(u => [String(u._id), u]));
    res.json({ reports: rows.map(r => ({ id: String(r._id), status: r.status, reason: r.reason, roomCode: r.roomCode, createdAt: r.createdAt,
      reporter: { id: r.reporter, name: name.get(r.reporter)?.displayName || 'Unknown' },
      target: { id: r.target, name: name.get(r.target)?.displayName || 'Unknown', penaltyPoints: name.get(r.target)?.penaltyPoints || 0 },
      note: r.note || '', resolvedAt: r.resolvedAt || null })) });
  } catch (err) { next(err); }
});
router.post('/reports/:id/action', async (req, res, next) => {
  try {
    const action = String(req.body?.action || '');
    const note = String(req.body?.note || '').trim().slice(0, 240);
    if (!['dismiss', 'resolve', 'warn', 'suspend'].includes(action)) return res.status(400).json({ message: 'Unknown action.' });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    if (action === 'warn') await User.updateOne({ _id: report.target }, { $inc: { penaltyPoints: 1 }, $set: { adminNote: note || 'Warned after a report.' } });
    if (action === 'suspend') await User.updateOne({ _id: report.target }, { $inc: { penaltyPoints: 1 }, $set: { suspendedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), adminNote: note || 'Suspended for 24h after a report.' } });
    report.status = { dismiss: 'dismissed', resolve: 'resolved', warn: 'warned', suspend: 'suspended' }[action];
    report.note = note; report.resolvedAt = new Date(); report.action = action;
    await report.save();
    console.log('[moderation]', JSON.stringify({ report: String(report._id), action, target: report.target, at: report.resolvedAt })); // audit trail in logs
    res.json({ ok: true, status: report.status });
  } catch (err) { next(err); }
});
// Admin post -> shows up in every player's Updates feed (and live to anyone online). kind: admin | update
router.post('/ac/post', ensureAdmin, async (req, res, next) => {
  try {
    const text = String((req.body && req.body.text) || '').trim().slice(0, 240);
    if (!text) return res.status(400).json({ message: 'Text is required.' });
    const kind = req.body.kind === 'update' ? 'update' : 'admin';
    const v = await require('../utils/acnotify').notify(req.app.get('io'), null, { icon: kind === 'update' ? '🆕' : '📢', text, kind });
    res.json({ update: v });
  } catch (err) { next(err); }
});

module.exports = router;
