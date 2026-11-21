/* Drive Race: the circuits. Each one is a closed loop in 3D (position, height, bends), cut into 200-unit segments.
   The game screen draws the loop in 3D from these segments; the server uses the same segments (lap length, bends for the bots, item boxes, boost pads),
   so both sides always agree on where everything is.
   A circuit is a closed curve r(angle) around a centre, so it can never cross itself; harmonics give it bends, and the same trick gives it hills. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RaceTrack = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const SEG = 200, ROAD = 2000, RUMBLE = 3, MAXV = 11000, CURVE_K = 150;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* name, look, size, the bends [harmonic, size, phase], the hills [harmonic, height, phase], which side the sea is on */
  const DEFS = {
    harbor: { name: 'Harbor Run', theme: 'harbor', R: 56000, bends: [[2, .17, .4], [3, .11, 1.7], [5, .05, 2.2], [7, .03, .5]], hills: [[1, 3900, .6], [2, 1900, 1.3], [3, 1100, 2.1]], sea: 'outer', seed: 11, laps: 3 },
    beach: { name: 'Palm Beach', theme: 'beach', R: 60000, bends: [[2, .21, 1.2], [3, .07, .1], [4, .05, 2.5], [6, .025, 1.1]], hills: [[1, 2200, 2.2], [2, 1500, .4], [4, 800, 1.7]], sea: 'outer', seed: 23, laps: 3 },
    market: { name: 'Mile 12 Market', theme: 'market', R: 52000, bends: [[3, .15, .9], [4, .09, 2.6], [6, .05, .3], [2, .06, 1.9]], hills: [[2, 1500, .2], [3, 1000, 1.4]], sea: 'none', seed: 37, laps: 3 }
  };

  const cache = {};
  function build(id) {
    id = DEFS[id] ? id : 'harbor'; if (cache[id]) return cache[id];
    const D = DEFS[id], M = 7200, P = [];
    for (let k = 0; k < M; k++) {
      const th = k / M * Math.PI * 2; let r = 1; for (const [h, a, ph] of D.bends) r += a * Math.cos(h * th + ph);
      let y = 0; for (const [h, a, ph] of D.hills) y += a * Math.sin(h * th + ph);
      r *= D.R; P.push([Math.cos(th) * r, y, Math.sin(th) * r * .82]);
    }
    let len = 0; const cum = [0]; for (let k = 1; k <= M; k++) { const a = P[k - 1], b = P[k % M]; len += Math.hypot(b[0] - a[0], b[2] - a[2]); cum.push(len); }
    const N = Math.round(len / SEG), sc = N * SEG / len;                         // scale so a lap is exactly N segments of 200 units
    for (const p of P) { p[0] *= sc; p[2] *= sc; }
    for (let k = 0; k <= M; k++) cum[k] *= sc; len *= sc;
    const pts = []; let j = 0;
    for (let i = 0; i < N; i++) { const d = i * SEG; while (j < M - 1 && cum[j + 1] < d) j++; const a = P[j], b = P[(j + 1) % M], f = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1); pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]); }
    const hd = pts.map((p, i) => { const q = pts[(i + 1) % N]; return Math.atan2(q[2] - p[2], q[0] - p[0]); });
    const turn = hd.map((h, i) => { let d = hd[(i + 1) % N] - h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; });
    const sm = turn.map((_, i) => { let s = 0; for (let k = -3; k <= 3; k++) s += turn[(i + k + N) % N]; return s / 7; });
    // put the start/finish line on a straight bit near the beginning
    let best = 0, bv = 9; for (let i = 0; i < N * .3; i++) { let m = 0; for (let k = -25; k <= 25; k++) m = Math.max(m, Math.abs(sm[(i + k + N) % N])); if (m < bv) { bv = m; best = i; } }
    const rot = (a) => a.map((_, i) => a[(i + best) % N]);
    const pos = rot(pts), hdr = rot(hd), smr = rot(sm);
    const segs = [];
    for (let i = 0; i < N; i++) {
      const p = pos[i], h = hdr[i], curve = Math.max(-5, Math.min(5, smr[i] * CURVE_K));   // + is a right-hand bend when looking along the road
      segs.push({ i, x: p[0], y: p[1], z: p[2], hd: h, fx: Math.cos(h), fz: Math.sin(h), rx: -Math.sin(h), rz: Math.cos(h), curve, turn: smr[i] });
    }
    const boxes = []; for (let seg = 100, row = 0; seg < N - 60; seg += 150, row++) [-.55, 0, .55].forEach((o) => boxes.push({ id: boxes.length, seg, o, row }));
    const pads = [], lanes = [0, -.45, .45, 0];
    for (let k = 0; k < 4; k++) { const want = Math.round(N * (.18 + .21 * k)); let bs = want, bm = 9; for (let s = want - 60; s <= want + 60; s++) { let m = 0; for (let q = 0; q < 8; q++) m = Math.max(m, Math.abs(segs[(s + q + N) % N].curve)); if (m < bm) { bm = m; bs = (s + N) % N; } } pads.push({ seg: bs, len: 6, o: lanes[k] }); }
    pads.forEach((p) => { for (let q = 0; q < p.len; q++) segs[(p.seg + q) % N].pad = p.o; });
    const T = {
      id, SEG, ROAD, RUMBLE, MAXV, n: N, L: N * SEG, segs, boxes, pads, name: D.name, theme: D.theme, sea: D.sea, def: D, laps: D.laps,
      at(z) { return segs[((Math.floor(z / SEG) % N) + N) % N]; },
      curveAt(z) { return this.at(z).curve; },
      /* a point on the road: s = distance along the lap, lat = side to side in road widths (-1 left edge ... 1 right edge) */
      point(s, lat = 0) {
        const f = (((s / SEG) % N) + N) % N, i = Math.floor(f), t = f - i, a = segs[i], b = segs[(i + 1) % N];
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t; let h = b.hd - a.hd; while (h > Math.PI) h -= 2 * Math.PI; while (h < -Math.PI) h += 2 * Math.PI; const hd = a.hd + h * t;
        const rx = -Math.sin(hd), rz = Math.cos(hd);
        return { x: x + rx * lat * ROAD, y, z: z + rz * lat * ROAD, hd, fx: Math.cos(hd), fz: Math.sin(hd), rx, rz };
      }
    };
    cache[id] = T; return T;
  }
  return { build, list: () => Object.keys(DEFS).map((k) => ({ id: k, name: DEFS[k].name, theme: DEFS[k].theme })), DEFS, SEG, ROAD, MAXV, rng };
});
