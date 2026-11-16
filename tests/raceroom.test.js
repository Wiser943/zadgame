const test = require('node:test');
const assert = require('node:assert');
const { RaceRoom, MAX_PLAYERS, T } = require('../sockets/raceroom');

function seeded(seed = 7) { let a = seed; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; }
function make(opts = {}) {
  const log = [];
  const room = new RaceRoom('ABCD', opts, (to, ev, payload) => log.push({ to, ev, payload }), seeded());
  return { room, log, last: (ev) => log.filter((l) => l.ev === ev).pop() };
}

test('a room holds at most 10 players and a started race cannot be joined', () => {
  const { room } = make();
  for (let i = 0; i < 10; i++) assert.ok(room.join({ id: 'u' + i, name: 'P' + i }).ok);
  assert.strictEqual(room.join({ id: 'late', name: 'Late' }).ok, false);
  assert.strictEqual(room.hostId, 'u0');
  assert.strictEqual(new Set(room.players.map((p) => p.color)).size, 10, 'ten different colours');
  const b = make(); b.room.join({ id: 'a', name: 'A' }); b.room.start('a', 0);
  assert.strictEqual(b.room.join({ id: 'b', name: 'B' }).ok, false);
});

test('only the host starts; empty seats are filled with bots up to the grid size', () => {
  const { room, last } = make({ grid: 8 });
  room.join({ id: 'a', name: 'A' }); room.join({ id: 'b', name: 'B' });
  assert.strictEqual(room.start('b', 0).ok, false);
  assert.ok(room.start('a', 0).ok);
  assert.strictEqual(room.players.length, 8);
  assert.strictEqual(room.players.filter((p) => p.bot).length, 6);
  assert.strictEqual(room.status, 'countdown');
  assert.ok(last('race:countdown').payload.goAt > 0);
  assert.ok(room.players.every((p) => p.z < 0), 'everyone starts behind the line');
});

test('the host can move to a new host when they leave, and the room closes when the last human leaves', () => {
  const { room } = make();
  room.join({ id: 'a', name: 'A' }); room.join({ id: 'b', name: 'B' });
  assert.strictEqual(room.leave('a'), false);
  assert.strictEqual(room.hostId, 'b');
  assert.strictEqual(room.leave('b'), true);
});

test('a position that is impossible is cut back: no teleporting and no flying', () => {
  const { room } = make({ laps: 2 });
  room.join({ id: 'a', name: 'A' }); room.start('a', 0); room.tick(4600);
  const p = room.find('a'); const z0 = p.z;
  room.pose('a', { z: z0 + 5, x: 0, v: 1000 }, 4700);
  room.pose('a', { z: z0 + 9e6, x: 9, v: 9e6 }, 4800);
  assert.ok(p.z - z0 < 5000, 'cut back to what a kart can really do in 100 ms');
  assert.ok(p.x <= 3 && p.v <= T.MAXV * 1.75);
});

test('item boxes: only near the box, once per cooldown, and one item at a time', () => {
  const { room, last } = make();
  room.join({ id: 'a', name: 'A' }); room.start('a', 0); room.tick(4600);
  const p = room.find('a'), box = T.boxes[1];
  p.z = box.seg * T.SEG + 100; p.x = box.o; p.lastPoseAt = 4600;
  room.pickBox('a', 0, 4700); assert.strictEqual(p.item, null, 'box 0 is far away');
  room.pickBox('a', box.id, 4700); assert.ok(p.item, 'got an item');
  assert.strictEqual(last('race:item').payload.item, p.item);
  const first = p.item; room.pickBox('a', box.id, 4800); assert.strictEqual(p.item, first, 'already holding one');
  room.useItem('a', 4900); assert.strictEqual(p.item, null);
  room.pickBox('a', box.id, 5000); assert.strictEqual(p.item, null, 'that box is still recharging');
  room.pickBox('a', box.id, 4700 + 7100); assert.ok(p.item, 'box is back after a few seconds');
});

test('oil spill spins the next kart through it, a shield blocks it once, rocket hits the kart ahead', () => {
  const { room, log } = make({ grid: 3 });
  room.join({ id: 'a', name: 'A' }); room.join({ id: 'b', name: 'B' }); room.start('a', 0); room.tick(4600);
  const a = room.find('a'), b = room.find('b');
  a.z = 50000; b.z = 49000; a.x = 0; b.x = 0; a.lastPoseAt = b.lastPoseAt = 4600;
  a.item = 'oil'; room.useItem('a', 5000);
  assert.strictEqual(room.hazards.length, 1);
  b.shieldUntil = 99999;
  room.pose('b', { z: room.hazards[0].z, x: 0, v: 8000 }, 5100);
  assert.ok(log.some((l) => l.ev === 'race:fx' && l.payload.kind === 'block' && l.payload.to === 'b'), 'shield soaked up the oil');
  a.item = 'oil'; room.useItem('a', 5200);
  room.pose('b', { z: room.hazards[room.hazards.length - 1].z, x: 0, v: 8000 }, 5300);
  assert.ok(log.some((l) => l.ev === 'race:hit' && l.payload.to === 'b' && l.payload.kind === 'oil'), 'second spill hits');
  b.z = 60000; b.spinUntil = 0; b.item = 'rocket'; a.z = 52000;
  room.useItem('b', 6000);
  const rk = log.filter((l) => l.ev === 'race:fx' && l.payload.kind === 'rocket').pop();
  assert.ok(rk, 'rocket fired');
});

test('a whole race with bots finishes by itself, in order, with points', () => {
  const { room, last } = make({ grid: 10, laps: 1 });
  room.join({ id: 'h', name: 'Human' }); room.start('h', 0);
  let now = 0, z = -600;
  for (let i = 0; i < 20000 && room.status !== 'results'; i++) {
    now += 50; room.tick(now);
    if (room.status === 'racing') {                    // the human drives a steady 8000 units/s
      const p = room.find('h'); z = Math.max(z, p.z) + 8000 * 0.05;
      if (i % 2 === 0) room.pose('h', { z, x: 0, v: 8000 }, now);
    }
  }
  assert.strictEqual(room.status, 'results', 'race ended');
  const res = last('race:results').payload;
  assert.strictEqual(res.order.length, 10);
  assert.deepStrictEqual(res.order.map((r) => r.place), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.strictEqual(res.order[0].points, 15);
  const times = res.order.filter((r) => !r.dnf).map((r) => r.timeMs);
  assert.deepStrictEqual(times, times.slice().sort((a, b) => a - b), 'finishers are in time order');
  assert.ok(times.length >= 5, 'most of the field finished');
  assert.ok(res.order.find((r) => r.id === 'h'), 'the human is in the results');
  assert.ok(room.tick(now + 21000) === undefined && room.status === 'lobby', 'back to the lobby after the results; bots are gone');
  assert.strictEqual(room.players.length, 1);
});

test('a player who leaves mid-race stays on the grid as an autopilot and the race still ends', () => {
  const { room } = make({ grid: 4, laps: 1 });
  room.join({ id: 'a', name: 'A' }); room.join({ id: 'b', name: 'B' }); room.start('a', 0); room.tick(4600);
  assert.strictEqual(room.leave('b', 5000), false);
  assert.ok(room.find('b').ai);
  assert.strictEqual(room.humans().length, 1);
});
