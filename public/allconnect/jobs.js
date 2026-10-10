/* Jobs app (Phone -> Jobs). The server decides pay, promotions and the shift cooldown (routes/acjobs.js);
   this file only draws the screen and, when "Go automatically" is ticked, asks for the next shift when it is ready. */
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
    if (!m || !m.auto || this.busy || m.closed || m.shiftsToday >= m.maxPerDay || Date.now() < this.hold) return;
    if (this.now() >= m.nextShiftAt) this.work(true)
  },
  /* home-screen quest: "Get a job" until the player has one */
  quest(el) {
    if (!el || !this.data) return;
    const has = !!this.data.mine;
    if (el.dataset.job === String(has)) return;
    el.dataset.job = String(has);
    el.innerHTML = has ? '<i>🎯</i><div><b>Eat something</b><span>Tap the cooler or stove</span></div>' : '<i style="background:#22b573">🎯</i><div><b>Get a job</b><span>Open Phone → Jobs</span></div>';
    el.onclick = has ? null : () => { nav('phone'); setTimeout(() => PH.open('jobs'), 0) }
  },
  async work(auto) {
    if (this.busy) return; this.busy = true;
    try {
      const r = await NET.api('/api/ac/jobs/work', { method: 'POST' });
      this.take(r); if (window.WORKCARD) WORKCARD.add(r);
      if (r.promoted) { toast('🎉 Promoted to ' + r.promoted + '!'); if (window.WORKCARD) WORKCARD.p = null; PH.local_('🎉', 'You were promoted to ' + r.promoted + ' · pay ' + fmt(r.mine.pay) + ' per shift', 'good') }
      else if (!auto) toast('💼 Shift done +' + fmt(r.earned));
      else toast('💼 +' + fmt(r.earned) + ' shift pay')
    } catch (e) {
      if (e.status === 429) { await this.load() }
      else { this.hold = Date.now() + 60000; if (!auto) toast(e.message) }
    }
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
    PH.shell('Jobs', 'PH.close()', '<div class="abody" id="ab"><p class="empty">Loading…</p></div>');
    if (this.data) this.draw();
    await this.load(); if (PH.view === 'jobs') this.draw()
  },
  left() { const m = this.data.mine; return Math.max(0, Math.ceil((m.nextShiftAt - this.now()) / 1000)) },
  clock(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') },
  /* tiny refresh once a second: only the work button + hint, not the whole screen */
  live() {
    const b = document.getElementById('jwork'), m = this.data && this.data.mine; if (!b || !m) return;
    const st = this.btn(m); b.textContent = st.t; b.disabled = st.off
  },
  btn(m) {
    if (this.busy) return { t: 'Working…', off: true };
    if (m.closed) return { t: 'Closed today', off: true };
    if (m.shiftsToday >= m.maxPerDay) return { t: 'Done for today', off: true };
    const s = this.left(); return s > 0 ? { t: 'On break · ' + this.clock(s), off: true } : { t: 'Work a shift now', off: false }
  },
  draw() {
    const ab = document.getElementById('ab'); if (!ab || !this.data) return;
    const d = this.data, m = d.mine, pay = n => '₦' + Number(n).toLocaleString('en-NG');
    let h = '';
    if (m) {
      const nx = m.next, pct = nx ? Math.min(100, Math.round(((m.shifts - nx.from) / Math.max(1, nx.at - nx.from)) * 100)) : 100, b = this.btn(m);
      h += `<div class="jmine"><div class="jtop"><span class="jlab">YOUR JOB</span><label class="jauto"><input type="checkbox" ${m.auto ? 'checked' : ''} onchange="JOBS.setAuto(this.checked)"><span>Go automatically</span></label></div>
        <h3>${esc(m.title)}</h3><p>${esc(m.field)} · ${pay(m.pay)} per shift</p>
        <div class="jbar"><u style="width:${pct}%"></u></div>
        <small>${nx ? `Next: ${esc(nx.title)} (${pay(nx.pay)}/shift) in ${nx.shiftsLeft} shift${nx.shiftsLeft === 1 ? '' : 's'}` : 'Top of the ladder 👑'} · ${m.shiftsToday}/${m.maxPerDay} shifts today</small>
        ${m.closed ? `<small class="jwarn">${esc(m.closed)}</small>` : ''}
        <button class="jwork" id="jwork" onclick="JOBS.work(false)" ${b.off ? 'disabled' : ''}>${b.t}</button></div>`;
    } else h += '<p class="jhint">Pick a job to start earning ₦ every shift. You can switch any time.</p>';
    h += d.jobs.filter(j => !m || j.id !== m.id).map(j => `<div class="jcard"><div class="jrow"><span class="jic">${j.emoji}</span><div class="jnm"><b>${esc(j.name)}</b><span>Starts as ${esc(j.startTitle)}</span></div><div class="jpay"><b>${pay(j.startPay)}</b><span>per shift</span></div></div>
        <p class="jdesc">${esc(j.blurb)}</p><div class="jmeta">🕘 ${esc(j.hours)}</div><div class="jmeta">${esc(j.days)}</div>
        <button class="jsw" onclick="JOBS.switchTo('${j.id}')">Switch to this job</button></div>`).join('');
    ab.innerHTML = h
  }
};
window.JOBS = JOBS;
