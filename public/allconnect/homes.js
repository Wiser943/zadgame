// Homes selector. Uses the shared AllConnect SHEET modal and server-authoritative wallet.
const HOMES = {
  data: null,
  busy: false,
  errorMessage: '',
  async open() {
    SHEET.open({
      id: 'homes', title: '🏠 Homes & Furnishing', wide: true,
      body: () => '<p class="home-intro">Keep your starter room, or get another place to make your own.</p><div id="homesList" class="homes-list"><p class="empty">Loading homes…</p></div>'
    });
    await this.load();
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
      this.data = await NET.api('/api/ac/properties');
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
    const own = d.properties || [], active = S.activePropertyId, rows = [];
    if (this.errorMessage) rows.push(`<div class="home-error" role="alert"><b>Home transaction failed</b><p>${this.esc(this.errorMessage)}</p><button onclick="HOMES.load()">Refresh homes</button></div>`);
    rows.push(`<div class="home-card"><div class="home-emoji">🛏️</div><div class="home-copy"><b>Starter Room</b><p>Your original AllConnect room and furniture are preserved.</p><small>Always available · Existing furniture</small></div><div class="home-actions"><button class="${!active ? 'secondary' : ''}" onclick="HOMES.enter('')">${!active ? 'Current home' : 'Enter'}</button></div></div>`);
    for (const h of d.catalogue || []) {
      const p = own.find(x => x.type === h.id && !(x.tenure === 'rent' && x.leaseExpiresAt && new Date(x.leaseExpiresAt) <= new Date()));
      const activeP = p && p.id === active, expired = p && p.tenure === 'rent' && p.leaseExpiresAt && new Date(p.leaseExpiresAt) <= new Date();
      const price = h.mode === 'rent' ? h.rent : h.price;
      const term = h.mode === 'rent' ? `Rent · ${h.rentDays} days` : 'Permanent ownership';
      rows.push(`<div class="home-card"><div class="home-emoji">🏡</div><div class="home-copy"><b>${this.esc(h.name)}</b><p>${this.esc(h.description)}</p><small>${term} · ${this.money(price)}</small>${p && !expired ? `<p>Owned/rented · ${(p.items || []).length} furniture item${(p.items || []).length === 1 ? '' : 's'}</p>` : ''}${p && !expired && p.tenure === 'owned' ? this.layoutLine(p, h) : ''}</div><div class="home-actions">${p && !expired ? `<button onclick="HOMES.enter('${this.esc(p.id)}')">${activeP ? 'Current home' : 'Enter home'}</button>${this.expandButton(p, h)}` : `<button ${this.busy ? 'disabled' : ''} onclick="HOMES.acquire('${this.esc(h.id)}')">${h.mode === 'rent' ? 'Rent' : 'Buy'}</button>`}</div></div>`);
    }
    target.innerHTML = rows.join('');
  },
  /* expansions: the server owns the prices; this only mirrors them for display */
  next(p, h) {
    const lv = Math.max(0, Number(p && p.level) | 0), ex = (this.data && this.data.expansions) || [], n = ex[lv + 1];
    if (!n || !h || h.mode !== 'buy' || h.layout || !p || p.tenure !== 'owned') return null;
    return { level: n.level, name: n.name, grid: n.grid, description: n.description, cost: Math.max(1000, Math.round((h.price * n.share) / 1000) * 1000) };
  },
  layoutLine(p, h) {
    if (h && h.layout) return `<p>Layout · ${this.esc(h.layoutNote || 'Fixed floor plan')}</p>`;
    const g = homeGrid(p), n = this.next(p, h);
    return `<p>Layout · ${g}×${g} cells${(Number(p.level) | 0) ? ' (expanded)' : ''}${n ? ` · next: ${this.esc(n.name)} (${n.grid}×${n.grid})` : (h.mode === 'buy' ? ' · fully expanded' : '')}</p>`;
  },
  expandButton(p, h) {
    const n = this.next(p, h); if (!n) return '';
    return `<button class="secondary" ${this.busy ? 'disabled' : ''} onclick="HOMES.expand('${this.esc(p.id)}')">Expand · ${this.money(n.cost)}</button>`;
  },
  async expand(id) {
    if (this.busy) return;
    const p = ((this.data && this.data.properties) || []).find(x => x.id === id), h = ((this.data && this.data.catalogue) || []).find(x => p && x.id === p.type), n = this.next(p, h);
    if (!n) return;
    if (!confirm(`${n.name}: ${n.description}\n\nThis costs ${this.money(n.cost)}. Continue?`)) return;
    this.busy = true; this.errorMessage = ''; this.draw();
    try {
      const r = await NET.api('/api/ac/properties/' + encodeURIComponent(id) + '/expand', { method: 'POST' });
      if (!r || !r.ac || !r.property) throw new Error('The server did not confirm the expansion. Refresh and check your homes before trying again.');
      applyAC(r.ac);
      this.data.properties = (r.ac.properties || []);
      this.data.cash = r.ac.cash;
      toast(`${n.name} added ✓ Your home is now ${n.grid}×${n.grid}`);
    } catch (e) {
      this.errorMessage = e.status === 402 ? 'You do not have enough money for this expansion.' : e.status === 401 ? 'Your session has expired. Please sign in again.' : (e.message || 'The expansion could not be completed. Please try again.');
    } finally { this.busy = false; this.draw(); }
  },
  esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  async acquire(type) {
    if (this.busy) return;
    this.busy = true; this.errorMessage = ''; this.draw();
    try {
      const r = await NET.api('/api/ac/properties/acquire', { method: 'POST', body: { type } });
      if (!r || !r.ac || !r.property) throw new Error('The server did not confirm the home purchase. Your balance has not been changed on this screen. Refresh and check your homes before trying again.');
      applyAC(r.ac);
      this.data.properties = r.ac.properties || [];
      this.data.cash = r.ac.cash;
      this.draw();
      toast((r.property.tenure === 'rent' ? 'Rented ' : 'Bought ') + r.property.name + ' ✓');
    } catch (e) {
      // Preserve the sheet and show the actual API message instead of silently failing.
      this.errorMessage = e.status === 402 ? 'You do not have enough money for this home.' : e.status === 409 ? (e.message || 'You already have this home or it could not be acquired. Refresh and try again.') : e.status === 401 ? 'Your session has expired. Please sign in again.' : (e.message || 'The purchase could not be completed. Please try again.');
      if (!document.getElementById('homesList')) toast(this.errorMessage);
    } finally { this.busy = false; this.draw(); }
  },
  enter(id) {
    S.activePropertyId = id || '';
    const p = (S.properties || []).find(x => x.id === S.activePropertyId);
    S.activeProperty = p || null;
    S.items = p ? p.items : (S.legacyItems || []);
    S.grid = homeGrid(p); S.layout = homeLayout(p);
    setPaint(p ? (p.paint || S.legacyPaint) : S.legacyPaint);
    if (window.ROOM3D) ROOM3D.sync();
    if (window.BUY && BUY.active) BUY.draw();
    this.close();
    toast(p ? ('Entered ' + p.name) : 'Back to your starter room');
  }
};
window.HOMES = HOMES;
