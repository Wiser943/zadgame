// Real-time layer: rooms, moves, forfeit timers, quick match, rematch, emotes, rate limits.
// Rooms live in memory (single Node process). Engines come from ../games (see README).
// Room size is variable: most games are 2-player, but a game can offer more
// than one size via registry.js's `playerCounts` (e.g. Ludo: 2 or 4) — the
// creator picks one when the room is made, and it's stored as r.maxPlayers.
const passport = require('passport');
const games = require('../games');
const REGISTRY = require('../games/registry');
const User = require('../models/User');

const ENG = games.ENGINES || games;
const FORFEIT_MS = 75 * 1000;      // disconnect this long => that player forfeits
const WIN_COINS = 10;
const EMOTE_COUNT = 8;             // keep in sync with EMOTES in public/index.html

// ---- Ludo-only: per-turn clock, strikes, and a whole-match countdown ----
const LUDO_TURN_MS = 15 * 1000;                 // roll or move within this long, or take a strike
const LUDO_STRIKE_LIMIT = 3;                    // 3 strikes = removed from the room
const LUDO_STRIKE_FORFEIT_COINS = 15;           // coins lost when removed for strikes
const LUDO_MATCH_MS = { 2: 4 * 60 * 1000, 4: 8 * 60 * 1000 }; // match clock by room size

const rooms = new Map();           // code -> room
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
const playerCountsFor = (game) => REGISTRY.find((g) => g.key === game)?.playerCounts || [2];
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

module.exports = function initSockets(io, sessionMiddleware) {
  io.engine.use(sessionMiddleware);
  io.engine.use(passport.initialize());
  io.engine.use(passport.session());
  io.use((socket, next) => (socket.request.user ? next() : next(new Error('unauthorized'))));

  const view = (r, i) => ({
    code: r.code, game: r.game, status: r.status, you: i, maxPlayers: r.maxPlayers,
    // playerIndex -> ms-epoch they forfeit at, for anyone currently disconnected-but-not-yet-eliminated
    forfeits: r.forfeits ? Object.fromEntries([...r.forfeits].map(([idx, f]) => [idx, f.forfeitAt])) : {},
    result: r.result || null,
    rematch: r.rematch ? [...r.rematch] : [],
    round: r.round || 0,
    strikes: r.strikes || [],
    turnDeadline: r.turnDeadline || null,
    matchDeadline: r.matchDeadline || null,
    players: r.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, connected: p.connected, out: !!p.out, bot: !!p.bot })),
    state: r.state && ENG[r.game].publicState ? ENG[r.game].publicState(r.state, i) : r.state
  });
  const push = (r) => r.players.forEach((p, i) => p.sid && io.to(p.sid).emit('room:update', view(r, i)));
  const toAll = (r, ev, payload) => r.players.forEach((p) => p.sid && io.to(p.sid).emit(ev, payload));

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
    if (r.players.length === r.maxPlayers) {
      r.status = 'playing'; r.state = ENG[r.game].createInitialState(r.maxPlayers);
      r.round = (r.round || 0) + 1;
      r.strikes = Array(r.maxPlayers).fill(0);
      armTurnTimer(r); armMatchTimer(r);
    }
    pushAndBot(r);
  }

  // Applies a move that's already been checked with isValidMove — shared by
  // the real game:move handler and bot moves so both go through identical
  // logic (events, win/draw detection, re-arming the ludo turn clock).
  function applyValidatedMove(r, i, move) {
    const e = ENG[r.game];
    r.state = e.applyMove(r.state, i, move);

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
    if (res.status === 'ongoing') { pushAndBot(r); if (r.game === 'ludo') armTurnTimer(r); return; }
    push(r); finish(r, res.status === 'win' ? res.winnerIndex : null, 'normal');
  }

  // Returns the indices of bot players who should act right now. Most games
  // are turn-based (one index); RPS has simultaneous picks, so any bot that
  // hasn't chosen yet for the current round should act.
  function botsToAct(r) {
    if (r.status !== 'playing' || !r.state) return [];
    if (r.game === 'rps') {
      if (r.state.scores[0] >= 3 || r.state.scores[1] >= 3) return [];
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
    const move = eng.botMove(r.state, i);
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

  // ---- Ludo turn clock + match clock ----
  function armTurnTimer(r) {
    clearTimeout(r.turnTimer); r.turnTimer = null; r.turnDeadline = null;
    if (r.game !== 'ludo' || r.status !== 'playing') return;
    r.turnDeadline = Date.now() + LUDO_TURN_MS;
    r.turnTimer = setTimeout(() => turnTimeout(r), LUDO_TURN_MS);
  }
  function turnTimeout(r) {
    if (r.status !== 'playing') return;
    const i = r.state.turn;
    if (!r.strikes) r.strikes = Array(r.maxPlayers).fill(0);
    r.strikes[i] = (r.strikes[i] || 0) + 1;
    toAll(r, 'game:event', { type: 'timeout', player: i, strikes: r.strikes[i] });
    if (r.strikes[i] >= LUDO_STRIKE_LIMIT) {
      if (!r.players[i].bot) User.updateOne({ _id: r.players[i].id }, { $inc: { coins: -LUDO_STRIKE_FORFEIT_COINS } }).catch((e) => console.error('[coins]', e.message));
      toAll(r, 'game:event', { type: 'strikeout', player: i, coinsLost: LUDO_STRIKE_FORFEIT_COINS });
      eliminatePlayer(r, i, 'strikes'); // re-arms the turn timer itself if the match continues
      return;
    }
    r.state = ENG[r.game].forcePass(r.state);
    pushAndBot(r);
    armTurnTimer(r);
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

  function finish(r, winnerIndex, reason) {
    if (r.status !== 'playing') return;
    clearAllForfeits(r);
    clearTimeout(r.turnTimer); r.turnTimer = null; r.turnDeadline = null;
    clearTimeout(r.matchTimer); r.matchTimer = null; r.matchDeadline = null;
    clearTimeout(r.botTimer); r.botTimer = null;
    r.status = 'over'; r.rematch = new Set();
    r.result = { winnerIndex, status: winnerIndex == null ? 'draw' : 'win', reason: reason || 'normal' };
    r.players.forEach((p, i) => {
      if (p.bot) return; // bots have no User document — nothing to update
      const won = winnerIndex === i, draw = winnerIndex == null;
      User.updateOne({ _id: p.id }, { $inc: {
        coins: won ? WIN_COINS : 0, 'stats.gamesPlayed': 1, 'stats.wins': won ? 1 : 0,
        'stats.losses': !won && !draw ? 1 : 0, 'stats.draws': draw ? 1 : 0
      } }).catch((e) => console.error('[stats]', e.message));
    });
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
    if (r.game === 'ludo' && reason === 'forfeit') {
      if (!r.players[i].bot) User.updateOne({ _id: r.players[i].id }, { $inc: { coins: -LUDO_STRIKE_FORFEIT_COINS } }).catch((e) => console.error('[coins]', e.message));
    }
    const eng = ENG[r.game];
    if (eng.markOut) r.state = eng.markOut(r.state, i);
    const remaining = r.players.filter((p) => !p.out && p.connected);
    if (remaining.length === 0 || !remaining.some((p) => !p.bot)) {
      // Nobody left, or only bots left playing each other — nothing to show anyone.
      clearAllForfeits(r); clearTimeout(r.turnTimer); clearTimeout(r.matchTimer); clearTimeout(r.botTimer);
      rooms.delete(r.code); return;
    }
    if (remaining.length === 1) { finish(r, r.players.indexOf(remaining[0]), reason); return; }
    const res = eng.checkResult ? eng.checkResult(r.state) : { status: 'ongoing' };
    if (res.status !== 'ongoing') { finish(r, res.status === 'win' ? res.winnerIndex : null, reason); return; }
    pushAndBot(r);
    if (r.game === 'ludo') armTurnTimer(r);
  }

  function removeFromRoom(socket, explicit) {
    const r = rooms.get(socket.data.code);
    socket.data.code = null;
    if (!r) return;
    const i = r.players.findIndex((p) => p.sid === socket.id);
    if (i === -1) return;
    r.players[i].connected = false; r.players[i].sid = null;
    if (r.status === 'waiting') { clearAllForfeits(r); clearTimeout(r.turnTimer); clearTimeout(r.matchTimer); clearTimeout(r.botTimer); rooms.delete(r.code); return; }
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
    const u = socket.request.user, uid = String(u._id || u.id);
    if (socket.data.code && socket.data.code !== r.code) removeFromRoom(socket, true);
    let i = r.players.findIndex((p) => p.id === uid);
    if (i === -1) {
      if (r.players.length >= r.maxPlayers) return false;
      r.players.push({ id: uid, name: u.displayName || u.name || 'Player', avatar: u.avatar || u.photo || u.picture || '', sid: null, connected: false, out: false });
      i = r.players.length - 1;
    }
    Object.assign(r.players[i], { sid: socket.id, connected: true });
    socket.data.code = r.code;
    if (r.status === 'playing') clearForfeit(r, i);
    if (r.status === 'waiting' && r.players.length === r.maxPlayers) {
      r.status = 'playing'; r.state = ENG[r.game].createInitialState(r.maxPlayers);
      r.round = (r.round || 0) + 1;
      r.strikes = Array(r.maxPlayers).fill(0);
      armTurnTimer(r); armMatchTimer(r);
    }
    push(r);
    return true;
  }

  function createRoom(socket, game, maxPlayers, vsBot) {
    const r = { code: newCode(), game, maxPlayers, status: 'waiting', players: [], state: null, forfeits: new Map(), rematch: new Set() };
    rooms.set(r.code, r); attach(socket, r);
    if (vsBot) fillWithBots(r);
    return r;
  }

  io.on('connection', (socket) => {
    const uid = String(socket.request.user._id || socket.request.user.id);
    socket.data.code = null;

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

    guard('room:create', 6, 60000, ({ game, maxPlayers, vsBot }, ack) => {
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      const r = createRoom(socket, game, resolveMaxPlayers(game, maxPlayers), !!vsBot);
      ack({ ok: true, room: view(r, 0) });
    });

    guard('room:addBots', 10, 60000, ({ code }, ack) => {
      const [r, i] = myRoom(code);
      if (!r) return ack({ ok: false, error: 'Room not found' });
      if (r.status !== 'waiting') return ack({ ok: false, error: 'Room already started' });
      fillWithBots(r);
      ack({ ok: true, room: view(r, i) });
    });

    guard('room:join', 10, 60000, ({ code }, ack) => {
      const r = isCode(code) ? rooms.get(code) : null;
      if (!r) return ack({ ok: false, error: 'Room not found' });
      if (!attach(socket, r)) return ack({ ok: false, error: 'Room is full' });
      ack({ ok: true, room: view(r, r.players.findIndex((p) => p.id === uid)) });
    });

    guard('room:quick', 6, 60000, ({ game, maxPlayers }, ack) => {
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      const mp = resolveMaxPlayers(game, maxPlayers);
      const open = [...rooms.values()].find((r) => r.game === game && r.maxPlayers === mp && r.status === 'waiting'
        && r.players.length < mp && !r.players.some((p) => p.id === uid));
      const r = open && attach(socket, open) ? open : createRoom(socket, game, mp);
      ack({ ok: true, room: view(r, r.players.findIndex((p) => p.id === uid)) });
    });

    guard('rooms:list', 30, 60000, ({ game, maxPlayers }, ack) => {
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      const mp = resolveMaxPlayers(game, maxPlayers);
      const list = [...rooms.values()].filter((r) => r.game === game && r.maxPlayers === mp && r.status === 'waiting' && r.players.length < mp)
        .slice(0, 20).map((r) => ({ code: r.code, maxPlayers: r.maxPlayers, players: r.players.map((p) => ({ name: p.name })) }));
      ack({ ok: true, rooms: list });
    });

    guard('room:leave', 10, 60000, () => removeFromRoom(socket, true));

    guard('game:move', 120, 60000, ({ code, move }) => {
      const [r, i] = myRoom(code);
      if (!r || r.status !== 'playing' || r.players[i].out) return;
      if (!r.players.every((p) => p.out || p.connected)) return;
      const e = ENG[r.game];
      if (!e.isValidMove(r.state, i, move)) return socket.emit('error', { message: 'That move isn’t allowed.' });
      applyValidatedMove(r, i, move);
    });

    guard('chat:emote', 20, 10000, ({ code, i }) => {
      const [r, from] = myRoom(code);
      if (!r || !Number.isInteger(i) || i < 0 || i >= EMOTE_COUNT) return;
      toAll(r, 'chat:emote', { from, name: r.players[from].name, i });
    });

    guard('chat:message', 20, 15000, ({ code, text, replyTo }) => {
      const [r, from] = myRoom(code);
      if (!r || typeof text !== 'string') return;
      const clean = text.trim().slice(0, 200);
      if (!clean) return;
      const msg = { from, name: r.players[from].name, text: clean, at: Date.now() };
      if (replyTo && typeof replyTo === 'object' && typeof replyTo.name === 'string' && typeof replyTo.text === 'string') {
        msg.replyTo = { name: replyTo.name.slice(0, 40), text: replyTo.text.slice(0, 200) };
      }
      toAll(r, 'chat:message', msg);
    });

    guard('game:rematch', 10, 60000, ({ code }) => {
      const [r, i] = myRoom(code);
      if (!r || r.status !== 'over' || r.players.length < r.maxPlayers || !r.players.every((p) => p.connected)) return;
      r.rematch.add(i);
      r.players.forEach((p, idx) => { if (p.bot) r.rematch.add(idx); }); // bots always agree to a rematch
      if (r.rematch.size === r.maxPlayers) {
        r.rematch = new Set(); r.result = null; r.status = 'playing';
        r.players.forEach((p) => { p.out = false; });
        r.state = ENG[r.game].createInitialState(r.maxPlayers);
        r.round = (r.round || 0) + 1;
        r.strikes = Array(r.maxPlayers).fill(0);
        armTurnTimer(r); armMatchTimer(r);
      }
      pushAndBot(r);
    });

    socket.on('disconnect', () => removeFromRoom(socket, false));
  });
};
