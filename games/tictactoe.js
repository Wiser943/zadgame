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

// Simple bot: win if possible, else block the opponent's winning line, else
// take the center, else a corner, else whatever's left.
function botMove(state, playerIndex) {
  const b = state.board;
  const opp = 1 - playerIndex;
  const empties = b.map((v, i) => (v === null ? i : -1)).filter((i) => i !== -1);
  const findWin = (mark) => {
    for (const line of LINES) {
      const vals = line.map((i) => b[i]);
      if (vals.filter((v) => v === mark).length === 2 && vals.includes(null)) return line[vals.indexOf(null)];
    }
    return -1;
  };
  let i = findWin(playerIndex);
  if (i === -1) i = findWin(opp);
  if (i === -1 && b[4] === null) i = 4;
  if (i === -1) {
    const corners = [0, 2, 6, 8].filter((c) => b[c] === null);
    if (corners.length) i = corners[Math.floor(Math.random() * corners.length)];
  }
  if (i === -1) i = empties[Math.floor(Math.random() * empties.length)];
  return { index: i };
}

module.exports = { createInitialState, isValidMove, applyMove, checkResult, botMove };
