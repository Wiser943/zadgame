/* ===================== Drive Race (3D) =====================
   The race itself: the 3D view, the driving, the HUD, the network. Menus live in racemenu.js, which plugs into this through DRACE.menu.
   Opened from GameHub with DRACE.open(). Landscape only (it turns itself sideways on a portrait phone). */
const DRACE = (() => {
  'use strict';
  const RT = RaceTrack, { M, hex } = GL3D, GFX = RACEGFX;
  const MAXV = RT.MAXV, SEG = RT.SEG, ROAD = RT.ROAD;
  const ITEM = { nitro: ['🔥', 'Nitro', 'A burst of speed'], shield: ['🛡️', 'Shield', 'Blocks one hit'], oil: ['🛢️', 'Oil spill', 'Spins out the kart behind you'], rocket: ['🚀', 'Rocket', 'Chases the kart ahead'], goslow: ['🐌', 'Go-slow', 'Slows everyone ahead'], mega: ['⭐', 'Mega boost', 'Long boost and a shield'] };
  const TYPE_MOD = { buggy: { spd: 1, acc: 1, han: 1 }, danfo: { spd: 1.02, acc: .9, han: .9 }, taxi: { spd: 1.04, acc: .95, han: .95 }, keke: { spd: .96, acc: 1.1, han: 1.15 } };
  const mod = (a, b) => ((a % b) + b) % b, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const fmt = (ms) => { if (!ms) return '-:--.--'; const s = ms / 1000, m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0'); };

  let root, stage, glc, hudEl, dlgEl, r = null, W = 800, H = 400, dpr = 1, raf = 0, sock = null, ownSock = false, portrait = false, glOk = true;
  let phase = 'menu', me = { id: null, name: '' }, lobby = null, results = null, code = '', laps = 3, trackId = 'harbor';
  const scenes = {}; let S = null, bgMode = { kind: 'none' }, menu = null;
  const R_ = new Map();                                   // the other racers, by id
  let G = null, hazards = [], missiles = [], toasts = [], rows = [], keys = {}, touch = { l: 0, r: 0, brake: 0, drift: 0 };
  let srvOff = 0, goAt = 0, startAt = 0, lastSend = 0, lastT = 0, last3 = 4, lostAt = 0, hadConnected = false, optsOpen = false, loading = false;
  let cam = null, fovK = 0, car = { spd: 1, acc: 1, han: 1 }, myStyle = { type: 'buggy', color: '#e5484d', driver: 0, levels: {} }, ctx = { career: null };
  let pref = { steer: 'buttons', invert: false, vib: true, sound: true }; try { pref = Object.assign(pref, JSON.parse(localStorage.getItem('drace.pref') || '{}')); } catch (e) { /* storage can be blocked */ }
  const savePref = () => { try { localStorage.setItem('drace.pref', JSON.stringify(pref)); } catch (e) { /* storage can be blocked */ } };
  const perf = { acc: 0, n: 0, calm: 0, q: 1 };
  const buzz = (p) => { try { if (pref.vib && pref.sound && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* not every phone can */ } };

  /* ---------- sound (made with the browser's own synth) ---------- */
  let ac = null, eng = null;
  function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = false; } } if (ac && ac.state === 'suspended') ac.resume(); return ac; }
  function beep(f, d = .12, type = 'square', v = .05, slide = 0) {
    if (!pref.sound) return; const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f; if (slide) o.frequency.linearRampToValueAtTime(f + slide, a.currentTime + d);
    g.gain.value = v; g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + d); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + d + .02);
  }
  function engine(on) {
    const a = audio(); if (!a) return;
    if (!on) { if (eng) { try { eng.o.stop(); } catch (e) { /* stopped */ } eng = null; } return; }
    if (eng) return; const o = a.createOscillator(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 60; g.gain.value = 0; o.connect(g); g.connect(a.destination); o.start(); eng = { o, g };
  }
  function engineTick() { if (!eng || !G) return; eng.o.frequency.setTargetAtTime(55 + 120 * (G.v / MAXV) + (G.boostT > 0 ? 40 : 0), ac.currentTime, .05); eng.g.gain.setTargetAtTime(pref.sound ? .012 + .01 * (G.v / MAXV) : 0, ac.currentTime, .08); }

  /* ---------- tilt steering: turn the phone like a wheel ---------- */
  const tilt = { on: false, neutral: null, raw: 0, ang: 0, last: 0 };
  function onMotion(e) {
    const g = e.accelerationIncludingGravity; if (!g || g.x == null || g.y == null) return; if (Math.hypot(g.x, g.y) < 3.5) return;
    const a = Math.atan2(g.x, g.y); tilt.raw = a; tilt.last = performance.now(); if (tilt.neutral === null) tilt.neutral = a;
    let d = a - tilt.neutral; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; tilt.ang = d;
  }
  function tiltStart() {
    if (tilt.on) return Promise.resolve(true); const D = window.DeviceMotionEvent; if (!D) return Promise.resolve(false);
    const go = () => new Promise((res) => { window.addEventListener('devicemotion', onMotion); tilt.on = true; tilt.neutral = null; setTimeout(() => { if (!tilt.last) { window.removeEventListener('devicemotion', onMotion); tilt.on = false; res(false); } else res(true); }, 700); });
    if (typeof D.requestPermission === 'function') return D.requestPermission().then((x) => (x === 'granted' ? go() : false)).catch(() => false);
    return go();
  }
  function tiltStop() { window.removeEventListener('devicemotion', onMotion); tilt.on = false; tilt.last = 0; tilt.ang = 0; tilt.neutral = null; }
  const tiltCalibrate = () => { tilt.neutral = tilt.raw; tilt.ang = 0; };
  function tiltSteer() { if (pref.steer !== 'tilt' || !tilt.on) return 0; const deg = (pref.invert ? 1 : -1) * tilt.ang * 180 / Math.PI, dz = 2.5, lim = 22; return Math.abs(deg) < dz ? 0 : clamp((deg - Math.sign(deg) * dz) / (lim - dz), -1, 1); }

  /* ---------- the 3D view ---------- */
  function initGL() {
    if (r) return true;
    try { r = new GL3D.Renderer(glc); } catch (e) { glOk = false; console.error('[race] 3D is not available:', e.message); return false; }
    glc.addEventListener('webglcontextlost', (e) => { e.preventDefault(); loading = true; });
    glc.addEventListener('webglcontextrestored', () => { r = null; for (const k of Object.keys(scenes)) delete scenes[k]; S = null; initGL(); loading = false; if (phase === 'race' || phase === 'countdown') ensureScene(trackId); });
    return true;
  }
  function fit() {
    if (!root) return; const iw = window.innerWidth, ih = window.innerHeight; portrait = ih > iw && !(screen.orientation && /landscape/.test(screen.orientation.type));
    W = portrait ? ih : iw; H = portrait ? iw : ih; stage.style.width = W + 'px'; stage.style.height = H + 'px'; stage.style.transform = portrait ? `translate(${iw}px,0) rotate(90deg)` : 'none';
    dpr = Math.min(window.devicePixelRatio || 1, 1.75) * perf.q; glc.style.width = W + 'px'; glc.style.height = H + 'px'; if (r) r.resize(Math.round(W * dpr), Math.round(H * dpr)); else { glc.width = Math.round(W * dpr); glc.height = Math.round(H * dpr); }
    const hint = root.querySelector('.rot'); if (hint) hint.style.display = portrait ? 'block' : 'none';
    root.style.setProperty('--u', (H / 390).toFixed(3)); for (const k of Object.keys(scenes)) scenes[k].lod = perf.q < .8 ? 3.6 : 5.6;
  }
  /* build (once) the 3D scene of a circuit; shows a short loading note because it takes a moment */
  function ensureScene(id) {
    return new Promise((res) => {
      if (!r && !initGL()) return res(null);
      if (scenes[id]) { S = scenes[id]; return res(S); }
      loading = true; showLoading(true);
      setTimeout(() => { try { const sc = GFX.buildTrack(r, id, perf.q < 1 ? .6 : 1); GFX.extras(r, sc); scenes[id] = sc; const ks = Object.keys(scenes); if (ks.length > 3) { delete scenes[ks[0]]; } S = sc; } catch (e) { console.error('[race] could not build the circuit:', e); S = null; } loading = false; showLoading(false); res(S); }, 30);
    });
  }
  function showLoading(on) { const el = root && root.querySelector('.dr-loading'); if (el) el.classList.toggle('on', on); }

  /* ---------- the menu backdrop: a slow fly-through of a circuit, or the garage turntable ---------- */
  function setBackground(kind, o = {}) { bgMode = Object.assign({ kind }, o); if (kind === 'fly') { const id = o.track || 'beach'; ensureScene(id).then(() => { if (S) trackId = id; }); } else if (kind === 'garage') ensureScene(o.track || 'harbor'); }
  function drawBackground(now, dt) {
    if (!r || !S) return; const t = now / 1000;
    if (bgMode.kind === 'garage') {
      const sc = S, c = bgMode.centre || (bgMode.centre = garageSpot(sc)), ang = t * .3 + (bgMode.spin || 0) + 2.2, R0 = 4500, kx = c[0] - 300, eye = [kx + Math.cos(ang) * R0, c[1] + 1500, c[2] + Math.sin(ang) * R0], tgt = [kx, c[1] + 120, c[2]];
      GFX.drawScene(r, sc, { eye, target: tgt, fov: .82 }, t, -1);
      drawGarageProps(c, t); return;
    }
    const sc = S, T = sc.T, s = ((bgMode.s0 || 0) + t * 2600) % T.L, a = T.point(s - 5400, 0), b = T.point(s + 4200, 0);
    GFX.drawScene(r, sc, { eye: [a.x, a.y + 2900, a.z], target: [b.x, b.y + 300, b.z], fov: 1.0 }, t, Math.floor(s / SEG));
  }
  /* the garage: a stone platform on a flat plaza in the middle of the island, with a few houses and palms round it */
  function garageSpot(sc) {
    if (sc.garageC) return sc.garageC; const c = sc.centre; let y = -1e9; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; y = Math.max(y, sc.heightAt(c[0] + Math.cos(a) * 21000, c[1] + Math.sin(a) * 21000)); } y = Math.max(y, sc.heightAt(c[0], c[1])) + 60;
    sc.garageC = [c[0], y, c[1]]; return sc.garageC;
  }
  function buildGarage(sc, c) {
    const rnd = RT.rng(404), b = new GL3D.Builder(), plaza = new GL3D.Builder();
    plaza.cyl(23000, 23000, 400, 40, [.78, .72, .62], null, true, 6);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .5, d = 15500; GFX.house(b, Math.cos(a) * d, 0, Math.sin(a) * d, -a + Math.PI / 2 + Math.PI / 2, rnd, 1.1); }
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + .2, d = 11500 + rnd() * 3000; GFX.palm(b, Math.cos(a) * d, 0, Math.sin(a) * d, rnd); }
    for (let k = 0; k < 5; k++) { const a = rnd() * 6.28, d = 9000 + rnd() * 3000; if (k % 2) GFX.barrel(b, Math.cos(a) * d, 0, Math.sin(a) * d, rnd); else GFX.crate(b, Math.cos(a) * d, 0, Math.sin(a) * d, rnd() * 3); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + .9; GFX.lamp(b, Math.cos(a) * 8600, 0, Math.sin(a) * 8600, -a); }
    const pf = new GL3D.Builder(); pf.cyl(5200, 5600, 360, 28, [.72, .66, .58], null, true, 1); pf.cyl(4300, 4300, 40, 28, [.55, .5, .45], M.trs(0, 190, 0), true, 1);
    const ring = new GL3D.Builder(); for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; ring.cyl(150, 190, 620, 6, [.5, .5, .55], M.trs(Math.cos(a) * 5600, 200, Math.sin(a) * 5600)); }
    sc.gProps = { props: r.mesh(b), plaza: r.mesh(plaza), platform: r.mesh(pf), ring: r.mesh(ring) };
  }
  function drawGarageProps(c, t) {
    const sc = S; if (!sc.gProps) buildGarage(sc, c); const g = sc.gProps, at = M.trs(c[0], c[1], c[2]);
    g.plaza.draw(M.trs(c[0], c[1] - 200, c[2]), { tex: sc.tex.cobble }); g.props.draw(at, {}); g.platform.draw(M.trs(c[0], c[1] + 20, c[2]), { tex: sc.tex.cobble }); g.ring.draw(M.trs(c[0], c[1] + 20, c[2]), {});
    const k = bgMode.kart; if (k) { const K = GFX.buildKart(r, k.type, k.color, k.driver, sc.tex), ang = (bgMode.spin || 0) - .6; GFX.drawKart(r, K, { x: c[0] - 300, y: c[1] + 400, z: c[2], gy: c[1] + 400, yaw: ang, steer: 0, wheel: t * 2, t, hop: Math.sin(t * 2) * 8 }, sc); }
  }

  /* ---------- starting a race: create a room on the server, then start it ---------- */
  function connect() {
    if (sock) return true;
    if (typeof io === 'undefined') return false;
    sock = io({ withCredentials: true }); ownSock = true; wireSocket(); return true;
  }
  const ask = (ev, p, cb) => { if (!sock && !connect()) { if (cb) cb({ ok: false, error: 'Could not reach the game server.' }); return; } sock.emit(ev, p || {}, (res) => { if (res && res.ok) { if (res.you) me.id = res.you; if (res.lobby) { lobby = res.lobby; code = res.code; laps = lobby.laps; trackId = lobby.track || trackId; } } if (cb) cb(res); }); };
  const emit = (ev, p) => { if (!sock && !connect()) return; sock.emit(ev, p || {}); };
  function sendStyle() { if (code) emit('race:style', { type: myStyle.type, color: myStyle.color, driver: myStyle.driver, levels: myStyle.levels }); }
  function applyCar(save) { const u = (save && save.car && save.car.up) || {}, tm = TYPE_MOD[myStyle.type] || TYPE_MOD.buggy; car = { spd: tm.spd * (1 + .02 * (u.speed || 0)), acc: tm.acc * (1 + .1 * (u.acc || 0)), han: tm.han * (1 + .07 * (u.hand || 0)) }; }

  /* ---------- the kart you drive ---------- */
  function newGame(z, x) { return { z, x, v: 0, steer: 0, steerVis: 0, boostT: 0, spinT: 0, spinDur: 1.4, slowT: 0, shieldT: 0, drift: 0, charge: 0, items: [], lapIdx: 0, lap: 1, place: 1, finished: false, finishPlace: 0, bestLap: 0, lapStart: 0, boxHide: {}, padCd: 0, shake: 0, bump: 0, flash: 0, t: 0, wheel: 0, yawX: 0, off: false }; }
  function update(dt, now) {
    const g = G, T = S.T, racing = phase === 'race'; let steer = 0, brake = false, drift = false;
    if (racing && !g.finished && g.spinT <= 0 && !optsOpen) { steer = clamp((keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0) + touch.r - touch.l + tiltSteer(), -1, 1); brake = !!(keys.ArrowDown || keys.s || keys.S || touch.brake); drift = !!(keys.Shift || touch.drift); }
    g.t += dt; for (const k of ['boostT', 'spinT', 'slowT', 'shieldT', 'padCd', 'shake', 'bump', 'flash']) g[k] = Math.max(0, g[k] - dt);
    const sp = g.v / MAXV, seg = T.at(g.z), off = Math.abs(g.x) > 1.05; g.off = off;
    let top = MAXV * car.spd * (g.boostT > 0 ? 1.45 : 1) * (g.slowT > 0 ? .55 : 1); if (off) top = Math.min(top, MAXV * .42);
    const acc = racing ? MAXV / 3.1 * car.acc : 0;
    if (g.finished && racing) { top = MAXV * .55; steer = clamp(-g.x * 1.2, -.6, .6); }
    if (g.spinT > 0) g.v = Math.max(0, g.v - MAXV * 1.7 * dt);
    else if (brake) g.v = Math.max(0, g.v - MAXV * 1.3 * dt);
    else if (g.v < top) g.v = Math.min(top, g.v + acc * (g.boostT > 0 ? 2.6 : 1) * dt);
    else g.v = Math.max(top, g.v - MAXV * (off ? 1.1 : .5) * dt);
    const dx = dt * 2 * Math.min(1, sp + .1) * car.han, drifting = drift && Math.abs(steer) > .1 && g.v > MAXV * .45 && !off && g.spinT <= 0;
    g.x += dx * steer * (drifting ? 1.55 : 1) - dx * sp * seg.curve * .3 * (drifting ? .55 : 1) / car.han; g.x = clamp(g.x, -2.4, 2.4); g.steerVis += (steer - g.steerVis) * Math.min(1, dt * 9);
    if (drifting) { g.drift = 1; g.charge += dt * (.8 + Math.abs(steer)); }
    else { g.drift = 0; if (g.charge > 0) { const c0 = g.charge; g.charge = 0; if (c0 > .7 && racing) { const t = c0 > 3 ? 1.5 : c0 > 1.6 ? 1 : .55; g.boostT = Math.max(g.boostT, t); toast(c0 > 3 ? 'ULTRA DRIFT BOOST!' : 'Drift boost!', '#ff9d3d', 1.2); beep(520, .22, 'sawtooth', .05, 400); buzz(c0 > 3 ? [20, 30, 40] : 25); } } }
    if (racing) {
      for (const o of R_.values()) { const dz = wrap(o.z, g.z); if (Math.abs(dz) < 700 && Math.abs(o.x - g.x) < .36) { g.x += Math.sign(g.x - o.x || 1) * dt * 2.2; if (dz > 0) g.v = Math.min(g.v, Math.max(o.v * .92, g.v * .96)); g.bump = .15; } }
      const cur = Math.floor(mod(g.z, T.L) / SEG);
      if (g.items.length < 2 && !g.finished) for (const b of T.boxes) { const d = ((b.seg - cur + T.n + T.n / 2) % T.n) - T.n / 2; if (Math.abs(d) > 3 || (g.boxHide[b.id] || 0) > now) continue; if (Math.abs(g.x - b.o) < .38 && Math.abs(wrap(b.seg * SEG, g.z)) < 520) { g.boxHide[b.id] = now + 7000; emit('race:box', { id: b.id }); beep(700, .12, 'triangle', .06, 300); buzz(15); } }
      if (seg.pad !== undefined && Math.abs(g.x - seg.pad) < .42 && g.padCd <= 0) { g.boostT = Math.max(g.boostT, 1.3); g.padCd = 1.6; toast('BOOST!', '#ffd23f', 1); beep(380, .25, 'sawtooth', .05, 500); buzz(25); }
    }
    g.z += g.v * dt; g.wheel += g.v * dt / 330;
    if (racing) {
      const li = Math.floor(g.z / T.L);
      if (li > g.lapIdx) { const ms = now - (g.lapStart || startAt); if (ms > 5000 && (!g.bestLap || ms < g.bestLap)) g.bestLap = ms; g.lapStart = now; g.lapIdx = li; g.lap = clamp(li + 1, 1, laps); if (li < laps) toast('Lap ' + (li + 1) + ' / ' + laps, '#ffffff', 1.6); }
      if (g.z >= laps * T.L && !g.finished) { g.finished = true; g.finishPlace = g.place; beep(660, .5, 'triangle', .08, 300); buzz([80, 50, 160]); }
      if (now - lastSend >= 80 && sock) { lastSend = now; sock.emit('race:pose', { z: Math.round(g.z), x: Math.round(g.x * 100) / 100, v: Math.round(g.v) }); }
    }
    toasts.forEach((t) => { t.life -= dt; }); toasts = toasts.filter((t) => t.life > 0); missiles = missiles.filter((m) => now - m.t0 < m.eta);
  }
  const wrap = (a, b) => { const L = S.T.L; return ((((a - b) % L) + L + L / 2) % L) - L / 2; };
  function smoothRemotes(now) {
    const rt = now - 120;
    for (const o of R_.values()) {
      const s = o.snaps; if (!s.length) continue; let a = null, b = null; for (let i = 0; i < s.length; i++) { if (s[i].t <= rt) a = s[i]; else { b = s[i]; break; } }
      const px = o.x; if (a && b) { const f = (rt - a.t) / Math.max(1, b.t - a.t); o.z = lerp(a.z, b.z, f); o.x = lerp(a.x, b.x, f); o.v = lerp(a.v, b.v, f); } else { const l = a || s[s.length - 1]; o.z = l.z + l.v * clamp((rt - l.t) / 1000, 0, .4); o.x = l.x; o.v = l.v; }
      o.steer = lerp(o.steer || 0, clamp((o.x - px) * 40, -1, 1), .2); o.wheel = (o.wheel || 0) + o.v * (1 / 60) / 330;
    }
  }

  /* ---------- drawing a race frame ---------- */
  function poseOf(T, z, x, extra) {
    const s = mod(z, T.L), p = T.point(s, x), a = T.point(s - 450, x), b = T.point(s + 450, x), pitch = Math.atan2(b.y - a.y, 900), gy = p.y + 6;
    return Object.assign({ x: p.x, y: gy, z: p.z, gy, yaw: p.hd, pitch }, extra || {});
  }
  function renderRace(now, dt) {
    const g = G, T = S.T, t = now / 1000; fovK += ((g.boostT > 0 ? 1 : 0) - fovK) * Math.min(1, dt * 4);
    // camera: behind and above, following the road round the bends
    const back = 2700 + g.v * .05, lat = g.x * .8, a = T.point(g.z - back, lat), look = T.point(g.z + 3600, g.x * .55);
    const want = { eye: [a.x, a.y + 1500 + (g.v / MAXV) * 250, a.z], tgt: [look.x, look.y + 620, look.z] };
    if (!cam) cam = { eye: want.eye.slice(), tgt: want.tgt.slice() }; const k = 1 - Math.exp(-dt * 9);
    for (let i = 0; i < 3; i++) { cam.eye[i] = lerp(cam.eye[i], want.eye[i], k); cam.tgt[i] = lerp(cam.tgt[i], want.tgt[i], k); }
    let ex = cam.eye.slice(); if (g.shake > 0) { const s = g.shake * 220; ex[0] += (Math.random() - .5) * s; ex[1] += (Math.random() - .5) * s * .6; ex[2] += (Math.random() - .5) * s; }
    GFX.drawScene(r, S, { eye: ex, target: cam.tgt, fov: 1.02 + .2 * fovK }, t, Math.floor(mod(g.z, T.L) / SEG));
    // karts
    const list = [];
    const mine = poseOf(T, g.z, g.x, { steer: g.steerVis, wheel: g.wheel, spin: g.spinT > 0 ? (1 - g.spinT / g.spinDur) * Math.PI * 4 : 0, boost: g.boostT > 0, shield: g.shieldT > 0, t, hop: g.spinT > 0 ? Math.sin((1 - g.spinT / g.spinDur) * Math.PI) * 420 : 0, roll: -g.steerVis * .1 - (g.drift ? g.steerVis * .08 : 0) + (g.bump > 0 ? .03 : 0) });
    mine.yaw += g.steerVis * .22 * (g.drift ? 2 : 1); list.push({ K: GFX.buildKart(r, myStyle.type, myStyle.color, myStyle.driver, S.tex), pose: mine, id: me.id, mineK: true, speed: g.v, boost: g.boostT > 0, drift: g.drift });
    for (const o of R_.values()) { const fl = o.fl | 0; list.push({ K: GFX.buildKart(r, o.type || 'buggy', o.color, o.driver || 0, S.tex), pose: poseOf(T, o.z, o.x, { steer: o.steer || 0, wheel: o.wheel || 0, boost: !!(fl & 1), shield: !!(fl & 4), spin: (fl & 2) ? (now / 90) % 6.28 : 0, hop: (fl & 2) ? 160 : 0, t, roll: -(o.steer || 0) * .08 }), id: o.id, name: o.name, speed: o.v, boost: !!(fl & 1), o }); }
    for (const e of list) { GFX.drawKart(r, e.K, e.pose, S); }
    // effects
    for (const e of list) {
      const p = e.pose, fx = Math.cos(p.yaw), fz = Math.sin(p.yaw), rx = -fz, rz = fx;
      if (e.boost && Math.random() < .9) for (const sgn of [-1, 1]) GFX.spawn(S, { x: p.x - fx * 1300 + rx * sgn * 260, y: p.y + 560, z: p.z - fz * 1300 + rz * sgn * 260, vx: -fx * 5000, vy: 200, vz: -fz * 5000, life: .35, max: .35, size: 330, grow: .4, col: [1, .72, .2], tex: 'glow', alpha: 1 });
      if (e.drift && e.mineK) for (const sgn of [-1, 1]) if (Math.random() < .5) GFX.spawn(S, { x: p.x - fx * 700 + rx * sgn * 600, y: p.y + 80, z: p.z - fz * 700 + rz * sgn * 600, vx: (Math.random() - .5) * 2500, vy: 1200 + Math.random() * 1500, vz: (Math.random() - .5) * 2500, life: .35, max: .35, size: 120, col: G.charge > 3 ? [1, .55, .15] : G.charge > 1.6 ? [.4, .85, 1] : [1, 1, 1], tex: 'spark', grav: 6000 });
      if (e.speed > 3500 && (e.mineK ? G.off : Math.abs(e.pose.x) > 0) && Math.random() < .5) { const sgn = Math.random() < .5 ? -1 : 1; GFX.spawn(S, { x: p.x - fx * 800 + rx * sgn * 520, y: p.y + 120, z: p.z - fz * 800 + rz * sgn * 520, vx: -fx * 800 + (Math.random() - .5) * 800, vy: 500 + Math.random() * 600, vz: -fz * 800 + (Math.random() - .5) * 800, life: .8, max: .8, size: 360, grow: 2.2, col: [.86, .78, .62], tex: 'puff', alpha: .5 }); }
      else if (e.speed > 6000 && e.mineK && Math.random() < .25) GFX.spawn(S, { x: p.x - fx * 800 + rx * (Math.random() - .5) * 900, y: p.y + 100, z: p.z - fz * 800 + rz * (Math.random() - .5) * 900, vx: -fx * 400, vy: 300, vz: -fz * 400, life: .6, max: .6, size: 220, grow: 1.8, col: [.9, .86, .78], tex: 'puff', alpha: .22 });
    }
    // rockets and oil
    for (const m of missiles) { const A = rv(m.from), B = rv(m.to), f = clamp((now - m.t0) / m.eta, 0, 1), z = lerp(m.z0, B ? B.z : m.z0 + 4000, f), x = lerp(m.x0, B ? B.x : m.x0, f), p = T.point(mod(z, T.L), x); const yaw = p.hd; void A;
      GFX.spawn(S, { x: p.x, y: p.y + 650, z: p.z, vx: 0, vy: 100, vz: 0, life: .5, max: .5, size: 300, grow: 2, col: [.95, .6, .2], tex: 'glow', alpha: .9 }); GFX.spawn(S, { x: p.x - Math.cos(yaw) * 400, y: p.y + 650, z: p.z - Math.sin(yaw) * 400, vx: 0, vy: 200, vz: 0, life: .7, max: .7, size: 260, grow: 2.4, col: [.8, .8, .8], tex: 'puff', alpha: .5 });
      S.quad.draw(GFX.billboard(r, p.x, p.y + 650, p.z, 700, 700), { tex: S.tex.glow, blend: true, add: true, unlit: 1, noDepthWrite: true, noCull: true, tint: [1, .7, .3, 1] }); }
    for (const h of hazards) { const p = T.point(mod(h.z, T.L), h.x); S.shadowMesh.draw(M.trs(p.x, p.y + 20, p.z, -p.hd, 0, 0, 2400, 1, 1500), { tex: S.tex.shadow, blend: true, alpha: .92, unlit: 1, noDepthWrite: true, tint: [.05, .02, .1, 1] }); S.shadowMesh.draw(M.trs(p.x - 200, p.y + 26, p.z, -p.hd, 0, 0, 1300, 1, 760), { tex: S.tex.shadow, blend: true, alpha: .55, unlit: 1, noDepthWrite: true, tint: [.5, .2, 1, 1] }); }
    GFX.drawBubbles(r, S, T.boxes, g.boxHide, now, cam.eye, Math.floor(mod(g.z, T.L) / SEG));
    GFX.updateParticles(r, S, dt); GFX.drawParticles(r, S, 'puff'); GFX.drawParticles(r, S, 'glow', { add: true }); GFX.drawParticles(r, S, 'spark', { add: true });
    placeTags(list);
  }
  const rv = (id) => (id === me.id ? G : R_.get(id));

  /* ---------- the HUD (the HTML on top of the 3D view) ---------- */
  const HUDCSS = `
  #drace{position:fixed;inset:0;z-index:99999;background:#05070f;color:#fff;font-family:"Lilita One","Luckiest Guy","Baloo 2",Impact,"Arial Rounded MT Bold",system-ui,sans-serif;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:none;-webkit-tap-highlight-color:transparent;--u:1}
  #drace .dr-stage{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;background:#78b6ee}
  #drace canvas.gl{position:absolute;left:0;top:0;display:block}
  #drace .dr-loading{position:absolute;inset:0;z-index:30;display:none;align-items:center;justify-content:center;background:rgba(10,30,80,.55);font-size:calc(26px*var(--u));-webkit-text-stroke:3px #0a1a40;paint-order:stroke fill}
  #drace .dr-loading.on{display:flex}
  #drace .t{color:#fff;-webkit-text-stroke:calc(4px*var(--u)) #0b2a66;paint-order:stroke fill;text-shadow:0 calc(3px*var(--u)) 0 #0b2a66;letter-spacing:.01em}
  #drace .hud{position:absolute;inset:0;z-index:6;pointer-events:none;display:none}
  #drace .hud.on{display:block}
  #drace .h-place{position:absolute;left:calc(14px*var(--u));top:calc(8px*var(--u));display:flex;align-items:baseline;gap:calc(6px*var(--u))}
  #drace .h-place small{font-size:calc(22px*var(--u))}
  #drace .h-place b{font-size:calc(58px*var(--u));font-weight:400;line-height:1}
  #drace .h-place i{font-style:normal;font-size:calc(34px*var(--u))}
  #drace .h-lap{position:absolute;right:calc(70px*var(--u));top:calc(8px*var(--u));display:flex;align-items:baseline;gap:calc(8px*var(--u))}
  #drace .h-lap small{font-size:calc(22px*var(--u))}
  #drace .h-lap b{font-size:calc(58px*var(--u));font-weight:400;line-height:1}
  #drace .h-lap i{font-style:normal;font-size:calc(34px*var(--u))}
  #drace .h-prog{position:absolute;left:50%;top:calc(12px*var(--u));width:min(46%,calc(560px*var(--u)));transform:translateX(-50%);height:calc(46px*var(--u))}
  #drace .h-prog .bar{position:absolute;left:calc(26px*var(--u));right:calc(26px*var(--u));top:calc(18px*var(--u));height:calc(9px*var(--u));border-radius:9px;background:linear-gradient(#2a6fe0,#123c94);box-shadow:0 0 0 calc(2px*var(--u)) #0b2a66,inset 0 1px 0 rgba(255,255,255,.4)}
  #drace .h-prog .fl{position:absolute;top:calc(2px*var(--u));width:calc(36px*var(--u));height:calc(34px*var(--u));background:conic-gradient(#111 25%,#fff 0 50%,#111 0 75%,#fff 0) 0 0/50% 50%;border:calc(2px*var(--u)) solid #0b2a66;border-radius:4px}
  #drace .h-prog .fl.s{left:0}#drace .h-prog .fl.f{right:0}
  #drace .h-prog em{position:absolute;top:calc(38px*var(--u));font-style:normal;font-size:calc(14px*var(--u));width:calc(60px*var(--u));text-align:center;margin-left:calc(-12px*var(--u))}
  #drace .h-prog .dot{position:absolute;top:calc(8px*var(--u));width:calc(24px*var(--u));height:calc(24px*var(--u));margin-left:calc(-12px*var(--u));border-radius:50%;border:calc(2px*var(--u)) solid #fff;box-shadow:0 2px 0 #0b2a66;transition:left .12s linear}
  #drace .h-prog .dot.me{width:calc(32px*var(--u));height:calc(32px*var(--u));margin-left:calc(-16px*var(--u));top:calc(4px*var(--u));z-index:2;border-color:#ffd23f}
  #drace .h-pause{position:absolute;right:calc(10px*var(--u));top:calc(10px*var(--u));width:calc(48px*var(--u));height:calc(48px*var(--u));border-radius:50%;pointer-events:auto;border:calc(3px*var(--u)) solid #0b2a66;background:radial-gradient(#3b8cff,#1257d1);color:#fff;font-size:calc(20px*var(--u));font-family:inherit;box-shadow:0 3px 0 #0a1f57}
  #drace .h-slot{position:absolute;top:calc(118px*var(--u));width:calc(104px*var(--u));height:calc(104px*var(--u));border-radius:50%;pointer-events:auto;border:calc(5px*var(--u)) solid #1b7dff;background:radial-gradient(circle at 35% 30%,rgba(120,190,255,.75),rgba(20,70,170,.8));box-shadow:0 0 0 calc(3px*var(--u)) #0b2a66,0 calc(5px*var(--u)) 0 #0a1f57;display:flex;align-items:center;justify-content:center;font-size:calc(52px*var(--u));font-family:inherit;color:#fff;padding:0}
  #drace .h-slot.l{left:calc(10px*var(--u))}#drace .h-slot.rs{right:calc(8px*var(--u))}
  #drace .h-slot.has{box-shadow:0 0 0 calc(3px*var(--u)) #0b2a66,0 0 calc(22px*var(--u)) #7fc4ff}
  #drace .h-slot span{filter:drop-shadow(0 3px 0 rgba(0,0,0,.35))}
  #drace .h-slot small{position:absolute;bottom:calc(-22px*var(--u));left:0;right:0;text-align:center;font-size:calc(14px*var(--u));-webkit-text-stroke:3px #0b2a66;paint-order:stroke fill}
  #drace .h-ctl{position:absolute;left:0;right:0;bottom:0;height:46%}
  #drace .cb{position:absolute;pointer-events:auto;border:calc(4px*var(--u)) solid rgba(255,255,255,.55);border-radius:50%;background:rgba(18,87,209,.35);color:#fff;font-family:inherit;display:flex;align-items:center;justify-content:center;touch-action:none;padding:0}
  #drace .cb.on{background:rgba(255,210,63,.6)}
  #drace.tilt .cb.steer{display:none}
  #drace .h-toast{position:absolute;left:0;right:0;top:calc(150px*var(--u));text-align:center;font-size:calc(30px*var(--u))}
  #drace .h-toast div{margin-bottom:calc(4px*var(--u));-webkit-text-stroke:calc(4px*var(--u)) #0b2a66;paint-order:stroke fill;text-shadow:0 calc(3px*var(--u)) 0 #0b2a66}
  #drace .h-count{position:absolute;left:0;right:0;top:calc(80px*var(--u));text-align:center;font-size:calc(150px*var(--u));color:#ffd23f;-webkit-text-stroke:calc(8px*var(--u)) #b3210d;paint-order:stroke fill;text-shadow:0 calc(8px*var(--u)) 0 #7a1608}
  #drace .h-fin{position:absolute;left:0;right:0;top:calc(70px*var(--u));text-align:center;font-size:calc(64px*var(--u));color:#ffd23f;-webkit-text-stroke:calc(6px*var(--u)) #b3210d;paint-order:stroke fill}
  #drace .h-tag{position:absolute;left:0;top:0;font-size:calc(14px*var(--u));-webkit-text-stroke:3px #0b2a66;paint-order:stroke fill;white-space:nowrap;transform:translate(-50%,-100%);will-change:transform}
  #drace .h-net{position:absolute;left:0;right:0;top:36%;text-align:center;font-size:calc(28px*var(--u));color:#ff9a9a;-webkit-text-stroke:3px #5a0d0d;paint-order:stroke fill}
  #drace .h-tm{position:absolute;left:50%;bottom:calc(14px*var(--u));width:calc(160px*var(--u));height:calc(10px*var(--u));margin-left:calc(-80px*var(--u));background:rgba(0,0,0,.4);border-radius:6px}
  #drace .h-tm i{position:absolute;top:calc(-4px*var(--u));width:calc(18px*var(--u));height:calc(18px*var(--u));border-radius:50%;background:#9fe3ff;left:50%;margin-left:calc(-9px*var(--u))}
  #drace .rot{position:absolute;z-index:40;left:0;right:0;bottom:6px;text-align:center;font-size:12px;opacity:.9;pointer-events:none;display:none}
  #drace .dr-x{position:absolute;z-index:25;top:calc(8px*var(--u));width:calc(40px*var(--u));height:calc(40px*var(--u));border-radius:50%;border:calc(3px*var(--u)) solid #0b2a66;background:radial-gradient(#3b8cff,#1257d1);color:#fff;font-family:inherit;font-size:calc(18px*var(--u));padding:0;display:none}
  `;
  function buildHud() {
    hudEl.innerHTML = `<div class="h-place t"><small>PLACE</small><b id="h-p">1</b><i id="h-n">/8</i></div>
      <div class="h-prog"><span class="fl s"></span><div class="bar" id="h-bar"></div><span class="fl f"></span><em class="t" style="left:0">START</em><em class="t" style="right:0;margin-left:0;margin-right:calc(-12px*var(--u))">FINISH</em></div>
      <div class="h-lap t"><small>LAP</small><b id="h-l">1</b><i id="h-ln">/3</i></div>
      <button class="h-pause" id="h-pause" aria-label="Pause">⏸</button>
      <button class="h-slot l" id="h-s0" aria-label="Power-up 1"><span></span></button><button class="h-slot rs" id="h-s1" aria-label="Power-up 2"><span></span></button>
      <div class="h-ctl" id="h-ctl"></div><div class="h-toast t" id="h-toast"></div><div class="h-count" id="h-count"></div><div class="h-fin" id="h-fin"></div><div class="h-net t" id="h-net"></div>
      <div class="h-tm" id="h-tm" style="display:none"><i id="h-tmi"></i></div><div id="h-tags"></div>`;
    const ctl = hudEl.querySelector('#h-ctl');
    const mk = (cls, css, html, down, up) => { const b = document.createElement('button'); b.className = 'cb ' + cls; b.style.cssText = css; b.innerHTML = html; b.type = 'button'; const on = (e) => { e.preventDefault(); b.classList.add('on'); down(); }, off = (e) => { if (e) e.preventDefault(); b.classList.remove('on'); up(); }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); b.addEventListener('contextmenu', (e) => e.preventDefault()); ctl.appendChild(b); return b; };
    const u = 'calc(var(--u)*';
    mk('steer', `left:${u}14px);bottom:${u}14px);width:${u}92px);height:${u}92px);font-size:${u}36px)`, '◀', () => { touch.l = 1; }, () => { touch.l = 0; });
    mk('steer', `left:${u}116px);bottom:${u}14px);width:${u}92px);height:${u}92px);font-size:${u}36px)`, '▶', () => { touch.r = 1; }, () => { touch.r = 0; });
    mk('', `right:${u}14px);bottom:${u}14px);width:${u}84px);height:${u}84px);font-size:${u}15px)`, 'DRIFT', () => { touch.drift = 1; }, () => { touch.drift = 0; });
    mk('', `right:${u}108px);bottom:${u}18px);width:${u}64px);height:${u}64px);font-size:${u}13px)`, 'BRAKE', () => { touch.brake = 1; }, () => { touch.brake = 0; });
    hudEl.querySelector('#h-s0').addEventListener('pointerdown', (e) => { e.preventDefault(); useItem(0); }); hudEl.querySelector('#h-s1').addEventListener('pointerdown', (e) => { e.preventDefault(); useItem(1); });
    hudEl.querySelector('#h-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); togglePause(); });
  }
  const hv = {};
  function setText(id, v) { if (hv[id] === v) return; hv[id] = v; const e = hudEl.querySelector('#' + id); if (e) e.textContent = v; }
  function updateHud(now) {
    if (!G || !S) return; const g = G, T = S.T, total = Math.max(rows.length, lobby ? lobby.players.length : 0, R_.size + 1);
    setText('h-p', String(g.finished ? g.finishPlace || g.place : g.place)); setText('h-n', '/' + total); setText('h-l', String(Math.min(g.lap, laps))); setText('h-ln', '/' + laps);
    // the race strip: everyone's dot along the way from START to FINISH
    const bar = hudEl.querySelector('#h-bar'); const prog = (z) => clamp(z / (laps * T.L), 0, 1);
    let dots = bar.querySelectorAll('.dot'); const want = R_.size + 1; if (dots.length !== want) { bar.innerHTML = ''; for (let i = 0; i < want; i++) { const d = document.createElement('div'); d.className = 'dot' + (i === 0 ? ' me' : ''); bar.appendChild(d); } dots = bar.querySelectorAll('.dot'); }
    const col = myStyle.color; dots[0].style.left = (prog(g.z) * 100) + '%'; dots[0].style.background = col; let i = 1; for (const o of R_.values()) { const d = dots[i++]; d.style.left = (prog(o.z) * 100) + '%'; d.style.background = o.color; }
    for (let k = 0; k < 2; k++) { const b = hudEl.querySelector('#h-s' + k), it = g.items[k]; b.classList.toggle('has', !!it); const sp = b.firstElementChild; const t = it ? ITEM[it][0] : ''; if (sp.textContent !== t) sp.textContent = t; }
    const tm = hudEl.querySelector('#h-tm'); tm.style.display = pref.steer === 'tilt' && tilt.on && phase === 'race' ? 'block' : 'none'; if (tm.style.display === 'block') hudEl.querySelector('#h-tmi').style.left = (50 + tiltSteer() * 45) + '%';
    const tw = hudEl.querySelector('#h-toast'); const html = toasts.map((t) => `<div style="color:${t.col};opacity:${clamp(Math.min(t.life, 1) / 1, 0, 1)}">${esc(t.text)}</div>`).join(''); if (hv.toast !== html) { hv.toast = html; tw.innerHTML = html; }
    const cd = hudEl.querySelector('#h-count'); let ct = ''; if (phase === 'countdown') { const left = (goAt - performance.now()) / 1000, n = Math.ceil(left); if (n >= 1 && n <= 3) { ct = String(n); if (n !== last3) { last3 = n; beep(440, .18, 'square', .07); } } else if (left <= 0 && left > -1) ct = 'GO!!'; } else if (phase === 'race' && startAt && performance.now() - startAt < 900) ct = 'GO!!'; if (hv.ct !== ct) { hv.ct = ct; cd.textContent = ct; }
    setText('h-fin', g.finished && phase === 'race' ? 'FINISHED! ' + ord(g.finishPlace || g.place) : ''); setText('h-net', lostAt && (phase === 'race' || phase === 'countdown') ? 'Reconnecting…' : '');
    root.classList.toggle('tilt', pref.steer === 'tilt');
  }
  function placeTags(list) {
    const el = hudEl.querySelector('#h-tags'); const want = list.filter((e) => !e.mineK && e.name); while (el.children.length < want.length) { const d = document.createElement('div'); d.className = 'h-tag t'; el.appendChild(d); }
    for (let i = 0; i < el.children.length; i++) { const d = el.children[i], e = want[i]; if (!e) { d.style.display = 'none'; continue; } const p = r.project([e.pose.x, e.pose.y + 1900, e.pose.z]); if (!p || p[2] > 70000 || p[2] < 1500) { d.style.display = 'none'; continue; } d.style.display = 'block'; if (d.textContent !== e.name) d.textContent = e.name; d.style.transform = `translate(${(p[0] / dpr).toFixed(1)}px,${(p[1] / dpr).toFixed(1)}px) translate(-50%,-100%)`; }
  }
  function toast(text, col, life = 1.8) { toasts.unshift({ text, col: col || '#fff', life }); if (toasts.length > 3) toasts.pop(); }
  function useItem(slot) { if (G && G.items[slot] && phase === 'race' && sock && !optsOpen) sock.emit('race:use', { slot }); }
  function togglePause() { optsOpen = !optsOpen; if (menu && menu.pause) menu.pause(optsOpen); }

  /* ---------- the loop ---------- */
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!r || loading) return; const now = performance.now(), dt = clamp((now - (lastT || now)) / 1000, 0, .05); lastT = now;
    try {
      if ((phase === 'race' || phase === 'countdown') && G && S && S.T.id === trackId) {
        if (phase === 'countdown' && now >= goAt) { phase = 'race'; startAt = goAt; G.lapStart = goAt; beep(880, .5, 'square', .07); buzz(40); engine(true); lastSend = 0; if (tilt.on) tiltCalibrate(); if (menu && menu.on) menu.on('go'); }
        smoothRemotes(now); update(dt, now); engineTick(); renderRace(now, dt); updateHud(now);
        perf.acc += dt; perf.n++; if (perf.acc > 1.6 && phase === 'race') { const avg = perf.acc / perf.n * 1000; perf.acc = 0; perf.n = 0; if (avg > 30 && perf.q > .6) { perf.q = Math.max(.6, perf.q - .15); fit(); } else if (avg < 15 && perf.q < 1) { if (++perf.calm >= 6) { perf.q = Math.min(1, perf.q + .1); perf.calm = 0; fit(); } } else perf.calm = 0; }
      } else { drawBackground(now, dt); }
    } catch (e) { console.error('[race] frame failed:', e); }
  }

  /* ---------- talking to the server ---------- */
  function applyState(s) {
    const t = performance.now(); rows = s.r;
    for (const row of s.r) { const [id, z, x, v, fl, lap, place] = row; if (id === me.id) { if (G) G.place = place; continue; } const o = R_.get(id); if (!o) continue; o.snaps.push({ t, z, x, v }); if (o.snaps.length > 14) o.snaps.shift(); o.fl = fl; o.lap = lap; o.place = place; }
    hazards = s.h.map((h) => ({ id: h[0], z: h[1], x: h[2] }));
  }
  function setupRace(d, mineStart) {
    laps = d.laps; trackId = d.track || trackId; lobby = Object.assign({}, lobby || {}, { players: d.players, track: trackId });
    R_.clear(); for (const p of d.players) if (p.id !== me.id) { const st = (d.start || []).find((q) => q[0] === p.id); R_.set(p.id, { id: p.id, name: p.name, color: p.color, type: p.type, driver: p.driver || 0, bot: p.bot, snaps: [], z: st ? st[1] : 0, x: st ? st[2] : 0, v: 0, fl: 0, lap: 1, place: 0, steer: 0, wheel: 0 }); }
    const mp = d.players.find((p) => p.id === me.id); if (mp) { myStyle.color = mp.color; myStyle.type = mp.type || myStyle.type; myStyle.driver = mp.driver != null ? mp.driver : myStyle.driver; }
    G = newGame(mineStart ? mineStart[1] : -600, mineStart ? mineStart[2] : 0); rows = []; hazards = []; missiles = []; toasts = []; lastT = 0; startAt = 0; last3 = 4; cam = null; optsOpen = false;
  }
  function wireSocket() {
    sock.on('race:lobby', (d) => { lobby = d; code = d.code; laps = d.laps; trackId = d.track || trackId; if (phase === 'menu' || phase === 'lobby' || phase === 'results') { if (phase !== 'menu') phase = 'lobby'; results = null; engine(false); } if (menu && menu.on) menu.on('lobby', d); });
    sock.on('race:countdown', (d) => {
      srvOff = performance.now() - d.now; goAt = d.goAt + srvOff; const mine = d.start.find((s) => s[0] === me.id);
      setupRace(d, mine); results = null; ensureScene(trackId).then(() => { phase = 'countdown'; if (tilt.on) tiltCalibrate(); hudShow(true); if (menu && menu.on) menu.on('countdown', d); });
    });
    sock.on('race:state', applyState);
    sock.on('race:resume', (d) => {
      if (!d) return; srvOff = performance.now() - d.now; setupRace({ laps: d.laps, track: d.track, players: d.players, start: [] }, null); const y = d.you || {};
      ensureScene(trackId).then(() => {
        G = newGame(y.z || 0, y.x || 0); G.v = y.v || 0; G.items = y.items || []; G.lap = y.lap || 1; G.lapIdx = Math.max(0, Math.floor((y.z || 0) / S.T.L)); G.finished = !!y.finished; G.finishPlace = y.finished ? y.place : 0; G.place = y.place || 1; G.bestLap = y.bestLapMs || 0;
        if (d.status === 'countdown') { goAt = d.goAt + srvOff; phase = 'countdown'; hudShow(true); } else if (d.status === 'racing') { startAt = d.startAt + srvOff; G.lapStart = performance.now(); phase = 'race'; engine(true); hudShow(true); if (d.state) { applyState(d.state); for (const o of R_.values()) if (o.snaps.length) { const l = o.snaps[o.snaps.length - 1]; o.z = l.z; o.x = l.x; o.v = l.v; } } }
        else if (d.status === 'results' && d.results) { results = d.results; phase = 'results'; hudShow(false); if (menu && menu.on) menu.on('results', d.results); } else { phase = 'lobby'; hudShow(false); if (menu && menu.on) menu.on('lobby', lobby); }
        lostAt = 0; toast('Back in the race!', '#9fe3ff', 1.6);
      });
    });
    sock.on('race:item', (d) => { if (!G) return; const had = G.items.length; G.items = d.items || []; if (G.items.length > had) { const it = G.items[G.items.length - 1]; toast(ITEM[it][0] + ' ' + ITEM[it][1], '#9fe3ff', 1.6); beep(900, .15, 'triangle', .06, 200); } });
    sock.on('race:fx', (d) => {
      if (!G) return; const now = performance.now();
      if (d.from === me.id) { if (d.kind === 'nitro') { G.boostT = Math.max(G.boostT, d.dur / 1000); beep(300, .4, 'sawtooth', .06, 700); } else if (d.kind === 'mega') { G.boostT = Math.max(G.boostT, d.dur / 1000); G.shieldT = d.dur / 1000; beep(300, .5, 'sawtooth', .06, 800); } else if (d.kind === 'shield') { G.shieldT = d.dur / 1000; beep(500, .25, 'triangle', .06, 200); } }
      if (d.kind === 'rocket' && d.to) { const a = rv(d.from), b = rv(d.to); if (a && b) missiles.push({ from: d.from, to: d.to, z0: a.z, x0: a.x, t0: now, eta: d.eta * 1000 }); if (d.to === me.id) { toast('ROCKET INCOMING!', '#ff6b6b', 1.6); beep(250, .5, 'sawtooth', .06, -100); } }
      if (d.kind === 'block' && d.to === me.id) { G.shieldT = 0; G.flash = .6; toast('Shield blocked it!', '#9fe3ff', 1.4); beep(800, .2, 'square', .06, -300); }
    });
    sock.on('race:hit', (d) => {
      if (!G || d.to !== me.id) return;
      if (d.kind === 'slow') { G.slowT = d.dur / 1000; toast('GO-SLOW!', '#ffb36b', 1.6); } else { G.spinT = d.dur / 1000; G.spinDur = d.dur / 1000; G.v *= .25; G.shake = .6; toast(d.kind === 'rocket' ? 'HIT BY A ROCKET!' : 'OIL SPILL!', '#ff6b6b', 1.6); }
      beep(160, .35, 'sawtooth', .08, -60); buzz([60, 40, 90]);
    });
    sock.on('race:finish', (d) => { if (d.id === me.id && G) { G.finished = true; G.finishPlace = G.place; } else { const o = R_.get(d.id); if (o && !o.bot) toast(o.name + ' finished', '#ffffff', 1.4); } });
    sock.on('race:results', (d) => { results = d; phase = 'results'; engine(false); hudShow(false); if (menu && menu.on) menu.on('results', d); });
    sock.on('disconnect', () => { if (phase !== 'menu') lostAt = performance.now(); });
    sock.on('connect', () => {
      if (!hadConnected) { hadConnected = true; return; } if (!code || phase === 'menu') { lostAt = 0; return; }
      sock.emit('race:join', { code }, (res) => { lostAt = 0; if (!res || !res.ok) { toast('That race is over.', '#ff8f8f', 3); lobby = null; results = null; phase = 'menu'; code = ''; engine(false); hudShow(false); if (menu && menu.on) menu.on('over', res); return; } if (res.you) me.id = res.you; if (res.lobby) lobby = res.lobby; });
    });
  }
  function hudShow(on) { if (hudEl) hudEl.classList.toggle('on', !!on); if (!on) { G = null; } if (menu && menu.on) menu.on(on ? 'hud-on' : 'hud-off'); }

  /* ---------- opening and closing ---------- */
  const keyDown = (e) => { if (!root) return; keys[e.key] = true; if (e.key === ' ' || e.key === 'e' || e.key === 'E') { e.preventDefault(); useItem(0); } if (e.key === 'q' || e.key === 'Q') useItem(1); if (e.key === 'Escape') togglePause(); if (e.key.startsWith('Arrow')) e.preventDefault(); };
  const keyUp = (e) => { keys[e.key] = false; };
  function open() {
    if (root) return; if (typeof RaceTrack === 'undefined' || typeof GL3D === 'undefined') return;
    if (!document.getElementById('drace-css')) { const st = document.createElement('style'); st.id = 'drace-css'; st.textContent = HUDCSS; document.head.appendChild(st); }
    if (!document.getElementById('drace-font')) { const l = document.createElement('link'); l.id = 'drace-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap'; document.head.appendChild(l); }
    root = document.createElement('div'); root.id = 'drace'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Drive Race');
    root.innerHTML = '<div class="dr-stage"><canvas class="gl"></canvas><div class="hud"></div><div class="dr-ui"></div><div class="dr-loading t">Loading…</div><div class="rot t">Turn your phone sideways for the best view</div></div>';
    document.body.appendChild(root); stage = root.querySelector('.dr-stage'); glc = root.querySelector('canvas.gl'); hudEl = root.querySelector('.hud'); buildHud();
    window.addEventListener('resize', fit); window.addEventListener('orientationchange', fit); document.addEventListener('keydown', keyDown); document.addEventListener('keyup', keyUp);
    try { if (root.requestFullscreen) root.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {}); } catch (e) { /* optional */ }
    phase = 'menu'; lobby = null; results = null; fit(); const ok = initGL(); fit(); lastT = 0; raf = requestAnimationFrame(frame);
    connect();
    if (menu && menu.open) menu.open(root.querySelector('.dr-ui'), api, ok);
  }
  function close() {
    if (!root) return;
    try { if (sock) sock.emit('race:leave', {}); } catch (e) { /* closing anyway */ }
    cancelAnimationFrame(raf); engine(false); tiltStop(); if (menu && menu.close) menu.close();
    window.removeEventListener('resize', fit); window.removeEventListener('orientationchange', fit); document.removeEventListener('keydown', keyDown); document.removeEventListener('keyup', keyUp);
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* fine */ }
    if (sock && ownSock) { sock.disconnect(); sock = null; ownSock = false; hadConnected = false; }
    root.remove(); root = null; G = null; R_.clear(); phase = 'menu'; lobby = null; results = null; keys = {}; touch = { l: 0, r: 0, brake: 0, drift: 0 }; r = null; for (const k of Object.keys(scenes)) delete scenes[k]; S = null; hv.toast = null;
  }

  /* what the menu can use */
  const api = {
    ask, emit, connect, ITEM, TYPE_MOD, fmt, ord, esc, ensureScene, setBackground, close, gfx: GFX, tracks: () => RT.list(),
    me: () => me, lobby: () => lobby, code: () => code, results: () => results, phase: () => phase, pref: () => pref, savePref, tilt: { start: tiltStart, stop: tiltStop, calibrate: tiltCalibrate, steer: tiltSteer, on: () => tilt.on, level: () => tilt.ang },
    setStyle(st) { Object.assign(myStyle, st); sendStyle(); }, getStyle: () => myStyle, applyCar,
    sound: (on) => { pref.sound = on; savePref(); if (!on) engine(false); else if (phase === 'race') engine(true); }, beep, buzz,
    leave(cb) { if (sock) sock.emit('race:leave', {}, () => { lobby = null; results = null; code = ''; phase = 'menu'; engine(false); hudShow(false); if (cb) cb(); }); else if (cb) cb(); },
    setPhase(p) { phase = p; }, setPaused(p) { optsOpen = p; }, hudShow, toast, G: () => G, renderer: () => r, scene: () => S
  };
  return { open, close, attachMenu(m) { menu = m; }, _state: () => ({ phase, G, lobby, results, R: R_, S, pref, perf }), api };
})();
window.DRACE = DRACE;
