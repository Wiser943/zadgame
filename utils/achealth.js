// Health app rules: illnesses, the chemist, the hospital and player pharmacies. The server decides every price and every cure.
// Player state lives in User.ac.health = { ill: { id, since, sev: 'mild'|'serious', sevAt }, checked, last }.
const H = 3600000, DAY = 24 * H;
const ILLNESSES = [
  { id: 'food', name: 'Food poisoning', emoji: '🤮', blurb: 'Something you ate is fighting you.' },
  { id: 'malaria', name: 'Malaria', emoji: '🦟', blurb: 'The mosquitoes got you. Fever and body pain.' },
  { id: 'typhoid', name: 'Typhoid', emoji: '🤒', blurb: 'Stomach pain and a high fever.' },
  { id: 'catarrh', name: 'Catarrh & cough', emoji: '🤧', blurb: 'Blocked nose and a scratchy throat.' }
];
const HOSPITAL = 80000;                 // injection cures anything, open 24 hours
const CHECK_EVERY = 6 * H, CHANCE = 0.2; // while healthy: every 6 hours there is a 1 in 5 chance of falling ill
const ESCALATE = DAY, ADMIT = DAY;      // mild turns serious after a day; serious puts you in hospital after another day
// `need` = player need-bar changes (index 1 = energy, 4 = hygiene, 0 = hunger); `pet` = pet stat changes
const ITEMS = {
  cure:     { id: 'cure', who: 'me', emoji: '💊', name: 'Malaria & typhoid drugs', note: 'Cures mild sickness', base: 1500, cure: true },
  lucozade: { id: 'lucozade', who: 'me', emoji: '🥤', name: 'Lucozade Boost', note: 'Energy +14', base: 1000, need: { 1: 0.14 } },
  dettol:   { id: 'dettol', who: 'me', emoji: '🧴', name: 'Dettol & toiletries', note: 'Hygiene +35', base: 2000, need: { 4: 0.35 } },
  vitamins: { id: 'vitamins', who: 'me', emoji: '🍊', name: 'Multivitamins', note: 'Energy +22', base: 1224, need: { 1: 0.22 } },
  pcure:    { id: 'pcure', who: 'pet', emoji: '💉', name: 'Pet antibiotics', note: 'Cures a sick pet', base: 8000, pet: { health: 45 }, petCure: true },
  pvit:     { id: 'pvit', who: 'pet', emoji: '💊', name: 'Pet vitamins', note: 'Pet health +20', base: 3500, pet: { health: 20 } },
  pshamp:   { id: 'pshamp', who: 'pet', emoji: '🧼', name: 'Flea & tick shampoo', note: 'Pet clean +35', base: 2500, pet: { clean: 35 } },
  ptreat:   { id: 'ptreat', who: 'pet', emoji: '🦴', name: 'Pet energy treats', note: 'Pet energy +18', base: 2000, pet: { energy: 18, hunger: 8 } }
};
const MARKET = {
  jollof: { id: 'jollof', emoji: '🍛', name: 'Jollof rice & chicken', note: 'Hunger +60', price: 2500, need: { 0: 0.6 } },
  suya:   { id: 'suya', emoji: '🍢', name: 'Suya', note: 'Hunger +35', price: 1500, need: { 0: 0.35 } },
  chops:  { id: 'chops', emoji: '🥟', name: 'Small chops', note: 'Hunger +25', price: 1000, need: { 0: 0.25 } },
  zobo:   { id: 'zobo', emoji: '🥤', name: 'Chilled zobo', note: 'Hunger +10, Energy +8', price: 500, need: { 0: 0.1, 1: 0.08 } }
};
const IDS = Object.keys(ITEMS);
const MIN_X = 0.3, MAX_X = 3, STOCK_MAX = 200, RESTOCK_X = 0.5;
const clampPrice = (id, p) => { const b = ITEMS[id].base; p = Math.round(Number(p)); return Number.isFinite(p) ? Math.max(Math.round(b * MIN_X), Math.min(Math.round(b * MAX_X), p)) : b; };
const restockCost = (id, qty) => Math.max(1, Math.round(ITEMS[id].base * RESTOCK_X)) * qty;

// a small seeded random so a new pharmacy gets stable first prices
function seeded(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
function newShop(owner) {
  const r = seeded('pharm:' + owner), price = {}, stock = {};
  IDS.forEach((id) => { price[id] = clampPrice(id, ITEMS[id].base * (0.55 + r() * 1.3)); stock[id] = 25 + Math.floor(r() * 70); });
  return { price, stock, sold: 0, earned: 0 };
}
const shopOf = (v) => (v && v.shop && v.shop.price && v.shop.stock ? v.shop : null);
const fromPrice = (shop) => Math.min(...IDS.map((id) => shop.price[id] || ITEMS[id].base));

// Advances the player's health. Returns { h, admit } where h is the new state to save.
function tick(h, now = Date.now(), rand = Math.random) {
  h = Object.assign({ ill: null, checked: 0, last: null }, h || {});
  let admit = false;
  if (h.ill) {
    const ill = Object.assign({}, h.ill), since = new Date(ill.since).getTime();
    if (ill.sev === 'mild' && now - since >= ESCALATE) { ill.sev = 'serious'; ill.sevAt = new Date(since + ESCALATE); }
    if (ill.sev === 'serious' && now - new Date(ill.sevAt || since).getTime() >= ADMIT) admit = true;
    h.ill = ill;
  } else if (now - (h.checked ? new Date(h.checked).getTime() : 0) >= CHECK_EVERY) {
    h.checked = new Date(now);
    if (rand() < CHANCE) { const i = ILLNESSES[Math.floor(rand() * ILLNESSES.length)]; h.ill = { id: i.id, since: new Date(now), sev: 'mild', sevAt: null }; }
  }
  return { h, admit };
}
function view(h, now = Date.now()) {
  if (!h || !h.ill) return null;
  const def = ILLNESSES.find((i) => i.id === h.ill.id) || ILLNESSES[0], since = new Date(h.ill.since).getTime();
  const left = h.ill.sev === 'mild' ? Math.max(0, since + ESCALATE - now) : Math.max(0, new Date(h.ill.sevAt || since).getTime() + ADMIT - now);
  return { id: def.id, name: def.name, emoji: def.emoji, blurb: def.blurb, sev: h.ill.sev, msLeft: left };
}
const cat = (shop) => IDS.map((id) => Object.assign({}, ITEMS[id], shop ? { price: shop.price[id], stock: shop.stock[id] } : { price: ITEMS[id].base }));
module.exports = { ILLNESSES, HOSPITAL, ITEMS, MARKET, IDS, MIN_X, MAX_X, STOCK_MAX, clampPrice, restockCost, newShop, shopOf, fromPrice, tick, view, cat, DAY };
