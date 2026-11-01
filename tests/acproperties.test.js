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

test('bedroom expansions: server-defined sizes and prices; rentals and fixed plans cannot expand', () => {
  assert.equal(P.baseBedrooms('self_contained'), 0); assert.equal(P.baseBedrooms('mini_flat'), 1); assert.equal(P.baseBedrooms('two_bedroom'), 2);
  assert.equal(P.maxExtra('self_contained'), 5); assert.equal(P.maxExtra('mini_flat'), 4); assert.equal(P.maxExtra('two_bedroom'), 3);
  assert.equal(P.maxExtra('mainland_room'), 0); assert.equal(P.maxExtra('family_house'), 0); assert.equal(P.maxExtra('market_shop'), 0);
  assert.equal(P.stepCost('self_contained', 1), 70000);                 // 20% of 350,000
  assert.equal(P.stepCost('self_contained', 2), 88000);                 // 25%
  assert.equal(P.expansionCost('self_contained', 0, 2), 158000);        // two steps in one go
  assert.equal(P.expansionCost('self_contained', 1, 2), 88000);
  assert.equal(P.expansionCost('self_contained', 2, 2), 0);             // not bigger
  assert.equal(P.expansionCost('self_contained', 0, 6), 0);             // past the maximum
  assert.equal(P.expansionCost('mainland_room', 0, 1), 0);
  const pub = P.publicHome({ id: 'h', type: 'mini_flat', tenure: 'owned', items: [] });
  assert.equal(pub.bedrooms, 0); assert.equal(pub.totalBedrooms, 1); assert.equal(pub.sizeLabel, '1-Bedroom');
  assert.deepEqual(pub.expansions.map(o => o.total), [2, 3, 4, 5]); assert.equal(pub.expansions[0].cost, 180000);
  assert.equal(P.publicHome({ id: 'h', type: 'mini_flat', tenure: 'owned', bedrooms: 4, items: [] }).expansions.length, 0);
  assert.equal(P.publicHome({ id: 'h', type: 'mainland_room', tenure: 'rent', items: [] }).expansions.length, 0);
  assert.equal(P.extraOf({ type: 'self_contained', bedrooms: 99 }), 5); assert.equal(P.extraOf({ type: 'self_contained' }), 0);
  assert.equal(P.extraOf({ type: 'self_contained', bedrooms: -2 }), 0); assert.equal(P.extraOf({ type: 'self_contained', bedrooms: 1.5 }), 0);
});

test('bedroom floor plans: every room is reachable through its doorway and the 6x6 living area never moves', () => {
  const B = require('../public/allconnect/bedrooms');
  assert.equal(B.layout(0), null);
  for (let k = 1; k <= B.MAX_EXTRA; k++) {
    const L = B.layout(k), ws = new Set(L.walls), seen = new Set(['2,2']), q = [[2, 2]];
    assert.equal(L.rooms.length, k); assert.ok(L.w >= 10 && L.d >= 6);
    while (q.length) { const [x, z] = q.shift(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, key = nx + ',' + nz; if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.d || ws.has(B.edge(x, z, nx, nz)) || seen.has(key)) continue; seen.add(key); q.push([nx, nz]); } }
    assert.equal(seen.size, L.w * L.d, k + ' bedrooms: every cell is reachable');
    for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) assert.ok(seen.has(x + ',' + z));
  }
  assert.equal(B.layout(99).bedrooms, 5);
  assert.equal(B.label(0), 'Studio'); assert.equal(B.label(4), '4-Bedroom');
});

test('furniture placement follows the bedroom plan: bigger floor, and nothing stands across a wall', () => {
  const F = require('../utils/furniture');
  assert.equal(F.canPlace([], 'Plastic Chair', 7, 1, 0), false);                    // plain 6x6 room
  const g = P.gridOf({ type: 'self_contained', bedrooms: 2 });
  assert.equal(g.w, 10); assert.equal(g.d, 6);
  assert.equal(F.canPlace([], 'Plastic Chair', 7, 1, 0, undefined, g), true);        // inside Bedroom 1
  assert.equal(F.canPlace([], 'Foam Mattress', 5, 0, 0, undefined, g), false);       // 2 wide: would straddle the wall at x 5|6 (not a doorway row)
  assert.equal(F.canPlace([], 'Foam Mattress', 7, 0, 0, undefined, g), true);
  assert.equal(F.canPlace([], 'Foam Mattress', 7, 2, 90, undefined, g), false);      // 1x2 turned: crosses the Bedroom 1 | Bedroom 2 wall
  assert.equal(F.canPlace([], 'Plastic Chair', 10, 0, 0, undefined, g), false);      // outside the plan
  assert.equal(P.gridOf({ type: 'mini_flat' }).w, 10);                               // a Mini Flat comes with its 1 bedroom built
  assert.equal(P.gridOf({ type: 'self_contained' }), 6);                             // a Studio is the plain room
});

test('Family House: model-based layout blocks walls/built-ins, cannot be expanded, and furniture respects it', () => {
  const { layoutFor } = require('../utils/layouts'), F = require('../utils/furniture');
  assert.ok(P.isHome('family_house'));
  const L = layoutFor('family_house'); assert.equal(L.w, 10); assert.equal(L.d, 14); assert.ok(L.blocked.size > 20 && L.blocked.size < L.w * L.d);
  assert.ok(!L.blocked.has(L.start.join(',')), 'start cell is walkable');
  assert.equal(P.maxExtra('family_house'), 0);
  assert.equal(P.publicHome({ id: 'h', type: 'family_house', tenure: 'owned', items: [] }).expansions.length, 0);
  assert.equal(P.gridOf({ type: 'family_house' }).w, 10);
  const [bx, bz] = [...L.blocked][0].split(',').map(Number), [sx, sz] = L.start;
  assert.equal(F.canPlace([], 'Plastic Chair', bx, bz, 0, undefined, L), false);          // inside a wall / outside the house
  assert.equal(F.canPlace([], 'Plastic Chair', sx, sz, 0, undefined, L), true);
  assert.equal(F.canPlace([], 'Plastic Chair', 11, 3, 0, undefined, L), false);           // outside the 10-wide plan
  assert.ok(F.autoPlace([], 'Plastic Chair', L), 'a free spot exists');
});

test('browser layouts.js mirrors the server JSON', () => {
  const fs = require('fs'), path = require('path'), vm = require('node:vm');
  const root = path.join(__dirname, '..', 'public', 'allconnect');
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, 'layouts.js'), 'utf8'), ctx);
  for (const id of ['family_house', 'market_shop']) {
    const j = JSON.parse(fs.readFileSync(path.join(root, 'models', 'layouts', id + '.json'), 'utf8')), c = ctx.window.LAYOUTS[id];
    assert.equal(JSON.stringify([c.w, c.d, c.blocked, c.walls, c.start, c.model, c.fixtures || []]), JSON.stringify([j.w, j.d, j.blocked, j.walls, j.start, j.model, j.fixtures || []]), id);
    assert.equal(c.blockedSet.size, j.blocked.length);
  }
});

test('Market Shop: buyable, fixed 10x8 shop floor with built-in counter/shelves/stock that block furniture', () => {
  const { layoutFor } = require('../utils/layouts'), F = require('../utils/furniture'), L = layoutFor('market_shop');
  assert.ok(P.isHome('market_shop')); assert.equal(P.HOMES.market_shop.mode, 'buy'); assert.equal(P.expansionCost('market_shop', 0), 0);
  assert.equal(L.w, 10); assert.equal(L.d, 8); assert.equal(L.model, null); assert.deepEqual(L.fixtures.map(f => f.kind).sort(), ['counter', 'shelves', 'stock', 'stock']);
  for (const f of L.fixtures) for (let i = 0; i < f.w; i++) for (let j = 0; j < f.d; j++) assert.ok(L.blocked.has((f.x + i) + ',' + (f.z + j)), f.id + ' cells are blocked');
  assert.equal(L.blocked.size, L.fixtures.reduce((n, f) => n + f.w * f.d, 0));
  assert.equal(F.canPlace([], 'Plastic Chair', 3, 2, 0, undefined, L), false);      // on the counter
  assert.equal(F.canPlace([], 'Plastic Chair', 1, 6, 0, undefined, L), true);       // free floor
  assert.equal(F.canPlace([], 'Plastic Chair', 9, 7, 0, undefined, L), false);      // barrels
  assert.equal(F.canPlace([], 'Plastic Chair', 10, 3, 0, undefined, L), false);     // outside the 10-wide plan
  assert.equal(F.canPlace([], 'Plastic Chair', 5, 7, 0, undefined, L), true);       // last row, 8 deep
});
