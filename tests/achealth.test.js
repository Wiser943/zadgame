// Health app rules (utils/achealth.js): getting ill, getting worse, hospital admission, pharmacy shelves and prices.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../utils/achealth');

const NOW = Date.UTC(2026, 10, 5, 12), HOUR = 3600000;

test('a healthy player is checked at most every 6 hours', () => {
  let r = H.tick(null, NOW, () => 0.9); assert.equal(r.h.ill, null); assert.ok(r.h.checked);
  r = H.tick(r.h, NOW + 3 * HOUR, () => 0); assert.equal(r.h.ill, null, 'too soon to roll again');
  r = H.tick(r.h, NOW + 7 * HOUR, () => 0); assert.ok(r.h.ill, 'a low roll after 6 hours makes the player ill');
  assert.equal(r.h.ill.sev, 'mild');
});
test('untreated: mild turns serious after a day, then hospital after another day', () => {
  const h = { ill: { id: 'food', since: new Date(NOW), sev: 'mild' } };
  let r = H.tick(h, NOW + 23 * HOUR); assert.equal(r.h.ill.sev, 'mild'); assert.equal(r.admit, false);
  r = H.tick(h, NOW + 25 * HOUR); assert.equal(r.h.ill.sev, 'serious'); assert.equal(r.admit, false);
  r = H.tick(r.h, NOW + 50 * HOUR); assert.equal(r.admit, true);
});
test('the view shows how long is left', () => {
  const v = H.view({ ill: { id: 'malaria', since: new Date(NOW), sev: 'mild' } }, NOW + 4 * HOUR);
  assert.equal(v.name, 'Malaria'); assert.equal(Math.round(v.msLeft / HOUR), 20); assert.equal(H.view({ ill: null }), null);
});
test('catalogue: drugs for the player AND for the pet', () => {
  assert.ok(H.IDS.some((i) => H.ITEMS[i].who === 'me') && H.IDS.some((i) => H.ITEMS[i].who === 'pet'));
  assert.equal(H.ITEMS.cure.cure, true); assert.equal(H.ITEMS.pcure.petCure, true); assert.equal(H.HOSPITAL, 80000);
});
test('a new pharmacy shelf is stable and inside the price limits', () => {
  const a = H.newShop('user1'), b = H.newShop('user1'); assert.deepEqual(a, b);
  for (const id of H.IDS) { assert.ok(a.price[id] >= Math.round(H.ITEMS[id].base * H.MIN_X)); assert.ok(a.price[id] <= H.ITEMS[id].base * H.MAX_X); assert.ok(a.stock[id] >= 25); }
  assert.equal(H.clampPrice('cure', 1), 450); assert.equal(H.clampPrice('cure', 10 ** 9), 4500); assert.equal(H.clampPrice('cure', 'abc'), 1500);
  assert.equal(H.restockCost('cure', 10), 7500);
});
