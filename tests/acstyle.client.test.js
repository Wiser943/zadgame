// Keeps the browser drawing code (public/allconnect/avatar.js) in step with the server catalogue (utils/acstyle.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const S = require('../utils/acstyle');

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/allconnect/avatar.js'), 'utf8'), { window: win, document: {}, performance: { now: () => 0 }, requestAnimationFrame: () => 0 });
const A = win.ACAvatar;

test('client body types match the server', () => {
  assert.deepStrictEqual(Object.keys(A.BODIES).sort(), Object.keys(S.BODIES).sort());
  for (const [id, b] of Object.entries(S.BODIES)) for (const k of ['h', 'sh', 'tw', 'hp', 'lw']) assert.strictEqual(A.BODIES[id][k], b[k], id + '.' + k);
});
test('every hairstyle, walk, idle, pose and mood the server sells can be drawn', () => {
  for (const h of S.HAIRSTYLES) assert.ok(A.HS[h.id], 'hair ' + h.id);
  const ids = slot => Object.values(S.ITEMS).filter(i => i.slot === slot).map(i => i.id).sort();
  assert.deepStrictEqual(Array.from(A.WALKS).sort(), ids('walk')); assert.deepStrictEqual(Array.from(A.IDLES).sort(), ids('idle')); assert.deepStrictEqual(Array.from(A.POSES).sort(), ids('pose'));
  assert.deepStrictEqual(Array.from(A.MOODS).sort(), Object.keys(S.MOODS).sort());
  assert.deepStrictEqual(Array.from(A.SKIN_HEX), S.SKIN);
});
test('every item kind the server can send has a drawing routine', () => {
  const known = {
    top: 'tee tank long', bottom: 'long short skirt', outfit: 'agbada longtop iro dress dashiki coverall suit vest apron scrubs long', shoes: 'sneaker sandal formal heel boot hightop chunky',
    head: 'gele fila redcap hausacap beanie cap bucket crown headtie', neckwear: 'scarf coral', hand: 'fan staff umbrella clutch', face: 'specs shades',
    j_neck: 'chain pendant pearls choker', j_ear: 'studs hoops drops', j_wrist: 'bangle beads watch', j_ring: 'ring', j_waist: 'waistbeads', j_ankle: 'anklet'
  };
  for (const it of Object.values(S.ITEMS)) { if (!it.r) continue; assert.ok(known[it.slot], 'slot ' + it.slot); assert.ok(known[it.slot].split(' ').includes(it.r.k), `${it.id}: kind "${it.r.k}" in ${it.slot}`); }
  for (const b of Object.values(S.TAILOR.bases)) assert.ok(known.outfit.split(' ').includes(b.k), 'tailor base ' + b.k);
  const pats = 'solid stripe dots lace ankara adire aso'.split(' '); for (const it of Object.values(S.ITEMS)) if (it.r) assert.ok(pats.includes(it.r.pat), it.id + ' pattern ' + it.r.pat);
  for (const f of Object.values(S.TAILOR.fabrics)) assert.ok(pats.includes(f.pat), 'fabric ' + f.pat);
});
test('client mood rule matches the server rule', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/allconnect/styleapp.js'), 'utf8'), m = /mood\(needs\) \{[\s\S]*?\n  \},/.exec(src);
  const STYLE = new Function('return {' + m[0].replace(/,\s*$/, '') + '}')();
  for (const n of [[.9, .9, .9, .9, .9, .9], [.1, .9, .9, .9, .9, .9], [.9, .1, .9, .9, .9, .9], [.9, .9, .1, .9, .9, .9], [.9, .9, .9, .1, .9, .9], [.9, .9, .9, .9, .1, .9], [.9, .9, .9, .9, .9, .1], [.7, .7, .7, .7, .7, .7], [.5, .5, .5, .5, .5, .5], null, [1, 2]]) assert.strictEqual(STYLE.mood(n), S.autoMood(n), JSON.stringify(n));
});
