const express = require('express');
const ensureAuth = require('../middleware/auth');
const User = require('../models/User');
const { Tournament } = require('../models/Social');
const { effectiveGame } = require('../config/gameSettings');
const svc = require('../services/tournaments');
const B = require('../utils/bracket');
const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user._id || req.user.id);
const SIZES = [4, 8, 16];

const brief = (t, me, names) => ({
  id: String(t._id), name: t.name, game: t.game, status: t.status, maxPlayers: t.maxPlayers, minPlayers: t.minPlayers,
  minLevel: t.minLevel || 1, startsAt: t.startsAt || null, count: t.players.length, joined: t.players.includes(me), mine: t.createdBy === me,
  champion: t.champion ? (names?.get(t.champion) || 'Player') : null
});
const nameMap = async (ids) => {
  const users = await User.find({ _id: { $in: ids.filter((x) => /^[a-f\d]{24}$/i.test(x)) } }).select('displayName avatar').lean();
  return new Map(users.map((u) => [String(u._id), u.displayName || 'Player']));
};

router.get('/', async (req, res, next) => {
  try {
    const me = uid(req);
    const live = await Tournament.find({ status: { $in: ['open', 'running'] } }).sort({ createdAt: -1 }).limit(30).lean();
    const done = await Tournament.find({ status: 'done' }).sort({ createdAt: -1 }).limit(5).lean();
    const names = await nameMap(done.map((t) => t.champion).filter(Boolean));
    res.json({ tournaments: live.map((t) => brief(t, me)), recent: done.map((t) => brief(t, me, names)) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const me = uid(req), b = req.body || {};
    const g = effectiveGame(String(b.game || ''));
    if (!g || !g.available || !(g.playerCounts || [2]).includes(2)) return res.status(400).json({ message: 'Choose a two-player game.' });
    const maxPlayers = SIZES.includes(Number(b.maxPlayers)) ? Number(b.maxPlayers) : 8;
    const minLevel = Math.max(1, Math.min(50, Number(b.minLevel) || 1));
    const startIn = [0, 10, 30, 60].includes(Number(b.startInMinutes)) ? Number(b.startInMinutes) : 0;
    const u = await User.findById(me).select('level');
    if ((u?.level || 1) < minLevel) return res.status(403).json({ message: 'Your level is below your own entry limit.' });
    if (await Tournament.countDocuments({ createdBy: me, status: 'open' }) >= 3) return res.status(429).json({ message: 'You already have 3 open tournaments.' });
    const t = await Tournament.create({ name: String(b.name || (g.name + ' Cup')).trim().slice(0, 40) || 'Cup', game: g.key, maxPlayers, minPlayers: 4, minLevel,
      players: [me], createdBy: me, startsAt: startIn ? new Date(Date.now() + startIn * 60000) : null });
    res.json({ tournament: brief(t, me) });
  } catch (e) { next(e); }
});

router.post('/:id/join', async (req, res, next) => {
  try {
    const me = uid(req);
    const cur = await Tournament.findById(req.params.id).lean();
    if (!cur) return res.status(404).json({ message: 'Tournament not found.' });
    const u = await User.findById(me).select('level');
    if ((u?.level || 1) < (cur.minLevel || 1)) return res.status(403).json({ message: 'You need level ' + cur.minLevel + ' to enter.' });
    // Atomic: only while open, not already in, and not full => no late joins and no overfilling.
    const t = await Tournament.findOneAndUpdate(
      { _id: req.params.id, status: 'open', players: { $ne: me }, $expr: { $lt: [{ $size: '$players' }, '$maxPlayers'] } },
      { $push: { players: me } }, { new: true });
    if (!t) return res.status(409).json({ message: 'This tournament is full, already started, or you already joined.' });
    if (t.players.length >= t.maxPlayers) svc.start(t._id).catch((e) => console.error('[tournament start]', e.message));
    res.json({ tournament: brief(t, me) });
  } catch (e) { next(e); }
});

router.post('/:id/leave', async (req, res, next) => {
  try {
    const t = await Tournament.findOneAndUpdate({ _id: req.params.id, status: 'open' }, { $pull: { players: uid(req) } }, { new: true });
    if (!t) return res.status(409).json({ message: 'You can only leave before it starts.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/start', async (req, res, next) => {
  try {
    const t = await Tournament.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Tournament not found.' });
    if (t.createdBy !== uid(req)) return res.status(403).json({ message: 'Only the creator can start it.' });
    if (t.status !== 'open') return res.status(409).json({ message: 'Already started.' });
    if (t.players.length < t.minPlayers) return res.status(400).json({ message: 'Need at least ' + t.minPlayers + ' players.' });
    await svc.start(t._id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const me = uid(req);
    const t = await Tournament.findById(req.params.id).lean();
    if (!t) return res.status(404).json({ message: 'Tournament not found.' });
    const names = await nameMap([...t.players, t.champion, t.runnerUp].filter(Boolean));
    const nm = (id) => (id ? names.get(id) || 'Player' : null);
    let rounds = [], myMatch = null;
    if (t.bracket) {
      rounds = t.bracket.rounds.map((r, ri) => ({ name: B.roundName(t.bracket, ri), matches: r.map((m, si) => {
        const live = !!(m.a && m.b && !m.winner);
        if (live && (m.a === me || m.b === me) && m.code) myMatch = { code: m.code, round: B.roundName(t.bracket, ri), opponent: nm(m.a === me ? m.b : m.a) };
        return { a: nm(m.a), b: nm(m.b), winner: nm(m.winner), live, bye: !!((m.a && !m.b) || (!m.a && m.b)), code: live ? m.code : null, mine: m.a === me || m.b === me };
      }) }));
    }
    res.json({ tournament: { ...brief(t, me, names), players: t.players.map((id) => ({ id, name: nm(id) })), runnerUp: nm(t.runnerUp), prizes: svc.PRIZES }, rounds, myMatch });
  } catch (e) { next(e); }
});
module.exports = router;
