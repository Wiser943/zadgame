/* Lagos Life: today's city event (with Pidgin), utility bills, starter quests and the daily streak.
   All numbers come from the server (/api/ac/lagos/*). This file only draws them. */
const LAGOS = {
  d: null, tab: 'today',
  fmt(n) { return '₦' + Math.round(n || 0).toLocaleString('en-NG') },
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) },
  ic(fa, color, size) { return `<span class="lgi" style="background:${color || '#64748b'};${size ? `width:${size}px;height:${size}px` : ''}"><span class="fa-solid fa-${fa}"></span></span>` },
  foodMult() { return (this.d && this.d.event && this.d.event.mult && this.d.event.mult.food) || 1 },
  dueLabel() { const b = this.d && this.d.bills; return b && b.count ? (b.overdue ? 'Late' : 'Due') : '' },
  todo() { const d = this.d; if (!d) return 0; return (d.quests ? d.quests.claimable : 0) + (d.bills ? d.bills.count : 0) + (d.daily && d.daily.claimable ? 1 : 0) },
  async boot() { if (this.t) return; await this.load(true); this.t = setInterval(() => this.load(), 180000) },
  async load(first) {
    try { this.d = await NET.api('/api/ac/lagos/city') } catch (e) { return }
    this.draw();
    document.body.classList.toggle('powercut', !!(this.d.bills && this.d.bills.powerCut));
    if (first && this.d.daily && this.d.daily.claimable) setTimeout(() => { if (!SHEET.isOpen() && !CARD.cur && !(window.HUB && HUB.busy())) this.open('today') }, 2600);
  },
  /* the pill on the home screen */
  draw() {
    const el = document.getElementById('q3'), d = this.d; if (!el || !d) return;
    const ev = d.event, n = this.todo();
    el.innerHTML = `${this.ic(ev.fa, ev.color, 28)}<div><b>${this.esc(ev.title)}</b><span>${this.esc(ev.pidgin)}</span></div>${n ? `<em class="lgdot">${n}</em>` : ''}`;
    el.style.display = '';
  },
  effects(ev) {
    const m = ev.mult || {}, out = [], pct = x => (x > 1 ? '+' : '') + Math.round((x - 1) * 100) + '%';
    if (m.fare && m.fare !== 1) out.push(['Transport fares', pct(m.fare), m.fare > 1]);
    if (m.power && m.power !== 1) out.push(['Electricity bill', pct(m.power), m.power > 1]);
    if (m.water && m.water !== 1) out.push(['Water bill', pct(m.water), m.water > 1]);
    if (m.food && m.food !== 1) out.push(['Food prices', pct(m.food), m.food > 1]);
    const j = m.job || {};
    if (j.road && j.road !== 1) out.push(['Danfo & road jobs', pct(j.road), j.road < 1]);
    if (j.all && j.all !== 1) out.push(['Other jobs', pct(j.all), j.all < 1]);
    return out;
  },
  /* ----- the Lagos Life sheet (built on the shared SHEET component in ui.js) ----- */
  open(tab) {
    if (!this.d) return toast('Loading the city…');
    this.tab = tab || 'today';
    SHEET.open({ id: 'lagos', title: 'Lagos Life', tab: this.tab, onTab: t => { this.tab = t; if (t === 'quests') this.loadQuests(true) },
      tabs: () => { const d = this.d; return [{ id: 'today', label: 'Today', badge: d.daily && d.daily.claimable ? 1 : 0 }, { id: 'quests', label: 'Quests', badge: d.quests.claimable }, { id: 'bills', label: 'Bills', badge: d.bills.count }] },
      body: t => this.bodyFor(t) });
  },
  close() { if (SHEET.isOpen('lagos')) SHEET.close() },
  setTab(t) { SHEET.setTab(t) },
  paint() { if (SHEET.isOpen('lagos')) SHEET.paint() },
  bodyFor(t) {
    if (t === 'today') return this.todayHtml();
    if (t === 'quests') return this.Q ? this.questsHtml() : this.loadQuests().then(() => this.questsHtml());
    setTimeout(() => this.loadBills(), 0); return '<div id="lgbills"><p class="empty">Loading…</p></div>';
  },
  todayHtml() {
    const d = this.d, ev = d.event, nx = d.next, eff = this.effects(ev);
    const mins = Math.max(1, Math.round((ev.endsAt - Date.now()) / 60000)), left = mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + ' min';
    const dist = Object.entries(ev.districts || {}).map(([k, v]) => `<li><b>${this.esc(k)}</b><span>${this.esc(v)}</span></li>`).join('');
    const dl = d.daily;
    return `<div class="lgev" style="--c:${ev.color}">${this.ic(ev.fa, ev.color, 46)}<div><h3>${this.esc(ev.title)}</h3><p class="pg">${this.esc(ev.pidginText)}</p><p>${this.esc(ev.text)}</p><small>Changes in ${left}</small></div></div>
      ${eff.length ? `<div class="lgfx">${eff.map(e => `<span class="${e[2] ? 'bad' : 'good'}">${this.esc(e[0])} <b>${e[1]}</b></span>`).join('')}</div>` : ''}
      ${dist ? `<h4>Around the city</h4><ul class="lgdist">${dist}</ul>` : ''}
      <div class="lgnext">Next up: ${this.ic(nx.fa, nx.color, 22)} <b>${this.esc(nx.title)}</b></div>
      <div class="lgdaily"><div><b>Daily bonus</b><small>${dl.claimable ? `Day ${dl.streak}${dl.reset ? ' (streak restarted)' : ''}. Come back every day, day 7 pays the most.` : `Collected. Day ${dl.streak} streak. Tomorrow pays ${this.fmt(dl.next)}.`}</small></div>
        <button class="lgbtn" ${dl.claimable ? '' : 'disabled'} onclick="LAGOS.daily(this)">${dl.claimable ? 'Collect ' + this.fmt(dl.next) : 'Collected'}</button></div>`;
  },
  async daily(btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await NET.api('/api/ac/lagos/daily', { method: 'POST' });
      this.setCash(r.cash); this.close(); CARD.show({ icon: '📅', title: 'Daily bonus', text: r.streak >= 7 ? 'Day 7! The biggest one. Come back tomorrow to start again.' : 'Come back tomorrow for more.', lines: [['You got', this.fmt(r.amount)], ['Streak', 'Day ' + r.streak]], tone: 'gold', btn: 'Collect' });
      this.d.daily = r.daily; this.draw(); this.paint();
    } catch (e) { toast(e.message); if (btn) btn.disabled = false }
  },
  setCash(c) { if (typeof S !== 'undefined' && Number.isFinite(c)) { S.cash = c; if (typeof render === 'function') render() } },
  /* ----- quests ----- */
  async loadQuests(refresh) { try { this.Q = (await NET.api('/api/ac/lagos/quests')).quests; if (refresh && this.tab === 'quests') this.paint() } catch (e) { toast(e.message) } },
  questsHtml() {
    const q = this.Q || [], done = q.filter(x => x.claimed).length;
    return `<div class="lgprog"><div><b>${done} of ${q.length} done</b><small>Finish these to get started in Lagos. Each one pays.</small></div><i style="width:${Math.round(done / Math.max(1, q.length) * 100)}%"></i></div>` +
      q.map(x => `<div class="lgq ${x.claimed ? 'cl' : x.done ? 'rd' : ''}">${this.ic(x.claimed ? 'check' : x.fa, x.claimed ? '#22b573' : x.done ? '#f59e0b' : '#94a3b8', 36)}<div><b>${this.esc(x.title)}</b><small>${x.claimed ? 'Claimed' : this.esc(x.hint)}</small></div>
        ${x.claimed ? '' : x.done ? `<button class="lgbtn" onclick="LAGOS.claim('${x.id}',this)">+${this.fmt(x.reward)}</button>` : `<span class="lgrw">${this.fmt(x.reward)}</span>`}</div>`).join('');
  },
  async claim(id, btn) {
    if (btn) btn.disabled = true;
    try { const r = await NET.api('/api/ac/lagos/quests/claim', { method: 'POST', body: { id } }); this.Q = r.quests; this.setCash(r.cash); CARD.show({ icon: '✅', title: 'Quest done', text: 'Reward added to your balance.', lines: [['Reward', this.fmt(r.reward)]], tone: 'gold', btn: 'Nice one' }); await this.load(); this.paint() }
    catch (e) { toast(e.message); if (btn) btn.disabled = false }
  },
  /* ----- bills (used by the Lagos Life sheet and by Phone > Bank > Bills) ----- */
  async loadBills() {
    try { const r = await NET.api('/api/ac/lagos/bills'); this.B = r; this.drawBills() } catch (e) { const el = document.getElementById('lgbills'); if (el) el.innerHTML = `<p class="empty">${this.esc(e.message)}</p>` }
  },
  drawBills() {
    const el = document.getElementById('lgbills'), r = this.B; if (!el || !r) return;
    const unpaid = r.bills.filter(b => !b.paid), paid = r.bills.filter(b => b.paid).slice(0, 6), s = r.summary;
    const day = t => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
    const row = b => `<div class="lgb ${b.overdue ? 'late' : ''}">${this.ic(b.fa, b.color, 40)}<div><b>${this.esc(b.name)}</b><small>${this.esc(b.company)} · ${b.paid ? 'Paid ' + day(b.paidAt) : (b.overdue ? 'Overdue since ' : 'Due ') + day(b.due)}</small>${b.late && !b.paid ? `<small class="lt">Includes ${this.fmt(b.late)} late fee</small>` : ''}</div>
      <div class="lgr"><b>${this.fmt(b.paid ? b.amount : b.total)}</b>${b.paid ? '<span class="lgok"><span class="fa-solid fa-check"></span></span>' : `<button class="lgbtn" onclick="LAGOS.pay('${b.cycle}','${b.key}',this)">Pay</button>`}</div></div>`;
    el.innerHTML = `${s.powerCut ? '<div class="lgwarn"><span class="fa-solid fa-bolt-slash"></span> Light don go. Pay your electricity bill to bring it back.</div>' : ''}
      <div class="lgsum"><div><small>You owe</small><b>${this.fmt(s.total)}</b></div>${unpaid.length > 1 ? `<button class="lgbtn big" onclick="LAGOS.pay(null,null,this,true)">Pay all</button>` : ''}</div>
      ${unpaid.length ? unpaid.map(row).join('') : '<p class="empty">All bills paid. Well done! New bills arrive every Monday.</p>'}
      <p class="lgnote">Bills come every Monday and are due by Sunday night. Late bills cost 10% more, and unpaid electricity means a power cut. The more appliances you have, the higher the bill. The city event changes prices too.</p>
      ${paid.length ? `<h4>Paid recently</h4>${paid.map(row).join('')}` : ''}`;
  },
  async pay(cycle, key, btn, all) {
    if (btn) btn.disabled = true;
    try {
      const r = await NET.api('/api/ac/lagos/bills/pay', { method: 'POST', body: all ? { all: true } : { cycle, key } });
      this.setCash(r.cash); toast('Paid ' + this.fmt(r.spent));
      this.B = Object.assign(this.B || {}, { bills: r.bills, summary: r.summary }); this.drawBills(); this.load();
    } catch (e) { toast(e.message); if (btn) btn.disabled = false }
  }
};
window.LAGOS = LAGOS;
