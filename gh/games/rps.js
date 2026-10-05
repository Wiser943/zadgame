// Pure logic, no I/O. Simultaneous reveal: publicState() hides an opponent's pending pick until both have chosen.
// Room options: format 'bo3' | 'bo5' (default) | 'bo7', gestures 'classic' (rock/paper/scissors) | 'rpsls' (adds lizard, spock).
const BEATS = {
  rock: ['scissors', 'lizard'], paper: ['rock', 'spock'], scissors: ['paper', 'lizard'],
  lizard: ['paper', 'spock'], spock: ['scissors', 'rock']
};
const SETS = { classic: ['rock', 'paper', 'scissors'], rpsls: ['rock', 'paper', 'scissors', 'lizard', 'spock'] };
const TARGETS = { bo3: 2, bo5: 3, bo7: 4 };
const DEFAULT_RULES = { format: 'bo5', gestures: 'classic' };
const cleanRules = (r) => ({ format: TARGETS[r && r.format] ? r.format : 'bo5', gestures: SETS[r && r.gestures] ? r.gestures : 'classic' });
const beats = (a, b) => BEATS[a].includes(b);   // classic play only ever offers rock/paper/scissors, so the extra entries never apply

function createInitialState(_n, options) {
  const rules = cleanRules(options);
  return { rules, gestures: rules.gestures, target: TARGETS[rules.format], choices: [null, null], scores: [0, 0], round: 1, resolved: 0, lastRound: null };
}
const targetOf = (s) => s.target || 3;
const setOf = (s) => SETS[s.gestures] || SETS.classic;

function isValidMove(state, playerIndex, move) {
  const c = move && move.choice;
  return setOf(state).includes(c) && state.choices[playerIndex] === null
    && state.scores[0] < targetOf(state) && state.scores[1] < targetOf(state);
}

function applyMove(state, playerIndex, move) {
  const choices = state.choices.slice();
  choices[playerIndex] = move.choice;
  let scores = state.scores.slice();
  let round = state.round;
  if (choices[0] && choices[1]) {
    let winner = null;
    if (choices[0] !== choices[1]) {
      winner = beats(choices[0], choices[1]) ? 0 : 1;
      scores = scores.map((s, i) => (i === winner ? s + 1 : s));
      round += 1;
    }
    const resolved = (state.resolved || 0) + 1;
    return { ...state, choices: [null, null], scores, round, resolved,
      lastRound: { id: resolved, choices: choices.slice(), winner, tie: winner === null } };
  }
  return { ...state, choices, scores, round, resolved: state.resolved || 0, lastRound: state.lastRound || null };
}

function checkResult(state) {
  if (state.scores[0] >= targetOf(state)) return { status: 'win', winnerIndex: 0 };
  if (state.scores[1] >= targetOf(state)) return { status: 'win', winnerIndex: 1 };
  return { status: 'ongoing' };
}

function publicState(state, playerIndex) {
  const opp = 1 - playerIndex;
  return {
    scores: state.scores, round: state.round, target: targetOf(state), gestures: setOf(state), format: state.rules?.format || 'bo5',
    mine: state.choices[playerIndex], opponentPicked: state.choices[opp] !== null, lastRound: state.lastRound || null
  };
}

function botMove(state) {
  const opts = setOf(state || {});
  return { choice: opts[Math.floor(Math.random() * opts.length)] };
}

module.exports = { DEFAULT_RULES, cleanRules, SETS, BEATS, createInitialState, isValidMove, applyMove, checkResult, publicState, botMove };
