/* Buy mode → "Style room": change the look of your home's interior (floor, rug, lighting, owned wall paints).
   Self-contained: it hooks ROOM3D (room3d.js) and the #buy screen (index.html) without touching buy.js.
   Saved per home in localStorage (key acstyle:<propertyId>); see the note in the reply about syncing to the server. */
const INSTYLE = {
  FLOORS: [
    ['oak', 'Oak planks', '#c58d56'], ['dark', 'Dark walnut', '#5a3a24'], ['tile', 'White tile', '#eceff1'],
    ['marble', 'Marble', '#f1ede4'], ['check', 'Checker', '#2b2b2b'], ['concrete', 'Concrete', '#9a9c9e'], ['carpet', 'Carpet', '#8a7aa8']
  ],
  RUGS: [['', 'None', null], ['#b5483a', 'Terracotta', '#b5483a'], ['#2f9e63', 'Naija green', '#2f9e63'], ['#3b5bdb', 'Royal blue', '#3b5bdb'], ['#e9c46a', 'Gold', '#e9c46a'], ['#2b2b2b', 'Charcoal', '#2b2b2b']],
  LIGHTS: {
    warm: ['Warm', 0xfff1d6, 0x8a7a60, 0xfff0d0], neutral: ['Neutral', 0xffffff, 0x888888, 0xffffff],
    cool: ['Cool', 0xdce9ff, 0x6a7a90, 0xe0ecff], party: ['Party', 0xffd6f5, 0x7a4a8a, 0xffc2ee]
  },
  st: { floor: 'oak', rug: '', light: 'warm' }, tex: {}, key: '', open: false,

  R() { return window.ROOM3D && ROOM3D.scene && ROOM3D.floor ? ROOM3D : null },
  pid() { return (window.S && (S.activePropertyId || (S.activeProperty && (S.activeProperty.id || S.activeProperty._id)))) || 'home' },
  load() {
    this.key = 'acstyle:' + this.pid();
    try { const j = JSON.parse(localStorage.getItem(this.key) || 'null'); this.st = Object.assign({ floor: 'oak', rug: '', light: 'warm' }, j || {}) } catch (e) { this.st = { floor: 'oak', rug: '', light: 'warm' } }
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.st)) } catch (e) { } },

  /* ---------- textures (drawn once, cached) ---------- */
  mk(id) {
    if (this.tex[id]) return this.tex[id];
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    let r = 11; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    if (id === 'dark') {
      g.fillStyle = '#4a2f1d'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 42) { g.fillStyle = y % 84 ? '#5a3a24' : '#4f321f'; g.fillRect(0, y + 1, 256, 40); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y + 41); g.lineTo(256, y + 41); g.stroke(); const o = (y / 42) % 2 ? 40 : 0; for (let x = o; x < 256; x += 90) { g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x, y + 40); g.stroke() } }
    } else if (id === 'tile') {
      g.fillStyle = '#d5d9dc'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#f3f5f6' : '#eceff1'; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60) }
    } else if (id === 'marble') {
      g.fillStyle = '#f3efe6'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 16; i++) { g.strokeStyle = `rgba(110,108,102,${.07 + rnd() * .12})`; g.lineWidth = .8 + rnd() * 1.6; g.beginPath(); let x = rnd() * 256, y = rnd() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - .3) * 60; y += (rnd() - .5) * 60; g.lineTo(x, y) } g.stroke() }
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256)
    } else if (id === 'check') {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#f2f2f2' : '#2b2b2b'; g.fillRect(x * 64, y * 64, 64, 64) }
    } else if (id === 'concrete') {
      g.fillStyle = '#9a9c9e'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${rnd() > .5 ? '255,255,255' : '0,0,0'},${rnd() * .07})`; g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 3, 2 + rnd() * 3) }
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256)
    } else if (id === 'carpet') {
      g.fillStyle = '#8a7aa8'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4200; i++) { g.fillStyle = `rgba(${rnd() > .5 ? '255,255,255' : '40,20,70'},${rnd() * .10})`; g.fillRect(rnd() * 256, rnd() * 256, 1.5, 1.5) }
    } else return null;
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return (this.tex[id] = t)
  },
  rugTex(col) {
    const k = 'rug' + col; if (this.tex[k]) return this.tex[k];
    const c = document.createElement('canvas'); c.width = 256; c.height = 176; const g = c.getContext('2d');
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() };
    g.fillStyle = col; rr(4, 4, 248, 168, 18); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 5; rr(18, 18, 220, 140, 10); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3; rr(30, 30, 196, 116, 6); g.stroke();
    return (this.tex[k] = new THREE.CanvasTexture(c))
  },

  /* ---------- apply to the 3D room ---------- */
  apply() {
    const R = this.R(); if (!R) return false;
    if (!this.orig) this.orig = { map: R.woodTx || R.floor.material.map, amb: R.amb && [R.amb.color.getHex(), R.amb.groundColor.getHex()], sun: R.sun && R.sun.color.getHex() };
    const lux = R.isLux && R.isLux(), shell = !R.layout;
    // floor
    if (!lux && shell) {
      const want = this.st.floor === 'oak' ? this.orig.map : (this.mk(this.st.floor) || this.orig.map), cur = R.floor.material.map;
      if (cur !== want) { if (cur && cur.repeat) want.repeat.copy(cur.repeat); else want.repeat.set((R.gw || 6) / 2, (R.gd || 6) / 2); R.floor.material.map = want; R.floor.material.needsUpdate = true }
    }
    // rug
    if (this.rugM) { R.scene.remove(this.rugM); this.rugM.geometry.dispose(); this.rugM = null }
    if (this.st.rug && shell) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.65), new THREE.MeshLambertMaterial({ map: this.rugTex(this.st.rug), transparent: true }));
      m.rotation.x = -Math.PI / 2; m.position.set(R.floor.position.x, .02, R.floor.position.z); R.scene.add(m); this.rugM = m
    }
    // lighting colour mood (brightness stays under the game's day / night control)
    const L = this.LIGHTS[this.st.light] || this.LIGHTS.warm;
    if (R.amb) { R.amb.color.setHex(L[1]); R.amb.groundColor.setHex(L[2]) }
    if (R.sun) R.sun.color.setHex(L[3]);
    return true
  },
  set(k, v) { this.st[k] = v; this.save(); this.apply(); this.paint() },

  /* wall paints: only ones the player owns (buying stays in the Design tab) */
  walls() {
    const out = []; try { const g = (CAT.Design || []).find(x => /WALL/i.test(x[0])); (g ? g[1] : []).forEach(p => out.push({ n: p[0], price: p[1], c: p[2], own: !!(S.owned && S.owned[p[0]]) })) } catch (e) { } return out
  },
  pickWall(c, own, n) {
    if (!own) { if (typeof toast === 'function') toast('Buy ' + n + ' in the Design tab first'); return }
    if (typeof setPaint === 'function') setPaint(c); if (window.NET && NET.save) NET.save(); this.paint()
  },

  /* ---------- UI ---------- */
  css() {
    if (document.getElementById('instyle-css')) return; const s = document.createElement('style'); s.id = 'instyle-css';
    s.textContent = `#instyleBtn{position:absolute;left:12px;top:calc(64px + var(--sat,0px));z-index:37;border:0;border-radius:999px;padding:9px 14px;font:700 13px Outfit,system-ui,sans-serif;background:rgba(20,26,52,.86);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer}
#instyle{position:absolute;left:0;right:0;bottom:0;z-index:60;max-height:58%;overflow-y:auto;background:#fff;color:#14172b;border-radius:22px 22px 0 0;padding:14px 16px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.28);display:none;font-family:'DM Sans',system-ui,sans-serif}
#instyle.on{display:block}
body.dk #instyle{left:12px;right:auto;bottom:12px;width:340px;border-radius:20px;max-height:calc(100% - 90px)}
#instyle h3{margin:0 0 2px;font:800 18px Outfit,system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between}
#instyle h3 button{border:0;background:#eef0f6;border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer}
#instyle small.n{display:block;color:#6b7280;font-size:12px;margin:2px 0 8px}
#instyle h4{margin:12px 0 6px;font:700 12px 'DM Sans',sans-serif;letter-spacing:.08em;color:#6b7280;text-transform:uppercase}
#instyle .row{display:flex;gap:9px;overflow-x:auto;padding:2px 2px 6px}
#instyle .sw{flex:none;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;font:600 11px 'DM Sans',sans-serif;color:#374151;cursor:pointer;width:62px}
#instyle .sw i{display:block;width:46px;height:46px;border-radius:14px;border:3px solid transparent;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
#instyle .sw.on i{border-color:#6d4aff}
#instyle .sw.lk{opacity:.5}
#instyle .chips{display:flex;gap:8px;flex-wrap:wrap}
#instyle .chips button{border:0;border-radius:999px;padding:9px 14px;background:#eef0f6;font:700 13px 'DM Sans',sans-serif;cursor:pointer;color:#14172b}
#instyle .chips button.on{background:#6d4aff;color:#fff}`;
    document.head.appendChild(s)
  },
  mount() {
    const b = document.getElementById('buy'); if (!b || document.getElementById('instyleBtn')) return; this.css();
    const btn = document.createElement('button'); btn.id = 'instyleBtn'; btn.type = 'button'; btn.textContent = '🎨 Style room'; btn.onclick = () => this.toggle();
    const p = document.createElement('div'); p.id = 'instyle'; b.appendChild(btn); b.appendChild(p)
  },
  toggle(on) { this.open = typeof on === 'boolean' ? on : !this.open; const p = document.getElementById('instyle'); if (!p) return; p.classList.toggle('on', this.open); if (this.open) { this.load(); this.apply(); this.paint() } },
  paint() {
    const p = document.getElementById('instyle'); if (!p) return; const R = this.R(), model = R && R.layout, lux = R && R.isLux && R.isLux();
    const sw = (arr, cur, fn) => arr.map(x => `<button type="button" class="sw ${cur === x[0] ? 'on' : ''}" onclick="${fn}('${x[0]}')"><i style="background:${x[2] || 'repeating-linear-gradient(45deg,#eee 0 6px,#fff 6px 12px)'}"></i>${x[1]}</button>`).join('');
    p.innerHTML = `<h3>🎨 Style your room<button type="button" onclick="INSTYLE.toggle(false)" aria-label="Close">✕</button></h3>
<small class="n">${model ? 'This home’s floor comes with its house model, so floors and rugs are for single-room homes. Walls and lighting still work.' : lux ? 'Your Luxury finish keeps the marble floor. Rugs and lighting still work.' : 'Changes show instantly and are saved for this home.'}</small>
<h4>Wall paint</h4><div class="row">${this.walls().map(w => `<button type="button" class="sw ${(S.paint || '').toLowerCase() === w.c.toLowerCase() ? 'on' : ''} ${w.own ? '' : 'lk'}" onclick="INSTYLE.pickWall('${w.c}',${w.own},'${w.n.replace(/'/g, '')}')"><i style="background:${w.c}"></i>${w.own ? w.n : '🔒 ' + w.n}</button>`).join('') || '<small class="n">No paints found.</small>'}</div>
<h4>Floor</h4><div class="row">${sw(this.FLOORS, this.st.floor, 'INSTYLE.floor')}</div>
<h4>Rug</h4><div class="row">${sw(this.RUGS, this.st.rug, 'INSTYLE.rug')}</div>
<h4>Lighting mood</h4><div class="chips">${Object.keys(this.LIGHTS).map(k => `<button type="button" class="${this.st.light === k ? 'on' : ''}" onclick="INSTYLE.set('light','${k}')">${this.LIGHTS[k][0]}</button>`).join('')}</div>`
  },
  floor(v) { this.set('floor', v) },
  rug(v) { this.set('rug', v) },

  boot() {
    this.mount(); let tries = 0;
    const t = setInterval(() => {
      if (++tries > 120) return clearInterval(t); const R = this.R(); if (!R) return;
      this.mount(); this.load(); this.apply();
      // room3d resets the floor / walls in these calls: re-apply our style right after them
      ['finishApply', 'setRoom', 'sync'].forEach(fn => { if (R[fn] && !R[fn]._is) { const o = R[fn]; R[fn] = function () { const r = o.apply(this, arguments); try { INSTYLE.load(); INSTYLE.apply() } catch (e) { } return r }; R[fn]._is = 1 } });
      clearInterval(t)
    }, 500);
    const app = document.getElementById('app'); if (app) new MutationObserver(() => { const b = document.getElementById('buy'); if (b && b.style.display === 'none' && this.open) this.toggle(false) }).observe(document.getElementById('buy') || app, { attributes: true, attributeFilter: ['style'] })
  }
};
window.INSTYLE = INSTYLE; INSTYLE.boot();
