// Cosmetic shop catalog. Everything is bought with your platform balance (₦), the same one you see in AllConnect.
// Categories: roomBg (room background), boardSkin (board look), tokenSkin (pieces / tokens / discs).
const { COIN } = require('../config/economy');
const CATALOG_BASE = [
  // ---- room backgrounds ----
  { id: 'classic',  cat: 'roomBg',    name: 'Classic Red',  price: 0,   colors: ['#7a0c12', '#9c1219'] },
  { id: 'midnight', cat: 'roomBg',    name: 'Midnight',     price: 40,  colors: ['#0a1b3f', '#1d3f85'] },
  { id: 'emerald',  cat: 'roomBg',    name: 'Emerald',      price: 40,  colors: ['#08382a', '#12744f'] },
  { id: 'royal',    cat: 'roomBg',    name: 'Royal Purple', price: 60,  colors: ['#2a0e4d', '#5a2aa0'] },
  { id: 'sunset',   cat: 'roomBg',    name: 'Sunset',       price: 80,  colors: ['#7a2410', '#d4571f'] },
  { id: 'ocean',    cat: 'roomBg',    name: 'Deep Ocean',   price: 80,  colors: ['#04303f', '#0b6b82'] },
  { id: 'carbon',   cat: 'roomBg',    name: 'Carbon',       price: 100, colors: ['#111114', '#2a2a31'] },
  { id: 'aurora',   cat: 'roomBg',    name: 'Aurora',       price: 150, colors: ['#0b3d3a', '#5b2a86'] },
  // ---- board skins ----
  { id: 'classic',  cat: 'boardSkin', name: 'Classic',      price: 0,   colors: ['#f0d9b5', '#b58863'] },
  { id: 'marble',   cat: 'boardSkin', name: 'Marble',       price: 60,  colors: ['#eceff3', '#8a93a0'] },
  { id: 'forest',   cat: 'boardSkin', name: 'Forest',       price: 60,  colors: ['#eef0d2', '#4f7a43'] },
  { id: 'neon',     cat: 'boardSkin', name: 'Neon Grid',    price: 100, colors: ['#1d1f3a', '#0e0f22'] },
  { id: 'regal',    cat: 'boardSkin', name: 'Regal Gold',   price: 150, colors: ['#f6e2a3', '#7a4a1a'] },
  // ---- token / piece skins ----
  { id: 'classic',  cat: 'tokenSkin', name: 'Classic',      price: 0,   colors: ['#c0272d', '#1f57b5'] },
  { id: 'glass',    cat: 'tokenSkin', name: 'Glass',        price: 50,  colors: ['#8fd3ff', '#ffffff'] },
  { id: 'gem',      cat: 'tokenSkin', name: 'Gem',          price: 80,  colors: ['#ff4b8b', '#3dd6c6'] },
  { id: 'neon',     cat: 'tokenSkin', name: 'Neon Ring',    price: 100, colors: ['#39ff88', '#ff3df2'] },
  { id: 'gold',     cat: 'tokenSkin', name: 'Gold Metal',   price: 150, colors: ['#ffd84a', '#b8860b'] },
  // ---- announcer styles (what the in-game voice says and how it sounds) ----
  { id: 'classic',  cat: 'announcer', name: 'Classic Host',  price: 0,   colors: ['#7a0c12', '#c0272d'], blurb: 'Clear and friendly.' },
  { id: 'hype',     cat: 'announcer', name: 'Hype Man',      price: 60,  colors: ['#d4571f', '#f7c52b'], blurb: 'Loud, fast and excited.' },
  { id: 'calm',     cat: 'announcer', name: 'Smooth Host',   price: 60,  colors: ['#0a1b3f', '#1d3f85'], blurb: 'Slow, deep and cool.' },
  { id: 'naija',    cat: 'announcer', name: 'Naija Vibes',   price: 100, colors: ['#08382a', '#12744f'], blurb: 'Pidgin one-liners.' }
];
const CATALOG = CATALOG_BASE.map((it) => ({ ...it, price: it.price * COIN }));
const CATS = ['roomBg', 'boardSkin', 'tokenSkin', 'announcer'];
const key = (cat, id) => `${cat}:${id}`;
const find = (cat, id) => CATALOG.find(x => x.cat === cat && x.id === id);
const isFree = item => item && item.price === 0;
const DEFAULTS = { roomBg: 'classic', boardSkin: 'classic', tokenSkin: 'classic', announcer: 'classic' };
function owns(user, cat, id) { const it = find(cat, id); return !!it && (isFree(it) || (user.cosmetics || []).includes(key(cat, id))); }
function sanitizeEquipped(user) {
  const eq = { ...DEFAULTS, ...(user.equipped?.toObject ? user.equipped.toObject() : user.equipped || {}) };
  for (const c of CATS) if (!owns(user, c, eq[c])) eq[c] = DEFAULTS[c];
  return { roomBg: eq.roomBg, boardSkin: eq.boardSkin, tokenSkin: eq.tokenSkin, announcer: eq.announcer };
}
module.exports = { CATALOG, CATS, key, find, isFree, DEFAULTS, owns, sanitizeEquipped };
