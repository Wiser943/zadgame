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
