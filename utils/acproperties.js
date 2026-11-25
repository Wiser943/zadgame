// Server-authoritative catalogue for additional AllConnect homes.
// `comfort` is a display multiplier (shown next to the price, like "comfort x1.3") that says how nice a place is to
// live in — a flavour/prestige stat for now, the same idea as a hotel's star rating. It carries no hidden gameplay
// effect; it is there so the Homes list reads like a proper housing ladder from a shared room to Banana Island.
const HOMES = {
  'mainland_room': { name: 'Mainland Room', description: 'A simple private room to make your own.', mode: 'rent', rent: 25000, rentDays: 7, paint: '#c7a17a', max: 1, comfort: 1 },
  'self_contained': { name: 'Self-Contained', description: 'Your own compact space with room to furnish.', mode: 'buy', price: 350000, paint: '#d9a93a', max: 1, comfort: 1.1 },
  'mini_flat': { name: 'Mini Flat', description: 'Extra space for a more comfortable setup.', mode: 'buy', price: 900000, paint: '#8eb7c8', max: 1, comfort: 1.2 },
  'market_shop': { name: 'Market Shop', description: 'Your own shop: a counter, shelves of goods and a stock corner, with the shop building next door. Furnish the rest.', mode: 'buy', price: 3200000, paint: '#efe3c8', max: 1, layout: 'market_shop', layoutNote: 'Shop floor with a counter and shelves (fixed size)', comfort: 1.1 },
  'two_bedroom': { name: 'Two-Bedroom Apartment', description: 'A larger home for future social gatherings.', mode: 'buy', price: 2200000, paint: '#9a8ac7', max: 1, comfort: 1.3 },
  'family_house': { name: 'Family House', description: 'A real multi-room house: bedrooms, kitchen, bathroom and a big living room.', mode: 'buy', price: 4500000, paint: '#e6d9c0', max: 1, layout: 'family_house', layoutNote: 'Full house plan with separate rooms (fixed size)', comfort: 1.4 },
  'lekki_apartment': { name: 'Lekki Waterfront Apartment', description: 'Floor-to-ceiling windows over the lagoon, a pool downstairs and the Phase 1 strip on your doorstep.', mode: 'buy', price: 9000000, paint: '#2f6fb0', max: 1, comfort: 1.5 },
  'ikoyi_mansion': { name: 'Ikoyi Luxury Mansion', description: 'Fully furnished: five bedrooms, chandeliers, a solar system and a grand living room. Move in today.', mode: 'buy', price: 20000000, paint: '#d9c7a0', max: 1, comfort: 1.7, furnished: true },
  'maitama_villa': { name: 'Maitama Luxury Villa', description: 'Fully furnished: four bedrooms, ceiling fans, a solar system and a lounge made for guests. Move in today.', mode: 'buy', price: 20000000, paint: '#cfd8c2', max: 1, comfort: 1.65, furnished: true },
  'banana_island_mansion': { name: 'Banana Island Mansion', description: 'Private jetty, a long driveway and neighbours who own the street. You made it.', mode: 'buy', price: 40000000, paint: '#caa14d', max: 1, comfort: 1.85 }
};
// What a home is worth for the bills/insurance/weather-loss maths elsewhere: the price for anything you can own
// outright, 0 for a rental (you never built equity in it). One source of truth instead of the same list copied
// into three different files.
const assetValue = (type) => { const h = HOMES[type]; return h && h.mode !== 'rent' ? h.price : 0; };
// Bedroom expansions: an owned (bought) home can add bedrooms, up to 5 bedrooms in total. The floor plan comes from the
// shared generator in public/allconnect/bedrooms.js (the browser draws the very same plan), and every price is decided here.
// Each added bedroom costs a share of the home's price that rises a little with every bedroom.
const BED = require('../public/allconnect/bedrooms');
const { layoutFor } = require('./layouts');
const MAX_BEDROOMS = 5;                       // total bedrooms a home can reach
const BASE_BEDROOMS = { self_contained: 0, mini_flat: 1, two_bedroom: 2, ikoyi_mansion: 5, maitama_villa: 4 };
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
const STAIRS = 'Grand Staircase';
// gridOf(p) = the ground floor (as before). gridOf(p, 1) = the upstairs floor: same footprint, the staircase opening blocked, walls by the chosen style.
const gridOf = (p, floor = 0) => {
  if (Number(floor) === 2) { const Y = BED.yard(); return { ...Y, blocked: new Set(Y.blocked), walls: new Set(Y.walls) }; }   // every home has a yard
  const h = HOMES[p && p.type];
  if (h && h.layout) return layoutFor(h.layout) || BED.MAIN;
  const L = BED.layout(totalOf(p), p ? { bath: !!p.bath, garage: !!p.garage, style: p.groundStyle } : null), ground = L ? { ...L, blocked: new Set(L.blocked), walls: new Set(L.walls) } : BED.MAIN;
  if (Number(floor) !== 1 || !p || !p.upstairs) return ground;
  const w = typeof ground === 'object' ? ground.w : ground, d = typeof ground === 'object' ? ground.d : ground;
  const st = (p.items || []).find((i) => i.name === STAIRS && i.placed !== false && !(Number(i.floor) > 0)), open = st ? require('./furniture').cellsOf(st).map((c) => c.join(',')) : [];
  const U = BED.upper(w, d, p.upStyle, open); return { ...U, blocked: new Set(U.blocked), walls: new Set(U.walls) };
};
// How well a home rides out a NEPA outage. Mansions and homes with 4+ bedrooms have their own backup power, so the light never goes;
// 3-bedroom homes and flats lose it far less often. Everybody else relies on NEPA unless they buy a Gen Set or a Solar kit.
const FULL_POWER = ['ikoyi_mansion', 'maitama_villa', 'banana_island_mansion', 'lekki_apartment'];
const powerTier = (p) => { const t = p && p.type; if (FULL_POWER.includes(t) || totalOf(p) >= 4) return 'full'; if (totalOf(p) >= 3 || t === 'family_house' || t === 'two_bedroom') return 'partial'; return 'none'; };
// A fully furnished home arrives with its furniture already in place: beds in every bedroom, a living area, kitchen, bath, lights, fans and solar.
function furnishedItems(type) {
  const h = HOMES[type]; if (!h || !h.furnished) return [];
  const F = require('./furniture'), p = { type, bedrooms: 0 }, grid = gridOf(p), total = totalOf(p), L = BED.layout(total), items = [];
  const reserved = new Set(); for (const r of (L && L.rooms) || []) { const [dx, dz] = r.door; for (const [a, b] of [[dx, dz], [dx - 1, dz], [dx + 1, dz], [r.x0, dz], [dx, dz - 1], [dx, dz + 1]]) reserved.add(a + ',' + b); }
  const put = (name, reg, rots = [0, 90]) => {
    if (F.isHang(name)) { for (let z = reg.z0; z <= reg.z1; z++) for (let x = reg.x0; x <= reg.x1; x++) if (F.canHang(items, name, x, z, undefined, grid) && !reserved.has(x + ',' + z)) { items.push({ id: F.newId(), name, x, z, rot: 0, placed: true }); return true } return false }
    for (const rot of rots) { const [w, d] = F.footprint(name, rot); for (let z = reg.z0; z + d - 1 <= reg.z1; z++) for (let x = reg.x0; x + w - 1 <= reg.x1; x++) { let hit = false; for (let i = 0; i < w && !hit; i++) for (let j = 0; j < d; j++) if (reserved.has((x + i) + ',' + (z + j))) { hit = true; break } if (!hit && F.canPlace(items, name, x, z, rot, undefined, grid)) { items.push({ id: F.newId(), name, x, z, rot, placed: true }); return true } } }
    return false;
  };
  const living = { x0: 0, z0: 0, x1: 5, z1: 5 };
  ['Royal Gold Sofa', 'Italian Leather Sofa', '3-Seater Family Sofa', 'Lounge Armchair', 'Lounge Armchair', 'Dining Table', 'Fridge', 'Gas Cooker', 'Water Closet', 'Shower', 'Side Table', 'Arc Floor Lamp', 'Solar Inverter Kit'].forEach((n) => put(n, living));
  put('Chandelier', { x0: 2, z0: 2, x1: 3, z1: 3 }); put('Ceiling Fan', { x0: 3, z0: 3, x1: 5, z1: 5 });
  ((L && L.rooms) || []).forEach((r, i) => { const reg = { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }; put(i === 0 ? 'Lekki King Bed' : 'Queen Bed', reg) || put('Queen Bed', reg) || put('Single Bed', reg); put('Side Table', reg); put('Pendant Light', reg); if (i % 2 === 0) put('Ceiling Fan', reg); });
  return items;
}
// Renovations an owned home can buy. Only homes with the plain bedroom plan can be changed (fixed house plans cannot).
const priceOf = (t) => (HOMES[t] && HOMES[t].price) || 0, rnd = (n) => Math.round(n / 1000) * 1000;
const BATH_COST = (t) => Math.max(250000, rnd(priceOf(t) * 0.04));
const UPSTAIRS_COST = (t) => Math.max(900000, rnd(priceOf(t) * 0.30));
const FINISH_COST = (t) => Math.max(600000, rnd(priceOf(t) * 0.08));
const STYLE_COST = 150000, GSTYLE_COST = 200000, GARAGE_COST = (t) => Math.max(1200000, rnd(priceOf(t) * 0.10));
const renovationOptions = (p) => {
  const t = p && p.type, h = HOMES[t]; if (!p || p.tenure !== 'owned' || !h || h.mode !== 'buy' || h.layout) return [];
  const out = [];
  if (!p.bath) out.push({ id: 'bath', name: 'Back extension', description: 'Adds a Toilet room and an open back porch behind your home. Your furniture does not move.', cost: BATH_COST(t) });
  if (!p.upstairs) for (const k of Object.keys(BED.UP_STYLES)) out.push({ id: 'upstairs:' + k, group: 'Add an upstairs floor', name: 'Upstairs · ' + BED.UP_STYLES[k], description: 'Builds a grand staircase and a whole new floor above your home. Needs a free 2 by 3 space downstairs for the staircase.', cost: UPSTAIRS_COST(t) });
  else for (const k of Object.keys(BED.UP_STYLES)) if (k !== (p.upStyle || 'lounge')) out.push({ id: 'upstyle:' + k, group: 'Change the upstairs layout', name: 'Upstairs · ' + BED.UP_STYLES[k], description: 'Rebuilds the walls upstairs. Furniture that no longer fits goes into storage.', cost: STYLE_COST });
  if (!p.garage) out.push({ id: 'garage', name: 'Garage extension', description: 'Adds a three-row garage along the bottom of your home. Cars from the Cars tab in Buy mode can be parked in it.', cost: GARAGE_COST(t) });
  for (const k of Object.keys(BED.STYLES)) if (k !== (p.groundStyle || 'open')) out.push({ id: 'gstyle:' + k, group: 'Downstairs layout', name: 'Downstairs · ' + BED.STYLES[k], description: 'Rebuilds the walls of your living area. Furniture that no longer fits goes into storage.', cost: k === 'open' ? 0 : GSTYLE_COST });
  if (p.finish !== 'luxury') out.push({ id: 'finish', name: 'Luxury finish', description: 'Polished marble floors, cream walls and gold trim on every floor.', cost: FINISH_COST(t) });
  return out;
};
// How long the builders take. Bigger homes and bigger jobs take longer (BUILD_SPEED=10 makes everything 10x faster for testing).
const BUILD_SPEED = Math.max(0.01, Number(process.env.BUILD_SPEED) || 1);
const homeBuildMinutes = (type) => Math.max(1, Math.round(Math.min(150, Math.max(4, 4 + priceOf(type) / 1e6 * 6)) / BUILD_SPEED));
const renoBuildMinutes = (p, optId) => {
  const k = String(optId).split(':')[0], base = { bath: 6, garage: 18, upstairs: 40, finish: 15, upstyle: 8, gstyle: 10 }[k] || 10, f = (k === 'upstyle' || k === 'gstyle') ? 1 : Math.min(2.5, Math.max(1, priceOf(p && p.type) / 4e6));
  return Math.max(1, Math.round(base * f / BUILD_SPEED));
};
const publicBuild = (b, now = Date.now()) => { const ready = new Date(b.readyAt).getTime(), start = new Date(b.startedAt).getTime(); return { id: b.id, kind: b.kind, name: b.name, cost: b.cost, propertyId: b.propertyId || '', homeType: b.homeType || '', startedAt: start, readyAt: ready, status: now >= ready ? 'ready' : 'building', msLeft: Math.max(0, ready - now), pct: Math.max(0, Math.min(100, Math.round((now - start) / Math.max(1, ready - start) * 100))) }; };
/* ---------- furnish packs: a whole room / floor furnished like a luxury home in one purchase ----------
   Items are placed where they fit (first free spot, in the region named by the pack). Anything that does not fit is skipped and not charged. 15% off the shelf price. */
const PACKS = {
  living:   { name: 'Luxury Living Pack', emoji: '🛋️', floor: 0, desc: 'Sofas, TV stand, rug, bookshelf, plants, chandelier and AC for the living area.', region: 'living', items: ['Royal Gold Sofa', 'Italian Leather Sofa', 'Coffee Table', 'TV Stand', 'Rug', 'Bookshelf', 'Indoor Plant', 'Indoor Plant', 'Arc Floor Lamp', 'Chandelier', 'Standing AC'] },
  kitchen:  { name: 'Chef Kitchen & Dining Pack', emoji: '🍽️', floor: 0, desc: 'Island, freezer, fridge, cooker, microwave, dining set and washing machine.', region: 'living', items: ['Kitchen Island', 'Fridge', 'Deep Freezer', 'Gas Cooker', 'Microwave', 'Dining Set', 'Washing Machine', 'Pendant Light'] },
  master:   { name: 'Master Bedroom Pack', emoji: '🛏️', floor: 'any', desc: 'King bed, wardrobe, side tables, rug, fan, light and AC in the first bedroom (or the floor).', region: 'bedroom', items: ['Lekki King Bed', 'Wardrobe', 'Side Table', 'Side Table', 'Rug', 'Ceiling Fan', 'Pendant Light', 'Standing AC'] },
  cinema:   { name: 'Home Cinema Pack', emoji: '🎬', floor: 'any', desc: 'A big screen, four recliners, a rug and a wine bar.', region: 'floor', items: ['Cinema Screen', 'Recliner', 'Recliner', 'Recliner', 'Recliner', 'Rug', 'Wine Bar', 'Pendant Light'] },
  gym:      { name: 'Home Gym Pack', emoji: '🏋️', floor: 'any', desc: 'Two treadmills, two benches and a dumbbell rack.', region: 'floor', items: ['Treadmill', 'Treadmill', 'Gym Bench', 'Gym Bench', 'Dumbbell Rack', 'Indoor Plant'] },
  terrace:  { name: 'Pool Terrace Pack', emoji: '🏊', floor: 1, desc: 'A swimming pool, four sun loungers, two parasol tables, a BBQ grill and planter trees on your upstairs terrace.', region: 'floor', needs: 'upstairs', items: ['Swimming Pool', 'Sun Lounger', 'Sun Lounger', 'Sun Lounger', 'Sun Lounger', 'Umbrella Table', 'Umbrella Table', 'BBQ Grill', 'Planter Tree', 'Planter Tree', 'Planter Tree'] },
  garage:   { name: 'Supercar Garage Pack', emoji: '🚗', floor: 0, desc: 'Five cars parked in your garage: Prado, SUV, hatchback, Corolla and a maroon sedan.', region: 'garage', needs: 'garage', items: ['White Prado', 'Black SUV', 'Red Hatchback', 'White Corolla', 'Maroon Sedan'] }
};
const PACK_DISCOUNT = 0.85;
// Works out what a pack would place in this home right now: { floor, items[], cost, skipped }.
function packPlan(p, packId, floorWanted) {
  const k = PACKS[packId]; if (!k || !p || p.tenure !== 'owned') return null;
  const F = require('./furniture');
  if (k.needs === 'upstairs' && !p.upstairs) return null; if (k.needs === 'garage' && !p.garage) return null;
  const floor = k.floor === 'any' ? (Number(floorWanted) === 1 && p.upstairs ? 1 : 0) : k.floor; if (floor === 1 && !p.upstairs) return null;
  const grid = gridOf(p, floor), all = (p.items || []).map((i) => (i.toObject ? i.toObject() : i)), onF = F.onFloor(all, floor).filter((i) => i.placed !== false), placed = [], rooms = (grid && grid.rooms) || [];
  const W = typeof grid === 'object' ? grid.w : grid, D = typeof grid === 'object' ? grid.d : grid;
  let reg = { x0: 0, z0: 0, x1: W - 1, z1: D - 1 };
  if (k.region === 'living') reg = { x0: 0, z0: 0, x1: Math.min(5, W - 1), z1: Math.min(5, D - 1) };
  else if (k.region === 'garage') { const g = rooms.find((r) => r.id === 'garage'); if (!g) return null; reg = g; }
  else if (k.region === 'bedroom') { const b = rooms.find((r) => /^b\d/.test(r.id) || /^u\d/.test(r.id)); if (b) reg = b; }
  const cur = onF.slice(), skipped = [];
  for (const name of k.items) {
    if ((p.items || []).length + placed.length >= 120) { skipped.push(name); continue; }
    let spot = null;
    if (F.isHang(name)) { for (let z = reg.z0; z <= reg.z1 && !spot; z++) for (let x = reg.x0; x <= reg.x1; x++) if (F.canHang(cur, name, x, z, undefined, grid)) { spot = { x, z, rot: 0 }; break } }
    else for (const rot of [0, 90]) { const [w, d] = F.footprint(name, rot); for (let z = reg.z0; z + d - 1 <= reg.z1 && !spot; z++) for (let x = reg.x0; x + w - 1 <= reg.x1; x++) if (F.canPlace(cur, name, x, z, rot, undefined, grid)) { spot = { x, z, rot }; break } if (spot) break }
    if (!spot) { skipped.push(name); continue }
    const it = { id: F.newId(), name, x: spot.x, z: spot.z, rot: spot.rot, floor, placed: true }; placed.push(it); cur.push(it);
  }
  const cost = Math.round(placed.reduce((n, i) => n + F.ITEMS[i.name].price, 0) * PACK_DISCOUNT / 1000) * 1000;
  return { floor, items: placed, cost, skipped };
}
const availablePacks = (p) => Object.keys(PACKS).flatMap((id) => { const k = PACKS[id], fl = k.floor === 'any' ? (p.upstairs ? [0, 1] : [0]) : [k.floor]; return fl.map((f) => { const pl = packPlan(p, id, f); return pl && pl.items.length ? { id, name: k.name, emoji: k.emoji, desc: k.desc, floor: pl.floor, count: pl.items.length, of: k.items.length, cost: pl.cost, any: k.floor === 'any' } : null; }); }).filter(Boolean);
const isHome = (id) => Object.prototype.hasOwnProperty.call(HOMES, id);
const publicHome = (p) => ({ id: p.id, type: p.type, name: HOMES[p.type]?.name || 'Home', description: HOMES[p.type]?.description || '', comfort: HOMES[p.type]?.comfort || 1, tenure: p.tenure, boughtAt: p.boughtAt, leaseExpiresAt: p.leaseExpiresAt, paint: p.paint, bedrooms: extraOf(p), totalBedrooms: totalOf(p), sizeLabel: BED.label(totalOf(p)), maxBedrooms: baseBedrooms(p.type) + maxExtra(p.type), power: powerTier(p), bath: !!p.bath, garage: !!p.garage, groundStyle: p.groundStyle || 'open', upstairs: !!p.upstairs, upStyle: p.upStyle || 'lounge', finish: p.finish || 'standard', renovations: renovationOptions(p), furnished: !!HOMES[p.type]?.furnished, expansions: expansionOptions(p), packs: p.tenure === 'owned' ? availablePacks(p) : [], layout: HOMES[p.type]?.layout || '', insured: !!p.insured, condition: Number.isFinite(p.condition) ? p.condition : 100, items: (p.items || []).map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z, rot: i.rot, floor: Number(i.floor) || 0, placed: i.placed !== false })) });
module.exports = { PACKS, packPlan, availablePacks, homeBuildMinutes, renoBuildMinutes, publicBuild, GARAGE_COST, GSTYLE_COST, STAIRS, UPSTAIRS_COST, FINISH_COST, STYLE_COST, BATH_COST, renovationOptions, powerTier, furnishedItems, HOMES, MAX_BEDROOMS, assetValue, baseBedrooms, maxExtra, extraOf, totalOf, stepCost, expansionCost, expansionOptions, gridOf, isHome, publicHome };
