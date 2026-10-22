/* AllConnect diorama: a small low-poly 3D model of the 9ja map (Three.js, same r128 build the 3D room uses).
   DIORAMA.mount(el, { mode: 'orbit' | 'tour', shiftY, labels })  ->  Promise<instance | null>
   - 'top'  : camera hovers above the map looking down, swaying slowly; the map width fills the screen.
   - 'orbit': the camera slowly circles the whole map, like a camera filming it from a drone (sign-in screen).
   - 'tour' : the camera flies from one popular place to the next, with a caption and dots to jump around (landing page).
   Resolves to null (and leaves the page untouched) when WebGL / Three.js is unavailable, so callers keep their fallback. */
(function () {
  const TAU = Math.PI * 2;

  const PLACES = [
    { id: 'airport', emoji: '✈️', name: 'Airport', line: 'Fly in, fly out. The city starts here.', t: [-20, 1.6, -14], az: 1.1, pol: 1.0, dist: 30 },
    { id: 'market', emoji: '🧺', name: 'Agege Market', line: 'Bargain well, abeg. Stalls everywhere.', t: [-14, 1.4, -1], az: 1.9, pol: 0.95, dist: 24 },
    { id: 'stadium', emoji: '🏟️', name: 'Stadium District', line: 'Match day: floodlights, noise and jollof.', t: [8, 1.8, -13], az: 1.2, pol: 0.98, dist: 28 },
    { id: 'bridge', emoji: '🌉', name: 'Third Mainland Bridge', line: 'Cross the lagoon with the danfos.', t: [-2, 1.8, 7], az: 0.35, pol: 1.05, dist: 30 },
    { id: 'vi', emoji: '🏙️', name: 'Victoria Island', line: 'Banks, towers and company HQs.', t: [14, 4, 18], az: 1.75, pol: 1.0, dist: 30 },
    { id: 'beach', emoji: '🏖️', name: 'Beach Resort', line: 'Sand, palms and the resort pool.', t: [-6, 1.5, 21], az: 1.25, pol: 0.95, dist: 24 }
  ];

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
  const ease = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d };

  function loadThree() {
    return new Promise((ok, no) => {
      if (window.THREE) return ok();
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = ok; s.onerror = no; document.head.appendChild(s);
    });
  }

  /* ---------- the model ---------- */
  function buildWorld(scene) {
    const mats = {}, anim = { cars: [], boats: [], plane: null, flags: [] };
    const M = c => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
    const put = (geo, mat, x, y, z, p) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (p || scene).add(m); return m };
    const box = (w, h, d, c, x, y, z, p) => put(new THREE.BoxGeometry(w, h, d), M(c), x, y + h / 2, z, p);   // y = bottom of the box
    const cyl = (rt, rb, h, c, x, y, z, seg, p) => put(new THREE.CylinderGeometry(rt, rb, h, seg || 16), M(c), x, y + h / 2, z, p);
    const glow = (w, h, d, c, x, y, z, p) => put(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c }), x, y + h / 2, z, p);
    const R = rng(9);

    // water and the two land masses (sand rim under a grass top)
    const water = put(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: '#3a90d6' }), 0, 0, 0); water.rotation.x = -Math.PI / 2;
    const LANDS = [{ x: -8, z: -9, w: 44, d: 26 }, { x: 6, z: 18, w: 40, d: 16 }];
    LANDS.forEach(l => { box(l.w + 2.4, .9, l.d + 2.4, '#e6d197', l.x, 0, l.z); box(l.w, .3, l.d, '#78b24a', l.x, .9, l.z) });
    const G = 1.2;                                   // ground height

    // roads
    const road = (w, d, x, z) => { box(w, .08, d, '#3a4150', x, G, z); };
    road(44, 2.2, -8, -6); road(2.2, 26, -2, -9); road(2.2, 16, -2, 18); road(40, 2.2, 6, 17); road(2.2, 16, 15, 18);
    box(44, .09, .14, '#f3d36b', -8, G, -6); box(40, .09, .14, '#f3d36b', 6, G, 17);

    // Third Mainland Bridge across the lagoon channel
    box(3.4, .45, 17, '#cfd5de', -2, 1.45, 7); box(3.6, .12, 17, '#8f98a8', -2, 1.9, 7);
    [4.4, 7, 9.6].forEach(z => box(.9, 1.5, .9, '#9aa3b2', -2, 0, z));
    [2.2, 11.8].forEach(z => [-1.8, 1.8].forEach(dx => { box(.35, 4.4, .35, '#e8edf3', -2 + dx, 1.9, z); }));
    const cable = new THREE.LineBasicMaterial({ color: '#f1f4f8' });
    [-1.8, 1.8].forEach(dx => [[2.2, 4.8], [11.8, 9.2]].forEach(([pz, ez]) => {
      for (let k = 1; k <= 4; k++) { const z2 = pz + (ez - pz) * k / 4.6; const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2 + dx, 6.1, pz), new THREE.Vector3(-2 + dx, 2, z2)]); scene.add(new THREE.Line(g, cable)) }
    }));

    // Airport: runway, terminal, tower, taking-off plane
    box(22, .07, 2.8, '#2f3440', -20, G, -17.5);
    for (let i = 0; i < 9; i++) box(1.3, .08, .22, '#ffffff', -29 + i * 2.4, G, -17.5);
    box(7.5, 1.7, 3.2, '#eef2f5', -21, G, -11.5); box(7.9, .22, 3.6, '#b8c2cc', -21, G + 1.7, -11.5); box(7.6, .5, .1, '#79c7f0', -21, G + .6, -9.85);
    cyl(.55, .65, 3.6, '#d7dde3', -14.5, G, -11.5, 12); cyl(1.15, .9, .9, '#79c7f0', -14.5, G + 3.6, -11.5, 12); cyl(1.3, 1.3, .18, '#b8c2cc', -14.5, G + 4.5, -11.5, 12);
    const plane = new THREE.Group();
    box(2.8, .5, .5, '#ffffff', 0, 0, 0, plane); box(.7, .12, 3, '#e2e8f0', .2, .1, 0, plane); box(.5, .7, .12, '#d93a3a', -1.2, .3, 0, plane); box(1, .5, .55, '#0b57d0', 1.1, .02, 0, plane);
    scene.add(plane); anim.plane = plane;
    box(1.6, .35, .9, '#ffffff', -26, G, -13.4); box(1.6, .35, .9, '#e9eef3', -24, G, -13.4);   // parked aircraft

    // Stadium: stands, red seats, pitch, floodlights, parked cars
    const ring = (rt, rb, h, c, y) => { const m = put(new THREE.CylinderGeometry(rt, rb, h, 36, 1, true), new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }), 8, y + h / 2, -13); return m };
    ring(5.6, 4.7, 2.6, '#e9e4d6', G); ring(4.7, 3.7, 1.3, '#d14a3f', G);
    const pitch = put(new THREE.CircleGeometry(3.7, 36), M('#3b8f45'), 8, G + .08, -13); pitch.rotation.x = -Math.PI / 2; box(.1, .02, 5.4, '#e8f5e9', 8, G + .1, -13);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { cyl(.12, .14, 5.2, '#cfd5de', 8 + a * 5.4, G, -13 + b * 5.4, 8); glow(1.1, .5, .5, '#fff6c4', 8 + a * 5.4, G + 5.2, -13 + b * 5.4); });
    for (let i = 0; i < 6; i++) box(.9, .4, .5, ['#e8505b', '#f5c518', '#ffffff', '#4a79c9'][i % 4], 2.2 + i * 1.1, G, -6.9 + (i % 2) * .7);

    // Agege market: colourful stalls in rows
    const SC = ['#e8505b', '#f5c518', '#16a39a', '#f08a24', '#7c5cd6', '#2f86d6'];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const x = -17 + i * 2.5, z = -3.6 + j * 2.3; box(1.7, .7, 1.4, '#f6f1e6', x, G, z); box(2.1, .22, 1.8, SC[(i * 3 + j) % SC.length], x, G + .7, z); }
    box(.5, .5, .5, '#c79a5b', -9.6, G, -3); box(.5, .5, .5, '#c79a5b', -9.6, G, .2);

    // Victoria Island towers
    const GL = ['#a8d8f0', '#8cc4e8', '#c4e3f4', '#9fd0ec'];
    [[10, 15, 2.4, 8.5], [13.2, 13.8, 2.1, 12.5], [16.4, 15.4, 2.7, 9], [12, 19.6, 2.3, 6], [15.4, 20.4, 2.5, 10.5], [19, 18, 2, 5], [8.5, 21.4, 2, 4], [18.6, 13.6, 2, 7]].forEach(([x, z, w, h], i) => {
      put(new THREE.BoxGeometry(w, h, w), new THREE.MeshLambertMaterial({ color: GL[i % 4], emissive: '#0b2a4a', emissiveIntensity: .16 }), x, G + h / 2, z);
      box(w + .15, .3, w + .15, '#5d7f99', x, G + h, z);
      for (let b = 1; b < h / 1.6; b++) box(w + .06, .1, w + .06, '#6aa3c8', x, G + b * 1.6, z);
      if (h > 12) { box(.4, 1.6, .4, '#f0b429', x, G + h + .3, z); glow(.5, .3, .5, '#ffd24a', x, G + h + 1.9, z) }
    });

    // Beach resort: sand, palms, pool, huts, umbrellas
    box(15, .25, 5.4, '#f3e0a2', -6, G, 22.6);
    const palm = (x, z, s) => {
      const g = new THREE.Group(); g.position.set(x, G, z); g.scale.setScalar(s || 1); scene.add(g);
      const tr = put(new THREE.CylinderGeometry(.13, .2, 2.6, 7), M('#8a5a2b'), 0, 1.3, 0, g); tr.rotation.z = .12;
      for (let i = 0; i < 6; i++) { const pv = new THREE.Group(); pv.position.set(.15, 2.6, 0); pv.rotation.y = i * TAU / 6; g.add(pv); const lf = put(new THREE.BoxGeometry(1.8, .06, .5), M(i % 2 ? '#2f9e44' : '#3fb950'), .9, 0, 0, pv); lf.rotation.z = -.38 }
    };
    [[-12, 21.6, 1], [-9.4, 23.4, .9], [-1.4, 21.8, 1.1], [-14, 24, .85]].forEach(a => palm(...a));
    box(3.4, .12, 2.2, '#ffffff', -4, G, 19.6); box(3, .14, 1.8, '#5fd0f0', -4, G + .02, 19.6);
    [[-9, 19.5], [-7, 20.2]].forEach(([x, z]) => { cyl(.75, .75, .75, '#e8c27a', x, G, z, 10); put(new THREE.ConeGeometry(1.05, .9, 10), M('#b8732f'), x, G + 1.2, z) });
    [[-11, 22.4, '#e8505b'], [-4.8, 22.6, '#f5c518'], [-2.6, 23.4, '#2f86d6']].forEach(([x, z, c]) => { cyl(.05, .05, 1.1, '#ffffff', x, G, z, 5); put(new THREE.ConeGeometry(.7, .35, 8), M(c), x, G + 1.25, z) });

    // houses, tin roofs and trees filling the rest of the land
    const free = (x, z) => {
      if (Math.abs(z + 6) < 2.2 || Math.abs(x + 2) < 2.4 || (z > 8 && z < 12 && Math.abs(x + 2) < 3)) return false;
      if (Math.abs(z - 17) < 2.2 || (z > 9 && Math.abs(x - 15) < 2)) return false;
      if (x < -11 && z < -8.5) return false;                              // airport
      if (Math.hypot(x - 8, z + 13) < 7.6) return false;                  // stadium
      if (x > -19 && x < -9 && z > -5.2 && z < 3.5) return false;         // market
      if (x > 6.5 && x < 21.5 && z > 11.5 && z < 24.5) return false;     // towers
      if (x > -14.5 && x < 2 && z > 18 && z < 26) return false;           // beach
      return true;
    };
    const WALL = ['#f2e3c6', '#e9c9a0', '#f6f1e6', '#d9b38c', '#c9d6df', '#f3c6b5'], ROOF = ['#8d99a6', '#c2553c', '#4a79c9', '#a3acb7', '#d8dde3'];
    LANDS.forEach(l => {
      for (let x = l.x - l.w / 2 + 1.6; x < l.x + l.w / 2 - 1; x += 3.1) for (let z = l.z - l.d / 2 + 1.6; z < l.z + l.d / 2 - 1; z += 3.1) {
        const px = x + (R() - .5) * 1.1, pz = z + (R() - .5) * 1.1;
        if (!free(px, pz) || R() < .38) continue;
        if (R() < .2) { const t = put(new THREE.IcosahedronGeometry(.55 + R() * .3, 0), M(R() < .5 ? '#4caf50' : '#3d9a46'), px, G + .8, pz); t.rotation.y = R() * 3; box(.14, .5, .14, '#7a5230', px, G, pz); continue }
        const w = 1.5 + R() * 1.1, d = 1.5 + R() * 1.1, h = .8 + R() * 1.5;
        box(w, h, d, WALL[(R() * WALL.length) | 0], px, G, pz); box(w + .15, .14, d + .15, ROOF[(R() * ROOF.length) | 0], px, G + h, pz);
        if (R() < .15) cyl(.28, .28, .55, '#3a6ea5', px + w * .25, G + h + .14, pz, 8);
      }
    });

    // danfos and boats that keep moving
    const danfo = (axis, fixed, from, to, speed, off) => {
      const g = new THREE.Group(); box(1.3, .62, .62, '#f5c518', 0, .08, 0, g); box(1.3, .14, .63, '#1b1f33', 0, .38, 0, g); box(.7, .3, .5, '#f9d94a', -.1, .7, 0, g); scene.add(g);
      anim.cars.push({ g, axis, fixed, from, to, speed, off })
    };
    danfo('z', -2.6, -1, 15.5, 5.2, 0); danfo('z', -1.4, 15.5, -1, 4.4, .5); danfo('x', -6.6, -28, 12, 4.8, .2); danfo('x', -5.4, 12, -28, 5.4, .7); danfo('x', 16.4, -12, 24, 4.6, .4); danfo('x', 17.6, 24, -12, 5, .9);
    const boat = (x, z, c, ph) => { const g = new THREE.Group(); g.position.set(x, .25, z); box(2.2, .5, .9, c, 0, 0, 0, g); box(.8, .6, .7, '#ffffff', -.2, .5, 0, g); put(new THREE.ConeGeometry(.5, .9, 4), M(c), 1.45, .25, 0, g).rotation.z = -Math.PI / 2; scene.add(g); anim.boats.push({ g, ph, x, z }) };
    boat(-6, 9, '#e8505b', 0); boat(14, 6.5, '#16a39a', 2); boat(2, 32, '#f5c518', 4); boat(-24, 12, '#7c5cd6', 1);

    return anim;
  }

  /* ---------- the scene + camera director ---------- */
  function Dio(el, opts) {
    this.el = el; this.opts = opts || {}; this.mode = this.opts.mode || 'orbit'; this.shiftY = this.opts.shiftY || 0;
    this.time = 0; this.idx = -1; this.phase = 'dwell'; this.pT = 0; this.alive = true; this.visible = true;
    this.reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.cur = { tx: 0, ty: 1.5, tz: 2, az: 1.2, pol: 1.0, dist: 80 }; this.from = null; this.to = null;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setClearColor(0x000000, 0); this.pr = Math.min(window.devicePixelRatio || 1, 2); r.setPixelRatio(this.pr);
    r.domElement.style.cssText = 'width:100%;height:100%;display:block'; r.domElement.setAttribute('aria-hidden', 'true'); el.appendChild(r.domElement);
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(this.opts.fog || '#cfe6f4', 70, 300);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#86a9cc', .55));
    const sun = new THREE.DirectionalLight('#fff0d0', .62); sun.position.set(-30, 50, 20); this.scene.add(sun);
    this.cam = new THREE.PerspectiveCamera(38, 1, 1, 600);
    this.anim = buildWorld(this.scene);
    if (this.mode === 'tour') this.buildUI();
    this.resize(); this.ro = window.ResizeObserver ? new ResizeObserver(() => this.resize()) : null; if (this.ro) this.ro.observe(el); else addEventListener('resize', this._rs = () => this.resize());
    if (window.IntersectionObserver) { this.io = new IntersectionObserver(e => { this.visible = e[0].isIntersecting }); this.io.observe(el) }
    this.last = performance.now(); this.slow = 0; this.frames = 0;
    if (this.mode === 'tour') this.go(0, true);
    this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
  }
  Dio.prototype = {
    aspect() { return Math.max(.3, this.w / Math.max(1, this.h)) },
    resize() {
      const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1; this.w = w; this.h = h;
      this.renderer.setSize(w, h, false); this.cam.aspect = w / h;
      const sy = (this.opts.shiftYWide != null && w / h > 1.1) ? this.opts.shiftYWide : this.shiftY;
      const sx = (this.opts.shiftXWide && w / h > 1.1) ? this.opts.shiftXWide : 0;   // + moves the scene right
      if (sy || sx) this.cam.setViewOffset(w, h, -Math.round(w * sx), Math.round(h * sy), w, h); else this.cam.clearViewOffset();
      this.cam.updateProjectionMatrix(); this.render(); this.focusFit = null;
    },
    topDist() { return Math.max(54, Math.min(230, 82 / Math.min(this.aspect(), 1.55))) },   // the map's full width fills the screen
    orbitDist() { return Math.max(88, Math.min(215, 92 / Math.min(this.aspect(), 1.4))) },
    placeView(p, drift) { const a = this.aspect(), k = a < 1 ? 1 / Math.pow(a, .62) : 1; return { tx: p.t[0], ty: p.t[1], tz: p.t[2], az: p.az + drift, pol: p.pol, dist: p.dist * k * (p.far || 1.16) } },
    buildUI() {
      const cap = this.cap = document.createElement('div'); cap.className = 'dio-cap'; cap.setAttribute('aria-live', 'polite');
      cap.innerHTML = '<span class="dio-em"></span><span><b></b><small></small></span>';
      const dots = this.dots = document.createElement('div'); dots.className = 'dio-dots'; dots.setAttribute('role', 'tablist');
      PLACES.forEach((p, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', p.name); b.title = p.name; b.onclick = () => this.go(i); dots.appendChild(b) });
      this.el.appendChild(cap); this.el.appendChild(dots);
    },
    caption(i) {
      const p = PLACES[i]; if (!this.cap) return; const c = this.cap; c.classList.remove('in');
      clearTimeout(this._ct); this._ct = setTimeout(() => { c.querySelector('.dio-em').textContent = p.emoji; c.querySelector('b').textContent = p.name; c.querySelector('small').textContent = p.line; c.classList.add('in') }, 260);
      [...this.dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    },
    go(i, first) {
      this.idx = (i + PLACES.length) % PLACES.length; this.from = Object.assign({}, this.cur);
      this.to = this.placeView(PLACES[this.idx], 0); this.phase = 'move'; this.pT = 0; this.moveDur = first ? 3.2 : 2.6; this.caption(this.idx);
      if (first) { this.cur = Object.assign({}, this.placeView({ t: [0, 1.5, 2], az: .3, pol: 1.0, dist: this.orbitDist() }, 0)); this.from = Object.assign({}, this.cur) }
    },
    step(dt) {
      this.time += dt; const c = this.cur;
      if (this.mode === 'top') {
        // camera high above the map, looking almost straight down; it sways slowly like a drone hovering over the city
        const m = this.reduce ? 0 : 1;
        c.az = Math.PI / 2 + m * .36 * Math.sin(this.time * .15); c.pol = .36 + m * .05 * Math.sin(this.time * .11);
        c.tx = -2; c.ty = 1; c.tz = 2; c.dist = this.topDist() * (1 + m * .025 * Math.sin(this.time * .09));
      } else if (this.mode === 'orbit') {
        const sp = this.reduce ? 0 : .085;
        c.az += dt * sp; c.tx = lerp(c.tx, 0, .05); c.ty = 1.5; c.tz = lerp(c.tz, 2, .05);
        c.pol = 1.0 + Math.sin(this.time * .18) * .07; c.dist = this.orbitDist() * (1 + Math.sin(this.time * .13) * .045);
      } else {
        this.pT += dt;
        if (this.phase === 'move') {
          const u = Math.min(1, this.pT / this.moveDur), e = ease(u), f = this.from, t = this.to;
          c.tx = lerp(f.tx, t.tx, e); c.ty = lerp(f.ty, t.ty, e); c.tz = lerp(f.tz, t.tz, e); c.pol = lerp(f.pol, t.pol, e);
          c.az = f.az + angDiff(f.az, t.az) * e; c.dist = lerp(f.dist, t.dist, e) + Math.sin(Math.PI * e) * 16;
          if (u >= 1) { this.phase = 'dwell'; this.pT = 0 }
        } else {
          const t = this.to, drift = this.reduce ? 0 : this.pT * .075; c.az = t.az + drift; c.dist = t.dist * (1 + Math.sin(this.pT * .7) * .02);
          if (!this.reduce && this.pT > 4.6) this.go(this.idx + 1);
        }
      }
      // life on the map
      const a = this.anim, T = this.time;
      if (a.plane) { const p = ((T + 2) % 9) / 9, x = -29 + p * 24; a.plane.position.set(x, 1.6 + Math.max(0, p - .5) * 14, -17.5); a.plane.rotation.z = Math.max(0, p - .5) * .8; a.plane.rotation.y = 0 }
      a.cars.forEach(o => { const L = Math.abs(o.to - o.from), p = ((T * o.speed / L + o.off) % 1), v = o.from + (o.to - o.from) * p; if (o.axis === 'z') { o.g.position.set(o.fixed, 1.3, v); o.g.rotation.y = o.to > o.from ? Math.PI / 2 : -Math.PI / 2 } else { o.g.position.set(v, 1.3, o.fixed); o.g.rotation.y = o.to > o.from ? 0 : Math.PI } });
      a.boats.forEach(o => { o.g.position.y = .25 + Math.sin(T * 1.3 + o.ph) * .08; o.g.rotation.z = Math.sin(T * 1.1 + o.ph) * .05; o.g.position.x = o.x + Math.sin(T * .2 + o.ph) * 3 });
    },
    render() {
      const c = this.cur, sp = Math.sin(c.pol);
      this.cam.position.set(c.tx + c.dist * sp * Math.cos(c.az), c.ty + c.dist * Math.cos(c.pol), c.tz + c.dist * sp * Math.sin(c.az));
      this.cam.lookAt(c.tx, c.ty, c.tz);
      this.scene.fog.near = c.dist * 1.15; this.scene.fog.far = c.dist * 3.4;   // the map stays crisp, only the far water melts into the sky
      this.renderer.render(this.scene, this.cam);
    },
    loop(now) {
      if (!this.alive) return;
      const hidden = document.hidden || !this.visible || !this.el.offsetParent;
      if (hidden) { this.last = now; this.raf = setTimeout(() => { this.raf = requestAnimationFrame(this.loop) }, 350); return }
      const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
      this.step(dt); this.render();
      // low-end phones: drop the pixel ratio if frames keep running long
      this.frames++; this.slow += dt; if (this.frames === 90) { if (this.slow / 90 > .034 && this.pr > 1) { this.pr = 1; this.renderer.setPixelRatio(1); this.resize() } this.frames = 0; this.slow = 0 }
      this.raf = requestAnimationFrame(this.loop);
    },
    destroy() { this.alive = false; clearTimeout(this._ct); cancelAnimationFrame(this.raf); clearTimeout(this.raf); if (this.ro) this.ro.disconnect(); if (this.io) this.io.disconnect(); if (this._rs) removeEventListener('resize', this._rs); this.renderer.dispose(); this.el.innerHTML = '' }
  };

  window.DIORAMA = {
    PLACES,
    async mount(el, opts) {
      if (!el) return null;
      try {
        const probe = document.createElement('canvas'); if (!(probe.getContext('webgl') || probe.getContext('experimental-webgl'))) return null;
        await loadThree(); const d = new Dio(el, opts); el.classList.add('dio-on'); return d;
      } catch (e) { console.warn('3D map unavailable, keeping the flat picture', e); return null }
    }
  };
})();
