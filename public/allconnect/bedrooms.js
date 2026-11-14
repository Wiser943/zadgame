/* Bedroom expansions for owned homes: one generator shared by the server (require) and the browser (window.BEDROOMS),
   so both sides always agree on the floor plan.

   A home always keeps its original 6x6 living area at the top-left, so furniture placed before an expansion never moves.
   Each added bedroom is a walled room built on a wing to the east, with a doorway into the living area:
     1 bedroom  -> 10 x 6      2 bedrooms -> 10 x 6      3 bedrooms -> 10 x 9
     4 bedrooms -> 14 x 9      5 bedrooms -> 14 x 9
   Cells are { x: 0..w-1, z: 0..d-1 }. A wall is a pair of neighbouring cells you cannot walk between ("x,z|x,z", the
   smaller cell first), the same format as the Family House floor plan. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BEDROOMS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAIN = 6, ROOM_W = 4, MAX_EXTRA = 5;
  const cache = new Map();
  const clamp = (n) => { n = Number(n); return Number.isInteger(n) ? Math.max(0, Math.min(MAX_EXTRA, n)) : 0; };
  const edge = (ax, az, bx, bz) => (ax < bx || (ax === bx && az < bz)) ? `${ax},${az}|${bx},${bz}` : `${bx},${bz}|${ax},${az}`;
  const bands = (n, d) => { const out = []; for (let i = 0; i < n; i++) out.push([Math.round(d * i / n), Math.round(d * (i + 1) / n)]); return out; };

  // Build the plan for `extra` added bedrooms (0 = the original 6x6 room, no layout object).
  function layout(extraRaw) {
    const k = clamp(extraRaw); if (!k) return null;
    if (cache.has(k)) return cache.get(k);
    const d = k <= 2 ? MAIN : 9, cols = k <= 3 ? 1 : 2, w = MAIN + ROOM_W * cols;
    const counts = cols === 1 ? [k] : [3, k - 3];
    const rooms = [], walls = [];
    let n = 0;
    for (let c = 0; c < cols; c++) {
      const x0 = MAIN + ROOM_W * c, x1 = x0 + ROOM_W - 1, bs = bands(counts[c], d);
      const wallX = x0 - 1;                                     // the line between this column and whatever is west of it
      const doors = new Set();
      for (const [z0, z1] of bs) {
        n++;
        const doorZ = z0 + Math.floor((z1 - z0 - 1) / 2);
        doors.add(doorZ);
        rooms.push({ id: 'b' + n, name: 'Bedroom ' + n, x0, z0, x1, z1: z1 - 1, door: [wallX, doorZ] });
      }
      for (let z = 0; z < d; z++) if (!doors.has(z)) walls.push(edge(wallX, z, wallX + 1, z));
      for (const [z0] of bs) if (z0 > 0) for (let x = x0; x <= x1; x++) walls.push(edge(x, z0 - 1, x, z0));
    }
    const L = { id: 'bd' + k, bedrooms: k, w, d, blocked: [], walls, start: [2, 2], model: null, fixtures: [], rooms, noCross: true };
    cache.set(k, L);
    return L;
  }

  // Can a w x d footprint at (x, z) sit without straddling a wall? `walls` is a Set or an array of edge strings.
  function crossesWall(walls, x, z, w, d) {
    if (!walls) return false;
    const has = walls.has ? (e) => walls.has(e) : (e) => walls.includes(e);
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
      if (i + 1 < w && has(edge(x + i, z + j, x + i + 1, z + j))) return true;
      if (j + 1 < d && has(edge(x + i, z + j, x + i, z + j + 1))) return true;
    }
    return false;
  }

  // "Studio", "1-Bedroom", "2-Bedroom" ...
  const label = (total) => (Number(total) > 0 ? `${total}-Bedroom` : 'Studio');
  return { MAIN, ROOM_W, MAX_EXTRA, clamp, edge, layout, crossesWall, label };
});
