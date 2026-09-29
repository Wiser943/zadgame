// Standard-deck Joker shedding game for 2–4 players.
// Cards match by suit or rank. Jokers are wild. Every numbered card 2–10
// is a penalty card and numbered cards stack their values.
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const PENALTY = new Set(RANKS.filter(rank => /^\d+$/.test(rank)));
const DEAL = 7;
function buildDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ suit, rank, joker: false });
  cards.push({ suit: null, rank: 'Joker', joker: true }, { suit: null, rank: 'Joker', joker: true });
  return cards;
}
function shuffle(a) { const out = a.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }
function nextActive(s, from) { for (let n = 1; n <= s.playerCount; n++) { const i = (from + n) % s.playerCount; if (s.active[i]) return i; } return from; }
function ensureMarket(s, needed = 1) {
  while (s.market.length < needed && s.pile.length > 1) { const top = s.pile[s.pile.length - 1]; s.market = s.market.concat(shuffle(s.pile.slice(0, -1))); s.pile = [top]; }
}
function draw(s, player, count) { ensureMarket(s, count); s.hands[player] = s.hands[player].concat(s.market.splice(0, count)); }
function cardMatches(card, s) {
  if (card.joker) return true;
  const top = s.pile[s.pile.length - 1];
  if (s.calledSuit) return card.suit === s.calledSuit;
  return card.suit === top.suit || card.rank === top.rank;
}
function playable(card, s) {
  if (s.pendingPick > 0) return PENALTY.has(card.rank);
  return cardMatches(card, s);
}
function hasPlayable(s, p) { return s.hands[p].some(c => playable(c, s)); }
function createInitialState(playerCount) {
  const n = Math.min(4, Math.max(2, Number(playerCount) || 2)), deck = shuffle(buildDeck()), hands = Array.from({ length: n }, () => []);
  for (let k = 0; k < DEAL; k++) for (let p = 0; p < n; p++) hands[p].push(deck.pop());
  let first = deck.pop();
  while (first?.joker && deck.length) { deck.unshift(first); const reshuffled = shuffle(deck); deck.length = 0; deck.push(...reshuffled); first = deck.pop(); }
  return { playerCount: n, hands, market: deck, pile: [first], turn: 0, active: Array(n).fill(true), pendingPick: 0, calledSuit: null, lastAction: null };
}
function isValidMove(s, player, move) {
  if (!s.active[player] || s.turn !== player || !move) return false;
  if (move.type === 'market') return !hasPlayable(s, player);
  if (move.type !== 'play' || !Number.isInteger(move.index)) return false;
  const card = s.hands[player][move.index]; if (!card || !playable(card, s)) return false;
  if (card.joker) return SUITS.includes(move.calledSuit);
  return true;
}
function applyMove(state, player, move) {
  const s = { ...state, hands: state.hands.map(h => h.slice()), market: state.market.slice(), pile: state.pile.slice(), active: state.active.slice() };
  if (move.type === 'market') {
    const count = s.pendingPick || 1; draw(s, player, count); s.lastAction = { type: 'draw', player, count }; s.pendingPick = 0; s.turn = nextActive(s, player); s.calledSuit = null; return s;
  }
  const card = s.hands[player].splice(move.index, 1)[0]; s.pile.push(card); s.lastAction = { type: 'play', player, card };
  if (s.pendingPick > 0) {
    s.pendingPick += Number(card.rank);
    s.calledSuit = null; s.turn = nextActive(s, player); return s;
  }
  if (card.joker) { s.calledSuit = move.calledSuit; s.pendingPick = 0; }
  else if (PENALTY.has(card.rank)) { s.pendingPick = Number(card.rank); s.calledSuit = null; }
  else { s.pendingPick = 0; s.calledSuit = null; }
  s.turn = nextActive(s, player); return s;
}
function checkResult(s) { for (let i = 0; i < s.playerCount; i++) if (s.active[i] && s.hands[i].length === 0) return { status: 'win', winnerIndex: i }; return { status: 'ongoing' }; }
function markOut(state, player) { const s = { ...state, active: state.active.slice(), hands: state.hands.map(h => h.slice()) }; s.active[player] = false; s.hands[player] = []; if (s.turn === player) s.turn = nextActive(s, player); return s; }
function publicState(s, player) { return { playerCount: s.playerCount, turn: s.turn, active: s.active, topCard: s.pile[s.pile.length - 1], calledSuit: s.calledSuit, pendingPick: s.pendingPick, marketCount: s.market.length, handCounts: s.hands.map(h => h.length), hand: (s.hands[player] || []).slice(), lastAction: s.lastAction }; }
function botMove(s, player) {
  const hand = s.hands[player];
  if (s.pendingPick > 0) { const stack = hand.findIndex(c => PENALTY.has(c.rank)); return stack >= 0 ? { type: 'play', index: stack } : { type: 'market' }; }
  let idx = hand.findIndex(c => !c.joker && cardMatches(c, s));
  if (idx < 0) idx = hand.findIndex(c => c.joker);
  if (idx < 0) return { type: 'market' };
  const card = hand[idx];
  if (card.joker) { const counts = Object.fromEntries(SUITS.map(x => [x, 0])); hand.forEach(c => { if (!c.joker) counts[c.suit]++; }); return { type: 'play', index: idx, calledSuit: SUITS.sort((a,b) => counts[b] - counts[a])[0] }; }
  return { type: 'play', index: idx };
}
module.exports = { createInitialState, isValidMove, applyMove, checkResult, markOut, publicState, botMove, SUITS, SUIT_SYMBOLS, RANKS };
