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
