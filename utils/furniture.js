// Furniture catalogue + room-grid rules shared by the server routes, the tests and (mirrored) the client.
// The room is a 6x6 grid of cells. An item covers w x d cells (swapped when turned 90/270 degrees).
const BED = require('../public/allconnect/bedrooms');
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
  // Power: keeps lights, fridge and gadgets on when NEPA takes light. A Gen Set works in an outage; a Solar kit never lets you down.
  'Gen Set': { cat: 'Power', w: 1, d: 1, price: 180000, stars: 3, kind: 'genset', color: '#dd9944', emoji: '⚡', backup: 'gen' },
  'Solar Inverter Kit': { cat: 'Power', w: 1, d: 1, price: 650000, stars: 4, kind: 'solar', color: '#1f3a6b', emoji: '☀️', backup: 'solar' },
  // ---- more for the home (v29) ----
  'Bunk Bed': { cat: 'Sleep', w: 2, d: 1, price: 95000, stars: 2, kind: 'bunk', color: '#7a5a3a', emoji: '🛏️' },
  'Wardrobe': { cat: 'Sleep', w: 2, d: 1, price: 140000, stars: 2, kind: 'wardrobe', color: '#6b4a2f', emoji: '🚪' },
  'Microwave': { cat: 'Kitchen', w: 1, d: 1, price: 65000, stars: 2, kind: 'microwave', color: '#d9d9de', emoji: '🍲' },
  'Deep Freezer': { cat: 'Kitchen', w: 2, d: 1, price: 210000, stars: 3, kind: 'freezer', color: '#eef0f4', emoji: '🧊' },
  'Kitchen Island': { cat: 'Kitchen', w: 2, d: 1, price: 185000, stars: 3, kind: 'island', color: '#8a8f99', emoji: '🍳' },
  'Dining Set': { cat: 'Kitchen', w: 3, d: 2, price: 320000, stars: 3, kind: 'diningset', color: '#7a5a3a', emoji: '🍽️' },
  'Gas Cylinder': { cat: 'Kitchen', w: 1, d: 1, price: 38000, stars: 1, kind: 'cylinder', color: '#d33a2e', emoji: '🧯' },
  'Washing Machine': { cat: 'Bath', w: 1, d: 1, price: 280000, stars: 3, kind: 'washer', color: '#f1f2f5', emoji: '🧺' },
  'Bathtub': { cat: 'Bath', w: 2, d: 1, price: 360000, stars: 4, kind: 'bathtub', color: '#f4f5f7', emoji: '🛁' },
  'Coffee Table': { cat: 'Comfort', w: 1, d: 1, price: 42000, stars: 1, kind: 'coffee', color: '#8a6a45', emoji: '☕' },
  'TV Stand': { cat: 'Comfort', w: 2, d: 1, price: 230000, stars: 3, kind: 'tvstand', color: '#3a3f4a', emoji: '📺' },
  'Bookshelf': { cat: 'Comfort', w: 1, d: 1, price: 78000, stars: 2, kind: 'bookshelf', color: '#7a5a3a', emoji: '📚' },
  'Desk & Computer': { cat: 'Comfort', w: 2, d: 1, price: 260000, stars: 3, kind: 'desk', color: '#a9835a', emoji: '💻' },
  'Rug': { cat: 'Comfort', w: 2, d: 2, price: 55000, stars: 1, kind: 'rug', color: '#b04a3a', emoji: '🟥' },
  'Indoor Plant': { cat: 'Comfort', w: 1, d: 1, price: 18000, stars: 1, kind: 'plant', color: '#3f8f4f', emoji: '🪴' },
  'Standing AC': { cat: 'Comfort', w: 1, d: 1, price: 480000, stars: 4, kind: 'ac', color: '#f1f2f5', emoji: '❄️' },
  'Treadmill': { cat: 'Comfort', w: 1, d: 2, price: 390000, stars: 3, kind: 'treadmill', color: '#2d2f36', emoji: '🏃' },
  'Grand Piano': { cat: 'Comfort', w: 2, d: 2, price: 1800000, stars: 5, kind: 'piano', color: '#15161a', emoji: '🎹' },
  'Inverter Battery': { cat: 'Power', w: 1, d: 1, price: 300000, stars: 3, kind: 'battery', color: '#23252b', emoji: '🔋', backup: 'inverter' },
  'Big Generator': { cat: 'Power', w: 2, d: 1, price: 420000, stars: 3, kind: 'biggen', color: '#e8c21a', emoji: '⚡', backup: 'gen' },
  'Water Tank': { cat: 'Power', w: 2, d: 2, price: 220000, stars: 3, kind: 'tank', color: '#2b2e33', emoji: '🛢️' },
  'Borehole Pump': { cat: 'Power', w: 1, d: 1, price: 350000, stars: 3, kind: 'pump', color: '#2f6fb0', emoji: '🚰' },
  // ---- outdoor and street life ----
  'Kiosk': { cat: 'Outdoor', w: 2, d: 2, price: 380000, stars: 3, kind: 'kiosk', color: '#e0b21e', emoji: '🏪' },
  'Wheelbarrow Cart': { cat: 'Outdoor', w: 2, d: 1, price: 45000, stars: 1, kind: 'cart', color: '#d9a62a', emoji: '🛒' },
  'Bus Shelter': { cat: 'Outdoor', w: 3, d: 1, price: 260000, stars: 3, kind: 'shelter', color: '#2e5fa8', emoji: '🚏' },
  'Food Stall': { cat: 'Outdoor', w: 2, d: 2, price: 320000, stars: 3, kind: 'stall', color: '#3566b8', emoji: '🍲' },
  'Umbrella Table': { cat: 'Outdoor', w: 2, d: 2, price: 85000, stars: 2, kind: 'umbtable', color: '#e8b52a', emoji: '⛱️' },
  'Container Shop': { cat: 'Outdoor', w: 4, d: 2, price: 900000, stars: 4, kind: 'container', color: '#2d5fa6', emoji: '📦' },
  'Ice-Water Stand': { cat: 'Outdoor', w: 2, d: 1, price: 120000, stars: 2, kind: 'icestand', color: '#2f6fd1', emoji: '🧊' },
  'Dustbin': { cat: 'Outdoor', w: 1, d: 1, price: 35000, stars: 1, kind: 'dustbin', color: '#3f7a4a', emoji: '🗑️' },
  'Plastic Table & Chairs': { cat: 'Outdoor', w: 2, d: 2, price: 28000, stars: 1, kind: 'plasticset', color: '#d33a2e', emoji: '🪑' },
  'Tyre Stack': { cat: 'Outdoor', w: 1, d: 1, price: 30000, stars: 1, kind: 'tyres', color: '#2b2b2e', emoji: '🛞' },
  // ---- cars: only fit inside a Garage extension ----
  'Rusty Sedan': { cat: 'Cars', w: 2, d: 4, price: 450000, stars: 1, kind: 'car', style: 'rusty', color: '#5b6b78', emoji: '🚗', garage: true },
  'Red Hatchback': { cat: 'Cars', w: 2, d: 4, price: 2800000, stars: 3, kind: 'car', style: 'hatch', color: '#d4383d', emoji: '🚗', garage: true },
  'White Corolla': { cat: 'Cars', w: 2, d: 4, price: 4200000, stars: 3, kind: 'car', style: 'sedan', color: '#f2f3f5', emoji: '🚗', garage: true },
  'Maroon Sedan': { cat: 'Cars', w: 2, d: 4, price: 3400000, stars: 3, kind: 'car', style: 'sedan', color: '#8a1c2e', emoji: '🚗', garage: true },
  'Black SUV': { cat: 'Cars', w: 2, d: 4, price: 8500000, stars: 4, kind: 'car', style: 'suv', color: '#1c1d21', emoji: '🚙', garage: true },
  'White Pickup': { cat: 'Cars', w: 2, d: 4, price: 9000000, stars: 4, kind: 'car', style: 'pickup', color: '#f4f5f7', emoji: '🛻', garage: true },
  'White Prado': { cat: 'Cars', w: 2, d: 4, price: 22000000, stars: 5, kind: 'car', style: 'prado', color: '#f6f6f8', emoji: '🚙', garage: true },
  'Container Truck': { cat: 'Cars', w: 2, d: 6, price: 18000000, stars: 4, kind: 'car', style: 'truck', color: '#b2402f', emoji: '🚛', garage: true },
  // Light (lit when NEPA gives light or you own a Gen Set). hang: true = hangs from the ceiling at the cell you choose, one per room is fine
  'Pendant Light': { cat: 'Light', w: 0, d: 0, price: 22000, stars: 2, kind: 'pendant', color: '#ffd9a0', emoji: '💡', fixed: true, hang: true },
  'Ceiling Fan': { cat: 'Light', w: 0, d: 0, price: 65000, stars: 3, kind: 'fan', color: '#d8c7a6', emoji: '🌀', fixed: true, hang: true },
  'Chandelier': { cat: 'Light', w: 0, d: 0, price: 180000, stars: 4, kind: 'chandelier', color: '#ffe3a3', emoji: '🪔', fixed: true, hang: true },
  // The staircase that is built together with an upstairs floor. Not sold in the shop; it can be moved but not stored or sold.
  'Grand Staircase': { cat: 'Structure', w: 2, d: 3, price: 400000, stars: 4, kind: 'stairs', color: '#8a6a45', emoji: '🪜', locked: true, hidden: true, stairs: true },
  'Arc Floor Lamp': { cat: 'Light', w: 1, d: 1, price: 45000, stars: 3, kind: 'stand', color: '#2b2b33', emoji: '🪔' },
  'Ceiling Bulb': { cat: 'Light', w: 0, d: 0, price: 4000, stars: 1, kind: 'ceiling', color: '#ffe08a', emoji: '💡', fixed: true },
  'Wall Lamp': { cat: 'Light', w: 0, d: 0, price: 6000, stars: 1, kind: 'wall', color: '#ffd166', emoji: '🔦', fixed: true },
  'Standing Lamp': { cat: 'Light', w: 1, d: 1, price: 18000, stars: 2, kind: 'stand', color: '#f4b942', emoji: '🕯️' }
};
const CATS = ['Sleep', 'Kitchen', 'Bath', 'Comfort', 'Light', 'Power', 'Outdoor', 'Cars'];
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
// `grid` is a number (square room) or a layout { w, d, blocked: Set('x,z') } for homes built from a house model
const gridW = (g) => (typeof g === 'object' && g ? g.w : g), gridD = (g) => (typeof g === 'object' && g ? g.d : g);
const inBounds = (x, z, w, d, grid = GRID) => Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x + w <= gridW(grid) && z + d <= gridD(grid);
const cellsOf = (it) => { const [w, d] = footprint(it.name, it.rot); const out = []; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([it.x + i, it.z + j]); return out; };
const occupied = (items, skipId, grid) => { const s = new Set(grid && typeof grid === 'object' && grid.blocked ? grid.blocked : []); for (const it of items) { if (it.id === skipId || it.placed === false || !isItem(it.name) || ITEMS[it.name].fixed) continue; for (const [a, b] of cellsOf(it)) s.add(a + ',' + b); } return s; };
const onFloor = (items, f) => (items || []).filter((i) => (Number(i.floor) || 0) === (Number(f) || 0));
// Cars (and anything with garage: true) only fit inside the Garage extension: every cell must be in the grid's 'garage' room
const inGarage = (grid, x, z, w, d) => { const g = grid && typeof grid === 'object' && (grid.rooms || []).find((r) => r.id === 'garage'); return !!g && x >= g.x0 && z >= g.z0 && x + w - 1 <= g.x1 && z + d - 1 <= g.z1; };
const isHang = (n) => isItem(n) && !!ITEMS[n].hang;
// Ceiling lights / fans hang at a cell: inside the room, not on a wall cell, and no other hanging item already at that cell
function canHang(items, name, x, z, skipId, grid = GRID) {
  if (!isHang(name) || !inBounds(x, z, 1, 1, grid)) return false;
  if (grid && typeof grid === 'object' && grid.blocked && new Set(grid.blocked).has(x + ',' + z)) return false;
  return !items.some((i) => i.id !== skipId && i.placed !== false && isHang(i.name) && i.x === x && i.z === z);
}
// Can `name` stand at (x,z,rot)? (ignoring the item `skipId` itself, for moves)
function canPlace(items, name, x, z, rot, skipId, grid = GRID) {
  if (!isItem(name) || ITEMS[name].fixed || !validRot(rot)) return false;
  const [w, d] = footprint(name, rot); if (!inBounds(x, z, w, d, grid)) return false;
  if (ITEMS[name].garage && !inGarage(grid, x, z, w, d)) return false;                                  // cars only fit inside the Garage
  if (grid && typeof grid === 'object' && grid.noCross && BED.crossesWall(grid.walls, x, z, w, d)) return false;   // bedroom plans: nothing stands across a wall
  const occ = occupied(items, skipId, grid); for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (occ.has((x + i) + ',' + (z + j))) return false;
  return true;
}
// First free spot, scanning the room (used for starters/migration and for the preview ghost).
function autoPlace(items, name, grid = GRID) {
  for (const rot of [0, 90]) { const [w, d] = footprint(name, rot); for (let z = 0; z + d <= gridD(grid); z++) for (let x = 0; x + w <= gridW(grid); x++) if (canPlace(items, name, x, z, rot, undefined, grid)) return { x, z, rot }; }
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
module.exports = { inGarage, onFloor, isHang, canHang, GRID, SELL_RATE, ITEMS, CATS, STARTERS, isItem, sellPrice, footprint, validRot, inBounds, cellsOf, occupied, canPlace, autoPlace, newId, starterItems, migrate };
