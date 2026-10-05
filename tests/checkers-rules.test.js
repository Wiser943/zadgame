const test = require('node:test');
const assert = require('node:assert/strict');
const ck = require('../games/checkers');
const { botMoveLevel, LEVELS } = require('../games/botlevels');

const sq = (r, c) => r * 8 + c;
function pos(pieces, turn = 0, extra = {}) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [r, c, player, king] of pieces) board[r][c] = { player, king: !!king };
  return { board, turn, mustContinue: null, quiet: 0, draw: null, hist: [], ...extra };
}
const mv = (a, b) => ({ from: a, to: b });

test('opening: 7 legal moves, men move forward only', () => {
  const s = ck.createInitialState();
  assert.equal(ck.legalMoves(s, 0).length, 7);
  assert.equal(ck.isValidMove(s, 0, mv(sq(5, 0), sq(4, 1))), true);
  assert.equal(ck.isValidMove(s, 0, mv(sq(5, 0), sq(6, 1))), false);
  assert.equal(ck.isValidMove(s, 1, mv(sq(2, 1), sq(3, 0))), false); // not black's turn
});
test('player 0 men can capture (regression) and captures are compulsory', () => {
  const s = pos([[5, 2, 0], [4, 3, 1], [7, 0, 0], [0, 7, 1]]);
  assert.equal(ck.isValidMove(s, 0, mv(sq(5, 2), sq(3, 4))), true);
  assert.equal(ck.isValidMove(s, 0, mv(sq(7, 0), sq(6, 1))), false);       // a quiet move is illegal while a capture exists
  assert.ok(ck.legalMoves(s, 0).every((m) => m.capture != null));
});
test('men cannot capture backwards (regression)', () => {
  const s = pos([[3, 2, 1], [4, 3, 0], [0, 7, 0]], 1);
  assert.equal(ck.isValidMove(s, 1, mv(sq(3, 2), sq(5, 4))), true);          // forward for black
  const t = pos([[5, 4, 1], [4, 3, 0], [0, 7, 0]], 1);                        // black man at row 5 would jump "up" over (4,3)
  assert.equal(ck.isValidMove(t, 1, mv(sq(5, 4), sq(3, 2))), false);
});
test('multi-jump keeps the turn with the same piece until finished', () => {
  // white man at (5,2) jumps (4,3), then (2,5)
  const t = pos([[5, 2, 0], [4, 3, 1], [2, 5, 1], [7, 6, 0], [0, 1, 1]]);
  let n = ck.applyMove(t, 0, mv(sq(5, 2), sq(3, 4)));
  assert.equal(n.turn, 0); assert.equal(n.mustContinue, sq(3, 4));
  assert.equal(ck.isValidMove(n, 0, mv(sq(7, 6), sq(6, 5))), false);         // must continue with the jumping piece
  n = ck.applyMove(n, 0, mv(sq(3, 4), sq(1, 6)));
  assert.equal(n.turn, 1); assert.equal(n.mustContinue, null);
  assert.equal(n.board[4][3], null); assert.equal(n.board[2][5], null);
});
test('a man that crowns ends its turn even if it could jump on', () => {
  const t = pos([[2, 3, 0], [1, 2, 1], [1, 4, 1], [0, 3, 1]]);               // jump to row 0 crowns; kings could continue but turn ends
  const n = ck.applyMove(t, 0, mv(sq(2, 3), sq(0, 1)));
  assert.equal(n.board[0][1].king, true); assert.equal(n.turn, 1); assert.equal(n.mustContinue, null);
});
test('kings move and capture in both directions', () => {
  const s = pos([[4, 3, 0, true], [5, 4, 1], [0, 1, 1]]);
  assert.equal(ck.isValidMove(s, 0, mv(sq(4, 3), sq(6, 5))), true);          // backward capture by a king
});
test('moves off the board or onto occupied/light squares are rejected, not crashes', () => {
  const s = ck.createInitialState();
  for (const m of [mv(40, 99), mv(40, -1), mv(40, 40), mv(1.5, 2), mv(40, 49), { from: 'x' }, null, undefined])
    assert.equal(ck.isValidMove(s, 0, m), false);
  assert.equal(ck.applyMove(s, 0, mv(40, 99)), s);
});
test('winning: no pieces left, or no legal moves', () => {
  assert.deepEqual(ck.checkResult(pos([[5, 0, 0]], 1)).winnerIndex, 0);
  const blocked = pos([[0, 1, 1], [1, 0, 0], [1, 2, 0], [2, 3, 0], [2, 1, 0]].map(([r, c, p]) => [r, c, p]), 1); // black man at (0,1) is blocked and cannot jump
  const r = ck.checkResult(blocked); assert.equal(r.status === 'win' ? r.winnerIndex : -1, 0);
});
test('40 moves without capture or man move is a draw; repetition too', () => {
  let s = pos([[7, 0, 0, true], [0, 7, 1, true]], 0, { quiet: 79 });
  s = ck.applyMove(s, 0, mv(sq(7, 0), sq(6, 1)));
  assert.deepEqual(ck.checkResult(s), { status: 'draw', reason: 'noProgress' });
  let t = pos([[7, 0, 0, true], [0, 7, 1, true]]); t.hist = [1];
  const cycle = [[sq(7, 0), sq(6, 1)], [sq(0, 7), sq(1, 6)], [sq(6, 1), sq(7, 0)], [sq(1, 6), sq(0, 7)]];
  for (let round = 0; round < 3; round++) for (const [a, b] of cycle) { if (ck.checkResult(t).status !== 'ongoing') break; t = ck.applyMove(t, t.turn, mv(a, b)); }
  assert.equal(ck.checkResult(t).reason, 'repetition');
});
test('public state lists legal moves and hides history', () => {
  const p = ck.publicState(ck.createInitialState(), 0);
  assert.equal(p.legal.length, 7); assert.equal(p.hist, undefined); assert.equal(p.mustCapture, false);
});
test('bots play valid moves at every level and random self-play always terminates', () => {
  for (const lvl of LEVELS) { const s = ck.createInitialState(); const m = botMoveLevel('checkers', ck, s, 0, lvl); assert.equal(ck.isValidMove(s, 0, m), true, lvl); }
  for (let g = 0; g < 30; g++) {
    let s = ck.createInitialState(), n = 0;
    while (ck.checkResult(s).status === 'ongoing' && n++ < 600) { const l = ck.legalMoves(s, s.turn); assert.ok(l.length); const before = s; s = ck.applyMove(s, s.turn, l[Math.floor(Math.random() * l.length)]); assert.notEqual(s, before); }
    assert.notEqual(ck.checkResult(s).status, 'ongoing', 'game did not end');
  }
});
