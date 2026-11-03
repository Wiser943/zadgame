const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const registry = require('../games/registry');
const ensureAdmin = require('../middleware/admin');
const { Report, Tournament } = require('../models/Social');
const Match = require('../models/Match');
const presence = require('../utils/presence');
const { effectiveGames, effectiveGame, saveGameSettings } = require('../config/gameSettings');
const { PayoutSeason, PayoutRequest, PayoutAccount, DEFAULT_RULES, dec, statusMessage, naira } = require('../utils/payout');
const { notify } = require('../utils/acnotify');
const { queueCard } = require('../utils/accards');
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
    const users = await User.find(filter).select('displayName phone email ac.cash stats suspendedUntil penaltyPoints adminNote createdAt verified acUsername').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ users: users.map(u => ({ ...u, coins: (u.ac && u.ac.cash) || 0, id: String(u._id) })) });   // coins = the shared ₦ balance
  } catch (err) { next(err); }
});
router.post('/users/:id/penalize', async (req, res, next) => {
  try {
    const coins = Math.max(0, Math.min(1000000000, Math.floor(Number(req.body?.coins)) || 0));   // ₦ taken off the shared balance
    const suspendMinutes = Math.max(0, Math.min(525600, Number(req.body?.suspendMinutes) || 0));
    const reason = String(req.body?.reason || '').trim().slice(0, 240);
    if (!coins && !suspendMinutes) return res.status(400).json({ message: 'Add a coin penalty or suspension duration.' });
    const update = { $inc: { penaltyPoints: 1 }, $set: { adminNote: reason } };
    if (suspendMinutes) update.$set.suspendedUntil = new Date(Date.now() + suspendMinutes * 60000);
    let user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('displayName ac.cash suspendedUntil penaltyPoints adminNote');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (coins) { const cash = await require('../utils/economy').adjust(user.id, -coins); if (cash != null) user.ac.cash = cash; }   // clamped at 0, never negative
    res.json({ user: { id: user.id, displayName: user.displayName, coins: user.ac ? user.ac.cash : 0, suspendedUntil: user.suspendedUntil, penaltyPoints: user.penaltyPoints, adminNote: user.adminNote } });
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


// Elections: only the admin (the "electoral commission") decides when an election happens.
router.get('/ac/elections', ensureAdmin, async (req, res, next) => {
  try { res.json(await require('../services/govService').listRounds()); } catch (e) { next(e); }
});
router.post('/ac/elections', ensureAdmin, async (req, res, next) => {
  try { const b = req.body || {}; res.json(await require('../services/govService').scheduleRound(req.app.get('io'), { start: b.start, shortlistAt: b.shortlistAt, end: b.end })); }
  catch (e) { if (e && e.expose) return res.status(e.code || 400).json({ message: e.message }); next(e); }
});
router.post('/ac/elections/:n/cancel', ensureAdmin, async (req, res, next) => {
  try { res.json(await require('../services/govService').cancelRound(req.params.n)); }
  catch (e) { if (e && e.expose) return res.status(e.code || 400).json({ message: e.message }); next(e); }
});

// Daily gem hunt settings (on/off, clue, hint, place, prize tiers)
router.get('/ac/gem', async (req, res, next) => {
  try { const G = require('../utils/acgem'); res.json({ config: await G.getConfig(), places: G.PLACES }); } catch (e) { next(e); }
});
router.post('/ac/gem', async (req, res, next) => {
  try {
    const G = require('../utils/acgem'), c = G.clean(req.body && req.body.config);
    if (c.enabled && c.placeOn && !c.clue && c.clueOn) return res.status(400).json({ message: 'Write a clue, or switch the clue off.' });
    res.json({ config: await G.saveConfig(c) });
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

// ---- Tournaments: ONLY the admin creates, prices and starts them. Entry fee and prizes are fixed here, never by players. ----
const intIn = (v, min, max, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
const tourRow = (t) => ({ id: String(t._id), name: t.name, game: t.game, status: t.status, maxPlayers: t.maxPlayers, minPlayers: t.minPlayers, minLevel: t.minLevel || 1,
  startsAt: t.startsAt || null, count: (t.players || []).length, entryFee: t.entryFee || 0, prizes: require('../services/tournaments').prizesOf(t), champion: t.champion || null, createdAt: t.createdAt });
router.get('/tournaments', async (req, res, next) => {
  try {
    const rows = await Tournament.find().sort({ createdAt: -1 }).limit(40).lean();
    const { TOURNAMENT_PRIZES, COIN } = require('../config/economy');
    res.json({ tournaments: rows.map(tourRow), defaults: { prizes: TOURNAMENT_PRIZES }, minFee: require('../config/economy').MIN_ENTRY_FEE, games: effectiveGames().filter((g) => g.available && (g.playerCounts || [2]).includes(2)).map((g) => ({ key: g.key, name: g.name })) });
  } catch (e) { next(e); }
});
router.post('/tournaments', async (req, res, next) => {
  try {
    const b = req.body || {}, g = effectiveGame(String(b.game || ''));
    if (!g || !g.available || !(g.playerCounts || [2]).includes(2)) return res.status(400).json({ message: 'Choose an available two-player game.' });
    const maxPlayers = [4, 8, 16].includes(Number(b.maxPlayers)) ? Number(b.maxPlayers) : 8;
    const minPlayers = intIn(b.minPlayers, 4, maxPlayers, 4);
    const startIn = intIn(b.startInMinutes, 0, 10080, 0);
    const prizes = { champion: { coins: intIn(b.championCoins, 0, 1e9, 0), xp: intIn(b.championXp, 0, 1000, 30) }, runnerUp: { coins: intIn(b.runnerUpCoins, 0, 1e9, 0), xp: intIn(b.runnerUpXp, 0, 1000, 10) } };
    const { MIN_ENTRY_FEE } = require('../config/economy'), fee = intIn(b.entryFee, 0, 1e7, 0);
    if (fee < MIN_ENTRY_FEE) return res.status(400).json({ message: `Tournaments are never free. Set a registration fee of at least ₦${MIN_ENTRY_FEE.toLocaleString('en-NG')}.` });
    const t = await Tournament.create({ name: String(b.name || (g.name + ' Cup')).trim().slice(0, 40) || 'Cup', game: g.key, maxPlayers, minPlayers, minLevel: intIn(b.minLevel, 1, 50, 1),
      entryFee: fee, prizes, players: [], createdBy: 'admin', startsAt: startIn ? new Date(Date.now() + startIn * 60000) : null });
    require('../utils/acnotify').notify(req.app.get('io'), null, { icon: '🏆', text: `New tournament: ${t.name}. Entry ₦${t.entryFee.toLocaleString('en-NG')}. Champion wins ₦${prizes.champion.coins.toLocaleString('en-NG')}. Join it in GameHub → Brackets.`, kind: 'admin' }).catch(() => {});
    res.json({ tournament: tourRow(t) });
  } catch (e) { next(e); }
});
router.post('/tournaments/:id/start', async (req, res, next) => {
  try {
    const t = await Tournament.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Tournament not found.' });
    if (t.status !== 'open') return res.status(409).json({ message: 'It already started or was closed.' });
    if (t.players.length < t.minPlayers) return res.status(400).json({ message: `Needs at least ${t.minPlayers} players (has ${t.players.length}).` });
    await require('../services/tournaments').start(t._id); res.json({ ok: true });
  } catch (e) { next(e); }
});
router.post('/tournaments/:id/cancel', async (req, res, next) => {
  try {
    const t = await require('../services/tournaments').cancel(req.params.id);
    if (!t) return res.status(409).json({ message: 'Only open tournaments can be cancelled.' });
    res.json({ ok: true, refunded: t.players.length, fee: t.entryFee || 0 });
  } catch (e) { next(e); }
});

// Creator programme: review applications. status: approved | rejected | suspended (note is shown to the player)
router.get('/creators', async (req, res, next) => {
  try {
    const status = ['applied', 'approved', 'rejected', 'suspended'].includes(req.query.status) ? req.query.status : 'applied';
    const rows = await User.find({ 'creator.status': status }).select('displayName acUsername verified createdAt creator').sort({ 'creator.appliedAt': 1 }).limit(100).lean();
    res.json({ creators: rows.map(u => ({ id: String(u._id), name: u.displayName, username: u.acUsername || '', verified: !!u.verified, joined: u.createdAt, ...u.creator })) });
  } catch (err) { next(err); }
});
router.post('/creators/:id/decide', async (req, res, next) => {
  try {
    const status = String(req.body?.status || ''), note = String(req.body?.note || '').trim().slice(0, 200);
    if (!['approved', 'rejected', 'suspended'].includes(status)) return res.status(400).json({ message: 'status must be approved, rejected or suspended.' });
    const set = { 'creator.status': status, 'creator.decidedAt': new Date(), 'creator.note': note };
    if (status === 'approved') set['creator.approvedAt'] = new Date();
    const u = await User.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).select('displayName creator');
    if (!u) return res.status(404).json({ message: 'User not found.' });
    const text = status === 'approved' ? 'You are in the creator programme! Open Manage on your profile.' : status === 'rejected' ? 'Your creator application was not approved this time.' + (note ? ' ' + note : '') : 'Your creator access is paused.' + (note ? ' ' + note : '');
    require('../utils/acnotify').notify(req.app.get('io'), req.params.id, { icon: status === 'approved' ? '🎉' : 'ℹ️', text, kind: status === 'approved' ? 'good' : 'info' }).catch(() => {});
    res.json({ id: String(u._id), name: u.displayName, creator: u.creator });
  } catch (err) { next(err); }
});
// ---------- Payout seasons: admin-controlled dates, budgets, eligibility switches and review ----------
const pBatch = (b, n) => ({ number: n, name: String(b?.name || `Batch ${n}`).slice(0, 60), opensAt: new Date(b?.opensAt), closesAt: new Date(b?.closesAt), budget: Math.max(0, Number(b?.budget) || 0), maxPayout: Math.max(0, Number(b?.maxPayout) || 1500), minPayout: Math.max(0, Number(b?.minPayout) || 100), minBalance: Math.max(0, Number(b?.minBalance) || 3000000), unitsPerNaira: Math.max(1, Number(b?.unitsPerNaira) || 3333.333333), countedUnitsCap: Math.max(0, Number(b?.countedUnitsCap) || 5000000), budgetRollover: ['none','next_batch','next_season'].includes(b?.budgetRollover) ? b.budgetRollover : 'none', status: ['draft','open','paused','closed'].includes(b?.status) ? b.status : 'draft' });
const pRules = rules => (Array.isArray(rules) && rules.length ? rules : DEFAULT_RULES).map((r, i) => ({ key: String(r.key || `rule_${i}`), label: String(r.label || r.key || 'Rule').slice(0, 80), enabled: r.enabled !== false, value: Math.max(0, Number(r.value) || 0), description: String(r.description || '').slice(0, 200) }));
router.get('/payouts', async (req, res, next) => {
  try {
    const [seasons, requests] = await Promise.all([PayoutSeason.find().sort({ seasonNo: -1 }).lean(), PayoutRequest.find().sort({ submittedAt: -1 }).limit(200).lean()]);
    const ids = [...new Set(requests.map((r) => r.user))];
    const [users, accounts] = await Promise.all([User.find({ _id: { $in: ids } }).select('acUsername displayName rewardsInterest.legalName').lean(), PayoutAccount.find({ user: { $in: ids } }).select('user bankName accountName').lean()]);
    const U = new Map(users.map((u) => [String(u._id), u])), A = new Map(accounts.map((a) => [a.user, a]));
    res.json({ seasons, requests: requests.map((r) => { const u = U.get(r.user) || {}, a = A.get(r.user) || {}; return { ...r, player: { username: u.acUsername || '', displayName: u.displayName || '', legalName: (u.rewardsInterest && u.rewardsInterest.legalName) || '' }, bank: { bankName: a.bankName || '', accountName: a.accountName || '' } }; }) });   // the full account number is never in this list
  } catch (e) { next(e); }
});
// Opening, pausing or closing one batch (a new season starts every batch as a draft).
router.post('/payouts/seasons/:id/batches/:n/status', async (req, res, next) => {
  try {
    const status = String(req.body?.status || ''), n = Number(req.params.n);
    if (!['draft', 'open', 'paused', 'closed'].includes(status) || ![1, 2, 3].includes(n)) return res.status(400).json({ message: 'Choose a batch (1-3) and a status.' });
    const r = await PayoutSeason.updateOne({ _id: req.params.id, 'batches.number': n }, { $set: { 'batches.$.status': status, updatedBy: 'admin' } });
    if (!r.matchedCount) return res.status(404).json({ message: 'Season or batch not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// Manual payment: the team needs the full account number to make the transfer. Only for an approved request, never in lists, and every look is logged (without the number).
router.get('/payouts/requests/:id/bank', async (req, res, next) => {
  try {
    const r = await PayoutRequest.findById(req.params.id).lean(); if (!r) return res.status(404).json({ message: 'Payout request not found.' });
    if (r.status !== 'approved') return res.status(409).json({ message: 'Bank details are shown only for an approved request that is waiting to be paid.' });
    const a = await PayoutAccount.findOne({ user: r.user }).lean(); if (!a || !a.accountNumberCipher) return res.status(404).json({ message: 'This player has no bank details saved.' });
    console.log('[payout]', JSON.stringify({ request: String(r._id), action: 'view_bank', at: new Date().toISOString() }));
    res.set('Cache-Control', 'no-store').json({ bankName: a.bankName, accountName: a.accountName, accountNumber: dec(a.accountNumberCipher), amount: r.payoutAmount });
  } catch (e) { next(e); }
});
// Review actions. approve = "we will pay this", pay = "the transfer has been sent" (the admin types the transfer reference). Every action tells the player.
router.post('/payouts/requests/:id/action', async (req, res, next) => {
  try {
    const action = String(req.body?.action || ''), note = String(req.body?.note || '').trim().slice(0, 240), ref = String(req.body?.reference || '').trim().slice(0, 80);
    const r = await PayoutRequest.findById(req.params.id); if (!r) return res.status(404).json({ message: 'Payout request not found.' });
    if (['paid', 'rejected', 'rolled_over'].includes(r.status)) return res.status(409).json({ message: 'This request is already final.' });
    if (action === 'pay' && r.status !== 'approved') return res.status(409).json({ message: 'Approve the request first, then mark it paid once you have made the bank transfer.' });
    if (action === 'approve' || action === 'pay') {
      const s = await PayoutSeason.findById(r.season), batch = s && s.batches.find((x) => Number(x.number) === r.batch);
      const used = await PayoutRequest.aggregate([{ $match: { season: r.season, batch: r.batch, status: { $in: ['approved', 'processing', 'paid'] }, _id: { $ne: r._id } } }, { $group: { _id: null, total: { $sum: '$payoutAmount' } } }]);
      const remaining = Math.max(0, Number(batch?.budget || 0) - Number(used[0]?.total || 0));
      const amount = action === 'pay' ? Number(r.payoutAmount || 0) : Math.min(Number(r.rawPayout || 0), Number(batch?.maxPayout || r.rawPayout), remaining);   // what was approved is what gets paid
      if (action === 'approve' && amount < Number(batch?.minPayout || 0)) return res.status(409).json({ message: 'Not enough budget remains in this batch. Roll this request over instead.' });
      r.payoutAmount = amount;
      if (action === 'pay') { r.status = 'paid'; r.paidAt = new Date(); r.providerReference = ref; } else r.status = 'approved';
    } else if (action === 'hold') r.status = 'held';
    else if (action === 'rollover') r.status = 'rolled_over';
    else if (action === 'reject') { r.status = 'rejected'; r.rejectionReason = note || 'Not approved in this batch.'; }
    else return res.status(400).json({ message: 'Unknown payout action.' });
    r.adminNote = note; r.reviewedAt = new Date(); await r.save();
    console.log('[payout]', JSON.stringify({ request: String(r._id), action, status: r.status, amount: r.payoutAmount, at: new Date().toISOString() }));
    const m = statusMessage(action, r, action === 'reject' ? r.rejectionReason : note, ref);
    if (m) {
      const io = req.app.get('io');
      await notify(io, r.user, { icon: m.icon, text: m.text, kind: m.kind, ref: 'u:payouts' }).catch(() => {});
      if (action === 'pay' || action === 'approve') await queueCard(io, r.user, { icon: m.icon, title: m.title, text: m.text, tone: m.tone, btn: 'View withdrawals', lines: [['Batch', `Season ${r.seasonNo} · Batch ${r.batch}`], ['Amount', naira(r.payoutAmount)]] }).catch(() => {});
    }
    res.json({ request: r });
  } catch (e) { next(e); }
});
router.post('/payouts/seasons', async (req, res, next) => { try { const b = req.body || {}, batches = [1,2,3].map(n => pBatch((b.batches || []).find(x => Number(x.number) === n), n)); if (!Number.isFinite(new Date(b.startsAt).getTime()) || !Number.isFinite(new Date(b.endsAt).getTime()) || new Date(b.endsAt) <= new Date(b.startsAt) || batches.some(x => !Number.isFinite(x.opensAt.getTime()) || !Number.isFinite(x.closesAt.getTime()) || x.closesAt <= x.opensAt)) return res.status(400).json({ message: 'Every season and batch needs valid dates.' }); const s = await PayoutSeason.create({ seasonNo: Math.max(1, Math.floor(Number(b.seasonNo) || 1)), name: String(b.name || `Season ${b.seasonNo || 1}`).slice(0, 80), startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), status: ['draft','scheduled','active','paused','closed'].includes(b.status) ? b.status : 'draft', maxPayoutsPerSeason: Number(b.maxPayoutsPerSeason) === 1 ? 1 : 2, rules: pRules(b.rules), batches, createdBy: 'admin' }); res.json({ season: s }); } catch (e) { if (e.code === 11000) return res.status(409).json({ message: 'That season number already exists.' }); next(e); } });
router.put('/payouts/seasons/:id', async (req, res, next) => { try { const b = req.body || {}, set = {}; for (const k of ['name','status','startsAt','endsAt','maxPayoutsPerSeason']) if (b[k] !== undefined) set[k] = k === 'maxPayoutsPerSeason' ? (Number(b[k]) === 1 ? 1 : 2) : (k === 'startsAt' || k === 'endsAt' ? new Date(b[k]) : b[k]); if (b.rules) set.rules = pRules(b.rules); if (b.batches) set.batches = [1,2,3].map(n => pBatch((b.batches || []).find(x => Number(x.number) === n), n)); const s = await PayoutSeason.findByIdAndUpdate(req.params.id, { $set: { ...set, updatedBy: 'admin' } }, { new: true }); if (!s) return res.status(404).json({ message: 'Season not found.' }); res.json({ season: s }); } catch (e) { next(e); } });
module.exports = router;
