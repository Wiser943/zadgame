const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../utils/acproperties');
const { publicAC } = require('../utils/allconnect');

test('property catalogue has unique stable ids and server-defined acquisition terms', () => {
  const ids = Object.keys(P.HOMES);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 3);
  for (const id of ids) {
    const h = P.HOMES[id];
    assert.ok(P.isHome(id));
    assert.ok(Number.isSafeInteger(h.mode === 'rent' ? h.rent : h.price));
    assert.ok((h.mode === 'rent' ? h.rent : h.price) > 0);
    assert.ok(/^#[0-9a-f]{6}$/i.test(h.paint));
  }
  assert.equal(P.isHome('__proto__'), false);
  assert.equal(P.isHome('free_house'), false);
});

test('public AllConnect state returns safe property fields and furniture without exposing arbitrary model data', () => {
  const out = publicAC({ cash: 1000, paint: '#abcdef', owned: [], items: [], properties: [{
    id: 'home1', type: 'self_contained', tenure: 'owned', paint: '#d9a93a', secret: 'must not leak',
    items: [{ id: 'item1', name: 'Plastic Chair', x: 1, z: 2, rot: 0, placed: true, extra: 'no' }]
  }] });
  assert.equal(out.properties.length, 1);
  assert.equal(out.properties[0].id, 'home1');
  assert.equal(out.properties[0].items[0].name, 'Plastic Chair');
  assert.equal(Object.hasOwn(out.properties[0], 'secret'), false);
  assert.equal(Object.hasOwn(out.properties[0].items[0], 'extra'), false);
});

test('home expansions: bought homes grow 6 -> 8 -> 10 cells with server-defined prices; rentals cannot expand', () => {
  assert.equal(P.gridFor(0), 6); assert.equal(P.gridFor(1), 8); assert.equal(P.gridFor(2), 10); assert.equal(P.gridFor(99), 10); assert.equal(P.gridFor(-3), 6);
  assert.equal(P.levelOf({}), 0); assert.equal(P.levelOf({ level: 1 }), 1); assert.equal(P.levelOf({ level: 7 }), 0);
  assert.equal(P.expansionCost('mainland_room', 0), 0);              // rent-only home
  assert.equal(P.expansionCost('self_contained', 0), 105000);          // 30% of 350,000
  assert.equal(P.expansionCost('self_contained', 1), 210000);          // 60% of 350,000
  assert.equal(P.expansionCost('self_contained', 2), 0);               // already maxed
  const pub = P.publicHome({ id: 'h', type: 'mini_flat', tenure: 'owned', items: [] });
  assert.equal(pub.level, 0); assert.equal(pub.grid, 6); assert.equal(pub.nextExpansion.grid, 8); assert.equal(pub.nextExpansion.cost, 270000);
  assert.equal(P.publicHome({ id: 'h', type: 'mini_flat', tenure: 'owned', level: 2, items: [] }).nextExpansion, null);
});

test('furniture placement follows the room size of the expanded home', () => {
  const F = require('../utils/furniture');
  assert.equal(F.canPlace([], 'Plastic Chair', 7, 7, 0), false);               // default 6x6 room
  assert.equal(F.canPlace([], 'Plastic Chair', 7, 7, 0, undefined, 8), true);  // level 1: 8x8
  assert.equal(F.canPlace([], 'Plastic Chair', 8, 8, 0, undefined, 8), false);
  assert.equal(F.canPlace([], 'Velvet Sofa', 8, 9, 0, undefined, 10), true);
});
