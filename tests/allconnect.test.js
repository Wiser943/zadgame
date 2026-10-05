const test = require('node:test'), assert = require('node:assert');
const { CATALOGUE, priceOf, sanitizeSave, DEFAULT_AC } = require('../utils/allconnect');
test('prices come from the server catalogue', () => { assert.equal(priceOf('Fridge'), 320000); assert.equal(priceOf('Free Money'), null); assert.equal(priceOf('__proto__'), null); });
test('client cannot save cash or owned items', () => { const c = sanitizeSave({ cash: 9e9, owned: ['Fridge'], paint: '#2F9E63', min: 1200.7 }); assert.deepEqual(c, { paint: '#2f9e63', min: 1200 }); });
test('bad values are dropped / clamped', () => { assert.deepEqual(sanitizeSave({ paint: 'red', needs: [2, -1, .5, .5, .5, .5] }), { needs: [1, 0, .5, .5, .5, .5] }); assert.deepEqual(sanitizeSave({ needs: [1] }), {}); });
test('defaults can afford a starter item', () => assert.ok(DEFAULT_AC().cash > CATALOGUE['Classic Cream']));
