// Pure logic, no I/O. board is rows x cols, top row first. Cells: null empty, 0..3 = player index.
// 2 players use the classic 6x7 grid; 3 and 4 players get a bigger grid so everyone has room to build four in a row.
const DIMS = { 2: [6, 7], 3: [7, 9], 4: [8, 10] };
const dimsOf = (state) => { const b = state.board; return [b.length, b[0].length]; };

function createInitialState(n) {
  const count = DIMS[n] ? n : 2;
  const [rows, cols] = DIMS[count];
  return { board: Array.from({ length: rows }, () => Array(cols).fill(null)), turn: 0, playerCount: count };
}

function isValidMove(state, playerIndex, move) {
  const c = move && move.column;
  const [, COLS] = dimsOf(state);
  return state.turn === playerIndex && Number.isInteger(c) && c >= 0 && c < COLS && state.board[0][c] === null;
}

function applyMove(state, playerIndex, move) {
  const board = state.board.map((row) => row.slice());
  for (let r = board.length - 1; r >= 0; r--) {
    if (board[r][move.column] === null) { board[r][move.column] = playerIndex; break; }
  }
  const count = state.playerCount || 2;
  return { ...state, board, turn: (state.turn + 1) % count };
}

function checkResult(state) {
  const b = state.board;
  const [ROWS, COLS] = dimsOf(state);
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

function validCols(board) {
  const cols = [];
  for (let c = 0; c < board[0].length; c++) if (board[0][c] === null) cols.push(c);
  return cols;
}
function dropRow(board, c) {
  for (let r = board.length - 1; r >= 0; r--) if (board[r][c] === null) return r;
  return -1;
}
function simulateDrop(board, c, mark) {
  const r = dropRow(board, c);
  if (r === -1) return null;
  const b = board.map((row) => row.slice());
  b[r][c] = mark;
  return b;
}
function hasFourInARow(board, mark) {
  const ROWS = board.length, COLS = board[0].length;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== mark) continue;
      for (const [dr, dc] of dirs) {
        let ok = true;
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || board[rr][cc] !== mark) { ok = false; break; }
        }
        if (ok) return true;
      }
    }
  }
  return false;
}

// Simple bot: take an immediate win, else block any opponent's immediate
// win, else prefer columns closer to the center.
function botMove(state, playerIndex) {
  const board = state.board;
  const count = state.playerCount || 2;
  const cols = validCols(board);
  for (const c of cols) { const b2 = simulateDrop(board, c, playerIndex); if (b2 && hasFourInARow(b2, playerIndex)) return { column: c }; }
  for (let o = 0; o < count; o++) {
    if (o === playerIndex) continue;
    for (const c of cols) { const b2 = simulateDrop(board, c, o); if (b2 && hasFourInARow(b2, o)) return { column: c }; }
  }
  const center = (board[0].length - 1) / 2;
  const ordered = cols.slice().sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  return { column: ordered[0] };
}

module.exports = { createInitialState, isValidMove, applyMove, checkResult, botMove };
