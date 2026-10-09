/* Ads app (Phone -> Ads): book a billboard or rent sea plots. Everyone sees live ads on the Map; tapping one opens its link.
   Prices, slots and expiry are enforced by the server (routes/acads.js, utils/acads.js). */
const ADS = {
  mine: [], board: null, cfg: null, pick: [], img: '', emoji: '', photos: null, apps: [],
  abs: u => (u && u.startsWith('/') ? location.origin + u : u),
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
    const b = this.cfg.billboard, s = this.cfg.sea, ap = this.cfg.app;
    ab.innerHTML = `<div class="adpromo"><h3>Promote your business</h3><p>Every player sees it, and tapping it opens your link.</p>
      <div class="adopts"><button onclick="ADS.sheet('billboard')"><span>📢</span><b>Book a billboard</b><small>${this.naira(b.price)} for ${b.days} days</small></button>
      <button onclick="ADS.sheet('sea')"><span>🌊</span><b>Rent a Sea Plot</b><small>${this.naira(s.price)} a plot, ${s.days} days</small></button>
      <button class="wide" onclick="ADS.sheet('app')"><span>📱</span><b>Create your own app</b><small>${this.naira(ap.price)} for ${ap.days === 1 ? '1 day' : ap.days + ' days'} · your logo on every phone, your website inside it</small></button></div></div>
      <div class="lab2">YOUR ADS</div>` +
      (this.mine.length ? this.mine.map(a => `<div class="adrow"><div class="adth">${a.image ? `<img src="${esc(a.image)}" alt="" onerror="this.remove()">` : (a.kind === 'app' ? esc(a.emoji || '📱') : a.kind === 'sea' ? '🌊' : '📢')}</div>
        <div class="rt"><b>${esc(a.title)}</b><span>${a.kind === 'app' ? 'Phone app' : a.kind === 'sea' ? 'Sea plot #' + (a.slot + 1) : 'Billboard #' + (a.slot + 1)} · ${this.left(a.expiresAt)} · ${a.clicks} ${a.kind === 'app' ? 'open' : 'tap'}${a.clicks === 1 ? '' : 's'}</span></div>
        <button class="pbtn blu" onclick="ADS.edit('${a.id}')">Edit</button></div>`).join('')
        : `<div class="adempty">You don't have any ads yet. Book one above and it shows up here, where you can change its picture any time.</div>`) +
      `<p class="adfoot">Business without an account? <a class="adlink" href="${esc(location.protocol + '//' + location.host)}/advertise" target="_blank" rel="noopener">${esc(location.host)}/advertise</a></p>`
  },
  /* ----- booking ----- */
  async sheet(kind) {
    this.pick = []; this.img = ''; this.emoji = '';
    if (kind === 'app') return this.appSheet();
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
  prev() { const e = document.getElementById('adpv'); if (e) e.innerHTML = this.logoPv() },
  logoPv() { return this.img ? `<img src="${esc(this.img)}" alt="" onerror="this.remove()">` : (this.emoji ? esc(this.emoji) : '🖼️') },
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
  backSheet() { const card = document.querySelector('.asheet .shcard'); if (!card || !this._old) return; card.innerHTML = this._old.old; ['adt', 'adl'].forEach((id, i) => { const e = document.getElementById(id); if (e) e.value = this._old.keep[i] }); const ii = document.getElementById('adi'); if (ii) ii.value = this.img; const em = document.getElementById('adem'); if (em) em.value = this.emoji; this.prev();
    document.querySelectorAll('#plots button').forEach((b, i) => b.classList.toggle('on', this.pick.includes(i))) },
  setImg(i) { this.img = this.abs(this.photos[i].url); this.emoji = ''; this.backSheet(); const ii = document.getElementById('adi'); if (ii) ii.value = this.img; this.prev() },
  body(extra) { return { title: (document.getElementById('adt') || {}).value, link: (document.getElementById('adl') || {}).value, image: this.img, emoji: this.emoji, ...extra } },
  async book(kind) {
    const btn = document.getElementById('adgo'); if (btn.disabled) return;
    if (kind === 'sea' && !this.pick.length) return toast('Tap at least one free plot');
    btn.disabled = true;
    try {
      const r = await NET.api('/api/ac/ads/book', { method: 'POST', body: this.body({ kind, plots: this.pick }) });
      S.cash = r.cash; render(); PH.closeSheet(); NET.drop('/api/ac/ads');
      const cf = this.cfg[kind], span = cf.days === 1 ? '1 day' : cf.days + ' days';
      toast(r.skipped ? `Booked ${r.ads.length}, ${r.skipped} was just taken (not charged)` : kind === 'app' ? 'Your app is live 📱' : 'Ad is live 📢');
      PH.local_(kind === 'app' ? '📱' : '📢', `Your ${kind === 'sea' ? 'sea plot ad' : kind === 'app' ? 'app' : 'billboard'} "${r.ads[0].title}" is live for ${span}`, 'good');
      if (kind === 'app') this.loadApps();
      await this.load(); if (PH.view === 'ads') this.draw()
    } catch (e) { btn.disabled = false; toast(e.message) }
  },
  /* ----- change an existing ad (title, link, picture) ----- */
  edit(id) {
    const a = this.mine.find(x => x.id === id); if (!a) return; this.img = a.image || ''; this.emoji = a.emoji || '';
    PH.sheet(`<h3>${a.kind === 'app' ? 'Edit app' : 'Edit ad'}</h3><p class="hint2">Change the ${a.kind === 'app' ? 'logo' : 'picture'} or link any time. It updates for every player straight away.</p>
      <input class="sinput" id="adt" maxlength="${a.kind === 'app' ? 16 : 40}" value="${esc(a.title)}"><input class="sinput" id="adl" maxlength="300" value="${esc(a.link)}" inputmode="url" style="margin-top:8px">
      ${a.kind === 'app' ? this.logoField() : this.imgField()}<button class="btn p" id="adgo" onclick="ADS.save('${id}')">Save changes</button>`)
  },
  async save(id) {
    const btn = document.getElementById('adgo'); btn.disabled = true;
    try { await NET.api(`/api/ac/ads/${id}/update`, { method: 'POST', body: this.body() }); PH.closeSheet(); NET.drop('/api/ac/ads'); toast('Ad updated ✓'); this.loadApps(); await this.load(); if (PH.view === 'ads') this.draw() }
    catch (e) { btn.disabled = false; toast(e.message) }
  },
  /* ----- phone apps: create one, and open one ----- */
  appSheet() {
    const c = this.cfg.app, span = c.days === 1 ? '1 day' : c.days + ' days';
    PH.sheet(`<h3>📱 Create your app</h3><p class="hint2">${this.naira(c.price)} for ${span}. It shows on every player's phone with your name and logo, and opens your website inside it.</p>
      <input class="sinput" id="adt" maxlength="16" placeholder="Platform name, e.g. Quilox">
      <input class="sinput" id="adl" maxlength="300" placeholder="Your website link, https://…" inputmode="url" style="margin-top:8px">
      <div class="lab2">LOGO</div>${this.logoField()}
      <button class="btn p" id="adgo" onclick="ADS.book('app')">Create app for ${this.naira(c.price)}</button>
      <p class="hint2" style="margin-top:8px">Your site has to allow being shown inside other apps. Players also get an Open in browser button.</p>`)
  },
  logoField() {
    const em = ['🍔', '🛍️', '🎵', '🎮', '💼', '🏦', '📚', '🏠', '⚽', '🚗', '💄', '🍕', '📱', '💡', '🎓', '🌍'];
    return `<div class="adimg"><div class="adth big" id="adpv">${this.logoPv()}</div><div class="adimgb"><div class="adbtns"><button class="pbtn blu" onclick="ADS.gallery()">Gallery</button><label class="pbtn blu pickf">Device<input type="file" accept="image/*" style="display:none" onchange="ADS.pickFile(this)"></label></div>
      <input class="sinput" id="adem" maxlength="8" placeholder="or type an emoji" value="${esc(this.emoji)}" oninput="ADS.setEmoji(this.value)"></div></div>
      <div class="emopick">${em.map(e => `<button type="button" onclick="ADS.setEmoji('${e}',1)">${e}</button>`).join('')}</div>`
  },
  setEmoji(v, fill) { this.emoji = String(v || '').trim(); if (this.emoji) this.img = ''; const i = document.getElementById('adem'); if (fill && i) i.value = this.emoji; this.prev() },
  logoData(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); const sz = 192, c = document.createElement('canvas'); c.width = c.height = sz; const x = c.getContext('2d'), r = Math.max(sz / img.width, sz / img.height), w = img.width * r, h = img.height * r; x.drawImage(img, (sz - w) / 2, (sz - h) / 2, w, h); res(c.toDataURL('image/png')) };
      img.onerror = rej; img.src = url
    })
  },
  async pickFile(inp) {
    const f = inp.files[0]; if (!f) return; if (!f.type.startsWith('image/')) return toast('Please choose an image file.');
    try {
      toast('Uploading logo…');
      const d = await this.logoData(f), r = await NET.api('/api/ac/photos', { method: 'POST', body: { image: d, w: 192, h: 192 } });
      this.img = this.abs(r.photo.url); this.emoji = ''; this.photos = null;
      const em = document.getElementById('adem'); if (em) em.value = ''; this.prev(); toast('Logo added')
    } catch (e) { toast((e && e.message) || 'Could not upload that logo') }
    inp.value = ''
  },
  async loadApps() {
    try { this.apps = (await NET.api('/api/ac/ads/apps')).apps || []; this.apps.forEach(a => { if (a.image) new Image().src = a.image }); this.syncHost() } catch (e) {}
    if (window.drawApps) drawApps()
  },
  /* ----- ad apps are loaded in the background as soon as the platform loads, so they open instantly ----- */
  sbx(link) { let s = 'allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox'; try { if (new URL(link).origin !== location.origin) s += ' allow-same-origin' } catch (e) {} return s },
  hostEl() { let h = document.getElementById('adhostbox'); if (!h) { h = document.createElement('div'); h.id = 'adhostbox'; h.className = 'adhostbox'; document.querySelector('.screen').appendChild(h) } return h },
  syncHost(forceId) {
    const h = this.hostEl();
    [...h.children].forEach(c => { const a = this.apps.find(x => x.id === c.dataset.id); if (!a || a.link !== c.dataset.link) c.remove() });
    this.apps.forEach((a, i) => {
      if ((i >= 6 && a.id !== forceId) || h.querySelector(`[data-id="${a.id}"]`)) return;
      const f = document.createElement('div'); f.className = 'adfr'; f.dataset.id = a.id; f.dataset.link = a.link;
      f.innerHTML = `<iframe class="adif" src="${esc(a.link)}" sandbox="${this.sbx(a.link)}" referrerpolicy="no-referrer" title="${esc(a.title)}"></iframe>`;
      f.querySelector('iframe').addEventListener('load', () => { f.dataset.ready = 1; if (this.curApp === a.id) { const w = document.getElementById('adwait'); if (w) w.style.display = 'none'; this.hdrAuto() } });
      h.appendChild(f)
    })
  },
  showHost(a) {
    this.syncHost(a.id); this.curApp = a.id; const h = this.hostEl(); h.classList.add('on');
    [...h.children].forEach(c => c.classList.toggle('cur', c.dataset.id === a.id));
    this.place(); const slot = document.getElementById('adslot');
    if (slot && window.ResizeObserver) { if (this.ro) this.ro.disconnect(); this.ro = new ResizeObserver(() => this.place()); this.ro.observe(slot) }
    const c = h.querySelector(`[data-id="${a.id}"]`); if (c && c.dataset.ready) { const w = document.getElementById('adwait'); if (w) w.style.display = 'none'; this.hdrAuto() }
  },
  place() {
    const h = document.getElementById('adhostbox'), slot = document.getElementById('adslot'); if (!h || !slot || !h.classList.contains('on')) return;
    const sc = document.querySelector('.screen').getBoundingClientRect(), r = slot.getBoundingClientRect();
    Object.assign(h.style, { left: (r.left - sc.left) + 'px', top: (r.top - sc.top) + 'px', width: r.width + 'px', height: r.height + 'px' })
  },
  hideHost() { const h = document.getElementById('adhostbox'); this.curApp = null; if (this.ro) this.ro.disconnect(); if (!h) return; h.classList.remove('on'); [...h.children].forEach(c => c.classList.remove('cur')); ['left', 'top', 'width', 'height'].forEach(k => h.style.removeProperty(k)) },
  /* top bar of an ad app: full bar at first, then it shrinks to two floating buttons so the site gets the whole screen */
  hdr(min) { const av = PH.$a(); if (!av) return; clearTimeout(this.ht); av.classList.toggle('hdr-min', min === undefined ? !av.classList.contains('hdr-min') : min); requestAnimationFrame(() => this.place()) },
  /* the site runs in another origin so we cannot see it scroll; instead, touching or pulling down on the top edge brings the bar back */
  rv(e) { const y0 = e.clientY, mv = ev => { if (ev.clientY - y0 > 8) { this.hdr(false); cl() } }, up = () => { this.hdr(false); cl() }, cl = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up) },
  hdrAuto() { clearTimeout(this.ht); this.ht = setTimeout(() => { if (PH.view === 'adapp') this.hdr(true) }, 2600) },
  /* an ad app: the advertiser's website runs inside the phone */
  openApp(id) {
    const a = this.apps.find(x => x.id === id); if (!a) return toast('That app is no longer running.');
    let host = a.link;
    try { host = new URL(a.link).hostname } catch (e) {}
    document.querySelector('.screen').classList.add('light'); PH.view = 'adapp';
    let hue = 0; for (const ch of host + a.title) hue = (hue * 31 + ch.charCodeAt(0)) % 360;      // every ad gets its own header tint
    const arrow = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';
    const open = `<button class="adopen" onclick="ADS.go(ADS.apps.find(x=>x.id==='${a.id}'))" aria-label="Open in browser"><span class="adot">Open<span class="adfull"> in browser</span></span>${arrow}</button>`;
    const tog = '<button class="adtog" onclick="ADS.hdr()" aria-label="Show or hide the top bar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>';
    PH.shell(`${esc(a.title)}<span class="adbadge">Ad</span><small class="adhost">Sponsored · ${esc(host)}</small>`, 'PH.close()', `<div class="adapp"><div class="adwait" id="adwait">Loading ${esc(a.title)}…<small>Blank screen? This site may not allow being shown here. Use Open in browser.</small></div>
      <div class="adslot" id="adslot"></div><div class="adreveal" id="adreveal" onpointerdown="ADS.rv(event)"></div></div>`, '', open + tog);
    const av = PH.$a(); av.classList.add('adview'); av.style.setProperty('--adh', hue);
    document.querySelector('.screen').style.setProperty('--hbg', `hsl(${hue} 80% 93%)`); this.showHost(a);
    fetch(`/api/ac/ads/${a.id}/click`, { method: 'POST', credentials: 'same-origin' }).catch(() => {})
  },
  /* ----- what every player sees on the Map ----- */
  go(ad) { if (!ad || !ad.link) return; window.open(ad.link, '_blank', 'noopener'); fetch(`/api/ac/ads/${ad.id}/click`, { method: 'POST', credentials: 'same-origin' }).catch(() => {}) },
  async paintMap() {
    const map = document.getElementById('map'); if (!map) return;
    let layer = document.getElementById('adlayer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'adlayer'; map.appendChild(layer) }
    try { this.board = await NET.api('/api/ac/ads/board') } catch (e) { return }
    const b = this.board, plots = new Map(b.plots.map(p => [p.slot, p]));
    if (window.MAP3D) MAP3D.setAds(b);   // the 3D map draws the sea plots and billboards itself
    this.live = b.billboards; this.cur = 0;
    layer.innerHTML = `<div class="seaplots" ${window.MAP3D ? 'hidden' : ''}>${[...Array(b.config.sea.plots).keys()].map(i => { const p = plots.get(i); return p ? `<button class="sp on" title="${esc(p.title)}" onclick="ADS.goPlot(${i})">${p.image ? `<img src="${esc(p.image)}" alt="" onerror="this.remove()">` : '🌊'}</button>` : '<span class="sp"></span>' }).join('')}</div>
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
