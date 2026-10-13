// AllConnect platform rules shared by routes + tests. No database access in here.
const CATALOGUE = {
  'Classic Cream': 3000, 'Lagos Sky': 3000, 'Mint Fresh': 3000, 'Peach Glow': 3000, 'Soft Lilac': 3000,
  'Naija Green': 4000, 'Lekki Charcoal': 5000, 'Owambe Gold': 6000,
  'Single Bed': 45000, 'Foam Mattress': 12000, 'Queen Bed': 250000, 'Net': 8000,
  'Gas Cooker': 85000, 'Fridge': 320000, 'Gen Set': 180000,
  'Bucket Set': 2000, 'Water Closet': 70000, 'Shower': 40000,
  'Ceiling Bulb': 4000, 'Wall Lamp': 6000, 'Standing Lamp': 18000
};
const DEFAULT_AC = () => ({ cash: 2000000, paint: '#d9a93a', owned: ['Classic Cream'], needs: [.9, .9, .9, .9, .9, .9], min: 19 * 60 });
const F = require('./furniture');
const priceOf = (name) => (Object.prototype.hasOwnProperty.call(CATALOGUE, name) ? CATALOGUE[name] : F.isItem(name) ? F.ITEMS[name].price : null);
// The client may only save cosmetic/state fields. Cash and owned items are server-controlled.
function sanitizeSave(b = {}) {
  const out = {};
  if (typeof b.paint === 'string' && /^#[0-9a-f]{6}$/i.test(b.paint)) out.paint = b.paint.toLowerCase();
  if (Array.isArray(b.needs) && b.needs.length === 6 && b.needs.every((v) => typeof v === 'number' && isFinite(v))) out.needs = b.needs.map((v) => Math.max(0, Math.min(1, v)));
  if (b.gender === 'male' || b.gender === 'female') out.gender = b.gender;
  if (Number.isFinite(b.min)) out.min = Math.max(0, Math.floor(b.min)) % 100000;
  return out;
}
const publicAC = (ac) => ({ cash: ac.cash, paint: ac.paint, gender: ac.gender || '', owned: [...(ac.owned || [])], items: (ac.items || []).map((i) => ({ id: i.id, name: i.name, x: i.x, z: i.z, rot: i.rot, placed: i.placed !== false })), wish: [...(ac.wish || [])], needs: [...(ac.needs || [])], min: ac.min, gemsFound: ac.gemsFound || 0 });
const FOOD = {
  jollof: { name: 'Jollof rice & chicken', emoji: '🍛', price: 2500, fill: .35 },
  suya: { name: 'Suya', emoji: '🍢', price: 1500, fill: .22 },
  chops: { name: 'Small chops', emoji: '🥟', price: 1000, fill: .12 }
};
const MONEY = { min: 100, max: 200000, daily: 500000 };   // in-game ₦ only; limits stop alt-account cash farming
const RESERVED = ['admin', 'administrator', 'allconnect', 'gamehub', 'support', 'system', 'mummy', 'moderator'];
const normalizeUsername = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();
const validUsername = (n) => /^[a-z0-9_]{3,16}$/.test(n) && !RESERVED.includes(n);
const parseAmount = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : NaN; };
const moneyError = (n) => (!Number.isFinite(n) || n < MONEY.min ? `Minimum is ₦${MONEY.min.toLocaleString('en-NG')}.` : n > MONEY.max ? `Maximum per transfer is ₦${MONEY.max.toLocaleString('en-NG')}.` : null);
module.exports = { FOOD, MONEY, normalizeUsername, validUsername, parseAmount, moneyError, CATALOGUE, DEFAULT_AC, priceOf, sanitizeSave, publicAC };
