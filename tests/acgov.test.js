const test = require('node:test');
const assert = require('node:assert');
const G = require('../utils/acgov');
const L = require('../utils/aclagos');

const DAY = G.DAY, T0 = G.EPOCH;                     // Monday 5 Oct 2026, 00:00 Lagos = start of round 0

test('a round is 14 days: campaign for 10, then voting for 4, and rounds line up with Monday in Lagos', () => {
  const c = G.cycleOf(T0 + DAY);
  assert.strictEqual(c.n, 0); assert.strictEqual(c.phase, 'campaign'); assert.strictEqual(c.end - c.start, 14 * DAY);
  assert.strictEqual(new Date(c.start + 3600e3).getUTCDay(), 1, 'rounds start on a Monday (Lagos time)');
  assert.strictEqual(G.cycleOf(T0 + 10 * DAY - 1).phase, 'campaign');
  assert.strictEqual(G.cycleOf(T0 + 10 * DAY).phase, 'voting');
  assert.strictEqual(G.cycleOf(T0 + 14 * DAY - 1).n, 0);
  assert.strictEqual(G.cycleOf(T0 + 14 * DAY).n, 1);
  assert.strictEqual(G.cycleOf(T0 + 14 * DAY).phase, 'campaign');
});

test('the winner of round n holds office for the whole of round n + 1', () => {
  const t = G.termOf(0), next = G.cycleBounds(1);
  assert.strictEqual(t.since, next.start); assert.strictEqual(t.until, next.end);
});

test('every office has a fee, a salary and requirements, and policies stay inside the safe range', () => {
  assert.deepStrictEqual(G.OFFICE_IDS.sort(), ['commissioner', 'governor', 'president']);
  for (const o of Object.values(G.OFFICES)) {
    assert.ok(o.fee > 0 && o.salary > 0 && o.minAgeDays >= 0 && o.minFollowers >= 0, o.id);
    for (const [slot, p] of Object.entries(o.policies)) {
      assert.strictEqual(p.options[0].id, 'std', `${o.id}.${slot} starts with "keep things as they are"`);
      for (const opt of p.options) for (const [k, v] of Object.entries(opt.fx)) {
        assert.ok(G.FX_KEYS.includes(k), `${o.id}.${slot}.${opt.id} uses a known key ${k}`);
        assert.ok(v >= G.FX_MIN && v <= G.FX_MAX, `${o.id}.${slot}.${opt.id}.${k} = ${v} is within 20%`);
      }
    }
  }
  assert.ok(G.OFFICES.president.fee > G.OFFICES.governor.fee && G.OFFICES.governor.fee > G.OFFICES.commissioner.fee, 'bigger office, bigger fee');
});

test('requirements: username, account age, followers and the fee are all checked', () => {
  const ok = { username: 'ada', ageDays: 30, followers: 50, cash: 99e6 };
  assert.strictEqual(G.eligibility('president', ok).ok, true);
  const no = (patch, id) => { const r = G.eligibility('governor', { ...ok, ...patch }); assert.strictEqual(r.ok, false); assert.strictEqual(r.first.id, id); };
  no({ username: '' }, 'username'); no({ ageDays: 1 }, 'age'); no({ followers: 0 }, 'followers'); no({ cash: 100 }, 'fee');
  assert.strictEqual(G.eligibility('governor', { ...ok, running: true }).first.id, 'once');
  assert.strictEqual(G.eligibility('nope', ok).ok, false);
});

test('voters need a day-old account', () => { assert.strictEqual(G.voterOk(0.2), false); assert.strictEqual(G.voterOk(1), true); });

test('the 5 with the most backers make the ballot; ties go to whoever filed first', () => {
  const cands = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((u, i) => ({ user: u, filedAt: new Date(T0 + i * 1000) }));
  const support = { a: 1, b: 9, c: 4, d: 4, e: 0, f: 7, g: 4 };
  assert.deepStrictEqual(G.shortlist(cands, support).map((x) => x.user), ['b', 'f', 'c', 'd', 'g']);
  assert.strictEqual(G.shortlist(cands.slice(0, 3), {}).length, 3, 'fewer than 5 candidates: everybody goes through');
  assert.deepStrictEqual(G.shortlist([], {}), []);
});

test('most votes wins; a tie goes to more backers, then to who filed first; nobody on the ballot = no winner', () => {
  const c = [{ user: 'a', filedAt: T0 }, { user: 'b', filedAt: T0 + 5 }, { user: 'c', filedAt: T0 + 9 }];
  assert.strictEqual(G.pickWinner(c, { a: 3, b: 10, c: 2 }, {}).user, 'b');
  assert.strictEqual(G.pickWinner(c, { a: 5, b: 5 }, { a: 1, b: 8 }).user, 'b');
  assert.strictEqual(G.pickWinner(c, { a: 5, b: 5 }, { a: 2, b: 2 }).user, 'a');
  assert.strictEqual(G.pickWinner(c, {}, {}).user, 'a', 'no votes at all: first to file');
  assert.strictEqual(G.pickWinner([], {}, {}), null);
});

test('policy effects multiply the city event and never edit the original', () => {
  const base = L.EVENTS.find((e) => e.id === 'fuel').mult, snap = JSON.stringify(base);
  const out = G.applyFx(base, { fare: 0.85, job: 1.06, road: 1.1 });
  assert.strictEqual(JSON.stringify(base), snap, 'the event table is untouched');
  assert.ok(Math.abs(out.fare - 1.5 * 0.85) < 0.002);
  assert.ok(Math.abs(out.job.all - 0.95 * 1.06) < 0.002);
  assert.ok(Math.abs(out.job.road - 1.35 * 1.06 * 1.1) < 0.002);
  const calm = G.applyFx({ job: { all: 1 } }, { road: 1.1, power: 1.1 });
  assert.ok(Math.abs(calm.job.road - 1.1) < 0.002 && Math.abs(calm.power - 1.1) < 0.002);
});

test('only offices whose term is running count, and the total is capped', () => {
  const now = T0 + 15 * DAY, term = G.termOf(0);                                   // inside round 1 = the term won in round 0
  const gov = { id: 'governor', holder: 'u1', since: term.since, until: term.until, policies: { utilities: 'cheap', markets: 'roads' } };
  const pres = { id: 'president', holder: 'u2', since: term.since, until: term.until, policies: { fuel: 'subsidy' } };
  const fx = G.activeFx([gov, pres], now);
  assert.ok(Math.abs(fx.fare - 0.9 * 0.85) < 0.002 && Math.abs(fx.power - 0.85 * 0.95) < 0.002 && fx.waste === 1.15 && fx.water === 1.1);
  assert.deepStrictEqual(G.activeFx([{ ...gov, until: now - 1 }], now), {}, 'an expired term changes nothing');
  assert.deepStrictEqual(G.activeFx([{ ...gov, holder: '' }], now), {}, 'an empty office changes nothing');
  assert.deepStrictEqual(G.activeFx([{ ...gov, since: now + 1 }], now), {}, 'a term that has not started changes nothing');
  assert.deepStrictEqual(G.activeFx([{ ...gov, policies: {} }], now), {}, 'default policies change nothing');
  const wild = Array.from({ length: 6 }, () => ({ id: 'governor', holder: 'x', since: term.since, until: term.until, policies: { utilities: 'cheap' } }));
  assert.ok(G.activeFx(wild, now).power >= G.TOTAL_MIN, 'stacked cuts stop at -30%');
});

test('Lagos Life picks the policies up through the hook and is exactly as before without them', () => {
  const now = T0 + 15 * DAY, term = G.termOf(0), plain = L.currentEvent(now);
  try {
    L.setMultHook(G.applyPolicies); G.setOffices([]);
    assert.strictEqual(L.currentEvent(now).mult, plain.mult, 'no one in office: the same object comes back');
    G.setOffices([{ _id: 'governor', holder: 'u1', since: new Date(term.since), until: new Date(term.until), policies: { utilities: 'cheap' } }]);
    const ev = L.currentEvent(now);
    assert.ok(Math.abs((ev.mult.power || 1) - (plain.mult.power || 1) * 0.85) < 0.002);
    assert.ok(ev.id === plain.id && ev.endsAt === plain.endsAt, 'the event itself is unchanged');
    assert.ok(L.billAmount('power', [], ev) <= L.billAmount('power', [], plain), 'a cheaper grid means a cheaper bill');
  } finally { L.setMultHook(null); G.setOffices([]); }
  assert.strictEqual(L.currentEvent(now).mult, plain.mult);
});

test('describeFx gives plain lines and says whether it is good news', () => {
  const d = G.describeFx({ power: 0.85, job: 1.06, food: 1.04 });
  const by = Object.fromEntries(d.map((x) => [x.key, x]));
  assert.strictEqual(by.power.pct, -15); assert.strictEqual(by.power.good, true);
  assert.strictEqual(by.job.pct, 6); assert.strictEqual(by.job.good, true);
  assert.strictEqual(by.food.good, false);
  assert.deepStrictEqual(G.describeFx({}), []);
});
