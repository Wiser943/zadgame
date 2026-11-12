/* ================= AllConnect 3D street world (WORLD) =================
   "Step outside" loads this: a real-time 3D Lagos (Three.js) built from the same 1000 x 1000 map the old canvas map uses
   (same roads, bridges, coastline and pins; 1 map unit = 1 metre here), so a player on this screen and a player on the old
   map are standing in the same place.
   - walk with WASD / arrows (or click the ground, or the touch stick); drag to look round; wheel to zoom
   - other players are drawn live from the same socket feed the map uses; people on a job shift play a work animation
     with their job title above their head; shop-keepers, traders and wardens (NPCs) work around the venues
   - if the player owns a car / motorcycle / van / danfo (Phone > Transport) it is parked outside their door: walk up and
     press E to get in, then drive it (W/S/A/D, Space brake, H horn, C camera). Traffic runs on the main roads.
   The HUD (minimap, speedometer, pedals, prompts) lives in worldhud.js; both share the WORLD object. */
(function (g) {
  'use strict';
  const TAU = Math.PI * 2, SZ = 1000;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const angDiff = (a, b) => ((b - a + Math.PI * 3) % TAU) - Math.PI;
  const turn = (a, b, k) => a + angDiff(a, b) * Math.min(1, k);
  let seed = 4242; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const hashStr = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const $ = id => document.getElementById(id);

  const X = g.WORLD = {
    on: false, loading: false, built: false, paused: false, sfx: true, cam: 'chase',
    me: { x: 470, z: 290, h: Math.PI / 2, v: 0, steer: 0, mode: 'foot', st: 'idle', job: '', workUntil: 0, person: null },
    keys: new Set(), joy: { x: 0, y: 0 }, pedal: { gas: 0, brake: 0, steer: 0 },
    camYaw: Math.PI / 2, camPitch: .34, zoom: 6.6, orbit: 0, shake: 0,
    rects: [], grid: {}, others: new Map(), npcs: [], traffic: [], goal: null, car: null, vehicles: [], winMats: [], prompt: null,
    hour: 12, day: 1, nightF: 0
  };
  const SIGNS = ['Chop Life Restaurant', 'Signal Phone Clinic', 'Unique Beauty Salon', 'Bola Textiles', 'Mama Put Kitchen', 'Eko Pharmacy', 'Danfo Auto Parts', 'Ade Electronics', 'Ikeja Supermart', 'Tunde Tailors', 'Oluwa Barbers', 'Sunshine Pharmacy', '9ja Bites', 'Lagos Gadgets', 'Alaba Hardware', 'Iya Bimbo Foods', 'Glo Kiosk', 'Bank of Lagos', 'Naija Boutique', 'Suya Spot', 'Kunle Cyber Cafe', 'Ola Fabrics', 'Mega Chicken', 'Zenith Laundry'];
  const WALL = ['#e8d9b8', '#d9c9a6', '#c8d7e6', '#e6b8a0', '#cdd8b8', '#ece7da', '#d2b59b', '#aebfd2'];
  const LM = { radio: [16, 16, 30], hall: [26, 22, 12], shop: [14, 12, 6], glass: [24, 24, 52], dome: [34, 34, 18], airport: [70, 28, 12], gym: [28, 22, 10], court: [30, 24, 16], refinery: [30, 30, 18], hotel: [30, 30, 62], club: [26, 22, 14], tower: [22, 22, 72], home: [18, 16, 7] };
  const LMC = { radio: '#e9e4d6', hall: '#e7d9bb', shop: '#f2d58a', home: '#f1e6cf', glass: '#7fb7e0', dome: '#efe9dc', airport: '#e8edf2', gym: '#e8505b', court: '#f3efe6', refinery: '#c9ced4', hotel: '#d9e8f2', club: '#4a3a6a', tower: '#e9dcc0' };
  const WORKERS = { shop: ['Cook', '🍲'], hall: ['Usher', '🎟'], gym: ['Trainer', '🏋'], hotel: ['Bellhop', '🛎'], club: ['Bouncer', '🕶'], court: ['Court clerk', '⚖'], airport: ['Porter', '🧳'], glass: ['Receptionist', '💼'], dome: ['Lecturer', '🎓'], radio: ['Presenter', '🎙'], tower: ['Waiter', '🍸'] };
  const CHARS_M = ['casual', 'hoodie', 'businessman', 'beach', 'menworker', 'farmer'];
  const ANIM = { idle: ['Idle_Neutral', 'Idle'], walk: ['Walk'], run: ['Run'], wave: ['Wave', 'Clapping'], work: ['Interact', 'Wave', 'Clapping'], dance: ['Clapping', 'Wave'] };

  /* ---------------------------------------------------------------- land + collisions ---------------------------------------------------------------- */
  X.landAt = (x, z) => { const i = Math.floor(x / 2), j = Math.floor(z / 2); return i >= 0 && j >= 0 && i < 500 && j < 500 && X.land[j * 500 + i] === 1; };
  function buildLand() {
    const a = X.land = new Uint8Array(250000);
    for (let j = 0; j < 500; j++) for (let i = 0; i < 500; i++) a[j * 500 + i] = MAP3D.isLand(i * 2 + 1, j * 2 + 1) ? 1 : 0;
  }
  function addRect(x0, z0, x1, z1) {
    const r = [x0, z0, x1, z1]; X.rects.push(r);
    for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) { const k = i * 64 + j; (X.grid[k] || (X.grid[k] = [])).push(r); }
  }
  X.hitAt = (x, z, r) => {
    for (let i = Math.floor((x - r) / 40); i <= Math.floor((x + r) / 40); i++) for (let j = Math.floor((z - r) / 40); j <= Math.floor((z + r) / 40); j++) {
      const l = X.grid[i * 64 + j]; if (!l) continue;
      for (const q of l) if (x > q[0] - r && x < q[2] + r && z > q[1] - r && z < q[3] + r) return q;
    } return null;
  };
  X.blocked = (x, z, r) => !X.landAt(x, z) || !X.landAt(x + r, z) || !X.landAt(x - r, z) || !X.landAt(x, z + r) || !X.landAt(x, z - r) || !!X.hitAt(x, z, r);
  X.findFree = (x, z, r) => { r = r || 1.2; if (!X.blocked(x, z, r)) return [x, z]; for (let d = 2; d < 80; d += 2) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a * TAU / 16) * d, pz = z + Math.sin(a * TAU / 16) * d; if (!X.blocked(px, pz, r)) return [px, pz]; } return [x, z]; };

  /* ---------------------------------------------------------------- small factories ---------------------------------------------------------------- */
  const mat = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
  const basic = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o || {}));
  const box = (w, h, d, m, x, y, z, par) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === 'string' ? mat(m) : m); o.position.set(x, y, z); if (par) par.add(o); return o; };
  function textSprite(text, o) {
    o = o || {}; const fs = o.fs || 34, c = document.createElement('canvas'), x = c.getContext('2d'); x.font = '700 ' + fs + 'px system-ui,sans-serif';
    const w = Math.ceil(x.measureText(text).width) + 36; c.width = w; c.height = fs + 24; const y = c.getContext('2d');
    y.fillStyle = o.bg || 'rgba(8,16,20,.74)'; const r = (c.height / 2); y.beginPath(); y.moveTo(r, 0); y.arcTo(w, 0, w, c.height, r); y.arcTo(w, c.height, 0, c.height, r); y.arcTo(0, c.height, 0, 0, r); y.arcTo(0, 0, w, 0, r); y.fill();
    y.font = '700 ' + fs + 'px system-ui,sans-serif'; y.textBaseline = 'middle'; y.textAlign = 'center'; y.fillStyle = o.fg || '#fff'; y.fillText(text, w / 2, c.height / 2 + 1);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
    const h = o.h || .42; s.scale.set(h * c.width / c.height, h, 1); s.renderOrder = 20; return s;
  }
  function signPlane(text, w, h, bg) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 8; x.strokeRect(6, 6, c.width - 12, c.height - 12);
    let fs = 64; x.font = '800 ' + fs + 'px system-ui,sans-serif'; while (x.measureText(text).width > c.width - 40 && fs > 18) { fs -= 4; x.font = '800 ' + fs + 'px system-ui,sans-serif'; }
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  }
  const place = (o, x, z, h, y) => { o.position.set(x, y || 0, z); o.rotation.y = Math.PI / 2 - h; };

  /* ---------------------------------------------------------------- vehicles ---------------------------------------------------------------- */
  function procVehicle(kind, color) {
    const g0 = new THREE.Group(), bus = kind === 'bus', van = kind === 'van';
    const L = bus ? 7.6 : van ? 5.1 : 4.3, Wd = bus ? 2.25 : 1.85, H = bus ? 1.75 : van ? 1.7 : .66;
    box(Wd, H, L, color, 0, .42 + H / 2, 0, g0);
    if (bus) {
      box(Wd + .03, .22, L + .03, '#15151a', 0, 1.0, 0, g0); box(Wd + .03, .55, L * .82, '#1a2430', 0, 1.78, 0, g0); box(Wd - .1, .08, L - .1, '#e6b800', 0, 2.2, 0, g0);
    } else if (van) { box(Wd - .05, .55, L * .78, '#1a2430', 0, 1.78, .1, g0); }
    else { box(Wd * .88, .52, L * .5, '#222c3c', 0, 1.34, -.2, g0); }
    const wm = mat('#111114'); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(p => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .28, 12), wm); w.rotation.z = Math.PI / 2; w.position.set(p[0] * (Wd / 2 - .02), .38, p[1] * (L / 2 - .85)); g0.add(w); });
    [-1, 1].forEach(s => { box(.36, .16, .06, basic('#fff3c4'), s * (Wd / 2 - .3), .75, L / 2 + .01, g0); box(.34, .14, .06, basic('#c4161c'), s * (Wd / 2 - .3), .75, -L / 2 - .01, g0); });
    g0.userData = { L, W: Wd, H }; return g0;
  }
  const CAR_COL = ['#c0392b', '#2c3e50', '#e8e8ea', '#1f6f4a', '#d9a21b', '#3d6fb4', '#5d4a8a', '#8a8d93'];
  X.vehicleModel = async function (kind, color) {
    if (kind === 'car') { try { const o = await M3D.spawn('sportscar', { height: 1.3 }); return o.root; } catch (e) { return procVehicle('car', color || '#c0392b'); } }
    if (kind === 'motorcycle') { try { const o = await M3D.spawn('motorcycle', { height: 1.15 }); return o.root; } catch (e) { return procVehicle('car', '#222'); } }
    if (kind === 'bus') return procVehicle('bus', '#f2c200');
    return procVehicle('van', color || '#eceff3');
  };

  /* ---------------------------------------------------------------- people ---------------------------------------------------------------- */
  function procPerson(col) {
    const g0 = new THREE.Group(), skin = '#6b4226'; const legs = [], arms = [];
    [-1, 1].forEach(s => { const p = new THREE.Group(); p.position.set(s * .12, .9, 0); box(.16, .86, .18, '#262833', 0, -.43, 0, p); g0.add(p); legs.push(p); const a = new THREE.Group(); a.position.set(s * .31, 1.5, 0); box(.12, .6, .14, skin, 0, -.3, 0, a); g0.add(a); arms.push(a); });
    box(.46, .62, .24, col || '#d9b24a', 0, 1.2, 0, g0); box(.22, .24, .22, skin, 0, 1.66, 0, g0); box(.24, .09, .24, '#16100d', 0, 1.8, 0, g0);
    g0.userData = { legs, arms }; return g0;
  }
  function newPerson(key, o) {
    o = o || {}; const P = { holder: new THREE.Group(), act: {}, mixer: null, curA: null, key, ready: false, t: Math.random() * 10, proc: null, want: 'idle', spd: 1, pst: 'idle' };
    M3D.spawn(key, { height: 1.74 }).then(r => {
      P.holder.add(r.root); P.obj = r.obj;
      if (r.mixer) { P.mixer = r.mixer; r.clips.forEach(c => { P.act[c.name] = r.mixer.clipAction(c); }); }
      if (o.look) { try { M3D.dress({ obj: r.obj, room: {} }, o.look, o.gender || 'male', key); } catch (e) { } }
      P.ready = true; setAnim(P, P.want, P.spd);
    }).catch(() => { P.proc = procPerson(o.col); P.holder.add(P.proc); P.ready = true; });
    return P;
  }
  function setAnim(P, name, spd) {
    P.want = name; P.spd = spd || 1; P.pst = name; if (P.proc || !P.ready) return;
    let a = null; for (const n of (ANIM[name] || ANIM.idle)) if (P.act[n]) { a = P.act[n]; break; }
    if (!a) { const k = Object.keys(P.act); if (!k.length) return; a = P.act[k[0]]; }
    if (P.curA !== a) { if (P.curA) P.curA.fadeOut(.2); a.reset().fadeIn(.2).play(); P.curA = a; }
    a.setEffectiveTimeScale(spd || 1);
  }
  function stepPerson(P, dt) {
    if (P.mixer) P.mixer.update(dt);
    if (P.proc) {
      const sw = P.pst === 'walk' ? .7 : P.pst === 'run' ? 1.05 : 0; P.t += dt * (P.pst === 'run' ? 12 : 8); const u = P.proc.userData;
      u.legs[0].rotation.x = Math.sin(P.t) * sw; u.legs[1].rotation.x = -Math.sin(P.t) * sw; u.arms[0].rotation.x = -Math.sin(P.t) * sw * .8; u.arms[1].rotation.x = Math.sin(P.t) * sw * .8;
      if (P.pst === 'wave' || P.pst === 'work' || P.pst === 'dance') u.arms[1].rotation.x = -2.2 + Math.sin(P.t * 1.3) * .5;
    }
  }
  X.newPerson = newPerson; X.setAnim = setAnim;

  /* ---------------------------------------------------------------- sky, lights, time ---------------------------------------------------------------- */
  function buildSky() {
    const sc = X.scene;
    const c = document.createElement('canvas'); c.width = 4; c.height = 128; X.skyCv = c; X.skyTex = new THREE.CanvasTexture(c);
    X.sky = new THREE.Mesh(new THREE.SphereGeometry(1700, 24, 14), new THREE.MeshBasicMaterial({ map: X.skyTex, side: THREE.BackSide, fog: false, depthWrite: false })); X.sky.renderOrder = -10; sc.add(X.sky);
    const st = []; for (let i = 0; i < 320; i++) { const a = rnd() * TAU, e = .08 + rnd() * 1.2, r = 1650; st.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(st, 3));
    X.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); sc.add(X.stars);
    X.hemi = new THREE.HemisphereLight('#9ec5ff', '#556644', .9); sc.add(X.hemi);
    X.sun = new THREE.DirectionalLight('#fff1d6', .8); X.sun.position.set(300, 420, 160); sc.add(X.sun);
    X.moon = new THREE.DirectionalLight('#7f9bd6', .3); X.moon.position.set(-260, 300, -200); sc.add(X.moon);
    sc.fog = new THREE.Fog('#c8e2f2', 90, 820);
  }
  const C = c => new THREE.Color(c);
  X.applyTime = function () {
    if (!X.scene || typeof S === 'undefined') return;
    const h = ((S.min % 1440) + 1440) % 1440 / 60; X.hour = h;
    const day = sm(5.2, 7.4, h) * (1 - sm(17.4, 19.6, h)), glow = Math.max(sm(4.8, 6, h) * (1 - sm(6, 7.6, h)), sm(16.8, 18.4, h) * (1 - sm(18.4, 20.2, h)));
    X.day = day; X.nightF = 1 - day;
    const top = C('#070d24').lerp(C('#4f9be0'), day), hor = C('#23264c').lerp(C('#bfe3f7'), day).lerp(C('#e0875a'), glow * .8);
    const cv = X.skyCv, x = cv.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(.42, '#' + top.clone().lerp(hor, .7).getHexString()); gr.addColorStop(.5, '#' + hor.getHexString()); gr.addColorStop(1, '#' + hor.clone().multiplyScalar(.7).getHexString());
    x.fillStyle = gr; x.fillRect(0, 0, 4, 128); X.skyTex.needsUpdate = true;
    X.scene.fog.color.copy(hor).lerp(C('#10142a'), .0);
    X.hemi.color.copy(top).lerp(C('#ffffff'), .35); X.hemi.groundColor.set('#1a2418').lerp(C('#6a7a58'), day); X.hemi.intensity = .5 + .5 * day;
    X.sun.intensity = day * .85; X.sun.color.set('#fff1d6').lerp(C('#ffb070'), glow * .7); X.moon.intensity = (1 - day) * .34;
    X.stars.material.opacity = clamp((1 - day) * 1.4 - .1, 0, 1);
    X.winMats.forEach(m => { m.emissiveIntensity = .08 + .95 * X.nightF; });
    if (X.halo) X.halo.material.opacity = clamp(X.nightF * 1.2, 0, .95);
    if (X.lampMat) X.lampMat.color.set('#ffd9a0').multiplyScalar(.45 + .55 * X.nightF);
    if (X.groundMat) X.groundMat.emissiveIntensity = .05 + .18 * X.nightF;
  };

  /* ---------------------------------------------------------------- ground ---------------------------------------------------------------- */
  const VX = [], ZM = [120, 240, 350], ZI = [640, 750, 860, 940]; for (let x = 100; x <= 900; x += 100) VX.push(x);
  function buildGround() {
    const PX = 2048, k = PX / SZ, m = document.createElement('canvas'); m.width = m.height = 500; const mc = m.getContext('2d'), id = mc.createImageData(500, 500);
    for (let i = 0; i < 250000; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = X.land[i] ? 255 : 0; } mc.putImageData(id, 0, 0);
    const lay = document.createElement('canvas'); lay.width = lay.height = PX; const l = lay.getContext('2d');
    l.fillStyle = '#6d8a55'; l.fillRect(0, 0, PX, PX);
    // blotchy grass so big open areas are not one flat colour
    for (let i = 0; i < 700; i++) { l.fillStyle = 'rgba(' + (70 + rnd() * 40) + ',' + (110 + rnd() * 40) + ',' + (60 + rnd() * 30) + ',.35)'; l.beginPath(); l.arc(rnd() * PX, rnd() * PX, 12 + rnd() * 40, 0, TAU); l.fill(); }
    (MAP3D.zones || []).forEach(z => { l.fillStyle = z.c; l.globalAlpha = .45; l.fillRect(z.x * k, z.y * k, z.w * k, z.h * k); l.globalAlpha = 1; });
    const rd = []; // [axis, centre, from, to]
    VX.forEach(x => { rd.push(['v', x, 30, 382]); rd.push(['v', x, 575, 968]); }); ZM.forEach(z => rd.push(['h', z, 30, 970])); ZI.forEach(z => rd.push(['h', z, 30, 970]));
    const rect = (x0, z0, x1, z1, c) => { l.fillStyle = c; l.fillRect(x0 * k, z0 * k, (x1 - x0) * k, (z1 - z0) * k); };
    rd.forEach(r => r[0] === 'v' ? rect(r[1] - 10, r[2], r[1] + 10, r[3], '#b3a998') : rect(r[2], r[1] - 10, r[3], r[1] + 10, '#b3a998'));
    rd.forEach(r => r[0] === 'v' ? rect(r[1] - 7, r[2], r[1] + 7, r[3], '#43464b') : rect(r[2], r[1] - 7, r[3], r[1] + 7, '#43464b'));
    (MAP3D.bridges || []).forEach(b => { rect(b[0] - 1, b[1], b[0] + b[2] + 1, b[1] + b[3], '#8f8f94'); rect(b[0] + 1, b[1], b[0] + b[2] - 1, b[1] + b[3], '#44474c'); });
    // centre dashes (skipped through junctions)
    l.fillStyle = '#e9e6dc'; const near = (v, a) => a.some(q => Math.abs(q - v) < 11);
    VX.forEach(x => { [[30, 382, ZM], [575, 968, ZI]].forEach(s => { for (let z = s[0]; z < s[1]; z += 14) if (!near(z + 3, s[2])) l.fillRect((x - .25) * k, z * k, .5 * k, 6 * k); }); });
    ZM.concat(ZI).forEach(z => { for (let x = 30; x < 970; x += 14) if (!near(x + 3, VX)) l.fillRect(x * k, (z - .25) * k, 6 * k, .5 * k); });
    (MAP3D.bridges || []).forEach(b => { for (let z = b[1]; z < b[1] + b[3]; z += 12) l.fillRect((b[0] + b[2] / 2 - .25) * k, z * k, .5 * k, 5 * k); });
    // zebra crossings
    const zebra = (cx, cz, ax) => { for (let i = -5; i <= 5; i++) { if (ax === 'v') l.fillRect((cx + i * 1.2 - .4) * k, (cz - 9.5) * k, .8 * k, 2.2 * k); else l.fillRect((cx - 9.5) * k, (cz + i * 1.2 - .4) * k, 2.2 * k, .8 * k); } };
    VX.forEach(x => ZM.forEach(z => { zebra(x, z, 'v'); zebra(x, z + 0, 'v'); zebra(x, z, 'h'); }));
    VX.forEach(x => ZI.forEach(z => { zebra(x, z, 'v'); zebra(x, z, 'h'); }));
    l.globalCompositeOperation = 'destination-in'; l.imageSmoothingEnabled = true; l.drawImage(m, 0, 0, PX, PX); l.globalCompositeOperation = 'source-over';
    const fin = document.createElement('canvas'); fin.width = fin.height = PX; const f = fin.getContext('2d'); f.fillStyle = '#1d5a85'; f.fillRect(0, 0, PX, PX); f.drawImage(lay, 0, 0);
    X.groundCv = fin; const tex = new THREE.CanvasTexture(fin); tex.anisotropy = Math.min(8, X.R.capabilities.getMaxAnisotropy()); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    X.groundMat = new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: .1 });
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(SZ, SZ), X.groundMat); gm.rotation.x = -Math.PI / 2; gm.position.set(SZ / 2, 0, SZ / 2); X.scene.add(gm);
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), mat('#1d5a85')); wm.rotation.x = -Math.PI / 2; wm.position.set(SZ / 2, -.35, SZ / 2); X.scene.add(wm); X.water = wm;
    X.roadsList = rd;
  }

  /* ---------------------------------------------------------------- buildings ---------------------------------------------------------------- */
  function windowTextures() {
    const mk = (lit) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d'); x.fillStyle = lit ? '#000' : '#ffffff'; x.fillRect(0, 0, 512, 256);
      for (let r = 0; r < 2; r++) for (let q = 0; q < 4; q++) { const on = lit ? rnd() < lit : false; if (lit) { if (on) { x.fillStyle = rnd() < .5 ? '#ffe9b0' : '#fff6dc'; x.fillRect(q * 128 + 24, r * 128 + 22, 80, 84); } } else { x.fillStyle = '#26364d'; x.fillRect(q * 128 + 24, r * 128 + 22, 80, 84); x.fillStyle = '#ffffff'; x.fillRect(q * 128 + 62, r * 128 + 22, 4, 84); } }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
    };
    X.winMap = mk(0); X.winEm = [mk(.8), mk(.55), mk(.35)];
  }
  function winMat(ci, v) {
    X.wm = X.wm || {}; const k = ci + '-' + v; if (X.wm[k]) return X.wm[k];
    const m = new THREE.MeshLambertMaterial({ color: WALL[ci], map: X.winMap, emissive: '#ffffff', emissiveMap: X.winEm[v], emissiveIntensity: .1 });
    X.winMats.push(m); return X.wm[k] = m;
  }
  function addBuilding(x0, z0, x1, z1, floors, o) {
    o = o || {}; const w = x1 - x0, d = z1 - z0, h = floors * 3.2, ci = o.ci != null ? o.ci : Math.floor(rnd() * WALL.length), v = Math.floor(rnd() * 3);
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const n = f * 4 + i; if (f === 2 || f === 3) uv.setXY(n, .006, .006); else { const sw = (f === 0 || f === 1) ? d : w; uv.setXY(n, uv.getX(n) * sw / 24, uv.getY(n) * floors / 2); } }
    let m = o.color ? new THREE.MeshLambertMaterial({ color: o.color, map: X.winMap, emissive: '#ffffff', emissiveMap: X.winEm[v], emissiveIntensity: .1 }) : winMat(ci, v);
    if (o.color) X.winMats.push(m);
    const b = new THREE.Mesh(geo, m); b.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); X.city.add(b); addRect(x0, z0, x1, z1);
    return b;
  }
  function addSign(b, x0, z0, x1, z1, text) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let dx = 1e9, dz = 1e9, sx = 0, sz = 0;
    VX.forEach(x => { const q = Math.abs(cx - x); if (q < dx) { dx = q; sx = Math.sign(x - cx) || 1; } });
    (cz < 480 ? ZM : ZI).forEach(z => { const q = Math.abs(cz - z); if (q < dz) { dz = q; sz = Math.sign(z - cz) || 1; } });
    const w = Math.min(7.5, (dx < dz ? z1 - z0 : x1 - x0) - 3); if (w < 4) return;
    const p = signPlane(text, w, 1.5, pick(['#9b2d1f', '#1f5f8b', '#2d7a3e', '#7a4aa0', '#b8731a', '#222a3a']));
    if (dx < dz) { p.position.set(sx > 0 ? x1 + .08 : x0 - .08, 3.6, cz); p.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { p.position.set(cx, 3.6, sz > 0 ? z1 + .08 : z0 - .08); p.rotation.y = sz > 0 ? 0 : Math.PI; }
    X.city.add(p);
  }
  function buildCity() {
    X.city = new THREE.Group(); X.scene.add(X.city); windowTextures();
    const COLS = [[30, 90]]; for (let x = 100; x < 900; x += 100) COLS.push([x + 10, x + 90]); COLS.push([910, 970]);
    const ROWS = [[30, 110], [130, 230], [250, 340], [360, 382], [578, 630], [650, 740], [760, 850], [870, 930], [950, 968]];
    const blockAt = (x, z) => { const c = COLS.find(q => x >= q[0] && x <= q[1]), r = ROWS.find(q => z >= q[0] && z <= q[1]); return c && r ? [c[0], r[0], c[1], r[1]] : null; };
    // landmarks first (pins), so the filler buildings keep clear of them
    const marks = [];
    (MAP3D.pins || []).forEach(p => {
      const kind = p[4], dim = LM[kind]; if (!dim || p[5] === 'district' || !Number.isFinite(p[2])) return;
      const bl = blockAt(p[2], p[3]); let x0 = p[2] - dim[0] / 2, z0 = p[3] - dim[1] / 2, x1 = p[2] + dim[0] / 2, z1 = p[3] + dim[1] / 2;
      if (bl) { const sx = Math.max(0, bl[0] + 2 - x0, 0) - Math.max(0, x1 - (bl[2] - 2)), sz = Math.max(0, bl[1] + 2 - z0) - Math.max(0, z1 - (bl[3] - 2)); x0 += sx; x1 += sx; z0 += sz; z1 += sz; }
      if (![[x0, z0], [x1, z0], [x0, z1], [x1, z1]].every(q => X.landAt(q[0], q[1]))) return;
      const fl = Math.max(1, Math.round(dim[2] / 3.2)), b = addBuilding(x0, z0, x1, z1, fl, { color: LMC[kind] || '#ddd' });
      if (kind === 'dome') { const dm = new THREE.Mesh(new THREE.SphereGeometry(Math.min(dim[0], dim[1]) * .38, 18, 10, 0, TAU, 0, Math.PI / 2), mat('#2f6fd8')); dm.position.set(p[2], fl * 3.2, p[3]); X.city.add(dm); }
      if (kind === 'home') { const r = new THREE.Mesh(new THREE.ConeGeometry(dim[0] * .72, 4, 4), mat('#b3392b')); r.rotation.y = Math.PI / 4; r.position.set((x0 + x1) / 2, fl * 3.2 + 2, (z0 + z1) / 2); X.city.add(r); }
      marks.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.max(dim[0], dim[1]) / 2 + 12, pin: p, top: fl * 3.2, x0, z0, x1, z1 });
    });
    X.marks = marks;
    COLS.forEach(c => ROWS.forEach(r => {
      const nx = Math.max(1, Math.round((c[1] - c[0]) / 34)), nz = Math.max(1, Math.round((r[1] - r[0]) / 38));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x0 = c[0] + 2 + (c[1] - c[0] - 4) * i / nx + 1, x1 = c[0] + 2 + (c[1] - c[0] - 4) * (i + 1) / nx - 1, z0 = r[0] + 2 + (r[1] - r[0] - 4) * j / nz + 1, z1 = r[0] + 2 + (r[1] - r[0] - 4) * (j + 1) / nz - 1;
        if (x1 - x0 < 8 || z1 - z0 < 8) continue; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (![[x0, z0], [x1, z0], [x0, z1], [x1, z1]].every(q => X.landAt(q[0], q[1]))) continue;
        if (marks.some(m => Math.hypot(m.x - cx, m.z - cz) < m.r)) continue; if (rnd() < .1) continue;
        const cf = 1 - Math.min(1, Math.hypot(cx - 500, cz - (cz < 480 ? 250 : 800)) / 460), fl = 2 + Math.floor(Math.pow(rnd(), 1.7) * (4 + 9 * cf));
        const b = addBuilding(x0, z0, x1, z1, fl); if (fl <= 5 && rnd() < .85) addSign(b, x0, z0, x1, z1, pick(SIGNS));
      }
    }));
  }

  /* ---------------------------------------------------------------- street furniture ---------------------------------------------------------------- */
  function buildProps() {
    const lamps = [], trees = [], crossZ = (z, a) => a.some(q => Math.abs(q - z) < 13);
    const tryLamp = (x, z, tx, tz) => { if (X.landAt(x, z) && !X.hitAt(x, z, .6)) lamps.push([x, z, tx, tz]); };
    VX.forEach(x => [[40, 380, ZM], [585, 965, ZI]].forEach(s => { for (let z = s[0]; z < s[1]; z += 45) if (!crossZ(z, s[2])) { tryLamp(x - 8.5, z, 1, 0); tryLamp(x + 8.5, z + 22, -1, 0); } }));
    ZM.concat(ZI).forEach(z => { for (let x = 40; x < 965; x += 45) if (!crossZ(x, VX)) { tryLamp(x, z - 8.5, 0, 1); tryLamp(x + 22, z + 8.5, 0, -1); } });
    const n = lamps.length, pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(.11, .15, 7.6, 6), mat('#2b2f36'), n);
    X.lampMat = basic('#ffd9a0'); const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, .2, .45), X.lampMat, n), M4 = new THREE.Matrix4(), pos = [];
    lamps.forEach((l, i) => { M4.makeTranslation(l[0], 3.8, l[1]); pole.setMatrixAt(i, M4); const hx = l[0] + l[2] * .9, hz = l[1] + l[3] * .9; M4.makeRotationY(l[2] ? 0 : Math.PI / 2); M4.setPosition(hx, 7.55, hz); head.setMatrixAt(i, M4); pos.push(hx, 7.3, hz); });
    X.scene.add(pole); X.scene.add(head);
    const hc = document.createElement('canvas'); hc.width = hc.height = 64; const hx = hc.getContext('2d'), gr = hx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(.25, 'rgba(255,190,110,.5)'); gr.addColorStop(1, 'rgba(255,170,80,0)'); hx.fillStyle = gr; hx.fillRect(0, 0, 64, 64);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    X.halo = new THREE.Points(hg, new THREE.PointsMaterial({ size: 22, map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0 })); X.halo.frustumCulled = false; X.scene.add(X.halo);
    // trees along the sidewalk edge
    const tryTree = (x, z) => { if (rnd() < .45 || !X.landAt(x, z) || X.hitAt(x, z, 1.4)) return; trees.push([x + (rnd() - .5) * 2, z + (rnd() - .5) * 2, .8 + rnd() * .7]); };
    VX.forEach(x => [[40, 380, ZM], [585, 965, ZI]].forEach(s => { for (let z = s[0]; z < s[1]; z += 26) if (!crossZ(z, s[2])) { tryTree(x - 11.5, z + 6); tryTree(x + 11.5, z + 18); } }));
    ZM.concat(ZI).forEach(z => { for (let x = 40; x < 965; x += 26) if (!crossZ(x, VX)) { tryTree(x + 6, z - 11.5); tryTree(x + 18, z + 11.5); } });
    const T = trees.length, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .3, 2.8, 6), mat('#4a3320'), T), can = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.1, 0), mat('#ffffff'), T), col = new THREE.Color();
    trees.forEach((t, i) => { M4.makeScale(t[2], t[2], t[2]); M4.setPosition(t[0], 1.4 * t[2], t[1]); trunk.setMatrixAt(i, M4); M4.makeScale(t[2] * 1.1, t[2], t[2] * 1.1); M4.setPosition(t[0], 3.9 * t[2], t[1]); can.setMatrixAt(i, M4); col.set(pick(['#2f5a32', '#3a6b3a', '#27502d', '#4b7a3a', '#2b4f2a'])); can.setColorAt(i, col); });
    X.scene.add(trunk); X.scene.add(can);
    // overhead road-name gantries
    const gantry = (x, z, axis, text) => {
      const gR = new THREE.Group(); const half = axis === 'v' ? 9.5 : 9.5;
      [-1, 1].forEach(s => box(.4, 6.4, .4, '#555b63', axis === 'v' ? x + s * half : x, 3.2, axis === 'v' ? z : z + s * half, gR));
      const p = signPlane(text, 7, 1.7, '#1a6b3c'); p.position.set(x, 6.2, z); if (axis === 'h') p.rotation.y = Math.PI / 2; gR.add(p); X.city.add(gR);
    };
    gantry(500, 612, 'v', 'LAGOS ISLAND'); gantry(700, 760, 'h', 'LEKKI'); gantry(300, 395, 'v', 'MAINLAND'); gantry(800, 125, 'h', 'YABA');
  }

  /* ---------------------------------------------------------------- traffic + NPCs ---------------------------------------------------------------- */
  function roundedLoop(x0, z0, x1, z1, R, cw) {
    const pts = [], arc = (cx, cz, a0, a1) => { const n = Math.max(3, Math.ceil(R * Math.abs(a1 - a0) / 2)); for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); } };
    const seg = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4)); for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]); };
    seg(x0 + R, z0, x1 - R, z0); arc(x1 - R, z0 + R, -Math.PI / 2, 0); seg(x1, z0 + R, x1, z1 - R); arc(x1 - R, z1 - R, 0, Math.PI / 2); seg(x1 - R, z1, x0 + R, z1); arc(x0 + R, z1 - R, Math.PI / 2, Math.PI); seg(x0, z1 - R, x0, z0 + R); arc(x0 + R, z0 + R, Math.PI, Math.PI * 1.5);
    if (!cw) pts.reverse();
    const out = []; let len = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], h = Math.atan2(b[1] - a[1], b[0] - a[0]); out.push({ x: a[0], z: a[1], h, s: len }); len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return { pts: out, len };
  }
  function buildTraffic() {
    const loops = [[100, 120, 900, 350, 10, 6], [100, 640, 900, 940, 10, 6], [200, 750, 800, 860, 10, 3]];
    loops.forEach((L, li) => [true, false].forEach((cw, di) => {
      const off = 3.6, ins = cw ? off : -off, path = roundedLoop(L[0] + ins, L[1] + ins, L[2] - ins, L[3] - ins, Math.max(4, L[4] - ins), cw), n = Math.round(L[5] / 2), sp = 9 + (li + di) % 3 * 1.5;
      for (let i = 0; i < n; i++) {
        const kind = rnd() < .33 ? 'bus' : 'car', car = procVehicle(kind, kind === 'bus' ? '#f2c200' : pick(CAR_COL)); X.scene.add(car);
        X.traffic.push({ obj: car, path, s: path.len * (i + .35 + di * .17) / n, sp, L: car.userData.L });
      }
    }));
  }
  function samplePath(path, s) {
    s = ((s % path.len) + path.len) % path.len; const p = path.pts; let lo = 0, hi = p.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (p[m].s <= s) lo = m; else hi = m - 1; }
    const a = p[lo], b = p[(lo + 1) % p.length], span = Math.hypot(b.x - a.x, b.z - a.z) || 1, t = clamp((s - a.s) / span, 0, 1);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), h: a.h + angDiff(a.h, b.h) * t };
  }
  function spawnNPCs() {
    // walkers on the sidewalks
    for (let i = 0; i < 24; i++) {
      const vert = rnd() < .5, side = rnd() < .5 ? -1 : 1; let line;
      if (vert) { const x = pick(VX), isl = rnd() < .5, seg = isl ? pick([[590, 635], [650, 745], [760, 855], [870, 935]]) : pick([[35, 112], [128, 232], [248, 342]]); line = { vert, c: x + side * 8.5, lo: seg[0], hi: seg[1] }; }
      else { const z = pick(ZM.concat(ZI)), xs = pick(VX), seg = [xs + 14, xs + 86]; line = { vert, c: z + side * 8.5, lo: seg[0], hi: Math.min(seg[1], 960) }; }
      const female = rnd() < .45, key = female ? 'woman' : pick(CHARS_M), P = newPerson(key); X.scene.add(P.holder);
      const n = { P, line, p: line.lo + rnd() * (line.hi - line.lo), dir: rnd() < .5 ? 1 : -1, sp: 1.1 + rnd() * .6, kind: 'walk', x: 0, z: 0, h: 0 }; setAnim(P, 'walk', 1); X.npcs.push(n);
    }
    // workers standing at venues, with a job tag above their head
    (X.marks || []).forEach(m => {
      const w = WORKERS[m.pin[4]]; if (!w || m.pin[5] === 'home') return;
      const count = m.pin[4] === 'shop' ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const P = newPerson(pick(['worker', 'menworker', 'suit', 'woman'])); X.scene.add(P.holder);
        const sp = X.findFree((m.x0 + m.x1) / 2 + (i ? 4 : -3), m.z1 + 3.2, .6), tag = textSprite(w[1] + ' ' + w[0], { h: .36, fg: '#cfe9ff', bg: 'rgba(20,40,60,.7)' }); tag.position.y = 2.15; P.holder.add(tag);
        place(P.holder, sp[0], sp[1], Math.PI / 2 * 1.0 + (i ? .6 : -.6)); setAnim(P, 'work', 1); X.npcs.push({ P, kind: 'work', x: sp[0], z: sp[1], h: Math.PI / 2 });
      }
    });
    // market traders behind stalls near the market pin(s) and wardens at big junctions
    const mk = (MAP3D.pins || []).find(p => /market/i.test(p[0]));
    const stall = (x, z, col, job, em) => {
      const s = new THREE.Group(); box(3.2, .9, 1.4, '#7a5a3a', 0, .45, 0, s); box(3.6, .12, 2, col, 0, 2.5, 0, s); [-1.6, 1.6].forEach(q => box(.1, 2.5, .1, '#444', q, 1.25, .8, s)); s.position.set(x, 0, z); X.city.add(s);
      const P = newPerson(pick(['woman', 'farmer', 'menworker'])); X.scene.add(P.holder); P.holder.position.set(x, 0, z - 1.4); P.holder.rotation.y = 0; const tag = textSprite(em + ' ' + job, { h: .36, fg: '#cfe9ff', bg: 'rgba(20,40,60,.7)' }); tag.position.y = 2.15; P.holder.add(tag); setAnim(P, 'work', 1); X.npcs.push({ P, kind: 'work', x, z: z - 1.4, h: Math.PI / 2 });
    };
    if (mk) [[-14, 16, '#d6455a', 'Trader', '🍅'], [-6, 16, '#2f9e63', 'Trader', '🥬'], [6, 16, '#d9a21b', 'Trader', '🍍'], [14, 16, '#3a7bd5', 'Trader', '🐟']].forEach(a => { const f = X.findFree(mk[2] + a[0], mk[3] + a[1], 1.8); stall(f[0], f[1], a[2], a[3], a[4]); });
    [[300, 240], [700, 750], [500, 350], [500, 860]].forEach(j => { const P = newPerson('swat'); X.scene.add(P.holder); const tag = textSprite('🚦 Traffic warden', { h: .36, fg: '#cfe9ff', bg: 'rgba(20,40,60,.7)' }); tag.position.y = 2.15; P.holder.add(tag); place(P.holder, j[0] + 5, j[1] + 5, 0); setAnim(P, 'work', 1); X.npcs.push({ P, kind: 'work', x: j[0] + 5, z: j[1] + 5, h: 0 }); });
  }

  /* ---------------------------------------------------------------- other players ---------------------------------------------------------------- */
  const stOf = p => p.st || 'idle';
  X.onPlayers = function (list) {
    if (!X.built) return; const seen = new Set(), meId = typeof NET !== 'undefined' && NET.user ? String(NET.user.id || '') : '';
    (list || []).forEach(p => { if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || String(p.id || '') === meId) return; seen.add(String(p.id || p.name)); X.onPos(p, true); });
    for (const k of [...X.others.keys()]) if (!seen.has(k)) removeOther(k);
  };
  X.onPos = function (p, fromList) {
    if (!X.built || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return; const meId = typeof NET !== 'undefined' && NET.user ? String(NET.user.id || '') : ''; if (String(p.id || '') === meId) return;
    const key = String(p.id || p.name); let o = X.others.get(key);
    if (!o) {
      if (X.others.size >= 28) return; const fem = (p.l && p.l.g || p.g) === 'female', gender = fem ? 'female' : 'male';
      const mkey = (p.l && p.l.model && M3D.CHARACTERS.includes(p.l.model)) ? p.l.model : fem ? 'woman' : CHARS_M[hashStr(p.name || key) % CHARS_M.length]; const P = newPerson(mkey, { look: p.l, gender }); X.scene.add(P.holder);
      const tag = textSprite((p.name || 'Player').slice(0, 18), { h: .4 }); tag.position.y = 2.25; P.holder.add(tag);
      o = { key, name: p.name, P, tag, x: p.x, z: p.y, h: p.h || 0, tx: p.x, tz: p.y, th: p.h || 0, st: 'idle', seen: 0, jtag: null, jtxt: '' }; X.others.set(key, o);
    }
    o.name = p.name || o.name; o.tx = p.x; o.tz = p.y; o.th = Number.isFinite(p.h) ? p.h : o.th; o.st = stOf(p); o.v = p.v; o.sp = p.sp || 0; o.seen = performance.now();
    if (Math.hypot(o.tx - o.x, o.tz - o.z) > 120) { o.x = o.tx; o.z = o.tz; }
    const jt = p.st === 'work' && p.job ? '💼 ' + p.job : ''; if (jt !== o.jtxt) { o.jtxt = jt; if (o.jtag) { o.P.holder.remove(o.jtag); o.jtag = null; } if (jt) { o.jtag = textSprite(jt, { h: .34, fg: '#d8ffe3', bg: 'rgba(14,90,50,.82)' }); o.jtag.position.y = 2.65; o.P.holder.add(o.jtag); } }
  };
  function removeOther(k) { const o = X.others.get(k); if (!o) return; X.scene.remove(o.P.holder); if (o.car) X.scene.remove(o.car); X.others.delete(k); }
  function stepOthers(dt, cx, cz) {
    const now = performance.now();
    for (const [k, o] of X.others) {
      if (now - o.seen > 20000) { removeOther(k); continue; }
      const dx = o.tx - o.x, dz = o.tz - o.z, d = Math.hypot(dx, dz), kk = 1 - Math.exp(-dt * 7); o.x += dx * kk; o.z += dz * kk; o.h = turn(o.h, o.th, dt * 9);
      const spd = d * 7, near = Math.hypot(o.x - cx, o.z - cz) < 260, drive = o.st === 'drive' && o.v;
      o.P.holder.visible = near && !drive; if (o.car) o.car.visible = near && !!drive;
      if (drive) {
        if (!o.car && !o.carPending) { o.carPending = true; X.vehicleModel(o.v === 'bicycle' ? 'car' : o.v).then(m => { o.car = m; X.scene.add(m); o.carTag = o.tag; }); }
        if (o.car) { place(o.car, o.x, o.z, o.h); }
        if (o.tag && o.car && o.tag.parent !== o.car) { o.car.add(o.tag); o.tag.position.set(0, 2.4, 0); }
      } else if (o.tag && o.tag.parent !== o.P.holder) { o.P.holder.add(o.tag); o.tag.position.set(0, 2.25, 0); if (o.car) { X.scene.remove(o.car); o.car = null; o.carPending = false; } }
      place(o.P.holder, o.x, o.z, o.h);
      if (!near) continue;
      const nm = o.st === 'work' ? 'work' : o.st === 'dance' ? 'dance' : o.st === 'wave' ? 'wave' : (spd > 2.6 || o.st === 'run') ? 'run' : spd > .35 ? 'walk' : 'idle';
      if (nm !== o.P.pst) setAnim(o.P, nm, nm === 'walk' ? clamp(spd / 1.6, .7, 1.6) : 1);
      stepPerson(o.P, dt);
    }
  }
  function stepNPCs(dt, cx, cz) {
    X.npcs.forEach(n => {
      if (n.kind === 'walk') {
        const L = n.line; n.p += n.dir * n.sp * dt; if (n.p > L.hi) { n.p = L.hi; n.dir = -1; } if (n.p < L.lo) { n.p = L.lo; n.dir = 1; }
        n.x = L.vert ? L.c : n.p; n.z = L.vert ? n.p : L.c; n.h = L.vert ? (n.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (n.dir > 0 ? 0 : Math.PI);
      }
      const near = Math.hypot(n.x - cx, n.z - cz) < 190; n.P.holder.visible = near; if (!near) return;
      if (n.kind === 'walk') place(n.P.holder, n.x, n.z, n.h); stepPerson(n.P, dt);
    });
  }
  function stepTraffic(dt) {
    X.traffic.forEach(t => { t.s += t.sp * dt; const q = samplePath(t.path, t.s); t.x = q.x; t.z = q.z; t.h = q.h; place(t.obj, q.x, q.z, q.h); });
  }

  /* ---------------------------------------------------------------- player ---------------------------------------------------------------- */
  X.gender = () => (typeof S !== 'undefined' && S.gender) || 'male';
  X.look = () => (window.MAP3D && MAP3D.state && MAP3D.state.look) || null;
  function buildMe() {
    const me = X.me, g0 = X.gender(), look = X.look(), key = M3D.charKey(g0, look);
    me.person = newPerson(key, { look, gender: g0 }); X.scene.add(me.person.holder);
    me.tag = textSprite(((typeof NET !== 'undefined' && NET.user && NET.user.displayName) || 'You').slice(0, 18), { h: .4, bg: 'rgba(34,197,94,.82)' }); me.tag.position.y = 2.25; me.person.holder.add(me.tag);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(.55, 14), basic('#000', { transparent: true, opacity: .28, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .03; me.person.holder.add(sh);
  }
  X.setMyVehicle = async function (v) {      // v: one vehicle from /api/ac/transport/state, or null
    if (X.car) { X.scene.remove(X.car.obj); X.car = null; }
    if (!v) return; const kind = ['car', 'motorcycle', 'bus', 'van'].includes(v.kind) ? v.kind : null; if (!kind) return;
    const obj = await X.vehicleModel(kind, v.paintHex || undefined); if (!X.built) return;
    const hp = (MAP3D.pins || []).find(p => p[5] === 'home') || [0, 0, 470, 255], f = X.findFree(hp[2] + 14, hp[3] + 34, 2.4), h = 0;
    X.car = { obj, kind, data: v, x: f[0], z: f[1], h, L: obj.userData && obj.userData.L || 4.3 }; place(obj, f[0], f[1], h); X.scene.add(obj);
    const shd = new THREE.Mesh(new THREE.PlaneGeometry(2.4, X.car.L + .6), basic('#000', { transparent: true, opacity: .3, depthWrite: false })); shd.rotation.x = -Math.PI / 2; shd.position.y = .03; obj.add(shd);
  };
  X.carName = () => (X.car && X.car.data && X.car.data.name) || 'your vehicle';
  X.canDrive = function () {
    const c = X.car; if (!c) return { ok: false, why: '' }; const d = c.data || {};
    if (d.fuel != null && d.fuel <= 0) return { ok: false, why: 'Out of fuel. Fill up in Phone → Transport.' };
    if (d.cond != null && d.cond <= 0) return { ok: false, why: 'Needs a service first. Phone → Transport.' };
    if (typeof TR !== 'undefined' && TR.D && TR.D.licence && !TR.D.licence.ok) return { ok: false, why: 'You need a driving licence first. Phone → Transport → Drive.' };
    return { ok: true };
  };
  X.enterCar = function () {
    const c = X.car, me = X.me; if (!c || me.mode === 'car') return; const ok = X.canDrive(); if (!ok.ok) { if (ok.why && typeof toast === 'function') toast('🚗 ' + ok.why); return; }
    me.mode = 'car'; me.x = c.x; me.z = c.z; me.h = c.h; me.v = 0; me.person.holder.visible = false; X.cam = 'chase'; X.camYaw = c.h; X.audio(); if (X.hud) X.hud.mode();
  };
  X.exitCar = function () {
    const c = X.car, me = X.me; if (!c || me.mode !== 'car') return; me.mode = 'foot'; me.v = 0; c.x = me.x; c.z = me.z; c.h = me.h;
    const rx = -Math.sin(me.h) * 2.6, rz = Math.cos(me.h) * 2.6, f = X.findFree(me.x + rx, me.z + rz, .7); me.x = f[0]; me.z = f[1]; me.person.holder.visible = true; X.camYaw = me.h; if (X.hud) X.hud.mode();
  };
  X.horn = function () { const A = X.A; if (!A || !A.ctx || !X.sfx) return; const t = A.ctx.currentTime; [392, 494].forEach(f => { const o = A.ctx.createOscillator(), gn = A.ctx.createGain(); o.type = 'square'; o.frequency.value = f; gn.gain.setValueAtTime(.05, t); gn.gain.exponentialRampToValueAtTime(.001, t + .4); o.connect(gn); gn.connect(A.ctx.destination); o.start(t); o.stop(t + .42); }); X.hornAt = performance.now(); };
  X.audio = function () {
    if (X.A || !X.sfx) return; try { const ctx = new (window.AudioContext || window.webkitAudioContext)(), o = ctx.createOscillator(), gn = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 380; gn.gain.value = 0; o.connect(f); f.connect(gn); gn.connect(ctx.destination); o.start(); X.A = { ctx, o, g: gn }; } catch (e) { }
  };
  function stepAudio() { const A = X.A; if (!A) return; const on = X.sfx && X.me.mode === 'car' && X.on && !X.paused, sp = Math.abs(X.me.v), t = A.ctx.currentTime; A.g.gain.setTargetAtTime(on ? .035 + sp * .0012 : 0, t, .12); A.o.frequency.setTargetAtTime(46 + sp * 5.2, t, .1); }

  function inputs() {
    const k = X.keys, any = n => n.some(c => k.has(c)); const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (typing) return { f: 0, r: 0, run: false, brake: false, gas: false, rev: false };
    const f = (any(['KeyW', 'ArrowUp']) ? 1 : 0) - (any(['KeyS', 'ArrowDown', 'KeyR']) ? 1 : 0), r = (any(['KeyD', 'ArrowRight']) ? 1 : 0) - (any(['KeyA', 'ArrowLeft']) ? 1 : 0);
    return { f: clamp(f - X.joy.y + X.pedal.gas - X.pedal.brake, -1, 1), r: clamp(r + X.joy.x + X.pedal.steer, -1, 1), run: k.has('ShiftLeft') || k.has('ShiftRight'), brake: k.has('Space'), gas: f > 0 || X.pedal.gas > 0, rev: f < 0 };
  }
  function stepMe(dt) {
    const me = X.me, inp = inputs(), now = performance.now();
    if (me.mode === 'car') {
      const car = X.car, kind = car ? car.kind : 'car', top = kind === 'motorcycle' ? 36 : kind === 'bus' ? 24 : kind === 'van' ? 29 : 40, acc = kind === 'bus' ? 4.2 : 7.2, L = kind === 'bus' ? 5 : 2.7;
      let a = 0; if (inp.gas && !inp.brake) a = acc * (1 - Math.max(0, me.v) / top);
      if (inp.brake) a = -Math.sign(me.v) * 17 * Math.min(1, Math.abs(me.v));
      else if (inp.rev) { a = me.v > .5 ? -16 : -4.5 * (1 + me.v / 8); }
      a -= me.v * .22 + Math.sign(me.v) * .5; if (!inp.gas && !inp.rev && !inp.brake && Math.abs(me.v) < .4) { me.v = 0; a = 0; }
      me.v = clamp(me.v + a * dt, -9, top);
      const maxS = .6 / (1 + Math.abs(me.v) / 11); me.steer = lerp(me.steer, inp.r * maxS, 1 - Math.exp(-dt * 7));
      const nh = me.h + (me.v / L) * Math.tan(me.steer) * dt * 1.0, nx = me.x + Math.cos(nh) * me.v * dt, nz = me.z + Math.sin(nh) * me.v * dt;
      const fx = Math.cos(nh) * 1.7, fz = Math.sin(nh) * 1.7;
      if (X.blocked(nx + fx, nz + fz, .9) || X.blocked(nx - fx, nz - fz, .9) || X.blocked(nx, nz, 1)) { if (Math.abs(me.v) > 6) X.shake = Math.min(1, Math.abs(me.v) / 20); me.v = -me.v * .3; }
      else { me.x = nx; me.z = nz; me.h = nh; }
      for (const t of X.traffic) { if (Math.abs(t.x - me.x) > 6 || Math.abs(t.z - me.z) > 6) continue; if (Math.hypot(t.x - me.x, t.z - me.z) < 3.1) { me.v = -me.v * .35 + (me.v > 0 ? -2 : 2); X.shake = Math.min(1, Math.abs(me.v) / 12 + .3); me.x += (me.x - t.x) * .15; me.z += (me.z - t.z) * .15; } }
      me.st = 'drive'; if (car) { car.x = me.x; car.z = me.z; car.h = me.h; place(car.obj, me.x, me.z, me.h); }
    } else {
      const mv = Math.hypot(inp.f, inp.r); let moving = false, spd = 0;
      if (me.workUntil > now) { me.st = 'work'; X.goalPt = null; }
      else {
        if (me.st === 'work' || (me.st === 'wave' && now > (me.emoteUntil || 0))) me.st = 'idle'; let dx = 0, dz = 0;
        if (mv > .05) { X.goalPt = null; const cy = X.camYaw, fx = Math.cos(cy), fz = Math.sin(cy), rx = -Math.sin(cy), rz = Math.cos(cy); dx = fx * inp.f + rx * inp.r; dz = fz * inp.f + rz * inp.r; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
        else if (X.goalPt) { const gx = X.goalPt[0] - me.x, gz = X.goalPt[1] - me.z, gd = Math.hypot(gx, gz); if (gd < 1) X.goalPt = null; else { dx = gx / gd; dz = gz / gd; } }
        if (dx || dz) {
          const run = inp.run || (X.goalPt && Math.hypot(X.goalPt[0] - me.x, X.goalPt[1] - me.z) > 60); spd = run ? 6.6 : 3.1; moving = true;
          const nx = me.x + dx * spd * dt, nz = me.z + dz * spd * dt;
          if (!X.blocked(nx, nz, .45)) { me.x = nx; me.z = nz; } else if (!X.blocked(nx, me.z, .45)) me.x = nx; else if (!X.blocked(me.x, nz, .45)) me.z = nz; else { X.goalPt = null; moving = false; }
          if (moving) me.h = turn(me.h, Math.atan2(dz, dx), dt * 12);
          me.st = run ? 'run' : 'walk'; me.run = run;
        } else if (me.st === 'walk' || me.st === 'run') me.st = 'idle';
        if (moving) me.emoteUntil = 0;
      }
      const nm = me.st === 'work' ? 'work' : me.st === 'run' ? 'run' : me.st === 'walk' ? 'walk' : (me.st === 'dance' || me.st === 'wave') ? me.st : 'idle';
      if (nm !== me.person.pst) setAnim(me.person, nm, nm === 'walk' ? 1.05 : 1); me.person.holder.visible = true; place(me.person.holder, me.x, me.z, me.h); stepPerson(me.person, dt);
    }
    if (me.x !== me.x || me.z !== me.z) { me.x = 470; me.z = 290; }
  }
  function stepCamera(dt) {
    const me = X.me, cam = X.cam3, car = me.mode === 'car';
    let yaw, pitch, dist, ty = 1.4;
    if (car && X.cam === 'hood') {
      const f = [Math.cos(me.h), Math.sin(me.h)]; cam.position.set(me.x + f[0] * .35, 1.22, me.z + f[1] * .35); cam.lookAt(me.x + f[0] * 30, 1.1, me.z + f[1] * 30); cam.fov = 70; cam.updateProjectionMatrix(); return;
    }
    if (car) { X.camYaw = turn(X.camYaw, me.h + X.orbit, dt * 4.5); yaw = X.camYaw; pitch = .2; dist = 7.4 + Math.abs(me.v) * .05; ty = 1.3; X.orbit *= Math.exp(-dt * .8); }
    else { yaw = X.camYaw; pitch = X.camPitch; dist = X.zoom; }
    const tx = me.x, tz = me.z; let cx, cy, cz, d = dist;
    for (let i = 0; i < 6; i++) { cx = tx - Math.cos(yaw) * Math.cos(pitch) * d; cz = tz - Math.sin(yaw) * Math.cos(pitch) * d; cy = ty + Math.sin(pitch) * d; if (!X.hitAt(cx, cz, .6) || cy > 60) break; d *= .78; }
    if (X.shake > .01) { cx += (Math.random() - .5) * X.shake * .6; cy += (Math.random() - .5) * X.shake * .4; X.shake *= Math.exp(-dt * 7); }
    cam.position.set(cx, Math.max(.5, cy), cz); cam.lookAt(tx, ty, tz);
    const fov = 62 + (car ? clamp(Math.abs(me.v) * .3, 0, 12) : 0); if (Math.abs(cam.fov - fov) > .1) { cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt * 4)); cam.updateProjectionMatrix(); }
  }

  /* ---------------------------------------------------------------- goal beacon, labels ---------------------------------------------------------------- */
  X.setGoal = function (p) {
    if (X.beacon) { X.scene.remove(X.beacon); X.beacon = null; }
    if (!p) { X.goal = null; return; }
    X.goal = { name: p.name, x: p.x, z: p.y != null ? p.y : p.z }; const b = new THREE.Group();
    const cy = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 180, 16, 1, true), basic('#22c55e', { transparent: true, opacity: .28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cy.position.y = 90; b.add(cy);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4, 32), basic('#22c55e', { transparent: true, opacity: .8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .08; b.add(ring);
    b.position.set(X.goal.x, 0, X.goal.z); X.scene.add(b); X.beacon = b; if (typeof toast === 'function') toast('📍 Heading to ' + p.name);
  };
  function buildLabels() {
    X.labels = []; (MAP3D.pins || []).forEach(p => {
      if (p[5] === 'district' || !Number.isFinite(p[2])) return; const m = (X.marks || []).find(q => q.pin === p), nm = String(p[0]).replace(' · Coming soon', '');
      const s = textSprite((p[1] || '') + ' ' + nm, { h: 1.6, fs: 36, bg: p[5] === 'home' ? 'rgba(217,162,27,.9)' : 'rgba(10,26,32,.78)' }); s.position.set(m ? m.x : p[2], (m ? m.top : 6) + 3, m ? m.z : p[3]); s.material.depthTest = false; X.scene.add(s); X.labels.push({ s, pin: p, x: p[2], z: p[3], bw: s.scale.x, bh: s.scale.y });
      if (!m && p[4] !== 'park' && p[4] !== 'boat') return;
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 24), basic(p[5] === 'home' ? '#ffc83d' : '#22c55e', { transparent: true, opacity: .75, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(m ? (m.x0 + m.x1) / 2 : p[2], .09, m ? m.z1 + 3 : p[3]); X.scene.add(ring);
    });
  }
  X.district = function (x, z) {
    let best = null, bd = 130; (MAP3D.pins || []).forEach(p => { if (p[5] === 'district') { const d = Math.hypot(p[2] - x, p[3] - z); if (d < bd) { bd = d; best = p[0]; } } });
    if (best) return best; if (MAP3D.onBridge && MAP3D.onBridge(x, z)) return 'Third Mainland Bridge';
    if (z > 540) return x < 300 ? 'Lagos Island' : x < 560 ? 'Ikoyi' : x < 800 ? 'Victoria Island' : 'Lekki'; return x < 300 ? 'Ikeja' : x < 600 ? 'Surulere' : x < 850 ? 'Yaba' : 'Akoka';
  };

  /* ---------------------------------------------------------------- build + loop ---------------------------------------------------------------- */
  X.build = async function (cv) {
    const R = X.R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' }); R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    X.scene = new THREE.Scene(); X.cam3 = new THREE.PerspectiveCamera(62, 1.6, .3, 2600);
    buildLand(); buildSky(); buildGround(); buildCity(); buildProps(); buildLabels(); buildTraffic(); buildMe(); spawnNPCs();
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(9, 15), basic('#fff3d0', { transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); lp.rotation.order = 'YXZ'; lp.rotation.x = -Math.PI / 2; lp.visible = false;
    const lc = document.createElement('canvas'); lc.width = lc.height = 64; const lx = lc.getContext('2d'), gr = lx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,245,215,.9)'); gr.addColorStop(1, 'rgba(255,245,215,0)'); lx.fillStyle = gr; lx.fillRect(0, 0, 64, 64); lp.material.map = new THREE.CanvasTexture(lc); X.lightPool = lp; X.scene.add(lp);
    X.built = true; X.applyTime();
  };
  X.resize = function () { if (!X.R) return; const el = X.R.domElement.parentNode, w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; X.R.setSize(w, h, false); X.cam3.aspect = w / h; X.cam3.updateProjectionMatrix(); };
  let last = 0, tAcc = 0;
  X.frame = function (t) {
    if (!X.on) return; X.raf = requestAnimationFrame(X.frame);
    if (document.hidden || X.paused) { last = t; return; }
    const dt = Math.min(.05, (t - last) / 1000 || .016); last = t; tAcc += dt;
    stepMe(dt); stepTraffic(dt); stepNPCs(dt, X.me.x, X.me.z); stepOthers(dt, X.me.x, X.me.z); stepCamera(dt); stepAudio();
    const c = X.cam3.position; X.sky.position.copy(c); X.stars.position.copy(c);
    if (tAcc > 2) { tAcc = 0; X.applyTime(); }
    if (X.lightPool) { const on = X.me.mode === 'car' && X.nightF > .25; X.lightPool.visible = on; if (on) { X.lightPool.position.set(X.me.x + Math.cos(X.me.h) * 10, .06, X.me.z + Math.sin(X.me.h) * 10); X.lightPool.rotation.y = -X.me.h - Math.PI / 2; X.lightPool.material.opacity = .5 * X.nightF; } }
    X.labels.forEach(l => { const d = Math.hypot(l.x - X.me.x, l.z - X.me.z); l.s.visible = d < 260; if (l.s.visible) { const k = clamp(d / 28, 1, 5); l.s.scale.set(l.bw * k, l.bh * k, 1); } });
    if (X.beacon) { X.beacon.children[1].rotation.z += dt; if (Math.hypot(X.goal.x - X.me.x, X.goal.z - X.me.z) < 12) { const n = X.goal.name; X.setGoal(null); if (typeof toast === 'function') toast('📍 You have arrived at ' + n); } }
    if (X.hud) X.hud.frame(dt);
    X.R.render(X.scene, X.cam3);
  };
  X.send = function (force) {
    const me = X.me, now = performance.now(); if (!force && now - (X.lastSend || 0) < 100) return;
    const s = typeof NET !== 'undefined' ? NET.sock : null; if (!s) return; const st = me.mode === 'car' ? 'drive' : me.st;
    const key = [me.x.toFixed(1), me.z.toFixed(1), me.h.toFixed(2), st, me.job].join('|'); if (!force && key === X.lastKey && now - X.lastSend < 1500) return; X.lastKey = key; X.lastSend = now;
    const p = { x: +me.x.toFixed(1), y: +me.z.toFixed(1), h: +(((me.h % TAU) + TAU) % TAU).toFixed(3), st }; if (me.mode === 'car' && X.car) { p.v = X.car.kind; p.sp = Math.abs(me.v) * 3.6; } if (st === 'work' && me.job) p.job = me.job;
    try { s.emit('pos', p); } catch (e) { }
  };
})(window);
