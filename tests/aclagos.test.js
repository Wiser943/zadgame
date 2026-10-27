const test = require('node:test');
const assert = require('node:assert');
const L = require('../utils/aclagos');

const MON = Date.UTC(2026, 9, 5, 12, 0, 0);       // Monday 5 Oct 2026, 13:00 Lagos
test('city events are deterministic and change every 12 hours', () => {
  assert.strictEqual(L.currentEvent(MON).id, L.currentEvent(MON + 60e3).id);
  const e = L.currentEvent(MON); assert.ok(e.endsAt > MON && e.endsAt - e.startsAt === 12 * 3600e3);
  const ids = new Set(); for (let i = 0; i < 60; i++) ids.add(L.currentEvent(MON + i * 12 * 3600e3).id);
  assert.ok(ids.size >= 5, 'a good mix of events: ' + [...ids]);
  assert.ok(L.EVENTS.every((x) => x.pidgin && x.pidginText && x.text), 'every event has English and Pidgin lines');
});
test('job pay multiplier: drivers gain in a go-slow, others lose a bit', () => {
  const ev = L.EVENTS.find((x) => x.id === 'goslow');
  assert.ok(L.jobMult(ev, 'Road') > 1);
  assert.ok(L.jobMult(ev, 'Engineering') < 1);
  assert.strictEqual(L.jobMult(null, 'x'), 1);
});
test('bills start on Monday, are due Sunday night, and scale with the room', () => {
  const c = L.cycleOf(MON); assert.strictEqual(c.key, '2026-10-05');
  assert.strictEqual(new Date(c.due + 3600e3).getUTCDay(), 0);
  const items = [{ name: 'Fridge' }, { name: 'Shower' }];
  assert.ok(L.billAmount('power', items, null) > L.billAmount('power', [], null));
  assert.ok(L.billAmount('power', items, { mult: { power: 1.4 } }) > L.billAmount('power', items, null));
  assert.ok(L.billAmount('power', Array(200).fill({ name: 'Fridge' }), null) <= L.BILLS.power.cap);
});
test('new players get free days, then three bills a cycle with no duplicates', () => {
  const young = { createdAt: new Date(MON - 86400e3), ac: { items: [], bills: [] } };
  assert.strictEqual(L.newBills(young, MON).length, 0);
  const old = { createdAt: new Date(MON - 10 * 86400e3), ac: { items: [], bills: [] } };
  const b = L.newBills(old, MON); assert.strictEqual(b.length, 3);
  old.ac.bills = b; assert.strictEqual(L.newBills(old, MON).length, 0);
  assert.strictEqual(L.newBills(old, MON + 7 * 86400e3).length, 3);
});
test('late fee and power cut', () => {
  const c = L.cycleOf(MON), b = { key: 'power', amount: 20000, due: new Date(c.due), paidAt: null };
  assert.strictEqual(L.lateFee(b, c.due - 1000), 0);
  assert.strictEqual(L.lateFee(b, c.due + 1000), 2000);
  assert.strictEqual(L.owed({ ...b, paidAt: new Date() }, c.due + 1000), 0);
  assert.strictEqual(L.powerCut([b], c.due + 3600e3), false);
  assert.strictEqual(L.powerCut([b], c.due + 25 * 3600e3), true);
});
test('daily streak grows by day, resets after a miss, pays once a day', () => {
  const t = Date.UTC(2026, 9, 9, 10);
  assert.deepStrictEqual([L.nextStreak({}, t).streak, L.nextStreak({}, t).claimable], [1, true]);
  assert.strictEqual(L.nextStreak({ lastDaily: L.dayKey(t - 86400e3), streak: 3 }, t).streak, 4);
  const miss = L.nextStreak({ lastDaily: L.dayKey(t - 3 * 86400e3), streak: 6 }, t); assert.strictEqual(miss.streak, 1);
  assert.strictEqual(L.nextStreak({ lastDaily: L.dayKey(t), streak: 2 }, t).claimable, false);
  assert.ok(L.streakReward(7) > L.streakReward(1)); assert.strictEqual(L.streakReward(8), L.streakReward(1));
});
test('quests are unique and rewards stay small', () => {
  assert.strictEqual(new Set(L.QUESTS.map((q) => q.id)).size, L.QUESTS.length);
  assert.ok(L.QUESTS.reduce((s, q) => s + q.reward, 0) < 250000);
});
