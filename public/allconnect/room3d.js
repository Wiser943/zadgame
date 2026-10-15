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
    // Overhead tags container for multiplayer names & chat bubbles
    try {
      let tc = document.getElementById('r3d-tags');
      if (!tc) {
        tc = document.createElement('div');
        tc.id = 'r3d-tags';
        const ap = document.getElementById('app');
        if (ap) ap.insertBefore(tc, document.getElementById('hud'));
      }
      this.tagCont = tc;
    } catch (e) {}

    // Outdoor compound patio slab & perimeter yard
    this.box(5.8, 0.28, 7.8, 0x827d73, -5.9, -0.15, 0);
    this.outsideFloor = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 7.6), new THREE.MeshLambertMaterial({ color: 0x9c9689 }));
    this.outsideFloor.rotation.x = -Math.PI / 2;
    this.outsideFloor.position.set(-5.9, 0.005, 0);
    sc.add(this.outsideFloor);
    this.box(0.2, 2.2, 8.0, 0xd4cbb8, -8.7, 1.1, 0); // West wall
    this.box(5.6, 2.2, 0.2, 0xd4cbb8, -5.9, 1.1, -3.9); // North wall
    this.box(5.6, 2.2, 0.2, 0xd4cbb8, -5.9, 1.1, 3.9); // South wall
    this.box(0.08, 1.9, 2.2, 0x1f2429, -8.68, 0.95, 1.6); // Black iron gate
    this.box(1.5, 0.45, 0.5, 0x824e2b, -5.4, 0.22, -2.8); // Outdoor bench
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
  createAvatarMesh(gender, look) {
    const R = look || ACAvatar.defaultRender(gender), fem = (R.g || gender) === 'female', B = ACAvatar.BODIES[R.body] || ACAvatar.BODIES.average, W = ACAvatar.wardrobe(R, fem);
    const C = c => new THREE.Color(c), SK = C(R.skin), SKD = C(R.skin).multiplyScalar(.82), HAIR = (R.hair && R.hair.color) || '#16100d', M = c => this.mat(c);
    const cloth = (col, pat, c2) => { if (!pat || pat === 'solid') return M(col); const t = new THREE.CanvasTexture(ACAvatar.patternCanvas(pat, col, c2)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 1.5); return new THREE.MeshLambertMaterial({ map: t }) };
    const av = new THREE.Group(), body = new THREE.Group(), P = { body }; av.add(body);
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
      if (MK.liner) part(new THREE.BoxGeometry(.11, .012, .03), M(MK.liner.c), sx * .09, .075, .22, head);
      if (MK.eyes) part(new THREE.SphereGeometry(.045, 8, 6), M(MK.eyes.c), sx * .09, .07, .215, head);
      return [w, pu, br];
    };
    const eL = eye(-1), eR = eye(1); P.eyes = [eL[0], eL[1], eR[0], eR[1]]; P.brows = brows;
    part(new THREE.ConeGeometry(.04, .1, 8), M(SKD), 0, 0, .24, head).rotation.x = -Math.PI / 2;
    if (MK.cheeks) [-1, 1].forEach(x => { const c = part(new THREE.SphereGeometry(.05, 8, 6), M(MK.cheeks.c), x * .14, -.04, .19, head); c.scale.set(1, .6, .4) });
    const lipCol = MK.lips ? MK.lips.c : (fem ? '#7a3328' : SKD);
    const mouths = P.mouths = {};
    mouths.flat = part(new THREE.BoxGeometry(.09, .022, .03), M(lipCol), 0, -.1, .215, head);
    mouths.smile = part(new THREE.TorusGeometry(.055, .012, 6, 12, Math.PI), M(lipCol), 0, -.09, .215, head); mouths.smile.rotation.z = Math.PI; mouths.smile.visible = false;
    mouths.open = part(new THREE.SphereGeometry(.032, 8, 6), M('#160805'), 0, -.1, .215, head); mouths.open.visible = false;
    mouths.frown = part(new THREE.TorusGeometry(.055, .012, 6, 12, Math.PI), M(lipCol), 0, -.11, .215, head); mouths.frown.visible = false;
    const hstyle = (R.hair && R.hair.style) || 'short';
    if (hstyle === 'afro') { const m = part(new THREE.SphereGeometry(.28, 14, 12), M(HAIR), 0, .14, -.02, head); m.scale.set(1.12, 1.05, 1.1) }
    else if (hstyle === 'buzz' || hstyle === 'short') { const m = part(new THREE.SphereGeometry(.252, 14, 12), M(HAIR), 0, .05, -.02, head); m.scale.set(.96, 1.02, 1.0) }
    else if (hstyle === 'braids' || hstyle === 'locs') {
      part(new THREE.SphereGeometry(.26, 12, 10), M(HAIR), 0, .08, -.02, head);
      for (let i = -3; i <= 3; i++) { const l = part(new THREE.CylinderGeometry(.025, .018, .55, 6), M(HAIR), i * .06, -.16, -.15 + Math.abs(i) * .02, head); l.rotation.z = i * .08; l.rotation.x = .2 }
    } else if (hstyle === 'bob') {
      const m = part(new THREE.SphereGeometry(.27, 12, 10), M(HAIR), 0, .08, -.02, head); m.scale.set(1.02, 1.05, 1.08);
      part(new THREE.BoxGeometry(.52, .3, .45), M(HAIR), 0, -.08, -.05, head);
    } else if (hstyle === 'high_fade' || hstyle === 'waves') {
      part(new THREE.SphereGeometry(.255, 14, 12), M(HAIR), 0, .07, -.02, head);
    }
    const bd = R.beard;
    if (bd && bd !== 'none') {
      const bCol = HAIR;
      if (bd === 'full') { const m = part(new THREE.BoxGeometry(.26, .18, .22), M(bCol), 0, -.12, .13, head); m.scale.set(1, 1, .9) }
      else if (bd === 'goatee') part(new THREE.BoxGeometry(.1, .14, .08), M(bCol), 0, -.12, .21, head);
      else if (bd === 'stubble') part(new THREE.BoxGeometry(.24, .14, .2), M(bCol), 0, -.1, .13, head);
    }
    const H = R.head;
    if (H) {
      if (H.k === 'cap' || H.k === 'snapback') {
        const c = part(new THREE.SphereGeometry(.26, 12, 10), M(H.c1), 0, .14, -.02, head); c.scale.set(.98, .7, 1.02);
        const b = part(new THREE.BoxGeometry(.24, .02, .2), M(H.c2 || H.c1), 0, .08, .26, head); if (H.k === 'snapback') b.position.set(0, .08, -.26);
      } else if (H.k === 'beanie') { const b = part(new THREE.SphereGeometry(.27, 12, 10), M(H.c1), 0, .16, -.02, head); b.scale.set(.96, 1.1, .98) }
      else if (H.k === 'fila') { const f = part(new THREE.CylinderGeometry(.24, .25, .22, 14), M(H.c1), 0, .22, 0, head); f.rotation.z = .15 }
      else if (H.k === 'gele') { const g = part(new THREE.TorusGeometry(.26, .14, 8, 18), M(H.c1), 0, .2, 0, head); g.rotation.x = Math.PI / 2; g.scale.set(1.1, 1.3, .7) }
      else if (H.k === 'bucket') { part(new THREE.CylinderGeometry(.22, .26, .18, 14), M(H.c1), 0, .2, 0, head); const b = part(new THREE.CylinderGeometry(.34, .34, .02, 16), M(H.c1), 0, .12, 0, head); }
    }
    const FC = R.face;
    if (FC && FC.k === 'shades') {
      const g = part(new THREE.BoxGeometry(.32, .08, .04), M('#111'), 0, .05, .25, head);
      [-1, 1].forEach(x => { part(new THREE.BoxGeometry(.12, .07, .02), M(FC.c1 || '#050505'), x * .08, .05, .265, head) });
    }
    const J = R.jewel || {};
    if (J.neck) {
      const n = J.neck, col = n.c1;
      if (n.k === 'choker') { const t = part(new THREE.TorusGeometry(.1, .014, 6, 16), M(col), 0, .69, 0, T); t.rotation.x = Math.PI / 2 }
      else { for (let i = 0; i < 11; i++) { const a = i / 10 * Math.PI, x = -Math.cos(a) * .2, y = .62 - Math.sin(a) * .16; part(new THREE.SphereGeometry(n.k === 'pearls' ? .03 : .018, 6, 5), M(n.k === 'pearls' ? '#f4f4f0' : col), x, y, .17, T) } if (n.k === 'pendant') part(new THREE.SphereGeometry(.05, 8, 6), M(n.c2 || col), 0, .43, .18, T) }
    }
    if (J.ear) [-1, 1].forEach(x => { if (J.ear.k === 'hoops') { const t = part(new THREE.TorusGeometry(.045, .008, 6, 12), M(J.ear.c1), x * .235, -.07, 0, head); t.rotation.y = Math.PI / 2 } else part(new THREE.SphereGeometry(.028, 6, 5), M(J.ear.c1), x * .235, -.03, 0, head) });
    if (J.waist) { const t = part(new THREE.TorusGeometry(.3, .02, 6, 20), M(J.waist.c1), 0, 0, 0, T); t.rotation.x = Math.PI / 2 }
    const hd = R.hand; if (hd) {
      const el = P.armR.el, c1 = hd.c1, c2 = hd.c2 || ACAvatar.shade(c1, -.3);
      if (hd.k === 'staff') part(new THREE.CylinderGeometry(.02, .02, 1.5, 8), M(c1), .06, -.5, .1, el), part(new THREE.SphereGeometry(.05, 8, 6), M(c2), .06, .27, .1, el);
      else if (hd.k === 'fan') { part(new THREE.CylinderGeometry(.012, .012, .3, 6), M('#7a4b2a'), .05, -.5, .08, el); const d = part(new THREE.CylinderGeometry(.2, .2, .02, 16), M(c1), .05, -.7, .08, el); d.rotation.x = Math.PI / 2; part(new THREE.CylinderGeometry(.12, .12, .03, 14), M(c2), .05, -.7, .09, el).rotation.x = Math.PI / 2 }
      else if (hd.k === 'umbrella') { part(new THREE.CylinderGeometry(.012, .012, 1.1, 6), M('#333'), .06, .15, .08, el); part(new THREE.ConeGeometry(.55, .22, 16), M(c1), .06, .75, .08, el) }
      else if (hd.k === 'clutch') part(new THREE.BoxGeometry(.2, .14, .06), M(c1), .05, -.5, .08, el);
    }
    return { av, parts: P, look: R, gender: R.g || gender };
  },

  buildAvatar(gender, look) {
    const old = this.avatar, pos = old ? old.position.clone() : new THREE.Vector3(-1, 0, 1.2), ry = old ? old.rotation.y : 0;
    if (old && this.scene) this.scene.remove(old);
    const res = this.createAvatarMesh(gender, look);
    this.avatar = res.av;
    this.parts = res.parts;
    this.look = res.look;
    this.gender = res.gender;
    this.avatar.position.copy(pos);
    this.avatar.rotation.y = ry;
    if (this.scene) this.scene.add(this.avatar);
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
  power() {
    if (!this.dark_) return true;
    if (this.genActive != null) return this.genActive;
    return (S.items || []).some(i => (i.name === 'Gen Set' || i.name === 'Solar Panels') && i.placed !== false);
  },
  /* ---------- procedural 3D furniture & animated TV canvas engine ---------- */
  cc(c) { return -2.5 + c },
  B(w, h, d, c, x, y, z, par) { return this.box(w, h, d, c, x, y, z, par) },
  animators: [],
  channels: ['football', 'nollywood', 'bbnaija', 'musicTv', 'newsTv', 'cookingShow'],
  channelIdx: 0,
  getChannel() { return this.channels[this.channelIdx] || 'football'; },
  nextChannel() {
    this.channelIdx = (this.channelIdx + 1) % this.channels.length;
    const names = {
      football: '⚽ Super Eagles vs Ghana',
      nollywood: '🎬 Nollywood Classics',
      bbnaija: '👁️ BBNaija LIVE',
      musicTv: '🎵 Afrobeats Top 10',
      newsTv: '📰 NTA News At 9',
      cookingShow: "🍲 Mama's Kitchen"
    };
    const ch = this.getChannel();
    if (typeof toast === 'function') toast(`TV: ${names[ch] || ch}`);
    return ch;
  },
  setChannel(ch) {
    const idx = this.channels.indexOf(ch);
    if (idx !== -1) this.channelIdx = idx;
  },
  initTV() {
    if (this.tvCanvas) return;
    try {
      if (typeof document === 'undefined') return;
      const cv = this.tvCanvas = document.createElement('canvas');
      cv.width = 160; cv.height = 90;
      this.tvCtx = cv.getContext('2d');
      const tex = this.tvTex = new THREE.CanvasTexture(cv);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      this.tvMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    } catch (e) {}
  },
  drawTV(channel, time) {
    const ctx = this.tvCtx;
    if (!ctx) return;
    const o = (phase, speed = 1) => Math.sin(time * speed + phase);
    const tag = (label, bg) => {
      ctx.fillStyle = bg;
      ctx.fillRect(6, 6, ctx.measureText(label).width + 10, 14);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, 11, 17);
    };
    ctx.font = 'bold 10px system-ui, sans-serif';
    switch (channel) {
      case 'football': {
        for (let s = 0; s < 8; s++) {
          ctx.fillStyle = s % 2 ? '#2f9e44' : '#37b24d';
          ctx.fillRect(20 * s, 0, 20, 90);
        }
        ctx.strokeStyle = 'rgba(255,255,255,.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(8, 10, 144, 70);
        ctx.beginPath();
        ctx.moveTo(80, 10); ctx.lineTo(80, 80);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(80, 45, 12, 0, 2 * Math.PI);
        ctx.stroke();
        const bx = 80 + 50 * o(0, .9);
        const by = 45 + 22 * o(1, 1.3);
        for (let a = 0; a < 5; a++) {
          ctx.fillStyle = '#1f8a4c';
          ctx.beginPath();
          ctx.arc(bx - 20 + 18 * o(2 * a, 1.1) - 6 * a, by + 16 * o(a, .8), 3.5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = '#f4efe6';
          ctx.beginPath();
          ctx.arc(bx + 22 + 16 * o(3 * a, 1.2) + 5 * a, by + 18 * o(a + 2, .7), 3.5, 0, 2 * Math.PI);
          ctx.fill();
        }
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(bx, by, 2.2, 0, 2 * Math.PI);
        ctx.fill();
        tag("NGA 1 - 0 GHA  67'", '#111c');
        break;
      }
      case 'nollywood': {
        const grad = ctx.createLinearGradient(0, 0, 0, 90);
        grad.addColorStop(0, '#f4a261');
        grad.addColorStop(1, '#7a3b1f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 160, 90);
        ctx.fillStyle = '#5a2c16';
        ctx.fillRect(0, 64.8, 160, 25.2);
        const drawActor = (x, bodyCol, headCol, bob) => {
          ctx.fillStyle = bodyCol;
          ctx.fillRect(x - 9, 34 + bob, 18, 30);
          ctx.fillStyle = headCol;
          ctx.beginPath();
          ctx.arc(x, 27 + bob, 8, 0, 2 * Math.PI);
          ctx.fill();
        };
        drawActor(55, '#e63946', '#4a2c1a', 1.5 * o(0, 2));
        drawActor(105, '#264653', '#3a2214', 1.5 * o(2, 1.6));
        ctx.fillStyle = '#0009';
        ctx.fillRect(20, 72, 120, 12);
        ctx.fillStyle = '#fff';
        const quotes = [
          '"You will not inherit my house!"',
          '"Mama, it is not what you think…"',
          '"Kai! This girl has come again!"'
        ];
        const quote = quotes[Math.floor(time / 3) % quotes.length];
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillText(quote, 80 - ctx.measureText(quote).width / 2, 81);
        break;
      }
      case 'bbnaija': {
        const grad = ctx.createLinearGradient(0, 0, 160, 90);
        grad.addColorStop(0, '#7b2cbf');
        grad.addColorStop(1, '#ff006e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 160, 90);
        ctx.fillStyle = '#ffffff22';
        ctx.fillRect(0, 63, 160, 27);
        ['#ffbe0b', '#3a86ff', '#fb5607', '#8ac926', '#ff006e'].forEach((col, idx) => {
          const x = 22 + 29 * idx + 6 * o(idx, .7);
          ctx.fillStyle = col;
          ctx.fillRect(x - 6, 44, 12, 22);
          ctx.fillStyle = '#4a2c1a';
          ctx.beginPath();
          ctx.arc(x, 38 + 1.2 * o(2 * idx, 2.2), 6, 0, 2 * Math.PI);
          ctx.fill();
        });
        tag('BBNaija LIVE ●', '#e5484d');
        break;
      }
      case 'musicTv': {
        ctx.fillStyle = '#12002b';
        ctx.fillRect(0, 0, 160, 90);
        for (let bar = 0; bar < 16; bar++) {
          const h = 10 + 50 * Math.abs(o(.7 * bar, 5 + bar % 3));
          ctx.fillStyle = `hsl(${(22 * bar + 60 * time) % 360} 90% 60%)`;
          ctx.fillRect(6 + 9.4 * bar, 82 - h, 7, h);
        }
        ctx.fillStyle = '#4a2c1a';
        ctx.beginPath();
        ctx.arc(80, 32 + 2 * o(0, 6), 10, 0, 2 * Math.PI);
        ctx.fill();
        tag('♪ AFROBEATS TOP 10', '#111c');
        break;
      }
      case 'newsTv': {
        ctx.fillStyle = '#123a73';
        ctx.fillRect(0, 0, 160, 90);
        ctx.fillStyle = '#1d4f99';
        ctx.fillRect(88, 12, 60.8, 40.5);
        ctx.fillStyle = '#e9ecef';
        ctx.fillRect(40, 44, 34, 30);
        ctx.fillStyle = '#3a2214';
        ctx.beginPath();
        ctx.arc(57, 36 + .6 * o(0, 3), 9, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#e5484d';
        ctx.fillRect(0, 74, 160, 16);
        ctx.fillStyle = '#fff';
        const ticker = 'BREAKING: Third Mainland Bridge traffic now moving · Fuel price steady · Super Eagles win again · ';
        const tw = ctx.measureText(ticker).width || 300;
        ctx.fillText(ticker + ticker, 4 - (30 * time) % tw, 85);
        tag('NEWS AT 9', '#0b1f3f');
        break;
      }
      case 'cookingShow': {
        ctx.fillStyle = '#fbe3c4';
        ctx.fillRect(0, 0, 160, 90);
        ctx.fillStyle = '#c2703d';
        ctx.fillRect(0, 55.8, 160, 34.2);
        ctx.fillStyle = '#555';
        ctx.fillRect(58, 42, 44, 22);
        ctx.fillStyle = '#e85d04';
        ctx.fillRect(60, 40, 40, 5);
        for (let s = 0; s < 3; s++) {
          ctx.fillStyle = `rgba(255,255,255,${Math.max(0, .5 - (.6 * time + s / 3) % 1 * .5)})`;
          ctx.beginPath();
          ctx.arc(70 + 10 * s, 36 - (20 * time + 12 * s) % 30, 5, 0, 2 * Math.PI);
          ctx.fill();
        }
        tag("MAMA'S KITCHEN", '#9c2c2c');
        break;
      }
      default: {
        ctx.fillStyle = '#1b6ec2';
        ctx.fillRect(0, 0, 160, 90);
      }
    }
  },
  updateTV(time, dt) {
    if (!this.tvCanvas) this.initTV();
    if (!this.tvCanvas || !this.tvCtx) return;
    const saver = typeof isSaver === 'function' ? isSaver() : false;
    const interval = 1 / (saver ? 3 : 12);
    this.lastTv_ = this.lastTv_ || 0;
    if (time - this.lastTv_ < interval) return;
    this.lastTv_ = time;
    this.drawTV(this.getChannel(), time);
    if (this.tvTex) this.tvTex.needsUpdate = true;
  },
  /* Material and geometry caching helpers */
  geoCache_: new Map(),
  pGeo(key, fn) {
    let g = this.geoCache_.get(key);
    if (!g) { g = fn(); this.geoCache_.set(key, g); }
    return g;
  },
  matCache_: new Map(),
  getMat(c, s = {}) {
    const colStr = typeof c === 'string' ? c : ('#' + (c || 0).toString(16).padStart(6, '0'));
    const key = `${colStr}|${s.r ?? 0.7}|${s.m ?? 0}|${s.e ?? ''}|${s.ei ?? 0}|${s.o ?? 1}|${+!!s.dbl}`;
    let m = this.matCache_.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(c),
        roughness: s.r ?? 0.7,
        metalness: s.m ?? 0
      });
      if (s.e) {
        m.emissive = new THREE.Color(s.e);
        m.emissiveIntensity = s.ei ?? 1;
      }
      if (s.o !== undefined && s.o < 1) {
        m.transparent = true;
        m.opacity = s.o;
        m.depthWrite = false;
      }
      if (s.dbl) m.side = THREE.DoubleSide;
      this.matCache_.set(key, m);
    }
    return m;
  },
  /* Mesh creation primitives */
  mBox(w, h, d, mat, pos = [0, 0, 0], rot = null, par = null, sh = true) {
    const geo = this.pGeo(`b_${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    m.castShadow = !!sh;
    m.receiveShadow = true;
    if (par) par.add(m);
    return m;
  },
  mCyl(rTop, rBot, h, mat, pos = [0, 0, 0], rot = null, par = null, seg = 18, sh = true) {
    const geo = this.pGeo(`c_${rTop}_${rBot}_${h}_${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, h, seg));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    m.castShadow = !!sh;
    if (par) par.add(m);
    return m;
  },
  mSph(r, mat, pos = [0, 0, 0], sc = null, par = null, seg = 16, sh = true) {
    const geo = this.pGeo(`s_${r}_${seg}`, () => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    if (sc) {
      if (typeof sc === 'number') m.scale.setScalar(sc);
      else m.scale.set(sc[0] || 1, sc[1] || 1, sc[2] || 1);
    }
    m.castShadow = !!sh;
    if (par) par.add(m);
    return m;
  },
  mTorus(r, tube, mat, pos = [0, 0, 0], rot = null, par = null, arc = Math.PI * 2) {
    const geo = this.pGeo(`t_${r}_${tube}_${arc}`, () => new THREE.TorusGeometry(r, tube, 6, 24, arc));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (par) par.add(m);
    return m;
  },
  mPlane(w, h, mat, pos = [0, 0, 0], rot = null, par = null) {
    const geo = this.pGeo(`p_${w}_${h}`, () => new THREE.PlaneGeometry(w, h));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (par) par.add(m);
    return m;
  },
  /* Procedural furniture builder library */
  buildModel(name, D = {}) {
    const self = this;
    const u = (c, s) => self.getMat(c, s);
    const box = (w, h, d, mat, pos, rot, par, sh) => self.mBox(w, h, d, mat, pos, rot, par, sh);
    const cyl = (rT, rB, h, mat, pos, rot, par, seg, sh) => self.mCyl(rT, rB, h, mat, pos, rot, par, seg, sh);
    const sph = (r, mat, pos, sc, par, seg, sh) => self.mSph(r, mat, pos, sc, par, seg, sh);
    const tor = (r, tb, mat, pos, rot, par, arc) => self.mTorus(r, tb, mat, pos, rot, par, arc);
    const pln = (w, h, mat, pos, rot, par) => self.mPlane(w, h, mat, pos, rot, par);

    const GOLD = '#c9a227';
    const G_OPT = { m: 0.85, r: 0.28 };
    const CHROME = { m: 0.8, r: 0.25 };
    const SOFT_W = '#f6f3ec';

    const n = (name || '').toLowerCase().replace(/[\s\-_]/g, '');
    const kind = (D.kind || '').toLowerCase();
    const c = D.color || '#c8b8a6';
    const g = new THREE.Group();

    // 1. BEDS
    if (n.includes('vono') || n.includes('springbed') || (kind === 'bed' && n.includes('spring'))) {
      const wood = u('#8a5a36', { r: 0.7 });
      const frame = u('#2a2a2a', CHROME);
      box(1.7, 0.12, 0.86, u(c, { r: 0.85 }), [0, 0.2, 0], null, g);
      box(1.76, 0.04, 0.9, frame, [0, 0.13, 0], null, g);
      [-0.86, 0.86].forEach((x, i) => {
        cyl(0.016, 0.016, i === 0 ? 0.65 : 0.42, frame, [x, i === 0 ? 0.35 : 0.23, -0.42], null, g);
        cyl(0.016, 0.016, i === 0 ? 0.65 : 0.42, frame, [x, i === 0 ? 0.35 : 0.23, 0.42], null, g);
        box(0.03, i === 0 ? 0.5 : 0.3, 0.84, wood, [x, i === 0 ? 0.4 : 0.26, 0], null, g);
      });
      box(0.36, 0.09, 0.5, u(SOFT_W), [-0.55, 0.3, 0], null, g);
      box(0.7, 0.03, 0.84, u('#2a5d9e'), [0.45, 0.27, 0], null, g);
      return g;
    }
    if (n.includes('mattress') || n.includes('foammattress')) {
      box(1.7, 0.14, 0.86, u(SOFT_W, { r: 0.9 }), [0, 0.07, 0], null, g);
      box(1.1, 0.03, 0.88, u('#4f8fd6'), [0.26, 0.145, 0], null, g);
      box(0.36, 0.09, 0.52, u('#ffffff'), [-0.55, 0.16, 0], null, g);
      return g;
    }
    if (n.includes('singlebed')) {
      const wood = u('#8a5a36', { r: 0.6 });
      box(1.72, 0.14, 0.88, u(SOFT_W), [0, 0.24, 0], null, g);
      box(1.78, 0.18, 0.92, wood, [0, 0.12, 0], null, g);
      box(0.06, 0.68, 0.94, wood, [-0.88, 0.42, 0], null, g);
      box(0.06, 0.32, 0.94, wood, [0.88, 0.24, 0], null, g);
      box(0.36, 0.09, 0.5, u(SOFT_W), [-0.55, 0.35, 0], null, g);
      box(0.9, 0.04, 0.86, u(c, { r: 0.8 }), [0.36, 0.32, 0], null, g);
      return g;
    }
    if (n.includes('kingbed') || n.includes('lekkiking')) {
      const wood = u('#6b3fa0', { r: 0.6 });
      box(1.9, 0.18, 1.6, u(SOFT_W), [0, 0.24, 0], null, g);
      box(1.96, 0.18, 1.66, u('#3a2414', { r: 0.7 }), [0, 0.12, 0], null, g);
      box(0.08, 0.85, 1.72, wood, [-0.98, 0.52, 0], null, g);
      [-0.45, 0.45].forEach(z => {
        box(0.36, 0.11, 0.56, u(SOFT_W), [-0.64, 0.36, z], null, g);
      });
      box(1.0, 0.04, 1.58, u('#e07a3f', { r: 0.85 }), [0.38, 0.34, 0], null, g);
      return g;
    }
    if (n.includes('queenbed')) {
      const r = u('#d8cfc0', { r: 0.95 });
      const o = u(c, { r: 0.95 });
      box(1.12, 0.16, 1.1, r, [0, 0.1, 0.02], null, g);
      [-0.5, 0.5].forEach(x => [-0.48, 0.52].forEach(z => cyl(0.025, 0.025, 0.03, u('#3a2a1d'), [x, 0.015, z], null, g)));
      box(1.06, 0.1, 1.02, u(SOFT_W), [0, 0.22, 0.03], null, g);
      box(1.1, 0.05, 0.72, o, [0, 0.285, 0.18], null, g);
      box(1.1, 0.055, 0.09, u(SOFT_W), [0, 0.29, -0.17], null, g);
      [-0.25, 0.25].forEach(x => box(0.42, 0.08, 0.2, u(SOFT_W), [x, 0.3, -0.36], null, g));
      [-0.13, 0.13].forEach(x => box(0.2, 0.08, 0.08, o, [x, 0.31, -0.27], null, g));
      box(1.16, 0.66, 0.1, r, [0, 0.42, -0.56], null, g);
      [-0.36, 0, 0.36].forEach(x => [0.48, 0.62].forEach(y => sph(0.012, u('#b8ad9c'), [x, y, -0.505], null, g)));
      return g;
    }
    if (n.includes('bunkbed')) {
      const wood = u('#8a5a36');
      const o = u('#e76f51', { r: 0.95 });
      const a = u('#2a9d8f', { r: 0.95 });
      [-0.26, 0.26].forEach(x => [-0.56, 0.56].forEach(z => box(0.05, 1.0, 0.05, wood, [x, 0.5, z], null, g)));
      [0.12, 0.56, 0.84].forEach(y => [-0.26, 0.26].forEach(x => box(0.035, 0.05, 1.08, wood, [x, y, 0], null, g)));
      [0.12, 0.56].forEach(y => [-0.56, 0.56].forEach(z => box(0.5, 0.07, 0.035, wood, [0, y, z], null, g)));
      [0.18, 0.62].forEach(y => box(0.47, 0.08, 1.06, u(SOFT_W), [0, y, 0], null, g));
      box(0.49, 0.04, 0.78, o, [0, 0.235, 0.12], null, g);
      box(0.49, 0.04, 0.78, a, [0, 0.675, 0.12], null, g);
      box(0.34, 0.06, 0.16, u(SOFT_W), [0, 0.25, -0.42], null, g);
      box(0.34, 0.06, 0.16, u(SOFT_W), [0, 0.69, -0.42], null, g);
      [0.28, 0.46].forEach(z => box(0.025, 0.9, 0.025, wood, [0.29, 0.45, z], null, g));
      [0.3, 0.48, 0.66].forEach(y => box(0.02, 0.02, 0.18, wood, [0.29, y, 0.37], null, g));
      return g;
    }
    if (n.includes('canopybed')) {
      const wood = u('#4a2c17', { r: 0.55 });
      const goldCloth = u('#e9c46a', { r: 0.9 });
      const sheer = u('#ffffff', { o: 0.32, r: 0.9, dbl: true });
      box(1.1, 0.14, 1.1, wood, [0, 0.1, 0.02], null, g);
      box(1.04, 0.1, 1.0, u(SOFT_W), [0, 0.22, 0.03], null, g);
      box(1.08, 0.05, 0.7, goldCloth, [0, 0.285, 0.18], null, g);
      [-0.25, 0.25].forEach(x => box(0.42, 0.08, 0.2, u(SOFT_W), [x, 0.3, -0.34], null, g));
      box(1.04, 0.56, 0.05, wood, [0, 0.5, -0.55], null, g);
      [-0.54, 0.54].forEach(x => [-0.54, 0.54].forEach(z => {
        cyl(0.03, 0.03, 1.2, wood, [x, 0.6, z], null, g);
        sph(0.035, u(GOLD, G_OPT), [x, 1.215, z], null, g);
        cyl(0.07, 0.07, 1.06, sheer, [0.94 * x, 0.66, 0.94 * z], null, g, 8);
      }));
      [-0.54, 0.54].forEach(z => box(1.1, 0.04, 0.04, wood, [0, 1.18, z], null, g));
      [-0.54, 0.54].forEach(x => box(0.04, 0.04, 1.1, wood, [x, 1.18, 0], null, g));
      box(1.08, 0.004, 1.08, sheer, [0, 1.2, 0], null, g);
      return g;
    }
    if (n.includes('roundbed')) {
      const baseMat = u('#f2efe8', { r: 0.45 });
      cyl(0.58, 0.58, 0.16, baseMat, [0, 0.08, 0], null, g);
      tor(0.58, 0.015, u(GOLD, G_OPT), [0, 0.02, 0], [Math.PI / 2, 0, 0], g);
      tor(0.55, 0.012, u('#a855f7', { e: '#a855f7', ei: self.dark_ ? 1.6 : 0.3 }), [0, 0.006, 0], [Math.PI / 2, 0, 0], g);
      cyl(0.6, 0.6, 0.5, u('#f2efe8', { r: 0.45, dbl: true }), [0, 0.38, 0], null, g, 32);
      tor(0.6, 0.012, u(GOLD, G_OPT), [0, 0.63, 0], [Math.PI / 2, 0, Math.PI], g, Math.PI);
      const rotMat = new THREE.Group();
      cyl(0.52, 0.52, 0.1, u(SOFT_W), [0, 0.21, 0], null, rotMat);
      cyl(0.53, 0.53, 0.05, u(c || '#7a1f2b', { r: 0.9 }), [0, 0.275, 0.02], null, rotMat);
      [-0.2, 0.2].forEach(x => box(0.36, 0.08, 0.2, u(SOFT_W), [x, 0.29, -0.3], null, rotMat));
      g.add(rotMat);
      self.animators.push((time, dt) => { rotMat.rotation.y = (rotMat.rotation.y + 0.12 * dt) % (2 * Math.PI); });
      return g;
    }

    // 2. KITCHEN & APPLIANCES
    if (n.includes('gascooker') || (kind === 'cooker' && !n.includes('kero'))) {
      box(0.86, 0.8, 0.78, u('#bbbbbb', { m: 0.6, r: 0.3 }), [0, 0.4, 0], null, g);
      box(0.8, 0.05, 0.72, u('#222222', { r: 0.25 }), [0, 0.83, 0], null, g);
      const flame = new THREE.Mesh(
        self.pGeo('gflame', () => new THREE.RingGeometry(0.035, 0.06, 18)),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
      );
      flame.position.set(0, 0.86, 0.15); flame.rotation.x = -Math.PI / 2; g.add(flame);
      cyl(0.07, 0.06, 0.08, u('#9aa1a9', CHROME), [0, 0.9, 0.15], null, g);
      const steamG = new THREE.Group(); steamG.position.set(0, 0.95, 0.15); g.add(steamG);
      const puffs = [0, 1, 2].map(() => {
        const p = new THREE.Mesh(self.pGeo('puff', () => new THREE.SphereGeometry(0.03, 8, 8)), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
        steamG.add(p); return p;
      });
      self.animators.push((time) => {
        flame.scale.setScalar(0.9 + 0.08 * Math.sin(18 * time));
        puffs.forEach((p, i) => {
          const a = (0.6 * time + i / 3) % 1;
          p.position.y = 0.05 + 0.22 * a;
          p.scale.setScalar(0.5 + a);
          p.material.opacity = 0.4 * (1 - a);
        });
      });
      return g;
    }
    if (n.includes('kerostove') || n.includes('kerosene')) {
      cyl(0.07, 0.08, 0.06, u('#2e7d32', { r: 0.6 }), [0, 0.03, 0], null, g);
      cyl(0.075, 0.065, 0.09, u('#b8b8b8', { m: 0.6, r: 0.35 }), [0, 0.1, 0], null, g);
      cyl(0.06, 0.06, 0.04, u('#222222'), [0, 0.16, 0], null, g);
      return g;
    }
    if (n.includes('ovenrange') || n.includes('oven')) {
      const metal = u('#c9ced4', { m: 0.6, r: 0.3 });
      box(0.52, 0.5, 0.48, metal, [0, 0.25, 0], null, g);
      box(0.52, 0.012, 0.48, u('#16181c', { r: 0.25 }), [0, 0.505, 0], null, g);
      box(0.44, 0.24, 0.01, u('#20262d', { r: 0.15, m: 0.3, e: '#ff7a2a', ei: 0.5 }), [0, 0.22, 0.242], null, g);
      cyl(0.008, 0.008, 0.4, u('#e9ecef', CHROME), [0, 0.37, 0.265], [0, 0, Math.PI / 2], g);
      [-0.18, -0.09, 0, 0.09, 0.18].forEach(x => cyl(0.016, 0.016, 0.02, u('#16181c'), [x, 0.44, 0.245], [Math.PI / 2, 0, 0], g));
      box(0.52, 0.14, 0.02, metal, [0, 0.58, -0.23], null, g);
      box(0.1, 0.035, 0.004, u('#22c55e', { e: '#22c55e', ei: 1.2 }), [0, 0.6, -0.218], null, g);
      return g;
    }
    if (n.includes('kitchenisland') || n.includes('island')) {
      const wood = u(c || '#5a3c22', { r: 0.55 });
      const marble = u('#f4f2ee', { r: 0.22 });
      box(1.08, 0.44, 0.34, wood, [0, 0.22, -0.07], null, g);
      box(1.16, 0.04, 0.5, marble, [0, 0.46, -0.02], null, g);
      box(0.5, 0.001, 0.006, u('#c9ccd2'), [0.1, 0.481, -0.05], [0, 0.3, 0], g);
      [-0.25, 0.25].forEach(x => {
        cyl(0.07, 0.07, 0.03, u('#1f1b18', { r: 0.5 }), [x, 0.3, 0.2], null, g);
        cyl(0.012, 0.012, 0.3, u('#c0c4cb', CHROME), [x, 0.15, 0.2], null, g);
        tor(0.05, 0.006, u('#c0c4cb', CHROME), [x, 0.1, 0.2], [Math.PI / 2, 0, 0], g);
      });
      cyl(0.07, 0.07, 0.03, u('#f4f2ee'), [-0.2, 0.5, -0.05], null, g);
      [-0.23, -0.18, -0.2].forEach((x, idx) => sph(0.022, u(idx === 1 ? '#ffd60a' : '#f08a24'), [x, 0.53, -0.05 + (idx - 1) * 0.03], null, g));
      return g;
    }
    if (n.includes('blender')) {
      cyl(0.06, 0.06, 0.08, u('#2b2f36'), [0, 0.04, 0], null, g);
      box(0.03, 0.012, 0.004, u('#22c55e', { e: '#22c55e', ei: 1.2 }), [0, 0.05, 0.058], null, g);
      cyl(0.055, 0.055, 0.16, u('#dff3ff', { o: 0.45, r: 0.1 }), [0, 0.16, 0], null, g);
      cyl(0.05, 0.05, 0.12, u('#f08bb0'), [0, 0.14, 0], null, g);
      cyl(0.058, 0.058, 0.02, u('#1b1d22'), [0, 0.245, 0], null, g);
      return g;
    }
    if (n.includes('airfryer')) {
      box(0.2, 0.22, 0.2, u('#1b1d22', { r: 0.4 }), [0, 0.11, 0], null, g);
      box(0.12, 0.012, 0.012, u('#555b66', CHROME), [0, 0.07, 0.102], null, g);
      box(0.07, 0.03, 0.002, u('#ff8a3d', { e: '#ff8a3d', ei: 1.4 }), [0, 0.18, 0.101], null, g);
      return g;
    }
    if (n.includes('waterdispenser') || n.includes('dispenser')) {
      box(0.26, 0.62, 0.26, u('#f4f5f7', { r: 0.5 }), [0, 0.31, 0], null, g);
      box(0.16, 0.14, 0.01, u('#2b2f36'), [0, 0.42, 0.13], null, g);
      box(0.03, 0.03, 0.03, u('#e5484d'), [-0.04, 0.47, 0.14], null, g);
      box(0.03, 0.03, 0.03, u('#2f6fd6'), [0.04, 0.47, 0.14], null, g);
      box(0.14, 0.012, 0.04, u('#9aa3ad'), [0, 0.36, 0.14], null, g);
      [-0.06, 0.06].forEach((x, idx) => sph(0.008, u(idx ? '#3b82f6' : '#ef4444', { e: idx ? '#3b82f6' : '#ef4444', ei: 1.5 }), [x, 0.56, 0.131], null, g));
      cyl(0.04, 0.04, 0.04, u('#2f6fd6'), [0, 0.64, 0], null, g);
      cyl(0.11, 0.11, 0.3, u('#7cc6ff', { o: 0.55, r: 0.1 }), [0, 0.8, 0], null, g);
      cyl(0.1, 0.1, 0.2, u('#4aa3e0', { o: 0.5, r: 0.1 }), [0, 0.76, 0], null, g);
      return g;
    }
    if (n.includes('deepfreezer')) {
      box(0.52, 0.4, 0.4, u('#f4f5f7', { r: 0.45 }), [0, 0.2, 0], null, g);
      box(0.53, 0.05, 0.41, u('#e9ecef', { r: 0.45 }), [0, 0.425, 0], null, g);
      box(0.18, 0.03, 0.02, u('#9aa3ad', CHROME), [0, 0.37, 0.205], null, g);
      box(0.06, 0.03, 0.004, u('#1f6f78'), [0.18, 0.3, 0.201], null, g);
      sph(0.008, u('#22c55e', { e: '#22c55e', ei: 1.6 }), [-0.2, 0.36, 0.201], null, g);
      return g;
    }
    if (n.includes('fridge') || kind === 'fridge') {
      box(0.84, 1.85, 0.78, u(c || '#dfe6ee', { r: 0.4 }), [0, 0.93, 0], null, g);
      box(0.04, 0.5, 0.04, u('#777777', CHROME), [0.3, 1.2, 0.4], null, g);
      box(0.84, 0.03, 0.79, u('#9aa3ad', CHROME), [0, 1.15, 0], null, g);
      return g;
    }
    if (n.includes('cooler') || kind === 'cooler') {
      box(0.36, 0.22, 0.26, u('#1f6fd6'), [0, 0.11, 0], null, g);
      box(0.38, 0.05, 0.28, u('#f4f4f4'), [0, 0.245, 0], null, g);
      g.userData.eat = true;
      return g;
    }

    // 3. POWER & COOLING
    if (n.includes('genset') || n.includes('generator') || kind === 'genset') {
      box(0.4, 0.26, 0.28, u('#f5b700', { r: 0.5 }), [0, 0.15, 0], null, g);
      box(0.42, 0.02, 0.3, u('#222222'), [0, 0.3, 0], null, g);
      box(0.14, 0.1, 0.02, u('#222222'), [-0.08, 0.14, 0.145], null, g);
      cyl(0.018, 0.018, 0.08, u('#555555'), [0.15, 0.34, -0.06], null, g);
      const smokeG = new THREE.Group(); smokeG.position.set(0.15, 0.4, -0.06); g.add(smokeG);
      const puffs = [0, 1, 2].map(() => {
        const p = new THREE.Mesh(self.pGeo('puff', () => new THREE.SphereGeometry(0.03, 8, 8)), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
        smokeG.add(p); return p;
      });
      g.userData.toggleGen = true;
      g.userData.genActive = true;
      self.animators.push((time, dt, powered) => {
        const active = g.userData.genActive && powered;
        smokeG.visible = active;
        if (!active) return;
        puffs.forEach((p, idx) => {
          const a = (0.7 * time + idx / 3) % 1;
          p.position.y = 0.05 + 0.25 * a;
          p.scale.setScalar(0.5 + a * 1.2);
          p.material.opacity = 0.4 * (1 - a);
        });
      });
      return g;
    }
    if (n.includes('rechargefan') || (n.includes('fan') && !n.includes('ceiling'))) {
      box(0.22, 0.08, 0.18, u('#e9ecef', { r: 0.5 }), [0, 0.04, 0], null, g);
      box(0.04, 0.012, 0.004, u('#22c55e', { e: '#22c55e', ei: 1.2 }), [0.06, 0.06, 0.091], null, g);
      cyl(0.012, 0.012, 0.52, u('#9aa5ad', { m: 0.5 }), [0, 0.33, 0], null, g);
      const headG = new THREE.Group(); headG.position.set(0, 0.62, 0.03); g.add(headG);
      cyl(0.035, 0.035, 0.06, u('#e9ecef'), [0, 0, 0], [Math.PI / 2, 0, 0], headG);
      const rotorG = new THREE.Group(); rotorG.position.set(0, 0, 0.05); headG.add(rotorG);
      [0, 1, 2].forEach(i => box(0.04, 0.2, 0.005, u('#9fd8ff', { o: 0.85 }), [0, 0, 0], [0, 0, i * Math.PI * 2 / 3], rotorG));
      tor(0.12, 0.004, u('#cfd8dc'), [0, 0, 0.06], null, headG);
      g.userData.fanSpeed = 1;
      g.userData.toggleFan = true;
      self.animators.push((time, dt) => {
        const mult = g.userData.fanSpeed === 2 ? 18 : (g.userData.fanSpeed === 1 ? 11 : 0);
        if (mult > 0) rotorG.rotation.z += dt * mult;
      });
      return g;
    }
    if (n.includes('ceilingfan')) {
      cyl(0.012, 0.012, 0.16, u('#7a6a55', { m: 0.4 }), [0, 1.17, 0], null, g);
      cyl(0.06, 0.06, 0.06, u('#8a6a3b', { m: 0.5, r: 0.4 }), [0, 1.07, 0], null, g);
      const rotorG = new THREE.Group(); rotorG.position.set(0, 1.06, 0); g.add(rotorG);
      [0, 1, 2, 3].forEach(i => {
        const a = i * Math.PI / 2;
        box(0.3, 0.008, 0.07, u('#6b4a2b'), [0.19 * Math.cos(a), 0, 0.19 * Math.sin(a)], [0, -a, 0], rotorG);
      });
      sph(0.035, u('#fff6d6', { e: '#ffdca0', ei: self.dark_ ? 2 : 0 }), [0, 1.02, 0], null, g);
      g.userData.fanSpeed = 1;
      g.userData.toggleFan = true;
      self.animators.push((time, dt, powered) => {
        const spd = (g.userData.fanSpeed || 0) * 5;
        if (powered && spd > 0) rotorG.rotation.y += dt * spd;
      });
      return g;
    }
    if (n.includes('solar')) {
      box(0.3, 0.42, 0.14, u('#eceff1'), [0, 0.3, 0], null, g);
      pln(0.14, 0.06, u('#00e676', { e: '#00e676', ei: 0.6 }), [0, 0.4, 0.072], null, g);
      box(0.34, 0.1, 0.18, u('#263238'), [0, 0.05, 0.02], null, g);
      return g;
    }
    if (n.includes('ac') || n.includes('splitac')) {
      box(0.42, 0.13, 0.08, u('#f6f7f9'), [0, 0.24, 0.04], null, g);
      pln(0.36, 0.02, u('#9aa3ad'), [0, 0.195, 0.082], null, g);
      cyl(0.008, 0.008, 0.002, u('#3d7bff', { e: '#3d7bff', ei: 1 }), [0.17, 0.275, 0.082], [Math.PI / 2, 0, 0], g);
      return g;
    }

    // 4. TVS & ENTERTAINMENT
    if (n.includes('oledtv') || n.includes('tv') || n.includes('bigtv') || kind === 'tv') {
      const wood = u(c || '#5a3c22', { r: 0.55 });
      box(1.0, 0.18, 0.34, wood, [0, 0.09, -0.04], null, g);
      box(1.0, 0.01, 0.34, u('#3a2716', { r: 0.5 }), [0, 0.185, -0.04], null, g);
      box(0.3, 0.04, 0.1, u('#2b2f36', CHROME), [0, 0.21, -0.12], null, g);
      box(1.12, 0.64, 0.015, u('#0b0b0d', { r: 0.18 }), [0, 0.55, -0.12], null, g);
      if (!self.tvMat) self.initTV();
      const screenMat = self.tvMat || u('#163a66', { r: 0.1, e: '#3a86ff', ei: 0.35 });
      pln(1.04, 0.585, screenMat, [0, 0.55, -0.111], null, g);
      box(0.56, 0.05, 0.06, u('#1b1d22', { r: 0.7 }), [0, 0.21, 0.06], null, g);
      g.userData.isTv = true;
      return g;
    }
    if (n.includes('hometheatre') || n.includes('theatre')) {
      const dark = u('#1b1d22', { r: 0.35 });
      const spkMat = u('#3a3d44', { r: 0.6 });
      box(0.8, 0.2, 0.32, dark, [0, 0.1, -0.08], null, g);
      box(0.76, 0.004, 0.01, u('#a855f7', { e: '#a855f7', ei: 2.0 }), [0, 0.006, 0.07], null, g);
      box(0.6, 0.06, 0.08, u('#2b2f36', { r: 0.8 }), [0, 0.24, -0.04], null, g);
      box(0.18, 0.22, 0.2, dark, [0.24, 0.32, -0.1], null, g);
      box(0.26, 0.09, 0.2, dark, [-0.2, 0.26, -0.1], null, g);
      box(0.12, 0.025, 0.002, u('#38bdf8', { e: '#38bdf8', ei: 1.4 }), [-0.2, 0.27, 0.001], null, g);
      const woofers = [];
      [-0.52, 0.52].forEach(x => {
        box(0.13, 0.72, 0.15, dark, [x, 0.36, -0.08], null, g);
        [0.58, 0.4, 0.22].forEach(y => {
          const w = cyl(0.045, 0.045, 0.012, spkMat, [x, y, -0.004], [Math.PI / 2, 0, 0], g);
          woofers.push(w);
        });
      });
      self.animators.push((time, dt, powered) => {
        if (powered) {
          const r = 1 + 0.14 * Math.max(0, Math.sin(13 * time));
          woofers.forEach(w => w.scale.set(r, 1, r));
        }
      });
      return g;
    }
    if (n.includes('homecinema') || n.includes('cinema')) {
      box(1.66, 0.62, 0.04, u('#0d0f12'), [0, 0.52, -0.24], null, g);
      pln(1.58, 0.54, u('#3a86ff', { e: '#3a86ff', ei: 0.8 }), [0, 0.52, -0.218], null, g);
      box(1.2, 0.12, 0.24, u('#2b2f36'), [0, 0.06, -0.12], null, g);
      [-0.78, 0.78].forEach(x => {
        box(0.12, 0.62, 0.14, u('#1f2328'), [x, 0.31, -0.1], null, g);
        cyl(0.04, 0.04, 0.005, u('#555555'), [x, 0.42, -0.028], [Math.PI / 2, 0, 0], g);
      });
      return g;
    }
    if (n.includes('ps5') || n.includes('playstation')) {
      box(0.5, 0.14, 0.26, u('#1f2328'), [0, 0.07, -0.12], null, g);
      box(0.48, 0.28, 0.02, u('#0d0f12'), [0, 0.34, -0.2], null, g);
      pln(0.44, 0.24, u('#2bb24c', { e: '#1f8a3a', ei: 0.7 }), [0, 0.34, -0.188], null, g);
      box(0.05, 0.17, 0.12, u('#f4f5f7'), [0.2, 0.225, -0.12], null, g);
      box(0.012, 0.15, 0.004, u('#3d7bff', { e: '#3d7bff', ei: 1.2 }), [0.2, 0.225, -0.058], null, g);
      [-0.08, 0.06].forEach(x => box(0.08, 0.025, 0.05, u(x < 0 ? '#f4f5f7' : '#1f2328'), [x, 0.155, -0.06], null, g));
      box(0.26, 0.05, 0.22, u('#c8102e'), [0, 0.12, 0.16], null, g);
      return g;
    }
    if (n.includes('snooker') || n.includes('pooltable')) {
      box(1.08, 0.04, 0.5, u('#0f7a3d'), [0, 0.3, 0], null, g);
      [-1, 1].forEach(e => box(1.14, 0.05, 0.04, u('#5a3216'), [0, 0.32, 0.265 * e], null, g));
      [-1, 1].forEach(e => box(0.04, 0.05, 0.57, u('#5a3216'), [0.555 * e, 0.32, 0], null, g));
      [[-0.48, -0.2], [0.48, -0.2], [-0.48, 0.2], [0.48, 0.2]].forEach(p => box(0.06, 0.28, 0.06, u('#3e2210'), [p[0], 0.14, p[1]], null, g));
      ['#e5484d', '#e5484d', '#e5484d', '#f5c542', '#2f7de1', '#111111', '#ffffff'].forEach((bCol, i) => {
        sph(0.016, u(bCol, { r: 0.25 }), [-0.25 + (i % 4) * 0.05 + 0.3 * (i > 3), 0.335, -0.06 + 0.04 * Math.floor(i / 2)], null, g, 10);
      });
      cyl(0.006, 0.01, 0.62, u('#c9a27a'), [0.2, 0.345, 0.12], [0, 0.3, Math.PI / 2], g, 6);
      return g;
    }
    if (n.includes('piano')) {
      const ebony = u('#0b0b0d', { r: 0.18, m: 0.2 });
      box(0.62, 0.14, 0.74, ebony, [0, 0.34, -0.06], null, g);
      box(0.6, 0.012, 0.66, ebony, [0, 0.5, -0.12], [0.45, 0, 0], g);
      cyl(0.006, 0.006, 0.3, u(GOLD, G_OPT), [0, 0.43, -0.11], [0.45, 0, 0], g, 6);
      box(0.56, 0.03, 0.1, u('#f8f8f2'), [0, 0.42, 0.33], null, g);
      for (let i = 0; i < 10; i++) box(0.022, 0.012, 0.055, ebony, [-0.25 + 0.055 * i, 0.44, 0.31], null, g);
      [[-0.24, -0.32], [0.24, -0.32], [0, 0.24]].forEach(p => cyl(0.025, 0.02, 0.27, ebony, [p[0], 0.135, p[1]], null, g, 8));
      box(0.34, 0.05, 0.14, ebony, [0, 0.22, 0.48], null, g);
      [-0.14, 0.14].forEach(x => box(0.03, 0.2, 0.1, ebony, [x, 0.1, 0.48], null, g));
      return g;
    }
    if (n.includes('guitar')) {
      sph(0.1, u('#d4a373'), [0, 0.14, 0.05], [1, 1.1, 0.35], g, 20);
      sph(0.075, u('#d4a373'), [0, 0.27, 0.05], [1, 1, 0.35], g, 20);
      box(0.03, 0.3, 0.02, u('#3e2723'), [0, 0.47, 0.05], null, g);
      cyl(0.03, 0.03, 0.002, u('#2b1a12'), [0, 0.19, 0.086], [Math.PI / 2, 0, 0], g, 16);
      return g;
    }
    if (n.includes('camera')) {
      cyl(0.01, 0.01, 0.5, u('#2a2a2a'), [0, 0.25, 0], null, g, 8);
      box(0.13, 0.09, 0.07, u('#1c1c1e'), [0, 0.58, 0], null, g);
      cyl(0.032, 0.036, 0.07, u('#2b2b2e', { m: 0.5, r: 0.3 }), [0, 0.58, 0.06], [Math.PI / 2, 0, 0], g, 18);
      cyl(0.026, 0.026, 0.004, u('#3b5bdb', { m: 0.8, r: 0.1 }), [0, 0.58, 0.096], [Math.PI / 2, 0, 0], g, 18);
      box(0.03, 0.02, 0.02, u('#e5484d'), [0.045, 0.64, 0], null, g);
      return g;
    }
    if (n.includes('ringlight')) {
      cyl(0.01, 0.01, 0.5, u('#2a2a2a'), [0, 0.25, 0], null, g, 8);
      tor(0.13, 0.018, u('#f4f4f4', { e: '#fff6e0', ei: 1.6 }), [0, 0.72, 0], null, g, 32);
      box(0.06, 0.11, 0.012, u('#111111'), [0, 0.72, 0.01], null, g);
      return g;
    }

    // 5. SEATING & LIVING
    if (n.includes('sectional')) {
      const mat = u(c || '#b9b2a6', { r: 0.95 });
      box(1.76, 0.14, 0.56, mat, [0, 0.1, 0], null, g);
      [-0.8, 0.8].forEach(x => [-0.22, 0.22].forEach(z => cyl(0.02, 0.02, 0.03, u('#2a2420'), [x, 0.015, z], null, g)));
      [-0.58, 0, 0.58].forEach(x => {
        box(0.56, 0.1, 0.46, mat, [x, 0.21, 0.04], null, g);
        box(0.56, 0.3, 0.13, mat, [x, 0.37, -0.21], [-0.12, 0, 0], g);
      });
      [-0.88, 0.88].forEach(x => box(0.1, 0.28, 0.56, mat, [x, 0.21, 0], null, g));
      [-0.7, 0.7].forEach((x, i) => box(0.18, 0.16, 0.06, u('#e9c46a', { r: 0.95 }), [x, 0.33, -0.12], [-0.2, i ? 0.3 : -0.3, 0], g));
      return g;
    }
    if (n.includes('beanbag')) {
      const mat = u(c || '#e07a3f', { r: 0.85 });
      sph(0.24, mat, [0, 0.14, 0.02], [2.0, 1.16, 1.9], g, 16);
      sph(0.21, mat, [0, 0.25, -0.12], [2.0, 1.6, 1.05], g, 16);
      return g;
    }
    if (n.includes('diamondthrone') || n.includes('throne')) {
      box(0.42, 0.1, 0.4, u('#6b1424', { r: 0.6 }), [0, 0.17, 0.02], null, g);
      box(0.46, 0.12, 0.44, u(GOLD, G_OPT), [0, 0.07, 0.02], null, g);
      box(0.42, 0.62, 0.06, u(GOLD, G_OPT), [0, 0.5, -0.17], null, g);
      box(0.34, 0.48, 0.02, u('#6b1424', { r: 0.6 }), [0, 0.5, -0.135], null, g);
      cyl(0.001, 0.07, 0.12, u(GOLD, G_OPT), [0, 0.86, -0.17], null, g, 6);
      [-1, 1].forEach(e => {
        box(0.06, 0.16, 0.38, u(GOLD, G_OPT), [0.22 * e, 0.28, 0.02], null, g);
        [-0.1, 0.02, 0.14].forEach(z => sph(0.022, u('#e8f4ff', { m: 0.3, r: 0.05, e: '#bfe3ff', ei: 0.6 }), [0.22 * e, 0.37, z], null, g, 8));
      });
      return g;
    }
    if (n.includes('armchair') || kind === 'armchair') {
      const mat = u(c || '#e0c25a', { r: 0.85 });
      box(0.86, 0.36, 0.82, mat, [0, 0.22, 0.02], null, g);
      box(0.68, 0.15, 0.64, mat, [0, 0.48, 0.06], null, g);
      box(0.86, 0.58, 0.2, mat, [0, 0.68, -0.32], null, g);
      [-0.38, 0.38].forEach(x => box(0.16, 0.52, 0.82, mat, [x, 0.44, 0.02], null, g));
      return g;
    }
    if (n.includes('3seater') || n.includes('familysofa') || n.includes('bigsofa')) {
      const mat = u(c || '#c97b4a', { r: 0.85 });
      box(2.2, 0.38, 0.9, mat, [0, 0.22, 0.02], null, g);
      [-0.68, 0, 0.68].forEach(x => box(0.64, 0.15, 0.68, mat, [x, 0.48, 0.08], null, g));
      box(2.2, 0.62, 0.22, mat, [0, 0.72, -0.34], null, g);
      [-1.02, 1.02].forEach(x => box(0.18, 0.58, 0.9, mat, [x, 0.46, 0.02], null, g));
      return g;
    }
    if (n.includes('sofa') || kind === 'sofa') {
      const mat = u(c || '#1f8a64', { r: 0.85 });
      box(1.5, 0.38, 0.9, mat, [0, 0.22, 0.02], null, g);
      [-0.36, 0.36].forEach(x => box(0.68, 0.15, 0.68, mat, [x, 0.48, 0.08], null, g));
      box(1.5, 0.62, 0.22, mat, [0, 0.72, -0.34], null, g);
      [-0.68, 0.68].forEach(x => box(0.18, 0.58, 0.9, mat, [x, 0.46, 0.02], null, g));
      return g;
    }
    if (n.includes('diningtable') || (kind === 'table' && !n.includes('side') && !n.includes('coffee'))) {
      cyl(0.34, 0.34, 0.03, u('#c9a27a'), [0, 0.31, 0], null, g, 28);
      cyl(0.04, 0.06, 0.3, u('#8a5a36'), [0, 0.15, 0], null, g, 12);
      cyl(0.16, 0.18, 0.024, u('#8a5a36'), [0, 0.012, 0], null, g, 20);
      cyl(0.07, 0.06, 0.012, u('#f4f4f4'), [0, 0.33, -0.16], null, g, 20);
      cyl(0.03, 0.035, 0.1, u('#f59e42'), [0.12, 0.37, 0.05], null, g, 12);
      [-1, 1].forEach(side => {
        const chairG = new THREE.Group(); chairG.position.set(0, 0, 0.46 * side); g.add(chairG);
        box(0.22, 0.03, 0.2, u('#8a5a36'), [0, 0.2, 0], null, chairG);
        box(0.2, 0.025, 0.18, u('#e8a0a0'), [0, 0.225, 0], null, chairG);
        box(0.22, 0.28, 0.025, u('#8a5a36'), [0, 0.35, 0.1 * side], null, chairG);
        [[-0.09, -0.08], [0.09, -0.08], [-0.09, 0.08], [0.09, 0.08]].forEach(p => box(0.025, 0.2, 0.025, u('#8a5a36'), [p[0], 0.1, p[1]], null, chairG));
      });
      return g;
    }
    if (n.includes('chair') || kind === 'chair') {
      const mat = u(c || '#d0243a', { r: 0.7 });
      box(0.48, 0.05, 0.48, mat, [0, 0.38, 0], null, g);
      box(0.48, 0.46, 0.05, mat, [0, 0.62, -0.22], null, g);
      [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].forEach(p => cyl(0.018, 0.014, 0.38, mat, [p[0], 0.19, p[1]], null, g, 10));
      return g;
    }
    if (n.includes('sidetable') || n.includes('stool') || kind === 'stool') {
      const wood = u(c || '#d2b48c', { r: 0.6 });
      cyl(0.24, 0.24, 0.03, wood, [0, 0.38, 0], null, g, 20);
      cyl(0.02, 0.02, 0.38, wood, [0, 0.19, 0], null, g, 10);
      cyl(0.14, 0.14, 0.02, wood, [0, 0.01, 0], null, g, 16);
      cyl(0.04, 0.05, 0.1, u('#2f4a2f', { r: 0.3 }), [0, 0.44, 0], null, g, 12);
      return g;
    }

    // 6. BATH & UTILITY
    if (n.includes('waterdrum') || n.includes('barrel') || kind === 'barrel') {
      cyl(0.14, 0.14, 0.4, u('#1f5faf'), [0.06, 0.2, -0.03], null, g, 22);
      cyl(0.1, 0.1, 0.012, u('#174a8a'), [0.06, 0.405, -0.03], null, g, 22);
      box(0.12, 0.17, 0.08, u('#ffcb05'), [-0.14, 0.085, 0.12], null, g);
      box(0.12, 0.17, 0.08, u('#ffcb05'), [-0.02, 0.085, 0.17], [0, 0.4, 0], g);
      return g;
    }
    if (n.includes('bucket') || kind === 'bucket') {
      cyl(0.1, 0.08, 0.22, u('#1e88e5', { dbl: true }), [0.07, 0.11, -0.04], null, g, 20);
      cyl(0.095, 0.095, 0.005, u('#8fd0ff', { o: 0.85 }), [0.07, 0.19, -0.04], null, g, 20);
      cyl(0.1, 0.07, 0.06, u('#e53935'), [-0.1, 0.03, 0.1], null, g, 20);
      return g;
    }
    if (n.includes('shower') || kind === 'shower') {
      box(0.9, 0.06, 0.9, u('#99cccc', { r: 0.5 }), [0, 0.04, 0], null, g);
      cyl(0.02, 0.02, 2.0, u('#888888', CHROME), [-0.35, 1.0, -0.35], null, g);
      box(0.35, 0.06, 0.35, u('#888888', CHROME), [-0.15, 2.0, -0.15], null, g);
      const waterG = new THREE.Group(); waterG.position.set(-0.15, 1.9, -0.15); g.add(waterG);
      const drops = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => {
        const d = new THREE.Mesh(self.pGeo('drop', () => new THREE.CylinderGeometry(0.005, 0.005, 0.14, 4)), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.5, depthWrite: false }));
        d.position.set(0.07 * Math.sin(2.3 * i), -0.5, 0.07 * Math.cos(1.7 * i));
        waterG.add(d); return d;
      });
      self.animators.push((time) => {
        drops.forEach((d, idx) => {
          const o = (1.8 * time + idx / 9) % 1;
          d.position.y = -1.7 * o;
          d.material.opacity = 0.55 * (1 - 0.6 * o);
        });
      });
      return g;
    }
    if (n.includes('jacuzzi')) {
      cyl(0.54, 0.56, 0.26, u('#e9ecef'), [0, 0.13, 0], null, g, 32);
      cyl(0.47, 0.47, 0.02, u('#4cc9f0', { o: 0.85, r: 0.1, e: '#2bb5e8', ei: 0.7 }), [0, 0.235, 0], null, g, 32);
      tor(0.5, 0.035, u(GOLD, G_OPT), [0, 0.262, 0], [Math.PI / 2, 0, 0], g, Math.PI * 2);
      const bubbleG = new THREE.Group(); g.add(bubbleG);
      const bubbles = [[0.2, 0.1], [-0.15, 0.22], [0.05, -0.25], [-0.25, -0.08], [0.28, -0.12]].map(p => {
        return sph(0.025, u('#ffffff', { o: 0.8 }), [p[0], 0.255, p[1]], null, bubbleG, 8);
      });
      self.animators.push((time) => {
        bubbles.forEach((b, i) => { b.position.y = 0.25 + 0.02 * Math.sin(time * 6 + i); });
      });
      return g;
    }
    if (n.includes('bathtub')) {
      box(1.2, 0.38, 0.62, u('#f8f9fa', { r: 0.2 }), [0, 0.19, 0], null, g);
      cyl(0.02, 0.02, 0.15, u('#9aa1a9', CHROME), [-0.5, 0.44, 0], null, g);
      return g;
    }
    if (n.includes('toilet') || n.includes('watercloset') || kind === 'toilet') {
      const white = u('#e8ecf0', { r: 0.2 });
      box(0.38, 0.36, 0.48, white, [0, 0.18, 0.05], null, g);
      box(0.42, 0.56, 0.2, white, [0, 0.52, -0.2], null, g);
      box(0.34, 0.04, 0.42, u('#dde3ea'), [0, 0.38, 0.06], null, g);
      cyl(0.015, 0.015, 0.02, u('#9aa1a9', CHROME), [-0.14, 0.72, -0.2], [Math.PI / 2, 0, 0], g);
      return g;
    }
    if (n.includes('dumbbell')) {
      box(0.44, 0.04, 0.16, u('#333333'), [0, 0.1, 0], null, g);
      [-0.19, 0.19].forEach(x => box(0.03, 0.1, 0.12, u('#333333'), [x, 0.05, 0], null, g));
      [-0.12, 0, 0.12].forEach((x, r) => {
        const dbG = new THREE.Group(); dbG.position.set(x, 0.14, 0); dbG.rotation.z = Math.PI / 2; g.add(dbG);
        cyl(0.012, 0.012, 0.1, u('#9aa5ad', { m: 0.6 }), [0, 0, 0], null, dbG, 8);
        [-0.045, 0.045].forEach(y => cyl(0.03, 0.03, 0.025, u(r === 1 ? '#e5484d' : '#1d2433'), [0, y, 0], null, dbG, 14));
      });
      return g;
    }

    // 7. WARDROBES & STORAGE
    if (n.includes('walkincloset') || n.includes('walkin')) {
      const wood = u('#2a2420', { r: 0.5 });
      const light = u('#ffe7b8', { e: '#ffd08a', ei: self.dark_ ? 1.6 : 0.5 });
      box(1.14, 1.1, 0.04, wood, [0, 0.55, -0.26], null, g);
      [-0.56, 0.56].forEach(x => box(0.04, 1.1, 0.5, wood, [x, 0.55, -0.02], null, g));
      box(1.16, 0.04, 0.52, wood, [0, 1.1, -0.02], null, g);
      box(1.14, 0.08, 0.5, wood, [0, 0.04, -0.02], null, g);
      box(0.03, 1.02, 0.48, wood, [0, 0.58, -0.02], null, g);
      cyl(0.008, 0.008, 0.5, u(GOLD, G_OPT), [-0.28, 0.92, -0.02], [0, 0, Math.PI / 2], g);
      ['#c8102e', '#1f3b8f', '#f4a6c0', '#0b6e4f', '#e9c46a', '#111111', '#f4efe6'].forEach((col, i) => {
        box(0.035, 0.48, 0.34, u(col, { r: 0.9 }), [-0.48 + 0.065 * i, 0.66, -0.03], null, g);
      });
      [0.3, 0.58, 0.86].forEach((y, r) => {
        box(0.5, 0.025, 0.42, wood, [0.28, y, -0.04], null, g);
        box(0.48, 0.008, 0.02, light, [0.28, y - 0.018, 0.14], null, g);
        [0, 1, 2].forEach(o => box(0.1, r === 2 ? 0.09 : 0.05, r === 2 ? 0.07 : 0.13, u(['#c8102e', '#1f3b8f', '#f4a6c0', '#0b6e4f'][o % 4]), [0.12 + 0.15 * o, y + 0.04, -0.02], null, g));
      });
      return g;
    }
    if (n.includes('wardrobe')) {
      const wood = u(c || '#6b4a2b', { r: 0.6 });
      const glass = u('#cfe3ee', { m: 0.55, r: 0.12 });
      box(1.1, 0.06, 0.48, u('#2a2420'), [0, 0.03, -0.02], null, g);
      box(1.12, 0.98, 0.5, wood, [0, 0.54, -0.02], null, g);
      box(1.16, 0.04, 0.54, wood, [0, 1.05, -0.02], null, g);
      box(0.52, 0.9, 0.012, glass, [-0.27, 0.54, 0.232], null, g);
      box(0.52, 0.9, 0.012, glass, [0.27, 0.54, 0.242], null, g);
      box(0.03, 0.94, 0.02, wood, [0, 0.54, 0.25], null, g);
      [-0.05, 0.05].forEach(x => box(0.012, 0.16, 0.012, u('#2b2b2b', CHROME), [x, 0.56, 0.26], null, g));
      return g;
    }
    if (n.includes('library') || n.includes('bookshelf') || kind === 'bookshelf') {
      const wood = u(c || '#4a2c17', { r: 0.6 });
      box(1.12, 1.1, 0.03, wood, [0, 0.55, -0.26], null, g);
      [-0.55, 0.55].forEach(x => box(0.04, 1.1, 0.3, wood, [x, 0.55, -0.12], null, g));
      [0.04, 0.3, 0.56, 0.82, 1.08].forEach(y => box(1.1, 0.03, 0.3, wood, [0, y, -0.12], null, g));
      box(0.03, 1.04, 0.28, wood, [0, 0.56, -0.12], null, g);
      const bookCols = ['#8d2a2a', '#1f3b8f', '#2f7a4f', '#d9a630', '#3a3d44', '#7a1f2b', '#e07a3f', '#f4efe6', '#2a9d8f'];
      [0.07, 0.33, 0.59, 0.85].forEach((y, s) => {
        [-0.48, 0.06].forEach((xStart, r) => {
          let cx = xStart;
          for (let b = 0; b < 7; b++) {
            const bw = 0.035 + (b % 3) * 0.008;
            const bh = 0.17 + ((b + s) % 3) * 0.025;
            box(bw, bh, 0.2, u(bookCols[(b * 2 + s * 3 + r) % bookCols.length]), [cx + bw / 2, y + bh / 2, -0.12], null, g);
            cx += bw + 0.004;
          }
        });
      });
      return g;
    }
    if (n.includes('goldvault') || n.includes('vault')) {
      box(0.46, 0.62, 0.36, u('#2b2f36', { m: 0.6, r: 0.35 }), [0, 0.31, -0.02], null, g);
      pln(0.38, 0.5, u('#1a1d22'), [0, 0.33, 0.162], null, g);
      cyl(0.025, 0.025, 0.02, u(GOLD, G_OPT), [0.17, 0.33, 0.17], [Math.PI / 2, 0, 0], g, 14);
      [0, 1, 2].forEach(e => [0, 1, 2].forEach(r => {
        box(0.09, 0.04, 0.12, u('#e3b84a', { m: 0.85, r: 0.25, e: '#8a6a10', ei: 0.25 }), [-0.11 + 0.11 * r, 0.14 + 0.15 * e, 0.1], null, g);
      }));
      return g;
    }

    // 8. PLANTS & DECOR
    if (n.includes('snakeplant')) {
      cyl(0.09, 0.09, 0.16, u('#f1eee8', { r: 0.5 }), [0, 0.08, 0], null, g);
      cyl(0.08, 0.08, 0.01, u('#3b2a1d'), [0, 0.155, 0], null, g);
      for (let i = 0; i < 7; i++) {
        const rad = i / 7 * Math.PI * 2;
        const h = 0.3 + (37 * i % 5) * 0.04;
        cyl(0.001, 0.035, h, u(i % 2 ? '#2f6b3a' : '#4a8a3c'), [0.035 * Math.cos(rad), 0.16 + h / 2, 0.035 * Math.sin(rad)], [0.12 * Math.sin(rad), rad, -0.12 * Math.cos(rad)], g, 6);
      }
      return g;
    }
    if (n.includes('bananaplant') || (n.includes('plant') && !n.includes('snake'))) {
      cyl(0.11, 0.11, 0.3, u('#3a3d44', { r: 0.5 }), [0, 0.15, 0], null, g);
      cyl(0.1, 0.1, 0.01, u('#3b2a1d'), [0, 0.295, 0], null, g);
      for (let i = 0; i < 5; i++) {
        const leafG = new THREE.Group(); leafG.rotation.y = i / 5 * Math.PI * 2 + 0.3; g.add(leafG);
        const h = 0.32 + (3 * i % 4) * 0.07;
        cyl(0.008, 0.008, h, u('#4a7a3a'), [0, 0.3 + h / 2, 0.02], [0.18, 0, 0], leafG);
        sph(0.09, u(i % 2 ? '#2f7a4f' : '#3b8a55'), [0, 0.3 + h + 0.1, 0.08], [1.2, 3.2, 0.25], leafG);
      }
      return g;
    }
    if (n.includes('aquarium') || n.includes('fishtank')) {
      box(0.5, 0.26, 0.28, u('#2b2f36'), [0, 0.13, 0], null, g);
      box(0.5, 0.32, 0.28, u('#7cc6e8', { o: 0.45, r: 0.1, e: self.dark_ ? '#1b6a9c' : '#000000', ei: 0.6 }), [0, 0.42, 0], null, g);
      box(0.48, 0.03, 0.26, u('#e9d8a6'), [0, 0.275, 0], null, g);
      box(0.52, 0.03, 0.3, u('#1f2328'), [0, 0.595, 0], null, g);
      [[-0.12, 0.44, 0.03, '#ff7b00'], [0.08, 0.5, -0.05, '#ffd60a'], [0.14, 0.38, 0.06, '#ff4d6d'], [-0.04, 0.36, -0.07, '#4cc9f0']].forEach(f => {
        cyl(0.001, 0.018, 0.05, u(f[3], { e: f[3], ei: 0.25 }), [f[0], f[1], f[2]], [0, 0, Math.PI / 2], g, 6);
      });
      return g;
    }
    if (n.includes('goldlion') || n.includes('lion')) {
      box(0.4, 0.12, 0.3, u('#f4f1ea'), [0, 0.06, 0], null, g);
      const lionG = new THREE.Group(); lionG.position.set(0, 0.12, 0); g.add(lionG);
      box(0.3, 0.13, 0.13, u('#d4a93a', G_OPT), [0, 0.12, 0], null, lionG);
      sph(0.1, u('#c9952a', G_OPT), [0.16, 0.22, 0], null, lionG);
      sph(0.065, u('#e3b84a', G_OPT), [0.2, 0.22, 0], null, lionG);
      [[-0.1, -0.04], [-0.1, 0.04], [0.1, -0.04], [0.1, 0.04]].forEach(p => cyl(0.022, 0.025, 0.08, u('#d4a93a', G_OPT), [p[0], 0.04, p[1]], null, lionG, 8));
      cyl(0.01, 0.012, 0.14, u('#d4a93a', G_OPT), [-0.18, 0.17, 0], [0, 0, 0.9], lionG, 6);
      return g;
    }
    if (n.includes('rugaso') || n.includes('asorug')) {
      box(1.66, 0.012, 0.5, u('#4a2c17', { r: 1 }), [0, 0.006, 0], null, g);
      [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].forEach((x, idx) => box(0.06, 0.002, 0.5, u(idx % 2 ? '#c8102e' : '#e9c46a', { r: 1 }), [x, 0.0125, 0], null, g));
      [-0.86, 0.86].forEach(x => box(0.06, 0.006, 0.46, u('#efe6d2', { r: 1 }), [x, 0.004, 0], null, g));
      return g;
    }
    if (n.includes('rugpersian') || n.includes('persian')) {
      box(1.72, 0.012, 1.72, u('#7a1f2b', { r: 1 }), [0, 0.006, 0], null, g);
      cyl(0.32, 0.32, 0.002, u('#d9a630', { r: 1 }), [0, 0.0125, 0], null, g);
      cyl(0.2, 0.2, 0.002, u('#1d2a52', { r: 1 }), [0, 0.0135, 0], null, g);
      return g;
    }
    if (n.includes('rug') || kind === 'rug') {
      box(1.14, 0.016, 1.14, u('#d8d1c4', { r: 1 }), [0, 0.008, 0], null, g, false);
      box(1.06, 0.012, 1.06, u(c || '#efe9df', { r: 1 }), [0, 0.016, 0], null, g, false);
      return g;
    }

    // 9. LIGHTING & WALL PIECES
    if (n.includes('floorlamp') || (kind === 'stand' || n.includes('standinglamp'))) {
      cyl(0.09, 0.09, 0.025, u('#e8e4dc', { r: 0.3 }), [-0.15, 0.0125, 0], null, g);
      cyl(0.01, 0.01, 0.8, u(GOLD, G_OPT), [-0.15, 0.4, 0], null, g);
      tor(0.21, 0.009, u(GOLD, G_OPT), [0.06, 0.8, 0], null, g, Math.PI);
      cyl(0.004, 0.004, 0.05, u(GOLD, G_OPT), [0.27, 0.775, 0], null, g);
      cyl(0.035, 0.09, 0.08, u(GOLD, { ...G_OPT, dbl: true }), [0.27, 0.72, 0], null, g);
      sph(0.028, u('#fff6d6', { e: '#ffd59a', ei: 2.6 }), [0.27, 0.7, 0], null, g);
      g.userData.lamp = { y: 0.7 };
      return g;
    }
    if (n.includes('pendantlights') || n.includes('pendant')) {
      cyl(0.07, 0.07, 0.015, u(GOLD, G_OPT), [0, 1.24, 0], null, g);
      [[-0.12, 0.99], [0, 0.94], [0.12, 1.01]].forEach(p => {
        cyl(0.003, 0.003, 1.24 - p[1], u('#1b1d22'), [p[0], (1.24 + p[1]) / 2, 0], null, g);
        cyl(0.012, 0.05, 0.06, u('#1f2328', { r: 0.5, dbl: true }), [p[0], p[1], 0], null, g);
        sph(0.022, u('#fff6d6', { e: '#ffd08a', ei: 2.8 }), [p[0], p[1] - 0.025, 0], null, g);
      });
      return g;
    }
    if (n.includes('chandelier')) {
      cyl(0.012, 0.012, 0.1, u(GOLD, G_OPT), [0, 1.2, 0], null, g);
      sph(0.04, u(GOLD, G_OPT), [0, 1.13, 0], null, g);
      tor(0.16, 0.008, u(GOLD, G_OPT), [0, 1.08, 0], [Math.PI / 2, 0, 0], g);
      tor(0.1, 0.007, u(GOLD, G_OPT), [0, 1.02, 0], [Math.PI / 2, 0, 0], g);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const cG = new THREE.Group(); cG.position.set(0.16 * Math.cos(a), 1.09, 0.16 * Math.sin(a)); g.add(cG);
        cyl(0.012, 0.012, 0.02, u(GOLD, G_OPT), [0, 0, 0], null, cG);
        sph(0.02, u('#fff6d6', { e: '#fff1c9', ei: 2.6 }), [0, 0.025, 0], null, cG);
      }
      return g;
    }
    if (n.includes('fairylights')) {
      const o = u(c || '#ffcf6b');
      for (let i = 0; i < 9; i++) {
        const x = -0.4 + 0.1 * i;
        const y = 0.36 - 0.07 * Math.sin(i / 8 * Math.PI);
        sph(0.013, u('#ffcf6b', { e: '#ffcf6b', ei: 2.4 }), [x, y, 0.014], null, g);
      }
      return g;
    }
    if (n.includes('ledstrip')) {
      box(0.58, 0.014, 0.014, u('#a855f7', { e: '#a855f7', ei: 2.6 }), [0, 0.44, 0.01], null, g);
      return g;
    }
    if (n.includes('wallsconce') || (kind === 'wall' || n.includes('walllamp'))) {
      [-0.16, 0.16].forEach(x => {
        cyl(0.035, 0.035, 0.012, u(GOLD, G_OPT), [x, 0.12, 0.006], [Math.PI / 2, 0, 0], g);
        cyl(0.006, 0.006, 0.07, u(GOLD, G_OPT), [x, 0.14, 0.04], [Math.PI / 2, 0, 0], g);
        cyl(0.045, 0.03, 0.08, u('#fff6e0', { e: '#ffd08a', ei: 1.6, dbl: true, o: 0.9 }), [x, 0.18, 0.075], null, g);
      });
      return g;
    }
    if (n.includes('wallclock') || n.includes('clock')) {
      cyl(0.13, 0.13, 0.02, u('#fbf8f1'), [0, 0.06, 0.012], [Math.PI / 2, 0, 0], g);
      tor(0.132, 0.012, u('#3b2a1d'), [0, 0.06, 0.016], null, g);
      [0, 1, 2, 3].forEach(i => box(0.008, 0.022, 0.002, u('#1b1d22'), [0.105 * Math.sin(i * Math.PI / 2), 0.06 + 0.105 * Math.cos(i * Math.PI / 2), 0.024], [0, 0, -i * Math.PI / 2], g));
      box(0.008, 0.075, 0.002, u('#1b1d22'), [0.02, 0.09, 0.026], [0, 0, -0.6], g);
      box(0.006, 0.1, 0.002, u('#1b1d22'), [-0.03, 0.07, 0.027], [0, 0, 1.3], g);
      sph(0.008, u('#c8102e'), [0, 0.06, 0.028], null, g);
      return g;
    }
    if (n.includes('ankaracurtains')) {
      pln(0.34, 0.46, u('#bfe3f5', { e: '#bfe3f5', ei: 0.25 }), [0, 0, -0.002], null, g);
      cyl(0.008, 0.008, 0.56, u('#3b2a1d'), [0, 0.33, 0.03], [0, 0, Math.PI / 2], g);
      [-1, 1].forEach(side => [0, 1, 2].forEach(a => {
        box(0.04, 0.64, 0.012, u(a % 2 ? '#1f6f78' : '#e07a3f', { r: 0.85 }), [side * (0.17 + 0.035 * a), 0.02, 0.02 + (a % 2) * 0.012], null, g);
      }));
      return g;
    }
    if (n.includes('wallmirror') || (kind === 'mirror' || n.includes('mirror'))) {
      cyl(0.115, 0.115, 0.012, u(GOLD, G_OPT), [0, 0.04, 0.014], [Math.PI / 2, 0, 0], g);
      cyl(0.1, 0.1, 0.01, u('#d7e7f0', { m: 0.6, r: 0.08 }), [0, 0.04, 0.018], [Math.PI / 2, 0, 0], g);
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2;
        const len = i % 2 ? 0.1 : 0.14;
        box(len, 0.012, 0.008, u(GOLD, G_OPT), [Math.cos(a) * (0.115 + len / 2), 0.04 + Math.sin(a) * (0.115 + len / 2), 0.01], [0, 0, a], g);
      }
      return g;
    }
    if (n.includes('felaposter')) {
      pln(0.26, 0.36, u('#ffd60a'), [0, 0, 0], null, g);
      cyl(0.06, 0.06, 0.002, u('#111111'), [0, 0.04, 0.001], [Math.PI / 2, 0, 0], g, 20);
      pln(0.18, 0.05, u('#c1121f'), [0, -0.1, 0.001], null, g);
      return g;
    }

    // 10. PETS
    if (n.includes('dog') || n.includes('shepherd')) {
      g.userData.petKind = 'dog';
      box(0.16, 0.13, 0.3, u('#c98d4f'), [0, 0.15, 0], null, g);
      [[-0.05, 0.1], [0.05, 0.1], [-0.05, -0.1], [0.05, -0.1]].forEach(p => cyl(0.022, 0.022, 0.1, u('#c98d4f'), [p[0], 0.05, p[1]], null, g, 8));
      const headG = new THREE.Group(); headG.position.set(0, 0.25, 0.15); g.add(headG);
      box(0.13, 0.12, 0.13, u('#c98d4f'), [0, 0, 0], null, headG);
      box(0.06, 0.05, 0.05, u('#e8c49a'), [0, -0.02, 0.07], null, headG);
      [-1, 1].forEach(r => box(0.03, 0.06, 0.02, u('#8a5a2b'), [0.045 * r, 0.075, -0.01], [0, 0, 0.5 * r], headG));
      [-1, 1].forEach(r => sph(0.011, u('#111111'), [0.03 * r, 0.02, 0.066], null, headG, 8));
      const tailG = new THREE.Group(); tailG.position.set(0, 0.2, -0.15); g.add(tailG);
      cyl(0.014, 0.01, 0.12, u('#c98d4f'), [0, 0.04, -0.04], [-0.9, 0, 0], tailG, 8);
      self.animators.push((time) => {
        tailG.rotation.y = Math.sin(time * 9) * 0.6;
        headG.rotation.y = 0.35 * Math.sin(0.7 * time);
      });
      return g;
    }
    if (n.includes('cat')) {
      g.userData.petKind = 'cat';
      g.scale.setScalar(0.8);
      box(0.16, 0.13, 0.3, u('#5b5f66'), [0, 0.15, 0], null, g);
      [[-0.05, 0.1], [0.05, 0.1], [-0.05, -0.1], [0.05, -0.1]].forEach(p => cyl(0.022, 0.022, 0.1, u('#5b5f66'), [p[0], 0.05, p[1]], null, g, 8));
      const headG = new THREE.Group(); headG.position.set(0, 0.25, 0.15); g.add(headG);
      box(0.13, 0.12, 0.13, u('#5b5f66'), [0, 0, 0], null, headG);
      box(0.06, 0.05, 0.05, u('#8a8f96'), [0, -0.02, 0.07], null, headG);
      [-1, 1].forEach(r => cyl(0.001, 0.025, 0.05, u('#5b5f66'), [0.045 * r, 0.075, -0.01], null, headG, 4));
      [-1, 1].forEach(r => sph(0.011, u('#111111'), [0.03 * r, 0.02, 0.066], null, headG, 8));
      const tailG = new THREE.Group(); tailG.position.set(0, 0.2, -0.15); g.add(tailG);
      cyl(0.014, 0.01, 0.18, u('#5b5f66'), [0, 0.04, -0.04], [-0.3, 0, 0], tailG, 8);
      self.animators.push((time) => {
        tailG.rotation.y = Math.sin(time * 2) * 0.3;
        headG.rotation.y = 0.35 * Math.sin(0.7 * time);
      });
      return g;
    }
    if (n.includes('parrot')) {
      g.userData.petKind = 'parrot';
      cyl(0.012, 0.012, 0.4, u('#7a5230'), [0, 0.2, 0], null, g, 8);
      cyl(0.01, 0.01, 0.2, u('#7a5230'), [0, 0.39, 0], [0, 0, Math.PI / 2], g, 8);
      cyl(0.1, 0.12, 0.024, u('#5a3c22'), [0, 0.012, 0], null, g, 16);
      const parrotG = new THREE.Group(); parrotG.position.set(0, 0.42, 0); g.add(parrotG);
      sph(0.05, u('#9aa3ad'), [0, 0, 0], null, parrotG);
      sph(0.032, u('#b6bec7'), [0, 0.055, 0.01], null, parrotG);
      cyl(0.001, 0.012, 0.03, u('#222222'), [0, 0.05, 0.04], [Math.PI / 2, 0, 0], parrotG, 8);
      box(0.04, 0.02, 0.06, u('#d1202f'), [0, -0.04, -0.05], [0.6, 0, 0], parrotG);
      self.animators.push((time) => {
        parrotG.rotation.y = 0.35 * Math.sin(0.7 * time);
        parrotG.position.y = 0.42 + 0.02 * Math.abs(Math.sin(2.2 * time));
      });
      return g;
    }

    // 11. LUXURY VEHICLES
    if (n.includes('helicopter') || n.includes('heli')) {
      [-0.13, 0.13].forEach(x => box(0.025, 0.025, 0.62, u('#2b2f36'), [x, 0.03, 0], null, g));
      sph(0.2, u('#1d2433', { m: 0.4, r: 0.3 }), [0, 0.2, 0.05], [0.9, 0.85, 1.25], g, 20);
      sph(0.16, u('#7cc6e8', { o: 0.7, r: 0.1 }), [0, 0.24, 0.22], [0.75, 0.55, 0.6], g, 16);
      cyl(0.03, 0.05, 0.5, u('#1d2433'), [0, 0.24, -0.38], [Math.PI / 2, 0, 0], g, 10);
      box(0.02, 0.18, 0.1, u(GOLD, G_OPT), [0, 0.32, -0.6], null, g);
      cyl(0.02, 0.02, 0.08, u('#555555'), [0, 0.39, 0.02], null, g, 8);
      const rotorG = new THREE.Group(); rotorG.position.set(0, 0.43, 0.02); g.add(rotorG);
      [0, Math.PI / 2].forEach(angle => box(0.95, 0.008, 0.045, u('#2b2f36'), [0, 0, 0], [0, angle, 0], rotorG));
      self.animators.push((time, dt) => { rotorG.rotation.y += dt * 18; });
      return g;
    }
    if (n.includes('superyacht') || n.includes('yacht')) {
      pln(0.7, 1.5, u('#38bdf8', { r: 0.15, e: '#0ea5e9', ei: 0.15 }), [0, 0.012, 0], [-Math.PI / 2, 0, 0], g);
      box(0.36, 0.16, 1.1, u('#f8fafc', { r: 0.35 }), [0, 0.1, 0], null, g);
      box(0.25, 0.16, 0.25, u('#f8fafc', { r: 0.35 }), [0, 0.1, 0.6], [0, Math.PI / 4, 0], g);
      box(0.365, 0.03, 1.105, u('#1d2433'), [0, 0.08, 0], null, g);
      box(0.3, 0.12, 0.66, u('#f1f5f9'), [0, 0.24, -0.08], null, g);
      box(0.28, 0.08, 0.02, u('#1d2433', { m: 0.4, r: 0.15 }), [0, 0.25, 0.26], null, g);
      box(0.22, 0.1, 0.36, u('#e2e8f0'), [0, 0.35, -0.12], null, g);
      cyl(0.01, 0.01, 0.18, u(GOLD, G_OPT), [0, 0.48, -0.16], null, g, 8);
      return g;
    }
    if (n.includes('jet') || n.includes('plane')) {
      const cfg = n.includes('large') ? { scale: 0.98, body: '#151b26', windows: 8, gap: 0.07, stripe: GOLD, fin: GOLD, goldFin: true }
                : n.includes('small') ? { scale: 0.62, body: '#f8fafc', windows: 4, gap: 0.1, stripe: '#1d4ed8', fin: '#1d4ed8' }
                : { scale: 0.8, body: '#f8fafc', windows: 6, gap: 0.1, stripe: GOLD, fin: '#1d2433' };
      const sub = new THREE.Group(); sub.rotation.y = Math.PI / 2; sub.scale.setScalar(cfg.scale); g.add(sub);
      cyl(0.11, 0.11, 1.0, u(cfg.body, { r: 0.3, m: 0.15 }), [0, 0.2, 0], [Math.PI / 2, 0, 0], sub, 16);
      sph(0.11, u(cfg.body, { r: 0.3, m: 0.15 }), [0, 0.2, 0.5], null, sub);
      sph(0.11, u(cfg.body, { r: 0.3, m: 0.15 }), [0, 0.2, -0.5], null, sub);
      box(1.1, 0.025, 0.22, u('#e2e8f0', { r: 0.35 }), [0, 0.16, -0.02], null, sub);
      box(1.1, 0.012, 0.03, u(cfg.stripe, G_OPT), [0, 0.17, -0.06], null, sub);
      box(0.025, 0.24, 0.16, u(cfg.fin, cfg.goldFin ? G_OPT : {}), [0, 0.36, -0.56], null, sub);
      box(0.36, 0.02, 0.1, u('#e2e8f0'), [0, 0.46, -0.6], null, sub);
      [-1, 1].forEach(r => cyl(0.045, 0.045, 0.2, u('#94a3b8', CHROME), [0.14 * r, 0.26, -0.36], [Math.PI / 2, 0, 0], sub, 12));
      box(0.12, 0.04, 0.06, u('#1d2433', { m: 0.4, r: 0.15 }), [0, 0.27, 0.5], null, sub);
      [[0, 0.42], [-0.2, -0.05], [0.2, -0.05]].forEach(p => cyl(0.03, 0.03, 0.03, u('#111111'), [p[0], 0.04, p[1]], null, sub, 10));
      return g;
    }

    // Default Fallback
    const w = D.w || 1, d = D.d || 1;
    box(w * 0.88, 0.4, d * 0.88, u(c, { r: 0.7 }), [0, 0.2, 0], null, g);
    return g;
  },
  model(name) {
    const D = FURN.ITEMS[name] || {};
    const [w, d] = [D.w || 1, D.d || 1];
    const g = this.buildModel(name, D);
    if (D.kind === 'cooler' || name === 'Cooler Box') g.userData.eat = true;
    if (D.kind === 'stand' || name === 'Standing Lamp') g.userData.lamp = { y: 1.68 };
    return g;
  },
  ensureAvatarFree() {
    const occ = FURN.occupied(S.items || []), a = this.avatar, cx = Math.floor(a.position.x + 3), cz = Math.floor(a.position.z + 3);
    if (!occ.has(cx + ',' + cz)) return; const f = this.nearestFree(cx, cz, occ); if (f) { a.position.set(this.cc(f[0]), 0, this.cc(f[1])); this.path = [] }
  },
  nearestFree(cx, cz, occ) { let best = null, bd = 1e9; for (let x = 0; x < FURN.GRID; x++) for (let z = 0; z < FURN.GRID; z++) { if (occ.has(x + ',' + z)) continue; const d = Math.abs(x - cx) + Math.abs(z - cz); if (d < bd) { bd = d; best = [x, z] } } return best },
  /* rebuild the room's furniture + lamps from S.items (placed ones) */
  sync() {
    if (!this.on) return;
    this.syncItems(S.items || []);
    this.ensureAvatarFree();
    if (this.selId) this.select(this.selId);
    if (this.ghostInfo) this.ghost(this.ghostInfo.name, this.ghostInfo.x, this.ghostInfo.z, this.ghostInfo.rot, this.ghostInfo.valid);
  },
  _oldSync_() {
    if (!this.on) return; const ig = this.itemsGroup; while (ig.children.length) ig.remove(ig.children[0]);
    this.animators = [];
    this.lamps = []; this.byId = {}; const items = S.items || [], own = (n) => items.some(i => i.name === n && i.placed !== false);
    const lamp = (x, y, z, big, par) => { const bm = new THREE.MeshBasicMaterial({ color: 0x8a8466 }); const b = new THREE.Mesh(new THREE.SphereGeometry(big ? .2 : .13, 12, 10), bm); b.position.set(x, y, z); ig.add(b); const l = new THREE.PointLight(0xffd68a, 0, big ? 11 : 8); l.position.set(x, y - .1, z); ig.add(l); this.lamps.push({ l, bm, k: big ? 1.15 : .9 }) };
    for (const it of items) {
      if (it.placed === false || !FURN.isItem(it.name)) continue; const D = FURN.ITEMS[it.name];
      if (D.fixed) continue;
      const [w, d] = FURN.footprint(it.name, it.rot), g = this.model(it.name);
      g.position.set(this.cc(it.x) + (w - 1) / 2, 0, this.cc(it.z) + (d - 1) / 2);
      g.rotation.y = it.rot * Math.PI / 180;
      g.userData.id = it.id; g.userData.name = it.name; ig.add(g); this.byId[it.id] = g;
      if (g.userData.lamp) lamp(g.position.x, g.userData.lamp.y, g.position.z, false);
    }
    if (own('Ceiling Bulb')) { this.cyl(.015, .35, 0x222222, 0, 2.82, 0, ig); lamp(0, 2.6, 0, true); }
    if (own('Wall Lamp')) { this.box(.12, .2, .22, 0x555555, -2.93, 2.2, .2, ig); lamp(-2.8, 2.2, .2); this.box(.22, .2, .12, 0x555555, 1.2, 2.2, -2.93, ig); lamp(1.2, 2.2, -2.8); }
    if (own('Chandelier')) { const ch = this.buildModel('chandelier'); ch.position.set(0, 1.4, 0); ig.add(ch); lamp(0, 2.2, 0, true); }
    if (own('Ceiling Fan')) { const cf = this.buildModel('ceilingFan'); cf.position.set(0, 1.45, 0); ig.add(cf); }
    if (own('Fairy Lights')) { const fl = this.buildModel('fairyLights'); fl.position.set(0, 1.8, -2.95); ig.add(fl); }
    if (own('LED Strip')) { const ls = this.buildModel('ledStrip'); ls.position.set(0, 2.3, -2.95); ig.add(ls); }
    if (own('Wall Clock')) { const wc = this.buildModel('wallClock'); wc.position.set(-2.0, 2.1, -2.95); ig.add(wc); }
    if (own('Ankara Curtains')) { const ac = this.buildModel('ankaraCurtains'); ac.position.set(1.6, 1.7, -2.86); ig.add(ac); }
    if (own('Wall Mirror')) { const wm = this.buildModel('wallMirror'); wm.position.set(-2.95, 2.0, 0); wm.rotation.y = Math.PI / 2; ig.add(wm); }
    if (own('Fela Poster')) { const fp = this.buildModel('felaPoster'); fp.position.set(-2.95, 1.8, -1.5); fp.rotation.y = Math.PI / 2; ig.add(fp); }
    if (own('Split AC') || own('AC')) { const acm = this.buildModel('ac'); acm.position.set(-0.6, 2.4, -2.8); ig.add(acm); }
    this.ensureAvatarFree(); if (this.selId) this.select(this.selId); if (this.ghostInfo) this.ghost(this.ghostInfo.name, this.ghostInfo.x, this.ghostInfo.z, this.ghostInfo.rot, this.ghostInfo.valid);
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
    /* outside compound & walking between inside and outside */
  walkToPoint(pt) {
    const a = this.avatar.position;
    const destIsOut = pt.x < -3.0;
    const currIsOut = a.x < -3.0;

    // Both outside in compound
    if (destIsOut && currIsOut) {
      const target = new THREE.Vector3(Math.max(-8.4, Math.min(-3.3, pt.x)), 0, Math.max(-3.6, Math.min(3.6, pt.z)));
      this.path = [target];
      return true;
    }

    // Inside to outside: step through doorway (-2.6, 1.6) -> (-3.4, 1.6)
    if (destIsOut && !currIsOut) {
      const doorIn = new THREE.Vector3(-2.6, 0, 1.6);
      const doorOut = new THREE.Vector3(-3.4, 0, 1.6);
      const target = new THREE.Vector3(Math.max(-8.4, Math.min(-3.4, pt.x)), 0, Math.max(-3.6, Math.min(3.6, pt.z)));
      const cellIn = this.cellFromPoint(doorIn);
      const occ = FURN.occupied((this.visitMode ? this.visitItems : S.items) || []);
      const from = this.cellFromPoint(a);
      occ.delete(from[0] + ',' + from[1]);
      const p = this.bfs(from, cellIn, occ);
      if (p) {
        this.path = p.slice(1).map(c => new THREE.Vector3(this.cc(c[0]), 0, this.cc(c[1])));
        this.path.push(doorIn, doorOut, target);
        return true;
      }
      this.path = [doorIn, doorOut, target];
      return true;
    }

    // Outside to inside: step through doorway (-3.4, 1.6) -> (-2.6, 1.6)
    if (!destIsOut && currIsOut) {
      const doorOut = new THREE.Vector3(-3.4, 0, 1.6);
      const doorIn = new THREE.Vector3(-2.6, 0, 1.6);
      const cellDest = this.cellFromPoint(pt);
      const cellIn = this.cellFromPoint(doorIn);
      const occ = FURN.occupied((this.visitMode ? this.visitItems : S.items) || []);
      if (occ.has(cellDest[0] + ',' + cellDest[1])) return false;
      const p = this.bfs(cellIn, cellDest, occ);
      if (p) {
        this.path = [doorOut, doorIn, ...p.map(c => new THREE.Vector3(this.cc(c[0]), 0, this.cc(c[1]))), new THREE.Vector3(pt.x, 0, pt.z)];
        return true;
      }
      this.path = [doorOut, doorIn, new THREE.Vector3(pt.x, 0, pt.z)];
      return true;
    }

    // Both inside: normal grid path
    const cell = this.cellFromPoint(pt);
    return this.walkToCell(cell, pt);
  },

  stepOutside() {
    if (!this.avatar) return;
    if (this.avatar.position.x < -3.0) {
      if (typeof toast === 'function') toast("You're already outside in the compound \uD83C\uDF3F");
      return;
    }
    const doorIn = new THREE.Vector3(-2.6, 0, 1.6);
    const doorOut = new THREE.Vector3(-3.4, 0, 1.6);
    const yard = new THREE.Vector3(-5.5, 0, 1.6);
    this.path = [doorIn, doorOut, yard];
    if (typeof toast === 'function') toast("Stepping outside to the compound \uD83C\uDF3F");
  },

  stepInside() {
    if (!this.avatar) return;
    if (this.avatar.position.x >= -3.0) {
      if (typeof toast === 'function') toast("You're already inside the room \uD83C\uDFE0");
      return;
    }
    const doorOut = new THREE.Vector3(-3.4, 0, 1.6);
    const doorIn = new THREE.Vector3(-2.6, 0, 1.6);
    const living = new THREE.Vector3(-1.0, 0, 1.2);
    this.path = [doorOut, doorIn, living];
    if (typeof toast === 'function') toast("Entering the living room \uD83C\uDFE0");
  },

  toggleArea() {
    if (this.avatar && this.avatar.position.x < -3.0) this.stepInside();
    else this.stepOutside();
  },

  /* ---------- multiplayer peers & room visit sync ---------- */
  peers: new Map(),

  clearPeers() {
    for (const [id, peer] of this.peers) {
      if (peer.group && this.scene) this.scene.remove(peer.group);
      if (peer.tagEl && peer.tagEl.parentNode) peer.tagEl.remove();
    }
    this.peers.clear();
  },

  addPeer(p) {
    if (!p || !p.id || (window.NET && NET.user && p.id === NET.user.id)) return;
    if (this.peers.has(p.id)) {
      this.applyPeerMove(p.id, p);
      return;
    }
    const { av, parts } = this.createAvatarMesh(p.g || 'male', p.l);
    av.position.set(p.x || -1, 0, p.z || 1.2);
    av.rotation.y = p.rot || 0;
    if (this.scene) this.scene.add(av);

    let tagEl = null, bubbleEl = null;
    const cont = this.tagCont || document.getElementById('r3d-tags');
    if (cont) {
      tagEl = document.createElement('div');
      tagEl.className = 'r3d-tag';
      tagEl.innerHTML = '<div class="r3d-bubble" style="display:none"></div><div class="r3d-nametag"><span class="r3d-dot">\u25CF</span><span>' + (p.name || 'Friend') + '</span></div>';
      cont.appendChild(tagEl);
      bubbleEl = tagEl.querySelector('.r3d-bubble');
    }

    const peer = {
      id: p.id,
      name: p.name || 'Friend',
      group: av,
      parts,
      pose: { ll: 0, llb: 0, llk: 0, rl: 0, rlb: 0, rlk: 0, la1: 0, lb1: 0, la2: 0, lb2: 0, ra1: 0, rb1: 0, ra2: 0, rb2: 0, lean: 0, twist: 0, sx: 0, head: 0, lift: 0 },
      tp: { ll: 0, llb: 0, llk: 0, rl: 0, rlb: 0, rlk: 0, la1: 0, lb1: 0, la2: 0, lb2: 0, ra1: 0, rb1: 0, ra2: 0, rb2: 0, lean: 0, twist: 0, sx: 0, head: 0, lift: 0 },
      ph: 0,
      tt: 0,
      dn: 0,
      em: null,
      targetPos: new THREE.Vector3(p.x || -1, 0, p.z || 1.2),
      targetRot: p.rot || 0,
      moving: false,
      tagEl,
      bubbleEl,
      bubbleTimer: null
    };
    this.peers.set(p.id, peer);
  },

  removePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    if (peer.group && this.scene) this.scene.remove(peer.group);
    if (peer.tagEl && peer.tagEl.parentNode) peer.tagEl.remove();
    this.peers.delete(id);
  },

  applyPeerMove(id, data) {
    const peer = this.peers.get(id);
    if (!peer) return;
    if (Number.isFinite(data.x) && Number.isFinite(data.z)) peer.targetPos.set(data.x, 0, data.z);
    if (Number.isFinite(data.rot)) peer.targetRot = data.rot;
    peer.moving = !!data.moving;
    if (data.anim === 'dance') peer.em = 'dance';
    else if (data.anim === 'wave') peer.em = 'wave';
    else if (!peer.moving) peer.em = null;
  },

  applyPeerEmote(id, emote) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.em = emote || null;
    peer.ph = 0;
  },

  applyPeerChat(id, text) {
    const peer = this.peers.get(id);
    if (!peer || !peer.bubbleEl) return;
    peer.bubbleEl.textContent = text;
    peer.bubbleEl.style.display = 'block';
    clearTimeout(peer.bubbleTimer);
    peer.bubbleTimer = setTimeout(() => { peer.bubbleEl.style.display = 'none'; }, 4500);
  },

  showBubble(who, text) {
    if (typeof toast === 'function') toast('\uD83D\uDCAC ' + text);
  },

  animatePeer(peer, t, dt) {
    const P = peer.parts, ps = peer.pose, tp = peer.tp;
    const st = peer.moving ? 'walk' : (peer.em || 'idle');
    const rate = st === 'walk' ? 1.3 : st === 'dance' ? [1.15, 1.15, 1.0, 1.4][(peer.dn || 0) % ACPOSE.DANCES] : st === 'wave' ? 1 : 0;
    peer.ph = (peer.ph || 0) + dt * Math.PI * 2 * rate;
    peer.tt = (peer.tt || 0) + dt;
    ACPOSE.target(tp, st, peer.ph, peer.tt, peer.dn || 0, { walk: null, idle: null, reduce: false, pose: '', mood: 'happy' });
    const k = 1 - Math.exp(-dt * 14);
    for (const key in tp) ps[key] += (tp[key] - ps[key]) * k;
    const c = Math.cos, L1 = .36, L2 = .30;
    const lg = (g, sx, a, b, kn) => { g.hip.rotation.set(-a, 0, sx * b); g.knee.rotation.x = kn; return L1 * c(a) * c(b) + L2 * c(a - kn) * c(b * .5) + .08 };
    const dL = lg(P.legL, -1, ps.ll, ps.llb, ps.llk), dR = lg(P.legR, 1, ps.rl, ps.rlb, ps.rlk);
    P.body.position.y = Math.max(dL, dR) - .74 + ps.lift;
    const ar = (g, sx, a1, b1, a2, b2) => { g.sh.rotation.set(-a1, 0, sx * b1); g.el.rotation.set(-(a2 - a1), 0, sx * (b2 - b1)) };
    ar(P.armL, -1, ps.la1, ps.lb1, ps.la2, ps.lb2); ar(P.armR, 1, ps.ra1, ps.rb1, ps.ra2, ps.rb2);
    P.torso.rotation.set(ps.lean, ps.twist, 0); P.torso.position.x = ps.sx;
    P.head.rotation.set(0, 0, ps.head);
    if (P.eyes) P.eyes.forEach(e => { e.scale.y = 1 });
  },

  broadcastMove(x, z, rot, moving) {
    if (!window.NET || !NET.sock || !this.activeRoomId) return;
    const now = Date.now();
    if (moving && this._lastMoveTime && now - this._lastMoveTime < 70) return;
    this._lastMoveTime = now;
    const area = x < -3.0 ? 'outside' : 'room';
    NET.sock.emit('room:move', {
      roomId: this.activeRoomId,
      x: Math.round(x * 100) / 100,
      y: 0,
      z: Math.round(z * 100) / 100,
      rot: Math.round(rot * 100) / 100,
      moving: !!moving,
      anim: this.em || (moving ? 'walk' : 'idle'),
      area
    });
  },

  startVisit(h) {
    if (!this.on) {
      this.init().then(() => this.startVisit(h));
      return;
    }
    this.visitMode = true;
    this.hostData = h;
    this.activeRoomId = h.id;
    this.savedState = {
      items: S.items || [],
      paint: S.paint,
      pos: this.avatar ? this.avatar.position.clone() : new THREE.Vector3(-1, 0, 1.2),
      rot: this.avatar ? this.avatar.rotation.y : 0
    };
    this.paint(h.paint || '#d9a93a');
    this.visitItems = Array.isArray(h.items) ? h.items : [];
    this.syncItems(this.visitItems);
    if (this.avatar) {
      this.avatar.position.set(-2.2, 0, 1.6);
      this.avatar.rotation.y = Math.PI / 2;
      this.path = [];
    }
    this.initRoomSocket(h.id);
    this.az = Math.PI / 4;
    this.pol = 0.95;
    if (typeof toast === 'function') toast('\uD83C\uDFE0 Arrived at ' + h.name + "'s place!");
  },

  endVisit() {
    if (!this.visitMode) return;
    this.visitMode = false;
    this.hostData = null;
    if (this.activeRoomId && window.NET && NET.sock) NET.sock.emit('room:leave');
    this.activeRoomId = null;
    this.clearPeers();
    if (this.savedState) {
      this.paint(this.savedState.paint);
      this.sync();
      if (this.avatar && this.savedState.pos) {
        this.avatar.position.copy(this.savedState.pos);
        this.avatar.rotation.y = this.savedState.rot || 0;
        this.path = [];
      }
      this.savedState = null;
    }
    if (typeof toast === 'function') toast('Returned home');
  },

  initRoomSocket(roomId) {
    if (!window.NET || !NET.sock) return;
    const sock = NET.sock;
    this.activeRoomId = roomId;
    sock.emit('room:join', {
      roomId,
      x: this.avatar ? this.avatar.position.x : -2.2,
      z: this.avatar ? this.avatar.position.z : 1.6,
      rot: this.avatar ? this.avatar.rotation.y : Math.PI / 2
    });

    if (this._roomSocketHooked) return;
    this._roomSocketHooked = true;

    sock.on('room:roster', (data) => {
      if (!this.activeRoomId || data.roomId !== this.activeRoomId) return;
      this.clearPeers();
      for (const p of data.players) this.addPeer(p);
      this.updatePlayerBadge();
    });
    sock.on('room:user_joined', (p) => {
      if (!this.activeRoomId) return;
      this.addPeer(p);
      this.updatePlayerBadge();
      if (typeof toast === 'function') toast('\uD83D\uDC4B ' + p.name + ' entered');
    });
    sock.on('room:user_moved', (p) => {
      if (!this.activeRoomId) return;
      this.applyPeerMove(p.id, p);
    });
    sock.on('room:user_emote', (p) => {
      if (!this.activeRoomId) return;
      this.applyPeerEmote(p.id, p.emote);
    });
    sock.on('room:user_chat', (p) => {
      if (!this.activeRoomId) return;
      this.applyPeerChat(p.id, p.text);
    });
    sock.on('room:user_left', (p) => {
      if (!this.activeRoomId) return;
      this.removePeer(p.id);
      this.updatePlayerBadge();
    });
  },

  updatePlayerBadge() {
    const el = document.getElementById('vplayers');
    if (!el) return;
    const count = (this.peers ? this.peers.size : 0) + 1;
    el.textContent = '\u25CF ' + count + ' in room';
  },

  syncItems(items) {
    const ig = this.itemsGroup;
    while (ig.children.length) ig.remove(ig.children[0]);
    this.animators = [];
    this.lamps = [];
    this.byId = {};
    const own = (n) => items.some(i => i.name === n && i.placed !== false);
    const lamp = (x, y, z, big, par) => {
      const bm = new THREE.MeshBasicMaterial({ color: 0x8a8466 });
      const b = new THREE.Mesh(new THREE.SphereGeometry(big ? .2 : .13, 12, 10), bm);
      b.position.set(x, y, z);
      ig.add(b);
      const l = new THREE.PointLight(0xffd68a, 0, big ? 11 : 8);
      l.position.set(x, y - .1, z);
      ig.add(l);
      this.lamps.push({ l, bm, k: big ? 1.15 : .9 });
    };
    for (const it of items) {
      if (it.placed === false || !FURN.isItem(it.name)) continue;
      const D = FURN.ITEMS[it.name];
      if (D.fixed) continue;
      const [w, d] = FURN.footprint(it.name, it.rot);
      const g = this.model(it.name);
      g.position.set(this.cc(it.x) + (w - 1) / 2, 0, this.cc(it.z) + (d - 1) / 2);
      g.rotation.y = it.rot * Math.PI / 180;
      g.userData.id = it.id;
      g.userData.name = it.name;
      ig.add(g);
      this.byId[it.id] = g;
      if (g.userData.lamp) lamp(g.position.x, g.userData.lamp.y, g.position.z, false);
    }
    if (own('Ceiling Bulb')) { this.cyl(.015, .35, 0x222222, 0, 2.82, 0, ig); lamp(0, 2.6, 0, true); }
    if (own('Wall Lamp')) { this.box(.12, .2, .22, 0x555555, -2.93, 2.2, .2, ig); lamp(-2.8, 2.2, .2); this.box(.22, .2, .12, 0x555555, 1.2, 2.2, -2.93, ig); lamp(1.2, 2.2, -2.8); }
    if (own('Chandelier')) { const ch = this.buildModel('chandelier'); ch.position.set(0, 1.4, 0); ig.add(ch); lamp(0, 2.2, 0, true); }
    if (own('Ceiling Fan')) { const cf = this.buildModel('ceilingFan'); cf.position.set(0, 1.45, 0); ig.add(cf); }
    if (own('Fairy Lights')) { const fl = this.buildModel('fairyLights'); fl.position.set(0, 1.8, -2.95); ig.add(fl); }
    if (own('LED Strip')) { const ls = this.buildModel('ledStrip'); ls.position.set(0, 2.3, -2.95); ig.add(ls); }
    if (own('Wall Clock')) { const wc = this.buildModel('wallClock'); wc.position.set(-2.0, 2.1, -2.95); ig.add(wc); }
    if (own('Ankara Curtains')) { const ac = this.buildModel('ankaraCurtains'); ac.position.set(1.6, 1.7, -2.86); ig.add(ac); }
    if (own('Wall Mirror')) { const wm = this.buildModel('wallMirror'); wm.position.set(-2.95, 2.0, 0); wm.rotation.y = Math.PI / 2; ig.add(wm); }
    if (own('Fela Poster')) { const fp = this.buildModel('felaPoster'); fp.position.set(-2.95, 1.8, -1.5); fp.rotation.y = Math.PI / 2; ig.add(fp); }
    if (own('Split AC') || own('AC')) { const acm = this.buildModel('ac'); acm.position.set(-0.6, 2.4, -2.8); ig.add(acm); }
  },

  floorCell(cx, cy) { const r = this.cv.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(v, this.cam); const h = ray.intersectObject(this.floor)[0]; return h ? { p: h.point, cell: this.cellFromPoint(h.point) } : null },
  tap(cx, cy) {
    const r = this.cv.getBoundingClientRect(), v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), ray = new THREE.Raycaster(); ray.setFromCamera(v, this.cam);
    const flTargets = [this.floor];
    if (this.outsideFloor) flTargets.push(this.outsideFloor);
    const hits = ray.intersectObjects([this.itemsGroup, ...flTargets], true);
    let itemG = null, floorHit = null;
    for (const h of hits) {
      if (h.object === this.floor || h.object === this.outsideFloor) {
        floorHit = floorHit || h;
        if (!itemG) break;
        continue;
      }
      let o = h.object;
      while (o && !(o.userData && o.userData.id)) o = o.parent;
      if (o && !itemG) itemG = o;
    }
    for (const h of hits) { if (h.object === this.floor) { floorHit = floorHit || h; if (!itemG) break; continue } let o = h.object; while (o && !(o.userData && o.userData.id)) o = o.parent; if (o && !itemG) itemG = o }
    if (this.buy) { if (itemG) this.buy({ type: 'item', id: itemG.userData.id }); else if (floorHit) this.buy({ type: 'cell', cell: this.cellFromPoint(floorHit.point) }); else this.buy({ type: 'none' }); return }
    if (itemG) {
      if (itemG.userData.isTv) { this.nextChannel(); return }
      if (itemG.userData.toggleGen) {
        this.genActive = !(this.genActive !== false && itemG.userData.genActive !== false);
        itemG.userData.genActive = this.genActive;
        if (typeof toast === 'function') toast(this.genActive ? '\u26A1 Generator humming... NEPA light restored!' : '\u26A1 Generator turned off');
        return;
      }
      if (itemG.userData.toggleFan) {
        itemG.userData.fanSpeed = ((itemG.userData.fanSpeed || 0) + 1) % 3;
        const sNames = ['Off', 'Low Breeze \uD83C\uDF43', 'High Turbo \uD83D\uDCA8'];
        if (typeof toast === 'function') toast('Fan: ' + sNames[itemG.userData.fanSpeed]);
        return;
      }
      if (itemG.userData.petKind) {
        const sounds = { dog: '\uD83D\uDC15 Woof! Good boy!', cat: '\uD83D\uDC31 Purr... Meow~', parrot: '\uD83E\uDD9C Squawk! Up NEPA! Up Nigeria!' };
        if (typeof toast === 'function') toast(sounds[itemG.userData.petKind] || '\uD83D\uDC3E Pet tapped');
        return;
      }
    }
    if (itemG && itemG.userData.eat) {
      const it = (S.items || []).find(i => i.id === itemG.userData.id), occ = FURN.occupied(S.items || []), [w, d] = FURN.footprint(it.name, it.rot); let best = null, bl = 1e9;
      for (let i = -1; i <= w; i++) for (let j = -1; j <= d; j++) { if ((i >= 0 && i < w) && (j >= 0 && j < d)) continue; const c = [it.x + i, it.z + j]; if (c[0] < 0 || c[1] < 0 || c[0] > 5 || c[1] > 5 || occ.has(c[0] + ',' + c[1])) continue; const dd = Math.hypot(this.cc(c[0]) - this.avatar.position.x, this.cc(c[1]) - this.avatar.position.z); if (dd < bl && this.walkToCell(c)) { bl = dd; best = c } }
      if (!best) { toast('Something is blocking your cooler box'); return } this.walkToCell(best); this.onArrive = () => eat({ stopPropagation() { } }); return
    }
    if (floorHit) { this.onArrive = null; if (!this.walkToPoint(floorHit.point)) toast('You cannot walk there') }
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
    if (this.broadcastMove) this.broadcastMove(a.position.x, a.position.z, a.rotation.y, moving);
    // time of day: daylight dl (0 night .. 1 day) drives sun, sky tint, ground and window; bought lamps follow NEPA power
    const dl = this.dl == null ? 1 : this.dl, kk = Math.min(1, dt * 3), C = THREE.Color, lerpC = (a, b, t) => new C(a).lerp(new C(b), t);
    this.amb.intensity += ((.3 + .32 * dl) - this.amb.intensity) * kk; this.amb.color.copy(lerpC(0x8a9bd6, 0xffffff, dl));
    this.sun.intensity += (.55 * dl - this.sun.intensity) * kk; this.sun.color.copy(lerpC(0xff8a45, 0xfff0d0, Math.max(0, Math.min(1, (dl - .2) / .6))));
    this.moon.intensity += (.42 * (1 - dl) - this.moon.intensity) * kk;
    this.ground.color.copy(lerpC(0x24331f, 0x93a05a, dl)); if (this.glass) this.glass.color.copy(lerpC(0x16224a, 0xbfe4ff, dl));
    const on = this.power(); this.lamps.forEach(m => { const want = on ? m.k * (.4 + .75 * (1 - dl)) : 0; m.l.intensity += (want - m.l.intensity) * Math.min(1, dt * 6); m.bm.color.copy(lerpC(0x8a8466, 0xffe9a0, Math.min(1, m.l.intensity / (m.k * .6)))) });
    if (this.updateTV) this.updateTV(t / 1000, dt);
    if (this.animators && this.animators.length) {
      const timeSec = t / 1000;
      for (let i = 0; i < this.animators.length; i++) {
        try { this.animators[i](timeSec, dt, on); } catch (e) {}
      }
    }
    if (this.peers && this.peers.size) {
      for (const [id, peer] of this.peers) {
        if (peer.group) {
          if (peer.targetPos) {
            const diff = peer.targetPos.clone().sub(peer.group.position);
            diff.y = 0;
            const dist = diff.length();
            if (dist > 0.05) {
              peer.moving = true;
              diff.normalize();
              peer.group.position.addScaledVector(diff, Math.min(dist, 2.5 * dt));
              const ta = Math.atan2(diff.x, diff.z);
              const df = ((ta - peer.group.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
              peer.group.rotation.y += df * Math.min(1, dt * 10);
            } else {
              peer.moving = false;
              if (peer.targetRot != null) {
                const df = ((peer.targetRot - peer.group.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
                peer.group.rotation.y += df * Math.min(1, dt * 8);
              }
            }
          }
          this.animatePeer(peer, t, dt);
        }
        if (peer.tagEl && peer.group && this.cam && this.cv) {
          const v = peer.group.position.clone();
          v.y += 1.85;
          v.project(this.cam);
          if (v.z < 1) {
            const r = this.cv.getBoundingClientRect();
            const sx = (v.x * 0.5 + 0.5) * r.width;
            const sy = (-v.y * 0.5 + 0.5) * r.height;
            peer.tagEl.style.transform = 	ranslate(-50%, -100%) translate(${sx}px, ${sy}px);
            peer.tagEl.style.display = 'flex';
          } else {
            peer.tagEl.style.display = 'none';
          }
        }
      }
    }
    if (this.visitMode && this.avatar) {
      const isOut = this.avatar.position.x < -3.0;
      const btn = document.getElementById('vAreaBtn');
      if (btn && btn.dataset.isOut !== String(isOut)) {
        btn.dataset.isOut = String(isOut);
        btn.textContent = isOut ? '\uD83C\uDFE0 Step Inside' : '\uD83C\uDF3F Step Outside';
      }
    }
    this.R.render(this.scene, cam)
  }
};
