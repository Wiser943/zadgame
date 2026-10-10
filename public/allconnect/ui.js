/* Shared UI pieces used all over AllConnect.
   SHEET = the "Lagos Life" style bottom sheet (title, optional tabs, scrolling body). Use it for any panel.
   CARD  = the small centred result popup ("Back from Work", promotions, investment payouts, gifts, recaps).
   Both are plain DOM, no dependencies. */
const UI = {
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) },
  fmt(n) { return '₦' + Math.round(n || 0).toLocaleString('en-NG') },
  /* round coloured Font Awesome icon */
  ic(fa, color, size) { return `<span class="lgi" style="background:${color || '#64748b'};${size ? `width:${size}px;height:${size}px` : ''}"><span class="fa-solid fa-${fa}"></span></span>` },
  /* a simple tappable list row: icon, title, small text, and anything on the right */
  row(o) { return `<div class="lgq ${o.cls || ''}" ${o.go ? `onclick="${o.go}" style="cursor:pointer"` : ''}>${o.ic || ''}<div><b>${o.title}</b>${o.sub ? `<small>${o.sub}</small>` : ''}</div>${o.right || ''}</div>` },
  bar(pct) { return `<div class="gmbar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>` },
  ago(t) { const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago' }
};
window.UI = UI;

const SHEET = {
  o: null, tab: null,
  /* SHEET.open({ id, title, tabs:[{id,label,badge}], tab, body:(tab)=>html|Promise<html>, back:'js to run', wide, onClose })
     body() is called every time the tab changes or SHEET.paint() is called. */
  open(o) {
    this.close(true); this.o = o; this.tab = o.tab || (o.tabs && o.tabs[0] && o.tabs[0].id) || null;
    const m = document.createElement('div'); m.id = 'lgm'; m.className = 'lgm'; m.dataset.sheet = o.id || '';
    m.innerHTML = `<div class="lgcard ${o.wide ? 'wide' : ''}"><div class="lghd">${o.back ? `<button class="lgback" onclick="${o.back}" aria-label="Back"><span class="fa-solid fa-chevron-left"></span></button>` : ''}<b>${o.title || ''}</b><button onclick="SHEET.close()" aria-label="Close"><span class="fa-solid fa-xmark"></span></button></div><div class="lgtabs" id="lgtabs"></div><div class="lgbody" id="lgbody"></div></div>`;
    m.addEventListener('click', e => { if (e.target === m) this.close() });
    document.body.appendChild(m); requestAnimationFrame(() => m.classList.add('on'));
    this.paint(); return m;
  },
  isOpen(id) { const m = document.getElementById('lgm'); return !!m && (!id || m.dataset.sheet === id) },
  close(quiet) {
    const m = document.getElementById('lgm'), o = this.o; if (m) m.remove(); this.o = null;
    if (!quiet && o && o.onClose) try { o.onClose() } catch (e) {}
  },
  setTab(t) { this.tab = t; if (this.o && this.o.onTab) this.o.onTab(t); this.paint(); const b = document.getElementById('lgbody'); if (b) b.scrollTop = 0 },
  setTitle(t) { const h = document.querySelector('#lgm .lghd b'); if (h) h.textContent = t },
  /* redraw tabs and body (keeps scroll position unless the tab changed) */
  async paint() {
    const o = this.o, t = document.getElementById('lgtabs'), b = document.getElementById('lgbody'); if (!o || !t || !b) return;
    const tabs = typeof o.tabs === 'function' ? o.tabs() : o.tabs;
    t.style.display = tabs && tabs.length ? '' : 'none';
    t.innerHTML = (tabs || []).map(x => `<button class="${this.tab === x.id ? 'on' : ''}" onclick="SHEET.setTab('${x.id}')">${x.label}${x.badge ? `<i>${x.badge}</i>` : ''}</button>`).join('');
    const tab = this.tab, y = b.scrollTop;
    let h = o.body(tab);
    if (h && typeof h.then === 'function') { if (!b.dataset.t || b.dataset.t !== String(tab)) b.innerHTML = '<p class="empty">Loading…</p>'; try { h = await h } catch (e) { h = `<p class="empty">${UI.esc(e.message || 'Something went wrong')}</p>` } }
    if (this.o !== o || this.tab !== tab || !document.getElementById('lgbody')) return;
    b.innerHTML = h; b.dataset.t = String(tab); b.scrollTop = y;
  }
};
window.SHEET = SHEET;

/* ---------------- CARD: the result popup ----------------
   CARD.show({ icon:'💼', title:'Back from Work', text:'…', lines:[['Earned','₦49,600'],…], tone:'good|gold|warn|info', btn:'Nice one', go:'js to run on tap', onClose })
   Cards queue up: if two arrive together they show one after the other. */
const CARD = {
  q: [], cur: null, seen: new Set(),
  show(c) { this.q.push(c); if (!this.cur) this.next() },
  next() {
    const c = this.q.shift(); if (!c) { this.cur = null; return }
    this.cur = c;
    const el = document.createElement('div'); el.className = 'rcm'; el.id = 'rcm';
    const lines = (c.lines || []).map(l => `<li><span>${UI.esc(l[0])}</span><b>${UI.esc(l[1])}</b></li>`).join('');
    el.innerHTML = `<div class="rcard ${c.tone || 'good'}" role="dialog" aria-modal="true"><div class="rcic"><span>${c.icon || '🎉'}</span></div><h3>${UI.esc(c.title)}</h3><p>${UI.esc(c.text || '')}</p>${lines ? `<ul class="rclines">${lines}</ul>` : ''}<button class="rcbtn" id="rcbtn">${UI.esc(c.btn || 'Nice one')}</button>${c.alt ? `<button class="rcalt" id="rcalt">${UI.esc(c.alt)}</button>` : ''}</div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
    const done = (go) => { el.classList.remove('on'); setTimeout(() => el.remove(), 180); this.cur = null; if (c.onClose) try { c.onClose(go) } catch (e) {} if (go && c.go) try { new Function(c.go)() } catch (e) {} setTimeout(() => this.next(), 220) };
    el.querySelector('#rcbtn').onclick = () => done(!!c.goOnBtn);
    const alt = el.querySelector('#rcalt'); if (alt) alt.onclick = () => done(true);
  },
  /* cards the server saved for me (offline results, promotions, investment payouts, invite bonuses) */
  async fetch() {
    try {
      const r = await NET.api('/api/ac/hub/cards'), fresh = (r.cards || []).filter(c => !this.seen.has(c.id)); if (!fresh.length) return;
      fresh.forEach(c => { this.seen.add(c.id); this.show(c) });
      NET.api('/api/ac/hub/cards/seen', { method: 'POST', body: { ids: fresh.map(c => c.id) } }).catch(() => {});
      this.refreshCash();
    } catch (e) {}
  },
  async refreshCash() { try { const j = await NET.api('/api/ac/state'); if (j && j.ac && typeof S !== 'undefined') { S.cash = j.ac.cash; if (typeof render === 'function') render() } } catch (e) {} }
};
window.CARD = CARD;
