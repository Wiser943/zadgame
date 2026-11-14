const test = require('node:test');
const assert = require('node:assert/strict');
const snakes = require('../games/snakes'), c4 = require('../games/connectfour'), rps = require('../games/rps'), words = require('../games/words');
const botlevels = require('../games/botlevels');
const registry = require('../games/registry');

test('registry: snakes, connect four, rps and words offer 2-4 players', () => {
  const list = Array.isArray(registry) ? registry : (registry.GAMES || registry.games || Object.values(registry));
  for (const key of ['snakes', 'connectfour', 'rps', 'words']) {
    const g = list.find((x) => x && (x.key === key || x.id === key));
    assert.ok(g, key);
    assert.deepEqual(g.playerCounts, [2, 3, 4], key);
  }
});

test('snakes: turns rotate through 3 and 4 players', () => {
  for (const n of [3, 4]) {
    let s = snakes.createInitialState(n, { board: 'classic', sixAgain: false });
    assert.equal(s.positions.length, n);
    const seen = [];
    for (let k = 0; k < n; k++) { seen.push(s.turn); const before = s.turn; s = snakes.applyMove(s, before); if (s.turn === before) s = { ...s, turn: (before + 1) % n }; }
    assert.equal(new Set(seen).size, n);
  }
  assert.equal(snakes.createInitialState(2).positions.length, 2);
});

test('connect four: bigger grids and turn order for 3 and 4 players, 2-player stays 6x7', () => {
  const dims = (n) => { const s = c4.createInitialState(n); return [s.board.length, s.board[0].length, s.playerCount]; };
  assert.deepEqual(dims(2), [6, 7, 2]); assert.deepEqual(dims(3), [7, 9, 3]); assert.deepEqual(dims(4), [8, 10, 4]);
  let s = c4.createInitialState(3);
  s = c4.applyMove(s, 0, { column: 0 }); assert.equal(s.turn, 1);
  s = c4.applyMove(s, 1, { column: 1 }); assert.equal(s.turn, 2);
  s = c4.applyMove(s, 2, { column: 2 }); assert.equal(s.turn, 0);
  assert.equal(c4.isValidMove(s, 1, { column: 0 }), false);
  // player 2 stacks four in a column while the others dump discs elsewhere
  s = c4.createInitialState(3);
  const plan = [[0, 0], [1, 5], [2, 3], [0, 1], [1, 6], [2, 3], [0, 2], [1, 7], [2, 3], [0, 4], [1, 8], [2, 3]];
  for (const [p, col] of plan) { assert.ok(c4.isValidMove(s, p, { column: col }), `p${p} col${col}`); s = c4.applyMove(s, p, { column: col }); }
  assert.deepEqual(c4.checkResult(s), { status: 'win', winnerIndex: 2 });
});

test('connect four: the bot blocks any opponent that is about to win', () => {
  const s = c4.createInitialState(3);
  const rows = s.board.length;
  for (let k = 1; k <= 3; k++) s.board[rows - k][0] = 1;   // player 1 has three stacked in column 0
  s.board[rows - 1][5] = 0; s.board[rows - 1][7] = 2;
  assert.deepEqual(c4.botMove({ ...s, turn: 2 }, 2), { column: 0 });
  // ...but a bot that can win itself does that first
  const t = c4.createInitialState(3);
  for (let k = 1; k <= 3; k++) { t.board[rows - k][1] = 2; t.board[rows - k][0] = 1; }
  assert.deepEqual(c4.botMove({ ...t, turn: 2 }, 2), { column: 1 });
});

test('rps: three players, the only gesture that beats the rest scores', () => {
  let s = rps.createInitialState(3, { format: 'bo3' });
  assert.equal(s.choices.length, 3);
  s = rps.applyMove(s, 0, { choice: 'rock' }); assert.equal(rps.publicState(s, 1).opponentPicked, true);
  s = rps.applyMove(s, 1, { choice: 'scissors' });
  assert.equal(s.lastRound, null);
  s = rps.applyMove(s, 2, { choice: 'scissors' });
  assert.deepEqual(s.scores, [1, 0, 0]);
  assert.deepEqual(s.lastRound.winners, [0]);
  // rock + paper + scissors on the table is a stand-off, nobody scores
  for (const [i, c] of [[0, 'rock'], [1, 'paper'], [2, 'scissors']]) s = rps.applyMove(s, i, { choice: c });
  assert.equal(s.lastRound.tie, true); assert.deepEqual(s.scores, [1, 0, 0]);
  // two winners sharing the winning gesture both score
  for (const [i, c] of [[0, 'paper'], [1, 'paper'], [2, 'rock']]) s = rps.applyMove(s, i, { choice: c });
  assert.deepEqual(s.scores, [2, 1, 0]);
  assert.deepEqual(rps.checkResult(s), { status: 'win', winnerIndex: 0 });
  assert.equal(rps.isValidMove(s, 2, { choice: 'rock' }), false);
});

test('words: three and four player racks, turn rotation and winner by score', () => {
  for (const n of [3, 4]) {
    let s = words.createInitialState(n);
    assert.equal(s.hands.length, n); assert.equal(s.scores.length, n);
    for (let k = 0; k < n; k++) { const t = s.turn; assert.equal(t, k); s = words.applyMove(s, t, { swap: true }); }
    assert.equal(s.turn, 0);
  }
  const s = { ...words.createInitialState(3), scores: [4, 9, 2], plays: 99, hands: [['A'], ['B'], ['C']], words: [] };
  assert.deepEqual(words.checkResult(s), { status: 'win', winnerIndex: 1 });
  assert.equal(words.checkResult({ ...s, scores: [5, 5, 1] }).status, 'draw');
});

test('bot level: a chosen level is kept, anything else is rolled by the server', () => {
  for (const l of botlevels.LEVELS) assert.equal(botlevels.pickLevel(l), l);
  const seen = new Set();
  for (let i = 0; i < 400; i++) { const l = botlevels.pickLevel(undefined); assert.ok(botlevels.LEVELS.includes(l)); seen.add(l); }
  assert.equal(seen.size, botlevels.LEVELS.length);
  assert.ok(botlevels.LEVELS.includes(botlevels.pickLevel('random')));
});
