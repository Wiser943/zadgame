const test = require('node:test');
const assert = require('node:assert');
const initRace = require('../sockets/race');
const stats = require('../sockets/racestats');
const { T } = require('../sockets/raceroom');

/* a small stand-in for socket.io: rooms, ack calls, and a log of what each socket received */
class FakeSocket {
  constructor(io, user) { this.io = io; this.request = { user }; this.h = {}; this.got = []; io.sockets.sockets.add(this); }
  join(r) { const m = this.io.sockets.adapter.rooms; if (!m.has(r)) m.set(r, new Set()); m.get(r).add(this); }
  leave(r) { const m = this.io.sockets.adapter.rooms.get(r); if (m) { m.delete(this); if (!m.size) this.io.sockets.adapter.rooms.delete(r); } }
  on(ev, fn) { this.h[ev] = fn; }
  emit(ev, p) { this.got.push([ev, p]); }                                   // the server talking straight to this socket
  call(ev, payload) { return new Promise((res) => { if (!this.h[ev]) return res(undefined); this.h[ev](payload, res); }); }
  fire(ev, payload) { if (this.h[ev]) this.h[ev](payload); }
  events(name) { return this.got.filter(([e]) => e === name).map(([, p]) => p); }
  disconnect() { for (const [r] of [...this.io.sockets.adapter.rooms]) this.leave(r); this.io.sockets.sockets.delete(this); this.h.disconnect && this.h.disconnect(); }
}
class FakeIO {
  constructor() { this.sockets = { adapter: { rooms: new Map() }, sockets: new Set() }; this.conn = []; }
  on(ev, fn) { if (ev === 'connection') this.conn.push(fn); }
  to(room) { return { emit: (ev, p) => { for (const s of this.sockets.adapter.rooms.get(room) || []) s.got.push([ev, JSON.parse(JSON.stringify(p))]); } }; }
  connect(user) { const s = new FakeSocket(this, user); s.join('user:' + String(user._id)); this.conn.forEach((fn) => fn(s)); return s; }
}
function setup(extra = {}) {
  const io = new FakeIO(), clock = { now: 1e6 }, store = stats.memoryStore();
  const race = initRace(io, Object.assign({ now: () => clock.now, timer: false, store, disconnectGraceMs: 0 }, extra));
  return { io, clock, store, race, user: (n) => io.connect({ _id: 'u' + n, displayName: 'Player' + n }) };
}
const advance = (ctx, ms, step = 50) => { for (let t = 0; t < ms; t += step) { ctx.clock.now += step; ctx.race.tick(ctx.clock.now); } };

test('quick race: two players land in the same public room, and it starts by itself after 20 seconds', async () => {
  const c = setup(); const a = c.user(1), b = c.user(2);
  const ra = await a.call('race:quick', {}), rb = await b.call('race:quick', {});
  assert.ok(ra.ok && rb.ok); assert.strictEqual(ra.code, rb.code); assert.strictEqual(ra.you, 'u1');
  assert.strictEqual(rb.lobby.players.length, 2);
  advance(c, 19000); assert.strictEqual(a.events('race:countdown').length, 0, 'not yet');
  advance(c, 2000);
  const cd = a.events('race:countdown')[0]; assert.ok(cd, 'the countdown started'); assert.strictEqual(cd.players.length, 8, 'bots filled the grid to 8');
  assert.ok(b.events('race:countdown').length === 1);
});

test('create a room, join with the code, wrong code and full room are refused', async () => {
  const c = setup(); const host = c.user(1);
  const r = await host.call('race:create', { laps: 2, grid: 6 }); assert.ok(r.ok); assert.strictEqual(r.lobby.laps, 2);
  assert.strictEqual((await c.user(2).call('race:join', { code: 'zzzz' })).ok, false);
  for (let i = 2; i <= 10; i++) assert.ok((await c.user(i).call('race:join', { code: r.code.toLowerCase() })).ok, 'player ' + i + ' joins');
  const late = await c.user(11).call('race:join', { code: r.code }); assert.strictEqual(late.ok, false); assert.match(late.error, /full/);
});

test('only the host can start; the others see the countdown', async () => {
  const c = setup(); const a = c.user(1), b = c.user(2);
  const r = await a.call('race:create', {}); await b.call('race:join', { code: r.code });
  assert.strictEqual((await b.call('race:start', {})).ok, false);
  assert.ok((await a.call('race:start', {})).ok);
  assert.strictEqual(b.events('race:countdown').length, 1);
});

test('a ranked race (two real players) is saved and shows on the weekly board; racing alone is not', async () => {
  const c = setup(); const a = c.user(1), b = c.user(2);
  const r = await a.call('race:create', { laps: 1, grid: 4 }); await b.call('race:join', { code: r.code });
  await a.call('race:start', {}); advance(c, 5000);                          // countdown over
  let za = -600, zb = -600;
  for (let i = 0; i < 4000 && !a.events('race:results').length; i++) {
    c.clock.now += 50; c.race.tick(c.clock.now);
    za += 9000 * .05; zb += 7000 * .05;                                       // the first player is faster
    a.fire('race:pose', { z: za, x: 0, v: 9000 }); b.fire('race:pose', { z: zb, x: 0, v: 7000 });
  }
  const res = a.events('race:results')[0]; assert.ok(res, 'results arrived'); assert.strictEqual(res.ranked, true);
  await new Promise((x) => setTimeout(x, 5));
  const board = await a.call('race:board', {});
  assert.ok(board.ok); assert.strictEqual(board.me.races, 1);
  const mine = res.order.find((o) => o.id === 'u1'), theirs = res.order.find((o) => o.id === 'u2');
  assert.ok(mine.place < theirs.place, 'the faster player is ahead');
  assert.strictEqual(board.me.points, mine.points);
  assert.ok(board.week.length >= 1 && board.week[0].points >= board.week[board.week.length - 1].points, 'sorted by points');
  assert.ok(!board.week.some((w) => w.id.startsWith('bot')), 'bots are never on the board');
});

test('racing alone against bots is practice: nothing is saved', async () => {
  const c = setup(); const a = c.user(1);
  await a.call('race:create', { laps: 1, grid: 4 }); await a.call('race:start', {}); advance(c, 5000);
  let z = -600;
  for (let i = 0; i < 4000 && !a.events('race:results').length; i++) { c.clock.now += 50; c.race.tick(c.clock.now); z += 9000 * .05; a.fire('race:pose', { z, x: 0, v: 9000 }); }
  assert.strictEqual(a.events('race:results')[0].ranked, false);
  await new Promise((x) => setTimeout(x, 5));
  assert.strictEqual((await a.call('race:board', {})).me, null);
});

test('a dropped connection mid-race: the kart drives on by itself and the player can come back and carry on', async () => {
  const c = setup(); const a = c.user(1);
  const r = await a.call('race:create', { laps: 3, grid: 4 }); await a.call('race:start', {}); advance(c, 5000);
  let z = -600; for (let i = 0; i < 100; i++) { c.clock.now += 50; c.race.tick(c.clock.now); z += 8000 * .05; a.fire('race:pose', { z, x: .2, v: 8000 }); }
  a.disconnect(); await new Promise((x) => setTimeout(x, 5));
  const room = c.race.rooms.get(r.code); assert.ok(room, 'the room is kept while the race is on'); assert.ok(room.find('u1').ai);
  advance(c, 3000);
  const a2 = c.user(1); const back = await a2.call('race:join', { code: r.code });
  assert.ok(back.ok && back.back); const snap = a2.events('race:resume')[0];
  assert.ok(snap, 'a snapshot is sent'); assert.strictEqual(snap.status, 'racing'); assert.ok(snap.you.z > 20000, 'the kart kept going'); assert.ok(snap.state.r.length === 4);
  assert.strictEqual(room.find('u1').ai, false, 'the player is in control again');
});

test('a race with nobody left is closed after a minute; an empty lobby is closed straight away', async () => {
  const c = setup(); const a = c.user(1), b = c.user(2);
  const r1 = await a.call('race:create', {}); await a.call('race:leave', {}); assert.ok(!c.race.rooms.has(r1.code), 'empty lobby closed');
  const r2 = await b.call('race:create', {}); await b.call('race:start', {}); advance(c, 5000);
  b.disconnect(); await new Promise((x) => setTimeout(x, 5)); advance(c, 30000); assert.ok(c.race.rooms.has(r2.code), 'still waiting for the player');
  advance(c, 35000); assert.ok(!c.race.rooms.has(r2.code), 'closed after a minute with nobody back');
});

test('rate limits: creating rooms too fast is refused', async () => {
  const c = setup(); const a = c.user(1); let last;
  for (let i = 0; i < 8; i++) last = await a.call('race:create', {});
  assert.strictEqual(last.ok, false); assert.match(last.error, /Slow down/);
});

test('item boxes and uses go through the socket and reach only the right player', async () => {
  const c = setup(); const a = c.user(1), b = c.user(2);
  const r = await a.call('race:create', { grid: 2 }); await b.call('race:join', { code: r.code }); await a.call('race:start', {}); advance(c, 5000);
  const box = T.boxes[2], room = c.race.rooms.get(r.code), pa = room.find('u1');
  pa.z = box.seg * T.SEG; pa.x = box.o; pa.lastPoseAt = c.clock.now;
  a.fire('race:box', { id: box.id });
  const mine = a.events('race:item'); assert.ok(mine.length === 1 && mine[0].items.length === 1, 'the player got an item');
  assert.strictEqual(b.events('race:item').length, 0, 'the other player did not');
  c.clock.now += 100; a.fire('race:use', {});
  assert.deepStrictEqual(a.events('race:item').pop().items, []); assert.ok(b.events('race:fx').length >= 1, 'everyone sees the effect');
});

test('stats rule: points only for finishers, wins and podiums counted, the week rolls over', () => {
  const d = {};
  stats.applyResult(d, { name: 'A', place: 1, points: 15, timeMs: 90000, bestLapMs: 30000, dnf: false }, '2026-11-02');
  stats.applyResult(d, { name: 'A', place: 5, points: 6, timeMs: 95000, bestLapMs: 29000, dnf: true }, '2026-11-02');
  assert.deepStrictEqual([d.races, d.points, d.wins, d.podiums, d.bestTimeMs, d.bestLapMs], [2, 15, 1, 1, 90000, 29000]);
  stats.applyResult(d, { name: 'A', place: 2, points: 12, timeMs: 99000, bestLapMs: 31000, dnf: false }, '2026-11-09');
  assert.deepStrictEqual([d.weekPoints, d.weekRaces, d.points], [12, 1, 27], 'a new week starts the weekly numbers again');
  assert.deepStrictEqual(stats.entriesFrom({ ranked: false, order: [{ id: 'u', bot: false }] }), []);
  assert.deepStrictEqual(stats.entriesFrom({ ranked: true, order: [{ id: 'bot1', bot: true }, { id: 'u2', left: true }, { id: 'u3', name: 'N', place: 1, points: 15 }] }).map((e) => e.id), ['u3']);
});
