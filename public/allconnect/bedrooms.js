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
  // ext = { bath: true } adds a back extension below the home: a small Toilet room (2x2) and an open back porch. The original
  // living area and bedrooms never move, so furniture placed before the renovation stays where it is.
  function layout(extraRaw, ext) {
    const k = clamp(extraRaw), bath = !!(ext && ext.bath); if (!k && !bath) return null;
    const ckey = k + (bath ? 'b' : ''); if (cache.has(ckey)) return cache.get(ckey);
    if (!k) { const walls = [], rooms = [], D = MAIN; addBath(walls, rooms, MAIN, D); const L0 = { id: 'bdb', bedrooms: 0, w: MAIN, d: D + 2, blocked: [], walls, start: [2, 2], model: null, fixtures: [], rooms, noCross: true }; cache.set(ckey, L0); return L0 }
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
    let dd = d; if (bath) { addBath(walls, rooms, w, d); dd = d + 2 }
    const L = { id: 'bd' + k + (bath ? 'b' : ''), bedrooms: k, w, d: dd, blocked: [], walls, start: [2, 2], model: null, fixtures: [], rooms, noCross: true };
    cache.set(ckey, L);
    return L;
  }
  // walls + room entry for the back extension strip (rows D and D+1 across the whole width)
  function addBath(walls, rooms, w, D) {
    walls.push(edge(1, D - 1, 1, D), edge(1, D, 2, D), edge(1, D + 1, 2, D + 1));         // the toilet room: door at the left, walls on its other sides
    for (let x = MAIN; x < w; x++) walls.push(edge(x, D - 1, x, D));                      // the bedroom wing keeps a wall along its south side
    rooms.push({ id: 'bath', name: 'Toilet', x0: 0, z0: D, x1: 1, z1: D + 1, door: [0, D - 1] });
  }

  /* ---------- upstairs floor ----------
     The upper floor has the same footprint as the ground floor (w x d). The staircase item downstairs leaves an opening
     (`open` = list of "x,z" cells) that is blocked upstairs. Three layout styles the owner can switch between:
       lounge = open plan, suites = two suites with a doorway between, rooms = four rooms around a landing. */
  const UP_STYLES = { lounge: 'Open lounge', suites: 'Two suites', rooms: 'Four rooms' };
  const upCache = new Map();
  function upper(w, d, style, open) {
    style = UP_STYLES[style] ? style : 'lounge'; open = (open || []).slice().sort();
    const key = [w, d, style, open.join(';')].join('|'); if (upCache.has(key)) return upCache.get(key);
    const walls = [], rooms = [], mx = Math.floor(w / 2), mz = Math.floor(d / 2);
    const vwall = (x0, doors) => { for (let z = 0; z < d; z++) if (!doors.includes(z)) walls.push(edge(x0 - 1, z, x0, z)) };     // wall between column x0-1 and x0
    const hwall = (z0, doors) => { for (let x = 0; x < w; x++) if (!doors.includes(x)) walls.push(edge(x, z0 - 1, x, z0)) };     // wall between row z0-1 and z0
    if (style === 'suites') { vwall(mx, [Math.floor(d / 2)]); rooms.push({ id: 'u1', name: 'Suite 1', x0: 0, z0: 0, x1: mx - 1, z1: d - 1 }, { id: 'u2', name: 'Suite 2', x0: mx, z0: 0, x1: w - 1, z1: d - 1 }) }
    if (style === 'rooms') {
      vwall(mx, [Math.floor(mz / 2), mz + Math.floor((d - mz) / 2)]); hwall(mz, [Math.floor(mx / 2), mx + Math.floor((w - mx) / 2)]);
      rooms.push({ id: 'u1', name: 'Room 1', x0: 0, z0: 0, x1: mx - 1, z1: mz - 1 }, { id: 'u2', name: 'Room 2', x0: mx, z0: 0, x1: w - 1, z1: mz - 1 }, { id: 'u3', name: 'Room 3', x0: 0, z0: mz, x1: mx - 1, z1: d - 1 }, { id: 'u4', name: 'Room 4', x0: mx, z0: mz, x1: w - 1, z1: d - 1 });
    }
    const L = { id: 'up-' + style + '-' + w + 'x' + d, floor: 1, upper: true, bedrooms: 0, w, d, blocked: open.slice(), walls, start: [0, 0], model: null, fixtures: [], rooms, noCross: true };
    upCache.set(key, L); return L;
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
  return { MAIN, ROOM_W, MAX_EXTRA, UP_STYLES, clamp, edge, layout, upper, crossesWall, label };
});
