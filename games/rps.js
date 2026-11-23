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

function createInitialState(n, options) {
  const rules = cleanRules(options);
  const count = Math.max(2, Math.min(4, Number(n) || 2));
  return { rules, gestures: rules.gestures, target: TARGETS[rules.format], playerCount: count, choices: Array(count).fill(null), scores: Array(count).fill(0), round: 1, resolved: 0, lastRound: null };
}
const targetOf = (s) => s.target || 3;
const setOf = (s) => SETS[s.gestures] || SETS.classic;
const topScore = (s) => Math.max(...s.scores);

function isValidMove(state, playerIndex, move) {
  const c = move && move.choice;
  return setOf(state).includes(c) && state.choices[playerIndex] === null && topScore(state) < targetOf(state);
}

// With 3-4 players everyone reveals together. If exactly one gesture beats every other gesture on the
// table, everyone who threw it scores a point; otherwise (all the same, or a three-way stand-off) it is a tie.
function roundWinners(choices) {
  const distinct = [...new Set(choices)];
  if (distinct.length < 2) return [];
  const top = distinct.find((g) => distinct.every((o) => o === g || beats(g, o)));
  return top ? choices.map((c, i) => (c === top ? i : -1)).filter((i) => i >= 0) : [];
}

function applyMove(state, playerIndex, move) {
  const choices = state.choices.slice();
  choices[playerIndex] = move.choice;
  let scores = state.scores.slice();
  let round = state.round;
  if (choices.every((c) => c !== null)) {
    const winners = roundWinners(choices);
    const tie = winners.length === 0;
    if (!tie) { scores = scores.map((sc, i) => (winners.includes(i) ? sc + 1 : sc)); round += 1; }
    const resolved = (state.resolved || 0) + 1;
    return { ...state, choices: Array(choices.length).fill(null), scores, round, resolved,
      lastRound: { id: resolved, choices: choices.slice(), winner: tie ? null : winners[0], winners, tie } };
  }
  return { ...state, choices, scores, round, resolved: state.resolved || 0, lastRound: state.lastRound || null };
}

function checkResult(state) {
  const top = topScore(state);
  if (top < targetOf(state)) return { status: 'ongoing' };
  const leaders = state.scores.map((x, i) => (x === top ? i : -1)).filter((i) => i >= 0);
  return leaders.length === 1 ? { status: 'win', winnerIndex: leaders[0] } : { status: 'ongoing' };
}

function publicState(state, playerIndex) {
  const others = state.choices.filter((c, i) => i !== playerIndex);
  return {
    scores: state.scores, round: state.round, target: targetOf(state), gestures: setOf(state), format: state.rules?.format || 'bo5',
    playerCount: state.choices.length,
    mine: state.choices[playerIndex], opponentPicked: others.some((c) => c !== null),
    pickedFlags: state.choices.map((c) => c !== null), lastRound: state.lastRound || null
  };
}

function botMove(state) {
  const opts = setOf(state || {});
  return { choice: opts[Math.floor(Math.random() * opts.length)] };
}

module.exports = { DEFAULT_RULES, cleanRules, SETS, BEATS, createInitialState, isValidMove, applyMove, checkResult, publicState, botMove };
