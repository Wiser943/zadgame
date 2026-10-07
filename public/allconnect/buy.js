/* Buy mode: catalogue, preview ("ghost") placement on the grid, move / turn / store / sell, wishlist.
   Rules (prices, overlap, sell value = 20%) are enforced by the server (routes/acitems.js). The 3D room is ROOM3D. */
const BUY = {
  active: false, tab: 'Sleep', sheetOpen: true, g: null, sel: null, confirmSell: 0, paint0: null, pp: null,
  TABS: ['Sleep', 'Kitchen', 'Bath', 'Comfort', 'Light', 'Design', 'Wishlist', 'Stored'],
  is3d() { return !!(window.ROOM3D && ROOM3D.on) },
  items() { return S.items || [] },
  api(u, b) { return NET.api('/api/ac/items' + u, { method: 'POST', body: b || {} }) },
  stars(n) { return n ? '★'.repeat(n) : '' },
  thumb(name) { const D = FURN.ITEMS[name]; const u = this.is3d() ? ROOM3D.thumb(name) : ''; return u ? `<img src="${u}" alt="">` : `<span class="cem">${D.emoji || '🛋️'}</span>` },
  enter() {
    this.active = true; this.g = null; this.sel = null; this.pp = null; this.sheetOpen = true; this.paint0 = S.paint;
    if (!this.is3d() && this.TABS.indexOf(this.tab) < 5) this.tab = 'Design';
    if (this.is3d()) { ROOM3D.buyMode(true, e => this.tap(e)); ROOM3D.page('buy') }
    this.draw()
  },
  /* leaving Buy mode: a preview you did not pay for is kept as a draft in your wishlist */
  leave() {
    if (!this.active) return; this.active = false;
    if (this.g && this.g.mode === 'new') this.wish(this.g.name, true, true);
    if (this.g && this.g.id && window.ROOM3D) ROOM3D.hideItem(this.g.id, false);
    if (window.ROOM3D) ROOM3D.buyMode(false);
    if (this.pp && !S.owned[this.pp[0]]) { setPaint(this.paint0) }
    this.g = null; this.sel = null; this.pp = null
  },
  exit() { nav('home') },
  openSheet() { this.sheetOpen = true; this.sel = null; if (this.is3d()) ROOM3D.deselect(); this.draw() },
  hideSheet() { this.sheetOpen = false; this.draw() },
  setTab(t) { this.tab = t; this.pp = null; this.draw() },
  /* ---------- taps in the 3D room ---------- */
  tap(e) {
    if (this.g) { if (e.type === 'cell' && !FURN.ITEMS[this.g.name].fixed) { const [w, d] = FURN.footprint(this.g.name, this.g.rot); this.setGhost(Math.max(0, Math.min(6 - w, e.cell[0] - Math.floor((w - 1) / 2))), Math.max(0, Math.min(6 - d, e.cell[1] - Math.floor((d - 1) / 2))), this.g.rot) } return }
    if (e.type === 'item') { this.sel = e.id; this.sheetOpen = false; ROOM3D.select(e.id); this.draw(); return }
    if (this.sel) { this.sel = null; ROOM3D.deselect(); this.draw(); return }
    if (this.sheetOpen) { this.sheetOpen = false; this.draw() }
  },
  /* ---------- ghost (preview) ---------- */
  startGhost(name, mode, id, at) {
    const D = FURN.ITEMS[name]; this.sel = null; ROOM3D && ROOM3D.deselect(); this.sheetOpen = false;
    if (D.fixed) { this.g = { name, mode: 'new', fixed: true, x: 0, z: 0, rot: 0, valid: !this.items().some(i => i.name === name) }; this.draw(); return }
    const spot = at || FURN.autoPlace(this.items().filter(i => i.id !== id), name);
    this.g = { name, mode, id, x: spot ? spot.x : 0, z: spot ? spot.z : 0, rot: spot ? spot.rot : 0, valid: !!spot };
    if (id) ROOM3D.hideItem(id, true);
    this.setGhost(this.g.x, this.g.z, this.g.rot)
  },
  setGhost(x, z, rot) {
    const g = this.g; Object.assign(g, { x, z, rot }); g.valid = FURN.canPlace(this.items(), g.name, x, z, rot, g.id);
    const sim = this.items().filter(i => i.id !== g.id).concat([{ id: 'ghost', name: g.name, x, z, rot, placed: true }]);
    g.blocks = g.valid && ROOM3D.reachesCooler(this.items()) && !ROOM3D.reachesCooler(sim);
    ROOM3D.ghost(g.name, x, z, rot, g.valid); this.draw()
  },
  nudge(sx, sy) {
    const g = this.g; if (!g || g.fixed) return; const az = ROOM3D.az, f = [-Math.sin(az), -Math.cos(az)], r = [Math.cos(az), -Math.sin(az)];
    let dx = sy * f[0] + sx * r[0], dz = sy * f[1] + sx * r[1]; const L = Math.hypot(dx, dz) || 1; dx = Math.abs(dx / L) > .38 ? Math.sign(dx) : 0; dz = Math.abs(dz / L) > .38 ? Math.sign(dz) : 0;
    const [w, d] = FURN.footprint(g.name, g.rot); this.setGhost(Math.max(0, Math.min(6 - w, g.x + dx)), Math.max(0, Math.min(6 - d, g.z + dz)), g.rot)
  },
  spin() {
    const g = this.g; if (!g || g.fixed) return; const rot = (g.rot + 90) % 360, [w, d] = FURN.footprint(g.name, rot);
    this.setGhost(Math.max(0, Math.min(6 - w, g.x)), Math.max(0, Math.min(6 - d, g.z)), rot)
  },
  cancel() { const g = this.g; if (g && g.id) ROOM3D.hideItem(g.id, false); if (window.ROOM3D) ROOM3D.unghost(); this.g = null; this.draw() },
  async commit() {
    const g = this.g; if (!g || !g.valid) return;
    try {
      if (g.mode === 'new') {
        const r = await this.api('/buy', { name: g.name, x: g.x, z: g.z, rot: g.rot }); applyAC(r.ac); ROOM3D.unghost(); this.g = null; render(); toast('Bought ' + g.name + ' ✓'); if (window.PH) PH.local_('🛍️', 'You bought ' + g.name, 'good')
      } else {
        const r = await this.api('/' + g.id + (g.mode === 'place' ? '/place' : '/move'), { x: g.x, z: g.z, rot: g.rot }); ROOM3D.hideItem(g.id, false); ROOM3D.unghost(); this.g = null; applyAC(r.ac); toast(g.mode === 'place' ? 'Placed ✓' : 'Moved ✓')
      }
    } catch (e) { toast(e.message) } this.draw()
  },
  /* ---------- owned item actions ---------- */
  selItem() { return this.items().find(i => i.id === this.sel) },
  move() { const it = this.selItem(); if (it) this.startGhost(it.name, 'move', it.id, { x: it.x, z: it.z, rot: it.rot }) },
  async turn() {
    const it = this.selItem(); if (!it) return; const rot = (it.rot + 90) % 360, [w, d] = FURN.footprint(it.name, rot);
    const x = Math.max(0, Math.min(6 - w, it.x)), z = Math.max(0, Math.min(6 - d, it.z));
    if (!FURN.canPlace(this.items(), it.name, x, z, rot, it.id)) return toast('No space to turn it here');
    const old = { x: it.x, z: it.z, rot: it.rot }; Object.assign(it, { x, z, rot }); ROOM3D.sync(); this.draw();
    try { const r = await this.api('/' + it.id + '/move', { x, z, rot }); applyAC(r.ac) } catch (e) { Object.assign(it, old); ROOM3D.sync(); this.draw(); toast(e.message) }
  },
  async store() { const it = this.selItem(); if (!it) return; try { const r = await this.api('/' + it.id + '/store'); this.sel = null; ROOM3D.deselect(); applyAC(r.ac); toast(it.name + ' stored 📦') } catch (e) { toast(e.message) } },
  async sell() {
    const it = this.selItem(); if (!it) return;
    if (Date.now() - this.confirmSell > 3500) { this.confirmSell = Date.now(); this.draw(); return }
    this.confirmSell = 0; try { const r = await this.api('/' + it.id + '/sell'); this.sel = null; ROOM3D.deselect(); S.cash = r.ac.cash; applyAC(r.ac); render(); toast('Sold ' + it.name + ' for ' + fmt(r.paid)) } catch (e) { toast(e.message) }
  },
  closeSel() { this.sel = null; ROOM3D.deselect(); this.draw() },
  async wish(name, on, quiet) {
    S.wish = S.wish || []; const had = S.wish.includes(name); if (on && !had) S.wish.push(name); if (!on) S.wish = S.wish.filter(n => n !== name);
    if (!quiet) this.draw(); else if (on && !had) toast('Saved to your wishlist ♡');
    try { const r = await this.api('/wish', { name, on }); S.wish = r.ac.wish } catch (e) { if (!quiet) toast(e.message) }
  },
  async wishFromGhost() { const g = this.g; if (!g) return; await this.wish(g.name, true); this.cancel(); toast('Saved to your wishlist ♡') },
  /* ---------- paints ---------- */
  paint(i) { const it = CAT.Design[0][1][i]; this.pp = it; setPaint(it[2]); this.draw() },
  async buyPaint() {
    const it = this.pp; if (!it) return;
    if (S.owned[it[0]]) { NET.save(); toast('Applied ✓'); this.paint0 = S.paint; this.pp = null; return this.draw() }
    try { const r = await NET.api('/api/ac/buy', { method: 'POST', body: { name: it[0] } }); applyAC(r.ac); setPaint(it[2]); NET.save(); this.paint0 = S.paint; this.pp = null; render(); toast('Bought ' + it[0] + ' ✓') } catch (e) { toast(e.message) } this.draw()
  },
  /* ---------- drawing ---------- */
  draw() {
    if (!this.active) return; const bal = $('bal2'); if (bal) bal.textContent = fmt(S.cash || 0);
    const show = this.sheetOpen && !this.g && !this.sel;
    $('sheet').style.display = show ? 'block' : 'none'; $('bpanel').style.display = (this.g || this.sel) ? 'block' : 'none';
    $('catbtn').style.display = (!show && !this.g && !this.sel) ? 'block' : 'none';
    if (show) this.drawSheet(); if (this.g) this.drawGhostPanel(); else if (this.sel) this.drawSelPanel()
  },
  drawSheet() {
    const t = this.tab, stored = this.items().filter(i => i.placed === false), wish = S.wish || [], tabs = this.TABS.filter(x => this.is3d() || x === 'Design');
    $('tabs').innerHTML = tabs.map(x => `<button class="${x === t ? 'on' : ''}" onclick="BUY.setTab('${x}')">${{ Sleep: '🛏️', Kitchen: '🍳', Bath: '🚿', Comfort: '🛋️', Light: '💡', Design: '🎨', Wishlist: '♡', Stored: '📦' }[x]} ${x}${x === 'Wishlist' && wish.length ? ' (' + wish.length + ')' : x === 'Stored' && stored.length ? ' (' + stored.length + ')' : ''}</button>`).join('');
    const G = $('items'); G.className = 'grid cat';
    if (t === 'Design') {
      G.className = 'grid'; G.innerHTML = CAT.Design[0][1].map((it, i) => `<button class="sw ${this.pp && this.pp[0] === it[0] ? 'sel' : ''}" onclick="BUY.paint(${i})"><i style="background:linear-gradient(90deg,${it[2]} 50%,${it[2]}cc 50%)"></i>${it[0]}<span>${S.owned[it[0]] ? 'Owned' : fmt(it[1])}</span></button>`).join('') + (this.pp ? `<button class="btn p" style="grid-column:1/-1" onclick="BUY.buyPaint()">${S.owned[this.pp[0]] ? 'Use ' + this.pp[0] : 'Buy ' + this.pp[0] + ' · ' + fmt(this.pp[1])}</button>` : '')
      return
    }
    if (t === 'Wishlist') { G.innerHTML = wish.length ? wish.map(n => this.card(n, `<div class="cbtns"><button onclick="BUY.startGhost('${n}','new')">Preview</button><button class="x" onclick="BUY.wish('${n}',false)">✕</button></div>`)).join('') : '<p class="empty" style="grid-column:1/-1">Nothing saved. Preview something you like and close Buy mode: it is kept here until you can afford it.</p>'; return }
    if (t === 'Stored') { G.innerHTML = stored.length ? stored.map(i => this.card(i.name, `<div class="cbtns"><button onclick="BUY.startGhost('${i.name}','place','${i.id}')">Place</button><button class="x" onclick="BUY.sel='${i.id}';BUY.sheetOpen=false;BUY.draw()">⋯</button></div>`, 1)).join('') : '<p class="empty" style="grid-column:1/-1">No stored items. Tap an item in your room and choose Store to keep it here.</p>'; return }
    G.innerHTML = Object.keys(FURN.ITEMS).filter(n => FURN.ITEMS[n].cat === t).map(n => this.card(n)).join('')
  },
  card(n, extra, stored) {
    const D = FURN.ITEMS[n], have = this.items().filter(i => i.name === n).length, size = D.fixed ? 'Fixed' : D.w + '×' + D.d;
    return `<div class="cc" ${extra ? '' : `onclick="BUY.startGhost('${n}','new')"`}><div class="ch"><span>${size}</span><b>${this.stars(D.stars)}</b></div><div class="ci">${this.thumb(n)}</div><div class="cn">${n}</div><div class="cp">${stored ? 'Stored' : fmt(D.price)}${have && !stored ? `<small> · own ${have}</small>` : ''}</div>${extra || ''}</div>`
  },
  drawGhostPanel() {
    const g = this.g, D = FURN.ITEMS[g.name], afford = (S.cash || 0) >= D.price, isNew = g.mode === 'new', need = D.price - (S.cash || 0);
    let warn = '', ok = g.valid;
    if (g.fixed) { ok = g.valid; warn = g.valid ? 'Fixed to the wall or ceiling, no space needed.' : 'You already have this one.' }
    else if (!g.valid) warn = '<span class="bad">That spot is taken or outside the room.</span>';
    else if (g.blocks) warn = '<span class="warn">Heads up: this blocks the way to your cooler box</span>';
    else if (isNew && !afford) warn = `<span class="bad">You need ${fmt(need)} more. You can still preview it.</span>`;
    const go = isNew ? (afford && ok ? `<button class="btn p" onclick="BUY.commit()">✓ Place · ${fmt(D.price)}</button>` : `<button class="btn p dis" disabled>${!ok ? (g.fixed ? 'Already owned' : 'Spot taken') : 'Need ' + fmt(need) + ' more'}</button>`) : `<button class="btn p" ${ok ? '' : 'disabled'} onclick="BUY.commit()">✓ ${g.mode === 'place' ? 'Place' : 'Done'}</button>`;
    const ctl = g.fixed ? '' : `<div class="pad"><button onclick="BUY.nudge(-1,1)" aria-label="Up left">↖</button><button onclick="BUY.nudge(1,1)" aria-label="Up right">↗</button><button class="rot" onclick="BUY.spin()" aria-label="Turn">⟳</button><button onclick="BUY.nudge(-1,-1)" aria-label="Down left">↙</button><button onclick="BUY.nudge(1,-1)" aria-label="Down right">↘</button></div>`;
    $('bpanel').innerHTML = `<div class="bp-h"><b>${g.name}</b>${isNew ? `<span>${fmt(D.price)}</span>` : '<span>Moving</span>'}</div><div class="bp-w">${warn || '&nbsp;'}</div><div class="bp-c">${ctl}<div class="bp-b">${go}${isNew && !afford ? `<button class="btn s" onclick="BUY.wishFromGhost()">♡ Save to wishlist</button>` : ''}<button class="btn s" onclick="BUY.cancel()">✕ Cancel</button></div></div>`
  },
  drawSelPanel() {
    const it = this.selItem(); if (!it) { this.sel = null; return this.draw() }
    const D = FURN.ITEMS[it.name], lock = D.locked, confirming = Date.now() - this.confirmSell < 3500;
    $('bpanel').innerHTML = `<div class="bp-i"><div class="bp-t">${this.thumb(it.name)}</div><div><b>${it.name}</b><small>${lock ? 'You need this one' : 'Sells for ' + fmt(FURN.sellPrice(it.name))}</small></div></div>
      <div class="bp-a">${D.fixed ? '' : `<button onclick="BUY.move()">Move</button><button onclick="BUY.turn()">⟳ Turn</button>`}${D.fixed || lock ? '' : `<button onclick="BUY.store()">Store</button>`}<button onclick="BUY.closeSel()">Close</button>${lock ? '' : `<button class="sell ${confirming ? 'on' : ''}" onclick="BUY.sell()">${confirming ? 'Tap to confirm' : 'Sell'}</button>`}</div>`;
    if (confirming) setTimeout(() => { if (this.sel === it.id) this.drawSelPanel() }, 3600)
  }
};
window.BUY = BUY;
