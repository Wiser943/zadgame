/* Goals sheet: opens from the goal pill on the home screen and from the goals card on the phone.
   Shows today's hustle (daily bonus), a money dream with progress, and the starter missions (the same quests as Naija Life). */
const GOALS = {
  DREAMS: [[1e6, 'Lekki Landlord', '🏡'], [1e7, 'Island Big Boy', '🏝️'], [1e8, 'Eko Mogul', '🏙️'], [1e9, 'Lagos Legend', '👑']],
  list() { return (window.LAGOS && LAGOS.Q) || [] },
  next() { return this.list().find(q => !q.claimed) || null },
  label() { const l = this.list(); return l.length ? `GOALS · ${l.filter(q => q.claimed).length}/${l.length} DONE` : 'GOALS' },
  nextTitle() { const n = this.next(), l = this.list(); return n ? n.title : l.length ? 'All goals done' : NG.say('Start your Naija life', 'Start your Naija life o') },
  boot() { if (this.t) return; this.t = setInterval(() => this.refresh(), 120000); this.refresh() },
  async refresh() { if (!window.LAGOS) return; await LAGOS.loadQuests(); this.paintPill(); if (typeof drawApps === 'function') drawApps(); if (SHEET.isOpen('goals')) SHEET.paint() },
  /* the pill under the balance: shows the next goal */
  paintPill() {
    const t = document.getElementById('q1t'), s = document.getElementById('q1s'); if (!t || !s || !this.list().length) return;
    const n = this.next(); t.textContent = n ? n.title : 'All goals done 🏆'; s.textContent = n ? n.hint : 'Tap to see your dream';
  },
  open(tab) {
    if (window.LAGOS && !LAGOS.Q) LAGOS.loadQuests().then(() => { this.paintPill(); if (SHEET.isOpen('goals')) SHEET.paint() });
    SHEET.open({ id: 'goals', title: '🎯 Goals', tab: tab || 'goals', tabs: [{ id: 'goals', label: 'Goals' }, { id: 'needs', label: 'Needs' }], body: t => t === 'needs' ? this.needsHtml() : this.goalsHtml() });
  },
  head() {
    const nm = (typeof NET !== 'undefined' && NET.user && NET.user.displayName) || 'You', mood = ((document.getElementById('mood') || {}).textContent || '').replace(/^\S+\s/, '');
    return `<div class="glh">${window.PH && PH.av ? PH.av({ avatar: (typeof NET !== 'undefined' && NET.user && NET.user.avatar) || '', displayName: nm }) : `<span class="avi" style="background:#6366f1">${UI.esc(nm[0] || '?').toUpperCase()}</span>`}<div><b>${UI.esc(nm)}</b><small>${UI.esc(mood || 'Happy')}</small></div></div>`;
  },
  needsHtml() {
    return this.head() + `<div class="gln">${S.needs.map((v, i) => `<div><span>${NEED[i]} ${['Hunger', 'Energy', 'Fun', 'Friends', 'Hygiene', 'Bladder'][i]}</span>${UI.bar(v * 100)}</div>`).join('')}</div><p class="lgnote">Eat, rest, have fun and see friends to keep these up.</p>`;
  },
  goalsHtml() {
    const d = window.LAGOS && LAGOS.d, dl = d && d.daily, ready = d ? d.quests.claimable : 0, cash = S.cash || 0;
    const dr = this.DREAMS.find(x => cash < x[0]), done = !dr, cur = dr || this.DREAMS[this.DREAMS.length - 1], pct = done ? 100 : Math.max(2, Math.min(100, cash / cur[0] * 100));
    const hustle = `<div class="glhus" onclick="LAGOS.open('today')"><span class="gli">🎁</span><div><b>Today's Hustle</b><small>${dl ? (dl.claimable ? 'Daily reward ready' : 'Daily reward collected') : 'Loading…'} · ${ready ? ready + ' mission' + (ready > 1 ? 's' : '') + ' ready to claim' : 'new missions below'}</small></div><span class="fa-solid fa-chevron-right"></span></div>`;
    const dream = `<div class="gldr"><small>LIFETIME DREAM</small><div class="gldt"><span>${cur[2]}</span><div><b>${cur[1]}</b><small>Grow your balance to ${UI.fmt(cur[0])}.</small></div></div><div class="glpb"><i style="width:${pct}%"></i></div><em>${done ? 'Achieved 🏆' : UI.fmt(cash) + ' of ' + UI.fmt(cur[0])}</em></div>`;
    const miss = window.LAGOS && LAGOS.Q ? LAGOS.questsHtml() : '<p class="empty">Loading…</p>';
    return this.head() + hustle + dream + `<h4>Missions</h4>` + miss;
  }
};
window.GOALS = GOALS;
