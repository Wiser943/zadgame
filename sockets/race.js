/* Drive Race: the socket side. Rooms, quick race, and the messages a game screen sends. All race rules live in raceroom.js. */
const { RaceRoom, MAX_PLAYERS } = require('./raceroom');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AUTO_START_MS = 20000, IDLE_MS = 30 * 60 * 1000;

module.exports = function initRace(io) {
  const rooms = new Map();          // code -> RaceRoom
  const inRoom = new Map();         // user id -> code
  const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; };
  const make = (opts) => {
    const code = newCode(), room = new RaceRoom(code, opts, (to, ev, payload) => (to == null ? io.to('race:' + code).emit(ev, payload) : io.to('user:' + to).emit(ev, payload)));
    room.touched = Date.now(); if (room.isPublic) room.autoAt = Date.now() + AUTO_START_MS;
    rooms.set(code, room); return room;
  };
  const drop = (code) => { const r = rooms.get(code); if (!r) return; for (const p of r.players) if (inRoom.get(p.id) === code) inRoom.delete(p.id); rooms.delete(code); };

  setInterval(() => {
    const now = Date.now();
    for (const r of [...rooms.values()]) {
      try {
        r.tick(now);
        if (r.isPublic && r.status === 'lobby' && r.humans().length && (now >= r.autoAt || r.humans().length >= MAX_PLAYERS)) r.start(r.hostId, now);
        if (!r.humans().length || now - r.touched > IDLE_MS) drop(r.code);
      } catch (e) { console.error('[race] tick failed:', e.message); drop(r.code); }
    }
  }, 50).unref();

  io.on('connection', (socket) => {
    const u = socket.request.user, uid = String(u._id || u.id);
    const me = () => ({ id: uid, name: u.displayName || u.name || 'Player', avatar: u.avatar || u.photo || u.picture || '' });
    const room = () => rooms.get(inRoom.get(uid));
    const reply = (ack, o) => { if (typeof ack === 'function') ack(o); };
    const leave = () => {
      const code = inRoom.get(uid), r = rooms.get(code); inRoom.delete(uid);
      if (!r) return; socket.leave('race:' + code);
      if (r.leave(uid, Date.now())) drop(code);
    };
    const enter = (r, ack) => {
      const j = r.join(me()); if (!j.ok) return reply(ack, j);
      inRoom.set(uid, r.code); socket.join('race:' + r.code); r.touched = Date.now();
      reply(ack, { ok: true, code: r.code, lobby: r.lobby(), status: r.status, back: !!j.back, you: uid });
    };
    const guard = (ev, max, ms, fn) => { let hits = []; socket.on(ev, (payload, ack) => { const now = Date.now(); hits = hits.filter((t) => now - t < ms); if (hits.length >= max) return reply(ack, { ok: false, error: 'Slow down a little.' }); hits.push(now); try { fn(payload || {}, ack); } catch (e) { console.error('[race]', ev, e.message); reply(ack, { ok: false, error: 'Something went wrong.' }); } }); };

    guard('race:create', 6, 60000, ({ laps, grid, isPublic }, ack) => { leave(); enter(make({ laps, grid, isPublic: !!isPublic }), ack); });
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
    guard('race:start', 10, 30000, (p, ack) => { const r = room(); if (!r) return reply(ack, { ok: false, error: 'You are not in a race.' }); r.touched = Date.now(); reply(ack, r.start(uid, Date.now())); });
    guard('race:again', 10, 30000, () => { const r = room(); if (r) r.again(uid); });
    // in-race messages: no ack, and a kart that sends too fast is simply ignored
    let lastPose = 0;
    socket.on('race:pose', (m) => { const now = Date.now(); if (now - lastPose < 30) return; lastPose = now; const r = room(); if (r) r.pose(uid, m, now); });
    let boxHits = []; socket.on('race:box', (m) => { const now = Date.now(); boxHits = boxHits.filter((t) => now - t < 3000); if (boxHits.length > 8) return; boxHits.push(now); const r = room(); if (r) r.pickBox(uid, m && m.id, now); });
    let useHits = []; socket.on('race:use', () => { const now = Date.now(); useHits = useHits.filter((t) => now - t < 2000); if (useHits.length > 4) return; useHits.push(now); const r = room(); if (r) r.useItem(uid, now); });
    socket.on('disconnect', () => { setTimeout(() => { if (!io.sockets.adapter.rooms.get('user:' + uid)) leave(); }, 1500); });   // a quick reconnect (or a second tab) keeps the seat
  });
};
