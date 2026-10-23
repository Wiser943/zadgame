const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../utils/acvenues');

test('there are 20 venues with ids 101-120 and unique keys', () => {
  assert.equal(V.VENUES.length, 20);
  assert.deepEqual(V.VENUES.map((v) => v.id), Array.from({ length: 20 }, (_, i) => 101 + i));
  assert.equal(new Set(V.VENUES.map((v) => v.key)).size, 20);
  for (const n of ['cinema', 'restaurant', 'salon', 'gym', 'pitch', 'gaming', 'studio', 'boutique', 'supermarket', 'pharmacy', 'clinic', 'school', 'library', 'cowork', 'nightclub', 'gallery', 'hall', 'workshop', 'hotel', 'wedding']) assert.ok(V.venueOf(n), n);
  assert.equal(V.venueOf('nope'), null);
});
test('every peak profile averages 1 over a week, so the daily rate is honest', () => {
  for (const p of new Set(V.VENUES.map((v) => v.peak))) {
    let t = 0; for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) t += V.weight(p, h, d);
    assert.ok(Math.abs(t / 168 - 1) < 1e-9, p);
  }
});
test('accrual is deterministic, capped at 24 hours and grows with level', () => {
  const v = V.venueOf('cinema'), now = Date.UTC(2026, 9, 11, 12, 0, 0);
  const a = V.accrue('u1', v, 1, now - 3 * 86400000, now), b = V.accrue('u1', v, 1, now - 3 * 86400000, now), c = V.accrue('u1', v, 1, now - 86400000, now);
  assert.deepEqual(a, b);
  assert.equal(a.hours, 24);
  assert.equal(a.net, c.net);
  assert.ok(a.net > 0);
  assert.ok(V.accrue('u1', v, 3, now - 86400000, now).net > a.net);
  assert.equal(V.accrue('u1', v, 1, now, now).net, 0);
});
test('a full day lands near the expected daily figure', () => {
  const v = V.venueOf('restaurant'), now = Date.UTC(2026, 9, 14, 0, 0, 0);
  let sum = 0; for (let i = 0; i < 40; i++) sum += V.accrue('user' + i, v, 1, now - 86400000, now).net;
  const avg = sum / 40, exp = V.netPerDay(v, 1);
  assert.ok(avg > exp * 0.7 && avg < exp * 1.3, `${avg} vs ${exp}`);
});
test('tax is only taken from a positive profit and closing pays back half', () => {
  const v = V.venueOf('hotel'), now = Date.UTC(2026, 9, 11, 12, 0, 0), r = V.accrue('u', v, 1, now - 86400000, now);
  assert.equal(r.gross - r.upkeep - r.tax, r.net);
  assert.equal(V.closeValue(1000), 500);
  assert.equal(V.upgradePrice(v, 2), Math.round(v.price * 0.6));
});
test('nightclub earns more at night than at noon, church hall on Sunday morning', () => {
  assert.ok(V.weight('night', 23, 6) > V.weight('night', 12, 6) * 10);
  assert.ok(V.weight('sunday', 9, 0) > V.weight('sunday', 9, 3) * 10);
});
test('collecting often cannot beat collecting once a day', () => {
  const v = V.venueOf('nightclub'), t0 = Date.UTC(2026, 9, 10, 0, 0, 0);
  let often = 0; for (let h = 0; h < 24; h++) often += Math.max(0, V.accrue('u', v, 1, t0 + h * 3600000, t0 + (h + 1) * 3600000).net);
  const once = V.accrue('u', v, 1, t0, t0 + 86400000).net;
  assert.ok(often <= once + 24, `${often} vs ${once}`);
});
