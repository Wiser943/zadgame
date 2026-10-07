/* Ads app (Phone -> Ads): book a billboard or rent sea plots. Everyone sees live ads on the Map; tapping one opens its link.
   Prices, slots and expiry are enforced by the server (routes/acads.js, utils/acads.js). */
const ADS = {
  mine: [], board: null, cfg: null, pick: [], img: '', photos: null,
  naira: n => '₦' + Number(n).toLocaleString('en-NG'),
  left(t) { const s = Math.max(0, (new Date(t) - Date.now()) / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600); return d ? d + 'd ' + h + 'h left' : h ? h + 'h left' : Math.max(1, Math.floor(s / 60)) + 'm left' },
  async open() {
    PH.view = 'ads';
    PH.shell('My Ads', 'PH.close()', '<div class="abody" id="ab"><p class="empty">Loading…</p></div>');
    if (this.cfg) this.draw();
    await this.load(); if (PH.view === 'ads') this.draw()
  },
  async load() { try { const r = await NET.api('/api/ac/ads/mine'); this.mine = r.ads; this.cfg = r.config } catch (e) { toast(e.message) } },
  draw() {
    const ab = document.getElementById('ab'); if (!ab || !this.cfg) return;
    const b = this.cfg.billboard, s = this.cfg.sea;
    ab.innerHTML = `<div class="adpromo"><h3>Promote your business</h3><p>Every player sees it, and tapping it opens your link.</p>
      <div class="adopts"><button onclick="ADS.sheet('billboard')"><span>📢</span><b>Book a billboard</b><small>${this.naira(b.price)} for ${b.days} days</small></button>
      <button onclick="ADS.sheet('sea')"><span>🌊</span><b>Rent a Sea Plot</b><small>${this.naira(s.price)} a plot, ${s.days} days</small></button></div></div>
      <div class="lab2">YOUR ADS</div>` +
      (this.mine.length ? this.mine.map(a => `<div class="adrow"><div class="adth">${a.image ? `<img src="${esc(a.image)}" alt="" onerror="this.remove()">` : (a.kind === 'sea' ? '🌊' : '📢')}</div>
        <div class="rt"><b>${esc(a.title)}</b><span>${a.kind === 'sea' ? 'Sea plot #' + (a.slot + 1) : 'Billboard #' + (a.slot + 1)} · ${this.left(a.expiresAt)} · ${a.clicks} tap${a.clicks === 1 ? '' : 's'}</span></div>
        <button class="pbtn blu" onclick="ADS.edit('${a.id}')">Edit</button></div>`).join('')
        : `<div class="adempty">You don't have any ads yet. Book one above and it shows up here, where you can change its picture any time.</div>`) +
      `<p class="adfoot">Business without an account? lagoslife.app/advertise</p>`
  },
  /* ----- booking ----- */
  async sheet(kind) {
    this.pick = []; this.img = '';
    if (kind === 'sea') { try { this.board = await NET.api('/api/ac/ads/board') } catch (e) { return toast(e.message) } }
    const c = this.cfg[kind === 'sea' ? 'sea' : 'billboard'];
    const taken = new Set(this.board ? this.board.plots.map(p => p.slot) : []);
    const mineSet = new Set(this.mine.filter(a => a.kind === 'sea').map(a => a.slot));
    PH.sheet(`<h3>${kind === 'sea' ? '🌊 Rent sea plots' : '📢 Book a billboard'}</h3>
      <p class="hint2">${kind === 'sea' ? `${this.naira(c.price)} per plot for ${c.days} days. Tap the free plots you want (max ${c.perUser}).` : `${this.naira(c.price)} for ${c.days} days. You get the next free billboard.`}</p>
      ${kind === 'sea' ? `<div class="plots" id="plots">${[...Array(c.plots).keys()].map(i => `<button class="${taken.has(i) ? 'tk' : ''}" ${taken.has(i) ? 'disabled' : ''} onclick="ADS.togglePlot(${i},this)">${mineSet.has(i) ? '★' : i + 1}</button>`).join('')}</div>` : ''}
      <input class="sinput" id="adt" maxlength="40" placeholder="Ad title, e.g. Mama Nkechi's Buka">
      <input class="sinput" id="adl" maxlength="300" placeholder="Link people open, https://…" inputmode="url" style="margin-top:8px">
      ${this.imgField()}
      <button class="btn p" id="adgo" onclick="ADS.book('${kind}')">${kind === 'sea' ? 'Pick plots first' : 'Book for ' + this.naira(c.price)}</button>`);
    if (kind === 'sea') this.total()
  },
  imgField() { return `<div class="adimg"><div class="adth big" id="adpv">${this.img ? `<img src="${esc(this.img)}" alt="">` : '🖼️'}</div><div class="adimgb"><button class="pbtn blu" onclick="ADS.gallery()">Pick from my gallery</button><input class="sinput" id="adi" maxlength="400" placeholder="or paste an image link https://…" value="${esc(this.img)}" oninput="ADS.img=this.value.trim();ADS.prev()" inputmode="url"></div></div>` },
  prev() { const e = document.getElementById('adpv'); if (e) e.innerHTML = this.img ? `<img src="${esc(this.img)}" alt="" onerror="this.remove()">` : '🖼️' },
  togglePlot(i, el) {
    const k = this.pick.indexOf(i), max = this.cfg.sea.perUser - this.mine.filter(a => a.kind === 'sea').length;
    if (k >= 0) this.pick.splice(k, 1); else { if (this.pick.length >= max) return toast('You can hold ' + this.cfg.sea.perUser + ' plots at most'); this.pick.push(i) }
    el.classList.toggle('on', k < 0); this.total()
  },
  total() { const b = document.getElementById('adgo'); if (b) b.textContent = this.pick.length ? `Rent ${this.pick.length} plot${this.pick.length > 1 ? 's' : ''} for ${this.naira(this.pick.length * this.cfg.sea.price)}` : 'Pick plots first' },
  async gallery() {
    try {
      if (!this.photos) this.photos = (await NET.api('/api/ac/photos')).photos;
      if (!this.photos.length) return toast('Your gallery is empty. Take a photo in Camera, or paste an image link.');
      const keep = ['adt', 'adl'].map(i => (document.getElementById(i) || {}).value || '');
      const card = document.querySelector('.asheet .shcard'), old = card.innerHTML;
      card.innerHTML = `<h3>Pick a picture</h3><div class="plots pics">${this.photos.slice(0, 30).map((p, i) => `<button onclick="ADS.setImg(${i})"><img src="${esc(p.thumb)}" alt=""></button>`).join('')}</div><button class="fopt" onclick="ADS.backSheet()"><span>Cancel</span></button>`;
      this._old = { old, keep }
    } catch (e) { toast(e.message) }
  },
  backSheet() { const card = document.querySelector('.asheet .shcard'); if (!card || !this._old) return; card.innerHTML = this._old.old; ['adt', 'adl'].forEach((id, i) => { const e = document.getElementById(id); if (e) e.value = this._old.keep[i] }); const ii = document.getElementById('adi'); if (ii) ii.value = this.img; this.prev();
    document.querySelectorAll('#plots button').forEach((b, i) => b.classList.toggle('on', this.pick.includes(i))) },
  setImg(i) { this.img = this.photos[i].url; this.backSheet(); const ii = document.getElementById('adi'); if (ii) ii.value = this.img; this.prev() },
  body(extra) { return { title: (document.getElementById('adt') || {}).value, link: (document.getElementById('adl') || {}).value, image: this.img, ...extra } },
  async book(kind) {
    const btn = document.getElementById('adgo'); if (btn.disabled) return;
    if (kind === 'sea' && !this.pick.length) return toast('Tap at least one free plot');
    btn.disabled = true;
    try {
      const r = await NET.api('/api/ac/ads/book', { method: 'POST', body: this.body({ kind, plots: this.pick }) });
      S.cash = r.cash; render(); PH.closeSheet(); NET.drop('/api/ac/ads');
      toast(r.skipped ? `Booked ${r.ads.length}, ${r.skipped} was just taken (not charged)` : 'Ad is live 📢');
      PH.local_('📢', `Your ${kind === 'sea' ? 'sea plot ad' : 'billboard'} "${r.ads[0].title}" is live for ${this.cfg[kind === 'sea' ? 'sea' : 'billboard'].days} days`, 'good');
      await this.load(); if (PH.view === 'ads') this.draw()
    } catch (e) { btn.disabled = false; toast(e.message) }
  },
  /* ----- change an existing ad (title, link, picture) ----- */
  edit(id) {
    const a = this.mine.find(x => x.id === id); if (!a) return; this.img = a.image || '';
    PH.sheet(`<h3>Edit ad</h3><p class="hint2">Change the picture or link any time. It updates for every player straight away.</p>
      <input class="sinput" id="adt" maxlength="40" value="${esc(a.title)}"><input class="sinput" id="adl" maxlength="300" value="${esc(a.link)}" inputmode="url" style="margin-top:8px">
      ${this.imgField()}<button class="btn p" id="adgo" onclick="ADS.save('${id}')">Save changes</button>`)
  },
  async save(id) {
    const btn = document.getElementById('adgo'); btn.disabled = true;
    try { await NET.api(`/api/ac/ads/${id}/update`, { method: 'POST', body: this.body() }); PH.closeSheet(); NET.drop('/api/ac/ads'); toast('Ad updated ✓'); await this.load(); if (PH.view === 'ads') this.draw() }
    catch (e) { btn.disabled = false; toast(e.message) }
  },
  /* ----- what every player sees on the Map ----- */
  go(ad) { if (!ad || !ad.link) return; window.open(ad.link, '_blank', 'noopener'); fetch(`/api/ac/ads/${ad.id}/click`, { method: 'POST', credentials: 'same-origin' }).catch(() => {}) },
  async paintMap() {
    const map = document.getElementById('map'); if (!map) return;
    let layer = document.getElementById('adlayer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'adlayer'; map.appendChild(layer) }
    try { this.board = await NET.api('/api/ac/ads/board') } catch (e) { return }
    const b = this.board, plots = new Map(b.plots.map(p => [p.slot, p]));
    this.live = b.billboards; this.cur = 0;
    layer.innerHTML = `<div class="seaplots">${[...Array(b.config.sea.plots).keys()].map(i => { const p = plots.get(i); return p ? `<button class="sp on" title="${esc(p.title)}" onclick="ADS.goPlot(${i})">${p.image ? `<img src="${esc(p.image)}" alt="" onerror="this.remove()">` : '🌊'}</button>` : '<span class="sp"></span>' }).join('')}</div>
      <div class="bbstrip" id="bbstrip"></div>`;
    this.showBB(); clearInterval(this.bbT); this.bbT = setInterval(() => { if (!document.getElementById('bbstrip') || S.page !== 'map') return clearInterval(this.bbT); this.cur++; this.showBB() }, 5000)
  },
  goPlot(i) { this.go(this.board.plots.find(p => p.slot === i)) },
  showBB() {
    const el = document.getElementById('bbstrip'); if (!el) return;
    if (!this.live.length) { el.innerHTML = `<div class="bbcard empty" onclick="nav('phone');setTimeout(()=>PH.open('ads'),0)"><span>📢</span><div><b>Your ad could be here</b><small>Phone → Ads</small></div></div>`; return }
    const a = this.live[this.cur % this.live.length];
    el.innerHTML = `<div class="bbcard" onclick="ADS.go(ADS.live[${this.cur % this.live.length}])"><div class="adth">${a.image ? `<img src="${esc(a.image)}" alt="" onerror="this.remove()">` : '📢'}</div><div><b>${esc(a.title)}</b><small>Sponsored · tap to open</small></div></div>`
  }
};
window.ADS = ADS;
