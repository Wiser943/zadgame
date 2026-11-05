/* Health app: how you feel, the chemist (drugs for you AND your pet), the General Hospital and player pharmacies.
   Every price, cure and stock count is decided by the server (routes/achealth.js). This file only draws it. */
const HEALTH = {
  D: null, tab: 'me', shopData: null, who: 'me',
  naira: n => '₦' + Math.round(n).toLocaleString('en-NG'),
  hrs(ms) { const h = Math.ceil(ms / 3600000); return h <= 1 ? 'about an hour' : h < 24 ? h + ' hours' : Math.round(h / 24) + ' day' + (h >= 48 ? 's' : '') },
  async open() {
    PH.view = 'health'; PH.TINT.health = '#fff1e4'; PH.TINT.healthsub = '#e8f6ee';
    PH.shell('Health', 'PH.close()', '<div class="abody hl" id="ab"><p class="empty">Loading…</p></div>');
    await this.load()
  },
  async load() {
    try { this.D = await NET.api('/api/ac/health/state'); S.cash = this.D.cash; render(); if (this.D.billed) toast('🏥 You were admitted to hospital. Bill: ' + this.naira(this.D.billed)); if (PH.view === 'health') this.draw() }
    catch (e) { const ab = document.getElementById('ab'); if (ab) ab.innerHTML = `<p class="empty">${esc(e.message || 'Could not load Health.')}</p><button class="btn p" onclick="HEALTH.open()">Try again</button>` }
  },
  row(ic, t, s, on, bg) { return `<button type="button" class="hlrow" onclick="${on}"><span class="hlic" style="background:${bg || '#f1f3f9'}">${ic}</span><span class="hlt"><b>${t}</b><small>${s}</small></span><i>›</i></button>` },
  draw() {
    const D = this.D, ab = document.getElementById('ab'); if (!ab || !D) return; const ill = D.ill;
    const card = ill
      ? `<div class="hlcard ${ill.sev}"><div class="hle">${ill.emoji}</div><h3>${esc(ill.name)}</h3><p class="hls">${ill.sev === 'mild' ? 'Mild · treat it before it gets worse' : 'Serious · get treated now'}</p><p>${esc(ill.blurb)}</p><small>${ill.sev === 'mild' ? 'Turns serious in ' : 'Hospital admission with a big bill in '}${this.hrs(ill.msLeft)}</small></div>`
      : `<div class="hlcard ok"><div class="hle">💪</div><h3>You feel fine</h3><p class="hls">No sickness right now</p><p>Eat, sleep and stay clean. If you do fall ill, you can get drugs here.</p></div>`;
    const petBar = D.pet && D.pet.sick ? `<div class="hlpet">🐱 ${esc(D.pet.name)} is not well. Order pet drugs from the chemist.</div>` : '';
    ab.innerHTML = card + petBar +
      this.row('💊', 'Order drugs from the chemist', `For you or your pet · delivered to you · from ${this.naira(Math.min(...D.chemist.map(i => i.price)))}`, 'HEALTH.chemist()') +
      this.row('🏥', 'Go to General Hospital', `Injection cures anything · ${this.naira(D.hospital)} · open 24 hours`, 'HEALTH.hospSheet()', '#eaf6fb') +
      this.row('🛍️', 'Player pharmacies', 'Drugs, vitamins, toiletries · delivered', 'HEALTH.shops()', '#f1e9fd') +
      (D.mine ? this.row('🧾', 'My pharmacy', `${D.mine.sold} sold · earned ${this.naira(D.mine.earned)}`, 'HEALTH.manage()', '#e3f5ec') : '') +
      '<p class="hlfoot">Left untreated, mild sickness turns serious after a day, and serious sickness puts you in hospital with a big bill.</p>'
  },
  /* ----- the chemist: drugs for you or for your pet ----- */
  chemist(who) {
    if (who) this.who = who; const D = this.D, w = this.who, list = D.chemist.filter(i => i.who === w);
    PH.sheet(`<h3>Chemist 💊</h3><p class="hint2">Delivered to you. Wallet ${this.naira(D.cash)}</p>
      <div class="hlseg"><button class="${w === 'me' ? 'on' : ''}" onclick="HEALTH.chemist('me')">For me</button><button class="${w === 'pet' ? 'on' : ''}" onclick="HEALTH.chemist('pet')">For my pet${D.pet ? '' : ' 🐱'}</button></div>` +
      (w === 'pet' && !D.pet ? '<p class="hint2">You do not have a pet yet. Adopt one in the Pet app, then come back.</p>' : '') +
      list.map(i => `<button class="fopt" onclick="HEALTH.chem('${i.id}')"><span>${i.emoji} ${esc(i.name)}<small>${esc(i.note)}</small></span><b>${this.naira(i.price)}</b></button>`).join(''))
  },
  async chem(id) { try { const r = await NET.api('/api/ac/health/chemist', { method: 'POST', body: { item: id } }); PH.closeSheet(); this.got(r) } catch (e) { toast(e.message) } },
  /* apply what the server says happened: money, need bars, cure, pet */
  got(r) {
    if (r.cash != null) S.cash = r.cash; (r.needs || []).forEach(([i, d]) => { S.needs[i] = Math.max(0, Math.min(1, S.needs[i] + d)) }); if (r.needs && r.needs.length && window.NET) NET.save(); render();
    const nm = r.item ? r.item.emoji + ' ' + r.item.name : 'Done';
    toast(r.cured ? '✅ You are cured. ' + nm : r.pet ? `🐱 ${r.pet.name} feels better. ${nm}` : nm + ' ✓');
    if (window.PH && PH.local_ && r.item) PH.local_(r.item.emoji, `${r.item.name} · ${this.naira(r.price)}`, 'good');
    if (PH.view === 'health') this.load()
  },
  /* ----- hospital ----- */
  hospSheet() { PH.sheet(`<h3>General Hospital 🏥</h3><p class="hint2">An injection cures anything, mild or serious. It costs ${this.naira(this.D.hospital)}.</p><button class="fopt red" onclick="HEALTH.hosp()"><span>Pay and get treated</span><b>${this.naira(this.D.hospital)}</b></button>`, { confirm: true }) },
  async hosp() { try { const r = await NET.api('/api/ac/health/hospital', { method: 'POST' }); PH.closeSheet(); this.got(Object.assign(r, { item: { emoji: '💉', name: 'Hospital injection' } })) } catch (e) { PH.closeSheet(); toast(e.message) } },
  /* ----- player pharmacies ----- */
  async shops() {
    PH.view = 'healthsub'; PH.shell('Player pharmacies', 'HEALTH.open()', '<div class="abody hl" id="ab"><p class="empty">Loading…</p></div>', '<div class="hlsub">Pharmacy</div>');
    try {
      const r = await NET.api('/api/ac/health/shops'), ab = document.getElementById('ab'); if (!ab || PH.view !== 'healthsub') return;
      ab.innerHTML = r.shops.length ? r.shops.map(s => `<button type="button" class="hlrow shop" onclick="HEALTH.shop('${s.owner}')"><span class="hlic grn">💊</span><span class="hlt"><b>${esc(s.name)}</b><small>${esc(s.area)} · Level ${s.level}${s.me ? ' · yours' : ''}</small><em>💊 🥤 🧴 🍊 · from ${this.naira(s.from)}</em></span><i>›</i></button>`).join('')
        : '<p class="empty">No player pharmacies yet. Open the Pharmacy in the Venues app and yours shows up here.</p>'
    } catch (e) { toast(e.message) }
  },
  async shop(owner, who) {
    if (who) this.who = who; PH.view = 'healthsub';
    try {
      if (!who || !this.shopData || this.shopData.owner !== owner) { PH.shell('Player pharmacies', 'HEALTH.shops()', '<div class="abody hl" id="ab"><p class="empty">Loading…</p></div>', '<div class="hlsub">Pharmacy</div>'); this.shopData = await NET.api('/api/ac/health/shops/' + owner) }
      const s = this.shopData, w = this.who, list = s.items.filter(i => i.who === w);
      PH.shell('Player pharmacies', 'HEALTH.shops()', `<div class="abody hl" id="ab"><button class="hlback" onclick="HEALTH.shops()">‹ Shops</button>
        <div class="hlhead"><span class="hlic">💊</span><span><b>${esc(s.name)}</b><small>${esc(s.area)}</small></span></div>
        <div class="hlseg"><button class="${w === 'me' ? 'on' : ''}" onclick="HEALTH.shop('${owner}','me')">For me</button><button class="${w === 'pet' ? 'on' : ''}" onclick="HEALTH.shop('${owner}','pet')">For my pet</button></div>
        <div class="hlgrid">${list.map(i => `<div class="hlitem"><em>${i.stock} left</em><span class="hli">${i.emoji}</span><b>${esc(i.name)}</b><small>${esc(i.note)}</small><strong>${this.naira(i.price)}</strong>${s.mine ? '<button disabled>Yours</button>' : i.stock > 0 ? `<button onclick="HEALTH.buy('${owner}','${i.id}')">Buy</button>` : '<button disabled>Sold out</button>'}</div>`).join('')}</div>
        <p class="hlwallet">Wallet ${this.naira(s.cash)}</p></div>`, '<div class="hlsub">Pharmacy</div>')
    } catch (e) { toast(e.message) }
  },
  async buy(owner, id) { try { const r = await NET.api('/api/ac/health/buy', { method: 'POST', body: { owner, item: id } }); this.shopData = null; this.got(r); this.shop(owner) } catch (e) { toast(e.message) } },
  /* ----- the owner's own shelf ----- */
  manage() {
    const m = this.D.mine; if (!m) return;
    PH.sheet(`<h3>My pharmacy 🧾</h3><p class="hint2">Set your prices (${m.minX * 100}% to ${m.maxX * 100}% of the normal price) and restock. Restocking costs half the normal price per item.</p>` + m.shop.map(i => `<div class="hlm"><span>${i.emoji} ${esc(i.name)}<small>${i.stock} on the shelf</small></span><input type="number" inputmode="numeric" id="hp_${i.id}" value="${i.price}"><button onclick="HEALTH.setPrice('${i.id}')">Set</button><button onclick="HEALTH.restock('${i.id}')">+10</button></div>`).join(''))
  },
  async setPrice(id) { try { const r = await NET.api('/api/ac/health/my/price', { method: 'POST', body: { item: id, price: document.getElementById('hp_' + id).value } }); toast('Price set to ' + this.naira(r.price)); await this.load(); this.manage() } catch (e) { toast(e.message) } },
  async restock(id) { try { const r = await NET.api('/api/ac/health/my/restock', { method: 'POST', body: { item: id, qty: 10 } }); S.cash = r.cash; render(); toast('Restocked · ' + this.naira(r.cost)); await this.load(); this.manage() } catch (e) { toast(e.message) } },
  /* ----- Fresh Market lives in the Shop tab (mall.js) ----- */
  async eat(id) { try { const r = await NET.api('/api/ac/health/market', { method: 'POST', body: { item: id } }); PH.closeSheet(); this.got(r) } catch (e) { toast(e.message) } }
};
window.HEALTH = HEALTH;
