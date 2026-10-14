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
  close() { if (window.SHEET) SHEET.close(); },
  async load() {
    this.errorMessage = '';
    const list = document.getElementById('homesList');
    try {
      this.data = await NET.api('/api/ac/properties');
      if (SHEET.isOpen('homes')) this.draw();
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
      rows.push(`<div class="home-card"><div class="home-emoji">🏡</div><div class="home-copy"><b>${this.esc(h.name)}</b><p>${this.esc(h.description)}</p><small>${term} · ${this.money(price)}</small>${p && !expired ? `<p>Owned/rented · ${(p.items || []).length} furniture item${(p.items || []).length === 1 ? '' : 's'}</p>` : ''}</div><div class="home-actions">${p && !expired ? `<button onclick="HOMES.enter('${this.esc(p.id)}')">${activeP ? 'Current home' : 'Enter home'}</button>` : `<button ${this.busy ? 'disabled' : ''} onclick="HOMES.acquire('${this.esc(h.id)}')">${h.mode === 'rent' ? 'Rent' : 'Buy'}</button>`}</div></div>`);
    }
    target.innerHTML = rows.join('');
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
    setPaint(p ? (p.paint || S.legacyPaint) : S.legacyPaint);
    if (window.ROOM3D) ROOM3D.sync();
    if (window.BUY && BUY.active) BUY.draw();
    this.close();
    toast(p ? ('Entered ' + p.name) : 'Back to your starter room');
  }
};
window.HOMES = HOMES;
