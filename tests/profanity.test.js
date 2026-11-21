const test = require('node:test');
const assert = require('node:assert/strict');
const { clean, isDirty } = require('../utils/profanity');
test('masks listed words, including simple obfuscation', () => {
  assert.equal(clean('you are a shit player'), 'you are a **** player');
  assert.ok(isDirty('f.u.c.k this')); assert.ok(isDirty('sh1t')); assert.ok(isDirty('FUUUCK'));
});
test('leaves normal chat untouched', () => {
  for (const t of ['good game!', 'nice move', 'Scunthorpe is a town', 'assassin', 'classic']) assert.equal(clean(t), t);
});
