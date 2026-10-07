// Writes public/allconnect/furniture.js (browser copy of utils/furniture.js). Run: node scripts/gen-furniture.js
const F = require('../utils/furniture'); const fs = require('fs');
const data = JSON.stringify({ GRID: F.GRID, SELL_RATE: F.SELL_RATE, CATS: F.CATS, ITEMS: F.ITEMS }, null, 1);
fs.writeFileSync(__dirname + '/../public/allconnect/furniture.js', `/* GENERATED from utils/furniture.js by scripts/gen-furniture.js - do not edit by hand. Same rules as the server. */
(function () {
  const D = ${data};
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
`);
