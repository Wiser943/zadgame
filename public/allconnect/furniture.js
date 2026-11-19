/* GENERATED from utils/furniture.js by scripts/gen-furniture.js - do not edit by hand. Same rules as the server. */
(function () {
  const D = {
 "GRID": 6,
 "SELL_RATE": 0.2,
 "CATS": [
  "Sleep",
  "Kitchen",
  "Bath",
  "Comfort",
  "Light",
  "Power",
  "Outdoor",
  "Cars"
 ],
 "ITEMS": {
  "Foam Mattress": {
   "cat": "Sleep",
   "w": 2,
   "d": 1,
   "price": 12000,
   "stars": 1,
   "kind": "bed",
   "color": "#8e9bb0",
   "emoji": "🛏️"
  },
  "Spring Bed": {
   "cat": "Sleep",
   "w": 2,
   "d": 1,
   "price": 23500,
   "stars": 2,
   "kind": "bed",
   "color": "#e0583c",
   "emoji": "🛏️"
  },
  "Single Bed": {
   "cat": "Sleep",
   "w": 2,
   "d": 1,
   "price": 45000,
   "stars": 2,
   "kind": "bed",
   "color": "#3b82c4",
   "emoji": "🛏️"
  },
  "Lekki King Bed": {
   "cat": "Sleep",
   "w": 3,
   "d": 2,
   "price": 128000,
   "stars": 3,
   "kind": "bed",
   "color": "#6b3fa0",
   "emoji": "🛌"
  },
  "Queen Bed": {
   "cat": "Sleep",
   "w": 2,
   "d": 2,
   "price": 250000,
   "stars": 4,
   "kind": "bed",
   "color": "#b8324a",
   "emoji": "🛌"
  },
  "Cooler Box": {
   "cat": "Kitchen",
   "w": 1,
   "d": 1,
   "price": 6500,
   "stars": 1,
   "kind": "cooler",
   "color": "#2d6dd8",
   "emoji": "🧊",
   "locked": true
  },
  "Gas Cooker": {
   "cat": "Kitchen",
   "w": 1,
   "d": 1,
   "price": 85000,
   "stars": 2,
   "kind": "cooker",
   "color": "#bbbbbb",
   "emoji": "🍳"
  },
  "Fridge": {
   "cat": "Kitchen",
   "w": 1,
   "d": 1,
   "price": 320000,
   "stars": 3,
   "kind": "fridge",
   "color": "#dfe6ee",
   "emoji": "🧊"
  },
  "Dining Table": {
   "cat": "Kitchen",
   "w": 2,
   "d": 1,
   "price": 14000,
   "stars": 2,
   "kind": "table",
   "color": "#c9a572",
   "emoji": "🍽️"
  },
  "Bucket Set": {
   "cat": "Bath",
   "w": 1,
   "d": 1,
   "price": 2000,
   "stars": 1,
   "kind": "bucket",
   "color": "#2f6fd8",
   "emoji": "🪣"
  },
  "Barrel": {
   "cat": "Bath",
   "w": 1,
   "d": 1,
   "price": 4500,
   "stars": 1,
   "kind": "barrel",
   "color": "#1f4aa0",
   "emoji": "🛢️"
  },
  "Water Closet": {
   "cat": "Bath",
   "w": 1,
   "d": 1,
   "price": 70000,
   "stars": 2,
   "kind": "toilet",
   "color": "#e8ecf0",
   "emoji": "🚽"
  },
  "Shower": {
   "cat": "Bath",
   "w": 1,
   "d": 1,
   "price": 40000,
   "stars": 2,
   "kind": "shower",
   "color": "#99cccc",
   "emoji": "🚿"
  },
  "Plastic Chair": {
   "cat": "Comfort",
   "w": 1,
   "d": 1,
   "price": 500,
   "stars": 0,
   "kind": "chair",
   "color": "#d0243a",
   "emoji": "🪑"
  },
  "Side Table": {
   "cat": "Comfort",
   "w": 1,
   "d": 1,
   "price": 3500,
   "stars": 1,
   "kind": "stool",
   "color": "#d2b48c",
   "emoji": "🪵"
  },
  "Lounge Armchair": {
   "cat": "Comfort",
   "w": 1,
   "d": 1,
   "price": 6000,
   "stars": 2,
   "kind": "armchair",
   "color": "#e0c25a",
   "emoji": "🛋️"
  },
  "Velvet Sofa": {
   "cat": "Comfort",
   "w": 2,
   "d": 1,
   "price": 10200,
   "stars": 2,
   "kind": "sofa",
   "color": "#1f8a64",
   "emoji": "🛋️"
  },
  "3-Seater Family Sofa": {
   "cat": "Comfort",
   "w": 3,
   "d": 1,
   "price": 24000,
   "stars": 3,
   "kind": "sofa",
   "color": "#c97b4a",
   "emoji": "🛋️"
  },
  "Italian Leather Sofa": {
   "cat": "Comfort",
   "w": 2,
   "d": 1,
   "price": 48000,
   "stars": 3,
   "kind": "sofa",
   "color": "#16161a",
   "emoji": "🛋️"
  },
  "Royal Gold Sofa": {
   "cat": "Comfort",
   "w": 2,
   "d": 1,
   "price": 96000,
   "stars": 4,
   "kind": "sofa",
   "color": "#7a1424",
   "emoji": "🛋️"
  },
  "Gen Set": {
   "cat": "Power",
   "w": 1,
   "d": 1,
   "price": 180000,
   "stars": 3,
   "kind": "genset",
   "color": "#dd9944",
   "emoji": "⚡",
   "backup": "gen"
  },
  "Solar Inverter Kit": {
   "cat": "Power",
   "w": 1,
   "d": 1,
   "price": 650000,
   "stars": 4,
   "kind": "solar",
   "color": "#1f3a6b",
   "emoji": "☀️",
   "backup": "solar"
  },
  "Bunk Bed": {
   "cat": "Sleep",
   "w": 2,
   "d": 1,
   "price": 95000,
   "stars": 2,
   "kind": "bunk",
   "color": "#7a5a3a",
   "emoji": "🛏️"
  },
  "Wardrobe": {
   "cat": "Sleep",
   "w": 2,
   "d": 1,
   "price": 140000,
   "stars": 2,
   "kind": "wardrobe",
   "color": "#6b4a2f",
   "emoji": "🚪"
  },
  "Microwave": {
   "cat": "Kitchen",
   "w": 1,
   "d": 1,
   "price": 65000,
   "stars": 2,
   "kind": "microwave",
   "color": "#d9d9de",
   "emoji": "🍲"
  },
  "Deep Freezer": {
   "cat": "Kitchen",
   "w": 2,
   "d": 1,
   "price": 210000,
   "stars": 3,
   "kind": "freezer",
   "color": "#eef0f4",
   "emoji": "🧊"
  },
  "Kitchen Island": {
   "cat": "Kitchen",
   "w": 2,
   "d": 1,
   "price": 185000,
   "stars": 3,
   "kind": "island",
   "color": "#8a8f99",
   "emoji": "🍳"
  },
  "Dining Set": {
   "cat": "Kitchen",
   "w": 3,
   "d": 2,
   "price": 320000,
   "stars": 3,
   "kind": "diningset",
   "color": "#7a5a3a",
   "emoji": "🍽️"
  },
  "Gas Cylinder": {
   "cat": "Kitchen",
   "w": 1,
   "d": 1,
   "price": 38000,
   "stars": 1,
   "kind": "cylinder",
   "color": "#d33a2e",
   "emoji": "🧯"
  },
  "Washing Machine": {
   "cat": "Bath",
   "w": 1,
   "d": 1,
   "price": 280000,
   "stars": 3,
   "kind": "washer",
   "color": "#f1f2f5",
   "emoji": "🧺"
  },
  "Bathtub": {
   "cat": "Bath",
   "w": 2,
   "d": 1,
   "price": 360000,
   "stars": 4,
   "kind": "bathtub",
   "color": "#f4f5f7",
   "emoji": "🛁"
  },
  "Coffee Table": {
   "cat": "Comfort",
   "w": 1,
   "d": 1,
   "price": 42000,
   "stars": 1,
   "kind": "coffee",
   "color": "#8a6a45",
   "emoji": "☕"
  },
  "TV Stand": {
   "cat": "Comfort",
   "w": 2,
   "d": 1,
   "price": 230000,
   "stars": 3,
   "kind": "tvstand",
   "color": "#3a3f4a",
   "emoji": "📺"
  },
  "Bookshelf": {
   "cat": "Comfort",
   "w": 1,
   "d": 1,
   "price": 78000,
   "stars": 2,
   "kind": "bookshelf",
   "color": "#7a5a3a",
   "emoji": "📚"
  },
  "Desk & Computer": {
   "cat": "Comfort",
   "w": 2,
   "d": 1,
   "price": 260000,
   "stars": 3,
   "kind": "desk",
   "color": "#a9835a",
   "emoji": "💻"
  },
  "Rug": {
   "cat": "Comfort",
   "w": 2,
   "d": 2,
   "price": 55000,
   "stars": 1,
   "kind": "rug",
   "color": "#b04a3a",
   "emoji": "🟥"
  },
  "Indoor Plant": {
   "cat": "Comfort",
   "w": 1,
   "d": 1,
   "price": 18000,
   "stars": 1,
   "kind": "plant",
   "color": "#3f8f4f",
   "emoji": "🪴"
  },
  "Standing AC": {
   "cat": "Comfort",
   "w": 1,
   "d": 1,
   "price": 480000,
   "stars": 4,
   "kind": "ac",
   "color": "#f1f2f5",
   "emoji": "❄️"
  },
  "Treadmill": {
   "cat": "Comfort",
   "w": 1,
   "d": 2,
   "price": 390000,
   "stars": 3,
   "kind": "treadmill",
   "color": "#2d2f36",
   "emoji": "🏃"
  },
  "Grand Piano": {
   "cat": "Comfort",
   "w": 2,
   "d": 2,
   "price": 1800000,
   "stars": 5,
   "kind": "piano",
   "color": "#15161a",
   "emoji": "🎹"
  },
  "Inverter Battery": {
   "cat": "Power",
   "w": 1,
   "d": 1,
   "price": 300000,
   "stars": 3,
   "kind": "battery",
   "color": "#23252b",
   "emoji": "🔋",
   "backup": "inverter"
  },
  "Big Generator": {
   "cat": "Power",
   "w": 2,
   "d": 1,
   "price": 420000,
   "stars": 3,
   "kind": "biggen",
   "color": "#e8c21a",
   "emoji": "⚡",
   "backup": "gen"
  },
  "Water Tank": {
   "cat": "Power",
   "w": 2,
   "d": 2,
   "price": 220000,
   "stars": 3,
   "kind": "tank",
   "color": "#2b2e33",
   "emoji": "🛢️"
  },
  "Borehole Pump": {
   "cat": "Power",
   "w": 1,
   "d": 1,
   "price": 350000,
   "stars": 3,
   "kind": "pump",
   "color": "#2f6fb0",
   "emoji": "🚰"
  },
  "Kiosk": {
   "cat": "Outdoor",
   "w": 2,
   "d": 2,
   "price": 380000,
   "stars": 3,
   "kind": "kiosk",
   "color": "#e0b21e",
   "emoji": "🏪"
  },
  "Wheelbarrow Cart": {
   "cat": "Outdoor",
   "w": 2,
   "d": 1,
   "price": 45000,
   "stars": 1,
   "kind": "cart",
   "color": "#d9a62a",
   "emoji": "🛒"
  },
  "Bus Shelter": {
   "cat": "Outdoor",
   "w": 3,
   "d": 1,
   "price": 260000,
   "stars": 3,
   "kind": "shelter",
   "color": "#2e5fa8",
   "emoji": "🚏"
  },
  "Food Stall": {
   "cat": "Outdoor",
   "w": 2,
   "d": 2,
   "price": 320000,
   "stars": 3,
   "kind": "stall",
   "color": "#3566b8",
   "emoji": "🍲"
  },
  "Umbrella Table": {
   "cat": "Outdoor",
   "w": 2,
   "d": 2,
   "price": 85000,
   "stars": 2,
   "kind": "umbtable",
   "color": "#e8b52a",
   "emoji": "⛱️"
  },
  "Container Shop": {
   "cat": "Outdoor",
   "w": 4,
   "d": 2,
   "price": 900000,
   "stars": 4,
   "kind": "container",
   "color": "#2d5fa6",
   "emoji": "📦"
  },
  "Ice-Water Stand": {
   "cat": "Outdoor",
   "w": 2,
   "d": 1,
   "price": 120000,
   "stars": 2,
   "kind": "icestand",
   "color": "#2f6fd1",
   "emoji": "🧊"
  },
  "Dustbin": {
   "cat": "Outdoor",
   "w": 1,
   "d": 1,
   "price": 35000,
   "stars": 1,
   "kind": "dustbin",
   "color": "#3f7a4a",
   "emoji": "🗑️"
  },
  "Plastic Table & Chairs": {
   "cat": "Outdoor",
   "w": 2,
   "d": 2,
   "price": 28000,
   "stars": 1,
   "kind": "plasticset",
   "color": "#d33a2e",
   "emoji": "🪑"
  },
  "Tyre Stack": {
   "cat": "Outdoor",
   "w": 1,
   "d": 1,
   "price": 30000,
   "stars": 1,
   "kind": "tyres",
   "color": "#2b2b2e",
   "emoji": "🛞"
  },
  "Rusty Sedan": {
   "cat": "Cars",
   "w": 2,
   "d": 4,
   "price": 450000,
   "stars": 1,
   "kind": "car",
   "style": "rusty",
   "color": "#5b6b78",
   "emoji": "🚗",
   "garage": true
  },
  "Red Hatchback": {
   "cat": "Cars",
   "w": 2,
   "d": 4,
   "price": 2800000,
   "stars": 3,
   "kind": "car",
   "style": "hatch",
   "color": "#d4383d",
   "emoji": "🚗",
   "garage": true
  },
  "White Corolla": {
   "cat": "Cars",
   "w": 2,
   "d": 4,
   "price": 4200000,
   "stars": 3,
   "kind": "car",
   "style": "sedan",
   "color": "#f2f3f5",
   "emoji": "🚗",
   "garage": true
  },
  "Maroon Sedan": {
   "cat": "Cars",
   "w": 2,
   "d": 4,
   "price": 3400000,
   "stars": 3,
   "kind": "car",
   "style": "sedan",
   "color": "#8a1c2e",
   "emoji": "🚗",
   "garage": true
  },
  "Black SUV": {
   "cat": "Cars",
   "w": 2,
   "d": 4,
   "price": 8500000,
   "stars": 4,
   "kind": "car",
   "style": "suv",
   "color": "#1c1d21",
   "emoji": "🚙",
   "garage": true
  },
  "White Pickup": {
   "cat": "Cars",
   "w": 2,
   "d": 4,
   "price": 9000000,
   "stars": 4,
   "kind": "car",
   "style": "pickup",
   "color": "#f4f5f7",
   "emoji": "🛻",
   "garage": true
  },
  "White Prado": {
   "cat": "Cars",
   "w": 2,
   "d": 4,
   "price": 22000000,
   "stars": 5,
   "kind": "car",
   "style": "prado",
   "color": "#f6f6f8",
   "emoji": "🚙",
   "garage": true
  },
  "Container Truck": {
   "cat": "Cars",
   "w": 2,
   "d": 6,
   "price": 18000000,
   "stars": 4,
   "kind": "car",
   "style": "truck",
   "color": "#b2402f",
   "emoji": "🚛",
   "garage": true
  },
  "Pendant Light": {
   "cat": "Light",
   "w": 0,
   "d": 0,
   "price": 22000,
   "stars": 2,
   "kind": "pendant",
   "color": "#ffd9a0",
   "emoji": "💡",
   "fixed": true,
   "hang": true
  },
  "Ceiling Fan": {
   "cat": "Light",
   "w": 0,
   "d": 0,
   "price": 65000,
   "stars": 3,
   "kind": "fan",
   "color": "#d8c7a6",
   "emoji": "🌀",
   "fixed": true,
   "hang": true
  },
  "Chandelier": {
   "cat": "Light",
   "w": 0,
   "d": 0,
   "price": 180000,
   "stars": 4,
   "kind": "chandelier",
   "color": "#ffe3a3",
   "emoji": "🪔",
   "fixed": true,
   "hang": true
  },
  "Grand Staircase": {
   "cat": "Structure",
   "w": 2,
   "d": 3,
   "price": 400000,
   "stars": 4,
   "kind": "stairs",
   "color": "#8a6a45",
   "emoji": "🪜",
   "locked": true,
   "hidden": true,
   "stairs": true
  },
  "Arc Floor Lamp": {
   "cat": "Light",
   "w": 1,
   "d": 1,
   "price": 45000,
   "stars": 3,
   "kind": "stand",
   "color": "#2b2b33",
   "emoji": "🪔"
  },
  "Ceiling Bulb": {
   "cat": "Light",
   "w": 0,
   "d": 0,
   "price": 4000,
   "stars": 1,
   "kind": "ceiling",
   "color": "#ffe08a",
   "emoji": "💡",
   "fixed": true
  },
  "Wall Lamp": {
   "cat": "Light",
   "w": 0,
   "d": 0,
   "price": 6000,
   "stars": 1,
   "kind": "wall",
   "color": "#ffd166",
   "emoji": "🔦",
   "fixed": true
  },
  "Standing Lamp": {
   "cat": "Light",
   "w": 1,
   "d": 1,
   "price": 18000,
   "stars": 2,
   "kind": "stand",
   "color": "#f4b942",
   "emoji": "🕯️"
  }
 }
};
  const isItem = n => Object.prototype.hasOwnProperty.call(D.ITEMS, n);
  const sellPrice = n => isItem(n) ? Math.max(100, Math.floor(D.ITEMS[n].price * D.SELL_RATE / 100) * 100) : 0;
  const footprint = (n, rot) => { const it = D.ITEMS[n]; if (!it || it.fixed) return [0, 0]; return (((rot % 360) + 360) % 360) % 180 === 90 ? [it.d, it.w] : [it.w, it.d] };
  // grid = a number (square room) or a layout { w, d, blockedSet } for homes built from a 3D house model
  const gridW = g => (g && typeof g === 'object' ? g.w : g), gridD = g => (g && typeof g === 'object' ? g.d : g);
  const curGrid = () => { const st = typeof S !== 'undefined' ? S : null; return (st && st.layout) || (st && Number.isInteger(st.grid) && st.grid >= D.GRID ? st.grid : D.GRID) };   // S is a top-level const in app.js, so it is NOT on window   // the home being shown
  const inBounds = (x, z, w, d, grid) => { grid = grid || curGrid(); return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x + w <= gridW(grid) && z + d <= gridD(grid) };
  const cellsOf = it => { const [w, d] = footprint(it.name, it.rot); const o = []; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) o.push([it.x + i, it.z + j]); return o };
  const occupied = (items, skipId, grid) => { grid = grid || curGrid(); const s = new Set(grid && typeof grid === 'object' && grid.blockedSet ? grid.blockedSet : []); for (const it of items) { if (it.id === skipId || it.placed === false || !isItem(it.name) || D.ITEMS[it.name].fixed) continue; for (const [a, b] of cellsOf(it)) s.add(a + ',' + b) } return s };
  // cars (and anything with garage: true) only fit inside the home's Garage room
  const inGarage = (grid, x, z, w, d) => { const g = grid && typeof grid === 'object' && (grid.rooms || []).find(r => r.id === 'garage'); return !!g && x >= g.x0 && z >= g.z0 && x + w - 1 <= g.x1 && z + d - 1 <= g.z1 };
  const canPlace = (items, n, x, z, rot, skipId, grid) => { grid = grid || curGrid(); if (!isItem(n) || D.ITEMS[n].fixed) return false; const [w, d] = footprint(n, rot); if (!inBounds(x, z, w, d, grid)) return false; if (D.ITEMS[n].garage && !inGarage(grid, x, z, w, d)) return false; if (grid && typeof grid === 'object' && grid.noCross && window.BEDROOMS && BEDROOMS.crossesWall(grid.wallSet, x, z, w, d)) return false; const occ = occupied(items, skipId, grid); for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (occ.has((x + i) + ',' + (z + j))) return false; return true };
  const autoPlace = (items, n) => { const G = curGrid(); for (const rot of [0, 90]) { const [w, d] = footprint(n, rot); for (let z = 0; z + d <= gridD(G); z++) for (let x = 0; x + w <= gridW(G); x++) if (canPlace(items, n, x, z, rot, undefined, G)) return { x, z, rot } } return null };
  window.homeGrid = (p) => 6;   // the plain room is always 6x6 cells; bigger homes come from homeLayout below
  // A home's floor plan: the fixed plan of a house-model home (Family House, Market Shop), or the bedroom plan of a home
  // with bedrooms (shared generator in bedrooms.js, the same one the server uses), or null for the plain 6x6 room.
  window.homeLayout = (p, floor) => {
    if (!p) return null;
    if (window.LAYOUTS && window.LAYOUTS[p.type]) return window.LAYOUTS[p.type];
    const total = Number(p.totalBedrooms) || 0, G = window.BEDROOMS ? BEDROOMS.layout(total, { bath: !!p.bath, garage: !!p.garage, style: p.groundStyle }) : null;
    if (Number(floor) === 1 && p.upstairs && window.BEDROOMS) {         // upstairs: same footprint, opening where the staircase is, walls by the chosen style
      const st = (p.items || []).find(i => i.name === 'Grand Staircase' && i.placed !== false && !(Number(i.floor) > 0)), open = st ? cellsOf(st).map(c => c.join(',')) : [];
      const U = BEDROOMS.upper(G ? G.w : 6, G ? G.d : 6, p.upStyle, open); if (!U.blockedSet) { U.blockedSet = new Set(U.blocked); U.wallSet = new Set(U.walls) } return U;
    }
    if (!G) return null;
    if (!G.blockedSet) { G.blockedSet = new Set(G.blocked); G.wallSet = new Set(G.walls) }
    return G;
  };
  const onFloor = (items, f) => (items || []).filter(i => (Number(i.floor) || 0) === (Number(f) || 0));
  const isHang = n => isItem(n) && !!D.ITEMS[n].hang;
  // ceiling lights / fans hang at a cell: inside the room, not on a wall cell, nothing else hanging there
  const canHang = (items, n, x, z, skipId, grid) => { grid = grid || curGrid(); if (!isHang(n) || !inBounds(x, z, 1, 1, grid)) return false; if (grid && typeof grid === 'object' && grid.blockedSet && grid.blockedSet.has(x + ',' + z)) return false; return !items.some(i => i.id !== skipId && i.placed !== false && isHang(i.name) && i.x === x && i.z === z) };
  window.FURN = { onFloor, isHang, canHang, ...D, isItem, sellPrice, footprint, inBounds, cellsOf, occupied, canPlace, autoPlace };
})();
