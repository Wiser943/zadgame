const test = require('node:test');
const assert = require('node:assert');
const { sanitizePos, publicPos } = require('../utils/acmappos');

test('sanitizePos clamps to the playable map and keeps heading/state', () => {
  const p = sanitizePos({ x: -40, y: 1400, h: 9, st: 'run' });
  assert.strictEqual(p.x, 0);
  assert.strictEqual(p.y, 1000);
  assert.ok(p.h >= 0 && p.h < Math.PI * 2);
  assert.strictEqual(p.st, 'run');
});

test('sanitizePos drops junk payloads', () => {
  assert.strictEqual(sanitizePos(null), null);
  assert.strictEqual(sanitizePos({ x: 'nope', y: 10 }), null);
});

test('publicPos only exposes a point when one exists', () => {
  assert.deepStrictEqual(publicPos({ name: 'Ada' }), {});
  const live = publicPos({ x: 120.4, y: 310.1, h: 1.2, st: 'walk' });
  assert.strictEqual(live.x, 120.4);
  assert.strictEqual(live.st, 'walk');
});

test('sanitizePos keeps vehicle, speed and job label for the 3D street world', () => {
  const p = sanitizePos({ x: 10, y: 20, h: 1, st: 'drive', v: 'car', sp: 61.234, job: 'Danfo <b>driver</b>' });
  assert.strictEqual(p.st, 'drive');
  assert.strictEqual(p.v, 'car');
  assert.strictEqual(p.sp, 61.2);
  assert.ok(!/[<>]/.test(p.job));
  const q = sanitizePos({ x: 1, y: 1, v: 'rocket', sp: 400 });
  assert.strictEqual(q.v, undefined);
  assert.strictEqual(q.sp, undefined);
  assert.deepStrictEqual(publicPos({ x: 5, y: 6, h: 0, st: 'drive', v: 'car', sp: 30 }), { x: 5, y: 6, h: 0, st: 'drive', v: 'car', sp: 30 });
});
