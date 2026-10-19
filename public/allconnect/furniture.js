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
  "Light"
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
  "Gen Set": {
   "cat": "Kitchen",
   "w": 1,
   "d": 1,
   "price": 180000,
   "stars": 3,
   "kind": "genset",
   "color": "#dd9944",
   "emoji": "⚡"
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
  const inBounds = (x, z, w, d) => Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x + w <= D.GRID && z + d <= D.GRID;
  const cellsOf = it => { const [w, d] = footprint(it.name, it.rot); const o = []; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) o.push([it.x + i, it.z + j]); return o };
  const occupied = (items, skipId) => { const s = new Set(); for (const it of items) { if (it.id === skipId || it.placed === false || !isItem(it.name) || D.ITEMS[it.name].fixed) continue; for (const [a, b] of cellsOf(it)) s.add(a + ',' + b) } return s };
  const canPlace = (items, n, x, z, rot, skipId) => { if (!isItem(n) || D.ITEMS[n].fixed) return false; const [w, d] = footprint(n, rot); if (!inBounds(x, z, w, d)) return false; const occ = occupied(items, skipId); for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (occ.has((x + i) + ',' + (z + j))) return false; return true };
  const autoPlace = (items, n) => { for (const rot of [0, 90]) { const [w, d] = footprint(n, rot); for (let z = 0; z + d <= D.GRID; z++) for (let x = 0; x + w <= D.GRID; x++) if (canPlace(items, n, x, z, rot)) return { x, z, rot } } return null };
  window.FURN = { ...D, isItem, sellPrice, footprint, inBounds, cellsOf, occupied, canPlace, autoPlace };
})();
