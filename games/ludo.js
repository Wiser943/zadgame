// Pure logic, no I/O. Simplified classic Ludo for 2 or 4 players.
//
// Board model: one shared 52-cell outer track (indices 0-51, clockwise)
// plus a private 6-cell home stretch per color. A token's progress is
// tracked as "steps" from its own color's start:
//   0        = still in the yard (needs a roll of 6 to leave)
//   1-51     = on the shared track; global cell = (start + steps - 1) % 52
//   52-57    = in the private home stretch (can't be captured here)
//   57       = home (finished)
//
// Simplifications vs. a full board-game ruleset: no "blocking" when two of
// a player's own tokens share a cell, and a wasted 6 (no legal move) still
// ends the turn rather than granting a free reroll. Everything else —
// needing a 6 to leave the yard, exact rolls to reach home, capturing
// opponents off the shared track, safe squares, and three-sixes forfeiting
// the turn — follows standard rules.

const TRACK_LEN = 52;
const HOME_STEPS = 57;                 // steps value once a token is home
const CORNER_STARTS = [0, 13, 26, 39]; // shared-track entry cell per corner
const CORNER_COLORS = ['red', 'green', 'yellow', 'blue'];
const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // starts + star cells
const TOKENS_PER_PLAYER = 4;

// 2-player games use opposite corners (red/yellow) so both sides are symmetric.
function cornersFor(playerCount) {
  return playerCount === 4 ? [0, 1, 2, 3] : [0, 2];
}

function createInitialState(playerCount) {
  const n = playerCount === 4 ? 4 : 2;
  const corners = cornersFor(n);
  return {
    playerCount: n,
    starts: corners.map((c) => CORNER_STARTS[c]),
    colors: corners.map((c) => CORNER_COLORS[c]),
    tokens: Array.from({ length: n }, () => Array(TOKENS_PER_PLAYER).fill(0)),
    active: Array(n).fill(true),
    turn: 0,
    dice: null,
    sixStreak: 0
  };
}

function globalCell(state, playerIndex, steps) {
  return (state.starts[playerIndex] + steps - 1) % TRACK_LEN;
}

function nextActive(state, from) {
  for (let k = 1; k <= state.playerCount; k++) {
    const i = (from + k) % state.playerCount;
    if (state.active[i]) return i;
  }
  return from;
}

function movableTokens(state, playerIndex, dice) {
  const out = [];
  state.tokens[playerIndex].forEach((steps, t) => {
    if (steps === HOME_STEPS) return;                          // already home
    if (steps === 0) { if (dice === 6) out.push(t); return; }   // needs a 6 to leave the yard
    if (steps + dice <= HOME_STEPS) out.push(t);                // no overshooting home
  });
  return out;
}

function isValidMove(state, playerIndex, move) {
  if (state.turn !== playerIndex || !state.active[playerIndex]) return false;
  if (!move) return false;
  if (move.type === 'roll') return state.dice === null;
  if (move.type === 'move') {
    if (state.dice === null || !Number.isInteger(move.token)) return false;
    return movableTokens(state, playerIndex, state.dice).includes(move.token);
  }
  return false;
}

function passTurn(state) {
  state.dice = null;
  state.sixStreak = 0;
  state.turn = nextActive(state, state.turn);
}

function applyMove(state, playerIndex, move) {
  const s = {
    ...state,
    tokens: state.tokens.map((row) => row.slice()),
    active: state.active.slice()
  };

  if (move.type === 'roll') {
    // The die is rolled server-side — never trust a client-supplied value.
    const dice = 1 + Math.floor(Math.random() * 6);
    s.sixStreak = dice === 6 ? s.sixStreak + 1 : 0;
    if (s.sixStreak >= 3) { passTurn(s); return s; }                          // three 6s in a row forfeits the turn
    if (movableTokens(s, playerIndex, dice).length === 0) { passTurn(s); return s; } // nothing playable, auto-pass
    s.dice = dice;
    return s;
  }

  // move.type === 'move'
  const dice = s.dice;
  let steps = s.tokens[playerIndex][move.token];
  steps = steps === 0 ? 1 : steps + dice;
  s.tokens[playerIndex][move.token] = steps;

  // Capture: landing on a shared, non-safe cell occupied by exactly one opponent sends it home.
  if (steps >= 1 && steps <= TRACK_LEN - 1) {
    const cell = globalCell(s, playerIndex, steps);
    if (!SAFE_CELLS.has(cell)) {
      for (let p = 0; p < s.playerCount; p++) {
        if (p === playerIndex) continue;
        s.tokens[p] = s.tokens[p].map((st, t) =>
          (st >= 1 && st <= TRACK_LEN - 1 && globalCell(s, p, st) === cell) ? 0 : st);
      }
    }
  }

  if (dice === 6 && s.sixStreak < 3) s.dice = null;   // extra roll for the same player
  else passTurn(s);
  return s;
}

function checkResult(state) {
  for (let i = 0; i < state.playerCount; i++) {
    if (state.tokens[i].every((st) => st === HOME_STEPS)) return { status: 'win', winnerIndex: i };
  }
  const activeIdx = state.active.reduce((a, v, i) => (v ? a.concat(i) : a), []);
  if (activeIdx.length === 1) return { status: 'win', winnerIndex: activeIdx[0] }; // last player standing
  if (activeIdx.length === 0) return { status: 'draw' };
  return { status: 'ongoing' };
}

// Called by sockets/index.js when a player forfeits mid-game (left or timed
// out) so the remaining players' turns keep flowing without them.
function markOut(state, playerIndex) {
  const s = { ...state, active: state.active.slice() };
  s.active[playerIndex] = false;
  if (s.turn === playerIndex) passTurn(s);
  return s;
}

module.exports = { createInitialState, isValidMove, applyMove, checkResult, markOut };
