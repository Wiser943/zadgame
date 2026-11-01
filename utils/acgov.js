// State House: elections for Governor, Commissioner and President, and the policies they set.
// This file has NO database access, so every rule can be tested on its own (tests/acgov.test.js).
//
// One election round = 14 days, always starting Monday 00:00 Lagos time, counted from EPOCH, so every server instance
// and every player sees the same round at the same moment (same idea as the city events in utils/aclagos.js).
//
//   day 0  -> day 10 : CAMPAIGN  players pay the filing fee and file to run; everybody can back a candidate
//   day 10           : the 5 candidates with the most backers go on the ballot (everyone else is refunded)
//   day 10 -> day 14 : VOTING    one vote per player per race, only for the 5 on the ballot
//   day 14           : the winner is announced and holds the office for the NEXT round (the one that just started)
//
// So the person holding an office during round N was elected during round N-1.

const HOUR = 3600e3, DAY = 24 * HOUR, LAGOS = HOUR;
const EPOCH = Date.UTC(2026, 9, 5) - LAGOS;            // Monday 5 Oct 2026, 00:00 in Lagos
const CYCLE = 14 * DAY, CAMPAIGN = 10 * DAY;
const SHORTLIST_SIZE = 5;
const MIN_VOTER_DAYS = 1;                              // a brand-new account cannot back or vote
const POLICY_COOLDOWN = 6 * HOUR;                      // one change per policy every 6 hours
const ANN_PER_DAY = 2, ANN_GAP = 60e3;                 // official announcements per office per Lagos day, and the pause between two
const FX_MIN = 0.8, FX_MAX = 1.2;                      // one option may move a price by at most 20%
const TOTAL_MIN = 0.7, TOTAL_MAX = 1.35;               // all offices together may move a price by at most -30% / +35%

/* What a policy can change. job = every job's pay, road = pay of road / driving jobs. Other keys match the city event multipliers. */
const FX_LABEL = { power: 'Electricity bills', water: 'Water bills', waste: 'Waste bills', food: 'Food prices', fare: 'Transport fares', job: 'Job pay', road: 'Road job pay' };
const FX_COST = new Set(['power', 'water', 'waste', 'food', 'fare']);   // for these, going DOWN is good news for players
const FX_KEYS = Object.keys(FX_LABEL);

const STD = { id: 'std', label: 'Keep things as they are', text: 'No change this term.', fx: {} };

/* Every option has a benefit and (except the commissioner's) a price to pay, so there is no free "best" choice. */
const OFFICES = {
  governor: {
    id: 'governor', title: 'Governor', scope: 'Lagos', icon: '🏛️', fa: 'landmark', color: '#2563eb',
    fee: 5000000, salary: 3000000, minAgeDays: 5, minFollowers: 5,
    policies: {
      utilities: { name: 'Electricity and water', options: [STD,
        { id: 'cheap', label: 'Cheap light', text: 'Subsidise the grid; the water board raises its rates.', fx: { power: 0.85, water: 1.1 } },
        { id: 'water', label: 'Water first', text: 'Fund the water works; electricity costs more.', fx: { water: 0.8, power: 1.1 } }] },
      markets: { name: 'Markets and roads', options: [STD,
        { id: 'open', label: 'Open the markets', text: 'Traders pay less, so food is cheaper; more traffic means higher fares.', fx: { food: 0.93, fare: 1.05 } },
        { id: 'roads', label: 'Fix the roads', text: 'Better roads cut fares; the waste levy pays for it.', fx: { fare: 0.9, waste: 1.15 } }] }
    }
  },
  commissioner: {
    id: 'commissioner', title: 'Commissioner', scope: 'Lagos', icon: '📋', fa: 'clipboard-list', color: '#0f766e',
    fee: 1500000, salary: 1000000, minAgeDays: 2, minFollowers: 2,
    policies: {
      priority: { name: "Commissioner's priority", options: [STD,
        { id: 'transport', label: 'Transport', text: 'A small cut to every fare in the city.', fx: { fare: 0.92 } },
        { id: 'environment', label: 'Environment', text: 'Cleaner streets: cheaper waste and water bills.', fx: { waste: 0.8, water: 0.95 } },
        { id: 'commerce', label: 'Commerce', text: 'Market support: food is a little cheaper.', fx: { food: 0.95 } }] }
    }
  },
  president: {
    id: 'president', title: 'President', scope: 'Nigeria', icon: '🇳🇬', fa: 'flag', color: '#16a34a',
    fee: 10000000, salary: 6000000, minAgeDays: 7, minFollowers: 10,
    policies: {
      fuel: { name: 'Fuel policy', options: [STD,
        { id: 'subsidy', label: 'Fuel subsidy', text: 'Cheaper fares and power, but inflation lifts food prices.', fx: { fare: 0.85, power: 0.95, food: 1.04 } },
        { id: 'dereg', label: 'Deregulate fuel', text: 'Drivers earn more; fares and power cost more.', fx: { road: 1.1, fare: 1.12, power: 1.08 } }] },
      economy: { name: 'The economy', options: [STD,
        { id: 'boost', label: 'Cash injection', text: 'Everyone earns more, and prices follow.', fx: { job: 1.06, food: 1.04 } },
        { id: 'tight', label: 'Tight money', text: 'Food is cheaper, but wages slip.', fx: { food: 0.94, job: 0.96 } }] }
    }
  }
};
const OFFICE_IDS = Object.keys(OFFICES);

const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');

/* ----- the 14-day round ----- */
function cycleBounds(n) { const start = EPOCH + n * CYCLE; return { n, start, end: start + CYCLE, shortlistAt: start + CAMPAIGN }; }
function cycleOf(now = Date.now()) {
  const n = Math.floor((now - EPOCH) / CYCLE), b = cycleBounds(n);
  return { ...b, phase: now < b.shortlistAt ? 'campaign' : 'voting' };
}
/* The term won in election round n runs for the whole of round n + 1. */
function termOf(n) { const b = cycleBounds(n + 1); return { since: b.start, until: b.end }; }

/* ----- who may run ----- */
function eligibility(officeId, f) {
  const o = OFFICES[officeId]; if (!o) return { ok: false, checks: [], first: null };
  const checks = [
    { id: 'username', label: 'Pick your @username', ok: !!f.username },
    { id: 'age', label: `Account at least ${o.minAgeDays} days old`, ok: f.ageDays >= o.minAgeDays, have: Math.floor(f.ageDays), need: o.minAgeDays },
    { id: 'followers', label: `${o.minFollowers} followers on P-Gist`, ok: f.followers >= o.minFollowers, have: f.followers, need: o.minFollowers },
    { id: 'fee', label: `${naira(o.fee)} filing fee in your wallet`, ok: f.cash >= o.fee, have: f.cash, need: o.fee }
  ];
  if (f.running) checks.push({ id: 'once', label: 'Only one race per round', ok: false });
  return { ok: checks.every((c) => c.ok), checks, first: checks.find((c) => !c.ok) || null };
}
const voterOk = (ageDays) => ageDays >= MIN_VOTER_DAYS;
const ageDays = (createdAt, now = Date.now()) => Math.max(0, (now - new Date(createdAt || now).getTime()) / DAY);

/* ----- ranking ----- */
// cands: [{ user, filedAt }]   support / votes: { userId: count }
const byRank = (a, b, primary, second) => ((primary[b.user] || 0) - (primary[a.user] || 0)) || ((second ? (second[b.user] || 0) - (second[a.user] || 0) : 0)) || (new Date(a.filedAt) - new Date(b.filedAt)) || String(a.user).localeCompare(String(b.user));
function shortlist(cands, support) { return [...(cands || [])].sort((a, b) => byRank(a, b, support || {})).slice(0, SHORTLIST_SIZE); }
function pickWinner(cands, votes, support) { return [...(cands || [])].sort((a, b) => byRank(a, b, votes || {}, support || {}))[0] || null; }

/* ----- policy effects ----- */
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r3 = (x) => Math.round(x * 1000) / 1000;
const isActive = (o, now) => !!o && !!o.holder && +new Date(o.until) > now && +new Date(o.since) <= now;
const optionOf = (officeId, slot, id) => { const p = OFFICES[officeId] && OFFICES[officeId].policies[slot]; return p ? (p.options.find((x) => x.id === id) || p.options[0]) : null; };
const currentOption = (officeId, slot, policies) => optionOf(officeId, slot, policies && policies[slot]);

/* all the offices' chosen options multiplied together (only offices whose term is running), kept within TOTAL_MIN..TOTAL_MAX */
function activeFx(states, now) {
  const fx = {};
  for (const st of states || []) {
    if (!isActive(st, now) || !OFFICES[st.id]) continue;
    for (const slot of Object.keys(OFFICES[st.id].policies)) {
      const opt = currentOption(st.id, slot, st.policies); if (!opt) continue;
      for (const k of FX_KEYS) if (opt.fx[k]) fx[k] = (fx[k] || 1) * opt.fx[k];
    }
  }
  for (const k of Object.keys(fx)) { fx[k] = r3(clamp(fx[k], TOTAL_MIN, TOTAL_MAX)); if (fx[k] === 1) delete fx[k]; }
  return fx;
}
/* a NEW multiplier object (never edits the one it is given): the city event's numbers times the policies' */
function applyFx(mult, fx) {
  const out = { ...(mult || {}), job: { ...((mult && mult.job) || {}) } };
  for (const k of ['power', 'water', 'waste', 'food', 'fare']) if (fx[k]) out[k] = r3((out[k] || 1) * fx[k]);
  if (fx.job) { for (const k of new Set([...Object.keys(out.job), 'all'])) out.job[k] = r3((out.job[k] == null ? 1 : out.job[k]) * fx.job); }
  if (fx.road) out.job.road = r3((out.job.road != null ? out.job.road : (out.job.all != null ? out.job.all : 1)) * fx.road);
  return out;
}

let STATES = [];                                        // refreshed from the database by services/govService.js
const setOffices = (docs) => { STATES = (docs || []).map((d) => ({ id: d._id, holder: d.holder, since: d.since, until: d.until, policies: d.policies || {} })); };
const activeNow = (now = Date.now()) => activeFx(STATES, now);
/* the hook utils/aclagos.js calls from currentEvent(): nothing to apply = the exact same object back */
function applyPolicies(mult, now = Date.now()) { const fx = activeFx(STATES, now); return Object.keys(fx).length ? applyFx(mult, fx) : mult; }

/* "Electricity bills -15%" lines for the screen. good = better for players. */
function describeFx(fx) {
  return FX_KEYS.filter((k) => fx[k] && fx[k] !== 1).map((k) => { const pct = Math.round((fx[k] - 1) * 100); return { key: k, label: FX_LABEL[k], pct, good: FX_COST.has(k) ? pct < 0 : pct > 0 }; });
}

/* ----- text for announcements (English with a little Pidgin, like the city events) ----- */
const wonLine = (o, handle) => `${o.icon} ${handle} don win! New ${o.title} of ${o.scope}. Congratulations!`;

module.exports = {
  HOUR, DAY, EPOCH, CYCLE, CAMPAIGN, SHORTLIST_SIZE, MIN_VOTER_DAYS, POLICY_COOLDOWN, ANN_PER_DAY, ANN_GAP, FX_MIN, FX_MAX, TOTAL_MIN, TOTAL_MAX,
  FX_KEYS, FX_LABEL, OFFICES, OFFICE_IDS, naira, cycleBounds, cycleOf, termOf, eligibility, voterOk, ageDays, shortlist, pickWinner,
  isActive, optionOf, currentOption, activeFx, applyFx, setOffices, activeNow, applyPolicies, describeFx, wonLine
};
