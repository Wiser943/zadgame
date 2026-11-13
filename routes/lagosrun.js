// Drive API at /lagosrun/api. There is no separate game login: whoever is signed in to AllConnect (same session cookie) is the player.
// Not signed in = guest: the game still plays, but nothing is saved to the server and no score is posted.
const express = require('express');
const User = require('../models/User');
const { LagosRunAccount, LagosRunBest } = require('../models/LagosRun');
const L = require('../utils/lagosrun');

const router = express.Router();
const bad = (res, code, error) => res.status(code).json({ ok: false, error });
const signedIn = (req) => !!(req.isAuthenticated && req.isAuthenticated() && req.user && !(req.user.suspendedUntil && new Date(req.user.suspendedUntil).getTime() > Date.now()));
const playerName = (u) => (u.acUsername || u.displayName || 'Player').slice(0, 24);

const hits = new Map();
const limited = (id, max) => { const now = Date.now(), a = (hits.get(id) || []).filter((t) => now - t < 60000); if (a.length >= max) { hits.set(id, a); return true; } a.push(now); hits.set(id, a); return false; };

async function getAccount(userId) {
  return (await LagosRunAccount.findOne({ user: userId })) || (await LagosRunAccount.create({ user: userId }).catch(async (e) => { if (e.code === 11000) return LagosRunAccount.findOne({ user: userId }); throw e; }));
}

// ---- who am I, plus sync. The game's old "google" sign-in is gone; "session" and "sync" are the same call now. ----
router.post('/account', async (req, res, next) => {
  try {
    const b = req.body || {}, action = String(b.action || '');
    if (!signedIn(req)) return bad(res, 401, 'signin');
    const me = String(req.user.id);
    if (limited('acct:' + me, 60)) return bad(res, 429, 'slow down');
    const user = await User.findById(me).select('acUsername displayName');
    if (!user) return bad(res, 401, 'signin');
    if (action === 'name') return res.json({ ok: true, name: playerName(user) });      // the AllConnect username is the player name
    if (action !== 'session' && action !== 'sync') return bad(res, 400, 'unknown action');

    const acct = await getAccount(me);
    const hadSave = !!acct.save;
    const merged = L.mergeSave(acct.save, b.save);
    let wallet = L.cleanWallet(acct.wallet), ack = null;
    const out = b.out && typeof b.out === 'object' ? b.out : null;
    if (out && Number.isFinite(Number(out.seq))) {
      const seq = Math.floor(Number(out.seq));
      if (seq > acct.seq) { wallet = L.applyDelta(wallet, out.delta); acct.seq = seq; }   // a seq we have already applied is acknowledged but not applied twice
      ack = seq;
    }
    acct.save = merged; acct.wallet = wallet; acct.markModified('save');
    await acct.save();
    res.json({ ok: true, session: 'main', pid: me, name: playerName(user), save: merged, wallet, ack, result: hadSave ? 'linked' : 'created' });
  } catch (e) { next(e); }
});

// ---- a run starts: hand out a signed token (guests get none, so their runs stay on the phone) ----
router.post('/run', (req, res) => {
  if (!signedIn(req)) return bad(res, 401, 'signin');
  const me = String(req.user.id);
  if (limited('run:' + me, 40)) return bad(res, 429, 'slow down');
  res.json({ ok: true, token: L.signRun(me) });
});

// ---- a run ends: post the score to the day / week / all-time boards ----
router.post('/score', async (req, res, next) => {
  try {
    if (!signedIn(req)) return bad(res, 401, 'signin');
    const me = String(req.user.id), b = req.body || {};
    if (limited('score:' + me, 30)) return bad(res, 429, 'slow down');
    const tok = L.verifyRun(b.token, me);
    if (!tok) return bad(res, 400, 'bad run');
    const run = L.cleanRun(b, tok.t);
    if (!run.ok) return bad(res, 400, run.error);
    const acct = await getAccount(me);
    if (acct.usedRuns.includes(tok.n)) return bad(res, 409, 'already counted');
    acct.usedRuns = [...acct.usedRuns, tok.n].slice(-25); acct.runs += 1; await acct.save();

    const user = await User.findById(me).select('acUsername displayName'), name = playerName(user), periods = L.periodKeys(), boards = {};
    for (const board of L.BOARDS) {
      const period = periods[board];
      const row = await LagosRunBest.findOneAndUpdate({ user: me, board, period }, { $setOnInsert: { at: new Date(), score: 0 }, $set: { name } }, { upsert: true, new: true });
      if (run.score > row.score || !row.score) { row.score = run.score; row.metres = run.metres; row.at = new Date(); await row.save(); }
      boards[board] = { rank: await rankOf(board, period, row), score: row.score };
    }
    res.json({ ok: true, name, boards, periods });
  } catch (e) { next(e); }
});

// Rank = how many players are ahead (higher score, or the same score reached earlier) + 1.
async function rankOf(board, period, row) {
  const ahead = await LagosRunBest.countDocuments({ board, period, score: { $gt: 0 }, $or: [{ score: { $gt: row.score } }, { score: row.score, at: { $lt: row.at } }] });
  return ahead + 1;
}

// ---- boards are public ----
const boardOf = (v) => (L.BOARDS.includes(v) ? v : 'day');
router.get('/leaderboard', async (req, res, next) => {
  try {
    const board = boardOf(req.query.board), limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50)), period = L.periodKeys()[board];
    const rows = await LagosRunBest.find({ board, period, score: { $gt: 0 } }).sort({ score: -1, at: 1 }).limit(limit).lean();
    res.set('Cache-Control', 'no-store').json({ ok: true, board, period, top: rows.map((r, i) => ({ rank: i + 1, name: r.name, score: r.score })) });
  } catch (e) { next(e); }
});
router.get('/rank', async (req, res, next) => {
  try {
    const board = boardOf(req.query.board), period = L.periodKeys()[board];
    if (!signedIn(req)) return res.json({ ok: true, board, period, rank: null, score: 0 });
    const row = await LagosRunBest.findOne({ user: req.user.id, board, period }).lean();
    if (!row || !row.score) return res.json({ ok: true, board, period, rank: null, score: 0 });
    res.set('Cache-Control', 'no-store').json({ ok: true, board, period, rank: await rankOf(board, period, row), score: row.score });
  } catch (e) { next(e); }
});

// ---- the old standalone name endpoint: the name is the AllConnect username now ----
router.post('/name', async (req, res, next) => {
  try {
    if (!signedIn(req)) return bad(res, 401, 'signin');
    const user = await User.findById(req.user.id).select('acUsername displayName');
    res.json({ ok: true, name: playerName(user) });
  } catch (e) { next(e); }
});

router.use((req, res) => bad(res, 404, 'not found'));
module.exports = router;
