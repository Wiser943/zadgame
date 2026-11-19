/* 3D house (Three.js). Drag to rotate, pinch / wheel to zoom, tap the floor to walk, tap the cooler to eat.
   Walls that face the camera fade out so you can always see inside. Falls back to the flat SVG room if WebGL or the library is unavailable. */
window.ROOM3D = {
  on: false, loading: false, T: null, az: Math.PI / 4, pol: 0.95, dist: 30, d0: 30, tAz: null, W: 0, H: 0, shiftY: 0, dark_: false, page_: 'home',
  WALL_H: 2.8,   // box-room wall height (was 3 — shorter walls so the room reads less tall/boxy)
  walls: [], gw: 6, gd: 6, offX: 0, offZ: 0, layout: null, roomKey: 6, extras: null, avatar: null, goal: null, ptr: new Map(), pinch: 0, drag: false, down: null, last: 0,
  load() {
    return new Promise((ok, no) => {
      if (window.THREE) return ok();
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s)
    })
  },
  async init() {
    if (this.on || this.loading) return; this.loading = true;
    if (window.RLOAD) RLOAD.start();   // covers the flat starter-room SVG with a small % pill until this finishes
    try {
      const probe = document.createElement('canvas'); if (!(probe.getContext('webgl') || probe.getContext('experimental-webgl'))) throw 0;
      await this.load(); this.build(); this.on = true; document.getElementById('app').classList.add('r3d');
      try { const st = localStorage.getItem('roomLight'); this.roomLight = st !== 'off'; this.roomBoost = st === 'on' } catch (e) {}
      this.page(S.page || 'home'); this.paint(S.paint); this.sync(); this.dark(!BAN.light); requestAnimationFrame(t => this.loop(t))
    } catch (e) { console.warn('3D room unavailable, using flat room', e) }
    this.loading = false;
    if (window.RLOAD) RLOAD.done();   // success: fades out onto the 3D room. failure: fades out onto the flat room instead
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
    this.groundM = this.cyl(10, 0.3, 0x93a05a, 0, -0.45, 0, null, 48); this.ground = this.groundM.material; this.slab = this.box(6.5, 0.3, 6.5, 0xc9a56b, 0, -0.15, 0);
    // Consistent warm wood floor: the old checkerboard texture made the base floor
    // visibly clash with the interior model's solid floor sections.
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#b9824d'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 42) {
      g.fillStyle = y % 84 ? '#c58d56' : '#b77b48'; g.fillRect(0, y + 1, 256, 40);
      g.strokeStyle = 'rgba(88,48,24,.22)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y + 40); g.lineTo(256, y + 40); g.stroke();
      const offset = (y / 42) % 2 ? 38 : 0;
      for (let x = offset; x < 256; x += 86) { g.strokeStyle = 'rgba(88,48,24,.18)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x, y + 39); g.stroke(); }
      g.strokeStyle = 'rgba(255,224,176,.14)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y + 8); g.lineTo(256, y + 8); g.stroke();
    }
    const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(2, 2); tx.anisotropy = 8;
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ map: tx })); this.floor.rotation.x = -Math.PI / 2; sc.add(this.floor);
    // four walls (the ones facing the camera fade away)
    const W = (w, h, d, x, z, out) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: S.paint, transparent: true })); m.position.set(x, h / 2, z); sc.add(m); this.walls.push({ m, out }); return m };
    const WH = this.WALL_H;
    this.wW = W(.15, WH, 6.15, -3.075, 0, [-1, 0]); this.wN = W(6.15, WH, .15, 0, -3.075, [0, -1]); this.wE = W(.15, WH, 6.15, 3.075, 0, [1, 0]); this.wS = W(6.15, WH, .15, 0, 3.075, [0, 1]);
    const n0 = sc.children.length;
    // door + poster + lamp on the west wall, window + AC + lamp on the north wall (y's are hand-placed to clear WH's ceiling)
    this.box(.12, 2.1, 1.1, 0x5a2c14, -2.95, 1.05, 1.6); this.box(.1, .9, .7, 0xf2f2f2, -2.97, 1.8, -1.5);
    this.box(1.5, 1.0, .12, 0x80868a, 1.6, 1.7, -2.94); this.walls.glass = this.box(1.3, .8, .1, 0xbfe4ff, 1.6, 1.7, -2.9).material; Object.assign(this.walls.glass, { transparent: true, opacity: .7 }); this.box(1.3, .08, .12, 0x555a5c, 1.6, 1.7, -2.88);
    this.box(1.1, .4, .35, 0xf1f1f1, -0.6, 2.05, -2.8);
    this.glass = this.walls.glass; this.shellDecor = sc.children.slice(n0);
    this.moon = new THREE.DirectionalLight(0x7f9bff, 0); this.moon.position.set(-6, 10, -4); sc.add(this.moon); this.lamps = [];
    this.itemsGroup = new THREE.Group(); sc.add(this.itemsGroup); this.ghostG = null; this.ring = null; this.path = [];
    // the player's character (male or female, chosen on the start card)
    this.gender = (typeof S !== 'undefined' && S.gender) || 'male'; this.buildAvatar(this.gender, (typeof S !== 'undefined' && S.render) || null);
    // input
    const cv2 = cv; cv2.style.touchAction = 'none';
    cv2.addEventListener('pointerdown', e => { this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.down = { x: e.clientX, y: e.clientY, t: Date.now() }; this.drag = false; try { cv2.setPointerCapture(e.pointerId) } catch (x) { } if (this.ptr.size === 2) { const [a, b] = [...this.ptr.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y) } });
    cv2.addEventListener('pointermove', e => {
      const p = this.ptr.get(e.pointerId); if (!p) return;
      if (this.ptr.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...this.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch) this.zoom(this.pinch / d); this.pinch = d; this.drag = true }
      else { const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; if (this.down && Math.abs(e.clientX - this.down.x) + Math.abs(e.clientY - this.down.y) > 8) this.drag = true; if (this.drag) { if (this.fpv) { this.fpYaw -= dx * .006; this.fpPitch = Math.max(-.9, Math.min(.9, this.fpPitch - dy * .004)) } else if (this.walk) { this.wYaw -= dx * .006; this.wPitch = Math.max(.08, Math.min(.85, this.wPitch + dy * .004)) } else { this.tAz = null; this.az -= dx * .0085; this.pol = Math.max(.35, Math.min(1.35, this.pol - dy * .006)) } } }
    });
    const up = e => { const was = this.ptr.size === 1 && !this.drag && this.down && Date.now() - this.down.t < 450; this.ptr.delete(e.pointerId); this.pinch = 0; if (was) this.tap(e.clientX, e.clientY) };
    cv2.addEventListener('pointerup', up); cv2.addEventListener('pointercancel', e => { this.ptr.delete(e.pointerId) });
    cv2.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1) }, { passive: false });
    cv2.addEventListener('dblclick', () => this.reset());
    window.addEventListener('resize', () => this.resize()); try { const sh = document.getElementById('sheet'); if (sh && window.MutationObserver) new MutationObserver(() => this.refreshInset()).observe(sh, { attributes: true, attributeFilter: ['style'] }) } catch (e) {} this.resize()
  },
  /* ---------- the player's character: male / female models with walk, dance and wave ---------- */
  buildAvatar(gender, look) {
    const R = this.look = look || this.look || ACAvatar.defaultRender(gender), fem = (R.g || gender) === 'female', B = ACAvatar.BODIES[R.body] || ACAvatar.BODIES.average, W = ACAvatar.wardrobe(R, fem);
    const old = this.avatar, pos = old ? old.position.clone() : new THREE.Vector3(-1, 0, 1.2), ry = old ? old.rotation.y : 0;
    if (old) this.scene.remove(old);
    const C = c => new THREE.Color(c), SK = C(R.skin), SKD = C(R.skin).multiplyScalar(.82), HAIR = (R.hair && R.hair.color) || '#16100d', M = c => this.mat(c);
    const MSkin = c => new THREE.MeshPhongMaterial({ color: c, shininess: 22, specular: 0x443322 });   // a soft highlight instead of flat Lambert shading — this alone is most of what reads as "smooth skin" vs. "blocky"
    const cloth = (col, pat, c2) => { if (!pat || pat === 'solid') return M(col); const t = new THREE.CanvasTexture(ACAvatar.patternCanvas(pat, col, c2)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 1.5); return new THREE.MeshLambertMaterial({ map: t }) };
    const av = this.avatar = new THREE.Group(), body = new THREE.Group(), P = this.parts = { body }; av.add(body);
    const part = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (par || body).add(m); return m };
    const L1 = .36, L2 = .30, HIP = .74, lw = B.lw, T0 = W.torso, tcol = T0 ? T0.col : '#888', tpat = T0 && T0.pat, tc2 = T0 && T0.c2;
    const legCol = (lower) => (W.legs >= (lower ? 2 : 1) && W.legCol) ? M(W.legCol) : MSkin(SK);
    const sh = R.shoes || { k: 'sneaker', c1: '#f4f4f4', c2: '#2b2b2b' }, shc = ACAvatar.worn(sh.c1, sh.tatter), shc2 = ACAvatar.worn(sh.c2 || '#2b2b2b', sh.tatter);
    const leg = sx => {
      const hip = new THREE.Group(); hip.position.set(sx * (fem ? .125 : .15) * B.hp, HIP, 0); body.add(hip);
      const thighR = (fem ? .11 : .13) * lw;        // cylinders instead of boxes read as a rounded limb instead of a plank
      part(new THREE.CylinderGeometry(thighR * .92, thighR, L1, 10), legCol(false), 0, -L1 / 2, 0, hip);
      const knee = new THREE.Group(); knee.position.y = -L1; hip.add(knee);
      const calfR = (fem ? .09 : .11) * lw;
      part(new THREE.SphereGeometry(thighR * .85, 10, 8), legCol(false), 0, 0, 0, knee);                 // knee joint, so the thigh doesn't just stop dead into the calf
      part(new THREE.CylinderGeometry(calfR, calfR * .82, L2, 10), legCol(true), 0, -L2 / 2, 0, knee);
      part(new THREE.SphereGeometry(calfR * .9, 8, 6), legCol(true), 0, -L2, 0, knee);                     // the ankle itself — a distinct joint, not the calf fading straight into the shoe
      const foot = (sh.k === 'sandal' || sh.k === 'heel') ? MSkin(SK) : M(shc);
      part(new THREE.BoxGeometry(.25, sh.k === 'chunky' ? .09 : .06, .36), foot, 0, -L2 - .03, .06, knee);
      if (sh.k === 'sandal') part(new THREE.BoxGeometry(.26, .03, .12), M(shc), 0, -L2 - .02, .08, knee);
      if (sh.k === 'boot' || sh.k === 'hightop') part(new THREE.BoxGeometry(.22, .16, .2), M(shc), 0, -L2 + .06, -.02, knee);
      part(new THREE.BoxGeometry(.26, sh.k === 'chunky' ? .05 : .025, .4), M(shc2), 0, -L2 - (sh.k === 'chunky' ? .085 : .0675), .06, knee);
      if (R.jewel && R.jewel.ankle) { const t = part(new THREE.TorusGeometry(.1, .012, 6, 14), M(R.jewel.ankle.c1), 0, -L2 + .03, 0, knee); t.rotation.x = Math.PI / 2 }
      return { hip, knee };
    };
    P.legL = leg(-1); P.legR = leg(1);
    const T = P.torso = new THREE.Group(); T.position.y = .76; body.add(T); T.scale.set((B.sh + B.tw) / 2, 1, B.tw);
    part(new THREE.BoxGeometry((fem ? .5 : .6) * B.hp / ((B.sh + B.tw) / 2), .16, .3), M(W.pelvis), 0, -.04, 0, T);          // hips
    part(new THREE.BoxGeometry(fem ? .46 : .58, .56, fem ? .28 : .32), cloth(tcol, tpat, tc2), 0, .34, 0, T);                // top / chest
    if (T0 && T0.deco && ['collar', 'lapel', 'trim', 'embroidery', 'senator'].includes(T0.deco)) part(new THREE.BoxGeometry(.05, .5, .335), M(tc2 || '#fff'), 0, .34, 0, T);
    if (T0 && T0.deco === 'tie') part(new THREE.BoxGeometry(.07, .36, .335), M(tc2 || '#900'), 0, .36, 0, T);
    if (T0 && T0.deco === 'hivis') { part(new THREE.BoxGeometry(.6, .05, .335), M(tc2), 0, .26, 0, T); part(new THREE.BoxGeometry(.6, .05, .335), M(tc2), 0, .46, 0, T) }
    if (T0 && T0.deco === 'hood') part(new THREE.SphereGeometry(.15, 10, 8), M(tcol), 0, .66, -.12, T);
    part(new THREE.BoxGeometry(.4, .045, .3), M(tc2 || tcol), 0, .62, .005, T);                                             // neckline trim
    if (W.skirt) { const s = W.skirt, rr = s.r * 1.3 * B.hp, top = HIP + .1, hem = Math.max(.05, HIP - s.len * .85); P.skirt = part(new THREE.CylinderGeometry(.2 * B.hp, rr, top - hem, 18), cloth(s.col, s.pat, s.patCol), 0, (top + hem) / 2, 0, body); }
    if (W.robe) { const r = W.robe, top = 1.34, hem = Math.max(.05, HIP - r.len * .85), fk = r.fit || 1; P.robe = part(new THREE.CylinderGeometry(r.rt * 1.9 * B.sh * fk, r.rb * 1.5 * B.hp * fk, top - hem, 20), cloth(r.col, r.pat, r.patCol), 0, (top + hem) / 2, 0, body); }
    const arm = sx => {
      const sg = new THREE.Group(); sg.position.set(sx * (fem ? .31 : .4), .6, 0); T.add(sg);
      const w = W.slv >= 1 ? W.wide : 1, upR = (fem ? .07 : .09) * lw * w;
      part(new THREE.CylinderGeometry(upR * .9, upR, .3, 10), W.slv >= 1 && W.slvCol ? M(W.slvCol) : MSkin(SK), 0, -.13, 0, sg);
      const el = new THREE.Group(); el.position.y = -.28; sg.add(el);
      const loR = (fem ? .06 : .07) * lw * (W.slv >= 2 ? W.wide : 1);
      part(new THREE.SphereGeometry(upR * .8, 8, 6), W.slv >= 1 && W.slvCol ? M(W.slvCol) : MSkin(SK), 0, 0, 0, el);          // elbow joint
      part(new THREE.CylinderGeometry(loR, loR * .85, .3, 10), W.slv >= 2 && W.slvCol ? M(W.slvCol) : MSkin(SK), 0, -.15, 0, el);
      part(new THREE.SphereGeometry(fem ? .07 : .085, 10, 8), MSkin(SK), 0, -.34, 0, el);
      if (W.slv < 1) part(new THREE.SphereGeometry(.075, 8, 6), M(tcol), 0, .02, 0, sg);
      const J = R.jewel || {};
      if (J.wrist) { if (J.wrist.k === 'watch') { part(new THREE.BoxGeometry(.1, .06, .1), M(J.wrist.c2 || '#222'), 0, -.27, 0, el); part(new THREE.BoxGeometry(.13, .02, .13), M(J.wrist.c1), 0, -.27, 0, el) } else { const t = part(new THREE.TorusGeometry(.085, .015, 6, 14), M(J.wrist.c1), 0, -.27, 0, el); t.rotation.x = Math.PI / 2 } }
      if (J.ring && sx > 0) part(new THREE.SphereGeometry(.025, 6, 5), M(J.ring.c1), .03, -.4, .05, el);
      return { sg, el };
    };
    const aL = arm(-1), aR = arm(1); P.armL = { sh: aL.sg, el: aL.el }; P.armR = { sh: aR.sg, el: aR.el };
    part(new THREE.CylinderGeometry(fem ? .07 : .085, fem ? .08 : .095, .12, 10), MSkin(SKD), 0, .71, 0, T);       // neck
    const head = P.head = new THREE.Group(); head.position.y = 1.02; T.add(head);
    const skull = part(new THREE.SphereGeometry(fem ? .235 : .25, 26, 20), MSkin(SK), 0, 0, 0, head); skull.scale.set(.92, 1.08, .96);
    part(new THREE.SphereGeometry(.05, 8, 6), MSkin(SK), -.23, -.02, 0, head); part(new THREE.SphereGeometry(.05, 8, 6), MSkin(SK), .23, -.02, 0, head);
    const MK = R.makeup || {}, brows = [];
    const eye = sx => {
      const w = part(new THREE.SphereGeometry(.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), sx * .09, .04, .205, head); w.scale.set(1, .85, .5);
      const pu = part(new THREE.SphereGeometry(.026, 8, 6), new THREE.MeshBasicMaterial({ color: 0x120a06 }), sx * .09, .04, .228, head);
      const br = part(new THREE.BoxGeometry(.1, fem ? .012 : .018, .03), M(HAIR), sx * .09, fem ? .105 : .12, .215, head); brows.push(br);
      if (fem) { const l = part(new THREE.BoxGeometry(.05, .012, .03), M(HAIR), sx * .135, .085, .21, head); l.rotation.z = -sx * .5 }   // lashes
      if (MK.eyes) part(new THREE.BoxGeometry(.11, .035, .02), new THREE.MeshBasicMaterial({ color: MK.eyes.c, transparent: true, opacity: .7 * (MK.eyes.a || .7) }), sx * .09, .09, .213, head);
      if (MK.liner) { const l = part(new THREE.BoxGeometry(.06, .01, .02), new THREE.MeshBasicMaterial({ color: MK.liner.c }), sx * .14, .075, .207, head); l.rotation.z = -sx * .4 }
      if (MK.cheeks) part(new THREE.CircleGeometry(.05, 12), new THREE.MeshBasicMaterial({ color: MK.cheeks.c, transparent: true, opacity: .4 * (MK.cheeks.a || .7) }), sx * .13, -.05, .2, head).rotation.y = sx * .3;
      if (MK.glow) { if (MK.glow.id === 'mk_gems') [0, 1, 2].forEach(i => part(new THREE.SphereGeometry(.013, 6, 5), new THREE.MeshBasicMaterial({ color: MK.glow.c }), sx * (.16 + i * .01), .03 + i * .03, .17, head)); else part(new THREE.CircleGeometry(.04, 10), new THREE.MeshBasicMaterial({ color: MK.glow.c, transparent: true, opacity: .45 }), sx * .14, .0, .2, head) }
      return [w, pu];
    };
    P.eyes = [...eye(-1), ...eye(1)]; P.brows = brows;
    part(new THREE.SphereGeometry(.045, 8, 6), MSkin(SKD), 0, -.03, .235, head);                                    // nose
    const lipc = MK.lips ? MK.lips.c : (fem ? '#9c2f3f' : '#2a0f0b'), lipM = new THREE.MeshBasicMaterial({ color: lipc });
    P.mouths = {
      flat: part(new THREE.BoxGeometry(fem ? .1 : .11, fem ? .028 : .022, .03), M(lipc), 0, -.125, .215, head),
      smile: part(new THREE.TorusGeometry(.055, .014, 6, 12, Math.PI), lipM, 0, -.1, .215, head),
      frown: part(new THREE.TorusGeometry(.05, .014, 6, 12, Math.PI), lipM, 0, -.15, .215, head),
      open: part(new THREE.SphereGeometry(.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4a1218 }), 0, -.125, .21, head)
    };
    P.mouths.smile.rotation.z = Math.PI; P.mouths.open.scale.set(1, .8, .4);
    // hair
    const hs = ACAvatar.HS[(R.hair && R.hair.style) || 'lowcut'] || ACAvatar.HS.lowcut, hm = () => M(HAIR);
    if (hs.cap) { const rr = hs.cap[0] * (fem ? .275 : .27) * (hs.fade ? .96 : 1), hair = part(new THREE.SphereGeometry(rr, 20, 12, 0, Math.PI * 2, 0, Math.PI * (fem ? .6 : .56)), hm(), 0, .02 + (hs.fade ? .015 : 0), fem ? -.03 : -.02, head); hair.scale.set(1, 1.04, 1.04) }
    if (hs.flat) part(new THREE.BoxGeometry(.4, .09, .36), hm(), 0, .27, -.03, head);
    if (hs.rows) for (let k = -2; k <= 2; k++) part(new THREE.BoxGeometry(.012, .01, .5), M(ACAvatar.shade(HAIR, .35)), k * .06, .27 - Math.abs(k) * .025, -.03, head);
    if (hs.back === 'afro') part(new THREE.SphereGeometry(.42, 16, 12), hm(), 0, .1, -.06, head);
    if (hs.back === 'curly') { part(new THREE.SphereGeometry(.33, 14, 10), hm(), 0, .06, -.06, head); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; part(new THREE.SphereGeometry(.1, 8, 6), hm(), Math.cos(a) * .3, .06 + Math.sin(a) * .26, -.06, head) } }
    if (hs.puffs) [-1, 1].forEach(x => part(new THREE.SphereGeometry(.15, 10, 8), hm(), x * .2, .27, -.04, head));
    if (hs.buns) [-1, 1].forEach(x => part(new THREE.SphereGeometry(.11, 10, 8), hm(), x * .13, .3, -.04, head));
    if (hs.bun) part(new THREE.SphereGeometry(.13, 12, 10), hm(), 0, .27, -.07, head);
    if (hs.knots) for (let i = 0; i < hs.knots; i++) { const a = i / hs.knots * Math.PI * 2; part(new THREE.SphereGeometry(.07, 8, 6), hm(), Math.cos(a) * .17, .27, Math.sin(a) * .15 - .03, head) }
    if (hs.twists) for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, t = part(new THREE.BoxGeometry(.04, .16, .04), hm(), Math.cos(a) * .15, .33, Math.sin(a) * .13 - .03, head); t.rotation.z = -Math.cos(a) * .5; t.rotation.x = Math.sin(a) * .5 }
    if (hs.braid) for (let k = -2; k <= 2; k++) { const br = part(new THREE.BoxGeometry(.055, .62, .055), hm(), k * .1, -.2, -.2, head); br.rotation.x = .08; part(new THREE.SphereGeometry(.035, 6, 5), M(0xf0cf72), k * .1, -.5, -.19, head) }
    if (hs.strands) { const n = hs.strands[0], len = hs.strands[1] * 1.6; for (let i = 0; i < n; i++) { const th = (i / (n - 1) * 2 - 1) * 1.3, x = Math.sin(th) * .27, z = -Math.cos(th) * .25; const st = part(new THREE.BoxGeometry(.05, len, .05), hm(), x, .05 - len / 2, z, head); if (hs.strands[2]) for (let j = 1; j < 5; j++) part(new THREE.SphereGeometry(.032, 6, 5), M(j % 2 ? ACAvatar.shade(HAIR, .15) : HAIR), x, .05 - len * j / 5, z, head) } }
    if (hs.wig) { const wl = hs.wig * 1.7; part(new THREE.BoxGeometry(.56, wl, .16), hm(), 0, .05 - wl / 2, -.2, head); [-1, 1].forEach(x => part(new THREE.BoxGeometry(.07, wl * .8, .36), hm(), x * .27, .05 - wl * .4, -.04, head)) }
    if (R.hair && R.hair.messy) for (let i = 0; i < 5; i++) { const a = -1.1 + i * .55, t = part(new THREE.BoxGeometry(.02, .1, .02), hm(), Math.sin(a) * .22, .3, Math.cos(a) * .12 - .1, head); t.rotation.z = -a * .8 }
    // beard
    const bd = R.beard; if (bd && bd !== 'none') { const bm = new THREE.MeshLambertMaterial({ color: HAIR, transparent: bd === 'stubble', opacity: bd === 'stubble' ? .35 : 1 });
      if (bd === 'goatee') { part(new THREE.SphereGeometry(.07, 8, 6), bm, 0, -.2, .17, head); part(new THREE.BoxGeometry(.12, .02, .03), bm, 0, -.09, .225, head) }
      else if (bd === 'mustache') part(new THREE.BoxGeometry(.13, .025, .03), bm, 0, -.09, .225, head);
      else if (bd === 'lineup') { part(new THREE.BoxGeometry(.38, .018, .02), bm, 0, -.2, .17, head) }
      else { const bb = part(new THREE.SphereGeometry(.2, 12, 10), bm, 0, -.1, .06, head); bb.scale.set(1.05, bd === 'full' ? 1.05 : .8, 1) } }
    // headwear, face, neck, jewellery
    this.addAccessories3(R, head, T, part, M, C, hm);
    const shd = new THREE.Mesh(new THREE.CircleGeometry(.42, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .28 })); shd.rotation.x = -Math.PI / 2; shd.position.y = .02; av.add(shd);
    if (R.fresh) { const sp = P.sparks = new THREE.Group(); sp.position.y = 1.9; av.add(sp); for (let i = 0; i < 3; i++) { const o = new THREE.Mesh(new THREE.OctahedronGeometry(.05), new THREE.MeshBasicMaterial({ color: 0xffe27a })); o.position.set(Math.cos(i * 2.1) * .5, Math.sin(i * 1.3) * .15, Math.sin(i * 2.1) * .5); sp.add(o) } }
    av.position.copy(pos); av.rotation.y = ry; this.scene.add(av);
    this.tp = {}; this.ph = this.ph || 0; this.tt = this.tt || 0; this.spin = 0;
    if (!this.pose) this.pose = {}; Object.assign(this.pose, ACPOSE.idle());
    this.applyMood(R.mood);
  },
  /* hats, scarves, glasses, necklaces, earrings, held items */
  addAccessories3(R, head, T, part, M, C, hm) {
    const J = R.jewel || {}, B = THREE;
    const h = R.head;
    if (h) { const c1 = h.c1, c2 = h.c2 || ACAvatar.shade(c1, -.3), pm = (col) => (h.pat && h.pat !== 'solid' && col === c1) ? (() => { const t = new B.CanvasTexture(ACAvatar.patternCanvas(h.pat, c1, c2)); return new B.MeshLambertMaterial({ map: t }) })() : M(col);
      switch (h.k) {
        case 'gele': { const g = part(new B.SphereGeometry(.34, 14, 10), pm(c1), -.03, .3, -.02, head); g.scale.set(1.25, .8, 1); part(new B.SphereGeometry(.2, 10, 8), M(ACAvatar.shade(c1, .12)), .2, .45, 0, head); part(new B.SphereGeometry(.16, 10, 8), M(c2), -.18, .5, 0, head); break; }
        case 'fila': { const f = part(new B.SphereGeometry(.28, 12, 8), M(c1), .04, .3, -.02, head); f.scale.set(1, .8, 1); f.rotation.z = -.4; part(new B.CylinderGeometry(.27, .27, .09, 16), M(c2), 0, .2, -.02, head); break; }
        case 'redcap': { part(new B.CylinderGeometry(.27, .29, .22, 16), M(c1), 0, .3, -.02, head); part(new B.CylinderGeometry(.285, .29, .06, 16), M(c2), 0, .22, -.02, head); break; }
        case 'hausacap': { part(new B.CylinderGeometry(.2, .29, .24, 16), M(c1), 0, .3, -.02, head); part(new B.CylinderGeometry(.28, .29, .04, 16), M(c2), 0, .2, -.02, head); break; }
        case 'beanie': { const b = part(new B.SphereGeometry(.29, 14, 10, 0, Math.PI * 2, 0, Math.PI * .55), M(c1), 0, .1, -.02, head); b.scale.y = 1.1; part(new B.CylinderGeometry(.29, .29, .07, 16), M(c2), 0, .13, -.02, head); part(new B.SphereGeometry(.07, 8, 6), M(c2), 0, .43, -.02, head); break; }
        case 'cap': { part(new B.SphereGeometry(.28, 14, 10, 0, Math.PI * 2, 0, Math.PI * .5), M(c1), 0, .12, -.02, head); part(new B.BoxGeometry(.3, .02, .22), M(c2), 0, .13, .3, head); break; }
        case 'bucket': { part(new B.SphereGeometry(.28, 14, 10, 0, Math.PI * 2, 0, Math.PI * .5), M(c1), 0, .12, -.02, head); part(new B.CylinderGeometry(.42, .42, .02, 18), M(ACAvatar.shade(c1, -.08)), 0, .13, -.02, head); break; }
        case 'crown': { part(new B.CylinderGeometry(.28, .28, .08, 16), M(c1), 0, .26, -.02, head); for (let i = -2; i <= 2; i++) { part(new B.BoxGeometry(.04, .18 + (i === 0 ? .06 : 0), .04), M(c2), i * .1, .38, .05, head); part(new B.SphereGeometry(.045, 6, 5), M(i % 2 ? c1 : c2), i * .1, .5 + (i === 0 ? .05 : 0), .05, head) } break; }
        case 'headtie': { part(new B.CylinderGeometry(.27, .27, .12, 16), pm(c1), 0, .22, -.02, head); part(new B.SphereGeometry(.12, 8, 6), M(c1), .2, .34, 0, head); part(new B.SphereGeometry(.09, 8, 6), M(c2), .28, .3, 0, head); break; }
      } }
    const f = R.face; if (f) { if (f.k === 'shades') { part(new B.BoxGeometry(.4, .09, .02), new B.MeshBasicMaterial({ color: f.c1 }), 0, .045, .235, head) } else { [-1, 1].forEach(x => { const t = part(new B.TorusGeometry(.065, .008, 6, 14), new B.MeshBasicMaterial({ color: f.c1 }), x * .09, .045, .24, head); t.scale.y = .9 }); part(new B.BoxGeometry(.06, .008, .01), new B.MeshBasicMaterial({ color: f.c1 }), 0, .06, .24, head) } }
    const nw = R.neckwear; if (nw) { const c1 = nw.c1, c2 = nw.c2 || ACAvatar.shade(c1, -.3);
      if (nw.k === 'coral') { for (let i = 0; i < 11; i++) { const a = i / 10 * Math.PI - Math.PI, x = Math.cos(a) * .24, y = .62 - Math.sin(-a) * .2 - .02; part(new B.SphereGeometry(.04, 6, 5), M(i % 3 ? c1 : c2), x, y, .17 + Math.sin(-a) * .02, T) } }
      else { const t = part(new B.TorusGeometry(.12, .045, 8, 16), M(c1), 0, .67, 0, T); t.rotation.x = Math.PI / 2; part(new B.BoxGeometry(.1, .3, .04), M(c2), .05, .5, .15, T) } }
    if (J.neck) { const n = J.neck, col = n.c1;
      if (n.k === 'choker') { const t = part(new B.TorusGeometry(.1, .014, 6, 16), M(col), 0, .69, 0, T); t.rotation.x = Math.PI / 2 }
      else { for (let i = 0; i < 11; i++) { const a = i / 10 * Math.PI, x = -Math.cos(a) * .2, y = .62 - Math.sin(a) * .16; part(new B.SphereGeometry(n.k === 'pearls' ? .03 : .018, 6, 5), M(n.k === 'pearls' ? '#f4f4f0' : col), x, y, .17, T) } if (n.k === 'pendant') part(new B.SphereGeometry(.05, 8, 6), M(n.c2 || col), 0, .43, .18, T) } }
    if (J.ear) [-1, 1].forEach(x => { if (J.ear.k === 'hoops') { const t = part(new B.TorusGeometry(.045, .008, 6, 12), M(J.ear.c1), x * .235, -.07, 0, head); t.rotation.y = Math.PI / 2 } else part(new B.SphereGeometry(.028, 6, 5), M(J.ear.c1), x * .235, -.03, 0, head) });
    if (J.waist) { const t = part(new B.TorusGeometry(.3, .02, 6, 20), M(J.waist.c1), 0, 0, 0, T); t.rotation.x = Math.PI / 2 }
    const hd = R.hand; if (hd) { const el = this.parts.armR.el, c1 = hd.c1, c2 = hd.c2 || ACAvatar.shade(c1, -.3);
      if (hd.k === 'staff') part(new B.CylinderGeometry(.02, .02, 1.5, 8), M(c1), .06, -.5, .1, el), part(new B.SphereGeometry(.05, 8, 6), M(c2), .06, .27, .1, el);
      else if (hd.k === 'fan') { part(new B.CylinderGeometry(.012, .012, .3, 6), M('#7a4b2a'), .05, -.5, .08, el); const d = part(new B.CylinderGeometry(.2, .2, .02, 16), M(c1), .05, -.7, .08, el); d.rotation.x = Math.PI / 2; part(new B.CylinderGeometry(.12, .12, .03, 14), M(c2), .05, -.7, .09, el).rotation.x = Math.PI / 2 }
      else if (hd.k === 'umbrella') { part(new B.CylinderGeometry(.012, .012, 1.1, 6), M('#333'), .06, .15, .08, el); part(new B.ConeGeometry(.55, .22, 16), M(c1), .06, .75, .08, el) }
      else if (hd.k === 'clutch') part(new B.BoxGeometry(.2, .14, .06), M(c1), .05, -.5, .08, el); }
  },
  setGender(g) { g = g === 'female' ? 'female' : 'male'; if (g === this.gender) return; this.gender = g; if (this.on && this.scene) this.buildAvatar(g, this.look && this.look.g === g ? this.look : null) },
  /* the player's full look (from the Style app). Rebuilds the character where it stands. */
  setLook(r) { if (!r) return; this.look = r; this.gender = r.g || this.gender; if (this.on && this.scene) this.buildAvatar(this.gender, r) },
  setExt(e) { this.ext = e || {} },
  setPose(n) { this.poseName = n || ''; if (n) this.em = null },
  setMood(m) { if (this.look) this.look.mood = m; this.applyMood(m) },
  /* mood changes only the face (no rebuild) */
  applyMood(m) {
    const P = this.parts; if (!P || !P.mouths) return; m = m || 'neutral'; this.mood = m;
    const pick = { happy: 'smile', calm: 'smile', excited: 'open', sad: 'frown', angry: 'frown' }[m] || 'flat';
    for (const k in P.mouths) P.mouths[k].visible = k === pick;
    const tilt = { angry: -1, sad: 1, stressed: 1, shy: .5 }[m] || 0; P.brows.forEach((b, i) => { b.rotation.z = tilt * (i ? -.35 : .35) });
  },
  /* emote('dance') starts dancing (tap again for the next move), emote('wave') waves, emote(null) stops */
  emote(k) {
    if (k === 'dance') { if (this.em === 'dance') this.dn = (this.dn + 1) % ACPOSE.DANCES; else { this.em = 'dance'; this.dn = this.dn || 0 } }
    else this.em = k || null
  },
  /* drive every joint from the current pose; moving = walking along the path */
  animate(t, dt, moving) {
    const P = this.parts, ps = this.pose, tp = this.tp, ext = this.ext || {}, st = moving ? 'walk' : (this.em || (this.poseName ? 'pose' : 'idle'));
    if (this.em && moving) { this.em = null; if (window.emoteEnded) window.emoteEnded() }
    const rate = st === 'walk' ? 1.3 : st === 'dance' ? [1.15, 1.15, 1.0, 1.4][this.dn % ACPOSE.DANCES] : st === 'wave' ? 1 : 0;
    if (this.laststate !== st && st === 'wave') this.ph = 0; this.laststate = st;
    this.ph += dt * Math.PI * 2 * rate; this.tt += dt;
    if (st === 'dance' && this.dn % ACPOSE.DANCES === 2) this.spin += dt * 5.2; else this.spin += (Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2 - this.spin) * Math.min(1, dt * 7);
    ACPOSE.target(tp, st, this.ph, this.tt, this.dn || 0, { walk: ext.walk, idle: ext.idle, reduce: ext.reduce, pose: this.poseName, mood: this.mood });
    const k = 1 - Math.exp(-dt * 14); for (const key in tp) ps[key] += (tp[key] - ps[key]) * k;
    const c = Math.cos, L1 = .36, L2 = .30;
    const lg = (g, sx, a, b, kn) => { g.hip.rotation.set(-a, 0, sx * b); g.knee.rotation.x = kn; return L1 * c(a) * c(b) + L2 * c(a - kn) * c(b * .5) + .08 };
    const dL = lg(P.legL, -1, ps.ll, ps.llb, ps.llk), dR = lg(P.legR, 1, ps.rl, ps.rlb, ps.rlk);
    P.body.position.y = Math.max(dL, dR) - .74 + ps.lift; P.body.rotation.y = this.spin;
    const ar = (g, sx, a1, b1, a2, b2) => { g.sh.rotation.set(-a1, 0, sx * b1); g.el.rotation.set(-(a2 - a1), 0, sx * (b2 - b1)) };
    ar(P.armL, -1, ps.la1, ps.lb1, ps.la2, ps.lb2); ar(P.armR, 1, ps.ra1, ps.rb1, ps.ra2, ps.rb2);
    P.torso.rotation.set(ps.lean, ps.twist, 0); P.torso.position.x = ps.sx;
    P.head.rotation.set(0, st === 'idle' && !ext.reduce ? Math.sin(t / 1900) * .25 : 0, ps.head);
    if (P.sparks) { P.sparks.visible = !ext.noSparkle; P.sparks.rotation.y += dt * 1.5 }
    const bl = ((t % 4200) < 130 ? .1 : 1) * (this.mood === 'sleepy' ? .35 : 1); P.eyes.forEach((e, i) => { e.scale.y = (i === 0 || i === 2 ? bl * .85 : bl) });
    if (P.skirt) P.skirt.rotation.x = 0;
  },
  /* desktop shop view: the catalogue panel covers the right side, so the room is fitted into the space that is left of it */
  calcInset() { try { if (!document.body.classList.contains('dk') || this.page_ !== 'buy') return 0; const sh = document.getElementById('sheet'); return sh && sh.offsetWidth ? Math.round(sh.offsetWidth) : 0 } catch (e) { return 0 } },
  refreshInset() { if (!this.R) return; const n = this.calcInset(); if (n !== (this.insetR || 0)) this.resize() },
  resize() { if (!this.R) return; const a = document.getElementById('app'), w = a.clientWidth, h = a.clientHeight; if (!w || !h) return; this.insetR = this.calcInset(); this.W = w; this.H = h; this.R.setSize(w, h, false); this.cam.aspect = w / h; const effW = Math.max(240, w - this.insetR), half = 4.3 * Math.max(this.gw || 6, this.gd || 6) / 6, asp = Math.min(effW / h, 1.4); this.d0 = half / (Math.tan(this.cam.fov * Math.PI / 360) * asp); if (!this.userDist) this.dist = this.d0; this.applyShift() },
  applyShift() { if (this.fpv) return; const sh = this.shiftY * this.H; this.cam.setViewOffset(this.W, this.H, (this.insetR || 0) / 2, -sh, this.W, this.H); this.cam.updateProjectionMatrix() },
  zoom(f) { if (this.fpv) return; this.userDist = true; this.dist = Math.max(this.d0 * .35, Math.min(this.d0 * 1.5, this.dist * f)) },
  flip() { this.tAz = (this.tAz == null ? this.az : this.tAz) + Math.PI / 2 },
  reset() { this.userDist = false; this.dist = this.d0; this.pol = .95; this.tAz = Math.round((this.az - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4 },
  page(w) {
    if (w !== 'home' && this.fpv) this.setFirstPerson(false); if (w !== 'home' && this.walk) { this.setWalk(false); try { V2.walkUI(false) } catch (e) {} }
    this.page_ = w; if (!this.on) return; const show = w === 'home' || w === 'buy' || w === 'phone'; this.cv.style.display = show ? 'block' : 'none';
    this.shiftY = w === 'buy' ? (document.body.classList.contains('dk') ? .02 : -.17) : .05; this.resize()
  },
  /* Luxury finish (bought in Homes > Renovate): polished marble floor and cream walls on every floor */
  isLux() { return !!(S.activeProperty && S.activeProperty.finish === 'luxury') },
  paint(c) { if (this.isLux() && !(window.BUY && BUY.active && BUY.pp)) c = '#f1e6cf'; this.walls.forEach(w => w.m.material.color.set(c || '#d9a93a')) },
  finishApply() {
    if (!this.floor) return; const lux = this.isLux();
    if (!this.woodTx) this.woodTx = this.floor.material.map;
    if (lux && !this.marbleTx) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, 256, 256);
      let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(120,118,112,${.08 + rnd() * .12})`; g.lineWidth = .8 + rnd() * 1.6; g.beginPath(); let x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - .3) * 60; y += (rnd() - .5) * 60; g.lineTo(x, y) } g.stroke() }
      g.strokeStyle = 'rgba(190,150,60,.55)'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
      this.marbleTx = new THREE.CanvasTexture(cv); this.marbleTx.wrapS = this.marbleTx.wrapT = THREE.RepeatWrapping; this.marbleTx.repeat.set(2, 2); this.marbleTx.anisotropy = 8
    }
    const want = lux ? this.marbleTx : this.woodTx; if (this.floor.material.map !== want) { this.floor.material.map = want; this.floor.material.needsUpdate = true }
    this.paint(S.paint)
  },
  dark(b) { this.dark_ = !!b },
  env(dl) { this.dl = dl },
  /* only the furniture on the floor you are standing on */
  fItems() { return FURN.onFloor(S.items || [], S.floor || 0) },
  /* go to the other floor: S.floor + layout change, the character appears next to the stairs */
  setFloor(f) {
    const P = S.activeProperty; if (!P || !P.upstairs || !this.avatar) return false; f = Number(f) === 1 ? 1 : 0; if ((S.floor || 0) === f) return false;
    const st = (P.items || []).find(i => i.name === 'Grand Staircase' && i.placed !== false && !(Number(i.floor) > 0));
    S.floor = f; S.layout = homeLayout(P, f); this.occCache = null; this.sync();
    // stand on the free cell nearest the staircase
    if (st) { const occ = FURN.occupied(this.fItems()), cells = FURN.cellsOf(st); let best = null, bd = 1e9; for (let z = 0; z < this.gd; z++) for (let x = 0; x < this.gw; x++) { if (occ.has(x + ',' + z)) continue; const d = Math.min(...cells.map(c => Math.abs(c[0] - x) + Math.abs(c[1] - z))); if (d < bd) { bd = d; best = [x, z] } } if (best) this.avatar.position.set(this.cc(best[0]), 0, this.cc(best[1])); }
    this.path = []; this.onArrive = null; return true
  },
  setFirstPerson(on) {
    on = !!on; if (on === !!this.fpv || !this.avatar) { if (!this.avatar) return false; return this.fpv }
    this.fpv = on; this.joy = null; const cam = this.cam;
    if (on) { this.fpYaw = this.avatar.rotation.y; this.fpPitch = -.08; this.fpFov = cam.fov; cam.fov = 82; cam.near = .08; this.avatar.visible = false; this.setViewOffset0 = true; try { cam.clearViewOffset() } catch (e) {} }
    else { cam.fov = this.fpFov || 30; cam.near = 1; this.avatar.visible = true; this.applyShift() }
    cam.updateProjectionMatrix(); this.ceiling(); try { V2.joyShow(!!(this.fpv || this.walk)) } catch (e) { }   /* the eye view gets the joystick too */
    return this.fpv
  },
  /* Walk mode: the camera follows right behind your character INSIDE the home (the whole body shows) and a joystick moves them.
     Drag the screen to turn the view. Turned off again by the X on the eye button. */
  setWalk(on) {
    on = !!on; if (!this.avatar) return false; if (on === !!this.walk) return this.walk;
    if (on && this.fpv) this.setFirstPerson(false);
    const cam = this.cam; this.walk = on; this.joy = null;
    if (on) { this.wYaw = this.avatar.rotation.y; this.wPitch = .3; this.wFov = cam.fov; cam.fov = 62; cam.near = .1; this.path = []; this.occCache = null; try { cam.clearViewOffset() } catch (e) {} }
    else { cam.fov = this.wFov || 30; cam.near = 1; this.applyShift() }
    cam.updateProjectionMatrix(); this.ceiling(); return this.walk
  },
  setJoy(x, y) { this.joy = (x || y) ? { x, y } : null },
  /* can the character stand at (x,z) coming from (ox,oz)? inside the home, not on furniture, not through a wall */
  walkOk(ox, oz, x, z) {
    if (x < -2.75 || z < -2.75 || x > this.gw - 3.25 || z > this.gd - 3.25) return false;
    const a = [Math.floor(ox + 3), Math.floor(oz + 3)], b = [Math.floor(x + 3), Math.floor(z + 3)]; if (a[0] === b[0] && a[1] === b[1]) return true;
    const occ = this.occCache || (this.occCache = FURN.occupied(this.fItems())); if (occ.has(b[0] + ',' + b[1])) return false;
    if (this.layout && this.layout.wallSet && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1 && this.layout.wallSet.has(this.ek(a, b))) return false;
    return true
  },
  /* Ceiling: only exists while you look around from inside (first person), so the top of the room is closed in instead of open sky.
     In the normal bird's-eye view it is hidden so you can still see into the room. */
  ceiling() {
    if (!this.scene) return;
    const on = !!this.fpv || !!this.walk, y = (this.layout && this.layout.model && this.shellTop) || this.WALL_H, gw = this.gw || 6, gd = this.gd || 6;
    if (!this.ceilM) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xf6f0e4, side: THREE.DoubleSide }));
      m.rotation.x = Math.PI / 2; m.visible = false; this.scene.add(m); this.ceilM = m
    }
    // interior partition walls (homes with extra rooms) rise to the ceiling while you look around from inside
    if (this.fxWalls) for (const f of this.fxWalls) { const k = on ? y / f.h : 1; f.w.scale.y = k; f.w.position.y = f.h * k / 2; f.c.position.y = f.h * k + .02 }
    const m = this.ceilM; m.scale.set(this.layout ? gw : gw + .15, this.layout ? gd : gd + .15, 1); m.position.set(this.offX || 0, y, this.offZ || 0); m.visible = on;
    // the house model is cut off at the wall tops for the bird's-eye view: in first person lift the cut so the walls reach the ceiling
    if (this.shellPlane && this.layout && this.layout.model) this.shellPlane.constant = on ? y : this.layout.model.cutY
  },
  setLight(on) { this.roomLight = !!on; this.roomBoost = !!on;     // switching the light ON on purpose gives a slightly brighter room than the starting level
    try { localStorage.setItem('roomLight', on ? 'on' : 'off') } catch (e) {} },
  power() { return !this.dark_ || (S.items || []).some(i => i.placed !== false && FURN.ITEMS[i.name] && FURN.ITEMS[i.name].backup) || (window.homePowerTier && homePowerTier() === 'full') },
  /* ---------- furniture: every placed item is a model on the 6x6 grid ---------- */
  cc(c) { return -2.5 + c },
  B(w, h, d, c, x, y, z, par) { return this.box(w, h, d, c, x, y, z, par) },
  model(name) {
    const D = FURN.ITEMS[name], [w, d] = [D.w || 1, D.d || 1], c = D.color, g = new THREE.Group(), B = (a, b, cc, col, x, y, z) => this.B(a, b, cc, col, x, y, z, g), K = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
    if (this.modelMore(D, g, B, K, w, d, c)) return g;
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
      case 'stairs': { const n = 9, run = 2.7, H = this.WALL_H; for (let k = 0; k < n; k++) { const h = (k + 1) * H / n; this.B(1.8, h, run / n + .02, k % 2 ? 0x9a7650 : 0x8a6a45, 0, h / 2, -run / 2 + (k + .5) * run / n, g) } const L = Math.hypot(run, H - .3); for (const sx of [-.93, .93]) { const rl = this.B(.06, .06, L, 0x3b2a1a, sx, (H + .3) / 2 + .55, 0, g); rl.rotation.x = -Math.atan2(H - .3, run) } break }
      case 'solar': { B(.78, .86, .52, 0x2c3a55, 0, .43, 0); B(.7, .05, .46, 0x14203f, 0, .9, 0); const pn = B(.9, .05, .62, 0x1b2f66, 0, 1.15, -.04); pn.rotation.x = -.45; B(.5, .04, .3, 0x5b7fd6, 0, 1.17, -.05).rotation.x = -.45; this.cyl(.035, .03, 0x3ddc84, .26, .62, .27, g); break }
      case 'pendant': { const H = this.WALL_H; this.cyl(.012, .5, 0x222222, 0, H - .25, 0, g); this.cyl(.17, .14, K(c, .9), 0, H - .55, 0, g); g.userData.lamp = { y: H - .66, r: .07 }; break }
      case 'fan': { const H = this.WALL_H, bl = new THREE.Group(); bl.position.set(0, H - .36, 0); g.add(bl); this.cyl(.012, .22, 0x222222, 0, H - .12, 0, g); this.cyl(.1, .1, 0x555555, 0, H - .3, 0, g); for (let k = 0; k < 4; k++) { const a = new THREE.Group(); a.rotation.y = k * Math.PI / 2; const b = this.B(.62, .02, .13, c, .4, 0, 0, a); bl.add(a) } g.userData.fan = bl; g.userData.lamp = { y: H - .42, r: .06 }; break }
      case 'chandelier': { const H = this.WALL_H; this.cyl(.012, .35, 0x222222, 0, H - .17, 0, g); this.cyl(.34, .035, 0xc9a24a, 0, H - .45, 0, g); this.cyl(.05, .22, 0xc9a24a, 0, H - .38, 0, g); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; this.cyl(.015, .12, 0xf6ecc8, Math.cos(a) * .32, H - .36, Math.sin(a) * .32, g); const fl = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); fl.position.set(Math.cos(a) * .32, H - .27, Math.sin(a) * .32); g.add(fl) } g.userData.lamp = { y: H - .5, big: true, r: .12 }; break }
      case 'stand': { this.cyl(.2, .05, 0x3a3a3a, 0, .03, 0, g); this.cyl(.03, 1.5, 0x3a3a3a, 0, .78, 0, g); g.userData.lamp = { y: 1.68 }; break }
    }
    return g
  },
  /* More things to buy: household extras, utilities, street-life stuff and cars. Plain boxes and cylinders in the same low-poly style. */
  modelMore(D, g, B, K, w, d, c) {
    const T = this, cyl = (r, h, col, x, y, z) => T.cyl(r, h, col, x, y, z, g), wheel = (x, y, z, r) => { r = r || .34; const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .26, 14), T.mat(0x17171a)); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); g.add(m); const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * .5, r * .5, .28, 10), T.mat(0xb9bcc2)); hub.rotation.z = Math.PI / 2; hub.position.set(x, y, z); g.add(hub) };
    const disc = (r, t, col, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 16), T.mat(col)); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m };
    const ball = (r, col, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), T.mat(col)); m.position.set(x, y, z); g.add(m); return m };
    const cone = (r, h, col, x, y, z, seg) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 8), T.mat(col)); m.position.set(x, y, z); g.add(m); return m };
    const legs4 = (W, Dp, h, col, t) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(t || .06, h, t || .06, col, sx * W / 2, h / 2, sz * Dp / 2) };
    switch (D.kind) {
      case 'bunk': { for (const [y, k] of [[.22, 1], [1.0, 1.1]]) { B(w - .1, .12, d - .1, 0x7a5a3a, 0, y, 0); B(w - .22, .16, d - .22, k > 1 ? 0x4a6fa5 : c, 0, y + .14, 0) } for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(.07, 1.5, .07, 0x5a3f27, sx * (w / 2 - .05), .75, sz * (d / 2 - .05)); B(.08, .3, d - .1, 0x5a3f27, w / 2 - .06, 1.25, 0); break }
      case 'wardrobe': { B(w - .1, 1.9, .7, c, 0, .96, 0); B(.03, 1.7, .02, K(c, .55), 0, .96, .36); B(.05, .22, .03, 0xd8c27a, -.1, .95, .37); B(.05, .22, .03, 0xd8c27a, .1, .95, .37); break }
      case 'microwave': { B(.8, .5, .6, 0x4a4d55, 0, .25, 0); B(.7, .36, .5, c, 0, .68, 0); B(.44, .24, .02, 0x15191f, -.08, .68, .26); B(.12, .24, .02, 0x7a7f88, .24, .68, .26); break }
      case 'freezer': { B(w - .1, .8, .75, c, 0, .42, 0); B(w - .06, .06, .79, 0xb9c0c9, 0, .85, 0); B(.04, .04, .4, 0x888888, 0, .8, .4); break }
      case 'island': { B(w - .1, .9, .8, 0x8a8f99, 0, .45, 0); B(w, .07, .9, 0xe3dfd3, 0, .93, 0); for (const sx of [-.4, .4]) { cyl(.17, .08, 0x3a3f4a, sx, .5, .62); cyl(.03, .5, 0x777777, sx, .25, .62) } break }
      case 'diningset': { B(w - .6, .08, d - .8, c, 0, .78, 0); legs4(w - .8, d - 1, .78, K(c, .7), .08); for (const [x, z, r] of [[-.8, -1.0, 0], [0, -1.0, 0], [.8, -1.0, 0], [-.8, 1.0, 1], [0, 1.0, 1], [.8, 1.0, 1]]) { B(.42, .07, .42, 0xd9d2c3, x, .46, z); B(.42, .5, .06, 0xd9d2c3, x, .74, z + (r ? .2 : -.2)); B(.05, .44, .05, 0x7a5a3a, x - .16, .22, z - .16); B(.05, .44, .05, 0x7a5a3a, x + .16, .22, z + .16) } break }
      case 'cylinder': { cyl(.2, .8, c, 0, .4, 0); cyl(.09, .12, 0x888888, 0, .86, 0); cyl(.04, .1, 0x333333, 0, .96, 0); break }
      case 'washer': { B(.8, .9, .75, c, 0, .46, 0); disc(.25, .05, 0x2a3440, 0, .5, .39); disc(.17, .04, 0x8fb7d6, 0, .5, .42); B(.7, .12, .02, 0x6b7280, 0, .86, .39); break }
      case 'bathtub': { B(w - .1, .55, .9, c, 0, .28, 0); B(w - .34, .3, .66, 0xbfe3f5, 0, .5, 0); cyl(.04, .3, 0x999999, -w / 2 + .2, .75, -.3); break }
      case 'coffee': { B(.85, .06, .6, c, 0, .42, 0); legs4(.7, .45, .4, K(c, .7), .05); B(.4, .02, .3, 0xd8c8a8, 0, .46, 0); break }
      case 'tvstand': { B(w - .1, .5, .45, c, 0, .26, 0); B(1.3, .75, .06, 0x0b0b0e, 0, .96, 0); B(1.2, .64, .02, 0x1b2a3f, 0, .96, .04); B(.3, .05, .2, 0x222222, 0, .56, 0); break }
      case 'bookshelf': { B(.88, 1.7, .36, c, 0, .86, 0); for (let r = 0; r < 4; r++) { B(.84, .03, .34, K(c, .75), 0, .3 + r * .38, 0); for (let k = 0; k < 5; k++) B(.1, .26, .22, [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad][(k + r) % 5], -.34 + k * .17, .46 + r * .38, 0) } break }
      case 'desk': { B(w - .1, .06, .7, c, 0, .76, 0); legs4(w - .3, .55, .76, K(c, .6), .07); B(.62, .4, .05, 0x101114, 0, 1.06, -.15); B(.62, .34, .01, 0x2a5fa8, 0, 1.06, -.12); B(.1, .2, .1, 0x333333, 0, .9, -.15); B(.5, .02, .18, 0x2a2d33, 0, .8, .12); B(.4, .3, .45, 0x222428, w / 2 - .4, .5, .02); break }
      case 'rug': { B(w - .2, .03, d - .2, c, 0, .02, 0); B(w - .6, .035, d - .6, K(c, 1.35), 0, .025, 0); B(w - 1, .04, d - 1, K(c, .7), 0, .03, 0); break }
      case 'plant': { cyl(.2, .28, 0xb5654a, 0, .14, 0); for (const [x, y, z, r] of [[0, .72, 0, .3], [-.18, .52, .05, .2], [.2, .56, -.05, .22], [0, .98, .02, .2]]) ball(r, c, x, y, z); break }
      case 'ac': { B(.55, 1.5, .42, c, 0, .76, 0); B(.46, .06, .02, 0x9aa3ad, 0, 1.28, .22); B(.46, .06, .02, 0x9aa3ad, 0, 1.18, .22); B(.1, .04, .02, 0x3ddc84, .16, .5, .22); break }
      case 'treadmill': { B(.7, .12, d - .4, 0x2d2f36, 0, .15, 0); B(.6, .04, d - .6, 0x111114, 0, .23, .05); B(.08, 1.0, .08, 0x555a63, -.28, .7, -.5); B(.08, 1.0, .08, 0x555a63, .28, .7, -.5); B(.7, .26, .1, 0x1a1d22, 0, 1.2, -.5); B(.5, .12, .02, 0x3ddc84, 0, 1.2, -.44); break }
      case 'piano': { B(w - .1, .9, d - .5, c, 0, .62, .1); B(w - .2, .06, .44, 0xf5f5f0, 0, .94, .62); for (const sx of [-.7, .7]) B(.1, .6, .1, K(c, 1.4), sx, .3, .9); B(.8, .08, .4, 0x2a2a2e, 0, .42, 1.2); B(w - .1, .04, d - .5, K(c, 1.5), 0, 1.1, -.1); break }
      case 'battery': { B(.6, .5, .4, c, 0, .26, 0); B(.5, .12, .02, 0x3ddc84, 0, .44, .21); B(.06, .06, .06, 0xff5555, .22, .56, 0); break }
      case 'biggen': { B(1.7, .9, .8, c, 0, .52, 0); B(1.3, .6, .62, 0x26282d, -.1, .55, 0); B(.5, .3, .02, 0x14161a, .5, .6, .42); for (const sx of [-.7, .7]) wheel(sx, .17, .38, .15); B(.26, .42, .2, 0xd33a2e, .98, .3, .1); break }
      case 'tank': { for (const sx of [-.7, .7]) for (const sz of [-.7, .7]) B(.09, 1.0, .09, 0x6b4a2a, sx, .5, sz); B(1.7, .08, 1.7, 0x6b4a2a, 0, 1.0, 0); cyl(.85, 1.3, c, 0, 1.7, 0); cyl(.5, .12, K(c, .8), 0, 2.4, 0); for (const y of [1.3, 1.7, 2.05]) cyl(.88, .05, K(c, 1.4), 0, y, 0); break }
      case 'pump': { B(.55, .4, .5, c, 0, .22, 0); cyl(.07, .9, 0x8a8f99, .1, .85, 0); B(.3, .2, .02, 0x14161a, 0, .3, .26); break }
      case 'kiosk': { B(1.7, 1.2, 1.4, c, 0, .62, -.1); B(1.72, .55, 1.42, 0x2d5fa6, 0, .29, -.1); const rf = B(2.1, .07, 1.8, 0x9a6a4a, 0, 1.45, -.05); rf.rotation.x = .12; B(1.1, .5, .05, 0x15191f, 0, .92, .62); const aw = B(1.5, .05, .5, 0x4a74b8, 0, 1.2, .9); aw.rotation.x = .3; B(1.2, .12, .4, 0x8a6a45, -.2, .32, 1.15); B(.4, .4, .4, 0x8a6a45, .7, .2, 1.1); break }
      case 'cart': { B(1.3, .3, .8, c, 0, .62, 0); B(1.1, .26, .6, 0xe9dfc4, -.1, .9, 0); B(.5, .3, .4, 0x2f6fd1, .3, 1.12, 0); B(.3, .35, .3, 0xe8c21a, -.35, 1.1, .1); disc(.38, .08, 0x5a3f27, 0, .38, .46); disc(.38, .08, 0x5a3f27, 0, .38, -.46); const h1 = B(.06, .06, 1.0, 0x5a3f27, .95, .85, .3); h1.rotation.y = .1; const h2 = B(.06, .06, 1.0, 0x5a3f27, .95, .85, -.3); h2.rotation.y = -.1; break }
      case 'shelter': { for (const sx of [-1.3, 1.3]) for (const sz of [-.4, .4]) B(.08, 2.1, .08, c, sx, 1.05, sz); const rf = B(3, .07, 1.1, K(c, 1.1), 0, 2.15, 0); B(2.9, .07, .5, K(c, 1.2), 0, 2.2, -.1); B(2.2, .12, .45, 0x6b8fc7, 0, .5, -.25); B(2.2, .5, .06, 0x6b8fc7, 0, .8, -.45); B(.5, .35, .04, 0xe8c21a, 1.0, 1.3, -.45); break }
      case 'stall': { B(1.8, .8, .9, 0x8a6a45, 0, .4, .2); for (const sx of [-.9, .9]) for (const sz of [-.8, .9]) B(.07, 1.9, .07, 0x6b4a2a, sx, .95, sz); const tp = B(2, .05, 1.9, 0x2f63b8, 0, 1.92, .05); tp.rotation.x = .1; cyl(.22, .3, 0xd9d9de, -.5, .95, .2); cyl(.2, .25, 0xd9d9de, .1, .93, .3); B(.62, .42, .42, 0x2d5fa6, .6, .95, .2); B(.35, .3, .05, 0xe8c21a, -.7, .5, -.28); for (const [x, z, col] of [[-.8, .95, 0x3aa65a], [.9, .95, 0x9b59b6]]) cyl(.16, .4, col, x, .2, z); break }
      case 'umbtable': { cyl(.04, 1.9, 0x555555, 0, .95, 0); cone(1.05, .42, 0xe8b52a, 0, 1.95, 0, 8); cone(.7, .43, 0x8e5bb8, 0, 1.96, 0, 8); B(.9, .05, .9, 0x3f7fd0, 0, .72, 0); legs4(.7, .7, .72, 0x2a5fa8, .05); B(.45, .05, .45, 0xf4efe6, .65, .46, .5); B(.45, .5, .06, 0xf4efe6, .65, .72, .72); break }
      case 'container': { B(3.9, 1.8, 1.9, c, 0, .9, 0); B(2.2, .6, .05, 0xd9a95a, .5, 1.15, .97); const aw = B(2.4, .05, .6, 0xcbc4a8, .5, 1.55, 1.2); aw.rotation.x = .35; for (let k = 0; k < 8; k++) B(.03, 1.7, .02, K(c, .8), -1.8 + k * .5, .9, .96); B(.5, 1.7, .04, K(c, 1.2), -1.4, .9, .97); break }
      case 'icestand': { B(1.8, .7, .7, 0x8a6a45, 0, .36, 0); B(.7, .45, .45, c, -.45, .93, 0); B(.7, .05, .5, 0xe8f1ff, -.45, 1.18, 0); for (let k = 0; k < 4; k++) B(.25, .08, .18, 0xf4f8ff, .3 + (k % 2) * .3, .78 + Math.floor(k / 2) * .09, 0); cyl(.03, 1.6, 0x555555, .7, .8, -.2); cone(.75, .3, 0x2f6fd1, .7, 1.65, -.2, 8); cyl(.16, .4, 0x8e5bb8, .85, .2, .55); break }
      case 'dustbin': { B(.85, .9, .7, c, 0, .52, 0); const lid = B(.9, .08, .75, K(c, .8), 0, 1.0, -.12); lid.rotation.x = -.35; B(.5, .4, .1, 0x15151a, 0, 1.0, .1); disc(.14, .06, 0x2a2a2e, .3, .14, .38); disc(.14, .06, 0x2a2a2e, -.3, .14, .38); break }
      case 'plasticset': { B(.9, .05, .9, c, 0, .7, 0); legs4(.7, .7, .7, K(c, .8), .06); B(.46, .28, .36, 0xd33a2e, 0, .88, 0); for (let k = 0; k < 4; k++) cyl(.04, .26, [0x2d6a2d, 0x7a4a1a, 0x2d6a2d, 0xd9a62a][k], -.14 + (k % 2) * .28, 1.1, -.08 + Math.floor(k / 2) * .16); for (const [x, z, r] of [[-.75, 0, 1], [.75, 0, -1]]) { B(.42, .06, .42, 0xf4f4f6, x, .44, z); B(.06, .5, .42, 0xf4f4f6, x + r * .2, .72, z); B(.05, .42, .05, 0xf4f4f6, x - .16, .21, z - .16); B(.05, .42, .05, 0xf4f4f6, x + .16, .21, z + .16) } break }
      case 'tyres': { for (let k = 0; k < 4; k++) cyl(.38, .22, c, 0, .12 + k * .23, 0); for (let k = 0; k < 4; k++) cyl(.18, .24, 0x555555, 0, .12 + k * .23, 0); break }
      case 'car': {
        const st = D.style, rusty = st === 'rusty', body = rusty ? 0x56616b : c, glass = 0x1a2530, L = st === 'truck' ? 5.8 : 4.1, W = 1.75;
        if (st === 'truck') {
          B(1.3, .26, L, 0x2d2d31, 0, .5, 0); B(W, 1.45, 1.4, 0xf1f2f4, 0, 1.25, 2.1); B(W - .1, .5, .05, glass, 0, 1.6, 2.82); B(W + .05, .5, 1.1, 0xe3e5e8, 0, .7, 2.2);
          B(W, 1.85, 3.9, c, 0, 1.75, -.7); for (let k = 0; k < 10; k++) B(.03, 1.8, .02, K(c, .75), -.84 + k * .19, 1.75, 1.27);
          for (const z of [2.2, -1.6, -2.4]) for (const sx of [-1, 1]) wheel(sx * (W / 2), .42, z, .42);
        } else {
          B(W, .5, L, body, 0, .55, 0);
          const cab = { sedan: [2.1, .5, -.2], rusty: [2.1, .5, -.2], hatch: [2.6, .52, -.45], suv: [2.9, .66, -.35], prado: [3.0, .74, -.3], pickup: [1.5, .58, .75] }[st] || [2.1, .5, -.2];
          B(W - .12, cab[1], cab[0], body, 0, .8 + cab[1] / 2, cab[2]); B(W - .04, cab[1] * .62, cab[0] - .28, glass, 0, .86 + cab[1] / 2, cab[2]);
          if (st === 'pickup') { B(W - .12, .1, 1.9, body, 0, .83, -1.2); for (const sx of [-1, 1]) B(.08, .32, 1.9, body, sx * (W / 2 - .08), 1.0, -1.2); B(W - .12, .32, .08, body, 0, 1.0, -2.1) }
          if (st === 'suv' || st === 'prado') { for (const sx of [-.7, .7]) B(.05, .05, 2.5, 0x2a2a2e, sx, 1.52 + (st === 'prado' ? .08 : 0), -.35); if (st === 'prado') B(.9, .5, .14, body, 0, 1.0, -2.15) }
          B(.34, .16, .05, 0xffefb0, -.55, .66, L / 2); B(.34, .16, .05, 0xffefb0, .55, .66, L / 2); B(.3, .14, .05, 0xd43a3a, -.58, .66, -L / 2); B(.3, .14, .05, 0xd43a3a, .58, .66, -L / 2); B(W - .3, .1, .06, 0x2a2a2e, 0, .45, L / 2);
          for (const sx of [-1, 1]) for (const z of [L / 2 - .85, -(L / 2 - .85)]) { if (rusty && sx === 1 && z < 0) { B(.3, .24, .3, 0x9a8f7a, sx * (W / 2 - .05), .16, z); continue } wheel(sx * (W / 2), .34, z) }
          if (rusty) { B(.5, .02, .8, 0x8a5a3a, .3, 1.04 + .27, -.4); B(.6, .02, .5, 0x8a5a3a, -.4, .8 + .27, 1.1) }
        }
        break
      }
      default: return false
    }
    return true
  },
  ensureAvatarFree() {
    if (this.act) return;
    const occ = FURN.occupied(this.fItems()), a = this.avatar, cx = Math.floor(a.position.x + 3), cz = Math.floor(a.position.z + 3);
    if (!occ.has(cx + ',' + cz)) return; const f = this.nearestFree(cx, cz, occ); if (f) { a.position.set(this.cc(f[0]), 0, this.cc(f[1])); this.path = [] }
  },
  nearestFree(cx, cz, occ) { let best = null, bd = 1e9; for (let x = 0; x < this.gw; x++) for (let z = 0; z < this.gd; z++) { if (occ.has(x + ',' + z)) continue; const d = Math.abs(x - cx) + Math.abs(z - cz); if (d < bd) { bd = d; best = [x, z] } } return best },
  /* rebuild the room's furniture + lamps from S.items (placed ones) */
  /* The room. Square homes (6 / 8 / 10 cells) use the box shell and grow toward the east and south, so the door, window,
     AC and wall lamps on the west and north walls stay put. A home with a floor-plan `layout` (Family House) hides the box
     shell and shows its 3D house model instead (see models3d.js), with its own blocked cells and walls. */
  setRoom(L, G) {
    if (!this.scene) return; G = [6, 8, 10].includes(G) ? G : 6;
    const key = L ? L.id : G; if (key === this.roomKey) return; this.roomKey = key;
    const was = this.layout; this.layout = L || null; if (this.act) this.endAct(true);
    const gw = this.gw = L ? L.w : G, gd = this.gd = L ? L.d : G, offX = this.offX = (gw - 6) / 2, offZ = this.offZ = (gd - 6) / 2, shell = !!(L && L.model);
    this.floor.visible = this.slab.visible = !shell; this.walls.forEach(w => { w.m.visible = !shell }); (this.shellDecor || []).forEach(m => { m.visible = !shell });
    const gs = L ? Math.max(1, (Math.max(gw, gd) + 6) / 9) : 1; this.groundM.scale.set(gs, 1, gs); this.groundM.position.set(offX, -.45, offZ);
    if (shell) { if (window.M3D) { M3D.dropFixtures(this); M3D.houseShell(this, L) } }
    else {                                                   // the box room, any size: 6/8/10 square, or the Market Shop's 10 x 8
      if (window.M3D) { M3D.dropShell(this); if (L && L.rooms && L.rooms.length) M3D.bedroomRooms(this, L); else if (L && L.fixtures && L.fixtures.length) M3D.shopFixtures(this, L); else M3D.dropFixtures(this) }
      const lx = gw + .15, lz = gd + .15, ex = gw - 3 + .075, ez = gd - 3 + .075, geo = (m, w, h, d) => { m.geometry.dispose(); m.geometry = new THREE.BoxGeometry(w, h, d) };
      this.floor.geometry.dispose(); this.floor.geometry = new THREE.PlaneGeometry(gw, gd); this.floor.position.set(offX, 0, offZ); this.floor.material.map.repeat.set(gw / 2, gd / 2);
      geo(this.slab, gw + .5, .3, gd + .5); this.slab.position.set(offX, -.15, offZ);
      const WH = this.WALL_H, wy = WH / 2;
      geo(this.wW, .15, WH, lz); this.wW.position.set(-3.075, wy, offZ); geo(this.wN, lx, WH, .15); this.wN.position.set(offX, wy, -3.075);
      geo(this.wE, .15, WH, lz); this.wE.position.set(ex, wy, offZ); geo(this.wS, lx, WH, .15); this.wS.position.set(offX, wy, ez);
    }
    if (this.avatar && (L || was)) { const c = L ? L.start : null; this.avatar.position.set(c ? this.cc(c[0]) : -1, 0, c ? this.cc(c[1]) : 1.2); this.path = []; this.onArrive = null }
    this.ceiling(); this.resize()
  },
  ek(a, b) { const f = (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) ? [a, b] : [b, a]; return f[0][0] + ',' + f[0][1] + '|' + f[1][0] + ',' + f[1][1] },
  sync() {
    if (!this.on) return; this.setRoom(S.layout || null, S.grid || 6); this.petLoad(); if (this.petCfg && !this.pet3) this.petBuild(); if (!this.petCfg && this.pet3) { this.scene.remove(this.pet3); this.pet3 = null; if (this.petItem3) { this.scene.remove(this.petItem3); this.petItem3 = null } } const ig = this.itemsGroup; while (ig.children.length) ig.remove(ig.children[0]);
    this.finishApply(); this.occCache = null; this.lamps = []; this.fans = []; this.byId = {}; const items = this.fItems(), own = (n) => (S.items || []).some(i => i.name === n && i.placed !== false);
    const lamp = (x, y, z, big, par, glow) => { const bm = new THREE.MeshBasicMaterial({ color: 0x8a8466 }); const b = new THREE.Mesh(new THREE.SphereGeometry(glow || (big ? .11 : .1), 12, 10), bm); b.position.set(x, y, z); ig.add(b); let l; if (this.lamps.length < 8) { l = new THREE.PointLight(0xffd68a, 0, big ? 11 : 8); l.position.set(x, y - .1, z); ig.add(l) } else l = { intensity: 0 }; this.lamps.push({ l, bm, k: big ? 1.15 : .9 }) };
    if ((S.floor || 0) === 1 && S.layout && S.layout.blocked) for (const c of S.layout.blocked) { const [bx, bz] = String(c).split(',').map(Number); this.box(1, .05, 1, 0x14110e, this.cc(bx), .03, this.cc(bz), ig) }      // the stairwell opening upstairs
    for (const it of items) {
      if (it.placed === false || !FURN.isItem(it.name)) continue; const D = FURN.ITEMS[it.name];
      if (D.hang) {          // ceiling lights and fans: they hang over the cell you picked, in any room
        const g = this.model(it.name); g.position.set(this.cc(it.x), 0, this.cc(it.z)); g.userData.id = it.id; g.userData.name = it.name; ig.add(g); this.byId[it.id] = g;
        if (g.userData.fan) this.fans.push(g.userData.fan); if (g.userData.lamp) lamp(g.position.x, g.userData.lamp.y, g.position.z, !!g.userData.lamp.big, null, g.userData.lamp.r); continue
      }
      if (D.fixed) continue;
      const [w, d] = FURN.footprint(it.name, it.rot), g = this.model(it.name); g.position.set(this.cc(it.x) + (w - 1) / 2, 0, this.cc(it.z) + (d - 1) / 2); g.rotation.y = it.rot * Math.PI / 180; g.userData.id = it.id; g.userData.name = it.name; ig.add(g); this.byId[it.id] = g;
      if (g.userData.lamp) lamp(g.position.x, g.userData.lamp.y, g.position.z, false)
    }
    if (own('Ceiling Bulb')) { const bx = this.layout ? this.cc(this.layout.start[0]) : 0, bz = this.layout ? this.cc(this.layout.start[1]) : 0; this.cyl(.015, .18, 0x222222, bx, this.WALL_H - .09, bz, ig); lamp(bx, this.WALL_H - .26, bz, true) }
    if (own('Wall Lamp') && !this.layout) { const ly = this.WALL_H - .8; this.box(.12, .2, .22, 0x555555, -2.93, ly, .2, ig); lamp(-2.8, ly, .2); this.box(.22, .2, .12, 0x555555, 1.2, ly, -2.93, ig); lamp(1.2, ly, -2.8) }
    this.ensureAvatarFree(); if (this.selId) this.select(this.selId); if (this.ghostInfo) this.ghost(this.ghostInfo.name, this.ghostInfo.x, this.ghostInfo.z, this.ghostInfo.rot, this.ghostInfo.valid)
  },
  /* ---------- her pet cat (from the Pet app, when "Show in my room" is on): a small cat that wanders the floor ---------- */
  CATCOL: { jersey: 0x16a34a, hoodie: 0x475569, ankara: 0xf59e0b, asoebi: 0xd946ef, raincoat: 0xfacc15, apron: 0x22c55e },
  HATCOL: { fila: 0x7c3aed, party: 0xa855f7, gele: 0xe11d48, crown: 0xfbbf24, headlamp: 0xfde68a, danfo: 0xfacc15 },
  setPet(cfg) { this.petCfg = cfg || null; if (this.on && this.scene) this.petSync() },
  petLoad() {
    if (this.petAsked || !window.NET || !NET.user) return; this.petAsked = true;
      NET.api('/api/ac/pet/room').then(r => { if (r && r.on && !this.petCfg) { this.petCfg = { name: r.name, scale: r.stage.scale, worn: r.worn, roomItem: r.roomItem || 'bed' }; this.petSync() } }).catch(() => { this.petAsked = false });
  },
  petSync() { if (this.pet3) { this.scene.remove(this.pet3); this.pet3 = null } if (this.petItem3) { this.scene.remove(this.petItem3); this.petItem3 = null } if (this.petCfg) this.petBuild() },
  petBuild() {
    const c = this.petCfg, g = new THREE.Group(), fur = 0xf4a640, belly = 0xffe6bf, eye = 0x2b2140;
    if (this.petItem3) { this.scene.remove(this.petItem3); this.petItem3 = null; }
    const item = this.petItem3 = new THREE.Group(), itemId = c.roomItem || 'bed', pos = itemId === 'bed' ? [-2, -2] : itemId === 'scratch' ? [2, -2] : [2, 2];
    item.position.set(pos[0], 0, pos[1]);
    if (itemId === 'bed') { this.box(.9, .14, .68, 0x7c5ce5, 0, .08, 0, item); this.box(.7, .2, .5, 0xc4b5fd, 0, .22, .02, item); this.box(.28, .12, .32, 0xf5e7ff, -.2, .34, -.12, item); }
    else if (itemId === 'scratch') { this.box(.48, .12, .48, 0x8b5e3c, 0, .06, 0, item); this.cyl(.11, .78, 0xd3a47a, 0, .48, 0, item, 14); this.cyl(.16, .1, 0xb7791f, 0, .86, 0, item, 14); }
    else { this.cyl(.27, .1, 0xfbbf24, 0, .05, 0, item, 18); const ball = new THREE.Mesh(new THREE.SphereGeometry(.17, 14, 12), this.mat(0xef476f)); ball.position.set(0, .2, 0); item.add(ball); this.cyl(.025, .2, 0x22c55e, .07, .38, 0, item, 8); }
    this.scene.add(item);
    const S = (r, col, x, y, z, sx, sy, sz, par) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), this.mat(col)); m.position.set(x, y, z); if (sx) m.scale.set(sx, sy, sz); (par || g).add(m); return m };
    S(.2, fur, 0, .2, 0, 1, .9, 1.35); S(.14, belly, 0, .17, .08, 1, .9, 1.1);
    const outfit = this.CATCOL[c.worn && c.worn.body]; if (outfit) S(.215, outfit, 0, .2, -.02, 1, .92, 1.2);
    const head = new THREE.Group(); head.position.set(0, .38, .2); g.add(head); S(.17, fur, 0, 0, 0, 1, 1, 1, head);
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(.06, .12, 4), this.mat(fur)); ear.position.set(sx * .1, .15, 0); head.add(ear); S(.028, eye, sx * .065, .03, .15, 0, 0, 0, head) }
    S(.02, 0xe8527f, 0, -.02, .165, 0, 0, 0, head);
    const hat = this.HATCOL[c.worn && c.worn.hat]; if (hat) { const h = new THREE.Mesh(new THREE.ConeGeometry(.09, .14, 12), this.mat(hat)); h.position.set(0, .22, 0); head.add(h) }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .3, 8), this.mat(fur)); tail.position.set(0, .3, -.3); tail.rotation.x = -.8; g.add(tail);
    [[-.09, .1], [.09, .1], [-.09, -.12], [.09, -.12]].forEach(([x, z]) => S(.05, fur, x, .05, z));
    g.scale.setScalar(.75 + .5 * (c.scale || 1)); g.position.set(1, 0, 1); g.userData = { head, tail, tx: 1, tz: 1, wait: 1, ph: 0, roomItem: itemId };
    this.scene.add(g); this.pet3 = g;
  },
  petStep(t, dt) {
    const g = this.pet3; if (!g) return; const u = g.userData; u.wait -= dt;
    const dx = u.tx - g.position.x, dz = u.tz - g.position.z, d = Math.hypot(dx, dz);
    if (d > .06) { const sp = Math.min(d, 1.1 * dt); g.position.x += dx / d * sp; g.position.z += dz / d * sp; g.rotation.y = Math.atan2(dx, dz); u.ph += dt * 9; g.position.y = Math.abs(Math.sin(u.ph)) * .03 }
    else { g.position.y = 0; if (u.wait <= 0) {
      if (u.roomItem && Math.random() < .45) { const x = u.roomItem === 'bed' ? -2 : 2, z = u.roomItem === 'toy' ? 2 : -2; u.tx = x + (Math.random() - .5) * .7; u.tz = z + (Math.random() - .5) * .7; }
      else { u.tx = Math.random() * 4.4 - 2.2; u.tz = Math.random() * 4.4 - 2.2; }
      u.wait = 2 + Math.random() * 4;
    } }
    u.tail.rotation.z = Math.sin(t / 300) * .35; u.head.rotation.y = Math.sin(t / 1100) * .3;
  },
  /* ---------- buy mode helpers: ghost preview, selection ring, hide, thumbnails ---------- */
  ghost(name, x, z, rot, valid) {
    this.unghost(); this.ghostInfo = { name, x, z, rot, valid };
    const D = FURN.ITEMS[name]; if (D.hang) {          // preview of a ceiling light / fan: the fixture plus a coloured spot on the floor under it
      const g = this.model(name), col = new THREE.Color(valid ? 0x3ddc84 : 0xff4d4d); g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .78; if (o.material.emissive) o.material.emissive = col.clone().multiplyScalar(.35) } });
      g.position.set(this.cc(x), 0, this.cc(z)); this.scene.add(g); this.ghostG = g;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .35, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.set(g.position.x, .03, g.position.z); this.scene.add(pad); this.ghostPad = pad; return
    }
    if (D.fixed) return; const [w, d] = FURN.footprint(name, rot), g = this.model(name), col = new THREE.Color(valid ? 0x3ddc84 : 0xff4d4d);
    g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = .72; o.material.emissive = col.clone().multiplyScalar(.45) } });
    g.position.set(this.cc(x) + (w - 1) / 2, 0, this.cc(z) + (d - 1) / 2); g.rotation.y = rot * Math.PI / 180; this.scene.add(g); this.ghostG = g;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .35, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.set(g.position.x, .03, g.position.z); this.scene.add(pad); this.ghostPad = pad
  },
  unghost() { if (this.ghostG) { this.scene.remove(this.ghostG); this.ghostG = null } if (this.ghostPad) { this.scene.remove(this.ghostPad); this.ghostPad = null } this.ghostInfo = null },
  hideItem(id, hide) { const g = this.byId && this.byId[id]; if (g) g.visible = !hide },
  select(id) {
    this.deselect(); const g = this.byId && this.byId[id]; if (!g) return; this.selId = id; const it = this.fItems().find(i => i.id === id); if (!it) return; const [w, d] = FURN.footprint(it.name, it.rot);
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
  cellFromPoint(p) { return [Math.max(0, Math.min(this.gw - 1, Math.floor(p.x + 3))), Math.max(0, Math.min(this.gd - 1, Math.floor(p.z + 3)))] },
  /* breadth-first path over free cells (avatar walks around furniture) */
  bfs(from, to, occ) {
    const key = (c) => c[0] + ',' + c[1], prev = new Map([[key(from), null]]), q = [from];
    while (q.length) { const c = q.shift(); if (c[0] === to[0] && c[1] === to[1]) { const out = []; let k = c; while (k) { out.unshift(k); k = prev.get(key(k)) } return out }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [c[0] + dx, c[1] + dz]; if (n[0] < 0 || n[1] < 0 || n[0] >= this.gw || n[1] >= this.gd || occ.has(key(n)) || prev.has(key(n)) || (this.layout && this.layout.wallSet.has(this.ek(c, n)))) continue; prev.set(key(n), c); q.push(n) } }
    return null
  },
  walkToCell(cell, exact) {
    const occ = FURN.occupied(this.fItems()), a = this.avatar.position, from = this.cellFromPoint(a); occ.delete(from[0] + ',' + from[1]); if (occ.has(cell[0] + ',' + cell[1])) return false;
    const p = this.bfs(from, cell, occ); if (!p) return false;
    this.path = p.slice(1).map(c => new THREE.Vector3(this.cc(c[0]), 0, this.cc(c[1]))); if (exact) this.path.push(new THREE.Vector3(Math.max(-2.6, Math.min(this.gw - 3.4, exact.x)), 0, Math.max(-2.6, Math.min(this.gd - 3.4, exact.z)))); return true
  },
  /* can the avatar reach a free cell next to the cooler from the doorway? (used for the "blocks the way" warning) */
  reachesCooler(items) {
    const cool = items.find(i => i.name === 'Cooler Box' && i.placed !== false); if (!cool) return true; const occ = FURN.occupied(items), door = [0, 4];
    if (occ.has('0,4')) return false; const [w, d] = FURN.footprint(cool.name, cool.rot);
    for (let i = -1; i <= w; i++) for (let j = -1; j <= d; j++) { if ((i >= 0 && i < w) && (j >= 0 && j < d)) continue; if ((i === -1 || i === w) && (j === -1 || j === d)) continue; const c = [cool.x + i, cool.z + j]; if (c[0] < 0 || c[1] < 0 || c[0] >= this.gw || c[1] >= this.gd || occ.has(c[0] + ',' + c[1])) continue; if (this.bfs(door, c, occ)) return true }
    return false
  },
  /* built-in things of a fixed-plan home (shop counter, shelves ...) as use-able pseudo items */
  fixture(id) { const f = ((this.layout && this.layout.fixtures) || []).find(x => 'fx:' + x.id === id); return f ? { id, name: f.name, kind: f.kind, x: f.x, z: f.z, w: f.w, d: f.d, rot: f.rot || 0, fixture: true } : null },
  /* ---------- using furniture: walk next to it, then lie / sit / stand there for a while ---------- */
  SEAT: { chair: .54, stool: .82, sofa: .58, armchair: .58, toilet: .5, desk: .52, piano: .5, shelter: .5, umbtable: .5, plasticset: .46, bunk: .5 },
  useItem(it, act, cb) {
    const D = FURN.ITEMS[it.name] || (it.fixture ? {} : null); if (!D) return; const [w, d] = it.fixture ? [it.w, it.d] : FURN.footprint(it.name, it.rot), th = (it.rot || 0) * Math.PI / 180, f = [Math.sin(th), Math.cos(th)];
    const occ = FURN.occupied(this.fItems()), from = this.cellFromPoint(this.avatar.position); occ.delete(from[0] + ',' + from[1]);
    const cx = it.x + (w - 1) / 2, cz = it.z + (d - 1) / 2; let best = null, bs = 1e9, bp = null;
    for (let i = -1; i <= w; i++) for (let j = -1; j <= d; j++) {
      if (i >= 0 && i < w && j >= 0 && j < d) continue; if ((i === -1 || i === w) && (j === -1 || j === d)) continue;
      const c = [it.x + i, it.z + j]; if (c[0] < 0 || c[1] < 0 || c[0] >= this.gw || c[1] >= this.gd || occ.has(c[0] + ',' + c[1])) continue;
      const p = this.bfs(from, c, occ); if (!p) continue; const front = (c[0] - cx) * f[0] + (c[1] - cz) * f[1], sc = p.length - (act.pose !== 'lie' && front > 0 ? 2 : 0);
      if (sc < bs) { bs = sc; best = c; bp = p }
    }
    if (!best) { if (cb && cb.fail) cb.fail('Something is blocking the way'); return }
    this.endAct(true); this.onArrive = null; this.pending = true;
    const go = () => { this.pending = false; this.beginAct(it, act, best, cb) };
    if (bp.length <= 1) { this.path = []; go() } else { this.walkToCell(best); this.onArrive = go }
  },
  beginAct(it, act, cell, cb) {
    const D = FURN.ITEMS[it.name] || {}, [w, d] = it.fixture ? [it.w, it.d] : FURN.footprint(it.name, it.rot), th = (it.rot || 0) * Math.PI / 180, a = this.avatar;
    const center = new THREE.Vector3(this.cc(it.x) + (w - 1) / 2, 0, this.cc(it.z) + (d - 1) / 2); let pos = new THREE.Vector3(this.cc(cell[0]), 0, this.cc(cell[1])), yaw = a.rotation.y, h = 0;
    if (act.pose === 'lie') { pos = center; h = .57; yaw = Math.atan2(Math.cos(th), -Math.sin(th)) }                 // head toward the pillow end (local -x of the bed)
    else if (act.pose === 'sit') {
      let bd = 1e9; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) { const c = [it.x + i, it.z + j], dd = Math.abs(c[0] - cell[0]) + Math.abs(c[1] - cell[1]); if (dd < bd) { bd = dd; pos = new THREE.Vector3(this.cc(c[0]), 0, this.cc(c[1])) } }
      h = this.SEAT[D.kind] || .54; yaw = th                                                                          // seats face local +z
    } else yaw = Math.atan2(center.x - pos.x, center.z - pos.z);                                                      // standing: face the thing
    a.position.set(pos.x, 0, pos.z); a.rotation.y = yaw; this.path = [];
    this.act = { kind: act.pose, act, item: it.id, pos, yaw, h, from: cell, t0: performance.now(), dur: (act.sec || 10) * 1000, cb }
  },
  /* stop using it: needs go up in proportion to how long you stayed (cb.done), and you step back to where you came from */
  endAct(cancel) {
    const A = this.act; if (!A) return; this.act = null; this.pending = false;
    const el = Math.min(1, (performance.now() - A.t0) / A.dur); if (this.avatar) this.avatar.position.set(this.cc(A.from[0]), 0, this.cc(A.from[1]));
    if (A.cb && A.cb.done) A.cb.done(cancel ? el : 1, !!cancel)
  },
  floorCell(cx, cy) { const r = this.cv.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(v, this.cam); const h = ray.intersectObject(this.floor)[0]; return h ? { p: h.point, cell: this.cellFromPoint(h.point) } : null },
  tap(cx, cy) {
    const r = this.cv.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(v, this.cam);
    const hits = ray.intersectObjects([this.itemsGroup, this.fxG, this.floor].filter(Boolean), true); let itemG = null, floorHit = null;
    for (const h of hits) { if (h.object === this.floor) { floorHit = floorHit || h; if (!itemG) break; continue } let o = h.object; while (o && !(o.userData && o.userData.id)) o = o.parent; if (o && !itemG) itemG = o }
    if (this.buy) { if (itemG && String(itemG.userData.id).startsWith('fx:')) { this.buy({ type: 'none' }); return } if (itemG) this.buy({ type: 'item', id: itemG.userData.id }); else if (floorHit) this.buy({ type: 'cell', cell: this.cellFromPoint(floorHit.point) }); else this.buy({ type: 'none' }); return }
    if (itemG && window.USE && USE.open(itemG.userData.id)) return;
    if (itemG && itemG.userData.eat) {
      const it = this.fItems().find(i => i.id === itemG.userData.id), occ = FURN.occupied(this.fItems()), [w, d] = FURN.footprint(it.name, it.rot); let best = null, bl = 1e9;
      for (let i = -1; i <= w; i++) for (let j = -1; j <= d; j++) { if ((i >= 0 && i < w) && (j >= 0 && j < d)) continue; const c = [it.x + i, it.z + j]; if (c[0] < 0 || c[1] < 0 || c[0] >= this.gw || c[1] >= this.gd || occ.has(c[0] + ',' + c[1])) continue; const dd = Math.hypot(this.cc(c[0]) - this.avatar.position.x, this.cc(c[1]) - this.avatar.position.z); if (dd < bl && this.walkToCell(c)) { bl = dd; best = c } }
      if (!best) { toast('Something is blocking your cooler box'); return } this.walkToCell(best); this.onArrive = () => eat({ stopPropagation() { } }); return
    }
    if (floorHit) { if (this.act) this.endAct(true); if (window.USE) USE.close(); this.onArrive = null; const cell = this.cellFromPoint(floorHit.point); if (!this.walkToCell(cell, floorHit.point)) toast('You cannot walk there') }
  },
  loop(t) {
    requestAnimationFrame(tt => this.loop(tt)); if (!this.on || document.hidden || this.cv.style.display === 'none' || document.getElementById('hub').style.display === 'flex') return;
    const dt = Math.min(.05, (t - this.last) / 1000 || .016); if (isSaver() && t - this.last < 33) return; this.last = t;
    if (this.tAz != null) { const d = this.tAz - this.az; this.az += d * Math.min(1, dt * 8); if (Math.abs(d) < .002) { this.az = this.tAz; this.tAz = null } }
    const cam = this.cam, sp = Math.sin(this.pol), px = this.dist * sp * Math.sin(this.az), pz = this.dist * sp * Math.cos(this.az), py = this.dist * Math.cos(this.pol);
    if (this.fpv && this.avatar) {      // first person: the camera sits at the Sim's eyes and you drag to look around
      const hw = this.fpHead || (this.fpHead = new THREE.Vector3()); if (this.parts && this.parts.head) this.parts.head.getWorldPosition(hw); else hw.set(this.avatar.position.x, 1.5, this.avatar.position.z);
      const yaw = this.fpYaw, pit = this.fpPitch, cp = Math.cos(pit), back = .5,    // sit a little behind the head so you see the room the way your eyes would, not through a keyhole
        ex = Math.max(-2.85, Math.min(this.gw - 3.15, hw.x - Math.sin(yaw) * back)), ez = Math.max(-2.85, Math.min(this.gd - 3.15, hw.z - Math.cos(yaw) * back)), ey = hw.y + .12;
      cam.position.set(ex, ey, ez); cam.lookAt(ex + Math.sin(yaw) * cp, ey + Math.sin(pit), ez + Math.cos(yaw) * cp);
    } else if (this.walk && this.avatar) {          // chase camera: behind the character, inside the room, ceiling above
      const A = this.avatar.position, yaw = this.wYaw, pit = this.wPitch, dist = 2.2, cp = Math.cos(pit);
      const cx = Math.max(-2.85, Math.min(this.gw - 3.15, A.x - Math.sin(yaw) * cp * dist)), cz = Math.max(-2.85, Math.min(this.gd - 3.15, A.z - Math.cos(yaw) * cp * dist)), cy = Math.min(this.WALL_H - .25, 1.15 + Math.sin(pit) * dist);
      cam.position.set(cx, cy, cz); cam.lookAt(A.x, 1.0, A.z)
    } else { cam.position.set(px + this.offX, py + .8, pz + this.offZ); cam.lookAt(this.offX, .8, this.offZ) }
    // walls between the camera and the room fade out
    this.walls.forEach(w => { if (this.layout) return; const side = px * w.out[0] + pz * w.out[1], want = !this.fpv && side > 2.2 ? .08 : 1, m = w.m.material; m.opacity += (want - m.opacity) * Math.min(1, dt * 8); m.depthWrite = m.opacity > .6; w.m.visible = m.opacity > .02 });
    // avatar walking along the path
    const a = this.avatar; let moving = false;
    if (this.act && performance.now() - this.act.t0 >= this.act.dur) this.endAct(false);
    if (this.path.length) { const goal = this.path[0], d = goal.clone().sub(a.position); d.y = 0; const L = d.length(); if (L < .08) { this.path.shift(); if (!this.path.length && this.onArrive) { const f = this.onArrive; this.onArrive = null; f() } } else { moving = true; d.normalize(); a.position.addScaledVector(d, Math.min(L, 2.5 * dt)); const ta = Math.atan2(d.x, d.z), df = ((ta - a.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; a.rotation.y += df * Math.min(1, dt * 10) } }
    if ((this.walk || this.fpv) && this.joy && !this.act) {      // joystick (walk mode AND the first-person eye view): up = forward along the camera, sideways = strafe; slides along walls and furniture
      const j = this.joy, mag = Math.min(1, Math.hypot(j.x, j.y)), yaw = this.fpv ? this.fpYaw : this.wYaw;
      if (mag > .12) {
        const dx = Math.sin(yaw) * j.y - Math.cos(yaw) * j.x, dz = Math.cos(yaw) * j.y + Math.sin(yaw) * j.x, L = Math.hypot(dx, dz) || 1, sp = 2.1 * mag * dt, mx = dx / L * sp, mz = dz / L * sp, p0 = a.position;
        if (this.walkOk(p0.x, p0.z, p0.x + mx, p0.z + mz)) { p0.x += mx; p0.z += mz } else if (this.walkOk(p0.x, p0.z, p0.x + mx, p0.z)) p0.x += mx; else if (this.walkOk(p0.x, p0.z, p0.x, p0.z + mz)) p0.z += mz;
        const ta = Math.atan2(dx, dz), df = ((ta - a.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; a.rotation.y += df * Math.min(1, dt * 12); moving = true
      }
    }
    this.animate(t, dt, moving);
    // time of day: daylight dl (0 night .. 1 day) drives sun, sky tint, ground and window; bought lamps follow NEPA power
    const dl = this.dl == null ? 1 : this.dl, kk = Math.min(1, dt * 3), C = THREE.Color, lerpC = (a, b, t) => new C(a).lerp(new C(b), t);
    const rl = this.roomLight === false ? 0 : 1, pw = this.power(), bst = rl && this.roomBoost ? 1 : 0;   // rl: the player's own light switch (bulb button on the home screen)
    this.amb.intensity += (((.3 + .32 * dl) * (rl ? 1 : .32) + (rl && pw ? .16 * (1 - dl) : 0) + .11 * bst) - this.amb.intensity) * kk; this.amb.color.copy(lerpC(0x8a9bd6, 0xffffff, dl));
    this.sun.intensity += (.55 * dl * (rl ? 1 : .55) * (1 + .08 * bst) - this.sun.intensity) * kk; this.sun.color.copy(lerpC(0xff8a45, 0xfff0d0, Math.max(0, Math.min(1, (dl - .2) / .6))));
    this.moon.intensity += (.42 * (1 - dl) - this.moon.intensity) * kk;
    this.ground.color.copy(lerpC(0x24331f, 0x93a05a, dl)); if (this.glass) this.glass.color.copy(lerpC(0x16224a, 0xbfe4ff, dl));
    const on = pw && rl; if (this.fans && this.fans.length) { const sp = pw ? 7 : 0; this.fans.forEach(f => { f.userData.v = (f.userData.v || 0) + (sp - (f.userData.v || 0)) * Math.min(1, dt * 1.5); f.rotation.y += f.userData.v * dt }) } this.lamps.forEach(m => { const want = on ? m.k * (.4 + .75 * (1 - dl)) * (1 + .25 * bst) : 0; m.l.intensity += (want - m.l.intensity) * Math.min(1, dt * 6); m.bm.color.copy(lerpC(0x8a8466, 0xffe9a0, Math.min(1, m.l.intensity / (m.k * .6)))) });
    this.petStep(t, dt);
    this.R.render(this.scene, cam)
  }
};
