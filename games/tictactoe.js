// Pure logic, no I/O. board cells: null = empty, 0..3 = player index.
//   2 players -> classic 3x3, 3 in a row wins (marks X, O)
//   4 players -> 5x5, 4 in a row wins       (marks X, O, △, □)
// The server passes the room size to createInitialState(playerCount).

const MODES = {
  2: { size: 3, winLen: 3 },
  4: { size: 5, winLen: 4 }
};
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function modeFor(playerCount) {
  return MODES[playerCount] || MODES[2];
}

function createInitialState(playerCount) {
  const pc = MODES[playerCount] ? playerCount : 2;
  const { size, winLen } = modeFor(pc);
  return {
    size, winLen, playerCount: pc,
    board: Array(size * size).fill(null),
    turn: 0,
    active: Array(pc).fill(true),
    winLine: null
  };
}

// Next player (after `from`) who is still in the game.
function nextActive(state, from) {
  let idx = from;
  for (let k = 0; k < state.playerCount; k++) {
    idx = (idx + 1) % state.playerCount;
    if (state.active[idx]) return idx;
  }
  return from;
}

function isValidMove(state, playerIndex, move) {
  const i = move && move.index;
  return state.turn === playerIndex && state.active[playerIndex] &&
    Number.isInteger(i) && i >= 0 && i < state.board.length && state.board[i] === null;
}

// Returns the winning run of cell indices through `idx` for the mark there, or null.
function lineThrough(state, board, idx) {
  const { size, winLen } = state;
  const mark = board[idx];
  if (mark === null) return null;
  const r0 = Math.floor(idx / size), c0 = idx % size;
  for (const [dr, dc] of DIRS) {
    const run = [idx];
    for (const s of [1, -1]) {
      let r = r0 + dr * s, c = c0 + dc * s;
      while (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === mark) {
        run.push(r * size + c); r += dr * s; c += dc * s;
      }
    }
    if (run.length >= winLen) return run;
  }
  return null;
}

function applyMove(state, playerIndex, move) {
  const board = state.board.slice();
  board[move.index] = playerIndex;
  const winLine = lineThrough(state, board, move.index);
  return { ...state, board, winLine, turn: winLine ? state.turn : nextActive(state, state.turn) };
}

// A player who left/forfeited: their marks stay, but their turns are skipped.
function markOut(state, i) {
  const active = state.active.slice();
  active[i] = false;
  const s = { ...state, active };
  if (s.turn === i) s.turn = nextActive(s, i);
  return s;
}

function checkResult(state) {
  if (state.winLine) return { status: 'win', winnerIndex: state.board[state.winLine[0]] };
  if (state.board.every((c) => c !== null)) return { status: 'draw' };
  return { status: 'ongoing' };
}

// Bot: win now -> block anyone else's win -> best-scoring cell (centre-weighted,
// extends/blocks open runs). Works for both 3x3 and 5x5.
function botMove(state, playerIndex) {
  const { size, board } = state;
  const empties = [];
  board.forEach((v, i) => { if (v === null) empties.push(i); });
  const wins = (idx, mark) => {
    const b = board.slice(); b[idx] = mark;
    return !!lineThrough(state, b, idx);
  };
  for (const i of empties) if (wins(i, playerIndex)) return { index: i };
  for (let p = 0; p < state.playerCount; p++) {
    if (p === playerIndex || !state.active[p]) continue;
    for (const i of empties) if (wins(i, p)) return { index: i };
  }
  const mid = (size - 1) / 2;
  let best = [], bestScore = -Infinity;
  for (const i of empties) {
    const r = Math.floor(i / size), c = i % size;
    let score = -(Math.abs(r - mid) + Math.abs(c - mid)); // prefer the centre
    for (const [dr, dc] of DIRS) {
      let own = 0, other = 0;
      for (const s of [1, -1]) {
        const rr = r + dr * s, cc = c + dc * s;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const v = board[rr * size + cc];
        if (v === playerIndex) own++; else if (v !== null) other++;
      }
      score += own * 2 + other;
    }
    score += Math.random() * 0.5;
    if (score > bestScore) { bestScore = score; best = [i]; }
  }
  return { index: best.length ? best[0] : empties[Math.floor(Math.random() * empties.length)] };
}

module.exports = { createInitialState, isValidMove, applyMove, checkResult, botMove, markOut };
