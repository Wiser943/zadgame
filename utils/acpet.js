// Rules for the Pet app: prices, effects, how needs fade with time, and mini-game rewards. Pure functions, no database.
// Everything the pet costs is paid from the player's main balance (User.ac.cash), on purpose pricier than people food.
const L = require('./aclagos');
const DAY = 86400000;
const NEEDS = ['hunger', 'energy', 'fun', 'clean', 'health'];
const FOOD = {
  chops: { name: 'Small chops', emoji: '🥟', price: 3500, hunger: 12, fun: 2 },
  suya: { name: 'Suya', emoji: '🍢', price: 6000, hunger: 24, fun: 3 },
  jollof: { name: 'Jollof rice & chicken', emoji: '🍛', price: 9000, hunger: 35, fun: 4 },
  fish: { name: 'Grilled fish', emoji: '🐟', price: 14000, hunger: 45, fun: 4, health: 4 }
};
const CARE = {
  bath: { name: 'Soap bath', emoji: '🛁', price: 6000, clean: 100, fun: -2, need: 'clean', max: 92 },
  groom: { name: 'Spa & grooming', emoji: '💆', price: 15000, clean: 100, fun: 12, love: 2, need: 'clean', max: 92 },
  vitamins: { name: 'Vitamins', emoji: '💊', price: 12000, health: 20, need: 'health', max: 90 },
  medicine: { name: 'Medicine', emoji: '💉', price: 25000, health: 45, need: 'health', max: 85 },
  vet: { name: 'Vet check-up', emoji: '🩺', price: 45000, health: 100, need: 'health', max: 85 },
  vaccine: { name: 'Vaccine (7 days of protection)', emoji: '🛡️', price: 30000, protect: 7 }   // stops sudden illnesses for a week
};
const TOYS = {
  ball: { name: 'Play with a ball', emoji: '🎾', price: 4000, fun: 22, energy: -8, hunger: -4 },
  laser: { name: 'Laser pointer', emoji: '🔦', price: 9000, fun: 40, energy: -12, hunger: -6 }
};
const CLOTHES = {
  fila: { name: 'Fila cap', emoji: '🧢', slot: 'hat', price: 25000 }, party: { name: 'Party hat', emoji: '🥳', slot: 'hat', price: 18000 },
  gele: { name: 'Gele headwrap', emoji: '🌺', slot: 'hat', price: 60000 }, crown: { name: 'Gold crown', emoji: '👑', slot: 'hat', price: 250000 },
  shades: { name: 'Cool shades', emoji: '🕶️', slot: 'face', price: 30000 }, specs: { name: 'Round specs', emoji: '👓', slot: 'face', price: 22000 },
  bow: { name: 'Bow tie', emoji: '🎀', slot: 'neck', price: 15000 }, scarf: { name: 'Scarf', emoji: '🧣', slot: 'neck', price: 20000 },
  beads: { name: 'Coral beads', emoji: '📿', slot: 'neck', price: 45000 },
  jersey: { name: 'Naija jersey', emoji: '👕', slot: 'body', price: 60000 }, hoodie: { name: 'Hoodie', emoji: '🧥', slot: 'body', price: 70000 },
  ankara: { name: 'Ankara bubu', emoji: '👘', slot: 'body', price: 90000 },
  // limited edition: only sold while that city event is on (you keep them for good)
  asoebi: { name: 'Aso-ebi outfit', emoji: '🎊', slot: 'body', price: 120000, event: 'owambe' }, raincoat: { name: 'Yellow raincoat', emoji: '🌧️', slot: 'body', price: 40000, event: 'rain' },
  apron: { name: "Trader's apron", emoji: '🛍️', slot: 'body', price: 35000, event: 'market' }, headlamp: { name: 'Headlamp', emoji: '💡', slot: 'hat', price: 20000, event: 'nepa' },
  danfo: { name: 'Danfo driver cap', emoji: '🚕', slot: 'hat', price: 25000, event: 'goslow' }
};
const SLOTS = ['hat', 'face', 'neck', 'body'];
const KINDS = { food: FOOD, care: CARE, toy: TOYS, cloth: CLOTHES };
// per-minute change; she can be away up to 8 hours and the drop stops there
const RATE = { hunger: .3, hungerSleep: .12, fun: .35, funSleep: .06, clean: .2, energy: .25, energyRest: 1.2, health: .06, neglect: .25, heal: .03 };
const MAX_AWAY_MIN = 480;
const GAME = { cap: 8000, cooldownMs: 45000, perPoint: { mouse: 150, paws: 400 }, maxScore: { mouse: 40, paws: 15 }, energy: 10, fun: 15 };
// She grows with steady care: effort earns xp, but only up to XP.cap a day (free cuddles and chat only up to XP.free), and nothing counts while she is ill.
const STAGES = [
  { id: 'baby', name: 'Baby kitten', at: 0, scale: .6 }, { id: 'kitten', name: 'Kitten', at: 120, scale: .74 }, { id: 'young', name: 'Young cat', at: 360, scale: .88 },
  { id: 'adult', name: 'Adult cat', at: 720, scale: 1 }, { id: 'boss', name: 'Big boss', at: 1200, scale: 1.12 }
];
const XP = { cap: 40, free: 10, food: 6, toy: 5, game: 5, ask: 1, free1: 1, care: { bath: 5, groom: 6, vitamins: 4, medicine: 5, vet: 8 } };
const stageIdx = (xp) => { let i = 0; STAGES.forEach((s, k) => { if ((xp || 0) >= s.at) i = k; }); return i; };

/* ----- daily check-in: the only daily reward. Streak grows the amount a little; every 7th day adds a bonus. ----- */
const CHECKIN = { base: 90, step: 30, maxStep: 9, weekly: 150 };   // ~3% of the old amounts
const checkinAmount = (n) => CHECKIN.base + CHECKIN.step * Math.min(Math.max(1, n) - 1, CHECKIN.maxStep) + (n % 7 === 0 ? CHECKIN.weekly : 0);
function checkinView(p, now = Date.now()) {
  const today = dayKey(now), yest = dayKey(now - DAY);
  if (p.lastCheckin === today) return { claimable: false, streak: p.streak || 0, next: checkinAmount((p.streak || 0) + 1) };
  const n = p.lastCheckin === yest ? (p.streak || 0) + 1 : 1;
  return { claimable: true, streak: n, next: checkinAmount(n), amount: checkinAmount(n), reset: !!p.lastCheckin && p.lastCheckin !== yest };
}

/* ----- sudden illnesses: a surprise every few days. A vaccine (bought for a week at a time) prevents them. ----- */
const EMERGENCIES = [{ id: 'tummy', name: 'a tummy ache' }, { id: 'flu', name: 'the flu' }, { id: 'paw', name: 'a sore paw' }, { id: 'fleas', name: 'fleas' }];
function roll(p, now = Date.now(), rand = Math.random) {
  const due = p.nextEmergency ? new Date(p.nextEmergency).getTime() : 0;
  if (!due) { p.nextEmergency = new Date(now + (2 + rand() * 2) * DAY); return null; }       // new pets get 2 to 4 quiet days first
  if (now < due) return null;
  p.nextEmergency = new Date(now + (3 + rand() * 3) * DAY);
  if (p.protectUntil && new Date(p.protectUntil).getTime() > now) return null;
  const e = EMERGENCIES[Math.floor(rand() * EMERGENCIES.length)];
  p.emergency = { id: e.id, name: e.name, at: new Date(now) }; p.sickPending = true;
  return p.emergency;
}
const protectedUntil = (p, now = Date.now()) => { const t = p.protectUntil ? new Date(p.protectUntil).getTime() : 0; return t > now ? t : 0; };

/* ----- counters and milestones ----- */
function bump(p, k, n = 1) { p.stats = Object.assign({}, p.stats, { [k]: ((p.stats && p.stats[k]) || 0) + n }); if (typeof p.markModified === 'function') p.markModified('stats'); }
const st = (p, k) => (p.stats && p.stats[k]) || 0;
const ACH = [
  { id: 'first_meal', icon: '🍽️', name: 'First meal', desc: 'Feed her for the first time.', reward: 0, ok: (p) => st(p, 'meals') >= 1 },
  { id: 'foodie', icon: '🍛', name: 'Foodie', desc: 'Feed her 20 times.', reward: 3000, ok: (p) => st(p, 'meals') >= 20 },
  { id: 'sparkle', icon: '🫧', name: 'Squeaky clean', desc: 'Give 10 baths.', reward: 3000, ok: (p) => st(p, 'baths') >= 10 },
  { id: 'patient', icon: '🩺', name: 'Good patient', desc: 'Take her to the vet or give medicine.', reward: 0, ok: (p) => st(p, 'vet') >= 1 },
  { id: 'survivor', icon: '💪', name: 'Back on her paws', desc: 'Nurse her back from a sudden illness.', reward: 2000, ok: (p) => st(p, 'cured') >= 1 },
  { id: 'chatter', icon: '💬', name: 'Chatterbox', desc: 'Talk to her 50 times.', reward: 2500, ok: (p) => (p.words || 0) >= 50 },
  { id: 'curious', icon: '🧠', name: 'Curious cat', desc: 'Ask her 20 questions in Answer mode.', reward: 3000, ok: (p) => st(p, 'answers') >= 20 },
  { id: 'stylish', icon: '👗', name: 'Fashionista', desc: 'Own 5 pieces of clothing.', reward: 5000, ok: (p) => (p.owned || []).length >= 5 },
  { id: 'limited', icon: '✨', name: 'Limited edition', desc: 'Buy a seasonal costume.', reward: 5000, ok: (p) => (p.owned || []).some((id) => CLOTHES[id] && CLOTHES[id].event) },
  { id: 'gamer', icon: '🎮', name: 'Playful', desc: 'Play 10 mini-games.', reward: 3000, ok: (p) => st(p, 'games') >= 10 },
  { id: 'trickster', icon: '🎓', name: 'Quick learner', desc: 'Practise tricks three times.', reward: 2000, ok: (p) => st(p, 'tricks') >= 3 },
  { id: 'snap', icon: '📸', name: 'Photogenic', desc: 'Take her first photo.', reward: 1500, ok: (p) => st(p, 'photos') >= 1 },
  { id: 'kitten', icon: '🐱', name: 'Growing up', desc: 'Reach the Kitten stage.', reward: 3000, ok: (p) => stageIdx(p.xp) >= 1 },
  { id: 'young', icon: '🐈', name: 'Young cat', desc: 'Reach the Young cat stage.', reward: 6000, ok: (p) => stageIdx(p.xp) >= 2 },
  { id: 'adult', icon: '😺', name: 'All grown up', desc: 'Reach the Adult cat stage.', reward: 12000, ok: (p) => stageIdx(p.xp) >= 3 },
  { id: 'boss', icon: '👑', name: 'Big boss', desc: 'Reach the final stage.', reward: 25000, ok: (p) => stageIdx(p.xp) >= 4 },
  { id: 'streak7', icon: '🔥', name: 'One week', desc: 'Check in 7 days in a row.', reward: 7000, ok: (p) => (p.streak || 0) >= 7 },
  { id: 'streak30', icon: '🏆', name: 'One month', desc: 'Check in 30 days in a row.', reward: 30000, ok: (p) => (p.streak || 0) >= 30 },
  { id: 'friendly', icon: '🤝', name: 'Good neighbour', desc: 'Visit a friend\'s pet or get a visit.', reward: 2000, ok: (p) => st(p, 'visits') + st(p, 'given') >= 1 },
  { id: 'generous', icon: '🎁', name: 'Generous', desc: 'Gift food to friends\' pets 3 times.', reward: 3000, ok: (p) => st(p, 'gifts') >= 3 },
  { id: 'spender', icon: '💸', name: 'Big spender', desc: 'Spend ₦500,000 on her.', reward: 10000, ok: (p) => (p.spent || 0) >= 500000 }
];
/* returns the milestones she just earned (and remembers them, so each pays once) */
function unlock(p, now = Date.now()) {
  const got = [], have = p.badges || {};
  for (const a of ACH) if (!have[a.id] && a.ok(p)) got.push({ id: a.id, icon: a.icon, name: a.name, reward: a.reward });
  if (got.length) { p.badges = Object.assign({}, have, Object.fromEntries(got.map((g) => [g.id, new Date(now)]))); if (typeof p.markModified === 'function') p.markModified('badges'); }
  return got;
}
/* after care: a pet that has recovered from a sudden illness counts as cured */
function settle(p) { if (p.emergency && p.health >= 60) { p.emergency = null; bump(p, 'cured'); return true; } return false; }
const VISIT = { cuddleFun: 4, funMax: 80, maxGifts: 3 };
const TRICKS = { sit: { name: 'Sit', emoji: '🪑', sessions: 3 }, highfive: { name: 'High five', emoji: '🐾', sessions: 4 }, spin: { name: 'Spin', emoji: '💫', sessions: 5 } };
const TRICK_COOLDOWN_MS = 15000;
const ROOM_ITEMS = { bed: { name: 'Cozy bed', emoji: '🛏️', position: [-2, -2] }, scratch: { name: 'Scratch post', emoji: '🪵', position: [2, -2] }, toy: { name: 'Toy corner', emoji: '🧶', position: [2, 2] } };
const ALERT_DEFAULTS = { illness: true, hunger: true, clean: true, quietStart: 22, quietEnd: 7 };
function alertPrefs(p) { return Object.assign({}, ALERT_DEFAULTS, p && p.alertPrefs || {}); }
function careNext(p, cash = Infinity) {
  if (!p || p.asleep) return { kind: 'rest', title: 'Let your pet rest', detail: 'She is sleeping. Wake her when she is ready.', action: 'rest' };
  if (sick(p)) return { kind: 'care', title: 'Visit the vet', detail: 'Your pet is ill and needs health care.', action: 'care', item: 'vet', affordable: cash >= CARE.vet.price };
  const needs = [
    { v: p.hunger, kind: 'food', title: 'Feed your pet', detail: 'Hunger is getting low.', action: 'food', item: 'chops', affordable: cash >= FOOD.chops.price },
    { v: p.clean, kind: 'care', title: 'Give your pet a bath', detail: 'She could use a clean-up.', action: 'care', item: 'bath', affordable: cash >= CARE.bath.price },
    { v: p.energy, kind: 'rest', title: 'A rest would help', detail: 'Energy is running low.', action: 'rest' },
    { v: p.fun, kind: 'play', title: 'Play together', detail: 'She is getting bored.', action: 'play' },
    { v: p.health, kind: 'care', title: 'Check her health', detail: 'Health is getting low.', action: 'care', item: 'vitamins', affordable: cash >= CARE.vitamins.price }
  ].filter(x => x.v < 60).sort((a, b) => a.v - b.v);
  return needs[0] || { kind: 'great', title: 'You are doing great', detail: 'All her needs look good. Teach a trick or visit a friend.', action: 'tricks' };
}
const defaults = (user) => ({ user, name: 'Kobo', hunger: 80, energy: 80, fun: 80, clean: 80, health: 90, love: 0, words: 0, asleep: false, t: new Date(), owned: [], worn: {}, spent: 0, tricks: {}, trickAt: null, roomItem: 'bed', alertPrefs: Object.assign({}, ALERT_DEFAULTS) });
const cl = (v) => Math.max(3, Math.min(100, Number.isFinite(v) ? v : 3));
const dayKey = (now = Date.now()) => new Date(now + 3600000).toISOString().slice(0, 10);   // Lagos is UTC+1

/* minutes spent under a limit while a need slides in a straight line from a to b over m minutes */
const below = (a, b, lim, m) => (a <= lim ? m : b >= lim ? 0 : m * (lim - b) / (a - b));
/* bring the needs up to date for the time that has passed (mutates and returns p) */
function advance(p, now = Date.now()) {
  const last = p.t ? new Date(p.t).getTime() : now, m = Math.max(0, Math.min(MAX_AWAY_MIN, (now - last) / 60000));
  p.t = new Date(now);
  if (p.sickPending) { p.health = Math.min(p.health, 24); p.sickPending = false; }         // the sudden illness lands the next time she is looked at
  if (m <= 0) return p;
  const z = !!p.asleep, h0 = p.hunger, c0 = p.clean;
  p.hunger -= m * (z ? RATE.hungerSleep : RATE.hunger); p.fun -= m * (z ? RATE.funSleep : RATE.fun); p.clean -= m * RATE.clean;
  p.energy += z ? m * RATE.energyRest : -m * RATE.energy;
  let h = -m * RATE.health;                                         // everyone needs a check-up now and then
  h -= below(h0, p.hunger, 20, m) * RATE.neglect + below(c0, p.clean, 20, m) * RATE.neglect;   // only the minutes spent hungry or dirty make her ill faster
  if (p.hunger > 60 && p.clean > 60 && p.fun > 40) h += m * (RATE.health + RATE.heal);    // looked after: slowly recovers
  p.health += h;
  for (const k of NEEDS) p[k] = cl(p[k]);
  if (z && p.energy >= 100) p.asleep = false;
  return p;
}
const sick = (p) => p.health < 30;
/* give xp for care. Returns { from, to } when she just grew into a new stage, else null. */
function gain(p, n, free, now = Date.now()) {
  const day = dayKey(now); if (p.xpDay !== day) { p.xpDay = day; p.xpToday = 0; p.xpFree = 0; }
  if (sick(p) || !(n > 0)) return null;
  let room = XP.cap - (p.xpToday || 0); if (free) room = Math.min(room, XP.free - (p.xpFree || 0));
  n = Math.max(0, Math.min(n, room)); if (!n) return null;
  const before = stageIdx(p.xp); p.xp = (p.xp || 0) + n; p.xpToday = (p.xpToday || 0) + n; if (free) p.xpFree = (p.xpFree || 0) + n;
  const after = stageIdx(p.xp); return after > before ? { from: before, to: after } : null;
}
const xpFor = (kind, id) => kind === 'food' ? XP.food : kind === 'toy' ? XP.toy : kind === 'care' ? (XP.care[id] || 0) : 0;
function apply(p, fx) {
  for (const k of NEEDS) if (typeof fx[k] === 'number') p[k] = fx[k] === 100 ? 100 : cl(p[k] + fx[k]);
  if (fx.love) p.love = (p.love || 0) + fx.love;
  return p;
}
const foodMult = (ev) => Number(ev && ev.mult && ev.mult.food) || 1;
/* the price the player pays: only food moves with the city event (like food everywhere else in the game) */
const priceOf = (kind, id, ev) => { const it = KINDS[kind] && KINDS[kind][id]; if (!it) return 0; return kind === 'food' ? Math.round(it.price * foodMult(ev) / 10) * 10 : it.price };
const reward = (game, score, earnedToday) => {
  const per = GAME.perPoint[game], max = GAME.maxScore[game]; if (!per) return 0;
  const sc = Math.max(0, Math.min(max, Math.floor(Number(score) || 0)));
  return Math.max(0, Math.min(sc * per, GAME.cap - (earnedToday || 0)));
};
function view(p, now = Date.now()) {
  return { name: p.name, hunger: Math.round(p.hunger), energy: Math.round(p.energy), fun: Math.round(p.fun), clean: Math.round(p.clean), health: Math.round(p.health),
    love: p.love || 0, words: p.words || 0, asleep: !!p.asleep, sick: sick(p), owned: p.owned || [], worn: p.worn || {}, spent: p.spent || 0, stage: stageView(p, now), checkin: checkinView(p, now), badges: Object.keys(p.badges || {}), memory: p.memory || [], inRoom: !!p.inRoom, roomItem: ROOM_ITEMS[p.roomItem] ? p.roomItem : 'bed', alerts: p.alerts !== false, alertPrefs: alertPrefs(p), tricks: p.tricks || {}, trickAt: p.trickAt || null,
    emergency: p.emergency && sick(p) ? { name: p.emergency.name } : null, protectedUntil: protectedUntil(p, now), visits: (p.visits || []).slice(0, 15).map((v) => ({ name: v.name, act: v.act, gift: v.gift || '', at: v.at })), at: now };
}
function stageView(p, now = Date.now()) {
  const i = stageIdx(p.xp), st = STAGES[i], nx = STAGES[i + 1] || null;
  return { i, id: st.id, name: st.name, scale: st.scale, xp: p.xp || 0, from: st.at, to: nx ? nx.at : null, next: nx ? nx.name : null, today: p.xpDay === dayKey(now) ? (p.xpToday || 0) : 0, cap: XP.cap };
}
const eventTitle = (id) => { const e = (L.EVENTS || []).find((x) => x.id === id); return e ? e.title : id; };
const catalog = (ev) => {
  const out = {}; for (const [kind, tbl] of Object.entries(KINDS)) out[kind] = Object.entries(tbl).map(([id, it]) => Object.assign({ id, price: priceOf(kind, id, ev) }, it, it.event ? { available: !!ev && ev.id === it.event, eventTitle: eventTitle(it.event) } : {}));
  return out;
};
const validName = (s) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length >= 1 && s.length <= 14 && /^[\p{L}\p{N} '._-]+$/u.test(s) ? s : '' };
module.exports = { CHECKIN, checkinAmount, checkinView, EMERGENCIES, roll, protectedUntil, bump, ACH, unlock, settle, VISIT, TRICKS, TRICK_COOLDOWN_MS, ROOM_ITEMS, ALERT_DEFAULTS, alertPrefs, careNext, eventTitle, DAY, STAGES, XP, stageIdx, stageView, gain, xpFor, NEEDS, FOOD, CARE, TOYS, CLOTHES, SLOTS, KINDS, RATE, GAME, defaults, advance, apply, sick, priceOf, reward, view, catalog, validName, dayKey, cl };
