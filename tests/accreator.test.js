const test = require('node:test');
const assert = require('node:assert');
const C = require('../utils/accreator');
const good = { verified: true, followers: 1200, posts: 25, reactions: 400, comments: 150, ageDays: 40, penalties: 0, suspended: false };
test('everything met = eligible', () => { const e = C.evaluate(good); assert.ok(e.eligible); assert.strictEqual(e.metCount, e.criteria.length); });
test('each requirement can block', () => {
  for (const [k, v] of [['verified', false], ['followers', 10], ['posts', 1], ['ageDays', 3], ['penalties', 1], ['suspended', true]]) assert.ok(!C.evaluate({ ...good, [k]: v }).eligible, k);
  assert.ok(!C.evaluate({ ...good, reactions: 100, comments: 100 }).eligible);
});
test('progress is capped at 100%', () => assert.strictEqual(C.evaluate({ ...good, followers: 99999 }).criteria.find((c) => c.id === 'followers').pct, 100));
test('states: locked, eligible, applied, rejected cooldown', () => {
  const ev = C.evaluate(good), no = C.evaluate({ ...good, followers: 1 });
  assert.strictEqual(C.stateOf(null, no).state, 'locked'); assert.strictEqual(C.stateOf(null, ev).state, 'eligible');
  assert.strictEqual(C.stateOf({ status: 'applied' }, ev).canApply, false);
  assert.strictEqual(C.stateOf({ status: 'rejected', decidedAt: new Date() }, ev).canApply, false);
  assert.strictEqual(C.stateOf({ status: 'rejected', decidedAt: new Date(Date.now() - 20 * 86400e3) }, ev).canApply, true);
});
test('milestones report the next step', () => {
  const m = C.milestones({ followers: 600, posts: 0, reactions: 0 }), f = m.find((x) => x.key === 'followers');
  assert.strictEqual(f.reached, 2); assert.strictEqual(f.next, 1000);
});
