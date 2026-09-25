// Pure logic, no I/O. Classic Nigerian card game Whot!, 2-4 players.
// Ported from the rules in the reference `whot` engine (card shapes, deck
// composition, and the five special-card powers), reshaped into this
// project's createInitialState/isValidMove/applyMove/checkResult/publicState
// pattern (see rps.js / ludo.js for the same shape).
//
// Deck: 54 cards across 6 shapes (circle, triangle, cross, square, star,
// whot), matching the reference deck exactly:
//   circle/triangle: 1,2,3,4,5,7,8,10,11,12,13,14  (12 each)
//   cross/square:     1,2,3,5,7,10,11,13,14           (9 each)
//   star:             1,2,3,4,5,7,8                   (7)
//   whot:             20 x5                            (wild)
//
// A card is playable if it shares a shape or value with the top of the pile
// (or the shape last "called" after a Whot card), or if it's a Whot card
// itself. Special values:
//   1  Hold On        - the player who plays it takes another turn
//   2  Pick Two        - the next player must draw 2 (or counter with their
//                        own Pick Two to stack it onto the player after them)
//   5  Pick Three       - same as Pick Two, but for 3 cards
//   8  Suspension       - skips the next player; skips 2 players if it's a
//                        Star-shaped 8
//   14 General Market   - every other player draws 1 card
//   20 Whot (wild)      - playable on anything; the player calls a shape
//                        (circle/triangle/cross/square/star) that the next
//                        card must match
//
// Simplification vs. a full ruleset: while a pick obligation is outstanding
// a player may only counter with a matching Pick Two/Three or draw the owed
// cards — ordinary cards can't be played until the obligation clears. A
// player also wins immediately on playing their last card, with no special
// case for ending on a power card. Market re-shuffles the discard pile
// (keeping the top card in play) whenever it runs out.

const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
const DECK_SPEC = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
  whot: [20, 20, 20, 20, 20]
};
const DEAL_COUNT = 4; // cards dealt to each player at the start (matches the reference engine)

function buildDeck() {
  const cards = [];
  Object.keys(DECK_SPEC).forEach((shape) => DECK_SPEC[shape].forEach((value) => cards.push({ shape, value })));
  return cards;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Moves an "active" (still in the game) player forward `hops` steps from
// `from`, skipping anyone marked inactive (forfeited). hops=0 returns the
// same player (used by Hold On); hops=1 is a normal turn advance.
function nextActive(state, from, hops) {
  if (!state.active.some(Boolean)) return from;
  let idx = from;
  for (let k = 0; k < hops; k++) {
    let guard = 0;
    do { idx = (idx + 1) % state.playerCount; guard++; } while (!state.active[idx] && guard <= state.playerCount);
  }
  return idx;
}

function ensureMarket(s, need) {
  while (s.market.length < need && s.pile.length > 1) {
    const top = s.pile[s.pile.length - 1];
    const rest = s.pile.slice(0, -1);
    s.market = s.market.concat(shuffle(rest));
    s.pile = [top];
  }
}

function drawCards(s, playerIndex, n) {
  ensureMarket(s, n);
  const take = Math.min(n, s.market.length);
  const drawn = s.market.splice(0, take);
  s.hands[playerIndex] = s.hands[playerIndex].concat(drawn);
}

function drawForOthers(s, playerIndex, n) {
  for (let i = 0; i < s.playerCount; i++) {
    if (i === playerIndex || !s.active[i]) continue;
    drawCards(s, i, n);
  }
}

function cardMatchesTop(card, state) {
  if (card.shape === 'whot') return true;
  if (state.calledShape) return card.shape === state.calledShape;
  const top = state.pile[state.pile.length - 1];
  return card.shape === top.shape || card.value === top.value;
}

function hasPlayableCard(state, playerIndex) {
  const hand = state.hands[playerIndex];
  if (state.pendingPick > 0) {
    const neededValue = state.pendingType === 'two' ? 2 : 3;
    return hand.some((c) => c.value === neededValue);
  }
  return hand.some((c) => cardMatchesTop(c, state));
}

function createInitialState(playerCount) {
  const n = Math.min(4, Math.max(2, playerCount || 2));
  const deck = shuffle(buildDeck());
  const hands = Array.from({ length: n }, () => []);
  for (let round = 0; round < DEAL_COUNT; round++) {
    for (let p = 0; p < n; p++) hands[p].push(deck.pop());
  }
  // Avoid opening on a wild card — reshuffle and redraw if the flip is a Whot.
  let first = deck.pop();
  while (first.shape === 'whot' && deck.length) {
    deck.unshift(first);
    const reshuffled = shuffle(deck);
    deck.length = 0;
    deck.push(...reshuffled);
    first = deck.pop();
  }
  return {
    playerCount: n,
    hands,
    market: deck,
    pile: [first],
    turn: 0,
    active: Array(n).fill(true),
    pendingPick: 0,
    pendingType: null,
    calledShape: null
  };
}

function isValidMove(state, playerIndex, move) {
  if (state.turn !== playerIndex || !state.active[playerIndex] || !move) return false;

  if (move.type === 'market') return state.pendingPick > 0 || !hasPlayableCard(state, playerIndex);

  if (move.type === 'play') {
    const card = state.hands[playerIndex][move.index];
    if (!card) return false;
    if (state.pendingPick > 0) {
      const neededValue = state.pendingType === 'two' ? 2 : 3;
      return card.value === neededValue;
    }
    if (card.shape === 'whot') return SHAPES.includes(move.calledShape);
    return cardMatchesTop(card, state);
  }
  return false;
}

function applyMove(state, playerIndex, move) {
  const s = {
    ...state,
    hands: state.hands.map((h) => h.slice()),
    market: state.market.slice(),
    pile: state.pile.slice(),
    active: state.active.slice()
  };

  if (move.type === 'market') {
    const n = s.pendingPick > 0 ? s.pendingPick : 1;
    drawCards(s, playerIndex, n);
    s.pendingPick = 0;
    s.pendingType = null;
    s.turn = nextActive(s, playerIndex, 1);
    return s;
  }

  // move.type === 'play'
  const card = s.hands[playerIndex][move.index];
  s.hands[playerIndex].splice(move.index, 1);
  s.pile.push(card);

  if (s.pendingPick > 0) {
    // Countering a Pick Two/Three with a matching card stacks it onto the next player.
    s.pendingPick += card.value;
    s.pendingType = card.value === 2 ? 'two' : 'three';
    s.calledShape = null;
    s.turn = nextActive(s, playerIndex, 1);
    return s;
  }

  s.calledShape = card.shape === 'whot' ? move.calledShape : null;
  switch (card.value) {
    case 1: // Hold On — same player goes again
      s.turn = playerIndex;
      break;
    case 2: // Pick Two
      s.pendingPick = 2; s.pendingType = 'two';
      s.turn = nextActive(s, playerIndex, 1);
      break;
    case 5: // Pick Three
      s.pendingPick = 3; s.pendingType = 'three';
      s.turn = nextActive(s, playerIndex, 1);
      break;
    case 8: // Suspension — skip 1 player, or 2 if it's a Star
      s.turn = nextActive(s, playerIndex, card.shape === 'star' ? 3 : 2);
      break;
    case 14: // General Market — everyone else draws 1
      drawForOthers(s, playerIndex, 1);
      s.turn = nextActive(s, playerIndex, 1);
      break;
    default: // plain card, or Whot(20) wild
      s.turn = nextActive(s, playerIndex, 1);
  }
  return s;
}

function checkResult(state) {
  for (let i = 0; i < state.playerCount; i++) {
    if (state.active[i] && state.hands[i].length === 0) return { status: 'win', winnerIndex: i };
  }
  return { status: 'ongoing' };
}

// Called by sockets/index.js when a player forfeits (left or timed out) so
// the remaining players' turns keep flowing without them.
function markOut(state, playerIndex) {
  const s = { ...state, active: state.active.slice() };
  s.active[playerIndex] = false;
  if (s.turn === playerIndex) s.turn = nextActive(s, playerIndex, 1);
  return s;
}

// Hides other players' hands, revealing only counts; the requesting player
// sees their own hand in full plus the shared pile/market/turn state.
function publicState(state, playerIndex) {
  const top = state.pile[state.pile.length - 1];
  return {
    playerCount: state.playerCount,
    turn: state.turn,
    active: state.active,
    topCard: top,
    calledShape: state.calledShape,
    pendingPick: state.pendingPick,
    pendingType: state.pendingType,
    marketCount: state.market.length,
    handCounts: state.hands.map((h) => h.length),
    hand: (state.hands[playerIndex] || []).slice()
  };
}

module.exports = { createInitialState, isValidMove, applyMove, checkResult, markOut, publicState };
