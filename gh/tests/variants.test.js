const test = require('node:test');
const assert = require('node:assert/strict');
const rps = require('../games/rps'), snakes = require('../games/snakes'), joker = require('../games/joker'), whot = require('../games/whot'), words = require('../games/words');

// ---------- RPS ----------
test('rps: formats set the target score and default to best of 5', () => {
  assert.equal(rps.createInitialState(2).target, 3);
  assert.equal(rps.createInitialState(2, { format: 'bo3' }).target, 2);
  assert.equal(rps.createInitialState(2, { format: 'bo7' }).target, 4);
  assert.equal(rps.createInitialState(2, { format: 'bogus' }).target, 3);
});
test('rps: lizard and spock only exist in RPSLS', () => {
  const classic = rps.createInitialState(2), ls = rps.createInitialState(2, { gestures: 'rpsls' });
  assert.equal(rps.isValidMove(classic, 0, { choice: 'lizard' }), false);
  assert.equal(rps.isValidMove(ls, 0, { choice: 'spock' }), true);
  assert.equal(rps.isValidMove(ls, 0, { choice: 'banana' }), false);
});
test('rps: every RPSLS matchup has exactly one winner (each gesture beats 2 and loses to 2)', () => {
  const g = rps.SETS.rpsls;
  for (const a of g) { assert.equal(rps.BEATS[a].length, 2); for (const b of g) if (a !== b) assert.equal(rps.BEATS[a].includes(b) !== rps.BEATS[b].includes(a), true, a + b); }
});
test('rps: a best-of-3 ends after two round wins; ties do not count; picks stay hidden', () => {
  let s = rps.createInitialState(2, { format: 'bo3' });
  const round = (a, b) => { s = rps.applyMove(s, 0, { choice: a }); assert.equal(rps.publicState(s, 1).opponentPicked, true); assert.equal(rps.publicState(s, 1).mine, null); s = rps.applyMove(s, 1, { choice: b }); };
  round('rock', 'rock'); assert.deepEqual(s.scores, [0, 0]);
  round('rock', 'scissors'); assert.equal(rps.checkResult(s).status, 'ongoing');
  round('paper', 'rock'); assert.deepEqual(rps.checkResult(s), { status: 'win', winnerIndex: 0 });
  assert.equal(rps.isValidMove(s, 1, { choice: 'rock' }), false);
});
test('rps: bot picks only gestures from the active set', () => {
  const ls = rps.createInitialState(2, { gestures: 'rpsls' }), seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(rps.botMove(ls).choice);
  assert.equal(seen.size, 5);
  for (let i = 0; i < 100; i++) assert.ok(rps.SETS.classic.includes(rps.botMove(rps.createInitialState(2)).choice));
});

// ---------- Snakes & Ladders ----------
const withRoll = (n, fn) => { const c = require('crypto'), o = c.randomInt; c.randomInt = () => n - 1; try { return fn(); } finally { c.randomInt = o; } };
test('snakes: board styles change the snake/ladder mix', () => {
  const count = (j) => [Object.entries(j).filter(([k, v]) => v < +k).length, Object.entries(j).filter(([k, v]) => v > +k).length];
  assert.deepEqual(count(snakes.createInitialState(2, { board: 'gentle' }).jumps), [4, 9]);
  assert.deepEqual(count(snakes.createInitialState(2, { board: 'brutal' }).jumps), [10, 5]);
  assert.deepEqual(snakes.createInitialState(2, { board: 'classic' }).jumps, snakes.J);
});
test('snakes: classic overshoot finishes, exact-finish overshoot stays put', () => {
  const base = snakes.createInitialState(2, { board: 'classic' });
  const near = { ...base, positions: [98, 0] };
  assert.equal(withRoll(5, () => snakes.applyMove(near, 0)).positions[0], 100);
  const exact = { ...snakes.createInitialState(2, { board: 'classic', exactFinish: true }), positions: [98, 0] };
  assert.equal(withRoll(5, () => snakes.applyMove(exact, 0)).positions[0], 98);
  assert.equal(withRoll(2, () => snakes.applyMove(exact, 0)).positions[0], 100);
});
test('snakes: sixAgain gives another turn, but never more than twice in a row, and not after winning', () => {
  let s = { ...snakes.createInitialState(2, { board: 'classic', sixAgain: true }), positions: [1, 0], jumps: {} };
  s = withRoll(6, () => snakes.applyMove(s, 0)); assert.equal(s.turn, 0);
  s = withRoll(6, () => snakes.applyMove(s, 0)); assert.equal(s.turn, 0);
  s = withRoll(6, () => snakes.applyMove(s, 0)); assert.equal(s.turn, 1);
  const off = { ...snakes.createInitialState(2, { board: 'classic' }), positions: [1, 0], jumps: {} };
  assert.equal(withRoll(6, () => snakes.applyMove(off, 0)).turn, 1);
});
test('snakes: random games always finish', () => {
  for (const rules of [{}, { exactFinish: true, sixAgain: true }, { board: 'brutal', exactFinish: true }]) for (let g = 0; g < 20; g++) {
    let s = snakes.createInitialState(2, rules), n = 0;
    while (snakes.checkResult(s).status === 'ongoing' && n++ < 5000) s = snakes.applyMove(s, s.turn);
    assert.equal(snakes.checkResult(s).status, 'win');
  }
});

// ---------- Joker ----------
const jk = (hands, rules, extra = {}) => ({ ...joker.createInitialState(hands.length, rules), hands, pile: [{ suit: 'hearts', rank: 'K', joker: false }], market: Array.from({ length: 30 }, () => ({ suit: 'clubs', rank: 'Q', joker: false })), turn: 0, pendingPick: 0, calledSuit: null, ...extra });
const c = (rank, suit = 'hearts') => ({ rank, suit, joker: false });
test('joker: hand size option and sanitising', () => {
  assert.equal(joker.createInitialState(2, { handSize: 10 }).hands[0].length, 10);
  assert.equal(joker.createInitialState(2, { handSize: 99 }).hands[0].length, 7);
  assert.equal(joker.cleanRules({ penalty: 'x' }).penalty, 'numbers');
});
test('joker: numbers mode stacks any number, twos mode only 2s, off mode nothing', () => {
  const play = (rules, rank) => joker.applyMove(jk([[c(rank), c('A', 'spades')], [c('3', 'clubs')]], rules), 0, { type: 'play', index: 0 });
  assert.equal(play({ penalty: 'numbers' }, '7').pendingPick, 7);
  assert.equal(play({ penalty: 'twos' }, '2').pendingPick, 2);
  assert.equal(play({ penalty: 'twos' }, '7').pendingPick, 0);
  assert.equal(play({ penalty: 'off' }, '2').pendingPick, 0);
  const pending = jk([[c('A')], [c('2', 'clubs'), c('5', 'clubs')]], { penalty: 'twos' }, { turn: 1, pendingPick: 2 });
  assert.equal(joker.isValidMove(pending, 1, { type: 'play', index: 0 }), true);
  assert.equal(joker.isValidMove(pending, 1, { type: 'play', index: 1 }), false);
});
test('joker: skipOn8 skips the next player', () => {
  const s = jk([[c('8'), c('A', 'spades')], [c('3', 'clubs')], [c('4', 'clubs')]], { skipOn8: true });
  assert.equal(joker.applyMove(s, 0, { type: 'play', index: 0 }).turn, 2);
  assert.equal(joker.applyMove({ ...s, rules: joker.cleanRules({}) }, 0, { type: 'play', index: 0 }).turn, 1);
});
test('joker: random games under every variant end with valid bot moves', () => {
  for (const rules of [{}, { penalty: 'twos', skipOn8: true, handSize: 5 }, { penalty: 'off', handSize: 10 }]) for (const n of [2, 3, 4]) for (let g = 0; g < 8; g++) {
    let s = joker.createInitialState(n, rules), k = 0;
    while (joker.checkResult(s).status === 'ongoing' && k++ < 3000) { const m = joker.botMove(s, s.turn); assert.equal(joker.isValidMove(s, s.turn, m), true); s = joker.applyMove(s, s.turn, m); }
    assert.notEqual(joker.checkResult(s).status, 'ongoing', JSON.stringify(rules));   // a win, or a deadlock ruling (fewest cards)
  }
});
test('joker: a stuck table (market empty, nobody can play) ends by fewest cards instead of looping forever', () => {
  let s = jk([[c('A', 'spades'), c('K', 'spades')], [c('Q', 'spades')]], {}, { market: [], pile: [c('5', 'hearts')] });
  s = joker.applyMove(s, 0, { type: 'market' }); assert.equal(joker.checkResult(s).status, 'ongoing');
  s = joker.applyMove(s, 1, { type: 'market' });
  assert.deepEqual(joker.checkResult(s), { status: 'win', winnerIndex: 1, reason: 'deadlock' });
});
test('joker: a penalty stack cannot owe more cards than remain', () => {
  const s = jk([[c('9')], [c('9', 'clubs')]], {}, { turn: 1, pendingPick: 5, market: Array.from({ length: 6 }, () => c('Q', 'clubs')), pile: [c('5', 'hearts')] });
  assert.equal(joker.isValidMove(s, 1, { type: 'play', index: 0 }), false);   // 5 + 9 > 6 cards left
});

// ---------- Whot ----------
const wh = (hands, rules, extra = {}) => ({ ...whot.createInitialState(hands.length, rules), hands, pile: [{ shape: 'circle', value: 4 }], market: Array.from({ length: 30 }, () => ({ shape: 'square', value: 10 })), turn: 0, pendingPick: 0, pendingType: null, calledShape: null, ...extra });
test('whot: deal count option and sanitising', () => {
  assert.equal(whot.createInitialState(2, { dealCount: 6 }).hands[0].length, 6);
  assert.equal(whot.createInitialState(2, { dealCount: 9 }).hands[0].length, 4);
});
test('whot: crossStack lets a Pick Three answer a Pick Two (default does not)', () => {
  const hands = [[{ shape: 'cross', value: 5 }], [{ shape: 'circle', value: 2 }, { shape: 'square', value: 5 }]];
  const pend = (rules) => wh(hands.map(h => h.slice()), rules, { turn: 1, pendingPick: 2, pendingType: 'two' });
  assert.equal(whot.isValidMove(pend({}), 1, { type: 'play', index: 1 }), false);
  assert.equal(whot.isValidMove(pend({ crossStack: true }), 1, { type: 'play', index: 1 }), true);
  const n = whot.applyMove(pend({ crossStack: true }), 1, { type: 'play', index: 1 }); assert.equal(n.pendingPick, 5);
});
test('whot: star 8 skips two players only when starDouble8 is on', () => {
  const mk = (rules) => wh([[{ shape: 'star', value: 8 }, { shape: 'circle', value: 1 }], [{ shape: 'circle', value: 3 }], [{ shape: 'circle', value: 7 }], [{ shape: 'circle', value: 10 }]], rules, { pile: [{ shape: 'star', value: 3 }] });
  assert.equal(whot.applyMove(mk({}), 0, { type: 'play', index: 0 }).turn, 3);
  assert.equal(whot.applyMove(mk({ starDouble8: false }), 0, { type: 'play', index: 0 }).turn, 2);
});
test('whot: noPowerFinish makes you pick one instead of winning on a power card', () => {
  const mk = (rules) => wh([[{ shape: 'circle', value: 2 }], [{ shape: 'circle', value: 3 }]], rules);
  assert.equal(whot.checkResult(whot.applyMove(mk({}), 0, { type: 'play', index: 0 })).status, 'win');
  const n = whot.applyMove(mk({ noPowerFinish: true }), 0, { type: 'play', index: 0 });
  assert.equal(whot.checkResult(n).status, 'ongoing'); assert.equal(n.hands[0].length, 1);
  const plain = wh([[{ shape: 'circle', value: 3 }], [{ shape: 'circle', value: 7 }]], { noPowerFinish: true });
  assert.equal(whot.checkResult(whot.applyMove(plain, 0, { type: 'play', index: 0 })).status, 'win');
});
test('whot: random games under every variant end with valid moves', () => {
  for (const rules of [{}, { dealCount: 6, crossStack: true, starDouble8: false, noPowerFinish: true }]) for (const n of [2, 3, 4]) for (let g = 0; g < 8; g++) {
    let s = whot.createInitialState(n, rules), k = 0;
    while (whot.checkResult(s).status === 'ongoing' && k++ < 4000) { const m = whot.botMove(s, s.turn); assert.equal(whot.isValidMove(s, s.turn, m), true); s = whot.applyMove(s, s.turn, m); }
    assert.equal(whot.checkResult(s).status, 'win', JSON.stringify(rules));
  }
});

// ---------- Word Clash ----------
test('words: premium board scoring (DL, TL, DW, TW) and classic unchanged', () => {
  const base = words.wordScore('QUIZ');
  assert.equal(words.wordScore('QUIZ', { type: 'none' }), base);
  assert.equal(words.wordScore('QUIZ', { type: 'DW' }), base * 2);
  assert.equal(words.wordScore('QUIZ', { type: 'TW' }), base * 3);
  assert.equal(words.wordScore('QUIZ', { type: 'DL', letter: 'Q' }), base + 10);
  assert.equal(words.wordScore('QUIZ', { type: 'TL', letter: 'Z' }), base + 20);
  assert.equal(words.wordScore('QUIZ', { type: 'DL', letter: 'E' }), base);
});
test('words: premium state shows this turn and the next; classic shows none; rules are sanitised', () => {
  const p = words.createInitialState(2, { board: 'premium', length: 12 });
  const pub = words.publicState(p, 0);
  assert.ok(pub.premium && pub.nextPremium); assert.equal(pub.maxPlays, 12); assert.equal(pub.board, 'premium');
  assert.equal(words.publicState(words.createInitialState(2), 0).premium, null);
  assert.deepEqual(words.cleanRules({ board: 'x', length: 5 }), { board: 'classic', length: 24 });
});
test('words: the premium of the turn is applied to the played word, and the game length is honoured', () => {
  let s = words.createInitialState(2, { board: 'premium', length: 12 });
  s.premiums[0] = { type: 'TW' }; s.hands[0] = ['C', 'A', 'T', 'X', 'X', 'X', 'X'];
  const n = words.applyMove(s, 0, { word: 'CAT' });
  assert.equal(n.scores[0], words.wordScore('CAT') * 3); assert.equal(n.turnNo, 1);
  assert.equal(words.checkResult({ ...n, plays: 12 }).status !== 'ongoing', true);
  assert.equal(words.checkResult({ ...n, plays: 11 }).status, 'ongoing');
});
test('whot regression: a Pick Three (5) is answered by another 5 and stacks +3, not by a plain 3', () => {
  const hands = [[{ shape: 'cross', value: 9 }], [{ shape: 'circle', value: 3 }, { shape: 'square', value: 5 }]];
  const pend = wh(hands, {}, { turn: 1, pendingPick: 3, pendingType: 'three' });
  assert.equal(whot.isValidMove(pend, 1, { type: 'play', index: 0 }), false);
  assert.equal(whot.isValidMove(pend, 1, { type: 'play', index: 1 }), true);
  assert.equal(whot.applyMove(pend, 1, { type: 'play', index: 1 }).pendingPick, 6);
});
