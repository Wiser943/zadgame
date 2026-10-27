// Homes selector. Uses the shared AllConnect SHEET modal and server-authoritative wallet.
const HOMES = {
  data: null,
  busy: false,
  sizeFor: '',
  sizeMsg: '',
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
    if (this.sizeFor) return this.drawSizes();
    const own = d.properties || [], active = S.activePropertyId, rows = [];
    if (this.errorMessage) rows.push(`<div class="home-error" role="alert"><span class="home-error-ic"><i class="fa-solid fa-triangle-exclamation"></i></span><div><b>Couldn't complete that</b><p>${this.esc(this.errorMessage)}</p></div><button onclick="HOMES.load()">Try again</button></div>`);
    rows.push(`<div class="home-card"><div class="home-emoji">🛏️</div><div class="home-copy"><b>Starter Room</b><p>Your original AllConnect room and furniture are preserved.</p><small>Always available · Existing furniture</small></div><div class="home-actions"><button class="${!active ? 'secondary' : ''}" onclick="HOMES.enter('')">${!active ? 'Current home' : 'Enter'}</button></div></div>`);
    for (const h of d.catalogue || []) {
      const p = own.find(x => x.type === h.id && !(x.tenure === 'rent' && x.leaseExpiresAt && new Date(x.leaseExpiresAt) <= new Date()));
      const activeP = p && p.id === active, expired = p && p.tenure === 'rent' && p.leaseExpiresAt && new Date(p.leaseExpiresAt) <= new Date();
      const price = h.mode === 'rent' ? h.rent : h.price;
      const term = h.mode === 'rent' ? `Rent · ${h.rentDays} days` : 'Permanent ownership';
      rows.push(`<div class="home-card"><div class="home-emoji">🏡</div><div class="home-copy"><b>${this.esc(h.name)}</b><p>${this.esc(h.description)}</p><small>${term} · ${this.money(price)}</small>${p && !expired ? `<p>Owned/rented · ${(p.items || []).length} furniture item${(p.items || []).length === 1 ? '' : 's'}</p>` : ''}${p && !expired && p.tenure === 'owned' ? this.sizeLine(p, h) : ''}</div><div class="home-actions">${p && !expired ? `<button onclick="HOMES.enter('${this.esc(p.id)}')">${activeP ? 'Current home' : 'Enter home'}</button>${this.expandButton(p, h)}` : `<button ${this.busy ? 'disabled' : ''} onclick="HOMES.acquire('${this.esc(h.id)}')">${h.mode === 'rent' ? 'Rent' : 'Buy'}</button>`}</div></div>`);
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
    this.sizeFor = '';
    setPaint(p ? (p.paint || S.legacyPaint) : S.legacyPaint);
    if (window.ROOM3D) ROOM3D.sync();
    if (window.BUY && BUY.active) BUY.draw();
    this.close();
    toast(p ? ('Entered ' + p.name) : 'Back to your starter room');
  }
};
window.HOMES = HOMES;
