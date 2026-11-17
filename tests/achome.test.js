const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../utils/furniture');
const A = require('../utils/acproperties');
const B = require('../public/allconnect/bedrooms');

test('power: Gen Set and Solar kit are in the Power tab and keep the lights on', () => {
  assert.ok(F.CATS.includes('Power'));
  assert.equal(F.ITEMS['Gen Set'].cat, 'Power'); assert.equal(F.ITEMS['Solar Inverter Kit'].backup, 'solar');
});
test('power tiers: mansions and 4+ bedrooms never lose light, 3 bedrooms lose it less, small homes rely on NEPA', () => {
  assert.equal(A.powerTier({ type: 'ikoyi_mansion' }), 'full');
  assert.equal(A.powerTier({ type: 'banana_island_mansion' }), 'full');
  assert.equal(A.powerTier({ type: 'two_bedroom', bedrooms: 2 }), 'full');          // 2 + 2 added = 4 bedrooms
  assert.equal(A.powerTier({ type: 'two_bedroom' }), 'partial');
  assert.equal(A.powerTier({ type: 'self_contained' }), 'none');
});
test('hanging lights: one per cell, inside the room, in any room of a bigger home', () => {
  const grid = A.gridOf({ type: 'mini_flat' }), items = [{ id: 'a', name: 'Chandelier', x: 8, z: 2, rot: 0, placed: true }];
  assert.equal(F.canHang(items, 'Ceiling Fan', 8, 2, undefined, grid), false);       // same cell
  assert.equal(F.canHang(items, 'Ceiling Fan', 8, 3, undefined, grid), true);        // another room of the home
  assert.equal(F.canHang(items, 'Ceiling Fan', 99, 3, undefined, grid), false);      // outside
  assert.equal(F.canHang(items, 'Gen Set', 1, 1, undefined, grid), false);           // not a hanging item
});
test('luxury mansions cost 20m and arrive fully furnished with beds in every bedroom', () => {
  for (const t of ['ikoyi_mansion', 'maitama_villa']) {
    assert.equal(A.HOMES[t].price, 20000000);
    const items = A.furnishedItems(t), beds = items.filter((i) => /Bed$/.test(i.name)).length;
    assert.equal(beds, A.totalOf({ type: t })); assert.ok(items.some((i) => i.name === 'Solar Inverter Kit'));
    const grid = A.gridOf({ type: t }); assert.ok(items.every((i) => F.isHang(i.name) ? F.canHang(items.filter((o) => o.id !== i.id), i.name, i.x, i.z, undefined, grid) : F.canPlace(items.filter((o) => o.id !== i.id), i.name, i.x, i.z, i.rot, undefined, grid)));
  }
});
test('back extension adds a Toilet room and porch without moving the living area', () => {
  const plain = B.layout(0, { bath: true }); assert.equal(plain.w, 6); assert.equal(plain.d, 8); assert.ok(plain.rooms.some((r) => r.name === 'Toilet'));
  const big = B.layout(2, { bath: true }); assert.equal(big.d, B.layout(2).d + 2);
  assert.equal(B.layout(0), null);
  assert.ok(A.renovationOptions({ type: 'self_contained', tenure: 'owned' }).some((o) => o.id === 'bath'));
  assert.ok(!A.renovationOptions({ type: 'self_contained', tenure: 'owned', bath: true }).some((o) => o.id === 'bath'));
  assert.equal(A.renovationOptions({ type: 'family_house', tenure: 'owned' }).length, 0);
});

test('upstairs: same footprint, opening where the staircase is, three layout styles, items filtered per floor', () => {
  const p = { type: 'mini_flat', tenure: 'owned', upstairs: true, upStyle: 'suites', items: [{ id: 's', name: 'Grand Staircase', x: 0, z: 0, rot: 0, floor: 0, placed: true }] };
  const g0 = A.gridOf(p, 0), g1 = A.gridOf(p, 1);
  assert.equal(g1.w, g0.w); assert.equal(g1.d, g0.d); assert.ok(g1.blocked.has('0,0') && g1.blocked.has('1,2'));
  assert.ok(g1.walls.size > 0);                                                           // the suites style has a dividing wall
  assert.equal(A.gridOf({ ...p, upStyle: 'lounge' }, 1).walls.size, 0);
  assert.ok(A.gridOf({ ...p, upStyle: 'rooms' }, 1).walls.size > g1.walls.size);
  assert.equal(F.onFloor([{ id: 'a', floor: 0 }, { id: 'b', floor: 1 }, { id: 'c' }], 1).length, 1);
  assert.equal(F.canPlace([], 'Queen Bed', 0, 0, 0, undefined, g1), false);               // cannot put a bed in the stairwell
  assert.equal(F.canPlace([], 'Queen Bed', 3, 3, 0, undefined, g1), true);
});
test('renovations: upstairs, luxury finish and restyling are offered once and priced from the home', () => {
  const o = A.renovationOptions({ type: 'mini_flat', tenure: 'owned' }).map((x) => x.id);
  assert.ok(o.includes('upstairs:lounge') && o.includes('upstairs:suites') && o.includes('upstairs:rooms') && o.includes('finish'));
  const done = A.renovationOptions({ type: 'mini_flat', tenure: 'owned', upstairs: true, upStyle: 'suites', finish: 'luxury' }).map((x) => x.id);
  assert.deepEqual(done.sort(), ['bath', 'upstyle:lounge', 'upstyle:rooms'].sort());
  assert.equal(A.renovationOptions({ type: 'family_house', tenure: 'owned' }).length, 0);  // fixed house plans cannot be changed
  assert.ok(A.UPSTAIRS_COST('ikoyi_mansion') > A.UPSTAIRS_COST('mini_flat'));
});
