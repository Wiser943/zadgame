// Pure logic, no I/O. board cells: null = empty, 0 = player0 (X), 1 = player1 (O).
const LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function createInitialState() {
  return { board: Array(9).fill(null), turn: 0 };
}

function isValidMove(state, playerIndex, move) {
  const i = move && move.index;
  return state.turn === playerIndex && Number.isInteger(i) && i >= 0 && i < 9 && state.board[i] === null;
}

function applyMove(state, playerIndex, move) {
  const board = state.board.slice();
  board[move.index] = playerIndex;
  return { board, turn: 1 - state.turn };
}

function checkResult(state) {
  const b = state.board;
  for (const [a, c, d] of LINES) {
    if (b[a] !== null && b[a] === b[c] && b[c] === b[d]) return { status: 'win', winnerIndex: b[a] };
  }
  if (b.every((c) => c !== null)) return { status: 'draw' };
  return { status: 'ongoing' };
}

module.exports = { createInitialState, isValidMove, applyMove, checkResult };
