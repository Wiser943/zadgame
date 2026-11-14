/* Age check: before anyone signs in or creates an account they say when they were born and attest they are 18 or older.
   The server keeps the birth year (18+ rule) and the day + month (birthday card) (routes/acage.js). Also asks for home state and current state. */
const AGE = {
  KEY: 'ac:age18', UNDER: 'ac:age:under', SYNC: 'ac:age18:sync',
  get(k) { try { return localStorage.getItem(k) } catch (e) { return null } },
  put(k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  ok() { return !!this.get(this.KEY) },
  hasFull() { try { const v = JSON.parse(this.get(this.KEY) || '{}'); return v && v.y != null && v.m != null && v.d != null } catch (e) { return false } },
  STATES: ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "Outside Nigeria"],
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
      : `<div class="agc"><div class="agi">🪪</div><h2>Quick check</h2><p class="agp">Your date of birth</p><p class="agp" style="font-size:12.5px;margin-top:-6px">🎂 We use it to celebrate you on your birthday. You can turn that off in Settings.</p>
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
    this.put(this.KEY, JSON.stringify({ y: v.y, m: v.m, d: v.d, t: Date.now() }));
    const o = document.getElementById('agegate'), nx = o && o._next; if (o) o.remove(); if (typeof nx === 'function') nx()
  },
  /* signed-in players: make sure the server knows, and ask anyone who never gave their birthday or their states */
  async sync() {
    try {
      let r = await NET.api('/api/ac/age');
      if (!(r.attested && r.hasBirthday)) {
        const st = JSON.parse(this.get(this.KEY) || '{}') || {};
        if (!st.y || st.m == null || st.d == null) return this.gate(() => this.sync());        // ask (again) for the full date of birth
        await NET.api('/api/ac/age', { method: 'POST', body: { birthYear: st.y, birthMonth: st.m, birthDay: st.d } }); this.put(this.SYNC, '1');
        r = await NET.api('/api/ac/age');
      } else { this.put(this.SYNC, '1'); if (!this.ok()) this.put(this.KEY, JSON.stringify({ t: Date.now(), srv: 1 })) }
      if (!r.hasStates) this.states()
    } catch (e) { /* offline or not signed in: try again next visit */ }
  },
  /* "which state are you from, and which state are you in now?" for players who signed up before we asked */
  states() {
    if (document.getElementById('agstates')) return;
    const o = document.createElement('div'); o.id = 'agstates'; o.className = 'agb'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Your states');
    const sel = (id, ph) => `<label class="ags"><span class="sr-only">${ph}</span><select id="${id}" onchange="AGE.stCheck()"><option value="">${ph}</option>${this.STATES.map(x => `<option>${x}</option>`).join('')}</select></label>`;
    o.innerHTML = `<div class="agc"><div class="agi">📍</div><h2>Where are you?</h2><p class="agp">So we can show you what is happening near you.</p><div style="display:grid;gap:10px">${sel('stO', 'Which state are you from?')}${sel('stC', 'Which state are you in now?')}</div><div class="aerr" id="sterr" role="alert"></div><button class="btn p" id="stok" disabled onclick="AGE.stSave()">Continue</button></div>`;
    document.body.appendChild(o)
  },
  stCheck() { const b = document.getElementById('stok'); if (b) b.disabled = !(document.getElementById('stO').value && document.getElementById('stC').value) },
  async stSave() {
    const b = document.getElementById('stok'); b.disabled = true;
    try { await NET.api('/api/ac/v2/states', { method: 'POST', body: { origin: document.getElementById('stO').value, current: document.getElementById('stC').value } }); const o = document.getElementById('agstates'); if (o) o.remove() }
    catch (e) { const er = document.getElementById('sterr'); if (er) er.textContent = e.message; b.disabled = false }
  }
};
window.AGE = AGE;
/* Google sign-in is a plain link, so it gets the same check */
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('#gbtn'); if (a && !AGE.ok()) { e.preventDefault(); AGE.gate(() => { location.href = a.href }) } }, true);
