// Smoke test for the 3D room character: builds and animates every kind of look against a stand-in for Three.js (no GPU, no network).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const S = require('../utils/acstyle');

const vec = () => new Proxy({ x: 0, y: 0, z: 0 }, { get(t, k) { return k in t ? t[k] : (...a) => proxy; }, set(t, k, v) { t[k] = v; return true } });
const proxy = vec();
const node = () => { const o = { children: [], visible: true }; const p = new Proxy(o, { get(t, k) { if (k in t) return t[k]; if (k === 'position' || k === 'scale' || k === 'rotation' || k === 'repeat') return (t[k] = vec()); if (k === 'add') return (c) => { t.children.push(c); return p; }; return () => p; }, set(t, k, v) { t[k] = v; return true } }); return p; };
const THREE = new Proxy({}, { get: (t, k) => (k === 'RepeatWrapping' ? 1 : function () { return node(); }) });
const ctx = { THREE, document: { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) , set: () => true }), width: 0, height: 0 }) }, performance: { now: () => 0 }, requestAnimationFrame: () => 0, S: { gender: 'male' }, console };
ctx.window = ctx; const win = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/allconnect/avatar.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/allconnect/room3d.js'), 'utf8'), ctx);
const R = win.ROOM3D, A = win.ACAvatar;
R.scene = { add() {}, remove() {} }; R.on = true;

const looks = () => {
  const out = [], base = [['male', {}], ['female', {}], ['male', { body: 'plus', hair: 'afro', beard: 'full', top: 'top_hoodie' }], ['female', { body: 'curvy', hair: 'box_braids', outfit: 'out_ankara_dress', head: 'c_gele', face: 'sh_face_shades', hand: 'c_abebe', neckwear: 'c_coral', jewel: { neck: 'j_pearl', ear: 'j_hoops', wrist: 'j_watch', ring: 'j_signet', waist: 'j_waist', ankle: 'j_anklet' } }],
    ['male', { outfit: 'out_agbada', head: 'c_fila', hand: 'c_staff', shoes: 'sn_hightop' }], ['female', { outfit: 'out_iro_buba', head: 'c_headtie', hand: 's_umbrella', shoes: 'sh_sandals' }], ['male', { outfit: 'uni_banking' }], ['female', { hair: 'bob', hand: 'c_ankara_bag', head: 'sh_bucket' }]];
  for (const [g, l] of base) out.push(S.resolve(l, { gender: g, freshUntil: Date.now() + 1e6, hairAt: 1, now: 3e10 }));
  for (const h of S.HAIRSTYLES) out.push(S.resolve({ hair: h.id }, { gender: 'female' }));
  for (const it of Object.values(S.ITEMS)) { if (!it.r) continue; const l = {}, s = it.slot; if (['top', 'bottom', 'outfit', 'shoes', 'head', 'neckwear', 'hand', 'face'].includes(s)) l[s] = it.id; else if (S.JEWEL_SLOTS && Object.values(S.JEWEL_SLOTS).includes(s)) l.jewel = { [Object.keys(S.JEWEL_SLOTS).find((k) => S.JEWEL_SLOTS[k] === s)]: it.id }; out.push(S.resolve(l, { gender: 'male' })); }
  for (const id of Object.keys(S.MOODS)) out.push(S.resolve({}, { gender: 'female', mood: id }));
  for (const b of Object.keys(S.BODIES)) out.push(S.resolve({ body: b }, { gender: 'male' }));
  for (const [k, m] of Object.entries(S.ITEMS)) if (m.slot === 'm_lips' || m.slot === 'm_eyes' || m.slot === 'm_cheeks' || m.slot === 'm_liner' || m.slot === 'm_glow') out.push(S.resolve({ makeup: { [Object.keys(S.MAKEUP_SLOTS).find((x) => S.MAKEUP_SLOTS[x] === m.slot)]: { id: k, c: m.palette[0], a: .8 } } }, { gender: 'female' }));
  return out;
};

test('the 3D character builds and animates for every look', () => {
  const all = looks(); assert.ok(all.length > 150);
  for (const r of all) { R.buildAvatar(r.g, r); R.animate(1, .016, false); R.animate(1.2, .016, true); }
});
test('every walk, idle, photo pose and mood animates without breaking', () => {
  R.buildAvatar('female', S.resolve({}, { gender: 'female' }));
  for (const w of S.ITEMS ? Object.values(S.ITEMS).filter((i) => i.slot === 'walk') : []) { R.setExt({ walk: w.id }); for (let i = 0; i < 5; i++) R.animate(i, .05, true); }
  for (const w of Object.values(S.ITEMS).filter((i) => i.slot === 'idle')) { R.setExt({ idle: w.id }); for (let i = 0; i < 5; i++) R.animate(i, .05, false); }
  R.setExt({});
  for (const w of Object.values(S.ITEMS).filter((i) => i.slot === 'pose')) { R.setPose(w.id); for (let i = 0; i < 5; i++) R.animate(i, .05, false); }
  R.setPose('');
  for (const m of Object.keys(S.MOODS)) { R.setMood(m); R.animate(1, .05, false); }
  R.setExt({ reduce: true, noSparkle: true }); R.emote('dance'); R.animate(1, .05, false);
  for (const k of Object.keys(R.pose)) assert.ok(Number.isFinite(R.pose[k]), k);
});
test('setLook rebuilds in place and setGender keeps a matching look', () => {
  R.setLook(S.resolve({ body: 'tall' }, { gender: 'male' })); assert.strictEqual(R.gender, 'male'); R.setGender('female'); assert.strictEqual(R.gender, 'female');
});
