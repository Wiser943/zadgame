// Homes selector. Uses the shared AllConnect SHEET modal and server-authoritative wallet.
const HOMES = {
  data: null,
  busy: false,
  sizeFor: '',
  sizeMsg: '',
  errorMessage: '',
  oldServer: false,
  async open() {
    SHEET.open({
      id: 'homes', title: '🏠 Homes & Furnishing', wide: true,
      body: () => '<p class="home-intro">Keep your starter room, or get another place to make your own.</p><div id="homesList" class="homes-list"><p class="empty">Loading homes…</p></div>'
    });
    await this.load();
  },
  /* Homes as its own phone app (Phone -> Homes): the same list, drawn into the app page */
  openApp() {
    PH.view = 'homes';
    PH.shell('Homes', 'PH.close()', '<div class="abody" id="ab"></div>');
    this.sizeFor = ''; this.openInline(document.getElementById('ab'));
  },
  /* inside the Venues app (Homes tab): same list, drawn into the page instead of a pop-up */
  openInline(ab) {
    ab.innerHTML = '<p class="home-intro">Keep your starter room, or buy or rent another place and make it your own.</p><div id="homesList" class="homes-list"><p class="empty">Loading homes</p></div>';
    this.load();
  },
  close() { if (window.SHEET) SHEET.close(); if (window.PH && PH.view === 'homes') PH.close(); },
  async load() {
    this.errorMessage = '';
    const list = document.getElementById('homesList');
    try {
      this.data = await NET.api('/api/ac/properties'); this.off = this.data.now ? this.data.now - Date.now() : 0; this._ready = null; clearInterval(this._bt); this._bt = setInterval(() => { if (document.getElementById('homesList')) this.tickBuilds(); else clearInterval(this._bt) }, 1000);
      this.oldServer = this.data.homesApi !== 2;      // the server answers with homesApi:2 once the new home code is deployed
      if (SHEET.isOpen('homes') || (window.PH && PH.view === 'homes')) this.draw();
    } catch (e) {
      if (list) list.innerHTML = `<div class="home-error"><b>Could not load homes</b><p>${this.esc(e.message || 'Check your connection and try again.')}</p><button onclick="HOMES.load()">Try again</button></div>`;
      else toast(e.message || 'Could not load homes. Please try again.');
    }
  },
  money(n) { return '₦' + Number(n || 0).toLocaleString('en-NG'); },
  draw() {
    const target = document.getElementById('homesList'), d = this.data;
    if (!target || !d) return;
    if (this.sizeFor) return this.drawSizes();
    const own = d.properties || [], active = S.activePropertyId, rows = [];
    if (this.oldServer) rows.push(`<div class="home-error" role="alert"><span class="home-error-ic"><i class="fa-solid fa-triangle-exclamation"></i></span><div><b>Game server needs updating</b><p>Buying, renting and adding bedrooms need the latest server version. Redeploy the backend, then reopen Homes.</p></div></div>`);
    if (this.errorMessage && !this.oldServer) rows.push(`<div class="home-error" role="alert"><span class="home-error-ic"><i class="fa-solid fa-triangle-exclamation"></i></span><div><b>Couldn't complete that</b><p>${this.esc(this.errorMessage)}</p></div><button onclick="HOMES.load()">Try again</button></div>`);
    const bh = this.buildsHtml(); if (bh) rows.push(bh);
    rows.push(`<div class="home-card"><div class="home-emoji">🛏️</div><div class="home-copy"><b>Starter Room</b><p>Your original AllConnect room and furniture are preserved.</p><small>Always available · Existing furniture</small></div><div class="home-actions"><button class="${!active ? 'secondary' : ''}" onclick="HOMES.enter('')">${!active ? 'Current home' : 'Enter'}</button></div></div>`);
    for (const h of d.catalogue || []) {
      const p = own.find(x => x.type === h.id && !(x.tenure === 'rent' && x.leaseExpiresAt && new Date(x.leaseExpiresAt) <= new Date()));
      const activeP = p && p.id === active, expired = p && p.tenure === 'rent' && p.leaseExpiresAt && new Date(p.leaseExpiresAt) <= new Date();
      const price = h.mode === 'rent' ? h.rent : h.price;
      const term = h.mode === 'rent' ? `Rent · ${h.rentDays} days` : 'Permanent ownership';
      const comfort = h.comfort && h.comfort !== 1 ? ` · comfort x${h.comfort}` : '';
      rows.push(`<div class="home-card"><div class="home-emoji">🏡</div><div class="home-copy"><b>${this.esc(h.name)}</b><p>${this.esc(h.description)}</p><small>${term} · ${this.money(price)}${comfort}</small>${p && !expired ? `<p>Owned/rented · ${(p.items || []).length} furniture item${(p.items || []).length === 1 ? '' : 's'}</p>` : ''}${p && !expired && p.tenure === 'owned' ? this.sizeLine(p, h) : ''}</div><div class="home-actions">${p && !expired ? `<button onclick="HOMES.enter('${this.esc(p.id)}')">${activeP ? 'Current home' : 'Enter home'}</button>${this.expandButton(p, h)}${this.renovateButton(p)}` : `<button ${this.busy ? 'disabled' : ''} onclick="HOMES.acquire('${this.esc(h.id)}')">${h.mode === 'rent' ? 'Rent' : 'Buy'}</button>`}</div></div>`);
    }
    target.innerHTML = rows.join('');
  },
  /* Bedroom expansions: the server owns the sizes and prices (p.expansions); this only shows them and asks. */
  sizeLine(p, h) {
    if (h && h.layout) return `<p>Layout · ${this.esc(h.layoutNote || 'Fixed floor plan')}</p>`;
    if (!p || p.tenure !== 'owned') return '';
    const label = p.sizeLabel || (p.totalBedrooms > 0 ? p.totalBedrooms + '-Bedroom' : 'Studio'), more = (p.expansions || []).length;
    return `<p>Size · <b>${this.esc(label)}</b>${more ? '' : ' · biggest size'}</p>`;
  },
  /* Renovate: the server decides what is on offer and the price (p.renovations): back extension (toilet + porch), an upstairs floor with a
     choice of layouts, a new upstairs layout, and the luxury finish. */
  renovateButton(p) {
    if (!p || p.tenure !== 'owned' || !((p.renovations || []).length || (p.packs || []).length)) return '';
    return `<button class="secondary" ${this.busy ? 'disabled' : ''} onclick="HOMES.renoSheet('${this.esc(p.id)}')">Renovate &amp; furnish</button>`;
  },
  renoSheet(id) {
    this.renoId = id; SHEET.open({ id: 'reno', title: '🛠️ Renovate', body: () => this.renoBody() });
  },
  renoBody() {
    const p = ((this.data && this.data.properties) || []).find(x => x.id === this.renoId); if (!p) return '<p class="empty">Home not found.</p>';
    const opts = p.renovations || [];
    const groups = {}; opts.forEach(o => { (groups[o.group || o.name] = groups[o.group || o.name] || []).push(o) });
    const packs = (p.packs || []).length ? '<h4>🛋️ Furnish it like a luxury home</h4><p class="lgnote">One purchase furnishes a room or floor (15% off). Only what fits is placed and charged.</p>' + p.packs.map(k => `<div class="lgq"><span class="lgi">${k.emoji}</span><div><b>${this.esc(k.name)}${k.any && p.upstairs ? (k.floor === 1 ? ' · upstairs' : ' · downstairs') : ''}</b><small>${this.esc(k.desc)} (${k.count} of ${k.of} fit)</small></div><button class="lgbtn" ${this.busy ? 'disabled' : ''} onclick="HOMES.pack('${this.esc(p.id)}','${k.id}',${k.floor})">${this.money(k.cost)}</button></div>`).join('') : '';
    const state = [p.upstairs ? '🏢 Upstairs floor built' : '', p.finish === 'luxury' ? '💎 Luxury finish' : '', p.bath ? '🚽 Back extension' : ''].filter(Boolean).join(' · ');
    return (state ? `<p class="lgnote">${state}</p>` : '') + (!opts.length ? '<p class="lgnote">Nothing left to build. This home is fully upgraded. ✨</p>' : '') + Object.entries(groups).map(([g, list]) => `<h4>${this.esc(g)}</h4>` + list.map(o => `<div class="lgq"><span class="lgi">${o.id.startsWith('upstairs') ? '🏢' : o.id === 'finish' ? '💎' : o.id.startsWith('upstyle') ? '🧱' : '🚽'}</span><div><b>${this.esc(o.name)}</b><small>${this.esc(o.description)}</small></div><button class="lgbtn" ${this.busy ? 'disabled' : ''} onclick="HOMES.renovate('${this.esc(p.id)}','${this.esc(o.id)}')">${this.money(o.cost)}</button></div>`).join('')).join('') + packs;
  },
  async pack(id, packId, floor) {
    if (this.busy) return; const p = ((this.data && this.data.properties) || []).find(x => x.id === id), k = p && (p.packs || []).find(x => x.id === packId && x.floor === floor); if (!k) return;
    if (!confirm(`${k.name}${k.any && p.upstairs ? (floor === 1 ? ' (upstairs)' : ' (downstairs)') : ''}\n\n${k.count} items for ${this.money(k.cost)}. They are placed for you where they fit.`)) return;
    this.busy = true; this.draw();
    try {
      const r = await NET.api('/api/ac/properties/' + encodeURIComponent(id) + '/pack', { method: 'POST', body: { pack: packId, floor } });
      applyAC(r.ac); this.data.properties = (this.data.properties || []).map(x => x.id === id ? r.property : x); this.data.cash = r.ac.cash;
      if (S.activePropertyId === id && window.ROOM3D) ROOM3D.sync();
      toast('🛋️ ' + k.name + ': ' + r.placed + ' items placed' + (r.skipped && r.skipped.length ? ' (' + r.skipped.length + ' did not fit)' : ''))
    } catch (e) { toast(e.message || 'Could not furnish.') }
    finally { this.busy = false; this.draw(); try { if (SHEET.isOpen('reno')) SHEET.paint() } catch (e) {} }
  },
  async renovate(id, optId) {
    if (this.busy) return; const p = ((this.data && this.data.properties) || []).find(x => x.id === id), o = p && (p.renovations || []).find(x => x.id === optId); if (!o) return;
    if (!confirm(`${o.name}\n\n${o.description}\n\nThe builders start now and tell you when they finish. You pay ${this.money(o.cost)} then.`)) return;
    this.busy = true; this.draw();
    try {
      const r = await NET.api('/api/ac/properties/' + encodeURIComponent(id) + '/renovate', { method: 'POST', body: { id: o.id } });
      this.data.builds = r.builds || []; toast('🏗️ The builders are on it: about ' + this.fmtLeft(r.minutes * 60000) + '. We will tell you when they finish.')
      try { if (SHEET.isOpen('reno')) SHEET.close() } catch (e) {}
    } catch (e) { toast(e.message || 'Could not start the renovation.') }
    finally { this.busy = false; this.draw() }
  },
  expandButton(p) {
    if (!p || p.tenure !== 'owned' || !(p.expansions || []).length) return '';
    return `<button class="secondary" ${this.busy ? 'disabled' : ''} onclick="HOMES.pickSize('${this.esc(p.id)}')">Add bedrooms</button>`;
  },
  /* the size picker: every bigger size is one tap, with its total price */
  pickSize(id) {
    const p = ((this.data && this.data.properties) || []).find(x => x.id === id);
    if (!p || !(p.expansions || []).length) return;
    this.sizeFor = id; this.sizeMsg = '';
    this.drawSizes();
  },
  drawSizes() {
    const target = document.getElementById('homesList'), p = ((this.data && this.data.properties) || []).find(x => x.id === this.sizeFor);
    if (!target || !p) return this.draw();
    const cash = Number(this.data && this.data.cash) || 0, opts = (p.expansions || []).map(o => {
      const poor = cash < o.cost;
      return `<button class="size-opt${poor ? ' poor' : ''}" ${this.busy ? 'disabled' : ''} onclick="HOMES.expand('${this.esc(p.id)}',${o.total})"><span class="size-n">${o.total}</span><span class="size-t"><b>${this.esc(o.label)}</b><small>${o.total - (p.totalBedrooms || 0) === 1 ? '1 new bedroom' : (o.total - (p.totalBedrooms || 0)) + ' new bedrooms'}</small></span><span class="size-c">${this.money(o.cost)}${poor ? '<small>Not enough yet</small>' : ''}</span></button>`;
    }).join('');
    target.innerHTML = `<div class="size-sheet"><div class="size-head"><b>${this.esc(p.name)}</b><p>Now: ${this.esc(p.sizeLabel || 'Studio')}. Pick a new size. Each bedroom is a walled room with a doorway, and your furniture stays exactly where it is.</p></div>${this.sizeMsg ? `<div class="home-error" role="alert"><span class="home-error-ic"><i class="fa-solid fa-triangle-exclamation"></i></span><div><b>Couldn't expand</b><p>${this.esc(this.sizeMsg)}</p></div></div>` : ''}<div class="size-list">${opts}</div><button class="size-back" onclick="HOMES.sizeFor='';HOMES.draw()">‹ Back to homes</button></div>`;
  },
  async expand(id, total) {
    if (this.busy) return;
    const p = ((this.data && this.data.properties) || []).find(x => x.id === id), o = p && (p.expansions || []).find(x => x.total === total);
    if (!o) return;
    if (!confirm(`Expand to a ${o.label} for ${this.money(o.cost)}?`)) return;
    this.busy = true; this.sizeMsg = ''; this.drawSizes();
    try {
      const r = await NET.api('/api/ac/properties/' + encodeURIComponent(id) + '/expand', { method: 'POST', body: { bedrooms: total } });
      if (r && r.building) { this.data.builds = r.builds || []; this.draw(); toast('🏗️ The builders are on it: about ' + this.fmtLeft(r.minutes * 60000) + '. We will tell you when they finish.'); this.busy = false; this.draw(); return }
      if (!r || !r.ac || !r.property) throw new Error('The server did not confirm the expansion. Open Homes again to check your home before trying again.');
      applyAC(r.ac);
      this.data.properties = (this.data.properties || []).map(x => x.id === id ? r.property : x);
      this.data.cash = r.ac.cash;
      this.sizeFor = '';
      if (S.activePropertyId === id && window.ROOM3D) ROOM3D.sync();      // you are standing in it: show the new bedrooms now
      if (window.BUY && BUY.active) BUY.draw();
      this.busy = false; this.draw();
      toast(`${o.label} ready ✓ Enter the new bedrooms through the doorways`);
    } catch (e) {
      this.sizeMsg = e.status === 402 ? 'You do not have enough money for that size.' : e.status === 401 ? 'Your session has expired. Please sign in again.' : (e.message || 'The expansion could not be completed. Please try again.');
      this.busy = false;
      if (document.getElementById('homesList')) this.drawSizes(); else toast(this.sizeMsg);
    }
  },
  esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  /* ---------- construction: order -> builders work (minutes to hours) -> "finished, awaiting payment" -> you pay ---------- */
  fmtLeft(ms) { const m = Math.ceil(ms / 60000); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : '') : m + ' min' },
  buildsHtml() {
    const B = (this.data && this.data.builds) || []; if (!B.length) return '';
    return '<div class="builds"><h4>🏗️ Construction</h4>' + B.map(b => {
      const ready = Date.now() >= b.readyAt - (this.off || 0), left = Math.max(0, b.readyAt - Date.now() + (this.off || 0)), pct = ready ? 100 : Math.max(2, Math.min(99, Math.round((Date.now() - (this.off || 0) - b.startedAt) / Math.max(1, b.readyAt - b.startedAt) * 100)));
      return `<div class="build ${ready ? 'ready' : ''}" data-b="${this.esc(b.id)}" data-r="${b.readyAt}"><div class="bh"><b>${this.esc(b.name)}</b><span>${ready ? '✅ Finished, awaiting payment' : '🔨 Building · ' + this.fmtLeft(left) + ' left'}</span></div><div class="bbar"><u style="width:${pct}%"></u></div>
        <div class="bf">${ready ? `<button class="lgbtn" ${this.busy ? 'disabled' : ''} onclick="HOMES.payBuild('${this.esc(b.id)}')">Pay ${this.money(b.cost)}</button>` : `<small>${this.money(b.cost)} due when the builders finish</small>`}<button class="lgbtn ghost" onclick="HOMES.cancelBuild('${this.esc(b.id)}')">Cancel</button></div></div>`
    }).join('') + '</div>'
  },
  /* the server decides when a project is done; this only ticks the countdown once a second while Homes is open */
  tickBuilds() {
    if (!this.data || !(this.data.builds || []).length) return; const t = document.getElementById('homesList'); if (!t) return;
    const was = (this.data.builds || []).map(b => Date.now() - (this.off || 0) >= b.readyAt);
    if (this._ready && this._ready.join() !== was.join()) { this._ready = was; this.draw(); return }
    this._ready = was; t.querySelectorAll('.build:not(.ready)').forEach(el => {
      const b = (this.data.builds || []).find(x => x.id === el.dataset.b); if (!b) return;
      const left = Math.max(0, b.readyAt - Date.now() + (this.off || 0)), pct = Math.max(2, Math.min(99, Math.round((Date.now() - (this.off || 0) - b.startedAt) / Math.max(1, b.readyAt - b.startedAt) * 100)));
      el.querySelector('.bh span').textContent = '🔨 Building · ' + this.fmtLeft(left) + ' left'; el.querySelector('.bbar u').style.width = pct + '%'
    })
  },
  async payBuild(id) {
    if (this.busy) return; this.busy = true; this.draw();
    try {
      const r = await NET.api('/api/ac/properties/builds/' + encodeURIComponent(id) + '/pay', { method: 'POST' });
      applyAC(r.ac); const P = this.data.properties || []; this.data.properties = P.some(x => x.id === r.property.id) ? P.map(x => x.id === r.property.id ? r.property : x) : [...P, r.property];
      this.data.builds = r.builds || []; this.data.cash = r.ac.cash;
      if (S.activePropertyId === r.property.id && window.ROOM3D) ROOM3D.sync();
      toast('🏠 ' + (r.name || 'Your project') + ' is ready!')
    } catch (e) { toast(e.message || 'Could not pay.'); await this.load() }
    finally { this.busy = false; this.draw(); try { if (SHEET.isOpen('reno')) SHEET.paint() } catch (e) {} }
  },
  async cancelBuild(id) {
    if (!confirm('Cancel this project? You have not paid anything yet.')) return;
    try { const r = await NET.api('/api/ac/properties/builds/' + encodeURIComponent(id) + '/cancel', { method: 'POST' }); this.data.builds = r.builds || []; this.draw(); toast('Project cancelled') } catch (e) { toast(e.message) }
  },
  async acquire(type) {
    if (this.busy) return;
    this.busy = true; this.errorMessage = ''; this.draw();
    try {
      const r = await NET.api('/api/ac/properties/acquire', { method: 'POST', body: { type } });
      if (!r || !r.ac || !r.property) throw new Error('The server did not confirm the home purchase. Your balance has not been changed on this screen. Refresh and check your homes before trying again.');
      applyAC(r.ac);
      this.data.properties = [...(this.data.properties || []).filter(x => x.id !== r.property.id), r.property];
      this.data.cash = r.ac.cash;
      this.draw();
      toast((r.property.tenure === 'rent' ? 'Rented ' : 'Bought ') + r.property.name + ' ✓');
    } catch (e) {
      // Preserve the sheet and show the actual API message instead of silently failing.
      this.errorMessage = this.oldServer ? 'The game server is still on an older version, so this home action cannot work yet. Redeploy the backend and try again.' : e.status === 402 ? 'You do not have enough money for this home.' : e.status === 409 ? (e.message || 'You already have this home or it could not be acquired. Refresh and try again.') : e.status === 401 ? 'Your session has expired. Please sign in again.' : (e.message || 'The purchase could not be completed. Please try again.');
      if (!document.getElementById('homesList')) toast(this.errorMessage);
    } finally { this.busy = false; this.draw(); }
  },
  /* opts.silent: true when the router is restoring the last-entered home after a refresh/back-forward — skips the
     toast and sheet-close (nothing is open to close yet) so it doesn't look like a fresh user action. */
  enter(id, opts) {
    opts = opts || {};
    S.activePropertyId = id || '';
    const p = (S.properties || []).find(x => x.id === S.activePropertyId);
    S.activeProperty = p || null;
    S.items = p ? p.items : (S.legacyItems || []);
    S.grid = homeGrid(p); S.layout = homeLayout(p);
    this.sizeFor = '';
    setPaint(p ? (p.paint || S.legacyPaint) : S.legacyPaint);
    if (window.ROOM3D) ROOM3D.sync();
    if (window.BUY && BUY.active) BUY.draw();
    if (window.ROUTER && ROUTER.onHome) ROUTER.onHome(S.activePropertyId);   // remember this across refresh
    try { localStorage.setItem('ac:home', S.activePropertyId) } catch (e) {}
    if (!opts.silent) NET.api('/api/ac/properties/active', { method: 'POST', body: { id: S.activePropertyId } }).catch(() => {});   // and on the server, so it follows the player to any phone
    if (opts.silent) return;
    this.close();
    const nm = p && (p.name || (((this.data && this.data.catalogue) || []).find(c => c.id === p.type) || {}).name || 'your home');
    toast(p ? ('Entered ' + nm) : 'Back to your starter room');
  }
};
window.HOMES = HOMES;
