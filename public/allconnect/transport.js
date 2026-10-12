/* Transport app (Phone -> Transport): vehicles, rental, fuel, garage, licence, quizzes, Okada ride, traffic lights,
   insurance, roadside help, parking, bus / shuttle routes, community traffic reports and reputation.
   Built on the shared SHEET (tabs + scrolling body) and CARD (result popup) from ui.js, and on the same row / bar / button styles
   as Lagos Life, Jobs and Invest. All prices and results come from the server (routes/actransport.js, utils/actransport.js). */
const TR = {
  D: null, cat: null, tab: 'garage', vid: null, vtab: 'care', busy: false, ph: 2, timer: null, tops: null, reps: null, rep: { road: '', kind: 'slow', note: '' }, g: null,
  esc: (s) => UI.esc(s),
  money: (n) => '₦' + Math.round(n || 0).toLocaleString('en-NG'),
  api: (path, body) => NET.api('/api/ac/transport/' + path, body === undefined ? undefined : { method: 'POST', body }),
  cash(c) { if (typeof c === 'number' && typeof S !== 'undefined') { S.cash = c; if (typeof render === 'function') render() } },
  kind(k) { return (this.cat && this.cat.vehicles.find((v) => v.kind === k)) || null },
  veh(id) { return this.D && this.D.vehicles.find((v) => v.id === id) || null },
  mine(kind) { return this.D ? this.D.vehicles.filter((v) => v.kind === kind) : [] },
  clock(ms) { const d = new Date(ms); return d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' }) },
  left(ms) { const s = Math.max(0, Math.round((ms - Date.now()) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + 'h ' + m + 'm' : m + ' min' },

  /* ---------- load + open ---------- */
  async load() {
    const r = await this.api('state'); if (r.cat) this.cat = r.cat; delete r.cat; this.take(r);
  },
  take(r) {
    const { card, flash, result, vid, ...st } = r; this.D = { ...(this.D || {}), ...st }; this.cash(st.cash);
    if (flash) toast(flash);
    return { card, result, vid };
  },
  async open(tab) {
    this.tab = tab || this.tab; this.stop();
    SHEET.open({ id: 'transport', title: 'Transport', wide: true, tab: this.tab, onTab: (t) => { this.tab = t; this.enter(t) }, onClose: () => this.stop(),
      tabs: () => [{ id: 'garage', label: 'Garage' }, { id: 'shop', label: 'Shop' }, { id: 'drive', label: 'Drive', badge: this.D && !this.D.licence.ok ? 1 : 0 }, { id: 'routes', label: 'Routes' }, { id: 'traffic', label: 'Traffic' }],
      body: (t) => this.body(t) });
    try { await this.load() } catch (e) { toast(e.message); SHEET.close(); return }
    if (SHEET.isOpen('transport')) { SHEET.paint(); this.enter(this.tab); this.timer = setInterval(() => this.tick(), 20000) }
  },
  stop() { clearInterval(this.timer); this.timer = null; if (this.g) { clearTimeout(this.g.t); clearInterval(this.g.i); this.g = null } },
  /* keeps live numbers (route earnings, parking, rental) fresh while the sheet is open */
  async tick() {
    if (!SHEET.isOpen('transport') && !SHEET.isOpen('trveh')) return this.stop();
    if (this.busy || this.g) return; try { await this.load(); SHEET.paint() } catch (e) {}
  },
  enter(t) {
    if (t === 'traffic') this.loadReports();
    if (t === 'routes' && !this.tops) this.loadTop();
  },
  async loadReports() { try { this.reps = await this.api('reports'); if (SHEET.isOpen('transport') && this.tab === 'traffic') SHEET.paint() } catch (e) {} },
  async loadTop() { try { this.tops = await this.api('top'); if (SHEET.isOpen('transport') && this.tab === 'routes') SHEET.paint() } catch (e) {} },
  /* run one server action, then redraw whatever sheet is open */
  async act(path, body, after) {
    if (this.busy) return; this.busy = true;
    try {
      const r = this.take(await this.api(path, body)); SHEET.paint();
      if (after) after(r);
      if (r.card) CARD.show(r.card);
    } catch (e) { toast(e.message) }
    this.busy = false;
  },

  /* ---------- small pieces ---------- */
  bar(pct, color) { return `<div class="gmbar"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${color}"></i></div>` },
  condColor: (c) => (c < 25 ? '#e5484d' : c < 60 ? '#f59e0b' : '#22b573'),
  strip() {
    const D = this.D, r = D.rep, e = D.event;
    return `<div class="lgfx trfx"><span>⛽ Fuel <b>${this.money(D.fuelPrice)}/L</b></span><span>${e.icon} ${this.esc(e.title)}${D.fareMult !== 1 ? ` · fares ×${D.fareMult}` : ''}</span><span>${r.emoji} ${this.esc(r.name)} <b>${r.score}</b></span></div>`;
  },
  btn(label, go, o = {}) { return `<button class="lgbtn ${o.cls || ''}" ${o.off ? 'disabled' : ''} onclick="${go}">${label}</button>` },
  empty: (t) => `<p class="empty">${t}</p>`,
  need(t) { return `<div class="lgwarn">${t}</div>` },

  body(t) {
    if (!this.D || !this.cat) return this.empty('Loading…');
    return { garage: () => this.garage(), shop: () => this.shop(), drive: () => this.drive(), routes: () => this.routes(), traffic: () => this.traffic() }[t]();
  },

  /* ================= Garage ================= */
  garage() {
    const D = this.D; let h = this.strip();
    if (!D.vehicles.length) return h + `<div class="trhero">🚲</div><p class="empty">You do not own a vehicle yet.<br>Rent a bicycle for ${this.money(this.cat.rent.price)} or buy something in the Shop.</p><div class="trc">${this.btn('Open the Shop', "TR.go('shop')", { cls: 'big' })}</div>`;
    h += D.vehicles.map((v) => this.vcard(v)).join('');
    h += `<p class="lgnote">${D.stats.rides} Okada rides · ${this.money(D.stats.earned)} earned on the road · ${D.stats.fines} tickets · ${D.stats.crashes} crashes</p>`;
    return h;
  },
  go(tab) { this.tab = tab; SHEET.setTab(tab) },
  vcard(v) {
    const badges = [];
    if (v.insTier) badges.push(`<span class="good">🛡️ ${this.esc(v.insTier === 'comp' ? 'Comprehensive' : 'Third-party')} · ${this.left(v.insUntil)}</span>`);
    if (v.park) { const l = this.cat && this.D.lots.find((x) => x.id === v.park.lot); badges.push(`<span>🅿️ ${this.esc(l ? l.name : 'Parked')} · ${this.left(v.park.until)}</span>`) }
    if (v.route) badges.push(`<span class="good">🛣️ ${this.esc(v.route.name)}</span>`);
    if (v.cond <= 0) badges.push('<span class="bad">Broken down</span>'); else if (v.cond < 25) badges.push('<span class="bad">Needs service</span>');
    if (v.tank && v.fuel < v.tank * 0.2) badges.push('<span class="bad">Low fuel</span>');
    if (v.tip) badges.push(`<span>✨ +${v.tip}% pay</span>`);
    return `<div class="trv"><div class="trh"><span class="trdot" style="background:${v.paintHex || '#e5e8f1'}">${v.emoji}</span><div><b>${this.esc(v.name)}</b><small>${this.esc(v.condLabel)}${v.paint ? ' · ' + this.esc((this.cat.paints.find((p) => p.id === v.paint) || {}).name || '') : ''}</small></div>${this.btn('Manage', `TR.manage('${v.id}')`, { cls: 'ghost' })}</div>
      ${v.tank ? `<div class="trbr"><small>Fuel ${Math.round(v.fuel)} / ${v.tank} L</small>${this.bar((v.fuel / v.tank) * 100, '#3b82f6')}</div>` : ''}
      <div class="trbr"><small>Condition ${Math.round(v.cond)}%</small>${this.bar(v.cond, this.condColor(v.cond))}</div>
      ${badges.length ? `<div class="lgfx">${badges.join('')}</div>` : ''}</div>`;
  },

  /* ----- manage one vehicle: care (fuel, service, roadside), style (paint + upgrades), cover (insurance), park ----- */
  manage(id, tab) {
    this.vid = id; this.vtab = tab || this.vtab || 'care';
    SHEET.open({ id: 'trveh', title: (this.veh(id) || {}).name || 'Vehicle', tab: this.vtab, back: "TR.open('garage')", onTab: (t) => { this.vtab = t }, onClose: () => this.stop(),
      tabs: [{ id: 'care', label: 'Care' }, { id: 'style', label: 'Style' }, { id: 'cover', label: 'Cover' }, { id: 'park', label: 'Park' }], body: (t) => this.vbody(t) });
    if (!this.timer) this.timer = setInterval(() => this.tick(), 20000);
  },
  vbody(t) {
    const v = this.veh(this.vid); if (!v) return this.empty('That vehicle is gone.');
    return { care: () => this.care(v), style: () => this.style(v), cover: () => this.cover(v), park: () => this.park(v) }[t]();
  },
  care(v) {
    const D = this.D, A = this.cat.assist, space = Math.round((v.tank - v.fuel) * 10) / 10, fp = D.fuelPrice, mem = D.assist.member;
    let h = `<div class="lgsum"><div><small>${this.esc(v.condLabel)} · condition ${Math.round(v.cond)}%</small><b>${v.tank ? Math.round(v.fuel) + ' / ' + v.tank + ' L' : 'No fuel needed'}</b></div><span class="trdot big" style="background:${v.paintHex || '#e5e8f1'}">${v.emoji}</span></div>`;
    if (v.tank) {
      const q = (l) => Math.min(l, space);
      h += `<h4>Fuel · ${this.money(fp)} per litre</h4><div class="trgrid">
        ${[5, 10].map((l) => this.btn(`+${q(l)} L<br><small>${this.money(Math.round(q(l) * fp))}</small>`, `TR.act('fuel',{id:'${v.id}',litres:${q(l)}})`, { cls: 'ghost', off: space <= 0.05 })).join('')}
        ${this.btn(`Fill up<br><small>${this.money(Math.round(space * fp))}</small>`, `TR.act('fuel',{id:'${v.id}',full:true})`, { off: space <= 0.05 })}</div>`;
    }
    h += `<h4>Maintenance</h4>` + UI.row({ ic: UI.ic('wrench', '#6366f1'), title: 'Full service', sub: 'Brings condition back to 100%. Worn vehicles break down and crash more.', right: this.btn(this.money(v.service), `TR.act('service',{id:'${v.id}'})`, { off: v.cond >= 99.5 }) });
    h += `<h4>Roadside assistance ${mem ? '· member' : ''}</h4>` + (v.tank ? UI.row({ ic: UI.ic('gas-pump', '#e5484d'), title: 'Emergency fuel', sub: `Up to ${A.litres} L delivered. Only when the tank is nearly empty.${mem ? ' Callout free.' : ' Callout ' + this.money(A.callout) + '.'}`,
      right: this.btn(this.money((mem ? 0 : A.callout) + Math.round(Math.min(A.litres, space) * fp * (mem ? 1 - A.memberFuelOff : 1))), `TR.act('assist/call',{id:'${v.id}',service:'fuel'})`, { off: v.fuel > v.tank * 0.2 }) }) : '') +
      UI.row({ ic: UI.ic('screwdriver-wrench', '#f59e0b'), title: 'Emergency fix', sub: `Gets you moving again (condition ${A.fixTo}%).${mem ? ' Callout free, parts 20% off.' : ' Callout ' + this.money(A.callout) + '.'}`, right: this.btn(this.money(v.fix ? (mem ? 0 : A.callout) + Math.round(v.fix * (mem ? 0.8 : 1)) : 0), `TR.act('assist/call',{id:'${v.id}',service:'fix'})`, { off: v.cond >= A.fixTo }) });
    h += `<p class="lgnote">${D.assist.callsLeft} callouts left today. ${mem ? '' : 'Members pay no callout fee. Join in the Shop.'}</p>`;
    h += `<h4>Sell</h4>` + UI.row({ ic: UI.ic('sack-dollar', '#64748b'), title: 'Sell this vehicle', sub: 'Worn vehicles sell for less.', right: this.btn(this.money(v.sell), `TR.askSell('${v.id}')`, { cls: 'ghost', off: !!v.route }) });
    return h;
  },
  askSell(id) { const v = this.veh(id); if (!v) return; CARD.show({ icon: '💸', tone: 'warn', title: 'Sell ' + v.name + '?', text: `You get ${this.money(v.sell)}. It leaves your garage for good.`, btn: 'Keep it', alt: 'Sell for ' + this.money(v.sell), go: `TR.sell('${id}')` }) },
  sell(id) { this.act('sell', { id }, () => this.open('garage')) },
  style(v) {
    const P = this.cat.paints, k = this.kind(v.kind);
    let h = `<h4>Paint · ${this.money(k.paintPrice)}</h4><div class="trsw">${P.map((p) => `<button class="${v.paint === p.id ? 'on' : ''}" style="background:${p.hex}" title="${this.esc(p.name)}" aria-label="${this.esc(p.name)}" onclick="TR.act('paint',{id:'${v.id}',paint:'${p.id}'})"></button>`).join('')}</div>`;
    h += `<h4>Upgrades <small>(pay boost ${v.tip}% of max ${10}%)</small></h4>` + k.mods.map((m) => { const has = v.mods.includes(m.id); return UI.row({ ic: `<span class="lgi trem">${m.emoji}</span>`, title: this.esc(m.name), sub: `+${m.tip}% pay on shifts, rides and routes`, right: has ? '<span class="lgok">✓ Fitted</span>' : this.btn(this.money(m.price), `TR.act('mod',{id:'${v.id}',mod:'${m.id}'})`) }) }).join('');
    return h + '<p class="lgnote">Upgrades add to what this vehicle earns on Okada rides, taxi / delivery / boat shifts and routes (up to 10%).</p>';
  },
  cover(v) {
    const D = this.D; let h = D.rep.insDiscount ? `<div class="lgwarn good">Your reputation gives you ${D.rep.insDiscount}% off insurance.</div>` : '';
    h += this.cat.ins.map((t) => { const on = v.insTier === t.id; return UI.row({ ic: UI.ic(t.id === 'comp' ? 'shield-halved' : 'shield', t.id === 'comp' ? '#22b573' : '#3b82f6'), title: this.esc(t.name) + (on ? ' · active' : ''), sub: `${this.esc(t.blurb)} ${this.cat.insDays} days.${on ? ' Left: ' + this.left(v.insUntil) + '.' : ''}`, right: this.btn(this.money(v.insPrices[t.id]), `TR.act('insure',{id:'${v.id}',tier:'${t.id}'})`) }) }).join('');
    return h + `<p class="lgnote">Insurance pays its share of crash repairs. Comprehensive also pays most of any street ticket. A wearing vehicle crashes more often, so keep it serviced.</p>`;
  },
  park(v) {
    const D = this.D; let h = '';
    if (v.kind === 'boat') return this.empty('Boats berth at the marina, not in car parks.');
    if (v.park) { const l = D.lots.find((x) => x.id === v.park.lot); h += `<div class="lgsum"><div><small>Parked at ${this.esc(l ? l.name : 'a lot')}</small><b>${this.left(v.park.until)} left</b></div>${this.btn('Leave lot', `TR.act('unpark',{id:'${v.id}'})`, { cls: 'ghost' })}</div><p class="lgnote">Leaving early does not refund the time you paid for.</p>`; }
    if (v.route) return h + this.need('This vehicle is out on a route. Collect and stop the route to park it.');
    h += `<h4>For how long?</h4><div class="trchips">${[1, 2, 4, 6].map((n) => `<button class="${this.ph === n ? 'on' : ''}" onclick="TR.ph=${n};SHEET.paint()">${n}h</button>`).join('')}</div><h4>Parking lots</h4>`;
    h += D.lots.map((l) => { const full = l.used >= l.cap; return UI.row({ ic: `<span class="lgi trem">${l.emoji}</span>`, title: this.esc(l.name), sub: `${this.esc(l.area)} · ${this.money(l.hr)}/h · ${l.used}/${l.cap} spaces taken${this.bar((l.used / l.cap) * 100, full ? '#e5484d' : l.used / l.cap > 0.7 ? '#f59e0b' : '#22b573')}`, right: this.btn(full ? 'Full' : this.money(l.hr * this.ph), `TR.act('park',{id:'${v.id}',lot:'${l.id}',hours:${this.ph}})`, { off: full || !!v.park }) }) }).join('');
    return h + '<p class="lgnote">A vehicle left on the street can get a LASTMA ticket after a trip. Spaces are shared with every player, so busy lots fill up.</p>';
  },

  /* ================= Shop ================= */
  shop() {
    const D = this.D, c = this.cat; let h = this.strip();
    const ren = D.rent; h += `<h4>Bicycle rental</h4>` + UI.row({ ic: UI.ic('bicycle', '#16a34a'), title: ren ? 'Rented · ' + this.left(ren.until) + ' left' : `Rent a bicycle · ${c.rent.hours} hours`, sub: 'No licence needed. Counts as your bicycle for Delivery Rider shifts.', right: this.btn(this.money(c.rent.price), "TR.act('rent',{})", { off: !!ren }) });
    h += `<h4>Roadside assistance</h4>` + UI.row({ ic: UI.ic('truck-medical', '#e5484d'), title: D.assist.member ? 'Member · ' + this.left(D.assist.until) + ' left' : 'Roadside membership', sub: `No callout fee and ${Math.round(c.assist.memberFuelOff * 100)}% off emergency fuel for ${c.assist.days} days.`, right: this.btn(this.money(c.assist.weekPrice), "TR.act('assist/join',{})") });
    h += `<h4>Vehicles</h4>`;
    if (!D.licence.ok) h += this.need('Motor vehicles need your driving licence. <a href="#" onclick="TR.go(\'drive\');return false">Get it in Drive</a>.');
    h += c.vehicles.map((k) => {
      const have = this.mine(k.kind).length, lock = k.licence && !D.licence.ok, maxed = have >= k.max;
      return UI.row({ ic: UI.ic(k.fa, '#475569'), title: `${this.esc(k.name)} <small class="trown">${have}/${k.max}</small>`, sub: `${this.esc(k.blurb)}${k.tank ? ` Tank ${k.tank} L.` : ''}`,
        right: lock ? this.btn('🔒 Licence', "TR.go('drive')", { cls: 'ghost' }) : this.btn(maxed ? 'Owned' : this.money(k.price), `TR.act('buy',{kind:'${k.kind}'})`, { off: maxed }) });
    }).join('');
    return h + `<p class="lgnote">Buy a bus or van for your own route business (Routes). Boats are for the Boat Captain career in Jobs.</p>`;
  },

  /* ================= Drive: licence, Okada, traffic lights, road-sign quiz ================= */
  drive() {
    const D = this.D, c = this.cat, L = D.licence, T = D.today; let h = '';
    const step = (n, on, done, t, s) => `<div class="gmc ${done ? 'gmdone' : ''}"><span class="gmck">${done ? '<i class="fa-solid fa-check"></i>' : n}</span><div><b>${t}</b><small>${s}</small></div></div>`;
    h += `<h4>Driving licence</h4>` + (L.ok ? `<div class="lgev" style="--c:#22b573">${UI.ic('id-card', '#22b573', 46)}<div><h3>You are licensed 🎉</h3><p>You can buy and drive motor vehicles, run routes and take taxi or boat jobs.</p></div></div>`
      : `<div class="gmcard">${step(1, 0, L.theory, 'Theory test', `${c.quiz.licence.count} questions, pass with ${c.quiz.licence.pass}. Fee ${this.money(c.quiz.licence.fee)}.`)}${step(2, 0, false, 'Practical: traffic lights', `Tap on green. At least ${c.light.pass} of 15 points, one early tap at most.`)}</div>
      <div class="trc">${L.theory ? this.btn('Start practical test', "TR.light('licence')", { cls: 'big', off: L.retryIn > 0 }) : this.btn('Take the theory test · ' + this.money(L.fee), "TR.quiz('licence')", { cls: 'big', off: L.retryIn > 0 })}</div>${L.retryIn > 0 ? `<p class="lgnote">You can try again in ${Math.ceil(L.retryIn / 1000)} seconds.</p>` : ''}`);
    const moto = this.mine('motorcycle')[0], okOff = !L.ok || !moto || T.ridesLeft <= 0 || T.rideWait > 0 || T.rideEarn >= T.rideCap;
    h += `<h4>Okada taxi</h4>` + UI.row({ ic: UI.ic('motorcycle', '#f97316'), title: 'Pick up a passenger', sub: !moto ? 'Buy a motorcycle in the Shop first.' : !L.ok ? 'Get your licence first.' : `Dodge the hazards. ${T.ridesLeft} rides left today · earned ${this.money(T.rideEarn)} of ${this.money(T.rideCap)}${T.rideWait > 0 ? ' · next in ' + Math.ceil(T.rideWait / 1000) + 's' : ''}`, right: this.btn('Ride', 'TR.okada()', { off: okOff }) });
    h += `<h4>Practice</h4>` + UI.row({ ic: UI.ic('traffic-light', '#e5484d'), title: 'Traffic-light challenge', sub: `Tap the moment it turns green. Up to ${this.money(c.light.rounds * 3 * c.light.payPerPoint)} per round · ${T.lightLeft} left today.`, right: this.btn('Play', "TR.light('practice')", { off: T.lightLeft <= 0 }) })
      + UI.row({ ic: UI.ic('signs-post', '#3b82f6'), title: 'Road-sign quiz', sub: `${c.quiz.signs.count} signs, ${this.money(c.quiz.signs.pay)} each and ${this.money(c.quiz.signs.perfect)} for a perfect round · ${T.signsLeft} left today.`, right: this.btn('Play', "TR.quiz('signs')", { off: T.signsLeft <= 0 }) });
    return h + '<p class="lgnote">Rewards are capped every day. A perfect round also earns public-transport reputation.</p>';
  },
  playSheet(title, onStart) {
    SHEET.open({ id: 'trplay', title, back: "TR.leave()", onClose: () => this.stop(), body: () => '<div id="trg" class="trg"></div>', after: () => { if (!this.g || !this.g.started) { this.g = this.g || {}; this.g.started = true; onStart() } } });
  },
  leave() { this.stop(); this.open('drive') },
  g$(h) { const e = document.getElementById('trg'); if (e) e.innerHTML = h },

  /* ----- quiz (road signs + licence theory) ----- */
  async quiz(kind) {
    if (this.busy) return; this.busy = true;
    let r; try { r = await this.api('quiz/start', { kind }); this.cash(r.cash) } catch (e) { this.busy = false; return toast(e.message) }
    this.busy = false;
    this.g = { kind, token: r.token, qs: r.questions, i: 0, a: [] };
    this.playSheet(kind === 'licence' ? 'Driving theory test' : 'Road-sign quiz', () => this.qDraw());
  },
  qDraw() {
    const g = this.g; if (!g) return; const q = g.qs[g.i];
    this.g$(`<div class="trprog"><small>Question ${g.i + 1} of ${g.qs.length}</small>${this.bar(((g.i) / g.qs.length) * 100, '#3b82f6')}</div>${q.sign ? `<div class="trsign">${q.sign}</div>` : ''}<h3 class="trq">${this.esc(q.q)}</h3>${q.opts.map((o, n) => `<button class="tropt" onclick="TR.qPick(${n})">${this.esc(o)}</button>`).join('')}`);
  },
  async qPick(n) {
    const g = this.g; if (!g || g.lock) return; g.a.push(n); g.i++;
    if (g.i < g.qs.length) return this.qDraw();
    g.lock = true; this.g$('<p class="empty">Marking…</p>');
    try {
      const r = this.take(await this.api('quiz/finish', { token: g.token, answers: g.a })), x = r.result; this.g = null; SHEET.close(true);
      if (x.kind === 'licence') CARD.show({ icon: x.pass ? '📘' : '📕', tone: x.pass ? 'good' : 'warn', title: x.pass ? 'Theory passed!' : 'Not this time', text: x.pass ? `${x.right} of ${x.count} right. Now take the practical test.` : `${x.right} of ${x.count} right. You need ${x.need}. Read the road rules and try again.`, btn: x.pass ? 'Practical test' : 'OK', go: x.pass ? "TR.light('licence')" : '', goOnBtn: x.pass, onClose: () => { if (!x.pass) this.open('drive') } });
      else CARD.show({ icon: x.perfect ? '🏆' : '🚸', tone: x.reward ? 'good' : 'info', title: `${x.right} of ${x.count} right`, text: x.perfect ? 'Perfect round! Your reputation went up.' : 'Keep practising the signs.', lines: [['Reward', this.money(x.reward)]], btn: 'Nice one', onClose: () => this.open('drive') });
    } catch (e) { this.g = null; toast(e.message); this.open('drive') }
  },

  /* ----- traffic-light reaction (practice + licence practical) ----- */
  async light(mode) {
    if (this.busy) return; this.busy = true;
    let r; try { r = await this.api('light/start', { mode }) } catch (e) { this.busy = false; return toast(e.message) }
    this.busy = false; SHEET.close(true);
    this.g = { mode, token: r.token, delays: r.delays, i: 0, times: [], state: 'idle' };
    this.playSheet(mode === 'licence' ? 'Practical test' : 'Traffic lights', () => this.lRound());
  },
  lRound() {
    const g = this.g; if (!g) return; g.state = 'red';
    this.g$(`<div class="trprog"><small>Round ${g.i + 1} of ${g.delays.length}</small>${this.bar((g.i / g.delays.length) * 100, '#3b82f6')}</div><button class="trlight red" id="trlt" onpointerdown="TR.lTap()"><span>WAIT…</span></button><p class="lgnote" id="trmsg">Tap only when the light turns green.</p>`);
    g.t = setTimeout(() => { if (!this.g) return; g.state = 'green'; g.t0 = performance.now(); const b = document.getElementById('trlt'); if (b) { b.className = 'trlight green'; b.firstChild.textContent = 'TAP!' }
      g.t = setTimeout(() => this.lDone(3000), 3000) }, g.delays[g.i]);
  },
  lTap() {
    const g = this.g; if (!g) return;
    if (g.state === 'red') { clearTimeout(g.t); g.state = 'early'; this.lShow('Too early! 🚫'); g.times.push(-1); return this.lNext() }
    if (g.state === 'green') { clearTimeout(g.t); this.lDone(Math.max(100, Math.round(performance.now() - g.t0))) }
  },
  lDone(ms) { const g = this.g; if (!g || g.state === 'done') return; g.state = 'done'; clearTimeout(g.t); g.times.push(ms); this.lShow(ms >= 3000 ? 'Too slow 🐢' : ms + ' ms'); this.lNext() },
  lShow(t) { const m = document.getElementById('trmsg'); if (m) m.textContent = t; const b = document.getElementById('trlt'); if (b) { b.className = 'trlight'; b.firstChild.textContent = t } },
  lNext() { const g = this.g; g.i++; g.t = setTimeout(() => { if (!this.g) return; g.i < g.delays.length ? this.lRound() : this.lFinish() }, 900) },
  async lFinish() {
    const g = this.g; this.g$('<p class="empty">Checking…</p>');
    try {
      const r = this.take(await this.api('light/finish', { token: g.token, times: g.times })), x = r.result; this.g = null; SHEET.close(true);
      if (x.mode === 'licence') CARD.show({ icon: x.pass ? '🪪' : '🚦', tone: x.pass ? 'gold' : 'warn', title: x.pass ? 'Licence granted!' : 'Not quite', text: x.pass ? 'You can now buy motor vehicles, run routes and take taxi and boat jobs.' : `${x.points} of ${x.need} points needed${x.early > 1 ? ' and too many early taps' : ''}. Try again in 30 seconds.`, lines: [['Points', x.points + ' / ' + x.max], ['Average', x.avg ? x.avg + ' ms' : '-']], btn: x.pass ? 'Let us go' : 'OK', onClose: () => this.open(x.pass ? 'shop' : 'drive') });
      else CARD.show({ icon: '🚦', tone: x.reward ? 'good' : 'info', title: `${x.points} of ${x.max} points`, text: x.early ? `${x.early} early tap${x.early > 1 ? 's' : ''} scored nothing.` : 'Quick reflexes pay.', lines: [['Average', x.avg ? x.avg + ' ms' : '-'], ['Reward', this.money(x.reward)]], btn: 'Nice one', onClose: () => this.open('drive') });
    } catch (e) { this.g = null; toast(e.message); this.open('drive') }
  },

  /* ----- Okada ride minigame ----- */
  async okada() {
    if (this.busy) return; this.busy = true;
    let r; try { r = await this.api('okada/start', {}) } catch (e) { this.busy = false; return toast(e.message) }
    this.busy = false; SHEET.close(true);
    this.g = { token: r.token, rounds: r.rounds, p: r, i: 0, lanes: [], lock: true };
    this.playSheet('Okada ride', () => this.oRound());
  },
  oRound() {
    const g = this.g; if (!g) return; const hz = g.rounds[g.i], p = g.p, ms = 2200; g.lock = true; g.picked = -1;
    const ob = ['🚧', '🚗', '🕳️', '🐐'];
    this.g$(`<div class="trprog"><small>${this.esc(p.passenger)} · ${this.esc(p.from)} → ${this.esc(p.to)} · ${g.i + 1}/${g.rounds.length}</small>${this.bar((g.i / g.rounds.length) * 100, '#f97316')}</div>
      <div class="trroad">${[0, 1, 2].map((l) => `<button class="trlane" onclick="TR.oPick(${l})" aria-label="Lane ${l + 1}">${hz[l] ? `<span class="trob" style="animation-duration:${ms}ms">${ob[(g.i + l) % ob.length]}</span>` : ''}<span class="trbike" id="trb${l}"></span></button>`).join('')}</div>
      <div class="trtime"><i style="animation-duration:${ms}ms"></i></div><p class="lgnote">Pick a free lane before the hazard reaches you.</p>`);
    g.t = setTimeout(() => { g.lock = false }, 600);          // a short beat so a ride cannot be tapped through
    g.i2 = setTimeout(() => this.oPick(-1), ms);
  },
  oPick(l) {
    const g = this.g; if (!g || (g.lock && l >= 0) || g.picked !== -1 && l >= 0) return;
    if (g.picked !== -1) return; g.picked = l; g.lock = true; clearTimeout(g.i2); clearTimeout(g.t); g.lanes.push(l);
    const b = document.getElementById('trb' + l); if (b) b.textContent = '🏍️';
    g.t = setTimeout(() => { if (!this.g) return; g.i++; g.i < g.rounds.length ? this.oRound() : this.oFinish() }, 350);
  },
  async oFinish() {
    const g = this.g; this.g$('<p class="empty">Dropping off your passenger…</p>');
    try {
      const r = this.take(await this.api('okada/finish', { token: g.token, lanes: g.lanes })), x = r.result; this.g = null; SHEET.close(true);
      CARD.show({ icon: '🏍️', tone: x.safe >= 4 ? 'good' : 'info', title: x.safe === x.rounds ? 'Smooth ride!' : 'Ride finished', text: `${x.passenger} got to ${x.to}. ${x.safe} of ${x.rounds} lanes were clear.${x.incident ? ' ' + x.incident : ''}`, lines: [['Fare', this.money(x.fare)]], btn: 'Next passenger', go: 'TR.okada()', goOnBtn: true, alt: 'Done', onClose: (go) => { if (!go) this.open('drive') } });
    } catch (e) { this.g = null; toast(e.message); this.open('drive') }
  },

  /* ================= Routes: bus business, airport shuttle, reputation ================= */
  routes() {
    const D = this.D, c = this.cat, r = D.rep; let h = this.strip();
    h += `<div class="lgev" style="--c:#6366f1">${UI.ic('award', '#6366f1', 46)}<div><h3>${r.emoji} ${this.esc(r.name)} · ${r.score}/100</h3><p>Reputation lifts route income <b>+${r.mult}%</b> and takes <b>${r.insDiscount}%</b> off insurance.${r.next ? ` Next: ${this.esc(r.next.name)} at ${r.next.at}.` : ' You are at the top!'}</p>${this.bar(r.score, '#6366f1')}<small>${r.todayLeft} reputation points still available today</small></div></div>`;
    const biz = D.vehicles.filter((v) => v.kind === 'bus' || v.kind === 'van');
    if (!biz.length) h += `<h4>Your fleet</h4><p class="empty">Buy a Danfo bus for bus routes or a shuttle van for airport runs in the Shop.</p><div class="trc">${this.btn('Open the Shop', "TR.go('shop')", { cls: 'big' })}</div>`;
    biz.forEach((v) => { h += `<h4>${v.emoji} ${this.esc(v.name)}</h4>` + (v.route ? this.running(v) : this.pickRoute(v)); });
    h += `<h4>Top public-transport reputation</h4>` + (this.tops ? this.tops.top.map((t) => UI.row({ ic: `<span class="lgi trem">${t.rank}</span>`, cls: t.me ? 'trme' : '', title: this.esc(t.name), sub: this.esc(t.tier), right: `<span class="lgrw">${t.rep}</span>` })).join('') + `<p class="lgnote">You are #${this.tops.mine.rank} with ${this.tops.mine.rep}.</p>` : this.empty('Loading…'));
    return h + `<p class="lgnote">Earn reputation by finishing long route runs, perfect quizzes and confirmed traffic reports. It drops for tickets, crashes and stranded passengers. Routes earn for at most ${c.routeMaxHours} hours before you collect, and use fuel and condition.</p>`;
  },
  running(v) {
    const R = v.route, mins = Math.round(R.hours * 60), busy = this.cat.routeMaxHours;
    return `<div class="trv"><div class="trh"><span class="trdot" style="background:${v.paintHex || '#e5e8f1'}">${v.emoji}</span><div><b>${this.esc(R.name)}</b><small>Running ${Math.floor(mins / 60)}h ${mins % 60}m${R.hours >= busy ? ' (full, collect now)' : ''}</small></div><div class="lgr"><b>${this.money(R.income)}</b></div></div>
      <div class="trbr"><small>Fuel ${Math.round(v.fuel)} / ${v.tank} L · condition ${Math.round(v.cond)}%</small></div>
      ${R.limited ? this.need(R.limited === 'fuel' ? 'Out of fuel. Passengers are stranded. Collect, refuel and run it again.' : 'Too worn to keep going. Collect and service it.') : ''}
      <div class="trbtns">${this.btn('Collect', `TR.act('route/collect',{id:'${v.id}'})`, { off: !R.income && !R.limited })}${this.btn('Collect & stop', `TR.act('route/collect',{id:'${v.id}',stop:true})`, { cls: 'ghost' })}${this.btn('Refuel', `TR.manage('${v.id}','care')`, { cls: 'ghost' })}</div></div>`;
  },
  pickRoute(v) {
    const rep = this.D.rep.score, list = this.cat.routes.filter((r) => r.kind === v.kind);
    return list.map((r) => { const lock = rep < r.minRep; return UI.row({ ic: UI.ic(v.kind === 'van' ? 'plane-departure' : 'route', lock ? '#9aa0b8' : '#6366f1'), title: this.esc(r.name), sub: lock ? `🔒 Opens at reputation ${r.minRep}` : `About ${this.money(r.rate)} per hour (rush hours pay more) · uses ${r.burn} L/h`, right: this.btn('Run', `TR.act('route/assign',{id:'${v.id}',route:'${r.id}'})`, { off: lock }) }) }).join('');
  },

  /* ================= Traffic: community reports ================= */
  traffic() {
    const R = this.reps, c = this.cat; let h = this.strip();
    h += `<h4>Live from drivers</h4>`;
    if (!R) h += this.empty('Loading…');
    else if (!R.reports.length) h += this.empty('No reports right now. Be the first to tell other drivers what the roads are like.');
    else h += R.reports.map((r) => { const k = c.reportKinds[r.kind] || { emoji: '🚦', label: r.kind }; return UI.row({ ic: `<span class="lgi trem">${k.emoji}</span>`, title: `${this.esc(r.road)}`, sub: `${this.esc(k.label)}${r.note ? ' · ' + this.esc(r.note) : ''}<br>${this.esc(r.name)} · ${UI.ago(r.at)}`,
      right: r.mine ? `<span class="lgrw">👍 ${r.up}</span>` : `<div class="trvote"><button class="${r.vote === 'up' ? 'on' : ''}" ${r.vote ? 'disabled' : ''} onclick="TR.vote('${r.id}','up')">👍 ${r.up}</button><button class="${r.vote === 'down' ? 'on' : ''}" ${r.vote ? 'disabled' : ''} onclick="TR.vote('${r.id}','down')">👎 ${r.down}</button></div>` }) }).join('');
    const f = this.rep, left = R ? R.left : 0;
    h += `<h4>Report traffic</h4><select class="sinput" id="trroad" onchange="TR.rep.road=this.value"><option value="">Choose a road…</option>${c.roads.map((r) => `<option ${f.road === r ? 'selected' : ''}>${this.esc(r)}</option>`).join('')}</select>
      <div class="trchips wrap">${Object.entries(c.reportKinds).map(([k, v]) => `<button class="${f.kind === k ? 'on' : ''}" onclick="TR.rep.kind='${k}';TR.keep();SHEET.paint()">${v.emoji} ${this.esc(v.label)}</button>`).join('')}</div>
      <input class="sinput" id="trnote" maxlength="${c.reports.noteMax}" placeholder="Add a short note (optional)" value="${this.esc(f.note)}" oninput="TR.rep.note=this.value" autocomplete="off">
      <div class="trc">${this.btn('Post report', 'TR.post()', { cls: 'big', off: !f.road || left <= 0 || (R && R.waitMs > 0) })}</div>
      <p class="lgnote">${left} reports left today. When ${c.reports.confirmsToPay} drivers confirm yours you earn ${this.money(c.reports.pay)} and reputation. Reports last ${Math.round(c.reports.ttlMs / 60000)} minutes. Please only report what you really see.</p>`;
    return h;
  },
  keep() { const n = document.getElementById('trnote'); if (n) this.rep.note = n.value },
  async post() {
    if (this.busy) return; this.keep(); this.busy = true;
    try { const r = await this.api('reports', { road: this.rep.road, kind: this.rep.kind, note: this.rep.note }); toast(r.flash); this.rep.note = ''; await this.loadReports(); this.D = { ...this.D }; this.loadTop() } catch (e) { toast(e.message) }
    this.busy = false;
  },
  async vote(id, v) { try { await this.api('reports/' + id + '/vote', { v }); await this.loadReports() } catch (e) { toast(e.message) } }
};
window.TR = TR;
