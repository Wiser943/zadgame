const express = require('express');
const ensureAuth = require('../middleware/auth');
const User = require('../models/User');
const { Tournament } = require('../models/Social');
const { effectiveGame } = require('../config/gameSettings');
const svc = require('../services/tournaments');
const econ = require('../utils/economy');
const { MIN_ENTRY_FEE } = require('../config/economy');
const naira = (n) => '₦' + Math.floor(n).toLocaleString('en-NG');
const B = require('../utils/bracket');
const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user._id || req.user.id);

const brief = (t, me, names) => ({
  id: String(t._id), name: t.name, game: t.game, status: t.status, maxPlayers: t.maxPlayers, minPlayers: t.minPlayers,
  minLevel: t.minLevel || 1, startsAt: t.startsAt || null, count: t.players.length, joined: t.players.includes(me), entryFee: t.entryFee || 0, prizes: svc.prizesOf(t),
  champion: t.champion ? (names?.get(t.champion) || 'Player') : null
});
const nameMap = async (ids) => {
  const users = await User.find({ _id: { $in: ids.filter((x) => /^[a-f\d]{24}$/i.test(x)) } }).select('displayName avatar').lean();
  return new Map(users.map((u) => [String(u._id), u.displayName || 'Player']));
};

router.get('/', async (req, res, next) => {
  try {
    const me = uid(req);
    const live = await Tournament.find({ status: { $in: ['open', 'running'] }, $or: [{ status: 'running' }, { entryFee: { $gte: MIN_ENTRY_FEE } }] })   // an open tournament with no fee (made before fees were required) is never shown
     .sort({ createdAt: -1 }).limit(30).lean();
    const done = await Tournament.find({ status: 'done' }).sort({ createdAt: -1 }).limit(5).lean();
    const names = await nameMap(done.map((t) => t.champion).filter(Boolean));
    res.json({ tournaments: live.map((t) => brief(t, me)), recent: done.map((t) => brief(t, me, names)) });
  } catch (e) { next(e); }
});

// Tournaments, their entry fee and their prizes are set by the admin only (admin page -> Tournaments). Players can only join or leave.
const adminOnly = (req, res) => res.status(403).json({ message: 'Tournaments are created and started by the admin.' });
router.post('/', adminOnly);
router.post('/:id/start', adminOnly);

router.post('/:id/join', async (req, res, next) => {
  try {
    const me = uid(req);
    const cur = await Tournament.findById(req.params.id).lean();
    if (!cur) return res.status(404).json({ message: 'Tournament not found.' });
    const u = await User.findById(me).select('level');
    if ((u?.level || 1) < (cur.minLevel || 1)) return res.status(403).json({ message: 'You need level ' + cur.minLevel + ' to enter.' });
    if (cur.status !== 'open' || cur.players.includes(me) || cur.players.length >= cur.maxPlayers) return res.status(409).json({ message: 'This tournament is full, already started, or you already joined.' });
    const fee = Math.max(0, Math.floor(Number(cur.entryFee) || 0));
    if (fee < MIN_ENTRY_FEE) return res.status(409).json({ message: 'This tournament has no registration fee set, so it can\'t be joined. Ask the admin.' });
    if ((await econ.debit(me, fee)) == null) return res.status(402).json({ message: `The registration fee is ${naira(fee)} and you don't have enough ₦.` });
    // Atomic: only while open, not already in, and not full => no late joins and no overfilling. If it fails after we charged, give the fee back.
    const t = await Tournament.findOneAndUpdate(
      { _id: req.params.id, status: 'open', players: { $ne: me }, $expr: { $lt: [{ $size: '$players' }, '$maxPlayers'] } },
      { $push: { players: me } }, { new: true });
    if (!t) { await econ.credit(me, fee); return res.status(409).json({ message: 'This tournament is full, already started, or you already joined.' }); }
    if (t.players.length >= t.maxPlayers) svc.start(t._id).catch((e) => console.error('[tournament start]', e.message));
    res.json({ tournament: brief(t, me) });
  } catch (e) { next(e); }
});

router.post('/:id/leave', async (req, res, next) => {
  try {
    const me = uid(req);
    const t = await Tournament.findOneAndUpdate({ _id: req.params.id, status: 'open', players: me }, { $pull: { players: me } }, { new: true });
    if (!t) return res.status(409).json({ message: 'You can only leave before it starts.' });
    if (t.entryFee > 0) await econ.credit(me, t.entryFee);      // leaving before the start refunds the registration fee
    res.json({ ok: true, refunded: t.entryFee || 0 });
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
    res.json({ tournament: { ...brief(t, me, names), players: t.players.map((id) => ({ id, name: nm(id) })), runnerUp: nm(t.runnerUp), prizes: svc.prizesOf(t) }, rounds, myMatch });
  } catch (e) { next(e); }
});
module.exports = router;
