const test = require('node:test'), assert = require('node:assert');
const J = require('../utils/acjobs'), A = require('../utils/acads');

test('job ladders: first rung is free, promotions follow total shifts', () => {
  for (const [id, job] of Object.entries(J.JOBS)) {
    assert.equal(job.ladder[0].shifts, 0, id);
    job.ladder.forEach((r, i) => { if (i) { assert.ok(r.shifts > job.ladder[i - 1].shifts, id); assert.ok(r.pay > job.ladder[i - 1].pay, id); } });
  }
  assert.equal(J.describe('oil', 0).title, 'Operator Trainee');
  assert.equal(J.describe('oil', 0).pay, 14000);
  assert.equal(J.describe('tech', 0).pay, 9900);
  assert.equal(J.describe('banking', 0).pay, 11600);
  assert.equal(J.describe('tech', 40).title, 'Junior Developer');
  assert.equal(J.describe('tech', 39).next.shiftsLeft, 1);
  assert.equal(J.describe('tech', 5000).next, null);
});
test('unknown / prototype job ids are rejected', () => { assert.equal(J.jobOf('hacker'), null); assert.equal(J.jobOf('__proto__'), null); assert.equal(J.describe('constructor'), null); });
test('weekends are off (Lagos time)', () => {
  const sat = Date.UTC(2026, 9, 10, 12), wed = Date.UTC(2026, 9, 7, 12);
  assert.ok(J.offDuty(sat)); assert.equal(J.offDuty(wed), null);
  assert.equal(J.dayKey(Date.UTC(2026, 9, 7, 23, 30)), '2026-10-08');   // 00:30 Lagos is already the next day
});
test('ad links and pictures must be https', () => {
  assert.equal(A.cleanUrl('javascript:alert(1)'), null); assert.equal(A.cleanUrl('http://x.com'), null);
  assert.equal(A.cleanUrl('https://user:pw@x.com'), null); assert.equal(A.cleanUrl('https://localhost'), null);
  assert.equal(A.cleanUrl(''), ''); assert.equal(A.cleanUrl('https://example.com/a'), 'https://example.com/a');
});
test('ad titles and sea plots are validated', () => {
  assert.ok(A.titleError('a')); assert.ok(A.titleError('x'.repeat(41))); assert.equal(A.titleError('Mama Put'), null);
  assert.deepEqual(A.plotList([3, 3, 1, -1, 99, 'x', 29]), [1, 3, 29]); assert.deepEqual(A.plotList('nope'), []);
  assert.equal(A.BILLBOARD.price, 250000); assert.equal(A.SEA.price, 500);
});

// ---- furniture / buy mode rules ----
const FU = require('../utils/furniture');
test('furniture: selling pays far less than buying', () => { assert.equal(FU.sellPrice('Spring Bed'), 4700); for (const n of Object.keys(FU.ITEMS)) assert.ok(FU.sellPrice(n) <= FU.ITEMS[n].price * 0.25, n); });
test('furniture: footprint turns with rotation', () => { assert.deepEqual(FU.footprint('Velvet Sofa', 0), [2, 1]); assert.deepEqual(FU.footprint('Velvet Sofa', 90), [1, 2]); });
test('furniture: no overlap, no leaving the room', () => {
  const items = FU.starterItems();
  assert.equal(FU.canPlace(items, 'Plastic Chair', 0, 1, 0), false);      // bed is there
  assert.equal(FU.canPlace(items, 'Plastic Chair', 6, 0, 0), false);      // outside
  assert.equal(FU.canPlace(items, 'Velvet Sofa', 5, 3, 0), false);        // 2 wide sticks out
  assert.ok(FU.autoPlace(items, 'Lekki King Bed'));
});
test('furniture: old accounts migrate to placed items', () => { const m = FU.migrate(['Classic Cream', 'Queen Bed', 'Net', 'Ceiling Bulb']); assert.equal(m.refund, 8000); assert.ok(m.items.some((i) => i.name === 'Queen Bed' && i.placed)); assert.ok(m.items.some((i) => i.name === 'Ceiling Bulb')); });
test('furniture: browser copy matches the server copy', () => { const src = require('fs').readFileSync(__dirname + '/../public/allconnect/furniture.js', 'utf8'); for (const n of Object.keys(FU.ITEMS)) assert.ok(src.includes('"' + n + '"'), n); assert.ok(src.includes('"price": ' + FU.ITEMS['Fridge'].price)); });
