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

const BK = require('../utils/acbank');
test('payment PIN hashing', () => {
  const salt = 'abc123', h = BK.hashPin('4821', salt);
  assert.ok(BK.verifyPin('4821', salt, h)); assert.ok(!BK.verifyPin('4822', salt, h)); assert.ok(!BK.verifyPin('4821', 'other', h)); assert.notEqual(h, '4821');
  assert.ok(BK.validPin('0042')); assert.ok(!BK.validPin('123')); assert.ok(!BK.validPin('12345')); assert.ok(!BK.validPin('12a4'));
});
test('account ids are 10 digits and refs are unique', () => {
  for (let i = 0; i < 50; i++) assert.match(BK.genAcNum(), /^[1-9]\d{9}$/);
  assert.ok(BK.validAcNum('1234567890')); assert.ok(!BK.validAcNum('123456789')); assert.ok(!BK.validAcNum('@tobi'));
  assert.notEqual(BK.makeRef(), BK.makeRef());
});
