// Real-time layer: rooms, moves, forfeit timers, quick match, rematch, emotes, rate limits.
// Rooms live in memory (single Node process). Engines come from ../games (see README).
// Room size is variable: most games are 2-player, but a game can offer more
// than one size via registry.js's `playerCounts` (e.g. Ludo: 2 or 4) — the
// creator picks one when the room is made, and it's stored as r.maxPlayers.
const passport = require('passport');
const games = require('../games');
const { effectiveGame } = require('../config/gameSettings');
const User = require('../models/User');
const Match = require('../models/Match');
const mongoose = require('mongoose');
const { selectHighlights } = require('../utils/highlights');
const presence = require('../utils/presence');
const ChallengeProgress = require('../models/Challenge');
const challenges = require('../utils/challenges');
const { Friendship } = require('../models/Social');
const botlevels = require('../games/botlevels');
const elo = require('../utils/elo');
const profanity = require('../utils/profanity');
const tournaments = require('../services/tournaments');
const econ = require('../utils/economy');
const { stakeFor } = require('../config/economy');
const hub = require('../utils/tournamentHub');
const NOSHOW_MS = 3 * 60 * 1000;           // tournament no-show: opponent gets a walkover
const QUEUE_TICK_MS = 2000;
const RANKED_GAMES_MIN_PLAYERS = 2;

const ENG = games.ENGINES || games;
const FORFEIT_MS = 75 * 1000;
const WAITING_ROOM_RETENTION_MS = 60 * 1000;      // disconnect this long => that player forfeits
const EMOTE_COUNT = 8;             // keep in sync with EMOTES in public/index.html

// ---- Ludo-only: per-turn clock, strikes, and a whole-match countdown ----
const LUDO_TURN_MS = 15 * 1000;                 // roll or move within this long, or take a strike
const LUDO_STRIKE_LIMIT = 3;                    // 3 strikes = removed from the room
const LUDO_MATCH_MS = { 2: 4 * 60 * 1000, 3: 6 * 60 * 1000, 4: 8 * 60 * 1000 }; // match clock by room size

// ---- Every game gets a visible per-turn clock. Ludo uses its own bespoke
// strike/elimination system above; every other turn-based game just plays
// an automatic move (via the engine's botMove) for whoever stalls, so a
// slow or disconnected player never blocks the match. RPS has no single
// "turn" (both players pick each round), so it gets its own round clock.
const TURN_MS = { tictactoe: 20 * 1000, connectfour: 20 * 1000, chess: 30 * 1000, whot: 25 * 1000 };
const RPS_ROUND_MS = 15 * 1000;

const rooms = new Map();
const spectators = new Map();           // code -> room
const hits = new Map();            // rate-limit log: "userId:event" -> [timestamps]
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

// ---- Bots: fill empty seats so a lone player (or an empty room) can still
// play. Bot "players" never hold a real socket — they're always treated as
// connected, never forfeit on disconnect, and act a moment after it becomes
// their turn.
const BOT_MOVE_MS = [550, 1400]; // random delay range so a bot's move doesn't feel instant
const botDelay = () => BOT_MOVE_MS[0] + Math.random() * (BOT_MOVE_MS[1] - BOT_MOVE_MS[0]);
const BOT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#3a3a45"/>'
  + '<text x="32" y="41" font-size="28" text-anchor="middle">\u{1F916}</text></svg>'
);
let botSeq = 0;

const engineFor = (g) => (typeof g === 'string' && Object.prototype.hasOwnProperty.call(ENG, g) && ENG[g]) || null;
const isCode = (c) => typeof c === 'string' && /^[A-Z0-9]{4,8}$/.test(c);
const playerCountsFor = (game) => effectiveGame(game)?.playerCounts || [2];
const gameEnabled = (game) => !!effectiveGame(game)?.available;
const resolveMaxPlayers = (game, requested) => {
  const allowed = playerCountsFor(game);
  return allowed.includes(requested) ? requested : allowed[0];
};

function allow(uid, ev, max, ms) {
  const k = uid + ':' + ev, now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < ms);
  if (arr.length >= max) { hits.set(k, arr); return false; }
  arr.push(now); hits.set(k, arr); return true;
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); } while (rooms.has(c));
  return c;
}

// ---- Stakes: every human-vs-human match costs each player a stake, taken when the match starts.
// The winner is credited the whole pot; a draw means everyone loses their stake. Matches with a bot, and
// tournament matches, are free and never touch rankings, stats, XP or ₦.
const stakeOf = (r) => (r.tournament || r.beginner || r.players.some((p) => p.bot) ? 0 : stakeFor(r.game));   // beginner rooms are free: new players learn without risking ₦
const naira = (n) => '₦' + Number(n).toLocaleString('en-NG');

module.exports = function initSockets(io, sessionMiddleware) {
  io.engine.use(sessionMiddleware);
  io.engine.use(passport.initialize());
  io.engine.use(passport.session());
  io.use((socket, next) => {
    const u = socket.request.user;
    if (!u) return next(new Error('unauthorized'));
    if (u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now()) return next(new Error('account-suspended'));
    next();
  });

  const view = (r, i) => ({
    code: r.code, game: r.game, status: r.status, you: i, maxPlayers: r.maxPlayers, difficulty: r.difficulty || 'normal', ranked: !!r.ranked, options: r.options || null,
    // playerIndex -> ms-epoch they forfeit at, for anyone currently disconnected-but-not-yet-eliminated
    forfeits: r.forfeits ? Object.fromEntries([...r.forfeits].map(([idx, f]) => [idx, f.forfeitAt])) : {},
    result: r.result || null,
    stake: r.status === 'waiting' ? stakeOf(r) : (r.result ? r.result.stake : (r.stakePaid || 0)),
    practice: r.players.some((p) => p.bot) && !r.tournament,
    spectatorCount: r.spectators ? r.spectators.size : 0,
    rematch: r.rematch ? [...r.rematch] : [],
    round: r.round || 0,
    strikes: r.strikes || [],
    turnDeadline: r.turnDeadline || null,
    now: Date.now(),                 // lets clients sync their countdowns to the server clock
    matchDeadline: r.matchDeadline || null,
    players: r.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, connected: p.connected, out: !!p.out, bot: !!p.bot })),
    state: r.state && ENG[r.game].publicState ? ENG[r.game].publicState(r.state, i) : r.state
  });
  const push = (r) => { r.players.forEach((p, i) => p.sid && io.to(p.sid).emit('room:update', view(r, i))); if (r.spectators) for (const sid of r.spectators) io.to(sid).emit('room:update', view(r, null)); };
  // Chat delivery that respects each player's personal mute list.
  const toAllChat = (r, from, ev, payload) => {
    r.players.forEach((p, idx) => { if (p.sid && !(r.mutes?.get(String(p.id))?.has(from))) io.to(p.sid).emit(ev, payload); });
    if (r.spectators) for (const sid of r.spectators) io.to(sid).emit(ev, payload);
  };
  const toAll = (r, ev, payload) => { r.players.forEach((p) => p.sid && io.to(p.sid).emit(ev, payload)); if (r.spectators) for (const sid of r.spectators) io.to(sid).emit(ev, payload); };

  // Fills every open seat in a still-waiting room with a bot player and,
  // once full, starts the match — lets a lone player (or a room nobody else
  // joins) play right away instead of waiting for real opponents.
  function fillWithBots(r) {
    if (r.status !== 'waiting') return;
    while (r.players.length < r.maxPlayers) {
      botSeq += 1;
      r.players.push({
        id: 'bot:' + r.code + ':' + botSeq, name: 'Bot ' + (r.players.filter((p) => p.bot).length + 1),
        avatar: BOT_AVATAR, sid: null, connected: true, out: false, bot: true
      });
    }
    if (r.players.length === r.maxPlayers) beginMatch(r);   // has bots => free, starts straight away
    pushAndBot(r);
  }

  // Applies a move that's already been checked with isValidMove — shared by
  // the real game:move handler and bot moves so both go through identical
  // logic (events, win/draw detection, re-arming the ludo turn clock).
  function applyValidatedMove(r, i, move) {
    const e = ENG[r.game];
    const whotBefore = r.game === 'whot' ? r.state : null;
    const whotCard = whotBefore && move.type === 'play' ? whotBefore.hands[i]?.[move.index] : null;
    const whotPending = whotBefore?.pendingPick || 0;
    r.moves = r.moves || [];
    const before = r.moves.length ? undefined : JSON.parse(JSON.stringify(r.state)); // first move: remember the opening position so it can be animated too
    r.state = e.applyMove(r.state, i, move);
    r.moves.push({ player:i, move, at:Date.now(), state: JSON.parse(JSON.stringify(r.state)), ...(before ? { before } : {}) });
    if (r.game === 'whot') {
      if (move.type === 'market') {
        toAll(r, 'game:event', { type: 'whotMarket', player: i, count: whotPending || 1, automatic: !!r.players[i]?.bot });
      } else if (whotCard?.value === 14) {
        toAll(r, 'game:event', { type: 'whotGeneralMarket', player: i });
      } else if (whotCard?.value === 2 || whotCard?.value === 5) {
        toAll(r, 'game:event', { type: 'whotPick', player: i, value: whotCard.value, defense: whotPending > 0, total: r.state.pendingPick || 0 });
      } else if (whotCard?.shape === 'whot' && typeof move.calledShape === 'string') {
        toAll(r, 'game:event', { type: 'whotRequest', player: i, shape: move.calledShape });
      }
    }
    if (r.game === 'chess' && Array.isArray(r.state.active)) {
      r.state.active.forEach((active, player) => {
        if (!active && r.players[player]) r.players[player].out = true;
      });
    }

    if (r.game === 'ludo') {
      if (r.strikes) r.strikes[i] = 0; // acted in time — clear their strike streak
      if (move.type === 'roll') {
        toAll(r, 'game:event', { type: 'roll', player: i, dice: r.state.lastRoll, streak: r.state.lastRollStreak || 0 });
      } else if (move.type === 'move') {
        if (r.state.lastMove) toAll(r, 'game:event', { type: 'move', ...r.state.lastMove });
        if (r.state.lastCapture) toAll(r, 'game:event', { type: 'capture', by: i, captured: r.state.lastCapture });
        if (r.state.lastHome) toAll(r, 'game:event', { type: 'tokenHome', ...r.state.lastHome });
      }
    }

    const res = e.checkResult(r.state);
    if (res.status === 'ongoing') { armTurnTimer(r); pushAndBot(r); return; } // arm first so the pushed view carries the new deadline
    push(r); finish(r, res.status === 'win' ? res.winnerIndex : null, 'normal');
  }

  // Returns the indices of bot players who should act right now. Most games
  // are turn-based (one index); RPS has simultaneous picks, so any bot that
  // hasn't chosen yet for the current round should act.
  function botsToAct(r) {
    if (r.status !== 'playing' || !r.state) return [];
    if (r.game === 'rps') {
      if (ENG.rps.checkResult(r.state).status !== 'ongoing') return [];
      return r.players.map((p, i) => i).filter((i) => r.players[i].bot && !r.players[i].out && r.state.choices[i] === null);
    }
    const t = r.state.turn;
    if (Number.isInteger(t) && r.players[t] && r.players[t].bot && !r.players[t].out) return [t];
    return [];
  }

  function runBotMove(r, i) {
    if (r.status !== 'playing' || !r.players[i] || r.players[i].out || !r.players[i].bot) return;
    const eng = ENG[r.game];
    if (!eng.botMove) return;
    const move = botlevels.botMoveLevel(r.game, eng, r.state, i, r.difficulty);
    if (!move || !eng.isValidMove(r.state, i, move)) return; // safety net — shouldn't happen
    applyValidatedMove(r, i, move);
  }

  // Call this instead of push(r) anywhere the game may still be ongoing —
  // it pushes the room update, then schedules the next bot move if it's a
  // bot's turn (or, in RPS, if a bot still needs to pick).
  function pushAndBot(r) {
    push(r);
    clearTimeout(r.botTimer); r.botTimer = null;
    if (r.status !== 'playing') return;
    const acting = botsToAct(r);
    if (!acting.length) return;
    r.botTimer = setTimeout(() => runBotMove(r, acting[0]), botDelay());
  }

  function clearForfeit(r, i) {
    const f = r.forfeits && r.forfeits.get(i);
    if (f) { clearTimeout(f.timer); r.forfeits.delete(i); }
  }
  function clearAllForfeits(r) {
    if (!r.forfeits) return;
    for (const f of r.forfeits.values()) clearTimeout(f.timer);
    r.forfeits.clear();
  }

  // ---- Per-turn clock (every game) + Ludo's whole-match clock ----
  // Dispatches to the right kind of turn clock for the room's game: Ludo's
  // own strike/elimination system, RPS's simultaneous-pick round clock, or
  // a plain single-player turn clock for everything else.
  function armTurnTimer(r) {
    clearTimeout(r.turnTimer); r.turnTimer = null; r.turnDeadline = null;
    if (r.status !== 'playing') return;
    if (r.game === 'ludo') {
      r.turnDeadline = Date.now() + LUDO_TURN_MS;
      r.turnTimer = setTimeout(() => ludoTurnTimeout(r), LUDO_TURN_MS);
      return;
    }
    if (r.game === 'rps') {
      r.turnDeadline = Date.now() + RPS_ROUND_MS;
      r.turnTimer = setTimeout(() => rpsRoundTimeout(r), RPS_ROUND_MS);
      return;
    }
    const ms = TURN_MS[r.game];
    if (!ms) return;
    r.turnDeadline = Date.now() + ms;
    r.turnTimer = setTimeout(() => genericTurnTimeout(r), ms);
  }
  function ludoTurnTimeout(r) {
    if (r.status !== 'playing') return;
    const i = r.state.turn;
    if (!r.strikes) r.strikes = Array(r.maxPlayers).fill(0);
    r.strikes[i] = (r.strikes[i] || 0) + 1;
    toAll(r, 'game:event', { type: 'timeout', player: i, strikes: r.strikes[i] });
    if (r.strikes[i] >= LUDO_STRIKE_LIMIT) {
      toAll(r, 'game:event', { type: 'strikeout', player: i, coinsLost: r.stakePaid || 0 });   // their stake is already in the pot
      eliminatePlayer(r, i, 'strikes'); // re-arms the turn timer itself if the match continues
      return;
    }
    r.state = ENG[r.game].forcePass(r.state);
    armTurnTimer(r);
    pushAndBot(r);
  }
  // Tic-tac-toe, Connect Four, Whot: whoever's turn it is just gets an
  // automatic move played for them (the same logic bots use), so a stalled
  // or disconnected human never blocks the match.
  function genericTurnTimeout(r) {
    if (r.status !== 'playing') return;
    const i = r.state.turn;
    if (!Number.isInteger(i) || !r.players[i] || r.players[i].out) { armTurnTimer(r); return; }
    toAll(r, 'game:event', { type: 'timeout', player: i });
    const eng = ENG[r.game];
    const move = eng.botMove ? eng.botMove(r.state, i) : null;
    if (move && eng.isValidMove(r.state, i, move)) { applyValidatedMove(r, i, move); return; }
    armTurnTimer(r); // no safe fallback move available — just keep the clock moving
  }
  // RPS: fill in a random pick for anyone who hasn't chosen this round.
  function rpsRoundTimeout(r) {
    if (r.status !== 'playing' || r.game !== 'rps') return;
    const eng = ENG.rps;
    let acted = false;
    r.players.forEach((p, i) => {
      if (p.out || r.state.choices[i] !== null) return;
      const move = eng.botMove();
      if (!eng.isValidMove(r.state, i, move)) return;
      r.state = eng.applyMove(r.state, i, move);
      acted = true;
    });
    if (acted) {
      toAll(r, 'game:event', { type: 'timeout' });
      const res = eng.checkResult(r.state);
      if (res.status !== 'ongoing') { push(r); finish(r, res.status === 'win' ? res.winnerIndex : null, 'normal'); return; }
    }
    armTurnTimer(r);
    pushAndBot(r);
  }
  function armMatchTimer(r) {
    clearTimeout(r.matchTimer); r.matchTimer = null; r.matchDeadline = null;
    if (r.game !== 'ludo' || r.status !== 'playing') return;
    const ms = LUDO_MATCH_MS[r.maxPlayers] || LUDO_MATCH_MS[2];
    r.matchDeadline = Date.now() + ms;
    r.matchTimer = setTimeout(() => matchTimeUp(r), ms);
  }
  function matchTimeUp(r) {
    if (r.status !== 'playing') return;
    const winner = ENG[r.game].highestScoreWinner(r.state);
    finish(r, winner, 'timeup');
  }

  // ---- starting a match (and charging stakes) ----
  function startNow(r, rematch) {
    if (rematch) { r.rematch = new Set(); r.result = null; r.players.forEach((p) => { p.out = false; }); }
    r.status = 'playing'; r.startedAt = Date.now(); r.state = initState(r); r.moves = [];
    r.round = (r.round || 0) + 1;
    r.strikes = Array(r.maxPlayers).fill(0);
    armTurnTimer(r); armMatchTimer(r);
  }
  function beginMatch(r, rematch) {
    const stake = stakeOf(r);
    if (!stake) { r.stakePaid = 0; r.stakePot = 0; r.paidIds = null; startNow(r, rematch); return; }
    if (r.charging) return;
    r.charging = true;
    chargeAndStart(r, stake, rematch)
      .catch((e) => { console.error('[stake]', e.message); })
      .finally(() => { r.charging = false; });
  }
  async function chargeAndStart(r, stake, rematch) {
    const people = r.players.slice(), paid = [];
    const giveBack = async () => { for (const q of paid) await econ.credit(q.id, stake).catch((e) => console.error('[refund]', e.message)); };
    for (const p of people) {
      let cash = null;
      try { cash = await econ.debit(p.id, stake); } catch (e) { console.error('[stake debit]', e.message); }
      if (cash == null) { await giveBack(); return stakeRejected(r, p, stake, rematch); }
      paid.push(p);
    }
    const stillSame = rooms.get(r.code) === r && r.status === (rematch ? 'over' : 'waiting') && r.players.length === people.length && people.every((p, i) => r.players[i] === p);
    if (!stillSame) { await giveBack(); if (rooms.get(r.code) === r) push(r); return; }
    r.stakePaid = stake; r.stakePot = stake * paid.length; r.paidIds = paid.map((p) => String(p.id));
    startNow(r, rematch);
    r.players.forEach((p, i) => { if (!p.connected && !p.bot) startForfeitTimer(r, i); });
    paid.forEach((p) => p.sid && io.to(p.sid).emit('stake:charged', { stake, pot: r.stakePot, code: r.code }));
    push(r);
  }
  function stakeRejected(r, p, stake, rematch) {
    const message = `You need ${naira(stake)} to play this match. Top up or pick a free practice match against a bot.`;
    if (p.sid) io.to(p.sid).emit('stake:rejected', { message, stake, code: r.code });
    if (rematch) { r.rematch = new Set(); toAll(r, 'error', { message: `${p.name} can't cover the ${naira(stake)} stake, so no rematch.` }); push(r); return; }
    const idx = r.players.indexOf(p);          // waiting room: the player who can't pay leaves, everyone else keeps waiting
    if (idx !== -1) {
      const sock = p.sid && io.sockets.sockets.get(p.sid); if (sock) sock.data.code = null;
      r.players.splice(idx, 1);
    }
    scheduleWaitingRoomCleanup(r); push(r);
  }
  function refundStakes(r) {
    if (!r.stakePaid || !r.paidIds) return;
    const stake = r.stakePaid; r.paidIds.forEach((id) => econ.credit(id, stake).catch((e) => console.error('[refund]', e.message)));
    r.stakePaid = 0; r.stakePot = 0; r.paidIds = null;
  }
  // Can this player afford the stake for joining/creating a human match? (checked up front so nobody is dropped mid-start)
  async function stakeBlock(uid, game, room) {
    const stake = room ? stakeOf(room) : stakeFor(game);
    if (!stake) return null;
    if (room && room.players.some((p) => String(p.id) === uid)) return null;     // already seated
    return (await econ.canAfford(uid, stake)) ? null : `You need ${naira(stake)} to play this match. Top up or play a free practice match against a bot.`;
  }

  function finish(r, winnerIndex, reason) {
    if (r.status !== 'playing') return;
    clearAllForfeits(r);
    clearTimeout(r.turnTimer); r.turnTimer = null; r.turnDeadline = null;
    clearTimeout(r.matchTimer); r.matchTimer = null; r.matchDeadline = null;
    clearTimeout(r.botTimer); r.botTimer = null;
    r.status = 'over'; r.rematch = new Set();
    const matchId = new mongoose.Types.ObjectId();
    const highlights = selectHighlights(r.game, r.moves, winnerIndex, ENG[r.game].publicState);
    const momentScore = highlights.reduce((a, h) => a + (h.score || 0) * 100, 0);
    // Practice = any bot in the room. Practice matches are free and leave NO trace: no ₦, stats, XP, rating, streak,
    // challenge progress or leaderboard movement, so nobody can climb by beating bots.
    const practice = r.players.some((p) => p.bot);
    const stake = r.stakePaid || 0, pot = r.stakePot || 0;
    r.result = { winnerIndex, status: winnerIndex == null ? 'draw' : 'win', reason: reason || 'normal', highlights, matchId: String(matchId),
      practice, stake, pot, payout: winnerIndex == null ? 0 : pot, burned: winnerIndex == null ? pot : 0 };
    if (!practice) r.players.forEach((p, i) => {
      const won = winnerIndex === i, draw = winnerIndex == null;
      User.updateOne({ _id: p.id }, { $inc: {
        'stats.gamesPlayed': 1, 'stats.wins': won ? 1 : 0,
        'stats.losses': !won && !draw ? 1 : 0, 'stats.draws': draw ? 1 : 0
      } }).catch((e) => console.error('[stats]', e.message));
    });
    // Winner takes the pot. A draw pays nobody, so both stakes are gone.
    if (pot > 0 && winnerIndex != null && !r.players[winnerIndex].bot) {
      const wid = r.players[winnerIndex].id;
      econ.credit(wid, pot).catch((e) => console.error('[payout]', e.message));
    }
    r.stakePaid = 0; r.stakePot = 0; r.paidIds = null;
    Match.create({ _id:matchId, highlights: winnerIndex == null ? [] : highlights, momentScore, game:r.game, roomCode:r.code, players:r.players.map(p=>({userId:p.id,name:p.name,bot:!!p.bot})), winnerIndex, result:r.result.status, reason, durationMs:r.startedAt?Date.now()-r.startedAt:undefined, ranked:!!r.ranked, moves:r.moves||[] }).catch(e=>console.error('[match]',e.message));
    const winner = winnerIndex != null ? r.players[winnerIndex] : null;
    if (winner && !winner.bot && !practice) {      // auto-post the win to P-Gist (real opponents only, throttled, opt-out in Settings)
      try {
        const foes = r.players.filter((p, i) => i !== winnerIndex && !p.bot);
        if (foes.length && !r.players.some((p) => p.bot)) {
          const sc = r.state && Array.isArray(r.state.scores) && r.state.scores.length === r.players.length ? [r.state.scores[winnerIndex], ...r.state.scores.filter((_, i) => i !== winnerIndex)].join(' - ') : '';
          const info = require('../games/registry').find((g) => g.key === r.game);
          require('../routes/acgist').postMatchWin(io, { userId: winner.id, game: r.game, name: (info && info.name) || r.game, score: sc, opponent: foes.map((p) => p.name).join(', ') });
        }
      } catch (e) { console.error('[gist win]', e.message); }
    }
    if (winner && !winner.bot && !practice && momentScore > 0) {
      // Keep the player's single best highlight reel (highest total clip score) for their profile badge.
      User.updateOne({ _id: winner.id, 'bestMoment.score': { $not: { $gte: momentScore } } },
        { $set: { bestMoment: { matchId: String(matchId), game: r.game, score: momentScore, at: new Date() } } }).catch(e => console.error('[bestMoment]', e.message));
    }
    if (r.ranked && r.players.length === 2 && r.players.every((p) => !p.bot)) applyRanked(r, winnerIndex, reason).catch((e) => console.error('[ranked]', e.message));
    if (r.tournament) {
      const wid = winnerIndex != null && !r.players[winnerIndex].bot ? r.players[winnerIndex].id : null;
      tournaments.onMatchResult(r.tournament, wid).catch((e) => console.error('[tournament]', e.message));
    }
    const xpGain = winnerIndex == null ? 8 : 20;
    if (!practice) r.players.forEach(p=>{ User.findByIdAndUpdate(p.id,{ $inc:{ xp:xpGain } }).catch(()=>{}); });
    // Win streaks (anti-exploit: only matches with 2+ human players count)
    if (!practice && r.players.filter(p => !p.bot).length >= 2) {
      r.players.forEach((p, i) => {
        if (p.bot || winnerIndex == null) return;
        const upd = winnerIndex === i
          ? [{ $set: { winStreak: { $add: [{ $ifNull: ['$winStreak', 0] }, 1] } } }, { $set: { bestStreak: { $max: [{ $ifNull: ['$bestStreak', 0] }, '$winStreak'] } } }]
          : { $set: { winStreak: 0 } };
        User.updateOne({ _id: p.id }, upd).catch(e => console.error('[streak]', e.message));
      });
    }
    // Persistent daily challenge progress (server-side only, per user per UTC day)
    if (!practice) try {
      const day = challenges.today();
      challenges.matchDeltas(r.players, winnerIndex).forEach(d => {
        ChallengeProgress.updateOne({ userId: d.userId, day },
          { $inc: { 'progress.play': d.play, 'progress.win': d.win } }, { upsert: true })
          .catch(e => console.error('[challenge]', e.message));
      });
    } catch (e) { console.error('[challenge]', e.message); }
    toAll(r, 'game:over', r.result);
    push(r);
  }

  function startForfeitTimer(r, i) {
    if (!r.forfeits) r.forfeits = new Map();
    if (r.forfeits.has(i)) return;
    const forfeitAt = Date.now() + FORFEIT_MS;
    const timer = setTimeout(() => { r.forfeits.delete(i); eliminatePlayer(r, i, 'forfeit'); }, FORFEIT_MS);
    r.forfeits.set(i, { timer, forfeitAt });
  }

  // Marks one player out of the current game (left, or forfeit timer fired)
  // without necessarily ending the match — with >2 players, the rest keep
  // playing. Ends the room if that was everyone, or finishes it if only one
  // connected, non-eliminated player is left.
  function eliminatePlayer(r, i, reason) {
    if (r.status !== 'playing' || r.players[i].out) return;
    r.players[i].out = true;
    clearForfeit(r, i);
    const eng = ENG[r.game];
    if (eng.markOut) r.state = eng.markOut(r.state, i);
    const remaining = r.players.filter((p) => !p.out && p.connected);
    if (remaining.length === 0 || !remaining.some((p) => !p.bot)) {
      // Nobody left, or only bots left playing each other — nothing to show anyone.
      clearAllForfeits(r); clearTimeout(r.turnTimer); clearTimeout(r.matchTimer); clearTimeout(r.botTimer);
      refundStakes(r);   // nobody finished the match, so nobody loses their stake
      rooms.delete(r.code); return;
    }
    if (remaining.length === 1) { finish(r, r.players.indexOf(remaining[0]), reason); return; }
    const res = eng.checkResult ? eng.checkResult(r.state) : { status: 'ongoing' };
    if (res.status !== 'ongoing') { finish(r, res.status === 'win' ? res.winnerIndex : null, reason); return; }
    armTurnTimer(r);
    pushAndBot(r);
  }

  function scheduleWaitingRoomCleanup(r) {
    if (r.reserved) return; // reserved rooms are cleaned up by their own no-show timer
    clearTimeout(r.waitingCleanupTimer);
    r.waitingCleanupTimer = setTimeout(() => {
      if (r.status === 'waiting' && !r.players.some((p) => p.connected)) rooms.delete(r.code);
    }, WAITING_ROOM_RETENTION_MS);
  }
  // Spectators aren't seated, so removeFromRoom() never sees them. Without this
  // they stay subscribed after leaving and keep receiving the old room's
  // updates (which then overwrite whatever room they open next).
  function stopSpectating(socket) {
    const code = socket.data.spectating;
    socket.data.spectating = null;
    const r = code && rooms.get(code);
    if (r && r.spectators && r.spectators.delete(socket.id)) push(r);
  }

  function removeFromRoom(socket, explicit) {
    const r = rooms.get(socket.data.code);
    socket.data.code = null;
    if (!r) return;
    const i = r.players.findIndex((p) => p.sid === socket.id);
    if (i === -1) return;
    r.players[i].connected = false; r.players[i].sid = null;
    if (r.status === 'waiting') {
      clearAllForfeits(r); clearTimeout(r.turnTimer); clearTimeout(r.matchTimer); clearTimeout(r.botTimer);
      scheduleWaitingRoomCleanup(r); push(r); return;
    }
    if (r.status === 'playing') {
      if (explicit) { eliminatePlayer(r, i, 'forfeit'); return; }
      startForfeitTimer(r, i);   // dropped connection — give them time to come back
      push(r);
      return;
    }
    if (!r.players.some((p) => p.connected)) { clearAllForfeits(r); clearTimeout(r.turnTimer); clearTimeout(r.matchTimer); clearTimeout(r.botTimer); rooms.delete(r.code); return; }
    push(r);
  }

  function attach(socket, r) {
    stopSpectating(socket);
    const u = socket.request.user, uid = String(u._id || u.id);
    if (socket.data.code && socket.data.code !== r.code) removeFromRoom(socket, true);
    clearTimeout(r.waitingCleanupTimer); r.waitingCleanupTimer = null;
    let i = r.players.findIndex((p) => p.id === uid);
    if (i === -1) {
      if (r.reserved && !r.reserved.includes(uid)) return false;   // private/tournament/ranked rooms: invited players only
      if (r.players.length >= r.maxPlayers) return false;
      r.players.push({ id: uid, name: u.displayName || u.name || 'Player', avatar: u.avatar || u.photo || u.picture || '', sid: null, connected: false, out: false });
      i = r.players.length - 1;
    }
    Object.assign(r.players[i], { sid: socket.id, connected: true });
    socket.data.code = r.code;
    if (r.status === 'playing') clearForfeit(r, i);
    if (r.status === 'waiting' && r.players.length === r.maxPlayers) beginMatch(r);
    push(r);
    return true;
  }

  function createRoom(socket, game, maxPlayers, vsBot, mode, difficulty, options) {
    const r = { code: newCode(), game, maxPlayers, difficulty: botlevels.pickLevel(difficulty), options: cleanOptions(game, options), status: 'waiting', mode: mode === 'ranked' ? 'ranked' : 'casual', ranked: mode === 'ranked', players: [], state: null, moves: [], forfeits: new Map(), rematch: new Set(), waitingCleanupTimer: null };
    rooms.set(r.code, r); attach(socket, r);
    if (vsBot) fillWithBots(r);
    return r;
  }

  // Initial state; Ludo accepts creator-chosen rule variants, other engines ignore options.
  const OPTION_GAMES = new Set(['ludo', 'rps', 'snakes', 'whot', 'joker', 'words']);
  const cleanOptions = (game, o) => (OPTION_GAMES.has(game) && ENG[game].cleanRules ? ENG[game].cleanRules(o) : null);
  const initState = (r) => (OPTION_GAMES.has(r.game) ? ENG[r.game].createInitialState(r.maxPlayers, r.options) : ENG[r.game].createInitialState(r.maxPlayers));
  // Server-created private room for specific players (tournament pairings, ranked matches).
  function createReservedRoom({ game, players, ranked = false, tournament = null }) {
    const r = { code: newCode(), game, maxPlayers: 2, difficulty: 'normal', status: 'waiting', mode: ranked ? 'ranked' : 'casual', ranked,
      reserved: players.map(String), tournament, players: [], state: null, moves: [], forfeits: new Map(), rematch: new Set(), waitingCleanupTimer: null };
    rooms.set(r.code, r);
    if (tournament) {
      r.noShowTimer = setTimeout(() => {
        if (rooms.get(r.code) !== r || r.status !== 'waiting') return;
        const here = r.players.filter((p) => p.connected);
        const winner = here.length === 1 ? here[0].id : r.reserved[0]; // nobody came: higher seed advances
        rooms.delete(r.code);
        tournaments.onMatchResult(tournament, winner).catch((e) => console.error('[tournament walkover]', e.message));
      }, NOSHOW_MS);
    }
    else {
      // Ranked pairing: if the opponent never shows, free the room.
      r.noShowTimer = setTimeout(() => { if (rooms.get(r.code) === r && r.status === 'waiting') rooms.delete(r.code); }, 90 * 1000);
    }
    return r;
  }
  hub.createMatchRoom = ({ id, round, slot, game, players }) => createReservedRoom({ game, players, tournament: { id, round, slot } }).code;
  hub.notify = (uid, ev, payload) => io.to('user:' + uid).emit(ev, payload);

  // ---- ranked matchmaking queue ----
  const queues = new Map(); // game -> [{ uid, rating, since, blocked:Set, name }]
  const inQueue = (uid) => { for (const [g, q] of queues) if (q.some((e) => e.uid === uid)) return g; return null; };
  const leaveQueue = (uid) => { for (const [g, q] of queues) queues.set(g, q.filter((e) => e.uid !== uid)); };
  setInterval(() => {
    const now = Date.now();
    for (const [game, q] of queues) {
      const used = new Set();
      for (const a of q) {
        if (used.has(a.uid)) continue;
        const b = q.find((x) => x.uid !== a.uid && !used.has(x.uid) && !a.blocked.has(x.uid) && !x.blocked.has(a.uid) && elo.canPair(a, x, now));
        if (!b) continue;
        used.add(a.uid); used.add(b.uid);
        const r = createReservedRoom({ game, players: [a.uid, b.uid], ranked: true });
        io.to('user:' + a.uid).emit('queue:matched', { code: r.code, game, opponent: { name: b.name, rating: b.rating } });
        io.to('user:' + b.uid).emit('queue:matched', { code: r.code, game, opponent: { name: a.name, rating: a.rating } });
      }
      queues.set(game, q.filter((e) => !used.has(e.uid)));
    }
  }, QUEUE_TICK_MS).unref();

  // Elo update for ranked 2-human matches (per-game rating + overall rating used for tiers).
  async function applyRanked(r, winnerIndex, reason) {
    const ids = r.players.map((p) => p.id);
    const users = await User.find({ _id: { $in: ids } }).select('rating gameRatings gameGames').lean();
    const get = (id) => users.find((u) => String(u._id) === String(id));
    const [ua, ub] = [get(ids[0]), get(ids[1])];
    if (!ua || !ub) return;
    const gr = (u) => (u.gameRatings && u.gameRatings[r.game]) || elo.START;
    const gg = (u) => (u.gameGames && u.gameGames[r.game]) || 0;
    const score = winnerIndex == null ? 0.5 : winnerIndex === 0 ? 1 : 0;
    const [da, db] = elo.eloDeltas(gr(ua), gr(ub), score, gg(ua), gg(ub));
    const deltas = [da, db];
    // Disconnect/forfeit penalty on top of the normal loss
    if (winnerIndex != null && (reason === 'forfeit' || reason === 'strikes')) deltas[1 - winnerIndex] -= 8;
    await Promise.all([ua, ub].map((u, i) => {
      const before = gr(u), after = Math.max(100, before + deltas[i]);
      io.to('user:' + ids[i]).emit('rating:update', { game: r.game, before, after, delta: after - before });
      return User.updateOne({ _id: ids[i] }, { $set: { ['gameRatings.' + r.game]: after }, $inc: { rating: after - before, ['gameGames.' + r.game]: 1 } });
    }));
  }

  io.on('connection', (socket) => {
    const uid = String(socket.request.user._id || socket.request.user.id);
    socket.data.code = null;
    presence.connect(uid);
    socket.join('user:' + uid);
    socket.on('disconnect', () => { presence.disconnect(uid); if (!presence.isOnline(uid)) leaveQueue(uid); });

    // guard = validate shape + rate limit + never crash the process
    const guard = (ev, max, ms, fn) => socket.on(ev, (payload, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      if (!allow(uid, ev, max, ms)) { socket.emit('error', { message: 'Slow down a little.' }); return ack({ ok: false, error: 'Slow down a little.' }); }
      try { fn(payload && typeof payload === 'object' ? payload : {}, ack); }
      catch (e) { console.error('[socket]', ev, e); ack({ ok: false, error: 'Server error' }); }
    });
    const myRoom = (code) => {
      const r = isCode(code) ? rooms.get(code) : null;
      const i = r ? r.players.findIndex((p) => p.sid === socket.id) : -1;
      return i === -1 ? [null, -1] : [r, i];
    };

    guard('room:spectate', 20, 60000, ({ code }, ack) => {
      const r = isCode(code) ? rooms.get(code) : null;
      if (!r) return ack({ok:false,error:'Room not found'});
      if (socket.data.code) removeFromRoom(socket, true);
      stopSpectating(socket);
      r.spectators = r.spectators || new Set(); r.spectators.add(socket.id); socket.data.spectating = r.code;
      socket.emit('room:spectator', { room: view(r, null) }); push(r); ack({ok:true, room:view(r,null)});
    });

    guard('room:create', 6, 60000, async ({ game, maxPlayers, vsBot, mode, difficulty, options }, ack) => { try {
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      if (!gameEnabled(game)) return ack({ ok: false, error: 'This game is currently disabled.' });
      if (mode === 'ranked' && vsBot) return ack({ ok: false, error: 'Ranked matches are against real players only.' });
      if (!vsBot) { const blocked = await stakeBlock(uid, game, null); if (blocked) return ack({ ok: false, error: blocked }); }
      const r = createRoom(socket, game, resolveMaxPlayers(game, maxPlayers), !!vsBot, mode, difficulty, mode === 'ranked' ? null : options);
      ack({ ok: true, room: view(r, 0) });
    } catch (e) { console.error('[room:create]', e.message); ack({ ok: false, error: 'Server error' }); } });

    guard('room:addBots', 10, 60000, ({ code }, ack) => {
      const [r, i] = myRoom(code);
      if (!r) return ack({ ok: false, error: 'Room not found' });
      if (r.status !== 'waiting') return ack({ ok: false, error: 'Room already started' });
      if (r.ranked) return ack({ ok: false, error: 'Bots are not allowed in ranked rooms.' });
      fillWithBots(r);
      ack({ ok: true, room: view(r, i) });
    });

    guard('room:join', 10, 60000, async ({ code }, ack) => { try {
      const r = isCode(code) ? rooms.get(code) : null;
      if (!r) return ack({ ok: false, error: 'Room not found' });
      if (r.status === 'waiting') { const blocked = await stakeBlock(uid, r.game, r); if (blocked) return ack({ ok: false, error: blocked }); }
      if (!attach(socket, r)) return ack({ ok: false, error: 'Room is full' });
      ack({ ok: true, room: view(r, r.players.findIndex((p) => p.id === uid)) });
    } catch (e) { console.error('[room:join]', e.message); ack({ ok: false, error: 'Server error' }); } });

    guard('room:quick', 6, 60000, async ({ game, maxPlayers, mode, beginner }, ack) => { try {
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      if (!gameEnabled(game)) return ack({ ok: false, error: 'This game is currently disabled.' });
      beginner = beginner === true;
      if (beginner) {   // Beginner queue: free matches, only for new players (first week or fewer than 10 games), never mixed with the regular queue
        const bu = await User.findById(uid).select('createdAt stats').lean();
        const isNew = bu && (Date.now() - new Date(bu.createdAt).getTime() < 7 * 864e5 || ((bu.stats && bu.stats.gamesPlayed) || 0) < 10);
        if (!isNew) return ack({ ok: false, error: 'The beginner queue is for new players. Use Quick match instead.' });
      } else { const blocked = await stakeBlock(uid, game, null); if (blocked) return ack({ ok: false, error: blocked }); }
      const mp = resolveMaxPlayers(game, maxPlayers);
      const open = [...rooms.values()].find((r) => r.game === game && r.maxPlayers === mp && r.status === 'waiting' && !r.reserved && !r.ranked && !!r.beginner === beginner
        && r.players.length < mp && !r.players.some((p) => p.id === uid));
      const r = open && attach(socket, open) ? open : createRoom(socket, game, mp, false, mode);
      if (beginner) r.beginner = true;
      ack({ ok: true, room: view(r, r.players.findIndex((p) => p.id === uid)) });
    } catch (e) { console.error('[room:quick]', e.message); ack({ ok: false, error: 'Server error' }); } });

    guard('rooms:list', 30, 60000, ({ game, maxPlayers } = {}, ack) => {
      const row = (r) => ({
        code: r.code, game: r.game, maxPlayers: r.maxPlayers, status: r.status === 'playing' ? 'playing' : 'waiting',
        spectators: r.spectators ? r.spectators.size : 0,
        players: r.players.map((p) => ({ name: p.name }))
      });
      const visible = (r) => !(r.reserved && r.status === 'waiting') && !(r.beginner && r.status === 'waiting');
      const isOpen = (r) => r.status === 'waiting' && r.players.length < r.maxPlayers;
      const isLive = (r) => r.status === 'playing' && r.players.some((p) => !p.bot && p.connected);
      if (!game) {
        // No game given: everything joinable or watchable right now, across every game.
        const all = [...rooms.values()].filter((r) => engineFor(r.game) && gameEnabled(r.game) && visible(r));
        const list = [...all.filter(isOpen), ...all.filter(isLive)].slice(0, 40).map(row);
        return ack({ ok: true, rooms: list });
      }
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      if (!gameEnabled(game)) return ack({ ok: false, error: 'This game is currently disabled.' });
      const mp = resolveMaxPlayers(game, maxPlayers);
      // Open seats first (joinable), then live matches (watch only).
      const same = [...rooms.values()].filter((r) => r.game === game && r.maxPlayers === mp && !(r.reserved && r.status === 'waiting'));
      const list = [...same.filter(isOpen), ...same.filter(isLive)].slice(0, 20).map(row);
      ack({ ok: true, rooms: list });
    });

    guard('queue:join', 6, 60000, async ({ game }, ack) => { try {
      if (!engineFor(game) || !gameEnabled(game)) return ack({ ok: false, error: 'This game is not available.' });
      if (!playerCountsFor(game).includes(2)) return ack({ ok: false, error: 'Ranked is for two-player games.' });
      if (inQueue(uid)) return ack({ ok: false, error: 'You are already searching.' });
      { const blocked = await stakeBlock(uid, game, null); if (blocked) return ack({ ok: false, error: blocked }); }
      const u = await User.findById(uid).select('rating gameRatings displayName').lean();
      const bl = await Friendship.find({ status: 'blocked', $or: [{ requester: uid }, { recipient: uid }] }).lean();
      const blocked = new Set(bl.map((x) => (x.requester === uid ? x.recipient : x.requester)));
      const rating = (u?.gameRatings && u.gameRatings[game]) || elo.START;
      if (!queues.has(game)) queues.set(game, []);
      queues.get(game).push({ uid, rating, since: Date.now(), blocked, name: u?.displayName || 'Player' });
      ack({ ok: true, rating });
    } catch (e) { console.error('[queue]', e.message); ack({ ok: false, error: 'Server error' }); } });
    guard('queue:leave', 20, 60000, (p, ack) => { leaveQueue(uid); ack({ ok: true }); });

    guard('chat:mute', 30, 60000, ({ code, index, on }, ack) => {
      const [r] = myRoom(code);
      if (!r || !Number.isInteger(index) || index < 0 || index >= r.players.length) return ack({ ok: false });
      if (!r.mutes) r.mutes = new Map();
      const set = r.mutes.get(uid) || new Set();
      if (on === false) set.delete(index); else set.add(index);
      r.mutes.set(uid, set);
      ack({ ok: true, muted: [...set] });
    });

    guard('room:leave', 10, 60000, () => { stopSpectating(socket); removeFromRoom(socket, true); });

    guard('game:move', 120, 60000, ({ code, move }) => {
      const [r, i] = myRoom(code);
      if (!r || r.status !== 'playing' || r.players[i].out) return;
      if (!r.players[i].connected) return;
      const e = ENG[r.game];
      if (!e.isValidMove(r.state, i, move)) return socket.emit('error', { message: r.game === 'words' ? 'Not a valid word for your rack — try another.' : 'That move isn’t allowed.' });
      applyValidatedMove(r, i, move);
    });

    guard('chat:emote', 20, 10000, ({ code, i }) => {
      const [r, from] = myRoom(code);
      if (!r || !Number.isInteger(i) || i < 0 || i >= EMOTE_COUNT) return;
      toAllChat(r, from, 'chat:emote', { from, name: r.players[from].name, i });
    });

    guard('chat:message', 20, 15000, ({ code, text, replyTo }) => {
      const [r, from] = myRoom(code);
      if (!r || typeof text !== 'string') return;
      let clean = text.trim().slice(0, 200);
      if (!clean) return;
      const last = r.players[from].lastChat;
      if (last && last.text === clean && Date.now() - last.at < 10000) return socket.emit('error', { message: 'Please do not repeat the same message.' });
      r.players[from].lastChat = { text: clean, at: Date.now() };
      clean = profanity.clean(clean);
      const msg = { from, name: r.players[from].name, text: clean, at: Date.now() };
      if (replyTo && typeof replyTo === 'object' && typeof replyTo.name === 'string' && typeof replyTo.text === 'string') {
        msg.replyTo = { name: replyTo.name.slice(0, 40), text: replyTo.text.slice(0, 200) };
      }
      toAllChat(r, from, 'chat:message', msg);
    });

    guard('chat:voice', 6, 60000, ({ code, audio, mime, duration }) => {
      const [r, from] = myRoom(code);
      if (!r || typeof audio !== 'string' || !/^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(audio) || audio.length > 700000) return;
      const safeMime = typeof mime === 'string' && /^audio\/[a-z0-9.+-]+$/i.test(mime) ? mime.slice(0, 80) : 'audio/webm';
      const msg = { type: 'voice', from, name: r.players[from].name, audio, mime: safeMime, duration: Math.min(30, Math.max(1, Number(duration) || 1)), at: Date.now() };
      toAllChat(r, from, 'chat:message', msg);
    });

    guard('game:rematch', 10, 60000, ({ code }) => {
      const [r, i] = myRoom(code);
      if (!r || r.tournament || r.status !== 'over' || r.players.length < r.maxPlayers || !r.players.every((p) => p.connected)) return;
      r.rematch.add(i);
      r.players.forEach((p, idx) => { if (p.bot) r.rematch.add(idx); }); // bots always agree to a rematch
      if (r.rematch.size === r.maxPlayers) beginMatch(r, true);   // charges a fresh stake when it is human vs human
      pushAndBot(r);
    });


    // Invite an accepted friend into the room you are in
    guard('invite:send', 6, 30000, async (p, ack) => { try {
      const to = String(p.to || ''), code = String(p.code || '').toUpperCase();
      const r = rooms.get(code);
      if (!r || !r.players.some(x => String(x.id) === uid)) return ack({ ok: false, error: 'You are not in that room.' });
      if (r.status !== 'waiting') return ack({ ok: false, error: 'That match already started.' });
      const ok = await Friendship.exists({ status: 'accepted', $or: [{ requester: uid, recipient: to }, { requester: to, recipient: uid }] });
      if (!ok) return ack({ ok: false, error: 'You can only invite friends.' });
      if (!presence.isOnline(to)) return ack({ ok: false, error: 'Your friend is offline.' });
      io.to('user:' + to).emit('invite:received', { from: { id: uid, name: socket.request.user.displayName || 'A friend' }, code, game: r.game });
      ack({ ok: true });
    } catch (e) { console.error('[invite]', e.message); ack({ ok: false, error: 'Server error' }); } });
    socket.on('disconnect', () => { const code=socket.data.spectating; const r=code&&rooms.get(code); if(r?.spectators) { r.spectators.delete(socket.id); push(r); } removeFromRoom(socket, false); });
  });
};
