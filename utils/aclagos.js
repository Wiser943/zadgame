// Lagos Life rules: city events, utility bills, starter quests, daily streak. No database access in here, so it is easy to test.
// Everything is derived from the clock, so every server instance and every player sees the same city at the same moment.

const HOUR = 3600e3, DAY = 24 * HOUR;
const LAGOS = 1 * HOUR;                                   // Lagos is UTC+1 all year
const lagos = (now) => new Date(now + LAGOS);              // read UTC getters on this to get Lagos wall-clock time
const dayKey = (now) => lagos(now).toISOString().slice(0, 10);

/* ----- citywide events -----
   mult.job   : pay multiplier per job field (key 'all' = every other job)
   mult.power : electricity bill multiplier (generators eat fuel)
   mult.water : water bill multiplier
   mult.food  : food price multiplier (shown to the player, applied by the client when buying)
   mult.fare  : transport fare multiplier (shown to the player)
   Each event has an English line and a Pidgin line. */
const EVENTS = [
  { id: 'fuel', icon: '⛽', fa: 'gas-pump', color: '#e5484d', title: 'Fuel scarcity', pidgin: 'Fuel don scarce o!', text: 'Queues at every station. Fares go up and generators cost more to run.', pidginText: 'Queue dey every filling station. Transport cost don jump, gen dey drink money.', mult: { fare: 1.5, power: 1.25, food: 1.05, job: { road: 1.35, all: 0.95 } }, districts: { Ikeja: 'Long queues at the airport road stations', Lekki: 'Gen sets humming all night', Yaba: 'Okada riders charging double' } },
  { id: 'nepa', icon: '💡', fa: 'bolt', color: '#f59e0b', title: 'Power outage', pidgin: 'NEPA don take light!', text: 'The grid is down in most areas. Everyone is on generators until it comes back.', pidginText: 'NEPA don carry light. Na gen we dey use until dem bring am back.', mult: { power: 1.4, food: 1.08, job: { all: 0.95 } }, districts: { Surulere: 'Whole street quiet, only gens', Ajah: 'Neighbours sharing phone charging', 'Victoria Island': 'Offices running on diesel' } },
  { id: 'goslow', icon: '🚗', fa: 'car-side', color: '#6366f1', title: 'Third Mainland go-slow', pidgin: 'Go-slow don block Third Mainland!', text: 'Traffic is crawling across the bridge. Drivers earn more; everyone else is late.', pidginText: 'Traffic don lock bridge. Driver dey make money, everybody else don late.', mult: { fare: 1.3, job: { road: 1.4, all: 0.9 } }, districts: { Yaba: 'Hawkers selling plantain chips between cars', Lekki: 'Lekki-Epe expressway at a standstill', Ikeja: 'Conductors shouting "Oshodi! Oshodi!"' } },
  { id: 'rain', icon: '🌧️', fa: 'cloud-showers-heavy', color: '#0ea5e9', title: 'Heavy rain and flooding', pidgin: 'Rain dey fall, flood don show!', text: 'Roads are flooded in low areas. Water supply is dirty so water bills spike.', pidginText: 'Flood dey road. Water no clean, water bill don climb.', mult: { fare: 1.25, water: 1.35, food: 1.1, job: { all: 0.95 } }, districts: { Ajah: 'Streets turned into rivers', Surulere: 'Gutters overflowing', Ikorodu: 'Boat riders on the main road' } },
  { id: 'owambe', icon: '🎉', fa: 'champagne-glasses', color: '#d946ef', title: 'Owambe weekend', pidgin: 'Owambe dey this weekend!', text: 'Aso-ebi everywhere. Food sellers and service jobs are busy and pay a little more.', pidginText: 'Owambe everywhere, aso-ebi dey shine. Food sellers and service workers dey chop.', mult: { food: 0.92, job: { all: 1.1 } }, districts: { Lekki: 'Live band outside every event hall', Ikeja: 'Jollof pots as big as a car', 'Victoria Island': 'Spraying naira, valets overwhelmed' } },
  { id: 'market', icon: '🛍️', fa: 'store', color: '#10b981', title: 'Balogun market day', pidgin: 'Market don open for Balogun!', text: 'Traders are cutting prices. Food and goods are cheaper today.', pidginText: 'Traders dey drop price. Chop and market things cheap today.', mult: { food: 0.88, job: { all: 1.03 } }, districts: { Yaba: 'Thrift stalls packed', Surulere: 'Bargain shouts everywhere', Ikeja: 'Computer Village rush' } },
  { id: 'calm', icon: '☀️', fa: 'sun', color: '#22b573', title: 'A normal Lagos day', pidgin: 'Today dey calm.', text: 'No big news today. Prices are normal.', pidginText: 'Nothing special today, everything dey normal.', mult: { job: { all: 1 } }, districts: { Lekki: 'Joggers on the beachfront', Yaba: 'Students and startups', Ikeja: 'Planes overhead, as usual' } }
];
const BYID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// One event per 12-hour window (6 AM and 6 PM Lagos). Deterministic, with the quiet "calm" day showing up about 1 in 3 windows.
function windowOf(now) { const l = lagos(now), h = l.getUTCHours(); const start = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), h >= 18 ? 18 : h >= 6 ? 6 : -6, 0, 0) - LAGOS; return { start, end: start + 12 * HOUR, key: Math.floor(start / (12 * HOUR)) }; }
function hash(n) { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return (x ^ (x >>> 16)) >>> 0; }
function currentEvent(now = Date.now()) {
  const w = windowOf(now), r = hash(w.key) % 9, pick = r < 3 ? 'calm' : ['fuel', 'nepa', 'goslow', 'rain', 'owambe', 'market'][r - 3];
  const e = BYID[pick];
  return { ...e, windowKey: w.key, startsAt: w.start, endsAt: w.end };
}
const jobMult = (ev, field) => { const j = (ev && ev.mult && ev.mult.job) || {}; return j[String(field || '').toLowerCase()] || j.all || 1; };
const publicEvent = (ev) => ({ id: ev.id, icon: ev.icon, fa: ev.fa, color: ev.color, title: ev.title, pidgin: ev.pidgin, text: ev.text, pidginText: ev.pidginText, endsAt: ev.endsAt, mult: ev.mult, districts: ev.districts, windowKey: ev.windowKey });

/* ----- utility bills (a sink for the economy) -----
   A new bill cycle starts every Monday (Lagos time) and is due the following Sunday night. New players get 3 free days.
   Late bills get a 10% fee, and unpaid electricity means a power cut in your room until you pay. */
const BILLS = {
  power: { name: 'Electricity', company: 'Ikeja Electric', fa: 'bolt', color: '#f59e0b', base: 12000, perItem: 1500, appliance: { 'Fridge': 6000, 'Gen Set': 9000, 'Gas Cooker': 2000 }, cap: 60000 },
  water: { name: 'Water', company: 'Lagos Water Corporation', fa: 'droplet', color: '#0ea5e9', base: 5000, perItem: 400, appliance: { 'Shower': 2500, 'Water Closet': 1500, 'Bucket Set': 500 }, cap: 24000 },
  waste: { name: 'Waste', company: 'LAWMA', fa: 'trash-can', color: '#10b981', base: 3000, perItem: 0, appliance: {}, cap: 3000 }
};
const FREE_DAYS = 3, LATE_PCT = 0.1, KEEP = 12;
function cycleOf(now) {
  const l = lagos(now), dow = (l.getUTCDay() + 6) % 7;            // Monday = 0
  const mon = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - dow) - LAGOS;
  return { key: new Date(mon + LAGOS).toISOString().slice(0, 10), start: mon, due: mon + 7 * DAY - 1 };
}
// The amount of one bill, depending on what is placed in the room and on the city event running when it was issued.
function billAmount(key, items, ev) {
  const d = BILLS[key], placed = (items || []).filter((i) => i.placed !== false);
  let a = d.base + d.perItem * placed.length;
  for (const i of placed) a += d.appliance[i.name] || 0;
  a = Math.min(a, d.cap);
  const m = (ev && ev.mult && ev.mult[key]) || 1;
  return Math.round(a * m / 100) * 100;
}
// Bills that should exist for this cycle but do not yet. Returns the full list to push.
function newBills(user, now = Date.now()) {
  const ac = user.ac || {}, c = cycleOf(now);
  if (now - new Date(user.createdAt || now).getTime() < FREE_DAYS * DAY) return [];
  const have = new Set((ac.bills || []).filter((b) => b.cycle === c.key).map((b) => b.key));
  return Object.keys(BILLS).filter((k) => !have.has(k)).map((k) => ({ key: k, cycle: c.key, amount: billAmount(k, ac.items, currentEvent(now)), due: new Date(c.due), paidAt: null, fee: 0 }));
}
const lateFee = (b, now = Date.now()) => (!b.paidAt && now > new Date(b.due).getTime() ? Math.round(b.amount * LATE_PCT / 100) * 100 : 0);
const owed = (b, now) => b.paidAt ? 0 : b.amount + lateFee(b, now);
const powerCut = (bills, now = Date.now()) => (bills || []).some((b) => b.key === 'power' && !b.paidAt && now > new Date(b.due).getTime() + DAY);
function billView(b, now = Date.now()) {
  const d = BILLS[b.key] || {};
  return { key: b.key, cycle: b.cycle, name: d.name, company: d.company, fa: d.fa, color: d.color, amount: b.amount, late: lateFee(b, now), total: owed(b, now), due: new Date(b.due).getTime(), paid: !!b.paidAt, paidAt: b.paidAt ? new Date(b.paidAt).getTime() : 0, overdue: !b.paidAt && now > new Date(b.due).getTime() };
}

/* ----- starter quests: every one is checked on the server from real activity, then claimed for cash ----- */
const QUESTS = [
  { id: 'job', title: 'Get a job', hint: 'Phone → Jobs → pick a career', reward: 25000, fa: 'briefcase' },
  { id: 'shift', title: 'Finish your first shift', hint: 'Work one shift in Jobs', reward: 15000, fa: 'clock' },
  { id: 'pin', title: 'Set your payment PIN', hint: 'Phone → Bank → Pay PIN', reward: 10000, fa: 'lock' },
  { id: 'furniture', title: 'Buy something for your room', hint: 'Buy → pick a new piece of furniture', reward: 20000, fa: 'couch' },
  { id: 'friend', title: 'Make your first friend', hint: 'Phone → Contacts or Messages', reward: 30000, fa: 'user-group' },
  { id: 'message', title: 'Send a message', hint: 'Phone → Messages', reward: 10000, fa: 'comment' },
  { id: 'gist', title: 'Post your first gist', hint: 'Phone → P-Gist → write something', reward: 20000, fa: 'microphone-lines' },
  { id: 'bill', title: 'Pay a bill', hint: 'Phone → Bank → Bills', reward: 15000, fa: 'receipt' }
];
const QBYID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/* ----- daily streak: each consecutive day pays a bit more, up to day 7, then it loops ----- */
const STREAK = [10000, 15000, 20000, 25000, 30000, 40000, 75000];
const streakReward = (n) => STREAK[(Math.max(1, n) - 1) % STREAK.length];
function nextStreak(ac, now = Date.now()) {
  const today = dayKey(now), yest = dayKey(now - DAY);
  if (ac.lastDaily === today) return { claimable: false, streak: ac.streak || 0, next: streakReward((ac.streak || 0) + 1) };
  const n = ac.lastDaily === yest ? (ac.streak || 0) + 1 : 1;
  return { claimable: true, streak: n, next: streakReward(n), reset: !!ac.lastDaily && ac.lastDaily !== yest };
}

module.exports = { HOUR, DAY, dayKey, EVENTS, currentEvent, jobMult, publicEvent, BILLS, FREE_DAYS, LATE_PCT, KEEP, cycleOf, billAmount, newBills, lateFee, owed, powerCut, billView, QUESTS, QBYID, STREAK, streakReward, nextStreak };
