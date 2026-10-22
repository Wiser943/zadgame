// Runs the tournament service against in-memory fakes (no MongoDB needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const docs = new Map(), userUpdates = [];
const mk = (p, exports) => { const f = path.resolve(__dirname, '..', p); require.cache[f] = { id: f, filename: f, loaded: true, exports }; };
mk('models/Social.js', { Tournament: {
  findById: async (id) => { const d = docs.get(String(id)); if (!d) return null; return Object.assign(d, { markModified() {}, async save() { docs.set(String(d._id), d); return d; } }); },
  find: () => ({ select: () => ({ lean: async () => [] }) })
} });
mk('models/User.js', { updateOne: (q, u) => { userUpdates.push({ q, u }); return Promise.resolve(); } });

const hub = require('../utils/tournamentHub');
const rooms = []; const notes = [];
hub.createMatchRoom = (m) => { const code = 'R' + rooms.length; rooms.push({ code, ...m }); return code; };
hub.notify = (uid, ev, payload) => notes.push({ uid, ev, payload });
const svc = require('../services/tournaments');

const make = (n) => { const id = 't' + docs.size; docs.set(id, { _id: id, name: 'Cup', game: 'chess', minPlayers: 4, maxPlayers: 8, status: 'open', players: Array.from({ length: n }, (_, i) => 'u' + i), bracket: null }); return id; };

test('too few players cancels instead of starting', async () => {
  const id = make(3); const t = await svc.start(id);
  assert.equal(t.status, 'cancelled');
});
test('start builds a bracket, creates one room per ready pairing and notifies both players', async () => {
  rooms.length = 0; notes.length = 0;
  const id = make(8); const t = await svc.start(id);
  assert.equal(t.status, 'running'); assert.equal(rooms.length, 4); assert.equal(notes.length, 8);
  assert.ok(rooms.every(r => r.players.length === 2 && r.id === id));
});
test('starting twice does nothing the second time', async () => {
  rooms.length = 0; const id = make(4); await svc.start(id); const before = rooms.length; assert.equal(await svc.start(id), null); assert.equal(rooms.length, before);
});
test('results advance winners, a draw replays the pair, and the champion gets prizes once', async () => {
  rooms.length = 0; userUpdates.length = 0;
  const id = make(4); await svc.start(id);
  const first = rooms.slice();
  // draw in first match -> new room for the same pair, bracket unchanged
  await svc.onMatchResult({ id, round: first[0].round, slot: first[0].slot }, null);
  assert.equal(rooms.length, first.length + 1);
  const replay = rooms[rooms.length - 1]; assert.deepEqual(replay.players, first[0].players);
  // finish both semi-finals
  for (const r of first) await svc.onMatchResult({ id, round: r.round, slot: r.slot }, r.players[0]);
  const fin = rooms[rooms.length - 1]; assert.equal(fin.round, 1);
  // duplicate report of the same result is ignored
  const count = rooms.length; await svc.onMatchResult({ id, round: first[0].round, slot: first[0].slot }, first[0].players[0]); assert.equal(rooms.length, count);
  await svc.onMatchResult({ id, round: 1, slot: 0 }, fin.players[1]);
  const t = docs.get(id);
  assert.equal(t.status, 'done'); assert.equal(t.champion, fin.players[1]);
  assert.equal(userUpdates.filter(u => u.u.$inc && u.u.$inc.tournamentWins === 1).length, 1);
  // late result after completion is ignored
  assert.equal(await svc.onMatchResult({ id, round: 1, slot: 0 }, fin.players[0]), null);
});
test('concurrent results for one tournament are both kept', async () => {
  rooms.length = 0; const id = make(4); await svc.start(id); const [a, b] = rooms.slice();
  await Promise.all([svc.onMatchResult({ id, round: a.round, slot: a.slot }, a.players[0]), svc.onMatchResult({ id, round: b.round, slot: b.slot }, b.players[0])]);
  const t = docs.get(id); assert.ok(t.bracket.rounds[0].every(m => m.winner));
});
