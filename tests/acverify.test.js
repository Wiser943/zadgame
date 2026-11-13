const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../utils/acverify');
const P = { enabled: true, monthly: 50000, yearly: 500000 };

test('verify: a hand-given tick counts as a permanent badge', () => {
  const v = V.view({ verified: true, ac: { cash: 5 } }, P);
  assert.equal(v.status, 'active'); assert.equal(v.mode, 'permanent'); assert.equal(v.canRequest, false); assert.equal(v.canSubscribe, false);
});
test('verify: new players can request, pending players cannot ask twice', () => {
  assert.equal(V.view({ verified: false, vreq: {}, ac: {} }, P).canRequest, true);
  assert.equal(V.view({ verified: false, vreq: { status: 'pending' }, ac: {} }, P).canRequest, false);
  assert.equal(V.view({ verified: false, vreq: { status: 'rejected' }, ac: {} }, P).canRequest, true);
});
test('verify: an approved paid badge can be subscribed to, and renewed after it ends', () => {
  for (const status of ['approved', 'active', 'expired']) assert.equal(V.view({ verified: status === 'active', vreq: { status, mode: 'paid' }, ac: {} }, P).canSubscribe, true);
});
test('verify: per-player prices beat the defaults', () => {
  assert.equal(V.priceFor({ vreq: { monthly: 1000, yearly: 0 } }, 'monthly', P), 1000);
  assert.equal(V.priceFor({ vreq: { monthly: 1000, yearly: 0 } }, 'yearly', P), 500000);
});
test('verify: requests close when the admin switches them off', () => {
  assert.equal(V.view({ verified: false, vreq: {}, ac: {} }, { ...P, enabled: false }).canRequest, false);
});
