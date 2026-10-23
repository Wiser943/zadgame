// Transport app rules (items 81-100). Pure functions only (no database), shared by routes/actransport.js, routes/acjobs.js and the tests.
// EVERY number you may want to tune lives in this file: prices, fuel, wear, insurance, parking, route income, quiz rewards.
const crypto = require('crypto');

const HOUR = 3600000, DAY = 86400000;
const lagos = (ms) => new Date(ms + HOUR);                 // Africa/Lagos is UTC+1 all year
const dayKey = (ms) => lagos(ms).toISOString().slice(0, 10);
const hourOf = (ms) => lagos(ms).getUTCHours();
const r100 = (n) => Math.round(n / 100) * 100;
const r500 = (n) => Math.round(n / 500) * 500;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');

/* ---------------- vehicles (81, 83, 85, plus business vehicles for 91, 94, 95) ----------------
   tank: litres. burn: litres per hour of work (a job shift is one hour, half of it counts). wear: condition points lost per hour of use.
   max: how many of this kind one player can own. licence: needs the driving licence to buy and to drive. */
const VEHICLES = {
  bicycle:    { name: 'Bicycle',              emoji: '🚲', fa: 'bicycle',       price: 45000,   tank: 0,   burn: 0,   wear: 1,   max: 1, licence: false, blurb: 'Cheap, quiet and never queues for fuel. Good for short deliveries.' },
  motorcycle: { name: 'Motorcycle (Okada)',   emoji: '🏍️', fa: 'motorcycle',    price: 650000,  tank: 12,  burn: 1.2, wear: 2,   max: 1, licence: true,  blurb: 'Weaves through the go-slow. Needed for the Okada minigame.' },
  car:        { name: 'Toyota Corolla',       emoji: '🚗', fa: 'car-side',      price: 4200000, tank: 45,  burn: 3,   wear: 3,   max: 2, licence: true,  blurb: 'Comfortable saloon for taxi work and weekend trips.' },
  bus:        { name: 'Danfo Bus',            emoji: '🚌', fa: 'bus',           price: 9500000, tank: 70,  burn: 2.5, wear: 4,   max: 3, licence: true,  blurb: 'Yellow and black. Put it on a route and collect the fares.' },
  van:        { name: 'Airport Shuttle Van',  emoji: '🚐', fa: 'van-shuttle',   price: 7000000, tank: 60,  burn: 2,   wear: 3,   max: 2, licence: true,  blurb: 'Air-conditioned van for airport runs.' },
  boat:       { name: 'Passenger Boat',       emoji: '⛴️', fa: 'ferry',         price: 8500000, tank: 120, burn: 4,   wear: 3,   max: 1, licence: true,  blurb: 'Carry people across the lagoon. Needed for the Boat Captain career.' }
};
const KINDS = Object.keys(VEHICLES);
const MAX_VEHICLES = 8;
const vdef = (kind) => (Object.prototype.hasOwnProperty.call(VEHICLES, kind) ? VEHICLES[kind] : null);
const SELL_BASE = 0.6;                                       // new vehicles sell for 60% of the price, less for worn ones
const sellPrice = (v) => { const d = vdef(v.kind); return d ? r100(d.price * SELL_BASE * (0.5 + clamp(v.cond, 0, 100) / 200)) : 0; };

/* bicycle rental (82): one rental at a time, counts as your bicycle for deliveries until it runs out */
const RENT = { kind: 'bicycle', price: 1500, hours: 3 };

/* ---------------- fuel and maintenance (86) ---------------- */
const FUEL_BASE = 950;                                       // ₦ per litre on a normal day
function fuelPrice(ev) { const id = ev && ev.id; return Math.round(FUEL_BASE * (id === 'fuel' ? 1.6 : id === 'goslow' ? 1.1 : 1) / 10) * 10; }
const fareMult = (ev) => (ev && ev.mult && ev.mult.fare) || 1;
const fuelCost = (litres, ev) => Math.round(litres * fuelPrice(ev));
const SERVICE_FIXED = 2000, SERVICE_PER_POINT = 0.0004;      // mechanic: fixed fee + 0.04% of the price for every missing condition point
const serviceCost = (kind, from, to = 100) => { const d = vdef(kind); return d ? r100(SERVICE_FIXED + d.price * SERVICE_PER_POINT * Math.max(0, to - from)) : 0; };
const condLabel = (c) => (c <= 0 ? 'Broken down' : c < 25 ? 'Needs service' : c < 60 ? 'Fair' : c < 90 ? 'Good' : 'Like new');

/* ---------------- garage (87) ---------------- */
const PAINTS = [
  { id: 'white', name: 'Pearl White', hex: '#f5f5f7' }, { id: 'black', name: 'Midnight Black', hex: '#1b1d24' }, { id: 'red', name: 'Naija Red', hex: '#d62839' },
  { id: 'green', name: 'Naija Green', hex: '#128c4a' }, { id: 'yellow', name: 'Danfo Yellow', hex: '#f7b500' }, { id: 'blue', name: 'Lagoon Blue', hex: '#1f6fe5' },
  { id: 'orange', name: 'Sunset Orange', hex: '#f26a21' }, { id: 'purple', name: 'Royal Purple', hex: '#7b3fe4' }, { id: 'silver', name: 'Silver', hex: '#aab1bd' }, { id: 'pink', name: 'Hot Pink', hex: '#ec4899' }
];
const PAINT_BY = Object.fromEntries(PAINTS.map((p) => [p.id, p]));
const paintPrice = (kind) => { const d = vdef(kind); return d ? Math.max(5000, r500(d.price * 0.01)) : 0; };
// tip = % extra pay on rides, shifts and routes for this vehicle (all mods together are capped at TIP_CAP)
const MODS = {
  bell:    { name: 'Bell & reflectors',  emoji: '🔔', pct: 0.04,  tip: 1, for: ['bicycle'] },
  basket:  { name: 'Cargo basket',       emoji: '🧺', pct: 0.06,  tip: 2, for: ['bicycle', 'motorcycle'] },
  lights:  { name: 'LED lights',         emoji: '💡', pct: 0.02,  tip: 1, for: ['bicycle', 'motorcycle', 'car', 'bus', 'van'] },
  rims:    { name: 'Sport rims',         emoji: '🛞', pct: 0.04,  tip: 2, for: ['motorcycle', 'car'] },
  tint:    { name: 'Window tint',        emoji: '🕶️', pct: 0.02,  tip: 1, for: ['car', 'van'] },
  sound:   { name: 'Sound system',       emoji: '🔊', pct: 0.03,  tip: 2, for: ['motorcycle', 'car', 'bus', 'van'] },
  spoiler: { name: 'Spoiler',            emoji: '🏁', pct: 0.03,  tip: 1, for: ['car'] },
  neon:    { name: 'Underglow neon',     emoji: '🌈', pct: 0.025, tip: 2, for: ['motorcycle', 'car'] },
  aircon:  { name: 'Air conditioning',   emoji: '❄️', pct: 0.05,  tip: 3, for: ['car', 'bus', 'van'] },
  jackets: { name: 'Life jackets',       emoji: '🦺', pct: 0.02,  tip: 2, for: ['boat'] },
  canopy:  { name: 'Shade canopy',       emoji: '⛱️', pct: 0.04,  tip: 2, for: ['boat'] },
  vinyl:   { name: 'Vinyl stickers',     emoji: '✨', pct: 0.01,  tip: 1, for: ['bicycle', 'motorcycle', 'car', 'bus', 'van', 'boat'] }
};
const TIP_CAP = 10;
const modPrice = (id, kind) => { const m = MODS[id], d = vdef(kind); return m && d ? Math.max(2500, r500(d.price * m.pct)) : 0; };
const modsFor = (kind) => Object.entries(MODS).filter(([, m]) => m.for.includes(kind)).map(([id, m]) => ({ id, name: m.name, emoji: m.emoji, tip: m.tip, price: modPrice(id, kind) }));
const tipPct = (v) => clamp((v && v.mods || []).reduce((s, id) => s + (MODS[id] ? MODS[id].tip : 0), 0), 0, TIP_CAP);

/* ---------------- insurance (96) ---------------- */
const INS = {
  third: { name: 'Third-party', pct: 0.02, cover: 0.5, blurb: 'Pays half of any crash repair bill.' },
  comp:  { name: 'Comprehensive', pct: 0.05, cover: 0.9, blurb: 'Pays 90% of crash repairs and of street tickets.' }
};
const INS_DAYS = 30;
const insDiscount = (rep) => clamp(Math.floor((rep || 0) / 10), 0, 10);   // % off, earned through public-transport reputation
const insPrice = (tier, kind, rep) => { const t = INS[tier], d = vdef(kind); return t && d ? Math.max(1000, r100(d.price * t.pct * (1 - insDiscount(rep) / 100))) : 0; };
const insured = (v, now) => !!(v && v.insTier && INS[v.insTier] && v.insUntil && new Date(v.insUntil).getTime() > now);
const cover = (v, now) => (insured(v, now) ? INS[v.insTier].cover : 0);

/* ---------------- roadside assistance (97) ---------------- */
const ASSIST = { weekPrice: 6000, days: 7, callout: 3500, litres: 10, fixTo: 35, maxPerDay: 5, memberFuelOff: 0.2 };
const isMember = (tr, now) => !!(tr && tr.assistUntil && new Date(tr.assistUntil).getTime() > now);

/* ---------------- parking lots with capacity (98) ---------------- */
const LOTS = [
  { id: 'yaba',    name: 'Yaba Tech Lot',          area: 'Yaba',            emoji: '🅿️', cap: 15, hr: 500 },
  { id: 'oshodi',  name: 'Oshodi Interchange Park', area: 'Oshodi',         emoji: '🅿️', cap: 20, hr: 400 },
  { id: 'ikeja',   name: 'Ikeja City Mall Garage', area: 'Ikeja',           emoji: '🏬', cap: 12, hr: 800 },
  { id: 'lekki',   name: 'Lekki Phase 1 Plaza',    area: 'Lekki',           emoji: '🏙️', cap: 10, hr: 1200 },
  { id: 'vi',      name: 'Adeola Odeku Car Park',  area: 'Victoria Island', emoji: '🏢', cap: 8,  hr: 1500 },
  { id: 'airport', name: 'MMA Short-stay Park',    area: 'Airport',         emoji: '✈️', cap: 10, hr: 2000 }
];
const LOT_BY = Object.fromEntries(LOTS.map((l) => [l.id, l]));
const PARK_MAX_HOURS = 6;
const parked = (v, now) => !!(v && v.park && v.park.lot && v.park.until && new Date(v.park.until).getTime() > now);
const TICKET = { chance: 0.1, min: 2500, max: 7500 };      // street (unparked) vehicles can get a LASTMA ticket after a trip
const CRASH = { chance: 0.02, worn: 0.05, pct: 0.012, min: 2000 };   // crash chance per motor trip, higher when condition is under 50

/* ---------------- routes: bus business (91) and airport shuttle (95) ---------------- */
const MAX_ROUTE_HOURS = 12;                                  // a route earns for at most 12 hours before you must collect
const ROUTE_WEAR = 0.4;                                      // condition lost per hour on a route
const ROUTES = [
  { id: 'oshodi-yaba',   kind: 'bus',  name: 'Oshodi → Yaba',            rate: 11000, burn: 2.5, minRep: 0 },
  { id: 'iyana-ikeja',   kind: 'bus',  name: 'Iyana-Ipaja → Ikeja',      rate: 12500, burn: 2.6, minRep: 0 },
  { id: 'ikorodu-tbs',   kind: 'bus',  name: 'Ikorodu → TBS',            rate: 14000, burn: 3,   minRep: 20 },
  { id: 'ajah-obalende', kind: 'bus',  name: 'Ajah → Obalende',          rate: 15500, burn: 3.2, minRep: 40 },
  { id: 'mile12-cms',    kind: 'bus',  name: 'Mile 12 → CMS',            rate: 17000, burn: 3.4, minRep: 60 },
  { id: 'mma-ikeja',     kind: 'van',  name: 'Airport ⇄ Ikeja GRA',      rate: 11500, burn: 2,   minRep: 0 },
  { id: 'mma-vi',        kind: 'van',  name: 'Airport ⇄ Victoria Island', rate: 14000, burn: 2.3, minRep: 20 },
  { id: 'mma-lekki',     kind: 'van',  name: 'Airport ⇄ Lekki',          rate: 16000, burn: 2.6, minRep: 40 },
  { id: 'mma-ajah',      kind: 'van',  name: 'Airport ⇄ Ajah',           rate: 18000, burn: 2.8, minRep: 60 }
];
const ROUTE_BY = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
// how busy a route is at a Lagos hour: rush hours pay more, the dead of night barely pays
function demand(hour, kind) {
  if (kind === 'van') return hour >= 5 && hour < 9 ? 1.3 : hour >= 16 && hour < 22 ? 1.25 : hour >= 0 && hour < 4 ? 0.5 : 1;
  return hour >= 6 && hour < 10 ? 1.3 : hour >= 16 && hour < 20 ? 1.35 : hour >= 23 || hour < 4 ? 0.3 : 1;
}
const repMult = (rep) => 1 + clamp(rep || 0, 0, 100) / 500;   // up to +20% from reputation
/* How much a route has earned since `since`. Limited by the 12-hour cap, the fuel in the tank and the condition left.
   Returns { hours, income, fuelUsed, wear, limited } where limited is 'fuel', 'cond' or ''. */
function accrue(route, v, since, now, { rep = 0, ev = null } = {}) {
  const d = vdef(v.kind); if (!route || !d || !since) return { hours: 0, income: 0, fuelUsed: 0, wear: 0, limited: '' };
  let ms = clamp(now - new Date(since).getTime(), 0, MAX_ROUTE_HOURS * HOUR), limited = '';
  const byFuel = route.burn > 0 ? (v.fuel / route.burn) * HOUR : Infinity, byCond = (clamp(v.cond, 0, 100) / ROUTE_WEAR) * HOUR;
  if (byFuel < ms) { ms = byFuel; limited = 'fuel'; }
  if (byCond < ms) { ms = byCond; limited = 'cond'; }
  ms = Math.max(0, Math.floor(ms / 60000) * 60000);          // whole minutes only
  const start = new Date(since).getTime(); let income = 0;
  for (let t = start; t < start + ms; t += 600000) {           // ten-minute slices so the rush-hour changes are followed
    const slice = Math.min(600000, start + ms - t);
    income += route.rate * (slice / HOUR) * demand(hourOf(t), route.kind);
  }
  const mult = fareMult(ev) * repMult(rep) * (1 + tipPct(v) / 100);
  const hours = ms / HOUR;
  return { hours, income: r100(income * mult), fuelUsed: Math.round(hours * route.burn * 10) / 10, wear: Math.round(hours * ROUTE_WEAR * 10) / 10, limited };
}

/* ---------------- road-sign quiz (89), driving licence (88) ---------------- */
const SIGNS = [
  ['stop', '🛑', 'Stop completely'], ['warn', '⚠️', 'General warning, take care'], ['kids', '🚸', 'Children crossing'], ['park', '🅿️', 'Parking area'],
  ['noentry', '⛔', 'No entry'], ['nowalk', '🚷', 'No pedestrians'], ['nobike', '🚳', 'No bicycles'], ['round', '🔄', 'Roundabout ahead'],
  ['ahead', '⬆️', 'Go straight ahead only'], ['works', '🚧', 'Road works ahead'], ['fuel', '⛽', 'Fuel station ahead'], ['hosp', '🏥', 'Hospital nearby'],
  ['nopass', '🚫', 'Prohibited, not allowed'], ['bus', '🚏', 'Bus stop'], ['access', '♿', 'Accessible parking'], ['left', '⬅️', 'Turn left only'],
  ['right', '➡️', 'Turn right only'], ['lights', '🚦', 'Traffic lights ahead'], ['cattle', '🐄', 'Animals may cross'], ['flood', '🌊', 'Road may flood'], ['amb', '🚑', 'Ambulance route']
].map(([id, sign, a]) => ({ id: 's_' + id, sign, a }));
const RULES = [
  ['The traffic light turns amber. You should…', 'Slow down and stop if it is safe', 'Speed up to beat the red', 'Honk and keep going', 'Stop suddenly in the junction'],
  ['When must you wear a seat belt?', 'Every trip, driver and passengers', 'Only on highways', 'Only at night', 'Only when police are near'],
  ['Using your phone while driving is…', 'Dangerous. Pull over first', 'Fine at traffic lights while moving slowly', 'Fine if you hold it low', 'Fine on short trips'],
  ['A safe following distance on a dry road is about…', 'Three seconds behind the car ahead', 'Bumper to bumper', 'One car length at any speed', 'Whatever the car behind wants'],
  ['The road ahead is flooded. You should…', 'Turn back or find another route', 'Drive through quickly', 'Follow the car in front through the water', 'Switch off your lights and go'],
  ['You may overtake only when…', 'The road ahead is clear and it is allowed', 'You are on a bend', 'You are near a junction', 'You are at a zebra crossing'],
  ['Someone is waiting at a zebra crossing. You…', 'Stop and let them cross', 'Flash and speed up', 'Honk at them', 'Pass on the other lane'],
  ['An ambulance with sirens comes up behind you. You…', 'Pull over safely and let it pass', 'Speed up to stay ahead', 'Block it', 'Ignore it'],
  ['Okada riders and their passengers should wear…', 'Approved helmets', 'Caps', 'Sunglasses', 'Nothing special'],
  ['Before a long trip you should check…', 'Fuel, tyres, brakes and lights', 'Only the radio', 'Only the paint', 'Nothing'],
  ['Drinking alcohol before driving…', 'Is never safe, so do not drive', 'Is fine in small amounts', 'Is fine at night', 'Is fine for short trips'],
  ['A driver must carry…', 'A valid licence and vehicle papers', 'A spare phone', 'Only cash', 'Nothing'],
  ['A flagman is directing traffic at road works. You…', 'Slow down and follow his signal', 'Ignore him', 'Speed up', 'Honk at him'],
  ['Overloading a vehicle makes it…', 'Harder to brake and steer', 'Faster', 'Safer', 'Cheaper to run'],
  ['In heavy rain or fog you should use…', 'Dipped headlights and slow down', 'Full-beam lights', 'No lights', 'Hazard lights at full speed'],
  ['At a roundabout, give way to…', 'Traffic already on the roundabout', 'Whoever is bigger', 'Whoever honks', 'Nobody'],
  ['A tyre bursts while you drive. You should…', 'Hold the wheel firmly and slow down gradually', 'Slam the brakes', 'Swerve hard', 'Speed up'],
  ['Your car breaks down on a busy road. You…', 'Move aside if safe, use hazard lights and call for help', 'Stand in the lane', 'Sleep in the car', 'Leave it in the lane with the engine running'],
  ['Children are crossing near a school. You…', 'Drive slowly and be ready to stop', 'Keep your speed', 'Honk loudly', 'Overtake'],
  ['Good drivers keep their vehicle…', 'Serviced regularly', 'Unserviced until it breaks', 'Overloaded', 'Parked on the bridge']
].map((r, i) => ({ id: 'r' + i, q: r[0], opts: r.slice(1) }));       // the first option is the right one; the server shuffles them
const QUIZ = {
  signs: { count: 6, pay: 1000, perfect: 3000, perDay: 5, minSecondsPerQ: 1.5 },
  licence: { count: 10, rules: 6, pass: 8, fee: 10000, retryMs: 2 * 60000, minSecondsPerQ: 2 }
};
function shuffle(arr, rnd = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/* Build a quiz. Returns { questions: [{ id, sign?, q, opts }], answers: [index of the right option] }. Only `questions` goes to the browser. */
function buildQuiz(kind, rnd = Math.random) {
  const cfg = QUIZ[kind]; if (!cfg) return null;
  const qs = [];
  const signQ = (s) => { const wrong = shuffle(SIGNS.filter((x) => x.id !== s.id), rnd).slice(0, 3).map((x) => x.a); return { id: s.id, sign: s.sign, q: 'What does this sign mean?', opts: [s.a, ...wrong] }; };
  const ruleQ = (r) => ({ id: r.id, q: r.q, opts: r.opts.slice() });
  if (kind === 'signs') shuffle(SIGNS, rnd).slice(0, cfg.count).forEach((s) => qs.push(signQ(s)));
  else { shuffle(RULES, rnd).slice(0, cfg.rules).forEach((r) => qs.push(ruleQ(r))); shuffle(SIGNS, rnd).slice(0, cfg.count - cfg.rules).forEach((s) => qs.push(signQ(s))); }
  const questions = [], answers = [];
  shuffle(qs, rnd).forEach((q) => { const right = q.opts[0], opts = shuffle(q.opts, rnd); answers.push(opts.indexOf(right)); questions.push({ ...q, opts }); });
  return { questions, answers };
}
function gradeQuiz(given, answers) {
  if (!Array.isArray(given) || given.length !== answers.length) return null;
  let right = 0; for (let i = 0; i < answers.length; i++) { const g = given[i]; if (!Number.isInteger(g) || g < 0 || g > 3) return null; if (g === answers[i]) right++; }
  return right;
}
const signsReward = (right) => (right === QUIZ.signs.count ? QUIZ.signs.pay * right + QUIZ.signs.perfect : QUIZ.signs.pay * right);

/* ---------------- traffic-light timing challenge (90) ---------------- */
const LIGHT = { rounds: 5, minDelay: 1200, maxDelay: 3600, human: 100, slowest: 3000, payPerPoint: 500, perDay: 8, licencePass: 8, maxEarly: 1 };
const lightPlan = (rnd = Math.random) => Array.from({ length: LIGHT.rounds }, () => LIGHT.minDelay + Math.floor(rnd() * (LIGHT.maxDelay - LIGHT.minDelay)));
const lightPoints = (ms) => (ms <= 250 ? 3 : ms <= 400 ? 2 : ms <= 700 ? 1 : 0);
/* times[i] = reaction in ms after the light turned green, or -1 when the player tapped too early.
   Returns { points, early, avg, bad } where bad means the numbers are impossible (a bot or a tampered request). */
function gradeLight(plan, times) {
  if (!Array.isArray(times) || times.length !== plan.length) return { bad: true };
  let points = 0, early = 0, sum = 0, valid = 0;
  for (const t of times) {
    if (t === -1) { early++; continue; }
    if (!Number.isFinite(t) || t < LIGHT.human || t > 20000) return { bad: true };
    const ms = Math.round(t); points += lightPoints(ms); sum += ms; valid++;
  }
  return { points, early, avg: valid ? Math.round(sum / valid) : 0, valid, bad: false };
}
// the round cannot finish faster than the lights plus the reactions took, so a request that came back sooner is fake
const lightMinElapsed = (plan, times) => plan.reduce((s, d) => s + d, 0) + times.reduce((s, t) => s + (t > 0 ? t : 0), 0);

/* ---------------- Okada minigame (84) ---------------- */
const OKADA = { rounds: 6, lanes: 3, base: 2500, perSafe: 1000, cooldownMs: 45000, perDay: 25, minMs: 3000, cap: 120000, hours: 0.4 };   // hours: how much of an hour of fuel and wear one ride costs
const PASSENGERS = ['Tolu', 'Amaka', 'Chidi', 'Hauwa', 'Segun', 'Ngozi', 'Bashir', 'Funmi', 'Emeka', 'Zainab'];
const TRIPS = [['Yaba', 'Surulere'], ['Oshodi', 'Ikeja'], ['Lekki Phase 1', 'Ajah'], ['Maryland', 'Ojota'], ['Ikorodu', 'Mile 12'], ['Obalende', 'CMS'], ['Ojuelegba', 'Mushin'], ['Berger', 'Ojodu']];
/* each round shows hazards in some lanes (a bit-set per lane); at least one lane is always free */
function okadaPlan(rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)], [from, to] = pick(TRIPS);
  const rounds = Array.from({ length: OKADA.rounds }, () => { const free = Math.floor(rnd() * OKADA.lanes), h = [true, true, true]; h[free] = false; if (rnd() < 0.4) h[(free + 1 + Math.floor(rnd() * 2)) % 3] = false; return h; });
  return { passenger: pick(PASSENGERS), from, to, rounds };
}
function gradeOkada(plan, lanes) {
  if (!Array.isArray(lanes) || lanes.length !== plan.rounds.length) return null;
  let safe = 0; for (let i = 0; i < lanes.length; i++) { const l = lanes[i]; if (!Number.isInteger(l) || l < -1 || l >= OKADA.lanes) return null; if (l >= 0 && !plan.rounds[i][l]) safe++; }
  return safe;
}
const okadaFare = (safe, ev, tip) => r100((OKADA.base + OKADA.perSafe * safe) * fareMult(ev) * (1 + (tip || 0) / 100));

/* ---------------- community traffic reports (99) ---------------- */
const ROADS = ['Third Mainland Bridge', 'Eko Bridge', 'Lekki-Epe Expressway', 'Admiralty Way, Lekki', 'Ozumba Mbadiwe, VI', 'Ikorodu Road', 'Oshodi-Apapa Expressway', 'Airport Road, Ikeja', 'Ajah Roundabout', 'Lagos-Badagry Expressway', 'Funsho Williams Avenue', 'Iyana-Ipaja Road'];
const REPORT_KINDS = {
  slow:      { label: 'Slow traffic', emoji: '🐢', sev: 1 }, jam: { label: 'Standstill', emoji: '🚧', sev: 2 }, accident: { label: 'Accident', emoji: '💥', sev: 3 },
  flood:     { label: 'Flooding', emoji: '🌊', sev: 3 }, works: { label: 'Road works', emoji: '👷', sev: 1 }, police: { label: 'Checkpoint', emoji: '👮', sev: 1 }, clear: { label: 'Moving freely', emoji: '✅', sev: 0 }
};
const REPORTS = { ttlMs: 90 * 60000, perDay: 15, gapMs: 3 * 60000, confirmsToPay: 3, pay: 1000, paidPerDay: 5000, noteMax: 80 };
/* One line per road: the report with the most support wins, newest first on a tie. */
function summarize(reports, now) {
  const by = {};
  for (const r of reports) {
    if (now - new Date(r.at).getTime() > REPORTS.ttlMs) continue;
    const score = (r.up || []).length - (r.down || []).length;
    if (score < -1) continue;                                   // voted down by others, hide it
    const cur = by[r.road];
    if (!cur || score > cur.score || (score === cur.score && new Date(r.at) > new Date(cur.at))) by[r.road] = { ...r, score };
  }
  return Object.values(by).sort((a, b) => (REPORT_KINDS[b.kind] ? REPORT_KINDS[b.kind].sev : 0) - (REPORT_KINDS[a.kind] ? REPORT_KINDS[a.kind].sev : 0) || new Date(b.at) - new Date(a.at));
}

/* ---------------- public transport reputation (100) ---------------- */
const REP = { start: 20, max: 100, perDay: 6 };
const REP_TIERS = [[0, 'Learner', '🌱'], [25, 'Reliable', '🚏'], [50, 'Trusted', '🛡️'], [75, 'Respected', '🏅'], [90, 'City Hero', '👑']];
function tierOf(rep) {
  const r = clamp(Math.floor(rep || 0), 0, REP.max); let i = 0; REP_TIERS.forEach((t, k) => { if (r >= t[0]) i = k; });
  const nx = REP_TIERS[i + 1] || null; return { name: REP_TIERS[i][1], emoji: REP_TIERS[i][2], score: r, next: nx ? { name: nx[1], at: nx[0] } : null };
}

/* ---------------- who has what: helpers used by routes ---------------- */
const hasLicence = (tr) => !!(tr && tr.licOk);
const asV = (v) => (v && typeof v.toObject === 'function' ? v.toObject() : v);
const vehiclesOf = (tr) => ((tr && tr.vehicles) || []).map(asV);
const rentActive = (tr, now) => !!(tr && tr.rentUntil && new Date(tr.rentUntil).getTime() > now);
/* Pick a vehicle for a job or trip. `kinds` is the list of kinds that will do. `hours` = how much of an hour of work it is (a shift is 1).
   Returns { v, def, burn, wear, rental } or { err }. */
function pickVehicle(tr, kinds, now, hours = 0.5) {
  const list = vehiclesOf(tr); let err = '';
  for (const k of kinds) for (const v of list.filter((x) => x.kind === k)) {
    const d = vdef(k), burn = Math.round(d.burn * hours * 100) / 100, wear = Math.round(d.wear * hours * 100) / 100;
    if (d.licence && !hasLicence(tr)) { err = 'You need your driving licence first. Phone → Transport → Licence.'; continue; }
    if (v.cond < wear || v.cond <= 0) { err = `Your ${d.name} needs a service first. Phone → Transport → My vehicles.`; continue; }
    if (d.burn && v.fuel < burn) { err = `Your ${d.name} is out of fuel. Phone → Transport → My vehicles.`; continue; }
    return { v, def: d, burn, wear, rental: false };
  }
  if (kinds.includes('bicycle') && rentActive(tr, now)) return { v: { id: 'rent', kind: 'bicycle', mods: [], cond: 100, fuel: 0 }, def: VEHICLES.bicycle, burn: 0, wear: 0, rental: true };
  return { err: err || `You need a ${kinds.map((k) => vdef(k).name.toLowerCase()).join(' or ')} for this. Phone → Transport → Buy.` };
}
/* chance roll after a motor trip: a street ticket if the vehicle is not parked in a lot, or a crash. rnd = Math.random in production. */
function incident(v, now, rnd = Math.random) {
  const d = vdef(v.kind); if (!d || !d.burn) return null;       // bicycles are safe
  const cr = rnd();
  if (cr < (v.cond < 50 ? CRASH.worn : CRASH.chance)) { const gross = Math.max(CRASH.min, r100(d.price * CRASH.pct)), covered = Math.round(gross * cover(v, now)); return { type: 'crash', gross, covered, pay: gross - covered }; }
  if (!parked(v, now) && rnd() < TICKET.chance) { const gross = r100(TICKET.min + rnd() * (TICKET.max - TICKET.min)), covered = INS[v.insTier] && insured(v, now) && v.insTier === 'comp' ? Math.round(gross * INS.comp.cover) : 0; return { type: 'ticket', gross, covered, pay: gross - covered }; }
  return null;
}

/* what the browser needs to draw one vehicle (no secrets here, only the player's own data) */
function describe(v, now, tr) {
  v = asV(v); const d = vdef(v.kind); if (!d) return null;
  const rt = v.route && v.route.id ? ROUTE_BY[v.route.id] : null;
  return {
    id: v.id, kind: v.kind, name: d.name, emoji: d.emoji, fa: d.fa, cond: Math.round(v.cond * 10) / 10, condLabel: condLabel(v.cond), fuel: Math.round(v.fuel * 10) / 10, tank: d.tank,
    paint: v.paint || '', paintHex: (PAINT_BY[v.paint] || {}).hex || '', mods: v.mods || [], tip: tipPct(v),
    insTier: insured(v, now) ? v.insTier : '', insUntil: insured(v, now) ? new Date(v.insUntil).getTime() : 0,
    park: parked(v, now) ? { lot: v.park.lot, until: new Date(v.park.until).getTime() } : null,
    route: rt ? { id: rt.id, name: rt.name, since: new Date(v.route.since).getTime(), ...accrue(rt, v, v.route.since, now, { rep: tr ? tr.rep : 0 }) } : null,
    sell: sellPrice(v), service: serviceCost(v.kind, v.cond), fix: v.cond < ASSIST.fixTo ? serviceCost(v.kind, v.cond, ASSIST.fixTo) : 0,
    insPrices: Object.fromEntries(Object.keys(INS).map((t) => [t, insPrice(t, v.kind, tr ? tr.rep : 0)]))
  };
}
const newId = () => crypto.randomBytes(5).toString('hex');
const newVehicle = (kind, now = Date.now()) => { const d = VEHICLES[kind]; return { id: newId(), kind, cond: 100, fuel: Math.round(d.tank * 0.6), paint: '', mods: [], insTier: '', insUntil: null, park: { lot: '', until: null }, route: { id: '', since: null }, bought: new Date(now) }; };

/* the three one-time quests that live in the Lagos Life quest list */
const questDone = (tr) => ({ licence: hasLicence(tr), ride: vehiclesOf(tr).length > 0, insure: vehiclesOf(tr).some((v) => v.insTier && v.insUntil) });

module.exports = {
  HOUR, DAY, dayKey, hourOf, r100, naira, VEHICLES, KINDS, MAX_VEHICLES, vdef, sellPrice, RENT, FUEL_BASE, fuelPrice, fareMult, fuelCost, serviceCost, condLabel,
  PAINTS, PAINT_BY, paintPrice, MODS, TIP_CAP, modPrice, modsFor, tipPct, INS, INS_DAYS, insDiscount, insPrice, insured, cover, ASSIST, isMember, LOTS, LOT_BY, PARK_MAX_HOURS, parked,
  TICKET, CRASH, MAX_ROUTE_HOURS, ROUTE_WEAR, ROUTES, ROUTE_BY, demand, repMult, accrue, SIGNS, RULES, QUIZ, shuffle, buildQuiz, gradeQuiz, signsReward,
  LIGHT, lightPlan, lightPoints, gradeLight, lightMinElapsed, OKADA, okadaPlan, gradeOkada, okadaFare, ROADS, REPORT_KINDS, REPORTS, summarize, REP, REP_TIERS, tierOf,
  hasLicence, vehiclesOf, rentActive, pickVehicle, incident, describe, newId, newVehicle, questDone
};
