const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../games/mancala');
const { botMoveLevel, LEVELS } = require('../games/botlevels');
const st = (p0, p1, s0 = 0, s1 = 0, turn = 0) => ({ pits: [p0, p1], stores: [s0, s1], turn });
const total = (s) => s.pits.flat().reduce((a, b) => a + b, 0) + s.stores[0] + s.stores[1];

test('opening: 4 seeds per pit, pit 2 ends in the store for an extra turn', () => {
  const s = m.createInitialState();
  const n = m.applyMove(s, 0, { pit: 2 });
  assert.equal(n.stores[0], 1); assert.equal(n.turn, 0); assert.equal(total(n), 48);
});
test('ordinary move passes the turn; sowing skips the opponent store and laps around', () => {
  const s = st([3, 3, 0, 0, 0, 9], [1, 1, 1, 1, 1, 1]);   // 9 seeds: store, 6 opponent pits (not their store), then own pits 0-1
  const n = m.applyMove(s, 0, { pit: 5 });
  assert.equal(n.stores[0], 1); assert.equal(n.stores[1], 0); assert.equal(n.pits[0][1], 4); assert.equal(n.turn, 1); assert.equal(total(n), total(s));
});
test('capture: last seed in own empty pit takes the opposite pit', () => {
  const s = st([1, 0, 3, 3, 3, 3], [5, 5, 5, 5, 5, 5]);     // pit0 -> pit1 (empty), opposite is p1[4]=5
  const n = m.applyMove(s, 0, { pit: 0 });
  assert.equal(n.stores[0], 6); assert.equal(n.pits[1][4], 0); assert.equal(n.pits[0][1], 0); assert.equal(n.turn, 1);
});
test('no capture if the opposite pit is empty or the landing pit was not empty', () => {
  const a = m.applyMove(st([1, 0, 3, 3, 3, 3], [5, 5, 5, 5, 0, 5]), 0, { pit: 0 });
  assert.equal(a.stores[0], 0); assert.equal(a.pits[0][1], 1);
  const b = m.applyMove(st([1, 2, 3, 3, 3, 3], [5, 5, 5, 5, 5, 5]), 0, { pit: 0 });
  assert.equal(b.stores[0], 0);
});
test('no capture when the last seed lands on the opponent side', () => {
  const s = st([1, 0, 0, 0, 0, 2], [0, 5, 5, 5, 5, 5]);
  const n = m.applyMove(s, 0, { pit: 5 });
  assert.equal(n.stores[0], 1); assert.equal(n.pits[1][0], 1);
});
test('when a side runs out, remaining seeds go to their owner and the game ends', () => {
  const s = st([0, 0, 0, 0, 0, 1], [2, 2, 2, 0, 0, 0], 20, 21);   // last seed goes into the store -> own side empty
  const n = m.applyMove(s, 0, { pit: 5 });
  assert.equal(n.pits.flat().every((x) => x === 0), true);
  assert.equal(n.stores[0], 21); assert.equal(n.stores[1], 27);
  assert.deepEqual(m.checkResult(n), { status: 'win', winnerIndex: 1 });
});
test('draw at 24-24, and a majority (>24) ends the game early', () => {
  assert.deepEqual(m.checkResult(st([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], 24, 24)), { status: 'draw' });
  assert.deepEqual(m.checkResult(st([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], 25, 10)), { status: 'win', winnerIndex: 0 });
});
test('illegal moves: empty pit, wrong turn, out of range, after game over', () => {
  const s = st([0, 4, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4]);
  assert.equal(m.isValidMove(s, 0, { pit: 0 }), false); assert.equal(m.isValidMove(s, 1, { pit: 0 }), false);
  assert.equal(m.isValidMove(s, 0, { pit: 6 }), false); assert.equal(m.isValidMove(s, 0, { pit: 1.5 }), false);
  assert.equal(m.isValidMove(st([4, 4, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4], 25, 0), 0, { pit: 0 }), false);
  assert.equal(m.applyMove(s, 0, { pit: 0 }), s);
});
test('seeds are conserved and games always finish (random self-play, all bot levels valid)', () => {
  for (let g = 0; g < 200; g++) {
    let s = m.createInitialState(), n = 0;
    while (m.checkResult(s).status === 'ongoing' && n++ < 500) {
      const legal = s.pits[s.turn].map((x, p) => (x ? { pit: p } : null)).filter(Boolean);
      assert.ok(legal.length > 0, 'player to move has no seeds in an ongoing game');
      s = m.applyMove(s, s.turn, legal[Math.floor(Math.random() * legal.length)]); assert.equal(total(s), 48);
    }
    assert.notEqual(m.checkResult(s).status, 'ongoing');
  }
  for (const lvl of LEVELS) { const s = m.createInitialState(); assert.equal(m.isValidMove(s, 0, botMoveLevel('mancala', m, s, 0, lvl)), true); }
});
