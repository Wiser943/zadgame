// Exercises routes/acstyle.js end to end with an in-memory stand-in for MongoDB, Express and the wallet, so it runs without a database.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

/* ---------- tiny fakes ---------- */
const clone = (v) => (v instanceof Date ? new Date(v) : Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
const defaults = (user) => ({ user, owned: [], look: {}, dyes: {}, dura: {}, tailored: [], presets: [], salon: { hairAt: null, freshUntil: null, visits: 0, history: [] },
  motion: { walk: 'walk_normal', idle: 'idle_breathe', mood: 'neutral', autoMood: true }, identity: { pronouns: '', custom: '', title: '', autoUniform: false, access: {}, privacy: {} }, claimed: [], lastWear: null, wearDay: '', wearMs: 0 });
const store = new Map();
const getp = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setp(o, p, v, pos) { const ks = p.split('.'); let t = o; for (let i = 0; i < ks.length - 1; i++) { let k = ks[i] === '$' ? pos : ks[i]; if (t[k] == null) t[k] = {}; t = t[k]; } const last = ks[ks.length - 1]; t[last === '$' ? pos : last] = v; }
function delp(o, p) { const ks = p.split('.'); let t = o; for (let i = 0; i < ks.length - 1; i++) { t = t[ks[i]]; if (t == null) return; } delete t[ks[ks.length - 1]]; }
function matches(d, q) {
  let pos = null;
  for (const [k, c] of Object.entries(q)) {
    if (k.includes('.')) { const [arr, f] = k.split('.'); const i = (d[arr] || []).findIndex((x) => x[f] === c); if (i < 0) return { ok: false }; pos = i; continue; }
    const v = d[k]; if (c && typeof c === 'object' && '$ne' in c) { if (Array.isArray(v) ? v.includes(c.$ne) : v === c.$ne) return { ok: false }; } else if (v !== c) return { ok: false };
  }
  return { ok: true, pos };
}
const ACStyle = {
  async findOne(q) { const d = store.get(q.user); return d ? clone(d) : null; },
  async updateOne(q, u, o) {
    let d = store.get(q.user), up = 0;
    if (!d) { if (!(o && o.upsert)) return { modifiedCount: 0 }; d = defaults(q.user); store.set(q.user, d); up = 1; }
    const m = matches(d, q); if (!m.ok) return { modifiedCount: 0 };
    if (u.$setOnInsert && !up) { /* ignored on existing */ }
    for (const [p, v] of Object.entries(u.$set || {})) setp(d, p, clone(v), m.pos);
    for (const p of Object.keys(u.$unset || {})) delp(d, p);
    for (const [p, v] of Object.entries(u.$addToSet || {})) { const a = getp(d, p); if (!a.includes(v)) a.push(v); }
    for (const [p, v] of Object.entries(u.$push || {})) { const a = getp(d, p); const items = v && v.$each ? v.$each : [v]; a.push(...clone(items)); if (v && v.$slice) while (a.length > -v.$slice) a.shift(); }
    for (const [p, v] of Object.entries(u.$pull || {})) { const a = getp(d, p); const f = Object.entries(v)[0]; setp(d, p, a.filter((x) => x[f[0]] !== f[1])); }
    for (const [p, v] of Object.entries(u.$inc || {})) setp(d, p, (getp(d, p) || 0) + v);
    return { modifiedCount: up ? 0 : 1 };
  }
};
const users = new Map();
const mkUser = (id, o) => { const u = Object.assign({ _id: id, id, friends: [], blocked: [], displayName: 'P' + id, ac: { gender: 'male', cash: 5000000, jobId: '', needs: [.9, .9, .9, .9, .9, .9] } }, o || {}); users.set(id, u); return u; };
const User = { findById(id) { const u = users.get(String(id)) || null; const p = Promise.resolve(u); p.select = () => Promise.resolve(u); return p; } };
const econ = {
  cashOf: (u) => u.ac.cash,
  async debit(id, n) { const u = users.get(id); if (u.ac.cash < n) return null; u.ac.cash -= n; return u.ac.cash; },
  async credit(id, n) { users.get(id).ac.cash += n; return users.get(id).ac.cash; }
};
const notes = [];
const routes = [];
const Router = () => { const r = { use() {} }; for (const m of ['get', 'post', 'put', 'delete']) r[m] = (p, ...h) => routes.push({ m: m.toUpperCase(), p, h }); return r; };
const express = () => ({}); express.Router = Router;
const fakes = { express, '../models/User': User, '../models/ACStyle': ACStyle, '../middleware/auth': (q, s, n) => n(), '../utils/economy': econ, '../utils/acnotify': { notify: async (io, id, n) => { notes.push(n); } },
  './allconnect': { ensureAC: async (id) => users.get(id) } };
const origLoad = Module._load;
Module._load = function (req, parent, ...rest) { if (parent && /acstyle\.js$/.test(parent.filename) && req in fakes) return fakes[req]; return origLoad.call(this, req, parent, ...rest); };
const R = require('../routes/acstyle');   // the hook stays on: acstyle.js requires ./allconnect lazily
const S = require('../utils/acstyle');

async function call(method, p, uid, body) {
  for (const r of routes) {
    if (r.m !== method) continue; const names = [], re = new RegExp('^' + r.p.replace(/:([a-z]+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$'); const mm = re.exec(p); if (!mm) continue;
    const req = { user: users.get(uid), body: body || {}, params: Object.fromEntries(names.map((n, i) => [n, mm[i + 1]])), app: { get: () => null } };
    return new Promise((ok, no) => { const res = { code: 200, status(c) { this.code = c; return this; }, set() {}, json(b) { ok({ code: this.code, body: b }); } }; Promise.resolve(r.h[r.h.length - 1](req, res, no)).catch(no); });
  }
  throw new Error('no route ' + method + ' ' + p);
}
const fresh = (id, o) => { store.delete(id); return mkUser(id, o); };

test('state: new player gets the default look and the catalogue', async () => {
  fresh('u1'); const r = await call('GET', '/state', 'u1'); assert.strictEqual(r.code, 200);
  assert.ok(r.body.catalog.items.length > 100); assert.strictEqual(r.body.me.render.hair.style, 'lowcut'); assert.strictEqual(r.body.me.motion.autoMood, true);
  assert.strictEqual(r.body.me.identity.privacy.pronouns, 'friends'); assert.strictEqual(r.body.me.cash, 5000000);
});
test('buy, equip, and the rules around them', async () => {
  fresh('u2'); let r = await call('PUT', '/look', 'u2', { top: 'top_hoodie' }); assert.ok(r.body.errors.length); assert.strictEqual(r.body.me.look.top, 'top_tee');
  r = await call('POST', '/buy', 'u2', { id: 'top_hoodie' }); assert.strictEqual(r.code, 200); assert.strictEqual(users.get('u2').ac.cash, 5000000 - 28000);
  r = await call('POST', '/buy', 'u2', { id: 'top_hoodie' }); assert.strictEqual(r.code, 409); assert.strictEqual(users.get('u2').ac.cash, 5000000 - 28000);
  r = await call('PUT', '/look', 'u2', { top: 'top_hoodie', body: 'plus', skin: '#43281a' }); assert.strictEqual(r.body.me.render.top.deco, 'hood'); assert.strictEqual(r.body.me.look.body, 'plus'); assert.strictEqual(r.body.me.look.skin, '#43281a');
  users.get('u2').ac.cash = 100; r = await call('POST', '/buy', 'u2', { id: 'out_agbada' }); assert.strictEqual(r.code, 402); assert.ok(!store.get('u2').owned.includes('out_agbada'));
  r = await call('POST', '/buy', 'u2', { id: 'top_tee' }); assert.strictEqual(r.code, 409, 'free items need no purchase');
});
test('seasonal items: not sold out of season, sold in season', async () => {
  fresh('u3'); const off = ['harmattan', 'detty', 'independence', 'sallah'].map((s) => Object.values(S.ITEMS).find((i) => i.season === s && !S.seasonOn(s))).filter(Boolean)[0];
  if (off) { const r = await call('POST', '/buy', 'u3', { id: off.id }); assert.strictEqual(r.code, 403); }
  const on = Object.values(S.ITEMS).find((i) => i.season && S.seasonOn(i.season)); if (on) { const r = await call('POST', '/buy', 'u3', { id: on.id }); assert.strictEqual(r.code, 200); }
});
test('dye: pays once, validates colours, reset is free', async () => {
  fresh('u4'); await call('POST', '/buy', 'u4', { id: 'top_hoodie' }); const c0 = users.get('u4').ac.cash;
  let r = await call('POST', '/dye', 'u4', { id: 'top_hoodie', c1: 'red' }); assert.strictEqual(r.code, 400);
  r = await call('POST', '/dye', 'u4', { id: 'top_hoodie', c1: '#FF0000' }); assert.strictEqual(r.code, 200); assert.strictEqual(users.get('u4').ac.cash, c0 - S.dyeCost('top_hoodie')); assert.strictEqual(r.body.me.dyes.top_hoodie.c1, '#ff0000');
  r = await call('POST', '/dye', 'u4', { id: 'top_hoodie', c1: '#ff0000' }); assert.strictEqual(r.code, 400);
  r = await call('POST', '/dye', 'u4', { id: 'j_chain', c1: '#ff0000' }); assert.strictEqual(r.code, 400);
  r = await call('POST', '/dye', 'u4', { id: 'top_hoodie', reset: true }); assert.ok(!r.body.me.dyes.top_hoodie);
  r = await call('POST', '/dye', 'u4', { id: 'out_agbada', c1: '#ff0000' }); assert.strictEqual(r.code, 403, 'not owned');
});
test('tailor: order, busy limit, ready time, wear, remove', async () => {
  fresh('u5'); let r = await call('POST', '/tailor/order', 'u5', { base: 'kaftan', fabric: 'cotton', fit: 'loose', c1: '#112233', c2: '#445566', label: 'Tolu' });
  assert.strictEqual(r.code, 200); const t = r.body.me.tailored[0]; assert.strictEqual(r.body.me.cash, 5000000 - S.tailorPrice({ base: 'kaftan', fabric: 'cotton', label: 'Tolu' }));
  r = await call('POST', '/tailor/collect', 'u5', { id: t.id }); assert.strictEqual(r.code, 409, 'not ready');
  r = await call('PUT', '/look', 'u5', { outfit: t.itemId }); assert.ok(r.body.errors.length);
  store.get('u5').tailored[0].readyAt = new Date(Date.now() - 1000);
  r = await call('POST', '/tailor/collect', 'u5', { id: t.id }); assert.strictEqual(r.code, 200);
  r = await call('PUT', '/look', 'u5', { outfit: t.itemId }); assert.strictEqual(r.body.me.render.outfit.label, 'Tolu'); assert.strictEqual(r.body.me.render.outfit.fit, 1.1);
  for (let i = 0; i < 3; i++) await call('POST', '/tailor/order', 'u5', { base: 'dress', fabric: 'aso_oke' });
  r = await call('POST', '/tailor/order', 'u5', { base: 'dress', fabric: 'aso_oke' }); assert.strictEqual(r.code, 409);
  r = await call('POST', '/tailor/order', 'u5', { base: 'x', fabric: 'cotton' }); assert.strictEqual(r.code, 400);
  r = await call('POST', '/tailor/order', 'u5', { base: 'dress', fabric: 'cotton', label: '<b>' }); assert.strictEqual(r.code, 400);
  r = await call('DELETE', '/tailor/' + t.id, 'u5'); assert.strictEqual(r.body.me.look.outfit, ''); assert.ok(!r.body.me.tailored.some((x) => x.id === t.id));
  fresh('u5b', { ac: { gender: 'male', cash: 5000000, jobId: 'fashion', needs: [] } }); const a = await call('POST', '/tailor/order', 'u5b', { base: 'kaftan', fabric: 'cotton' }); assert.strictEqual(a.body.me.cash, 5000000 - S.tailorPrice({ base: 'kaftan', fabric: 'cotton' }, 'fashion'));
});
test('presets: save, load (skips what is gone), cap of 8, delete', async () => {
  fresh('u6'); await call('POST', '/buy', 'u6', { id: 'top_hoodie' }); await call('PUT', '/look', 'u6', { top: 'top_hoodie' });
  let r = await call('POST', '/presets', 'u6', { name: 'Chill' }); assert.strictEqual(r.body.me.presets.length, 1); assert.ok(!('hair' in r.body.me.presets[0].look));
  await call('PUT', '/look', 'u6', { top: 'top_tee' }); const id = store.get('u6').presets[0].id;
  r = await call('PUT', `/presets/${id}/load`, 'u6'); assert.strictEqual(r.body.me.look.top, 'top_hoodie'); assert.strictEqual(r.body.errors.length, 0);
  await call('PUT', '/look', 'u6', { top: 'top_tee' }); store.get('u6').dura.top_hoodie = 0;      // worn out since saving: left off and reported
  r = await call('PUT', `/presets/${id}/load`, 'u6'); assert.strictEqual(r.body.me.look.top, ''); assert.ok(r.body.errors.length);
  for (let i = 0; i < 7; i++) await call('POST', '/presets', 'u6', { name: 'P' + i }); r = await call('POST', '/presets', 'u6', { name: 'Nine' }); assert.strictEqual(r.code, 409);
  r = await call('POST', '/presets', 'u6', { name: '' }); assert.strictEqual(r.code, 400);
  r = await call('DELETE', `/presets/${id}`, 'u6'); assert.strictEqual(r.body.me.presets.length, 7);
});
test('salon: pays, loyalty on every 5th visit, touch-up only when overgrown, colours validated', async () => {
  fresh('u7'); let r = await call('POST', '/salon', 'u7', { svc: 'style', hair: 'afro' }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.paid, 6000); assert.strictEqual(r.body.me.render.hair.style, 'afro'); assert.strictEqual(r.body.me.salon.fresh, true);
  r = await call('POST', '/salon', 'u7', { svc: 'touchup' }); assert.strictEqual(r.code, 400);
  r = await call('POST', '/salon', 'u7', { svc: 'colour', color: '#123456' }); assert.strictEqual(r.code, 400);
  r = await call('POST', '/salon', 'u7', { svc: 'style', hair: 'fade', color: '#e75a9b' }); assert.strictEqual(r.body.paid, 4500 + 6000); assert.strictEqual(r.body.me.render.hair.color, '#e75a9b');
  await call('POST', '/salon', 'u7', { svc: 'wash' }); await call('POST', '/salon', 'u7', { svc: 'wash' });
  r = await call('POST', '/salon', 'u7', { svc: 'spa' }); assert.strictEqual(r.body.loyalty, true); assert.strictEqual(r.body.paid, 10800);
  store.get('u7').salon.hairAt = new Date(Date.now() - 40 * 86400000); r = await call('GET', '/state', 'u7'); assert.strictEqual(r.body.me.salon.overgrown, true); assert.strictEqual(r.body.me.render.hair.messy, true);
  const c = users.get('u7').ac.cash; r = await call('POST', '/salon', 'u7', { svc: 'touchup' }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.me.salon.overgrown, false); assert.ok(c - users.get('u7').ac.cash > 0);
  r = await call('POST', '/salon', 'u7', { svc: 'beard', beard: 'full' }); assert.strictEqual(r.body.me.render.beard, 'full'); r = await call('POST', '/salon', 'u7', { svc: 'style', hair: 'nope' }); assert.strictEqual(r.code, 400);
  users.get('u7').ac.cash = 10; r = await call('POST', '/salon', 'u7', { svc: 'style', hair: 'locs' }); assert.strictEqual(r.code, 402); assert.notStrictEqual(store.get('u7').look.hair, 'locs');
});
test('motion: walk and idle must be unlocked, moods are free, auto mood', async () => {
  fresh('u8'); let r = await call('PUT', '/motion', 'u8', { walk: 'walk_catwalk' }); assert.ok(r.body.errors.length); assert.strictEqual(r.body.me.motion.walk, 'walk_normal');
  await call('POST', '/buy', 'u8', { id: 'walk_catwalk' }); r = await call('PUT', '/motion', 'u8', { walk: 'walk_catwalk', mood: 'sad', autoMood: false }); assert.strictEqual(r.body.me.motion.walk, 'walk_catwalk'); assert.strictEqual(r.body.me.render.mood, 'sad');
  r = await call('PUT', '/motion', 'u8', { idle: 'walk_catwalk' }); assert.ok(r.body.errors.length); r = await call('PUT', '/motion', 'u8', { mood: 'nope' }); assert.ok(r.body.errors.length);
  users.get('u8').ac.needs = [.05, .9, .9, .9, .9, .9]; r = await call('PUT', '/motion', 'u8', { autoMood: true }); assert.strictEqual(r.body.me.render.mood, 'angry');
});
test('identity: pronouns, custom text filter, title must be earned, privacy values validated, clear', async () => {
  fresh('u9'); let r = await call('PUT', '/identity', 'u9', { pronouns: 'custom', custom: 'xe/xem' }); assert.strictEqual(r.body.me.identity.custom, 'xe/xem'); assert.strictEqual(r.body.errors.length, 0);
  r = await call('PUT', '/identity', 'u9', { pronouns: 'bogus', custom: '<script>' }); assert.strictEqual(r.body.errors.length, 2);
  r = await call('PUT', '/identity', 'u9', { title: 'Grail Hunter' }); assert.ok(r.body.errors.length);
  r = await call('PUT', '/identity', 'u9', { privacy: { look: 'friends', pronouns: 'everyone', mood: 'weird', roster: false }, access: { reduceMotion: true, hack: true } });
  assert.strictEqual(r.body.me.identity.privacy.look, 'friends'); assert.strictEqual(r.body.me.identity.privacy.pronouns, 'everyone'); assert.strictEqual(r.body.me.identity.privacy.mood, 'friends'); assert.strictEqual(r.body.me.identity.privacy.roster, false);
  assert.strictEqual(r.body.me.identity.access.reduceMotion, true); assert.ok(!('hack' in r.body.me.identity.access)); assert.strictEqual(r.body.errors.length, 1);
  r = await call('POST', '/identity/clear', 'u9'); assert.strictEqual(r.body.me.identity.pronouns, ''); assert.strictEqual(r.body.me.identity.custom, ''); assert.strictEqual(r.body.me.identity.privacy.look, 'friends', 'privacy stays');
});
test('durability: wear ticks slowly, is rate-limited, worn-out clothes come off and can be repaired', async () => {
  fresh('u10'); let r = await call('POST', '/wear', 'u10'); assert.ok(r.body.credited > 0); assert.ok(r.body.me.dura.top_tee < 100);
  r = await call('POST', '/wear', 'u10'); assert.strictEqual(r.body.credited, 0, 'too soon');
  const d = store.get('u10'); d.lastWear = new Date(Date.now() - 600000); d.dura.top_tee = .01; r = await call('POST', '/wear', 'u10'); assert.deepStrictEqual(r.body.broke, ['T-shirt']);
  assert.strictEqual(r.body.me.dura.top_tee, 0); assert.ok(notes.some((n) => /wore out/.test(n.text)));
  r = await call('PUT', '/look', 'u10', { top: 'top_tee' }); assert.ok(r.body.errors.length, 'cannot wear worn-out clothes');
  const c = users.get('u10').ac.cash; r = await call('POST', '/repair', 'u10', { id: 'top_tee' }); assert.strictEqual(r.code, 200); assert.ok(users.get('u10').ac.cash < c); assert.strictEqual(r.body.me.dura.top_tee, 100);
  r = await call('POST', '/repair', 'u10', { id: 'top_tee' }); assert.strictEqual(r.code, 400);
  fresh('u10b'); await call('POST', '/wear', 'u10b'); const dd = store.get('u10b'); dd.lastWear = new Date(Date.now() - 600000); dd.wearDay = new Date(Date.now() + 3600000).toISOString().slice(0, 10); dd.wearMs = S.WEAR_DAY_CAP_MS; r = await call('POST', '/wear', 'u10b'); assert.strictEqual(r.body.credited, 0, 'daily cap');
});
test('collections pay each milestone once', async () => {
  fresh('u11', { ac: { gender: 'male', cash: 9000000, jobId: '', needs: [] } }); const mem = S.setMembers('sneakers').slice(0, 4); const c0 = users.get('u11').ac.cash; let paid = 0, spent = 0;
  for (const id of mem) { const r = await call('POST', '/buy', 'u11', { id }); spent += S.ITEMS[id].price; paid += r.body.rewards.length; }
  assert.strictEqual(paid, 1); assert.strictEqual(users.get('u11').ac.cash, c0 - spent + 15000); assert.deepStrictEqual(store.get('u11').claimed, ['sneakers:3']);
  const r = await call('PUT', '/identity', 'u11', { title: 'Sneakerhead' }); assert.strictEqual(r.body.errors.length, 0); assert.strictEqual(r.body.me.identity.title, 'Sneakerhead');
});
test('job uniforms: free for your job, buying keeps it, auto-uniform during work hours', async () => {
  fresh('u12', { ac: { gender: 'female', cash: 1000000, jobId: 'health', needs: [] } }); let r = await call('PUT', '/look', 'u12', { outfit: 'uni_health' }); assert.strictEqual(r.body.me.render.outfit.deco, 'badge');
  r = await call('PUT', '/look', 'u12', { outfit: 'uni_oil' }); assert.ok(r.body.errors.length);
  r = await call('POST', '/buy', 'u12', { id: 'uni_health' }); assert.strictEqual(r.code, 200);
  r = await call('PUT', '/identity', 'u12', { autoUniform: true }); assert.strictEqual(r.body.me.identity.autoUniform, true);
});
test('what other people see follows privacy; blocked players see nothing; roster respects the map switch', async () => {
  const me = fresh('aaaaaaaaaaaaaaaaaaaaaaaa'), friend = mkUser('bbbbbbbbbbbbbbbbbbbbbbbb'), stranger = mkUser('cccccccccccccccccccccccc'), blocked = mkUser('dddddddddddddddddddddddd'); me.friends = [friend.id]; me.blocked = [blocked.id];
  await call('PUT', '/identity', me.id, { pronouns: 'theythem' });
  let r = await call('GET', '/of/' + me.id, stranger.id); assert.ok(r.body.render); assert.ok(!('pronouns' in r.body)); assert.ok(!('mood' in r.body)); assert.strictEqual(r.body.relation, 'stranger');
  r = await call('GET', '/of/' + me.id, friend.id); assert.strictEqual(r.body.pronouns, 'they/them'); assert.ok('mood' in r.body); assert.strictEqual(r.body.relation, 'friend');
  r = await call('GET', '/of/' + me.id, me.id); assert.strictEqual(r.body.relation, 'self');
  r = await call('GET', '/of/' + me.id, blocked.id); assert.strictEqual(r.code, 404);
  r = await call('GET', '/of/not-an-id', stranger.id); assert.strictEqual(r.code, 400);
  await call('PUT', '/identity', me.id, { privacy: { look: 'friends', pronouns: 'everyone', hideModel: true } });
  r = await call('GET', '/of/' + me.id, stranger.id); assert.ok(!('render' in r.body)); assert.strictEqual(r.body.pronouns, 'they/them');
  r = await call('GET', '/of/' + me.id, friend.id); assert.ok(r.body.render); assert.strictEqual(r.body.render.g, '', 'model hidden from others');
  r = await call('GET', '/of/' + me.id, me.id); assert.strictEqual(r.body.render.g, 'male');
  let e = await R.rosterEntry(me.id); assert.strictEqual(e.l, null); assert.strictEqual(e.g, '');
  await call('PUT', '/identity', me.id, { privacy: { look: 'everyone', hideModel: false, roster: true } }); e = await R.rosterEntry(me.id); assert.ok(e.l && e.l.hair && !('c2' in e.l.top), 'compact'); assert.strictEqual(e.g, 'male');
  await call('PUT', '/identity', me.id, { privacy: { roster: false } }); e = await R.rosterEntry(me.id); assert.strictEqual(e.l, null);
  e = await R.rosterEntry('zzz'); assert.strictEqual(e, null);
});
test('new life wipes what you bought but keeps who you are', async () => {
  fresh('u13'); await call('POST', '/buy', 'u13', { id: 'top_hoodie' }); await call('PUT', '/look', 'u13', { top: 'top_hoodie', body: 'curvy' }); await call('PUT', '/identity', 'u13', { pronouns: 'sheher', privacy: { look: 'me' } });
  await R.resetWardrobe('u13'); const r = await call('GET', '/state', 'u13'); assert.deepStrictEqual(r.body.me.owned, []); assert.strictEqual(r.body.me.look.body, 'curvy'); assert.strictEqual(r.body.me.look.top, 'top_tee');
  assert.strictEqual(r.body.me.identity.pronouns, 'sheher'); assert.strictEqual(r.body.me.identity.privacy.look, 'me');
});
test('rate limit', async () => { fresh('u14'); let last; for (let i = 0; i < 62; i++) last = await call('PUT', '/look', 'u14', { body: 'slim' }); assert.strictEqual(last.code, 429); });
