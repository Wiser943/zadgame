const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../utils/elo');
test('equal ratings: winner gains what loser loses (established players)', () => {
  const [a, b] = E.eloDeltas(1000, 1000, 1);
  assert.equal(a, 12); assert.equal(b, -12);
});
test('upset pays more than expected win', () => {
  const [upset] = E.eloDeltas(1000, 1400, 1), [fav] = E.eloDeltas(1400, 1000, 1);
  assert.ok(upset > fav);
});
test('placement games move rating faster', () => {
  assert.ok(E.eloDeltas(1000, 1000, 1, 0, 99)[0] > E.eloDeltas(1000, 1000, 1, 50, 99)[0]);
});
test('draw between equals changes nothing; a win always gains at least 1', () => {
  assert.deepEqual(E.eloDeltas(1000, 1000, 0.5), [0, 0]);
  assert.ok(E.eloDeltas(2000, 100, 1)[0] >= 1);
});
test('rating floor of 100', () => {
  const [, db] = E.eloDeltas(1500, 105, 1); assert.ok(105 + db >= 100);
});
test('matchmaking band widens over time and is capped', () => {
  assert.equal(E.bandFor(0), 100); assert.equal(E.bandFor(30000), 250); assert.equal(E.bandFor(10 * 60000), 600);
  const now = 100000;
  assert.equal(E.canPair({ rating: 1000, since: now }, { rating: 1300, since: now }, now), false);
  assert.equal(E.canPair({ rating: 1000, since: now - 40000 }, { rating: 1300, since: now }, now), true);
});
