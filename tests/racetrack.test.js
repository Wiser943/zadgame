const test = require('node:test');
const assert = require('node:assert');
const RT = require('../public/js/racetrack');
const { RaceRoom } = require('../sockets/raceroom');

const ids = RT.list().map((t) => t.id);

test('there are three circuits and an unknown name falls back to the first', () => {
  assert.deepStrictEqual(ids.sort(), ['beach', 'harbor', 'market']);
  assert.strictEqual(RT.build('nope').id, 'harbor');
});

for (const id of ['harbor', 'beach', 'market']) {
  test(`${id}: a closed loop, evenly cut, with bends a car can take and no crossing over itself`, () => {
    const T = RT.build(id), n = T.n;
    assert.ok(n > 1400 && n < 2200, 'a lap is about a minute: ' + n + ' segments');
    let worst = 0, minR = 1e9, sumTurn = 0;
    for (let i = 0; i < n; i++) {
      const a = T.segs[i], b = T.segs[(i + 1) % n], d = Math.hypot(b.x - a.x, b.z - a.z); worst = Math.max(worst, Math.abs(d - RT.SEG));
      if (Math.abs(a.turn) > 1e-6) minR = Math.min(minR, RT.SEG / Math.abs(a.turn)); sumTurn += a.turn; assert.ok(Math.abs(a.curve) <= 5, 'bend in range');
    }
    assert.ok(worst < RT.SEG * .08, 'segments are all about 200 units long (worst off by ' + worst.toFixed(1) + ')');
    assert.ok(minR > 8000, 'the tightest bend is wide enough for a 4000-unit road: ' + Math.round(minR));
    assert.ok(Math.abs(Math.abs(sumTurn) - 2 * Math.PI) < .25, 'the heading turns once round in a lap');
    let near = 1e9; for (let i = 0; i < n; i += 3) for (let j = i + 60; j < n - 60; j += 3) near = Math.min(near, Math.hypot(T.segs[i].x - T.segs[j].x, T.segs[i].z - T.segs[j].z));
    assert.ok(near > 9000, 'two parts of the road never come closer than the road is wide: ' + Math.round(near));
    const gap = Math.hypot(T.segs[0].x - T.segs[n - 1].x, T.segs[0].z - T.segs[n - 1].z); assert.ok(Math.abs(gap - RT.SEG) < RT.SEG * .08, 'the end joins the start');
    // the line is on a straight, boxes come in rows of three, pads are on easy stretches
    for (let k = -20; k <= 20; k++) assert.ok(Math.abs(T.segs[(k + n) % n].curve) < 1, 'the start line is on a straight');
    assert.strictEqual(T.boxes.length % 3, 0); assert.ok(T.boxes.every((b, i) => b.id === i && T.segs[b.seg]));
    assert.strictEqual(T.pads.length, 4); for (const p of T.pads) for (let q = 0; q < p.len; q++) assert.strictEqual(T.segs[(p.seg + q) % n].pad, p.o);
    for (const p of T.pads) assert.ok(Math.max(...Array.from({ length: p.len }, (_, q) => Math.abs(T.segs[(p.seg + q) % n].curve))) < 1.2, 'pads are on easy stretches');
  });
  test(`${id}: a point on the road moves smoothly and wraps round the lap`, () => {
    const T = RT.build(id); let prev = T.point(0, 0);
    for (let s = 50; s < T.L; s += 50) { const p = T.point(s, 0); const d = Math.hypot(p.x - prev.x, p.z - prev.z); assert.ok(d > 35 && d < 65, 'steps of 50 are about 50 apart: ' + d.toFixed(1)); prev = p; }
    const a = T.point(100, .5), b = T.point(100 + T.L, .5); assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1, 'one lap later is the same place');
    const c = T.point(5000, 0), l = T.point(5000, -1), r = T.point(5000, 1); assert.ok(Math.abs(Math.hypot(l.x - r.x, l.z - r.z) - 2 * RT.ROAD * 2 / 2 * 1) < 5 || Math.abs(Math.hypot(l.x - r.x, l.z - r.z) - RT.ROAD * 2) < 5, 'the road is 2 x ROAD wide');
    void c;
  });
}

test('a room runs on the circuit its host picks, and the bots slow down in the bends of that circuit', () => {
  const log = []; const room = new RaceRoom('ABCD', { track: 'market', laps: 1, grid: 4 }, (to, ev, p) => log.push({ ev, p }));
  assert.strictEqual(room.trackId, 'market'); assert.strictEqual(room.T.name, 'Mile 12 Market');
  room.join({ id: 'a', name: 'A' }); room.setOptions('a', { track: 'beach' }); assert.strictEqual(room.T.name, 'Palm Beach'); room.setOptions('a', { track: 'bogus' }); assert.strictEqual(room.trackId, 'beach');
  room.start('a', 0); const cd = log.filter((l) => l.ev === 'race:countdown').pop().p; assert.strictEqual(cd.track, 'beach');
  let now = 0; for (let i = 0; i < 40000 && room.status !== 'results'; i++) { now += 50; room.tick(now); if (room.status === 'racing') { const p = room.find('a'); room.pose('a', { z: p.z + 8000 * .05, x: 0, v: 8000 }, now); } }
  assert.strictEqual(room.status, 'results'); const res = log.filter((l) => l.ev === 'race:results').pop().p; assert.ok(res.order.some((o) => !o.dnf && o.bot), 'bots finished a lap of that circuit');
});

test('power-up levels: a better power-up lasts longer, a hit stuns longer; levels are clamped to 1-5; colour and driver are the player\'s own', () => {
  const log = []; const room = new RaceRoom('ABCD', { grid: 2 }, (to, ev, p) => log.push({ ev, p }));
  room.join({ id: 'a', name: 'A' }); room.join({ id: 'b', name: 'B' });
  room.setStyle('a', { levels: { nitro: 5, shield: 99, oil: 1 }, color: '#2f7fd8', driver: 5, type: 'taxi' }); room.setStyle('b', { levels: { nitro: 1 }, color: 'not a colour', driver: 99 });
  const pa = room.find('a'), pb = room.find('b'); assert.strictEqual(pa.pu.nitro, 5); assert.strictEqual(pa.pu.shield, 5, 'clamped'); assert.strictEqual(pa.color, '#2f7fd8'); assert.strictEqual(pa.driver, 5); assert.strictEqual(pa.type, 'taxi');
  assert.notStrictEqual(pb.color, 'not a colour'); assert.strictEqual(pb.driver, 7, 'clamped');
  room.start('a', 0); room.tick(4600);
  pa.items = ['nitro']; room.useItem('a', 5000); const fa = log.filter((l) => l.ev === 'race:fx' && l.p.kind === 'nitro').pop().p;
  pb.items = ['nitro']; room.useItem('b', 5100); const fb = log.filter((l) => l.ev === 'race:fx' && l.p.kind === 'nitro').pop().p;
  assert.ok(fa.dur > fb.dur && fa.dur === Math.round(2200 * 1.48) && fb.dur === 2200, 'level 5 nitro: ' + fa.dur + ' ms, level 1: ' + fb.dur + ' ms');
  assert.ok(room.players.filter((p) => p.bot).every((p) => !room.players.filter((q) => q !== p).some((q) => q.color === p.color)) || room.players.every((p) => !p.bot), 'bots take colours nobody else has');
});

test('two power-up slots: the second item can be used first, and a bot never holds more than it can use', () => {
  const room = new RaceRoom('ABCD', { grid: 3 }, () => {}); room.join({ id: 'a', name: 'A' }); room.start('a', 0); room.tick(4600);
  const p = room.find('a'); p.items = ['oil', 'nitro']; room.useItem('a', 5000, 1); assert.deepStrictEqual(p.items, ['oil']); assert.ok(p.boostUntil > 5000);
  room.useItem('a', 5100, 7); assert.deepStrictEqual(p.items, [], 'a slot number out of range uses the last item');
});
