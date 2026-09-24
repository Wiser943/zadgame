// Real-time layer: rooms, moves, forfeit timer, quick match, rematch, emotes, rate limits.
// Rooms live in memory (single Node process). Engines come from ../games (see README).
const passport = require('passport');
const games = require('../games');
const User = require('../models/User');

const ENG = games.ENGINES || games;
const FORFEIT_MS = 75 * 1000;      // disconnect this long => auto-forfeit
const WIN_COINS = 10;
const EMOTE_COUNT = 8;             // keep in sync with EMOTES in public/index.html

const rooms = new Map();           // code -> room
const hits = new Map();            // rate-limit log: "userId:event" -> [timestamps]
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

const engineFor = (g) => (typeof g === 'string' && Object.prototype.hasOwnProperty.call(ENG, g) && ENG[g]) || null;
const isCode = (c) => typeof c === 'string' && /^[A-Z0-9]{4,8}$/.test(c);

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
    code: r.code, game: r.game, status: r.status, you: i,
    forfeitAt: r.forfeitAt || null, result: r.result || null,
    rematch: r.rematch ? [...r.rematch] : [],
    players: r.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, connected: p.connected })),
    state: r.state && ENG[r.game].publicState ? ENG[r.game].publicState(r.state, i) : r.state
  });
  const push = (r) => r.players.forEach((p, i) => p.sid && io.to(p.sid).emit('room:update', view(r, i)));
  const toAll = (r, ev, payload) => r.players.forEach((p) => p.sid && io.to(p.sid).emit(ev, payload));

  function finish(r, winnerIndex, reason) {
    if (r.status !== 'playing') return;
    clearTimeout(r.timer); r.forfeitAt = null;
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

  function startForfeitTimer(r) {
    if (r.timer) return;
    r.forfeitAt = Date.now() + FORFEIT_MS;
    r.timer = setTimeout(() => {
      r.timer = null;
      if (r.status !== 'playing') return;
      const w = r.players.findIndex((p) => p.connected);
      if (w === -1) rooms.delete(r.code); else finish(r, w, 'forfeit');
    }, FORFEIT_MS);
  }

  function removeFromRoom(socket, explicit) {
    const r = rooms.get(socket.data.code);
    socket.data.code = null;
    if (!r) return;
    const i = r.players.findIndex((p) => p.sid === socket.id);
    if (i === -1) return;
    r.players[i].connected = false; r.players[i].sid = null;
    if (r.status === 'waiting') { rooms.delete(r.code); return; }
    if (r.status === 'playing') {
      const other = r.players.findIndex((p, j) => j !== i && p.connected);
      if (explicit && other !== -1) return finish(r, other, 'forfeit');   // left on purpose
      if (other === -1) { clearTimeout(r.timer); return rooms.delete(r.code); }
      startForfeitTimer(r);                                                // dropped connection
    } else if (!r.players.some((p) => p.connected)) { return rooms.delete(r.code); }
    push(r);
  }

  function attach(socket, r) {
    const u = socket.request.user, uid = String(u._id || u.id);
    if (socket.data.code && socket.data.code !== r.code) removeFromRoom(socket, true);
    let i = r.players.findIndex((p) => p.id === uid);
    if (i === -1) {
      if (r.players.length >= 2) return false;
      r.players.push({ id: uid, name: u.displayName || u.name || 'Player', avatar: u.avatar || u.photo || u.picture || '', sid: null, connected: false });
      i = r.players.length - 1;
    }
    Object.assign(r.players[i], { sid: socket.id, connected: true });
    socket.data.code = r.code;
    if (r.status === 'playing' && r.players.every((p) => p.connected)) { clearTimeout(r.timer); r.timer = null; r.forfeitAt = null; }
    if (r.status === 'waiting' && r.players.length === 2) { r.status = 'playing'; r.state = ENG[r.game].createInitialState(); }
    push(r);
    return true;
  }

  function createRoom(socket, game) {
    const r = { code: newCode(), game, status: 'waiting', players: [], state: null, timer: null, rematch: new Set() };
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

    guard('room:create', 6, 60000, ({ game }, ack) => {
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      const r = createRoom(socket, game); ack({ ok: true, room: view(r, 0) });
    });

    guard('room:join', 10, 60000, ({ code }, ack) => {
      const r = isCode(code) ? rooms.get(code) : null;
      if (!r) return ack({ ok: false, error: 'Room not found' });
      if (!attach(socket, r)) return ack({ ok: false, error: 'Room is full' });
      ack({ ok: true, room: view(r, r.players.findIndex((p) => p.id === uid)) });
    });

    guard('room:quick', 6, 60000, ({ game }, ack) => {
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      const open = [...rooms.values()].find((r) => r.game === game && r.status === 'waiting' && r.players.length === 1 && r.players[0].id !== uid);
      const r = open && attach(socket, open) ? open : createRoom(socket, game);
      ack({ ok: true, room: view(r, r.players.findIndex((p) => p.id === uid)) });
    });

    guard('rooms:list', 30, 60000, ({ game }, ack) => {
      if (!engineFor(game)) return ack({ ok: false, error: 'Unknown game' });
      const list = [...rooms.values()].filter((r) => r.game === game && r.status === 'waiting' && r.players.length === 1)
        .slice(0, 20).map((r) => ({ code: r.code, players: [{ name: r.players[0].name }] }));
      ack({ ok: true, rooms: list });
    });

    guard('room:leave', 10, 60000, () => removeFromRoom(socket, true));

    guard('game:move', 120, 60000, ({ code, move }) => {
      const [r, i] = myRoom(code);
      if (!r || r.status !== 'playing' || !r.players.every((p) => p.connected)) return;
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
      if (!r || r.status !== 'over' || r.players.length < 2 || !r.players.every((p) => p.connected)) return;
      r.rematch.add(i);
      if (r.rematch.size === 2) {
        r.rematch = new Set(); r.result = null; r.status = 'playing';
        r.state = ENG[r.game].createInitialState();
      }
      push(r);
    });

    socket.on('disconnect', () => removeFromRoom(socket, false));
  });
};
