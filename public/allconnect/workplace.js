/* ================= Workplace scene =================
   Tap the Work pill (briefcase + countdown) and you walk into YOUR workplace: a bank for Banking, a hospital ward for
   Healthcare, a salon / tailor studio for Fashion, an office for Tech, a control room for Oil & Gas, a garage / taxi park /
   dispatch hub for the road jobs and a jetty for Boat Captain.
   - NPC colleagues work at their stations, customers walk in through the door, wait, get served and leave.
   - Real players with the same job who have their workplace open appear here too (socket events work:* in sockets/allconnect.js).
   - "Work a shift" walks you to your station and runs the normal JOBS.work() (the server still decides pay and cooldown). */
const WORKPLACE = (function () {
  'use strict';
  const LANE = 4.9, AISLE = 2.6, ROOM = { x0: -6, x1: 6, z0: -4.5, z1: 4.5 };
  const MAP = { banking: 'bank', tech: 'office', oil: 'control', fashion: 'salon', salon: 'salon', health: 'clinic', transport: 'garage', taxi: 'garage', delivery: 'garage', boat: 'jetty' };
  const NAMES = ['Tunde', 'Amaka', 'Bisi', 'Chidi', 'Ngozi', 'Emeka', 'Zainab', 'Femi', 'Kemi', 'Ibrahim', 'Ada', 'Segun', 'Funke', 'Obinna'];
  const SKINS = ['#4a2f23', '#6b4226', '#8a5a3c', '#a9714b', '#c58f66'], HAIRS = ['#16100d', '#241810', '#3a2418', '#0d0d0d'];
  const TOPS = ['#2d6dd8', '#d63a2f', '#2f9e63', '#e9c46a', '#8a5cf6', '#f2a585', '#4a4e57', '#ffffff'];
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h };

  const W = {
    on: false, job: null, th: null, T: null, obs: [], people: [], remote: new Map(), tags: [], keys: {}, az: .55, pol: 1.0, dist: 19, tgt: null, me: null, working: 0, last: 0, spawnAt: 0, raf: 0,
    mats: {}, ptr: new Map(), pinch: 0, moved: 0,

    /* ---------- open / close ---------- */
    async open() {
      if (this.on) return;
      const m = window.JOBS && JOBS.data && JOBS.data.mine;
      if (!m) { try { nav('phone'); setTimeout(() => PH.open('jobs'), 80) } catch (e) { } if (window.toast) toast('Pick a job first'); return }
      try { await RO3()} catch (e) { if (window.toast) toast('3D is not available on this device'); return }
      this.job = m; this.th = MAP[m.id] || 'office'; this.on = true; this.mount(); this.build(); this.sock(true); this.loop(performance.now());
      document.getElementById('wp').classList.add('on'); this.hud();
    },
    close() {
      if (!this.on) return; this.on = false; cancelAnimationFrame(this.raf); this.sock(false);
      const el = document.getElementById('wp'); if (el) el.classList.remove('on');
      try { this.R.dispose(); this.scene.traverse(o => { if (o.geometry) o.geometry.dispose() }) } catch (e) { }
      this.people = []; this.remote.clear(); this.obs = []; this.scene = null; this.mats = {}; this.me = null; this.working = 0; const tg = document.getElementById('wptags'); if (tg) tg.innerHTML = ''; this.tags = [];
      if (window.WORKCARD) setTimeout(() => WORKCARD.flush(), 300)
    },

    /* ---------- DOM ---------- */
    mount() {
      if (!document.getElementById('wp-css')) {
        const s = document.createElement('style'); s.id = 'wp-css'; s.textContent = `
#wp{position:fixed;inset:0;z-index:7000;display:none;background:#0b1230;touch-action:none;user-select:none;-webkit-user-select:none;font-family:'DM Sans',system-ui,sans-serif;color:#fff}
#wp.on{display:block}#wp canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#wptags{position:absolute;inset:0;pointer-events:none;overflow:hidden}
#wptags span{position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font:700 11px 'DM Sans',sans-serif;padding:2px 8px;border-radius:99px;background:rgba(10,14,30,.72);color:#fff}
#wptags span.me{background:#6d4aff}#wptags span.real{background:#16a34a}#wptags span small{opacity:.75;font-weight:600;margin-left:4px}
#wptop{position:absolute;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));display:flex;gap:8px;align-items:center}
#wptop button,#wptop .chip{border:0;border-radius:99px;background:rgba(10,14,30,.78);color:#fff;font:700 13px 'DM Sans',sans-serif;padding:10px 14px;backdrop-filter:blur(8px)}
#wptop .chip{flex:none}#wptop .t{flex:1;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#wpbot{position:absolute;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px;align-items:center}
#wpgo{border:0;border-radius:99px;padding:15px 26px;min-width:220px;font:800 16px Outfit,system-ui,sans-serif;background:linear-gradient(#f9d56a,#f2b33d);color:#1b1405;box-shadow:0 8px 24px rgba(0,0,0,.4)}
#wpgo:disabled{background:rgba(10,14,30,.8);color:#cfd4ea}
#wpinfo{font:600 12px 'DM Sans',sans-serif;background:rgba(10,14,30,.72);border-radius:99px;padding:6px 12px}
#wpbar{position:absolute;left:50%;top:46%;width:150px;height:10px;margin-left:-75px;border-radius:9px;background:rgba(0,0,0,.45);overflow:hidden;display:none}
#wpbar i{display:block;height:100%;width:0;background:#4ade80}
.wppop{position:absolute;left:50%;top:38%;transform:translateX(-50%);font:800 22px Outfit,sans-serif;color:#86efac;text-shadow:0 2px 8px rgba(0,0,0,.6);animation:wppop 1.6s ease-out forwards;pointer-events:none}
@keyframes wppop{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,-70px)}}`; document.head.appendChild(s)
      }
      let el = document.getElementById('wp');
      if (!el) {
        el = document.createElement('div'); el.id = 'wp';
        el.innerHTML = `<canvas id="wpcv"></canvas><div id="wptags"></div><div id="wpbar"><i></i></div>
<div id="wptop"><button onclick="WORKPLACE.close()" aria-label="Leave work">‹ Leave</button><div class="chip t" id="wptitle"></div><div class="chip" id="wpon">👥 1</div></div>
<div id="wpbot"><div id="wpinfo"></div><button id="wpgo" onclick="WORKPLACE.go()">Work a shift</button></div>`; document.body.appendChild(el);
        const cv = el.querySelector('canvas');
        cv.addEventListener('pointerdown', e => { this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.moved = 0; cv.setPointerCapture(e.pointerId); if (this.ptr.size === 2) this.pinch = this.pd() });
        cv.addEventListener('pointermove', e => {
          const p = this.ptr.get(e.pointerId); if (!p) return;
          if (this.ptr.size === 2) { p.x = e.clientX; p.y = e.clientY; const d = this.pd(); if (this.pinch) this.dist = Math.max(10, Math.min(30, this.dist * this.pinch / d)); this.pinch = d; this.moved = 9; return }
          const dx = e.clientX - p.x, dy = e.clientY - p.y; this.moved += Math.abs(dx) + Math.abs(dy); p.x = e.clientX; p.y = e.clientY;
          if (this.moved > 8) { this.az = Math.max(-.1, Math.min(1.2, this.az - dx * .005)); this.pol = Math.max(.55, Math.min(1.25, this.pol - dy * .004)) }
        });
        const up = e => { const had = this.ptr.has(e.pointerId); this.ptr.delete(e.pointerId); this.pinch = 0; if (had && this.moved <= 8 && this.ptr.size === 0) this.tap(e.clientX, e.clientY) };
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { this.ptr.delete(e.pointerId); this.pinch = 0 });
        cv.addEventListener('wheel', e => { e.preventDefault(); this.dist = Math.max(10, Math.min(30, this.dist * (e.deltaY > 0 ? 1.08 : .92))) }, { passive: false });
        window.addEventListener('keydown', e => { if (this.on) this.keys[e.key.toLowerCase()] = 1 }); window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = 0 });
        window.addEventListener('resize', () => this.resize())
      }
    },
    pd() { const a = [...this.ptr.values()]; return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) },
    hud() {
      const m = this.job; document.getElementById('wptitle').textContent = `${m.emoji || '💼'} ${m.name || ''} · ${m.title}`;
      clearInterval(this.hudT); this.hudT = setInterval(() => this.hudTick(), 500); this.hudTick()
    },
    hudTick() {
      if (!this.on) return clearInterval(this.hudT); const J = window.JOBS, d = J && J.data && J.data.mine; if (!d) return; this.job = Object.assign(this.job || {}, d);
      const b = J.btn(d), go = document.getElementById('wpgo'); if (!go) return; go.textContent = this.working ? 'Working…' : b.t; go.disabled = !!b.off || !!this.working;
      const nx = d.next; document.getElementById('wpinfo').textContent = `₦${Number(d.pay).toLocaleString('en-NG')} per shift · ${d.shiftsToday}/${d.maxPerDay} today${nx ? ` · ${nx.shiftsLeft} to ${nx.title}` : ''}`;
      document.getElementById('wpon').textContent = '👥 ' + (1 + this.remote.size)
    },

    /* ---------- the shift ---------- */
    go() {
      if (this.working) return; const J = window.JOBS; if (!J || !this.me) return; const st = this.T.me;
      this.me.route = [{ x: st.x, z: st.z }]; this.me.after = () => { this.me.face(st.r); J.work(false) }
    },
    shiftAnim() {                                      // called by the JOBS.work wrapper (manual or automatic shifts)
      if (!this.on || !this.me) return; this.working = 3.2; this.workT = 0; const b = document.getElementById('wpbar'); if (b) b.style.display = 'block'
    },
    earned(n) {
      if (!this.on) return; const e = document.createElement('div'); e.className = 'wppop'; e.textContent = '+₦' + Number(n).toLocaleString('en-NG'); document.getElementById('wp').appendChild(e); setTimeout(() => e.remove(), 1700)
    },

    /* ---------- sockets ---------- */
    sock(join) {
      const s = window.NET && NET.sock; if (!s) return;
      if (join) {
        this.h = {
          'work:roster': l => { l.forEach(u => this.addRemote(u)) }, 'work:join': u => this.addRemote(u), 'work:leave': u => this.dropRemote(u.id),
          'work:pos': u => { const r = this.remote.get(u.id); if (r) { r.route = [{ x: u.x, z: u.z }]; r.s = u.s } }
        };
        Object.keys(this.h).forEach(k => s.on(k, this.h[k])); s.emit('work:enter', { job: this.job.id, title: this.job.title })
      } else { Object.keys(this.h || {}).forEach(k => s.off(k, this.h[k])); s.emit('work:leave') }
    },
    addRemote(u) {
      if (!this.on || !u || this.remote.has(u.id) || (window.NET && NET.user && u.id === NET.user.id)) return;
      const h = hash(u.id), p = this.person({ skin: SKINS[h % 5], hair: HAIRS[h % 4], top: this.T.uni, fem: u.g === 'female', tag: '@' + (u.name || 'player'), cls: 'real', sub: u.t });
      p.at(u.x || LANE, u.z || AISLE); this.remote.set(u.id, p); this.hudTick()
    },
    dropRemote(id) { const p = this.remote.get(id); if (!p) return; this.remote.delete(id); p.dead = true; this.hudTick() },

    /* ---------- Three.js plumbing ---------- */
    mat(c, o) { const k = c + (o ? JSON.stringify(o) : ''); return this.mats[k] || (this.mats[k] = new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}))) },
    bx(w, h, d, c, x, y, z, par, o) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(c, o)); m.position.set(x, y, z); (par || this.scene).add(m); return m },
    cy(r, h, c, x, y, z, par, seg) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 14), this.mat(c)); m.position.set(x, y, z); (par || this.scene).add(m); return m },
    solid(x, z, w, d, rot) { if (rot && Math.abs(Math.sin(rot)) > .7) { const t = w; w = d; d = t } this.obs.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]) },
    label(text, w, h, bg, fg, x, y, z, ry) {
      const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = fg; g.font = `800 ${Math.round(c.height * .5)}px Outfit,Arial,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, c.height / 2 + 2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) })); m.position.set(x, y, z); m.rotation.y = ry || 0; this.scene.add(m); return m
    },
    floorTex(kind, a, b) {
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = a; g.fillRect(0, 0, 256, 256);
      if (kind === 'check') { g.fillStyle = b; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 64, y * 64, 64, 64) }
      else if (kind === 'wood') { for (let y = 0; y < 256; y += 42) { g.fillStyle = y % 84 ? b : a; g.fillRect(0, y + 1, 256, 40); g.strokeStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.moveTo(0, y + 41); g.lineTo(256, y + 41); g.stroke() } }
      else if (kind === 'tile') { g.strokeStyle = b; g.lineWidth = 3; for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke() } }
      else { for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3) } g.strokeStyle = b; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256) }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 4.5); return t
    },
    /* real model (models3d.js) placed over a fallback group: if it loads the fallback is hidden */
    async glbProp(key, o, fallback, tint) {
      try {
        const M = window.M3D; if (!M || !M.spawn) return; await M.libs(); const m = await M.spawn(key, { height: o.height, rotY: o.rotY || 0 }); if (!this.on || !this.scene) return;
        m.root.position.set(o.x, 0, o.z);
        if (tint) m.obj.traverse(n => { if (!n.isMesh || !n.material) return; n.material = n.material.clone(); if (/body|paint|car|main|shell/i.test(n.material.name || n.name)) n.material.color.set(tint) });
        this.scene.add(m.root); if (fallback) fallback.visible = false
      } catch (e) { }
    },
    /* shared finishing so every workplace reads as a proper room: skirting boards, windows, ceiling lights, a door mat, outside ground and a real building in the distance */
    decorate(T) {
      const sc = this.scene, tr = T.trim || T.accent || '#ffffff';
      this.bx(12.1, .22, .08, '#f4f1ea', 0, .11, -4.46); this.bx(.08, .22, 8.9, '#f4f1ea', -5.98, .11, 0);
      [-3.4, 1.0].forEach(z => { this.bx(.06, 1.35, 1.5, '#f4f1ea', -5.97, 1.75, z); this.bx(.03, 1.2, 1.35, '#bfe3fb', -5.93, 1.75, z, null, { transparent: true, opacity: .7 }); this.bx(.1, .06, 1.6, tr, -5.95, 1.05, z) });
      [-4.0, 0, 4.0].forEach(x => { this.bx(1.6, .05, .35, '#fffbe8', x, 3.3, -3.6); this.bx(1.5, .02, .3, '#fff7c2', x, 3.27, -3.6, null, { emissive: new THREE.Color('#fff2a8') }) });
      this.bx(1.4, .03, .9, '#3a3f4b', LANE, .02, -3.6);
      const gd = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshLambertMaterial({ color: T.outside || '#8aa86a' })); gd.rotation.x = -Math.PI / 2; gd.position.y = -.32; sc.add(gd);
      if (T.skyline !== false) this.glbProp('office', { height: 6, x: -13, z: -9, rotY: -Math.PI / 2 }, null);
    },
    resize() { if (!this.R) return; const w = innerWidth, h = innerHeight; this.R.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix() },

    build() {
      const T = this.T = THEMES[this.th](this), sc = this.scene = new THREE.Scene(); sc.background = new THREE.Color(T.sky || '#aed8f5');
      const cv = document.getElementById('wpcv'); this.R = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); this.R.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.cam = new THREE.PerspectiveCamera(34, 1, .5, 120); this.resize();
      sc.add(new THREE.HemisphereLight(0xffffff, T.ground || 0x8a7a60, .78)); const sun = new THREE.DirectionalLight(0xfff2dc, .55); sun.position.set(6, 14, 9); sc.add(sun);
      this.obs = []; this.tgt = new THREE.Vector3(0, .7, .4); this.dist = 19;
      // floor + walls (the front and the right side are open so you can see in)
      const fl = this.floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), new THREE.MeshLambertMaterial({ map: this.floorTex(T.floor[0], T.floor[1], T.floor[2]) })); fl.rotation.x = -Math.PI / 2; sc.add(fl);
      this.bx(12.4, .3, 9.4, T.slab || '#8c8f99', 0, -.17, 0);
      this.bx(12.2, 3.4, .25, T.wall, 0, 1.7, -4.62); this.bx(.25, 3.4, 9.2, T.wall, -6.12, 1.7, 0); this.bx(12.3, .22, .3, T.trim || T.accent, 0, 3.45, -4.62);
      // door in the back wall (where customers and colleagues come and go)
      this.bx(1.2, 2.4, .12, '#3b2a1a', LANE, 1.2, -4.45); this.bx(1.4, .12, .2, T.trim || T.accent, LANE, 2.46, -4.45); this.cy(.05, .1, '#d9b24a', LANE + .4, 1.1, -4.38, null, 8);
      this.decorate(T); T.build(this);
      // people
      const me = (window.ROOM3D && ROOM3D.look) || {}, uni = T.uni;
      this.me = this.person({ skin: me.skin || '#8a5a3c', hair: (me.hair && me.hair.color) || '#16100d', top: uni, fem: (me.g || S.gender) === 'female', tag: 'You', cls: 'me', sub: this.job.title, me: true });
      this.me.at(LANE, AISLE); this.me.isMe = true;
      T.staff.forEach((s, i) => { const p = this.person({ skin: pick(SKINS), hair: pick(HAIRS), top: s.top || uni, fem: Math.random() > .5, tag: pick(NAMES), sub: s.role }); p.at(s.x, s.z); p.face(s.r); p.pose = s.pose || 'stand'; p.st = s; p.home = s; if (p.pose === 'sit') { p.sit(true); p.seated = true } });
      this.spawnAt = performance.now() + 1500
    },

    /* ---------- people ---------- */
    person(o) {
      const g = new THREE.Group(), fem = !!o.fem, M = c => this.mat(c), sk = M(o.skin || '#8a5a3c');
      const mk = (w, h, d, mt, x, y, z, par) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt); m.position.set(x, y, z); (par || g).add(m); return m };
      const leg = sx => { const p = new THREE.Group(); p.position.set(sx * (fem ? .1 : .12), .8, 0); g.add(p); mk(.15, .72, .17, M(o.bottom || '#2b2f3a'), 0, -.36, 0, p); mk(.17, .08, .26, M('#1a1a1a'), 0, -.76, .04, p); return p };
      const arm = sx => { const p = new THREE.Group(); p.position.set(sx * (fem ? .3 : .35), 1.36, 0); g.add(p); mk(.11, .52, .13, M(o.top), 0, -.26, 0, p); mk(.1, .1, .12, sk, 0, -.55, 0, p); return p };
      const P = { g, o, legL: leg(-1), legR: leg(1), armL: arm(-1), armR: arm(1), route: [], sp: 1.3, ph: Math.random() * 6, sitting: false, state: 'stand' };
      mk(fem ? .42 : .5, .6, .27, M(o.top), 0, 1.1, 0); mk(.08, .1, .08, sk, 0, 1.44, 0); const hd = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10), sk); hd.position.set(0, 1.6, 0); g.add(hd);
      const hr = new THREE.Mesh(new THREE.SphereGeometry(.165, 12, 8, 0, Math.PI * 2, 0, Math.PI * .55), M(o.hair)); hr.position.set(0, 1.62, -.01); g.add(hr); if (fem) mk(.3, .34, .09, M(o.hair), 0, 1.48, -.12);
      this.scene.add(g);
      P.at = (x, z) => { g.position.set(x, 0, z) }; P.face = r => { g.rotation.y = r };
      P.sit = on => { P.sitting = on; g.position.y = on ? -.36 : 0; P.legL.rotation.x = P.legR.rotation.x = on ? -1.45 : 0 };
      if (o.tag) { const sp = document.createElement('span'); sp.className = o.cls || ''; sp.innerHTML = o.tag + (o.sub ? `<small>${o.sub}</small>` : ''); document.getElementById('wptags').appendChild(sp); P.tagEl = sp }
      this.people.push(P); this.realise(P, o); return P
    },
    /* The same animated GLB characters the home uses (models3d.js). Colleagues and customers get a random character + skin tone,
       you get YOUR character dressed in your Style-app look. The blocky figure above stays only as a fallback while they load / if they cannot load. */
    CAST: { f: ['woman', 'woman', 'worker'], m: ['casual', 'businessman', 'hoodie', 'menworker', 'farmer', 'worker'], c: ['casual', 'hoodie', 'woman', 'farmer', 'beach', 'businessman'] },
    async realise(P, o) {
      try {
        const M = window.M3D; if (!M || !M.spawn) return; await M.libs();
        const gender = o.fem ? 'female' : 'male', R0 = (window.ROOM3D && ROOM3D.look && ROOM3D.look.g === gender) ? ROOM3D.look : null;
        let key = o.me ? M.charKey(gender, R0) : (o.key || pick(o.cust ? this.CAST.c : (o.fem ? this.CAST.f : this.CAST.m)));
        const m = await M.spawn(key, { height: 1.7 }); if (!this.on || !P.g.parent) return;
        P.g.children.forEach(c => { c.visible = false }); P.g.add(m.root);
        const g = P.glb = { root: m.root, obj: m.obj, clips: m.clips, mixer: m.mixer, acts: {}, cur: '' };
        try {   // dress it: your own look for you, a random skin tone + the job's colour for everyone else
          const base = (window.ACAvatar && ACAvatar.defaultRender) ? ACAvatar.defaultRender(gender) : null;
          const look = o.me ? Object.assign({}, R0 || base) : Object.assign({}, base, { skin: o.skin, top: { c1: o.top }, hair: Object.assign({}, base && base.hair, { color: o.hair }) });
          if (look) { delete look.head; delete look.face; delete look.neckwear; delete look.jewel; M.dress({ obj: m.obj, room: { avatar: null } }, look, gender, key) }
        } catch (e) { }
        this.play(P, 'idle')
      } catch (e) { /* keep the blocky fallback */ }
    },
    play(P, st) {
      const g = P.glb; if (!g || !g.mixer || g.cur === st) return; g.cur = st;
      const map = { idle: [['Idle_Neutral', 'Idle'], 1], walk: [['Walk'], 1.1], work: [['Interact', 'Wave'], .9] }[st], c = window.M3D.clip(g, ...map[0]); if (!c) return;
      const nx = g.acts[c.name] || (g.acts[c.name] = g.mixer.clipAction(c)); nx.enabled = true; nx.setEffectiveTimeScale(map[1]); nx.setEffectiveWeight(1);
      if (g.act && g.act !== nx) { nx.reset(); nx.play(); g.act.crossFadeTo(nx, .25, false) } else { nx.reset().play() } g.act = nx
    },
    remove(p) { if (p.tagEl) p.tagEl.remove(); this.scene.remove(p.g); const i = this.people.indexOf(p); if (i >= 0) this.people.splice(i, 1) },
    routeFor(spot, out) { const r = [{ x: LANE, z: -4.0 }, { x: LANE, z: AISLE }, { x: spot.x, z: AISLE }, { x: spot.x, z: spot.z }]; return out ? r.reverse() : r },
    free(c) { return !this.obs.some(b => c.x > b[0] - .25 && c.x < b[2] + .25 && c.z > b[1] - .25 && c.z < b[3] + .25) },

    /* ---------- input: tap the floor to walk ---------- */
    tap(cx, cy) {
      if (!this.me || this.working) return; const r = document.getElementById('wpcv').getBoundingClientRect(), v = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1), ray = new THREE.Raycaster();
      ray.setFromCamera(v, this.cam); const h = ray.intersectObject(this.floor)[0]; if (!h) return; this.me.route = [{ x: Math.max(-5.7, Math.min(5.7, h.point.x)), z: Math.max(-4.2, Math.min(4.2, h.point.z)) }]; this.me.after = null
    },

    /* ---------- per-frame ---------- */
    step(P, dt, isMe) {
      let moving = false, t = P.route[0];
      if (t) {
        const dx = t.x - P.g.position.x, dz = t.z - P.g.position.z, d = Math.hypot(dx, dz);
        if (d < .08) { P.route.shift(); if (!P.route.length && P.after) { const f = P.after; P.after = null; f() } }
        else {
          const sp = (P.sp || 1.3) * dt, nx = P.g.position.x + dx / d * Math.min(sp, d), nz = P.g.position.z + dz / d * Math.min(sp, d);
          if (isMe) { const bl = (x, z) => this.obs.some(b => x > b[0] - .2 && x < b[2] + .2 && z > b[1] - .2 && z < b[3] + .2); if (!bl(nx, nz)) P.g.position.set(nx, 0, nz); else if (!bl(nx, P.g.position.z)) P.g.position.x = nx; else if (!bl(P.g.position.x, nz)) P.g.position.z = nz; else P.route = [] } else P.g.position.set(nx, 0, nz);
          const da = ((((Math.atan2(dx, dz) - P.g.rotation.y) + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI; P.g.rotation.y += da * Math.min(1, dt * 9); moving = true
        }
      }
      if (P.glb) { this.play(P, moving ? 'walk' : (P.working ? 'work' : 'idle')); if (P.glb.mixer) P.glb.mixer.update(dt); P.state = moving ? 'walk' : 'stand'; return }
      P.ph += dt * (moving ? 8 : 2);
      const sw = moving ? Math.sin(P.ph) * .6 : 0; if (!P.sitting) { P.legL.rotation.x = sw; P.legR.rotation.x = -sw }
      let al = -sw * .8, ar = sw * .8;
      if (!moving && (P.working || (isMe && this.working))) { al = -.9 + Math.sin(P.ph * 1.6) * .25; ar = -.9 + Math.sin(P.ph * 1.6 + 1.3) * .25 }
      else if (!moving) { al = Math.sin(P.ph * .7) * .05; ar = -Math.sin(P.ph * .7) * .05 }
      P.armL.rotation.x = al; P.armR.rotation.x = ar; P.state = moving ? 'walk' : 'stand'
    },
    loop(now) {
      if (!this.on) return; this.raf = requestAnimationFrame(t => this.loop(t)); const dt = Math.min(.05, (now - (this.last || now)) / 1000); this.last = now;
      // keyboard walking (desktop)
      if (this.me && !this.working) { const k = this.keys, ax = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0), az = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0); if (ax || az) { const c = Math.cos(this.az), s = Math.sin(this.az), wx = ax * c + az * s, wz = -ax * s + az * c; this.me.route = [{ x: this.me.g.position.x + wx, z: this.me.g.position.z + wz }]; this.me.after = null } }
      // the shift: working pose + progress bar, then back to idle
      if (this.working > 0) { this.workT += dt; const f = Math.min(1, this.workT / this.working), b = document.querySelector('#wpbar i'); if (b) b.style.width = f * 100 + '%'; if (f >= 1) { this.working = 0; document.getElementById('wpbar').style.display = 'none'; this.hudTick() } }
      this.spawnCustomers(now); this.staffLife(now);
      for (const p of this.people.slice()) {
        if (p.dead && !p.dying) { p.dying = 1; p.route = [{ x: LANE, z: AISLE }, { x: LANE, z: -4.0 }]; p.after = () => this.remove(p) }
        p.working = p.isMe ? (this.working > 0) : (p.pose === 'stand' && p.home && !p.route.length && p.st && p.st.busy) || (p.sitting && !p.route.length); this.step(p, dt, p.isMe);
        if (p.leaving && !p.route.length && p.g.position.z < -3.9) this.remove(p)
      }
      // sync my position to other players
      if (this.me && now - (this.mvAt || 0) > 160) { this.mvAt = now; const s = window.NET && NET.sock; if (s) s.emit('work:move', { x: +this.me.g.position.x.toFixed(2), z: +this.me.g.position.z.toFixed(2), h: +this.me.g.rotation.y.toFixed(2), s: this.working > 0 ? 'work' : this.me.state }) }
      // camera
      const a = this.az, pl = this.pol, d = this.dist; this.cam.position.set(this.tgt.x + Math.sin(a) * Math.sin(pl) * d, this.tgt.y + Math.cos(pl) * d, this.tgt.z + Math.cos(a) * Math.sin(pl) * d); this.cam.lookAt(this.tgt);
      this.R.render(this.scene, this.cam);
      // name tags
      const w = innerWidth, h = innerHeight, v = new THREE.Vector3(); for (const p of this.people) { if (!p.tagEl) continue; v.set(p.g.position.x, p.g.position.y + 1.95, p.g.position.z).project(this.cam); p.tagEl.style.left = ((v.x + 1) / 2 * w) + 'px'; p.tagEl.style.top = ((1 - v.y) / 2 * h) + 'px'; p.tagEl.style.display = v.z > 1 ? 'none' : '' }
    },
    spawnCustomers(now) {
      const T = this.T; if (now < this.spawnAt) return; this.spawnAt = now + rnd(4500, 9000);
      const cust = this.people.filter(p => p.cust).length; if (cust >= T.maxCust) return;
      const used = new Set(this.people.filter(p => p.spot).map(p => p.spot)), free = T.spots.filter(s => !used.has(s)); if (!free.length) return;
      const spot = pick(free), p = this.person({ skin: pick(SKINS), hair: pick(HAIRS), top: pick(TOPS), fem: Math.random() > .5, tag: pick(T.visitor), cust: true });
      p.cust = true; p.spot = spot; p.at(LANE, -4.0); p.sp = rnd(1.1, 1.6); p.route = this.routeFor(spot);
      p.after = () => { p.face(spot.r); p.waitUntil = performance.now() + rnd(6000, 12000); p.waiting = true }
    },
    staffLife(now) {
      for (const p of this.people) {
        if (p.cust && p.waiting && !p.route.length && now > p.waitUntil) { p.waiting = false; p.spot = null; p.leaving = true; p.route = this.routeFor({ x: p.g.position.x, z: p.g.position.z }, true).slice(1) ; p.route.unshift({ x: p.g.position.x, z: Math.max(p.g.position.z, AISLE) }) }
        if (p.home && !p.sitting && !p.isMe && !p.route.length && now > (p.stroll || (p.stroll = now + rnd(6000, 20000)))) {
          p.stroll = now + rnd(14000, 30000); const w = pick(this.T.wander); p.route = [{ x: p.g.position.x, z: Math.min(AISLE, p.g.position.z + 1.2) }, { x: w.x, z: AISLE }, { x: w.x, z: w.z }];
          p.after = () => { setTimeout(() => { if (!this.on) return; p.route = [{ x: w.x, z: AISLE }, { x: p.home.x, z: AISLE }, { x: p.home.x, z: p.home.z }]; p.after = () => p.face(p.home.r) }, rnd(2500, 6000)) }
        }
      }
    }
  };

  const RO3 = () => (window.ROOM3D && ROOM3D.load) ? ROOM3D.load() : new Promise((ok, no) => { if (window.THREE) return ok(); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s) });

  /* ---------- the workplaces. Each builder places props (and their collision boxes) and returns staff / customer spots.
     rot 0 = facing +z (towards the camera side), Math.PI = facing the back wall. ---------- */
  const PI = Math.PI;
  const desk = (w, x, z, W_, col, scr, rot) => { const g = W_; g.bx(w, .08, .75, col || '#9b6b3f', x, .78, z); g.bx(w, .74, .06, '#6e4a2a', x, .39, z - .3); g.bx(.06, .74, .7, '#6e4a2a', x - w / 2 + .05, .39, z); g.bx(.06, .74, .7, '#6e4a2a', x + w / 2 - .05, .39, z); if (scr) { g.bx(.55, .36, .04, '#10131c', x, 1.1, z - .1); g.bx(.5, .3, .02, '#3b82f6', x, 1.1, z - .08); g.bx(.06, .16, .06, '#444', x, .94, z - .1) } g.solid(x, z, w, .8) };
  const chair = (x, z, W_, col) => { W_.bx(.42, .06, .42, col || '#2b2f3a', x, .5, z); W_.bx(.42, .5, .06, col || '#2b2f3a', x, .78, z - .2); W_.cy(.03, .46, '#333', x, .25, z, null, 8) };
  const plant = (x, z, W_) => { W_.cy(.2, .4, '#b5483a', x, .2, z); const l = new THREE.Mesh(new THREE.SphereGeometry(.32, 10, 8), W_.mat('#2f9e63')); l.position.set(x, .68, z); W_.scene.add(l); W_.solid(x, z, .5, .5) };
  const bench = (x, z, W_, col) => { W_.bx(1.6, .1, .5, col || '#8a6a45', x, .45, z); W_.bx(1.6, .45, .08, col || '#8a6a45', x, .8, z - .24); W_.bx(.08, .4, .45, '#444', x - .7, .2, z); W_.bx(.08, .4, .45, '#444', x + .7, .2, z); W_.solid(x, z, 1.6, .5) };
  const counter = (x, z, len, col, W_, top) => { W_.bx(len, 1.0, .6, col, x, .5, z); W_.bx(len + .1, .08, .75, top || '#e9e2d3', x, 1.04, z); W_.solid(x, z, len, .8) };
  const glass = (x, y, z, w, h, W_) => W_.bx(w, h, .04, '#cfe9ff', x, y, z, null, { transparent: true, opacity: .28 });
  const shelf = (x, z, w, W_, cols) => { W_.bx(w, 2, .35, '#6e4a2a', x, 1, z); for (let i = 0; i < 4; i++) { const y = .4 + i * .5; for (let k = 0; k < Math.floor(w / .3); k++) W_.bx(.18, .26, .2, (cols || ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a'])[(i + k) % 4], x - w / 2 + .2 + k * .3, y + .15, z + .1) } W_.solid(x, z, w, .45) };
  const screen = (x, y, z, w, h, col, W_) => { const m = W_.bx(w, h, .08, '#10131c', x, y, z); W_.bx(w - .1, h - .1, .02, col, x, y, z + .05); return m };
  const mirror = (x, z, W_) => { W_.bx(.9, 1.3, .05, '#8a6a45', x, 1.5, z); W_.bx(.8, 1.2, .02, '#cfe9ff', x, 1.5, z + .03, null, { transparent: true, opacity: .6 }) };
  const car = (x, z, rot, col, W_, taxi) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; W_.scene.add(g); W_.bx(1.9, .55, .95, col, 0, .5, 0, g); W_.bx(1.0, .45, .85, col, -.1, .98, 0, g); W_.bx(.95, .3, .87, '#cfe9ff', -.1, 1.0, 0, g, { transparent: true, opacity: .55 }); [[-.6, .4], [.6, .4], [-.6, -.4], [.6, -.4]].forEach(p => { const w = W_.cy(.22, .18, '#111', p[0], .22, p[1], g); w.rotation.x = PI / 2 }); if (taxi) W_.bx(.35, .12, .2, '#fff', -.1, 1.28, 0, g); W_.solid(x, z, rot && Math.abs(Math.sin(rot)) > .7 ? 1 : 2, rot && Math.abs(Math.sin(rot)) > .7 ? 2 : 1, rot); W_.glbProp('sportscar', { height: 1.15, x, z, rotY: rot + PI / 2 }, g, taxi ? '#f2c200' : col); return g };
  const bed = (x, z, W_) => { W_.bx(1.0, .35, 2.0, '#d9dde6', x, .3, z); W_.bx(.95, .12, 1.6, '#e8f1ff', x, .52, z + .15); W_.bx(.5, .12, .35, '#fff', x, .6, z - .75); W_.bx(1.0, .6, .06, '#9aa3b2', x, .65, z - 1.0); W_.solid(x, z, 1.0, 2.0) };
  const chairSalon = (x, z, W_) => { W_.cy(.28, .08, '#222', x, .08, z); W_.bx(.1, .4, .1, '#888', x, .3, z); W_.bx(.55, .12, .5, '#e63946', x, .55, z); W_.bx(.55, .7, .1, '#e63946', x, .95, z - .25); W_.solid(x, z, .6, .6) };
  const bus = (x, z, W_) => { W_.bx(4.2, 1.3, 1.6, '#f2c200', x, .95, z); W_.bx(4.22, .25, 1.62, '#111', x, .8, z); for (let i = -1; i <= 1; i++) W_.bx(.8, .4, 1.64, '#cfe9ff', x + i * 1.2, 1.25, z, null, { transparent: true, opacity: .6 }); [[-1.4, .75], [1.4, .75], [-1.4, -.75], [1.4, -.75]].forEach(p => { const w = W_.cy(.34, .22, '#111', x + p[0], .34, z + p[1]); w.rotation.x = PI / 2 }); W_.solid(x, z, 4.2, 1.6) };
  const crate = (x, z, W_, col, s) => { s = s || .6; W_.bx(s, s, s, col || '#b08850', x, s / 2, z); W_.solid(x, z, s, s) };
  const bike = (x, z, rot, W_) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; W_.scene.add(g); [-.55, .55].forEach(px => { const w = new THREE.Mesh(new THREE.TorusGeometry(.3, .04, 6, 14), W_.mat('#222')); w.position.set(px, .32, 0); g.add(w) }); W_.bx(1.1, .05, .05, '#e63946', 0, .55, 0, g); W_.bx(.05, .3, .05, '#e63946', -.1, .7, 0, g); W_.bx(.35, .05, .6, '#222', .45, .88, 0, g); W_.bx(.5, .3, .4, '#f2c200', -.55, .75, 0, g); W_.solid(x, z, 1.4, .6, rot); W_.glbProp('motorcycle', { height: 1.0, x, z, rotY: rot }, g); return g };
  const tank = (x, z, W_, r) => { W_.cy(r || .9, 2.6, '#cfd4dc', x, 1.3, z, null, 20); W_.cy((r || .9) + .03, .12, '#e63946', x, 2.0, z, null, 20); W_.solid(x, z, (r || .9) * 2, (r || .9) * 2) };
  const pipe = (x, y, z, len, vertical, W_) => { const m = W_.cy(.1, len, '#7d8591', x, y, z, null, 10); if (!vertical) m.rotation.z = PI / 2; return m };

  const THEMES = {
    bank(W_) {
      const T = { wall: '#e6ecf7', accent: '#0b4fe0', trim: '#0b4fe0', uni: '#1c2a4a', floor: ['check', '#e8e4da', '#c9ccd4'], maxCust: 5, visitor: ['Customer', 'Customer', 'Customer'], staff: [], spots: [], wander: [{ x: -4.5, z: 1.4 }, { x: 0, z: 1.2 }],
        me: { x: 2.8, z: -2.0, r: 0 } };
      T.build = W => {
        counter(-1.75, -1.2, 6.8, '#6e4a2a', W, '#e9e2d3'); [-4, -2, 0].forEach(x => { glass(x + 1, 1.55, -1.2, .02 * 0 + 1.9, .9, W); W.bx(.5, .35, .04, '#10131c', x, 1.25, -1.35); W.bx(.45, .28, .02, '#3b82f6', x, 1.25, -1.33) });
        counter(2.8, -1.2, 1.4, '#6e4a2a', W); W.bx(.5, .35, .04, '#10131c', 2.8, 1.25, -1.35); W.bx(.45, .28, .02, '#3b82f6', 2.8, 1.25, -1.33);
        [-4, -2, 0].forEach((x, i) => { T.staff.push({ x, z: -2.0, r: 0, role: 'Teller', busy: 1 }); T.spots.push({ x, z: -.4, r: PI }) }); T.staff.push({ x: 2.8, z: -2.0, r: 0, role: 'Teller', busy: 1 }, { x: -4.7, z: -3.4, r: 0, role: 'Manager', top: '#7a1f2b' });
        W.bx(2.4, 2.2, .06, '#cfe9ff', -4.8, 1.1, -2.7, null, { transparent: true, opacity: .25 }); W.bx(.06, 2.2, 1.6, '#cfe9ff', -3.6, 1.1, -3.5, null, { transparent: true, opacity: .25 }); desk(1.4, -4.8, -4.0, W, '#6e4a2a', true); W.solid(-4.8, -4.0, 1.4, .8);
        W.cy(.9, .22, '#9aa3b2', 1.4, 1.2, -4.35, null, 24).rotation.x = PI / 2; W.cy(.6, .26, '#c9ced8', 1.4, 1.2, -4.3, null, 20).rotation.x = PI / 2; W.solid(1.4, -4.3, 1.9, .6);
        [2.4, 3.2, 3.9].forEach(x => { W.bx(.6, 1.7, .5, '#1f2a44', x, .85, -4.2); W.bx(.4, .3, .02, '#4ade80', x, 1.5, -3.94); W.solid(x, -4.2, .6, .5); T.spots.push({ x, z: -3.3, r: PI }) }); T.spots.length = 7;
        bench(-3.6, 1.3, W); bench(-1.4, 1.3, W); plant(-5.5, 1.6, W); plant(3.9, 1.7, W); W.label('UNITY BANK', 3.4, .7, '#0b4fe0', '#ffffff', -1.6, 2.55, -4.48); W.bx(.1, 1.0, .1, '#c9a24a', -3.4, .5, 0.2); W.bx(.1, 1.0, .1, '#c9a24a', 0.1, .5, 0.2)
      }; return T
    },
    office(W_) {
      const T = { wall: '#e9edf5', accent: '#6d4aff', trim: '#6d4aff', uni: '#2b2f3a', floor: ['wood', '#c8a679', '#b98f5e'], slab: '#7c7f8a', maxCust: 2, visitor: ['Visitor', 'Recruiter'], staff: [], spots: [], wander: [{ x: -5, z: 1.4 }, { x: 0, z: 1.5 }], me: { x: 2.4, z: -2.3, r: 0 } };
      T.build = W => {
        [[-4.6, -3.2], [-2.4, -3.2], [-0.2, -3.2], [-4.6, -1.0], [-2.4, -1.0], [-0.2, -1.0]].forEach((p, i) => { desk(1.5, p[0], p[1], W, '#e8ecf3', true); chair(p[0], p[1] + .7, W); T.staff.push({ x: p[0], z: p[1] + .7, r: PI, role: 'Developer', pose: 'sit', busy: 1 }) });
        desk(1.6, 2.4, -3.0, W, '#6d4aff', true); chair(2.4, -2.3, W); W.bx(.9, 1.9, .5, '#1f2430', 3.9, .95, -4.2); [.5, .9, 1.3, 1.7].forEach(y => W.bx(.7, .06, .02, '#4ade80', 3.9, y, -3.93)); W.solid(3.9, -4.2, .9, .5);
        screen(-5.8, 1.7, -2.0, .08 * 0 + .12, 1.4, '#6d4aff', W).rotation.y = 0; W.label('SHIP IT', 2.2, .7, '#ffffff', '#6d4aff', -2.6, 2.5, -4.48);
        const bb = (x, z, col) => { W.bx(.7, .45, .7, col, x, .23, z); W.solid(x, z, .7, .7) }; bb(-5.2, 1.2, '#e63946'); bb(-4.3, 1.5, '#2a9d8f');
        W.bx(1.2, .9, .5, '#8a6a45', 1.6, .45, 1.0); W.bx(.35, .5, .35, '#cfd4dc', 1.6, 1.15, 1.0); W.solid(1.6, 1.0, 1.2, .5); plant(-5.5, -4.0, W); plant(4.0, 1.0, W);
        T.spots.push({ x: 2.4, z: -1.2, r: PI }, { x: 0.8, z: 0.3, r: PI })
      }; return T
    },
    control(W_) {
      const T = { wall: '#d4dae3', accent: '#e8a317', trim: '#e8a317', uni: '#e8a317', floor: ['tile', '#aab2bd', '#8d95a1'], slab: '#6e747f', maxCust: 2, visitor: ['Inspector', 'Contractor'], staff: [], spots: [], wander: [{ x: -4.5, z: 1.4 }, { x: 0, z: 1.2 }], me: { x: 1.6, z: -1.6, r: 0 }, sky: '#1d2740' };
      T.build = W => {
        [-5, -3.3, -1.6].forEach(x => screen(x, 2.1, -4.42, 1.4, 1.0, '#22c55e', W)); screen(.6, 2.1, -4.42, 1.4, 1.0, '#f59e0b', W);
        [[-4.6, -2.0], [-2.6, -2.0], [-.6, -2.0]].forEach(p => { W.bx(1.4, .9, .7, '#3b4252', p[0], .45, p[1]); W.bx(1.4, .08, .8, '#aab2bd', p[0], .94, p[1]); W.bx(1.0, .06, .5, '#10131c', p[0], 1.0, p[1]); W.solid(p[0], p[1], 1.4, .8); T.staff.push({ x: p[0], z: p[1] + .75, r: PI, role: 'Operator', busy: 1 }) });
        W.bx(1.6, .9, .7, '#3b4252', 1.6, .45, -2.4); W.bx(1.6, .08, .8, '#aab2bd', 1.6, .94, -2.4); W.solid(1.6, -2.4, 1.6, .8);
        tank(-4.8, -3.4, W, .85); tank(-3.1, -3.7, W, .6); pipe(-3.6, 2.9, -4.4, 5.5, false, W); pipe(-1.5, 1.4, -4.4, 3, true, W);
        W.bx(.5, .2, .35, '#e8a317', -.6, 1.15, 1.3); crate(3.0, 0.8, W, '#e8a317', .7); crate(3.0, -0.2, W, '#e63946', .5); W.label('SAFETY FIRST', 3, .6, '#e8a317', '#1b1405', 1.4, 3.0, -4.48);
        T.spots.push({ x: 2.4, z: 1.0, r: PI }, { x: -1.4, z: 0.6, r: PI })
      }; return T
    },
    salon(W_) {
      const T = { wall: '#f6e7ee', accent: '#d6336c', trim: '#d6336c', uni: '#ffffff', floor: ['check', '#f5f5f5', '#f4c7d8'], slab: '#9a8f95', maxCust: 4, visitor: ['Customer', 'Client', 'Customer'], staff: [], spots: [], wander: [{ x: -4.6, z: 1.3 }, { x: 0, z: 1.2 }], me: { x: 2.6, z: -0.2, r: PI } };
      T.build = W => {
        [-4.6, -2.8, -1.0].forEach(x => { mirror(x, -4.45, W); chairSalon(x, -3.2, W); T.spots.push({ x, z: -3.2, r: PI, sit: 1 }); T.staff.push({ x, z: -2.2, r: PI, role: 'Stylist', busy: 1 }) });
        T.spots.length = 3; T.spots.forEach(s => s.z = -3.2); T.spots.push({ x: 0.9, z: 0.3, r: 0 }, { x: -3.2, z: 1.0, r: PI });
        W.bx(1.1, .9, .6, '#fff', 0.9, .45, -3.2); W.bx(.2, .5, .2, '#d6336c', .7, 1.15, -3.2); W.solid(.9, -3.2, 1.1, .6);
        counter(2.8, -1.0, 2.0, '#d6336c', W); T.staff.push({ x: 2.8, z: -1.9, r: 0, role: 'Receptionist', busy: 1 }); T.spots.push({ x: 2.8, z: -0.2, r: PI });
        W.cy(.35, .8, '#cfd4dc', -4.8, 1.0, 0.2); W.cy(.45, .3, '#e63946', -4.8, 1.55, 0.2); W.solid(-4.8, .2, .9, .9); shelf(-5.2, -.8 * 0 - 1.2, .9, W, ['#d6336c', '#fff', '#f4a261', '#2a9d8f']);
        const mn = (x, z, col) => { W.cy(.05, 1.2, '#555', x, .6, z, null, 8); W.bx(.4, .7, .25, col, x, 1.2, z); const h = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), W.mat('#d9c9b4')); h.position.set(x, 1.7, z); W.scene.add(h); W.solid(x, z, .5, .5) }; mn(-5.2, 3.6 * 0 + 1.9, '#d6336c'); mn(3.9, 1.5, '#2d6dd8'); W.label('GLAM & SEW', 3.2, .7, '#d6336c', '#ffffff', 0, 2.55, -4.48); plant(4.1, -3.5, W)
      }; return T
    },
    clinic(W_) {
      const T = { wall: '#e8f5f1', accent: '#10b981', trim: '#10b981', uni: '#10b981', floor: ['tile', '#f3f6f6', '#c5d3d0'], slab: '#8c9a98', maxCust: 3, visitor: ['Patient', 'Patient', 'Visitor'], staff: [], spots: [], wander: [{ x: -4.5, z: 1.3 }, { x: 0, z: 1.2 }], me: { x: 2.6, z: -1.8, r: 0 } };
      T.build = W => {
        [-4.6, -2.8, -1.0].forEach(x => { bed(x, -3.2, W); W.bx(.08, 1.7, .08, '#9aa3b2', x + .62, .85, -2.4); W.bx(.9, .6, .03, '#e8f1ff', x, 1.8, -2.35, null, { transparent: true, opacity: .6 }); T.staff.push({ x: x + .9, z: -2.2, r: 0, role: 'Nurse', top: '#10b981', busy: 1 }); T.spots.push({ x, z: -1.9, r: PI }) });
        counter(2.8, -1.2, 2.0, '#10b981', W); desk(1.4, 2.8, -2.5, W, '#e8ecf3', true); T.staff.push({ x: 2.8, z: -1.9, r: 0, role: 'Doctor', top: '#ffffff', busy: 1 }); T.spots.push({ x: 2.8, z: -.4, r: PI });
        W.bx(.9, 1.9, .45, '#cfd4dc', 0.6, .95, -4.2); [.5, 1, 1.5].forEach(y => W.bx(.8, .04, .02, '#10b981', .6, y, -3.96)); W.solid(.6, -4.2, .9, .45);
        W.bx(.8, .8, .04, '#ffffff', 3.9, 2.3, -4.48); W.bx(.5, .14, .05, '#e63946', 3.9, 2.3, -4.44); W.bx(.14, .5, .05, '#e63946', 3.9, 2.3, -4.44); bench(-3.4, 1.4, W, '#10b981'); bench(-1.2, 1.4, W, '#10b981'); plant(-5.5, 1.6, W); W.label('LUTH WARD', 2.6, .6, '#10b981', '#ffffff', -1.4, 2.8, -4.48)
      }; return T
    },
    garage(W_) {
      const job = (W_.job && W_.job.id) || 'transport', T = { wall: '#d9d4c8', accent: '#f2c200', trim: '#f2c200', uni: job === 'delivery' ? '#e63946' : '#f2c200', floor: ['concrete', '#8c8f95', '#6e7178'], slab: '#5f6269', maxCust: 3, visitor: ['Passenger', 'Customer', 'Mechanic'], staff: [], spots: [], wander: [{ x: -4.5, z: 1.5 }, { x: 0, z: 1.3 }], me: { x: 2.6, z: -.8, r: PI } };
      T.build = W => {
        if (job === 'taxi') { car(-3.8, -3.0, 0, '#f2c200', W, true); car(-1.4, -3.0, 0, '#f2c200', W, true); car(1.0, -3.0, 0, '#f2c200', W, true); W.label('TAXI PARK', 3, .7, '#111', '#f2c200', -1.4, 2.7, -4.48); T.staff.push({ x: -2.6, z: -1.6, r: 0, role: 'Driver', busy: 1 }, { x: 1.2, z: -1.6, r: 0, role: 'Driver' }); T.spots.push({ x: -2.6, z: -.6, r: PI }, { x: 0.0, z: -.6, r: PI }) }
        else if (job === 'delivery') { for (let i = 0; i < 4; i++) bike(-4.6 + i * 1.3, -3.3, PI / 2, W); shelf(-1.0, -4.2, 2.2, W); shelf(1.6, -4.2, 2.2, W); crate(-3.8, -1.2, W, '#b08850', .7); crate(-3.0, -1.2, W, '#c79a5e', .55); W.label('DISPATCH HUB', 3.4, .7, '#e63946', '#fff', -1.8, 2.7, -4.48); T.staff.push({ x: -2.2, z: -.4, r: 0, role: 'Dispatcher', busy: 1 }, { x: 0.8, z: -1.6, r: 0, role: 'Rider' }); T.spots.push({ x: -2.2, z: .6, r: PI }, { x: 1.2, z: -.3, r: PI }) }
        else { bus(-3.2, -3.0, W); crate(0.6, -3.5, W, '#4b5563', .8); W.cy(.4, .3, '#111', 1.8, .15, -3.2, null, 14); W.cy(.4, .3, '#111', 1.8, .45, -3.2, null, 14); W.label('DANFO DEPOT', 3.2, .7, '#111', '#f2c200', -1.6, 2.7, -4.48); T.staff.push({ x: -5.2, z: -1.4, r: 0, role: 'Conductor', busy: 1 }, { x: -1.4, z: -1.4, r: 0, role: 'Driver' }); T.spots.push({ x: -3.2, z: -1.4, r: PI }, { x: 0.2, z: -.4, r: PI }) }
        W.bx(1.6, .9, .6, '#6b7280', 2.9, .45, -3.6); W.bx(1.6, .08, .7, '#9ca3af', 2.9, .94, -3.6); W.solid(2.9, -3.6, 1.6, .7); T.staff.push({ x: 2.9, z: -2.8, r: 0, role: 'Mechanic', top: '#2d6dd8', busy: 1 }); W.cy(.3, .25, '#111', 3.6, .13, -2.2, null, 12); W.cy(.3, .25, '#111', 3.6, .38, -2.2, null, 12); W.solid(3.6, -2.2, .7, .7); T.spots.push({ x: 2.9, z: -1.9, r: PI })
      }; return T
    },
    jetty(W_) {
      const T = { wall: '#9cc7e8', accent: '#0e7490', trim: '#0e7490', uni: '#0e7490', floor: ['wood', '#a0764a', '#8c6540'], slab: '#6b4f33', maxCust: 4, visitor: ['Passenger', 'Passenger', 'Trader'], staff: [], spots: [], wander: [{ x: -4.5, z: 1.4 }, { x: 0, z: 1.3 }], me: { x: 2.4, z: -1.0, r: PI }, sky: '#7ec8ef' };
      T.build = W => {
        const wt = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.2), new THREE.MeshLambertMaterial({ color: '#1e90c8' })); wt.rotation.x = -PI / 2; wt.position.set(0, -.12, -2.4); W.scene.add(wt);
        W.bx(12, .06, 4.9, '#a0764a', 0, 0, 2.05); W.floor.position.z = 2.2; W.floor.scale.set(1, .55, 1); W.floor.position.y = .005;
        const bt = new THREE.Group(); bt.position.set(-2.6, 0, -3.2); W.scene.add(bt); W.bx(4.0, .5, 1.3, '#ffffff', 0, .1, 0, bt); W.bx(1.6, .8, 1.0, '#0e7490', .4, .75, 0, bt); W.bx(1.2, .3, 1.02, '#cfe9ff', .4, .85, 0, bt, { transparent: true, opacity: .6 }); W.bx(4.0, .12, 1.34, '#e63946', 0, .38, 0, bt);
        for (let i = 0; i < 5; i++) W.cy(.09, 1.0, '#5b4630', -5.4 + i * 2.5, .4, -1.3, null, 8);
        T.staff.push({ x: -.8, z: -.9, r: 0, role: 'Ferry Mate', busy: 1 }, { x: 2.4, z: -1.6, r: 0, role: 'Ticketing' }); W.bx(1.4, .9, .6, '#0e7490', 2.4, .45, -2.5); W.solid(2.4, -2.5, 1.4, .6);
        T.spots.push({ x: -1.2, z: -.4, r: PI }, { x: -2.6, z: -.4, r: PI }, { x: 0.4, z: -.4, r: PI }, { x: 2.4, z: -.6, r: PI }); crate(3.9, 0.3, W, '#b08850', .7); crate(-5.0, .6, W, '#b08850', .6); W.label('LAGOON FERRY', 3.2, .7, '#0e7490', '#fff', 1.2, 2.9, -4.48)
      }; return T
    }
  };
  // the garage builder reads which job is open
  const _g = THEMES.garage; THEMES.garage = function (W_) { return _g(W_) };

  /* hook the Jobs engine: pop the working animation + earnings while the workplace is open (manual or "Go automatically") */
  (function hook() {
    let n = 0; const t = setInterval(() => {
      if (++n > 100) return clearInterval(t); const J = window.JOBS; if (!J || J._wp) return; J._wp = 1; clearInterval(t);
      const w = J.work, tk = J.take;
      J.work = function () { if (W.on) W.shiftAnim(); return w.apply(this, arguments) };
      J.take = function (r) { const had = r && typeof r.earned === 'number' && r.earned > 0; const out = tk.apply(this, arguments); if (had) W.earned(r.earned); return out }
    }, 400)
  })();
  window.addEventListener('pagehide', () => W.on && W.close());
  return W
})();
window.WORKPLACE = WORKPLACE;
