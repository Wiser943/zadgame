// Pure logic, no I/O. Best of 5 (first to 3 round wins). Simultaneous reveal:
// publicState() hides an opponent's pending pick until both have chosen.
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const TARGET = 3;

function createInitialState() {
  return { choices: [null, null], scores: [0, 0], round: 1 };
}

function isValidMove(state, playerIndex, move) {
  const c = move && move.choice;
  return ['rock', 'paper', 'scissors'].includes(c)
    && state.choices[playerIndex] === null
    && state.scores[0] < TARGET && state.scores[1] < TARGET;
}

function applyMove(state, playerIndex, move) {
  const choices = state.choices.slice();
  choices[playerIndex] = move.choice;
  let scores = state.scores.slice();
  let round = state.round;

  if (choices[0] && choices[1]) {
    if (choices[0] !== choices[1]) {
      const winner = BEATS[choices[0]] === choices[1] ? 0 : 1;
      scores = scores.map((s, i) => (i === winner ? s + 1 : s));
    }
    // tie or resolved round: clear picks; only advance the round counter on a real result
    if (choices[0] !== choices[1]) round += 1;
    return { choices: [null, null], scores, round };
  }
  return { choices, scores, round };
}

function checkResult(state) {
  if (state.scores[0] >= TARGET) return { status: 'win', winnerIndex: 0 };
  if (state.scores[1] >= TARGET) return { status: 'win', winnerIndex: 1 };
  return { status: 'ongoing' };
}

// Called per-socket so a player never sees the opponent's pending pick.
function publicState(state, playerIndex) {
  const opp = 1 - playerIndex;
  return {
    scores: state.scores,
    round: state.round,
    mine: state.choices[playerIndex],
    opponentPicked: state.choices[opp] !== null
  };
}

function botMove() {
  const opts = ['rock', 'paper', 'scissors'];
  return { choice: opts[Math.floor(Math.random() * opts.length)] };
}

module.exports = { createInitialState, isValidMove, applyMove, checkResult, publicState, botMove };
