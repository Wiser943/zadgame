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

  // Build the plan for `extra` added bedrooms (0 = the original 6x6 room).
  // ext = { bath, garage, style }:  bath = a back extension below the home (a Toilet room + open porch); garage = a 3-row Garage strip along the
  // bottom; style = how the 6x6 living area is divided ('open' | 'split' | 'rooms'). Extensions only ever ADD space below the original plan and the
  // original living area / bedrooms never move, so furniture placed before a renovation stays where it is (the server stores whatever a new wall cuts).
  const STYLES = { open: 'Open plan', split: 'Lounge + kitchen', rooms: 'Lounge, kitchen + dining' };
  function layout(extraRaw, ext) {
    const k = clamp(extraRaw), bath = !!(ext && ext.bath), garage = !!(ext && ext.garage), style = ext && STYLES[ext.style] ? ext.style : 'open';
    if (!k && !bath && !garage && style === 'open') return null;
    const ckey = [k, bath ? 'b' : '', garage ? 'g' : '', style].join('|'); if (cache.has(ckey)) return cache.get(ckey);
    let w = MAIN, d = MAIN; const rooms = [], walls = [];
    if (k) {
      d = k <= 2 ? MAIN : 9; const cols = k <= 3 ? 1 : 2; w = MAIN + ROOM_W * cols;
      const counts = cols === 1 ? [k] : [3, k - 3];
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
    }
    if (style !== 'open') addStyle(walls, rooms, style);
    let dd = d;
    if (bath) { addBath(walls, rooms, w, d); dd = d + 2 }
    if (garage) { addGarage(walls, rooms, w, dd); dd += 3 }
    const L = { id: 'bd' + ckey.replace(/\|/g, ''), bedrooms: k, w, d: dd, blocked: [], walls, start: [2, 2], model: null, fixtures: [], rooms, noCross: true };
    cache.set(ckey, L);
    return L;
  }
  // dividing walls inside the original 6x6 living area (doorways keep every part reachable)
  function addStyle(walls, rooms, style) {
    for (let z = 0; z < MAIN; z++) if (z !== 2 && z !== 3) walls.push(edge(2, z, 3, z));                 // lounge | rest, with a 2-wide doorway
    rooms.push({ id: 'lv1', name: 'Lounge', x0: 0, z0: 0, x1: 2, z1: MAIN - 1, door: [2, 2] });
    if (style === 'split') { rooms.push({ id: 'lv2', name: 'Kitchen', x0: 3, z0: 0, x1: MAIN - 1, z1: MAIN - 1, door: [3, 2] }); return }
    for (let x = 3; x < MAIN; x++) if (x !== 4) walls.push(edge(x, 2, x, 3));                           // kitchen above, dining below, doorway at x = 4
    rooms.push({ id: 'lv2', name: 'Kitchen', x0: 3, z0: 0, x1: MAIN - 1, z1: 2, door: [3, 1] }, { id: 'lv3', name: 'Dining', x0: 3, z0: 3, x1: MAIN - 1, z1: MAIN - 1, door: [3, 3] });
  }
  // walls + room entry for the back extension strip (rows D and D+1 across the whole width)
  function addBath(walls, rooms, w, D) {
    walls.push(edge(1, D - 1, 1, D), edge(1, D, 2, D), edge(1, D + 1, 2, D + 1));         // the toilet room: door at the left, walls on its other sides
    for (let x = MAIN; x < w; x++) walls.push(edge(x, D - 1, x, D));                      // the bedroom wing keeps a wall along its south side
    rooms.push({ id: 'bath', name: 'Toilet', x0: 0, z0: D, x1: 1, z1: D + 1, door: [0, D - 1] });
  }
  // the Garage: three rows along the whole bottom of the home, one door into the house at x = 3
  function addGarage(walls, rooms, w, G) {
    for (let x = 0; x < w; x++) if (x !== 3) walls.push(edge(x, G - 1, x, G));
    rooms.push({ id: 'garage', name: 'Garage', x0: 0, z0: G, x1: w - 1, z1: G + 2, door: [3, G - 1] });
  }

  /* ---------- upstairs floor ----------
     The upper floor has the same footprint as the ground floor (w x d). The staircase item downstairs leaves an opening
     (`open` = list of "x,z" cells) that is blocked upstairs. Three layout styles the owner can switch between:
       lounge = open plan, suites = two suites with a doorway between, rooms = four rooms around a landing. */
  const UP_STYLES = { lounge: 'Open lounge', suites: 'Two suites', rooms: 'Four rooms', terrace: 'Roof terrace' };
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
    const L = { id: 'up-' + style + '-' + w + 'x' + d, floor: 1, upper: true, terrace: style === 'terrace', bedrooms: 0, w, d, blocked: open.slice(), walls, start: [0, 0], model: null, fixtures: [], rooms, noCross: true };
    upCache.set(key, L); return L;
  }

  /* ---------- the yard (floor 2): an open compound outside the house for trucks, kiosks, stalls, cars, pools ... ---------- */
  const yardCache = new Map();
  function yard(w, d) {
    w = w || 12; d = d || 9; const key = w + 'x' + d; if (yardCache.has(key)) return yardCache.get(key);
    const L = { id: 'yard-' + key, floor: 2, yard: true, bedrooms: 0, w, d, blocked: [], walls: [], start: [Math.floor(w / 2), 1], model: null, fixtures: [], rooms: [], noCross: true };
    yardCache.set(key, L); return L;
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
  return { MAIN, ROOM_W, MAX_EXTRA, STYLES, UP_STYLES, clamp, edge, layout, upper, yard, crossesWall, label };
});
