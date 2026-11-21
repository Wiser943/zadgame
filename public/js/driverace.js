/* ===================== Drive Race =====================
   A landscape kart racer for up to 10 players, opened from GameHub: DRACE.open().
   Danfos, taxis and kekes race round the Lagos Grand Prix with item boxes, power-ups, boost pads and drift boosts.
   Everything here is the game screen; the rules (who is where, items, hits, results) are decided by the server (sockets/raceroom.js).
   The road is drawn in the classic "pseudo-3D" way: the track is a list of short segments that are projected onto the screen. */
const DRACE = (() => {
  'use strict';
  const T = RaceTrack.build();
  const { SEG, ROAD, MAXV, n: N, L, segs } = T;
  const CAMH = 1400, CAMD = 1 / Math.tan((100 / 2) * Math.PI / 180), PLAYERZ = CAMH * CAMD, DRAW = 190, LANES = 3, KARTW = 440;
  const ITEM = { nitro: ['🔥', 'Nitro'], shield: ['🛡️', 'Shield'], oil: ['🛢️', 'Oil spill'], rocket: ['🚀', 'Rocket'], goslow: ['🐌', 'Go-slow'], mega: ['⭐', 'Mega boost'] };
  const TYPES = { danfo: 'Danfo', taxi: 'Taxi', keke: 'Keke' };
  const mod = (a, b) => ((a % b) + b) % b, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const wrapDiff = (a, b) => ((((a - b) % L) + L + L / 2) % L) - L / 2;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mixc = (a, b, t) => `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  const shade = (h, f) => { const c = hex(h); return `rgb(${clamp(Math.round(c[0] * f), 0, 255)},${clamp(Math.round(c[1] * f), 0, 255)},${clamp(Math.round(c[2] * f), 0, 255)})`; };
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const fmt = (ms) => { if (!ms) return '--'; const s = ms / 1000, m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0'); };

  let root, stage, cv, c, W = 800, H = 400, dpr = 1, raf = 0, sock = null, ownSock = false, portrait = false;
  let phase = 'menu', me = { id: null }, lobby = null, results = null, code = '', msg = '';
  const R = new Map();                       // the other racers, by id: { id, name, color, type, bot, snaps[], z, x, v, fl, lap, place }
  let G = null, hazards = [], missiles = [], toasts = [], rows = [], keys = {}, touch = { l: 0, r: 0, brake: 0, drift: 0 };
  let srvOff = 0, goAt = 0, startAt = 0, lastSend = 0, laps = 3, bgOff = 0, lastT = 0, muted = false, last3 = 4;
  try { muted = localStorage.getItem('drace.mute') === '1'; } catch (e) { /* storage can be blocked */ }

  /* ---------- sound (tiny, made with the browser's own synth) ---------- */
  let ac = null, eng = null;
  function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = false; } } if (ac && ac.state === 'suspended') ac.resume(); return ac; }
  function beep(f, d = .12, type = 'square', v = .05, slide = 0) {
    if (muted) return; const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f; if (slide) o.frequency.linearRampToValueAtTime(f + slide, a.currentTime + d);
    g.gain.value = v; g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + d); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + d + .02);
  }
  function engine(on) {
    const a = audio(); if (!a) return;
    if (!on) { if (eng) { try { eng.o.stop(); } catch (e) { /* already stopped */ } eng = null; } return; }
    if (eng) return; const o = a.createOscillator(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 60; g.gain.value = 0; o.connect(g); g.connect(a.destination); o.start(); eng = { o, g };
  }
  function engineTick() { if (!eng) return; const a = ac; eng.o.frequency.setTargetAtTime(55 + 120 * (G.v / MAXV) + (G.boostT > 0 ? 40 : 0), a.currentTime, .05); eng.g.gain.setTargetAtTime(muted ? 0 : .014 + .01 * (G.v / MAXV), a.currentTime, .08); }

  /* ---------- the vehicles, seen from behind ---------- */
  function drawKart(x, by, w, o) {
    const h = w * (o.type === 'keke' ? .78 : .7), t = o.t || 0;
    c.save(); c.translate(x, by);
    c.fillStyle = 'rgba(0,0,0,.30)'; c.beginPath(); c.ellipse(0, -h * .02, w * .52, h * .09, 0, 0, 6.3); c.fill();
    if (o.spin) { c.translate(0, -h * .45); c.rotate(o.spin); c.translate(0, h * .45); }
    c.transform(1, 0, (o.steer || 0) * -.10, 1, 0, 0);
    const col = o.color || '#f2b705', dark = shade(col, .62), light = shade(col, 1.18);
    const wheel = (wx, ww, wh) => { c.fillStyle = '#15171d'; c.fillRect(wx - ww / 2, -wh, ww, wh); c.fillStyle = '#2b2f3a'; c.fillRect(wx - ww / 2, -wh, ww, wh * .22); };
    if (o.boost) { // exhaust fire
      const f = (.55 + .45 * Math.sin(t * 40)) * w * .32;
      const g = c.createLinearGradient(0, -h * .2, 0, f); g.addColorStop(0, '#fff6b0'); g.addColorStop(.4, '#ffb000'); g.addColorStop(1, 'rgba(255,80,0,0)');
      c.fillStyle = g; for (const sx of [-.28, .28]) { c.beginPath(); c.moveTo(sx * w - w * .06, -h * .16); c.lineTo(sx * w + w * .06, -h * .16); c.lineTo(sx * w, f * .7); c.closePath(); c.fill(); }
    }
    if (o.type === 'danfo') {
      wheel(-w * .36, w * .15, h * .26); wheel(w * .36, w * .15, h * .26);
      c.fillStyle = col; rr(-w * .43, -h * .92, w * .86, h * .74, w * .05); c.fill();                       // body
      c.fillStyle = '#16181f'; c.fillRect(-w * .43, -h * .47, w * .86, h * .09);                              // the black stripe
      c.fillStyle = light; rr(-w * .41, -h * .98, w * .82, h * .12, w * .04); c.fill();                       // roof
      c.fillStyle = '#9cc6e6'; rr(-w * .34, -h * .84, w * .68, h * .29, w * .03); c.fill();                   // back window
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-w * .32, -h * .82, w * .22, h * .05);
      c.fillStyle = dark; c.fillRect(-w * .03, -h * .84, w * .06, h * .29);
      c.fillStyle = o.brake ? '#ff2a2a' : '#c4262b'; c.fillRect(-w * .41, -h * .36, w * .12, h * .1); c.fillRect(w * .29, -h * .36, w * .12, h * .1);
      c.fillStyle = '#f4f1e0'; c.fillRect(-w * .1, -h * .29, w * .2, h * .08);                                // number plate
    } else if (o.type === 'taxi') {
      wheel(-w * .36, w * .15, h * .26); wheel(w * .36, w * .15, h * .26);
      c.fillStyle = col; rr(-w * .44, -h * .6, w * .88, h * .42, w * .06); c.fill();                          // lower body
      c.beginPath(); c.moveTo(-w * .32, -h * .58); c.lineTo(-w * .24, -h * .96); c.lineTo(w * .24, -h * .96); c.lineTo(w * .32, -h * .58); c.closePath(); c.fill();   // cabin
      c.fillStyle = '#9cc6e6'; c.beginPath(); c.moveTo(-w * .26, -h * .6); c.lineTo(-w * .2, -h * .88); c.lineTo(w * .2, -h * .88); c.lineTo(w * .26, -h * .6); c.closePath(); c.fill();
      c.fillStyle = '#16181f'; c.fillRect(-w * .44, -h * .42, w * .88, h * .07);
      c.fillStyle = '#fff'; rr(-w * .1, -h * 1.06, w * .2, h * .11, 3); c.fill(); c.fillStyle = '#16181f'; c.font = `800 ${Math.max(6, w * .075)}px sans-serif`; c.textAlign = 'center'; c.fillText('TAXI', 0, -h * .975);
      c.fillStyle = o.brake ? '#ff2a2a' : '#c4262b'; c.fillRect(-w * .43, -h * .56, w * .13, h * .09); c.fillRect(w * .3, -h * .56, w * .13, h * .09);
      c.fillStyle = '#f4f1e0'; c.fillRect(-w * .1, -h * .28, w * .2, h * .07);
    } else {
      wheel(-w * .27, w * .13, h * .24); wheel(w * .27, w * .13, h * .24);                                     // keke: three wheels, the back pair shows
      c.fillStyle = col; rr(-w * .36, -h * .55, w * .72, h * .36, w * .05); c.fill();
      c.fillStyle = '#f2b705'; c.beginPath(); c.moveTo(-w * .34, -h * .55); c.lineTo(-w * .3, -h * .98); c.quadraticCurveTo(0, -h * 1.1, w * .3, -h * .98); c.lineTo(w * .34, -h * .55); c.closePath(); c.fill();
      c.fillStyle = '#16181f'; c.beginPath(); c.moveTo(-w * .26, -h * .6); c.lineTo(-w * .24, -h * .86); c.quadraticCurveTo(0, -h * .94, w * .24, -h * .86); c.lineTo(w * .26, -h * .6); c.closePath(); c.fill();
      c.fillStyle = o.brake ? '#ff2a2a' : '#c4262b'; c.fillRect(-w * .34, -h * .5, w * .1, h * .09); c.fillRect(w * .24, -h * .5, w * .1, h * .09);
    }
    if (o.shield) { c.strokeStyle = `rgba(120,220,255,${.55 + .25 * Math.sin(t * 9)})`; c.fillStyle = 'rgba(120,220,255,.16)'; c.lineWidth = Math.max(2, w * .03); c.beginPath(); c.ellipse(0, -h * .5, w * .66, h * .62, 0, 0, 6.3); c.fill(); c.stroke(); }
    if (o.slow) { c.fillStyle = 'rgba(120,90,40,.45)'; c.beginPath(); c.ellipse(0, -h * .5, w * .6, h * .55, 0, 0, 6.3); c.fill(); }
    c.restore();
  }
  function rr(x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  /* ---------- scenery (all drawn with shapes) ---------- */
  function scenery(k, x, y, sc, t, zone) {
    const w = (u) => u * sc;                 // world units to pixels
    switch (k) {
      case 'palm': c.strokeStyle = '#7a5a3a'; c.lineWidth = Math.max(2, w(120)); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - w(160), y - w(1000), x + w(60), y - w(2200)); c.stroke();
        c.fillStyle = '#2f9a55'; for (let a = 0; a < 7; a++) { c.save(); c.translate(x + w(60), y - w(2200)); c.rotate(-1.4 + a * .47 + Math.sin(t * 2 + a) * .03); c.beginPath(); c.ellipse(w(380), 0, w(400), w(90), 0, 0, 6.3); c.fill(); c.restore(); } break;
      case 'lamp': c.fillStyle = '#3f4452'; c.fillRect(x - w(50), y - w(2200), w(100), w(2200)); c.fillRect(x - w(50), y - w(2200), w(420), w(90)); c.fillStyle = '#fff1b0'; c.fillRect(x + w(250), y - w(2150), w(160), w(70)); break;
      case 'tower': { const hh = 3400 + (Math.round(x) % 7) * 120; c.fillStyle = '#7d8aa3'; c.fillRect(x - w(500), y - w(hh), w(1000), w(hh)); c.fillStyle = '#a9c5e6'; for (let wy = 300; wy < hh - 200; wy += 380) for (let wx = -380; wx < 380; wx += 300) c.fillRect(x + w(wx), y - w(wy + 200), w(170), w(210)); break; }
      case 'board': c.fillStyle = '#4b4f5a'; c.fillRect(x - w(70), y - w(1500), w(140), w(1500)); c.fillStyle = '#e5484d'; rr(x - w(750), y - w(2900), w(1500), w(1100), w(80)); c.fill(); c.fillStyle = '#fff'; c.fillRect(x - w(600), y - w(2600), w(1200), w(130)); c.fillRect(x - w(600), y - w(2350), w(800), w(130)); break;
      case 'umbrella': c.fillStyle = '#7a5a3a'; c.fillRect(x - w(35), y - w(1300), w(70), w(1300)); c.fillStyle = Math.round(x) % 2 ? '#e5484d' : '#2f7fd8'; c.beginPath(); c.moveTo(x - w(700), y - w(1250)); c.quadraticCurveTo(x, y - w(2100), x + w(700), y - w(1250)); c.closePath(); c.fill(); break;
      case 'hut': c.fillStyle = '#c9a56a'; c.fillRect(x - w(600), y - w(800), w(1200), w(800)); c.fillStyle = '#8a5a2b'; c.beginPath(); c.moveTo(x - w(780), y - w(800)); c.lineTo(x, y - w(1500)); c.lineTo(x + w(780), y - w(800)); c.closePath(); c.fill(); c.fillStyle = '#4a2f18'; c.fillRect(x - w(130), y - w(520), w(260), w(520)); break;
      case 'shack': c.fillStyle = '#d9c7a3'; c.fillRect(x - w(750), y - w(950), w(1500), w(950)); c.fillStyle = '#8a8f98'; c.beginPath(); c.moveTo(x - w(880), y - w(950)); c.lineTo(x - w(700), y - w(1250)); c.lineTo(x + w(700), y - w(1250)); c.lineTo(x + w(880), y - w(950)); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 1; for (let i = -600; i < 700; i += 220) { c.beginPath(); c.moveTo(x + w(i), y - w(1230)); c.lineTo(x + w(i + 40), y - w(960)); c.stroke(); } c.fillStyle = '#6b4f3a'; c.fillRect(x - w(500), y - w(600), w(280), w(600)); c.fillStyle = '#9ac7e0'; c.fillRect(x + w(150), y - w(700), w(380), w(300)); break;
      case 'stall': c.fillStyle = '#7a5a3a'; c.fillRect(x - w(450), y - w(500), w(900), w(500)); c.fillStyle = Math.round(x) % 2 ? '#f5a623' : '#22b573'; c.beginPath(); c.moveTo(x - w(600), y - w(900)); c.lineTo(x + w(600), y - w(900)); c.lineTo(x + w(480), y - w(1250)); c.lineTo(x - w(480), y - w(1250)); c.closePath(); c.fill(); break;
      case 'busstop': c.fillStyle = '#3f4452'; c.fillRect(x - w(40), y - w(1700), w(80), w(1700)); c.fillStyle = '#f2b705'; rr(x - w(330), y - w(1900), w(660), w(420), w(50)); c.fill(); c.fillStyle = '#16181f'; c.fillRect(x - w(250), y - w(1780), w(500), w(60)); break;
      case 'pillar': c.fillStyle = '#9aa0ad'; c.fillRect(x - w(260), y - w(3400), w(520), w(3400)); c.fillStyle = '#7d8493'; c.fillRect(x - w(330), y - w(3500), w(660), w(200)); break;
      case 'rail': c.fillStyle = '#cfd3dc'; c.fillRect(x - w(180), y - w(420), w(360), w(420)); c.fillStyle = '#e5484d'; c.fillRect(x - w(180), y - w(420), w(360), w(90)); break;
      default: break;
    }
  }

  /* ---------- background: sky, sun, skyline for the part of the track you are on ---------- */
  const SKY = T.ZONES.map((z) => ({ top: hex(z.sky[0]), bot: hex(z.sky[1]) }));
  function bg(now) {
    const f = mod(G.z, L) / L, Z = T.ZONES; let k = 0; for (let i = 0; i < Z.length; i++) if (f >= Z[i].from) k = i;
    const nb = k === Z.length - 1 ? 1 : Z[k + 1].from, tb = clamp((f - (nb - .035)) / .035, 0, 1), nk = (k + 1) % Z.length, hz = H * .5;
    const g = c.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, mixc(SKY[k].top, SKY[nk].top, tb)); g.addColorStop(1, mixc(SKY[k].bot, SKY[nk].bot, tb)); c.fillStyle = g; c.fillRect(0, 0, W, hz + 2);
    c.fillStyle = '#fff2b8'; c.beginPath(); c.arc(W * .78, H * .13, H * .06, 0, 6.3); c.fill();
    c.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 5; i++) { const cx = mod(i * W * .43 - bgOff * .08, W * 1.3) - W * .15, cy = H * (.08 + (i * 37 % 20) / 100); c.beginPath(); c.ellipse(cx, cy, H * .12, H * .035, 0, 0, 6.3); c.ellipse(cx + H * .08, cy - H * .012, H * .08, H * .03, 0, 0, 6.3); c.fill(); }
    const zone = Z[k], tot = W * 2, off = bgOff * .35;
    c.fillStyle = zone.id === 'marina' ? '#8da0bd' : zone.id === 'market' ? '#b9a88c' : zone.id === 'island' ? '#6da7a0' : '#7d97b8';
    for (let i = 0; i < 26; i++) {
      const bx = mod(i * (tot / 26) + off, tot) - W * .3, hh = H * (.07 + ((i * 53 + 11) % 17) / 100), bw = tot / 26 * .8;
      if (zone.id === 'island') { c.beginPath(); c.ellipse(bx, hz, bw * 1.1, hh * .55, 0, Math.PI, 0); c.fill(); } else c.fillRect(bx, hz - hh, bw, hh);
    }
    if (zone.water) { c.fillStyle = '#3d8fc4'; c.fillRect(0, hz - H * .02, W, H * .03); }
    c.fillStyle = zone.grass[0]; c.fillRect(0, hz, W, H - hz);
    const hg = c.createLinearGradient(0, hz - H * .05, 0, hz + H * .03); hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(.6, 'rgba(235,245,255,.35)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = hg; c.fillRect(0, hz - H * .05, W, H * .08);
  }

  /* ---------- the road ---------- */
  const P1 = [], P2 = [];
  for (let i = 0; i < DRAW; i++) { P1.push({}); P2.push({}); }
  function poly(x1, y1, x2, y2, x3, y3, x4, y4, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.lineTo(x4, y4); c.closePath(); c.fill(); }
  function racerView(id) { return id === me.id ? G : R.get(id); }

  function render(now, dt) {
    const g = G, pos = mod(g.z, L), base = Math.floor(pos / SEG), bp = (pos % SEG) / SEG;
    bg(now);
    const pPos = mod(g.z + PLAYERZ, L), pSeg = segs[Math.floor(pPos / SEG)], pPct = (pPos % SEG) / SEG, playerY = lerp(pSeg.y1, pSeg.y2, pPct), camX = g.x * ROAD, camY = playerY + CAMH;
    let x = 0, dx = -(segs[base].curve * bp), maxy = H, shake = g.shake > 0 ? (Math.random() - .5) * g.shake * H * .02 : 0;
    c.save(); if (shake) c.translate(shake, shake * .6);
    const vis = [];
    for (let n = 0; n < DRAW; n++) {
      const s = segs[(base + n) % N], p1 = P1[n], p2 = P2[n], z1 = n * SEG - bp * SEG, z2 = z1 + SEG;
      p1.z = z1; p2.z = z2;
      if (z1 > CAMD) { const k1 = CAMD / z1, k2 = CAMD / z2;
        p1.x = Math.round(W / 2 + k1 * (x - camX) * W / 2); p1.y = Math.round(H / 2 - k1 * (s.y1 - camY) * H / 2); p1.w = Math.round(k1 * ROAD * W / 2); p1.k = k1;
        p2.x = Math.round(W / 2 + k2 * (x + dx - camX) * W / 2); p2.y = Math.round(H / 2 - k2 * (s.y2 - camY) * H / 2); p2.w = Math.round(k2 * ROAD * W / 2); p2.k = k2; }
      x += dx; dx += s.curve;
      if (z1 <= CAMD || p2.y >= p1.y || p2.y >= maxy) { vis.push(null); continue; }
      const band = Math.floor(s.i / T.RUMBLE) % 2, zn = s.zone, rw1 = p1.w / Math.max(6, 2 * LANES), rw2 = p2.w / Math.max(6, 2 * LANES);
      c.fillStyle = zn.grass[band]; c.fillRect(0, p2.y, W, p1.y - p2.y + 1);
      const rumble = band ? '#f2f2f2' : '#d83a3a';
      poly(p1.x - p1.w - rw1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - rw2, p2.y, rumble);
      poly(p1.x + p1.w + rw1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + rw2, p2.y, rumble);
      poly(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, zn.road[band]);
      if (band) { const lw1 = p1.w / Math.max(32, 8 * LANES), lw2 = p2.w / Math.max(32, 8 * LANES), la1 = p1.w * 2 / LANES, la2 = p2.w * 2 / LANES; let lx1 = p1.x - p1.w + la1, lx2 = p2.x - p2.w + la2;
        for (let l = 1; l < LANES; l++, lx1 += la1, lx2 += la2) poly(lx1 - lw1 / 2, p1.y, lx1 + lw1 / 2, p1.y, lx2 + lw2 / 2, p2.y, lx2 - lw2 / 2, p2.y, 'rgba(255,255,255,.75)'); }
      if (s.pad !== undefined) { const a = s.pad - .36, b = s.pad + .36, hot = s.i % 2 ? '#ffd23f' : '#ff8a00';
        poly(p1.x + p1.w * a, p1.y, p1.x + p1.w * b, p1.y, p2.x + p2.w * b, p2.y, p2.x + p2.w * a, p2.y, hot); }
      if (s.i < 2) for (let q = 0; q < 10; q++) { const a = -1 + q * .2, b = a + .2; poly(p1.x + p1.w * a, p1.y, p1.x + p1.w * b, p1.y, p2.x + p2.w * b, p2.y, p2.x + p2.w * a, p2.y, (q + s.i) % 2 ? '#fff' : '#111'); }
      maxy = p1.y; vis.push({ s, p1, p2, clip: maxy, n });
    }
    // everything that is not road: scenery, item boxes, oil, rockets and the other karts, drawn from far to near
    const buckets = new Map(); const put = (segIdx, item) => { const rel = ((segIdx - base) % N + N) % N; if (rel < DRAW) { (buckets.get(rel) || buckets.set(rel, []).get(rel)).push(item); } };
    for (const b of T.boxes) if ((g.boxHide[b.id] || 0) <= now) put(b.seg, { k: 'box', o: b.o, pct: 0, id: b.id });
    for (const h of hazards) put(Math.floor(mod(h.z, L) / SEG), { k: 'oil', o: h.x, pct: (mod(h.z, L) % SEG) / SEG });
    for (const m of missiles) { const a = racerView(m.from), b = racerView(m.to), t = clamp((now - m.t0) / m.eta, 0, 1), z = lerp(m.z0, b ? b.z : m.z0 + 4000, t), o = lerp(m.x0, b ? b.x : m.x0, t); m.zNow = z; put(Math.floor(mod(z, L) / SEG), { k: 'rocket', o, pct: (mod(z, L) % SEG) / SEG }); }
    for (const r of R.values()) put(Math.floor(mod(r.z, L) / SEG), { k: 'kart', r, o: r.x, pct: (mod(r.z, L) % SEG) / SEG });
    for (let n = DRAW - 1; n >= 0; n--) {
      const v = vis[n]; if (!v) continue;
      const { s, p1, p2, clip } = v, sc = p1.k * W / 2;
      for (const sp of s.spr) scenery(sp.k, p1.x + sp.o * p1.w, p1.y, sc, now / 1000, s.zone);
      const list = buckets.get(n); if (!list) continue;
      for (const it of list) {
        const k = lerp(p1.k, p2.k, it.pct), px = lerp(p1.x, p2.x, it.pct) + it.o * lerp(p1.w, p2.w, it.pct), py = lerp(p1.y, p2.y, it.pct), u = k * W / 2;
        if (it.k === 'box') { const bw = u * 360, bob = Math.sin(now / 300 + it.id) * u * 60; c.save(); c.translate(px, py - u * 260 - bob); c.rotate(Math.sin(now / 500 + it.id) * .2); c.fillStyle = '#5ad1ff'; c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, bw * .07); rr(-bw / 2, -bw / 2, bw, bw, bw * .18); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.font = `900 ${Math.max(6, bw * .75)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, bw * .04); c.restore(); }
        else if (it.k === 'oil') { c.fillStyle = 'rgba(10,10,14,.88)'; c.beginPath(); c.ellipse(px, py, u * 420, u * 110, 0, 0, 6.3); c.fill(); c.fillStyle = 'rgba(140,90,255,.35)'; c.beginPath(); c.ellipse(px - u * 90, py - u * 18, u * 200, u * 45, 0, 0, 6.3); c.fill(); }
        else if (it.k === 'rocket') { const rw = u * 380; c.save(); c.translate(px, py - u * 260); c.fillStyle = '#e8e8ee'; rr(-rw * .2, -rw * .55, rw * .4, rw * 1.1, rw * .15); c.fill(); c.fillStyle = '#e5484d'; c.beginPath(); c.moveTo(-rw * .2, -rw * .5); c.lineTo(0, -rw * .95); c.lineTo(rw * .2, -rw * .5); c.closePath(); c.fill(); c.fillStyle = '#ffb000'; c.beginPath(); c.moveTo(-rw * .14, rw * .55); c.lineTo(0, rw * (.8 + .3 * Math.random())); c.lineTo(rw * .14, rw * .55); c.closePath(); c.fill(); c.restore(); }
        else if (it.k === 'kart') { const r = it.r, w = u * KARTW; drawKart(px, py, w, { color: r.color, type: r.type, steer: 0, boost: !!(r.fl & 1), spin: (r.fl & 2) ? (now / 90) % 6.28 : 0, shield: !!(r.fl & 4), slow: !!(r.fl & 8), t: now / 1000 });
          if (w > 22) { c.font = `800 ${Math.max(9, Math.min(15, w * .17))}px "Plus Jakarta Sans",system-ui,sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.65)'; c.fillStyle = '#fff'; const nm = (r.bot ? '' : '') + r.name; c.strokeText(nm, px, py - w * .85); c.fillText(nm, px, py - w * .85); } }
      }
    }
    // my kart
    const kScale = 1 / CAMH, kw = KARTW * kScale * W / 2, camPlayerY = lerp(pSeg.y1, pSeg.y2, pPct) - camY, py = H / 2 - kScale * camPlayerY * H / 2 - H * .035;
    const bounce = Math.sin(g.t * 28) * (g.v / MAXV) * H * .004 + (g.bump > 0 ? H * .01 : 0);
    if (g.drift && g.v > 4000) { c.fillStyle = g.charge > 3 ? '#ff7a29' : g.charge > 1.6 ? '#5ad1ff' : '#fff'; for (let i = 0; i < 6; i++) { const a = Math.random(); c.fillRect(W / 2 + (Math.random() < .5 ? -1 : 1) * kw * (.4 + a * .25), py - Math.random() * kw * .12, 3, 3); } }
    drawKart(W / 2, py + bounce, kw, { color: lobbyMe().color, type: lobbyMe().type, steer: g.steerVis, boost: g.boostT > 0, spin: g.spinT > 0 ? (1 - g.spinT / g.spinDur) * Math.PI * 4 : 0, shield: g.shieldT > 0, slow: g.slowT > 0, brake: !!(touch.brake || keys.ArrowDown || keys.s), t: g.t });
    c.restore();
    // speed lines while boosting
    if (g.boostT > 0) { c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2; for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, r1 = H * (.35 + Math.random() * .2), r2 = r1 + H * .25; c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * r1 * 1.6, H * .55 + Math.sin(a) * r1); c.lineTo(W / 2 + Math.cos(a) * r2 * 1.6, H * .55 + Math.sin(a) * r2); c.stroke(); } }
    if (g.flash > 0) { c.fillStyle = `rgba(255,255,255,${g.flash * .6})`; c.fillRect(0, 0, W, H); }
    hud(now);
  }
  const lobbyMe = () => { const p = lobby && lobby.players.find((q) => q.id === me.id); return p || { color: '#f2b705', type: 'danfo' }; };

  /* ---------- the display on top: position, lap, speed, progress strip, messages ---------- */
  function hud(now) {
    const u = H / 400, g = G;
    c.textBaseline = 'alphabetic';
    const label = (txt, x, y, size, col, align = 'left', w = 4) => { c.font = `900 ${size * u}px Outfit,"Plus Jakarta Sans",system-ui,sans-serif`; c.textAlign = align; c.lineWidth = w; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y); };
    const place = g.finished ? g.finishPlace || g.place : g.place;
    label(String(place), 18 * u, 56 * u, 54, place === 1 ? '#ffd23f' : '#fff'); c.font = `900 ${20 * u}px Outfit,system-ui,sans-serif`; const pw = c.measureText(String(place)).width; label(ord(place).slice(String(place).length) + ' / ' + (lobby ? Math.max(rows.length, lobby.players.length) : rows.length), 18 * u + (place > 9 ? 70 : 40) * u, 56 * u, 18, '#fff');
    label('LAP ' + Math.min(g.lap, laps) + '/' + laps, 18 * u, 80 * u, 17, '#fff');
    const elapsed = phase === 'race' && startAt ? performance.now() - startAt : 0; label(fmt(Math.max(0, elapsed)), W - 16 * u, 74 * u, 20, '#fff', 'right');
    label(Math.round(g.v / 50) + ' km/h', W - 16 * u, 98 * u, 18, g.boostT > 0 ? '#ffd23f' : '#fff', 'right');
    if (g.bestLap) label('BEST ' + fmt(g.bestLap), W - 16 * u, 118 * u, 14, '#9fe3ff', 'right');
    // progress strip
    const sx = W * .3, sw = W * .4, sy = 20 * u; c.fillStyle = 'rgba(0,0,0,.45)'; rr(sx - 8 * u, sy - 9 * u, sw + 16 * u, 18 * u, 9 * u); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(sx, sy - u, sw, 2 * u);
    for (const r of rows) { const rv = r[0] === me.id ? null : R.get(r[0]); if (!rv) continue; const f = clamp(mod(rv.z, L) / L, 0, 1); c.fillStyle = rv.color; c.beginPath(); c.arc(sx + sw * f, sy, 4 * u, 0, 6.3); c.fill(); }
    const fm = clamp(mod(g.z, L) / L, 0, 1); c.fillStyle = '#fff'; c.beginPath(); c.arc(sx + sw * fm, sy, 6.5 * u, 0, 6.3); c.fill(); c.fillStyle = lobbyMe().color; c.beginPath(); c.arc(sx + sw * fm, sy, 4.6 * u, 0, 6.3); c.fill();
    // drift charge
    if (g.drift || g.charge > .2) { const bw = 90 * u; c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(W / 2 - bw / 2, H - 14 * u, bw, 7 * u); c.fillStyle = g.charge > 3 ? '#ff7a29' : g.charge > 1.6 ? '#5ad1ff' : '#fff'; c.fillRect(W / 2 - bw / 2, H - 14 * u, bw * clamp(g.charge / 3.2, 0, 1), 7 * u); }
    // messages
    let ty = H * .30; for (const t of toasts) { const a = clamp(Math.min(t.life, 1.2) / 1.2, 0, 1); c.globalAlpha = a; label(t.text, W / 2, ty, t.size || 22, t.col || '#fff', 'center'); ty += 28 * u; c.globalAlpha = 1; }
    // countdown
    if (phase === 'countdown') { const left = (goAt - performance.now()) / 1000, n = Math.ceil(left); if (n >= 1 && n <= 3) { const f = 1 - (left - Math.floor(left)); c.globalAlpha = 1 - f * .5; label(String(n), W / 2, H * .5, 120 * (1 + (1 - f) * .15), n === 1 ? '#ffd23f' : '#fff', 'center', 8); c.globalAlpha = 1; if (n !== last3) { last3 = n; beep(440, .18, 'square', .07); } } else if (left <= 0 && left > -1) label('GO!', W / 2, H * .5, 130, '#3ddc84', 'center', 8); }
    if (g.finished && phase === 'race') label('FINISHED!  ' + ord(g.finishPlace || g.place), W / 2, H * .22, 40, '#ffd23f', 'center', 6);
  }
  function toast(text, col, size, life = 1.8) { toasts.unshift({ text, col, size, life }); if (toasts.length > 3) toasts.pop(); }

  /* ---------- driving ---------- */
  function newGame(z, x) { return { z, x, v: 0, steer: 0, steerVis: 0, boostT: 0, spinT: 0, spinDur: 1.4, slowT: 0, shieldT: 0, drift: 0, charge: 0, item: null, lapIdx: 0, lap: 1, place: 1, finished: false, finishPlace: 0, bestLap: 0, lapStart: 0, boxHide: {}, padCd: 0, shake: 0, bump: 0, flash: 0, t: 0 }; }
  function update(dt, now) {
    const g = G, racing = phase === 'race';
    let steer = 0, brake = false, drift = false;
    if (racing && !g.finished && g.spinT <= 0) { steer = clamp((keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0) + touch.r - touch.l, -1, 1); brake = !!(keys.ArrowDown || keys.s || keys.S || touch.brake); drift = !!(keys.Shift || touch.drift); }
    g.t += dt; for (const k of ['boostT', 'spinT', 'slowT', 'shieldT', 'padCd', 'shake', 'bump', 'flash']) g[k] = Math.max(0, g[k] - dt);
    const sp = g.v / MAXV, seg = T.at(g.z), off = Math.abs(g.x) > 1.05;
    let top = MAXV * (g.boostT > 0 ? 1.45 : 1) * (g.slowT > 0 ? .55 : 1); if (off) top = Math.min(top, MAXV * .42);
    let acc = racing ? MAXV / 3.1 : 0;
    if (g.finished && racing) { top = MAXV * .55; steer = clamp(-g.x * 1.2, -.6, .6); }
    if (g.spinT > 0) g.v = Math.max(0, g.v - MAXV * 1.7 * dt);
    else if (brake) g.v = Math.max(0, g.v - MAXV * 1.3 * dt);
    else if (g.v < top) g.v = Math.min(top, g.v + acc * (g.boostT > 0 ? 2.6 : 1) * dt);
    else g.v = Math.max(top, g.v - MAXV * (off ? 1.1 : .5) * dt);
    const dx = dt * 2 * Math.min(1, sp + .1), drifting = drift && Math.abs(steer) > .1 && g.v > MAXV * .45 && !off && g.spinT <= 0;
    g.x += dx * steer * (drifting ? 1.55 : 1) - dx * sp * seg.curve * .3 * (drifting ? .55 : 1);
    g.x = clamp(g.x, -2.6, 2.6); g.steerVis += (steer - g.steerVis) * Math.min(1, dt * 9);
    if (drifting) { g.drift = 1; g.charge += dt * (.8 + Math.abs(steer)); }
    else { g.drift = 0; if (g.charge > 0) { const c0 = g.charge; g.charge = 0; if (c0 > .7 && racing) { const t = c0 > 3 ? 1.5 : c0 > 1.6 ? 1 : .55; g.boostT = Math.max(g.boostT, t); toast(c0 > 3 ? 'ULTRA DRIFT BOOST!' : 'Drift boost!', '#ff9d3d', 20, 1.2); beep(520, .22, 'sawtooth', .05, 400); } } }
    if (racing) {
      for (const r of R.values()) { const dz = wrapDiff(r.z, g.z); if (Math.abs(dz) < 300 && Math.abs(r.x - g.x) < .2) { g.x += Math.sign(g.x - r.x || 1) * dt * 2.2; if (dz > 0) g.v = Math.min(g.v, Math.max(r.v * .92, g.v * .96)); g.bump = .15; } }
      const cur = Math.floor(mod(g.z, L) / SEG);
      if (!g.item && !g.finished) for (const b of T.boxes) { const d = ((b.seg - cur + N + N / 2) % N) - N / 2; if (Math.abs(d) > 2 || (g.boxHide[b.id] || 0) > now) continue; if (Math.abs(g.x - b.o) < .34 && Math.abs(wrapDiff(b.seg * SEG, g.z)) < 260) { g.boxHide[b.id] = now + 7000; if (sock) sock.emit('race:box', { id: b.id }); beep(700, .12, 'triangle', .06, 300); } }
      if (seg.pad !== undefined && Math.abs(g.x - seg.pad) < .4 && g.padCd <= 0) { g.boostT = Math.max(g.boostT, 1.3); g.padCd = 1.6; toast('BOOST!', '#ffd23f', 22, 1); beep(380, .25, 'sawtooth', .05, 500); }
    }
    const before = g.z; g.z += g.v * dt; bgOff += seg.curve * sp * dt * W * .6;
    if (racing) {
      const li = Math.floor(g.z / L);
      if (li > g.lapIdx) { const ms = now - (g.lapStart || startAt); if (ms > 5000 && (!g.bestLap || ms < g.bestLap)) g.bestLap = ms; g.lapStart = now; g.lapIdx = li; g.lap = clamp(li + 1, 1, laps); if (li < laps) toast('Lap ' + (li + 1) + ' / ' + laps, '#fff', 24, 1.6); }
      if (g.z >= laps * L && !g.finished) { g.finished = true; g.finishPlace = g.place; beep(660, .5, 'triangle', .08, 300); }
      if (now - lastSend >= 80 && sock) { lastSend = now; sock.emit('race:pose', { z: Math.round(g.z), x: Math.round(g.x * 100) / 100, v: Math.round(g.v) }); }
    }
    toasts.forEach((t) => { t.life -= dt; }); toasts = toasts.filter((t) => t.life > 0);
    missiles = missiles.filter((m) => now - m.t0 < m.eta);
  }
  function smoothRemotes(now) {
    const rt = now - 120;
    for (const r of R.values()) {
      const s = r.snaps; if (!s.length) continue;
      let a = null, b = null; for (let i = 0; i < s.length; i++) { if (s[i].t <= rt) a = s[i]; else { b = s[i]; break; } }
      if (a && b) { const f = (rt - a.t) / Math.max(1, b.t - a.t); r.z = lerp(a.z, b.z, f); r.x = lerp(a.x, b.x, f); r.v = lerp(a.v, b.v, f); }
      else { const l = a || s[s.length - 1]; r.z = l.z + l.v * clamp((rt - l.t) / 1000, 0, .4); r.x = l.x; r.v = l.v; }
    }
  }

  /* ---------- the loop ---------- */
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!G || phase === 'menu' || phase === 'lobby' || (phase === 'results' && !G)) return;
    const now = performance.now(), dt = clamp((now - (lastT || now)) / 1000, 0, .05); lastT = now;
    if (phase === 'countdown' && now >= goAt) { phase = 'race'; startAt = goAt; G.lapStart = goAt; beep(880, .5, 'square', .07); engine(true); lastSend = 0; }
    smoothRemotes(now); update(dt, now); engineTick();
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); render(now, dt);
  }

  /* ---------- talking to the server ---------- */
  function connect() {
    if (sock) return;
    if (typeof io === 'undefined') { msg = 'Could not reach the game server.'; return; }
    sock = io({ withCredentials: true }); ownSock = true;
    sock.on('race:lobby', (d) => { lobby = d; code = d.code; laps = d.laps; if (phase === 'menu' || phase === 'lobby' || phase === 'results') { phase = 'lobby'; results = null; engine(false); } ui(); });
    sock.on('race:countdown', (d) => {
      srvOff = performance.now() - d.now; goAt = d.goAt + srvOff; laps = d.laps; lobby = Object.assign({}, lobby || {}, { players: d.players });
      R.clear(); const mine = d.start.find((s) => s[0] === me.id); G = newGame(mine ? mine[1] : -600, mine ? mine[2] : 0); rows = []; hazards = []; missiles = []; toasts = []; lastT = 0; startAt = 0; last3 = 4;
      for (const p of d.players) if (p.id !== me.id) { const s = d.start.find((q) => q[0] === p.id); R.set(p.id, { id: p.id, name: p.name, color: p.color, type: p.type, bot: p.bot, snaps: [], z: s ? s[1] : 0, x: s ? s[2] : 0, v: 0, fl: 0, lap: 1, place: 0 }); }
      phase = 'countdown'; results = null; ui();
    });
    sock.on('race:go', () => { /* the local clock starts the race at goAt so everyone's start looks the same */ });
    sock.on('race:state', (s) => {
      const t = performance.now(); rows = s.r;
      for (const row of s.r) { const [id, z, x, v, fl, lap, place] = row; if (id === me.id) { if (G) { G.place = place; } continue; } const r = R.get(id); if (!r) continue; r.snaps.push({ t, z, x, v }); if (r.snaps.length > 14) r.snaps.shift(); r.fl = fl; r.lap = lap; r.place = place; }
      hazards = s.h.map((h) => ({ id: h[0], z: h[1], x: h[2] }));
    });
    sock.on('race:item', (d) => { if (!G) return; const had = G.item; G.item = d.item; if (d.item && d.item !== had) { toast(ITEM[d.item][0] + ' ' + ITEM[d.item][1], '#9fe3ff', 22, 1.6); beep(900, .15, 'triangle', .06, 200); } updateUse(); });
    sock.on('race:fx', (d) => {
      if (!G) return; const now = performance.now();
      if (d.from === me.id) { if (d.kind === 'nitro') { G.boostT = Math.max(G.boostT, d.dur / 1000); beep(300, .4, 'sawtooth', .06, 700); } else if (d.kind === 'mega') { G.boostT = Math.max(G.boostT, d.dur / 1000); G.shieldT = d.dur / 1000; beep(300, .5, 'sawtooth', .06, 800); } else if (d.kind === 'shield') { G.shieldT = d.dur / 1000; beep(500, .25, 'triangle', .06, 200); } }
      if (d.kind === 'rocket' && d.to) { const a = racerView(d.from), b = racerView(d.to); if (a && b) missiles.push({ from: d.from, to: d.to, z0: a.z, x0: a.x, t0: now, eta: d.eta * 1000 }); if (d.to === me.id) { toast('ROCKET INCOMING!', '#ff6b6b', 26, 1.6); beep(250, .5, 'sawtooth', .06, -100); } }
      if (d.kind === 'goslow' && d.from !== me.id) { const a = racerView(d.from); if (a && a.z > G.z) { /* nothing: the hit message covers it */ } }
      if (d.kind === 'block' && d.to === me.id) { G.shieldT = 0; G.flash = .6; toast('Shield blocked it!', '#9fe3ff', 24, 1.4); beep(800, .2, 'square', .06, -300); }
    });
    sock.on('race:hit', (d) => {
      if (!G || d.to !== me.id) return;
      if (d.kind === 'slow') { G.slowT = d.dur / 1000; toast('GO-SLOW!', '#ffb36b', 26, 1.6); } else { G.spinT = d.dur / 1000; G.spinDur = d.dur / 1000; G.v *= .25; G.shake = .6; toast(d.kind === 'rocket' ? 'HIT BY A ROCKET!' : 'OIL SPILL!', '#ff6b6b', 26, 1.6); }
      beep(160, .35, 'sawtooth', .08, -60);
    });
    sock.on('race:finish', (d) => { if (d.id === me.id && G) { G.finished = true; G.finishPlace = G.place; } else { const r = R.get(d.id); if (r && !r.bot) toast(esc(r.name) + ' finished', '#fff', 16, 1.4); } });
    sock.on('race:results', (d) => { results = d; phase = 'results'; engine(false); ui(); });
    sock.on('disconnect', () => { if (phase === 'race' || phase === 'countdown') toast('Connection lost…', '#ff6b6b', 20, 3); });
  }
  const ask = (ev, p, cb) => { if (!sock) connect(); if (!sock) return; sock.emit(ev, p || {}, (res) => { if (res && res.ok) { if (res.you) me.id = res.you; if (res.lobby) { lobby = res.lobby; code = res.code; laps = lobby.laps; phase = 'lobby'; } msg = ''; } else msg = (res && res.error) || 'Something went wrong.'; if (cb) cb(res); ui(); }); };

  /* ---------- the screens: menu, lobby, results ---------- */
  const CSS = `
  #drace{position:fixed;inset:0;z-index:99999;background:#05070f;color:#fff;font-family:"Plus Jakarta Sans",system-ui,sans-serif;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none;-webkit-tap-highlight-color:transparent}
  #drace .dr-stage{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;background:#0b1020}
  #drace canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
  #drace .dr-x{position:absolute;top:8px;right:8px;z-index:6;width:38px;height:38px;border-radius:50%;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:18px;font-weight:800;cursor:pointer}
  #drace .dr-snd{right:52px;font-size:16px}
  #drace .dr-panel{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:radial-gradient(1200px 600px at 20% 0%,#1b2b6b 0%,#0b1020 55%,#05070f 100%);padding:10px 100px 10px 10px}
  #drace .dr-card{display:grid;grid-template-columns:minmax(210px,1fr) minmax(260px,1.2fr);gap:14px;width:min(920px,100%);max-height:100%}
  #drace h1{margin:0;font-family:Outfit,system-ui,sans-serif;font-size:clamp(22px,5.5vh,36px);letter-spacing:.02em;line-height:1}
  #drace h1 span{color:#f2b705}
  #drace .sub{opacity:.7;font-size:12px;margin:4px 0 10px}
  #drace .col{display:flex;flex-direction:column;gap:8px;min-width:0}
  #drace .btn{appearance:none;border:0;border-radius:12px;padding:0 14px;height:42px;font:800 14px "Plus Jakarta Sans",system-ui,sans-serif;color:#0b1020;background:#f2b705;cursor:pointer}
  #drace .btn.alt{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2)}
  #drace .btn.go{background:#2bd67b}
  #drace .btn:disabled{opacity:.45}
  #drace .btn:active{transform:scale(.97)}
  #drace .row{display:flex;gap:8px;align-items:center}
  #drace .row>*{flex:1}
  #drace input.code{height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;text-align:center;font:800 16px Outfit,system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;min-width:0;width:100%}
  #drace .roomcode{font:900 30px Outfit,system-ui,sans-serif;letter-spacing:.16em;background:rgba(255,255,255,.08);border:1px dashed rgba(255,255,255,.35);border-radius:12px;padding:6px 10px;text-align:center}
  #drace .seg{display:flex;gap:6px}
  #drace .seg button{flex:1;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#fff;font:700 12px "Plus Jakarta Sans",system-ui,sans-serif}
  #drace .seg button.on{background:#f2b705;color:#0b1020;border-color:#f2b705}
  #drace .lab{font-size:11px;opacity:.7;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:-2px}
  #drace .plist{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  #drace .pl{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.08);border-radius:10px;padding:6px 8px;font-size:12px;font-weight:700;min-width:0;min-height:34px}
  #drace .pl i{width:12px;height:12px;border-radius:50%;flex:none;border:2px solid #fff}
  #drace .pl b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
  #drace .pl em{font-style:normal;font-size:9px;background:#f2b705;color:#0b1020;border-radius:6px;padding:1px 5px}
  #drace .pl.empty{opacity:.35;border:1px dashed rgba(255,255,255,.3);background:none}
  #drace .err{color:#ff8f8f;font-size:12px;font-weight:700;min-height:16px}
  #drace .hint{font-size:11px;opacity:.65;line-height:1.35}
  #drace table{width:100%;border-collapse:collapse;font-size:12px}
  #drace td,#drace th{padding:4px 6px;text-align:left;white-space:nowrap}
  #drace th{opacity:.6;font-size:10px;text-transform:uppercase}
  #drace tr.me{background:rgba(242,183,5,.22);font-weight:800}
  #drace .dr-ctl{position:absolute;z-index:4;bottom:0;left:0;right:0;height:46%;pointer-events:none}
  #drace .cb{position:absolute;pointer-events:auto;border:0;border-radius:50%;background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.4);color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;touch-action:none;backdrop-filter:blur(2px)}
  #drace .cb.on{background:rgba(242,183,5,.55)}
  #drace .cb.use{background:rgba(90,209,255,.28);border-color:#9fe3ff}
  #drace .cb.use.has{background:rgba(90,209,255,.6);box-shadow:0 0 18px #5ad1ff}
  #drace .rot{position:absolute;z-index:7;left:0;right:0;bottom:6px;text-align:center;font-size:11px;font-weight:700;opacity:.8;pointer-events:none}`;

  function ui() {
    if (!root) return;
    const panel = root.querySelector('.dr-panel'), ctl = root.querySelector('.dr-ctl');
    const racing = phase === 'race' || phase === 'countdown';
    ctl.style.display = racing ? 'block' : 'none'; panel.style.display = racing ? 'none' : 'flex';
    if (racing) { updateUse(); return; }
    if (phase === 'results' && results) { panel.innerHTML = resultsHtml(); bind(panel); return; }
    if (phase === 'lobby' && lobby) { panel.innerHTML = lobbyHtml(); bind(panel); return; }
    panel.innerHTML = menuHtml(); bind(panel);
  }
  const menuHtml = () => `<div class="dr-card"><div class="col"><h1>DRIVE <span>RACE</span></h1><div class="sub">${esc(T.name)} · up to 10 racers · power-ups, boost pads &amp; drift boosts</div>
    <button class="btn" data-a="quick">⚡ Quick race (public)</button><button class="btn alt" data-a="practice">🤖 Race against bots</button><button class="btn alt" data-a="create">🏁 Create a room for friends</button>
    <div class="row"><input class="code" id="drc" maxlength="4" placeholder="CODE"><button class="btn alt" data-a="join">Join</button></div><div class="err">${esc(msg)}</div></div>
    <div class="col"><div class="lab">How to play</div><div class="hint">◀ ▶ steer. The kart accelerates by itself.<br>Hold <b>DRIFT</b> while steering to charge a boost, let go to launch.<br>Drive through <b>? boxes</b> for a power-up, tap <b>ITEM</b> to use it.<br>Yellow pads give a free boost. First to finish all laps wins.<br><br>Keyboard: arrows or A/D · ↓ brake · Shift drift · Space item</div></div></div>`;
  const lobbyHtml = () => {
    const l = lobby, host = l.host === me.id, slots = []; for (let i = 0; i < l.max; i++) { const p = l.players[i]; slots.push(p ? `<div class="pl"><i style="background:${esc(p.color)}"></i><b>${esc(p.name)}</b>${p.id === l.host ? '<em>HOST</em>' : ''}</div>` : `<div class="pl empty"><b>open seat</b></div>`); }
    const meP = l.players.find((p) => p.id === me.id) || {}, secs = l.public && l.autoAt ? Math.max(0, Math.ceil((l.autoAt - Date.now() - (l.now ? 0 : 0)) / 1000)) : 0;
    return `<div class="dr-card"><div class="col"><h1>DRIVE <span>RACE</span></h1><div class="roomcode" data-a="copy" title="Tap to copy">${esc(l.code)}</div><div class="hint">${l.public ? 'Quick race: starts by itself' : 'Share this code with friends'}${l.public ? ' <b id="dr-auto"></b>' : ''}</div>
      <div class="lab">Your vehicle</div><div class="seg">${Object.keys(TYPES).map((k) => `<button data-a="type" data-v="${k}" class="${meP.type === k ? 'on' : ''}">${TYPES[k]}</button>`).join('')}</div>
      ${host ? `<div class="lab">Laps</div><div class="seg">${[1, 3, 5].map((n) => `<button data-a="laps" data-v="${n}" class="${l.laps === n ? 'on' : ''}">${n}</button>`).join('')}</div><div class="lab">Racers (bots fill empty seats)</div><div class="seg">${[4, 6, 8, 10].map((n) => `<button data-a="grid" data-v="${n}" class="${l.grid === n ? 'on' : ''}">${n}</button>`).join('')}</div>` : `<div class="hint">${l.laps} lap${l.laps > 1 ? 's' : ''} · ${l.grid} racers. The host starts the race.</div>`}
      <div class="row">${host ? '<button class="btn go" data-a="start">Start race</button>' : ''}<button class="btn alt" data-a="leave">Leave</button></div><div class="err">${esc(msg)}</div></div>
      <div class="col"><div class="lab">Racers ${l.players.length}/${l.max}</div><div class="plist">${slots.join('')}</div></div></div>`;
  };
  const resultsHtml = () => `<div class="dr-card" style="grid-template-columns:1fr"><div class="col"><h1>RESULTS</h1><div style="overflow:auto;max-height:62vh"><table><tr><th>#</th><th>Racer</th><th>Time</th><th>Best lap</th><th>Pts</th></tr>${results.order.map((r) => `<tr class="${r.id === me.id ? 'me' : ''}"><td>${r.place}</td><td><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(r.color)};margin-right:6px"></i>${esc(r.name)}</td><td>${r.dnf ? 'DNF' : fmt(r.timeMs)}</td><td>${fmt(r.bestLapMs)}</td><td>${r.points}</td></tr>`).join('')}</table></div>
    <div class="row">${lobby && lobby.host === me.id ? '<button class="btn go" data-a="again">Race again</button>' : '<div class="hint">Waiting for the host…</div>'}<button class="btn alt" data-a="leave">Leave</button></div></div></div>`;

  function bind(panel) {
    panel.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a, b.dataset.v, panel); });
    const auto = panel.querySelector('#dr-auto'); if (auto && lobby && lobby.autoAt) { const tick = () => { if (!auto.isConnected) return; auto.textContent = '(in ' + Math.max(0, Math.ceil((lobby.autoAt - lobby.now - (performance.now() - lobbyAt)) / 1000)) + 's)'; setTimeout(tick, 500); }; tick(); }
  }
  let lobbyAt = performance.now();
  function act(a, v, panel) {
    audio();
    if (a === 'quick') ask('race:quick'); else if (a === 'create') ask('race:create', { laps: 3, grid: 8 });
    else if (a === 'practice') ask('race:create', { laps: 3, grid: 8 }, (r) => { if (r && r.ok) sock.emit('race:start', {}, (x) => { if (x && !x.ok) { msg = x.error; ui(); } }); });
    else if (a === 'join') { const v2 = (panel.querySelector('#drc') || {}).value; if (!v2) { msg = 'Type the 4-letter room code.'; ui(); } else ask('race:join', { code: v2 }); }
    else if (a === 'type') sock.emit('race:style', { type: v }); else if (a === 'laps') sock.emit('race:options', { laps: +v }); else if (a === 'grid') sock.emit('race:options', { grid: +v });
    else if (a === 'start') sock.emit('race:start', {}, (r) => { if (r && !r.ok) { msg = r.error; ui(); } });
    else if (a === 'again') sock.emit('race:again', {});
    else if (a === 'copy') { try { navigator.clipboard.writeText(code); msg = 'Code copied ✓'; ui(); } catch (e) { /* clipboard blocked */ } }
    else if (a === 'leave') { sock.emit('race:leave', {}, () => { lobby = null; results = null; phase = 'menu'; code = ''; engine(false); ui(); }); }
  }

  /* ---------- touch buttons and keys ---------- */
  function buildControls(ctl) {
    const mk = (cls, css, html, down, up) => { const b = document.createElement('button'); b.className = 'cb ' + cls; b.style.cssText = css; b.innerHTML = html; b.setAttribute('type', 'button');
      const on = (e) => { e.preventDefault(); b.classList.add('on'); down(); }, off = (e) => { e && e.preventDefault(); b.classList.remove('on'); up(); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); b.addEventListener('contextmenu', (e) => e.preventDefault()); ctl.appendChild(b); return b; };
    mk('', 'left:14px;bottom:16px;width:88px;height:88px;font-size:34px', '◀', () => { touch.l = 1; }, () => { touch.l = 0; });
    mk('', 'left:112px;bottom:16px;width:88px;height:88px;font-size:34px', '▶', () => { touch.r = 1; }, () => { touch.r = 0; });
    const use = mk('use', 'right:16px;bottom:16px;width:104px;height:104px;font-size:44px', '', () => useItem(), () => {}); use.id = 'dr-use';
    mk('', 'right:132px;bottom:20px;width:72px;height:72px;font-size:12px', 'DRIFT', () => { touch.drift = 1; }, () => { touch.drift = 0; });
    mk('', 'right:132px;bottom:100px;width:56px;height:56px;font-size:11px', 'BRAKE', () => { touch.brake = 1; }, () => { touch.brake = 0; });
  }
  function useItem() { if (G && G.item && phase === 'race' && sock) { sock.emit('race:use', {}); } }
  function updateUse() { const b = root && root.querySelector('#dr-use'); if (!b) return; const it = G && G.item; b.classList.toggle('has', !!it); b.innerHTML = it ? `<span>${ITEM[it][0]}</span>` : '<span style="font-size:13px;opacity:.7">ITEM</span>'; }
  const kd = (e) => { if (!root) return; keys[e.key] = true; if (e.key === ' ' || e.key === 'e' || e.key === 'E') { e.preventDefault(); useItem(); } if (e.key.startsWith('Arrow')) e.preventDefault(); };
  const ku = (e) => { keys[e.key] = false; };

  /* ---------- opening and closing ---------- */
  function fit() {
    if (!root) return;
    const iw = window.innerWidth, ih = window.innerHeight; portrait = ih > iw && !(screen.orientation && /landscape/.test(screen.orientation.type));
    W = portrait ? ih : iw; H = portrait ? iw : ih;
    stage.style.width = W + 'px'; stage.style.height = H + 'px'; stage.style.transform = portrait ? `translate(${iw}px,0) rotate(90deg)` : 'none';
    dpr = Math.min(window.devicePixelRatio || 1, 1.75); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const hint = root.querySelector('.rot'); if (hint) hint.style.display = portrait ? 'block' : 'none';
  }
  function open() {
    if (root) return; if (typeof RaceTrack === 'undefined') return;
    if (!document.getElementById('drace-css')) { const st = document.createElement('style'); st.id = 'drace-css'; st.textContent = CSS; document.head.appendChild(st); }
    root = document.createElement('div'); root.id = 'drace'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Drive Race');
    root.innerHTML = '<div class="dr-stage"><canvas></canvas><div class="dr-ctl"></div><div class="dr-panel"></div><button class="dr-x dr-snd" type="button" aria-label="Sound">' + (muted ? '🔇' : '🔊') + '</button><button class="dr-x" type="button" aria-label="Close">✕</button><div class="rot">Turn your phone sideways for the best view</div></div>';
    document.body.appendChild(root); stage = root.querySelector('.dr-stage'); cv = root.querySelector('canvas'); c = cv.getContext('2d');
    buildControls(root.querySelector('.dr-ctl'));
    root.querySelector('.dr-x:not(.dr-snd)').onclick = close;
    root.querySelector('.dr-snd').onclick = (e) => { muted = !muted; e.currentTarget.textContent = muted ? '🔇' : '🔊'; try { localStorage.setItem('drace.mute', muted ? '1' : '0'); } catch (x) { /* storage blocked */ } if (muted) engine(false); };
    window.addEventListener('resize', fit); window.addEventListener('orientationchange', fit); document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
    try { if (root.requestFullscreen) root.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {}); } catch (e) { /* fullscreen is optional */ }
    phase = 'menu'; lobby = null; results = null; G = G || newGame(0, 0); fit(); connect(); lobbyAt = performance.now(); ui(); lastT = 0; raf = requestAnimationFrame(frame);
    // keep the lobby clock honest
    root._t = setInterval(() => { if (lobby) lobbyAt = lobbyAt; }, 1000);
  }
  function close() {
    if (!root) return;
    try { if (sock) sock.emit('race:leave', {}); } catch (e) { /* closing anyway */ }
    cancelAnimationFrame(raf); engine(false); clearInterval(root._t);
    window.removeEventListener('resize', fit); window.removeEventListener('orientationchange', fit); document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku);
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* fine */ }
    if (sock && ownSock) { sock.disconnect(); sock = null; ownSock = false; }
    root.remove(); root = null; G = null; R.clear(); phase = 'menu'; lobby = null; results = null; keys = {}; touch = { l: 0, r: 0, brake: 0, drift: 0 };
  }
  return { open, close, _state: () => ({ phase, G, lobby, results, R }) };
})();
window.DRACE = DRACE;
