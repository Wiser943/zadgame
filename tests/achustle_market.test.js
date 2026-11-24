const test = require('node:test');
const assert = require('node:assert/strict');
const { HUSTLE_PILLARS, HUSTLE_BONUS, BREAKTHROUGH_BASE, stateFor, dayKey } = require('../utils/achustle');
const { STALLS, rollHaggle, findItem } = require('../utils/acmarket');

test('hustle engine: 5 pillars configured with positive rewards and cooldowns', () => {
  const keys = Object.keys(HUSTLE_PILLARS);
  assert.equal(keys.length, 5, 'Should have exactly 5 hustle pillars');
  assert.deepEqual(keys.sort(), ['grind', 'learn', 'life', 'link', 'step'].sort());

  for (const [id, p] of Object.entries(HUSTLE_PILLARS)) {
    assert.equal(p.id, id);
    assert.ok(p.baseCash > 0, `${id} should award positive cash`);
    assert.ok(p.baseXp > 0, `${id} should award positive XP`);
    assert.ok(p.cooldownSeconds >= 60, `${id} cooldown should be at least 60s`);
  }
});

test('hustle engine: state calculation tracks completion, streaks and bonuses', () => {
  const now = Date.now();
  const today = dayKey(now);

  // Fresh user state
  const state0 = stateFor({}, now);
  assert.equal(state0.day, today);
  assert.equal(state0.completedCount, 0);
  assert.equal(state0.allDone, false);
  assert.equal(state0.bonusClaimed, false);

  // User with all 5 completed
  const doneAc = {
    hustle: {
      day: today,
      completed: ['grind', 'life', 'link', 'learn', 'step'],
      streak: 3,
      bonusClaimed: true
    }
  };
  const stateDone = stateFor(doneAc, now);
  assert.equal(stateDone.completedCount, 5);
  assert.equal(stateDone.allDone, true);
  assert.equal(stateDone.bonusClaimed, true);
  assert.equal(stateDone.streak, 3);
});

test('market engine: stalls and haggling never discount below minPrice', () => {
  assert.ok(STALLS.length >= 3, 'Should have at least 3 market stalls');

  for (const stall of STALLS) {
    assert.ok(stall.items.length > 0, `${stall.name} should have items`);
    for (const it of stall.items) {
      assert.ok(it.price > it.minPrice, `${it.name} price should exceed minPrice`);
      
      // Test 20 rolls of haggling
      for (let i = 0; i < 20; i++) {
        const res = rollHaggle(it.price, it.minPrice, { charisma: 5, hustle: 5 });
        assert.ok(res.finalPrice >= it.minPrice, `Haggled price ${res.finalPrice} should never drop below minPrice ${it.minPrice}`);
        assert.ok(res.finalPrice <= it.price, `Haggled price should never exceed base sticker price`);
        assert.ok(typeof res.quote === 'string' && res.quote.length > 0);
      }
    }
  }
});

test('market engine: findItem locates items across all stalls', () => {
  const found = findItem('kampala_print');
  assert.ok(found, 'Should locate kampala_print');
  assert.equal(found.stall.id, 'balogun_fabrics');
  assert.equal(found.item.name, 'Kampala Wax Print (6 Yards)');

  const missing = findItem('non_existent_item');
  assert.equal(missing, null);
});
