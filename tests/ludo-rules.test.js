const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../games/ludo');
const { botMoveLevel, LEVELS } = require('../games/botlevels');

// starts for 2 players: player 0 -> cell 0, player 1 -> cell 26. global cell = (start + steps - 1) % 52
const mk = (t0, t1, dice, rules, turn = 0) => {
  const s = L.createInitialState(2, rules);
  s.tokens = [t0, t1]; s.dice = dice; s.turn = turn; return s;
};
const move = (s, p, token) => { assert.ok(L.isValidMove(s, p, { type: 'move', token }), 'illegal move'); return L.applyMove(s, p, { type: 'move', token }); };

test('options are sanitised and default to classic rules', () => {
  assert.deepEqual(L.createInitialState(2).rules, { blockades: false, bonusRolls: false, safeStars: true });
  assert.deepEqual(L.cleanRules({ blockades: 'yes', bonusRolls: 1, safeStars: false, evil: true }), { blockades: true, bonusRolls: true, safeStars: false });
});
test('needs a 6 to leave the yard, and cannot overshoot home', () => {
  const s = mk([0, 0, 0, 0], 5, {}); assert.deepEqual(L.movableTokens(s, 0, 5), []);
  assert.deepEqual(L.movableTokens(s, 0, 6), [0, 1, 2, 3]);
  assert.deepEqual(L.movableTokens(mk([55, 57, 0, 0], 3, {}), 0, 3), []);
  assert.deepEqual(L.movableTokens(mk([55, 57, 0, 0], 2, {}), 0, 2), [0]);
});
test('capture sends an opponent token back to the yard', () => {
  // p0 token at steps 5 (cell 4) rolls 2 -> steps 7 (cell 6); p1 token at steps 33 -> cell (26+32)%52 = 6
  const n = move(mk([5, 0, 0, 0], [33, 0, 0, 0], 2, {}), 0, 0);
  assert.equal(n.tokens[1][0], 0); assert.deepEqual(n.lastCapture, [{ player: 1, token: 0 }]);
});
test('no capture on safe squares (start cell, and star cells by default)', () => {
  // p0 lands on cell 13 (a start cell): steps 14. p1 token at steps 40 -> cell (26+39)%52 = 13
  assert.equal(move(mk([12, 0, 0, 0], [40, 0, 0, 0], 2, {}), 0, 0).tokens[1][0], 40);
  // star cell 8 = p0 steps 9; p1 token on cell 8 -> steps 35
  assert.equal(move(mk([7, 0, 0, 0], [35, 0, 0, 0], 2, {}), 0, 0).tokens[1][0], 35);
  // with safeStars off the star is capturable
  assert.equal(move(mk([7, 0, 0, 0], [35, 0, 0, 0], 2, { safeStars: false }), 0, 0).tokens[1][0], 0);
});
test('tokens in the home stretch cannot be captured', () => {
  const n = move(mk([5, 0, 0, 0], [52, 0, 0, 0], 2, {}), 0, 0); assert.equal(n.tokens[1][0], 52);
});
test('blockade: two opponent tokens on one cell cannot be passed or landed on', () => {
  // p1 pair on cell 6 (steps 33). p0 token at steps 4 (cell 3) rolls 4 -> would pass cell 6
  const rules = { blockades: true };
  const s = mk([4, 0, 0, 0], [33, 33, 0, 0], 4, rules);
  assert.deepEqual(L.movableTokens(s, 0, 4), []);                       // path crosses the blockade
  assert.deepEqual(L.movableTokens(mk([4, 0, 0, 0], [33, 33, 0, 0], 2, rules), 0, 2), [0]);   // stops before it
  assert.deepEqual(L.movableTokens(mk([4, 0, 0, 0], [33, 33, 0, 0], 3, rules), 0, 3), []);    // landing on it is illegal
  assert.deepEqual(L.movableTokens(mk([4, 0, 0, 0], [33, 33, 0, 0], 4, {}), 0, 4), [0]);      // classic rules: no blockade
});
test('blockades never form on safe cells and never block their owner', () => {
  // p1 pair on start cell 26 (steps 1) is safe -> p0 may pass it
  assert.equal(L.movableTokens(mk([22, 0, 0, 0], [1, 1, 0, 0], 6, { blockades: true }), 0, 6).includes(0), true);
  // owner can move through own blockade
  assert.deepEqual(L.movableTokens(mk([0, 0, 0, 0], [33, 30, 33, 0], 3, { blockades: true }), 1, 3).includes(1), true);
});
test('a 6 gives another roll; bonusRolls also rewards a capture or reaching home', () => {
  const six = move(mk([5, 0, 0, 0], [0, 0, 0, 0], 6, {}), 0, 0); assert.equal(six.turn, 0); assert.equal(six.dice, null);
  const cap = mk([5, 0, 0, 0], [33, 0, 0, 0], 2, {});
  assert.equal(move(cap, 0, 0).turn, 1);                                // classic: turn passes after a capture
  assert.equal(move({ ...cap, rules: L.cleanRules({ bonusRolls: true }) }, 0, 0).turn, 0);
  const home = move(mk([55, 0, 0, 0], [0, 0, 0, 0], 2, { bonusRolls: true }), 0, 0); assert.equal(home.turn, 0);
});
test('three sixes in a row forfeit the turn; the die is rolled on the server', () => {
  const s = mk([5, 0, 0, 0], [0, 0, 0, 0], null, {}); s.sixStreak = 2;
  const orig = Math.random; Math.random = () => 0.99;                 // always rolls a 6
  try { const n = L.applyMove(s, 0, { type: 'roll' }); assert.equal(n.turn, 1); assert.equal(n.sixStreak, 0); } finally { Math.random = orig; }
});
test('illegal moves: wrong turn, wrong phase, bad token index', () => {
  const s = mk([5, 0, 0, 0], [0, 0, 0, 0], 3, {});
  assert.equal(L.isValidMove(s, 1, { type: 'move', token: 0 }), false);
  assert.equal(L.isValidMove(s, 0, { type: 'roll' }), false);          // already rolled
  assert.equal(L.isValidMove(s, 0, { type: 'move', token: 9 }), false);
  assert.equal(L.isValidMove(s, 0, { type: 'move', token: 1 }), false); // in the yard, needs a 6
  assert.equal(L.isValidMove({ ...s, dice: null }, 0, { type: 'move', token: 0 }), false);
});
test('winning needs all four tokens home; forfeits leave the last player standing', () => {
  assert.deepEqual(L.checkResult(mk([57, 57, 57, 57], [3, 0, 0, 0], null, {})), { status: 'win', winnerIndex: 0 });
  assert.equal(L.checkResult(mk([57, 57, 57, 0], [3, 0, 0, 0], null, {})).status, 'ongoing');
  assert.deepEqual(L.checkResult(L.markOut(mk([5, 0, 0, 0], [3, 0, 0, 0], null, {}), 0)), { status: 'win', winnerIndex: 1 });
});
test('random self-play ends with legal moves only, under every rule combination and 2-4 players', () => {
  for (const players of [2, 3, 4]) for (const rules of [{}, { blockades: true }, { bonusRolls: true, blockades: true, safeStars: false }]) for (let g = 0; g < 15; g++) {
    let s = L.createInitialState(players, rules), steps = 0;
    while (L.checkResult(s).status === 'ongoing' && steps++ < 4000) {
      const mv = L.botMove(s, s.turn); if (!mv) { s = L.forcePass(s); continue; }
      assert.equal(L.isValidMove(s, s.turn, mv), true); s = L.applyMove(s, s.turn, mv);
      s.tokens.forEach((row) => row.forEach((x) => assert.ok(x >= 0 && x <= 57)));
    }
    assert.equal(L.checkResult(s).status === 'ongoing', false, `stuck: ${players}p ${JSON.stringify(rules)}`);
  }
  for (const lvl of LEVELS) { const s = L.createInitialState(2); assert.ok(botMoveLevel('ludo', L, s, 0, lvl)); }
});
