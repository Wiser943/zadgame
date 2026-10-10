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
    this.gender = (typeof S !== 'undefined' && S.gender) || 'male'; this.buildAvatar(this.gender, (typeof S !== 'undefined' && S.render) || null);
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
  buildAvatar(gender, look) {
    const R = this.look = look || this.look || ACAvatar.defaultRender(gender), fem = (R.g || gender) === 'female', B = ACAvatar.BODIES[R.body] || ACAvatar.BODIES.average, W = ACAvatar.wardrobe(R, fem);
    const old = this.avatar, pos = old ? old.position.clone() : new THREE.Vector3(-1, 0, 1.2), ry = old ? old.rotation.y : 0;
    if (old) this.scene.remove(old);
    const C = c => new THREE.Color(c), SK = C(R.skin), SKD = C(R.skin).multiplyScalar(.82), HAIR = (R.hair && R.hair.color) || '#16100d', M = c => this.mat(c);
    const cloth = (col, pat, c2) => { if (!pat || pat === 'solid') return M(col); const t = new THREE.CanvasTexture(ACAvatar.patternCanvas(pat, col, c2)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 1.5); return new THREE.MeshLambertMaterial({ map: t }) };
    const av = this.avatar = new THREE.Group(), body = new THREE.Group(), P = this.parts = { body }; av.add(body);
    const part = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (par || body).add(m); return m };
    const L1 = .36, L2 = .30, HIP = .74, lw = B.lw, T0 = W.torso, tcol = T0 ? T0.col : '#888', tpat = T0 && T0.pat, tc2 = T0 && T0.c2;
    const legCol = (lower) => (W.legs >= (lower ? 2 : 1) && W.legCol) ? M(W.legCol) : M(SK);
    const sh = R.shoes || { k: 'sneaker', c1: '#f4f4f4', c2: '#2b2b2b' }, shc = ACAvatar.worn(sh.c1, sh.tatter), shc2 = ACAvatar.worn(sh.c2 || '#2b2b2b', sh.tatter);
    const leg = sx => {
      const hip = new THREE.Group(); hip.position.set(sx * (fem ? .125 : .15) * B.hp, HIP, 0); body.add(hip);
      part(new THREE.BoxGeometry((fem ? .2 : .24) * lw, L1, (fem ? .22 : .26) * lw), legCol(false), 0, -L1 / 2, 0, hip);
      const knee = new THREE.Group(); knee.position.y = -L1; hip.add(knee);
      part(new THREE.BoxGeometry((fem ? .16 : .2) * lw, L2, (fem ? .18 : .22) * lw), legCol(true), 0, -L2 / 2, 0, knee);
      const foot = (sh.k === 'sandal' || sh.k === 'heel') ? M(SK) : M(shc);
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
      const w = W.slv >= 1 ? W.wide : 1;
      part(new THREE.BoxGeometry((fem ? .13 : .18) * lw * w, .3, (fem ? .15 : .2) * lw * w), W.slv >= 1 && W.slvCol ? M(W.slvCol) : M(SK), 0, -.13, 0, sg);
      const el = new THREE.Group(); el.position.y = -.28; sg.add(el);
      part(new THREE.BoxGeometry((fem ? .11 : .13) * lw * (W.slv >= 2 ? W.wide : 1), .3, (fem ? .12 : .14) * lw * (W.slv >= 2 ? W.wide : 1)), W.slv >= 2 && W.slvCol ? M(W.slvCol) : M(SK), 0, -.15, 0, el);
      part(new THREE.SphereGeometry(fem ? .07 : .085, 10, 8), M(SK), 0, -.34, 0, el);
      if (W.slv < 1) part(new THREE.SphereGeometry(.075, 8, 6), M(tcol), 0, .02, 0, sg);
      const J = R.jewel || {};
      if (J.wrist) { if (J.wrist.k === 'watch') { part(new THREE.BoxGeometry(.1, .06, .1), M(J.wrist.c2 || '#222'), 0, -.27, 0, el); part(new THREE.BoxGeometry(.13, .02, .13), M(J.wrist.c1), 0, -.27, 0, el) } else { const t = part(new THREE.TorusGeometry(.085, .015, 6, 14), M(J.wrist.c1), 0, -.27, 0, el); t.rotation.x = Math.PI / 2 } }
      if (J.ring && sx > 0) part(new THREE.SphereGeometry(.025, 6, 5), M(J.ring.c1), .03, -.4, .05, el);
      return { sg, el };
    };
    const aL = arm(-1), aR = arm(1); P.armL = { sh: aL.sg, el: aL.el }; P.armR = { sh: aR.sg, el: aR.el };
    part(new THREE.CylinderGeometry(fem ? .07 : .085, fem ? .08 : .095, .12, 10), M(SKD), 0, .71, 0, T);       // neck
    const head = P.head = new THREE.Group(); head.position.y = 1.02; T.add(head);
    const skull = part(new THREE.SphereGeometry(fem ? .235 : .25, 20, 16), M(SK), 0, 0, 0, head); skull.scale.set(.92, 1.08, .96);
    part(new THREE.SphereGeometry(.05, 8, 6), M(SK), -.23, -.02, 0, head); part(new THREE.SphereGeometry(.05, 8, 6), M(SK), .23, -.02, 0, head);
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
    part(new THREE.SphereGeometry(.045, 8, 6), M(SKD), 0, -.03, .235, head);                                    // nose
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
