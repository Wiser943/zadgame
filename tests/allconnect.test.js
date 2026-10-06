const test = require('node:test'), assert = require('node:assert');
const { CATALOGUE, priceOf, sanitizeSave, DEFAULT_AC } = require('../utils/allconnect');
test('prices come from the server catalogue', () => { assert.equal(priceOf('Fridge'), 320000); assert.equal(priceOf('Free Money'), null); assert.equal(priceOf('__proto__'), null); });
test('client cannot save cash or owned items', () => { const c = sanitizeSave({ cash: 9e9, owned: ['Fridge'], paint: '#2F9E63', min: 1200.7 }); assert.deepEqual(c, { paint: '#2f9e63', min: 1200 }); });
test('bad values are dropped / clamped', () => { assert.deepEqual(sanitizeSave({ paint: 'red', needs: [2, -1, .5, .5, .5, .5] }), { needs: [1, 0, .5, .5, .5, .5] }); assert.deepEqual(sanitizeSave({ needs: [1] }), {}); });
test('defaults can afford a starter item', () => assert.ok(DEFAULT_AC().cash > CATALOGUE['Classic Cream']));
const U = require('../utils/allconnect');
test('usernames are normalised and validated', () => {
  assert.equal(U.normalizeUsername('  @Tobi_99 '), 'tobi_99');
  assert.ok(U.validUsername('tobi_99')); assert.ok(!U.validUsername('ab')); assert.ok(!U.validUsername('has space')); assert.ok(!U.validUsername('admin')); assert.ok(!U.validUsername('x'.repeat(17)));
});
test('money limits', () => {
  assert.ok(U.moneyError(50)); assert.ok(U.moneyError(U.MONEY.max + 1)); assert.equal(U.moneyError(5000), null); assert.ok(U.moneyError(U.parseAmount('abc')));
  assert.equal(U.parseAmount('1500.9'), 1500);
});
test('food menu is server-priced', () => { assert.equal(U.FOOD.jollof.price, 2500); assert.ok(U.FOOD.suya.fill < U.FOOD.jollof.fill); });
