// Server-authoritative catalogue for additional AllConnect homes.
const HOMES = {
  'mainland_room': { name: 'Mainland Room', description: 'A simple private room to make your own.', mode: 'rent', rent: 25000, rentDays: 7, paint: '#c7a17a', max: 1 },
  'self_contained': { name: 'Self-Contained', description: 'Your own compact space with room to furnish.', mode: 'buy', price: 350000, paint: '#d9a93a', max: 1 },
  'mini_flat': { name: 'Mini Flat', description: 'Extra space for a more comfortable setup.', mode: 'buy', price: 900000, paint: '#8eb7c8', max: 1 },
  'family_house': { name: 'Family House', description: 'A real multi-room house: bedrooms, kitchen, bathroom and a big living room.', mode: 'buy', price: 4500000, paint: '#e6d9c0', max: 1, layout: 'family_house' },
  'two_bedroom': { name: 'Two-Bedroom Apartment', description: 'A larger home for future social gatherings.', mode: 'buy', price: 2200000, paint: '#9a8ac7', max: 1 }
};
// Expansions: buy extra space for a home you OWN (rentals can't be expanded). Each step grows the furnishable floor.
// level 0 = 6x6 cells (as it always was), level 1 = 8x8 (extra room), level 2 = 10x10 (full wing). cost = share of the home's price.
const EXPANSIONS = [
  { level: 0, grid: 6, name: 'Original layout' },
  { level: 1, grid: 8, name: 'Extra Room', share: 0.30, description: 'Add a room to the side: a bigger floor to furnish.' },
  { level: 2, grid: 10, name: 'Full Wing', share: 0.60, description: 'Add a whole new wing: the biggest layout for this home.' }
];
const { layoutFor } = require('./layouts');
const MAX_LEVEL = EXPANSIONS.length - 1;
const levelOf = (p) => { const l = Number(p && p.level); return Number.isInteger(l) && l >= 0 && l <= MAX_LEVEL ? l : 0; };
const gridFor = (level) => EXPANSIONS[Math.max(0, Math.min(MAX_LEVEL, Number(level) || 0))].grid;
// The room a property is furnished in: a square size, or the layout of a house-model home.
const gridOf = (p) => { const h = HOMES[p && p.type]; return (h && h.layout && layoutFor(h.layout)) || gridFor(levelOf(p)); };
// Price of going from `level` to `level + 1` for this home type (0 = not possible).
const expansionCost = (type, level) => {
  const h = HOMES[type], next = EXPANSIONS[(Number(level) || 0) + 1];
  if (!h || h.mode !== 'buy' || h.layout || !next) return 0;
  return Math.max(1000, Math.round((h.price * next.share) / 1000) * 1000);
};
const isHome = (id) => Object.prototype.hasOwnProperty.call(HOMES, id);
const publicHome = (p) => ({ id: p.id, type: p.type, name: HOMES[p.type]?.name || 'Home', description: HOMES[p.type]?.description || '', tenure: p.tenure, boughtAt: p.boughtAt, leaseExpiresAt: p.leaseExpiresAt, paint: p.paint, level: levelOf(p), grid: gridFor(levelOf(p)), layout: HOMES[p.type]?.layout || '', nextExpansion: (() => { const l = levelOf(p), n = EXPANSIONS[l + 1], c = expansionCost(p.type, l); return n && c ? { level: n.level, name: n.name, description: n.description, grid: n.grid, cost: c } : null; })(), insured: !!p.insured, condition: Number.isFinite(p.condition) ? p.condition : 100, items: (p.items || []).map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z, rot: i.rot, placed: i.placed !== false })) });
module.exports = { HOMES, EXPANSIONS, MAX_LEVEL, levelOf, gridFor, gridOf, expansionCost, isHome, publicHome };
