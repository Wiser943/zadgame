/* Age check: before anyone signs in or creates an account they say when they were born and attest they are 18 or older.
   Only the birth YEAR and the time of the attestation reach the server (routes/acage.js). */
const AGE = {
  KEY: 'ac:age18', UNDER: 'ac:age:under', SYNC: 'ac:age18:sync',
  get(k) { try { return localStorage.getItem(k) } catch (e) { return null } },
  put(k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  ok() { return !!this.get(this.KEY) },
  blocked() { return this.get(this.UNDER) === '1' },
  MONTHS: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  /* real years only: this year back 100 years (never NaN) */
  years() { const y = new Date().getFullYear(), a = []; for (let i = y; i >= y - 100; i--) a.push(i); return a },
  ageOf(d, m, y) { const dt = new Date(y, m, d); if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null; const n = new Date(); let a = n.getFullYear() - y; if (n.getMonth() < m || (n.getMonth() === m && n.getDate() < d)) a--; return a },
  gate(next) {
    if (document.getElementById('agegate')) return;
    const o = document.createElement('div'); o.id = 'agegate'; o.className = 'agb'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Age check');
    const sel = (id, ph, opts) => `<label class="ags"><span class="sr-only">${ph}</span><select id="${id}" onchange="AGE.check()"><option value="">${ph}</option>${opts}</select></label>`;
    o.innerHTML = this.blocked()
      ? `<div class="agc"><div class="agi">🔞</div><h2>Sorry, adults only</h2><p>AllConnect is only for people who are 18 or older, so you cannot continue.</p></div>`
      : `<div class="agc"><div class="agi">🪪</div><h2>Quick check</h2><p class="agp">Your date of birth</p>
        <div class="agr">${sel('agd', 'Day', Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(''))}${sel('agm', 'Month', this.MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join(''))}${sel('agy', 'Year', this.years().map(y => `<option value="${y}">${y}</option>`).join(''))}</div>
        <label class="agk"><input type="checkbox" id="agc" onchange="AGE.check()"><span>I'm <b>18+</b> and I accept the <a onclick="AGE.more('agT')">Terms</a> and <a onclick="AGE.more('agD')">Disclaimer</a></span></label>
        <div class="agm" id="agT" hidden>AllConnect is a free online game for adults. Be respectful: no cheating, scams or abuse. Accounts that break the rules can be held or removed.</div>
        <div class="agm" id="agD" hidden>In-game ₦ is virtual money for fun. It is not real money, an investment or a guarantee. Any real-money payout only happens through the withdrawal seasons, rules and review shown in the app, and can be paused, limited or refused.</div>
        <div class="aerr" id="agerr" role="alert"></div>
        <button class="btn p" id="agok" disabled onclick="AGE.done()">Continue</button></div>`;
    o._next = next; document.body.appendChild(o)
  },
  more(id) { const e = document.getElementById(id); if (e) { document.querySelectorAll('.agm').forEach(x => { if (x !== e) x.hidden = true }); e.hidden = !e.hidden } },
  val() { const v = id => Number((document.getElementById(id) || {}).value); const d = v('agd'), m = (document.getElementById('agm') || {}).value, y = v('agy'); if (!d || m === '' || !y) return null; return { d, m: Number(m), y, age: this.ageOf(d, Number(m), y) } },
  check() {
    const b = document.getElementById('agok'), er = document.getElementById('agerr'), v = this.val(), c = (document.getElementById('agc') || {}).checked; if (!b) return;
    let msg = ''; if (v && v.age === null) msg = 'That date does not exist. Check the day and month.';
    b.disabled = !(v && v.age !== null && c); if (er) er.textContent = msg
  },
  done() {
    const v = this.val(); if (!v || v.age === null) return;
    if (v.age < 18) { this.put(this.UNDER, '1'); const o = document.getElementById('agegate'); if (o) o.remove(); return this.gate() }
    this.put(this.KEY, JSON.stringify({ y: v.y, t: Date.now() }));
    const o = document.getElementById('agegate'), nx = o && o._next; if (o) o.remove(); if (typeof nx === 'function') nx()
  },
  /* signed-in players: make sure the server knows, and ask anyone who never attested */
  async sync() {
    try {
      const r = await NET.api('/api/ac/age'); if (r.attested) { this.put(this.SYNC, '1'); if (!this.ok()) this.put(this.KEY, JSON.stringify({ t: Date.now(), srv: 1 })); return }
      if (!this.ok()) return this.gate(() => this.sync());
      const y = (JSON.parse(this.get(this.KEY) || '{}') || {}).y; if (!y) return this.gate(() => this.sync());
      await NET.api('/api/ac/age', { method: 'POST', body: { birthYear: y } }); this.put(this.SYNC, '1')
    } catch (e) { /* offline or not signed in: try again next visit */ }
  }
};
window.AGE = AGE;
/* Google sign-in is a plain link, so it gets the same check */
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('#gbtn'); if (a && !AGE.ok()) { e.preventDefault(); AGE.gate(() => { location.href = a.href }) } }, true);
