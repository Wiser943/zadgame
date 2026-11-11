/* AllConnect Help app. Help & guide, Replay the walkthrough, Suggestion box and Support live here
   (they used to be scattered). Privacy, notifications and the other switches stay in Settings. */
const HELPAPP = {
  open() {
    PH.view = 'help';
    PH.shell('Help', 'PH.close()', `<div class="abody" id="ab"><p class="hint2">Stuck, curious or got an idea? Everything is here.</p><div class="sgrp">
      ${PH.lrow('Help & guide', 'fa-regular fa-lightbulb', 'HUB.view(\'help\')')}
      ${PH.lrow('Replay the walkthrough', 'fa-regular fa-compass', 'HELPAPP.replay()')}
      ${PH.lrow('Suggestion box', 'fa-regular fa-comment', 'HELPAPP.suggest()')}
      ${PH.lrow('Support', 'fa-regular fa-life-ring', 'HELPAPP.support()')}</div></div>`);
  },
  replay() { PH.closeSheet(); PH.sheet(`<div class="shhd"><b>Replay the walkthrough</b></div><button class="fopt grn" onclick="PH.closeSheet();PH.close();HUB.tour()"><span>🧭 Start the site tour</span><b>›</b></button><button class="fopt" onclick="PH.closeSheet();PH.close();HUB.controls()"><span>👆 Practise the home and map controls</span><b>›</b></button><button class="fopt" onclick="PH.closeSheet();PH.close();HUB.cityTour()"><span>🗺️ Take the city tour</span><b>›</b></button>`) },
  cat: 'feature',
  async suggest() {
    PH.view = 'help-suggest';
    PH.shell('Suggestion box', 'HELPAPP.open()', `<div class="abody" id="ab"><p class="hint2">Tell the team what to add, fix or improve. We read every one.</p>
      <div class="v2seg" id="hscat">${[['feature', 'Idea'], ['bug', 'Bug'], ['improvement', 'Improve'], ['other', 'Other']].map(c => `<button class="${c[0] === this.cat ? 'on' : ''}" onclick="HELPAPP.pick('${c[0]}')">${c[1]}</button>`).join('')}</div>
      <input class="sinput" id="hs_t" placeholder="Short title" maxlength="100" autocomplete="off">
      <textarea class="sinput" id="hs_d" rows="5" maxlength="2000" placeholder="Give us the details (at least 10 characters)"></textarea>
      <div class="aerr" id="hs_e"></div><button class="btn p" id="hs_b" onclick="HELPAPP.send()">Send to the team</button>
      <div class="lab2">YOUR SUGGESTIONS</div><div class="sgrp" id="hs_l"><p class="hint2">Loading…</p></div></div>`);
    this.mine();
  },
  pick(c) { this.cat = c; document.querySelectorAll('#hscat button').forEach((b, i) => b.classList.toggle('on', ['feature', 'bug', 'improvement', 'other'][i] === c)) },
  async send() {
    const t = document.getElementById('hs_t'), d = document.getElementById('hs_d'), e = document.getElementById('hs_e'), b = document.getElementById('hs_b'); if (!t) return;
    e.textContent = ''; b.disabled = true; b.textContent = 'Sending…';
    try { await NET.api('/api/reports/features', { method: 'POST', body: { category: this.cat, title: t.value, details: d.value } }); t.value = ''; d.value = ''; toast('Thank you! Sent to the team 🙏🏾'); this.mine() }
    catch (x) { e.textContent = x.message }
    b.disabled = false; b.textContent = 'Send to the team';
  },
  async mine() {
    try {
      const r = await NET.api('/api/reports/features/mine'), el = document.getElementById('hs_l'); if (!el) return;
      const nm = { feature: 'Idea', bug: 'Bug', improvement: 'Improve', other: 'Other' };
      el.innerHTML = r.reports.length ? r.reports.map(x => `<div class="trow"><span class="tl">${esc(x.title)}<span class="sub" style="display:block;font-size:12px;color:#8a93a6;font-weight:500">${nm[x.category] || ''} · ${esc(x.status || 'new')}</span></span></div>`).join('') : '<p class="hint2">Nothing sent yet.</p>';
    } catch (e) { const el = document.getElementById('hs_l'); if (el) el.innerHTML = '' }
  },
  support() {
    PH.view = 'help-support';
    PH.shell('Support', 'HELPAPP.open()', `<div class="abody" id="ab"><p class="hint2">Stuck on a match, spotted a bug, or something about your ₦ balance looks off? Reach us directly:</p>
      <div class="sgrp"><a class="trow" href="mailto:${SUPPORT_EMAIL}"><span class="ti">✉️</span><span class="tl">Email support</span><span class="chv">›</span></a><a class="trow" href="${SUPPORT_WHATSAPP}" target="_blank" rel="noopener"><span class="ti">💬</span><span class="tl">Chat on WhatsApp</span><span class="chv">›</span></a>
      <button class="trow" onclick="PH.open('police')"><span class="ti">🚓</span><span class="tl">Report a player to the police</span><span class="chv">›</span></button></div></div>`);
  }
};
