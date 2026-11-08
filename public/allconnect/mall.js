/* Shop tab. Opens on a 3D mall: shoppers walk in and out, go into the shops and come out with their bags.
   Tap a shop (or its card at the bottom) to go in. "My Home" is the old Buy mode: your own house, where you
   move furniture, change things and buy more. Needs three.js, which ROOM3D already loads. */
const MALL = {
  m: 'mall', shown: false, ready: false, raf: 0, t0: 0, cx: -4, tx: -4, touched: false, npcs: [], hits: [],
  SHOPS: [
    { k: 'market', n: 'Fresh Market', e: '🌮', t: 'Hot food, delivered to your fridge', c: '#16a34a', hex: 0x16a34a, says: ['Jollof', 'Suya', 'Small chops', 'Zobo'] },
    { k: 'pharmacy', n: 'Pharmacy', e: '💊', t: 'Medicine and vitamins, for you and your pet', c: '#0ea5e9', hex: 0x0ea5e9, says: ['Vitamins', 'Dettol', 'Malaria drugs', 'Pet shampoo'] },
    { k: 'boutique', n: 'Boutique', e: '👗', t: 'Clothes, hair and a new look', c: '#ec4899', hex: 0xec4899, says: ['Ankara dress', 'Sneakers', 'New braids', 'Agbada'] },
    { k: 'furniture', n: 'Furniture & Decor', e: '🛋️', t: 'Style your house', c: '#f97316', hex: 0xf97316, says: ['Sofa', 'Lamp', 'Rug', 'Wardrobe'] },
    { k: 'games', n: 'Game Shop', e: '🎮', t: 'Boards, skins and more', c: '#8b5cf6', hex: 0x8b5cf6, says: ['New board', 'Dice skin', 'Avatar frame'] },
    { k: 'homes', n: 'Homes', e: '🏠', t: 'Buy or rent a place', c: '#14b8a6', hex: 0x14b8a6, says: ['Viewing a flat', 'House keys', 'Mortgage talk'] }
  ],
  naira: n => '₦' + Math.round(n).toLocaleString('en-NG'),
  /* ---------- tab and mode ---------- */
  enter() { this.shown = true; this.ui(); document.getElementById('buy').classList.toggle('mallmode', this.m === 'mall'); this.seg(); if (this.m === 'home') { document.getElementById('room').style.top = '44px'; BUY.enter() } else this.showMall() },
  leave() { this.shown = false; this.closeSheet(); this.hideMall(); document.getElementById('buy').classList.remove('mallmode') },
  mode(m) {
    if (m === this.m || !this.shown) { this.m = m; return this.seg() }
    this.m = m; document.getElementById('buy').classList.toggle('mallmode', m === 'mall'); this.seg(); this.closeSheet();
    if (m === 'home') { this.hideMall(); const r = document.getElementById('room'); r.style.display = 'block'; r.style.top = '44px'; BUY.enter() }
    else { BUY.leave(); document.getElementById('room').style.top = ''; this.showMall() }
  },
  seg() { const a = document.getElementById('sgMall'), b = document.getElementById('sgHome'); if (a) a.classList.toggle('on', this.m === 'mall'); if (b) b.classList.toggle('on', this.m === 'home') },
  /* ---------- go into a shop ---------- */
  go(k) {
    if (k === 'furniture') { this.mode('home'); setTimeout(() => { try { BUY.openSheet() } catch (e) {} }, 60); return }
    if (k === 'market') return this.market();
    if (k === 'games') { try { return openHub(b => b.shop()) } catch (e) { return toast('The Game Shop is not available right now.') } }
    this.phoneApp({ pharmacy: 'health', boutique: 'style', homes: 'homes' }[k])
  },
  phoneApp(a) { if (!a) return; try { PHONEUI.open() } catch (e) { return } setTimeout(() => { try { PH.open(a) } catch (e) { toast('Could not open that.') } }, 440) },
  /* ---------- Fresh Market sheet ---------- */
  async market() {
    try { if (!window.HEALTH.D) HEALTH.D = await NET.api('/api/ac/health/state') } catch (e) { return toast(e.message) }
    this.sheet(`<h3>Fresh Market 🌮</h3><p class="hint2">Hot food, delivered to your fridge. Wallet ${this.naira(S.cash)}</p>` + HEALTH.D.market.map(i => `<button class="fopt" onclick="MALL.eat('${i.id}')"><span>${i.emoji} ${esc(i.name)}<small>${esc(i.note)}</small></span><b>${this.naira(i.price)}</b></button>`).join(''))
  },
  async eat(id) { try { const r = await NET.api('/api/ac/health/market', { method: 'POST', body: { item: id } }); this.closeSheet(); HEALTH.got(r) } catch (e) { toast(e.message) } },
  sheet(html) { const el = document.getElementById('mallsheet'); if (!el) return; el.innerHTML = `<div class="mgrip"></div><button class="mclose" onclick="MALL.closeSheet()" aria-label="Close">✕</button>${html}`; el.classList.add('on') },
  closeSheet() { const el = document.getElementById('mallsheet'); if (el) el.classList.remove('on') },
  /* ---------- DOM ---------- */
  ui() {
    if (document.getElementById('mall')) return;
    const el = document.createElement('div'); el.id = 'mall';
    el.innerHTML = `<canvas id="mallcv" aria-label="3D mall. Tap a shop to go in." role="img"></canvas>
      <div class="mallban"><b>AllConnect Mall</b><span>Tap a shop to go in</span></div><div class="mallload" id="mallload">Opening the mall…</div>
      <div class="mallcards" id="mallcards">${this.SHOPS.map(s => `<button type="button" class="mcard" style="--c:${s.c}" onclick="MALL.go('${s.k}')"><span class="mce">${s.e}</span><b>${s.n}</b><small>${s.t}</small></button>`).join('')}</div>
      <div class="mallsheet" id="mallsheet"></div>`;
    document.getElementById('buy').appendChild(el)
  },
  hideMall() { cancelAnimationFrame(this.raf); this.raf = 0; const el = document.getElementById('mall'); if (el) el.style.display = 'none' },
  async showMall() {
    document.getElementById('room').style.display = 'none'; this.ui();
    const el = document.getElementById('mall'); el.style.display = 'block'; const ld = document.getElementById('mallload');
    if (!this.ready) {
      try { if (!window.ROOM3D) throw 0; await ROOM3D.load(); this.build(); this.ready = true } catch (e) { if (ld) ld.textContent = 'The 3D view could not load. You can still use the shop cards below.'; return }
    }
    if (ld) ld.style.display = 'none'; if (!this.shown || this.m !== 'mall') return;
    this.size(); cancelAnimationFrame(this.raf); this.t0 = performance.now(); this.last = this.t0; this.raf = requestAnimationFrame(t => this.loop(t))
  },
  /* ---------- the 3D scene ---------- */
  mat(c, o) { return new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {})) },
  box(w, h, d, c, x, y, z, p) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(c)); m.position.set(x, y, z); (p || this.scene).add(m); return m },
  tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t },
  build() {
    const cv = document.getElementById('mallcv');
    this.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.r.setClearColor(0x0b1020);
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.82)); const sun = new THREE.DirectionalLight(0xffffff, 0.65); sun.position.set(6, 14, 9); this.scene.add(sun);
    /* floor: pale tiles */
    const ft = this.tex(256, 256, (g, w, h) => { g.fillStyle = '#ece6da'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,105,80,.22)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h) }); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(17, 9);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 18), new THREE.MeshLambertMaterial({ map: ft })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0); this.scene.add(floor);
    /* back wall, dark roof band, side walls */
    this.box(34, 5.6, 0.5, 0xcdc6b8, 0, 2.8, -9.3); this.box(34, 1.3, 0.6, 0x14161f, 0, 6.2, -9.2); this.box(0.5, 5.6, 18, 0xcdc6b8, -17.2, 2.8, 0); this.box(0.5, 5.6, 18, 0xcdc6b8, 17.2, 2.8, 0);
    /* six shops */
    this.hits = [];
    this.SHOPS.forEach((s, i) => {
      const x = -12.5 + i * 5, col = s.hex;
      this.box(4.5, 3.4, 0.2, 0xf7f3ea, x, 1.7, -8.9);                  // lit back of the shop
      this.box(0.25, 3.6, 2.4, 0xb9b2a3, x - 2.4, 1.8, -7.7); this.box(0.25, 3.6, 2.4, 0xb9b2a3, x + 2.4, 1.8, -7.7); // dividers
      const aw = this.box(4.9, 0.28, 1.9, col, x, 3.75, -7.3); aw.rotation.x = 0.28; // awning
      this.box(4.5, 0.12, 1.0, 0x8b8577, x, 0.9, -8.2); this.box(4.5, 0.12, 1.0, 0x8b8577, x, 2.0, -8.2); // shelves
      for (let k = 0; k < 5; k++) { this.box(0.5, 0.5, 0.5, [col, 0xffffff, 0xfbbf24, 0x60a5fa, 0xf87171][k], x - 1.8 + k * 0.9, 1.2, -8.2); this.box(0.45, 0.4, 0.45, [0xffffff, col, 0x34d399, 0xfbbf24, 0xa78bfa][k], x - 1.8 + k * 0.9, 2.3, -8.2) }
      this.box(2.6, 0.7, 0.7, 0x5b3a1e, x, 0.35, -6.8);                    // counter
      const sg = this.tex(512, 128, (g, w, h) => { g.fillStyle = s.c; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '800 54px system-ui,sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(s.e + ' ' + s.n, w / 2, h / 2 + 3) });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 1.08), new THREE.MeshBasicMaterial({ map: sg })); sign.position.set(x, 4.75, -8.95); this.scene.add(sign);
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(x, 2.3, -6.4); hit.userData.k = s.k; this.scene.add(hit); this.hits.push(hit);
      s.x = x
    });
    /* fountain, benches, plants */
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.5, 24), this.mat(0xa9afba)); base.position.set(0, 0.25, 1); this.scene.add(base);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.52, 24), this.mat(0x7cc3e8)); water.position.set(0, 0.28, 1); this.scene.add(water);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.6, 12), this.mat(0xd7dbe3)); col.position.set(0, 0.9, 1); this.scene.add(col);
    this.fz = 1;
    [[-7, 3.5], [7, 3.5], [-12, 5], [12, 5]].forEach(([x, z]) => { this.box(2.6, 0.4, 0.8, 0x8a4b14, x, 0.5, z); this.box(2.6, 0.12, 0.8, 0x6b3a10, x, 0.72, z) });
    [[-15, 3], [15, 3], [-4.5, -4.5], [4.5, -4.5], [-15.5, -5], [15.5, -5]].forEach(([x, z]) => { this.box(0.7, 0.7, 0.7, 0xb4683a, x, 0.35, z); const l = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2, 7), this.mat(0x2f9e5d)); l.position.set(x, 1.7, z); this.scene.add(l) });
    /* shoppers */
    const n = (navigator.hardwareConcurrency || 4) <= 4 ? 9 : 14; this.npcs = []; for (let i = 0; i < n; i++) this.npcs.push(this.spawn(true));
    /* drag to look around, tap a shop to go in */
    let sx = 0, sc = 0, moved = false, down = false;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => { down = true; moved = false; sx = e.clientX; sc = this.tx; this.touched = true; try { cv.setPointerCapture(e.pointerId) } catch (x) {} });
    cv.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 6) moved = true; this.tx = Math.max(-11, Math.min(11, sc - dx * 0.045)) });
    cv.addEventListener('pointerup', e => { if (!down) return; down = false; if (!moved) this.tap(e) });
    cv.addEventListener('pointercancel', () => { down = false });
    window.addEventListener('resize', () => { if (this.shown && this.m === 'mall') this.size() })
  },
  size() { const cv = document.getElementById('mallcv'); if (!cv || !this.r) return; const w = cv.clientWidth || 360, h = cv.clientHeight || 640; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix() },
  tap(e) {
    const cv = document.getElementById('mallcv'), b = cv.getBoundingClientRect(), ray = new THREE.Raycaster(), v = new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(v, this.cam); const hit = ray.intersectObjects(this.hits)[0]; if (hit) this.go(hit.object.userData.k)
  },
  /* ---------- shoppers ---------- */
  spawn(scatter) {
    const P = {
      skin: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e], top: [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x14b8a6, 0xf97316, 0x111827, 0xffffff], low: [0x1f2937, 0x374151, 0x1e3a8a, 0x78350f, 0x111827], hair: [0x111111, 0x2b1b10, 0x3b2a1a]
    }, pick = a => a[Math.floor(Math.random() * a.length)], g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.3), this.mat(pick(P.top))); torso.position.y = 1.0; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.mat(pick(P.skin))); head.position.y = 1.58; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.235, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(pick(P.hair))); hair.position.y = 1.62; g.add(hair);
    const limb = (w, h, d, c, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(c)); m.position.y = -h / 2; p.add(m); g.add(p); return p };
    const lc = pick(P.low); const n = { g, legL: limb(0.2, 0.62, 0.22, lc, -0.13, 0.64), legR: limb(0.2, 0.62, 0.22, lc, 0.13, 0.64), armL: limb(0.14, 0.55, 0.16, pick(P.skin), -0.35, 1.32), armR: limb(0.14, 0.55, 0.16, pick(P.skin), 0.35, 1.32), ph: Math.random() * 6, sp: 1.6 + Math.random() * 1.1, state: 'walk', wait: 0, t: 0, shop: null, exit: false, bub: null };
    this.scene.add(g); this.place(n, scatter); this.pick(n); return n
  },
  place(n, scatter) { n.g.visible = true; n.state = 'walk'; n.g.position.set(scatter ? (Math.random() * 28 - 14) : (Math.random() * 8 - 4), 0, scatter ? (Math.random() * 12 - 3) : 10.5) },
  pick(n) {
    const r = Math.random(); n.exit = false; n.shop = null;
    if (r < 0.68) { const i = Math.floor(Math.random() * this.SHOPS.length); n.shop = i; n.tg = { x: this.SHOPS[i].x + (Math.random() - 0.5) * 1.4, z: -5.4 } }
    else if (r < 0.86) n.tg = { x: Math.random() * 26 - 13, z: Math.random() * 10 - 2 }
    else { n.exit = true; n.tg = { x: Math.random() * 10 - 5, z: 11 } }
  },
  say(n, shop) {
    if (!n.bub) { const c = document.createElement('canvas'); c.width = 320; c.height = 96; n.cv = c; const t = new THREE.CanvasTexture(c); n.bub = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); n.bub.scale.set(2.9, 0.87, 1); n.bub.position.y = 2.35; n.bub.renderOrder = 9; n.g.add(n.bub) }
    const s = this.SHOPS[shop], item = s.says[Math.floor(Math.random() * s.says.length)], price = this.naira((Math.floor(Math.random() * 38) + 4) * 250), g = n.cv.getContext('2d');
    g.clearRect(0, 0, 320, 96); g.fillStyle = 'rgba(255,255,255,.96)'; g.beginPath(); g.roundRect ? g.roundRect(6, 6, 308, 70, 28) : g.rect(6, 6, 308, 70); g.fill(); g.fillStyle = '#111827'; g.font = '700 27px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🛍️ ' + item + ' · ' + price, 160, 42);
    n.bub.material.map.needsUpdate = true; n.bub.visible = true; n.bt = 3
  },
  step(dt) {
    this.npcs.forEach(n => {
      if (n.bub && n.bt > 0) { n.bt -= dt; if (n.bt <= 0) n.bub.visible = false }
      if (n.state === 'in') { n.t -= dt; if (n.t <= 0) { n.g.visible = true; n.state = 'walk'; n.wait = 2.4; this.say(n, n.si) } return }
      if (n.wait > 0) { n.wait -= dt; n.legL.rotation.x = n.legR.rotation.x = n.armL.rotation.x = n.armR.rotation.x = 0; if (n.wait <= 0) this.pick(n); return }
      const dx = n.tg.x - n.g.position.x, dz = n.tg.z - n.g.position.z, d = Math.hypot(dx, dz);
      if (d < 0.18) {
        if (n.exit) { n.g.position.set(Math.random() * 8 - 4, 0, 10.5); this.pick(n); return }
        if (n.shop != null) { n.si = n.shop; n.state = 'in'; n.t = 2.5 + Math.random() * 3; n.g.visible = false; n.shop = null; return }
        n.wait = 1 + Math.random() * 2.5; return
      }
      let mx = dx / d, mz = dz / d; const fx = n.g.position.x, fz = n.g.position.z - this.fz, fd = Math.hypot(fx, fz);
      if (fd < 3.1) { mx += (fx / fd) * 1.2; mz += (fz / fd) * 1.2; const l = Math.hypot(mx, mz); mx /= l; mz /= l }
      n.g.position.x += mx * n.sp * dt; n.g.position.z += mz * n.sp * dt; n.g.rotation.y = Math.atan2(mx, mz); n.ph += dt * n.sp * 5;
      const sw = Math.sin(n.ph) * 0.7; n.legL.rotation.x = sw; n.legR.rotation.x = -sw; n.armL.rotation.x = -sw * 0.8; n.armR.rotation.x = sw * 0.8
    })
  },
  loop(t) {
    if (!this.shown || this.m !== 'mall') return; this.raf = requestAnimationFrame(x => this.loop(x));
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t; this.step(dt);
    if (!this.touched) this.tx = Math.sin((t - this.t0) / 9000) * 8;      // drifts along the shops until you drag it yourself
    this.cx += (this.tx - this.cx) * Math.min(1, dt * 4);
    this.cam.position.set(this.cx, 9.2, 13.5); this.cam.lookAt(this.cx, 1.1, -3.2); this.r.render(this.scene, this.cam)
  }
};
window.MALL = MALL;
