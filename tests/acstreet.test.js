const test = require('node:test');
const assert = require('node:assert/strict');
const { fare } = require('../utils/acstreet');
const WJ = require('../utils/acjobs');

test('street rides: fares grow with distance, a bus is cheaper than a taxi, both are capped and never below the minimum', () => {
  assert.equal(fare('taxi', 0), 300); assert.ok(fare('taxi', 800) > fare('taxi', 200)); assert.equal(fare('taxi', 99999), fare('taxi', 1600));
  for (const d of [10, 250, 900, 1500]) { assert.ok(fare('bus', d) < fare('taxi', d), 'bus cheaper at ' + d); assert.ok(fare('bus', d) >= 150); }
  assert.equal(fare('taxi', 'nonsense'), 300);
});
test('work flow: a shift can only be left by clocking out (the hour in progress is not paid)', () => {
  const nine = Date.UTC(2026, 10, 17, 8, 0);
  assert.equal(WJ.dueShifts(nine, nine + 30 * 60000), 0);          // 30 minutes in: nothing to pay yet, so leaving early costs that part-hour
  assert.equal(WJ.dueShifts(nine, nine + 61 * 60000), 1);
});
