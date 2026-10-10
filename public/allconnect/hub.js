/* AllConnect Hub (client). One place for: the day-one promise, new-player setup, 60-second tour, "What can I do now?",
   beginner missions, life timeline, newspaper + ticker, near me, help desk, roadmap + voting, changelog, lore, anthem, status,
   invites, controls tutorial and the returning-player recap.
   All screens are built on SHEET (ui.js); results are shown with CARD. Numbers and rewards come from /api/ac/hub (server decides). */
const HUB = {
  me: null, C: null, news: null, su: { step: 0, hood: '', job: '', hobby: '', username: '', seed: 0 }, tk: { i: 0, lines: [] },
  api(p, o) { return NET.api('/api/ac/hub' + p, o) },
  esc: s => UI.esc(s), fmt: n => UI.fmt(n),
  busy() { return SHEET.isOpen() || !!CARD.cur || !!document.getElementById('ctl') },

  /* ---------- boot (after the player taps Continue) ---------- */
  async boot() {
    if (this.booted) return; this.booted = true;
    try { await Promise.all([this.loadContent(), this.loadMe()]) } catch (e) { return }
    this.paintNow(); this.startTicker();
    setInterval(() => { if (!document.hidden) this.loadMe(true) }, 120000);
    await CARD.fetch();
    if (!this.me.hub.done) return this.setup(0);
    if (!S.gender) return this.charSheet();
    await this.afterSetup();
  },
  /* things that pop up once the setup is done, one at a time */
  async afterSetup() {
    this.redeemRef();
    const m = this.me;
    if (m.recap) return this.recap();
    if (m.parcel.claimable) return this.parcelCard();
  },
  async loadContent() { if (!this.C) this.C = await this.api('/content') },
  async loadMe(quiet) {
    const before = this.me && this.me.missions.claimable;
    this.me = await this.api('/me');
    if (typeof S !== 'undefined' && Number.isFinite(this.me.cash)) S.cash = this.me.cash;
    this.paintNow();
    if (quiet && before != null && this.me.missions.claimable > before && !this.busy()) toast('🎯 Mission done! Open "What can I do now?" to claim.');
    return this.me;
  },
  /* the home screen pill */
  paintNow() {
    const el = document.getElementById('q4'), m = this.me; if (!el || !m) return;
    el.style.display = ''; const n = m.todo || 0;
    const dot = el.querySelector('.lgdot'); if (dot) dot.remove();
    if (n) el.insertAdjacentHTML('beforeend', `<em class="lgdot">${n}</em>`);
  },
  startTicker() {
    const sub = document.getElementById('q4sub'); if (!sub) return;
    const pull = async () => { try { this.news = await this.api('/news'); this.tk.lines = this.news.ticker } catch (e) {} };
    pull(); setInterval(pull, 120000);
    setInterval(() => { const L = this.tk.lines; if (!L.length || document.hidden) return; this.tk.i = (this.tk.i + 1) % L.length; sub.classList.remove('in'); void sub.offsetWidth; sub.textContent = L[this.tk.i]; sub.classList.add('in') }, 5200);
  },

  /* ---------- "What can I do now?" ---------- */
  async now() {
    await this.loadMe().catch(() => {}); if (!this.me) return toast('Loading…');
    this.sheet('What can I do now?', () => this.nowHtml(), { id: 'now' });
  },
  sheet(title, body, o = {}) { SHEET.open({ id: o.id || 'hub', title, body, back: o.back === false ? '' : (o.back || 'HUB.menu()'), wide: o.wide }) },
  nowHtml() {
    const m = this.me, C = this.C, th = C.theme, ev = LAGOS && LAGOS.d ? LAGOS.d : null, h = [];
    if (!m.hub.done) h.push(UI.row({ ic: UI.ic('user-plus', '#6366f1', 38), title: 'Finish your welcome setup', sub: 'Pick your area, job and hobby. Takes a minute.', right: '<span class="lgbtn">Start</span>', go: 'HUB.setup(0)' }));
    if (m.parcel.claimable) h.push(UI.row({ ic: UI.ic('gift', '#f59e0b', 38), title: `Welcome parcel, day ${m.parcel.day} of ${m.parcel.total}`, sub: 'Free ₦ every day in your first week.', right: `<button class="lgbtn" onclick="event.stopPropagation();HUB.parcel(this)">+${this.fmt(m.parcel.amount)}</button>` }));
    if (ev && ev.daily && ev.daily.claimable) h.push(UI.row({ ic: UI.ic('calendar-check', '#22b573', 38), title: 'Daily bonus is ready', sub: `Day ${ev.daily.streak}. Keep your streak going.`, right: `<span class="lgbtn">Open</span>`, go: "SHEET.close();LAGOS.open('today')" }));
    if (ev && ev.bills && ev.bills.count) h.push(UI.row({ ic: UI.ic('bolt', '#e5484d', 38), title: `${ev.bills.count} bill${ev.bills.count > 1 ? 's' : ''} to pay`, sub: ev.bills.overdue ? 'Some are late. Pay to avoid a power cut.' : 'Pay before Sunday night.', right: '<span class="lgbtn">Pay</span>', go: "SHEET.close();LAGOS.open('bills')" }));
    const tasks = m.tasks.slice(0, 4);
    h.push(`<h4>Your next steps</h4>`);
    h.push(tasks.length ? tasks.map(t => this.missionRow(t)).join('') : '<p class="empty">All beginner missions done. You are a real Lagosian now!</p>');
    h.push(`<div class="hbanner" style="--c:${th.color}">${UI.ic(th.fa, th.color, 40)}<div><b>${this.esc(th.title)}</b><small>${this.esc(th.text)} <i>Goal: ${this.esc(th.goal)}</i></small></div><button class="lgbtn" onclick="HUB.themeGo('${th.go}')">Go</button></div>`);
    if (m.protection.active) h.push(`<div class="hprot"><span class="fa-solid fa-shield-heart"></span><div><b>New-player protection: ${m.protection.daysLeft} day${m.protection.daysLeft === 1 ? '' : 's'} left</b><small>Transfers up to ${this.fmt(m.protection.transferMax)}, investments up to ${this.fmt(m.protection.investMax)}, no ad booking, and a free Beginner queue in GameHub.</small></div></div>`);
    h.push(`<div class="hmore"><button onclick="HUB.menu()"><span class="fa-solid fa-grid-2"></span> More in the city</button></div>`);
    return h.join('');
  },
  themeGo(g) { SHEET.close(); ({ buy: () => nav('buy'), jobs: () => { nav('phone'); setTimeout(() => PH.open('jobs'), 0) }, contacts: () => { nav('phone'); setTimeout(() => PH.open('contacts'), 0) }, gamehub: () => openHub(), gist: () => { nav('phone'); setTimeout(() => PH.open('gist'), 0) }, invest: () => { nav('phone'); setTimeout(() => PH.open('invest'), 0) } }[g] || (() => {}))() },

  /* ---------- hub menu: every city screen ---------- */
  menu() {
    const t = (fa, c, name, v, badge) => `<button class="htile" onclick="HUB.view('${v}')">${UI.ic(fa, c, 44)}<b>${name}</b>${badge ? `<i>${badge}</i>` : ''}</button>`;
    const m = this.me || { missions: {}, hub: {} };
    this.sheet('Lagos hub', () => `<p class="hlead">${this.esc(this.C.promise.tagline)}</p><div class="hgrid">
      ${t('list-check', '#22b573', 'Missions', 'missions', m.missions.claimable || '')}${t('gift', '#f59e0b', 'Timeline', 'timeline')}${t('newspaper', '#0ea5e9', 'Newspaper', 'news')}${t('location-crosshairs', '#e8337a', 'Near me', 'near')}
      ${t('gamepad', '#e5484d', 'Play path', 'play')}${t('map', '#6366f1', 'Map legend', 'legend')}${t('circle-question', '#64748b', 'Help desk', 'help')}${t('road', '#10b981', 'Roadmap', 'roadmap')}
      ${t('check-to-slot', '#8b5cf6', 'Vote', 'vote')}${t('clock-rotate-left', '#f97316', 'What\'s new', 'changelog')}${t('book-open', '#0f766e', 'Lore', 'lore')}${t('music', '#d946ef', 'Anthem', 'anthem')}
      ${t('user-group', '#3b82f6', 'Invite', 'invite')}${t('hand-pointer', '#f59e0b', 'Controls', 'controls')}${t('route', '#14b8a6', 'City tour', 'tour')}${t('signal', '#22b573', 'Status', 'status')}
      ${t('key', '#475569', 'Recovery', 'recovery')}${t('house-flag', '#1d4ed8', 'About', 'promise')}</div>`, { id: 'menu', back: false });
  },
  view(v) {
    const f = this['v_' + v]; if (!f) return;
    if (v === 'controls') { SHEET.close(); return this.controls() }
    if (v === 'tour') { SHEET.close(); return this.tour() }
    f.call(this);
  },

  /* ---------- missions ---------- */
  actFor: { m_hood: 'HUB.setup(0)', m_job: "SHEET.close();nav('phone');setTimeout(()=>PH.open('jobs'),0)", m_shift: "SHEET.close();nav('phone');setTimeout(()=>PH.open('jobs'),0)", m_decor: "SHEET.close();nav('buy')", m_friend: "SHEET.close();nav('phone');setTimeout(()=>PH.open('contacts'),0)", m_group: "SHEET.close();nav('phone');setTimeout(()=>{PH.open('messages');PH.messages('groups')},0)", m_place: "HUB.view('play')", m_human: "HUB.view('play')", m_streak: "HUB.view('play')", m_bill: "SHEET.close();LAGOS.open('bills')" },
  missionRow(t) {
    const pr = t.progress ? `<small>${this.esc(t.hint)} (${t.progress[0]}/${t.progress[1]})</small>` : `<small>${t.claimed ? 'Claimed' : this.esc(t.hint)}</small>`;
    const right = t.claimed ? '<span class="lgok"><span class="fa-solid fa-check"></span></span>' : t.done ? `<button class="lgbtn" onclick="event.stopPropagation();HUB.claim('${t.id}',this)">+${this.fmt(t.reward)}</button>` : `<span class="lgrw">${this.fmt(t.reward)}</span>`;
    return `<div class="lgq ${t.claimed ? 'cl' : t.done ? 'rd' : ''}" ${!t.done && !t.claimed ? `onclick="${this.actFor[t.id] || ''}" style="cursor:pointer"` : ''}>${UI.ic(t.claimed ? 'check' : t.fa, t.claimed ? '#22b573' : t.done ? '#f59e0b' : '#94a3b8', 38)}<div><b>${this.esc(t.title)}</b>${pr}</div>${right}</div>`;
  },
  async claim(id, btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await this.api('/missions/claim', { method: 'POST', body: { id } });
      this.setCash(r.cash); await this.loadMe();
      CARD.show({ icon: '🎯', title: 'Mission complete', text: r.title, lines: [['Reward', this.fmt(r.reward)], ['Done', `${this.me.missions.done} of ${this.me.missions.total}`]], tone: 'gold', btn: 'Nice one', force: true });
      if (SHEET.isOpen('missions') || SHEET.isOpen('now')) SHEET.paint();
    } catch (e) { toast(e.message); if (btn) btn.disabled = false }
  },
  setCash(c) { if (typeof S !== 'undefined' && Number.isFinite(c)) { S.cash = c; if (typeof render === 'function') render() } },
  async v_missions() {
    await this.loadMe().catch(() => {});
    this.sheet('Missions', () => {
      const m = this.me, ms = m.missions, groups = [['start', 'Getting started'], ['home', 'Home'], ['social', 'Friends'], ['games', 'Games'], ['city', 'City']];
      const earn = ms.list.filter(x => !x.claimed).reduce((s, x) => s + x.reward, 0);
      return `<div class="lgprog"><div><b>${ms.done} of ${ms.total} done</b><small>${earn ? this.fmt(earn) + ' still to earn' : 'Every reward collected!'}</small></div><i style="width:${Math.round(ms.done / ms.total * 100)}%"></i></div>${this.pathHtml(m.map)}` +
        groups.map(g => { const l = ms.list.filter(x => x.group === g[0]); return l.length ? `<h4>${g[1]}</h4>` + l.map(x => this.missionRow(x)).join('') : '' }).join('');
    }, { id: 'missions' });
  },
  /* onboarding progress map */
  pathHtml(map) {
    const cur = map.findIndex(n => !n.done);
    return `<div class="hpath">${map.map((n, i) => `<div class="hnode ${n.done ? 'done' : i === cur ? 'cur' : ''}"><span><span class="fa-solid fa-${n.done ? 'check' : n.fa}"></span></span><small>${this.esc(n.title)}</small></div>`).join('')}</div>`;
  },

  /* ---------- welcome parcel ---------- */
  parcelCard() {
    const p = this.me.parcel;
    CARD.show({ icon: '🎁', title: 'Welcome parcel', text: `Day ${p.day} of ${p.total}. A little something to settle into Lagos.`, lines: [['Inside', this.fmt(p.amount)]], tone: 'gold', btn: 'Collect ' + this.fmt(p.amount), onClose: () => this.parcel() });
  },
  async parcel(btn) {
    if (btn) btn.disabled = true;
    try { const r = await this.api('/parcel', { method: 'POST' }); this.setCash(r.cash); toast('🎁 +' + this.fmt(r.amount)); await this.loadMe(); if (SHEET.isOpen('now')) SHEET.paint() }
    catch (e) { toast(e.message); if (btn) btn.disabled = false }
  },

  /* ---------- returning player ---------- */
  recap() {
    const r = this.me.recap; if (!r) return;
    const lines = [['Away for', r.days >= 1 ? r.days + ' day' + (r.days > 1 ? 's' : '') : 'a few hours'], ['Money received', this.fmt(r.earned)]];
    if (r.unread) lines.push(['Unread messages', String(r.unread)]); if (r.bills) lines.push(['Bills waiting', String(r.bills)]);
    lines.push(['City right now', r.event.icon + ' ' + r.event.title]);
    CARD.show({ icon: '👋', title: 'Welcome back!', text: r.event.pidgin + (r.gift ? ' We kept a little gift for you.' : ''), lines, tone: 'info', btn: r.gift ? 'Collect ' + this.fmt(r.gift) : 'Continue', force: true, onClose: async () => {
      try { const a = await this.api('/recap/ack', { method: 'POST' }); if (a.gift) { this.setCash(a.cash); CARD.show({ icon: '🎉', title: 'Welcome back event', text: 'Lagos missed you. Here is your return gift.', lines: [['Gift', this.fmt(a.gift)]], tone: 'gold', btn: 'Thank you' }) } } catch (e) {}
      this.me.recap = null; if (this.me.parcel.claimable) setTimeout(() => this.parcelCard(), 400);
    } });
  },

  /* ---------- new-player setup ---------- */
  setup(step) {
    const su = this.su; su.step = step == null ? su.step : step;
    if (!this.C) return;
    if (!su.name) su.name = (NET.user && NET.user.displayName) || '';
    if (su.askChar == null) su.askChar = !S.gender;     /* the character is chosen once, on the username step */
    SHEET.open({ id: 'setup', title: 'Welcome to Lagos', body: () => this.setupHtml(), after: () => { if (this.su.step === 4 && this.su.askChar) initCharPicker(); else stopPreviews() }, onClose: () => { if (!this.me.hub.done && !this._skipped) { this._skipped = true; toast('You can finish setup any time from "What can I do now?"'); this.afterSkip() } } });
  },
  afterSkip() { if (this.me.parcel.claimable) setTimeout(() => this.parcelCard(), 500) },
  setupHtml() {
    const su = this.su, C = this.C, st = su.step, total = 5, dots = `<div class="hdots">${Array.from({ length: total }, (_, i) => `<i class="${i < st ? 'done' : i === st ? 'on' : ''}"></i>`).join('')}</div>`;
    const nextBtn = (ok, label) => `<button class="rbigbtn" ${ok ? '' : 'disabled'} onclick="HUB.setupNext()">${label || 'Continue'}</button>`;
    const back = st > 0 ? `<button class="hlink" onclick="HUB.setup(${st - 1})">‹ Back</button>` : '';
    const pick = (list, key, fn) => `<div class="hopts">${list.map(o => `<button class="hopt ${su[key] === o.id ? 'on' : ''}" onclick="HUB.pick('${key}','${o.id}')"><span class="hem">${o.emoji || ''}</span><b>${this.esc(o.name)}</b><small>${this.esc(fn(o))}</small></button>`).join('')}</div>`;
    if (st === 0) return `${dots}<div class="hhero"><div class="hbig">🏙️</div><h3>${this.esc(C.promise.tagline)}</h3><p>${this.esc(C.promise.line)}</p></div><ul class="hprom">${C.promise.day1.map(x => `<li><span class="fa-solid fa-circle-check"></span>${this.esc(x)}</li>`).join('')}</ul>${nextBtn(true, 'Set up my life (1 minute)')}<button class="hlink c" onclick="SHEET.close()">Skip for now</button>`;
    if (st === 1) return `${dots}<h3 class="hq">Where will you live?</h3>${pick(C.hoods, 'hood', o => o.vibe)}${nextBtn(!!su.hood)}${back}`;
    if (st === 2) return `${dots}<h3 class="hq">Choose a starter job</h3><p class="hsub">You can switch any time in Phone → Jobs.</p>${pick(C.jobs, 'job', o => `${o.startTitle} · ${this.fmt(o.startPay)} per shift`)}${nextBtn(!!su.job)}${back}`;
    if (st === 3) return `${dots}<h3 class="hq">What do you love?</h3><p class="hsub">We use this to suggest missions and a username.</p>${pick(C.hobbies, 'hobby', () => '')}${nextBtn(!!su.hobby)}${back}`;
    if (st === 4) {
      if (!su.names) this.loadNames();
      const names = su.names || [];
      return `${dots}<h3 class="hq">Pick a username</h3><p class="hsub">Friends find you with this. 3 to 16 letters, numbers or _</p><div class="hnames">${names.map(n => `<button class="${su.username === n ? 'on' : ''}" onclick="HUB.pickName('${n}')">@${n}</button>`).join('') || '<small>Finding names…</small>'}<button class="hre" onclick="HUB.loadNames(true)"><span class="fa-solid fa-rotate"></span></button></div><input class="sinput" id="hun" placeholder="or type your own" value="${this.esc(su.username)}" maxlength="16" autocapitalize="off" autocomplete="off" oninput="HUB.su.username=this.value.trim().replace(/^@/,'').toLowerCase();HUB.syncGo()">${su.askChar ? charPickerHtml() : ''}<div id="herr" class="aerr"></div><button class="rbigbtn" id="hgo" ${this.goOk() ? '' : 'disabled'} onclick="HUB.finishSetup(this)">Move into Lagos</button>${back}`;
    }
    return '';
  },
  goOk() { return !!this.su.username && (!this.su.askChar || !!S.gender) },
  syncGo() { const b = document.getElementById('hgo'); if (b) b.disabled = !this.goOk() },
  /* people who finished setup before the character picker existed get it once */
  charSheet() {
    SHEET.open({ id: 'character', title: 'Choose your character', body: () => charPickerHtml() + '<button class="rbigbtn" onclick="SHEET.close()">Done</button>', after: () => initCharPicker(),
      onClose: () => { if (!S.gender) setGender('male'); this.afterSetup() } });
  },
  pick(k, v) { this.su[k] = v; SHEET.paint() },
  pickName(n) { this.su.username = n; SHEET.paint() },
  async loadNames(again) {
    if (again) this.su.seed++;
    try { const r = await this.api('/usernames', { method: 'POST', body: { name: this.su.name, hobby: this.su.hobby, hood: this.su.hood, seed: this.su.seed } }); this.su.names = r.names; if (!this.su.username && r.names[0]) this.su.username = r.names[0]; if (SHEET.isOpen('setup')) SHEET.paint() } catch (e) { this.su.names = [] }
  },
  setupNext() { this.setup(this.su.step + 1) },
  async finishSetup(btn) {
    const su = this.su, err = document.getElementById('herr'); if (btn) btn.disabled = true; if (err) err.textContent = '';
    try {
      const r = await this.api('/onboard', { method: 'POST', body: { hood: su.hood, job: su.job, hobby: su.hobby, username: su.username, gender: su.askChar ? S.gender : undefined } });
      stopPreviews(); this.su.askChar = false; this._skipped = true; await this.loadMe(); try { if (window.JOBS) JOBS.load() } catch (e) {}
      SHEET.open({ id: 'recovery', title: 'You are in!', body: () => this.recoveryHtml(r.recovery, r.username) });
    } catch (e) { if (err) err.textContent = e.message; if (btn) btn.disabled = false }
  },
  recoveryHtml(code, uname) {
    const nice = code ? code.replace(/(.{4})(?=.)/g, '$1-') : '';
    return `<div class="hhero"><div class="hbig">🎉</div><h3>Welcome, @${this.esc(uname)}</h3><p>Save your recovery code. It is the one-tap way back into your account if you forget your password.</p></div>
      ${code ? `<div class="hcode" id="hcode">${nice}</div><button class="rbigbtn" onclick="HUB.copy('${nice}',this)"><span class="fa-solid fa-copy"></span> Copy my code</button><p class="hsub">We show it once. Screenshot it or paste it in your notes.</p>` : ''}
      <button class="rbigbtn ghost" onclick="SHEET.close();HUB.tour(true)">Take the 60-second tour</button><button class="hlink c" onclick="SHEET.close();HUB.afterSetup()">Skip the tour</button>`;
  },
  async copy(text, btn) {
    try { await navigator.clipboard.writeText(text); if (btn) btn.innerHTML = '<span class="fa-solid fa-check"></span> Copied'; toast('Copied ✓') } catch (e) { toast('Press and hold the text to copy') }
  },
  async redeemRef() {
    let c = ''; try { c = localStorage.getItem('ac:ref') || '' } catch (e) {}
    if (!c || !this.me.hub.done || this.me.hub.invitedBy) return;
    try { const r = await this.api('/invite/redeem', { method: 'POST', body: { code: c } }); this.setCash(r.cash); CARD.show({ icon: '🤝', title: 'Invite bonus', text: `You joined Lagos with an invite from ${r.from}.`, lines: [['Bonus', this.fmt(r.bonus)]], tone: 'gold', btn: 'Thank you' }) } catch (e) { /* bad or used code */ }
    try { localStorage.removeItem('ac:ref') } catch (e) {}
  },

  /* ---------- 60-second tour (signed in) and the guest tour (before sign-up) ---------- */
  TOUR: [
    { ic: '🏠', t: 'Your flat', x: 'This is home. Your needs (food, light, fun, chat, bath, toilet) drop slowly. Tap things to use them.' },
    { ic: '💼', t: 'Get paid', x: 'Phone → Jobs. Work shifts to earn ₦ and climb the ladder. Tick Go automatically.' },
    { ic: '💡', t: 'Pay your bills', x: 'Bills arrive every Monday. Pay on time, or the light goes. The city event changes prices.' },
    { ic: '🛋️', t: 'Make it yours', x: 'Tap Buy to decorate. Friends can visit your place.' },
    { ic: '🗺️', t: 'The city', x: 'The Map shows Lagos, other players, ads and homes. Open the legend if you are lost.' },
    { ic: '🎮', t: 'Play and connect', x: 'GameHub for games, Contacts for friends, P-Gist for the gist. Start with the Beginner queue.' }
  ],
  GUEST: [
    { ic: '🏙️', t: 'Welcome to Lagos', x: 'A Lagos life-sim that never resets. Your life continues even when you close the app.' },
    { ic: '⛈️', t: 'A city that changes', x: 'Every 12 hours: rain, NEPA, fuel queues, owambe. Prices and pay change with it.' },
    { ic: '💼', t: 'Work, earn, climb', x: 'Danfo conductor to Bus Owner. Intern to CTO. Pick a job and grow.' },
    { ic: '🛋️', t: 'Your own flat', x: 'Decorate it, pay the bills, invite friends over.' },
    { ic: '🎮', t: 'Games and friends', x: 'Play Ludo, chess and more with real people. One account for everything.' }
  ],
  tour(first) { this.tr = { i: 0, list: this.TOUR, guest: false, first: !!first, t: 0 }; this.tourDraw() },
  guestTour() { this.tr = { i: 0, list: this.GUEST, guest: true, t: 0 }; this.tourDraw() },
  tourDraw() {
    const tr = this.tr, s = tr.list[tr.i], last = tr.i === tr.list.length - 1, per = tr.guest ? 7000 : 10000;
    clearTimeout(tr.t); tr.t = setTimeout(() => { if (SHEET.isOpen('tour') && this.tr === tr) this.tourNext() }, per);
    SHEET.open({ id: 'tour', title: tr.guest ? 'See Lagos first' : '60-second tour', onClose: () => { clearTimeout(tr.t); if (!tr.guest && !tr.done) this.tourEnd(tr) },
      body: () => `<div class="hdots">${tr.list.map((_, i) => `<i class="${i < tr.i ? 'done' : i === tr.i ? 'on' : ''}"></i>`).join('')}</div><div class="htour"><div class="hbig">${s.ic}</div><h3>${s.t}</h3><p>${s.x}</p><div class="htimer"><i style="animation-duration:${per}ms"></i></div></div>
        <button class="rbigbtn" onclick="HUB.tourNext()">${last ? (tr.guest ? 'Create my account' : 'Start playing') : 'Next'}</button><button class="hlink c" onclick="SHEET.close()">${tr.guest ? 'Close' : 'Skip tour'}</button>` });
  },
  tourNext() {
    const tr = this.tr; if (!tr) return;
    if (tr.i < tr.list.length - 1) { tr.i++; return this.tourDraw() }
    tr.done = true; clearTimeout(tr.t); SHEET.close(true);
    if (tr.guest) { if (typeof authMode === 'function') authMode('register'); const f = document.getElementById('fname'); if (f) f.focus() } else this.tourEnd(tr, true);
  },
  async tourEnd(tr, finished) {
    tr.done = true; try { await this.api('/tour', { method: 'POST', body: { kind: 'tour' } }); this.me.hub.tourDone = true } catch (e) {}
    if (tr.first && finished) setTimeout(() => this.afterSetup().then(() => { if (!this.busy()) this.controls(true) }), 300); else if (tr.first) this.afterSetup();
  },

  /* ---------- interactive controls tutorial (replayable) ---------- */
  CTL: [
    { t: 'Tap the floor', x: 'Tap anywhere in your room and your character walks there.', ok: 'tap' },
    { t: 'Look around', x: 'Press and drag on the room to turn the view.', ok: 'drag' },
    { t: 'Zoom', x: 'Pinch with two fingers (or scroll) to zoom in and out.', ok: 'zoom' },
    { t: 'Open your phone', x: 'Tap Phone at the bottom.', ok: 'page:phone' },
    { t: 'See the city map', x: 'Tap Map at the bottom.', ok: 'page:map' },
    { t: 'Back home', x: 'Tap Home to come back to your flat.', ok: 'page:home' }
  ],
  controls(fromTour) {
    this.stopControls(); if (typeof nav === 'function') nav('home');
    const st = { i: 0, drag: 0, fromTour: !!fromTour, down: null, pts: new Set() }, el = document.createElement('div');
    el.id = 'ctl'; el.className = 'ctl'; document.getElementById('app').appendChild(el); this.ct = st;
    const done = () => { if (!st.over) this.ctlStep(true) };
    st.on = {
      pointerdown: e => { st.pts.add(e.pointerId); if (st.pts.size >= 2 && this.CTL[st.i].ok === 'zoom') done(); st.down = { x: e.clientX, y: e.clientY, id: e.pointerId, t: Date.now(), ui: !!e.target.closest('.pill,.nav,button,.ctl,.lgm,.rcm') } },
      pointermove: e => { const d = st.down; if (!d || d.id !== e.pointerId || d.ui) return; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 70 && this.CTL[st.i].ok === 'drag') done() },
      pointerup: e => { st.pts.delete(e.pointerId); const d = st.down; st.down = null; if (!d || d.ui || d.id !== e.pointerId) return; if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 14 && this.CTL[st.i].ok === 'tap') done() },
      pointercancel: e => { st.pts.delete(e.pointerId) },
      wheel: () => { if (this.CTL[st.i].ok === 'zoom') done() }
    };
    Object.entries(st.on).forEach(([k, f]) => document.addEventListener(k, f, { capture: true, passive: true }));
    st.poll = setInterval(() => { const ok = this.CTL[st.i].ok; if (ok.startsWith('page:') && S.page === ok.slice(5)) done() }, 250);
    this.ctlDraw();
  },
  ctlDraw() {
    const st = this.ct, el = document.getElementById('ctl'); if (!st || !el) return; const s = this.CTL[st.i];
    el.innerHTML = `<div class="ctlcard"><small>Step ${st.i + 1} of ${this.CTL.length}</small><b>${s.t}</b><span>${s.x}</span><div class="ctlbtns"><button onclick="HUB.ctlStep()">Skip step</button><button onclick="HUB.stopControls(true)">Stop</button></div></div>`;
  },
  ctlStep(ok) {
    const st = this.ct; if (!st) return; if (ok) toast('✅ Nice!');
    st.i++; if (st.i >= this.CTL.length) { this.stopControls(); this.api('/tour', { method: 'POST', body: { kind: 'controls' } }).catch(() => {}); if (this.me) this.me.hub.controlsDone = true; CARD.show({ icon: '🕹️', title: 'You know the controls', text: 'You can replay this any time from the Lagos hub.', tone: 'good', btn: 'Let us go' }); return }
    st.down = null; this.ctlDraw();
  },
  stopControls(manual) {
    const st = this.ct; if (!st) return; st.over = true; clearInterval(st.poll);
    Object.entries(st.on).forEach(([k, f]) => document.removeEventListener(k, f, { capture: true }));
    const el = document.getElementById('ctl'); if (el) el.remove(); this.ct = null; if (manual) toast('Tutorial stopped');
  },

  /* ---------- timeline ---------- */
  async v_timeline() {
    const r = await this.api('/timeline');
    this.sheet('My life in Lagos', () => `<div class="hjoin">${UI.ic('cake-candles', '#e8337a', 38)}<div><b>Joined Lagos</b><small>${new Date(r.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</small></div></div>` +
      (r.items.length ? `<div class="htl">${r.items.map(i => `<div><span>${i.icon || '•'}</span><div><b>${this.esc(i.text)}</b><small>${UI.ago(i.at)}</small></div></div>`).join('')}</div>` : '<p class="empty">Your story starts now. Work a shift, make a friend, finish a mission. It will show up here.</p>'), { id: 'timeline' });
  },

  /* ---------- play path: placement matches, bot to human, beginner queue ---------- */
  async v_play() {
    await this.loadMe().catch(() => {});
    this.sheet('Play path', () => {
      const L = this.me.missions.list, pl = L.find(x => x.id === 'm_place'), hu = L.find(x => x.id === 'm_human'), sk = L.find(x => x.id === 'm_streak');
      const step = (n, t, x, done) => `<div class="hstep ${done ? 'done' : ''}"><span>${done ? '<span class="fa-solid fa-check"></span>' : n}</span><div><b>${t}</b><small>${x}</small></div></div>`;
      return `<p class="hlead">New to GameHub? Learn on bots, then meet real players, with no ₦ at risk.</p>
        ${step(1, 'Placement matches vs bots', `Finish ${pl.progress[1]} games against bots. Free, and no pressure. (${pl.progress[0]}/${pl.progress[1]})`, pl.done)}
        ${step(2, 'Beginner queue', 'Free matches with other new players. In GameHub, open any game and tap Beginner queue.', hu.done)}
        ${step(3, 'Meet a human', 'You have played a real person. After this, Quick match uses real stakes in ₦.', hu.done)}
        ${step(4, 'Come back tomorrow', 'Play on a second day to complete the streak.', sk.done)}
        ${[pl, hu, sk].map(x => this.missionRow(x)).join('')}
        <button class="rbigbtn" onclick="SHEET.close();openHub()"><span class="fa-solid fa-gamepad"></span> Open GameHub</button>`;
    }, { id: 'play' });
  },

  /* ---------- newspaper ---------- */
  async v_news() {
    this.sheet('The Lagos Gist', async () => {
      if (!this.news) this.news = await this.api('/news'); const n = this.news, p = n.paper;
      return `<div class="hpaper"><div class="hmast"><b>${this.esc(p.name)}</b><small>${this.esc(p.date)} · ${this.esc(p.issue)}</small></div>
        <h4>Happening now</h4><ul class="hticks">${n.ticker.map(t => `<li>${this.esc(t)}</li>`).join('')}</ul>
        ${p.stories.map((s, i) => `<article class="${i === 0 ? 'lead' : ''}"><em>${this.esc(s.tag)}</em><h3>${this.esc(s.title)}</h3><p>${this.esc(s.body)}</p></article>`).join('')}
        <h4>Classifieds</h4>${p.classifieds.map(c => `<p class="hcls">${this.esc(c)}</p>`).join('')}</div>`;
    }, { id: 'news' });
  },

  /* ---------- near me ---------- */
  async v_near() {
    this.sheet('Near me', async () => {
      const r = await this.api('/near');
      if (!r.hood) return `<p class="empty">Choose your neighbourhood to see who lives near you.</p><button class="rbigbtn" onclick="HUB.setup(1)">Choose my area</button>`;
      return `<div class="hbanner" style="--c:#e8337a">${UI.ic('location-dot', '#e8337a', 40)}<div><b>${r.hood.emoji} ${this.esc(r.hood.name)}</b><small>${this.esc(r.hood.vibe)}</small></div></div>
        <div class="hnow"><b>${r.event.icon} ${this.esc(r.event.title)}</b>${r.vibe ? `<small>${this.esc(r.hood.name)}: ${this.esc(r.vibe)}</small>` : ''}</div>
        <h4>Neighbours</h4>` + (r.neighbours.length ? r.neighbours.map(n => `<div class="lgq tap" onclick="SHEET.close();GIST.openProfile('${n.id}',()=>{})" style="cursor:pointer">${PH.av(n)}<div><b>${n.username ? '@' + this.esc(n.username) : this.esc(n.displayName)} ${n.hobby}</b><small>${n.online ? '<i class="ond"></i>Online now' : 'Lives nearby'}</small></div><span class="lgrw">View</span></div>`).join('') : '<p class="empty">No neighbours yet. Invite a friend to move in!</p>') +
        `<button class="rbigbtn ghost" onclick="HUB.view('invite')">Invite a friend</button>`;
    }, { id: 'near' });
  },

  /* ---------- map legend ---------- */
  v_legend() {
    const L = [['#f59e0b', 'car-side', 'Go-slow', 'Orange roads are jammed. Road jobs pay more.'], ['#e8337a', 'bullhorn', 'Ads', 'Billboards and sponsored places. Tap one to visit.'], ['#22b573', 'house', 'Homes', 'Player homes. Visit friends here.'], ['#0ea5e9', 'water', 'Sea', 'Sea plots, ferries and the lagoon.'], ['#64748b', 'landmark', 'Government', 'Offices, police and city services.'], ['#6366f1', 'user', 'Players', 'Dots are real people on the map right now.'], ['#e5484d', 'cloud-showers-heavy', 'Events', 'Flood, power cuts and fuel queues show up on affected areas.']];
    this.sheet('Map legend', () => `<p class="hlead">Drag to move, pinch to zoom, twist with two fingers to rotate.</p>` + L.map(l => UI.row({ ic: UI.ic(l[1], l[0], 38), title: l[2], sub: l[3] })).join('') + `<button class="rbigbtn ghost" onclick="SHEET.close();nav('map')">Open the map</button>`, { id: 'legend' });
  },

  /* ---------- help desk ---------- */
  v_help() {
    this.sheet('Help desk', () => `<input class="sinput" id="hq" placeholder="Search help…" oninput="HUB.helpFilter(this.value)" autocomplete="off"><div id="hlist">${this.helpList('')}</div><div class="hmore"><button onclick="SHEET.close();nav('phone');setTimeout(()=>PH.open('police'),0)"><span class="fa-solid fa-headset"></span> Still stuck? Contact support</button></div>`, { id: 'help' });
  },
  helpList(q) {
    q = (q || '').toLowerCase().trim(); const l = this.C.help.filter(h => !q || (h.q + ' ' + h.a).toLowerCase().includes(q));
    return l.length ? l.map((h, i) => `<details class="hq2"><summary>${this.esc(h.q)}</summary><p>${this.esc(h.a)}</p>${h.go ? `<button class="lgbtn" onclick="HUB.helpGo('${h.go}')">Take me there</button>` : ''}</details>`).join('') : '<p class="empty">Nothing found. Try another word, or contact support.</p>';
  },
  helpFilter(q) { const e = document.getElementById('hlist'); if (e) e.innerHTML = this.helpList(q) },
  helpGo(g) {
    SHEET.close();
    ({ jobs: () => { nav('phone'); setTimeout(() => PH.open('jobs'), 0) }, bank: () => { nav('phone'); setTimeout(() => PH.open('bank'), 0) }, contacts: () => { nav('phone'); setTimeout(() => PH.open('contacts'), 0) }, buy: () => nav('buy'), gamehub: () => openHub(), city: () => LAGOS.open('today'), settings: () => { nav('phone'); setTimeout(() => PH.open('settings'), 0) } }[g] || (() => {}))();
  },

  /* ---------- roadmap, voting, changelog, lore ---------- */
  v_roadmap() {
    this.sheet('Roadmap', () => `<p class="hlead">What we are building. Vote on what comes next.</p>` + ['Now', 'Next', 'Later'].map(l => `<h4>${l}</h4>` + this.C.roadmap.filter(r => r.lane === l).map(r => UI.row({ ic: UI.ic(l === 'Now' ? 'hammer' : l === 'Next' ? 'forward' : 'hourglass-half', l === 'Now' ? '#22b573' : l === 'Next' ? '#6366f1' : '#94a3b8', 36), title: this.esc(r.title), sub: this.esc(r.note) })).join('')).join('') + `<button class="rbigbtn" onclick="HUB.view('vote')">Vote on features</button>`, { id: 'roadmap' });
  },
  v_vote() {
    this.sheet('Feature voting', async () => {
      const r = this.vt = await this.api('/votes'), used = r.votes.filter(v => v.mine).length;
      return `<div class="lgprog"><div><b>${used} of ${r.max} votes used</b><small>Tap to vote. Tap again to take it back.</small></div><i style="width:${used / r.max * 100}%"></i></div>` + r.votes.map(v => UI.row({ ic: UI.ic(v.fa, v.mine ? '#8b5cf6' : '#94a3b8', 38), title: this.esc(v.title), sub: `${v.votes.toLocaleString('en-NG')} vote${v.votes === 1 ? '' : 's'}`, right: `<button class="lgbtn ${v.mine ? 'on' : 'ghost'}" onclick="HUB.vote('${v.id}',this)">${v.mine ? 'Voted' : 'Vote'}</button>` })).join('');
    }, { id: 'vote', back: 'HUB.view(\'roadmap\')' });
  },
  async vote(id, btn) { if (btn) btn.disabled = true; try { await this.api('/vote', { method: 'POST', body: { id } }); SHEET.paint() } catch (e) { toast(e.message); if (btn) btn.disabled = false } },
  v_changelog() {
    this.sheet("What's new", () => this.C.changelog.map(c => `<div class="hlog"><div class="hlh"><b>${this.esc(c.title)}</b><small>v${this.esc(c.v)} · ${new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div><ul>${c.items.map(i => `<li>${this.esc(i)}</li>`).join('')}</ul></div>`).join(''), { id: 'changelog' });
  },
  v_lore() {
    this.sheet('Lore archive', () => `<p class="hlead">Stories behind the city.</p>` + this.C.lore.map(l => `<details class="hq2"><summary>${UI.ic(l.fa, '#0f766e', 28)} ${this.esc(l.title)}</summary><p>${this.esc(l.text)}</p></details>`).join(''), { id: 'lore' });
  },

  /* ---------- anthem (a short tune made in the browser) ---------- */
  v_anthem() {
    const A = this.C.anthem;
    this.sheet(A.title, () => `<div class="hhero"><div class="hbig">🎶</div><h3>${this.esc(A.title)}</h3><p class="hsub">The AllConnect city anthem</p></div><button class="rbigbtn" id="hplay" onclick="HUB.anthemToggle()">${this.an ? '⏹ Stop' : '▶ Play'}</button><div class="hlyr">${A.lyrics.map(l => l ? `<p>${this.esc(l)}</p>` : '<br>').join('')}</div>`, { id: 'anthem' });
  },
  anthemToggle() {
    const b = document.getElementById('hplay');
    if (this.an) { this.anthemStop(); if (b) b.textContent = '▶ Play'; return }
    if (typeof soundOn === 'function' && !soundOn()) toast('Sound is off. Turn it on with the speaker button.');
    const A = this.C.anthem, AC = window.AudioContext || window.webkitAudioContext; if (!AC) return toast('Sound is not supported here');
    const ctx = new AC(), master = ctx.createGain(); master.gain.value = .22; master.connect(ctx.destination);
    const beat = 60 / A.bpm, mtof = n => 440 * Math.pow(2, (n - 69) / 12), t0 = ctx.currentTime + .1;
    const note = (n, start, dur, type, vol) => { if (!n) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = mtof(n); g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(vol, start + .02); g.gain.exponentialRampToValueAtTime(.0001, start + dur * .95); o.connect(g); g.connect(master); o.start(start); o.stop(start + dur) };
    let t = t0; A.melody.forEach(([n, b]) => { note(n, t, b * beat, 'triangle', .9); t += b * beat }); const end = t;
    t = t0; A.bass.forEach(([n, b]) => { note(n - 12, t, b * beat, 'sine', .8); t += b * beat });
    for (let k = 0; t0 + k * beat / 2 < end; k++) { const s = t0 + k * beat / 2, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = k % 2 ? 6200 : 4800; g.gain.setValueAtTime(k % 4 === 0 ? .05 : .025, s); g.gain.exponentialRampToValueAtTime(.0001, s + .05); o.connect(g); g.connect(master); o.start(s); o.stop(s + .06) }
    this.an = { ctx, timer: setTimeout(() => { this.anthemStop(); const x = document.getElementById('hplay'); if (x) x.textContent = '▶ Play' }, (end - t0 + .5) * 1000) };
    if (b) b.textContent = '⏹ Stop';
  },
  anthemStop() { if (!this.an) return; clearTimeout(this.an.timer); try { this.an.ctx.close() } catch (e) {} this.an = null },

  /* ---------- status ---------- */
  v_status() {
    this.sheet('City status', async () => {
      const r = await fetch('/api/ac/public/status', { cache: 'no-store' }).then(x => x.json());
      const up = s => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + 'd ' : '') + h + 'h ' + m + 'm' };
      return `<div class="hstat ${r.ok ? 'ok' : 'bad'}"><span class="fa-solid fa-${r.ok ? 'circle-check' : 'triangle-exclamation'}"></span><div><b>${r.ok ? 'All systems normal' : 'Some things are not working'}</b><small>Up for ${up(r.uptimeSec)} · ${r.online} online · v${this.esc(r.version)}</small></div></div>` +
        r.services.map(s => UI.row({ ic: `<i class="sdot ${s.ok ? 'ok' : 'bad'}"></i>`, title: this.esc(s.name), sub: s.ok ? (s.ms != null ? s.ms + ' ms' : 'Working') : 'Not available right now' })).join('') + `<p class="lgnote">Full page: <a href="/status" target="_blank" rel="noopener">${location.origin}/status</a></p>`;
    }, { id: 'status' });
  },

  /* ---------- invite a friend ---------- */
  v_invite() {
    this.sheet('Invite a friend', async () => {
      const r = await this.api('/invite'), link = location.origin + '/?ref=' + encodeURIComponent(r.code), used = this.me && this.me.hub.invitedBy, newish = this.me && this.me.protection.active;
      this.link = link;
      return `<div class="hhero"><div class="hbig">🤝</div><h3>Play together</h3><p>You get ${this.fmt(r.inviter)} and your friend gets ${this.fmt(r.invitee)} when they join with your link, in their first week.</p></div>
        <div class="hcode sm">${this.esc(r.code)}</div><button class="rbigbtn" onclick="HUB.shareInvite()"><span class="fa-solid fa-share-nodes"></span> Share my invite link</button>
        <p class="hsub">${r.invites} friend${r.invites === 1 ? '' : 's'} joined with your link.</p>` +
        (newish && !used ? `<h4>Were you invited?</h4><div class="hrow"><input class="sinput" id="hinv" placeholder="Friend's invite code" autocapitalize="off"><button class="lgbtn" onclick="HUB.redeem(this)">Use code</button></div>` : '');
    }, { id: 'invite' });
  },
  async shareInvite() {
    const text = 'Come live in Lagos with me on AllConnect: ' + this.link;
    try { if (navigator.share) await navigator.share({ title: 'AllConnect', text, url: this.link }); else { await navigator.clipboard.writeText(text); toast('Invite link copied ✓') } } catch (e) {}
  },
  async redeem(btn) {
    const v = (document.getElementById('hinv') || {}).value; if (!v) return toast('Enter a code'); btn.disabled = true;
    try { const r = await this.api('/invite/redeem', { method: 'POST', body: { code: v } }); this.setCash(r.cash); await this.loadMe(); SHEET.close(); CARD.show({ icon: '🤝', title: 'Invite bonus', text: `You joined with an invite from ${r.from}.`, lines: [['Bonus', this.fmt(r.bonus)]], tone: 'gold' }) } catch (e) { toast(e.message); btn.disabled = false }
  },

  /* ---------- recovery + about ---------- */
  v_recovery() {
    this.sheet('Account recovery', () => `<div class="hhero"><div class="hbig">🔑</div><h3>Recovery code</h3><p>Lost your password? On the sign-in screen tap "Recover account" and enter your code. A new code replaces the old one.</p></div><button class="rbigbtn" onclick="HUB.newCode(this)">Make a new recovery code</button><div id="hnc"></div>`, { id: 'recovery2' });
  },
  async newCode(btn) {
    btn.disabled = true;
    try { const r = await this.api('/recovery/new', { method: 'POST' }), nice = r.code.replace(/(.{4})(?=.)/g, '$1-'); document.getElementById('hnc').innerHTML = `<div class="hcode">${nice}</div><button class="rbigbtn ghost" onclick="HUB.copy('${nice}',this)"><span class="fa-solid fa-copy"></span> Copy</button><p class="hsub">The old code no longer works. Save this one now.</p>` } catch (e) { toast(e.message) }
    btn.disabled = false;
  },
  v_promise() {
    const P = this.C.promise;
    this.sheet('About AllConnect', () => `<div class="hhero"><div class="hbig">🏙️</div><h3>${this.esc(P.tagline)}</h3><p>${this.esc(P.line)}</p></div><h4>Your day-one promise</h4><ul class="hprom">${P.day1.map(x => `<li><span class="fa-solid fa-circle-check"></span>${this.esc(x)}</li>`).join('')}</ul><h4>What AllConnect is</h4><p class="lgnote">A persistent Lagos life-sim. Your flat, job, money and friends stay where you left them. The city keeps moving with its own events, bills and news. GameHub, chat and P-Gist all use the same account.</p>`, { id: 'promise' });
  },

  /* ---------- account recovery from the sign-in screen (no login needed) ---------- */
  recover() {
    SHEET.open({ id: 'recover', title: 'Recover account', body: () => `<p class="hsub">Enter the email or phone you signed up with, your 12-character recovery code, and a new password.</p>
      <input class="sinput" id="rcid" placeholder="Email or phone" autocomplete="username"><input class="sinput" id="rccode" placeholder="Recovery code (XXXX-XXXX-XXXX)" autocapitalize="characters" autocomplete="off"><input class="sinput" id="rcpw" type="password" placeholder="New password (6+ characters)" autocomplete="new-password"><div id="rcerr" class="aerr"></div><button class="rbigbtn" onclick="HUB.doRecover(this)">Reset my password</button>` });
  },
  async doRecover(btn) {
    const g = i => (document.getElementById(i) || {}).value || '', err = document.getElementById('rcerr'); err.textContent = ''; btn.disabled = true;
    try {
      const r = await fetch('/api/ac/public/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: g('rcid').trim(), code: g('rccode'), password: g('rcpw') }) }), j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || 'Could not recover this account.');
      SHEET.close(); const f = document.getElementById('fid'); if (f) f.value = g('rcid').trim(); if (typeof authMode === 'function') authMode('login'); toast('Password changed. Sign in now ✓');
    } catch (e) { err.textContent = e.message; btn.disabled = false }
  }
};
window.HUB = HUB;

/* ---------- "Back from Work" for Jobs: shifts are summed and shown as one card when the player leaves the Jobs app ---------- */
const WORKCARD = {
  p: null,
  add(r) { const p = this.p || (this.p = { n: 0, earned: 0, last: 0 }); p.n++; p.earned += r.earned || 0; p.last = Date.now(); p.mine = r.mine; if (p.n >= 4) this.flush() },
  flush(force) {
    const p = this.p; if (!p || !p.n) return; if (!force && (HUB.busy() || (window.PH && PH.view === 'jobs'))) return;
    this.p = null; const m = p.mine || {}, nx = m.next;
    const lines = [['Earned', UI.fmt(p.earned)], ['Shifts', String(p.n)]];
    if (m.maxPerDay) lines.push(['Today', `${m.shiftsToday}/${m.maxPerDay} shifts`]);
    if (nx) lines.push(['Next promotion', `${nx.shiftsLeft} shift${nx.shiftsLeft === 1 ? '' : 's'}`]);
    CARD.show({ icon: '💼', title: 'Back from Work', text: `You worked ${p.n} shift${p.n > 1 ? 's' : ''} as ${m.title || 'a worker'}. Oga is proud of you.`, lines, tone: 'good', btn: 'Nice one' });
  }
};
window.WORKCARD = WORKCARD;
