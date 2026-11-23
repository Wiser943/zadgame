const test = require("node:test");
const assert = require("node:assert/strict");

// ---- 9 to 5 workday (Lagos time) ----
const WJ = require('../utils/acjobs');
const nine = Date.UTC(2026, 10, 17, 8, 0);          // Tuesday 17 Nov 2026, 09:00 Lagos (UTC+1)
test('workday: open 9 AM to 5 PM on weekdays only', () => {
  assert.match(WJ.offDuty(nine - 60000), /9:00 AM/); assert.equal(WJ.offDuty(nine), null); assert.equal(WJ.offDuty(nine + 7 * 3600000 + 59 * 60000), null);
  assert.match(WJ.offDuty(WJ.endOf(nine)), /over for today/); assert.match(WJ.offDuty(Date.UTC(2026, 10, 21, 10, 0)), /Weekend/);
});
test('workday: one paid shift per full hour clocked in, never past 5 PM or the daily cap', () => {
  assert.equal(WJ.SHIFT_SECONDS, 3600); assert.equal(WJ.MAX_SHIFTS_PER_DAY, 8);
  assert.equal(WJ.dueShifts(nine, nine + 59 * 60000), 0); assert.equal(WJ.dueShifts(nine, nine + 3 * 3600000 + 1), 3);
  assert.equal(WJ.dueShifts(nine, nine + 30 * 3600000), 8); assert.equal(WJ.dueShifts(nine, nine + 4 * 3600000, 6), 2); assert.equal(WJ.dueShifts(null, nine), 0);
});
