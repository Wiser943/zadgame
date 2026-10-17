/* Venues app (Phone -> Venues): open a cinema, restaurant, salon, gym, pitch, gaming café, studio, boutique, supermarket,
   pharmacy, clinic, school, library, coworking space, nightclub, gallery, church / community hall, workshop, hotel and wedding venue.
   Prices, income, upgrades and sale values are decided by the server (routes/acvenues.js, utils/acvenues.js). This file only draws them. */
const VEN = {
  D: null, busy: false, ft: 0, t: 0,
  money: n => '₦' + Math.floor(Math.abs(n) < 1 ? 0 : n).toLocaleString('en-NG'),
  short(n) { n = Math.floor(n); const t = x => String(Math.round(x * 10) / 10); return '₦' + (n >= 1e9 ? t(n / 1e9) + 'b' : n >= 1e6 ? t(n / 1e6) + 'm' : n >= 1e3 ? t(n / 1e3) + 'k' : n) },
  ico(v, big) { return `<span class="ivic${big ? ' big' : ''}" style="background:${esc(v.color)}"><i class="fa-solid fa-${esc(v.fa)}"></i></span>` },
  async open() {
    PH.view = 'venues';
    PH.shell('Venues', 'PH.close()', '<div class="abody iv vn" id="ab"><p class="empty">Loading…</p></div>');
    if (this.D) this.draw();
    try { this.D = await NET.api('/api/ac/venues/state'); S.cash = this.D.cash; render(); if (PH.view === 'venues') this.draw() }
    catch (e) {
      const ab = document.getElementById('ab');
      if (ab) ab.innerHTML = `<div class="ivempty"><p class="empty">Could not load your businesses.</p><p class="ivnote">${esc(e.message || 'Check your connection and try again.')}</p><button class="ivbtn grn" onclick="VEN.open()">Try again</button></div>`;
      else toast(e.message || 'Could not load your businesses. Try again.');
    }
    clearInterval(this.t); this.t = setInterval(() => { if (PH.view !== 'venues') return clearInterval(this.t); this.refresh() }, 60000);   // the "ready to collect" numbers grow while you watch
  },
  async refresh() { try { this.D = await NET.api('/api/ac/venues/state'); if (PH.view === 'venues') this.draw() } catch (e) { /* keep what is on screen */ } },
  pips(v) { let h = ''; for (let i = 1; i <= v.maxLevel; i++) h += `<i class="vnpip${i <= v.level ? ' on' : ''}"></i>`; return `<span class="vnpips" aria-label="Level ${v.level} of ${v.maxLevel}">${h}<em>Level ${v.level}</em></span>` },
  draw() {
    const D = this.D, ab = document.getElementById('ab'); if (!ab || !D) return;
    const s = D.summary, st = ab.scrollTop, own = D.venues.filter(v => v.owned), shop = D.venues.filter(v => !v.owned);
    let h = `<div class="ivcard vncard"><small class="vnlab">Ready to collect</small><div class="ivbig">${this.money(s.pending)}</div>
      <div class="ivsub">${s.owned} of ${s.total} venues open${s.owned ? ` · about ${this.short(s.perDay)} a day` : ''}</div>
      <button class="ivbtn wht vnall" ${s.pending > 0 ? '' : 'disabled'} onclick="VEN.act('collect',{all:true})">Collect all</button>
      <p class="ivnote">Income builds up for up to ${s.maxHours} hours, so collect every day. After running costs (${s.upkeepPct}% of sales) and ${s.taxPct}% tax. Earned so far: ${this.money(s.earned)}.</p></div>`;
    h += `<div class="lab2">YOUR VENUES</div>`;
    h += own.length ? own.map(v => `<div class="ivbiz own"><div class="ivhead">${this.ico(v, 1)}<div class="rt"><b>${esc(v.name)} · ${esc(v.area)}</b>${this.pips(v)}<span>${esc(v.peak)}</span><span class="mk">About ${this.money(v.perDay)} a day</span></div></div>
        <div class="ivstat"><b>${v.pending > 0 ? this.money(v.pending) + ' ready' : 'Nothing yet'}</b> · ${v.full ? 'full, collect now so it keeps earning' : v.hours + 'h stored'} · earned so far ${this.money(v.total)}${v.upgradeTo ? ` · level ${v.upgradeTo} costs ${this.short(v.upgradePrice)}` : ''}</div>
        <div class="ivbtns"><button class="ivbtn grn wide" ${v.pending > 0 ? '' : 'disabled'} onclick="VEN.act('collect',{key:'${v.key}'})">Collect</button>
        ${v.upgradeTo ? `<button class="ivbtn out wide" onclick="VEN.askUpgrade('${v.key}')">Upgrade</button>` : `<button class="ivbtn out wide" disabled>Top level</button>`}
        <button class="ivbtn out" onclick="VEN.askClose('${v.key}')" aria-label="Close ${esc(v.name)}">Close</button></div></div>`).join('')
      : `<p class="empty ivempty">You haven't opened a venue yet. Pick one below.</p>`;
    h += `<div class="lab2">OPEN A VENUE</div>` + shop.map(v => `<div class="ivrow">${this.ico(v)}<div class="rt"><b>${esc(v.name)} · ${esc(v.area)}</b><span>${esc(v.blurb)}</span><span class="mk">About ${this.money(v.perDay1)} a day · ${esc(v.peak)}</span></div>
        <button class="ivbtn grn" onclick="VEN.askOpen('${v.key}')">Open · ${this.short(v.price)}</button></div>`).join('');
    if (!shop.length) h += `<p class="empty ivempty">You run every kind of venue in the city. Upgrade them to earn more.</p>`;
    h += `<p class="adfoot">Each venue earns most at its busy hours. Prices and income are set by the server. Closing a venue pays back half of what you put in.</p>`;
    ab.innerHTML = h; ab.scrollTop = st
  },
  async act(path, body) {
    if (this.busy) return; this.busy = true;
    try {
      const r = await NET.api('/api/ac/venues/' + path, { method: 'POST', body }); this.D = r; S.cash = r.cash; render(); PH.closeSheet();
      if (PH.view === 'venues') this.draw(); if (r.flash) this.flash(r.flash)
    } catch (e) {
      toast(e.message || 'That business action did not complete. Refresh and try again.');
      // The server may have completed a write before a connection failed. Refresh authoritative
      // state before the player tries the same action again, avoiding stale balances and buttons.
      try { this.D = await NET.api('/api/ac/venues/state'); S.cash = this.D.cash; render(); if (PH.view === 'venues') this.draw() } catch (_) {}
    } finally { this.busy = false }
  },
  flash(t) {
    const a = PH.$a(); if (!a) return; const old = a.querySelector('.ivflash'); if (old) old.remove(); clearTimeout(this.ft);
    const f = document.createElement('div'); f.className = 'ivflash'; f.textContent = t; a.appendChild(f); this.ft = setTimeout(() => f.remove(), 3800)
  },
  confirm(title, line, label, go, keep) {
    PH.sheet(`<h3>${title}</h3><p class="hint2">${line}</p><button class="fopt ${keep ? 'red' : ''}" onclick="${go}"><span>${label}</span></button><button class="fopt" onclick="PH.closeSheet()"><span>${keep || 'Not now'}</span></button>`)
  },
  find(key) { return this.D && this.D.venues.find(x => x.key === key) },
  askOpen(key) { const v = this.find(key); if (!v) return; if (this.D.cash < v.price) return toast(`You need ${this.money(v.price)} to open a ${v.name}.`); this.confirm(`Open a ${esc(v.name)}?`, `It costs ${this.money(v.price)} and earns about ${this.money(v.perDay1)} a day. ${esc(v.blurb)}`, 'Open for ' + this.money(v.price), `VEN.act('open',{key:'${v.key}'})`) },
  askUpgrade(key) { const v = this.find(key); if (!v) return; if (this.D.cash < v.upgradePrice) return toast(`You need ${this.money(v.upgradePrice)} to upgrade.`); this.confirm(`Upgrade ${esc(v.name)}?`, `Level ${v.upgradeTo} costs ${this.money(v.upgradePrice)}. What it earned so far is collected first.`, 'Upgrade for ' + this.money(v.upgradePrice), `VEN.act('upgrade',{key:'${v.key}'})`) },
  askClose(key) { const v = this.find(key); if (!v) return; this.confirm(`Close ${esc(v.name)}?`, `It stops earning. What it has made is collected first, and you get ${this.money(v.sell)} back (half of what you put in).`, 'Close for ' + this.money(v.sell), `VEN.act('close',{key:'${v.key}'})`, 'Keep it') }
};
window.VEN = VEN;
