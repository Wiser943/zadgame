// Furniture catalogue + room-grid rules shared by the server routes, the tests and (mirrored) the client.
// The room is a 6x6 grid of cells. An item covers w x d cells (swapped when turned 90/270 degrees).
const GRID = 6;
const SELL_RATE = 0.2;                       // selling pays 20% of the price, always far below buying
// cat: tab in the catalogue. w,d: footprint in cells. fixed: mounted on a wall/ceiling (no floor cell, no placing).
const ITEMS = {
  // Sleep
  'Foam Mattress': { cat: 'Sleep', w: 2, d: 1, price: 12000, stars: 1, kind: 'bed', color: '#8e9bb0', emoji: '🛏️' },
  'Spring Bed': { cat: 'Sleep', w: 2, d: 1, price: 23500, stars: 2, kind: 'bed', color: '#e0583c', emoji: '🛏️' },
  'Single Bed': { cat: 'Sleep', w: 2, d: 1, price: 45000, stars: 2, kind: 'bed', color: '#3b82c4', emoji: '🛏️' },
  'Lekki King Bed': { cat: 'Sleep', w: 3, d: 2, price: 128000, stars: 3, kind: 'bed', color: '#6b3fa0', emoji: '🛌' },
  'Queen Bed': { cat: 'Sleep', w: 2, d: 2, price: 250000, stars: 4, kind: 'bed', color: '#b8324a', emoji: '🛌' },
  // Kitchen
  'Cooler Box': { cat: 'Kitchen', w: 1, d: 1, price: 6500, stars: 1, kind: 'cooler', color: '#2d6dd8', emoji: '🧊', locked: true },
  'Gas Cooker': { cat: 'Kitchen', w: 1, d: 1, price: 85000, stars: 2, kind: 'cooker', color: '#bbbbbb', emoji: '🍳' },
  'Fridge': { cat: 'Kitchen', w: 1, d: 1, price: 320000, stars: 3, kind: 'fridge', color: '#dfe6ee', emoji: '🧊' },
  'Gen Set': { cat: 'Kitchen', w: 1, d: 1, price: 180000, stars: 3, kind: 'genset', color: '#dd9944', emoji: '⚡' },
  'Dining Table': { cat: 'Kitchen', w: 2, d: 1, price: 14000, stars: 2, kind: 'table', color: '#c9a572', emoji: '🍽️' },
  // Bath
  'Bucket Set': { cat: 'Bath', w: 1, d: 1, price: 2000, stars: 1, kind: 'bucket', color: '#2f6fd8', emoji: '🪣' },
  'Barrel': { cat: 'Bath', w: 1, d: 1, price: 4500, stars: 1, kind: 'barrel', color: '#1f4aa0', emoji: '🛢️' },
  'Water Closet': { cat: 'Bath', w: 1, d: 1, price: 70000, stars: 2, kind: 'toilet', color: '#e8ecf0', emoji: '🚽' },
  'Shower': { cat: 'Bath', w: 1, d: 1, price: 40000, stars: 2, kind: 'shower', color: '#99cccc', emoji: '🚿' },
  // Comfort
  'Plastic Chair': { cat: 'Comfort', w: 1, d: 1, price: 500, stars: 0, kind: 'chair', color: '#d0243a', emoji: '🪑' },
  'Side Table': { cat: 'Comfort', w: 1, d: 1, price: 3500, stars: 1, kind: 'stool', color: '#d2b48c', emoji: '🪵' },
  'Lounge Armchair': { cat: 'Comfort', w: 1, d: 1, price: 6000, stars: 2, kind: 'armchair', color: '#e0c25a', emoji: '🛋️' },
  'Velvet Sofa': { cat: 'Comfort', w: 2, d: 1, price: 10200, stars: 2, kind: 'sofa', color: '#1f8a64', emoji: '🛋️' },
  '3-Seater Family Sofa': { cat: 'Comfort', w: 3, d: 1, price: 24000, stars: 3, kind: 'sofa', color: '#c97b4a', emoji: '🛋️' },
  'Italian Leather Sofa': { cat: 'Comfort', w: 2, d: 1, price: 48000, stars: 3, kind: 'sofa', color: '#16161a', emoji: '🛋️' },
  'Royal Gold Sofa': { cat: 'Comfort', w: 2, d: 1, price: 96000, stars: 4, kind: 'sofa', color: '#7a1424', emoji: '🛋️' },
  // Light (lit when NEPA gives light or you own a Gen Set)
  'Ceiling Bulb': { cat: 'Light', w: 0, d: 0, price: 4000, stars: 1, kind: 'ceiling', color: '#ffe08a', emoji: '💡', fixed: true },
  'Wall Lamp': { cat: 'Light', w: 0, d: 0, price: 6000, stars: 1, kind: 'wall', color: '#ffd166', emoji: '🔦', fixed: true },
  'Standing Lamp': { cat: 'Light', w: 1, d: 1, price: 18000, stars: 2, kind: 'stand', color: '#f4b942', emoji: '🕯️' }
};
const CATS = ['Sleep', 'Kitchen', 'Bath', 'Comfort', 'Light'];
// What every new life starts with (the old hard-coded room), as items you can move or sell.
const STARTERS = [
  { name: 'Spring Bed', x: 0, z: 1, rot: 0 }, { name: 'Plastic Chair', x: 2, z: 3, rot: 0 }, { name: 'Lounge Armchair', x: 3, z: 3, rot: 0 },
  { name: 'Side Table', x: 3, z: 0, rot: 0 }, { name: 'Cooler Box', x: 5, z: 1, rot: 0 }, { name: 'Barrel', x: 5, z: 5, rot: 0 },
  { name: 'Bucket Set', x: 4, z: 5, rot: 0 }, { name: 'Water Closet', x: 0, z: 5, rot: 0 }
];
const isItem = (n) => Object.prototype.hasOwnProperty.call(ITEMS, n);
const sellPrice = (n) => (isItem(n) ? Math.max(100, Math.floor((ITEMS[n].price * SELL_RATE) / 100) * 100) : 0);
const footprint = (name, rot) => { const it = ITEMS[name]; if (!it || it.fixed) return [0, 0]; return (((rot % 360) + 360) % 360) % 180 === 90 ? [it.d, it.w] : [it.w, it.d]; };
const validRot = (r) => [0, 90, 180, 270].includes(r);
const inBounds = (x, z, w, d) => Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x + w <= GRID && z + d <= GRID;
const cellsOf = (it) => { const [w, d] = footprint(it.name, it.rot); const out = []; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([it.x + i, it.z + j]); return out; };
const occupied = (items, skipId) => { const s = new Set(); for (const it of items) { if (it.id === skipId || it.placed === false || !isItem(it.name) || ITEMS[it.name].fixed) continue; for (const [a, b] of cellsOf(it)) s.add(a + ',' + b); } return s; };
// Can `name` stand at (x,z,rot)? (ignoring the item `skipId` itself, for moves)
function canPlace(items, name, x, z, rot, skipId) {
  if (!isItem(name) || ITEMS[name].fixed || !validRot(rot)) return false;
  const [w, d] = footprint(name, rot); if (!inBounds(x, z, w, d)) return false;
  const occ = occupied(items, skipId); for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (occ.has((x + i) + ',' + (z + j))) return false;
  return true;
}
// First free spot, scanning the room (used for starters/migration and for the preview ghost).
function autoPlace(items, name) {
  for (const rot of [0, 90]) { const [w, d] = footprint(name, rot); for (let z = 0; z + d <= GRID; z++) for (let x = 0; x + w <= GRID; x++) if (canPlace(items, name, x, z, rot)) return { x, z, rot }; }
  return null;
}
const newId = () => require('crypto').randomBytes(5).toString('hex');
const starterItems = () => STARTERS.map((s) => ({ id: newId(), name: s.name, x: s.x, z: s.z, rot: s.rot, placed: true }));
// Old accounts: bought furniture was a list of names. Turn it into items placed in free cells (storage if the room is full).
const LEGACY = ['Single Bed', 'Foam Mattress', 'Queen Bed', 'Gas Cooker', 'Fridge', 'Gen Set', 'Bucket Set', 'Water Closet', 'Shower', 'Ceiling Bulb', 'Wall Lamp', 'Standing Lamp'];
function migrate(ownedNames) {
  const items = starterItems(); let refund = 0;
  for (const n of ownedNames || []) {
    if (n === 'Net') { refund += 8000; continue; }
    if (!LEGACY.includes(n)) continue;
    if (ITEMS[n].fixed) { items.push({ id: newId(), name: n, x: 0, z: 0, rot: 0, placed: true }); continue; }
    const p = autoPlace(items, n); items.push({ id: newId(), name: n, x: p ? p.x : 0, z: p ? p.z : 0, rot: p ? p.rot : 0, placed: !!p });
  }
  return { items, refund };
}
module.exports = { GRID, SELL_RATE, ITEMS, CATS, STARTERS, isItem, sellPrice, footprint, validRot, inBounds, cellsOf, occupied, canPlace, autoPlace, newId, starterItems, migrate };
