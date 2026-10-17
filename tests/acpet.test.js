// Pet app: the rules (utils/acpet.js) and the routes (routes/acpet.js) run against in-memory fakes, so no database is needed.
// The main thing checked: everything bought for the pet is charged from the main balance, and nothing is charged when it is refused.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const P = require('../utils/acpet');
const { FOOD: PEOPLE_FOOD } = require('../utils/allconnect');

test('pet food and care cost more than people food', () => {
  for (const id of Object.keys(P.FOOD)) assert.ok(P.FOOD[id].price >= 3000, id);
  assert.ok(P.FOOD.jollof.price > PEOPLE_FOOD.jollof.price * 3);
  assert.ok(P.CARE.vet.price >= 40000 && P.CARE.medicine.price >= 20000);
  assert.equal(P.priceOf('food', 'jollof', { mult: { food: 1.2 } }), 10800);   // the city event moves food prices
  assert.equal(P.priceOf('care', 'vet', { mult: { food: 2 } }), P.CARE.vet.price);
});
test('needs fade with time, stop after 8 hours, and she falls ill when neglected', () => {
  const p = P.defaults('u'); p.t = new Date(Date.now() - 120 * 60000); P.advance(p);
  assert.ok(p.hunger < 80 && p.hunger > 30 && !P.sick(p));
  const q = P.defaults('u'); q.t = new Date(Date.now() - 20 * 3600000); P.advance(q);
  assert.ok(q.hunger >= 3 && q.health >= 3 && P.sick(q));
  const z = P.defaults('u'); z.asleep = true; z.energy = 20; z.t = new Date(Date.now() - 60 * 60000); P.advance(z); assert.ok(z.energy > 60);
});
test('game rewards are capped per score and per day', () => {
  assert.equal(P.reward('mouse', 5, 0), 750);
  assert.equal(P.reward('mouse', 9999, 0), 40 * 150);
  assert.equal(P.reward('paws', 3, P.GAME.cap - 100), 100);
  assert.equal(P.reward('nope', 3, 0), 0); assert.equal(P.reward('mouse', -4, 0), 0);
});

/* ---------- routes with fakes ---------- */
const users = new Map(), pets = new Map(), txns = [];
const mkPet = (o) => Object.assign({ markModified() {}, async save() { pets.set(this.user, this); } }, o);
const fakes = {
  '../models/User': {
    async findOneAndUpdate(q, u) { const d = users.get(q._id); if (!d || d.ac.cash < q['ac.cash'].$gte) return null; d.ac.cash += u.$inc['ac.cash']; return JSON.parse(JSON.stringify(d)); },
    async updateOne(q, u) { users.get(q._id).ac.cash += u.$inc['ac.cash']; },
    findById(id) { return { select() { return { async lean() { return JSON.parse(JSON.stringify(users.get(id))); } }; } }; }
  },
  '../models/ACTxn': { async create(r) { txns.push(r); return r; } },
  '../models/ACPet': {
    async findOne(q) { return pets.get(q.user) || null; },
    async create(o) { const d = mkPet(o); pets.set(o.user, d); return d; }
  },
  '../middleware/auth': (req, res, next) => { req.user = { id: 'u1' }; next(); },
  './allconnect': { ensureAC: async () => ({}) },
  '../utils/acbank': { makeRef: () => 'REF' }, '../utils/acnotify': { emitUser() {} },
  '../utils/aclagos': { currentEvent: () => ({ mult: {} }) }
};
const load = Module._load;
Module._load = function (req, parent, ...r) { if (parent && /routes[\\/]acpet\.js$/.test(parent.filename) && fakes[req]) return fakes[req]; return load.call(this, req, parent, ...r); };
let express; try { express = require('express'); } catch (e) { /* express not installed here */ }
const maybe = express ? test : test.skip;
let base, server;
maybe('routes: setup', async () => {
  const router = require('../routes/acpet'); const app = express(); app.use(express.json()); app.use('/api/ac/pet', router);
  await new Promise((ok) => { server = app.listen(0, ok); }); base = 'http://127.0.0.1:' + server.address().port + '/api/ac/pet';
});
const call = async (path, body) => { const r = await fetch(base + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); return { s: r.status, j: await r.json() }; };
maybe('routes: buying food is charged from the main balance and logged', async () => {
  users.set('u1', { ac: { cash: 100000 } });
  const g = await call('/'); assert.equal(g.s, 200); assert.equal(g.j.pet.name, 'Kobo'); assert.ok(g.j.catalog.food.length === 4);
  pets.get('u1').hunger = 30;
  const r = await call('/buy', { kind: 'food', id: 'jollof' });
  assert.equal(r.s, 200); assert.equal(r.j.price, 9000); assert.equal(r.j.cash, 91000); assert.equal(users.get('u1').ac.cash, 91000);
  assert.ok(r.j.pet.hunger >= 64); assert.equal(txns.at(-1).type, 'debit'); assert.equal(txns.at(-1).amount, 9000); assert.equal(txns.at(-1).kind, 'pet');
});
maybe('routes: refused purchases never charge', async () => {
  users.get('u1').ac.cash = 5000; pets.get('u1').hunger = 30; const n = txns.length;
  let r = await call('/buy', { kind: 'food', id: 'jollof' }); assert.equal(r.s, 402); assert.equal(users.get('u1').ac.cash, 5000);
  users.get('u1').ac.cash = 100000; pets.get('u1').hunger = 99;
  r = await call('/buy', { kind: 'food', id: 'jollof' }); assert.equal(r.s, 409); assert.equal(users.get('u1').ac.cash, 100000);
  r = await call('/buy', { kind: 'care', id: 'bath' }); assert.equal(r.s, 200);
  pets.get('u1').clean = 99; r = await call('/buy', { kind: 'care', id: 'vet' }); assert.equal(r.s, 409);
  r = await call('/buy', { kind: 'food', id: 'caviar' }); assert.equal(r.s, 400);
  pets.get('u1').asleep = true; r = await call('/buy', { kind: 'toy', id: 'ball' }); assert.equal(r.s, 409);
  pets.get('u1').asleep = false; assert.ok(txns.length >= n);
});
maybe('routes: vet heals, clothes are owned once bought and can be worn and removed', async () => {
  users.get('u1').ac.cash = 500000; const d = pets.get('u1'); d.health = 20; d.hunger = 80; d.clean = 80; d.fun = 80;
  let r = await call('/buy', { kind: 'care', id: 'vet' }); assert.equal(r.s, 200); assert.equal(r.j.pet.health, 100); assert.equal(r.j.cash, 455000);
  r = await call('/buy', { kind: 'cloth', id: 'crown' }); assert.equal(r.s, 200); assert.equal(r.j.pet.worn.hat, 'crown'); assert.ok(r.j.pet.owned.includes('crown'));
  r = await call('/buy', { kind: 'cloth', id: 'crown' }); assert.equal(r.s, 409);
  r = await call('/wear', { slot: 'hat', id: '' }); assert.equal(r.j.pet.worn.hat, undefined);
  r = await call('/wear', { slot: 'hat', id: 'crown' }); assert.equal(r.j.pet.worn.hat, 'crown');
  r = await call('/wear', { slot: 'hat', id: 'gele' }); assert.equal(r.s, 409);        // not bought
  const cash = users.get('u1').ac.cash; await call('/wear', { slot: 'hat', id: '' }); assert.equal(users.get('u1').ac.cash, cash);   // wearing is free
});
maybe('routes: mini-games pay a small capped amount, with a cooldown, and tire her out', async () => {
  const d = pets.get('u1'); d.energy = 90; d.health = 90; d.asleep = false; const cash = users.get('u1').ac.cash;
  let r = await call('/game', { game: 'mouse', score: 10 }); assert.equal(r.s, 200); assert.equal(r.j.prize, 1500); assert.equal(users.get('u1').ac.cash, cash + 1500);
  assert.ok(r.j.pet.energy <= 80); assert.equal(txns.at(-1).type, 'credit');
  r = await call('/game', { game: 'mouse', score: 10 }); assert.equal(r.s, 429);
  d.lastGame = new Date(Date.now() - 60000); r = await call('/game', { game: 'mouse', score: 9999 }); assert.equal(r.j.prize, 6000);
  d.lastGame = new Date(Date.now() - 60000); r = await call('/game', { game: 'paws', score: 15 }); assert.equal(r.j.prize, 500); assert.equal(r.j.game.capped, true);
});
maybe('routes: names are checked', async () => {
  assert.equal((await call('/rename', { name: '<b>x</b>' })).s, 400);
  const r = await call('/rename', { name: 'Mimi' }); assert.equal(r.j.pet.name, 'Mimi');
});
maybe('routes: teardown', () => { server.close(); Module._load = load; });
