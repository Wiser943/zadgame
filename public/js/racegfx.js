/* Drive Race: the 3D look. Builds a circuit (terrain, road, sea, sky, scenery), the karts and drivers, and the effects.
   Everything is made from simple shapes and canvas-drawn textures, so there is nothing to download. */
const RACEGFX = (() => {
  'use strict';
  const { Builder, M, hex, mix, shade } = GL3D;
  const RT = RaceTrack;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- textures drawn in the browser ---------- */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function noiseTile(ctx, w, h, rnd, base, spread, n, size) { ctx.fillStyle = base; ctx.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { const v = (rnd() - .5) * spread; ctx.fillStyle = `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${Math.abs(v)})`; const s = size * (.5 + rnd()); ctx.fillRect(rnd() * w, rnd() * h, s, s); } }
  function cobble(rnd, tone) {
    const c = canvas(256, 256), x = c.getContext('2d'); x.fillStyle = '#5b4a38'; x.fillRect(0, 0, 256, 256);
    const rows = 8, rh = 256 / rows;
    for (let r = 0; r < rows; r++) { let px = -((r % 2) * 18) - rnd() * 10; while (px < 256) { const w = 28 + rnd() * 20, hh = rh - 3 - rnd() * 3, g = 150 + rnd() * 60 | 0, t = tone;
      x.fillStyle = `rgb(${g + t[0]},${g * .9 + t[1] | 0},${g * .72 + t[2] | 0})`; x.beginPath(); const rx = px + 2, ry = r * rh + 1.5; const rr = 7; x.moveTo(rx + rr, ry); x.lineTo(rx + w - rr, ry); x.quadraticCurveTo(rx + w, ry, rx + w, ry + rr); x.lineTo(rx + w, ry + hh - rr); x.quadraticCurveTo(rx + w, ry + hh, rx + w - rr, ry + hh); x.lineTo(rx + rr, ry + hh); x.quadraticCurveTo(rx, ry + hh, rx, ry + hh - rr); x.lineTo(rx, ry + rr); x.quadraticCurveTo(rx, ry, rx + rr, ry); x.fill();
      x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(rx + 3, ry + 2, w * .5, 3); x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(rx + 3, ry + hh - 5, w - 6, 3); px += w + 3; } }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(80,110,50,${.05 + rnd() * .08})`; x.fillRect(rnd() * 256, rnd() * 256, 10 + rnd() * 24, 4 + rnd() * 8); }
    return c;
  }
  function slabs(rnd) {
    const c = canvas(256, 256), x = c.getContext('2d'); x.fillStyle = '#6f7770'; x.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 4; r++) for (let q = 0; q < 2; q++) { const g = 135 + rnd() * 30 | 0; x.fillStyle = `rgb(${g - 6},${g},${g - 10})`; x.fillRect(q * 128 + 3, r * 64 + 3, 122, 58); x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(q * 128 + 5, r * 64 + 5, 118, 4); }
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(70,100,60,${rnd() * .12})`; x.fillRect(rnd() * 256, rnd() * 256, 6 + rnd() * 18, 3 + rnd() * 6); }
    return c;
  }
  function sand(rnd) {
    const c = canvas(256, 256), x = c.getContext('2d'); noiseTile(x, 256, 256, rnd, '#e2c791', .35, 1800, 3);
    for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(120,80,40,.10)'; x.fillRect(rnd() * 256, 0, 6 + rnd() * 10, 256); }
    for (let i = 0; i < 90; i++) { x.fillStyle = 'rgba(255,255,240,.18)'; x.fillRect(rnd() * 256, rnd() * 256, 2, 1); }
    return c;
  }
  function dirt(rnd) { const c = canvas(256, 256), x = c.getContext('2d'); noiseTile(x, 256, 256, rnd, '#9b7a55', .4, 2400, 3); for (let i = 0; i < 26; i++) { x.strokeStyle = 'rgba(60,40,20,.25)'; x.lineWidth = 1; x.beginPath(); let px = rnd() * 256, py = rnd() * 256; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rnd() - .5) * 40; py += (rnd() - .5) * 40; x.lineTo(px, py); } x.stroke(); } return c; }
  function detail(rnd) { const c = canvas(256, 256), x = c.getContext('2d'); noiseTile(x, 256, 256, rnd, '#c8c8c8', .5, 3600, 4); for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${rnd() * .25})`; x.fillRect(rnd() * 256, rnd() * 256, 1, 3 + rnd() * 5); } return c; }
  function rockTex(rnd) { const c = canvas(256, 256), x = c.getContext('2d'); noiseTile(x, 256, 256, rnd, '#8e949c', .5, 2600, 5); for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(30,35,40,${.15 + rnd() * .2})`; x.lineWidth = 1.5; x.beginPath(); let px = rnd() * 256, py = rnd() * 256; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (rnd() - .5) * 50; py += (rnd() - .3) * 40; x.lineTo(px, py); } x.stroke(); } for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(80,120,50,.10)'; x.fillRect(rnd() * 256, rnd() * 256, 10 + rnd() * 30, 6 + rnd() * 10); } return c; }
  function wallTex(rnd) {
    const c = canvas(256, 128), x = c.getContext('2d'); x.fillStyle = '#4e4a42'; x.fillRect(0, 0, 256, 128);
    for (let r = 0; r < 4; r++) { let px = -rnd() * 30; while (px < 256) { const w = 36 + rnd() * 40, g = 120 + rnd() * 50 | 0; x.fillStyle = `rgb(${g},${g - 6},${g - 16})`; x.beginPath(); const rx = px + 2, ry = r * 32 + 2, rr = 6; x.moveTo(rx + rr, ry); x.lineTo(rx + w - rr, ry); x.quadraticCurveTo(rx + w, ry, rx + w, ry + rr); x.lineTo(rx + w, ry + 28 - rr); x.quadraticCurveTo(rx + w, ry + 28, rx + w - rr, ry + 28); x.lineTo(rx + rr, ry + 28); x.quadraticCurveTo(rx, ry + 28, rx, ry + 28 - rr); x.lineTo(rx, ry + rr); x.quadraticCurveTo(rx, ry, rx + rr, ry); x.fill(); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(rx + 4, ry + 3, w * .6, 3); px += w + 3; } }
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(70,110,40,${.08 + rnd() * .1})`; x.fillRect(rnd() * 256, rnd() * 128, 12 + rnd() * 30, 5 + rnd() * 10); }
    return c;
  }
  function waterTex(rnd) {
    const c = canvas(256, 256), x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(120,190,220,${.18 + rnd() * .25})`; x.lineWidth = 2 + rnd() * 3; x.beginPath(); const px = rnd() * 256, py = rnd() * 256, w = 18 + rnd() * 40; x.moveTo(px, py); x.bezierCurveTo(px + w * .3, py - 6, px + w * .7, py + 6, px + w, py); x.stroke(); x.moveTo(px - 256, py); x.bezierCurveTo(px - 256 + w * .3, py - 6, px - 256 + w * .7, py + 6, px - 256 + w, py); x.stroke(); }
    for (let i = 0; i < 80; i++) { x.fillStyle = `rgba(255,255,255,${.4 + rnd() * .4})`; x.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 5, 1 + rnd() * 2); }
    return c;
  }
  function roofTex(rnd) { const c = canvas(128, 128), x = c.getContext('2d'); x.fillStyle = '#b4532f'; x.fillRect(0, 0, 128, 128); for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) { const o = (r % 2) * 8, g = rnd() * 40 - 20; x.fillStyle = `rgb(${190 + g | 0},${86 + g | 0},${50 + g | 0})`; x.beginPath(); x.arc(q * 16 + o + 8, r * 16 + 6, 8.5, 0, Math.PI); x.fill(); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(q * 16 + o, r * 16 + 13, 16, 3); } return c; }
  function plaster(rnd) { const c = canvas(128, 128), x = c.getContext('2d'); noiseTile(x, 128, 128, rnd, '#f2efe6', .25, 700, 3); for (let i = 0; i < 12; i++) { x.strokeStyle = 'rgba(80,60,50,.18)'; x.lineWidth = 1; x.beginPath(); let px = rnd() * 128, py = rnd() * 128; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rnd() - .5) * 24; py += rnd() * 18; x.lineTo(px, py); } x.stroke(); } return c; }
  function checker() { const c = canvas(128, 128), x = c.getContext('2d'); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#101018' : '#f7f7f7'; x.fillRect(i * 16, j * 16, 16, 16); } return c; }
  function flames() {
    const c = canvas(128, 128), x = c.getContext('2d'); x.fillStyle = '#d8281f'; x.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 7; k++) { const px = 10 + k * 18; x.fillStyle = '#ff9a1f'; x.beginPath(); x.moveTo(px - 9, 128); x.quadraticCurveTo(px - 6, 80, px, 50 + (k % 2) * 14); x.quadraticCurveTo(px + 6, 80, px + 9, 128); x.fill(); x.fillStyle = '#ffd84a'; x.beginPath(); x.moveTo(px - 4, 128); x.quadraticCurveTo(px - 2, 96, px, 80 + (k % 2) * 10); x.quadraticCurveTo(px + 2, 96, px + 4, 128); x.fill(); }
    return c;
  }
  function soft(col, size = 64) { const c = canvas(size, size), x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); g.addColorStop(0, col.replace('A', '1')); g.addColorStop(.5, col.replace('A', '.5')); g.addColorStop(1, col.replace('A', '0')); x.fillStyle = g; x.fillRect(0, 0, size, size); return c; }
  function bubbleTex() {
    const c = canvas(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 10, 64, 64, 62); g.addColorStop(0, 'rgba(255,170,230,.35)'); g.addColorStop(.75, 'rgba(255,120,220,.45)'); g.addColorStop(1, 'rgba(255,200,255,.9)'); x.fillStyle = g; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(44, 40, 16, 9, -.6, 0, 7); x.fill();
    x.font = '900 78px "Lilita One","Luckiest Guy",Impact,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 9; x.strokeStyle = '#8a3a00'; x.strokeText('?', 64, 70); x.fillStyle = '#ffd23f'; x.fillText('?', 64, 70); return c;
  }
  function cloudTex(rnd) { const c = canvas(256, 128), x = c.getContext('2d'); for (let i = 0; i < 14; i++) { const px = 40 + rnd() * 176, py = 64 + (rnd() - .4) * 30, r = 22 + rnd() * 26, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); } return c; }
  function chevron() { const c = canvas(128, 128), x = c.getContext('2d'); x.fillStyle = '#ff9d00'; x.fillRect(0, 0, 128, 128); for (let k = 0; k < 3; k++) { x.fillStyle = '#fff3a0'; x.beginPath(); x.moveTo(14, 112 - k * 36); x.lineTo(64, 78 - k * 36); x.lineTo(114, 112 - k * 36); x.lineTo(114, 92 - k * 36); x.lineTo(64, 58 - k * 36); x.lineTo(14, 92 - k * 36); x.closePath(); x.fill(); } return c; }

  /* ---------- value noise for terrain ---------- */
  function noise2(seed) {
    const h = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    const f = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return lerp(lerp(h(xi, yi), h(xi + 1, yi), sx), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), sx), sy); };
    return (x, y) => f(x, y) * .55 + f(x * 2.1, y * 2.1) * .3 + f(x * 4.3, y * 4.3) * .15;
  }

  /* ---------- the palette per circuit ---------- */
  const THEME = {
    harbor: { sky: ['#4f9fe6', '#cfe6fb'], fog: '#d6e8f7', sun: [.45, .8, .3], land: '#6fb04a', hill: '#5f9a45', sand: '#e8d29a', rock: '#8b9097', roadTex: 'cobble', road: '#d9c8a8', walls: true, sea: true },
    beach: { sky: ['#3f93e8', '#c6e6fb'], fog: '#cfe7f8', sun: [.5, .75, .2], land: '#79b84e', hill: '#58963f', sand: '#efd79d', rock: '#8a8e94', roadTex: 'sand', road: '#e8cf98', walls: false, sea: true },
    market: { sky: ['#5ba7ea', '#e6dfc8'], fog: '#e2e3d2', sun: [.3, .85, .4], land: '#8ab04f', hill: '#7f9d4a', sand: '#c9a26a', rock: '#8b8678', roadTex: 'dirt', road: '#b48e62', walls: false, sea: false }
  };

  /* ================= the circuit scene ================= */
  function buildTrack(r, id, quality = 1) {
    const T = RT.build(id), th = THEME[T.theme], rnd = RT.rng(T.def.seed * 7 + 3), nz = noise2(T.def.seed), segs = T.segs, N = T.n, ROAD = T.ROAD;
    const S = { T, th, id, tex: {}, meshes: [], dyn: {} };
    const tx = S.tex; const tr = RT.rng(5);
    tx.cobble = r.texture(cobble(tr, T.theme === 'harbor' ? [20, 8, -6] : [0, 0, 0])); tx.slabs = r.texture(slabs(tr)); tx.sand = r.texture(sand(tr)); tx.dirt = r.texture(dirt(tr)); tx.detail = r.texture(detail(tr)); tx.rock = r.texture(rockTex(tr)); tx.wall = r.texture(wallTex(tr)); tx.water = r.texture(waterTex(tr));
    tx.roof = r.texture(roofTex(tr)); tx.plaster = r.texture(plaster(tr)); tx.check = r.texture(checker()); tx.flames = r.texture(flames()); tx.chev = r.texture(chevron()); tx.cloud = r.texture(cloudTex(tr), { clamp: true });
    tx.bubble = r.texture(bubbleTex(), { clamp: true }); tx.glow = r.texture(soft('rgba(255,200,80,A)'), { clamp: true }); tx.puff = r.texture(soft('rgba(235,225,205,A)'), { clamp: true }); tx.shadow = r.texture(soft('rgba(0,0,0,A)'), { clamp: true }); tx.spark = r.texture(soft('rgba(255,255,255,A)', 32), { clamp: true });
    // the lowest and highest the road goes, the middle of the loop
    let yMin = 1e9, yMax = -1e9, cx = 0, cz = 0; for (const s of segs) { yMin = Math.min(yMin, s.y); yMax = Math.max(yMax, s.y); cx += s.x; cz += s.z; } cx /= N; cz /= N;
    const seaY = th.sea ? yMin - (T.theme === 'beach' ? 1100 : 2400) : yMin - 6000; S.seaY = seaY; S.centre = [cx, cz];
    // nearest road point for any spot: a grid of road samples
    const CELL = 6000, grid = new Map(), key = (a, b) => a * 100003 + b;
    for (let i = 0; i < N; i += 2) { const s = segs[i], k = key(Math.floor(s.x / CELL), Math.floor(s.z / CELL)); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
    const near = (x, z) => { let bi = -1, bd = 1e18; const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL); for (let R = 0; R <= 7 && bi < 0; R++) for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { if (Math.max(Math.abs(a), Math.abs(b)) !== R) continue; const l = grid.get(key(gx + a, gz + b)); if (!l) continue; for (const i of l) { const s = segs[i], d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z); if (d < bd) { bd = d; bi = i; } } } if (bi < 0) return { i: 0, d: 1e9, side: 0, outer: false }; const s = segs[bi], dx = x - s.x, dz = z - s.z; return { i: bi, d: Math.sqrt(bd), side: Math.sign(dx * s.rx + dz * s.rz), outer: dx * (s.x - cx) + dz * (s.z - cz) > 0 }; };
    S.near = near;
    // ----- terrain: flat beside the road, then the sea on one side and hills on the other
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; for (const s of segs) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
    const margin = 52000, CS = Math.round(1700 / Math.sqrt(quality)), x0 = Math.floor((minX - margin) / CS) * CS, z0 = Math.floor((minZ - margin) / CS) * CS, nx = Math.ceil((maxX + margin - x0) / CS), nzc = Math.ceil((maxZ + margin - z0) / CS);
    const H = new Float32Array((nx + 1) * (nzc + 1)), D = new Float32Array((nx + 1) * (nzc + 1)), O = new Uint8Array((nx + 1) * (nzc + 1));
    const edge = ROAD + 1800;
    for (let j = 0; j <= nzc; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * CS, z = z0 + j * CS, n = near(x, z), s = segs[n.i], d = n.d, k = j * (nx + 1) + i; D[k] = d;
      const sea = th.sea && n.outer, w = smooth(edge, edge + (sea ? 16000 : 26000), d);
      let y;
      if (sea) y = lerp(s.y - 140, seaY - 3200 - nz(x / 9000, z / 9000) * 1800, w) + (d > edge + 3000 ? 0 : 0);
      else { const amp = (T.theme === 'beach' ? 9000 : T.theme === 'market' ? 8000 : 15000), bump = nz(x / 14000 + 5, z / 14000 + 9), ridge = Math.pow(nz(x / 30000 + 2, z / 30000 + 7), 1.6); y = lerp(s.y - 140, s.y + (bump - .35) * 5200 + ridge * amp, w * w); }
      H[k] = y; O[k] = sea ? 1 : 0;
    }
    const tb = new Builder(); const col = (hh, sl, d, o, x, z) => {
      const sandA = smooth(seaY + 2400, seaY + 700, hh), rockA = clamp(sl * 3.2 - .55, 0, 1), roadA = 1 - smooth(edge - 800, edge + 1800, d);
      let c = mix(hex(th.land), hex(th.hill), clamp((hh - seaY) / 14000, 0, 1)); c = mix(c, hex(th.sand), sandA); c = mix(c, hex(th.rock), rockA * .9); c = mix(c, hex(th.road), roadA * (T.theme === 'harbor' ? .0 : .4));
      const v = (nz(x / 2500, z / 2500) - .5) * .12; return [clamp(c[0] + v, 0, 1), clamp(c[1] + v, 0, 1), clamp(c[2] + v, 0, 1)];
    };
    const P = [], Nn = [], C = [], U = [], I = [];
    for (let j = 0; j <= nzc; j++) for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i, x = x0 + i * CS, z = z0 + j * CS, hl = H[Math.max(0, k - 1)], hr = H[Math.min(H.length - 1, k + 1)], hu = H[Math.max(0, k - (nx + 1))], hd2 = H[Math.min(H.length - 1, k + (nx + 1))];
      const dxh = (hr - hl) / (2 * CS), dzh = (hd2 - hu) / (2 * CS), l = Math.hypot(dxh, 1, dzh);
      P.push(x, H[k], z); Nn.push(-dxh / l, 1 / l, -dzh / l); const sl = Math.hypot(dxh, dzh); const c = col(H[k], sl, D[k], O[k], x, z); C.push(c[0], c[1], c[2]); U.push(x / 5000, z / 5000);
    }
    for (let j = 0; j < nzc; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c2 = a + nx + 1, d2 = c2 + 1; I.push(a, c2, b, b, c2, d2); }
    tb.raw(P, Nn, C, U, I, null); S.terrain = r.mesh(tb); S.heightAt = (x, z) => { const fx = (x - x0) / CS, fz = (z - z0) / CS, i = clamp(Math.floor(fx), 0, nx - 1), j = clamp(Math.floor(fz), 0, nzc - 1), a = H[j * (nx + 1) + i], b = H[j * (nx + 1) + i + 1], c = H[(j + 1) * (nx + 1) + i], d = H[(j + 1) * (nx + 1) + i + 1], tx2 = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1); return lerp(lerp(a, b, tx2), lerp(c, d, tx2), tz); };
    // ----- the road, kerbs and the slabs beside it
    const L = [], Rr = [], Lk = [], Lk2 = [], Rk = [], Rk2 = [], Ls = [], Ls2 = [], Rs = [], Rs2 = [], rb = new Builder(), kb = new Builder(), sb = new Builder(); const up = 6;
    for (let i = 0; i <= N; i++) { const s = segs[i % N], e = i === N ? 0 : i; const nxs = segs[(i + 1) % N]; void nxs;
      const ex = s.x, ey = s.y + up, ez = s.z, w = ROAD, rx = s.rx, rz = s.rz;
      L.push([ex - rx * w, ey, ez - rz * w]); Rr.push([ex + rx * w, ey, ez + rz * w]);
      const kw = T.theme === 'harbor' ? 1800 : 380; Lk.push([ex - rx * w, ey + 14, ez - rz * w]); Lk2.push([ex - rx * (w + kw), ey + 14, ez - rz * (w + kw)]); Rk.push([ex + rx * w, ey + 14, ez + rz * w]); Rk2.push([ex + rx * (w + kw), ey + 14, ez + rz * (w + kw)]); void e; void Ls; void Ls2; void Rs; void Rs2; }
    const roadCol = th.roadTex === 'cobble' ? [1, .96, .9] : [1, 1, 1];
    rb.ribbon(L, Rr, roadCol, .55, 2, [0, 1, 0]);
    S.road = r.mesh(rb); S.roadTex = th.roadTex === 'cobble' ? tx.cobble : th.roadTex === 'sand' ? tx.sand : tx.dirt;
    if (T.theme === 'harbor') { kb.ribbon(Lk2, Lk, [.92, .95, .92], .45, 1); kb.ribbon(Rk, Rk2, [.92, .95, .92], .45, 1); S.kerb = r.mesh(kb); S.kerbTex = tx.slabs; }
    else { kb.ribbon(Lk2, Lk, (i) => ((i >> 2) % 2 ? [.96, .96, .96] : [.86, .16, .14]), 1, 1); kb.ribbon(Rk, Rk2, (i) => ((i >> 2) % 2 ? [.96, .96, .96] : [.86, .16, .14]), 1, 1); S.kerb = r.mesh(kb); S.kerbTex = null; }
    // boost pads and the start line on the road
    const pb = new Builder(); for (const p of T.pads) { const A = [], B = []; for (let q = 0; q <= p.len; q++) { const s = segs[(p.seg + q) % N]; A.push([s.x + s.rx * (p.o - .36) * ROAD, s.y + up + 20, s.z + s.rz * (p.o - .36) * ROAD]); B.push([s.x + s.rx * (p.o + .36) * ROAD, s.y + up + 20, s.z + s.rz * (p.o + .36) * ROAD]); } pb.ribbon(A, B, [1, 1, 1], 1.4, 1); }
    S.pads = r.mesh(pb);
    const lb = new Builder(); { const A = [], B = []; for (let q = 0; q <= 2; q++) { const s = segs[q]; A.push([s.x - s.rx * ROAD, s.y + up + 18, s.z - s.rz * ROAD]); B.push([s.x + s.rx * ROAD, s.y + up + 18, s.z + s.rz * ROAD]); } lb.ribbon(A, B, [1, 1, 1], 2, 10); } S.line = r.mesh(lb);
    return buildScenery(r, S, T, th, rnd, nz, quality);
  }

  /* ---------- the things beside the road ---------- */
  function palm(b, x, y, z, rnd, h = 1) {
    const lean = (rnd() - .5) * .5, ang = rnd() * 6.28, H0 = (3600 + rnd() * 1800) * h, segN = 5;
    let px = x, pz = z, py = y; const dx = Math.cos(ang) * lean, dz = Math.sin(ang) * lean;
    for (let k = 0; k < segN; k++) { const t = (k + .5) / segN, rr = lerp(230, 130, t), sh = H0 / segN, nx = px + dx * sh * .6, nz2 = pz + dz * sh * .6; b.cyl(rr * .9, rr, sh * 1.04, 7, [.5 + t * .05, .36, .22], M.trs((px + nx) / 2, py + sh / 2, (pz + nz2) / 2, 0, dz * .5, -dx * .5)); px = nx; pz = nz2; py += sh; }
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + rnd() * .3, len = 2300 + rnd() * 700, g = .72 + rnd() * .2, c1 = [.16 * g, .6 * g, .2 * g], c2 = [.35 * g, .78 * g, .22 * g];
      b.box(len * .5, 60, 520, c1, M.trs(px + Math.cos(a) * len * .25, py + 160, pz + Math.sin(a) * len * .25, -a, 0, .22)); b.box(len * .55, 50, 360, c2, M.trs(px + Math.cos(a) * len * .72, py - 130, pz + Math.sin(a) * len * .72, -a, 0, -.38)); }
    b.sphere(230, 6, 5, [.4, .26, .12], M.trs(px + 120, py - 150, pz, 0)); b.sphere(230, 6, 5, [.4, .26, .12], M.trs(px - 120, py - 130, pz + 100, 0));
  }
  function house(b, x, y, z, ry, rnd, big = 1) {
    const pal = [[.94, .9, .62], [.88, .62, .78], [.65, .88, .62], [.7, .62, .86], [.96, .96, .92], [.95, .68, .5], [.62, .8, .92]], wc = pal[(rnd() * pal.length) | 0], w = (5200 + rnd() * 2600) * big, d = (4600 + rnd() * 2000) * big, h = (3800 + rnd() * 2400) * big, m = (px, py, pz, a = 0) => M.trs(x, y, z, ry, 0, 0, 1, 1, 1);
    void m; const T0 = M.trs(x, y, z, ry), place = (px, py, pz, rx = 0, rz = 0, ryy = 0) => M.mul(T0, M.trs(px, py, pz, ryy, rx, rz));
    b.box(w, h, d, wc, place(0, h / 2, 0), .5);
    const hl = h + 1500; const rc = [.7, .33, .2];   // roof: two slopes
    b.box(w * 1.12, 150, d * .62, rc, place(0, h + 700, d * .26, .62, 0)); b.box(w * 1.12, 150, d * .62, shade(rc, .85), place(0, h + 700, -d * .26, -.62, 0)); void hl;
    b.box(w * 1.1, 220, 200, [.28, .17, .09], place(0, h + 40, d / 2 + 20)); b.box(w * 1.1, 220, 200, [.28, .17, .09], place(0, h * .5, d / 2 + 20));
    for (let k = 0; k < 4; k++) b.box(190, h, 200, [.3, .18, .1], place(-w * .45 + k * w * .3, h / 2, d / 2 + 20));
    for (let k = 0; k < 2; k++) { b.box(700, 800, 120, [.2, .3, .45], place(-w * .25 + k * w * .5, h * .62, d / 2 + 35)); b.box(860, 120, 160, [.95, .95, .9], place(-w * .25 + k * w * .5, h * .62 - 460, d / 2 + 50)); b.box(110, 800, 150, [.28, .17, .1], place(-w * .25 + k * w * .5, h * .62, d / 2 + 60)); }
    b.box(900, 1700, 140, [.34, .2, .1], place(0, 850, d / 2 + 40));
    if (rnd() < .5) b.box(1500, 120, 900, [.4, .25, .12], place(w * .3, h * .55, d / 2 + 520));
    b.box(520, 1500, 520, [.62, .6, .56], place(w * .3, h + 1400, -d * .2));
  }
  function lamp(b, x, y, z, ry) { const T0 = M.trs(x, y, z, ry); b.cyl(60, 90, 2800, 6, [.18, .2, .24], M.mul(T0, M.trs(0, 1400, 0))); b.box(520, 60, 60, [.18, .2, .24], M.mul(T0, M.trs(250, 2780, 0))); b.box(240, 300, 240, [1, .95, .6], M.mul(T0, M.trs(520, 2600, 0))); b.cyl(0, 220, 160, 6, [.15, .16, .2], M.mul(T0, M.trs(520, 2820, 0))); }
  function barrel(b, x, y, z, rnd) { const c = rnd() < .5 ? [.52, .32, .16] : [.4, .26, .14]; b.cyl(340, 340, 800, 10, c, M.trs(x, y + 400, z)); b.cyl(352, 352, 70, 10, [.15, .15, .17], M.trs(x, y + 200, z)); b.cyl(352, 352, 70, 10, [.15, .15, .17], M.trs(x, y + 620, z)); }
  function crate(b, x, y, z, ry, s = 1) { b.box(760 * s, 760 * s, 760 * s, [.62, .44, .22], M.trs(x, y + 380 * s, z, ry)); b.box(800 * s, 80 * s, 800 * s, [.4, .27, .13], M.trs(x, y + 120 * s, z, ry)); b.box(800 * s, 80 * s, 800 * s, [.4, .27, .13], M.trs(x, y + 640 * s, z, ry)); }
  function stall(b, x, y, z, ry, rnd) {
    const T0 = M.trs(x, y, z, ry), p = (px, py, pz, ryy = 0, rx = 0) => M.mul(T0, M.trs(px, py, pz, ryy, rx)), cs = [[.9, .2, .18], [.2, .5, .9], [.95, .7, .1], [.2, .7, .35]], c = cs[(rnd() * cs.length) | 0];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl(70, 70, 2600, 6, [.4, .26, .12], p(sx * 1500, 1300, sz * 900));
    for (let k = 0; k < 6; k++) b.box(520, 90, 2200, k % 2 ? [.98, .98, .95] : c, p(-1300 + k * 520, 2750 - Math.abs(k - 2.5) * 20, 0, 0, 0));
    b.box(3000, 900, 800, [.55, .38, .2], p(0, 450, -300)); for (let k = 0; k < 5; k++) b.sphere(180, 6, 5, [[.95, .45, .1], [.8, .15, .12], [.95, .8, .15], [.35, .65, .2], [.95, .45, .1]][k], p(-1100 + k * 520, 1050, -300));
  }
  function hut(b, x, y, z, ry) { const T0 = M.trs(x, y, z, ry), p = (px, py, pz) => M.mul(T0, M.trs(px, py, pz)); b.cyl(1500, 1650, 1700, 10, [.78, .62, .38], p(0, 850, 0)); b.cyl(0, 2500, 1500, 10, [.72, .6, .26], p(0, 2450, 0)); b.box(700, 1200, 120, [.3, .2, .1], p(0, 600, 1560)); for (let k = 0; k < 4; k++) b.cyl(90, 90, 1100, 5, [.45, .3, .15], p(-1500 + k * 1000, 550, 2200)); }
  function rock(b, x, y, z, s, rnd, c = [.52, .55, .6]) { const n = 9; for (let k = 0; k < 3; k++) b.sphere(s * (.6 + rnd() * .5), 6, 5, shade(c, .85 + rnd() * .3), M.trs(x + (rnd() - .5) * s, y + s * .25 + k * s * .1, z + (rnd() - .5) * s, rnd() * 6, 0, 0, 1, .7 + rnd() * .3, 1)); void n; }
  function umbrella(b, x, y, z, rnd) { const c = [[.9, .2, .2], [.2, .5, .9], [.95, .75, .15]][(rnd() * 3) | 0]; b.cyl(40, 40, 2000, 5, [.9, .9, .9], M.trs(x, y + 1000, z)); for (let k = 0; k < 6; k++) b.cyl(0, 700, 360, 6, k % 2 ? [1, 1, 1] : c, M.trs(x, y + 2050, z)); }
  function bannerArch(b, T, S) {
    const s = T.segs[0], rx = s.rx, rz = s.rz, y = s.y; const poleL = [s.x - rx * (T.ROAD + 500), y, s.z - rz * (T.ROAD + 500)], poleR = [s.x + rx * (T.ROAD + 500), y, s.z + rz * (T.ROAD + 500)];
    for (const p of [poleL, poleR]) b.cyl(240, 280, 6200, 8, [.88, .88, .92], M.trs(p[0], p[1] + 3100, p[2]));
    const A = [[poleL[0], y + 6200, poleL[2]], [poleR[0], y + 6200, poleR[2]]], B = [[poleL[0], y + 4600, poleL[2]], [poleR[0], y + 4600, poleR[2]]]; const ab = new Builder(); ab.ribbon([A[0], A[1]], [B[0], B[1]], [1, 1, 1], 8, 1, [s.fx, 0, s.fz]); S.arch = S.arch || {}; S.archMesh = ab;
    // balloons
    const rb = RT.rng(9); for (const p of [poleL, poleR]) for (let k = 0; k < 7; k++) b.sphere(380, 7, 6, [[.9, .2, .2], [.2, .55, .95], [.95, .8, .15], [.25, .75, .4]][k % 4], M.trs(p[0] + (rb() - .5) * 1800, p[1] + 6800 + rb() * 1800, p[2] + (rb() - .5) * 1800));
  }

  function buildScenery(r, S, T, th, rnd, nz, quality) {
    const segs = T.segs, N = T.n, ROAD = T.ROAD, bg = new Builder(), wallB = new Builder(), sea = th.sea, CH = 100, chunks = new Map(), nCh = Math.ceil(N / CH), chunkB = (i) => { const k = Math.floor(i / CH) % nCh; let bb = chunks.get(k); if (!bb) chunks.set(k, bb = new Builder()); return bb; }; const gy = (x, z) => S.heightAt(x, z);
    const step = Math.max(3, Math.round(4 / quality));
    for (let i = 0; i < N; i += step) {
      const b = chunkB(i);
      const s = segs[i], f = i / N;
      for (const side of [-1, 1]) {
        const lat = ROAD + 2600 + rnd() * 9000, px = s.x + s.rx * side * lat, pz = s.z + s.rz * side * lat, py = gy(px, pz), n = S.near(px, pz); if (n.d < ROAD + 2300) continue;
        const isSea = sea && n.outer && py < S.seaY + 600; if (isSea) continue;
        const q = rnd();
        if (T.theme === 'harbor') { if (q < .26) house(b, px, py, pz, Math.atan2(-s.rz * side, s.rx * side) * 0 + (-s.hd + (side > 0 ? Math.PI : 0)) + Math.PI / 2 * 0 + (side > 0 ? 0 : 0), rnd); else if (q < .4) palm(b, px, py, pz, rnd); else if (q < .5) rock(b, px, py, pz, 1500 + rnd() * 1800, rnd); else if (q < .62) stall(b, s.x + s.rx * side * (ROAD + 3600), gy(s.x + s.rx * side * (ROAD + 3600), s.z + s.rz * side * (ROAD + 3600)), s.z + s.rz * side * (ROAD + 3600), -s.hd + Math.PI / 2 * (side > 0 ? 1 : -1) * 0, rnd); else if (q < .7) { const hx = s.x + s.rx * side * (ROAD + 3200), hz = s.z + s.rz * side * (ROAD + 3200); barrel(b, hx, gy(hx, hz), hz, rnd); barrel(b, hx + 700, gy(hx + 700, hz), hz + 500, rnd); crate(b, hx - 800, gy(hx - 800, hz), hz + 300, rnd() * 3); } }
        else if (T.theme === 'beach') { if (q < .45) palm(b, px, py, pz, rnd); else if (q < .56) rock(b, px, py, pz, 1300 + rnd() * 2200, rnd); else if (q < .64) hut(b, px, py, pz, -s.hd + (side > 0 ? Math.PI : 0)); else if (q < .72) umbrella(b, px, py, pz, rnd); else if (q < .78) palm(b, s.x + s.rx * side * (ROAD + 2400), gy(s.x + s.rx * side * (ROAD + 2400), s.z + s.rz * side * (ROAD + 2400)), s.z + s.rz * side * (ROAD + 2400), rnd, .8); }
        else { if (q < .3) house(b, px, py, pz, -s.hd + (side > 0 ? Math.PI : 0), rnd, .9); else if (q < .48) stall(b, s.x + s.rx * side * (ROAD + 3600), gy(s.x + s.rx * side * (ROAD + 3600), s.z + s.rz * side * (ROAD + 3600)), s.z + s.rz * side * (ROAD + 3600), -s.hd, rnd); else if (q < .6) palm(b, px, py, pz, rnd, .9); else if (q < .7) rock(b, px, py, pz, 1300 + rnd() * 1600, rnd, [.6, .56, .48]); else if (q < .78) { barrel(b, px, py, pz, rnd); crate(b, px + 900, gy(px + 900, pz), pz, rnd() * 3); } }
      }
      if (i % (step * 3) === 0) for (const side of [-1, 1]) { const px = s.x + s.rx * side * (ROAD + 2400), pz = s.z + s.rz * side * (ROAD + 2400); if (T.theme !== 'beach' || rnd() < .4) lamp(b, px, gy(px, pz), pz, side > 0 ? -s.hd + Math.PI : -s.hd); }
    }
    // low stone walls beside the road on the harbor town stretches (like the reference: a stone wall with grass above)
    if (T.theme === 'harbor' || T.theme === 'market') {
      for (const side of [-1, 1]) { let run = null; const runs = [];
        for (let i = 0; i <= N; i++) { const on = (Math.sin(i * .017 + (side > 0 ? 1.3 : 0) + T.def.seed) > (T.theme === 'harbor' ? -.15 : .45)); if (on && !run) run = []; if (on) run.push(i); if ((!on || i === N) && run) { if (run.length > 8) runs.push(run); run = null; } }
        for (const run2 of runs) { const A = [], B = [], lat = ROAD + (T.theme === 'harbor' ? 2300 : 900);
          for (const i of run2) { const s = segs[i % N], x = s.x + s.rx * side * lat, z = s.z + s.rz * side * lat, hh = T.theme === 'harbor' ? 1500 : 900; A.push([x, s.y - 80, z]); B.push([x, s.y + hh, z]); }
          wallB.wall(A, B, [.95, .95, .92], 1, 1);
          const A2 = [], B2 = []; for (const i of run2) { const s = segs[i % N], lat2 = lat + 520, x = s.x + s.rx * side * lat2, z = s.z + s.rz * side * lat2; A2.push([x, s.y + (T.theme === 'harbor' ? 1500 : 900), z]); B2.push([x, s.y + (T.theme === 'harbor' ? 1500 : 900), z]); }
          void A2; void B2; }
      }
    }
    // the finish arch
    bannerArch(bg, T, S);
    // piers and boats on the sea side (harbor and beach)
    if (sea) {
      const bb = new Builder(); let placed = 0;
      for (let i = 40; i < N && placed < 7; i += 110 + ((rnd() * 90) | 0)) {
        const s = segs[i];
        for (const side of [-1, 1]) {
          let shore = -1; for (let lat = ROAD + 2000; lat < ROAD + 26000; lat += 400) { const x = s.x + s.rx * side * lat, z = s.z + s.rz * side * lat; if (!S.near(x, z).outer) break; if (S.heightAt(x, z) < S.seaY + 250) { shore = lat; break; } }
          if (shore < 0) continue; const len = 11000 + rnd() * 6000, dxs = s.rx * side, dzs = s.rz * side, yaw = Math.atan2(-dzs, dxs);
          for (let ph = -1800, k = 0; ph < len; ph += 1300, k++) { const x = s.x + dxs * (shore + ph), z = s.z + dzs * (shore + ph); bb.box(1400, 150, 1500, [.6, .42, .24], M.trs(x, S.seaY + 420, z, yaw)); bb.box(1420, 40, 40, [.36, .24, .12], M.trs(x, S.seaY + 505, z - 520 * dxs * 0 + 0, yaw)); if (k % 2 === 0) for (const sd of [-1, 1]) bb.cyl(75, 75, 1500, 5, [.3, .2, .1], M.trs(x - dzs * 680 * sd * -1 + 0, S.seaY - 300, z + dxs * 680 * sd * -1 + 0)); }
          if (rnd() < .8) { const ex = s.x + dxs * (shore + len + 4200), ez = s.z + dzs * (shore + len + 4200), hy = S.seaY + 150, yw = yaw + 1.2; bb.box(4200, 700, 1400, [.92, .92, .94], M.trs(ex, hy + 250, ez, yw)); bb.box(3600, 200, 1100, [.2, .32, .62], M.trs(ex, hy + 80, ez, yw)); bb.cyl(50, 50, 5200, 5, [.5, .35, .2], M.trs(ex, hy + 3100, ez, yw)); bb.box(40, 3800, 2200, [.98, .98, .95], M.trs(ex, hy + 3000, ez, yw)); }
          placed++; break;
        }
      }
      if (bb.count) S.piers = r.mesh(bb);
    }
    S.chunks = [...chunks.entries()].map(([k, bb]) => ({ k, mesh: r.mesh(bb) })); S.CH = CH; S.chunkCount = nCh; S.sceneryGlobal = r.mesh(bg); S.walls = wallB.count ? r.mesh(wallB) : null; if (S.archMesh && S.archMesh.count) S.arch = r.mesh(S.archMesh);
    // the sea, the sky dome and the far mountains
    const wb = new Builder(), E = 320000; wb.raw([-E, 0, -E, E, 0, -E, E, 0, E, -E, 0, E], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], [.17, .72, .82, .17, .72, .82, .17, .72, .82, .17, .72, .82], [0, 0, 40, 0, 40, 40, 0, 40], [0, 2, 1, 0, 3, 2], null); S.water = r.mesh(wb);
    const sk = new Builder(); { const rings = 10, seg = 28, P = [], Nn = [], C = [], U = [], I = []; const top = hex(th.sky[0]), bot = hex(th.sky[1]);
      for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, e = (j / rings) * Math.PI / 2, rr = 150000, x = Math.cos(a) * Math.cos(e) * rr, y = Math.sin(e) * rr, z = Math.sin(a) * Math.cos(e) * rr, c = mix(bot, top, Math.pow(j / rings, .7)); P.push(x, y - 4000, z); Nn.push(0, -1, 0); C.push(c[0], c[1], c[2]); U.push(0, 0); }
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, c2 = a + seg + 1; I.push(a, a + 1, c2, a + 1, c2 + 1, c2); } sk.raw(P, Nn, C, U, I, null); } S.sky = r.mesh(sk);
    const mb = new Builder(); { const rm = RT.rng(77); for (let k = 0; k < 34; k++) { const a = k / 34 * Math.PI * 2 + rm() * .1, rr = 150000 + rm() * 40000, h = 14000 + rm() * 26000, w = 26000 + rm() * 22000, c = mix(hex('#8a98ac'), hex('#a8b6c8'), rm()); mb.cyl(0, w, h, 6, [c[0], c[1], c[2]], M.trs(S.centre[0] + Math.cos(a) * rr, S.seaY + h / 2 - 3000, S.centre[1] + Math.sin(a) * rr)); } } S.mountains = r.mesh(mb);
    // clouds
    const cb = new Builder(); cb.raw([-1, 0, -.5, 1, 0, -.5, 1, 0, .5, -1, 0, .5], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], new Array(12).fill(1), [0, 0, 1, 0, 1, 1, 0, 1], [0, 2, 1, 0, 3, 2], null); S.cloudMesh = r.mesh(cb); S.clouds = []; { const rc = RT.rng(5); for (let k = 0; k < 14; k++) S.clouds.push({ a: rc() * 6.28, r: 40000 + rc() * 80000, y: 26000 + rc() * 22000, s: 16000 + rc() * 22000, sp: .008 + rc() * .01 }); }
    return S;
  }

  /* ---------- drawing one frame of the circuit ---------- */
  function drawScene(r, S, cam, time, focus) {
    const th = S.th, sun = th.sun, l = Math.hypot(...sun), e = { sun: sun.map((v) => v / l), sunCol: [.5, .46, .38], sky: [.52, .57, .68], ground: [.38, .35, .29], fog: hex(th.fog), fogNear: 42000, fogFar: 160000 };
    r.time = time; r.frame(cam, e);
    S.sky.draw(M.trs(cam.eye[0], cam.eye[1], cam.eye[2]), { unlit: 1, noDepthWrite: true, noCull: true });
    S.mountains.draw(M.id(), {});
    S.terrain.draw(M.id(), { tex: S.tex.detail, texMix: .55 });
    S.road.draw(M.id(), { tex: S.roadTex });
    if (S.kerb) S.kerb.draw(M.id(), S.kerbTex ? { tex: S.kerbTex } : {});
    S.pads.draw(M.id(), { tex: S.tex.chev, unlit: .8, tint: [1, .85 + .15 * Math.sin(time * 6), .5 + .3 * Math.sin(time * 6), 1] });
    S.line.draw(M.id(), { tex: S.tex.check, unlit: .3 });
    S.sceneryGlobal.draw(M.id(), {});
    if (focus == null) { for (const c of S.chunks) c.mesh.draw(M.id(), {}); }
    else if (focus >= 0) { const fk = focus / S.CH, n = S.chunkCount; for (const c of S.chunks) { let d = c.k + .5 - fk; d = ((d % n) + n + n / 2) % n - n / 2; if (d > -2.6 && d < (S.lod || 5.6)) c.mesh.draw(M.id(), {}); } }
    if (S.walls) S.walls.draw(M.id(), { tex: S.tex.wall, noCull: true });
    if (S.piers) S.piers.draw(M.id(), {});
    if (S.arch) S.arch.draw(M.id(), { tex: S.tex.check, unlit: .4, noCull: true });
    // the sea over the terrain, so the shallows show through
    const sy = S.seaY, tt = time * .02;
    if (th.sea) { S.water.draw(M.trs(cam.eye[0] * 0, sy, 0), { tex: S.tex.water, blend: true, alpha: .84, noDepthWrite: true, texMix: .8, uv: [tt, tt * .6] });
      S.water.draw(M.trs(0, sy + 18, 0, .6), { tex: S.tex.water, blend: true, alpha: .22, noDepthWrite: true, unlit: .6, uv: [-tt * 1.3, tt * .8] }); }
    for (const c of S.clouds) { const a = c.a + time * c.sp * .1; S.cloudMesh.draw(M.trs(cam.eye[0] + Math.cos(a) * c.r, c.y, cam.eye[2] + Math.sin(a) * c.r, 0, 0, 0, c.s, 1, c.s * .5), { tex: S.tex.cloud, blend: true, alpha: .9, unlit: 1, noDepthWrite: true, noCull: true }); }
  }


  /* ================= karts and drivers ================= */
  const SKINS = ['#f2c9a0', '#e0a878', '#c68642', '#8d5524', '#5c3a21', '#f6d7b8'];
  const DRIVERS = [
    { name: 'Tunde', skin: 0, hair: '#b3211d', style: 'spiky', jacket: '#d8281f', trim: '#f4f4f4', goggles: '#ff6fa0' },
    { name: 'Amaka', skin: 3, hair: '#1b1b1d', style: 'puffs', jacket: '#7b3fc4', trim: '#ffd23f', goggles: null },
    { name: 'Kunle', skin: 2, hair: '#1b1b1d', style: 'cap', jacket: '#1f7fe0', trim: '#ffffff', goggles: null },
    { name: 'Sade', skin: 4, hair: '#2a1a12', style: 'braids', jacket: '#1fa85a', trim: '#ffd23f', goggles: null },
    { name: 'Emeka', skin: 1, hair: '#2a1a12', style: 'bandana', jacket: '#ff7a29', trim: '#1b1b1d', goggles: '#2b2b30' },
    { name: 'Ngozi', skin: 3, hair: '#3a1d12', style: 'afro', jacket: '#e84393', trim: '#ffffff', goggles: null },
    { name: 'Femi', skin: 5, hair: '#d9a53a', style: 'spiky', jacket: '#14b8c4', trim: '#1b1b1d', goggles: '#9fe3ff' },
    { name: 'Bola', skin: 2, hair: '#7a4a1e', style: 'round', jacket: '#8d6e63', trim: '#f2b705', goggles: null }
  ];
  function driverMesh(r, di) {
    const D = DRIVERS[di % DRIVERS.length], b = new Builder(), skin = hex(SKINS[D.skin]), hair = hex(D.hair), jk = hex(D.jacket), tr = hex(D.trim);
    // torso and arms are part of the body; the head is its own mesh so it can turn
    const head = new Builder(); head.sphere(300, 12, 10, skin, M.trs(0, 0, 0, 0, 0, 0, 1, 1.02, .94));
    head.sphere(46, 5, 4, shade(skin, .85), M.trs(250, -20, 0)); head.box(40, 50, 220, shade(skin, .7), M.trs(268, -150, 0));            // nose and mouth
    for (const z of [-115, 115]) { head.sphere(54, 6, 5, [1, 1, 1], M.trs(240, 50, z)); head.sphere(26, 5, 4, [.1, .1, .12], M.trs(285, 50, z * .96)); }
    for (const z of [-310, 310]) head.sphere(70, 6, 5, shade(skin, .9), M.trs(0, -10, z));                                                   // ears
    if (D.style === 'spiky') { for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; head.cyl(0, 120, 520, 5, hair, M.trs(Math.cos(a) * 140 - 60, 290 + (k % 3) * 70, Math.sin(a) * 170, 0, Math.sin(a) * .5, -Math.cos(a) * .5)); } head.sphere(280, 10, 6, hair, M.trs(-40, 90, 0, 0, 0, 0, 1, .8, 1)); }
    else if (D.style === 'puffs') { head.sphere(300, 10, 6, hair, M.trs(-30, 90, 0, 0, 0, 0, 1, .75, 1)); head.sphere(170, 8, 6, hair, M.trs(-40, 330, -230)); head.sphere(170, 8, 6, hair, M.trs(-40, 330, 230)); }
    else if (D.style === 'afro') head.sphere(430, 12, 10, hair, M.trs(-60, 110, 0, 0, 0, 0, 1, .92, 1.05));
    else if (D.style === 'cap') { head.sphere(310, 10, 6, hex(D.jacket), M.trs(-10, 90, 0, 0, 0, 0, 1, .7, 1)); head.box(300, 40, 360, hex(D.jacket), M.trs(300, 150, 0)); }
    else if (D.style === 'braids') { head.sphere(300, 10, 6, hair, M.trs(-30, 90, 0, 0, 0, 0, 1, .72, 1)); for (let k = 0; k < 6; k++) head.cyl(34, 34, 520, 5, hair, M.trs(-190, -120, -240 + k * 96)); }
    else if (D.style === 'bandana') { head.sphere(310, 10, 6, hex(D.jacket), M.trs(-20, 90, 0, 0, 0, 0, 1, .55, 1)); head.cyl(0, 130, 330, 5, hex(D.jacket), M.trs(-380, 120, 0, 0, 0, 0, 1, 1, 1) ); head.sphere(240, 8, 6, hair, M.trs(-40, 230, 0, 0, 0, 0, 1, .6, 1)); }
    else head.sphere(310, 10, 6, hair, M.trs(-20, 100, 0, 0, 0, 0, 1, .72, 1));
    if (D.goggles) { head.box(110, 150, 520, hex(D.goggles), M.trs(240, 60, 0)); head.cyl(130, 130, 120, 10, hex(D.goggles), M.trs(270, 60, -130, 0, Math.PI / 2)); head.cyl(130, 130, 120, 10, hex(D.goggles), M.trs(270, 60, 130, 0, Math.PI / 2)); head.cyl(95, 95, 130, 10, [.85, .95, 1], M.trs(285, 60, -130, 0, Math.PI / 2)); head.cyl(95, 95, 130, 10, [.85, .95, 1], M.trs(285, 60, 130, 0, Math.PI / 2)); }
    b.box(380, 520, 560, jk, M.trs(0, 0, 0)); b.box(390, 120, 570, tr, M.trs(0, -170, 0));
    for (const z of [-1, 1]) { b.cyl(95, 85, 560, 7, jk, M.trs(190, -80, z * 330, 0, 0, 0)); b.sphere(100, 6, 5, [.95, .95, .95], M.trs(420, -300, z * 250)); }
    return { head: r.mesh(head), torso: r.mesh(b), D };
  }
  function wheelMesh(r, rad, wid) {
    const b = new Builder(), R90 = M.trs(0, 0, 0, 0, Math.PI / 2);
    b.cyl(rad, rad, wid, 14, [.13, .12, .13], R90, true); b.cyl(rad * .55, rad * .55, wid + 30, 12, [.78, .8, .84], R90, true); b.cyl(rad * .22, rad * .22, wid + 50, 8, [.35, .36, .4], R90, true);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; b.box(rad * .26, rad * .26, wid * .96, [.2, .19, .2], M.trs(Math.cos(a) * rad * .96, Math.sin(a) * rad * .96, 0, 0, 0, a)); }
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; b.box(rad * .5, rad * .1, wid + 40, [.55, .57, .62], M.trs(Math.cos(a) * rad * .32, Math.sin(a) * rad * .32, 0, 0, 0, a)); }
    return r.mesh(b);
  }
  const KART_CACHE = {};
  /* a kart looks like: type (buggy / danfo / taxi / keke), colour, driver 0-7 */
  function buildKart(r, type, color, di, tex) {
    const key = type + color + di; if (KART_CACHE[key]) return KART_CACHE[key];
    const c = hex(color), dark = shade(c, .6), light = shade(c, 1.25), steel = [.7, .72, .78], black = [.12, .12, .14], K = { type, wheels: [], rad: 330, wid: 330 }, b = new Builder(), hood = new Builder();
    if (type === 'danfo') {
      const y = [1, .8, .0]; void y; const yel = [.96, .72, .08];
      b.box(2300, 560, 1000, yel, M.trs(0, 520, 0)); b.box(1500, 850, 960, yel, M.trs(-200, 1130, 0)); b.box(2310, 130, 1010, black, M.trs(0, 600, 0)); b.box(1520, 150, 970, c, M.trs(-200, 1560, 0));
      b.box(60, 520, 880, [.2, .3, .42], M.trs(560, 1150, 0)); for (const z of [-1, 1]) for (let k = 0; k < 3; k++) b.box(380, 420, 40, [.2, .3, .42], M.trs(-700 + k * 450 + 150, 1180, z * 485));
      b.box(260, 220, 940, steel, M.trs(1150, 330, 0)); for (const z of [-1, 1]) b.sphere(95, 6, 5, [1, .98, .8], M.trs(1160, 560, z * 330)); b.box(1500, 60, 1000, steel, M.trs(-200, 1640, 0)); for (let k = 0; k < 5; k++) b.cyl(30, 30, 1000, 4, steel, M.trs(-800 + k * 300, 1700, 0, 0, Math.PI / 2));
      b.box(60, 330, 880, c, M.trs(-1150, 560, 0)); K.wheels = [[760, 300, 520, 1], [760, 300, -520, 1], [-760, 300, 520, 0], [-760, 300, -520, 0]]; K.rad = 300; K.wid = 260; K.head = [380, 1130, 0]; K.shadow = [2800, 1400];
      b.sphere(260, 8, 6, hex(SKINS[DRIVERS[di % 8].skin]), M.trs(330, 1280, -270));
    } else if (type === 'taxi') {
      const yel = [.97, .78, .1];
      b.box(2200, 470, 940, yel, M.trs(0, 520, 0)); b.box(1100, 450, 840, yel, M.trs(-120, 980, 0)); b.box(2210, 90, 950, black, M.trs(0, 640, 0)); b.box(1110, 40, 850, steel, M.trs(-120, 1220, 0));
      b.box(60, 330, 760, [.22, .32, .44], M.trs(440, 1000, 0)); b.box(60, 300, 760, [.22, .32, .44], M.trs(-690, 1000, 0)); for (const z of [-1, 1]) b.box(900, 300, 40, [.22, .32, .44], M.trs(-120, 1010, z * 425));
      b.box(300, 120, 520, [1, 1, 1], M.trs(-120, 1300, 0)); b.box(240, 80, 480, black, M.trs(-120, 1300, 0)); b.box(260, 200, 960, steel, M.trs(1100, 360, 0)); for (const z of [-1, 1]) b.sphere(95, 6, 5, [1, .98, .8], M.trs(1120, 580, z * 320));
      for (const z of [-1, 1]) b.sphere(70, 5, 4, [.9, .1, .1], M.trs(-1100, 600, z * 360)); K.wheels = [[720, 300, 500, 1], [720, 300, -500, 1], [-700, 300, 500, 0], [-700, 300, -500, 0]]; K.rad = 300; K.wid = 250; K.head = [60, 1000, 220]; K.shadow = [2600, 1300];
    } else if (type === 'keke') {
      const gr = [.15, .62, .3], ye = [.97, .72, .1];
      b.box(1700, 380, 900, gr, M.trs(-100, 500, 0)); b.box(700, 380, 840, gr, M.trs(700, 560, 0)); b.sphere(420, 10, 8, gr, M.trs(950, 560, 0, 0, 0, 0, 1, .8, 1.2));
      b.box(1400, 120, 920, ye, M.trs(-300, 1500, 0)); for (const z of [-1, 1]) for (const x of [-900, 300]) b.cyl(40, 40, 1000, 5, [.2, .2, .22], M.trs(x, 1000, z * 420));
      b.box(60, 600, 800, [.2, .3, .42], M.trs(420, 1050, 0)); b.sphere(90, 5, 4, [1, .98, .8], M.trs(1330, 600, 0)); b.box(200, 40, 40, steel, M.trs(1050, 920, 0));
      K.wheels = [[900, 260, 0, 1], [-650, 260, 440, 0], [-650, 260, -440, 0]]; K.rad = 260; K.wid = 220; K.head = [500, 1000, 0]; K.shadow = [2400, 1200];
    } else {
      // dune buggy, like the one in the garage reference: tub, big fenders, roll cage, engine at the back
      b.box(1500, 260, 760, c, M.trs(0, 380, 0)); b.box(520, 200, 700, c, M.trs(760, 470, 0)); b.box(300, 170, 800, dark, M.trs(1050, 360, 0));
      for (const z of [-1, 1]) { b.box(760, 150, 300, c, M.trs(560, 640, z * 520)); b.box(760, 150, 300, c, M.trs(-560, 640, z * 520)); b.box(800, 280, 60, dark, M.trs(560, 520, z * 640)); b.box(800, 280, 60, dark, M.trs(-560, 520, z * 640)); }
      b.box(230, 80, 960, steel, M.trs(1240, 330, 0)); for (const z of [-1, 1]) { b.sphere(130, 8, 6, [1, .98, .85], M.trs(1060, 600, z * 300)); b.cyl(135, 135, 60, 10, steel, M.trs(1130, 600, z * 300, 0, 0, Math.PI / 2)); }
      b.box(420, 330, 600, [.3, .32, .36], M.trs(-660, 700, 0)); b.box(380, 70, 540, steel, M.trs(-660, 900, 0)); for (const z of [-1, 1]) { b.cyl(55, 55, 500, 6, steel, M.trs(-960, 480, z * 200, 0, 0, Math.PI / 2 - .2)); b.cyl(62, 62, 120, 6, [.2, .2, .22], M.trs(-1180, 380, z * 200, 0, 0, Math.PI / 2)); }
      for (const z of [-1, 1]) { b.cyl(34, 34, 760, 6, steel, M.trs(150, 1000, z * 340, 0, 0, -.15)); b.cyl(34, 34, 700, 6, steel, M.trs(-420, 1010, z * 340, 0, 0, .12)); b.cyl(34, 34, 720, 6, steel, M.trs(-130, 1370, z * 350, 0, Math.PI / 2 * 0, Math.PI / 2 * 0)); }
      b.cyl(34, 34, 700, 6, steel, M.trs(-130, 1370, 0, 0, Math.PI / 2)); b.cyl(34, 34, 660, 6, steel, M.trs(160, 1260, 0, 0, Math.PI / 2)); b.cyl(34, 34, 760, 6, steel, M.trs(-420, 1330, 0, 0, Math.PI / 2));
      b.box(280, 160, 620, [.14, .14, .16], M.trs(-170, 560, 0)); b.box(80, 330, 600, [.14, .14, .16], M.trs(-330, 740, 0, 0, 0, .12)); b.cyl(165, 165, 40, 10, [.12, .12, .14], M.trs(330, 900, 0, 0, 0, 1.2)); b.cyl(25, 25, 520, 5, steel, M.trs(230, 760, 0, 0, 0, .5));
      hood.box(520, 90, 700, [1, 1, 1], M.trs(760, 600, 0), .55); K.hood = true;
      K.wheels = [[620, 330, 560, 1], [620, 330, -560, 1], [-640, 340, 560, 0], [-640, 340, -560, 0]]; K.rad = 330; K.wid = 340; K.head = [-70, 1130, 0]; K.shadow = [2900, 1500]; K.seat = [-80, 700, 0];
    }
    K.body = r.mesh(b); if (K.hood) { K.hoodMesh = r.mesh(hood); K.hoodTex = tex.flameTex(color); }
    K.wheel = wheelMesh(r, K.rad, K.wid); const dm = driverMesh(r, di); K.driver = dm;
    return (KART_CACHE[key] = K);
  }
  /* pose: { x, y, z, yaw, pitch, roll, steer, spin, wheel, boost, shield, t, hop } */
  function drawKart(r, K, pose, S) {
    const base = M.mul(M.trs(pose.x, pose.y + (pose.hop || 0), pose.z, -pose.yaw - (pose.spin || 0)), M.trs(0, 0, 0, 0, pose.roll || 0, pose.pitch || 0));
    K.body.draw(base, {}); if (K.hoodMesh) K.hoodMesh.draw(base, { tex: K.hoodTex });
    for (const [wx, wy, wz, front] of K.wheels) { const m = M.mul(base, M.trs(wx, wy, wz, front ? -(pose.steer || 0) * .5 : 0, 0, -(pose.wheel || 0))); K.wheel.draw(m, {}); }
    const hp = K.head, sway = (pose.steer || 0) * .35;
    if (K.type === 'buggy') { const sx = K.seat; K.driver.torso.draw(M.mul(base, M.trs(sx[0], sx[1], sx[2], -sway * .25)), {}); K.driver.head.draw(M.mul(base, M.trs(hp[0], hp[1], hp[2], -sway - (pose.look || 0), 0, (pose.boost ? -.18 : 0))), {}); }
    else K.driver.head.draw(M.mul(base, M.trs(hp[0], hp[1], hp[2], -sway, 0, 0, .55, .55, .55)), {});
    // a soft shadow on the road
    if (S && S.shadowMesh) S.shadowMesh.draw(M.trs(pose.x, pose.gy + 14, pose.z, -pose.yaw, 0, 0, K.shadow[0], 1, K.shadow[1]), { tex: S.tex.shadow, blend: true, alpha: .55, unlit: 1, noDepthWrite: true, tint: [0, 0, 0, 1] });
    if (pose.shield) { S.bubbleMesh.draw(M.trs(pose.x, pose.y + 700, pose.z, 0, 0, 0, 1750, 1100, 1250), { blend: true, alpha: .28 + .08 * Math.sin((pose.t || 0) * 9), unlit: 1, noDepthWrite: true, tint: [.5, .9, 1, 1] }); }
  }
  /* the hood flames come in the player's colour */
  const FLAME_CACHE = {};
  function flameTexFor(r) { return (color) => { if (FLAME_CACHE[color]) return FLAME_CACHE[color]; const c = canvas(128, 128), x = c.getContext('2d'), base = hex(color); x.fillStyle = color; x.fillRect(0, 0, 128, 128); const hi = mix(base, [1, .85, .2], .65), mid = mix(base, [1, .6, .1], .5); for (let k = 0; k < 7; k++) { const px = 10 + k * 18; x.fillStyle = `rgb(${mid.map((v) => v * 255 | 0)})`; x.beginPath(); x.moveTo(px - 9, 128); x.quadraticCurveTo(px - 6, 80, px, 50 + (k % 2) * 14); x.quadraticCurveTo(px + 6, 80, px + 9, 128); x.fill(); x.fillStyle = `rgb(${hi.map((v) => v * 255 | 0)})`; x.beginPath(); x.moveTo(px - 4, 128); x.quadraticCurveTo(px - 2, 96, px, 80 + (k % 2) * 10); x.quadraticCurveTo(px + 2, 96, px + 4, 128); x.fill(); } return (FLAME_CACHE[color] = r.texture(c)); }; }

  /* ---------- shared small meshes, particles, item bubbles ---------- */
  function extras(r, S) {
    const q = new Builder(); q.raw([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], new Array(12).fill(1), [0, 1, 1, 1, 1, 0, 0, 0], [0, 1, 2, 0, 2, 3], null); S.quad = r.mesh(q);
    const f = new Builder(); f.raw([-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], new Array(12).fill(1), [0, 0, 1, 0, 1, 1, 0, 1], [0, 2, 1, 0, 3, 2], null); S.shadowMesh = r.mesh(f);
    const sp = new Builder(); sp.sphere(.5, 12, 8, [1, 1, 1], null); S.bubbleMesh = r.mesh(sp);
    S.flameTex = flameTexFor(r); S.tex.flameTex = S.flameTex; S.particles = { list: [], mesh: r.mesh(new Builder(), true) };
    return S;
  }
  /* a camera-facing quad: size in world units */
  function billboard(r, x, y, z, w, h) {
    const v = r.view, rx = v[0], ry = v[4], rz = v[8], ux = v[1], uy = v[5], uz = v[9], fx = v[2], fy = v[6], fz = v[10];
    return new Float32Array([rx * w, ry * w, rz * w, 0, ux * h, uy * h, uz * h, 0, fx, fy, fz, 0, x, y, z, 1]);
  }
  function drawBubbles(r, S, boxes, hidden, now, camPos, ahead) {
    const T = S.T, t = now / 1000;
    for (const b of boxes) {
      if (hidden[b.id] > now) continue; const rel = ((b.seg - ahead + T.n * 1.5) % T.n) - T.n / 2; if (rel < -8 || rel > 230) continue;
      const p = T.point(b.seg * T.SEG, b.o), y = p.y + 1250 + Math.sin(t * 2.4 + b.id) * 120;
      S.quad.draw(billboard(r, p.x, p.y + 40, p.z, 1500, 1500), { tex: S.tex.glow, blend: true, alpha: .55, unlit: 1, noDepthWrite: true, noCull: true, tint: [1, .5, .9, 1] });
      S.quad.draw(billboard(r, p.x, y, p.z, 1400, 1400), { tex: S.tex.bubble, blend: true, alpha: 1, unlit: 1, noDepthWrite: true, noCull: true });
    }
  }
  /* particles: dust, boost fire, drift sparks */
  function spawn(S, p) { const L = S.particles.list; if (L.length < 420) L.push(p); }
  function updateParticles(r, S, dt) {
    const P = S.particles, L = P.list; for (const p of L) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= (p.grav || 0) * dt; p.vx *= (1 - (p.drag || 0) * dt); p.vz *= (1 - (p.drag || 0) * dt); }
    for (let i = L.length - 1; i >= 0; i--) if (L[i].life <= 0) L.splice(i, 1);
  }
  function drawParticles(r, S, tex, o = {}) {
    const P = S.particles, v = r.view, rx = [v[0], v[4], v[8]], ux = [v[1], v[5], v[9]], b = new Builder(); if (!P.list.length) return;
    for (const p of P.list) {
      if (p.tex !== tex) continue; const f = clamp(p.life / p.max, 0, 1), sz = p.size * (p.grow ? lerp(1, p.grow, 1 - f) : 1), a = f * (p.alpha == null ? 1 : p.alpha), c = p.col;
      const base = b.count; for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { b.pos.push(p.x + (rx[0] * qx + ux[0] * qy) * sz, p.y + (rx[1] * qx + ux[1] * qy) * sz, p.z + (rx[2] * qx + ux[2] * qy) * sz); b.nor.push(0, 1, 0); b.col.push(c[0], c[1], c[2]); b.uv.push((qx + 1) / 2, 1 - (qy + 1) / 2); b.alp.push(a); } b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (!b.count) return; P.mesh.set(b); P.mesh.draw(M.id(), { tex: S.tex[tex], blend: true, add: !!o.add, unlit: 1, noDepthWrite: true, noCull: true, alpha: 1 });
  }

  return { buildTrack, drawScene, buildKart, drawKart, extras, billboard, drawBubbles, spawn, updateParticles, drawParticles, DRIVERS, SKINS, THEME, palm, house, lamp, barrel, crate, stall, hut, rock, umbrella, noise2, smooth, clamp, lerp, canvas, cobble, tx: { soft, bubbleTex, checker } };
})();
