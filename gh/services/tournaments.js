const { Tournament } = require('../models/Social');
const User = require('../models/User');
const B = require('../utils/bracket');
const hub = require('../utils/tournamentHub');

const PRIZES = { champion: { coins: 100, xp: 30 }, runnerUp: { coins: 40, xp: 10 } }; // cosmetic coins/xp only, never cash
const locks = new Map();
// Serialise all changes to one tournament so two matches ending at once cannot overwrite each other.
function withLock(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(id, next.catch(() => {}));
  return next;
}
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function launchReady(t) {
  for (const { round, slot, match } of B.readyMatches(t.bracket)) {
    if (match.code) continue;
    match.code = hub.createMatchRoom({ id: String(t._id), round, slot, game: t.game, players: [match.a, match.b] });
    for (const uid of [match.a, match.b]) hub.notify && hub.notify(uid, 'tournament:match', { tournamentId: String(t._id), name: t.name, stage: B.roundName(t.bracket, round), code: match.code, game: t.game });
  }
}

function start(id) {
  return withLock(String(id), async () => {
    const t = await Tournament.findById(id);
    if (!t || t.status !== 'open') return null;
    if (t.players.length < t.minPlayers) { t.status = 'cancelled'; await t.save(); return t; }
    t.bracket = B.buildBracket(shuffle(t.players));
    t.status = 'running';
    launchReady(t);
    finishIfDone(t);
    t.markModified('bracket'); await t.save();
    return t;
  });
}

function finishIfDone(t) {
  const champ = B.champion(t.bracket);
  if (!champ || t.status === 'done') return false;
  t.status = 'done'; t.champion = champ; t.runnerUp = B.runnerUp(t.bracket);
  User.updateOne({ _id: champ }, { $inc: { coins: PRIZES.champion.coins, xp: PRIZES.champion.xp, tournamentWins: 1 } }).catch(() => {});
  if (t.runnerUp) User.updateOne({ _id: t.runnerUp }, { $inc: { coins: PRIZES.runnerUp.coins, xp: PRIZES.runnerUp.xp } }).catch(() => {});
  return true;
}

// meta = { id, round, slot }. winnerId null means a draw: the pair replays in a fresh room.
function onMatchResult(meta, winnerId) {
  return withLock(String(meta.id), async () => {
    const t = await Tournament.findById(meta.id);
    if (!t || t.status !== 'running') return null;
    const m = t.bracket.rounds[meta.round]?.[meta.slot];
    if (!m || m.winner) return t;
    if (!winnerId) {
      m.code = hub.createMatchRoom({ id: String(t._id), round: meta.round, slot: meta.slot, game: t.game, players: [m.a, m.b] });
      for (const uid of [m.a, m.b]) hub.notify && hub.notify(uid, 'tournament:match', { tournamentId: String(t._id), name: t.name, stage: B.roundName(t.bracket, meta.round) + ' (replay after a draw)', code: m.code, game: t.game });
    } else {
      B.setWinner(t.bracket, meta.round, meta.slot, String(winnerId));
      launchReady(t);
      finishIfDone(t);
    }
    t.markModified('bracket'); await t.save();
    return t;
  });
}

// Auto-start / cancel scheduled tournaments whose start time has passed.
async function tick() {
  const due = await Tournament.find({ status: 'open', startsAt: { $ne: null, $lte: new Date() } }).select('_id').lean();
  for (const d of due) await start(d._id).catch((e) => console.error('[tournament tick]', e.message));
}
module.exports = { start, onMatchResult, tick, PRIZES };
