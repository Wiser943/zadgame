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

const rooms = new Map();           // code -> room
const hits = new Map();            // rate-limit log: "userId:event" -> [timestamps]
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

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
    players: r.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, connected: p.connected, out: !!p.out })),
    state: r.state && ENG[r.game].publicState ? ENG[r.game].publicState(r.state, i) : r.state
  });
  const push = (r) => r.players.forEach((p, i) => p.sid && io.to(p.sid).emit('room:update', view(r, i)));
  const toAll = (r, ev, payload) => r.players.forEach((p) => p.sid && io.to(p.sid).emit(ev, payload));

  function clearForfeit(r, i) {
    const f = r.forfeits && r.forfeits.get(i);
    if (f) { clearTimeout(f.timer); r.forfeits.delete(i); }
  }
  function clearAllForfeits(r) {
    if (!r.forfeits) return;
    for (const f of r.forfeits.values()) clearTimeout(f.timer);
    r.forfeits.clear();
  }

  function finish(r, winnerIndex, reason) {
    if (r.status !== 'playing') return;
    clearAllForfeits(r);
    r.status = 'over'; r.rematch = new Set();
    r.result = { winnerIndex, status: winnerIndex == null ? 'draw' : 'win', reason: reason || 'normal' };
    r.players.forEach((p, i) => {
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
    const eng = ENG[r.game];
    if (eng.markOut) r.state = eng.markOut(r.state, i);
    const remaining = r.players.filter((p) => !p.out && p.connected);
    if (remaining.length === 0) { clearAllForfeits(r); rooms.delete(r.code); return; }
    if (remaining.length === 1) { finish(r, r.players.indexOf(remaining[0]), reason); return; }
    const res = eng.checkResult ? eng.checkResult(r.state) : { status: 'ongoing' };
    if (res.status !== 'ongoing') { finish(r, res.status === 'win' ? res.winnerIndex : null, reason); return; }
    push(r);
  }

  function removeFromRoom(socket, explicit) {
    const r = rooms.get(socket.data.code);
    socket.data.code = null;
    if (!r) return;
    const i = r.players.findIndex((p) => p.sid === socket.id);
    if (i === -1) return;
    r.players[i].connected = false; r.players[i].sid = null;
    if (r.status === 'waiting') { clearAllForfeits(r); rooms.delete(r.code); return; }
    if (r.status === 'playing') {
      if (explicit) { eliminatePlayer(r, i, 'forfeit'); return; }
      startForfeitTimer(r, i);   // dropped connection — give them time to come back
      push(r);
      return;
    }
    if (!r.players.some((p) => p.connected)) { clearAllForfeits(r); rooms.delete(r.code); return; }
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
    if (r.status === 'waiting' && r.players.length === r.maxPlayers) { r.status = 'playing'; r.state = ENG[r.game].createInitialState(r.maxPlayers); }
    push(r);
    return true;
  }

  function createRoom(socket, game, maxPlayers) {
    const r = { code: newCode(), game, maxPlayers, status: 'waiting', players: [], state: null, forfeits: new Map(), rematch: new Set() };
    rooms.set(r.code, r); attach(socket, r); return r;
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

    guard('room:create', 6, 60000, ({ game, maxPlayers }, ack) => {
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      const r = createRoom(socket, game, resolveMaxPlayers(game, maxPlayers));
      ack({ ok: true, room: view(r, 0) });
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
      r.state = e.applyMove(r.state, i, move);
      const res = e.checkResult(r.state);
      if (res.status === 'ongoing') return push(r);
      push(r); finish(r, res.status === 'win' ? res.winnerIndex : null, 'normal');
    });

    guard('chat:emote', 20, 10000, ({ code, i }) => {
      const [r, from] = myRoom(code);
      if (!r || !Number.isInteger(i) || i < 0 || i >= EMOTE_COUNT) return;
      toAll(r, 'chat:emote', { from, name: r.players[from].name, i });
    });

    guard('game:rematch', 10, 60000, ({ code }) => {
      const [r, i] = myRoom(code);
      if (!r || r.status !== 'over' || r.players.length < r.maxPlayers || !r.players.every((p) => p.connected)) return;
      r.rematch.add(i);
      if (r.rematch.size === r.maxPlayers) {
        r.rematch = new Set(); r.result = null; r.status = 'playing';
        r.players.forEach((p) => { p.out = false; });
        r.state = ENG[r.game].createInitialState(r.maxPlayers);
      }
      push(r);
    });

    socket.on('disconnect', () => removeFromRoom(socket, false));
  });
};
