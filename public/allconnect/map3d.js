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

  /* ---------- the world ----------
     Lagos's geometry below (coastline, bridges, pins, ground tints) is kept exactly as it was, just renamed with a
     _LAGOS suffix; MAINLAND/ISLAND/OFFSHORE/BRIDGES/PINS/ZONES/LAND are now `let`s pointing at whichever city is
     active, reassigned (and the world rebuilt) by loadCity() near the CITIES registry below. Nothing that reads
     these names elsewhere in the file had to change — they still resolve to "the current city" either way. */
  const MAINLAND_LAGOS = [[30, 30], [970, 30], [970, 372], [900, 384], [760, 372], [610, 392], [470, 376], [330, 392], [180, 378], [30, 386]];
  const ISLAND_LAGOS = [[30, 566], [190, 556], [340, 574], [500, 560], [660, 578], [820, 560], [970, 572], [970, 970], [30, 970]];
  const OFFSHORE_LAGOS = [[868, 452], [900, 428], [946, 424], [972, 446], [972, 492], [944, 512], [896, 510], [872, 484]];   // 60 offshore island zone
  const BRIDGES_LAGOS = [[240, 372, 24, 204], [530, 380, 24, 190], [815, 372, 24, 200], [918, 506, 24, 66]];   // x, y, w, h (the last one is the jetty to the offshore island)
  let MAINLAND = MAINLAND_LAGOS, ISLAND = ISLAND_LAGOS, OFFSHORE = OFFSHORE_LAGOS, BRIDGES = BRIDGES_LAGOS;
  let LAND = [MAINLAND, ISLAND, OFFSHORE];
  const inPoly = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c; };
  const onBridge = (x, y) => BRIDGES.some(b => x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3]);
  const isLand = (x, y) => onBridge(x, y) || LAND.some(p => inPoly(x, y, p));

  /* name, emoji, x, y, kind, action ('home' | 'soon' | 'soon-y') */
  const PINS_LAGOS = [
    ['Naija Radio', '📻', 200, 150, 'radio'], ['Viewing Centre', '⚽', 280, 235, 'hall'], ['Amala Shitta', '🍲', 175, 300, 'shop'],
    ['Home', '🏠', 470, 255, 'home', 'home'], ['CcHub', '💡', 740, 190, 'glass'], ['UNILAG', '🎓', 800, 300, 'dome'],
    ['Airport', '✈️', 110, 100, 'airport'], ['Refinery · Coming soon', '🛢️', 88, 330, 'refinery', 'soon-y'], ['Boat Cruise', '⛵', 600, 470, 'boat'],
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
  let PINS = PINS_LAGOS;
  /* ---------- player homes, placed by chosen neighbourhood ----------
     Each onboarding "hood" (utils/achub.js on the server) gets a cluster of numbered house spots here, centred on
     the district that matches its vibe — Ikorodu and Epe aren't separate districts on this map, so Ikorodu's houses
     sit by the port (its waterside community) and Epe's sit out in the rural outskirts (its quiet lagoon-side town).
     `cap` must match the server's NEIGHBOURHOODS cap for that hood: it's how many houses fit before new movers start
     sharing the last spot — small for a spacious, prominent area like Lekki, larger for a denser, affordable one. */
  const HOOD_HOMES = {
    yaba: { x: 605, y: 190, cap: 36 }, surulere: { x: 100, y: 770, cap: 42 }, lekki: { x: 595, y: 880, cap: 18 },
    ikeja: { x: 415, y: 78, cap: 36 }, ajah: { x: 870, y: 922, cap: 60 }, ikorodu: { x: 858, y: 612, cap: 60 }, epe: { x: 935, y: 188, cap: 54 }
  };
  const homeSlotCache = {};
  function hoodSlotXY(hood, slot) {                   // the nth house in that hood's cluster: rings of spots spiralling out from its anchor point
    const def = HOOD_HOMES[hood]; if (!def) return null;
    let pts = homeSlotCache[hood];
    if (!pts) {
      pts = []; const step = 24;
      for (let ring = 0; pts.length < def.cap && ring < 14; ring++) {
        if (ring === 0) { if (isLand(def.x, def.y)) pts.push([def.x, def.y]); continue; }
        const n = ring * 8;
        for (let i = 0; i < n && pts.length < def.cap; i++) {
          const a = (i / n) * TAU, x = def.x + Math.cos(a) * ring * step, y = def.y + Math.sin(a) * ring * step;
          if (x < 30 || x > 970 || y < 30 || y > 970 || !isLand(x, y)) continue;
          pts.push([x, y]);
        }
      }
      homeSlotCache[hood] = pts;
    }
    return pts[clamp(slot | 0, 0, pts.length - 1)] || [def.x, def.y];
  }

  /* ground tint for each district (own = generic city blocks are not built inside it) */
  const ZONES_LAGOS = [
    { x: 40, y: 582, w: 170, h: 98, c: '#e6d3b0', own: 1 }, { x: 490, y: 668, w: 150, h: 92, c: '#c9d6e6', own: 1 }, { x: 545, y: 150, w: 125, h: 80, c: '#ead7f2', own: 1 },
    { x: 345, y: 42, w: 140, h: 76, c: '#cfd6de', own: 1 }, { x: 40, y: 720, w: 125, h: 100, c: '#bfe3b0', own: 1 }, { x: 520, y: 845, w: 150, h: 72, c: '#7a6aa6', own: 1 },
    { x: 790, y: 888, w: 172, h: 66, c: '#d8ead2', own: 0 }, { x: 305, y: 262, w: 118, h: 84, c: '#f0d9a8', own: 1 }, { x: 40, y: 158, w: 115, h: 72, c: '#c8ccd2', own: 1 },
    { x: 760, y: 255, w: 150, h: 100, c: '#bfe0b0', own: 1 }, { x: 470, y: 926, w: 235, h: 44, c: '#f1e2b0', own: 1 }, { x: 40, y: 872, w: 205, h: 84, c: '#c9d8c4', own: 1 },
    { x: 268, y: 664, w: 125, h: 84, c: '#d6dbe6', own: 1 }, { x: 800, y: 578, w: 115, h: 68, c: '#cfd2d6', own: 1 }, { x: 830, y: 42, w: 130, h: 78, c: '#cfe8f0', own: 1 },
    { x: 497, y: 42, w: 115, h: 76, c: '#e9d0c0', own: 1 }, { x: 620, y: 268, w: 115, h: 90, c: '#e8dcc8', own: 1 }, { x: 232, y: 42, w: 105, h: 76, c: '#dfe3d4', own: 1 },
    { x: 905, y: 128, w: 60, h: 122, c: '#cfe39a', own: 1 }
  ];
  let ZONES = ZONES_LAGOS;
  const inZone = (x, y, pad) => ZONES.some(z => z.own && x > z.x - (pad || 0) && x < z.x + z.w + (pad || 0) && y > z.y - (pad || 0) && y < z.y + z.h + (pad || 0));
  let PLOT_ANCHOR = { x: 282, y: 410 };               // where this city's buyable-land grid sits (drawPlots below) — Lagos's sits out in the lagoon

  /* ================= Abuja: a second, deliberately simpler city — inland, one landmass, no bridges =================
     Real Abuja has no lagoon splitting it, so this is a single rectangle rather than Lagos's mainland + island pair,
     and the district list leans on its real quadrant layout (Three Arms Zone at the centre; Maitama/Asokoro/Wuse/
     Garki around it; Gwarinpa and Kubwa as the big satellite estates further out; Jabi for the lake). Buildings are
     generic clusters (see Object.assign(BUILD,...) above), not Lagos's one-off hand-placed dioramas — broad coverage
     over fine detail, so the map isn't mostly empty. */
  const MAINLAND_ABUJA = [[30, 30], [970, 30], [970, 970], [30, 970]];
  const PINS_ABUJA = [
    ['Home', '🏠', 500, 500, 'home', 'home'],                                             // no player ever actually lives here; kept only so setHome() has somewhere harmless to no-op into
    ['Nnamdi Azikiwe Int\'l', '✈️', 500, 905, 'airport'],
    ['National Stadium', '🏟', 180, 820, 'court'],
    ['Aso Rock View', '🏔', 760, 300, 'tower'],
    ['Jabi Lake Mall', '🛍', 250, 555, 'hall'],
    /* ---- districts ---- */
    ['Central Area', '🏛', 500, 500, 'centralArea', 'district', 'the Three Arms Zone: National Assembly, the villa and the government plaza', 70],
    ['Wuse', '🏢', 430, 350, 'wuse', 'district', 'malls, banks and the main commercial strip', 60],
    ['Garki', '🏦', 560, 650, 'garki', 'district', 'ministries, finance houses and busy roundabouts', 54],
    ['Maitama', '🌳', 380, 150, 'maitama', 'district', 'embassies, leafy avenues and big walled compounds', 46],
    ['Asokoro', '🏡', 760, 400, 'asokoro', 'district', 'the hilltop district: mansions and a quiet close', 42],
    ['Gwarinpa', '🏘', 220, 100, 'gwarinpa', 'district', 'Nigeria\'s largest housing estate: row after row of homes', 50],
    ['Kubwa', '🚏', 90, 280, 'kubwa', 'district', 'a satellite town of its own, packed and busy', 40],
    ['Jabi', '🏖', 250, 555, 'jabi', 'district', 'the lake, the mall and the boardwalk', 40],
    ['Nyanya', '🚌', 880, 700, 'nyanya', 'district', 'the motor-park end of town: loud, cheap, alive', 36]
  ];
  const ZONES_ABUJA = [
    { x: 400, y: 420, w: 220, h: 170, c: '#dfe3e6', own: 1 },                               // Central Area
    { x: 350, y: 270, w: 170, h: 120, c: '#c9d6e6', own: 1 },                               // Wuse
    { x: 470, y: 580, w: 190, h: 150, c: '#cfd6de', own: 1 },                               // Garki
    { x: 290, y: 60, w: 190, h: 140, c: '#bfe3b0', own: 1 },                                // Maitama
    { x: 670, y: 320, w: 190, h: 160, c: '#ead7f2', own: 1 },                                // Asokoro
    { x: 100, y: 30, w: 240, h: 150, c: '#f1e2b0', own: 1 },                                // Gwarinpa
    { x: 30, y: 200, w: 150, h: 180, c: '#e6d3b0', own: 1 },                                // Kubwa
    { x: 150, y: 480, w: 200, h: 150, c: '#bfe0b0', own: 1 },                                // Jabi
    { x: 780, y: 600, w: 190, h: 200, c: '#d8ead2', own: 1 }                                // Nyanya
  ];
  const PLOT_ANCHOR_ABUJA = { x: 300, y: 820 };       // buyable-land grid sits south of Garki, between it and the airport

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
  /* ---------- Abuja's districts: simpler, generic clusters (not hand-fitted the way Lagos's are) — see buildAbuja() ---------- */
  Object.assign(BUILD, {
    centralArea(x, y) {                                          // the Three Arms Zone: assembly dome flanked by two wings, plus a plaza
      D(x, y, 70, 46, 40, '#f4f1e6', '#1f6fd0', 'dome', 26); D(x - 60, y + 6, 34, 30, 30, '#eceef1', '#8397ad'); D(x + 60, y + 6, 34, 30, 30, '#eceef1', '#8397ad');
      pad(x - 90, y + 34, 180, 14, '#cfd2d6');
    },
    wuse(x, y) {                                                 // commercial mid-rises
      [[-44, -10, 70], [0, -10, 96], [44, -10, 64], [-22, 32, 42], [22, 32, 50]].forEach(([dx, dy, h], i) => D(x + dx, y + dy, 26, 24, h, GLASS[i % 4], '#cfe6f8'));
    },
    garki(x, y) {                                                // banks and ministries
      [[-40, 0, 54], [0, 0, 66], [40, 0, 48]].forEach(([dx, dy, h], i) => D(x + dx, y + dy, 30, 28, h, pick(['#d8dfe6', '#cdd8e3']), '#8397ad'));
      pad(x - 56, y + 20, 112, 10, '#b4b8bd');
    },
    maitama(x, y) {                                              // embassies and big leafy compounds
      [[-50, -14], [10, -14], [-50, 26], [10, 26]].forEach(([dx, dy]) => D(x + dx, y + dy, 34, 26, 20, pick(['#f1e6cf', '#e8dcc2', '#f4efe3']), pick(['#3f8f6a', '#2f7d3f'])));
      for (let i = 0; i < 6; i++) tree(x - 70 + rnd() * 140, y - 30 + rnd() * 60, 1);
    },
    asokoro(x, y) {                                              // hilltop mansions, bigger plots
      [[-46, -8], [20, -8], [-13, 30]].forEach(([dx, dy]) => D(x + dx, y + dy, 38, 34, 24, pick(['#f2e9d8', '#e8d3b9']), pick(['#8b2d22', '#a4452c']), 'hip', 10));
    },
    gwarinpa(x, y) {                                             // dense estate grid — Africa's largest housing estate
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) D(x - 60 + i * 40, y - 30 + j * 30, 18, 18, 14, pick(['#f2e9d8', '#dbe6ee', '#e8d3b9']), pick(['#2f7d3f', '#3f8f6a']), 'hip', 6);
    },
    kubwa(x, y) {                                                // a satellite town: smaller, closer-packed boxes
      for (let i = 0; i < 5; i++) D(x - 56 + i * 28, y + (i % 2 ? 14 : -10), 20, 18, 16 + rnd() * 20, pick(['#e7e9ea', '#dfe3e6', '#f0e2c9']), pick(['#9c3b22', '#8c8f94']));
    },
    jabi(x, y) {                                                 // the lake, a mall and the boardwalk
      flats.push({ c: '#3d9ad8', p: [[x - 70, y - 20], [x - 10, y - 34], [x + 56, y - 14], [x + 46, y + 30], [x - 30, y + 36]] });
      D(x + 70, y - 10, 40, 30, 26, '#eceef1', '#8397ad'); pad(x + 40, y + 10, 30, 8, '#8b6d44');
    },
    nyanya(x, y) {                                               // the motor-park end of town: market stalls and a bus terminal
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) D(x - 30 + i * 16, y - 18 + j * 13, 10, 8, 8, '#f6f1e6', pick(WARM), 'hip', 3, true);
      D(x + 56, y, 46, 26, 16, '#cfd4d8', '#6d7075');
    }
  });

  function buildLagos() {
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
      airport: [132, 58, 22, '#e8edf2', '#b8c2cc', 'flat'], gym: [58, 44, 34, '#e8505b', '#8e2530', 'flat'], court: [66, 46, 36, '#f3efe6', '#8b2d22', 'hip', 22],
      refinery: [48, 36, 22, '#c9ced4', '#8c8f94', 'flat'],
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
    const near = (x, y, r) => PINS.some(p => Math.hypot(p[2] - x, p[3] - y) < r);
    const hitsRoad = (x0, y0, x1, y1) => flats.some(f => f.r && f.c === '#b4b8bd' && x1 > f.r[0] && x0 < f.r[0] + f.r[2] && y1 > f.r[1] && y0 < f.r[1] + f.r[3]);  // true if that footprint would sit on top of a road strip
    // airport: terminal, apron, taxiway, parked aircraft (isometric city-map layout)
    flats.push({ c: '#9aa3ab', r: [28, 42, 210, 92] });
    flats.push({ c: '#6d7075', r: [28, 128, 268, 24] }); flats.push({ c: '#cfd4d8', r: [42, 136, 240, 5] });
    flats.push({ c: '#6d7075', r: [168, 38, 18, 96] }); flats.push({ c: '#cfd4d8', r: [174, 46, 6, 80] });
    flats.push({ c: '#d7dde2', r: [38, 48, 118, 72] });
    box(72, 68, 86, 48, 16, '#eef2f5', '#c5ccd4', { tag: 'airport' });
    box(48, 58, 22, 16, 10, '#dfe3e6', '#9aa3ab', { walk: 1 });
    box(96, 58, 22, 16, 10, '#dfe3e6', '#9aa3ab', { walk: 1 });
    box(188, 78, 42, 18, 8, '#cfd8e0', '#8c8f94', { walk: 1 });
    box(230, 92, 28, 14, 7, '#c5ccd2', '#8c8f94', { walk: 1 });
    [[58, 118, 0], [92, 122, .4], [210, 118, 3.2], [248, 140, 0]].forEach(([px, py, hdg]) => objs.push({ t: 'plane', x: px, y: py, hdg, r: 16 }));
    // refinery tanks, pipes and plant
    [[58, 312], [82, 312], [70, 334], [104, 328], [46, 336]].forEach(([tx, ty], i) => { objs.push({ t: 'tank', x: tx, y: ty, s: .95 + (i % 3) * .12, r: 14, h: 16 }); blocks.push([tx - 12, ty - 12, tx + 12, ty + 12]); });
    box(118, 318, 28, 18, 22, '#b8bec6', '#8c8f94');
    mast(52, 304, 36); mast(110, 348, 28);
    // poster / billboard wall on the east mainland (dense ad grid)
    let ps = 211; const pr = () => (ps = (ps * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 14; j++) {
      const x = 612 + i * 26 + (pr() - .5) * 3, y = 36 + j * 24 + (pr() - .5) * 3;
      if (!isLand(x, y) || near(x, y, 42) || inZone(x, y, 6)) continue;
      objs.push({ t: 'poster', x, y, r: 10, h: 14, hue: Math.floor(pr() * 360), mega: pr() < .1 });
    }
    // generic city blocks
    const pals = ['#e7e9ea', '#dfe3e6', '#f0e2c9', '#d8dfe6', '#ead4c8', '#e3e0d3', '#cfd8e0', '#f2eee2'], roofs = ['#b0b6bb', '#9c3b22', '#c0b9a6', '#a4aeb8', '#8c8f94'];
    for (let cx = 150; cx < 970; cx += 100) {
      for (const [y0, y1] of [[40, 120], [130, 240], [250, 350], [585, 640], [650, 750], [760, 860], [870, 940]]) {
        const cy = (y0 + y1) / 2 + 6;
        if (!isLand(cx - 50, cy) || !isLand(cx + 40, cy)) continue;
        if (cx > 590 && cx < 780 && cy < 130) continue;            // park
        if (cx > 690 && cy > 640 && cy < 970) continue;            // Lekki estate drawn below
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const w = 24 + rnd() * 34, d = 24 + rnd() * 30, x = cx - 40 + (i + .5) * (80 / n) + (rnd() - .5) * 6, y = cy + (rnd() - .5) * ((y1 - y0) - d - 20);
          if (near(x, y, 62) || inZone(x, y, 10) || !isLand(x, y) || !isLand(x - w / 2, y + d / 2) || hitsRoad(x - w / 2, y - d / 2, x + w / 2, y + d / 2)) continue;
          box(x, y, w, d, 16 + rnd() * rnd() * 70, pick(pals), pick(roofs), { style: rnd() < .22 ? 'hip' : 'flat', rh: 8 });
        }
      }
    }
    // Lekki estate: grid of small houses
    for (let x = 720; x < 960; x += 30) for (let y = 650; y < 950; y += 32) {
      if (near(x, y, 60) || inZone(x, y, 6) || (y > 625 && Math.abs(((y - 650) % 96) - 0) < 1) || hitsRoad(x - 9, y - 9, x + 9, y + 9)) continue;
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
    lrBuild(); lampBuild(); extendWorld();
  }

  /* Abuja's own build pipeline — same primitives as buildLagos() (box/tree/pad/D), far less hand-placed set-dressing:
     one broad road grid (no mainland/island split, so no bridges needed), the handful of named landmarks above,
     each district's generic cluster, then the same generic-block-filler and tree-scatter Lagos uses to cover the
     rest of the ground so the map doesn't read as mostly empty. */
  function buildAbuja() {
    seed = 51; objs.length = flats.length = blocks.length = boards.length = 0;
    ZONES.forEach(z => flats.push({ c: z.c, r: [z.x, z.y, z.w, z.h] }));
    const roadsX = []; for (let i = 0; i < 9; i++) roadsX.push(100 + i * 100);
    const ysA = [140, 320, 500, 680, 860];
    ysA.forEach(y => flats.push({ c: '#b4b8bd', r: [30, y - 7, 940, 14] }));
    roadsX.forEach(x => flats.push({ c: '#b4b8bd', r: [x - 7, 30, 14, 940] }));
    const LM = { airport: [132, 58, 22, '#e8edf2', '#b8c2cc', 'flat'], court: [66, 46, 36, '#f3efe6', '#8b2d22', 'hip', 22], tower: [40, 40, 100, '#e9dcc0', '#d9a93a', 'flat'], hall: [64, 44, 34, '#e7d9bb', '#a4452c', 'hip', 18] };
    PINS.forEach(p => { if (p[5] === 'district' || p[4] === 'home') return; const [, , x, y, k] = p, L = LM[k]; if (L) box(x, y, L[0], L[1], L[2], L[3], L[4], { style: L[5], rh: L[6] || 0, pin: 1, tag: k }); });
    [[460, 885, 0], [540, 895, .3]].forEach(([px, py, hdg]) => objs.push({ t: 'plane', x: px, y: py, hdg, r: 14 }));
    [[560, 460, 120], [600, 500, 150]].forEach(([tx, ty, h]) => box(tx, ty, 34, 34, h, '#8fc4e8', '#6fa8d8', { style: 'flat' }));  // a couple of CBD investment towers
    const near = (x, y, r) => PINS.some(p => Math.hypot(p[2] - x, p[3] - y) < r);
    const hitsRoad = (x0, y0, x1, y1) => flats.some(f => f.r && f.c === '#b4b8bd' && x1 > f.r[0] && x0 < f.r[0] + f.r[2] && y1 > f.r[1] && y0 < f.r[1] + f.r[3]);
    const pals = ['#e7e9ea', '#dfe3e6', '#f0e2c9', '#d8dfe6', '#ead4c8', '#e3e0d3', '#cfd8e0', '#f2eee2'], roofs = ['#b0b6bb', '#9c3b22', '#c0b9a6', '#a4aeb8', '#8c8f94'];
    for (let cx = 150; cx < 970; cx += 100) {
      for (let yi = 0; yi < ysA.length - 1; yi++) {
        const y0 = ysA[yi] + 14, y1 = ysA[yi + 1] - 14, cy = (y0 + y1) / 2;
        if (!isLand(cx - 50, cy) || !isLand(cx + 40, cy)) continue;
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const w = 24 + rnd() * 34, d = 24 + rnd() * 30, x = cx - 40 + (i + .5) * (80 / n) + (rnd() - .5) * 6, y = cy + (rnd() - .5) * ((y1 - y0) - d - 20);
          if (near(x, y, 60) || inZone(x, y, 10) || !isLand(x, y) || hitsRoad(x - w / 2, y - d / 2, x + w / 2, y + d / 2)) continue;
          box(x, y, w, d, 16 + rnd() * rnd() * 60, pick(pals), pick(roofs), { style: rnd() < .22 ? 'hip' : 'flat', rh: 8 });
        }
      }
    }
    for (let i = 0; i < 220; i++) {
      const x = 40 + rnd() * 920, y = 40 + rnd() * 930;
      if (!isLand(x, y) || near(x, y, 50) || inZone(x, y, 2) || hitsRoad(x - 6, y - 6, x + 6, y + 6)) continue;
      if (blocks.some(b => x > b[0] - 6 && x < b[2] + 6 && y > b[1] - 6 && y < b[3] + 6)) continue;
      tree(x, y, .8 + rnd() * .6);
    }
    PINS.forEach(p => { if (p[5] === 'district' && BUILD[p[4]]) BUILD[p[4]](p[2], p[3]); });
    buildGrid();
    lrBuild(); lampBuild(); extendWorld();
  }

  /* ---------- switching the active city ----------
     Lagos is who you live in (homes, hoods, the lagoon, bridges); the other tabs are places you can visit. Each
     entry reassigns every piece of geometry the rest of the file reads through the `let`s above, then reruns that
     city's own build pipeline — everything downstream (roads, A* grid, lamps, road textures, traffic) is generated
     fresh from whatever is currently assigned, so nothing here needs to know which city it's drawing. */
  const CITIES = {
    lagos: { land: [MAINLAND_LAGOS, ISLAND_LAGOS, OFFSHORE_LAGOS], bridges: BRIDGES_LAGOS, pins: PINS_LAGOS, zones: ZONES_LAGOS, plotAnchor: { x: 282, y: 410 }, build: () => buildLagos(), spawn: [470, 290] },
    abuja: { land: [MAINLAND_ABUJA], bridges: [], pins: PINS_ABUJA, zones: ZONES_ABUJA, plotAnchor: PLOT_ANCHOR_ABUJA, build: () => buildAbuja(), spawn: [500, 540] }
  };
  function loadCity(id) {
    const c = CITIES[id]; if (!c) return false;
    [MAINLAND, ISLAND, OFFSHORE] = [c.land[0], c.land[1] || [], c.land[2] || []];
    LAND = [MAINLAND, ISLAND, OFFSHORE]; BRIDGES = c.bridges; PINS = c.pins; ZONES = c.zones; PLOT_ANCHOR = c.plotAnchor;
    c.build();
    return true;
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
  const HUD = { goslow: 1, ads: 1, neighbours: 1, sea: 1, gov: 1, city: 'lagos' };
  const cam = new Camera({ F: 500, tilt: 1.02, yaw: -.28, D: 340 }); M.cam = cam;
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

  /* ---------- Lagos Run art on the map ----------
     Textures, road decals and the danfo come from the Lagos Run game (/lagosrun/assets/sprites/...):
     asphalt on the roads, potholes / manholes / puddles / litter / skid marks / zebra crossings on them,
     corrugated-zinc, red-metal and tarp roofs on the small flat-roofed buildings, and danfos driving the horizontal roads.
     Everything is optional: if an image has not loaded (or Saver mode is on) the map simply draws as before. */
  const LRA = '/lagosrun/assets/sprites/';
  const LRX = { img: {}, on: false, tiles: [], decals: [], buses: [], asph: null, started: false };
  /* ---------- Kenney road textures on top of the Lagos Run layer ----------
     Two cropped, transparent-background tiles (from the kenney_road-textures CC0 pack) laid over every road exactly
     the way lrTex() already lays the asphalt down: 'straight' repeats along each road's length (rotated 90° for a
     horizontal road vs a vertical one, since its lane-divider line has a direction), 'cross' is a single clean,
     rounded-corner 4-way junction stamped at every point two roads actually meet. Same opt-in pattern as LRX: if
     the images never load, the roads simply look the way they did before (flat colour + the Lagos Run layer). */
  const KXA = '/allconnect/assets/';
  const KX = { img: {}, on: false, started: false, straight: [], cross: [], cars: [] };
  const KX_CAR_COLS = ['red', 'green', 'orange', 'white'];      // kenney_racing-kit: four body colours, each with a front (S) and back (N) sprite
  function kxLoad() {
    if (KX.started || lrSaver()) return; KX.started = true;
    const files = [['straight', 'road-straight.png'], ['cross', 'road-cross.png']];
    KX_CAR_COLS.forEach(c => { files.push([`car-${c}-N`, `cars/${c}-N.png`], [`car-${c}-S`, `cars/${c}-S.png`]); });
    let left = files.length;
    files.forEach(([k, file]) => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { KX.img[k] = im; if (!--left) KX.on = true; };
      im.onerror = () => { left--; };
      im.src = KXA + file;
    });
  }
  const EXT = 650, GAP = 70, XLAND = [], XOBJ = [];       // the extended world: sea gap, outer land and decorative buildings beyond the playable 1000x1000
  const LAMPS = [];                                  // street lights: [x, y] world positions along both edges of every road
  const LR_FILES = { asphalt: 'textures/asphalt-seamless', zinc: 'textures/zinc-patchwork', red: 'textures/roof-red-metal', tarp: 'textures/roof-blue-tarp', cloth: 'textures/roof-clothesline', sat: 'textures/roof-satellite', tank: 'textures/roof-watertank',
    pothole: 'decals/pothole-dry', manhole: 'decals/manhole-cover', drain: 'decals/drain-grate', mud: 'decals/puddle-mud', puddle: 'decals/puddle-shallow', oil: 'decals/oil-slick', sachet: 'decals/sachet-litter', trash: 'decals/trash-scatter',
    skidA: 'decals/skid-straight-a', skidB: 'decals/skid-straight-b', zebra: 'decals/zebra-block', bus: 'buses/fresh' };
  const lrSaver = () => { try { return !!JSON.parse(localStorage.getItem('ghPrefs') || '{}').lowPower } catch (e) { return false } };
  function lrLoad() {
    if (LRX.started || lrSaver()) return; LRX.started = true;
    Object.keys(LR_FILES).forEach(k => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => {
        LRX.img[k] = im;
        if (k === 'asphalt') {                                   // the 1254px texture is shrunk once to 512px so the road tiles are cheap to draw
          const c = document.createElement('canvas'); c.width = c.height = 512; c.getContext('2d').drawImage(im, 0, 0, 512, 512); LRX.asph = c;
        }
        LRX.on = true;
      };
      im.src = LRA + LR_FILES[k] + '.webp';
    });
  }
  /* draw an image on the ground (or a roof) as a rotated w x h rectangle centred on world (wx, wy) at height z */
  function lrTex(ctx, img, wx, wy, ww, wh, z, ang, alpha, crop, clip) {
    const c = Math.cos(ang), sn = Math.sin(ang), hx = ww / 2, hy = wh / 2;
    const f = (u, v) => cam.project(wx + u * c - v * sn, wy + u * sn + v * c, z, {});
    const tl = f(-hx, -hy), tr = f(hx, -hy), bl = f(-hx, hy), br = f(hx, hy);
    if (tl.z < NEAR || tr.z < NEAR || bl.z < NEAR || br.z < NEAR) return;
    const minx = Math.min(tl.x, tr.x, bl.x, br.x), maxx = Math.max(tl.x, tr.x, bl.x, br.x), miny = Math.min(tl.y, tr.y, bl.y, br.y), maxy = Math.max(tl.y, tr.y, bl.y, br.y);
    if (maxx < 0 || minx > M.w || maxy < 0 || miny > M.h || (maxx - minx) < 1.5) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const sx = crop ? crop[0] : 0, sy = crop ? crop[1] : 0, sw = crop ? crop[2] : iw, sh = crop ? crop[3] : ih;
    ctx.save();
    if (clip) { ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath(); ctx.clip(); }
    ctx.globalAlpha = alpha;
    ctx.transform((tr.x - tl.x) / sw, (tr.y - tl.y) / sw, (bl.x - tl.x) / sh, (bl.y - tl.y) / sh, tl.x, tl.y);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
  }

  /* ---------- extended world: land and districts continue past the edges so the screen is always full when zooming out or dragging ---------- */
  function extendWorld() {
    XLAND.length = 0; XOBJ.length = 0;
    const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    XLAND.push(R(-EXT, -EXT, W + EXT, -GAP), R(-EXT, W + GAP, W + EXT, W + EXT), R(-EXT, -GAP, -GAP, W + GAP), R(W + GAP, -GAP, W + EXT, W + GAP));
    let sd = 4242; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647, pk = (a) => a[Math.floor(r() * a.length)];
    const walls = ['#e7d9bb', '#f1e6cf', '#d9e8f2', '#f2d58a', '#e9e4d6', '#c9b79c', '#dfe3e6', '#f4efe6'], roofs = ['#a4452c', '#b3392b', '#8b2d22', '#2f6fd8', '#9aa3ab', '#d94f2b', '#7a3ea1'];
    const low = lrSaver(), S = low ? 110 : 70;
    for (let gx = -EXT + 40, ci = 0; gx < W + EXT - 30; gx += S, ci++) for (let gy = -EXT + 40, cj = 0; gy < W + EXT - 30; gy += S, cj++) {
      const x = gx + (r() - .5) * 14, y = gy + (r() - .5) * 14;
      if (x > -GAP - 24 && x < W + GAP + 24 && y > -GAP - 24 && y < W + GAP + 24) continue;       // keep the playable city and its sea gap clear
      if (ci % 4 === 3 || cj % 4 === 3) continue;                                                // streets
      if (r() < .16) { XOBJ.push({ t: 'tree', x, y, s: 1 + r() * .5, r: 12, c: pk(['#3f8f4a', '#2f7d3f', '#4c9c52', '#378443']) }); continue; }
      const w = 26 + r() * 24, d = 26 + r() * 24, h = 16 + Math.pow(r(), 2) * 70, hip = r() < .45;
      XOBJ.push({ t: 'box', x, y, w, d, h, wall: pk(walls), roof: pk(roofs), style: hip ? 'hip' : 'flat', rh: hip ? 10 : 0, r: Math.max(w, d), o: {} });
    }
  }
  const inWorld = (x, y) => x >= 0 && x <= W && y >= 0 && y <= W;

  /* ---------- night look: street lights + dark-mode night ---------- */
  function lampBuild() {
    LAMPS.length = 0;
    for (const f of flats) {
      if (!f.r || f.c !== '#b4b8bd') continue;
      const [x, y, w, h] = f.r, horiz = w > h, L = horiz ? w : h, STEP = 44;
      for (let d = 18, i = 0; d < L - 8; d += STEP, i++) {
        const side = i % 2 ? 1 : -1;                                                  // alternate sides like real lamp posts
        const lx = horiz ? x + d : x + w / 2 + side * (w / 2 + 2), ly = horiz ? y + h / 2 + side * (h / 2 + 2) : y + d;
        if (isLand(lx, ly) || onBridge(lx, ly)) LAMPS.push([lx, ly]);
      }
    }
  }
  const darkTheme = () => document.documentElement.getAttribute('data-theme') === 'dark';
  let glowSprite = null;
  function glow() {                                                                  // one soft warm blob, drawn scaled for every lamp
    if (glowSprite) return glowSprite;
    // soft wide bloom only — the hot bulb core is drawn separately so a lamp reads as a bright point with a glow around it, not a flat tinted disc
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,220,140,.55)'); r.addColorStop(.3, 'rgba(255,190,90,.28)'); r.addColorStop(.65, 'rgba(255,170,60,.1)'); r.addColorStop(1, 'rgba(255,160,50,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return (glowSprite = c);
  }
  function drawLamps(ctx, amt) {
    const low = lrSaver(), spr = glow(), tmp = {}, base = {}; ctx.save();
    ctx.globalAlpha = amt; ctx.strokeStyle = '#32373c'; ctx.lineCap = 'round';          // the pole itself: drawn first, normal blending, so it reads as a solid post
    for (const [lx, ly] of LAMPS) {
      cam.project(lx, ly, 16, tmp); if (tmp.z < NEAR || tmp.x < -40 || tmp.x > M.w + 40 || tmp.y < -40 || tmp.y > M.h + 40) continue;
      cam.project(lx, ly, 0, base);
      ctx.lineWidth = clamp(2.4 * tmp.k, .6, 3.4);
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(tmp.x, tmp.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const [lx, ly] of LAMPS) {
      cam.project(lx, ly, 16, tmp); if (tmp.z < NEAR || tmp.x < -40 || tmp.x > M.w + 40 || tmp.y < -40 || tmp.y > M.h + 40) continue;
      const r = clamp(24 * tmp.k, 5, 34), bulb = Math.max(1.2, r * .09);   // smaller + softer glow (dimmed)
      ctx.globalAlpha = amt * .42;
      if (low) { ctx.fillStyle = 'rgba(255,214,120,.6)'; ctx.beginPath(); ctx.arc(tmp.x, tmp.y, bulb, 0, TAU); ctx.fill(); continue }
      ctx.drawImage(spr, tmp.x - r, tmp.y - r, r * 2, r * 2);                         // wide soft halo
      ctx.fillStyle = 'rgba(255,245,210,.7)'; ctx.beginPath(); ctx.arc(tmp.x, tmp.y, bulb, 0, TAU); ctx.fill();   // small hot bulb at the centre, atop the pole
    }
    ctx.restore();
  }
  /* called once at the end of build(): lay out asphalt tiles, road decals and danfos (own random stream, so the rest of the city is unchanged) */
  function lrBuild() {
    let sd = 99; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    LRX.tiles = []; LRX.decals = []; LRX.buses = []; KX.straight = []; KX.cross = []; KX.cars = [];
    const roads = flats.filter(f => f.r && f.c === '#b4b8bd');
    const KINDS = [['pothole', 6, 6, 3], ['manhole', 5, 5, 3], ['drain', 6, 6, 2], ['mud', 8, 7, 2], ['puddle', 9, 8, 2], ['oil', 8, 7, 1], ['sachet', 6, 5, 2], ['trash', 7, 6, 2], ['skidA', 3, 16, 2], ['skidB', 3.6, 16, 2]];
    const tot = KINDS.reduce((a, k) => a + k[3], 0);
    const pickKind = () => { let v = r() * tot; for (const k of KINDS) { v -= k[3]; if (v <= 0) return k; } return KINDS[0]; };
    for (const f of roads) {
      const [x, y, w, h] = f.r, horiz = w > h, L = horiz ? w : h, T = 14;
      for (let d = 0; d < L; d += T) {
        const tw = horiz ? Math.min(T, L - d) : w, th = horiz ? h : Math.min(T, L - d), cx = horiz ? x + d + tw / 2 : x + w / 2, cy = horiz ? y + h / 2 : y + d + th / 2;
        if (!isLand(cx, cy)) continue;
        LRX.tiles.push({ x: cx, y: cy, w: tw + .8, h: th + .8, sx: Math.floor(r() * 384), sy: Math.floor(r() * 384) });
        // same chunk, but as a Kenney straight-road stamp: its lane line has a direction, so swap which way it faces for a horizontal vs a vertical road.
        // each tile is only an approximate (affine, not true-perspective) warp of a flat square, so neighbouring tiles don't line up pixel-for-pixel at
        // the seam between them under tilt — padding generously along the tiling direction (not across it, or the road would look wider than it is)
        // makes consecutive tiles overlap enough that the mismatch is hidden under the overlap instead of showing as a gap or a jagged edge.
        const cross = horiz ? th : tw, along = horiz ? tw : th;
        KX.straight.push({ x: cx, y: cy, ww: cross + 1, wh: along + 5, ang: horiz ? Math.PI / 2 : 0 });
      }
      const n = Math.floor(L / 70);
      for (let i = 0; i < n; i++) {
        const d = 24 + r() * (L - 48), lane = (r() - .5) * 7, cx = horiz ? x + d : x + w / 2 + lane, cy = horiz ? y + h / 2 + lane : y + d;
        if (!isLand(cx, cy) || onBridge(cx, cy)) continue;
        const k = pickKind(), skid = k[0].startsWith('skid'), ang = skid ? (horiz ? Math.PI / 2 : 0) + (r() - .5) * .08 : r() * TAU, sc = .85 + r() * .4;
        LRX.decals.push({ k: k[0], x: cx, y: cy, w: k[1] * sc, h: k[2] * sc, a: ang });
      }
    }
    // zebra crossings just before some junctions
    const hr = roads.filter(f => f.r[2] > f.r[3]), vr = roads.filter(f => f.r[3] > f.r[2]);
    for (const a of hr) for (const b of vr) {
      const jx = b.r[0] + b.r[2] / 2, jy = a.r[1] + a.r[3] / 2;
      if (jy < b.r[1] || jy > b.r[1] + b.r[3]) continue;                        // b doesn't actually reach this row: not a real junction
      if (isLand(jx, jy)) KX.cross.push({ x: jx, y: jy });
      if (r() > .3 || !isLand(jx, jy - 17)) continue;
      LRX.decals.push({ k: 'zebra', x: jx, y: jy - 16, w: 11, h: 8, a: 0 });
    }
    // danfos on the horizontal roads (one lane each way)
    hr.forEach((f, i) => {
      const n = 1 + (i % 2);
      for (let j = 0; j < n; j++) { const dir = j % 2 ? -1 : 1; LRX.buses.push({ y: f.r[1] + (dir > 0 ? 4 : 10), x0: r() * 940, dir, sp: 12 + r() * 10, clip: f.clipLand }); }
    });
    // kenney_racing-kit cars on the vertical roads (buses never ran there, so this road direction was empty before)
    vr.forEach((f, i) => {
      const n = 1 + (i % 2);
      for (let j = 0; j < n; j++) { const dir = j % 2 ? -1 : 1; KX.cars.push({ x: f.r[0] + (dir > 0 ? 4 : 10), y0: r() * f.r[3], dir, sp: 11 + r() * 9, lo: f.r[1], hi: f.r[1] + f.r[3], col: KX_CAR_COLS[Math.floor(r() * KX_CAR_COLS.length)] }); }
    });
    LRX.decals.sort((p, q) => (p.k === 'zebra') - (q.k === 'zebra'));
  }
  function lrGround(ctx) {
    if (cam.D > 700) return;
    if (KX.on) {                                                               // the clean Kenney road replaces the plain-asphalt base when it's loaded
      for (const s of KX.straight) lrTex(ctx, KX.img.straight, s.x, s.y, s.ww, s.wh, .45, s.ang, 1);
    } else if (LRX.on && LRX.asph) {
      for (const t of LRX.tiles) lrTex(ctx, LRX.asph, t.x, t.y, t.w, t.h, .5, 0, .82, [t.sx, t.sy, 128, 128]);
    }
    if (LRX.on) for (const d of LRX.decals) { const im = LRX.img[d.k]; if (im) lrTex(ctx, im, d.x, d.y, d.w, d.h, .7, d.a, d.k === 'zebra' ? .8 : KX.on ? .55 : .95); }  // weathering over the clean road, lighter so the road underneath still reads
    if (KX.on) for (const c of KX.cross) lrTex(ctx, KX.img.cross, c.x, c.y, 17, 17, .5, 0, 1);   // crisp rounded-corner junction on top of everything
  }
  /* small flat roofs get a Lagos roof: zinc patchwork, red metal, blue tarp, clothesline, satellite dish, water tank */
  const ROOFS = ['zinc', 'zinc', 'zinc', 'red', 'red', 'tarp', 'cloth', 'sat', 'tank'];
  function lrRoof(ctx, o, x0, y0, h) {
    if (!LRX.on || cam.D > 900 || o.o.pin || o.o.tag || o.style !== 'flat' || o.h > 45) return false;
    const im = LRX.img[ROOFS[(Math.floor(o.x * 7 + o.y * 13) >>> 0) % ROOFS.length]]; if (!im) return false;
    lrTex(ctx, im, o.x, o.y, o.w, o.d, h + .6, 0, .88, null, true);
    return true;
  }
  function drawBus(ctx, o) {
    const im = LRX.img.bus; if (!im) return;
    const b = cam.project(o.x, o.y, 0, {}), W0 = 22, wpx = W0 * b.k, hpx = wpx * im.naturalHeight / im.naturalWidth;
    if (wpx < 6) return;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(b.x, b.y, wpx * .44, wpx * .1, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(b.x, b.y); if (o.dir < 0) ctx.scale(-1, 1); ctx.drawImage(im, -wpx / 2, -hpx * .93, wpx, hpx); ctx.restore();
  }
  function drawCar(ctx, o) {
    const im = KX.img[`car-${o.col}-${o.dir > 0 ? 'S' : 'N'}`]; if (!im) return;        // dir>0 = heading south: show the car's front (S); heading north shows its back (N)
    const b = cam.project(o.x, o.y, 0, {}), W0 = 6.4, wpx = W0 * b.k, hpx = wpx * im.naturalHeight / im.naturalWidth;   // a lane is 7 units wide (road 14)
    if (wpx < 3) return;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(b.x, b.y, wpx * .5, wpx * .14, 0, 0, TAU); ctx.fill();
    ctx.drawImage(im, b.x - wpx / 2, b.y - hpx * .85, wpx, hpx);
  }

  function drawBox(ctx, o) {
    const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y - o.d / 2, y1 = o.y + o.d / 2, h = o.h;
    const faces = [[[x0, y0], [x1, y0], 0, -1, .0], [[x1, y0], [x1, y1], 1, 0, -.12], [[x1, y1], [x0, y1], 0, 1, -.22], [[x0, y1], [x0, y0], -1, 0, -.1]];
    ctx.lineJoin = 'round'; ctx.lineWidth = 1;
    for (const f of faces) {
      const cx = (f[0][0] + f[1][0]) / 2, cy = (f[0][1] + f[1][1]) / 2;
      if ((cam.px - cx) * f[2] + (cam.py - cy) * f[3] <= 0) continue;
      poly(ctx, [[f[0][0], f[0][1], 0], [f[1][0], f[1][1], 0], [f[1][0], f[1][1], h], [f[0][0], f[0][1], h]], mix(o.wall, f[4] - .04), 'rgba(0,0,0,.18)');
      if (o.o.tag === 'glass' || o.h > 24) {                            // window bands
        const step = o.h > 60 ? 10 : 8, band = o.h > 60 ? 3.5 : 2.4;
        for (let z = 6; z < h - 4; z += step) poly(ctx, [[f[0][0], f[0][1], z], [f[1][0], f[1][1], z], [f[1][0], f[1][1], z + band], [f[0][0], f[0][1], z + band]], o.o.tag === 'glass' ? 'rgba(40,70,100,.32)' : 'rgba(30,40,55,.22)');
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
      else if (lrRoof(ctx, o, x0, y0, h)) { /* Lagos Run roof texture drawn */ }
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
  function drawTank(ctx, o) {
    const r = 9 * (o.s || 1), h = 16 * (o.s || 1);
    poly(ctx, [[o.x - r, o.y - r * .4, 0], [o.x + r, o.y - r * .4, 0], [o.x + r, o.y - r * .4, h], [o.x - r, o.y - r * .4, h]], '#c5ccd2', 'rgba(0,0,0,.25)');
    poly(ctx, [[o.x + r, o.y - r * .4, 0], [o.x + r, o.y + r * .4, 0], [o.x + r, o.y + r * .4, h], [o.x + r, o.y - r * .4, h]], '#9aa3ab');
    const cap = cam.project(o.x, o.y, h, {}); ctx.fillStyle = '#dfe3e6'; ctx.beginPath(); ctx.ellipse(cap.x, cap.y, Math.max(3, r * cap.k * .9), Math.max(1.5, r * cap.k * .35), 0, 0, TAU); ctx.fill();
  }
  function drawPoster(ctx, o) {
    const w = o.mega ? 22 : 16, h = o.mega ? 18 : 12, z0 = 4;
    poly(ctx, [[o.x - w / 2, o.y, z0], [o.x + w / 2, o.y, z0], [o.x + w / 2, o.y, z0 + h], [o.x - w / 2, o.y, z0 + h]], `hsl(${o.hue},62%,46%)`, 'rgba(0,0,0,.28)');
    poly(ctx, [[o.x - w / 2 + 1.5, o.y, z0 + 1.5], [o.x + w / 2 - 1.5, o.y, z0 + 1.5], [o.x + w / 2 - 1.5, o.y, z0 + h - 1.5], [o.x - w / 2 + 1.5, o.y, z0 + h - 1.5]], `hsl(${(o.hue + 40) % 360},55%,62%)`);
  }
  function drawPlane(ctx, o) {
    const a = o.hdg || 0, c = Math.cos(a), s = Math.sin(a), z = 3;
    const w = (u, v) => [o.x + u * c - v * s, o.y + u * s + v * c];
    const fus = [w(-14, -2.4), w(16, -2.4), w(18, 0), w(16, 2.4), w(-14, 2.4)];
    poly(ctx, fus.map(p => [p[0], p[1], z]), '#eef2f6', 'rgba(0,0,0,.28)');
    poly(ctx, [w(-2, -10), w(4, -2.2), w(4, 2.2), w(-2, 10)].map(p => [p[0], p[1], z + 1]), '#c5ccd4');
    poly(ctx, [w(12, -6), w(16, -1), w(16, 1), w(12, 6)].map(p => [p[0], p[1], z + 1.2]), '#9aa3ab');
    const n = cam.project(o.x + 8 * c, o.y + 8 * s, z + 4, {}); ctx.fillStyle = '#2f6fd8'; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(1.4, 2.4 * n.k), 0, TAU); ctx.fill();
  }
  function onRoad(cx, cy) {
    return flats.some(f => f.r && f.c === '#b4b8bd' && cx >= f.r[0] - 1 && cx <= f.r[0] + f.r[2] + 1 && cy >= f.r[1] - 1 && cy <= f.r[1] + f.r[3] + 1);
  }
  function drawPlotFields(ctx) {
    if (cam.D > 1400) return;
    const step = cam.D > 800 ? 22 : cam.D > 450 ? 16 : 12;
    for (let x = 24; x < 976; x += step) for (let y = 24; y < 976; y += step) {
      const cx = x + step / 2, cy = y + step / 2; if (!isLand(cx, cy) || inZone(cx, cy, 2) || onRoad(cx, cy) || onBridge(cx, cy)) continue;
      const alt = ((x / step | 0) + (y / step | 0)) % 2;
      poly(ctx, rect(x + .4, y + .4, step - 1.1, step - 1.1, .28), alt ? '#b7e07a' : '#8fc85a');
    }
  }
  function drawRoadMarks(ctx) {
    if (cam.D > 780) return;
    ctx.save();
    for (const f of flats) {
      if (!f.r || f.c !== '#b4b8bd') continue;
      const [x, y, w, h] = f.r, horiz = w > h, L = horiz ? w : h;
      for (let d = 10; d < L - 8; d += 16) {
        const rx = horiz ? x + d : x + w / 2 - .7, ry = horiz ? y + h / 2 - .7 : y + d;
        if (!isLand(rx, ry) && !onBridge(rx, ry)) continue;
        poly(ctx, rect(rx, ry, horiz ? 8 : 1.4, horiz ? 1.4 : 8, .85), 'rgba(255,255,255,.55)');
      }
    }
    ctx.restore();
  }
  function drawGoSlow(ctx, t) {
    if (!HUD.goslow || cam.D > 1200) return;
    const lanes = [[120, 240, 760, 14], [530, 380, 24, 190], [240, 372, 24, 204], [100, 750, 800, 14]];
    for (const [x, y, w, h] of lanes) {
      poly(ctx, rect(x, y, w, h, 1.1), `rgba(255,140,40,${.14 + Math.sin(t * 2 + x) * .04})`);
    }
  }
  function drawOceanLabel(ctx) {
    if (cam.D < 280) return;
    const p = cam.project(500, 990, 0, tmp); if (tmp.z < NEAR) return;
    ctx.save(); ctx.globalAlpha = .55; ctx.fillStyle = '#eaf6ff'; ctx.font = '800 13px Outfit,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.letterSpacing = '4px';
    ctx.fillText('ATLANTIC OCEAN', tmp.x, tmp.y + 28); ctx.restore();
  }
  /* big, faint, ground-painted district name (the "YABA" / "MAINLAND" look): one short word lying flat on the
     road, fading out as you zoom in close enough that the small pin label (drawn later, in screen space) takes over. */
  function drawGroundLabels(ctx) {
    if (cam.D > 1300) return;
    for (const p of PINS) {
      if (p[5] !== 'district') continue;
      const [nm, , px, py] = p; cam.project(px, py, .4, tmp); if (tmp.z < NEAR) continue;
      const a = clamp(.26 - (900 - cam.D) / 3200, .06, .26); if (a <= .06 && cam.D < 420) continue;
      const word = nm.split(' ')[0].toUpperCase(), size = clamp(30 * tmp.k, 10, 34);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#f3f7ea';
      ctx.translate(tmp.x, tmp.y); ctx.rotate(-cam.yaw);
      ctx.font = `800 ${size}px Outfit,system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.letterSpacing = (size * .14) + 'px';
      ctx.fillText(word, 0, 0); ctx.restore();
    }
  }
  function drawClusters(ctx) {
    if (!HUD.neighbours || cam.D > 1400) return;
    const spots = PINS.filter(p => p[5] !== 'soon-y').map(p => ({ x: p[2], y: p[3], n: 0, live: 0, pin: p }));
    const people = []; if (M.me) people.push({ av: M.me, live: 1 }); if (HUD.neighbours) for (const o of M.others.values()) people.push({ av: o.av, live: o.live ? 1 : 0 });
    for (const p of people) { let best = null, bd = 80; for (const s of spots) { const d = Math.hypot(p.av.x - s.x, p.av.y - s.y); if (d < bd) { bd = d; best = s } } if (best) { best.n++; best.live += p.live; } }
    ctx.font = '800 11px Outfit,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of spots) {
      if (s.n < 1) continue;
      const b = cam.project(s.x + 18, s.y - 8, 28, tmp); if (tmp.z < NEAR || tmp.x < 0 || tmp.x > M.w || tmp.y < 0 || tmp.y > M.h) continue;
      const label = s.n >= 1000 ? '1000+' : s.n >= 20 ? (Math.floor(s.n / 10) * 10) + '+' : String(s.n);
      const hue = (hashStr(s.pin[0]) % 5); const col = ['#22b573', '#8e5bd1', '#2f6fd8', '#e5484d', '#f59e0b'][hue];
      const w = Math.max(36, ctx.measureText(label).width + 22);
      ctx.fillStyle = '#fff'; rr(ctx, b.x - w / 2, b.y - 11, w, 22, 11); ctx.fill();
      ctx.fillStyle = s.live ? '#22b573' : col; ctx.beginPath(); ctx.arc(b.x - w / 2 + 11, b.y, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1b2236'; ctx.fillText(label, b.x + 6, b.y + .5);
    }
  }
  function drawLiveTracks(ctx, t) {
    if (!HUD.neighbours) return;
    for (const o of M.others.values()) {
      if (o.trail && o.trail.length > 1 && cam.D < 900) {
        ctx.save(); ctx.strokeStyle = 'rgba(34,181,115,.35)'; ctx.lineWidth = 2; ctx.beginPath();
        o.trail.forEach((p, i) => { const q = cam.project(p[0], p[1], .8, {}); if (q.z < NEAR) return; i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
        ctx.stroke(); ctx.restore();
      }
      const a = o.av, gnd = cam.project(a.x, a.y, 0, tmp); if (tmp.z < NEAR || tmp.x < -20 || tmp.x > M.w + 20 || tmp.y < -20 || tmp.y > M.h + 20) continue;
      const pulse = 1 + Math.sin(t * 4 + hashStr(o.name || '')) * .18;
      ctx.fillStyle = o.live ? `rgba(34,181,115,${.22 * pulse})` : 'rgba(47,111,216,.16)';
      ctx.beginPath(); ctx.ellipse(gnd.x, gnd.y, 10 * gnd.k * pulse, 5 * gnd.k * pulse, 0, 0, TAU); ctx.fill();
      if (cam.D > 520) {
        ctx.fillStyle = o.live ? '#22b573' : '#2f6fd8'; ctx.beginPath(); ctx.arc(gnd.x, gnd.y - 14 * gnd.k, Math.max(4, 6 * gnd.k), 0, TAU); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }

  function drawPlots(ctx) {
    for (let i = 0; i < ads.n; i++) {
      const col = i % 10, row = Math.floor(i / 10), x = PLOT_ANCHOR.x + col * 23, y = PLOT_ANCHOR.y + row * 44, ad = ads.plots.get(i);
      const q = rect(x, y, 19, 36, 1.5);
      poly(ctx, q, ad ? '#ffffff' : 'rgba(255,255,255,.2)', ad ? '#1f6fd0' : 'rgba(255,255,255,.5)');
      const c = cam.project(x + 9.5, y + 18, 1.6, {}); if (c.z < NEAR || c.x < -30 || c.x > M.w + 30 || c.y < -30 || c.y > M.h + 30) continue;
      if (ad) { let h = 0; for (const ch of String(ad.title || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; poly(ctx, rect(x + 2, y + 2, 15, 32, 1.7), `hsl(${h},65%,52%)`); if (c.k > 1.1) { ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(Math.min(26, 11 * c.k))}px Outfit,system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(ad.title || '📢').trim().charAt(0).toUpperCase(), c.x, c.y); } }
      else if (c.k > 1.1) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `700 ${Math.round(Math.min(16, 7 * c.k))}px Outfit,system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FOR SALE', c.x, c.y); }   // an empty plot reads as a plain "for sale" sign until someone buys it
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
    // extended outer land (beyond the playable edges)
    XLAND.forEach(p => { dep(p, -9, '#6b7d4b'); }); XLAND.forEach(p => { poly(ctx, p.map(q => [q[0], q[1], -4.5]), '#8aa05f'); }); XLAND.forEach(p => { poly(ctx, p.map(q => [q[0], q[1], 0]), '#a9c88c'); });
    // land thickness then land
    LAND.forEach(p => { dep(p, -9, '#6b7d4b'); });
    LAND.forEach(p => { poly(ctx, p.map(q => [q[0], q[1], -4.5]), '#8aa05f'); });
    LAND.forEach(p => { poly(ctx, p.map(q => [q[0], q[1], 0]), '#a9c88c'); });
    drawPlotFields(ctx);
    // lagoon bridges
    BRIDGES.forEach(b => { poly(ctx, rect(b[0] - 2, b[1], b[2] + 4, b[3], -2), '#6f7378'); poly(ctx, rect(b[0], b[1], b[2], b[3], 1.2), '#8a8f95'); });
    // decals
    for (const f of flats) {
      if (f.p) poly(ctx, f.p.map(q => [q[0], q[1], .3]), f.c);
      else if (f.r) { if (f.dock) poly(ctx, rect(f.r[0], f.r[1], f.r[2], f.r[3], .8), f.c); else poly(ctx, rect(f.r[0], f.r[1], f.r[2], f.r[3], .4), f.c); }
    }
    lrGround(ctx);
    drawRoadMarks(ctx);
    drawGoSlow(ctx, t);
    if (HUD.sea) drawPlots(ctx);
    drawGroundLabels(ctx);
    drawOceanLabel(ctx);
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
  function playerKey(p) { return String(p.id || p.name || ''); }
  function applyLive(o, p) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const now = performance.now(), dt = Math.max(.05, (now - (o.seen || now)) / 1000);
    if (o.tx != null) { o.vx = (p.x - o.tx) / dt; o.vy = (p.y - o.ty) / dt; }
    o.live = true; o.tx = p.x; o.ty = p.y; if (Number.isFinite(p.h)) o.th = p.h; o.st = p.st || o.st;
    o.go = null; o.seen = now;
    o.trail = o.trail || [];
    const last = o.trail[o.trail.length - 1];
    if (!last || Math.hypot(p.x - last[0], p.y - last[1]) > 1.4) o.trail.push([p.x, p.y]);
    if (o.trail.length > 18) o.trail.shift();
  }
  function setPlayers(list) {
    const keep = new Set(), net = getNET(), myName = net && net.user && net.user.displayName, myId = net && net.user && String(net.user.id || '');
    (list || []).filter(p => playerKey(p) && String(p.id || '') !== myId && p.name !== myName).slice(0, 40).forEach(p => {
      const live = Number.isFinite(p.x) && Number.isFinite(p.y);
      const key = playerKey(p); let o = M.others.get(key) || [...M.others.values()].find(x => x.name === p.name);
      if (!live && !o) return;                                   // only draw people with a real map point — no parked placeholders
      if (live || o) keep.add(key);
      const ls = p.l ? JSON.stringify(p.l) : '';
      if (o && o.ls !== ls) { o.ls = ls; o.av.setLook(p.l || ACAvatar.defaultRender(o.av.g, { top: o.top })); }
      if (!o) { const h = hashStr(p.name || key), sp = [p.x, p.y], top = ['#d9b24a', '#2f9e63', '#d6455a', '#3a7bd5', '#8e5bd1', '#f08a3c'][h % 6], av = new Avatar(p.l && p.l.g ? p.l.g : p.g === 'female' || p.g === 'male' ? p.g : (h % 2 ? 'female' : 'male'), p.l ? { look: p.l } : { top });
        av.x = sp[0]; av.y = sp[1]; av.h = Number.isFinite(p.h) ? p.h : (h % 628) / 100; av.dance = h % 4; o = { av, name: p.name, id: p.id, next: 2 + (h % 7), h, ls, top, live: true }; M.others.set(key, o); }
      else { o.id = p.id || o.id; o.name = p.name || o.name; M.others.set(key, o); }
      if (live) {
        const far = o.tx == null || Math.hypot(p.x - o.tx, p.y - o.ty) > .8;
        const stale = !o.seen || (performance.now() - o.seen) > 900;
        if (far || stale) applyLive(o, p);
      }
    });
    for (const k of [...M.others.keys()]) if (!keep.has(k)) M.others.delete(k);
  }
  function applyPos(p) {
    if (!p) return; const net = getNET(), myId = net && net.user && String(net.user.id || '');
    if (String(p.id || '') === myId || (p.name && net && net.user && p.name === net.user.displayName)) return;
    const key = playerKey(p); let o = M.others.get(key) || [...M.others.values()].find(x => x.name === p.name);
    if (!o) { setPlayers([{ ...p }]); return; }
    applyLive(o, p);
  }
  function updateOthers(dt) {
    const now = performance.now();
    for (const o of M.others.values()) {
      const a = o.av;
      if (o.tx != null) {
        const age = now - (o.seen || now);
        let gx = o.tx, gy = o.ty;
        if (o.live && age < 420 && (o.st === 'walk' || o.st === 'run') && o.vx != null) {
          const pred = Math.min(.35, age / 1000); gx = o.tx + (o.vx || 0) * pred; gy = o.ty + (o.vy || 0) * pred;
        }
        const dx = gx - a.x, dy = gy - a.y, d = Math.hypot(dx, dy);
        if (d > .35) {
          const k = 1 - Math.exp(-dt * (d > 40 ? 9 : 7));
          a.x += dx * k; a.y += dy * k;
          a.h = turn(a.h, (o.th != null ? o.th : Math.atan2(dy, dx)), dt * 12);
          a.speed = d > 18 ? 2.6 : 1.5;
          a.setState(o.st === 'run' || d > 22 ? 'run' : (o.st === 'dance' || o.st === 'wave' ? o.st : 'walk'));
        }
        else { a.x = gx; a.y = gy; if (o.th != null) a.h = turn(a.h, o.th, dt * 8); a.speed = 0; a.setState(o.st && o.st !== 'walk' && o.st !== 'run' ? o.st : 'idle'); }
        if (age > 14000) { o.live = false; o.vx = 0; o.vy = 0; }
      } else {
        o.next -= dt;
        if (o.next <= 0) { const r = Math.random(); o.next = 4 + Math.random() * 6;
          if (r < .3) { a.setState('wave'); } else a.setState('idle'); }
      }
      a.update(dt);
    }
  }
  let lastPosAt = 0, lastSent = [0, 0, 0];
  function sendPos(force) {
    const a = M.me, net = getNET(); if (!a || !net || !net.sock) return;
    const now = performance.now(); if (!force && now - lastPosAt < 70) return;
    if (!force && Math.hypot(a.x - lastSent[0], a.y - lastSent[1]) < .45 && Math.abs(a.h - lastSent[2]) < .05 && a.state === lastSent[3] && now - lastPosAt < 700) return;
    lastPosAt = now; lastSent = [a.x, a.y, a.h, a.state];
    try { net.sock.emit('pos', { x: +a.x.toFixed(1), y: +a.y.toFixed(1), h: +a.h.toFixed(3), st: a.state }); } catch (e) {}
  }
  function turn(a, b, k) { let d = ((b - a + Math.PI * 3) % TAU) - Math.PI; return a + d * Math.min(1, k); }

  /* ---------- map tools support (61-80): layers, routing, travel ---------- */
  const LAYERS = { world: [], screen: [] };
  let wideGrid = null;
  function route(x0, y0, x1, y1, wide) {                 // tries a few spots around the target when it sits inside a walled-in pocket
    for (const [dx, dy] of [[0, 0], [0, 40], [0, -40], [48, 0], [-48, 0], [0, 72], [0, -72], [80, 0], [-80, 0]]) { const p = route1(x0, y0, x1 + dx, y1 + dy, wide); if (p) return p; }
    return null;
  }
  function route1(x0, y0, x1, y1, wide) {                // wide = accessible route: keeps 1+ cell clear of buildings
    if (!wide) return findPath(x0, y0, x1, y1);
    if (!wideGrid) { wideGrid = new Uint8Array(grid); for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const x = (i + .5) * CELL, y = (j + .5) * CELL; if (blocks.some(b => x > b[0] - 12 && x < b[2] + 12 && y > b[1] - 12 && y < b[3] + 12)) wideGrid[j * GN + i] = 1; } }
    const keep = grid; grid = wideGrid; try { return findPath(x0, y0, x1, y1); } finally { grid = keep; }
  }
  function free(x, y) { const c = nearestFree(...cellOf(x, y)); return c ? [(c[0] + .5) * CELL, (c[1] + .5) * CELL] : [x, y]; }
  function walkPath(p, o) {
    o = o || {}; ensureMe(); if (!p || p.length < 2) { if (o.cb) o.cb(); return false; }
    M.mul = o.mul || 1; M.path = p; M.pi = 1; M.cb = o.cb || null; M.dest = p[p.length - 1]; M.emote = null;
    M.run = o.run != null ? o.run : p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0) > 320; M.follow = true; return true;
  }
  function teleport(x, y) { ensureMe(); const f = free(x, y); M.path = null; M.me.x = f[0]; M.me.y = f[1]; M.mul = 1; M.me.setState('idle'); M.follow = true; cam.tx = f[0]; cam.ty = f[1]; cam.update(); }
  function focus(x, y, D) { M.follow = false; cam.tx = x; cam.ty = y; if (D) M.tD = D; cam.update(); }
  const HELP = { cam, M, W, isLand, onBridge, poly, rect, project(x, y, z) { cam.project(x, y, z || 0, tmp); return tmp.z < NEAR ? null : { x: tmp.x, y: tmp.y, k: tmp.k }; } };

  function walkTo(x, y, cb) {
    if (!inWorld(x, y)) return false;                            // the extended land is scenery only
    ensureMe(); const p = findPath(M.me.x, M.me.y, x, y);
    if (!p || p.length < 2) { M.path = null; M.dest = null; return false; }
    M.mul = 1; M.path = p; M.pi = 1; M.cb = cb || null; M.dest = p[p.length - 1]; M.emote = null; M.run = p.reduce((s, q, i) => i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0) > 320; M.follow = true; return true;
  }
  /* Settings > "Camera turns by itself": while you walk, the map camera swings round so you walk "up" the screen. Off = it stays where you leave it. */
  let camAutoAt = 0, camAutoOn = false;
  const camAuto = () => { const n = performance.now(); if (n - camAutoAt > 1000) { camAutoAt = n; try { camAutoOn = JSON.parse(localStorage.getItem('ghPrefs') || '{}').camAuto === true } catch (e) { camAutoOn = false } } return camAutoOn; };
  function updateMe(dt) {
    const a = M.me; if (!a) return;
    if (M.path && M.pi < M.path.length) {
      const tg = M.path[M.pi], dx = tg[0] - a.x, dy = tg[1] - a.y, d = Math.hypot(dx, dy), sp = (M.run ? 95 : 48) * dt * (M.mul || 1);
      if (d <= sp) { a.x = tg[0]; a.y = tg[1]; M.pi++; if (M.pi >= M.path.length) { M.path = null; a.setState('idle'); a.speed = 0; if (M.cb) { const c = M.cb; M.cb = null; c(); } } }
      else { a.x += dx / d * sp; a.y += dy / d * sp; a.h = turn(a.h, Math.atan2(dy, dx), dt * 10); }
      if (M.path) { a.speed = (M.run ? 3.4 : 1.5) * Math.min(1.6, M.mul || 1); a.setState(M.run ? 'run' : 'walk'); }
    } else if (M.emote) { if (a.state !== M.emote) a.setState(M.emote); if (M.emote === 'dance' && getS() && getS().needs) { getS().needs[2] = Math.min(1, getS().needs[2] + dt * .012); } }
    else if (a.state === 'walk' || a.state === 'run') a.setState('idle');
    a.update(dt);
    if (M.follow && cam) { const k = 1 - Math.exp(-dt * 3.2); cam.tx += (a.x - cam.tx) * k; cam.ty += (a.y - cam.ty) * k; if (M.path && !M.drag && camAuto()) cam.yaw = turn(cam.yaw, a.h + Math.PI / 2, dt * 1.4); }
    sendPos();
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
    cam.tx = clamp(cam.tx, -EXT * .75, W + EXT * .75); cam.ty = clamp(cam.ty, -EXT * .75, W + EXT * .75); cam.update();
    draw(t);
    const cp = $('mpCompass'); if (cp) cp.firstElementChild.style.transform = `rotate(${-cam.yaw}rad)`;
  }
  function draw(t) {
    const ctx = M.ctx; ctx.setTransform(M.dpr, 0, 0, M.dpr, 0, 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    lrLoad(); kxLoad(); M.hits = []; drawWorld(ctx, t);
    // collect visible standing things
    const list = [], m = 90;
    const scan = arr => { for (const o of arr) {
      const p = cam.project(o.x, o.y, 0, tmp); if (tmp.z < NEAR) continue; const rr = (o.r + (o.h || 40)) * tmp.k + m;
      if (tmp.x < -rr || tmp.x > M.w + rr || tmp.y < -rr * 1.5 || tmp.y > M.h + rr) continue;
      if (o.t === 'tree' && cam.D > 800) continue;
      list.push([tmp.z, o]);
    } };
    scan(objs.filter(o => {
      if (!HUD.ads && (o.t === 'board' || o.t === 'poster')) return false;
      if (!HUD.gov && o.o && o.o.tag === 'gov') return false;
      return true;
    })); scan(XOBJ);
    if (LRX.on && LRX.img.bus && cam.D < 1000) for (const bu of LRX.buses) {            // danfos drive back and forth along their road
      const span = 940, px = ((bu.x0 + bu.dir * bu.sp * t) % span + span) % span, bx = 30 + px, ob = { t: 'bus', x: bx, y: bu.y, dir: bu.dir, r: 14, h: 16 };
      if (!isLand(bx, bu.y) || onBridge(bx, bu.y)) continue;
      cam.project(bx, bu.y, 0, tmp); if (tmp.z < NEAR || tmp.x < -60 || tmp.x > M.w + 60 || tmp.y < -80 || tmp.y > M.h + 80) continue; list.push([tmp.z - 2, ob]);
    }
    if (KX.on && cam.D < 1000) for (const ca of KX.cars) {                              // Kenney race cars on the vertical roads, same idea, north-south
      const span = ca.hi - ca.lo, py = ((ca.y0 + ca.dir * ca.sp * t) % span + span) % span, cy = ca.lo + py, ob = { t: 'car', x: ca.x, y: cy, dir: ca.dir, col: ca.col, r: 14, h: 16 };
      if (!isLand(ca.x, cy) || onBridge(ca.x, cy)) continue;
      cam.project(ca.x, cy, 0, tmp); if (tmp.z < NEAR || tmp.x < -60 || tmp.x > M.w + 60 || tmp.y < -80 || tmp.y > M.h + 80) continue; list.push([tmp.z - 2, ob]);
    }
    const A = [M.me]; if (HUD.neighbours) for (const o of M.others.values()) A.push(o.av);
    for (const a of A) { cam.project(a.x, a.y, 0, tmp); if (tmp.z >= NEAR && tmp.x > -60 && tmp.x < M.w + 60 && tmp.y > -80 && tmp.y < M.h + 80) list.push([tmp.z - 4, a]); }
    list.sort((p, q) => q[0] - p[0]);
    const tags = [];
    for (const [, o] of list) {
      if (o instanceof Avatar) { const info = o.draw(ctx, cam, SC); if (info.h > 24) tags.push([o, info]); continue; }
      if (o.t === 'box') drawBox(ctx, o); else if (o.t === 'tree') drawTree(ctx, o); else if (o.t === 'board') drawBoard(ctx, o); else if (o.t === 'boat') drawBoat(ctx, o, t); else if (o.t === 'mast') drawMast(ctx, o); else if (o.t === 'bus') drawBus(ctx, o); else if (o.t === 'car') drawCar(ctx, o); else if (o.t === 'poster') drawPoster(ctx, o); else if (o.t === 'tank') drawTank(ctx, o); else if (o.t === 'plane') drawPlane(ctx, o);
    }
    drawLiveTracks(ctx, t);
    // destination marker
    if (M.dest && M.path) { const d = cam.project(M.dest[0], M.dest[1], .5, {}), r = (7 + Math.sin(t * 6) * 1.5) * d.k * 1.4; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(d.x, d.y, r * 1.4, r * .7, 0, 0, TAU); ctx.stroke(); }
    // name tags
    ctx.font = '600 11px "Plus Jakarta Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [a, info] of tags) {
      const nm = a === M.me ? 'You' : [...M.others.values()].find(o => o.av === a).name; const w = ctx.measureText(nm).width + 14, x = info.x, y = info.top - 10;
      ctx.fillStyle = a === M.me ? '#22b573' : 'rgba(27,34,54,.82)'; rr(ctx, x - w / 2, y - 9, w, 18, 9); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(nm, x, y + .5);
      if (a !== M.me) M.hits.push({ x: x - w / 2, y: y - 9, w, h: info.h + 20, name: nm, kind: 'player' });
    }
    drawClusters(ctx);
    for (const f of LAYERS.world) try { ctx.save(); f(ctx, t, HELP); ctx.restore() } catch (e) { ctx.restore() }
    // pin labels
    ctx.font = '700 12px "Plus Jakarta Sans",system-ui,sans-serif';
    for (const p of PINS) {
      const [nm, em, x, y, kind, act] = p; if (!HUD.gov && (kind === 'gov' || kind === 'court')) continue; if (!HUD.ads && kind === 'radio') continue;
      const hh = p[7] || { radio: 72, hall: 36, shop: 26, home: 54, glass: 82, dome: 56, airport: 30, gym: 36, court: 58, hotel: 112, club: 42, tower: 102, boat: 40, park: 20, refinery: 26 }[kind] || 30;
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
    const dk = darkTheme(), nightAmt = dk ? 1 : night;                         // dark mode always shows the city at night
    if (nightAmt > 0) { ctx.fillStyle = dk ? 'rgba(6,14,58,.52)' : `rgba(10,20,70,${.27 * night})`; ctx.fillRect(0, 0, M.w, M.h); }
    if (nightAmt > .3) drawLamps(ctx, Math.min(1, (nightAmt - .3) / .5));
    for (const f of LAYERS.screen) try { ctx.save(); f(ctx, t, HELP); ctx.restore() } catch (e) { ctx.restore() }
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ---------- input ---------- */
  const ptrs = new Map();
  function rectXY(e) { const r = M.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  const maxD = () => (M.w > 900 ? 2100 : 1700);                  // wider screens can zoom out further, the extended world fills the view
  function zoomBy(f, at) { M.tD = clamp(M.tD * f, 80, maxD()); M.zoomAt = at || [M.w / 2, M.h / 2]; }
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
        cam.yaw -= (rot) * 1; M.D = M.tD = clamp(M.D / sc, 80, maxD()); cam.D = M.D; cam.update();
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
  /* ---------- place details sheet (reuses the Lagos Life SHEET/UI pattern) ---------- */
  const KIND_BLURB = {
    radio: 'Tune in for news, music and the pulse of the city.', hall: 'A public hall — matches, events and the crowd that comes with them.',
    shop: 'A local favourite for a quick bite.', glass: 'Tech, startups and ideas under one roof.', dome: 'Lecture halls, labs and campus life.',
    airport: 'Flights in and out of the city.', boat: 'Cruises and rides out on the water.', gym: 'Work out and keep your stats up.',
    court: 'Where the city settles its legal matters.', hotel: 'Stay, dine and relax in comfort.', park: 'Open air, shows and a breather from the noise.',
    club: 'Music, lights and a late one.', tower: 'Views over the whole city from up here.', home: 'Your place.',
    refinery: 'Storage tanks and plant — opening later.', airport: 'Arrivals, the runway and taxis out of town.'
  };
  function openPlace(pin) {
    const [nm, em, px, py, kind, act] = pin, blurb = pin[6], clean = t => t.replace(' · Coming soon', ''), title = clean(nm), q = t => t.replace(/'/g, "\\'");
    const near = PINS.filter(p => p !== pin && p[5] !== 'home')
      .map(p => ({ p, d: Math.hypot(p[2] - px, p[3] - py) })).sort((a, b) => a.d - b.d).slice(0, 6);
    const walk = d => d < 90 ? 'Right next door' : d < 180 ? 'A short walk' : d < 320 ? 'Down the road' : 'Across the city';
    SHEET.open({
      id: 'place', title: `${em} ${title}`,
      tabs: () => [{ id: 'details', label: 'Details' }, { id: 'nearby', label: 'Nearby', badge: near.length }],
      body: (tab) => {
        if (tab === 'nearby') {
          if (!near.length) return '<p class="empty">Nothing else close by.</p>';
          return near.map(({ p, d }) => UI.row({
            ic: `<span class="lgi" style="background:var(--sf);font-size:20px;width:34px;height:34px">${p[1]}</span>`, title: UI.esc(clean(p[0])),
            sub: UI.esc((p[5] === 'district' ? (p[6] || '') : (KIND_BLURB[p[4]] || '')) + (p[5] === 'soon-y' ? ' Coming soon.' : '')) + ` <b style="color:var(--mut);font-weight:600">· ${walk(d)}</b>`,
            go: `MAP3D.openByName('${q(p[0])}')`
          })).join('');
        }
        return `<p class="lgnote" style="margin-top:0;font-size:14px;color:var(--ink)">${UI.esc(blurb || KIND_BLURB[kind] || 'A spot worth seeing in the city.')}</p>
          <div class="lgdaily"><div><b>${UI.esc(title)}</b><small>${act === 'soon-y' ? 'Not open yet — coming to the city soon.' : 'Pay a visit and see what\u2019s here.'}</small></div>
          <button class="lgbtn" onclick="MAP3D.visit('${q(em)}','${q(title)}')">Visit</button></div>${g.MT && g.MT.placeActions ? g.MT.placeActions(pin) : ''}`;
      }
    });
  }
  function tap(x, y) {
    const hit = [...M.hits].reverse().find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (hit && hit.kind === 'pin') {
      const [nm, em, px, py, , act] = hit.pin;
      if (act === 'home') return g.nav('home');
      if (API.onPin && API.onPin(hit.pin)) return;
      openPlace(hit.pin); return;                       /* a landmark only opens its popup; the popup checks first whether it is walkable */
    }
    if (hit && hit.kind === 'plot') { const ad = ads.plots.get(hit.slot); if (ad && g.ADS) g.ADS.goPlot(hit.slot); else if (g.ADS && g.ADS.banner) g.ADS.banner('Free sea plot'); else g.toast('🌊 Free sea plot · book it in Phone → Ads'); return; }
    if (hit && hit.kind === 'board') { const n = ads.billboards.length, ad = n ? ads.billboards[hit.idx % n] : null; if (ad && g.ADS) g.ADS.go(ad); else { g.nav('phone'); setTimeout(() => g.PH && g.PH.open('ads'), 0); } return; }
    if (hit && hit.kind === 'player') { g.toast('👤 ' + hit.name); return; }
    const q = cam.pick(x, y, 0); if (!q) return;
    if (!isLand(q.x, q.y)) {
      // beyond the real 1000x1000 play area (past the sea belt around it) is just distant scenery, painted so the world
      // doesn't look like it stops dead at the edge — it was never meant to be reachable, so say that plainly instead
      // of telling the player it's water right where they can clearly see land and buildings.
      const far = q.x < -GAP || q.x > W + GAP || q.y < -GAP || q.y > W + GAP;
      if (g.ADS && g.ADS.banner) return g.ADS.banner(far ? 'Nothing to visit out here' : 'Can’t walk on water. Use a bridge'); return g.toast(far ? '🏙️ That’s just the skyline in the distance — nothing out there to visit' : '🌊 Can’t walk on water — use a bridge');
    }
    if (!M.me || !findPath(M.me.x, M.me.y, q.x, q.y)) { g.toast('Can’t get there'); return; }
    // every bare-ground tap opens the same destination sheet a landmark does — no more silently auto-walking;
    // the sheet itself shows the distance and, for a close spot, a "Walk there now" button, or, for a far one, the transport options.
    if (g.MT && g.MT.destSheet) g.MT.destSheet({ name: 'That spot', emoji: '📍', x: q.x, y: q.y }, { title: '📍 That spot' });
    else if (!walkTo(q.x, q.y)) g.toast('Can’t get there');
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
      if (M.cv) return; buildLagos(); M.cv = $('mapCv'); M.ctx = M.cv.getContext('2d');
      M.cv.addEventListener('pointerdown', onDown); M.cv.addEventListener('pointermove', onMove); M.cv.addEventListener('pointerup', onUp); M.cv.addEventListener('pointercancel', onUp);
      M.cv.addEventListener('wheel', onWheel, { passive: false }); M.cv.addEventListener('contextmenu', e => e.preventDefault()); g.addEventListener('keydown', onKey); g.addEventListener('resize', resize);
      ensureMe(); cam.tx = M.me.x; cam.ty = M.me.y; cam.yaw = -.28; cam.tilt = 1.02; M.D = M.tD = 340; cam.D = 340;
    },
    show() { API.init(); M.on = true; resize(); if (M.saved) { API.restorePos(M.saved); M.saved = null; } sendPos(true); cancelAnimationFrame(M.raf); M.last = performance.now(); M.raf = requestAnimationFrame(frame); },
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
    setPlayers, applyPos, restorePos(p) { if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return; M.saved = p; if (!M.cv) return; ensureMe(); teleport(p.x, p.y); if (Number.isFinite(p.h) && M.me) M.me.h = p.h; sendPos(true); },
    setEmote(e) { M.emote = e; if (e) { M.path = null; if (M.me) { if (e === 'dance') M.me.nextDance(); else M.me.setState(e); } } else if (M.me) M.me.setState('idle'); },
    hud: HUD,
    setFilter(k, on) { if (k in HUD && k !== 'city') HUD[k] = on ? 1 : 0; },
    setCity(id) {
      if (id === HUD.city) return;
      if (!CITIES[id]) { if (g.toast) g.toast('Port Harcourt isn’t open yet — you’re still in ' + (HUD.city === 'lagos' ? 'Lagos' : 'Abuja')); return }
      loadCity(id); HUD.city = id;
      const [sx, sy] = CITIES[id].spawn; teleport(sx, sy);
      if (g.toast) g.toast(id === 'lagos' ? '🏠 Back in Lagos' : '🏛️ Welcome to Abuja — look around, nothing here is buyable as a home yet');
    },
    /* moves the "Home" pin to the player's actual house: the numbered slot the server gave them in their chosen hood (see HUB.loadMe) */
    setHome(hood, slot) {
      const xy = hoodSlotXY(hood, slot); const home = PINS.find(p => p[5] === 'home'); if (!xy || !home) return;
      home[2] = xy[0]; home[3] = xy[1];
    },
    /* leaving your home: you appear on the street just outside your door; coming back is the "Step inside" button (door.js) */
    homePin() { return PINS.find(p => p[5] === 'home') },
    stepOutside() { API.init(); const h = API.homePin(); if (!h) return; ensureMe(); teleport(h[2], h[3] + 34); M.follow = true; M.tD = Math.min(M.tD || 240, 240) },
    nearHome(r) { const h = API.homePin(); return !!(h && M.me && Math.hypot(M.me.x - h[2], M.me.y - (h[3] + 34)) <= (r || 70)) },
    walkHome() { const h = API.homePin(); if (h) { M.follow = true; API.walkTo(h[2], h[3] + 34) } },
    walkYaba() { const p = PINS.find(q => q[4] === 'yaba'); if (p) { API.show(); API.focus(p[2], p[3], 260); API.walkTo(p[2], p[3]); } },
    openByName(nm) { const p = PINS.find(q => q[0] === nm); if (p) openPlace(p); },
    visit(em, title) {      /* Visit only works when you are at the place; from farther away you travel there first */
      const p = PINS.find(q => q[0].replace(' · Coming soon', '') === title);
      if (p && M.me && Math.hypot(M.me.x - p[2], M.me.y - p[3]) > 90) { g.toast('🚫 You are too far away. Get there first, then visit ' + title); return; }
      SHEET.close(); g.toast(`${em} ${title} is coming soon`);
    },
    get me() { return M.me; }, get state() { return M },
    pins: PINS, zones: ZONES, bridges: BRIDGES, isLand, onBridge, route, free, walkPath, walkTo, teleport, focus, helpers: HELP, onPin: null,
    addLayer(kind, fn) { LAYERS[kind].push(fn); }
  };
  g.MAP3D = API;
})(window);
