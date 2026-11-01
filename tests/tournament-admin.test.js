// Tournament prices are fixed by the admin: per-tournament entry fee + prizes, refunds on cancel, players can't create or start.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mk = (p, exports) => { const f = path.resolve(__dirname, '..', p); require.cache[f] = { id: f, filename: f, loaded: true, exports }; };

const docs = new Map(), credits = [], userUpdates = [];
mk('models/Social.js', { Tournament: {
  findById: async (id) => { const d = docs.get(String(id)); if (!d) return null; return Object.assign(d, { markModified() {}, async save() { return d; } }); },
  findOneAndUpdate: async (q, u) => { const d = docs.get(String(q._id)); if (!d || d.status !== q.status) return null; Object.assign(d, u.$set); return d; },
  find: () => ({ select: () => ({ lean: async () => [] }) })
} });
mk('models/User.js', { updateOne: (q, u) => { userUpdates.push({ q, u }); return Promise.resolve(); } });
mk('utils/economy.js', { credit: async (id, n) => { credits.push({ id, n }); }, debit: async () => 1, announce() {} });
const svc = require('../services/tournaments');

test('prizes come from the tournament the admin created, with platform defaults for anything missing', () => {
  const p = svc.prizesOf({ prizes: { champion: { coins: 250000, xp: 50 }, runnerUp: { coins: 100000 } } });
  assert.equal(p.champion.coins, 250000); assert.equal(p.champion.xp, 50); assert.equal(p.runnerUp.coins, 100000);
  assert.equal(p.runnerUp.xp, svc.PRIZES.runnerUp.xp);
  assert.deepEqual(svc.prizesOf({}), svc.PRIZES);
  assert.equal(svc.prizesOf({ prizes: { champion: { coins: -5 } } }).champion.coins, svc.PRIZES.champion.coins);   // nonsense values fall back
});
test('cancelling an open tournament refunds every registered player the entry fee, once', async () => {
  credits.length = 0; docs.set('c1', { _id: 'c1', status: 'open', entryFee: 5000, players: ['a', 'b', 'c'] });
  const t = await svc.cancel('c1'); assert.equal(t.status, 'cancelled');
  assert.deepEqual(credits, [{ id: 'a', n: 5000 }, { id: 'b', n: 5000 }, { id: 'c', n: 5000 }]);
  assert.equal(await svc.cancel('c1'), null); assert.equal(credits.length, 3);                    // already closed: no second refund
});
test('a tournament that never reaches its minimum is cancelled and refunded; free ones refund nothing', async () => {
  credits.length = 0; docs.set('p1', { _id: 'p1', status: 'open', entryFee: 2000, minPlayers: 4, players: ['a', 'b'] });
  assert.equal((await svc.start('p1')).status, 'cancelled'); assert.equal(credits.length, 2);
  credits.length = 0; docs.set('p2', { _id: 'p2', status: 'open', entryFee: 0, minPlayers: 4, players: ['a'] });
  assert.equal((await svc.start('p2')).status, 'cancelled'); assert.equal(credits.length, 0);
});
test('players cannot create or start tournaments (routes answer 403)', () => {
  const src = require('node:fs').readFileSync(path.resolve(__dirname, '..', 'routes/tournaments.js'), 'utf8');
  assert.match(src, /router\.post\('\/', adminOnly\)/); assert.match(src, /router\.post\('\/:id\/start', adminOnly\)/);
  assert.doesNotMatch(src, /Tournament\.create/);
});
test('tournaments are never free: a minimum registration fee is required by the admin route and enforced when joining', () => {
  const E = require('../config/economy'); assert.ok(E.MIN_ENTRY_FEE >= 1);
  const admin = require('node:fs').readFileSync(path.resolve(__dirname, '..', 'routes/admin.js'), 'utf8');
  assert.match(admin, /fee < MIN_ENTRY_FEE\) return res\.status\(400\)/);
  const player = require('node:fs').readFileSync(path.resolve(__dirname, '..', 'routes/tournaments.js'), 'utf8');
  assert.match(player, /fee < MIN_ENTRY_FEE\) return res\.status\(409\)/);
});
