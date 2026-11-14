/* Suggestion box (lives in Settings) and Support. Help & guide and Replay the walkthrough live in the Guide app.
   A friendly nudge now and then asks the player for an idea. */
const HELPAPP = {
  cat: 'feature',
  replay() { PH.sheet(`<div class="shhd"><b>Replay the walkthrough</b></div><button class="fopt grn" onclick="PH.closeSheet();PH.close();HUB.tour()"><span>🧭 Start the site tour</span><b>›</b></button><button class="fopt" onclick="PH.closeSheet();PH.close();HUB.controls()"><span>👆 Practise the home and map controls</span><b>›</b></button><button class="fopt" onclick="PH.closeSheet();PH.close();HUB.cityTour()"><span>🗺️ Take the city tour</span><b>›</b></button>`) },
  async suggest() {
    PH.view = 'help-suggest';
    const cats = [['feature', '💡', 'Idea'], ['bug', '🐞', 'Bug'], ['improvement', '✨', 'Improve'], ['other', '💬', 'Other']];
    PH.shell('Suggestion box', 'PH.settings()', `<div class="abody" id="ab">
      <div class="sgx-hero"><span>💌</span><div><b>Tell the team</b><p>What should we add, fix or make better? We read every message.</p></div></div>
      <div class="sgx-lab">What is it about?</div>
      <div class="sgx-chips" id="hscat">${cats.map(c => `<button type="button" class="${c[0] === this.cat ? 'on' : ''}" data-c="${c[0]}" onclick="HELPAPP.pick('${c[0]}')"><i>${c[1]}</i><span>${c[2]}</span></button>`).join('')}</div>
      <div class="sgx-lab">Title</div>
      <input class="sgx-in" id="hs_t" placeholder="A short headline" maxlength="100" autocomplete="off">
      <div class="sgx-lab">Details <em id="hs_n">0 / 2000</em></div>
      <textarea class="sgx-in sgx-ta" id="hs_d" rows="5" maxlength="2000" placeholder="Describe it: what happened, or what you would love to see (at least 10 characters)" oninput="document.getElementById('hs_n').textContent=this.value.length+' / 2000'"></textarea>
      <div class="sgx-err" id="hs_e"></div>
      <button class="sgx-send" id="hs_b" onclick="HELPAPP.send()">Send to the team</button>
      <div class="sgx-lab" style="margin-top:22px">Your suggestions</div><div class="sgx-list" id="hs_l"><p class="sgx-empty">Loading…</p></div></div>`);
    this.mine();
  },
  pick(c) { this.cat = c; document.querySelectorAll('#hscat button').forEach(b => b.classList.toggle('on', b.dataset.c === c)) },
  async send() {
    const t = document.getElementById('hs_t'), d = document.getElementById('hs_d'), e = document.getElementById('hs_e'), b = document.getElementById('hs_b'); if (!t) return;
    e.textContent = ''; if (t.value.trim().length < 3) { e.textContent = 'Add a short title first.'; return } if (d.value.trim().length < 10) { e.textContent = 'Give us a few more details (at least 10 characters).'; return }
    b.disabled = true; b.textContent = 'Sending…';
    try { await NET.api('/api/reports/features', { method: 'POST', body: { category: this.cat, title: t.value, details: d.value } }); t.value = ''; d.value = ''; document.getElementById('hs_n').textContent = '0 / 2000'; toast('Thank you! Sent to the team 🙏🏾'); this.mine() }
    catch (x) { e.textContent = x.message }
    b.disabled = false; b.textContent = 'Send to the team';
  },
  async mine() {
    const el = () => document.getElementById('hs_l');
    try {
      const r = await NET.api('/api/reports/features/mine'); if (!el()) return;
      const nm = { feature: '💡 Idea', bug: '🐞 Bug', improvement: '✨ Improve', other: '💬 Other' };
      el().innerHTML = r.reports.length ? r.reports.map(x => `<div class="sgx-item"><b>${esc(x.title)}</b><span><em>${nm[x.category] || ''}</em><u class="st-${esc(x.status || 'new')}">${esc(x.status || 'new')}</u></span></div>`).join('') : '<p class="sgx-empty">Nothing sent yet. Your first idea could shape the game.</p>';
    } catch (e) { if (el()) el().innerHTML = '' }
  },
  support() {
    PH.view = 'help-support';
    PH.shell('Support', 'PH.guide()', `<div class="abody" id="ab"><p class="hint2">Stuck on a match, spotted a bug, or something about your ₦ balance looks off? Reach us directly:</p>
      <div class="sgrp"><a class="trow" href="mailto:${SUPPORT_EMAIL}"><span class="ti">✉️</span><span class="tl">Email support</span><span class="chv">›</span></a><a class="trow" href="${SUPPORT_WHATSAPP}" target="_blank" rel="noopener"><span class="ti">💬</span><span class="tl">Chat on WhatsApp</span><span class="chv">›</span></a>
      <button class="trow" onclick="PH.open('police')"><span class="ti">🚓</span><span class="tl">Report a player to the police</span><span class="chv">›</span></button></div></div>`);
  },
  /* A gentle "got an idea?" card, at most once every 3 days, only on the home screen after a few minutes of play. */
  nudge() {
    try {
      if (document.getElementById('sgnudge') || document.querySelector('.wnmodal')) return;
      const last = Number(localStorage.getItem('sugNudgeAt') || 0); if (Date.now() - last < 3 * 86400e3) return;
      if (typeof S === 'undefined' || S.page !== 'home' || !window.NET || !NET.user) return;
      localStorage.setItem('sugNudgeAt', String(Date.now()));
      const d = document.createElement('div'); d.id = 'sgnudge'; d.className = 'sgnudge';
      d.innerHTML = `<div class="sgn-card"><div class="sgn-em">💡</div><b>Got an idea?</b><p>Tell us what to add or fix. Your suggestion goes straight to the team.</p><button class="sgn-go" onclick="HELPAPP.nudgeGo()">Share an idea</button><button class="sgn-no" onclick="HELPAPP.nudgeClose()">Maybe later</button></div>`;
      document.body.appendChild(d); requestAnimationFrame(() => d.classList.add('on'));
    } catch (e) {}
  },
  nudgeClose() { const d = document.getElementById('sgnudge'); if (d) { d.classList.remove('on'); setTimeout(() => d.remove(), 250) } },
  nudgeGo() { this.nudgeClose(); try { nav('phone'); setTimeout(() => { PH.open('settings'); setTimeout(() => HELPAPP.suggest(), 80) }, 60) } catch (e) {} }
};
setTimeout(() => { setInterval(() => HELPAPP.nudge(), 90000) }, 5 * 60000);

/* "See what's new in AllConnect": a stylish card on the home screen the first time a new version is out. */
const WNEW = {
  async check() {
    try {
      if (!window.HUB || !window.NET || !NET.user || typeof S === 'undefined' || S.page !== 'home') return;
      if (document.querySelector('.wnmodal,#sgnudge,#rcm,.rcm') || document.getElementById('hub') && document.getElementById('hub').style.display === 'flex') return;
      if (!HUB.C) { if (!(await HUB.ensure())) return }
      const c = (HUB.C.changelog || [])[0]; if (!c) return;
      const seen = localStorage.getItem('wnSeen');
      if (seen === c.v) return;
      const made = NET.user.createdAt ? new Date(NET.user.createdAt).getTime() : 0;
      if (seen === null && made && Date.now() - made < 2 * 86400e3) { localStorage.setItem('wnSeen', c.v); return }     // brand new players have nothing to catch up on
      this.show(c);
    } catch (e) {}
  },
  show(c) {
    const items = (c.items || []).slice(0, 4).map(t => `<li><i>✓</i><span>${HUB.esc ? HUB.esc(t) : t}</span></li>`).join('');
    const d = document.createElement('div'); d.className = 'wnmodal';
    d.innerHTML = `<div class="wn-card" role="dialog" aria-modal="true"><div class="wn-top"><div class="wn-spark">✨</div><span class="wn-ver">Version ${HUB.esc ? HUB.esc(c.v) : c.v}</span><h3>See what’s new in AllConnect</h3><p>${HUB.esc ? HUB.esc(c.title || '') : (c.title || '')}</p></div><ul class="wn-list">${items}</ul><button class="wn-go" onclick="WNEW.go()">See what’s new</button><button class="wn-no" onclick="WNEW.close()">Not now</button></div>`;
    document.body.appendChild(d); requestAnimationFrame(() => d.classList.add('on'));
  },
  mark() { try { const c = (HUB.C.changelog || [])[0]; if (c) localStorage.setItem('wnSeen', c.v) } catch (e) {} },
  close() { this.mark(); const d = document.querySelector('.wnmodal'); if (d) { d.classList.remove('on'); setTimeout(() => d.remove(), 250) } },
  go() { this.close(); try { HUB.view('changelog') } catch (e) {} }
};
setTimeout(() => { WNEW.check(); setInterval(() => WNEW.check(), 45000) }, 12000);
