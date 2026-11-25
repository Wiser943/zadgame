/* street.js: the social layer of the outside world (WORLD, world3d.js).
   Nearby chat + emotes with speech bubbles, friends that stand out, tap-a-player menu, market places and other hangouts, taxi / bus rides with the
   driving cutscene, traffic lights, and rain on some afternoons. Everything here is drawn on top of WORLD and never changes how it moves. */
(function (g) {
  'use strict';
  const X = g.WORLD; if (!X) return;
  const $ = id => document.getElementById(id), esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), money = n => '₦' + Number(n || 0).toLocaleString('en-NG');
  const ST = g.STREET = { friends: new Map(), hubs: [], open: false, sockOk: null, rain: 0 };
  ST.isFriend = key => ST.friends.has(String(key));
  const EMO = { wave: '👋', laugh: '😂', dance: '💃', abeg: '🙏', hiss: '😤', clap: '👏' };

  /* ------------------------------------------------ friends ------------------------------------------------ */
  ST.loadFriends = async () => { try { const r = await NET.api('/api/ac/friends'); ST.friends = new Map((r.friends || []).map(f => [String(f.id), f])); } catch (e) { } };

  /* ------------------------------------------------ speech bubbles + friend chips (DOM layer, projected each frame) ------------------------------------------------ */
  const bub = new Map();                                  // key ('me' or player key) -> { el, until }
  let layer = null;
  const mkLayer = () => { if (layer && layer.isConnected) return; const w = $('world'); if (!w) return; layer = document.createElement('div'); layer.id = 'wBub'; w.appendChild(layer); };
  const place = (el, x, y, z) => {
    const cam = X.cam3, cv = $('wcv'); if (!cam || !cv) return false; const v = new THREE.Vector3(x, y, z).project(cam);
    if (v.z > 1 || v.z < -1) return false; const w = cv.clientWidth, h = cv.clientHeight, px = (v.x * .5 + .5) * w, py = (-v.y * .5 + .5) * h;
    if (px < -80 || px > w + 80 || py < -40 || py > h + 40) return false; el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-100%)`; return true;
  };
  ST.say = (key, name, text) => {
    mkLayer(); if (!layer) return; let b = bub.get(key); if (!b) { const el = document.createElement('div'); el.className = 'wb'; layer.appendChild(el); b = { el }; bub.set(key, b); }
    b.el.textContent = text; b.el.classList.toggle('me', key === 'me'); b.until = performance.now() + (text.length < 3 ? 3200 : 6500);
    if (g.PLACE && PLACE.el && ST.open) PLACE.chat(key === 'me' ? 'You' : name, text, key === 'me');
  };
  const chips = new Map();
  const updateLayer = now => {
    mkLayer(); if (!layer) return;
    for (const [k, b] of bub) {
      const pos = k === 'me' ? X.me : X.others.get(k); if (!pos || now > b.until) { b.el.remove(); bub.delete(k); continue; }
      b.el.style.display = place(b.el, pos.x, 3.0, pos.z) ? '' : 'none';
    }
    // gold star chips over friends (until you are close enough to read their name tag)
    const seen = new Set();
    X.others.forEach((o, k) => {
      if (!ST.isFriend(k)) return; const d = Math.hypot(o.x - X.me.x, o.z - X.me.z); if (d > 220) return; seen.add(k);
      let c = chips.get(k); if (!c) { const el = document.createElement('div'); el.className = 'wfr'; layer.appendChild(el); c = { el }; chips.set(k, c); }
      c.el.innerHTML = '⭐ ' + esc(o.name) + (d > 30 ? `<small>${Math.round(d)}m</small>` : ''); c.el.style.display = place(c.el, o.x, d > 30 ? 4.2 : 3.5, o.z) ? '' : 'none';
    });
    for (const [k, c] of chips) if (!seen.has(k)) { c.el.remove(); chips.delete(k); }
  };

  /* ------------------------------------------------ socket events ------------------------------------------------ */
  const hook = () => {
    const s = typeof NET !== 'undefined' ? NET.sock : null; if (!s || s.__street) return; s.__street = true;
    s.on('world:said', m => { const mine = typeof NET !== 'undefined' && NET.user && m.id === NET.user.id; ST.say(mine ? 'me' : String(m.id), m.name, m.text); });
    s.on('world:emoted', m => { const o = X.others.get(String(m.id)); if (o) { ST.say(String(m.id), m.name, EMO[m.e] || '👋'); } });
  };
  ST.sendSay = text => { const s = NET.sock; if (s) s.emit('world:say', { text }); else ST.say('me', 'You', text); };
  ST.emote = e => {
    const me = X.me; if (me.mode !== 'foot') { ST.say('me', 'You', EMO[e] || '👋'); } else if (e === 'dance' || e === 'laugh' || e === 'clap') { me.st = 'dance'; setTimeout(() => { if (X.me.st === 'dance') X.me.st = 'idle'; }, 3200); } else { me.st = 'wave'; me.emoteUntil = performance.now() + 2600; }
    ST.say('me', 'You', EMO[e] || '👋'); const s = NET.sock; if (s) s.emit('world:emote', { e });
  };

  /* ------------------------------------------------ market places and hangouts ------------------------------------------------ */
  const HUBS = [
    { id: 'balogun', name: 'Balogun Market', emoji: '🛍️', kind: 'market', x: 550, z: 180, blurb: 'Stalls, bargaining and noise' },
    { id: 'computer', name: 'Computer Village', emoji: '💻', kind: 'tech', x: 350, z: 295, blurb: 'Phones, laptops and gadgets' },
    { id: 'beach', name: 'Lekki Beach Hangout', emoji: '🏖️', kind: 'beach', x: 450, z: 605, blurb: 'Loungers, palms and sea breeze' },
    { id: 'suya', name: 'Suya & Food Court', emoji: '🍢', kind: 'food', x: 350, z: 695, blurb: 'Grills, tables and string lights' },
    { id: 'carmeet', name: 'Car Meet Park', emoji: '🏎️', kind: 'cars', x: 850, z: 700, blurb: 'Show your ride' },
    { id: 'dance', name: 'Dance Square', emoji: '💃', kind: 'stage', x: 560, z: 700, blurb: 'A stage, speakers and lights' }
  ];
  const mat = c => new THREE.MeshLambertMaterial({ color: c }), basic = c => new THREE.MeshBasicMaterial({ color: c });
  const box = (p, w, h, d, c, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat(c)); o.position.set(x, y, z); p.add(o); return o; };
  const cyl = (p, r, h, c, x, y, z, seg, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 12), m || mat(c)); o.position.set(x, y, z); p.add(o); return o; };
  const cone = (p, r, h, c, x, y, z, seg) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 8), mat(c)); o.position.set(x, y, z); p.add(o); return o; };
  const sign = (p, text, y) => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const c = cv.getContext('2d'); c.fillStyle = 'rgba(20,24,44,.88)'; c.fillRect(0, 0, 512, 128); c.strokeStyle = '#f5c518'; c.lineWidth = 8; c.strokeRect(6, 6, 500, 116); c.fillStyle = '#fff'; c.font = '800 54px Outfit,system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 68, 480); const t = new THREE.CanvasTexture(cv), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(14, 3.5, 1); s.position.y = y; s.renderOrder = 9; p.add(s); };
  const AWN = [0xd9433b, 0x2d6fb5, 0xf2b705, 0x2f9e5e, 0x8e5bb8, 0xe8762c];
  const BUILD = {
    market(p) { box(p, 38, .12, 30, 0xc9b78d, 0, .06, 0); for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) { const x = -14 + k * 5.6, z = r ? 7 : -7, aw = AWN[(k + r) % 6]; box(p, 3.4, .9, 1.6, 0x8a6a45, x, .5, z); for (const sx of [-1.6, 1.6]) box(p, .12, 2.4, .12, 0x5a3f27, x + sx, 1.2, z - .7); const t = box(p, 4, .1, 2.6, aw, x, 2.5, z - .1); t.rotation.x = .18; for (let q = 0; q < 4; q++) box(p, .6, .5, .5, [0xe74c3c, 0xf1c40f, 0x27ae60, 0xecf0f1][q], x - 1.2 + q * .8, 1.2, z); } for (let k = 0; k < 14; k++) box(p, .5, .5, .05, AWN[k % 6], -17 + k * 2.6, 4.6, 0); sign(p, 'BALOGUN MARKET', 9); },
    tech(p) { box(p, 34, .12, 26, 0xb9bcc2, 0, .06, 0); for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) { const x = -12 + k * 6, z = -8 + r * 8; box(p, 4.6, 2.6, 3, 0xe9ecf2, x, 1.3, z); box(p, 3.4, 1.1, .1, 0x6ec9ff, x, 1.7, z + 1.55, basic(0x6ec9ff)); box(p, 4.8, .2, 3.2, [0x2d6fb5, 0xd9433b, 0xf2b705][r], x, 2.7, z); } sign(p, 'COMPUTER VILLAGE', 8); },
    beach(p) { cyl(p, 25, .12, 0xe8d6a2, 0, .06, 0, 36); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28, x = Math.cos(a) * 12, z = Math.sin(a) * 12; box(p, .9, .25, 2.2, 0xf4f4f6, x, .35, z).rotation.y = -a; } for (let k = 0; k < 4; k++) { const a = k / 4 * 6.28 + .4, x = Math.cos(a) * 7, z = Math.sin(a) * 7; cyl(p, .08, 3.2, 0x777777, x, 1.6, z, 6); cone(p, 2.4, .9, AWN[k], x, 3.3, z, 10); } for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28, x = Math.cos(a) * 19, z = Math.sin(a) * 19; cyl(p, .25, 5.5, 0x6b4a2a, x, 2.75, z, 6); for (let q = 0; q < 6; q++) { const l = cone(p, .5, 3.4, 0x2f8f4f, x + Math.cos(q) * 1.2, 5.6, z + Math.sin(q) * 1.2, 4); l.rotation.z = Math.cos(q) * 1.1; l.rotation.x = Math.sin(q) * 1.1; } } sign(p, 'LEKKI BEACH', 8); },
    food(p) { box(p, 34, .12, 26, 0xa9a28f, 0, .06, 0); for (let k = 0; k < 6; k++) { const x = -12 + (k % 3) * 11, z = k < 3 ? -7 : 7; box(p, 2.6, .9, 1.4, 0x25262b, x, .5, z); box(p, 1.8, .3, .9, 0xff7a1a, x, 1.05, z, basic(0xff7a1a)); cyl(p, .06, 2.8, 0x555555, x, 1.4, z + 1.8, 6); cone(p, 1.8, .6, AWN[k], x, 2.9, z + 1.8, 8); box(p, 1.4, .1, 1.4, 0xf0f0f0, x, .8, z + 1.8); } for (let k = 0; k < 16; k++) { const m = basic(0xffe9a0); const b = new THREE.Mesh(new THREE.SphereGeometry(.14, 6, 5), m); b.position.set(-16 + k * 2.1, 4.2 + Math.sin(k) * .15, 0); p.add(b); } sign(p, 'SUYA & FOOD COURT', 8); },
    cars(p) { box(p, 40, .12, 30, 0x3a3d46, 0, .06, 0); for (let k = 0; k <= 8; k++) box(p, .15, .02, 5.5, 0xeeeeee, -16 + k * 4, .14, -8); for (let k = 0; k <= 8; k++) box(p, .15, .02, 5.5, 0xeeeeee, -16 + k * 4, .14, 8); const cols = [0xd4383d, 0x2d6fb5, 0xf2f3f5, 0x1c1d21, 0xf2b705, 0x2f9e5e, 0x8e5bb8, 0xe8762c]; for (let k = 0; k < 8; k++) { const x = -14 + k * 4, z = k % 2 ? 8 : -8; box(p, 1.8, .6, 4, cols[k], x, .6, z); box(p, 1.5, .55, 2.1, cols[k], x, 1.15, z - .1); box(p, 1.52, .3, 1.9, 0x1a2530, x, 1.15, z - .1); for (const sx of [-.85, .85]) for (const sz of [-1.3, 1.3]) cyl(p, .34, .26, 0x111111, x + sx, .34, z + sz, 10).rotation.z = Math.PI / 2; } for (const sx of [-18, 18]) { cyl(p, .1, 5, 0x555555, sx, 2.5, 0, 6); box(p, 1.2, .6, 1.2, 0xfff2b0, sx, 5.2, 0, basic(0xfff2b0)); } sign(p, 'CAR MEET PARK', 8); },
    stage(p) { cyl(p, 11, .3, 0x2a2438, 0, .15, 0, 28); for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28; box(p, 2.4, .05, 2.4, [0xff3b6b, 0x3bb4ff, 0xf5c518, 0x3bff8f][k % 4], Math.cos(a) * 14, .08, Math.sin(a) * 14, basic([0xff3b6b, 0x3bb4ff, 0xf5c518, 0x3bff8f][k % 4])); } for (const sx of [-8, 8]) { box(p, 2, 3.5, 2, 0x15161a, sx, 2, -6); cyl(p, .6, .2, 0x444444, sx, 2.4, -4.95, 12).rotation.x = Math.PI / 2; } for (const sx of [-9, 9]) box(p, .5, 8, .5, 0x333640, sx, 4, -8); box(p, 19, .5, .5, 0x333640, 0, 8, -8); for (let k = 0; k < 14; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.18, 6, 5), basic([0xff3b6b, 0x3bb4ff, 0xf5c518, 0x3bff8f][k % 4])); b.position.set(-9 + k * 1.4, 7.7, -8); p.add(b); } sign(p, 'DANCE SQUARE', 11); }
  };
  const findSpot = (x, z) => { for (let r = 0; r <= 90; r += 6) for (let a = 0; a < (r ? 12 : 1); a++) { const t = a / 12 * 6.28, px = x + Math.cos(t) * r, pz = z + Math.sin(t) * r; let ok = 0; for (const [dx, dz] of [[0, 0], [14, 0], [-14, 0], [0, 12], [0, -12]]) if (!X.blocked(px + dx, pz + dz, 3)) ok++; if (ok >= 5) return [px, pz]; } return [x, z]; };
  const buildHubs = () => {
    if (ST.hubs.length || !X.scene) return; const THREE_ = g.THREE; if (!THREE_) return;
    HUBS.forEach(h => { const grp = new THREE.Group(), [px, pz] = findSpot(h.x, h.z); grp.position.set(px, 0, pz); try { BUILD[h.kind](grp); } catch (e) { console.warn('hub failed', h.id, e); } grp.visible = false; X.scene.add(grp); ST.hubs.push({ ...h, x: px, z: pz, group: grp }); });
  };
  const cullHubs = () => ST.hubs.forEach(h => { h.group.visible = Math.hypot(h.x - X.me.x, h.z - X.me.z) < 300; });

  /* ------------------------------------------------ traffic lights (junction poles, cycling red / amber / green) ------------------------------------------------ */
  const VX = [100, 200, 300, 400, 500, 600, 700, 800, 900], ZR = [120, 240, 350, 640, 750, 860, 940];
  let tl = null;
  const buildLights = () => {
    if (tl || !X.scene) return; const n = VX.length * ZR.length * 2, poles = new THREE.InstancedMesh(new THREE.BoxGeometry(.25, 5, .25), mat(0x2a2c33), n), heads = new THREE.InstancedMesh(new THREE.BoxGeometry(.7, 1.5, .7), new THREE.MeshBasicMaterial({ color: 0xffffff }), n), M = new THREE.Matrix4(); let i = 0; const meta = [];
    VX.forEach((vx, a) => ZR.forEach((zr, b) => { for (const [dx, dz, axis] of [[8, -8, 'ns'], [-8, 8, 'ew']]) { M.makeTranslation(vx + dx, 2.5, zr + dz); poles.setMatrixAt(i, M); M.makeTranslation(vx + dx, 5.4, zr + dz); heads.setMatrixAt(i, M); heads.setColorAt(i, new THREE.Color(0x22cc55)); meta.push({ x: vx + dx, z: zr + dz, axis, off: (a * 7 + b * 5) % 24 }); i++; } }));
    poles.count = heads.count = i; poles.frustumCulled = heads.frustumCulled = false; X.scene.add(poles, heads); tl = { poles, heads, meta, last: -1 };
  };
  const lightColor = (m, t) => { const ph = ((t + m.off) % 24 + 24) % 24, ns = ph < 10 ? 'g' : ph < 12 ? 'a' : 'r', ew = ph >= 12 && ph < 22 ? 'g' : ph >= 22 ? 'a' : 'r', s = m.axis === 'ns' ? ns : ew; return s === 'g' ? 0x22cc55 : s === 'a' ? 0xffb000 : 0xff3030; };
  const updateLights = () => { if (!tl) return; const t = Math.floor(Date.now() / 1000); if (t === tl.last) return; tl.last = t; const c = new THREE.Color(); tl.meta.forEach((m, i) => { c.setHex(lightColor(m, t)); tl.heads.setColorAt(i, c); }); if (tl.heads.instanceColor) tl.heads.instanceColor.needsUpdate = true; };

  /* ------------------------------------------------ rain: some afternoons and evenings (decided from the Lagos date + hour) ------------------------------------------------ */
  const rainTarget = () => { try { const m = (typeof PREFX !== 'undefined' && PREFX.lagosMin) ? PREFX.lagosMin() : 720, h = m / 60, d = new Date(), k = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate(), r = Math.sin(k * 78.233) * 43758.5453, f = r - Math.floor(r); return f < .3 && h >= 14 && h < 19.5 ? 1 : f > .86 && h >= 19.5 && h < 23 ? .7 : 0; } catch (e) { return 0; } };
  let rainCv = null, rainDrops = null;
  const drawRain = dt => {
    const want = rainTarget(); ST.rain += (want - ST.rain) * Math.min(1, dt * .4); const w = $('world');
    if (ST.rain < .03) { if (rainCv) { rainCv.remove(); rainCv = null; } if (w) w.classList.remove('wrain'); return; }
    if (!rainCv && w) { rainCv = document.createElement('canvas'); rainCv.id = 'wRain'; w.appendChild(rainCv); rainDrops = Array.from({ length: 140 }, () => [Math.random(), Math.random(), .6 + Math.random() * .8]); w.classList.add('wrain'); }
    if (!rainCv) return; const W = rainCv.clientWidth, H = rainCv.clientHeight; if (rainCv.width !== W || rainCv.height !== H) { rainCv.width = W; rainCv.height = H; }
    const c = rainCv.getContext('2d'); c.clearRect(0, 0, W, H); c.strokeStyle = `rgba(200,215,235,${.45 * ST.rain})`; c.lineWidth = 1.4; c.beginPath();
    const n = Math.floor(rainDrops.length * ST.rain); for (let i = 0; i < n; i++) { const d = rainDrops[i]; d[1] += dt * d[2] * 1.4; d[0] -= dt * .12; if (d[1] > 1) { d[1] = -.05; d[0] = Math.random() * 1.2; } const x = d[0] * W, y = d[1] * H; c.moveTo(x, y); c.lineTo(x - 5, y + 18 * d[2]); } c.stroke();
  };

  /* ------------------------------------------------ panel: nearby chat, emotes, hubs, friends, taxi ------------------------------------------------ */
  const nearbyCount = () => { let n = 0; X.others.forEach(o => { if (Math.hypot(o.x - X.me.x, o.z - X.me.z) < 70) n++; }); return n; };
  const nearestHub = () => { let best = null, bd = 1e9; ST.hubs.forEach(h => { const d = Math.hypot(h.x - X.me.x, h.z - X.me.z); if (d < bd) { bd = d; best = h; } }); return best && bd < 32 ? best : null; };
  const spots = () => ST.hubs.map(h => ({ label: h.emoji + ' ' + h.name, badge: Math.round(Math.hypot(h.x - X.me.x, h.z - X.me.z)) + 'm', go: () => ST.hubSheet(h) })).sort((a, b) => parseInt(a.badge) - parseInt(b.badge));
  const frCount = () => { let n = 0; X.others.forEach((o, k) => { if (ST.isFriend(k)) n++; }); return n; };
  const cfg = () => { const hb = nearestHub(), n = nearbyCount(), fr = frCount(); return { icon: hb ? hb.emoji : '🌍', name: hb ? hb.name : 'Out and about', sub: `${n} ${n === 1 ? 'person' : 'people'} nearby${fr ? ' · ⭐ ' + fr + ' friend' + (fr === 1 ? '' : 's') : ''}`, count: n, placeholder: n ? `Say something to the ${n} near you...` : 'Say something...', spots: spots() }; };
  ST.panel = () => {
    if (!g.PLACE) return; if (ST.open) { PLACE.hide(); ST.open = false; return; }
    ST.open = true; PLACE.show({ host: $('world'), ...cfg(), actions: [{ id: 'taxi', label: 'Taxi', icon: '🚕', kind: 'primary', on: () => ST.rideSheet() }, { id: 'fr', label: 'Friends', icon: '⭐', kind: 'ghost', on: () => ST.friendsSheet() }], onSay: t => ST.sendSay(t), onEmote: e => ST.emote(e) });
  };
  const tickPanel = () => { if (ST.open && g.PLACE && PLACE.el) PLACE.patch(cfg()); else if (ST.open) ST.open = false; };

  /* ---- sheets (uses the shared SHEET dialog) ---- */
  const dist = (x, z) => Math.hypot(x - X.me.x, z - X.me.z);
  ST.hubSheet = h => SHEET.open({ id: 'whub', title: h.emoji + ' ' + h.name, body: () => `<p class="lgnote">${esc(h.blurb)} · ${Math.round(dist(h.x, h.z))} m away</p><div class="lgq"><span class="lgi">🧭</span><div><b>Show me the way</b><small>Puts a marker on your map and minimap</small></div><button class="lgbtn" onclick="STREET.goal('${h.id}')">Go</button></div><div class="lgq"><span class="lgi">🚕</span><div><b>Take a taxi</b><small>Quick and comfortable</small></div><button class="lgbtn" onclick="STREET.ride('${h.id}','taxi')">Taxi</button></div><div class="lgq"><span class="lgi">🚌</span><div><b>Take a bus</b><small>Cheaper, a bit slower</small></div><button class="lgbtn" onclick="STREET.ride('${h.id}','bus')">Bus</button></div>` });
  ST.goal = id => { const h = ST.hubs.find(x => x.id === id); if (h) { SHEET.close(); X.setGoal({ name: h.name, x: h.x, z: h.z }); } };
  ST.rideSheet = () => {
    const home = (typeof MAP3D !== 'undefined' && MAP3D.homePin && MAP3D.homePin()) || null;
    const rows = ST.hubs.map(h => ({ id: h.id, n: h.emoji + ' ' + h.name, d: dist(h.x, h.z) })); if (home) rows.unshift({ id: 'home', n: '🏠 Home', d: dist(home[2], home[3]) });
    SHEET.open({ id: 'wride', title: '🚕 Where to?', body: () => `<p class="lgnote">A taxi is quick. A bus is cheaper but slower. The fare depends on the distance.</p>` + rows.sort((a, b) => a.d - b.d).map(r => { const f = fareOf(r.d); return `<div class="lgq"><span class="lgi">📍</span><div><b>${esc(r.n)}</b><small>${Math.round(r.d)} m · taxi ${money(f.taxi)} · bus ${money(f.bus)}</small></div><button class="lgbtn" onclick="STREET.ride('${r.id}','taxi')">🚕</button><button class="lgbtn ghost" onclick="STREET.ride('${r.id}','bus')">🚌</button></div>`; }).join('') });
  };
  const fareOf = d => { const taxi = Math.min(8000, Math.max(300, Math.round(d * 1.6 / 50) * 50)); return { taxi, bus: Math.max(150, Math.round(taxi * .4 / 50) * 50) }; };
  ST.ride = async (id, mode) => {
    const home = id === 'home', h = ST.hubs.find(x => x.id === id), hp = home && (typeof MAP3D !== 'undefined' && MAP3D.homePin && MAP3D.homePin());
    const tx = home ? (hp ? hp[2] : X.me.x) : h.x, tz = home ? (hp ? hp[3] : X.me.z) : h.z, d = dist(tx, tz);
    if (d < 25) { toast('You are already here'); return; }
    if (g.WORKFLOW && home && WORKFLOW.onShift()) { toast("Can't get home. You are still at work."); return; }
    try { const r = await NET.api('/api/ac/street/ride', { method: 'POST', body: { mode, dist: d } }); try { SHEET.close(); } catch (e) { } if (r.cash != null) { try { S.cash = r.cash; const t = typeof fmtBal === 'function' ? fmtBal(S.cash) : null; if (t) ['bal', 'bal2', 'v2bal'].forEach(i => { const e = $(i); if (e) e.textContent = t; }); } catch (e) { } }
      toast('🚕 -' + money(r.fare)); if (ST.open) { PLACE.hide(); ST.open = false; }
      await COMMUTE.play({ mode, title: mode === 'bus' ? 'On the bus…' : 'In the taxi…', sub: 'To ' + (home ? 'Home' : h.name) });
      if (home) { try { X.exit(true); } catch (e) { } nav('home'); } else { const [px, pz] = findSpot(tx + 12, tz); X.me.x = px; X.me.z = pz; X.goalPt = null; X.me.st = 'idle'; }
    } catch (e) { toast(e.message || 'Could not take the ride'); }
  };
  ST.friendsSheet = () => SHEET.open({ id: 'wfr', title: '⭐ Friends', body: () => {
    const list = [...ST.friends.values()]; if (!list.length) return '<p class="empty">No friends yet. Tap a player in the street and add them.</p>';
    return list.map(f => { const o = X.others.get(String(f.id)), here = !!o; return `<div class="lgq"><span class="lgi">${here ? '🟢' : f.online ? '🟡' : '⚪'}</span><div><b>${esc(f.displayName || f.username)}</b><small>${here ? Math.round(dist(o.x, o.z)) + ' m away' : f.online ? 'Online, somewhere else' : 'Offline'}</small></div>${here ? `<button class="lgbtn" onclick="STREET.findFriend('${esc(f.id)}')">Find</button>` : ''}</div>`; }).join(''); } });
  ST.findFriend = id => { const o = X.others.get(String(id)); if (!o) return; SHEET.close(); X.setGoal({ name: o.name, x: o.x, z: o.z }); };

  /* ---- tap a player ---- */
  ST.playerSheet = key => { const o = X.others.get(key); if (!o) return; const fr = ST.isFriend(key), f = ST.friends.get(key);
    SHEET.open({ id: 'wplayer', title: (fr ? '⭐ ' : '') + o.name, body: () => `<p class="lgnote">${Math.round(dist(o.x, o.z))} m away${fr ? ' · your friend' : ''}</p>
      <div class="lgq"><span class="lgi">👋</span><div><b>Wave</b><small>Say hi</small></div><button class="lgbtn" onclick="STREET.emote('wave');SHEET.close()">Wave</button></div>
      ${fr ? `<div class="lgq"><span class="lgi">🏠</span><div><b>Visit their home</b><small>Only works while they are online</small></div><button class="lgbtn" onclick="STREET.visit('${esc(key)}')">Visit</button></div><div class="lgq"><span class="lgi">💬</span><div><b>Message</b><small>Open your chat</small></div><button class="lgbtn" onclick="STREET.chat('${esc(key)}')">Chat</button></div>` : `<div class="lgq"><span class="lgi">➕</span><div><b>Add friend</b><small>Send a friend request</small></div><button class="lgbtn" onclick="STREET.addFriend('${esc(key)}')">Add</button></div>`}
      <div class="lgq"><span class="lgi">💸</span><div><b>Send money</b><small>Pay ${esc(o.name)} from your wallet</small></div><button class="lgbtn" onclick="STREET.pay('${esc(key)}')">Pay</button></div>` }); };
  ST.addFriend = async key => { try { await NET.api('/api/ac/friends/' + encodeURIComponent(key) + '/request', { method: 'POST' }); SHEET.close(); toast('Friend request sent 🎉'); ST.loadFriends(); } catch (e) { toast(e.message || 'Could not send the request'); } };
  ST.visit = async key => { try { const r = await NET.api('/api/ac/visit/' + encodeURIComponent(key)); SHEET.close(); X.exit(true); nav('home'); setTimeout(() => { try { openVisit(r.host); } catch (e) { } }, 500); } catch (e) { toast(e.message || 'Could not visit'); } };
  ST.chat = key => { SHEET.close(); X.exit(true); nav('phone'); setTimeout(() => { try { PH.chat(key); } catch (e) { PH.open('messages'); } }, 120); };
  ST.pay = key => { const o = X.others.get(key); SHEET.close(); X.exit(true); nav('phone'); setTimeout(() => { try { PH.open('bank'); BANK.payUser(key, '', ''); } catch (e) { toast('Open Pay from your phone'); } }, 150); void o; };

  let down = null;
  const wirePointer = () => {
    const w = $('world'); if (!w || w.__stp) return; w.__stp = true;
    w.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; }, true);
    w.addEventListener('pointerup', e => {
      if (!down || performance.now() - down.t > 380 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return; const cv = $('wcv'); if (!cv || !e.target.closest || e.target.closest('button,#wRc,.plc,#wBub .wb')) return;
      const r = cv.getBoundingClientRect(), cam = X.cam3; let best = null, bd = 46;
      X.others.forEach((o, k) => { const v = new THREE.Vector3(o.x, 1.1, o.z).project(cam); if (v.z > 1) return; const px = r.left + (v.x * .5 + .5) * r.width, py = r.top + (-v.y * .5 + .5) * r.height, d = Math.hypot(px - e.clientX, py - e.clientY); if (d < bd) { bd = d; best = k; } });
      if (best) { e.stopImmediatePropagation(); e.preventDefault(); ST.playerSheet(best); }
    }, true);
  };

  /* ------------------------------------------------ the little buttons + main loop ------------------------------------------------ */
  const mkButtons = () => { const w = $('world'); if (!w || $('wSocial')) return; const b = document.createElement('button'); b.id = 'wSocial'; b.type = 'button'; b.setAttribute('aria-label', 'Nearby chat, friends and taxi'); b.innerHTML = '<span>💬</span><i id="wSocN"></i>'; b.onclick = () => ST.panel(); w.appendChild(b); };
  let last = performance.now(), slow = 0, was = false;
  const loop = now => {
    requestAnimationFrame(loop); const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (!X.on) { if (was) { was = false; if (ST.open) { try { PLACE.hide(); } catch (e) { } ST.open = false; } } return; }
    if (!was) { was = true; mkButtons(); wirePointer(); hook(); ST.loadFriends(); buildHubs(); buildLights(); }
    updateLayer(now); drawRain(dt); updateLights(); slow += dt;
    if (slow > 1) { slow = 0; cullHubs(); tickPanel(); hook(); const n = $('wSocN'); if (n) { const c = nearbyCount(); n.textContent = c ? c : ''; n.style.display = c ? '' : 'none'; } }
  };
  requestAnimationFrame(loop);
})(window);
