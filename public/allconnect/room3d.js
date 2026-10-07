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
    this.cyl(10, 0.3, 0x93a05a, 0, -0.45, 0, null, 48); this.box(6.5, 0.3, 6.5, 0xc9a56b, 0, -0.15, 0);
    // checker floor
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#a8693a'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#c58a52'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(3, 3); tx.anisotropy = 8;
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ map: tx })); this.floor.rotation.x = -Math.PI / 2; sc.add(this.floor);
    // four walls (the ones facing the camera fade away)
    const W = (w, h, d, x, z, out) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: S.paint, transparent: true })); m.position.set(x, h / 2, z); sc.add(m); this.walls.push({ m, out }); return m };
    this.wW = W(.15, 3, 6.15, -3.075, 0, [-1, 0]); this.wN = W(6.15, 3, .15, 0, -3.075, [0, -1]); W(.15, 3, 6.15, 3.075, 0, [1, 0]); W(6.15, 3, .15, 0, 3.075, [0, 1]);
    // door + poster + lamp on the west wall, window + AC + lamp on the north wall
    this.box(.12, 2.1, 1.1, 0x5a2c14, -2.95, 1.05, 1.6); this.box(.1, .9, .7, 0xf2f2f2, -2.97, 1.8, -1.5); this.box(.1, .16, .16, 0xffd77a, -2.9, 2.3, 0.2);
    this.box(1.5, 1.0, .12, 0x80868a, 1.6, 1.7, -2.94); Object.assign(this.box(1.3, .8, .1, 0xbfe4ff, 1.6, 1.7, -2.9).material, { transparent: true, opacity: .7 }); this.box(1.3, .08, .12, 0x555a5c, 1.6, 1.7, -2.88);
    this.box(1.1, .4, .35, 0xf1f1f1, -0.6, 2.4, -2.8); this.box(.16, .16, .1, 0xffd77a, 1.2, 2.3, -2.9);
    this.l1 = new THREE.PointLight(0xffd68a, .25, 7); this.l1.position.set(-2.4, 2.3, .2); sc.add(this.l1); this.l2 = new THREE.PointLight(0xffd68a, .2, 7); this.l2.position.set(1.2, 2.3, -2.4); sc.add(this.l2);
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
    // avatar
    const av = this.avatar = new THREE.Group(); this.box(.22, .7, .22, 0x16161c, -.14, .35, 0, av); this.box(.22, .7, .22, 0x16161c, .14, .35, 0, av);
    this.box(.55, .65, .3, 0xd9b24a, 0, 1.02, 0, av); this.box(.14, .55, .14, 0x6b4226, -.36, 1.0, 0, av); this.box(.14, .55, .14, 0x6b4226, .36, 1.0, 0, av);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(.24, 16, 12), this.mat(0x6b4226)); hd.position.y = 1.58; av.add(hd); const hr = new THREE.Mesh(new THREE.SphereGeometry(.255, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0x1a1010)); hr.position.y = 1.6; av.add(hr);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(.4, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .25 })); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; av.add(sh);
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
    if (o['Bucket Set']) this.cyl(.22, .3, 0x2f6fd8, -.3, .15, 2.7, ex)
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
    a.position.y = moving ? Math.abs(Math.sin(t / 110)) * .08 : Math.sin(t / 600) * .015;
    // lights: NEPA blackout dims the house
    const k = this.dark_ ? .3 : 1; this.amb.intensity += (.62 * k - this.amb.intensity) * Math.min(1, dt * 4); this.sun.intensity += (.5 * k - this.sun.intensity) * Math.min(1, dt * 4); const lamp = this.dark_ ? .9 : .25; this.l1.intensity += (lamp - this.l1.intensity) * Math.min(1, dt * 4); this.l2.intensity = this.l1.intensity * .85;
    this.R.render(this.scene, cam)
  }
};
