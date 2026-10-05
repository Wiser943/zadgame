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

function validCols(board) {
  const cols = [];
  for (let c = 0; c < COLS; c++) if (board[0][c] === null) cols.push(c);
  return cols;
}
function dropRow(board, c) {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r][c] === null) return r;
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

// Simple bot: take an immediate win, else block the opponent's immediate
// win, else prefer columns closer to the center.
function botMove(state, playerIndex) {
  const board = state.board;
  const opp = 1 - playerIndex;
  const cols = validCols(board);
  for (const c of cols) { const b2 = simulateDrop(board, c, playerIndex); if (b2 && hasFourInARow(b2, playerIndex)) return { column: c }; }
  for (const c of cols) { const b2 = simulateDrop(board, c, opp); if (b2 && hasFourInARow(b2, opp)) return { column: c }; }
  const center = (COLS - 1) / 2;
  const ordered = cols.slice().sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  return { column: ordered[0] };
}

module.exports = { createInitialState, isValidMove, applyMove, checkResult, botMove };
