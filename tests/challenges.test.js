const test = require('node:test');
const assert = require('node:assert/strict');
const { matchDeltas, find, CHALLENGES } = require('../utils/challenges');
const presence = require('../utils/presence');

test('human vs human: winner gets play+win, loser gets play only', () => {
  const d = matchDeltas([{ id: 'a' }, { id: 'b' }], 0);
  assert.deepEqual(d, [{ userId: 'a', play: 1, win: 1 }, { userId: 'b', play: 1, win: 0 }]);
});
test('bot matches never count as wins and bots get no progress', () => {
  const d = matchDeltas([{ id: 'a' }, { id: 'bot1', bot: true }], 0);
  assert.deepEqual(d, [{ userId: 'a', play: 1, win: 0 }]);
});
test('draws give play only', () => {
  assert.ok(matchDeltas([{ id: 'a' }, { id: 'b' }], null).every(x => x.win === 0 && x.play === 1));
});
test('every challenge has a known stat and positive target/reward', () => {
  for (const c of CHALLENGES) { assert.ok(['play', 'win'].includes(c.stat)); assert.ok(c.target > 0 && c.reward > 0); assert.equal(find(c.id), c); }
});
test('presence counts multiple sockets per user', () => {
  presence.connect('u1'); presence.connect('u1');
  presence.disconnect('u1'); assert.equal(presence.isOnline('u1'), true);
  presence.disconnect('u1'); assert.equal(presence.isOnline('u1'), false);
});
