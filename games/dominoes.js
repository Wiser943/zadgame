// Dominoes (draw game), 2-4 players, double-six set. 7 tiles each (5 when 3-4 play). The holder of the highest double
// opens with it. Play a tile on either end of the line; if you cannot, you draw from the boneyard until you can
// (done automatically), and pass when the boneyard is empty. First to empty their hand wins and scores the pips left in
// the other hands; if everyone is blocked, the lowest pip total wins (equal = draw). Hands and boneyard are private.
const crypto = require('crypto');
const pips = (t) => t[0] + t[1];
const sumPips = (h) => h.reduce((a, t) => a + pips(t), 0);
function shuffled() {
  const deck = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) deck.push([a, b]);
  for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
function createInitialState(playerCount = 2) {
  const n = Math.max(2, Math.min(4, Number(playerCount) || 2)), per = n === 2 ? 7 : 5, deck = shuffled();
  const hand = Array.from({ length: n }, () => deck.splice(0, per));
  // opening tile: highest double, otherwise the heaviest tile
  let open = null, turn = 0;
  hand.forEach((h, p) => h.forEach((t) => { const score = (t[0] === t[1] ? 100 : 0) + pips(t); if (!open || score > open.score) { open = { score, tile: t }; turn = p; } }));
  return { hand, boneyard: deck, chain: [], turn, playerCount: n, out: Array(n).fill(false), passes: 0, opening: open.tile.slice(), lastEvent: null, over: null };
}
const ends = (s) => (s.chain.length ? [s.chain[0][0], s.chain[s.chain.length - 1][1]] : null);
function fits(s, t) {
  const e = ends(s); if (!e) return [];
  const out = []; if (t[0] === e[0] || t[1] === e[0]) out.push('left'); if (t[0] === e[1] || t[1] === e[1]) out.push('right'); return out;
}
function legalMoves(s, i = s.turn) {
  if (s.over || s.turn !== i || s.out[i]) return [];
  const out = [];
  s.hand[i].forEach((t, index) => {
    if (!s.chain.length) { if (t[0] === s.opening[0] && t[1] === s.opening[1]) out.push({ index, end: 'right' }); return; }
    fits(s, t).forEach((end) => out.push({ index, end }));
  });
  return out;
}
function isValidMove(s, i, m) {
  if (!m || !Number.isInteger(m.index) || !s.hand[i] || !s.hand[i][m.index]) return false;
  const list = legalMoves(s, i);
  return m.end == null ? list.some((x) => x.index === m.index) : list.some((x) => x.index === m.index && x.end === m.end);
}
const nextActive = (s, from) => { for (let k = 1; k <= s.playerCount; k++) { const p = (from + k) % s.playerCount; if (!s.out[p]) return p; } return from; };
const playable = (s, p) => s.hand[p].some((t) => !s.chain.length || fits(s, t).length);

// Move the turn to the next player who can act, drawing for them when they are stuck. Detects blocked games.
function advance(s, from) {
  const active = s.out.filter((o) => !o).length;
  let p = from, passes = 0, drawn = 0;
  for (;;) {
    p = nextActive(s, p);
    while (!playable(s, p) && s.boneyard.length) { s.hand[p].push(s.boneyard.pop()); drawn++; }
    if (playable(s, p)) { s.turn = p; s.passes = 0; s.lastEvent = { ...(s.lastEvent || {}), drew: drawn ? { player: p, count: drawn } : null }; return; }
    passes++; if (passes >= active) break;
  }
  const totals = s.hand.map((h, q) => (s.out[q] ? Infinity : sumPips(h))), low = Math.min(...totals);
  const winners = totals.map((x, q) => (x === low ? q : -1)).filter((q) => q >= 0);
  s.over = { reason: 'blocked', winner: winners.length === 1 ? winners[0] : null, points: totals.reduce((a, x, q) => (x === Infinity || q === winners[0] ? a : a + x), 0) };
}
function applyMove(s, i, m) {
  if (!isValidMove(s, i, m)) return s;
  const next = { ...s, hand: s.hand.map((h) => h.slice()), boneyard: s.boneyard.slice(), chain: s.chain.map((t) => t.slice()), over: null };
  const tile = next.hand[i].splice(m.index, 1)[0];
  const end = m.end || (next.chain.length ? fits(s, tile)[0] : 'right'), e = ends(next);
  if (!next.chain.length) next.chain.push(tile);
  else if (end === 'left') next.chain.unshift(tile[1] === e[0] ? tile : [tile[1], tile[0]]);
  else next.chain.push(tile[0] === e[1] ? tile : [tile[1], tile[0]]);
  next.lastEvent = { player: i, tile, end: next.chain.length === 1 ? 'start' : end, drew: null };
  if (!next.hand[i].length) { next.over = { reason: 'domino', winner: i, points: next.hand.reduce((a, h, q) => (q === i || next.out[q] ? a : a + sumPips(h)), 0) }; return next; }
  advance(next, i);
  return next;
}
function checkResult(s) {
  if (!s.over) return { status: 'ongoing' };
  return s.over.winner == null ? { status: 'draw', reason: s.over.reason } : { status: 'win', winnerIndex: s.over.winner, reason: s.over.reason, points: s.over.points };
}
function publicState(s, i) {
  return { chain: s.chain, ends: ends(s), turn: s.turn, playerCount: s.playerCount, out: s.out, over: s.over, lastEvent: s.lastEvent, opening: s.chain.length ? null : s.opening,
    hand: s.hand.map((h, p) => (p === i ? h : h.map(() => null))), counts: s.hand.map((h) => h.length), boneyardCount: s.boneyard.length,
    legal: legalMoves(s, i) };
}
function markOut(s, p) {
  const next = { ...s, out: s.out.slice(), hand: s.hand.map((h) => h.slice()), boneyard: s.boneyard.concat(s.hand[p]) };
  next.out[p] = true; next.hand[p] = [];
  const left = next.out.map((o, q) => (o ? -1 : q)).filter((q) => q >= 0);
  if (left.length <= 1) { next.over = { reason: 'lastPlayer', winner: left[0] ?? null, points: 0 }; return next; }
  if (next.turn === p) advance(next, p);
  return next;
}
function botMove(s, i) {
  const list = legalMoves(s, i); if (!list.length) return null;
  const score = (m) => { const t = s.hand[i][m.index]; return (t[0] === t[1] ? 4 : 0) + pips(t) * 0.5 + Math.random(); };   // shed heavy tiles and doubles first
  return list.map((m) => ({ m, v: score(m) })).sort((a, b) => b.v - a.v)[0].m;
}
module.exports = { createInitialState, isValidMove, applyMove, checkResult, publicState, botMove, markOut, legalMoves };
