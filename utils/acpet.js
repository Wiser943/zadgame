// Rules for the Pet app: prices, effects, how needs fade with time, and mini-game rewards. Pure functions, no database.
// Everything the pet costs is paid from the player's main balance (User.ac.cash), on purpose pricier than people food.
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
  vet: { name: 'Vet check-up', emoji: '🩺', price: 45000, health: 100, need: 'health', max: 85 }
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
  ankara: { name: 'Ankara bubu', emoji: '👘', slot: 'body', price: 90000 }
};
const SLOTS = ['hat', 'face', 'neck', 'body'];
const KINDS = { food: FOOD, care: CARE, toy: TOYS, cloth: CLOTHES };
// per-minute change; she can be away up to 8 hours and the drop stops there
const RATE = { hunger: .3, hungerSleep: .12, fun: .35, funSleep: .06, clean: .2, energy: .25, energyRest: 1.2, health: .06, neglect: .25, heal: .03 };
const MAX_AWAY_MIN = 480;
const GAME = { cap: 8000, cooldownMs: 45000, perPoint: { mouse: 150, paws: 400 }, maxScore: { mouse: 40, paws: 15 }, energy: 10, fun: 15 };
const defaults = (user) => ({ user, name: 'Kobo', hunger: 80, energy: 80, fun: 80, clean: 80, health: 90, love: 0, words: 0, asleep: false, t: new Date(), owned: [], worn: {}, spent: 0 });
const cl = (v) => Math.max(3, Math.min(100, Number.isFinite(v) ? v : 3));
const dayKey = (now = Date.now()) => new Date(now + 3600000).toISOString().slice(0, 10);   // Lagos is UTC+1

/* bring the needs up to date for the time that has passed (mutates and returns p) */
function advance(p, now = Date.now()) {
  const last = p.t ? new Date(p.t).getTime() : now, m = Math.max(0, Math.min(MAX_AWAY_MIN, (now - last) / 60000));
  p.t = new Date(now); if (m <= 0) return p;
  const z = !!p.asleep;
  p.hunger -= m * (z ? RATE.hungerSleep : RATE.hunger); p.fun -= m * (z ? RATE.funSleep : RATE.fun); p.clean -= m * RATE.clean;
  p.energy += z ? m * RATE.energyRest : -m * RATE.energy;
  let h = -m * RATE.health;                                         // everyone needs a check-up now and then
  if (p.hunger < 20) h -= m * RATE.neglect; if (p.clean < 20) h -= m * RATE.neglect;   // hunger and dirt make her ill faster
  if (p.hunger > 60 && p.clean > 60 && p.fun > 40) h += m * (RATE.health + RATE.heal);    // looked after: slowly recovers
  p.health += h;
  for (const k of NEEDS) p[k] = cl(p[k]);
  if (z && p.energy >= 100) p.asleep = false;
  return p;
}
const sick = (p) => p.health < 30;
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
    love: p.love || 0, words: p.words || 0, asleep: !!p.asleep, sick: sick(p), owned: p.owned || [], worn: p.worn || {}, spent: p.spent || 0, at: now };
}
const catalog = (ev) => {
  const out = {}; for (const [kind, tbl] of Object.entries(KINDS)) out[kind] = Object.entries(tbl).map(([id, it]) => Object.assign({ id, price: priceOf(kind, id, ev) }, it));
  return out;
};
const validName = (s) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length >= 1 && s.length <= 14 && /^[\p{L}\p{N} '._-]+$/u.test(s) ? s : '' };
module.exports = { NEEDS, FOOD, CARE, TOYS, CLOTHES, SLOTS, KINDS, RATE, GAME, defaults, advance, apply, sick, priceOf, reward, view, catalog, validName, dayKey, cl };
