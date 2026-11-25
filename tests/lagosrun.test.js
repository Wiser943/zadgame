const test = require('node:test');
const assert = require('node:assert');
const L = require('../utils/lagosrun');

test('periods follow Lagos time: the day turns over at 11 pm UTC and weeks start on Monday', () => {
  const sun = Date.UTC(2026, 10, 1, 22, 59);                 // Sun 1 Nov 2026, 23:59 Lagos
  assert.strictEqual(L.periodKeys(sun).day, '2026-11-01');
  assert.strictEqual(L.periodKeys(sun).week, '2026-10-26');  // the Monday before
  const mon = Date.UTC(2026, 10, 1, 23, 0);                  // Mon 2 Nov, 00:00 Lagos
  assert.strictEqual(L.periodKeys(mon).day, '2026-11-02');
  assert.strictEqual(L.periodKeys(mon).week, '2026-11-02');
  assert.strictEqual(L.periodKeys(mon).all, 'all');
});

test('a run token only works for the user it was made for, and cannot be edited', () => {
  const t = L.signRun('u1', 1000);
  assert.ok(L.verifyRun(t, 'u1', 2000));
  assert.strictEqual(L.verifyRun(t, 'u2', 2000), null, 'another user cannot use it');
  const [body, sig] = t.split('.');
  assert.strictEqual(L.verifyRun(body + 'x.' + sig, 'u1', 2000), null, 'edited body');
  assert.strictEqual(L.verifyRun(t, 'u1', 1000 + L.RUN_TTL * 3 + 1), null, 'expired');
  assert.strictEqual(L.verifyRun('nope', 'u1'), null);
});

test('a finished run is checked for sane numbers and for time actually passed', () => {
  const t0 = 1e12;
  assert.ok(L.cleanRun({ score: 1200, metres: 300, secs: 45 }, t0, t0 + 50e3).ok);
  assert.strictEqual(L.cleanRun({ score: 0, metres: 5, secs: 5 }, t0, t0 + 9e3).ok, false);
  assert.strictEqual(L.cleanRun({ score: 9e9, metres: 5, secs: 50 }, t0, t0 + 60e3).ok, false);
  assert.strictEqual(L.cleanRun({ score: 1200, metres: 300, secs: 600 }, t0, t0 + 30e3).ok, false, 'a 10 minute run cannot finish 30 s after the token');
});

test('coins and boosts: gains are capped per sync, nothing goes below zero', () => {
  const w = { bank: 100, tyre: 1, shield: 0, magnet: 2 };
  assert.deepStrictEqual(L.applyDelta(w, { bank: 50, tyre: -1 }), { bank: 150, tyre: 0, shield: 0, magnet: 2 });
  assert.strictEqual(L.applyDelta(w, { bank: -9999 }).bank, 0);
  assert.strictEqual(L.applyDelta(w, { bank: 1e9 }).bank, 100 + L.LIMITS.bankGainPerSync);
  assert.strictEqual(L.applyDelta(w, { shield: 1e6 }).shield, L.LIMITS.boostGainPerSync);
  assert.deepStrictEqual(L.applyDelta({}, null), { bank: 0, tyre: 0, shield: 0, magnet: 0 });
});

test('merging saves keeps the best of both and the latest equipment', () => {
  const server = { progress: { level: 5, best: 900, owned: { paint: ['red'] }, equip: { paint: 'red' }, bests: { mainland: 900 } }, streak: { count: 3, best: 3, last: '2026-10-30' }, at: { equip: 100 } };
  const phone = { progress: { level: 3, best: 1500, owned: { paint: ['blue'] }, equip: { paint: 'blue' }, bests: { mainland: 1500, island: 40 } }, streak: { count: 1, best: 1, last: '2026-11-01' }, at: { equip: 200 } };
  const m = L.mergeSave(server, phone);
  assert.strictEqual(m.progress.level, 5);
  assert.strictEqual(m.progress.best, 1500);
  assert.deepStrictEqual(m.progress.owned.paint.sort(), ['blue', 'red']);
  assert.strictEqual(m.progress.equip.paint, 'blue', 'the phone changed equipment last');
  assert.deepStrictEqual(m.progress.bests, { mainland: 1500, island: 40 });
  assert.strictEqual(m.streak.last, '2026-11-01');
  assert.strictEqual(m.streak.best, 3);
  assert.strictEqual(L.mergeSave(server, phone && { at: { equip: 1 }, progress: { equip: { paint: 'green' } } }).progress.equip.paint, 'red', 'older phone change loses');
});

test('junk in a save is cleaned, and an oversized save is dropped', () => {
  const c = L.cleanSave({ progress: { level: 'abc', best: -5, owned: { paint: ['ok', 7, { x: 1 }] }, totals: { 'bad key!': 5, good: 'NaN', fine: 2 } }, settings: { sfx: 9, lefty: 'yes' } });
  assert.strictEqual(c.progress.level, 1);
  assert.strictEqual(c.progress.best, 0);
  assert.deepStrictEqual(c.progress.owned.paint, ['ok']);
  assert.deepStrictEqual(c.progress.totals, { fine: 2 });
  assert.strictEqual(c.settings.sfx, 1);
  assert.strictEqual('lefty' in c.settings, false);
  const huge = { progress: { owned: { paint: Array.from({ length: 5000 }, (_, i) => 'p' + i) } }, seen: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => ['k' + i, 1])) };
  assert.ok(JSON.stringify(L.cleanSave(huge)).length < L.LIMITS.saveBytes);
});
