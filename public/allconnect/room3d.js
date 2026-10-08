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
    this.itemsGroup = new THREE.Group(); sc.add(this.itemsGroup); this.ghostG = null; this.ring = null; this.path = [];
    // the player's character (male or female, chosen on the start card)
    this.gender = (typeof S !== 'undefined' && S.gender) || 'male'; this.buildAvatar(this.gender);
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
  /* ---------- the player's character: male / female models with walk, dance and wave ---------- */
  buildAvatar(gender) {
    const fem = gender === 'female', old = this.avatar, pos = old ? old.position.clone() : new THREE.Vector3(-1, 0, 1.2), ry = old ? old.rotation.y : 0;
    if (old) this.scene.remove(old);
    const M = c => this.mat(c), SK = 0x6e4529, SKD = 0x5a3720, GOLD = 0xe2b64a, GREEN = 0x2f9e63, CREAM = 0xf4efe6, HAIR = 0x120d0a;
    const av = this.avatar = new THREE.Group(), body = new THREE.Group(), P = this.parts = { body }; av.add(body);
    const part = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (par || body).add(m); return m };
    const L1 = .36, L2 = .30, HIP = .74;
    const leg = sx => {
      const hip = new THREE.Group(); hip.position.set(sx * (fem ? .125 : .15), HIP, 0); body.add(hip);
      part(new THREE.BoxGeometry(fem ? .2 : .24, L1, fem ? .22 : .26), M(fem ? SK : 0x1f2a44), 0, -L1 / 2, 0, hip);
      const knee = new THREE.Group(); knee.position.y = -L1; hip.add(knee);
      part(new THREE.BoxGeometry(fem ? .16 : .2, L2, fem ? .18 : .22), M(fem ? SK : 0x1f2a44), 0, -L2 / 2, 0, knee);
      part(new THREE.BoxGeometry(.25, .06, .36), M(fem ? 0x7a4b2a : 0xf4f4f4), 0, -L2 - .03, .06, knee);
      part(new THREE.BoxGeometry(.26, .025, .4), M(0x2b2b2b), 0, -L2 - .0675, .06, knee);
      return { hip, knee };
    };
    P.legL = leg(-1); P.legR = leg(1);
    const T = P.torso = new THREE.Group(); T.position.y = .76; body.add(T);
    if (fem) {
      part(new THREE.BoxGeometry(.5, .16, .3), M(CREAM), 0, -.04, 0, T);                                        // hips
      P.skirt = part(new THREE.CylinderGeometry(.2, .37, .46, 18), M(CREAM), 0, -.14, 0, body); P.skirt.position.y = HIP - .12 + .0;
      part(new THREE.BoxGeometry(.46, .54, .28), M(GREEN), 0, .34, 0, T);                                       // top
      for (let k = -1; k <= 1; k++) part(new THREE.BoxGeometry(.04, .46, .295), M(k % 2 ? GREEN : CREAM), k * .13, .34, 0, T);
      part(new THREE.BoxGeometry(.4, .045, .3), M(CREAM), 0, .6, .005, T);                                      // neckline trim
    } else {
      part(new THREE.BoxGeometry(.6, .1, .34), M(0x3a2414), 0, 0, 0, T);                                        // belt
      part(new THREE.BoxGeometry(.58, .62, .32), M(GOLD), 0, .34, 0, T);                                        // shirt
      for (let k = -2; k <= 2; k++) part(new THREE.BoxGeometry(.05, .5, .335), M(k % 2 ? 0xc9962b : 0xf0cf72), k * .105, .34, 0, T);
      part(new THREE.BoxGeometry(.2, .05, .2), M(0xf0cf72), 0, .66, .04, T);                                    // collar
    }
    const arm = sx => {
      const sh = new THREE.Group(); sh.position.set(sx * (fem ? .31 : .4), .6, 0); T.add(sh);
      part(new THREE.BoxGeometry(fem ? .13 : .18, .3, fem ? .15 : .2), M(fem ? SK : GOLD), 0, -.13, 0, sh);
      const el = new THREE.Group(); el.position.y = -.28; sh.add(el);
      part(new THREE.BoxGeometry(fem ? .11 : .13, .3, fem ? .12 : .14), M(SK), 0, -.15, 0, el);
      part(new THREE.SphereGeometry(fem ? .07 : .085, 10, 8), M(SK), 0, -.34, 0, el);
      if (fem) part(new THREE.SphereGeometry(.075, 8, 6), M(GREEN), 0, .02, 0, sh);                            // shoulder cap
      return { sh, el };
    };
    P.armL = arm(-1); P.armR = arm(1);
    part(new THREE.CylinderGeometry(fem ? .07 : .085, fem ? .08 : .095, .12, 10), M(SKD), 0, .71, 0, T);       // neck
    const head = P.head = new THREE.Group(); head.position.y = 1.02; T.add(head);
    const skull = part(new THREE.SphereGeometry(fem ? .235 : .25, 20, 16), M(SK), 0, 0, 0, head); skull.scale.set(.92, 1.08, .96);
    part(new THREE.SphereGeometry(.05, 8, 6), M(SK), -.23, -.02, 0, head); part(new THREE.SphereGeometry(.05, 8, 6), M(SK), .23, -.02, 0, head);
    const eye = sx => {
      const w = part(new THREE.SphereGeometry(.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), sx * .09, .04, .205, head); w.scale.set(1, .85, .5);
      const pu = part(new THREE.SphereGeometry(.026, 8, 6), new THREE.MeshBasicMaterial({ color: 0x120a06 }), sx * .09, .04, .228, head);
      part(new THREE.BoxGeometry(.1, fem ? .012 : .018, .03), M(HAIR), sx * .09, fem ? .105 : .12, .215, head);
      if (fem) { const l = part(new THREE.BoxGeometry(.05, .012, .03), M(HAIR), sx * .135, .085, .21, head); l.rotation.z = -sx * .5 }   // lashes
      return [w, pu];
    };
    P.eyes = [...eye(-1), ...eye(1)];
    part(new THREE.SphereGeometry(.045, 8, 6), M(SKD), 0, -.03, .235, head);                                    // nose
    part(new THREE.BoxGeometry(fem ? .1 : .11, fem ? .028 : .022, .03), M(fem ? 0x9c2f3f : 0x2a0f0b), 0, -.125, .215, head);   // mouth
    if (fem) {                                                                                                  // hair: big cap, puff bun, long braids
      const hair = part(new THREE.SphereGeometry(.275, 20, 12, 0, Math.PI * 2, 0, Math.PI * .6), M(HAIR), 0, .02, -.03, head); hair.scale.set(1, 1.04, 1.04);
      part(new THREE.SphereGeometry(.13, 12, 10), M(HAIR), 0, .27, -.07, head);
      for (let k = -2; k <= 2; k++) { const br = part(new THREE.BoxGeometry(.055, .62, .055), M(HAIR), k * .1, -.2, -.2, head); br.rotation.x = .08; part(new THREE.SphereGeometry(.035, 6, 5), M(0xf0cf72), k * .1, -.5, -.19, head) }
    } else {
      const hair = part(new THREE.SphereGeometry(.27, 20, 12, 0, Math.PI * 2, 0, Math.PI * .56), M(HAIR), 0, .02, -.02, head); hair.scale.set(.95, 1.02, 1);
    }
    const shd = new THREE.Mesh(new THREE.CircleGeometry(.42, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .28 })); shd.rotation.x = -Math.PI / 2; shd.position.y = .02; av.add(shd);
    av.position.copy(pos); av.rotation.y = ry; this.scene.add(av);
    this.pose = this.pose || null; this.tp = {}; this.ph = 0; this.tt = 0; this.spin = 0;
    if (!this.pose) this.pose = {}; Object.assign(this.pose, ACPOSE.idle());
  },
  setGender(g) { g = g === 'female' ? 'female' : 'male'; if (g === this.gender) return; this.gender = g; if (this.on && this.scene) this.buildAvatar(g) },
  /* emote('dance') starts dancing (tap again for the next move), emote('wave') waves, emote(null) stops */
  emote(k) {
    if (k === 'dance') { if (this.em === 'dance') this.dn = (this.dn + 1) % ACPOSE.DANCES; else { this.em = 'dance'; this.dn = this.dn || 0 } }
    else this.em = k || null
  },
  /* drive every joint from the current pose; moving = walking along the path */
  animate(t, dt, moving) {
    const P = this.parts, ps = this.pose, tp = this.tp, st = moving ? 'walk' : (this.em || 'idle');
    if (this.em && moving) { this.em = null; if (window.emoteEnded) window.emoteEnded() }
    const rate = st === 'walk' ? 1.3 : st === 'dance' ? [1.15, 1.15, 1.0, 1.4][this.dn % ACPOSE.DANCES] : st === 'wave' ? 1 : 0;
    if (this.laststate !== st && st === 'wave') this.ph = 0; this.laststate = st;
    this.ph += dt * Math.PI * 2 * rate; this.tt += dt;
    if (st === 'dance' && this.dn % ACPOSE.DANCES === 2) this.spin += dt * 5.2; else this.spin += (Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2 - this.spin) * Math.min(1, dt * 7);
    ACPOSE.target(tp, st, this.ph, this.tt, this.dn || 0);
    const k = 1 - Math.exp(-dt * 14); for (const key in tp) ps[key] += (tp[key] - ps[key]) * k;
    const c = Math.cos, L1 = .36, L2 = .30;
    const lg = (g, sx, a, b, kn) => { g.hip.rotation.set(-a, 0, sx * b); g.knee.rotation.x = kn; return L1 * c(a) * c(b) + L2 * c(a - kn) * c(b * .5) + .08 };
    const dL = lg(P.legL, -1, ps.ll, ps.llb, ps.llk), dR = lg(P.legR, 1, ps.rl, ps.rlb, ps.rlk);
    P.body.position.y = Math.max(dL, dR) - .74 + ps.lift; P.body.rotation.y = this.spin;
    const ar = (g, sx, a1, b1, a2, b2) => { g.sh.rotation.set(-a1, 0, sx * b1); g.el.rotation.set(-(a2 - a1), 0, sx * (b2 - b1)) };
    ar(P.armL, -1, ps.la1, ps.lb1, ps.la2, ps.lb2); ar(P.armR, 1, ps.ra1, ps.rb1, ps.ra2, ps.rb2);
    P.torso.rotation.set(ps.lean, ps.twist, 0); P.torso.position.x = ps.sx;
    P.head.rotation.set(0, st === 'idle' ? Math.sin(t / 1900) * .25 : 0, ps.head);
    const bl = (t % 4200) < 130 ? .1 : 1; P.eyes.forEach((e, i) => { e.scale.y = (i === 0 || i === 2 ? bl * .85 : bl) });
    if (P.skirt) P.skirt.rotation.x = 0;
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
  power() { return !this.dark_ || (S.items || []).some(i => i.name === 'Gen Set' && i.placed !== false) },
  /* ---------- furniture: every placed item is a model on the 6x6 grid ---------- */
  cc(c) { return -2.5 + c },
  B(w, h, d, c, x, y, z, par) { return this.box(w, h, d, c, x, y, z, par) },
  model(name) {
    const D = FURN.ITEMS[name], [w, d] = [D.w || 1, D.d || 1], c = D.color, g = new THREE.Group(), B = (a, b, cc, col, x, y, z) => this.B(a, b, cc, col, x, y, z, g), K = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
    switch (D.kind) {
      case 'bed': { B(w - .1, .28, d - .1, 0xb08a5a, 0, .2, 0); B(w - .22, .2, d - .22, c, .04, .42, 0); B(.1, .75, d - .1, 0x6b4a2a, -w / 2 + .08, .5, 0); const n = d >= 2 ? 2 : 1; for (let k = 0; k < n; k++) B(.42, .13, (d - .3) / n - .12, 0xf4efe6, -w / 2 + .42, .6, (k - (n - 1) / 2) * ((d - .3) / n)); B(w * .55, .05, d - .26, K(c, 1.15), .25, .54, 0); break }
      case 'sofa': case 'armchair': { B(w - .08, .38, .9, K(c, .85), 0, .22, .02); for (let k = 0; k < w; k++) B(.86, .15, .68, c, -w / 2 + .5 + k, .5, .08); B(w - .08, .62, .22, K(c, .8), 0, .72, -.34); B(.18, .58, .9, K(c, .8), -w / 2 + .12, .46, .02); B(.18, .58, .9, K(c, .8), w / 2 - .12, .46, .02); break }
      case 'chair': { B(.62, .08, .62, c, 0, .5, 0); [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]].forEach(p => B(.07, .5, .07, K(c, .8), p[0], .25, p[1])); B(.62, .6, .07, c, 0, .85, -.28); break }
      case 'stool': { B(.8, .08, .8, c, 0, .78, 0); [[-.32, -.32], [.32, -.32], [-.32, .32], [.32, .32]].forEach(p => B(.08, .78, .08, K(c, .9), p[0], .39, p[1])); this.cyl(.2, .36, 0x2f4a2f, 0, 1.0, 0, g); break }
      case 'table': { B(w - .15, .1, .8, c, 0, .85, 0); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(p => B(.1, .85, .1, K(c, .85), p[0] * (w / 2 - .15), .42, p[1] * .3)); break }
      case 'cooler': { B(.92, .66, .72, c, 0, .35, 0); B(.96, .1, .76, K(c, .6), 0, .72, 0); g.userData.eat = true; break }
      case 'fridge': { B(.84, 1.85, .78, c, 0, .93, 0); B(.04, .5, .04, 0x777777, .3, 1.2, .4); B(.84, .03, .79, 0x9aa3ad, 0, 1.15, 0); break }
      case 'cooker': { B(.86, .8, .78, c, 0, .4, 0); B(.8, .05, .72, 0x222222, 0, .83, 0); [-.25, 0, .25].forEach(x => this.cyl(.05, .06, 0x111111, x, .87, .2, g)); break }
      case 'genset': { B(.88, .66, .7, c, 0, .35, 0); this.cyl(.07, .5, 0x444444, .3, .85, -.1, g); break }
      case 'bucket': { this.cyl(.26, .34, c, -.15, .17, .05, g); this.cyl(.3, .06, 0xd0243a, .2, .03, -.25, g); break }
      case 'barrel': { this.cyl(.42, 1.0, c, 0, .5, 0, g); this.cyl(.43, .08, K(c, 1.3), 0, 1.02, 0, g); break }
      case 'toilet': { B(.62, .42, .5, c, 0, .22, .05); B(.66, .6, .2, c, 0, .75, -.3); B(.5, .06, .44, 0xdde3ea, 0, .46, .06); break }
      case 'shower': { B(.9, .06, .9, c, 0, .04, 0); this.cyl(.04, 2.0, 0x888888, -.3, 1.0, -.3, g); B(.4, .08, .4, 0x888888, -.1, 2.0, -.1); break }
      case 'stand': { this.cyl(.2, .05, 0x3a3a3a, 0, .03, 0, g); this.cyl(.03, 1.5, 0x3a3a3a, 0, .78, 0, g); g.userData.lamp = { y: 1.68 }; break }
    }
    return g
  },
  ensureAvatarFree() {
    const occ = FURN.occupied(S.items || []), a = this.avatar, cx = Math.floor(a.position.x + 3), cz = Math.floor(a.position.z + 3);
    if (!occ.has(cx + ',' + cz)) return; const f = this.nearestFree(cx, cz, occ); if (f) { a.position.set(this.cc(f[0]), 0, this.cc(f[1])); this.path = [] }
  },
  nearestFree(cx, cz, occ) { let best = null, bd = 1e9; for (let x = 0; x < FURN.GRID; x++) for (let z = 0; z < FURN.GRID; z++) { if (occ.has(x + ',' + z)) continue; const d = Math.abs(x - cx) + Math.abs(z - cz); if (d < bd) { bd = d; best = [x, z] } } return best },
  /* rebuild the room's furniture + lamps from S.items (placed ones) */
  sync() {
    if (!this.on) return; const ig = this.itemsGroup; while (ig.children.length) ig.remove(ig.children[0]);
    this.lamps = []; this.byId = {}; const items = S.items || [], own = (n) => items.some(i => i.name === n && i.placed !== false);
    const lamp = (x, y, z, big, par) => { const bm = new THREE.MeshBasicMaterial({ color: 0x8a8466 }); const b = new THREE.Mesh(new THREE.SphereGeometry(big ? .2 : .13, 12, 10), bm); b.position.set(x, y, z); ig.add(b); const l = new THREE.PointLight(0xffd68a, 0, big ? 11 : 8); l.position.set(x, y - .1, z); ig.add(l); this.lamps.push({ l, bm, k: big ? 1.15 : .9 }) };
    for (const it of items) {
      if (it.placed === false || !FURN.isItem(it.name)) continue; const D = FURN.ITEMS[it.name];
      if (D.fixed) continue;
      const [w, d] = FURN.footprint(it.name, it.rot), g = this.model(it.name); g.position.set(this.cc(it.x) + (w - 1) / 2, 0, this.cc(it.z) + (d - 1) / 2); g.rotation.y = it.rot * Math.PI / 180; g.userData.id = it.id; g.userData.name = it.name; ig.add(g); this.byId[it.id] = g;
      if (g.userData.lamp) lamp(g.position.x, g.userData.lamp.y, g.position.z, false)
    }
    if (own('Ceiling Bulb')) { this.cyl(.015, .35, 0x222222, 0, 2.82, 0, ig); lamp(0, 2.6, 0, true) }
    if (own('Wall Lamp')) { this.box(.12, .2, .22, 0x555555, -2.93, 2.2, .2, ig); lamp(-2.8, 2.2, .2); this.box(.22, .2, .12, 0x555555, 1.2, 2.2, -2.93, ig); lamp(1.2, 2.2, -2.8) }
    this.ensureAvatarFree(); if (this.selId) this.select(this.selId); if (this.ghostInfo) this.ghost(this.ghostInfo.name, this.ghostInfo.x, this.ghostInfo.z, this.ghostInfo.rot, this.ghostInfo.valid)
  },
  /* ---------- buy mode helpers: ghost preview, selection ring, hide, thumbnails ---------- */
  ghost(name, x, z, rot, valid) {
    this.unghost(); this.ghostInfo = { name, x, z, rot, valid };
    const D = FURN.ITEMS[name]; if (D.fixed) return; const [w, d] = FURN.footprint(name, rot), g = this.model(name), col = new THREE.Color(valid ? 0x3ddc84 : 0xff4d4d);
    g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .72; o.material.emissive = col.clone().multiplyScalar(.45) } });
    g.position.set(this.cc(x) + (w - 1) / 2, 0, this.cc(z) + (d - 1) / 2); g.rotation.y = rot * Math.PI / 180; this.scene.add(g); this.ghostG = g;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .35, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.set(g.position.x, .03, g.position.z); this.scene.add(pad); this.ghostPad = pad
  },
  unghost() { if (this.ghostG) { this.scene.remove(this.ghostG); this.ghostG = null } if (this.ghostPad) { this.scene.remove(this.ghostPad); this.ghostPad = null } this.ghostInfo = null },
  hideItem(id, hide) { const g = this.byId && this.byId[id]; if (g) g.visible = !hide },
  select(id) {
    this.deselect(); const g = this.byId && this.byId[id]; if (!g) return; this.selId = id; const it = (S.items || []).find(i => i.id === id); if (!it) return; const [w, d] = FURN.footprint(it.name, it.rot);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w + .12, d + .12), new THREE.MeshBasicMaterial({ color: 0x2f7fd8, transparent: true, opacity: .4, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(g.position.x, .035, g.position.z); this.scene.add(r); this.ring = r
  },
  deselect() { this.selId = null; if (this.ring) { this.scene.remove(this.ring); this.ring = null } },
  buyMode(on, handler) { this.buy = on ? handler : null; if (!on) { this.unghost(); this.deselect() } },
  thumb(name) {
    this.th = this.th || new Map(); if (this.th.has(name)) return this.th.get(name); if (!this.on || !FURN.isItem(name)) return '';
    try {
      if (!this.tr) { this.tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); this.tr.setSize(180, 140); this.ts = new THREE.Scene(); this.ts.add(new THREE.HemisphereLight(0xffffff, 0x998877, .95)); const dl = new THREE.DirectionalLight(0xffffff, .6); dl.position.set(3, 6, 4); this.ts.add(dl); this.tc = new THREE.PerspectiveCamera(28, 180 / 140, .1, 50) }
      const D = FURN.ITEMS[name]; if (D.fixed) { const e = ''; this.th.set(name, e); return e }
      const g = this.model(name); this.ts.add(g); const sz = Math.max(D.w, D.d, 1.3), dist = sz * 3.3 + 1; this.tc.position.set(dist * .62, dist * .62, dist * .72); this.tc.lookAt(0, .45, 0); this.tr.render(this.ts, this.tc);
      const url = this.tr.domElement.toDataURL('image/png'); this.ts.remove(g); this.th.set(name, url); return url
    } catch (e) { return '' }
  },
  cellFromPoint(p) { return [Math.max(0, Math.min(5, Math.floor(p.x + 3))), Math.max(0, Math.min(5, Math.floor(p.z + 3)))] },
  /* breadth-first path over free cells (avatar walks around furniture) */
  bfs(from, to, occ) {
    const key = (c) => c[0] + ',' + c[1], prev = new Map([[key(from), null]]), q = [from];
    while (q.length) { const c = q.shift(); if (c[0] === to[0] && c[1] === to[1]) { const out = []; let k = c; while (k) { out.unshift(k); k = prev.get(key(k)) } return out }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [c[0] + dx, c[1] + dz]; if (n[0] < 0 || n[1] < 0 || n[0] > 5 || n[1] > 5 || occ.has(key(n)) || prev.has(key(n))) continue; prev.set(key(n), c); q.push(n) } }
    return null
  },
  walkToCell(cell, exact) {
    const occ = FURN.occupied(S.items || []), a = this.avatar.position, from = this.cellFromPoint(a); occ.delete(from[0] + ',' + from[1]); if (occ.has(cell[0] + ',' + cell[1])) return false;
    const p = this.bfs(from, cell, occ); if (!p) return false;
    this.path = p.slice(1).map(c => new THREE.Vector3(this.cc(c[0]), 0, this.cc(c[1]))); if (exact) this.path.push(new THREE.Vector3(Math.max(-2.6, Math.min(2.6, exact.x)), 0, Math.max(-2.6, Math.min(2.6, exact.z)))); return true
  },
  /* can the avatar reach a free cell next to the cooler from the doorway? (used for the "blocks the way" warning) */
  reachesCooler(items) {
    const cool = items.find(i => i.name === 'Cooler Box' && i.placed !== false); if (!cool) return true; const occ = FURN.occupied(items), door = [0, 4];
    if (occ.has('0,4')) return false; const [w, d] = FURN.footprint(cool.name, cool.rot);
    for (let i = -1; i <= w; i++) for (let j = -1; j <= d; j++) { if ((i >= 0 && i < w) && (j >= 0 && j < d)) continue; if ((i === -1 || i === w) && (j === -1 || j === d)) continue; const c = [cool.x + i, cool.z + j]; if (c[0] < 0 || c[1] < 0 || c[0] > 5 || c[1] > 5 || occ.has(c[0] + ',' + c[1])) continue; if (this.bfs(door, c, occ)) return true }
    return false
  },
  floorCell(cx, cy) { const r = this.cv.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(v, this.cam); const h = ray.intersectObject(this.floor)[0]; return h ? { p: h.point, cell: this.cellFromPoint(h.point) } : null },
  tap(cx, cy) {
    const r = this.cv.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(v, this.cam);
    const hits = ray.intersectObjects([this.itemsGroup, this.floor], true); let itemG = null, floorHit = null;
    for (const h of hits) { if (h.object === this.floor) { floorHit = floorHit || h; if (!itemG) break; continue } let o = h.object; while (o && !(o.userData && o.userData.id)) o = o.parent; if (o && !itemG) itemG = o }
    if (this.buy) { if (itemG) this.buy({ type: 'item', id: itemG.userData.id }); else if (floorHit) this.buy({ type: 'cell', cell: this.cellFromPoint(floorHit.point) }); else this.buy({ type: 'none' }); return }
    if (itemG && itemG.userData.eat) {
      const it = (S.items || []).find(i => i.id === itemG.userData.id), occ = FURN.occupied(S.items || []), [w, d] = FURN.footprint(it.name, it.rot); let best = null, bl = 1e9;
      for (let i = -1; i <= w; i++) for (let j = -1; j <= d; j++) { if ((i >= 0 && i < w) && (j >= 0 && j < d)) continue; const c = [it.x + i, it.z + j]; if (c[0] < 0 || c[1] < 0 || c[0] > 5 || c[1] > 5 || occ.has(c[0] + ',' + c[1])) continue; const dd = Math.hypot(this.cc(c[0]) - this.avatar.position.x, this.cc(c[1]) - this.avatar.position.z); if (dd < bl && this.walkToCell(c)) { bl = dd; best = c } }
      if (!best) { toast('Something is blocking your cooler box'); return } this.walkToCell(best); this.onArrive = () => eat({ stopPropagation() { } }); return
    }
    if (floorHit) { this.onArrive = null; const cell = this.cellFromPoint(floorHit.point); if (!this.walkToCell(cell, floorHit.point)) toast('You cannot walk there') }
  },
  loop(t) {
    requestAnimationFrame(tt => this.loop(tt)); if (!this.on || document.hidden || this.cv.style.display === 'none' || document.getElementById('hub').style.display === 'flex') return;
    const dt = Math.min(.05, (t - this.last) / 1000 || .016); if (isSaver() && t - this.last < 33) return; this.last = t;
    if (this.tAz != null) { const d = this.tAz - this.az; this.az += d * Math.min(1, dt * 8); if (Math.abs(d) < .002) { this.az = this.tAz; this.tAz = null } }
    const cam = this.cam, sp = Math.sin(this.pol), px = this.dist * sp * Math.sin(this.az), pz = this.dist * sp * Math.cos(this.az), py = this.dist * Math.cos(this.pol);
    cam.position.set(px, py + .8, pz); cam.lookAt(0, .8, 0);
    // walls between the camera and the room fade out
    this.walls.forEach(w => { const side = px * w.out[0] + pz * w.out[1], want = side > 2.2 ? .08 : 1, m = w.m.material; m.opacity += (want - m.opacity) * Math.min(1, dt * 8); m.depthWrite = m.opacity > .6; w.m.visible = m.opacity > .02 });
    // avatar walking along the path
    const a = this.avatar; let moving = false;
    if (this.path.length) { const goal = this.path[0], d = goal.clone().sub(a.position); d.y = 0; const L = d.length(); if (L < .08) { this.path.shift(); if (!this.path.length && this.onArrive) { const f = this.onArrive; this.onArrive = null; f() } } else { moving = true; d.normalize(); a.position.addScaledVector(d, Math.min(L, 2.5 * dt)); const ta = Math.atan2(d.x, d.z), df = ((ta - a.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; a.rotation.y += df * Math.min(1, dt * 10) } }
    this.animate(t, dt, moving);
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
