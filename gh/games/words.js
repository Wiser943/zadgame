// Word Clash engine — Scrabble-style tile bag, letter values, full dictionary.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- dictionary (data/words.txt, generated from the `word-list` package; 2–7 letters) ----
const FALLBACK = ['CAT','DOG','GAME','PLAY','WIN','WORD','FUN','CODE','BOARD','GO','LUDO','CHESS','CARD','COIN','STAR','HOME','BLUE','RED','SUN','MOON','TREE','BOOK','TEAM','ACE','TWO','ONE'];
let WORDS = FALLBACK;
try {
  WORDS = fs.readFileSync(path.join(__dirname, '..', 'data', 'words.txt'), 'utf8').split('\n').map(w => w.trim().toUpperCase()).filter(Boolean);
} catch (e) { console.warn('[words] dictionary file missing, using tiny fallback list'); }
const DICTIONARY = new Set(WORDS);

// ---- tiles ----
const VALUES = { A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10 };
const DIST = { A:9,B:2,C:2,D:4,E:12,F:2,G:3,H:2,I:9,J:1,K:1,L:4,M:2,N:6,O:8,P:2,Q:1,R:6,S:4,T:6,U:4,V:2,W:2,X:1,Y:2,Z:1 };
const VOWELS = new Set(['A','E','I','O','U']);
const HAND = 7;
const MAX_PLAYS = 24;       // total words played before the game is decided on score
const MAX_IDLE_SWAPS = 4;   // consecutive swaps (no word played) that end the game

const rnd = n => crypto.randomInt(n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function newBag() { const b = []; for (const [l, n] of Object.entries(DIST)) for (let i = 0; i < n; i++) b.push(l); return shuffle(b); }
const vowelCount = h => h.filter(c => VOWELS.has(c)).length;

// Draw tiles for a rack, then nudge it so nobody gets a hopeless all-consonant / all-vowel rack.
function drawFair(hand, bag, n) {
  for (let k = 0; k < n && bag.length; k++) hand.push(bag.pop());
  const target = hand.length >= 5 ? 2 : 1;
  const fix = (wantVowel) => {
    for (let guard = 0; guard < 4; guard++) {
      const have = vowelCount(hand);
      const ok = wantVowel ? have >= target : (hand.length - have) >= target;
      if (ok) return;
      const bi = bag.findIndex(c => VOWELS.has(c) === wantVowel); if (bi < 0) return;
      const hi = hand.findIndex(c => VOWELS.has(c) !== wantVowel); if (hi < 0) return;
      const t = hand[hi]; hand[hi] = bag[bi]; bag[bi] = t; // swap one tile back into the bag
    }
  };
  fix(true); fix(false);
  shuffle(bag); // keep the bag order unpredictable after the swap
  return hand;
}

// Room options: board 'classic' (default) | 'premium' (each turn has a premium square), length 12 | 24 (default) | 36 words.
// Premium squares: DL/TL double or triple one letter if your word uses it, DW/TW double or triple the whole word.
const DEFAULT_RULES = { board: 'classic', length: 24 };
const cleanRules = (r) => ({ board: r && r.board === 'premium' ? 'premium' : 'classic', length: [12, 24, 36].includes(Number(r && r.length)) ? Number(r.length) : 24 });
function makePremiums(count) {
  const kinds = ['DL', 'DL', 'TL', 'DW', 'DW', 'TW', 'none', 'none', 'none'], letters = 'AEIOURSTLNDGBCMPHFWYK';
  return Array.from({ length: count + 8 }, () => { const type = kinds[rnd(kinds.length)]; return type === 'DL' || type === 'TL' ? { type, letter: letters[rnd(letters.length)] } : { type }; });
}
function wordScore(word, prem) {
  if (prem && prem.type !== 'none') {
    const w = String(word || '').toUpperCase(); let s = 0, used = false;
    for (const ch of w) { let v = VALUES[ch] || 0; if ((prem.type === 'DL' || prem.type === 'TL') && prem.letter === ch && !used) { v *= prem.type === 'TL' ? 3 : 2; used = true; } s += v; }
    const len = w.length; s += (len >= 4 ? (len - 3) ** 2 : 0);
    return prem.type === 'DW' ? s * 2 : prem.type === 'TW' ? s * 3 : s;
  }
  return wordScoreBase(word);
}
function wordScoreBase(word) {
  const w = String(word || '').toUpperCase();
  let s = 0; for (const ch of w) s += VALUES[ch] || 0;
  const len = w.length;
  return s + (len >= 4 ? (len - 3) ** 2 : 0);   // length bonus: 4→+1, 5→+4, 6→+9, 7→+16
}

function createInitialState(_n, options) {
  const rules = cleanRules(options), bag = newBag();
  return { rules, premiums: rules.board === 'premium' ? makePremiums(rules.length) : null, hands: [drawFair([], bag, HAND), drawFair([], bag, HAND)], bag, scores: [0, 0], turn: 0, words: [], plays: 0, idleSwaps: 0 };
}
const maxPlaysOf = (s) => s.rules?.length || MAX_PLAYS;
const premiumNow = (s) => (s.premiums ? s.premiums[s.turnNo || 0] || { type: 'none' } : null);

function canMake(hand, word) {
  const pool = hand.slice();
  for (const ch of word) { const i = pool.indexOf(ch); if (i < 0) return false; pool.splice(i, 1); }
  return true;
}

function isValidMove(s, i, m) {
  if (s.turn !== i) return false;
  if (m && m.swap === true) return s.bag.length > 0;
  if (m && m.pass === true) return s.bag.length === 0;   // nothing left to draw: you may pass if you cannot play
  const word = String(m?.word || '').trim().toUpperCase();
  return /^[A-Z]{2,7}$/.test(word) && DICTIONARY.has(word) && canMake(s.hands[i], word);
}

function applyMove(s, i, m) {
  const hands = s.hands.map(h => h.slice()), bag = s.bag.slice();
  if (m.pass === true) return { ...s, turn: 1 - i, idleSwaps: (s.idleSwaps || 0) + 1, turnNo: (s.turnNo || 0) + 1 };
  if (m.swap === true) {
    bag.push(...hands[i]); hands[i] = []; shuffle(bag);
    drawFair(hands[i], bag, HAND);
    return { ...s, hands, bag, turn: 1 - i, idleSwaps: (s.idleSwaps || 0) + 1, turnNo: (s.turnNo || 0) + 1 };
  }
  const word = String(m.word).trim().toUpperCase();
  for (const ch of word) hands[i].splice(hands[i].indexOf(ch), 1);
  drawFair(hands[i], bag, HAND - hands[i].length);
  const pts = wordScore(word, premiumNow(s));
  return { ...s, hands, bag, scores: s.scores.map((x, n) => n === i ? x + pts : x), words: [...s.words, { player: i, word, pts }],
    plays: (s.plays || 0) + 1, idleSwaps: 0, turn: 1 - i, turnNo: (s.turnNo || 0) + 1 };
}

function checkResult(s) {
  const byScore = () => s.scores[0] === s.scores[1] ? { status: 'draw' } : { status: 'win', winnerIndex: s.scores[0] > s.scores[1] ? 0 : 1 };
  // Bag is empty and someone used their last tile: they win outright.
  const out = s.hands.findIndex((h, n) => h.length === 0 && s.words.some(w => w.player === n));
  if (out >= 0 && s.bag.length === 0) return { status: 'win', winnerIndex: out };
  if ((s.plays || 0) >= maxPlaysOf(s) || (s.idleSwaps || 0) >= MAX_IDLE_SWAPS) return byScore();
  return { status: 'ongoing' };
}

// Bot: best-scoring word it can make (picks randomly among its top 3 so it isn't perfectly predictable); swaps if it has nothing.
function botMove(s, i) {
  const hand = s.hands[i], counts = new Array(26).fill(0);
  for (const ch of hand) counts[ch.charCodeAt(0) - 65]++;
  const best = [];
  for (const w of WORDS) {
    if (w.length > hand.length) continue;
    const c = counts.slice(); let ok = true;
    for (let k = 0; k < w.length; k++) { const x = w.charCodeAt(k) - 65; if (--c[x] < 0) { ok = false; break; } }
    if (!ok) continue;
    const sc = wordScore(w, premiumNow(s));
    if (best.length < 3 || sc > best[best.length - 1].sc) { best.push({ w, sc }); best.sort((a, b) => b.sc - a.sc); if (best.length > 3) best.pop(); }
  }
  if (best.length) return { word: best[rnd(best.length)].w };
  return s.bag.length ? { swap: true } : { pass: true };
}

// Opponent racks and the bag order are never sent to clients.
function publicState(s, i) {
  return { hands: s.hands.map((h, n) => n === i ? h : h.map(() => '?')), bagCount: s.bag.length, scores: s.scores, turn: s.turn, words: s.words,
    plays: s.plays, maxPlays: maxPlaysOf(s), idleSwaps: s.idleSwaps, values: VALUES, premium: premiumNow(s), nextPremium: s.premiums ? s.premiums[(s.turnNo || 0) + 1] || { type: 'none' } : null, board: s.rules?.board || 'classic' };
}

module.exports = { DEFAULT_RULES, cleanRules, premiumNow, createInitialState, isValidMove, applyMove, checkResult, botMove, publicState, wordScore, VALUES, DICTIONARY, drawFair, newBag };
