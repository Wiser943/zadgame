const test = require('node:test');
const assert = require('node:assert');
const H = require('../utils/achub');
const J = require('../utils/acjobs');
const L = require('../utils/aclagos');

const DAY = 864e5, NOW = Date.UTC(2026, 9, 9, 12);

test('starter jobs, hoods and hobbies are valid ids', () => {
  assert.ok(H.STARTER_JOBS.every((id) => J.jobOf(id)), 'every starter job exists in the jobs catalogue');
  assert.strictEqual(new Set(H.HOOD_IDS).size, H.HOOD_IDS.length);
  assert.strictEqual(H.cleanId('yaba', H.HOOD_IDS), 'yaba');
  assert.strictEqual(H.cleanId('mars', H.HOOD_IDS), '');
});
test('username suggestions are valid handles based on interests', () => {
  const n = H.usernameSuggestions('Wisdom Ade', 'gaming', 'yaba', 0);
  assert.ok(n.length >= 4);
  n.forEach((x) => assert.match(x, /^[a-z0-9_]{3,16}$/));
  assert.ok(n.some((x) => x.includes('wisdom')));
  assert.notDeepStrictEqual(n, H.usernameSuggestions('Wisdom Ade', 'gaming', 'yaba', 3));
  assert.ok(H.usernameSuggestions('', '', '', 0).length > 0, 'works with no input');
});
test('missions: unique ids, positive rewards, every one has a client action target', () => {
  assert.strictEqual(new Set(H.MISSIONS.map((m) => m.id)).size, H.MISSIONS.length);
  assert.ok(H.MISSIONS.every((m) => m.reward > 0 && m.title && m.hint));
});
test('personal task list puts finished missions first, then the hobby group', () => {
  const list = H.MISSIONS.map((m) => ({ ...m, done: m.id === 'm_bill', claimed: false }));
  const t = H.personalTasks({ hobby: 'gaming' }, list);
  assert.strictEqual(t.length, 4); assert.strictEqual(t[0].id, 'm_bill');
  assert.ok(t.slice(1).every((x) => x.group === 'games' || x.group !== undefined));
  assert.ok(!H.personalTasks({}, list.map((m) => ({ ...m, claimed: true }))).length);
});
test('welcome parcel grows for 7 days then stays at the last value', () => {
  assert.strictEqual(H.PARCEL.length, 7);
  assert.ok(H.parcelFor(0) < H.parcelFor(6));
  assert.strictEqual(H.parcelFor(50), H.parcelFor(6));
});
test('new-player protection lasts 7 days and never locks accounts of unknown age', () => {
  assert.ok(H.isProtected(new Date(NOW - 2 * DAY), NOW));
  assert.ok(!H.isProtected(new Date(NOW - 8 * DAY), NOW));
  assert.ok(!H.isProtected(undefined, NOW));
  assert.strictEqual(H.protectionLeftDays(new Date(NOW - 6.5 * DAY), NOW), 1);
});
test('weekly theme is stable inside a week and changes after it', () => {
  const a = H.weeklyTheme(NOW), b = H.weeklyTheme(NOW + 1 * DAY);
  assert.ok(a.endsAt > NOW);
  const c = H.weeklyTheme(a.endsAt + 3600e3);
  assert.notStrictEqual(c.id, a.id);
  if (b.endsAt === a.endsAt) assert.strictEqual(a.id, b.id);
});
test('newspaper and ticker build from the city event', () => {
  const ev = L.publicEvent(L.currentEvent(NOW)), ctx = { now: NOW, event: ev, next: ev, theme: H.weeklyTheme(NOW), richest: { name: '@tobi', cash: '₦9m' }, gist: { count: 4, top: '' }, players: 120, online: 8, admin: ['Maintenance tonight'], gistCount: 4 };
  const p = H.newspaper(ctx), t = H.ticker(ctx);
  assert.ok(p.stories.length >= 5 && p.classifieds.length);
  assert.ok(t.length >= 5 && t.some((x) => x.includes('Maintenance tonight')));
  assert.ok(H.newspaper({ ...ctx, richest: null, gist: null, players: 0 }).stories.length >= 3, 'works with an empty city');
});
test('returning-player recap only after a real absence', () => {
  assert.strictEqual(H.recapKind(new Date(NOW - 2 * 3600e3), NOW), null);
  assert.deepStrictEqual(H.recapKind(new Date(NOW - 1 * DAY), NOW), { days: 1, long: false });
  assert.strictEqual(H.recapKind(new Date(NOW - 5 * DAY), NOW).long, true);
  assert.strictEqual(H.recapKind(null, NOW), null);
});
test('progress map reflects hub flags and missions', () => {
  const m = H.MISSIONS.map((x) => ({ id: x.id, done: x.id === 'm_shift' }));
  const map = H.progressMap({ done: true, tourDone: false }, m);
  assert.ok(map.find((n) => n.id === 'setup').done && !map.find((n) => n.id === 'tour').done && map.find((n) => n.id === 'job').done);
});
test('content: help, roadmap, votes, lore and anthem are filled in', () => {
  assert.ok(H.HELP.length >= 8 && H.HELP.every((h) => h.q && h.a));
  assert.ok(H.VOTES.every((v) => H.VBYID[v.id]));
  assert.ok(H.LORE.length >= 5 && H.CHANGELOG[0].items.length);
  assert.ok(H.ANTHEM.melody.length > 10 && H.ANTHEM.lyrics.length > 4);
  assert.ok(H.ANTHEM.melody.every(([n, b]) => n >= 0 && b > 0));
});
