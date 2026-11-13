// Server-authoritative catalogue for additional AllConnect homes.
const HOMES = {
  'mainland_room': { name: 'Mainland Room', description: 'A simple private room to make your own.', mode: 'rent', rent: 25000, rentDays: 7, paint: '#c7a17a', max: 1 },
  'self_contained': { name: 'Self-Contained', description: 'Your own compact space with room to furnish.', mode: 'buy', price: 350000, paint: '#d9a93a', max: 1 },
  'mini_flat': { name: 'Mini Flat', description: 'Extra space for a more comfortable setup.', mode: 'buy', price: 900000, paint: '#8eb7c8', max: 1 },
  'family_house': { name: 'Family House', description: 'A real multi-room house: bedrooms, kitchen, bathroom and a big living room.', mode: 'buy', price: 4500000, paint: '#e6d9c0', max: 1, layout: 'family_house', layoutNote: 'Full house plan with separate rooms (fixed size)' },
  'market_shop': { name: 'Market Shop', description: 'Your own shop: a counter, shelves of goods and a stock corner, with the shop building next door. Furnish the rest.', mode: 'buy', price: 3200000, paint: '#efe3c8', max: 1, layout: 'market_shop', layoutNote: 'Shop floor with a counter and shelves (fixed size)' },
  'two_bedroom': { name: 'Two-Bedroom Apartment', description: 'A larger home for future social gatherings.', mode: 'buy', price: 2200000, paint: '#9a8ac7', max: 1 }
};
// Bedroom expansions: an owned (bought) home can add bedrooms, up to 5 bedrooms in total. The floor plan comes from the
// shared generator in public/allconnect/bedrooms.js (the browser draws the very same plan), and every price is decided here.
// Each added bedroom costs a share of the home's price that rises a little with every bedroom.
const BED = require('../public/allconnect/bedrooms');
const { layoutFor } = require('./layouts');
const MAX_BEDROOMS = 5;                       // total bedrooms a home can reach
const BASE_BEDROOMS = { self_contained: 0, mini_flat: 1, two_bedroom: 2 };
const baseBedrooms = (type) => BASE_BEDROOMS[type] || 0;
// How many bedrooms can still be added to this home type (0 = cannot be expanded: rentals, fixed floor plans).
const maxExtra = (type) => { const h = HOMES[type]; return h && h.mode === 'buy' && !h.layout ? Math.max(0, Math.min(BED.MAX_EXTRA, MAX_BEDROOMS - baseBedrooms(type))) : 0; };
// Bedrooms added so far (0..maxExtra). Older records that never had this field count as 0.
const extraOf = (p) => { const n = Number(p && p.bedrooms); return Number.isInteger(n) && n > 0 ? Math.min(n, maxExtra(p && p.type)) : 0; };
const totalOf = (p) => baseBedrooms(p && p.type) + extraOf(p);
// Price of adding the single bedroom that takes a home from `extra - 1` to `extra` bedrooms added.
const stepCost = (type, extra) => { const h = HOMES[type]; if (!h || !h.price || extra < 1 || extra > maxExtra(type)) return 0; return Math.max(25000, Math.round((h.price * (0.20 + 0.05 * (extra - 1))) / 1000) * 1000); };
// Price of going from `from` to `to` added bedrooms (0 when it is not allowed).
const expansionCost = (type, from, to) => { from = Number(from) || 0; to = Number(to); if (!Number.isInteger(to) || to <= from || to > maxExtra(type)) return 0; let sum = 0; for (let i = from + 1; i <= to; i++) sum += stepCost(type, i); return sum; };
// What a player can choose right now: every bigger size with its total price.
const expansionOptions = (p) => { const out = [], cur = extraOf(p), t = p && p.type; if (!p || p.tenure !== 'owned') return out; for (let e = cur + 1; e <= maxExtra(t); e++) out.push({ bedrooms: e, total: baseBedrooms(t) + e, label: BED.label(baseBedrooms(t) + e), cost: expansionCost(t, cur, e) }); return out; };
// The room a property is furnished in: a plan from a house model, a bedroom plan (the bedrooms the home comes with plus any
// bought), or the plain 6x6 room. The 6x6 living area always stays put at the top-left, so placed furniture never moves.
const gridOf = (p) => { const h = HOMES[p && p.type]; if (h && h.layout) return layoutFor(h.layout) || BED.MAIN; const L = BED.layout(totalOf(p)); return L ? { ...L, blocked: new Set(L.blocked), walls: new Set(L.walls) } : BED.MAIN; };
const isHome = (id) => Object.prototype.hasOwnProperty.call(HOMES, id);
const publicHome = (p) => ({ id: p.id, type: p.type, name: HOMES[p.type]?.name || 'Home', description: HOMES[p.type]?.description || '', tenure: p.tenure, boughtAt: p.boughtAt, leaseExpiresAt: p.leaseExpiresAt, paint: p.paint, bedrooms: extraOf(p), totalBedrooms: totalOf(p), sizeLabel: BED.label(totalOf(p)), maxBedrooms: baseBedrooms(p.type) + maxExtra(p.type), expansions: expansionOptions(p), layout: HOMES[p.type]?.layout || '', insured: !!p.insured, condition: Number.isFinite(p.condition) ? p.condition : 100, items: (p.items || []).map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z, rot: i.rot, placed: i.placed !== false })) });
module.exports = { HOMES, MAX_BEDROOMS, baseBedrooms, maxExtra, extraOf, totalOf, stepCost, expansionCost, expansionOptions, gridOf, isHome, publicHome };
