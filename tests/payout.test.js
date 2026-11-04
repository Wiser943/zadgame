const test = require('node:test');
const assert = require('node:assert');
// utils/payout.js pulls in the Mongoose models; the rules under test are pure, so the models are stubbed out here.
for (const m of ['User', 'PayoutAccount', 'PayoutRequest', 'PayoutSeason']) { const f = require.resolve('../models/' + m); require.cache[f] = { id: f, filename: f, loaded: true, exports: {} }; }
const P = require('../utils/payout');

test('bank account numbers are encrypted and come back intact; tampering fails', () => {
  const c = P.enc('0123456789');
  assert.ok(!c.includes('0123456789'));
  assert.strictEqual(P.dec(c), '0123456789');
  assert.strictEqual(P.dec(c.slice(0, -2) + '00'), '');
  assert.strictEqual(P.dec('garbage'), '');
});

test('rotation is Batch 1 -> 3 -> 2 from the batch the player picked', () => {
  assert.deepStrictEqual(P.scheduleFor(1, 6).map((x) => x.batch), [1, 3, 2, 1, 3, 2]);
  assert.deepStrictEqual(P.scheduleFor(3, 4).map((x) => x.batch), [3, 2, 1, 3]);
  assert.deepStrictEqual(P.scheduleFor(2, 4).map((x) => x.batch), [2, 1, 3, 2]);
});

test('season 1 has one slot, later seasons have two, and slot 0 is always the first payout of the season', () => {
  const seasonNo = (i) => (i === 0 ? 1 : 1 + Math.ceil(i / 2));            // same rule routes/payouts.js uses
  const bySeason = {};
  P.scheduleFor(1, 9).forEach((x, i) => { (bySeason[seasonNo(i)] = bySeason[seasonNo(i)] || []).push(x.slotInSeason); });
  assert.deepStrictEqual(bySeason[1], [0]);
  for (const n of [2, 3, 4, 5]) assert.deepStrictEqual(bySeason[n], [0, 1], 'season ' + n);
});

test('payout is capped by the counted-units cap and uses the units-per-naira rate', () => {
  const b = { countedUnitsCap: 5000000, unitsPerNaira: 3333.333333 };
  assert.strictEqual(P.rawFor(3000000, b), 900);
  assert.strictEqual(P.rawFor(9000000, b), 1500);          // only the first 5,000,000 units count
  assert.strictEqual(P.rawFor(-5, b), 0);
  assert.strictEqual(P.rawFor(100, b), 0);
});

test('default rules match the documented defaults', () => {
  const byKey = Object.fromEntries(P.DEFAULT_RULES.map((r) => [r.key, r]));
  assert.strictEqual(byKey.minBalance.value, 3000000);
  assert.strictEqual(byKey.minBalance.enabled, true);
  assert.strictEqual(byKey.posts.enabled, false);
  assert.strictEqual(P.rulesFor({ rules: [] }), P.DEFAULT_RULES);
});

test('players are told what happened, with only the last four digits of the account and the reason or reference', () => {
  const r = { seasonNo: 2, batch: 3, payoutAmount: 1500, bankLast4: '4417' };
  const ok = P.statusMessage('approve', r);
  assert.match(ok.text, /₦1,500/); assert.match(ok.text, /Season 2, Batch 3/); assert.match(ok.text, /ending 4417/); assert.match(ok.text, /manual bank transfer/);
  const paid = P.statusMessage('pay', r, '', 'GTB-99812');
  assert.match(paid.text, /has been sent/); assert.match(paid.text, /GTB-99812/);
  assert.match(P.statusMessage('reject', r, 'Name does not match').text, /Reason: Name does not match/);
  assert.match(P.statusMessage('rollover', r).text, /next scheduled slot/);
  assert.match(P.statusMessage('hold', r, 'Checking your details').text, /Checking your details/);
  assert.strictEqual(P.statusMessage('nonsense', r), null);
  for (const a of ['approve', 'pay', 'hold', 'rollover', 'reject']) assert.ok(!/\d{10}/.test(P.statusMessage(a, { ...r, bankLast4: '4417' }, '', '').text), 'no full account numbers');
  assert.strictEqual(P.naira(1234.6), '₦1,235');
});
