const test = require('node:test');
const assert = require('node:assert');
const W = require('../games/words');
const { selectHighlights } = require('../utils/highlights');
const shop = require('../config/shop');

test('words: full dictionary accepts real words and rejects junk', () => {
  assert.ok(W.DICTIONARY.size > 50000);
  const s = { ...W.createInitialState(), turn: 0, hands: [['Q','U','I','Z','A','B','C'], []] };
  assert.ok(W.isValidMove(s, 0, { word: 'quiz' }));
  assert.ok(!W.isValidMove(s, 0, { word: 'qzzzz' }));
  assert.ok(!W.isValidMove(s, 0, { word: 'cabs' }));   // no S in rack
});
test('words: letter values + length bonus, tile refill and masking', () => {
  assert.strictEqual(W.wordScore('QI'), 11);
  assert.strictEqual(W.wordScore('QUIZ'), 10 + 1 + 1 + 10 + 1);
  let s = W.createInitialState();
  const total = s.bag.length + 14;
  assert.strictEqual(total, 98);
  const w = W.botMove(s, 0); assert.ok(W.isValidMove(s, 0, w));
  s = W.applyMove(s, 0, w);
  assert.strictEqual(s.hands[0].length, 7);
  assert.strictEqual(s.bag.length + s.hands[0].length + s.hands[1].length + (w.word ? w.word.length : 0), 98);
  assert.ok(W.publicState(s, 0).hands[1].every(c => c === '?'));
  assert.ok(!('bag' in W.publicState(s, 0)));
});
test('words: swap redraws the rack, bots finish games', () => {
  let s = W.createInitialState(); const before = s.hands[0].join('');
  s = W.applyMove(s, 0, { swap: true });
  assert.strictEqual(s.hands[0].length, 7); assert.strictEqual(s.turn, 1);
  let n = 0; while (W.checkResult(s).status === 'ongoing' && n++ < 200) { const t = s.turn, m = W.botMove(s, t); assert.ok(W.isValidMove(s, t, m)); s = W.applyMove(s, t, m); }
  assert.notStrictEqual(W.checkResult(s).status, 'ongoing');
});
test('highlights carry before/after public states', () => {
  const E = require('../games/connectfour'); let s = E.createInitialState(2); const moves = [];
  for (let k = 0; k < 8; k++) { const t = s.turn ?? k % 2, m = E.botMove(s, t); const before = k ? undefined : JSON.parse(JSON.stringify(s)); s = E.applyMove(s, t, m); moves.push({ player: t, move: m, at: k, state: JSON.parse(JSON.stringify(s)), ...(before ? { before } : {}) }); }
  const hl = selectHighlights('connectfour', moves, 0, E.publicState);
  assert.ok(hl.length && hl.every(h => h.state && h.prev));
});
test('shop: free defaults owned, paid items locked until bought', () => {
  assert.ok(shop.owns({ cosmetics: [] }, 'roomBg', 'classic'));
  assert.ok(!shop.owns({ cosmetics: [] }, 'roomBg', 'sunset'));
  assert.ok(shop.owns({ cosmetics: ['roomBg:sunset'] }, 'roomBg', 'sunset'));
  assert.strictEqual(shop.sanitizeEquipped({ cosmetics: [], equipped: { roomBg: 'sunset' } }).roomBg, 'classic');
});

test('snakes: every game gets a fresh, valid random board', () => {
  const S = require('../games/snakes');
  const seen = new Set();
  for (let g = 0; g < 200; g++) {
    const j = S.createInitialState().jumps, ks = Object.keys(j).map(Number);
    seen.add(JSON.stringify(j));
    const squares = new Set([...ks, ...Object.values(j)]);
    assert.strictEqual(squares.size, ks.length * 2, 'no square used twice');
    assert.ok(!squares.has(1) && !squares.has(100), 'nothing on start/finish');
    assert.ok(ks.every(k => Math.abs(j[k] - k) >= 10), 'no tiny hops');
    assert.ok(ks.filter(k => j[k] < k).length >= 5 && ks.filter(k => j[k] > k).length >= 5, 'both snakes and ladders');
  }
  assert.ok(seen.size > 190, 'boards differ between games');
  let s = S.createInitialState(), n = 0; while (S.checkResult(s).status === 'ongoing' && n++ < 5000) s = S.applyMove(s, s.turn, { type: 'roll' });
  assert.strictEqual(S.checkResult(s).status, 'win');
});
test('shop: announcer styles are a purchasable category', () => {
  assert.ok(shop.owns({ cosmetics: [] }, 'announcer', 'classic'));
  assert.ok(!shop.owns({ cosmetics: [] }, 'announcer', 'hype'));
  assert.strictEqual(shop.sanitizeEquipped({ cosmetics: ['announcer:naija'], equipped: { announcer: 'naija' } }).announcer, 'naija');
  assert.strictEqual(shop.sanitizeEquipped({ cosmetics: [], equipped: { announcer: 'naija' } }).announcer, 'classic');
});
