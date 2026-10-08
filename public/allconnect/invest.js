/* Invest app (Phone -> Invest): land, street businesses and haulage trailers.
   All prices, payouts and sale values are decided by the server (routes/acinvest.js, utils/acinvest.js). */
const INV = {
  D: null, busy: false, ft: 0,
  money: n => '₦' + Math.floor(Math.abs(n) < 1 ? 0 : n).toLocaleString('en-NG'),
  sg(n) { n = Math.round(n); return (n < 0 ? '-' : '+') + '₦' + Math.abs(n).toLocaleString('en-NG') },
  cls(n) { return n < 0 ? 'neg' : n > 0 ? 'pos' : '' },
  short(n) {
    n = Math.floor(n); const t = x => String(Math.round(x * 100) / 100);
    return '₦' + (n >= 1e9 ? t(n / 1e9) + 'b' : n >= 1e6 ? t(n / 1e6) + 'm' : n >= 1e3 ? t(n / 1e3) + 'k' : n)
  },
  lagos: ms => new Date(ms + 3600000).toISOString().slice(0, 10),
  nextText() { const D = this.D; return (this.lagos(D.nextPayoutAt - 1) === this.lagos(D.now) ? 'today' : 'tomorrow') + ' at 6:00 PM' },
  sinceText() {
    const s = this.D.since; if (!s) return 'the day you first invest';
    const d = new Date(s + 3600000), w = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()], m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    return `${w} ${d.getUTCDate()} ${m}`
  },
  async open() {
    PH.view = 'invest';
    PH.shell('Invest', 'PH.close()', '<div class="abody iv" id="ab"><p class="empty">Loading…</p></div>');
    if (this.D) this.draw();
    try { this.D = await NET.api('/api/ac/invest/state'); S.cash = this.D.cash; render(); if (PH.view === 'invest') this.draw() }
    catch (e) { toast(e.message) }
  },
  draw() {
    const D = this.D, ab = document.getElementById('ab'); if (!ab || !D) return;
    const s = D.summary, st = ab.scrollTop, pl = (n, w, p) => n + ' ' + (n === 1 ? w : p || w + 's');
    let h = `<div class="ivcard"><div class="ivbig">${this.money(s.portfolio)}</div>
      <div class="ivsub">${pl(s.plots, 'plot')} (${this.sg(s.landDelta)}) · ${pl(s.trucks, 'trailer')} · ${pl(s.businesses, 'business', 'businesses')}</div>
      <div class="ivchips"><div><small>Today</small><b>${this.sg(s.today)}</b></div><div><small>This week</small><b>${this.sg(s.week)}</b></div><div><small>Total</small><b>${this.sg(s.total)}</b></div></div>
      <div class="ivnext">Next payout ${this.nextText()}</div>
      <p class="ivnote">Payouts after tax, plus what your land grew. Total also counts what everything would sell for now against what you paid (payouts counted from ${this.sinceText()}).</p></div>`;
    /* land */
    h += `<div class="lab2">YOUR LAND</div>` + (D.land.length ? D.land.map(l => `<div class="ivrow"><span class="ivic">${l.emoji}</span><div class="rt"><b>${esc(l.name)}</b>
        <span>Worth ${this.money(l.worth)} · <i class="${this.cls(l.delta)}">${this.sg(l.delta)}</i></span><span>Grew ${this.sg(l.grewWeek)} this week · it pays when you sell</span></div>
        <button class="ivbtn out" onclick="INV.askSellLand('${l.id}')">Sell</button></div>`).join('') : `<p class="empty ivempty">You don't own any land yet. Pick a plot below.</p>`);
    h += `<div class="lab2">LAND FOR SALE</div>` + D.market.map(m => `<div class="ivrow"><span class="ivic">${m.emoji}</span><div class="rt"><b>${esc(m.name)}</b><span>Grows about ${m.weekPct}% a week · sells back for ${this.short(m.sell)}</span></div>
        <button class="ivbtn grn" onclick="INV.act('land/buy',{place:'${m.id}'})">Buy · ${this.short(m.price)}</button></div>`).join('');
    /* bigger businesses that open as their own apps later */
    h += `<div class="lab2">GROW BIGGER</div>` + D.coming.map(c => `<div class="ivpromo ${c.key}"><span class="ivic big">${c.emoji}</span><div class="rt"><b>${c.cost ? this.short(c.cost) : esc(c.title)}</b><span>${esc(c.blurb)}</span></div>
        <button class="ivbtn wht" onclick="toast('${esc(c.title)} opens soon')">Open</button></div>`).join('');
    /* haulage */
    const T = D.haulage;
    h += `<div class="lab2">HAULAGE BUSINESS</div><div class="ivbiz"><div class="ivhead"><span class="ivic big">${T.emoji}</span><div class="rt"><b>${esc(T.name)}</b>
        <span>Earns ${this.short(T.min)}–${this.short(T.max)} a day, minus ${this.short(T.driver)} for the driver. Sometimes it breaks down (${this.short(T.repair)} to fix).</span></div></div>
        ${T.count ? `<div class="ivstat">You run ${T.count} of ${T.maxCount} · today <b class="${this.cls(T.today)}">${this.sg(T.today)}</b> · this week <b class="${this.cls(T.week)}">${this.sg(T.week)}</b> · total <b class="${this.cls(T.total)}">${this.sg(T.total)}</b> (before tax)</div>` : ''}
        <div class="ivbtns"><button class="ivbtn grn wide" ${T.count >= T.maxCount ? 'disabled' : ''} onclick="INV.act('truck/buy',{})">Buy · ${this.short(T.price)}</button>
        <button class="ivbtn out wide" ${T.count ? '' : 'disabled'} onclick="INV.askSellTruck()">Sell one · ${this.short(T.sellOne)}</button></div></div>`;
    /* street businesses */
    h += `<div class="lab2">OWN A BUSINESS</div>` + D.businesses.map(b => b.owned ? `<div class="ivbiz own"><div class="ivhead"><span class="ivic big">${b.emoji}</span><div class="rt"><b>${esc(b.name)} · ${esc(b.area)}</b><span>${esc(b.blurb)}</span>
          <span class="mk">Makes ${this.money(b.min)}–${this.money(b.max)} a day</span></div></div>
        <div class="ivstat"><b>Next payout ${this.nextText().replace('at 6:00 PM', 'at 6:00 PM')}.</b> ${b.total ? '' : 'No payouts counted yet. '}today <b class="${this.cls(b.today)}">${this.sg(b.today)}</b> · this week <b class="${this.cls(b.week)}">${this.sg(b.week)}</b> · total <b class="${this.cls(b.total)}">${this.sg(b.total)}</b> (before tax)</div>
        <button class="ivbtn out full" onclick="INV.askSellBiz('${b.key}')">Sell · ${this.short(b.sell)}</button></div>`
      : `<div class="ivbiz"><div class="ivhead"><span class="ivic big">${b.emoji}</span><div class="rt"><b>${esc(b.name)} · ${esc(b.area)}</b><span>${esc(b.blurb)}</span><span class="mk">Makes ${this.money(b.min)}–${this.money(b.max)} a day</span></div></div>
        <button class="ivbtn grn full" onclick="INV.act('biz/buy',{key:'${b.key}'})">Buy · ${this.short(b.price)}</button></div>`).join('');
    h += `<p class="adfoot">Income is paid every evening at 6:00 PM (Lagos time), minus ${s.taxPct}% tax. Prices and payouts are set by the server.</p>`;
    ab.innerHTML = h; ab.scrollTop = st
  },
  /* ----- actions ----- */
  async act(path, body) {
    if (this.busy) return; this.busy = true;
    try {
      const r = await NET.api('/api/ac/invest/' + path, { method: 'POST', body }); this.D = r; S.cash = r.cash; render(); PH.closeSheet();
      if (PH.view === 'invest') this.draw(); if (r.flash) this.flash(r.flash)
    } catch (e) { toast(e.message) } finally { this.busy = false }
  },
  flash(t) {
    const a = PH.$a(); if (!a) return; const old = a.querySelector('.ivflash'); if (old) old.remove(); clearTimeout(this.ft);
    const f = document.createElement('div'); f.className = 'ivflash'; f.textContent = t; a.appendChild(f); this.ft = setTimeout(() => f.remove(), 3800)
  },
  confirm(title, line, label, go) {
    PH.sheet(`<h3>${title}</h3><p class="hint2">${line}</p><button class="fopt red" onclick="${go}"><span>${label}</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Keep it</span></button>`)
  },
  askSellLand(id) { const l = this.D.land.find(x => x.id === id); if (!l) return; this.confirm(`Sell ${esc(l.name)}?`, `You paid ${this.money(l.paid)}. You get ${this.money(l.worth)} now (${this.sg(l.delta)}).`, 'Sell for ' + this.money(l.worth), `INV.act('land/sell',{id:'${id}'})`) },
  askSellBiz(key) { const b = this.D.businesses.find(x => x.key === key); if (!b) return; this.confirm(`Sell ${esc(b.name)}?`, `It stops paying you. You get ${this.money(b.sell)} for it.`, 'Sell for ' + this.money(b.sell), `INV.act('biz/sell',{key:'${key}'})`) },
  askSellTruck() { const T = this.D.haulage; this.confirm('Sell a trailer?', `You get ${this.money(T.sellOne)} for one trailer.`, 'Sell for ' + this.money(T.sellOne), `INV.act('truck/sell',{})`) }
};
window.INV = INV;
