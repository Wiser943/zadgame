/* 3D house (Three.js). Drag to rotate, pinch / wheel to zoom, tap the floor to walk, tap the cooler to eat.
   Walls that face the camera fade out so you can always see inside. Falls back to the flat SVG room if WebGL or the library is unavailable. */
window.ROOM3D = {
  on: false, loading: false, T: null, az: Math.PI / 4, pol: 0.95, dist: 30, d0: 30, tAz: null, W: 0, H: 0, shiftY: 0, dark_: false, page_: 'home',
  walls: [], extras: null, avatar: null, goal: null, ptr: new Map(), pinch: 0, drag: false, down: null, last: 0,
  load() {
    return new Promise((ok, no) => {
      if (window.THREE) return ok();
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s)
    })
  },
  async init() {
    if (this.on || this.loading) return; this.loading = true;
    try {
      const probe = document.createElement('canvas'); if (!(probe.getContext('webgl') || probe.getContext('experimental-webgl'))) throw 0;
      await this.load(); this.build(); this.on = true; document.getElementById('app').classList.add('r3d');
      this.page(S.page || 'home'); this.paint(S.paint); this.sync(); this.dark(!BAN.light); requestAnimationFrame(t => this.loop(t))
    } catch (e) { console.warn('3D room unavailable, using flat room', e) }
    this.loading = false
  },
  mat(c, o) { return new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {})) },
  box(w, h, d, c, x, y, z, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'object' ? c : this.mat(c)); m.position.set(x, y, z); (parent || this.scene).add(m); return m },
  cyl(r, h, c, x, y, z, parent, seg) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 20), this.mat(c)); m.position.set(x, y, z); (parent || this.scene).add(m); return m },
  build() {
    const cv = this.cv = document.createElement('canvas'); cv.id = 'room3d'; const app = document.getElementById('app'); app.insertBefore(cv, document.getElementById('hud'));
    const R = this.R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); R.setPixelRatio(isSaver() ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    const sc = this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(30, 1, 1, 200);
    this.amb = new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.62); sc.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 0.5); this.sun.position.set(6, 12, 8); sc.add(this.sun);
    // ground + slab
    this.ground = this.cyl(10, 0.3, 0x93a05a, 0, -0.45, 0, null, 48).material; this.box(6.5, 0.3, 6.5, 0xc9a56b, 0, -0.15, 0);
    // checker floor
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#a8693a'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#c58a52'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(3, 3); tx.anisotropy = 8;
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ map: tx })); this.floor.rotation.x = -Math.PI / 2; sc.add(this.floor);
    // four walls (the ones facing the camera fade away)
    const W = (w, h, d, x, z, out) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: S.paint, transparent: true })); m.position.set(x, h / 2, z); sc.add(m); this.walls.push({ m, out }); return m };
    this.wW = W(.15, 3, 6.15, -3.075, 0, [-1, 0]); this.wN = W(6.15, 3, .15, 0, -3.075, [0, -1]); W(.15, 3, 6.15, 3.075, 0, [1, 0]); W(6.15, 3, .15, 0, 3.075, [0, 1]);
    // door + poster + lamp on the west wall, window + AC + lamp on the north wall
    this.box(.12, 2.1, 1.1, 0x5a2c14, -2.95, 1.05, 1.6); this.box(.1, .9, .7, 0xf2f2f2, -2.97, 1.8, -1.5);
    this.box(1.5, 1.0, .12, 0x80868a, 1.6, 1.7, -2.94); this.walls.glass = this.box(1.3, .8, .1, 0xbfe4ff, 1.6, 1.7, -2.9).material; Object.assign(this.walls.glass, { transparent: true, opacity: .7 }); this.box(1.3, .08, .12, 0x555a5c, 1.6, 1.7, -2.88);
    this.box(1.1, .4, .35, 0xf1f1f1, -0.6, 2.4, -2.8);
    this.glass = this.walls.glass;
    this.moon = new THREE.DirectionalLight(0x7f9bff, 0); this.moon.position.set(-6, 10, -4); sc.add(this.moon); this.lamps = [];
    // furniture
    this.bed = new THREE.Group(); sc.add(this.bed);
    this.table = new THREE.Group(); sc.add(this.table);
    this.box(1.5, .1, .9, 0xd2b48c, 0.4, .9, -2.3, this.table); [[-.3, -2.65], [1.1, -2.65], [-.3, -1.95], [1.1, -1.95]].forEach(p => this.box(.1, .85, .1, 0xc4a57a, p[0], .45, p[1], this.table)); this.cyl(.22, .4, 0x2f4a2f, 0.4, 1.15, -2.3, this.table);
    this.cooler = new THREE.Group(); sc.add(this.cooler); this.cooler.userData.eat = true;
    this.box(1.1, .75, .8, 0x2d6dd8, 2.3, .38, -1.2, this.cooler); this.box(1.14, .1, .84, 0x1d4a99, 2.3, .8, -1.2, this.cooler);
    this.box(.9, .06, .9, 0xd0243a, -.2, .55, .6); [[-.6, .2], [.2, .2], [-.6, 1], [.2, 1]].forEach(p => this.box(.07, .55, .07, 0xa01a2b, p[0], .27, p[1])); this.box(.9, .9, .08, 0xd0243a, -.2, 1.0, .2);       // red chair
    this.box(1.1, .55, 1.0, 0xe0c25a, 1.0, .3, .9); this.box(1.1, .6, .25, 0xd9b24a, 1.0, .7, 1.35);                                                  // armchair
    this.cyl(.55, 1.1, 0x1f4aa0, 2.1, .55, 2.1); this.cyl(.55, .08, 0x2a5cc0, 2.1, 1.12, 2.1); this.cyl(.28, .34, 0x2f6fd8, .7, .17, 2.5); this.cyl(.3, .06, 0xd0243a, 1.5, .03, 2.6);   // barrel, buckets
    this.box(.8, .45, .55, 0xcfd4dc, -1.8, .22, 2.4); this.box(.8, .6, .2, 0xcfd4dc, -1.8, .75, 2.65);                                                    // toilet
    // avatar: detailed character with a face, hair, clothes and swinging limbs
    const M = (c) => this.mat(c), SK = 0x6e4529, SKD = 0x5a3720, SH = 0xe2b64a, av = this.avatar = new THREE.Group(), P = this.parts = {};
    const part = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (par || av).add(m); return m };
    const leg = (sx) => { const g = new THREE.Group(); g.position.set(sx * .15, .74, 0); av.add(g);
      part(new THREE.BoxGeometry(.24, .5, .26), M(0x1f2a44), 0, -.25, 0, g); part(new THREE.BoxGeometry(.2, .26, .22), M(0x1f2a44), 0, -.58, 0, g);
      part(new THREE.BoxGeometry(.25, .12, .38), M(0xf4f4f4), 0, -.7, .06, g); part(new THREE.BoxGeometry(.26, .04, .4), M(0x2b2b2b), 0, -.76, .06, g); return g };
    P.legL = leg(-1); P.legR = leg(1);
    part(new THREE.BoxGeometry(.6, .1, .34), M(0x3a2414), 0, .76, 0);                                           // belt
    part(new THREE.BoxGeometry(.58, .62, .32), M(SH), 0, 1.1, 0);                                                // shirt
    for (let k = -2; k <= 2; k++) part(new THREE.BoxGeometry(.05, .5, .335), M(k % 2 ? 0xc9962b : 0xf0cf72), k * .105, 1.1, 0);   // shirt pattern
    part(new THREE.BoxGeometry(.2, .05, .2), M(0xf0cf72), 0, 1.42, .04);                                        // collar
    const arm = (sx) => { const g = new THREE.Group(); g.position.set(sx * .4, 1.36, 0); av.add(g);
      part(new THREE.BoxGeometry(.18, .3, .2), M(SH), 0, -.12, 0, g); part(new THREE.BoxGeometry(.13, .32, .14), M(SK), 0, -.4, 0, g); part(new THREE.SphereGeometry(.085, 10, 8), M(SK), 0, -.6, 0, g); return g };
    P.armL = arm(-1); P.armR = arm(1);
    part(new THREE.CylinderGeometry(.085, .095, .12, 10), M(SKD), 0, 1.47, 0);                                  // neck
    const head = P.head = new THREE.Group(); head.position.y = 1.78; av.add(head);
    const skull = part(new THREE.SphereGeometry(.25, 20, 16), M(SK), 0, 0, 0, head); skull.scale.set(.92, 1.08, .96);
    part(new THREE.SphereGeometry(.05, 8, 6), M(SK), -.24, -.02, 0, head); part(new THREE.SphereGeometry(.05, 8, 6), M(SK), .24, -.02, 0, head);   // ears
    const eye = (sx) => { const w = part(new THREE.SphereGeometry(.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), sx * .09, .04, .215, head); w.scale.set(1, .85, .5);
      const pu = part(new THREE.SphereGeometry(.026, 8, 6), new THREE.MeshBasicMaterial({ color: 0x120a06 }), sx * .09, .04, .238, head); part(new THREE.BoxGeometry(.1, .018, .03), M(0x120a06), sx * .09, .12, .225, head); return [w, pu] };
    P.eyes = [...eye(-1), ...eye(1)];
    part(new THREE.SphereGeometry(.045, 8, 6), M(SKD), 0, -.03, .245, head);                                    // nose
    part(new THREE.BoxGeometry(.11, .022, .03), M(0x2a0f0b), 0, -.13, .225, head);                              // mouth
    const hair = part(new THREE.SphereGeometry(.27, 20, 12, 0, Math.PI * 2, 0, Math.PI * .56), M(0x120d0a), 0, .02, -.02, head); hair.scale.set(.95, 1.02, 1);
    const shd = new THREE.Mesh(new THREE.CircleGeometry(.42, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .28 })); shd.rotation.x = -Math.PI / 2; shd.position.y = .02; av.add(shd);
    av.position.set(-1, 0, 1.2); sc.add(av);
    // input
    const cv2 = cv; cv2.style.touchAction = 'none';
    cv2.addEventListener('pointerdown', e => { this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.down = { x: e.clientX, y: e.clientY, t: Date.now() }; this.drag = false; try { cv2.setPointerCapture(e.pointerId) } catch (x) { } if (this.ptr.size === 2) { const [a, b] = [...this.ptr.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y) } });
    cv2.addEventListener('pointermove', e => {
      const p = this.ptr.get(e.pointerId); if (!p) return;
      if (this.ptr.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...this.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch) this.zoom(this.pinch / d); this.pinch = d; this.drag = true }
      else { const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; if (this.down && Math.abs(e.clientX - this.down.x) + Math.abs(e.clientY - this.down.y) > 8) this.drag = true; if (this.drag) { this.tAz = null; this.az -= dx * .0085; this.pol = Math.max(.35, Math.min(1.35, this.pol - dy * .006)) } }
    });
    const up = e => { const was = this.ptr.size === 1 && !this.drag && this.down && Date.now() - this.down.t < 450; this.ptr.delete(e.pointerId); this.pinch = 0; if (was) this.tap(e.clientX, e.clientY) };
    cv2.addEventListener('pointerup', up); cv2.addEventListener('pointercancel', e => { this.ptr.delete(e.pointerId) });
    cv2.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1) }, { passive: false });
    cv2.addEventListener('dblclick', () => this.reset());
    window.addEventListener('resize', () => this.resize()); this.resize()
  },
  resize() { if (!this.R) return; const a = document.getElementById('app'), w = a.clientWidth, h = a.clientHeight; if (!w || !h) return; this.W = w; this.H = h; this.R.setSize(w, h, false); this.cam.aspect = w / h; const half = 4.3, asp = Math.min(w / h, 1.4); this.d0 = half / (Math.tan(this.cam.fov * Math.PI / 360) * asp); if (!this.userDist) this.dist = this.d0; this.applyShift() },
  applyShift() { const sh = this.shiftY * this.H; this.cam.setViewOffset(this.W, this.H, 0, -sh, this.W, this.H); this.cam.updateProjectionMatrix() },
  zoom(f) { this.userDist = true; this.dist = Math.max(this.d0 * .35, Math.min(this.d0 * 1.5, this.dist * f)) },
  flip() { this.tAz = (this.tAz == null ? this.az : this.tAz) + Math.PI / 2 },
  reset() { this.userDist = false; this.dist = this.d0; this.pol = .95; this.tAz = Math.round((this.az - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4 },
  page(w) {
    this.page_ = w; if (!this.on) return; const show = w === 'home' || w === 'buy' || w === 'phone'; this.cv.style.display = show ? 'block' : 'none';
    this.shiftY = w === 'buy' ? -.17 : .05; this.applyShift()
  },
  paint(c) { this.walls.forEach(w => w.m.material.color.set(c || '#d9a93a')) },
  dark(b) { this.dark_ = !!b },
  env(dl) { this.dl = dl },
  power() { return !this.dark_ || !!(S.owned && S.owned['Gen Set']) },
  /* owned items show up in the house */
  sync() {
    if (!this.on) return; const o = S.owned || {}, sc = this.scene;
    if (this.extras) sc.remove(this.extras); const ex = this.extras = new THREE.Group(); sc.add(ex);
    while (this.bed.children.length) this.bed.remove(this.bed.children[0]);
    const q = o['Queen Bed'], f = o['Foam Mattress'] && !o['Single Bed'] && !q, bx = q ? 2.6 : 2.1, bz = q ? 1.8 : 1.2, cx = -3 + bx / 2 + .05;
    this.box(bx, .3, bz, q ? 0x7a4b2a : 0xc9a977, cx, .2, -1.6, this.bed); this.box(bx - .1, .22, bz - .1, f ? 0xcfd4dc : q ? 0xe8d9c4 : 0xd63a2f, cx + .05, .46, -1.6, this.bed); this.box(.5, .15, bz - .3, 0xf4efe6, cx - bx / 2 + .4, .64, -1.6, this.bed);
    if (o['Net']) { const n = this.box(bx, 1.4, bz, 0xffffff, cx, 1.2, -1.6, ex); n.material.transparent = true; n.material.opacity = .25 }
    if (o['Fridge']) this.box(.9, 1.9, .85, 0xdfe6ee, 2.5, .95, .35, ex);
    if (o['Gas Cooker']) { this.box(.9, .8, .8, 0xbbbbbb, 2.5, .4, 1.3, ex); this.box(.8, .05, .7, 0x222222, 2.5, .83, 1.3, ex) }
    if (o['Gen Set']) this.box(.9, .7, .7, 0xdd9944, -2.4, .35, 2.5, ex);
    if (o['Shower']) { this.cyl(.05, 2.2, 0x99cccc, -2.8, 1.1, -2.8, ex); this.box(.5, .12, .5, 0x99cccc, -2.6, 2.2, -2.8, ex) }
    if (o['Water Closet']) this.box(.6, .5, .7, 0xffffff, -1.0, .25, 2.5, ex);
    if (o['Bucket Set']) this.cyl(.22, .3, 0x2f6fd8, -.3, .15, 2.7, ex);
    // lamps you bought: each is a real light that switches on with power (NEPA light or a Gen Set)
    this.lamps = []; const lamp = (x, y, z, big) => { const bm = new THREE.MeshBasicMaterial({ color: 0x8a8466 }); const b = new THREE.Mesh(new THREE.SphereGeometry(big ? .2 : .13, 12, 10), bm); b.position.set(x, y, z); ex.add(b); const l = new THREE.PointLight(0xffd68a, 0, big ? 11 : 8); l.position.set(x, y - .1, z); ex.add(l); this.lamps.push({ l, bm, k: big ? 1.15 : .9 }) };
    if (o['Ceiling Bulb']) { this.cyl(.015, .35, 0x222222, 0, 2.82, 0, ex); lamp(0, 2.6, 0, true) }
    if (o['Wall Lamp']) { this.box(.12, .2, .22, 0x555555, -2.93, 2.2, .2, ex); lamp(-2.8, 2.2, .2); this.box(.22, .2, .12, 0x555555, 1.2, 2.2, -2.93, ex); lamp(1.2, 2.2, -2.8) }
    if (o['Standing Lamp']) { this.cyl(.03, 1.5, 0x3a3a3a, -2.55, .75, .7, ex); this.cyl(.18, .04, 0x3a3a3a, -2.55, .03, .7, ex); lamp(-2.55, 1.62, .7) }
  },
  tap(cx, cy) {
    const r = this.cv.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(v, this.cam);
    const hits = ray.intersectObjects([this.cooler, this.floor], true); if (!hits.length) return; const h = hits[0];
    let o = h.object, isC = false; while (o) { if (o === this.cooler) { isC = true; break } o = o.parent }
    if (isC) { eat({ stopPropagation() { } }); return }
    if (h.object === this.floor) this.goal = new THREE.Vector3(Math.max(-2.6, Math.min(2.6, h.point.x)), 0, Math.max(-2.6, Math.min(2.6, h.point.z)))
  },
  loop(t) {
    requestAnimationFrame(tt => this.loop(tt)); if (!this.on || document.hidden || this.cv.style.display === 'none' || document.getElementById('hub').style.display === 'flex') return;
    const dt = Math.min(.05, (t - this.last) / 1000 || .016); if (isSaver() && t - this.last < 33) return; this.last = t;
    if (this.tAz != null) { const d = this.tAz - this.az; this.az += d * Math.min(1, dt * 8); if (Math.abs(d) < .002) { this.az = this.tAz; this.tAz = null } }
    const cam = this.cam, sp = Math.sin(this.pol), px = this.dist * sp * Math.sin(this.az), pz = this.dist * sp * Math.cos(this.az), py = this.dist * Math.cos(this.pol);
    cam.position.set(px, py + .8, pz); cam.lookAt(0, .8, 0);
    // walls between the camera and the room fade out
    this.walls.forEach(w => { const side = px * w.out[0] + pz * w.out[1], want = side > 2.2 ? .08 : 1, m = w.m.material; m.opacity += (want - m.opacity) * Math.min(1, dt * 8); m.depthWrite = m.opacity > .6; w.m.visible = m.opacity > .02 });
    // avatar walking
    const a = this.avatar; let moving = false;
    if (this.goal) { const d = this.goal.clone().sub(a.position); d.y = 0; const L = d.length(); if (L < .06) this.goal = null; else { moving = true; d.normalize(); a.position.addScaledVector(d, Math.min(L, 2.4 * dt)); const ta = Math.atan2(d.x, d.z), df = ((ta - a.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; a.rotation.y += df * Math.min(1, dt * 10); } }
    const P = this.parts, ph = t / 120, sw = moving ? Math.sin(ph) * .75 : 0;
    P.legL.rotation.x = sw; P.legR.rotation.x = -sw; P.armL.rotation.x = -sw * .9; P.armR.rotation.x = sw * .9;
    if (!moving) { const b = Math.sin(t / 700) * .04; P.armL.rotation.x = b; P.armR.rotation.x = -b; P.armL.rotation.z = .05; P.armR.rotation.z = -.05 } else { P.armL.rotation.z = .05; P.armR.rotation.z = -.05 }
    P.head.rotation.y = moving ? 0 : Math.sin(t / 1900) * .25; const bl = (t % 4200) < 130 ? .1 : 1; P.eyes.forEach(e => { e.scale.y = e === P.eyes[0] || e === P.eyes[2] ? bl * .85 : bl });
    a.position.y = moving ? Math.abs(Math.sin(ph)) * .06 : 0;
    // time of day: daylight dl (0 night .. 1 day) drives sun, sky tint, ground and window; bought lamps follow NEPA power
    const dl = this.dl == null ? 1 : this.dl, kk = Math.min(1, dt * 3), C = THREE.Color, lerpC = (a, b, t) => new C(a).lerp(new C(b), t);
    this.amb.intensity += ((.3 + .32 * dl) - this.amb.intensity) * kk; this.amb.color.copy(lerpC(0x8a9bd6, 0xffffff, dl));
    this.sun.intensity += (.55 * dl - this.sun.intensity) * kk; this.sun.color.copy(lerpC(0xff8a45, 0xfff0d0, Math.max(0, Math.min(1, (dl - .2) / .6))));
    this.moon.intensity += (.42 * (1 - dl) - this.moon.intensity) * kk;
    this.ground.color.copy(lerpC(0x24331f, 0x93a05a, dl)); if (this.glass) this.glass.color.copy(lerpC(0x16224a, 0xbfe4ff, dl));
    const on = this.power(); this.lamps.forEach(m => { const want = on ? m.k * (.4 + .75 * (1 - dl)) : 0; m.l.intensity += (want - m.l.intensity) * Math.min(1, dt * 6); m.bm.color.copy(lerpC(0x8a8466, 0xffe9a0, Math.min(1, m.l.intensity / (m.k * .6)))) });
    this.R.render(this.scene, cam)
  }
};
