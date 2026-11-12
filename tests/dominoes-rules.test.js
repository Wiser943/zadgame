const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../games/dominoes');
const { botMoveLevel, LEVELS } = require('../games/botlevels');

const base = (hands, o = {}) => ({ hand: hands, boneyard: [], chain: [], turn: 0, playerCount: hands.length, out: hands.map(() => false), passes: 0, opening: [6, 6], lastEvent: null, over: null, ...o });
const allTiles = (s) => [...s.hand.flat(), ...s.boneyard, ...s.chain].map((t) => t.slice().sort().join('')).sort();

test('deal: 28 distinct tiles, 7 each for 2 players, 5 each for 3-4, highest double opens', () => {
  for (const n of [2, 3, 4]) {
    const s = d.createInitialState(n);
    assert.equal(s.hand.length, n); assert.ok(s.hand.every((h) => h.length === (n === 2 ? 7 : 5)));
    assert.equal(new Set(allTiles(s)).size, 28);
    assert.equal(s.hand[s.turn].some((t) => t[0] === s.opening[0] && t[1] === s.opening[1]), true);
  }
});
test('the first move must be the opening tile', () => {
  const s = base([[[6, 6], [1, 2]], [[3, 4]]]);
  assert.equal(d.isValidMove(s, 0, { index: 1 }), false);
  assert.equal(d.isValidMove(s, 0, { index: 0 }), true);
  assert.equal(d.isValidMove(s, 1, { index: 0 }), false);        // not your turn
});
test('tiles attach to the matching end and are flipped correctly', () => {
  const start = d.applyMove(base([[[6, 6], [0, 1]], [[2, 6], [1, 6], [4, 4]]]), 0, { index: 0 });
  assert.deepEqual(start.chain, [[6, 6]]); assert.equal(start.turn, 1);
  assert.equal(d.isValidMove(start, 1, { index: 2 }), false);                       // 4|4 does not fit
  const right = d.applyMove(start, 1, { index: 0, end: 'right' });                  // 2|6 must be flipped to 6|2
  assert.deepEqual(right.chain, [[6, 6], [6, 2]]);
  const left = d.applyMove(start, 1, { index: 1, end: 'left' });                    // 1|6 already faces the line
  assert.deepEqual(left.chain, [[1, 6], [6, 6]]);
  assert.equal(d.isValidMove(start, 1, { index: 0, end: 'left' }), true);           // both ends are open to a 6
});
test('a stuck player draws automatically until they can play', () => {
  let s = base([[[6, 6], [6, 1]], [[2, 3], [0, 0]]], { boneyard: [[4, 4], [5, 6]] });   // boneyard pops from the end: [5|6] first
  s = d.applyMove(s, 0, { index: 0 });
  assert.equal(s.turn, 1); assert.equal(s.hand[1].length, 3);       // drew 5|6, which fits
  assert.deepEqual(s.lastEvent.drew, { player: 1, count: 1 });
  assert.equal(s.boneyard.length, 1);
});
test('passes when the boneyard is empty; play continues with whoever can move', () => {
  let s = base([[[6, 6], [6, 1], [1, 1]], [[2, 3]], [[6, 5]]]);      // 3 players, empty boneyard
  s = d.applyMove(s, 0, { index: 0 });
  assert.equal(s.turn, 2);                                           // player 1 cannot play and passes
});
test('going out wins and scores the pips left in other hands', () => {
  let s = base([[[6, 6]], [[3, 4], [1, 1]]]);
  s = d.applyMove(s, 0, { index: 0 });
  assert.deepEqual(d.checkResult(s), { status: 'win', winnerIndex: 0, reason: 'domino', points: 9 });
});
test('blocked game: lowest pip total wins, equal totals draw', () => {
  let s = base([[[6, 6], [5, 5]], [[2, 3]]]);
  s = d.applyMove(s, 0, { index: 0 });                               // 6|6 on table; player 1 stuck, player 0 holds 5|5 also stuck -> blocked
  const r = d.checkResult(s); assert.equal(r.status, 'win'); assert.equal(r.winnerIndex, 1); assert.equal(r.reason, 'blocked');
  const t = base([[[6, 6], [1, 2]], [[3, 0]]]);
  assert.equal(d.checkResult(d.applyMove(t, 0, { index: 0 })).status, 'draw');   // 3 vs 3 pips
});
test('public state hides other hands and the boneyard', () => {
  const s = d.createInitialState(3); const p = d.publicState(s, 1);
  assert.ok(p.hand[1].every((t) => Array.isArray(t))); assert.ok(p.hand[0].every((t) => t === null) && p.hand[2].every((t) => t === null));
  assert.equal(p.boneyard, undefined); assert.equal(p.boneyardCount, s.boneyard.length);
  assert.equal(d.publicState(s, 0).legal.length > 0 || s.turn !== 0, true);
});
test('leaving a game: remaining players continue, last one standing wins', () => {
  let s = d.createInitialState(3); const stay = [0, 1, 2].filter((p) => p !== 1);
  s = d.markOut(s, 1); assert.equal(s.out[1], true); assert.notEqual(s.turn, 1);
  s = d.markOut(s, stay[0]); assert.deepEqual(d.checkResult(s), { status: 'win', winnerIndex: stay[1], reason: 'lastPlayer', points: 0 });
});
test('random self-play: tiles are conserved, moves stay valid, every game ends (2-4 players, all bot levels)', () => {
  for (const n of [2, 3, 4]) for (let g = 0; g < 60; g++) {
    let s = d.createInitialState(n), steps = 0;
    while (d.checkResult(s).status === 'ongoing' && steps++ < 300) {
      const l = d.legalMoves(s, s.turn); assert.ok(l.length > 0, 'current player has no legal move');
      const m = l[Math.floor(Math.random() * l.length)]; const before = s; s = d.applyMove(s, s.turn, m); assert.notEqual(s, before);
      assert.equal(new Set(allTiles(s)).size, 28); assert.equal(allTiles(s).length, 28);
    }
    assert.notEqual(d.checkResult(s).status, 'ongoing', 'game did not end');
  }
  for (const lvl of LEVELS) { const s = d.createInitialState(2); const m = botMoveLevel('dominoes', d, s, s.turn, lvl); assert.equal(d.isValidMove(s, s.turn, m), true, lvl); }
});
