/* Drive Race: the socket side. Rooms, quick race, and the messages a game screen sends. All race rules live in raceroom.js,
   the saved results in racestats.js. `initRace(io, opts)` takes optional test hooks: opts.now (a clock), opts.store (where results go), opts.timer = false (no interval). */
const { RaceRoom, MAX_PLAYERS } = require('./raceroom');
const stats = require('./racestats');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AUTO_START_MS = 20000, IDLE_MS = 30 * 60 * 1000, EMPTY_GRACE_MS = 60000;

module.exports = function initRace(io, opts = {}) {
  const clock = opts.now || Date.now;
  const store = opts.store === undefined ? stats.mongoStore() : opts.store;       // null = results are not saved
  const rooms = new Map();          // code -> RaceRoom
  const inRoom = new Map();         // user id -> code
  const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; };
  const make = (o) => {
    const code = newCode(), room = new RaceRoom(code, o, (to, ev, payload) => (to == null ? io.to('race:' + code).emit(ev, payload) : io.to('user:' + to).emit(ev, payload)));
    room.touched = clock(); room.emptyAt = 0; if (room.isPublic) room.autoAt = clock() + AUTO_START_MS;
    room.onResults = (res) => { if (!store) return; for (const e of stats.entriesFrom(res)) Promise.resolve(store.record(e, clock())).catch((err) => console.error('[race] could not save a result:', err.message)); };
    rooms.set(code, room); return room;
  };
  const drop = (code) => { const r = rooms.get(code); if (!r) return; for (const p of r.players) if (inRoom.get(p.id) === code) inRoom.delete(p.id); rooms.delete(code); };

  const tick = (now = clock()) => {
    for (const r of [...rooms.values()]) {
      try {
        r.tick(now);
        if (r.isPublic && r.status === 'lobby' && r.humans().length && (now >= r.autoAt || r.humans().length >= MAX_PLAYERS)) r.start(r.hostId, now);
        if (r.humans().length) r.emptyAt = 0;
        else { if (!r.emptyAt) r.emptyAt = now; if (r.status === 'lobby' || r.status === 'results' || now - r.emptyAt > EMPTY_GRACE_MS) drop(r.code); }   // a race in progress waits a minute for its players to come back
        if (now - r.touched > IDLE_MS) drop(r.code);
      } catch (e) { console.error('[race] tick failed:', e.message); drop(r.code); }
    }
  };
  if (opts.timer !== false) setInterval(() => tick(), 50).unref();

  io.on('connection', (socket) => {
    const u = socket.request.user, uid = String(u._id || u.id);
    const me = () => ({ id: uid, name: u.displayName || u.name || 'Player', avatar: u.avatar || u.photo || u.picture || '' });
    const room = () => rooms.get(inRoom.get(uid));
    const reply = (ack, o) => { if (typeof ack === 'function') ack(o); };
    const leave = () => {
      const code = inRoom.get(uid), r = rooms.get(code); inRoom.delete(uid);
      if (!r) return; socket.leave('race:' + code);
      const empty = r.leave(uid, clock());
      if (empty && (r.status === 'lobby' || r.status === 'results')) drop(code);
    };
    const enter = (r, ack) => {
      const j = r.join(me()); if (!j.ok) return reply(ack, j);
      inRoom.set(uid, r.code); socket.join('race:' + r.code); r.touched = clock(); r.emptyAt = 0;
      reply(ack, { ok: true, code: r.code, lobby: r.lobby(), status: r.status, back: !!j.back, you: uid });
      if (j.back) socket.emit('race:resume', r.resumeFor(uid, clock()));            // picking a race back up after a dropped connection
    };
    const guard = (ev, max, ms, fn) => { let hits = []; socket.on(ev, (payload, ack) => { const now = clock(); hits = hits.filter((t) => now - t < ms); if (hits.length >= max) return reply(ack, { ok: false, error: 'Slow down a little.' }); hits.push(now); try { fn(payload || {}, ack); } catch (e) { console.error('[race]', ev, e.message); reply(ack, { ok: false, error: 'Something went wrong.' }); } }); };

    guard('race:create', 6, 60000, ({ laps, grid, level, track, isPublic }, ack) => { leave(); enter(make({ laps, grid, level, track, isPublic: !!isPublic }), ack); });
    guard('race:join', 12, 60000, ({ code }, ack) => {
      const r = rooms.get(String(code || '').toUpperCase().trim()); if (!r) return reply(ack, { ok: false, error: 'No race with that code.' });
      if (inRoom.get(uid) !== r.code) leave(); enter(r, ack);
    });
    guard('race:quick', 8, 60000, (p, ack) => {
      leave();
      const open = [...rooms.values()].filter((r) => r.isPublic && r.status === 'lobby' && r.players.length < MAX_PLAYERS).sort((a, b) => b.players.length - a.players.length)[0];
      enter(open || make({ isPublic: true, laps: 3, grid: 8 }), ack);
    });
    guard('race:leave', 12, 60000, (p, ack) => { leave(); reply(ack, { ok: true }); });
    guard('race:style', 20, 10000, (p) => { const r = room(); if (r) r.setStyle(uid, p); });
    guard('race:options', 20, 10000, (p) => { const r = room(); if (r) r.setOptions(uid, p); });
    guard('race:start', 10, 30000, (p, ack) => { const r = room(); if (!r) return reply(ack, { ok: false, error: 'You are not in a race.' }); r.touched = clock(); reply(ack, r.start(uid, clock())); });
    guard('race:again', 10, 30000, () => { const r = room(); if (r) r.again(uid); });
    guard('race:board', 20, 60000, async (p, ack) => {
      if (!store) return reply(ack, { ok: false, error: 'The leaderboard is not available right now.' });
      try { reply(ack, Object.assign({ ok: true }, await store.board(uid, clock()))); } catch (e) { console.error('[race] board failed:', e.message); reply(ack, { ok: false, error: 'The leaderboard is not available right now.' }); }
    });
    // in-race messages: no ack, and a kart that sends too fast is simply ignored
    let lastPose = 0;
    socket.on('race:pose', (m) => { const now = clock(); if (now - lastPose < 30) return; lastPose = now; const r = room(); if (r) r.pose(uid, m, now); });
    let boxHits = []; socket.on('race:box', (m) => { const now = clock(); boxHits = boxHits.filter((t) => now - t < 3000); if (boxHits.length > 8) return; boxHits.push(now); const r = room(); if (r) r.pickBox(uid, m && m.id, now); });
    let useHits = []; socket.on('race:use', (m) => { const now = clock(); useHits = useHits.filter((t) => now - t < 2000); if (useHits.length > 4) return; useHits.push(now); const r = room(); if (r) r.useItem(uid, now, m && m.slot); });
    socket.on('disconnect', () => { setTimeout(() => { if (!io.sockets.adapter.rooms.get('user:' + uid)) leave(); }, opts.disconnectGraceMs == null ? 1500 : opts.disconnectGraceMs); });   // a quick reconnect (or a second tab) keeps the seat
  });
  return { rooms, inRoom, tick };
};
