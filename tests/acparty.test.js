const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('../utils/acparty');
const live = { endsAt: new Date(Date.now() + 600000), openHouse: false, guests: [] };

test('party: a friend can join a live party, a stranger cannot join friends-only', () => {
  assert.equal(Z.canJoin(live, 'g1', 'h', true).ok, true);
  assert.equal(Z.canJoin(live, 'g1', 'h', false).ok, false);
});
test('party: open house lets non-friends in; full, duplicate and own party are refused', () => {
  assert.equal(Z.canJoin({ ...live, openHouse: true }, 'g1', 'h', false).ok, true);
  assert.equal(Z.canJoin({ ...live, guests: [{ id: 'g1', at: new Date() }] }, 'g1', 'h', true).ok, false);
  assert.equal(Z.canJoin({ ...live, guests: Array.from({ length: Z.MAX_GUESTS }, (_, i) => ({ id: 'x' + i, at: new Date() })) }, 'g1', 'h', true).ok, false);
  assert.equal(Z.canJoin(live, 'h', 'h', true).ok, false);
});
test('party: only guests who stayed long enough are paid when it ends', () => {
  const end = Date.now() - 1000, p = { endsAt: new Date(end), settled: false, guests: [{ id: 'a', at: new Date(end - Z.STAY_MS - 1) }, { id: 'b', at: new Date(end - 1000) }] };
  const out = Z.settle(p, Date.now()); assert.deepEqual(out.guests.map((g) => g.id), ['a']); assert.equal(out.hostBonus, Z.HOST_BONUS_PER_GUEST);
  assert.equal(Z.settle({ ...p, settled: true }, Date.now()), null);
});
