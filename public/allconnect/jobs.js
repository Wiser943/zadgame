/* Jobs app (Phone -> Jobs). A real 9 to 5 workday on the Lagos clock: clock in, get paid every full hour until 5 PM, clock out any time.
   The server decides pay, promotions and closing time (routes/acjobs.js); this file draws the screen and, when "Clock in automatically" is ticked,
   clocks you in as soon as the office opens while the game is open. The server keeps paying your hours even if you close the game. */
const JOBS = {
  data: null, off: 0, busy: false, hold: 0, timer: null,
  now() { return Date.now() + this.off },
  take(r) { if (!r) return; this.data = { ...(this.data || {}), ...r }; if (r.now) this.off = r.now - Date.now(); if (typeof r.cash === 'number') { S.cash = r.cash; render() } },
  async load() { try { this.take(await NET.api('/api/ac/jobs')); this.quest($('q1')) } catch (e) {} return this.data },
  /* called once after login: loads the job and starts the auto-work heartbeat */
  boot() { this.load(); if (!this.timer) this.timer = setInterval(() => this.beat(), 1000) },
  beat() {
    const m = this.data && this.data.mine;
    if (PH.view === 'jobs') this.live();
    if (!m || this.busy || Date.now() < this.hold) return;
    if (m.clockedIn) { if (this.now() >= m.nextShiftAt || this.now() >= m.workEnd) this.work(true); return }      // an hour is done (or it is 5 PM): collect it
    if (m.auto && !m.closed && !m.blocked && m.shiftsToday < m.maxPerDay) this.work(true)                          // office is open: clock in by itself
  },
  /* home-screen quest: "Get a job" until the player has one */
  /* the goal pill is drawn by GOALS (goals.js); it shows the next mission and opens the Goals sheet */
  quest() { if (window.GOALS) GOALS.paintPill() },
  async work(auto) {
    if (this.busy) return; this.busy = true;
    try {
      const r = await NET.api('/api/ac/jobs/work', { method: 'POST' });
      this.take(r);
      if (r.earned > 0) {
        if (window.WORKCARD) WORKCARD.add(r);
        if (r.promoted) { toast('🎉 Promoted to ' + r.promoted + '!'); if (window.WORKCARD) WORKCARD.p = null; PH.local_('🎉', 'You were promoted to ' + r.promoted + ' · pay ' + fmt(r.mine.pay) + ' per hour', 'good') }
        else toast('💼 +' + fmt(r.earned) + ' work pay');
        if (r.incident) setTimeout(() => toast(r.incident), 1500)
      } else if (r.note && (!auto || r.clockedIn)) toast('⏱ ' + r.note);
      if (r.clockedOut && r.note && r.earned > 0) setTimeout(() => toast('🏁 ' + r.note), 1200)
    } catch (e) { this.hold = Date.now() + 60000; if (!auto) toast(e.message) }
    this.busy = false; if (PH.view === 'jobs') this.draw()
  },
  async clockOut() {
    if (this.busy) return; this.busy = true;
    try { const r = await NET.api('/api/ac/jobs/clockout', { method: 'POST' }); this.take(r); if (r.earned > 0 && window.WORKCARD) WORKCARD.add(r); this.hold = Date.now() + 8 * 3600e3; toast('🏁 ' + (r.note || 'Clocked out')) } catch (e) { toast(e.message) }
    this.busy = false; if (PH.view === 'jobs') this.draw()
  },
  async setAuto(on) { try { this.take(await NET.api('/api/ac/jobs/auto', { method: 'POST', body: { on } })) } catch (e) { toast(e.message) } if (PH.view === 'jobs') this.draw() },
  async switchTo(id) {
    try {
      const j = this.data.jobs.find(x => x.id === id);
      this.take(await NET.api('/api/ac/jobs/switch', { method: 'POST', body: { id } }));
      this.hold = 0; this.quest($('q1')); toast('You now work in ' + j.name + ' ' + j.emoji);
      PH.local_(j.emoji, 'You switched to ' + j.name + ' as ' + this.data.mine.title, 'good');
      const ab = document.getElementById('ab'); if (ab) ab.scrollTop = 0
    } catch (e) { toast(e.message) }
    if (PH.view === 'jobs') this.draw()
  },
  async open() {
    PH.view = 'jobs';
    PH.shell('Jobs', 'PH.close()', '<div class="abody jobsx" id="ab"><p class="empty">Loading…</p></div>');
    if (this.data) this.draw();
    await this.load(); if (PH.view === 'jobs') this.draw()
  },
  left() { const m = this.data.mine; return Math.max(0, Math.ceil((m.nextShiftAt - this.now()) / 1000)) },
  clock(s) { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0') },
  /* tiny refresh once a second: only the work button + hint, not the whole screen */
  live() {
    const b = document.getElementById('jwork'), m = this.data && this.data.mine; if (!b || !m) return;
    const st = this.btn(m); b.textContent = st.t; b.disabled = st.off
  },
  btn(m) {
    if (this.busy) return { t: 'Working...', off: true, pill: '…' };
    if (m.clockedIn) { const s = this.left(); return { t: 'Working · next pay in ' + this.clock(s), off: true, pill: this.clock(s) } }
    if (m.closed) return { t: 'Closed', off: true, pill: 'Closed' };
    if (m.blocked) return { t: 'Vehicle needed', off: true, pill: 'Work' };
    if (m.shiftsToday >= m.maxPerDay) return { t: 'Done for today', off: true, pill: 'Done' };
    return { t: 'Clock in', off: false, pill: 'Work' }
  },
  draw() {
    const ab = document.getElementById('ab'); if (!ab || !this.data) return;
    const d = this.data, m = d.mine, pay = n => '₦' + Number(n).toLocaleString('en-NG');
    let h = '<div class="jcols"><div class="jleft">';
    if (m) {
      const nx = m.next, pct = nx ? Math.min(100, Math.round(((m.shifts - nx.from) / Math.max(1, nx.at - nx.from)) * 100)) : 100, b = this.btn(m);
      h += `<div class="jmine"><div class="jtop"><span class="jlab">YOUR JOB</span><label class="jauto"><input type="checkbox" ${m.auto ? 'checked' : ''} onchange="JOBS.setAuto(this.checked)"><span>Clock in automatically</span></label></div>
        <h3>${esc(m.title)}</h3><p>${esc(m.field)} · ${pay(m.pay)} per hour · ${esc(m.hours)}</p>
        <div class="jbar"><u style="width:${pct}%"></u></div>
        <small>${nx ? `Next: ${esc(nx.title)} (${pay(nx.pay)}/hour) in ${nx.shiftsLeft} hour${nx.shiftsLeft === 1 ? '' : 's'}` : 'Top of the ladder 👑'} · ${m.shiftsToday}/${m.maxPerDay} hours paid today</small>
        ${m.closed ? `<small class="jwarn">${esc(m.closed)}</small>` : ''}
        ${m.blocked ? `<small class="jwarn">${esc(m.blocked)} <a href="#" onclick="TR.open('shop');return false">Open Transport</a></small>` : ''}
        <button class="jwork" id="jwork" onclick="JOBS.work(false)" ${b.off ? 'disabled' : ''}>${b.t}</button>${m.clockedIn ? `<button class="jwork jout" onclick="JOBS.clockOut()">Clock out</button><small>You are paid every full hour until ${esc(m.hours.split(' to ')[1])}. Clocking out early skips the part-hour.</small>` : ''}</div>`;
    } else h += '<p class="jhint">Pick a job to start earning ₦ every shift. You can switch any time.</p>';
    h += '</div><div class="jright">';
    h += d.jobs.filter(j => !m || j.id !== m.id).map(j => `<div class="jcard"><div class="jrow"><span class="jic">${j.emoji}</span><div class="jnm"><b>${esc(j.name)}</b><span>Starts as ${esc(j.startTitle)}</span></div><div class="jpay"><b>${pay(j.startPay)}</b><span>per hour</span></div></div>
        <p class="jdesc">${esc(j.blurb)}</p><div class="jmeta">🕘 ${esc(j.hours)}</div><div class="jmeta">${esc(j.days)}</div>${j.needsText ? `<div class="jmeta">🚗 ${esc(j.needsText)}</div>` : ''}
        <button class="jsw" onclick="JOBS.switchTo('${j.id}')">Switch to this job</button></div>`).join('');
    ab.innerHTML = h + '</div></div>'
  }
};
window.JOBS = JOBS;
