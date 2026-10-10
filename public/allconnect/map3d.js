/* ================= AllConnect 3D map =================
   Google-Maps-style Lagos: drag = pan, pinch / wheel = zoom, two-finger twist (or right-drag) = rotate,
   two-finger vertical swipe (or right-drag up/down) = tilt. Tap the ground to walk there, tap a place to open it.
   Pure canvas 2D with a tiny perspective camera (see avatar.js). No libraries. */
(function (g) {
  'use strict';
  const { Camera, Avatar } = g.ACAvatar;
  const TAU = Math.PI * 2, W = 1000, SC = 9;                 // world is 1000x1000 units, avatar scale 9 units / metre
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const $ = id => document.getElementById(id);
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (h, f) => { const c = hexRgb(h).map(v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255)); return `rgb(${c})`; };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];

  /* ---------- the world ---------- */
  const MAINLAND = [[30, 30], [970, 30], [970, 372], [900, 384], [760, 372], [610, 392], [470, 376], [330, 392], [180, 378], [30, 386]];
  const ISLAND = [[30, 566], [190, 556], [340, 574], [500, 560], [660, 578], [820, 560], [970, 572], [970, 970], [30, 970]];
  const OFFSHORE = [[868, 452], [900, 428], [946, 424], [972, 446], [972, 492], [944, 512], [896, 510], [872, 484]];   // 60 offshore island zone
  const BRIDGES = [[240, 372, 24, 204], [530, 380, 24, 190], [815, 372, 24, 200], [918, 506, 24, 66]];   // x, y, w, h (the last one is the jetty to the offshore island)
  const LAND = [MAINLAND, ISLAND, OFFSHORE];
  const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c; };
  const onBridge = (x, y) => BRIDGES.some(b => x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3]);
  const isLand = (x, y) => onBridge(x, y) || LAND.some(p => inPoly(x, y, p));

  /* name, emoji, x, y, kind, action ('home' | 'soon' | 'soon-y') */
  const PINS = [
    ['Naija Radio', '📻', 200, 150, 'radio'], ['Viewing Centre', '⚽', 280, 235, 'hall'], ['Amala Shitta', '🍲', 175, 300, 'shop'],
    ['Home', '🏠', 470, 255, 'home', 'home'], ['CcHub', '💡', 740, 190, 'glass'], ['UNILAG', '🎓', 800, 300, 'dome'],
    ['Airport · Coming soon', '✈️', 110, 100, 'airport', 'soon-y'], ['Boat Cruise', '⛵', 600, 470, 'boat'],
    ['i-Fitness', '🏋️', 440, 650, 'gym'], ['High Court', '⚖️', 220, 690, 'court'], ['The Library', '📚', 690, 665, 'hall'],
    ['Eko Hotels', '🏨', 400, 790, 'hotel'], ['Freedom Park', '🎭', 240, 810, 'park'], ['Quilox', '🌐', 640, 800, 'club'],
    ['Ivory Rooftop', '🕯', 770, 865, 'tower'], ['Eko Casino', '🎰', 360, 910, 'club'],
    /* ---- city districts 41-60: name, emoji, x, y, kind, 'district', blurb, label height ---- */
    ['Lagos Island', '⛪', 112, 632, 'li', 'district', 'old Lagos: cathedral, mosque, market lanes and packed rowhouses', 60],
    ['Victoria Island', '🏙', 565, 705, 'vi', 'district', 'commerce: banks, glass towers and company HQs', 142],
    ['Yaba Creators', '🎨', 605, 190, 'yaba', 'district', 'studios, murals, startups and the creator scene', 46],
    ['Ikeja Business', '💼', 415, 78, 'ikeja', 'district', 'offices, agencies and the mainland business centre', 108],
    ['Surulere Sports', '🥅', 100, 770, 'surulere', 'district', 'pitches, courts and the viewing-centre crowd', 40],
    ['Lekki Nightlife', '🪩', 595, 880, 'nightlife', 'district', 'clubs, lounges and neon after dark', 50],
    ['Ajah Residential', '🏘', 870, 922, 'ajah', 'district', 'estates, schools and quiet streets', 34],
    ['Agege Market', '🧺', 362, 305, 'agege', 'district', 'stalls, noise and the best bargains on the mainland', 36],
    ['Mainland Transport', '🚌', 96, 194, 'transport', 'district', 'bus terminal, BRT lane and the rail platform', 40],
    ['University Campus', '🏫', 850, 300, 'campus', 'district', 'lecture halls, hostels, library and the quad', 54],
    ['Beach Resort', '🏖', 585, 944, 'beach', 'district', 'sand, palms, huts and the resort pool', 46],
    ['Stadium District', '🏟', 140, 912, 'stadium', 'district', 'the big arena, floodlights and match-day parking', 36],
    ['Convention Centre', '🎤', 325, 706, 'convention', 'district', 'expos, conferences and a hotel tower next door', 48],
    ['Port District', '🚢', 858, 612, 'port', 'district', 'cranes, containers and ships coming in', 70],
    ['Technology Park', '💻', 895, 82, 'tech', 'district', 'glass offices, labs and solar roofs', 92],
    ['Film Village', '🎬', 552, 80, 'film', 'district', 'sound stages and a backlot street', 46],
    ['Museum Quarter', '🖼', 676, 316, 'museum', 'district', 'galleries, a sculpture garden and Nigerian history', 50],
    ['Government Quarter', '🏛', 285, 80, 'gov', 'district', 'the assembly hall, plaza and flags', 70],
    ['Rural Outskirts', '🌾', 935, 188, 'rural', 'district', 'farms, a barn and open fields', 30],
    ['Offshore Island', '🏝', 924, 466, 'offshore', 'district', 'reached by the jetty: lighthouse, villas and a marina', 70]
  ];
  /* ground tint for each district (own = generic city blocks are not built inside it) */
  const ZONES = [
    { x: 40, y: 582, w: 170, h: 98, c: '#e6d3b0', own: 1 }, { x: 490, y: 668, w: 150, h: 92, c: '#c9d6e6', own: 1 }, { x: 545, y: 150, w: 125, h: 80, c: '#ead7f2', own: 1 },
    { x: 345, y: 42, w: 140, h: 76, c: '#cfd6de', own: 1 }, { x: 40, y: 720, w: 125, h: 100, c: '#bfe3b0', own: 1 }, { x: 520, y: 845, w: 150, h: 72, c: '#7a6aa6', own: 1 },
    { x: 790, y: 888, w: 172, h: 66, c: '#d8ead2', own: 0 }, { x: 305, y: 262, w: 118, h: 84, c: '#f0d9a8', own: 1 }, { x: 40, y: 158, w: 115, h: 72, c: '#c8ccd2', own: 1 },
    { x: 760, y: 255, w: 150, h: 100, c: '#bfe0b0', own: 1 }, { x: 470, y: 926, w: 235, h: 44, c: '#f1e2b0', own: 1 }, { x: 40, y: 872, w: 205, h: 84, c: '#c9d8c4', own: 1 },
    { x: 268, y: 664, w: 125, h: 84, c: '#d6dbe6', own: 1 }, { x: 800, y: 578, w: 115, h: 68, c: '#cfd2d6', own: 1 }, { x: 830, y: 42, w: 130, h: 78, c: '#cfe8f0', own: 1 },
    { x: 497, y: 42, w: 115, h: 76, c: '#e9d0c0', own: 1 }, { x: 620, y: 268, w: 115, h: 90, c: '#e8dcc8', own: 1 }, { x: 232, y: 42, w: 105, h: 76, c: '#dfe3d4', own: 1 },
    { x: 905, y: 128, w: 60, h: 122, c: '#cfe39a', own: 1 }
  ];
  const inZone = (x, y, pad) => ZONES.some(z => z.own && x > z.x - (pad || 0) && x < z.x + z.w + (pad || 0) && y > z.y - (pad || 0) && y < z.y + z.h + (pad || 0));

  const ads = { plots: new Map(), billboards: [], n: 30 };
  const objs = [];            // standing things, depth-sorted every frame
  const flats = [];           // ground decals drawn in order
  const blocks = [];          // footprints that block walking
  const boards = [];

  function box(x, y, w, d, h, wall, roof, o) {
    o = o || {}; objs.push({ t: 'box', x, y, w, d, h, wall, roof, style: o.style || 'flat', rh: o.rh || 0, r: Math.max(w, d), o });
    if (!o.walk) blocks.push([x - w / 2 - 5, y - d / 2 - 5, x + w / 2 + 5, y + d / 2 + 5]);
  }
  function tree(x, y, s) { objs.push({ t: 'tree', x, y, s: s || 1, r: 12, c: pick(['#3f8f4a', '#2f7d3f', '#4c9c52', '#378443']) }); }


  /* ---------- city districts 41-60: what each one is made of (x, y = the pin) ---------- */
  const D = (x, y, w, d, h, wall, roof, st, rh, walk) => box(x, y, w, d, h, wall, roof, { style: st || 'flat', rh: rh || 0, walk: !!walk });
  const pad = (x, y, w, h, c) => flats.push({ c, r: [x, y, w, h] });
  const mast = (x, y, h) => objs.push({ t: 'mast', x, y, h, r: 5 });
  const GLASS = ['#7fb7e0', '#8fc4e8', '#9fd0f2', '#6fa8d8'], WARM = ['#e8505b', '#2f6fd8', '#f2a93b', '#2fa36b', '#8e5bd1'];
  const BUILD = {
    li(x, y) {                                                   // 41 Lagos Island
      D(x, y, 56, 40, 44, '#efe7d6', '#3d6fa8', 'hip', 20); D(x - 6, y - 36, 12, 12, 72, '#e8dcc2', '#3d6fa8', 'hip', 14); D(x + 62, y - 6, 38, 34, 28, '#f4efe3', '#2f9e6e', 'dome');
      for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) { const hx = 56 + i * 46, hy = 598 + j * 44; if (Math.hypot(hx - x, hy - y) < 52 || Math.hypot(hx - (x + 62), hy - (y - 6)) < 44) continue; D(hx, hy, 16, 14, 14 + rnd() * 14, pick(['#f2e3c4', '#e8c9a0', '#dcc1a8']), pick(['#b3392b', '#8b6b3e', '#a4452c']), 'hip', 7); }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D(50 + i * 14, 648 + j * 11, 9, 7, 7, '#f6f1e6', pick(WARM), 'hip', 3, true);   // market stalls
      pad(40, 666, 170, 10, '#b4b8bd');
    },
    vi(x, y) {                                                   // 42 Victoria Island
      [[-60, -14, 100], [0, -14, 142], [60, -14, 96], [-60, 36, 84], [0, 36, 120], [60, 36, 74]].forEach(([dx, dy, h], i) => D(x + dx, y + dy, 26, 26, h, GLASS[i % 4], '#cfe6f8'));
      pad(x - 90, y + 8, 180, 12, '#b4b8bd');
    },
    yaba(x, y) {                                                 // 43 Yaba creator district
      D(x, y, 58, 42, 30, '#f5a3c7', '#7a3ea1'); D(x - 42, y - 20, 30, 26, 24, '#ffd24a', '#c0392b', 'hip', 8); D(x + 42, y - 20, 30, 26, 24, '#8fd3c7', '#2f6fd8');
      D(x - 42, y + 24, 30, 24, 20, '#c9a3f5', '#7a3ea1'); D(x + 42, y + 24, 30, 24, 20, '#f59a5b', '#8e2530', 'hip', 8); pad(x - 26, y + 26, 52, 8, '#f2c94c');
    },
    ikeja(x, y) {                                                // 44 Ikeja business district
      D(x, y, 52, 46, 96, '#b9c7d6', '#8397ad'); D(x - 40, y - 12, 30, 26, 70, '#cdd8e3', '#8397ad'); D(x + 40, y - 12, 30, 26, 80, '#b9c7d6', '#9fb0c2'); D(x - 40, y + 20, 30, 20, 46, '#d8dfe6', '#8c8f94'); D(x + 40, y + 22, 30, 18, 58, '#cdd8e3', '#8397ad');
    },
    surulere(x, y) {                                             // 45 Surulere sports district
      pad(48, 728, 70, 44, '#5db85f'); pad(82, 728, 2, 44, '#ffffff'); pad(124, 732, 34, 26, '#e0824a'); pad(124, 744, 34, 2, '#ffffff');
      D(x, y + 18, 70, 18, 18, '#d9d9de', '#e8505b'); D(x + 44, y + 28, 30, 22, 20, '#e8505b', '#8e2530'); mast(54, 724, 46); mast(112, 724, 46);
    },
    nightlife(x, y) {                                            // 46 Lekki nightlife
      D(x, y, 54, 40, 34, '#2a1f48', '#ff4fb0'); D(x - 50, y - 8, 36, 30, 28, '#241a3d', '#37d6ff'); D(x + 55, y - 8, 34, 30, 30, '#2a1f48', '#ffd24a');
      D(x - 38, y + 26, 34, 18, 18, '#241a3d', '#7cff6b'); D(x + 38, y + 26, 40, 18, 20, '#241a3d', '#ff9a3c'); mast(x - 74, y - 28, 40); mast(x + 76, y - 28, 40);
    },
    ajah(x, y) {                                                 // 47 Ajah residential
      D(x, y, 44, 26, 22, '#f2e9d8', '#3f8f6a', 'hip', 12); D(x - 34, y + 8, 34, 28, 30, '#f4efe3', '#8b2d22', 'hip', 16); D(x + 48, y + 4, 50, 26, 18, '#f6e5b3', '#c0392b', 'hip', 10); pad(x - 60, y - 22, 150, 6, '#c9ccd0');
    },
    agege(x, y) {                                                // 48 Agege market
      D(x, y, 70, 40, 22, '#e9b872', '#c0392b', 'hip', 12);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { const sx = 318 + i * 22, sy = 278 + j * 26; if (Math.hypot(sx - x, sy - y) < 46) continue; D(sx, sy, 14, 10, 8, '#f6f1e6', pick(WARM), 'hip', 4, true); }
    },
    transport(x, y) {                                            // 49 mainland transport
      D(x, y, 80, 34, 24, '#cfd8e0', '#2f6fd8'); pad(44, 214, 108, 6, '#6d7075'); pad(44, 222, 108, 3, '#8b8f94');
      for (let i = 0; i < 4; i++) D(58 + i * 26, 178, 20, 9, 9, '#ffd24a', '#c9a227', 'flat', 0, true);
      D(138, 196, 20, 14, 14, '#e8505b', '#8e2530', 'flat', 0, true);
    },
    campus(x, y) {                                               // 50 university campus
      pad(842, 262, 64, 34, '#7fc16f'); D(x, y + 26, 60, 30, 34, '#f0e4cf', '#7b3f2a', 'hip', 20); D(x + 36, y - 8, 26, 38, 24, '#ead4c8', '#8c8f94'); D(x + 36, y + 40, 26, 22, 22, '#ead4c8', '#8c8f94');
      D(820, 340, 40, 26, 24, '#efe9dc', '#2f6fd8', 'dome'); tree(860, 280, 1); tree(890, 270, 1.1); tree(876, 296, .9);
    },
    beach(x, y) {                                                // 51 beach resort
      D(x, y, 70, 30, 30, '#fff3dc', '#2fb6c8', 'hip', 16); pad(612, 960, 40, 8, '#4fc3f7');
      [490, 520, 650, 680].forEach(hx => D(hx, 942, 14, 14, 12, '#f2d9a6', '#e6a84d', 'hip', 6, true));
      [[500, 962], [534, 958], [640, 962], [690, 958]].forEach(([ux, uy], i) => D(ux, uy, 8, 8, 10, '#ffffff', WARM[i % 5], 'hip', 4, true));
      [[482, 934], [545, 932], [625, 934], [698, 934], [560, 964]].forEach(([tx, ty]) => tree(tx, ty, 1.1));
    },
    stadium(x, y) {                                              // 52 stadium district
      pad(95, 899, 94, 26, '#4caf50'); pad(140, 899, 2, 26, '#ffffff'); pad(44, 880, 28, 70, '#9ca0a6');
      D(x, 886, 120, 14, 24, '#d9d9de', '#e8505b'); D(x, 938, 120, 14, 24, '#d9d9de', '#e8505b'); D(82, y, 14, 50, 24, '#d9d9de', '#e8505b'); D(202, y, 14, 50, 24, '#d9d9de', '#e8505b');
      [[78, 884], [206, 884], [78, 942], [206, 942]].forEach(([mx, my]) => mast(mx, my, 62));
    },
    convention(x, y) {                                           // 53 convention centre
      D(x, y, 100, 50, 30, '#dfe6f0', '#2f6fd8'); D(x, y - 30, 60, 14, 22, '#9fd0f2', '#cfe6f8'); D(375, 730, 26, 26, 70, '#d9e8f2', '#8fb4cf'); pad(276, 724, 62, 20, '#b0b4ba'); mast(284, 680, 44); mast(366, 680, 44);
    },
    port(x, y) {                                                 // 54 port district
      const cc = ['#d94f2b', '#2f6fd8', '#f2a93b', '#2fa36b'];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) { D(818 + i * 20, 590 + j * 16, 16, 12, 8 + (i + j) % 3 * 6, cc[(i + j * 2) % 4], '#555a61'); D(886 + i * 20, 590 + j * 16, 16, 12, 8 + (i * 2 + j) % 3 * 6, cc[(i + j + 1) % 4], '#555a61'); }
      D(868, 634, 40, 14, 18, '#d4d8dc', '#8c8f94'); mast(852, 600, 70); mast(872, 600, 70); mast(868, 622, 56); objs.push({ t: 'boat', x: 858, y: 536, r: 30 });
    },
    tech(x, y) {                                                 // 55 technology park
      D(x, y, 46, 46, 92, '#7fb7e0', '#9fd0f2'); D(852, 66, 30, 26, 50, '#cfe6f8', '#9fd0f2'); D(942, 66, 28, 26, 60, '#8fc4e8', '#cfe6f8'); D(852, 102, 34, 20, 28, '#cfe6f8', '#2f6fd8'); D(942, 104, 28, 18, 24, '#cfe6f8', '#2f6fd8'); pad(884, 108, 30, 8, '#2b5d9e');
    },
    film(x, y) {                                                 // 56 film village
      D(x, y, 60, 40, 26, '#c9c4b6', '#8a3b2a'); D(520, 62, 30, 24, 22, '#d9cdb6', '#a4452c'); D(590, 60, 30, 24, 22, '#c9c4b6', '#8c8f94');
      ['#e9a3a3', '#a3c9e9', '#e9d9a3', '#a3e9b8'].forEach((c, i) => D(528 + i * 20, 106, 16, 8, 16 + i % 2 * 6, c, '#8c8f94')); pad(542, 98, 30, 6, '#c0392b'); mast(498, 46, 52);
    },
    museum(x, y) {                                               // 57 cultural museum quarter
      pad(628, 276, 100, 28, '#8fcf7f'); D(x, y, 76, 40, 34, '#efe6d3', '#7b3f2a', 'hip', 20); D(640, 342, 34, 20, 22, '#e7d9bb', '#a4452c', 'hip', 10); D(712, 342, 34, 20, 22, '#e7d9bb', '#a4452c', 'hip', 10);
      [650, 676, 702].forEach((sx, i) => D(sx, 290, 6, 6, 12 + i * 3, '#b0743c', '#b0743c', 'flat', 0, true));
    },
    gov(x, y) {                                                  // 58 government quarter
      D(x, y, 70, 44, 40, '#efe9dc', '#2f9e6e', 'dome'); D(252, 60, 24, 24, 24, '#e7d9bb', '#a4452c', 'hip', 10); D(318, 60, 24, 24, 24, '#e7d9bb', '#a4452c', 'hip', 10); pad(262, 104, 46, 12, '#cfc8b4'); mast(268, 108, 60); mast(300, 108, 60);
    },
    rural(x, y) {                                                // 59 rural outskirts
      for (let i = 0; i < 50; i += 10) { pad(910 + i, 134, 6, 30, i % 20 ? '#d9c25a' : '#b9d36a'); pad(910 + i, 168, 6, 24, i % 20 ? '#b9d36a' : '#9bc85a'); }
      D(x, 222, 30, 22, 20, '#b3392b', '#6b2218', 'hip', 12); D(950, 206, 10, 10, 34, '#d8dbe0', '#9aa3ab'); D(925, 202, 22, 16, 14, '#f2e9d8', '#8c3b2a', 'hip', 8); tree(912, 242, 1.1); tree(954, 240, 1); tree(932, 120, 1);
    },
    offshore(x, y) {                                             // 60 offshore island
      flats.push({ c: '#f1e2b0', p: [[884, 460], [914, 440], [948, 438], [962, 458], [960, 488], [936, 500], [900, 496], [886, 480]] });
      D(950, 452, 14, 14, 64, '#f4f4f4', '#d9402b'); D(908, 470, 24, 18, 14, '#fff3dc', '#2fb6c8', 'hip', 8); D(934, 484, 22, 16, 14, '#fff3dc', '#e6a84d', 'hip', 8);
      pad(902, 500, 40, 6, '#8b6d44'); [[894, 456], [920, 450], [958, 480], [902, 486], [944, 470]].forEach(([tx, ty]) => tree(tx, ty, 1)); objs.push({ t: 'boat', x: 836, y: 468, r: 30 });
    }
  };

  function build() {
    seed = 7; objs.length = flats.length = blocks.length = boards.length = 0;
    // parks
    flats.push({ c: '#8cc277', p: [[620, 40], [760, 40], [760, 120], [620, 120]] });
    ZONES.forEach(z => flats.push({ c: z.c, r: [z.x, z.y, z.w, z.h] }));
    // road grid
    const roadsX = [], roadsY = [];
    for (let i = 0; i < 9; i++) roadsX.push(100 + i * 100);
    [[70, 160, 250, 360]].forEach(() => { });
    const ys1 = [120, 240, 350], ys2 = [640, 750, 860, 940];
    ys1.forEach(y => flats.push({ c: '#b4b8bd', r: [30, y - 7, 940, 14], clipLand: 0 }));
    ys2.forEach(y => flats.push({ c: '#b4b8bd', r: [30, y - 7, 940, 14], clipLand: 1 }));
    roadsX.forEach(x => { flats.push({ c: '#b4b8bd', r: [x - 7, 30, 14, 350], clipLand: 0 }); flats.push({ c: '#b4b8bd', r: [x - 7, 575, 14, 390], clipLand: 1 }); });
    // landmarks
    const LM = { radio: [30, 30, 70, '#e9e4d6', '#c0392b', 'flat', 0, 1], hall: [64, 44, 34, '#e7d9bb', '#a4452c', 'hip', 18], shop: [40, 32, 24, '#f2d58a', '#d94f2b', 'hip', 12],
      home: [48, 40, 30, '#f1e6cf', '#b3392b', 'hip', 20], glass: [52, 52, 80, '#7fb7e0', '#9fd0f2', 'flat'], dome: [74, 50, 40, '#efe9dc', '#2f6fd8', 'dome'],
      airport: [120, 50, 28, '#dfe3e6', '#9aa3ab', 'flat'], gym: [58, 44, 34, '#e8505b', '#8e2530', 'flat'], court: [66, 46, 36, '#f3efe6', '#8b2d22', 'hip', 22],
      hotel: [46, 46, 110, '#d9e8f2', '#8fb4cf', 'flat'], club: [60, 46, 40, '#3a2a55', '#d640a8', 'flat'], tower: [40, 40, 100, '#e9dcc0', '#d9a93a', 'flat'], boat: null, park: null };
    PINS.forEach(p => {
      if (p[5] === 'district') return;
      const [nm, em, x, y, k] = p, L = LM[k];
      if (k === 'park') { flats.push({ c: '#7fbf6d', p: [[x - 70, y - 50], [x + 70, y - 50], [x + 70, y + 50], [x - 70, y + 50]] });
        for (let i = 0; i < 9; i++) tree(x - 60 + rnd() * 120, y - 40 + rnd() * 80); box(x, y - 30, 40, 14, 10, '#c9a77a', '#8d6b3e', { style: 'flat' }); return; }
      if (k === 'boat') { objs.push({ t: 'boat', x, y, r: 30 }); flats.push({ c: '#8b6d44', r: [x - 130, y + 52 - 7, 100, 14], dock: 1 }); return; }
      box(x, y, L[0], L[1], L[2], L[3], L[4], { style: L[5], rh: L[6] || 0, pin: 1, tag: k });
      if (k === 'radio') objs.push({ t: 'mast', x: x + 12, y, h: 150, r: 6 });
    });
    // airport runway decal
    flats.push({ c: '#6d7075', r: [30, 130, 220, 18] }); flats.push({ c: '#6d7075', r: [160, 40, 14, 90] });
    // generic city blocks
    const pals = ['#e7e9ea', '#dfe3e6', '#f0e2c9', '#d8dfe6', '#ead4c8', '#e3e0d3', '#cfd8e0', '#f2eee2'], roofs = ['#b0b6bb', '#9c3b22', '#c0b9a6', '#a4aeb8', '#8c8f94'];
    const near = (x, y, r) => PINS.some(p => Math.hypot(p[2] - x, p[3] - y) < r);
    for (let cx = 150; cx < 970; cx += 100) {
      for (const [y0, y1] of [[40, 120], [130, 240], [250, 350], [585, 640], [650, 750], [760, 860], [870, 940]]) {
        const cy = (y0 + y1) / 2 + 6;
        if (!isLand(cx - 50, cy) || !isLand(cx + 40, cy)) continue;
        if (cx > 590 && cx < 780 && cy < 130) continue;            // park
        if (cx > 690 && cy > 640 && cy < 970) continue;            // Lekki estate drawn below
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const w = 24 + rnd() * 34, d = 24 + rnd() * 30, x = cx - 40 + (i + .5) * (80 / n) + (rnd() - .5) * 6, y = cy + (rnd() - .5) * ((y1 - y0) - d - 20);
          if (near(x, y, 62) || inZone(x, y, 10) || !isLand(x, y) || !isLand(x - w / 2, y + d / 2)) continue;
          box(x, y, w, d, 16 + rnd() * rnd() * 70, pick(pals), pick(roofs), { style: rnd() < .22 ? 'hip' : 'flat', rh: 8 });
        }
      }
    }
    // Lekki estate: grid of small houses
    for (let x = 720; x < 960; x += 30) for (let y = 650; y < 950; y += 32) {
      if (near(x, y, 60) || inZone(x, y, 6) || (y > 625 && Math.abs(((y - 650) % 96) - 0) < 1)) continue;
      if ((Math.floor((y - 650) / 32)) % 3 === 2) continue;      // lanes
      box(x, y, 18, 18, 12, pick(['#f2e9d8', '#e8d3b9', '#dbe6ee']), pick(['#3f8f6a', '#2e8b57', '#36996a']), { style: 'hip', rh: 7 });
    }
    flats.push({ c: '#c9ccd0', r: [700, 790, 270, 10], clipLand: 1 });
    // trees
    for (let i = 0; i < 260; i++) { const x = 40 + rnd() * 920, y = 40 + rnd() * 930; if (!isLand(x, y) || near(x, y, 55) || inZone(x, y, 2)) continue; if (blocks.some(b => x > b[0] - 6 && x < b[2] + 6 && y > b[1] - 6 && y < b[3] + 6)) continue; if (flats.some(f => f.r && f.c === '#b4b8bd' && x > f.r[0] - 4 && x < f.r[0] + f.r[2] + 4 && y > f.r[1] - 4 && y < f.r[1] + f.r[3] + 4)) continue; tree(x, y, .8 + rnd() * .6); }
    // advert boards along the road edge (like the real Lagos)
    [[130, 126], [380, 246], [600, 356], [880, 126], [160, 646], [520, 756], [380, 866], [860, 756], [680, 946]].forEach(([x, y], i) => { boards.push({ x, y, mega: i % 4 === 0 }); objs.push({ t: 'board', x, y, r: 14, mega: i % 4 === 0, idx: i }); blocks.push([x - 14, y - 6, x + 14, y + 6]); });
    PINS.forEach(p => { if (p[5] === 'district' && BUILD[p[4]]) BUILD[p[4]](p[2], p[3]); });
    buildGrid();
  }

  /* ---------- walking grid + A* ---------- */
  const CELL = 20, GN = W / CELL; let grid = new Uint8Array(GN * GN);
  function buildGrid() {
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = (i + .5) * CELL, y = (j + .5) * CELL;
      grid[j * GN + i] = (!isLand(x, y) || blocks.some(b => x > b[0] && x < b[2] && y > b[1] && y < b[3])) ? 1 : 0;
    }
  }
  const cellOf = (x, y) => [clamp(Math.floor(x / CELL), 0, GN - 1), clamp(Math.floor(y / CELL), 0, GN - 1)];
  function nearestFree(i, j) {
    if (!grid[j * GN + i]) return [i, j];
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < GN && b < GN && !grid[b * GN + a]) return [a, b];
    }
    return null;
  }
  function los(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (CELL / 2));
    for (let k = 1; k <= n; k++) { const c = cellOf(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n); if (grid[c[1] * GN + c[0]]) return false; }
    return true;
  }
  function findPath(x0, y0, x1, y1) {
    const s = nearestFree(...cellOf(x0, y0)), e = nearestFree(...cellOf(x1, y1)); if (!s || !e) return null;
    const idx = (a, b) => b * GN + a, open = [idx(...s)], came = new Map(), cost = new Map([[idx(...s), 0]]), goal = idx(...e);
    const hf = n => Math.hypot((n % GN) - e[0], Math.floor(n / GN) - e[1]);
    const f = new Map([[open[0], hf(open[0])]]);
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (f.get(open[i]) < f.get(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0]; if (cur === goal) break;
      const cx = cur % GN, cy = Math.floor(cur / GN);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const a = cx + di, b = cy + dj; if (a < 0 || b < 0 || a >= GN || b >= GN || grid[idx(a, b)]) continue;
        if (di && dj && (grid[idx(cx + di, cy)] || grid[idx(cx, cy + dj)])) continue;
        const n = idx(a, b), nc = cost.get(cur) + (di && dj ? 1.414 : 1);
        if (!cost.has(n) || nc < cost.get(n)) { cost.set(n, nc); came.set(n, cur); f.set(n, nc + hf(n)); if (!open.includes(n)) open.push(n); }
      }
    }
    if (!came.has(goal) && goal !== idx(...s)) return null;
    const pts = []; for (let n = goal; n !== undefined; n = came.get(n)) pts.push([(n % GN + .5) * CELL, (Math.floor(n / GN) + .5) * CELL]);
    pts.reverse(); pts[0] = [x0, y0];
    const out = [pts[0]]; let a = 0;                     // string-pull
    while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !los(pts[a][0], pts[a][1], pts[b][0], pts[b][1])) b--; out.push(pts[b]); a = b; }
    return out;
  }

  /* ---------- state ---------- */
  const M = { cv: null, ctx: null, cam: null, on: false, raf: 0, last: 0, w: 0, h: 0, dpr: 1, D: 300, tD: 300, follow: true, me: null, others: new Map(), hits: [], emote: null, path: null, pi: 0, dest: null, vel: [0, 0] };
  const cam = new Camera({ F: 500, tilt: .95, yaw: 0, D: 300 }); M.cam = cam;
  const getS = () => (typeof S !== 'undefined' ? S : null), getNET = () => (typeof NET !== 'undefined' ? NET : null);
  const gx = () => (getS() && getS().gender) || 'male';

  /* ---------- drawing helpers ---------- */
  const tmp = { x: 0, y: 0, z: 0, k: 1 };
  const NEAR = 25;
  function poly(ctx, pts, fill, stroke) {                 // pts: [[x,y,z]...] world; clips against the near plane
    const P = []; let any = false;
    const zs = pts.map(p => { cam.project(p[0], p[1], p[2], tmp); return tmp.z; });
    const v = []; for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length, a = pts[i], b = pts[j], za = zs[i], zb = zs[j];
      if (za >= NEAR) v.push(a);
      if ((za >= NEAR) !== (zb >= NEAR)) { const t = (NEAR - za) / (zb - za); v.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
    if (v.length < 3) return;
    ctx.beginPath(); let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    v.forEach((p, i) => { cam.project(p[0], p[1], p[2], tmp); if (tmp.x < minx) minx = tmp.x; if (tmp.x > maxx) maxx = tmp.x; if (tmp.y < miny) miny = tmp.y; if (tmp.y > maxy) maxy = tmp.y; i ? ctx.lineTo(tmp.x, tmp.y) : ctx.moveTo(tmp.x, tmp.y); });
    if (maxx < -20 || minx > M.w + 20 || maxy < -20 || miny > M.h + 20) return;
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  const rect = (x, y, w, h, z) => [[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]];

  function drawBox(ctx, o) {
    const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y - o.d / 2, y1 = o.y + o.d / 2, h = o.h;
    const faces = [[[x0, y0], [x1, y0], 0, -1, .0], [[x1, y0], [x1, y1], 1, 0, -.12], [[x1, y1], [x0, y1], 0, 1, -.22], [[x0, y1], [x0, y0], -1, 0, -.1]];
    ctx.lineJoin = 'round'; ctx.lineWidth = 1;
    for (const f of faces) {
      const cx = (f[0][0] + f[1][0]) / 2, cy = (f[0][1] + f[1][1]) / 2;
      if ((cam.px - cx) * f[2] + (cam.py - cy) * f[3] <= 0) continue;
      poly(ctx, [[f[0][0], f[0][1], 0], [f[1][0], f[1][1], 0], [f[1][0], f[1][1], h], [f[0][0], f[0][1], h]], mix(o.wall, f[4] - .04), 'rgba(0,0,0,.18)');
      if (o.o.tag === 'glass' || o.h > 60) {                            // window bands
        for (let z = 8; z < h - 4; z += 10) poly(ctx, [[f[0][0], f[0][1], z], [f[1][0], f[1][1], z], [f[1][0], f[1][1], z + 3.5], [f[0][0], f[0][1], z + 3.5]], 'rgba(40,70,100,.28)');
      }
      if (o.o.pin && o.style !== 'tower') {                                // door
        const t0 = .42, t1 = .58; if (f[2] === 0 && f[3] === 1) poly(ctx, [[f[0][0] + (f[1][0] - f[0][0]) * t0, f[0][1], 0], [f[0][0] + (f[1][0] - f[0][0]) * t1, f[0][1], 0], [f[0][0] + (f[1][0] - f[0][0]) * t1, f[0][1], 12], [f[0][0] + (f[1][0] - f[0][0]) * t0, f[0][1], 12]], '#4a2f1c');
      }
    }
    if (o.style === 'hip') {                                            // pyramid roof
      const ap = [o.x, o.y, h + (o.rh || 10)], c = [[x0 - 2, y0 - 2], [x1 + 2, y0 - 2], [x1 + 2, y1 + 2], [x0 - 2, y1 + 2]];
      const sh = [-.05, -.2, -.28, -.12];
      for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4], cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, nx = Math.sign(cx - o.x) * (Math.abs(cx - o.x) > Math.abs(cy - o.y) ? 1 : 0), ny = Math.sign(cy - o.y) * (Math.abs(cy - o.y) >= Math.abs(cx - o.x) ? 1 : 0);
        if ((cam.px - cx) * nx + (cam.py - cy) * ny <= -40 * 0) poly(ctx, [[a[0], a[1], h], [b[0], b[1], h], ap], mix(o.roof, sh[i]), 'rgba(0,0,0,.2)'); }
      // draw all four (cheap) so no gaps appear when the view is almost top-down
    } else {
      poly(ctx, rect(x0, y0, o.w, o.d, h), mix(o.roof, .0), 'rgba(0,0,0,.25)');
      if (o.style === 'dome') { const c = cam.project(o.x, o.y, h + 6, {}), r = o.w * .34 * c.k; ctx.beginPath(); ctx.arc(c.x, c.y - r * .35, r, 0, TAU); ctx.fillStyle = o.roof; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke(); }
      else if (o.h < 60) poly(ctx, rect(x0 + 5, y0 + 5, o.w - 10, o.d - 10, h + 1.5), mix(o.roof, -.12));
      if (o.o.tag === 'tower') { const c = cam.project(o.x, o.y, h + 3, {}); ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(2, 6 * c.k), 0, TAU); ctx.fill(); }
    }
  }
  function drawTree(ctx, o) {
    const b = cam.project(o.x, o.y, 0, {}), t = cam.project(o.x, o.y, 14 * o.s, {}), r = 7.5 * o.s * b.k;
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = Math.max(1, 2.2 * b.k); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(t.x, t.y - r * .15, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(t.x - r * .3, t.y - r * .45, r * .55, 0, TAU); ctx.fill();
  }
  function drawBoard(ctx, o) {
    const w = o.mega ? 56 : 40, h = o.mega ? 28 : 20, z0 = 22;
    const b = cam.project(o.x, o.y, 0, {}); ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(1.2, 2.2 * b.k);
    [-1, 1].forEach(s => { const a = cam.project(o.x + s * w * .3, o.y, 0, {}), c = cam.project(o.x + s * w * .3, o.y, z0, {}); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke(); });
    const A = cam.project(o.x - w / 2, o.y, z0 + h, {}), B = cam.project(o.x + w / 2, o.y, z0 + h, {}), C = cam.project(o.x - w / 2, o.y, z0, {});
    const front = cam.py > o.y;                              // face the south side
    poly(ctx, [[o.x - w / 2, o.y, z0], [o.x + w / 2, o.y, z0], [o.x + w / 2, o.y, z0 + h], [o.x - w / 2, o.y, z0 + h]], front ? (o.mega ? '#7a4bd8' : '#1f6fd0') : '#6b6f75', '#0b2a55');
    if (front) {
      const D = { x: B.x + C.x - A.x, y: B.y + C.y - A.y };
      M.hits.push({ x: Math.min(A.x, B.x, C.x, D.x), y: Math.min(A.y, B.y, C.y, D.y), w: Math.max(A.x, B.x, C.x, D.x) - Math.min(A.x, B.x, C.x, D.x), h: Math.max(A.y, B.y, C.y, D.y) - Math.min(A.y, B.y, C.y, D.y), kind: 'board', idx: o.idx });
    }
    if (front && b.k > .9) {                                 // text mapped onto the face
      const ad = ads.billboards.length ? ads.billboards[o.idx % ads.billboards.length] : null;
      const px = (B.x - A.x) / 120, py = (B.y - A.y) / 120, qx = (C.x - A.x) / 60, qy = (C.y - A.y) / 60;
      ctx.save(); ctx.transform(px, py, qx, qy, A.x, A.y); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      if (ad) { ctx.font = '800 15px Outfit,system-ui,sans-serif'; ctx.fillText(String(ad.title || 'Ad').slice(0, 20), 60, 28); ctx.font = '600 9px system-ui,sans-serif'; ctx.fillText('Sponsored · tap to open', 60, 44); }
      else { ctx.font = '800 17px Outfit,system-ui,sans-serif'; ctx.fillText('YOUR AD HERE', 60, 28); ctx.font = '600 9px system-ui,sans-serif'; ctx.fillText('Phone → Ads', 60, 44); }
      ctx.restore();
    }
  }
  function drawBoat(ctx, o, t) {
    const bob = Math.sin(t * 1.6 + o.x) * 1.2, h = Math.PI / 2 * .0;
    const hull = [[-26, -9], [20, -9], [30, 0], [20, 9], [-26, 9]].map(p => [o.x + p[0], o.y + p[1], 2 + bob]);
    poly(ctx, hull, '#f4f1ea', 'rgba(0,0,0,.3)'); poly(ctx, hull.map(p => [p[0] * .8 + o.x * .2, p[1] * .8 + o.y * .2, p[2] + 6]), '#dfe5ea');
    const m = cam.project(o.x + 2, o.y, 3 + bob, {}), t2 = cam.project(o.x + 2, o.y, 36 + bob, {});
    ctx.strokeStyle = '#444'; ctx.lineWidth = Math.max(1, 1.5 * m.k); ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(t2.x, t2.y); ctx.stroke();
    poly(ctx, [[o.x + 2, o.y, 34 + bob], [o.x + 2, o.y, 12 + bob], [o.x + 22, o.y, 12 + bob]], '#e8505b');
  }
  function drawMast(ctx, o) {
    const a = cam.project(o.x, o.y, 0, {}), b = cam.project(o.x, o.y, o.h, {});
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = Math.max(1.2, 2.4 * a.k); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(1.5, 3 * a.k), 0, TAU); ctx.fill();
  }

  function drawPlots(ctx) {
    for (let i = 0; i < ads.n; i++) {
      const col = i % 10, row = Math.floor(i / 10), x = 282 + col * 23, y = 410 + row * 44, ad = ads.plots.get(i);
      const q = rect(x, y, 19, 36, 1.5);
      poly(ctx, q, ad ? '#ffffff' : 'rgba(255,255,255,.2)', ad ? '#1f6fd0' : 'rgba(255,255,255,.5)');
      const c = cam.project(x + 9.5, y + 18, 1.6, {}); if (c.z < NEAR || c.x < -30 || c.x > M.w + 30 || c.y < -30 || c.y > M.h + 30) continue;
      if (ad) { let h = 0; for (const ch of String(ad.title || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; poly(ctx, rect(x + 2, y + 2, 15, 32, 1.7), `hsl(${h},65%,52%)`); if (c.k > 1.1) { ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(Math.min(26, 11 * c.k))}px Outfit,system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(ad.title || '📢').trim().charAt(0).toUpperCase(), c.x, c.y); } }
      const xs = q.map(p => cam.project(p[0], p[1], 1.5, {})); const x0 = Math.min(...xs.map(p => p.x)), x1 = Math.max(...xs.map(p => p.x)), y0 = Math.min(...xs.map(p => p.y)), y1 = Math.max(...xs.map(p => p.y));
      M.hits.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'plot', slot: i });
    }
  }

  function drawWorld(ctx, t) {
    // sea
    const sg = ctx.createLinearGradient(0, 0, 0, M.h); sg.addColorStop(0, '#6db4e6'); sg.addColorStop(.5, '#3d9ad8'); sg.addColorStop(1, '#2b86c9');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, M.w, M.h);
    const dep = (p, z, c) => poly(ctx, p.map(q => [q[0], q[1], z]), c);
    // wave sparkle
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
    if (cam.D < 900) for (let i = 0; i < 70; i++) {
      const x = (i * 137.5) % W, y = (i * 311.7) % W + Math.sin(t * .8 + i) * 3; if (isLand(x, y) || isLand(x + 14, y)) continue;
      const a = cam.project(x, y, 0, tmp); if (tmp.z < NEAR || tmp.x < -30 || tmp.x > M.w + 30 || tmp.y < -10 || tmp.y > M.h + 10) continue;
      const b = cam.project(x + 14, y, 0, {}); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // land thickness then land
    LAND.forEach(p => { dep(p, -9, '#6b7d4b'); });
    LAND.forEach(p => { poly(ctx, p.map(q => [q[0], q[1], -4.5]), '#8aa05f'); });
    LAND.forEach(p => { poly(ctx, p.map(q => [q[0], q[1], 0]), '#a9c88c'); });
    // lagoon bridges
    BRIDGES.forEach(b => { poly(ctx, rect(b[0] - 2, b[1], b[2] + 4, b[3], -2), '#6f7378'); poly(ctx, rect(b[0], b[1], b[2], b[3], 1.2), '#8a8f95'); });
    // decals
    for (const f of flats) {
      if (f.p) poly(ctx, f.p.map(q => [q[0], q[1], .3]), f.c);
      else if (f.r) { if (f.dock) poly(ctx, rect(f.r[0], f.r[1], f.r[2], f.r[3], .8), f.c); else poly(ctx, rect(f.r[0], f.r[1], f.r[2], f.r[3], .4), f.c); }
    }
    drawPlots(ctx);
    BRIDGES.forEach(b => { ctx.setLineDash([]); for (let y = b[1] + 6; y < b[1] + b[3] - 6; y += 18) poly(ctx, rect(b[0] + b[2] / 2 - .6, y, 1.2, 8, 1.4), 'rgba(255,255,255,.75)'); });
  }

  /* ---------- characters ---------- */
  function hashStr(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 100003; return h; }
  function walkable(x, y) { const c = cellOf(x, y); return !grid[c[1] * GN + c[0]]; }
  function spawnPoint(h) { for (let k = 0; k < 60; k++) { const a = (h + k * 977) % 9973, x = 60 + (a * 7) % 880, y = 60 + (a * 13) % 880; if (walkable(x, y)) return [x, y]; } return [470, 300]; }
  function ensureMe() {
    const gender = gx();
    if (!M.me || M.me.g !== gender) { const old = M.me; M.me = new Avatar(gender, M.look && M.look.g === gender ? { look: M.look } : {}); M.me.setExt(M.ext || {}); M.me.scale = SC; const n = nearestFree(...cellOf(470, 290)) || [23, 14]; M.me.x = old ? old.x : (n[0] + .5) * CELL; M.me.y = old ? old.y : (n[1] + .5) * CELL; M.me.h = old ? old.h : Math.PI / 2; }
  }
  function setPlayers(list) {
    const keep = new Set(), myName = getNET() && getNET().user && getNET().user.displayName;
    (list || []).filter(p => p.name !== myName).slice(0, 30).forEach(p => {
      keep.add(p.name); let o = M.others.get(p.name);
      const ls = p.l ? JSON.stringify(p.l) : '';
      if (o && o.ls !== ls) { o.ls = ls; o.av.setLook(p.l || ACAvatar.defaultRender(o.av.g, { top: o.top })); }       // someone changed their look (or their privacy)
      if (!o) { const h = hashStr(p.name), sp = spawnPoint(h), top = ['#d9b24a', '#2f9e63', '#d6455a', '#3a7bd5', '#8e5bd1', '#f08a3c'][h % 6], av = new Avatar(p.l && p.l.g ? p.l.g : p.g === 'female' || p.g === 'male' ? p.g : (h % 2 ? 'female' : 'male'), p.l ? { look: p.l } : { top });
        av.x = sp[0]; av.y = sp[1]; av.h = (h % 628) / 100; av.dance = h % 4; o = { av, name: p.name, next: 2 + (h % 7), h, ls, top }; M.others.set(p.name, o); }
    });
    for (const k of [...M.others.keys()]) if (!keep.has(k)) M.others.delete(k);
  }
  function updateOthers(dt) {
    for (const o of M.others.values()) {
      const a = o.av; o.next -= dt;
      if (o.next <= 0) { const r = Math.random(); o.next = 3 + Math.random() * 7;
        if (r < .35) { a.setState('dance'); a.dance = Math.floor(Math.random() * 4); } else if (r < .5) a.setState('wave'); else if (r < .8) { const ang = Math.random() * TAU, d = 30 + Math.random() * 60, tx = a.x + Math.cos(ang) * d, ty = a.y + Math.sin(ang) * d; if (walkable(tx, ty) && los(a.x, a.y, tx, ty)) o.go = [tx, ty]; a.setState('idle'); } else a.setState('idle'); }
      if (o.go) { const dx = o.go[0] - a.x, dy = o.go[1] - a.y, d = Math.hypot(dx, dy); if (d < 2) { o.go = null; a.setState('idle'); } else { const sp = 32 * dt; a.x += dx / d * Math.min(sp, d); a.y += dy / d * Math.min(sp, d); a.h = turn(a.h, Math.atan2(dy, dx), dt * 8); a.speed = 1.4; a.setState('walk'); } }
      a.update(dt);
    }
  }
  function turn(a, b, k) { let d = ((b - a + Math.PI * 3) % TAU) - Math.PI; return a + d * Math.min(1, k); }

  function walkTo(x, y, cb) {
    ensureMe(); const p = findPath(M.me.x, M.me.y, x, y);
    if (!p || p.length < 2) { M.path = null; M.dest = null; return false; }
    M.path = p; M.pi = 1; M.cb = cb || null; M.dest = p[p.length - 1]; M.emote = null; M.run = p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0) > 320; M.follow = true; return true;
  }
  function updateMe(dt) {
    const a = M.me; if (!a) return;
    if (M.path && M.pi < M.path.length) {
      const tg = M.path[M.pi], dx = tg[0] - a.x, dy = tg[1] - a.y, d = Math.hypot(dx, dy), sp = (M.run ? 95 : 48) * dt;
      if (d <= sp) { a.x = tg[0]; a.y = tg[1]; M.pi++; if (M.pi >= M.path.length) { M.path = null; a.setState('idle'); a.speed = 0; if (M.cb) { const c = M.cb; M.cb = null; c(); } } }
      else { a.x += dx / d * sp; a.y += dy / d * sp; a.h = turn(a.h, Math.atan2(dy, dx), dt * 10); }
      if (M.path) { a.speed = M.run ? 3.4 : 1.5; a.setState(M.run ? 'run' : 'walk'); }
    } else if (M.emote) { if (a.state !== M.emote) a.setState(M.emote); if (M.emote === 'dance' && getS() && getS().needs) { getS().needs[2] = Math.min(1, getS().needs[2] + dt * .012); } }
    else if (a.state === 'walk' || a.state === 'run') a.setState('idle');
    a.update(dt);
    if (M.follow && cam) { const k = 1 - Math.exp(-dt * 3.2); cam.tx += (a.x - cam.tx) * k; cam.ty += (a.y - cam.ty) * k; }
  }

  /* ---------- frame ---------- */
  function frame(now) {
    if (!M.on) return; M.raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - M.last) / 1000 || .016); M.last = now; const t = now / 1000;
    ensureMe();
    // zoom easing + inertia
    const dz = M.tD - M.D; if (Math.abs(dz) > .01) { const before = M.zoomAt ? (cam.update(), cam.pick(M.zoomAt[0], M.zoomAt[1], 0)) : null; M.D += dz * (1 - Math.exp(-dt * 10)); cam.D = M.D; cam.update(); if (before) { const after = cam.pick(M.zoomAt[0], M.zoomAt[1], 0); if (after) { cam.tx += before.x - after.x; cam.ty += before.y - after.y; } } }
    if (!M.drag && (Math.abs(M.vel[0]) + Math.abs(M.vel[1]) > .05)) { cam.tx += M.vel[0] * dt; cam.ty += M.vel[1] * dt; const f = Math.exp(-dt * 4); M.vel[0] *= f; M.vel[1] *= f; }
    updateMe(dt); updateOthers(dt);
    cam.tx = clamp(cam.tx, 0, W); cam.ty = clamp(cam.ty, 0, W); cam.update();
    draw(t);
    const cp = $('mpCompass'); if (cp) cp.firstElementChild.style.transform = `rotate(${-cam.yaw}rad)`;
  }
  function draw(t) {
    const ctx = M.ctx; ctx.setTransform(M.dpr, 0, 0, M.dpr, 0, 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    M.hits = []; drawWorld(ctx, t);
    // collect visible standing things
    const list = [], m = 90;
    for (const o of objs) {
      const p = cam.project(o.x, o.y, 0, tmp); if (tmp.z < NEAR) continue; const rr = (o.r + (o.h || 40)) * tmp.k + m;
      if (tmp.x < -rr || tmp.x > M.w + rr || tmp.y < -rr * 1.5 || tmp.y > M.h + rr) continue;
      if (o.t === 'tree' && cam.D > 800) continue;
      list.push([tmp.z, o]);
    }
    const A = [M.me]; for (const o of M.others.values()) A.push(o.av);
    for (const a of A) { cam.project(a.x, a.y, 0, tmp); if (tmp.z >= NEAR && tmp.x > -60 && tmp.x < M.w + 60 && tmp.y > -80 && tmp.y < M.h + 80) list.push([tmp.z - 4, a]); }
    list.sort((p, q) => q[0] - p[0]);
    const tags = [];
    for (const [, o] of list) {
      if (o instanceof Avatar) { const info = o.draw(ctx, cam, SC); if (info.h > 24) tags.push([o, info]); continue; }
      if (o.t === 'box') drawBox(ctx, o); else if (o.t === 'tree') drawTree(ctx, o); else if (o.t === 'board') drawBoard(ctx, o); else if (o.t === 'boat') drawBoat(ctx, o, t); else if (o.t === 'mast') drawMast(ctx, o);
    }
    // destination marker
    if (M.dest && M.path) { const d = cam.project(M.dest[0], M.dest[1], .5, {}), r = (7 + Math.sin(t * 6) * 1.5) * d.k * 1.4; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(d.x, d.y, r * 1.4, r * .7, 0, 0, TAU); ctx.stroke(); }
    // name tags
    ctx.font = '600 11px "Plus Jakarta Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [a, info] of tags) {
      const nm = a === M.me ? 'You' : [...M.others.values()].find(o => o.av === a).name; const w = ctx.measureText(nm).width + 14, x = info.x, y = info.top - 10;
      ctx.fillStyle = a === M.me ? '#22b573' : 'rgba(27,34,54,.82)'; rr(ctx, x - w / 2, y - 9, w, 18, 9); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(nm, x, y + .5);
      if (a !== M.me) M.hits.push({ x: x - w / 2, y: y - 9, w, h: info.h + 20, name: nm, kind: 'player' });
    }
    // pin labels
    ctx.font = '700 12px "Plus Jakarta Sans",system-ui,sans-serif';
    for (const p of PINS) {
      const [nm, em, x, y, kind, act] = p, hh = p[7] || { radio: 72, hall: 36, shop: 26, home: 54, glass: 82, dome: 56, airport: 30, gym: 36, court: 58, hotel: 112, club: 42, tower: 102, boat: 40, park: 20 }[kind] || 30;
      const b = cam.project(x, y, hh + 10, tmp); if (tmp.z < NEAR || tmp.x < -80 || tmp.x > M.w + 80 || tmp.y < 40 || tmp.y > M.h + 40) continue;
      if ((cam.D > 1100 || (act === 'district' && cam.D > 650)) && kind !== 'home') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tmp.x, tmp.y, 11, 0, TAU); ctx.fill(); ctx.font = '13px system-ui'; ctx.fillStyle = '#000'; ctx.fillText(em, tmp.x, tmp.y + 1); ctx.font = '700 12px "Plus Jakarta Sans",system-ui,sans-serif'; M.hits.push({ x: tmp.x - 12, y: tmp.y - 12, w: 24, h: 24, pin: p, kind: 'pin' }); continue; }
      const label = em + ' ' + nm, w = ctx.measureText(label).width + 18, px = tmp.x, py = tmp.y - 10;
      ctx.fillStyle = act === 'soon-y' ? '#ffd60a' : 'rgba(250,250,253,.96)'; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      rr(ctx, px - w / 2, py - 12, w, 24, 12); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.beginPath(); ctx.moveTo(px - 5, py + 11.5); ctx.lineTo(px + 5, py + 11.5); ctx.lineTo(px, py + 17); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1b1f33'; ctx.fillText(label, px, py + 1);
      M.hits.push({ x: px - w / 2, y: py - 12, w, h: 30, pin: p, kind: 'pin' });
    }
    // night tint from the in-game clock
    const hrs = ((getS() && getS().min) || 720) / 60 % 24, night = hrs >= 19.5 || hrs < 5.5 ? 1 : hrs >= 18 ? (hrs - 18) / 1.5 : hrs < 7 ? (7 - hrs) / 1.5 : 0;
    if (night > 0) { ctx.fillStyle = `rgba(10,20,70,${.27 * night})`; ctx.fillRect(0, 0, M.w, M.h); }
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ---------- input ---------- */
  const ptrs = new Map();
  function rectXY(e) { const r = M.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function zoomBy(f, at) { M.tD = clamp(M.tD * f, 80, 1500); M.zoomAt = at || [M.w / 2, M.h / 2]; }
  function onDown(e) {
    M.cv.setPointerCapture(e.pointerId); const [x, y] = rectXY(e); ptrs.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now(), btn: e.button });
    M.vel = [0, 0];
    if (ptrs.size === 1) { M.drag = { mode: (e.button === 2 || e.ctrlKey || e.shiftKey) ? 'rot' : 'pan', anchor: cam.pick(x, y, 0), moved: 0, lx: x, ly: y }; }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; M.pin = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2, mx: (a.x + b.x) / 2, anchor: cam.pick((a.x + b.x) / 2, (a.y + b.y) / 2, 0) }; M.drag = null; }
    e.preventDefault();
  }
  function onMove(e) {
    const p = ptrs.get(e.pointerId); if (!p) return; const [x, y] = rectXY(e), px = p.x, py = p.y; p.x = x; p.y = y;
    if (ptrs.size === 1 && M.drag) {
      const d = M.drag; d.moved += Math.abs(x - d.lx) + Math.abs(y - d.ly);
      if (d.mode === 'rot') { cam.yaw += (x - d.lx) * .008; cam.tilt = clamp(cam.tilt + (y - d.ly) * .005, 0, 1.15); cam.update(); }
      else if (d.moved > 6) { M.follow = false; cam.update(); const q = cam.pick(x, y, 0); if (q && d.anchor) { const dx = d.anchor.x - q.x, dy = d.anchor.y - q.y; cam.tx += dx; cam.ty += dy; M.vel = [dx * 50, dy * 50]; cam.update(); } }
      d.lx = x; d.ly = y;
    } else if (ptrs.size === 2 && M.pin) {
      const [a, b] = [...ptrs.values()], pn = M.pin, dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dyA = a.y - (a === p ? py : a.y), dyB = b.y - (b === p ? py : b.y);
      const rot = ((ang - pn.a + Math.PI * 3) % TAU) - Math.PI, sc = dist / pn.d, parallel = Math.abs(rot) < .08 && Math.abs(sc - 1) < .08 && Math.abs(my - pn.my) > Math.abs(mx - pn.mx);
      M.follow = false;
      if (parallel && (Math.abs(a.y - a.sy) > 14 || pn.tilting)) { pn.tilting = true; cam.tilt = clamp(cam.tilt - (dyA + dyB) / 2 * .006, 0, 1.15); cam.update(); }
      else {
        cam.yaw -= (rot) * 1; M.D = M.tD = clamp(M.D / sc, 80, 1500); cam.D = M.D; cam.update();
        const q = cam.pick(mx, my, 0); if (q && pn.anchor) { cam.tx += pn.anchor.x - q.x; cam.ty += pn.anchor.y - q.y; cam.update(); }
        pn.d = dist; pn.a = ang;
      }
      pn.my = my; pn.mx = mx; pn.d = dist; pn.a = ang;
    }
    e.preventDefault();
  }
  function onUp(e) {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (p && ptrs.size === 0 && M.drag && M.drag.mode === 'pan' && M.drag.moved < 8 && performance.now() - p.t < 450) tap(p.x, p.y);
    if (ptrs.size < 2) M.pin = null; if (ptrs.size === 0) M.drag = null;
    if (ptrs.size === 1) { const r = [...ptrs.values()][0]; M.drag = { mode: 'pan', anchor: cam.pick(r.x, r.y, 0), moved: 99, lx: r.x, ly: r.y }; }
  }
  function tap(x, y) {
    const hit = [...M.hits].reverse().find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (hit && hit.kind === 'pin') {
      const [nm, em, px, py, , act] = hit.pin;
      if (act === 'home') return g.nav('home');
      if (act === 'district') { g.toast(`${em} ${nm}: ${hit.pin[6]}`); for (const [dx, dy] of [[0, 40], [0, -40], [48, 0], [-48, 0], [0, 72], [0, -72], [80, 0], [-80, 0]]) if (walkTo(px + dx, py + dy)) break; return; }
      g.toast(`${em} ${nm.replace(' · Coming soon', '')} ${act === 'soon-y' ? 'is coming soon' : 'opens soon'}`);
      walkTo(px, py + 40); return;
    }
    if (hit && hit.kind === 'plot') { const ad = ads.plots.get(hit.slot); if (ad && g.ADS) g.ADS.goPlot(hit.slot); else g.toast('🌊 Free sea plot · book it in Phone → Ads'); return; }
    if (hit && hit.kind === 'board') { const n = ads.billboards.length, ad = n ? ads.billboards[hit.idx % n] : null; if (ad && g.ADS) g.ADS.go(ad); else { g.nav('phone'); setTimeout(() => g.PH && g.PH.open('ads'), 0); } return; }
    if (hit && hit.kind === 'player') { g.toast('👤 ' + hit.name); return; }
    const q = cam.pick(x, y, 0); if (!q) return;
    if (!isLand(q.x, q.y)) return g.toast('🌊 Can’t walk on water — use a bridge');
    if (!walkTo(q.x, q.y)) g.toast('Can’t get there');
  }
  function onWheel(e) {
    e.preventDefault(); const [x, y] = rectXY(e);
    if (e.shiftKey) { cam.yaw += e.deltaY * .003; cam.update(); return; }
    zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? .01 : .0016)), [x, y]);
  }
  function onKey(e) {
    if (!M.on || /input|textarea/i.test(e.target.tagName)) return;
    const k = e.key; if (k === '+' || k === '=') zoomBy(.8); else if (k === '-') zoomBy(1.25); else if (k === 'q') { cam.yaw -= .15; cam.update(); } else if (k === 'e') { cam.yaw += .15; cam.update(); }
    else if (k.startsWith('Arrow')) { M.follow = false; const s = cam.D * .08, c = Math.cos(cam.yaw), n = Math.sin(cam.yaw); const dx = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0, dy = k === 'ArrowUp' ? 1 : k === 'ArrowDown' ? -1 : 0; cam.tx += (dx * c + dy * n) * s; cam.ty += (dx * n - dy * c) * s; cam.update(); }
  }

  /* ---------- public API ---------- */
  function resize() {
    const box = $('map'); if (!box || !M.cv) return; M.dpr = Math.min(2, g.devicePixelRatio || 1);
    M.w = box.clientWidth; M.h = box.clientHeight; M.cv.width = M.w * M.dpr; M.cv.height = M.h * M.dpr; cam.cx = M.w / 2; cam.cy = M.h * .56; cam.F = Math.max(M.w, M.h * .6) * 1.15; cam.update();
  }
  const API = {
    init() {
      if (M.cv) return; build(); M.cv = $('mapCv'); M.ctx = M.cv.getContext('2d');
      M.cv.addEventListener('pointerdown', onDown); M.cv.addEventListener('pointermove', onMove); M.cv.addEventListener('pointerup', onUp); M.cv.addEventListener('pointercancel', onUp);
      M.cv.addEventListener('wheel', onWheel, { passive: false }); M.cv.addEventListener('contextmenu', e => e.preventDefault()); g.addEventListener('keydown', onKey); g.addEventListener('resize', resize);
      ensureMe(); cam.tx = M.me.x; cam.ty = M.me.y; cam.yaw = 0; cam.tilt = .95; M.D = M.tD = 240; cam.D = 240;
    },
    show() { API.init(); M.on = true; resize(); cancelAnimationFrame(M.raf); M.last = performance.now(); M.raf = requestAnimationFrame(frame); },
    hide() { M.on = false; cancelAnimationFrame(M.raf); },
    zoom(f) { zoomBy(f); },
    rotate(a) { cam.yaw += a; cam.update(); },
    tilt(a) { cam.tilt = clamp(cam.tilt + a, 0, 1.15); cam.update(); },
    toggleTilt() { cam.tilt = cam.tilt > .5 ? 0 : .95; cam.update(); },
    resetNorth() { cam.yaw = 0; cam.update(); },
    recenter() { M.follow = true; M.tD = Math.min(M.tD, 240); },
    setAds(b) { ads.plots = new Map((b.plots || []).map(p => [p.slot, p])); ads.billboards = b.billboards || []; ads.n = (b.config && b.config.sea && b.config.sea.plots) || 30; },
    /* the player's own look and personal styles from the Style app */
    setLook(r) { M.look = r; if (M.me && r) M.me.setLook(r); },
    setExt(e) { M.ext = e || {}; if (M.me) M.me.setExt(M.ext); },
    setPlayers, setEmote(e) { M.emote = e; if (e) { M.path = null; if (M.me) { if (e === 'dance') M.me.nextDance(); else M.me.setState(e); } } else if (M.me) M.me.setState('idle'); },
    get me() { return M.me; }, get state() { return M }
  };
  g.MAP3D = API;
})(window);
