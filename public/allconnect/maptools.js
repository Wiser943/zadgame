/* ================= AllConnect map tools (items 61-80) =================
   61 fast travel · 62 route preview · 63 traffic-aware times · 64 bus stops with live schedules · 65 ride-hail pickups
   66 bike + tricycle · 67 ferries · 68 airport terminal guide · 69-71 search (business / player / event)
   72 bookmarks · 73 favourite routes · 74 accessible routes · 75 night safety · 76 crowd density · 77 weather
   78 festival overlay · 79 treasure hunt · 80 photo spots.
   Everything here is drawn on the 3D map through MAP3D.addLayer(). Travel is simulated on the client; fares are estimates
   (nothing is charged). Treasure pickups call the existing gem socket, which the server rate-limits. */
const MT = (() => {
  const TAU = Math.PI * 2, esc = s => UI.esc(String(s == null ? '' : s));
  const MODES = {
    walk: { e: '🚶', n: 'Walk', sp: 48 }, bike: { e: '🚲', n: 'Bike', sp: 100 }, keke: { e: '🛺', n: 'Tricycle', sp: 82 },
    bus: { e: '🚌', n: 'BRT bus', sp: 105 }, ride: { e: '🚕', n: 'Ride', sp: 135 }, boat: { e: '⛵', n: 'Ferry', sp: 72 }
  };
  const WALK_MAX = 300;   // longest trip (in map units, about 1.2 km) the game lets you walk; anything further needs a vehicle
  const COL = { walk: '#2f7fd8', bike: '#22b573', keke: '#f59e0b', bus: '#e5484d', ride: '#8e5bd1', boat: '#0ea5e9' };
  /* bus lines: name, colour, stops [name, x, y] */
  const LINE_DEF = [
    { id: 'A', name: 'Mainland BRT', c: '#e5484d', st: [['Transport Hub', 96, 238], ['Viewing Centre', 300, 252], ['Home Street', 470, 322], ['Museum Quarter', 650, 330], ['Campus Gate', 800, 346]] },
    { id: 'B', name: 'Bridge Express', c: '#2f6fd8', st: [['Yaba Junction', 560, 330], ['Island Terminal', 542, 600], ['Victoria Island', 520, 728], ['Convention Centre', 335, 748]] },
    { id: 'C', name: 'Island Loop', c: '#22b573', st: [['Lagos Island', 128, 668], ['Eko Hotels', 462, 772], ['Lekki Nightlife', 600, 826], ['Ajah Terminal', 868, 902], ['Port Gate', 880, 656]] },
    { id: 'D', name: 'Northern Line', c: '#8e5bd1', st: [['Government Quarter', 285, 126], ['Ikeja', 415, 126], ['Film Village', 555, 126], ['Tech Park', 880, 132]] }
  ];
  const FERRY_DEF = [
    { id: 'F1', name: 'Lagoon Ferry', off: 0, a: ['Mainland Pier', 410, 366], b: ['Island Pier', 410, 586] },
    { id: 'F2', name: 'Offshore Ferry', off: 7, a: ['Lekki Pier', 690, 592], b: ['Offshore Pier', 905, 498] },
    { id: 'F3', name: 'Port Ferry', off: 4, a: ['East Pier', 872, 366], b: ['Port Pier', 864, 584] }
  ];
  /* ride-hail pickup points: name, x, y, which vehicles wait there */
  const POINT_DEF = [
    ['Airport Drop-off', 150, 162, 'ride keke'], ['Ikeja Plaza', 420, 134, 'ride keke bike'], ['Yaba Roundabout', 590, 238, 'ride keke bike'], ['Agege Motor Park', 360, 352, 'ride keke'],
    ['Home Street', 470, 304, 'ride bike'], ['UNILAG Gate', 790, 352, 'ride keke bike'], ['Third Mainland Terminus', 542, 372, 'ride keke'], ['Lagos Island Square', 150, 704, 'ride keke bike'],
    ['VI Plaza', 520, 778, 'ride bike'], ['Eko Hotels Gate', 424, 846, 'ride keke'], ['Lekki Phase 1', 780, 800, 'ride keke bike'], ['Beach Road', 585, 918, 'ride'],
    ['Stadium Gate', 150, 860, 'ride keke'], ['Port Gate', 862, 656, 'ride keke']
  ];
  const AIR_DEF = [['Arrivals hall', 44, 140], ['Baggage claim', 70, 140], ['Check-in', 96, 140], ['Security', 122, 140], ['Gate 1', 148, 140], ['Gate 2', 110, 56], ['Taxi rank', 36, 104], ['Car park', 150, 56]];
  const PHOTO_DEF = [
    ['Third Mainland Bridge', 542, 460, 17, 19], ['Lagos Island Cathedral', 112, 666, 7, 10], ['Victoria Island Skyline', 565, 748, 17, 20], ['Lighthouse Point', 918, 452, 5.5, 8],
    ['Beach Resort Sands', 548, 958, 17, 19.5], ['Stadium Floodlights', 140, 960, 19.5, 23], ['Museum Garden', 676, 292, 14, 17], ['Tech Park Plaza', 895, 118, 10, 16],
    ['Freedom Park Lawn', 240, 780, 15, 18], ['Port Cranes', 866, 640, 5.5, 8]
  ];
  const FEST_VENUES = ['Eko Hotels', 'Freedom Park', 'Quilox', 'Convention Centre', 'Agege Market', 'Lagos Island', 'Stadium District', 'Film Village', 'Museum Quarter'];
  const EV_VENUES = {
    owambe: ['Eko Hotels', 'Freedom Park', 'Quilox', 'Convention Centre'], market: ['Agege Market', 'Lagos Island'], goslow: ['Island Terminal'], rain: ['Lagos Island', 'Ajah Residential', 'Port District'],
    fuel: ['Mainland Transport', 'Port District', 'Ajah Residential'], nepa: ['Ikeja Business', 'Technology Park'], calm: ['Beach Resort', 'Freedom Park']
  };
  const KW = {
    radio: 'radio media', hall: 'viewing centre football', shop: 'food amala buka restaurant eat', home: 'home house room', glass: 'hub tech office', dome: 'university school campus', airport: 'airport flight travel plane',
    gym: 'gym fitness workout', court: 'court law justice', hotel: 'hotel stay sleep', club: 'club party nightlife casino', tower: 'rooftop lounge bar', park: 'park garden relax', boat: 'boat cruise', li: 'church mosque old market', vi: 'bank business commerce',
    yaba: 'art creator studio', ikeja: 'office agency business', surulere: 'sports football pitch court', nightlife: 'club bar party', ajah: 'estate school house', agege: 'market stalls shop', transport: 'bus rail brt terminal',
    campus: 'university lecture library', beach: 'beach resort pool sand', stadium: 'stadium match arena', convention: 'expo conference hotel', port: 'port ship container', tech: 'technology startup lab', film: 'film movie studio',
    museum: 'museum gallery history art', gov: 'government assembly', rural: 'farm barn field', offshore: 'island lighthouse marina'
  };
  const CROWD = { club: [.15, .95], nightlife: [.1, 1], shop: [.8, .3], agege: [.95, .1], li: [.85, .3], hall: [.5, .8], stadium: [.3, .5], hotel: [.5, .6], tower: [.3, .7], vi: [.8, .2], ikeja: [.85, .1], campus: [.8, .2], dome: [.8, .2],
    port: [.7, .15], tech: [.75, .15], glass: [.7, .2], beach: [.7, .4], park: [.6, .4], film: [.6, .3], museum: [.55, .1], convention: [.6, .3], transport: [.9, .5], airport: [.6, .5], yaba: [.6, .6], surulere: [.6, .5], gym: [.5, .5] };

  const S0 = () => ({ bm: [], fav: [], seen: { Home: 1 }, lay: { bm: 1, weather: 1 }, acc: 0, tre: {}, ph: {} });
  const T = {
    WALK_MAX,
    st: null, ready: false, shown: false, dest: null, opts: [], sel: null, via: null, tab: 'go', qk: 'biz', q: '', res: [], pp: null, ride: null, fade: null, ftAt: 0,
    lines: [], ferries: [], points: [], air: [], photos: [], safe: [], tspots: [], lt: 0, sm: -1, st0: 0, ptick: 0,

    /* ---------- storage ---------- */
    key() { return 'ac:mt:v1:' + ((typeof NET !== 'undefined' && NET.user && (NET.user.id || NET.user._id || NET.user.displayName)) || 'guest') },
    load() { let o = null; try { o = JSON.parse(localStorage.getItem(this.key())) } catch (e) {} this.st = Object.assign(S0(), o || {}); this.st.lay = Object.assign({ bm: 1, weather: 1 }, this.st.lay) },
    save() { try { localStorage.setItem(this.key(), JSON.stringify(this.st)) } catch (e) {} },

    /* ---------- clock, event, weather ---------- */
    hrs() { return (S.min / 60) % 24 },
    tg() { const f = this.sm === S.min ? Math.min(1, (performance.now() - this.st0) / 3000) : 0; return S.min + f },
    clock(min) { const m = Math.round(min) % 1440, h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0'); return ((h % 12) || 12) + ':' + mm + (h < 12 ? ' am' : ' pm') },
    ev() { return (typeof LAGOS !== 'undefined' && LAGOS.d && LAGOS.d.event) || null },
    evId() { const e = this.ev(); return e ? e.id : 'calm' },
    night() { const h = this.hrs(); return h >= 19.5 || h < 5.5 },
    weekend() { const d = new Date().getDay(); return d === 0 || d === 6 },
    weather() {
      const h = this.hrs(), ev = this.ev(), rain = this.evId() === 'rain', type = ev?.rainType || (rain ? 'heavy' : 'clear'), intensity = ({ clear: 0, drizzle: 1, steady: 2, heavy: 3, thunderstorm: 4 })[type] || 0, day = h >= 6 && h < 18.5, base = 24 + 8 * Math.max(0, Math.sin((h - 6) / 12 * Math.PI)) - (rain ? 2 + intensity : 0);
      const labels = { drizzle: 'Drizzling', steady: 'Steady rain', heavy: 'Heavy rain', thunderstorm: 'Thunderstorm · flood risk', clear: day ? 'Warm and sunny' : 'Clear night' };
      return { rain, type, intensity, t: Math.round(base), e: intensity >= 3 ? '⛈️' : rain ? '🌧️' : day ? (this.evId() === 'goslow' ? '⛅' : '☀️') : '🌙', c: labels[type] || 'Clear night' };
    },
    traffic() { const h = this.hrs(), e = this.evId(); let f = (h >= 7 && h < 10) || (h >= 16 && h < 20) ? 1.45 : (h >= 22 || h < 5) ? .85 : 1; if (e === 'goslow') f *= 1.3; if (e === 'rain') f *= 1.25; if (e === 'fuel') f *= 1.1; return f },
    tlabel(f) { return f < 1.1 ? 'Light' : f < 1.45 ? 'Moderate' : 'Heavy' },
    tcol(f) { return f < 1.15 ? '#22b573' : f < 1.5 ? '#f5a623' : '#e5484d' },
    fareMult() { const e = this.ev(); return (e && e.mult && e.mult.fare) || 1 },
    inService() { const h = this.hrs(); return !(h >= 23.5 || h < 5) },

    /* ---------- geometry ---------- */
    len(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s },
    bridgeFrac(p) { if (!p || p.length < 2) return 0; let b = 0, n = 0; for (let i = 1; i < p.length; i++) { const k = Math.max(1, Math.ceil(Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) / 20)); for (let j = 0; j < k; j++) { n++; if (MAP3D.onBridge(p[i - 1][0] + (p[i][0] - p[i - 1][0]) * j / k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * j / k)) b++ } } return n ? b / n : 0 },
    dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) },
    me() { const m = MAP3D.me; return m ? [m.x, m.y] : [470, 300] },
    km(len) { return (len * 4 / 1000).toFixed(1) + ' km' },
    near(list, p, f) { let b = null, bd = 1e9; list.forEach((q, i) => { if (f && !f(q)) return; const d = this.dist([q.x, q.y], p); if (d < bd) { bd = d; b = q } }); return b },
    posAt(path, cum, s) { if (s <= 0) return path[0]; for (let i = 1; i < path.length; i++) if (s <= cum[i]) { const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t] } return path[path.length - 1] },

    /* ---------- set-up (needs the map world to exist) ---------- */
    prep() {
      if (this.ready) return; MAP3D.init(); this.ready = true;
      this.lines = LINE_DEF.map(d => {
        const stops = d.st.map(([name, x, y]) => { const f = MAP3D.free(x, y); return { name, x: f[0], y: f[1] } });
        let path = [], sidx = [];
        for (let i = 0; i < stops.length; i++) {
          if (i === 0) { path.push([stops[0].x, stops[0].y]); sidx.push(0); continue }
          const seg = MAP3D.route(stops[i - 1].x, stops[i - 1].y, stops[i].x, stops[i].y) || [[stops[i - 1].x, stops[i - 1].y], [stops[i].x, stops[i].y]];
          path = path.concat(seg.slice(1)); sidx.push(path.length - 1);
        }
        const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
        return { id: d.id, name: d.name, c: d.c, stops, path, sidx, cum, sd: sidx.map(ix => cum[ix]), len: cum[cum.length - 1] || 1, ph: (d.id.charCodeAt(0) % 5) / 5, n: 3 };
      });
      this.ferries = FERRY_DEF.map(d => { const a = MAP3D.free(d.a[1], d.a[2]), b = MAP3D.free(d.b[1], d.b[2]); return { id: d.id, name: d.name, off: d.off, a: { name: d.a[0], x: a[0], y: a[1] }, b: { name: d.b[0], x: b[0], y: b[1] } } });
      this.points = POINT_DEF.map(([name, x, y, t]) => { const f = MAP3D.free(x, y); return { name, x: f[0], y: f[1], t: t.split(' ') } });
      this.air = AIR_DEF.map(([name, x, y]) => { const f = MAP3D.free(x, y); return { name, x: f[0], y: f[1] } });
      this.photos = PHOTO_DEF.map(([name, x, y, h0, h1]) => { const f = MAP3D.free(x, y); return { name, x: f[0], y: f[1], h0, h1 } });
      // night safety: a cell grid. s = 1 well lit and busy, 0 dark and empty
      const lit = MAP3D.pins.filter(p => !['rural', 'offshore', 'boat', 'park'].includes(p[4]));
      for (let x = 55; x < 1000; x += 50) for (let y = 55; y < 1000; y += 50) {
        if (!MAP3D.isLand(x, y)) continue; let d = 1e9; lit.forEach(p => { d = Math.min(d, Math.hypot(p[2] - x, p[3] - y)) });
        let s = Math.max(0, Math.min(1, 1 - d / 250)); MAP3D.zones.forEach((z, i) => { if (x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h && [13, 18].includes(i)) s *= .45 }); if (x > 868 && y > 420 && y < 520) s *= .5;
        this.safe.push({ x, y, s });
      }
      MAP3D.addLayer('world', (c, t, H) => this.drawWorld(c, t, H)); MAP3D.addLayer('screen', (c, t, H) => this.drawScreen(c, t, H));
      MAP3D.onPin = p => this.onPin(p);
    },
    treasure() {
      const key = new Date().toISOString().slice(0, 10); if (this.tkey === key && this.tspots.length) return this.tspots; this.tkey = key;
      let h = 2166136261; for (const ch of key + this.key()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) } const rnd = () => (h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296;
      this.tspots = []; let tries = 0; while (this.tspots.length < 6 && tries++ < 200) { const x = 60 + rnd() * 880, y = 60 + rnd() * 880; if (!MAP3D.isLand(x, y)) continue; const f = MAP3D.free(x, y); if (!MAP3D.isLand(f[0], f[1])) continue; this.tspots.push({ x: f[0], y: f[1], ox: (rnd() - .5) * 70, oy: (rnd() - .5) * 70 }) }
      if (!this.st.tre[key]) { this.st.tre = {}; this.st.tre[key] = [0, 0, 0, 0, 0, 0] } return this.tspots;
    },

    /* ---------- bus + ferry simulation (the timetable is read from the same buses that are drawn) ---------- */
    sim(dt) {
      if (this.sm !== S.min) { this.sm = S.min; this.st0 = performance.now() }
      const slow = Math.min(2, this.traffic()); this.lines.forEach(L => { L.ph = (L.ph + dt * 34 / slow / (2 * L.len)) % 1 });
    },
    period(L) { return 2 * L.len / (34 / Math.min(2, this.traffic())) / 3 },       // game minutes for one there-and-back
    arrivals(L, i) {
      if (!this.inService()) return null; const u = L.sd[i] / L.len, P = this.period(L), out = [];
      for (let k = 0; k < L.n; k++) { const ph = (L.ph + k / L.n) % 1; [[u / 2, 'f'], [1 - u / 2, 'b']].forEach(([psi, dir]) => { if ((i === 0 && dir === 'b') || (i === L.stops.length - 1 && dir === 'f')) return; out.push({ min: (((psi - ph) % 1) + 1) % 1 * P, dir }) }) }
      return out.sort((a, b) => a.min - b.min);
    },
    busPos(L, k) { const ph = (L.ph + k / L.n) % 1, f = ph < .5 ? ph * 2 : 2 - ph * 2; return this.posAt(L.path, L.cum, f * L.len) },
    fnext(F, side) { const t = this.tg(), c = ((t - F.off) % 30 + 30) % 30; return side === 'a' ? (30 - c) % 30 : ((15 - c) % 30 + 30) % 30 },
    fpos(F) { const t = this.tg(), ph = (((t - F.off) % 30) + 30) % 30 / 30, f = ph < .5 ? ph * 2 : 2 - ph * 2; return [F.a.x + (F.b.x - F.a.x) * f, F.a.y + (F.b.y - F.a.y) * f] },
    waitText(m) { return m < .6 ? 'now' : Math.round(m) + ' min' },

    /* ---------- crowd ---------- */
    crowd(p) {
      const c = CROWD[p[4]] || [.4, .3], n = this.night(), h = this.hrs(); let v = n ? c[1] : c[0]; const e = this.evId();
      if (e === 'owambe' && ['hotel', 'club', 'park', 'convention', 'stadium', 'nightlife'].includes(p[4])) v += .3; if (e === 'market' && ['shop', 'agege', 'li'].includes(p[4])) v += .3;
      if (this.weekend() && ['stadium', 'park', 'beach', 'film', 'museum'].includes(p[4])) v += .25; if ((h >= 7 && h < 10) || (h >= 16 && h < 20)) { if (['transport', 'vi', 'ikeja', 'port'].includes(p[4])) v += .15 }
      if (this.evId() === 'rain') v *= .8; const o = MAP3D.state.others; if (o) o.forEach(q => { if (Math.hypot(q.av.x - p[2], q.av.y - p[3]) < 90) v += .12 });
      return Math.max(0, Math.min(1, v));
    },
    clabel(v) { return v > .66 ? 'Packed' : v > .33 ? 'Busy' : 'Quiet' },
    safety(p, dx) { // 0..1 along a path, night-weighted
      let s = 0, n = 0; for (let i = 1; i < p.length; i++) { const k = Math.max(1, Math.ceil(Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) / 30)); for (let j = 0; j < k; j++) { const x = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * j / k, y = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * j / k, c = this.near(this.safe, [x, y]); s += c ? c.s : .3; n++ } } return n ? s / n : 1;
    },

    /* ---------- route planning (62, 63, 66, 67, 74) ---------- */
    mulOf(m) { return MODES[m].sp / 48 },
    tm(m, path) {
      const e = this.evId(), bf = this.bridgeFrac(path);
      if (m === 'walk') return e === 'rain' ? 1.1 : 1; if (m === 'bike') return (e === 'rain' ? 1.3 : 1) * (1 + (e === 'goslow' ? bf * .3 : 0)); if (m === 'boat') return e === 'rain' ? 1.25 : 1;
      return this.traffic() * (1 + (e === 'goslow' ? bf * 1.2 : 0));
    },
    mkOpt(k, segs, extra) {
      let min = 0, len = 0, fare = 0, pts = [];
      segs.forEach(s => { s.len = this.len(s.path); s.f = this.tm(s.m, s.path); s.min = s.len / MODES[s.m].sp / 3 * s.f; min += s.min + (s.wait || 0); len += s.len; pts = pts.concat(s.path) });
      const fm = this.fareMult(), L = len;
      if (k === 'bike') fare = 100 + L * .06; else if (k === 'keke') fare = (150 + L * .12) * fm; else if (k === 'bus') fare = 100; else if (k === 'ride') fare = (400 + L * .35) * fm * (this.traffic() > 1.4 ? 1.3 : 1); else if (k === 'boat') fare = 300;
      return Object.assign({ k, segs, min, len, fare: Math.round(fare / 10) * 10, tf: Math.max(...segs.map(s => s.f)), safe: this.safety(pts) }, extra || {});
    },
    vehOpt(k, me, d, acc) {
      const stand = this.near(this.points, me, q => q.t.includes(k) && (k !== 'ride' || true)), pick = k === 'ride' && this.pp ? this.points.find(q => q.name === this.pp) || stand : stand; if (!pick) return null;
      const far = this.dist(me, [pick.x, pick.y]) > 28, a = far ? MAP3D.route(me[0], me[1], pick.x, pick.y, acc) : null; if (far && !a) return null;
      const b = MAP3D.route(pick.x, pick.y, d.x, d.y, acc); if (!b) return null;
      const segs = []; if (a) segs.push({ m: 'walk', path: a, label: 'Walk to ' + pick.name }); const w = { ride: 3, keke: 1.5, bike: .3 }[k];
      segs.push({ m: k, path: b, wait: w, waitLabel: k === 'ride' ? 'Driver on the way' : k === 'keke' ? 'Waiting for a keke' : 'Unlocking a bike', label: MODES[k].n + ' to ' + d.name }); return this.mkOpt(k, segs, { from: pick.name });
    },
    busOpt(me, d, acc) {
      if (!this.inService()) return null; let best = null;
      this.lines.forEach(L => {
        const a = this.near(L.stops.map((s, i) => ({ x: s.x, y: s.y, i })), me), b = this.near(L.stops.map((s, i) => ({ x: s.x, y: s.y, i })), [d.x, d.y]); if (!a || !b || a.i === b.i) return;
        if (this.dist(me, [a.x, a.y]) > 330 || this.dist([d.x, d.y], [b.x, b.y]) > 330) return;
        const w1 = MAP3D.route(me[0], me[1], a.x, a.y, acc), w2 = MAP3D.route(b.x, b.y, d.x, d.y, acc); if (!w1 || !w2) return;
        const fw = b.i > a.i, ride = fw ? L.path.slice(L.sidx[a.i], L.sidx[b.i] + 1) : L.path.slice(L.sidx[b.i], L.sidx[a.i] + 1).reverse(); if (ride.length < 2) return;
        const arr = (this.arrivals(L, a.i) || []).find(x => x.dir === (fw ? 'f' : 'b')), wait = arr ? arr.min : 6;
        const o = this.mkOpt('bus', [{ m: 'walk', path: w1, label: 'Walk to ' + L.stops[a.i].name }, { m: 'bus', path: ride, wait, waitLabel: 'Waiting for the ' + L.name, label: L.name + ' to ' + L.stops[b.i].name }, { m: 'walk', path: w2, label: 'Walk to ' + d.name }], { line: L.name, wait });
        if (!best || o.min < best.min) best = o;
      }); return best;
    },
    boatOpt(me, d) {
      let best = null;
      this.ferries.forEach(F => [[F.a, F.b, 'a'], [F.b, F.a, 'b']].forEach(([p, q, side]) => {
        const w1 = MAP3D.route(me[0], me[1], p.x, p.y), w2 = MAP3D.route(q.x, q.y, d.x, d.y); if (!w1 || !w2) return;
        const o = this.mkOpt('boat', [{ m: 'walk', path: w1, label: 'Walk to ' + p.name }, { m: 'boat', path: [[p.x, p.y], [q.x, q.y]], wait: this.fnext(F, side), waitLabel: 'Waiting for the ' + F.name, label: F.name + ' to ' + q.name }, { m: 'walk', path: w2, label: 'Walk to ' + d.name }], { line: F.name });
        if (!best || o.min < best.min) best = o;
      })); return best;
    },
    plan(d, pref, via) {
      this.prep(); const me = this.me(), acc = !!this.st.acc, opts = []; this.dest = d; this.via = via || null; this.pp = this.pp;
      let wp = null;
      if (via && via.length) { let cur = me, ok = true, path = [me]; for (const w of via.concat([d])) { const leg = MAP3D.route(cur[0], cur[1], w.x, w.y, acc); if (!leg) { ok = false; break } path = path.concat(leg.slice(1)); cur = [w.x, w.y] } if (ok) wp = path }
      else wp = MAP3D.route(me[0], me[1], d.x, d.y, acc);
      if (!wp && !acc) wp = null;
      if (wp) opts.push(this.mkOpt('walk', [{ m: 'walk', path: wp, label: 'Walk to ' + d.name }], via ? { via } : {}));
      if (!via) opts.push(...this.transportOpts(d, me, acc));
      // too far to trek: take walking off the list whenever something else can get the player there
      if (!via && opts.length > 1 && opts[0].k === 'walk' && opts[0].len > WALK_MAX) { opts.shift(); if (pref === 'walk') toast('🚶 Too far to walk. Pick a way to travel'); }
      if (!opts.length) { toast('No route found to ' + d.name); return false }
      this.opts = opts; const fast = opts.reduce((a, b) => b.min < a.min ? b : a); fast.fast = true;
      this.sel = (pref && opts.find(o => o.k === pref)) || fast; SHEET.close(true); this.showBar();
      MAP3D.focus((me[0] + d.x) / 2, (me[1] + d.y) / 2, Math.min(1100, Math.max(360, this.dist(me, [d.x, d.y]) * 1.6)));
      return true;
    },
    clear() { this.dest = null; this.opts = []; this.sel = null; this.via = null; const b = document.getElementById('mtbar'); if (b) b.style.display = 'none' },
    choose(k) { this.sel = this.opts.find(o => o.k === k) || this.sel; this.showBar() },
    fm(n) { return '₦' + Math.round(n).toLocaleString('en-NG') },
    etaText(m) { m = Math.max(1, Math.round(m)); return m + ' min' },
    showBar() {
      const el = document.getElementById('mtbar'), d = this.dest, o = this.sel; if (!el || !d || !o) return; el.style.display = 'block';
      const acc = !!this.st.acc, tf = this.traffic(), arrive = this.clock(S.min + o.min), sf = o.safe, fav = this.st.fav.some(f => f.to.name === d.name && f.k === o.k);
      const notes = [];
      if (o.tf > 1.25 && o.k !== 'walk') notes.push(`<span style="color:${this.tcol(tf)}">● ${this.tlabel(tf)} traffic ×${o.tf.toFixed(1)}</span>`); else if (o.k !== 'walk') notes.push('<span style="color:#22b573">● Roads are clear</span>');
      if (this.night()) notes.push(`<span style="color:${sf > .6 ? '#22b573' : sf > .35 ? '#f5a623' : '#e5484d'}">🌙 ${sf > .6 ? 'Well lit' : sf > .35 ? 'Patchy lighting' : 'Poorly lit, avoid alone'}</span>`);
      if (acc) notes.push('♿ Step-free, wide paths'); if (o.line) notes.push(esc(o.line)); if (o.wait != null && o.k === 'bus') notes.push('Next in ' + this.waitText(o.wait));
      if (this.via) notes.push(this.via.map((v, i) => `${i + 1} ${esc(v.name)}`).join(' ➜ ') + ' ➜ ' + esc(d.name));
      el.innerHTML = `<div class="mth"><div><b>${esc(d.emoji || '📍')} ${esc(d.name)}</b><small>${this.km(o.len)} · arrive ${arrive}</small></div><button class="mtclose" aria-label="Close" onclick="MT.clear()">✕</button></div>
       <div class="mtm">${this.opts.map(x => `<button class="${x.k === o.k ? 'on' : ''}" onclick="MT.choose('${x.k}')"><span>${MODES[x.k].e}</span><b>${this.etaText(x.min)}</b><small>${x.fast ? 'Fastest' : x.fare ? this.fm(x.fare) : 'Free'}</small></button>`).join('')}</div>
       <div class="mtn">${notes.join(' · ')}${o.fare ? `<br><small>Estimated fare ${this.fm(o.fare)} (not charged yet)</small>` : ''}</div>
       <div class="mta"><button class="rbigbtn" onclick="MT.start()">Start ${MODES[o.k].e}</button><button class="mtf ${fav ? 'on' : ''}" onclick="MT.favToggle()" aria-label="Favourite route">${fav ? '★' : '☆'}</button></div>`;
    },
    start() {
      const o = this.sel; if (!o) return; const segs = o.segs.slice(), d = this.dest; this.runningTo = d; const el = document.getElementById('mtbar'); if (el) el.style.display = 'none';
      const step = i => {
        if (i >= segs.length) { this.ride = null; this.dest = null; this.opts = []; toast('📍 You arrived at ' + d.name); return }
        const s = segs[i], md = MODES[s.m], go = () => { this.ride = s.m === 'walk' ? null : md.e; if (!MAP3D.walkPath(s.path, { mul: this.mulOf(s.m), run: s.m === 'walk' ? undefined : false, cb: () => step(i + 1) })) step(i + 1) };
        if (s.wait && s.wait > .4) { this.ride = null; toast(`${md.e} ${s.waitLabel}: about ${Math.max(1, Math.round(s.wait))} min`); setTimeout(go, Math.min(9000, s.wait * 1800)) } else go();
      }; step(0);
    },
    transportOpts(d, me, acc) {
      const o = [];
      if (!acc) { const bk = this.vehOpt('bike', me, d, 0), kk = this.vehOpt('keke', me, d, 0); if (bk) o.push(bk); if (kk) o.push(kk) }
      const bo = this.busOpt(me, d, acc); if (bo) o.push(bo);
      const ro = this.vehOpt('ride', me, d, acc); if (ro) o.push(ro);
      if (!acc) { const bt = this.boatOpt(me, d); if (bt) o.push(bt) }
      return o;
    },
    /* can the player walk to d? ok is false when the walk is longer than WALK_MAX */
    walkInfo(d) {
      const me = this.me(), straight = this.dist(me, [d.x, d.y]), path = MAP3D.route(me[0], me[1], d.x, d.y, !!this.st.acc), len = path ? this.len(path) : straight * 1.3;
      return { path, len, straight, min: len / MODES.walk.sp / 3 * this.tm('walk', path || []), ok: len <= WALK_MAX && (!!path || straight < 40) };
    },
    walkNow(d) {
      const w = this.walkInfo(d);
      if (!w.path) return toast(w.straight < 40 ? '📍 You are already here' : 'No walking route');
      if (!w.ok) { toast('🚶 Too far to walk. Pick a ride, bike, bus or ferry'); this.plan(d); return }
      this.clear(); this.ride = null; MAP3D.walkPath(w.path, {});
    },

    /* ---------- fast travel (61) ---------- */
    unlocked(p) { return !!this.st.seen[p[0]] },
    unlockTick() {
      const me = this.me(); let n = 0; MAP3D.pins.forEach(p => { if (p[4] === 'boat' || this.st.seen[p[0]]) return; if (this.dist(me, [p[2], p[3]]) < 80) { this.st.seen[p[0]] = 1; n++; toast(`📍 Unlocked ${p[1]} ${p[0].replace(' · Coming soon', '')}: fast travel is open`) } });
      if (n) this.save();
    },
    fast(p) {
      const left = Math.ceil((20000 - (Date.now() - this.ftAt)) / 1000); if (left > 0) return toast('🚀 Fast travel is cooling down: ' + left + 's');
      if (!this.unlocked(p)) return toast('Walk to ' + p[0] + ' once to unlock it');
      this.ftAt = Date.now(); this.clear(); SHEET.close(true); this.fade = { t0: performance.now(), p, done: false };
    },

    /* ---------- bookmarks (72) and favourite routes (73) ---------- */
    bmHas(name) { return this.st.bm.some(b => b.name === name) },
    bmAdd(b) { if (this.bmHas(b.name)) return toast('⭐ Already bookmarked'); if (this.st.bm.length >= 30) return toast('You can keep up to 30 bookmarks'); this.st.bm.push({ name: b.name, emoji: b.emoji || '⭐', x: Math.round(b.x), y: Math.round(b.y) }); this.st.lay.bm = 1; this.save(); toast('⭐ Bookmarked ' + b.name); this.repaint() },
    bmHere() { const me = this.me(), n = this.near(MAP3D.pins.map(p => ({ x: p[2], y: p[3], name: p[0] })), me); this.bmAdd({ name: 'Spot near ' + (n ? n.name.replace(' · Coming soon', '') : 'the city') + ' #' + (this.st.bm.length + 1), emoji: '📌', x: me[0], y: me[1] }) },
    bmDel(i) { this.st.bm.splice(i, 1); this.save(); this.repaint() },
    favToggle() {
      const d = this.dest, o = this.sel; if (!d || !o) return; const i = this.st.fav.findIndex(f => f.to.name === d.name && f.k === o.k);
      if (i >= 0) { this.st.fav.splice(i, 1); toast('Route removed from favourites') } else { if (this.st.fav.length >= 12) return toast('You can keep up to 12 favourite routes'); const me = this.me(), n = this.near(MAP3D.pins.map(p => ({ x: p[2], y: p[3], name: p[0] })), me); this.st.fav.push({ from: n ? n.name.replace(' · Coming soon', '') : 'My spot', to: { name: d.name, emoji: d.emoji || '📍', x: Math.round(d.x), y: Math.round(d.y) }, k: o.k }); toast('★ Saved to favourite routes') }
      this.save(); this.showBar(); this.repaint();
    },
    favGo(i) { const f = this.st.fav[i]; if (f) this.plan(f.to, f.k) },
    favDel(i) { this.st.fav.splice(i, 1); this.save(); this.repaint() },

    /* ---------- search (69, 70, 71) ---------- */
    search() {
      const q = this.q.trim().toLowerCase(), me = this.me(), out = [];
      if (this.qk === 'biz') {
        MAP3D.pins.forEach(p => { const nm = p[0].replace(' · Coming soon', ''), hay = (nm + ' ' + (p[6] || '') + ' ' + (KW[p[4]] || '') + ' ' + p[4]).toLowerCase(); if (q && !q.split(/\s+/).every(w => hay.includes(w))) return; out.push({ name: nm, emoji: p[1], x: p[2], y: p[3], sub: p[6] || (KW[p[4]] || '').split(' ').slice(0, 3).join(', '), pin: p }) });
      } else if (this.qk === 'ply') {
        const o = MAP3D.state.others; if (o) o.forEach((v, name) => { if (q && !name.toLowerCase().includes(q)) return; out.push({ name, emoji: '👤', x: v.av.x, y: v.av.y, sub: 'On the map now', player: 1 }) });
      } else {
        const e = this.ev(), list = [];
        if (e) list.push({ id: e.id, t: e.title + ' · now', i: e.icon, tx: e.text });
        [['owambe', '🎉', 'Owambe weekend', 'Parties and aso-ebi'], ['market', '🛍️', 'Market day', 'Cheaper goods'], ['rain', '🌧️', 'Heavy rain and flooding', 'Low areas flood'], ['goslow', '🚗', 'Third Mainland go-slow', 'Bridge traffic'], ['fuel', '⛽', 'Fuel scarcity', 'Queues at stations']].forEach(([id, i, t, tx]) => { if (!e || e.id !== id) list.push({ id, t, i, tx }) });
        if (this.weekend()) list.push({ id: 'weekend', t: 'Weekend matches and shows', i: '🏟', tx: 'Stadium, film village and museum are busy' });
        list.forEach(ev => { const hay = (ev.t + ' ' + ev.id + ' ' + ev.tx).toLowerCase(); if (q && !hay.includes(q)) return; const ven = (ev.id === 'weekend' ? ['Stadium District', 'Film Village', 'Museum Quarter'] : EV_VENUES[ev.id] || []).map(n => MAP3D.pins.find(p => p[0] === n)).filter(Boolean); out.push({ name: ev.t, emoji: ev.i, sub: ev.tx, ev: ev.id, venues: ven.map(p => ({ name: p[0], emoji: p[1], x: p[2], y: p[3] })) }) });
      }
      out.forEach(r => { r.d = r.x != null ? this.dist(me, [r.x, r.y]) : 0 }); if (this.qk !== 'ev') out.sort((a, b) => a.d - b.d); this.res = out.slice(0, 24); return this.res;
    },
    resHtml() {
      const r = this.search(); if (!r.length) return `<p class="empty">${this.qk === 'ply' ? 'No other players are on the map right now.' : 'Nothing found.'}</p>`;
      return r.map((x, i) => x.ev ? `<div class="mtr"><span class="e">${x.emoji}</span><div><b>${esc(x.name)}</b><small>${esc(x.sub)}</small>${x.venues.map((v, j) => `<button class="mtc" onclick="MT.venue(${i},${j})">${v.emoji} ${esc(v.name)}</button>`).join('')}</div></div>`
        : `<div class="mtr"><span class="e">${x.emoji}</span><div><b>${esc(x.name)}</b><small>${esc(x.sub || '')} · ${this.km(x.d)} away</small></div><button onclick="MT.go(${i})">Route</button>${x.player ? '' : `<button onclick="MT.bmRes(${i})" aria-label="Bookmark">${this.bmHas(x.name) ? '★' : '☆'}</button>`}</div>`).join('');
    },
    setQ(v) { this.q = v; const b = document.getElementById('mtres'); if (b) b.innerHTML = this.resHtml() },
    setQK(k) { this.qk = k; this.q = ''; this.repaint() },
    go(i) { const r = this.res[i]; if (r) this.plan({ name: r.name, emoji: r.emoji, x: r.x, y: r.y }) },
    venue(i, j) { const v = this.res[i] && this.res[i].venues[j]; if (v) { this.st.lay.festival = 1; this.save(); this.plan(v) } },
    bmRes(i) { const r = this.res[i]; if (r) this.bmAdd(r) },

    /* ---------- the sheets ---------- */
    open(tab) {
      this.prep(); if (tab) this.tab = tab;
      SHEET.open({ id: 'maptools', title: '🧭 Map tools', tabs: [{ id: 'go', label: 'Go' }, { id: 'travel', label: 'Travel' }, { id: 'transit', label: 'Transit' }, { id: 'layers', label: 'Layers' }], tab: this.tab, onTab: t => { this.tab = t }, body: t => this.body(t) });
    },
    repaint() { if (SHEET.isOpen('maptools')) SHEET.paint() },
    body(t) {
      if (t === 'go') return this.goHtml(); if (t === 'travel') return this.travelHtml(); if (t === 'transit') return this.transitHtml(); return this.layersHtml();
    },
    goHtml() {
      const ch = (k, l) => `<button class="${this.qk === k ? 'on' : ''}" onclick="MT.setQK('${k}')">${l}</button>`;
      return `<input class="sinput" id="mtq" placeholder="Search the map" value="${esc(this.q)}" autocomplete="off" oninput="MT.setQ(this.value)">
       <div class="mtchips">${ch('biz', '🏪 Business')}${ch('ply', '👤 Player')}${ch('ev', '🎉 Event')}</div><div id="mtres">${this.resHtml()}</div>
       <h4>Bookmarks</h4>${this.st.bm.length ? this.st.bm.map((b, i) => `<div class="mtr"><span class="e">${b.emoji}</span><div><b>${esc(b.name)}</b></div><button onclick="MT.plan({name:'${esc(b.name).replace(/'/g, '')}',emoji:'${b.emoji}',x:${b.x},y:${b.y}})">Route</button><button onclick="MT.bmDel(${i})" aria-label="Remove">✕</button></div>`).join('') : '<p class="empty">No bookmarks yet. Tap ☆ on a search result or a landmark.</p>'}
       <button class="rbigbtn ghost" onclick="MT.bmHere()">📌 Bookmark where I stand</button>
       <h4>Favourite routes</h4>${this.st.fav.length ? this.st.fav.map((f, i) => `<div class="mtr"><span class="e">${MODES[f.k].e}</span><div><b>${esc(f.from)} ➜ ${esc(f.to.name)}</b><small>${MODES[f.k].n}</small></div><button onclick="MT.favGo(${i})">Go</button><button onclick="MT.favDel(${i})" aria-label="Remove">✕</button></div>`).join('') : '<p class="empty">Plan a route and tap ☆ to keep it here.</p>'}`;
    },
    travelHtml() {
      const ps = MAP3D.pins.filter(p => p[4] !== 'boat' && p[5] !== 'soon-y' || p[4] === 'airport'), un = ps.filter(p => this.unlocked(p)), me = this.me(), left = Math.ceil((20000 - (Date.now() - this.ftAt)) / 1000);
      return `<p class="hsub">Walk up to a landmark once to unlock it. Then jump between unlocked places for free (20 second cooldown).</p><div class="mtc2">${un.length} of ${ps.length} landmarks unlocked${left > 0 ? ' · cooling down ' + left + 's' : ''}</div>
       ${un.sort((a, b) => this.dist(me, [a[2], a[3]]) - this.dist(me, [b[2], b[3]])).map(p => { const i = MAP3D.pins.indexOf(p); return `<div class="mtr"><span class="e">${p[1]}</span><div><b>${esc(p[0].replace(' · Coming soon', ''))}</b><small>${this.km(this.dist(me, [p[2], p[3]]))} away</small></div><button onclick="MT.fast(MAP3D.pins[${i}])">🚀 Travel</button></div>` }).join('')}`;
    },
    transitHtml() {
      const f = this.tlabel(this.traffic()), nowS = this.clock(S.min);
      const bus = this.lines.map(L => `<div class="mtl" style="border-color:${L.c}"><b style="color:${L.c}">${L.id} · ${esc(L.name)}</b>${L.stops.map((s, i) => { const a = this.arrivals(L, i); return `<div class="mts"><span>🚏 ${esc(s.name)}</span><small>${a ? a.slice(0, 3).map(x => (x.dir === 'f' ? '→' : '←') + ' ' + this.waitText(x.min)).join(' · ') : 'No service until 5:00 am'}</small><button onclick="MT.plan({name:'${esc(s.name)} stop',emoji:'🚏',x:${Math.round(s.x)},y:${Math.round(s.y)}},'bus')">Go</button></div>` }).join('')}</div>`).join('');
      const pts = this.points.map((p, i) => `<div class="mtr"><span class="e">${p.t.includes('ride') ? '🚕' : '🛺'}</span><div><b>${esc(p.name)}</b><small>${p.t.map(t => MODES[t].e + ' ' + MODES[t].n).join(' · ')}${this.pp === p.name ? ' · your pickup' : ''}</small></div><button onclick="MT.setPickup(${i})">Use</button><button onclick="MT.plan({name:'${esc(p.name)}',emoji:'🚕',x:${Math.round(p.x)},y:${Math.round(p.y)}},'walk')">Walk</button></div>`).join('');
      const fer = this.ferries.map(F => `<div class="mtl" style="border-color:#0ea5e9"><b style="color:#0ea5e9">⛵ ${esc(F.name)}</b><div class="mts"><span>⚓ ${esc(F.a.name)}</span><small>next ${this.waitText(this.fnext(F, 'a'))}</small><button onclick="MT.plan({name:'${esc(F.a.name)}',emoji:'⚓',x:${Math.round(F.a.x)},y:${Math.round(F.a.y)}},'walk')">Go</button></div><div class="mts"><span>⚓ ${esc(F.b.name)}</span><small>next ${this.waitText(this.fnext(F, 'b'))}</small><button onclick="MT.plan({name:'${esc(F.b.name)}',emoji:'⚓',x:${Math.round(F.b.x)},y:${Math.round(F.b.y)}},'walk')">Go</button></div></div>`).join('');
      const air = this.air.map((a, i) => `<div class="mtr"><span class="e">✈️</span><div><b>${esc(a.name)}</b></div><button onclick="MT.airGo(${i})">Route</button></div>`).join('');
      return `<div class="mtc2">${nowS} · traffic <b style="color:${this.tcol(this.traffic())}">${f}</b>${this.inService() ? '' : ' · buses are off until 5:00 am'}</div>
       <h4>Bus stops, live</h4>${bus}<h4>Ride, tricycle and bike pickups</h4><p class="hsub">${this.pp ? 'Ride pickup: ' + esc(this.pp) + '.' : 'The nearest pickup is chosen for you.'} Pick a place, then choose 🚕 🛺 or 🚲 in the route bar. Fares are estimates.</p>${pts}
       <h4>Ferries</h4>${fer}<h4>✈️ Airport terminal</h4><div class="mtchips"><button onclick="MT.airTrip('dep')">Departures</button><button onclick="MT.airTrip('arr')">Arrivals</button></div>${air}`;
    },
    layersHtml() {
      const L = this.st.lay, w = this.weather(), tre = this.treasure(), done = (this.st.tre[this.tkey] || []).filter(Boolean).length;
      const row = (k, ic, l, d) => `<button class="trow" onclick="MT.lay('${k}')"><span class="ti"><i class="${ic}"></i></span><span class="tl">${l}<small class="mtd">${d}</small></span><span class="sw2 ${L[k] ? 'on' : ''}"><i></i></span></button>`;
      return `<div class="sgrp">${row('transit', 'fa-solid fa-bus', 'Transit', 'Bus lines, stops, ferries and pickups')}${row('traffic', 'fa-solid fa-traffic-light', 'Traffic', 'Road colours: now ' + this.tlabel(this.traffic()).toLowerCase())}${row('safety', 'fa-solid fa-moon', 'Night safety', this.night() ? 'It is night: green is lit, red is dark' : 'Preview (it is daytime)')}${row('crowd', 'fa-solid fa-users', 'Crowd density', 'Where it is busy right now')}${row('weather', 'fa-solid fa-cloud-sun-rain', 'Weather', w.e + ' ' + w.t + '°C · ' + w.c)}${row('festival', 'fa-solid fa-champagne-glasses', 'Festivals', this.festNow().length ? this.festNow().length + ' venues celebrating today' : 'Nothing on right now')}${row('treasure', 'fa-solid fa-gem', 'Treasure hunt', done + ' of ' + tre.length + ' found today')}${row('photo', 'fa-solid fa-camera', 'Photo spots', this.photos.length + ' viewpoints, best light shown')}${row('bm', 'fa-solid fa-star', 'Bookmarks', 'Show your saved places')}</div>
       <div class="lab2">ROUTING</div><div class="sgrp"><button class="trow" onclick="MT.accToggle()"><span class="ti"><i class="fa-solid fa-wheelchair"></i></span><span class="tl">Accessible routes<small class="mtd">Wide, step-free paths. Buses and rides only, no bikes, keke or ferries</small></span><span class="sw2 ${this.st.acc ? 'on' : ''}"><i></i></span></button></div>`;
    },
    lay(k) { this.st.lay[k] = this.st.lay[k] ? 0 : 1; this.save(); if (k === 'treasure') this.treasure(); this.repaint(); this.chip() },
    accToggle() { this.st.acc = this.st.acc ? 0 : 1; this.save(); this.repaint(); if (this.dest) this.plan(this.dest) },
    setPickup(i) { this.pp = this.points[i].name; toast('🚕 Pickup set: ' + this.pp); this.repaint() },
    airGo(i) { const a = this.air[i]; this.plan({ name: a.name, emoji: '✈️', x: a.x, y: a.y }) },
    airTrip(kind) { const names = kind === 'dep' ? ['Check-in', 'Security', 'Gate 1'] : ['Arrivals hall', 'Baggage claim', 'Taxi rank'], p = names.map(n => this.air.find(a => a.name === n)), d = p.pop(); this.plan({ name: d.name, emoji: '✈️', x: d.x, y: d.y }, 'walk', p) },
    /* The popup behind every circle on the map. Close enough: walk there. Too far: no walking, the best ways to travel are listed instead. */
    destState(d) {
      const me = this.me(), acc = this.st.acc ? 1 : 0, key = Math.round(me[0] / 20) + ',' + Math.round(me[1] / 20) + '|' + Math.round(d.x) + ',' + Math.round(d.y) + '|' + acc + '|' + this.pp + '|' + this.inService() + '|' + Math.floor(S.min / 5);
      if (this.dc && this.dc.key === key) return this.dc;
      const w = this.walkInfo(d), opts = w.ok ? [] : this.transportOpts(d, me, !!acc).sort((x, y) => x.min - y.min);
      return (this.dc = { key, w, opts });
    },
    destSheet(d, o) {
      this.prep(); o = o || {}; this.cur = { d, pin: o.pin || null, o }; this.dc = null;
      SHEET.open({ id: 'mtpin', title: o.title || esc(d.name), body: () => this.destBody() }); this.liveSheet = true;
    },
    destBody() {
      const c = this.cur; if (!c) return ''; const { d, pin: p, o } = c, st = this.destState(d), w = st.w, me = this.me(), away = w.path ? w.len : this.dist(me, [d.x, d.y]);
      let h = o.sub ? `<p class="hsub">${esc(o.sub)}</p>` : ''; if (o.extra) h += o.extra();
      let info = this.km(away) + ' away';
      if (p) { const cr = this.crowd(p), un = this.unlocked(p); info += ` · crowd <b style="color:${cr > .66 ? '#e5484d' : cr > .33 ? '#f5a623' : '#22b573'}">${this.clabel(cr)}</b>${un ? ' · unlocked' : ' · walk here once to unlock fast travel'}` }
      h += `<div class="mtc2">${info}</div>`;
      if (w.ok) {
        h += `<div class="mtc2 mtok">🚶 Close enough to walk · about ${this.etaText(w.min)}</div><button class="rbigbtn" onclick="MT.sheetAct('walk')">🚶 Walk there now</button><button class="rbigbtn ghost" onclick="MT.sheetAct('plan','walk')">🧭 Preview route</button>`;
      } else {
        h += `<div class="mtc2 mtfar">🚫 Too far to walk (${this.km(away)}). Take one of these instead:</div>`;
        if (st.opts.length) {
          const fast = st.opts[0], paid = st.opts.filter(x => x.fare), cheap = paid.length ? paid.reduce((a, b) => b.fare < a.fare ? b : a) : null;
          h += st.opts.map(x => `<div class="mtr"><span class="e">${MODES[x.k].e}</span><div><b>${MODES[x.k].n}${x.line ? ' · ' + esc(x.line) : ''}${x === fast ? '<span class="mtag">Recommended</span>' : ''}${x === cheap && x !== fast ? '<span class="mtag alt">Cheapest</span>' : ''}</b><small>${this.etaText(x.min)} · ${this.fm(x.fare)}${x.from ? ' · pickup ' + esc(x.from) : ''}${x.k === 'bus' && x.wait != null ? ' · next in ' + this.waitText(x.wait) : ''}</small></div><button onclick="MT.sheetAct('plan','${x.k}')">Go</button></div>`).join('');
        } else h += '<p class="empty">No transport can reach this spot right now.</p>';
        h += '<button class="rbigbtn ghost" disabled>🚶 Too far to walk</button>';
      }
      if (p) {
        const i = MAP3D.pins.indexOf(p), un = this.unlocked(p), nm = p[0].replace(' · Coming soon', '');
        if (un && this.dist(me, [p[2], p[3]]) > 150) h += `<button class="rbigbtn ghost" onclick="MT.sheetAct('fast')">🚀 Fast travel</button>`;
        h += `<div class="mtacts"><button onclick="MT.sheetAct('bm')">${this.bmHas(nm) ? '★ Bookmarked' : '☆ Bookmark'}</button><button onclick="MT.sheetAct('visit')">🏠 Visit</button><button onclick="MT.sheetAct('info')">ℹ️ Details and nearby</button></div>`;
      }
      return h;
    },
    sheetAct(a, k) {
      const c = this.cur; if (!c) return; const d = c.d, p = c.pin;
      if (a === 'walk') { SHEET.close(true); this.walkNow(d) }
      else if (a === 'plan') this.plan(d, k);
      else if (a === 'fast' && p) this.fast(p);
      else if (a === 'bm') { this.bmAdd(d); SHEET.close() }
      else if (a === 'visit' && p) MAP3D.visit(p[1], p[0].replace(' · Coming soon', ''));
      else if (a === 'info' && p) MAP3D.openByName(p[0]);
    },
    pinSheet(p) {
      const nm = p[0].replace(' · Coming soon', '');
      this.destSheet({ name: nm, emoji: p[1], x: p[2], y: p[3] }, { title: `${p[1]} ${esc(nm)}`, sub: p[6] || (KW[p[4]] || '').split(' ').slice(0, 3).join(', ') || 'A Lagos landmark', pin: p });
    },
    vSheet(v) {
      if (v.type === 'stop') {
        const L = this.lines[v.l], s = L.stops[v.i];
        this.destSheet({ name: s.name + ' stop', emoji: '🚏', x: s.x, y: s.y }, { title: `🚏 ${esc(s.name)}`, extra: () => { const a = this.arrivals(L, v.i); return `<div class="mtc2" style="color:${L.c}">${L.id} · ${esc(L.name)}</div>${a ? a.slice(0, 4).map(x => `<div class="mts"><span>${x.dir === 'f' ? '→ towards ' + esc(L.stops[L.stops.length - 1].name) : '← towards ' + esc(L.stops[0].name)}</span><small>${this.waitText(x.min)}</small></div>`).join('') : '<p class="empty">No service until 5:00 am.</p>'}` } });
      }
      else if (v.type === 'pier') this.destSheet({ name: v.name, emoji: '⚓', x: v.x, y: v.y }, { title: '⚓ ' + esc(v.name), sub: 'Ferry pier' });
      else if (v.type === 'point') this.destSheet({ name: v.name, emoji: '🚕', x: v.x, y: v.y }, { title: '🚕 ' + esc(v.name), sub: 'Pickup point for ' + v.t.map(t => MODES[t].n).join(', ') });
      else if (v.type === 'bm') this.destSheet({ name: v.name, emoji: '⭐', x: v.x, y: v.y }, { title: '⭐ ' + esc(v.name), sub: 'Your bookmark' });
      else if (v.type === 'photo') { const ph = v.ph; this.destSheet({ name: ph.name, emoji: '📸', x: ph.x, y: ph.y }, { title: '📸 ' + esc(ph.name), sub: `Best light ${this.clock(ph.h0 * 60)} to ${this.clock(ph.h1 * 60)}${this.inLight(ph) ? ' (now!)' : ''}` }) }
    },
    onPin(p) { if (p.v) { this.prep(); this.vSheet(p.v); return true } if (p[5] === 'mt') return true; if (p[5] === 'home') return false; this.pinSheet(p); return true },
    /* buttons added to the place sheet that opens when a landmark is tapped */
    placeActions(p) {
      const i = MAP3D.pins.indexOf(p); if (i < 0) return ''; const un = this.unlocked(p);
      return `<div class="mtacts"><button onclick="MT.pinAct(${i},'route')">🧭 Route</button>${un ? `<button onclick="MT.pinAct(${i},'fast')">🚀 Fast travel</button>` : '<button disabled title="Walk here once to unlock">🔒 Fast travel</button>'}<button onclick="MT.pinAct(${i},'bm')">${this.bmHas(p[0].replace(' · Coming soon', '')) ? '★' : '☆'} Bookmark</button></div>`;
    },
    pinAct(i, k) {
      const p = MAP3D.pins[i]; if (!p) return; const d = { name: p[0].replace(' · Coming soon', ''), emoji: p[1], x: p[2], y: p[3] };
      if (k === 'route') { SHEET.close(); this.plan(d) } else if (k === 'fast') this.fast(p); else this.bmAdd(d);
    },
    inLight(ph) { const h = this.hrs(); return h >= ph.h0 && h < ph.h1 },
    festNow() {
      const e = this.evId(), out = new Set(); if (e === 'owambe') ['Eko Hotels', 'Freedom Park', 'Quilox', 'Convention Centre'].forEach(n => out.add(n)); if (e === 'market') ['Agege Market', 'Lagos Island'].forEach(n => out.add(n));
      if (this.weekend()) ['Stadium District', 'Freedom Park', 'Film Village', 'Museum Quarter'].forEach(n => out.add(n)); return MAP3D.pins.filter(p => out.has(p[0]));
    },

    /* ---------- map chips (weather, treasure, photo prompts) ---------- */
    mount() {
      const map = document.getElementById('map'); if (!map || document.getElementById('mttools')) return;
      map.insertAdjacentHTML('beforeend', `<div id="mttools"><button class="pill mtb" onclick="MT.open()" aria-label="Map tools">🧭 Tools</button><button class="pill mtw" id="mtw" onclick="MT.open('layers')"></button></div><div id="mtnote" class="pill" style="display:none"></div><div id="mtbar" style="display:none"></div>`);
    },
    chip() {
      const w = this.weather(), el = document.getElementById('mtw'); if (el) el.textContent = `${w.e} ${w.t}°C`;
      const nt = document.getElementById('mtnote'); if (!nt) return; const me = this.me(); let html = '';
      const ph = this.st.lay.photo && this.near(this.photos, me); if (ph && this.dist(me, [ph.x, ph.y]) < 45) html = `<button onclick="MT.snap('${esc(ph.name).replace(/'/g, '')}')">📸 ${esc(ph.name)}${this.inLight(ph) ? ' · golden light!' : ''} · take a photo</button>`;
      else if (this.st.lay.treasure) { const key = this.tkey, got = this.st.tre[key] || [], c = this.treasure().map((s, i) => ({ d: this.dist(me, [s.x, s.y]), i })).filter(x => !got[x.i]).sort((a, b) => a.d - b.d)[0]; if (c) html = `💎 ${got.filter(Boolean).length}/6 · ${c.d < 60 ? '🔥 Burning hot' : c.d < 140 ? '🌡 Warm' : c.d < 300 ? '🧊 Cool' : '❄️ Cold'}` }
      nt.innerHTML = html; nt.style.display = html ? 'block' : 'none';
    },
    snap(name) { this.st.ph[name] = (this.st.ph[name] || 0) + 1; this.save(); if (typeof CAM !== 'undefined' && CAM.open) CAM.open(); else toast('📸 Nice shot!') },
    treasureTick() {
      if (!this.st.lay.treasure) return; const me = this.me(), sp = this.treasure(), got = this.st.tre[this.tkey] || (this.st.tre[this.tkey] = [0, 0, 0, 0, 0, 0]);
      sp.forEach((s, i) => { if (!got[i] && this.dist(me, [s.x, s.y]) < 24) { got[i] = 1; this.save(); toast('💎 Treasure found! ' + got.filter(Boolean).length + '/6'); if (typeof findGem === 'function') findGem() } });
    },

    /* ---------- drawing ---------- */
    line(ctx, H, pts, color, w, z, dash) {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath(); let on = false;
      for (const q of pts) { const p = H.project(q[0], q[1], z); if (!p) { on = false; continue } on ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); on = true } ctx.stroke(); ctx.setLineDash([])
    },
    mark(ctx, H, x, y, em, pin, bg, ring) {
      const p = H.project(x, y, 10); if (!p || p.x < -30 || p.x > H.M.w + 30 || p.y < -30 || p.y > H.M.h + 30) return null;
      if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, TAU); ctx.stroke() }
      ctx.fillStyle = bg || '#fff'; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 5; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText(em, p.x, p.y + 1);
      if (pin) H.M.hits.push({ x: p.x - 14, y: p.y - 14, w: 28, h: 28, pin, kind: 'pin' }); return p;
    },
    vpin(name, em, x, y, v) { const a = [name, em, x, y, 'mt', 'mt', '']; a.v = v; return a },
    drawWorld(ctx, t, H) {
      if (!this.ready) return; const now = performance.now(), dt = Math.min(.1, (now - (this.lt || now)) / 1000); this.lt = now; this.sim(dt); const L = this.st.lay, D = H.cam.D, near = D < 900, cx = H.M;
      if (now - this.ptick > 600) { this.ptick = now; this.unlockTick(); this.treasureTick(); this.chip() }
      if (this.liveSheet && !SHEET.isOpen('mtpin')) this.liveSheet = false;
      // weather: flood zones
      const w = this.weather(); if (L.weather && w.rain) [0, 6, 10, 13].forEach(i => { const z = H.cam && MAP3D.zones[i]; if (z) H.poly(ctx, H.rect(z.x, z.y, z.w, z.h, .8), 'rgba(56,140,220,.35)') });
      // night safety
      if (L.safety) { const a = this.night() ? .36 : .16; this.safe.forEach(c => { if (c.s < .02) return; H.poly(ctx, H.rect(c.x - 25, c.y - 25, 50, 50, .6), c.s > .6 ? `rgba(34,181,115,${a})` : c.s > .3 ? `rgba(245,166,35,${a})` : `rgba(229,72,77,${a + .04})`) }) }
      // traffic on the main roads and bridges
      if (L.traffic) { const f = this.traffic(), g = this.evId() === 'goslow' ? 1.6 : 1.1; [120, 240, 350].forEach(y => H.poly(ctx, H.rect(30, y - 3, 940, 6, 1), this.tcol(f))); [640, 750, 860, 940].forEach(y => H.poly(ctx, H.rect(30, y - 3, 940, 6, 1), this.tcol(f))); MAP3D.bridges.slice(0, 3).forEach(b => H.poly(ctx, H.rect(b[0] + 8, b[1], 8, b[3], 1.6), this.tcol(f * g))) }
      // festival glow
      if (L.festival) this.festNow().forEach((p, i) => { const q = H.project(p[2], p[3], 30); if (!q) return; for (let k = 0; k < 10; k++) { const a = t * 1.2 + k / 10 * TAU, r = (34 + (k % 3) * 8) * q.k * 2.4; ctx.fillStyle = ['#d946ef', '#f59e0b', '#22b573', '#0ea5e9', '#e5484d'][(k + i) % 5]; ctx.beginPath(); ctx.arc(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r * .55 - 14, 3.2, 0, TAU); ctx.fill() } this.mark(ctx, H, p[2], p[3], '🎉', null, '#fff3fb') });
      // crowd blobs
      if (L.crowd) MAP3D.pins.forEach(p => { if (p[4] === 'boat') return; const q = H.project(p[2], p[3], 0); if (!q) return; const v = this.crowd(p), r = (36 + v * 80) * q.k * 2.2, col = v > .66 ? '229,72,77' : v > .33 ? '245,166,35' : '34,181,115', gr = ctx.createRadialGradient(q.x, q.y, 2, q.x, q.y, Math.max(8, r)); gr.addColorStop(0, `rgba(${col},.55)`); gr.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(8, r), 0, TAU); ctx.fill() });
      // route preview
      if (this.sel && this.dest) {
        const o = this.sel, f = this.traffic();
        o.segs.forEach(s => { const road = ['keke', 'bus', 'ride'].includes(s.m); this.line(ctx, H, s.path, 'rgba(255,255,255,.95)', 9, 1.5); if (road) { for (let i = 1; i < s.path.length; i++) { const bridge = MAP3D.onBridge((s.path[i][0] + s.path[i - 1][0]) / 2, (s.path[i][1] + s.path[i - 1][1]) / 2), ff = f * (bridge && this.evId() === 'goslow' ? 1.6 : 1); this.line(ctx, H, [s.path[i - 1], s.path[i]], this.evId() === 'goslow' || f > 1.3 ? this.tcol(ff) : COL[s.m], 5, 1.6) } } else this.line(ctx, H, s.path, COL[s.m], 5, 1.6, s.m === 'walk' ? [2, 9] : s.m === 'boat' ? [10, 8] : null) });
        const s0 = o.segs[0].path[0], d = this.dest; this.mark(ctx, H, s0[0], s0[1], '🟢', null, '#fff'); const e = this.mark(ctx, H, d.x, d.y, '🏁', null, '#fff'); if (e) { ctx.font = '700 12px "Plus Jakarta Sans",system-ui,sans-serif'; const txt = this.etaText(o.min), tw = ctx.measureText(txt).width + 16; ctx.fillStyle = '#1b1f33'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(e.x - tw / 2, e.y - 40, tw, 22, 11) : ctx.rect(e.x - tw / 2, e.y - 40, tw, 22); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(txt, e.x, e.y - 28) }
      }
      // transit: lines, buses, stops, ferries, pickups
      if (L.transit) {
        this.lines.forEach(Ln => this.line(ctx, H, Ln.path, Ln.c, 4, .9)); this.ferries.forEach(F => this.line(ctx, H, [[F.a.x, F.a.y], [F.b.x, F.b.y]], '#0ea5e9', 3, .9, [10, 8]));
        if (near) {
          this.lines.forEach((Ln, li) => { Ln.stops.forEach((s, i) => this.mark(ctx, H, s.x, s.y, '🚏', this.vpin(s.name, '🚏', s.x, s.y, { type: 'stop', l: li, i }), '#fff', Ln.c)); if (this.inService()) for (let k = 0; k < Ln.n; k++) { const p = this.busPos(Ln, k); this.mark(ctx, H, p[0], p[1], '🚌', null, Ln.c) } });
          this.ferries.forEach(F => { [F.a, F.b].forEach(p => this.mark(ctx, H, p.x, p.y, '⚓', this.vpin(p.name, '⚓', p.x, p.y, { type: 'pier', name: p.name, x: p.x, y: p.y }), '#e0f2fe')); const p = this.fpos(F); this.mark(ctx, H, p[0], p[1], '⛴', null, '#e0f2fe') });
          this.points.forEach(p => this.mark(ctx, H, p.x, p.y, p.t.includes('ride') ? '🚕' : '🛺', this.vpin(p.name, '🚕', p.x, p.y, { type: 'point', name: p.name, x: p.x, y: p.y, t: p.t }), '#f3e8ff'));
        }
      }
      if (L.bm && near) this.st.bm.forEach(b => this.mark(ctx, H, b.x, b.y, b.emoji, this.vpin(b.name, '⭐', b.x, b.y, { type: 'bm', name: b.name, x: b.x, y: b.y }), '#fff7d6'));
      if (L.photo && near) this.photos.forEach(ph => this.mark(ctx, H, ph.x, ph.y, '📸', this.vpin(ph.name, '📸', ph.x, ph.y, { type: 'photo', ph }), '#fff', this.inLight(ph) ? '#f5b301' : null));
      if (L.treasure) { const got = this.st.tre[this.tkey] || []; this.treasure().forEach((s, i) => { if (got[i]) return; const q = H.project(s.x + s.ox, s.y + s.oy, 0); if (!q) return; ctx.strokeStyle = 'rgba(245,179,1,.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.ellipse(q.x, q.y, 80 * q.k * 2.4, 80 * q.k * 1.35, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#b8860b'; ctx.fillText('?', q.x, q.y + 5); if (this.dist(this.me(), [s.x, s.y]) < 70) this.mark(ctx, H, s.x, s.y, '💎', null, '#fff') }) }
      // your vehicle
      const me = MAP3D.me; if (this.ride && me) { if (!H.M.path) this.ride = null; else { const q = H.project(me.x, me.y, 22); if (q) { ctx.font = '22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.ride, q.x, q.y) } } }
    },
    drawScreen(ctx, t, H) {
      if (!this.ready) return; const w = this.weather(), M = H.M;
      if (this.st.lay.weather) {
        if (w.rain) { const heavy = w.intensity >= 3, count = w.intensity === 1 ? 28 : w.intensity === 2 ? 58 : w.intensity === 3 ? 105 : 135; ctx.fillStyle = `rgba(20,35,60,${heavy ? .22 : .09})`; ctx.fillRect(0, 0, M.w, M.h); ctx.strokeStyle = `rgba(210,230,255,${heavy ? .68 : .42})`; ctx.lineWidth = heavy ? 1.35 : .85; ctx.beginPath(); for (let i = 0; i < count; i++) { const x = (i * 137.5 + t * (heavy ? 150 : 55)) % (M.w + 30), y = (i * 71.3 + t * (heavy ? 900 : 420)) % (M.h + 20), len = w.intensity === 1 ? 5 : w.intensity === 2 ? 9 : 14 + w.intensity * 2; ctx.moveTo(x, y); ctx.lineTo(x - len * .45, y + len) } ctx.stroke(); if (w.type === 'thunderstorm' && Math.sin(t * 2.7) > .985) { ctx.fillStyle = 'rgba(230,240,255,.34)'; ctx.fillRect(0, 0, M.w, M.h); } }
        else if (!this.night()) { ctx.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < 4; i++) { const x = ((i * 310 + t * 8) % (M.w + 300)) - 150, y = (i * 190 + 80) % M.h; ctx.beginPath(); ctx.ellipse(x, y, 130, 46, 0, 0, TAU); ctx.fill() } }
      }
      if (this.fade) {
        const el = (performance.now() - this.fade.t0) / 1000; let a; if (el < .35) a = el / .35; else { if (!this.fade.done) { this.fade.done = true; MAP3D.teleport(this.fade.p[2], this.fade.p[3]); toast(`🚀 Arrived at ${this.fade.p[1]} ${this.fade.p[0].replace(' · Coming soon', '')}`) } a = Math.max(0, 1 - (el - .35) / .45) }
        ctx.fillStyle = `rgba(10,14,32,${a})`; ctx.fillRect(0, 0, M.w, M.h); if (a > .5) { ctx.fillStyle = '#fff'; ctx.font = '700 18px "Plus Jakarta Sans",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🚀 Fast travel', M.w / 2, M.h / 2) } if (el > .8) this.fade = null;
      }
    },

    /* ---------- show / hide with the map ---------- */
    onShow() { this.load(); this.mount(); this.prep(); this.treasure(); const t = document.getElementById('mttools'); if (t) t.style.display = 'flex'; this.chip(); clearInterval(this.iv); this.iv = setInterval(() => { if (SHEET.isOpen('maptools') && (this.tab === 'transit' || this.tab === 'travel')) SHEET.paint(); else if (this.liveSheet && SHEET.isOpen('mtpin')) SHEET.paint() }, 3000) },
    onHide() { const t = document.getElementById('mttools'); if (t) t.style.display = 'none'; const n = document.getElementById('mtnote'); if (n) n.style.display = 'none'; clearInterval(this.iv); this.clear() }
  };
  return T;
})();
window.MT = MT;
(function () { const a = MAP3D.show, b = MAP3D.hide; MAP3D.show = function () { a.apply(MAP3D, arguments); try { MT.onShow() } catch (e) { console.error(e) } }; MAP3D.hide = function () { b.apply(MAP3D, arguments); try { MT.onHide() } catch (e) {} } })();
