// Pure logic, no I/O. board is ROWS x COLS, top row first. Cells: null empty, 0/1 = player.
const ROWS = 6, COLS = 7;

function createInitialState() {
  return { board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)), turn: 0 };
}

function isValidMove(state, playerIndex, move) {
  const c = move && move.column;
  return state.turn === playerIndex && Number.isInteger(c) && c >= 0 && c < COLS && state.board[0][c] === null;
}

function applyMove(state, playerIndex, move) {
  const board = state.board.map((row) => row.slice());
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][move.column] === null) { board[r][move.column] = playerIndex; break; }
  }
  return { board, turn: 1 - state.turn };
}

function checkResult(state) {
  const b = state.board;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = b[r][c];
      if (v === null) continue;
      for (const [dr, dc] of dirs) {
        let ok = true;
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr][cc] !== v) { ok = false; break; }
        }
        if (ok) return { status: 'win', winnerIndex: v };
      }
    }
  }
  if (b[0].every((v) => v !== null)) return { status: 'draw' };
  return { status: 'ongoing' };
}

module.exports = { createInitialState, isValidMove, applyMove, checkResult };
