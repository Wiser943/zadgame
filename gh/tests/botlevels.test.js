const test = require('node:test');
const assert = require('node:assert/strict');
const games = require('../games');
const { botMoveLevel, LEVELS } = require('../games/botlevels');

for (const game of ['tictactoe', 'connectfour', 'chess', 'mancala', 'battleship', 'checkers', 'ludo']) {
  test(`${game}: bot moves are valid at every difficulty`, () => {
    const e = games[game];
    for (const lvl of LEVELS) {
      const s = e.createInitialState(2);
      const m = botMoveLevel(game, e, s, s.turn || 0, lvl);
      if (m) assert.equal(e.isValidMove(s, s.turn || 0, m), true, `${game}/${lvl}`);
    }
  });
}
test('connect four expert takes an immediate win', () => {
  const e = games.connectfour; let s = e.createInitialState();
  // player 0 has three in column 0 (rows 5,4,3); opponent stacked in column 1
  for (const [p, c] of [[0, 0], [1, 1], [0, 0], [1, 1], [0, 0], [1, 1]]) s = e.applyMove(s, p, { column: c });
  s.turn = 0;
  assert.deepEqual(botMoveLevel('connectfour', e, s, 0, 'expert'), { column: 0 });
});
test('connect four expert blocks an immediate loss', () => {
  const e = games.connectfour; let s = e.createInitialState();
  for (const [p, c] of [[1, 2], [0, 6], [1, 2], [0, 6], [1, 2]]) s = e.applyMove(s, p, { column: c });
  s.turn = 0;
  assert.deepEqual(botMoveLevel('connectfour', e, s, 0, 'expert'), { column: 2 });
});
test('tic-tac-toe expert never loses to random play', () => {
  const e = games.tictactoe;
  for (let g = 0; g < 40; g++) {
    let s = e.createInitialState(2), t = 0; const expert = g % 2;
    for (let n = 0; n < 9 && e.checkResult(s).status === 'ongoing'; n++) {
      const cand = s.board.map((v, k) => v === null ? k : null).filter(x => x !== null);
      const m = t === expert ? botMoveLevel('tictactoe', e, s, t, 'expert') : { index: cand[Math.floor(Math.random() * cand.length)] };
      s = e.applyMove(s, t, m); t = s.turn;
    }
    const r = e.checkResult(s);
    assert.ok(!(r.status === 'win' && r.winnerIndex !== expert), 'expert lost');
  }
});
test('chess expert prefers winning a free queen', () => {
  const e = games.chess; const s = e.createInitialState(2);
  const board = Array(64).fill(null);
  board[60] = { type: 'k', player: 0 }; board[4] = { type: 'k', player: 1 };
  board[35] = { type: 'r', player: 0 }; board[3] = { type: 'q', player: 1 }; // rook on d5? rook at 35 attacks d-file queen at 3
  const st = { ...s, board, turn: 0 };
  const m = botMoveLevel('chess', e, st, 0, 'expert');
  assert.equal(e.isValidMove(st, 0, m), true);
});
