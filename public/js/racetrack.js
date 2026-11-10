/* Drive Race: the track. One definition used by the game screen (to draw it) and by the server (lap length, bends for the bots, item boxes).
   The track is a loop of 200-unit segments, each with a bend and a height, so both sides always agree on exactly where everything is. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RaceTrack = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const SEG = 200, ROAD = 2000, RUMBLE = 3, MAXV = 11000;
  const ZONES = [
    { id: 'marina', name: 'Marina', from: 0,    grass: ['#2f9a5a', '#2a8d52'], road: ['#5b5f6a', '#555966'], sky: ['#6ab6ee', '#cdeafc'], water: false },
    { id: 'island', name: 'Lekki Beach', from: .25, grass: ['#e8d28f', '#dcc682'], road: ['#5d606a', '#575a66'], sky: ['#78c2f0', '#d6f0fb'], water: false },
    { id: 'market', name: 'Mile 12 Market', from: .5, grass: ['#b88b57', '#ad814e'], road: ['#585b66', '#525561'], sky: ['#8cbfe0', '#e6e2d2'], water: false },
    { id: 'bridge', name: 'Third Mainland', from: .75, grass: ['#2b82b8', '#2778ab'], road: ['#62666f', '#5c606a'], sky: ['#5fa9e6', '#c4e4f8'], water: true }
  ];
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const easeIn = (a, b, p) => a + (b - a) * p * p;
  const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + .5);

  let cached = null;
  function build() {
    if (cached) return cached;
    const segs = [], K = 1.35;
    let lastY = 0;
    const add = (curve, y) => { segs.push({ i: segs.length, curve, y1: lastY, y2: y }); lastY = y; };
    // [enter, hold, leave, curve, hill]: the hills add up to zero, so the loop closes at the same height
    const road = (en, hold, lv, curve, hill) => {
      en = Math.round(en * K); hold = Math.round(hold * K); lv = Math.round(lv * K);
      const y0 = lastY, y1 = y0 + hill * SEG, tot = en + hold + lv;
      for (let n = 0; n < en; n++) add(easeIn(0, curve, n / en), easeInOut(y0, y1, n / tot));
      for (let n = 0; n < hold; n++) add(curve, easeInOut(y0, y1, (en + n) / tot));
      for (let n = 0; n < lv; n++) add(easeInOut(curve, 0, n / lv), easeInOut(y0, y1, (en + hold + n) / tot));
    };
    road(50, 0, 0, 0, 0);            // the grid
    road(25, 25, 25, 2, 0);          // gentle right
    road(20, 30, 20, 0, 40);         // climb
    road(30, 40, 30, -4, 0);         // tight left
    road(25, 25, 25, 3, -20);        // S
    road(25, 25, 25, -3, 0);
    road(30, 120, 30, 0, -20);       // long straight with boost pads
    road(40, 60, 40, 4, 10);         // right sweeper
    road(30, 30, 30, -2, -30);       // downhill
    road(15, 15, 15, 3, 0);          // chicane
    road(15, 15, 15, -3, 0);
    road(15, 15, 15, 3, 0);
    road(50, 80, 50, -3, 0);         // long left
    road(40, 100, 40, 0, 20);        // the finishing straight
    const n = segs.length;
    // colour and scenery
    const R = rng(20261102), zoneOf = (i) => { const f = i / n; let z = ZONES[0]; for (const q of ZONES) if (f >= q.from) z = q; return z; };
    segs.forEach((s) => {
      s.zone = zoneOf(s.i); s.spr = [];
      const z = s.zone.id;
      if (s.i % 4 === 0 && R() < .8) {
        const side = R() < .5 ? -1 : 1, off = side * (1.35 + R() * 1.9), r = R();
        let k;
        if (z === 'marina') k = r < .35 ? 'tower' : r < .6 ? 'lamp' : r < .8 ? 'palm' : 'board';
        else if (z === 'island') k = r < .5 ? 'palm' : r < .7 ? 'umbrella' : r < .85 ? 'hut' : 'board';
        else if (z === 'market') k = r < .35 ? 'shack' : r < .6 ? 'stall' : r < .8 ? 'lamp' : r < .9 ? 'busstop' : 'board';
        else k = r < .55 ? 'lamp' : r < .75 ? 'pillar' : 'rail';
        if (z === 'bridge' && (k === 'rail')) { s.spr.push({ k: 'rail', o: -1.12 }, { k: 'rail', o: 1.12 }); } else s.spr.push({ k, o: off });
      }
    });
    // item boxes: rows of three, one row about every 150 segments
    const boxes = []; for (let seg = 100, row = 0; seg < n - 60; seg += 150, row++) [-.55, 0, .55].forEach((o, j) => boxes.push({ id: boxes.length, seg, o, row }));
    // boost pads
    const pads = [{ seg: Math.round(n * .27), len: 6, o: .0 }, { seg: Math.round(n * .46), len: 6, o: -.45 }, { seg: Math.round(n * .66), len: 6, o: .45 }, { seg: Math.round(n * .83), len: 6, o: 0 }];
    pads.forEach((p) => { for (let k = 0; k < p.len; k++) segs[p.seg + k].pad = p.o; });
    cached = { SEG, ROAD, RUMBLE, MAXV, n, L: n * SEG, segs, boxes, pads, ZONES, name: 'Lagos Grand Prix',
      at(z) { return segs[((Math.floor(z / SEG) % n) + n) % n]; },
      curveAt(z) { return this.at(z).curve; },
      zoneAt(z) { return this.at(z).zone; } };
    return cached;
  }
  return { build, SEG, ROAD, MAXV, rng };
});
