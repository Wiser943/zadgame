/* Daily gem hunt. The admin (Admin > Gem hunt) turns it on/off and sets the clue, hint, landmark and prizes.
   Players read the clue, walk to the landmark on the Map, the gem sparkles, tap it to claim. */
const GEM = {
  st: null, R: 110, hintTxt: '',
  boot() {
    if (this.t) return; this.t = setInterval(() => this.load(), 60000); this.load();
    if (window.MAP3D && !this.layered) {
      this.layered = 1; MAP3D.addLayer('world', (c, t, H) => this.draw(c, H));
      const prev = MAP3D.onPin; MAP3D.onPin = p => this.onPin(p) || (prev ? prev(p) : false);
    }
  },
  async load() { try { this.st = await NET.api('/api/ac/gem/state'); this.st.at = Date.now() } catch (e) { return } this.paintPill(); if (SHEET.isOpen('gem')) SHEET.paint() },
  short(n) { return n >= 1000 && n % 1000 === 0 ? '₦' + n / 1000 + 'k' : UI.fmt(n) },
  left() {
    const ms = Math.max(0, (this.st.resetIn || 0) - (Date.now() - (this.st.at || Date.now()))), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
    return h ? `${h}h ${m}m` : `${m}m`;
  },
  paintPill() {
    const el = document.getElementById('gem'), q = el && el.closest('.quest'), s = this.st; if (!el || !s) return;
    if (q) q.style.display = s.enabled ? '' : 'none';
    el.textContent = s.mine ? `You found it · #${s.mine.rank} today` : `${s.found.toLocaleString()} found · next prize ${UI.fmt(s.nextPrize)}`;
  },
  open() {
    if (!this.st) this.load();
    SHEET.open({ id: 'gem', title: '💎 Daily gem hunt', body: () => this.html(), onClose: () => { this.hintTxt = '' } });
    this.load();
  },
  html() {
    const s = this.st; if (!s) return '<p class="empty">Loading…</p>';
    if (!s.enabled) return '<div class="gmclue"><small>NO GEM RIGHT NOW</small><b>The gem hunt is taking a break. Check back soon.</b></div>';
    const p = s.prizes, tier = (a, v) => `<div><small>${a}</small><b>${this.short(v)}</b></div>`;
    const clue = s.clueHidden ? 'Today\u2019s clue is a secret. Explore the city and keep your eyes open.' : '\u201C' + UI.esc(s.clue) + '\u201D';
    const mine = s.mine ? `<div class="gmwin">✅ You found today\u2019s gem · #${s.mine.rank}${s.mine.prize ? ' · +' + UI.fmt(s.mine.prize) : ''}</div>` : '';
    return `<p class="gmsub">New gem in ${this.left()}</p>
      <div class="gmclue"><small>TODAY\u2019S CLUE</small><b>${clue}</b></div>
      <p class="gmtxt">Work out where it is, go there, and it sparkles. The sooner you find it, the bigger the prize.</p>
      ${s.hasHint ? (this.hintTxt ? `<div class="gmhint">💡 ${UI.esc(this.hintTxt)}</div>` : '<button class="lgbtn gmhb" onclick="GEM.hint(this)">Need a hint?</button>') : ''}
      <div class="gmtiers">${tier('1st', p.first)}${tier('2nd\u20133rd', p.second)}${tier('4th\u201310th', p.fourth)}${tier('After', p.after)}</div>
      ${mine}
      <p class="gmfound"><b>${s.found.toLocaleString()}</b> found it today${s.first.length ? ' · first: ' + s.first.map(n => UI.esc(n)).join(', ') : ''}</p>
      ${s.mine ? '' : '<button class="lgbtn gmgo" onclick="SHEET.close();nav(\'map\')">Open map</button>'}`;
  },
  async hint(btn) {
    if (btn) btn.disabled = true;
    try { this.hintTxt = (await NET.api('/api/ac/gem/hint')).hint; SHEET.paint() } catch (e) { toast(e.message); if (btn) btn.disabled = false }
  },
  pin() { const s = this.st; return s && s.enabled && !s.mine ? (MAP3D.pins.find(p => p[0] === s.place) || null) : null },
  near(p) { const me = MAP3D.me; return !!(p && me && Math.hypot(me.x - p[2], me.y - p[3]) <= this.R) },
  /* the sparkle only shows once you are close to the landmark */
  draw(c, H) {
    const p = this.pin(); if (!p || !this.near(p)) { this.seen = 0; return }
    const s = H.project(p[2], p[3], 36); if (!s) return;
    if (!this.seen) { this.seen = 1; toast('✨ Something is sparkling here. Tap it!') }
    const t = performance.now() / 1000, pu = .8 + .2 * Math.sin(t * 5), r = 15 * pu;
    const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, 34); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.35, 'rgba(120,200,255,.55)'); g.addColorStop(1, 'rgba(120,200,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, 34, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(s.x, s.y - r * 1.5); c.quadraticCurveTo(s.x, s.y, s.x + r * 1.5, s.y); c.quadraticCurveTo(s.x, s.y, s.x, s.y + r * 1.5); c.quadraticCurveTo(s.x, s.y, s.x - r * 1.5, s.y); c.quadraticCurveTo(s.x, s.y, s.x, s.y - r * 1.5); c.fill();
    for (let i = 0; i < 4; i++) { const a = t * 2 + i * 1.57, x = s.x + Math.cos(a) * 26, y = s.y + Math.sin(a) * 18; c.fillStyle = i % 2 ? '#7dd3fc' : '#fde68a'; c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill() }
    c.font = '20px system-ui'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText('💎', s.x, s.y + 7);
    H.M.hits.push({ x: s.x - 34, y: s.y - 34, w: 68, h: 68, kind: 'pin', pin: p });
  },
  onPin(p) { const g = this.pin(); if (!g || g !== p || !this.near(p)) return false; this.claim(); return true },
  async claim() {
    if (this.busy) return; this.busy = 1;
    try {
      const r = await NET.api('/api/ac/gem/claim', { method: 'POST' });
      if (window.LAGOS) LAGOS.setCash(r.cash); this.st = r.state; this.st.at = Date.now(); this.paintPill();
      CARD.show({ icon: '💎', title: 'Gem found!', text: `You were number ${r.rank} to find today\u2019s gem.`, lines: [['Prize', r.prize ? UI.fmt(r.prize) : 'No prize'], ['Your place', '#' + r.rank]], tone: 'gold', btn: 'Nice one' });
    } catch (e) { toast(e.message); this.load() }
    this.busy = 0;
  }
};
window.GEM = GEM;
