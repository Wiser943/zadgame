/* Style app (Phone -> Style): body, hair, clothes, tailor, jewellery, makeup, moves, photo poses, identity and privacy.
   Prices, ownership, seasons, durability and visibility are all decided by the server (routes/acstyle.js, utils/acstyle.js).
   This file also keeps the player's look in sync with the map, the 3D room, the HUD portrait and the live roster. */
const STYLE = {
  D: null, tab: 'body', sub: '', pv: null, busy: false, tried: '', fetching: null, timers: [],
  JK: { j_neck: 'neck', j_ear: 'ear', j_wrist: 'wrist', j_ring: 'ring', j_waist: 'waist', j_ankle: 'ankle' },
  MK: { m_lips: 'lips', m_eyes: 'eyes', m_cheeks: 'cheeks', m_liner: 'liner', m_glow: 'glow' },
  TABS: [['body', 'Body', '🧍'], ['salon', 'Salon', '💇'], ['clothes', 'Clothes', '👕'], ['culture', 'Culture', '🪘'], ['work', 'Work', '🦺'], ['season', 'Seasonal', '🍂'], ['shoes', 'Shoes', '👟'], ['jewel', 'Jewels', '💎'],
    ['makeup', 'Makeup', '💄'], ['tailor', 'Tailor', '🧵'], ['outfits', 'Outfits', '🗂️'], ['motion', 'Motion', '🕺'], ['pose', 'Photo', '📸'], ['id', 'Identity', '🪪']],
  money: n => '₦' + Math.floor(n).toLocaleString('en-NG'),
  it(id) { return this.items[id] },
  get me() { return this.D && this.D.me },
  accOf() { return this.me ? this.me.identity.access : {} },

  /* ---------- keeping the game in sync ---------- */
  async boot() {
    if (this.fetching) return this.fetching;
    this.fetching = this.load().catch(() => {}).then(() => { this.fetching = null; this.startTimers() }); return this.fetching;
  },
  async load() {
    const r = await NET.api('/api/ac/style/state'); this.D = r; this.items = Object.fromEntries(r.catalog.items.map(i => [i.id, i]));
    this.names = Object.fromEntries(r.catalog.items.map(i => [i.id, i.name]).concat(r.catalog.hair.map(h => ['hair:' + h.id, h.name])));
    S.cash = r.me.cash; this.apply(); this.paint();
  },
  reload() { return STYLE.load().catch(() => {}) },
  startTimers() {
    if (this.started) return; this.started = true;
    setInterval(() => { if (document.hidden || !this.me) return; NET.api('/api/ac/style/wear', { method: 'POST', body: {} }).then(r => { if (r.me) { this.D.me = r.me; this.apply(); if (r.broke && r.broke.length) { toast('🧵 ' + r.broke.join(', ') + ' wore out'); this.paint() } } }).catch(() => {}) }, 5 * 60 * 1000 + 3000);
    setInterval(() => this.liveMood(), 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.me) this.reload() });
  },
  mood(needs) {   // same rule as the server: [hunger, energy, fun, social, hygiene, bladder]
    if (!Array.isArray(needs) || needs.length < 6) return 'neutral'; const n = needs.map(v => typeof v === 'number' ? v : .9);
    if (n[0] < .2) return 'angry'; if (n[1] < .2) return 'sleepy'; if (n[2] < .2 || n[3] < .2) return 'sad'; if (n[4] < .2 || n[5] < .15) return 'stressed';
    const a = n.reduce((x, y) => x + y, 0) / n.length; return a > .8 ? 'happy' : a > .6 ? 'calm' : 'neutral';
  },
  liveMood() {
    const me = this.me; if (!me || !me.motion.autoMood || !S.render) return; const m = this.mood(S.needs);
    if (S.render.mood === m) return; S.render.mood = m; if (window.ROOM3D) ROOM3D.setMood(m); if (window.MAP3D && MAP3D.me) MAP3D.me.look.mood = m;
    if (this.pv) { const r = Object.assign({}, this.pv.av.look, { mood: m }); this.pv.look(r) }
    if (this.accOf().captions) toast('Your avatar looks ' + m);
  },
  ext() {
    const me = this.me, a = me ? me.identity.access : {}, gp = (typeof GP !== 'undefined' && GP.get) ? GP.get() : {};
    return { walk: me && me.motion.walk, idle: me && me.motion.idle, reduce: !!(a.reduceMotion || gp.reducedMotion), contrast: !!(a.contrast || gp.highContrast), noSparkle: !!(a.noSparkle || gp.reducedMotion) };
  },
  /* push the server's version of my look everywhere the game draws me */
  apply() {
    const me = this.me; if (!me) return; const r = Object.assign({}, me.render); if (me.motion.autoMood) r.mood = this.mood(S.needs); else r.mood = me.motion.mood;
    S.render = r; S.gender = r.g || S.gender; const ext = this.ext();
    try { localStorage.setItem('ac_style_acc', JSON.stringify(me.identity.access)) } catch (e) {}
    if (window.ROOM3D) { ROOM3D.setExt(ext); ROOM3D.setLook(r) }
    if (window.MAP3D) { MAP3D.setExt(ext); MAP3D.setLook(r) }
    if (typeof paintPortraits === 'function') paintPortraits();
    if (NET.sock) NET.sock.emit('style');
    this.refreshPreview();
  },
  refreshPreview() {
    const me = this.me; if (!me || !this.pv) return; this.tried = '';
    this.pv.look(S.render); this.pv.ext(this.ext()); this.setDesc();
  },
  setDesc() {
    const cv = document.getElementById('stCv'); if (!cv || !S.render) return; const t = ACAvatar.describe(S.render, this.names, 'Your avatar'); cv.setAttribute('aria-label', t);
    const d = document.getElementById('stDesc'); if (d) { d.textContent = t; d.style.display = this.me.identity.access.describe ? 'block' : 'none' }
  },
  take(r) {
    if (!r || !r.me) return; this.D.me = r.me; S.cash = r.me.cash; if (typeof render === 'function') render(); this.apply(); this.paint();
    if (r.errors && r.errors.length) toast(r.errors[0]);
    if (r.rewards && r.rewards.length) r.rewards.forEach(x => toast(`🏅 "${x.title}" +${this.money(x.reward)}`));
    if (this.accOf().captions && r.me) toast(ACAvatar.describe(S.render, this.names, 'Avatar'));
  },
  async call(path, method, body) {
    if (this.busy) return null; this.busy = true;
    try { const r = await NET.api('/api/ac/style' + path, { method: method || 'POST', body: body || {} }); this.take(r); return r }
    catch (e) { toast(e.message); return null } finally { this.busy = false }
  },

  /* ---------- helpers about items ---------- */
  owns(id) {
    const me = this.me, it = this.it(id); if (id.startsWith('t_')) return me.tailored.some(t => t.itemId === id && t.collected);
    if (!it) return false; return (it.price === 0 && !it.season && !it.job) || me.owned.includes(id) || (it.job && it.job === me.jobId);
  },
  slotKey(it) { return this.JK[it.slot] || this.MK[it.slot] || it.slot },
  eq(it) {
    const L = this.me.look, k = this.slotKey(it);
    if (this.JK[it.slot]) return (L.jewel || {})[k] === it.id; if (this.MK[it.slot]) return !!(L.makeup && L.makeup[k] && L.makeup[k].id === it.id);
    if (it.slot === 'pose') return this.curPose === it.id;
    if (it.slot === 'walk') return this.me.motion.walk === it.id; if (it.slot === 'idle') return this.me.motion.idle === it.id;
    return L[it.slot] === it.id;
  },
  dura(id) { const d = this.me.dura[id]; return typeof d === 'number' ? d : 100 },
  color(it) { const d = this.me.dyes[it.id]; return (d && d.c1) || (it.r && it.r.c1) || '#d9b24a' },
  cname(hex) { const m = (this.D.catalog.dyes.concat(this.D.catalog.hairColors)).find(c => c[1].toLowerCase() === String(hex).toLowerCase()); return m ? m[0] : hex },
  seasonOf(id) { return this.D.catalog.seasons.find(s => s.id === id) },
  /* what I'd look like wearing an item (no server call, no purchase) */
  tryOn(id) {
    const it = this.it(id), me = this.me; if (!it || !it.r) return; const r = JSON.parse(JSON.stringify(S.render)), piece = Object.assign({}, it.r, { id });
    if (it.slot === 'outfit') { r.outfit = piece; r.top = null; r.bottom = null } else if (['top', 'bottom'].includes(it.slot)) { r.outfit = null; r[it.slot] = piece }
    else if (['shoes', 'head', 'neckwear', 'hand', 'face'].includes(it.slot)) r[it.slot] = piece;
    else if (this.JK[it.slot]) { r.jewel = r.jewel || {}; r.jewel[this.JK[it.slot]] = piece } else if (this.MK[it.slot]) { r.makeup = r.makeup || {}; r.makeup[this.MK[it.slot]] = { id, c: it.palette[0], a: .7 } }
    this.tried = id; this.pv && this.pv.look(r); const b = document.getElementById('stTry'); if (b) { b.style.display = 'flex'; b.querySelector('span').textContent = 'Trying on ' + it.name }
  },
  resetTry() { this.tried = ''; this.pv && this.pv.look(S.render); const b = document.getElementById('stTry'); if (b) b.style.display = 'none' },

  /* ---------- the app ---------- */
  async open() {
    PH.view = 'style'; if (PH.TINT && !PH.TINT.style) PH.TINT.style = '#ffffff';
    PH.shell('Style', 'STYLE.close()', `<div class="abody stx" id="ab"><div class="stpv"><canvas id="stCv" width="300" height="400" role="img" aria-label="Your avatar"></canvas><div class="sttry" id="stTry" style="display:none"><span></span><button onclick="STYLE.resetTry()">Reset</button></div></div><div id="stDesc" class="stdesc" style="display:none"></div><div class="sttabs" id="stTabs"></div><div id="stBody"><p class="empty">Loading…</p></div></div>`);
    if (!this.D) { try { await this.load() } catch (e) { toast(e.message); return } }
    if (PH.view !== 'style') return; this.mountPreview(); this.paint(true);
  },
  close() { this.stopPreview(); PH.close() },
  mountPreview() {
    this.stopPreview(); const cv = document.getElementById('stCv'); if (!cv) return;
    this.pv = ACAvatar.preview(cv, S.render.g, { render: S.render, turn: true, ext: this.ext() }); this.setDesc();
  },
  stopPreview() { if (this.pv) { this.pv.stop(); this.pv = null } },
  go(t, sub) { this.tab = t; this.sub = sub || ''; this.resetTry(); this.paint(); const ab = document.getElementById('ab'); if (ab) ab.scrollTop = 0 },
  paint(first) {
    const body = document.getElementById('stBody'), tabs = document.getElementById('stTabs'); if (!body || PH.view !== 'style' || !this.me) return;
    const st = (document.getElementById('ab') || {}).scrollTop || 0;
    tabs.innerHTML = this.TABS.map(t => `<button class="${t[0] === this.tab ? 'on' : ''}" onclick="STYLE.go('${t[0]}')"><i>${t[2]}</i>${t[1]}</button>`).join('');
    const on = tabs.querySelector('.on'); if (first && on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    body.innerHTML = `<div class="stcash">Wallet <b>${this.money(this.me.cash)}</b></div>` + (this['t_' + this.tab] ? this['t_' + this.tab]() : '');
    const ab = document.getElementById('ab'); if (ab && !first) ab.scrollTop = st; this.tabWire();
  },
  tabWire() {
    document.querySelectorAll('#stBody .stcol input[type=color]').forEach(i => { i.oninput = () => { const sw = i.parentNode.querySelector('.swp'); if (sw) sw.style.background = i.value } });
    const r = document.getElementById('stInt'); if (r) r.oninput = () => { document.getElementById('stIntV').textContent = Math.round(r.value * 100) + '%' };
  },

  /* ----- shared pieces ----- */
  chips(list, cur, fn) { return `<div class="stchips">${list.map(c => `<button class="${c[0] === cur ? 'on' : ''}" onclick="${fn}('${c[0]}')">${c[1]}</button>`).join('')}</div>` },
  swatches(list, cur, fn) { const n = this.me.identity.access.colourNames; return `<div class="stsw">${list.map(c => { const col = Array.isArray(c) ? c[1] : c, nm = Array.isArray(c) ? c[0] : ''; return `<button class="${col.toLowerCase() === String(cur).toLowerCase() ? 'on' : ''}" style="--c:${col}" aria-label="${esc(nm || col)}" onclick="${fn}('${col}')"><i></i>${n && nm ? `<small>${esc(nm)}</small>` : ''}</button>` }).join('')}</div>` },
  bar(id) { const d = this.dura(id), cls = d <= 0 ? 'bad' : d <= 20 ? 'low' : ''; return `<div class="stdur ${cls}" title="Condition ${Math.round(d)}%"><i style="width:${Math.max(0, Math.min(100, d))}%"></i></div>` },
  rar(it) { return it.rarity && it.rarity !== 'common' ? `<em class="rar ${it.rarity}">${it.rarity}</em>` : '' },
  card(it, o) {
    o = o || {}; const me = this.me, owned = this.owns(it.id), eq = owned && this.eq(it), wearable = it.wear > 0 || it.id.startsWith('t_'), du = wearable && owned ? this.dura(it.id) : 100, out = du <= 0;
    const free = it.price === 0 && !it.season && !it.job, jobFree = it.job && it.job === me.jobId, sea = it.season ? this.seasonOf(it.season) : null, offSeason = sea && !sea.on && !owned;
    let price = it.price; if (it.job && me.jobId === it.job) price = 0;
    let act = '';
    if (!owned) act = offSeason ? `<button class="stb dis" disabled>Back in ${sea.daysUntil} d</button>` : `<button class="stb buy" onclick="STYLE.buy('${it.id}')">Buy ${this.money(price || it.price)}</button>`;
    else if (out) act = `<button class="stb red" onclick="STYLE.repair('${it.id}')">Repair</button>`;
    else act = `<button class="stb ${eq ? 'on' : ''}" onclick="STYLE.wear('${it.id}')">${eq ? 'Remove' : 'Wear'}</button>`;
    const tryB = !owned && it.r ? `<button class="stb ghost" onclick="STYLE.tryOn('${it.id}')">Try</button>` : '', dye = owned && it.dye && !out ? `<button class="stb ghost" onclick="STYLE.dyeSheet('${it.id}')" aria-label="Dye ${esc(it.name)}">🎨</button>` : '';
    const rep = owned && wearable && du < 100 && du > 0 ? `<button class="stb ghost" onclick="STYLE.repair('${it.id}')" title="Repair">🧵</button>` : '';
    const sub = [it.culture ? `<b>${esc(it.culture)}</b>` : '', it.note ? esc(it.note) : '', jobFree ? 'Free while you hold this job' : '', free ? 'Free' : ''].filter(Boolean).join(' · ');
    return `<div class="stcard ${eq ? 'eq' : ''} ${out ? 'out' : ''}"><span class="stdot" style="background:${this.color(it)}">${it.r && it.r.c2 ? `<i style="background:${(me.dyes[it.id] && me.dyes[it.id].c2) || it.r.c2}"></i>` : ''}</span>
      <div class="stmain"><div class="stnm">${esc(it.name)} ${this.rar(it)}${owned && !free && !jobFree ? '<span class="ownd">owned</span>' : ''}</div>${sub ? `<div class="stsub">${sub}</div>` : ''}${wearable && owned ? this.bar(it.id) : ''}</div>
      <div class="stact">${tryB}${dye}${rep}${act}</div></div>`;
  },
  list(items) { return items.length ? `<div class="stlist">${items.map(i => this.card(i)).join('')}</div>` : '<p class="empty">Nothing here yet.</p>' },
  of(f) { return this.D.catalog.items.filter(f) },
  setProgress(set) {
    const c = this.me.collection[set]; if (!c) return ''; const pct = Math.round(c.owned / c.total * 100), done = new Set(this.me.claimed);
    return `<div class="stcol-set"><div class="stcs-h"><b>${c.icon} ${esc(c.name)}</b><span>${c.owned}/${c.total}</span></div><div class="stdur ok"><i style="width:${pct}%"></i></div>
      <div class="stmile">${c.tiers.map(t => `<span class="${done.has(t.key) ? 'got' : ''}">${t.need} → ${esc(t.title)} · ${this.money(t.reward)}</span>`).join('')}</div></div>`;
  },

  /* ----- actions ----- */
  async wear(id) {
    const it = id.startsWith('t_') ? { id, slot: 'outfit' } : this.it(id), L = this.me.look, k = this.slotKey(it), on = this.owns(id) && this.eq(it);
    if (it.slot === 'pose') return this.setPose(on ? '' : id);
    if (it.slot === 'walk' || it.slot === 'idle') return this.call('/motion', 'PUT', { [it.slot]: id });
    if (this.JK[it.slot]) { const j = Object.assign({}, L.jewel || {}); if (on) delete j[k]; else j[k] = id; return this.call('/look', 'PUT', { jewel: j }) }
    if (this.MK[it.slot]) return this.makeupSet(it, on);
    if (['top', 'bottom'].includes(it.slot)) return this.call('/look', 'PUT', { outfit: '', [it.slot]: on ? '' : id });
    return this.call('/look', 'PUT', { [it.slot]: on ? (it.slot === 'shoes' ? 'shoe_canvas' : '') : id });
  },
  async buy(id) { const it = this.it(id); const r = await this.call('/buy', 'POST', { id }); if (r) { toast('Bought ' + it.name); this.tried = '' } },
  async repair(id) { const r = await this.call('/repair', 'POST', { id }); if (r) toast('Repaired for ' + this.money(r.paid)) },
  async makeupSet(it, remove) {
    const L = this.me.look, k = this.slotKey(it), mk = Object.assign({}, L.makeup || {}); if (remove) delete mk[k]; else mk[k] = { id: it.id, c: (mk[k] && mk[k].id === it.id && mk[k].c) || it.palette[0], a: (mk[k] && mk[k].a) || .7 };
    return this.call('/look', 'PUT', { makeup: mk });
  },
  async shade(id, c) { const it = this.it(id), k = this.slotKey(it), mk = Object.assign({}, this.me.look.makeup || {}), cur = mk[k] && mk[k].id === id ? mk[k] : { id, a: .7 }; mk[k] = { id, c, a: cur.a }; return this.call('/look', 'PUT', { makeup: mk }) },
  async strength(id, v) { const it = this.it(id), k = this.slotKey(it), mk = Object.assign({}, this.me.look.makeup || {}); if (!mk[k] || mk[k].id !== id) return; mk[k] = Object.assign({}, mk[k], { a: +v }); return this.call('/look', 'PUT', { makeup: mk }) },
  dyeSheet(id) {
    const it = this.it(id), d = this.me.dyes[id] || {}, price = it.dyeCost; this.dye = { id, c1: d.c1 || it.r.c1, c2: d.c2 || it.r.c2 };
    PH.sheet(`<h3>Dye ${esc(it.name)}</h3><p class="hint2">${price ? 'Each dye job costs ' + this.money(price) + '.' : ''} It stays until you dye it again.</p>
      <div class="lab2">MAIN COLOUR</div>${this.swatches(this.D.catalog.dyes, this.dye.c1, 'STYLE.pickDye1')}<label class="stcol"><span>Custom</span><input type="color" id="dc1" value="${this.dye.c1}" onchange="STYLE.pickDye1(this.value)"></label>
      ${it.dye >= 2 ? `<div class="lab2">TRIM / PATTERN COLOUR</div>${this.swatches(this.D.catalog.dyes, this.dye.c2 || '#ffffff', 'STYLE.pickDye2')}<label class="stcol"><span>Custom</span><input type="color" id="dc2" value="${this.dye.c2 || '#ffffff'}" onchange="STYLE.pickDye2(this.value)"></label>` : ''}
      <button class="fopt" onclick="STYLE.doDye()"><span>🎨 Dye it · ${this.money(price)}</span></button><button class="fopt" onclick="STYLE.doDye(true)"><span>↩ Back to original (free)</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`);
  },
  pickDye1(c) { this.dye.c1 = c; this.sheetSw() }, pickDye2(c) { this.dye.c2 = c; this.sheetSw() },
  sheetSw() { document.querySelectorAll('.asheet .stsw').forEach((g, i) => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.style.getPropertyValue('--c').toLowerCase() === (i ? this.dye.c2 : this.dye.c1).toLowerCase()))) },
  async doDye(reset) { const d = this.dye; const r = await this.call('/dye', 'POST', reset ? { id: d.id, reset: true } : { id: d.id, c1: d.c1, c2: d.c2 }); if (r) { PH.closeSheet(); toast(reset ? 'Back to original' : 'Dyed 🎨') } },

  /* ----- 141 body ----- */
  t_body() {
    const me = this.me, C = this.D.catalog;
    return `<div class="lab2">BASE MODEL</div><p class="hint2">This only sets the frame your outfits are fitted to. Your pronouns are separate (see Identity).</p>
      ${this.chips([['male', 'Model 1 · broader frame'], ['female', 'Model 2 · slimmer frame']], me.render.g, 'STYLE.model')}
      <div class="lab2">BODY TYPE</div><div class="stlist">${C.bodies.map(b => `<button class="stcard ${me.look.body === b.id ? 'eq' : ''}" onclick="STYLE.setBody('${b.id}')"><div class="stmain"><div class="stnm">${esc(b.name)}</div><div class="stsub">${b.h > 1.05 ? 'Taller' : b.h < .95 ? 'Shorter' : 'Average height'} · ${b.tw > 1.15 ? 'fuller' : b.tw < .9 ? 'slimmer' : 'balanced'} build</div></div><span class="stb ${me.look.body === b.id ? 'on' : ''}">${me.look.body === b.id ? 'Selected' : 'Choose'}</span></button>`).join('')}</div>
      <div class="lab2">SKIN TONE</div>${this.swatches(C.skin.map((c, i) => [ACAvatar.SKIN_HEX && ['Very light', 'Light', 'Light tan', 'Tan', 'Medium brown', 'Brown', 'Deep brown', 'Dark brown', 'Very dark brown', 'Deepest brown'][i], c]), me.look.skin, 'STYLE.setSkin')}<p class="hint2">Body types and skin tones are always free.</p>`;
  },
  async model(g) { if (g === S.render.g) return; if (typeof setGender === 'function') setGender(g); setTimeout(() => this.reload().then(() => this.paint()), 900) },
  setBody(id) { return this.call('/look', 'PUT', { body: id }) }, setSkin(c) { return this.call('/look', 'PUT', { skin: c }) },

  /* ----- 142 + 154 salon ----- */
  t_salon() {
    const me = this.me, C = this.D.catalog, s = me.salon, cur = me.look.hair, hc = this.hc || me.look.hairColor, loyal = s.loyalNext;
    const row = h => { const price = loyal ? Math.round(h.price * .9 / 100) * 100 : h.price, on = cur === h.id; return `<div class="stcard ${on ? 'eq' : ''}"><div class="stmain"><div class="stnm">${esc(h.name)}${h.wig ? ' <span class="ownd">wig</span>' : ''}</div><div class="stsub">Lasts about ${h.g} days before a touch-up</div></div><div class="stact"><button class="stb ghost" onclick="STYLE.tryHair('${h.id}')">Try</button><button class="stb ${on ? 'on' : 'buy'}" onclick="STYLE.salon('style',{hair:'${h.id}'})">${on ? 'Redo' : ''} ${this.money(price)}</button></div></div>` };
    const fresh = s.fresh ? `<span class="stfresh">✨ Fresh until ${new Date(s.freshUntil).toLocaleString('en-NG', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>` : '';
    return `<div class="stinfo">Visit <b>${s.visits}</b> time${s.visits === 1 ? '' : 's'} · every 5th visit is 10% off${loyal ? ' <b>(this one!)</b>' : ''} ${fresh}</div>
      ${s.overgrown ? `<div class="stwarn">Your hair needs a touch-up. <button class="stb buy" onclick="STYLE.salon('touchup')">Touch-up ${this.money(s.touchupCost)}</button></div>` : ''}
      <div class="lab2">HAIR COLOUR (added when you get a style)</div>${this.swatches(C.hairColors, hc, 'STYLE.pickHC')}
      <button class="fopt" onclick="STYLE.salon('colour',{color:STYLE.hc||'${me.look.hairColor}'})"><span>🎨 Colour only · ${this.money(C.salon.colour)}</span></button>
      <div class="lab2">💈 BARBER</div><div class="stlist">${C.hair.filter(h => h.shop === 'barber').map(row).join('')}</div>
      <div class="lab2">💇🏾‍♀️ SALON</div><div class="stlist">${C.hair.filter(h => h.shop === 'salon').map(row).join('')}</div>
      <div class="lab2">BEARD</div><div class="stlist">${C.beards.map(b => `<div class="stcard ${me.look.beard === b.id ? 'eq' : ''}"><div class="stmain"><div class="stnm">${esc(b.name)}</div></div><div class="stact"><button class="stb ${me.look.beard === b.id ? 'on' : 'buy'}" ${me.look.beard === b.id ? 'disabled' : ''} onclick="STYLE.salon('beard',{beard:'${b.id}'})">${me.look.beard === b.id ? 'Current' : (b.price ? this.money(b.price) : 'Shave · free')}</button></div></div>`).join('')}</div>
      <div class="lab2">EXTRAS</div><div class="stlist"><div class="stcard"><div class="stmain"><div class="stnm">Wash &amp; tidy</div><div class="stsub">Quick freshen-up, fresh for 1 day</div></div><div class="stact"><button class="stb buy" onclick="STYLE.salon('wash')">${this.money(C.salon.wash)}</button></div></div>
      <div class="stcard"><div class="stmain"><div class="stnm">Facial glow</div><div class="stsub">Fresh for 3 days</div></div><div class="stact"><button class="stb buy" onclick="STYLE.salon('spa')">${this.money(C.salon.spa)}</button></div></div></div>
      ${s.history.length ? `<div class="lab2">RECENT VISITS</div><div class="sgrp">${s.history.slice(0, 5).map(h => `<div class="trow"><span class="tl">${esc(h.name)}</span><span class="stsub">${this.money(h.cost)}</span></div>`).join('')}</div>` : ''}`;
  },
  pickHC(c) { this.hc = c; this.paint() },
  tryHair(id) { const r = JSON.parse(JSON.stringify(S.render)); r.hair = { style: id, color: this.hc || r.hair.color }; this.tried = 'hair'; this.pv && this.pv.look(r); const b = document.getElementById('stTry'); if (b) { b.style.display = 'flex'; b.querySelector('span').textContent = 'Trying ' + this.D.catalog.hair.find(h => h.id === id).name } },
  async salon(svc, extra) {
    const body = Object.assign({ svc }, extra || {}); if (svc === 'style' && this.hc) body.color = this.hc;
    const a = this.accOf(); if (this.busy) return; this.busy = true; let r;
    try { r = await NET.api('/api/ac/style/salon', { method: 'POST', body }) } catch (e) { this.busy = false; return toast(e.message) } this.busy = false;
    // short "in the chair" moment, then the reveal
    if (!a.reduceMotion && !(typeof GP !== 'undefined' && GP.get().reducedMotion)) {
      this.chair(svc === 'spa' ? 'Facial glow' : svc === 'wash' ? 'Wash & tidy' : svc === 'beard' ? 'Beard trim' : 'Getting styled', () => { this.hc = null; this.take(r); toast('✨ Fresh!' + (r.loyalty ? ' (10% loyalty discount)' : '')) });
    } else { this.hc = null; this.take(r); toast('Visit done. You look fresh!') }
  },
  chair(label, done) {
    const ov = document.createElement('div'); ov.className = 'stchair'; ov.innerHTML = `<div><span class="stsc">✂️</span><b>${esc(label)}…</b><div class="stdur ok"><i id="stChairBar"></i></div><small>Tap to skip</small></div>`; PH.$a().appendChild(ov);
    let fin = false; const end = () => { if (fin) return; fin = true; ov.remove(); done() }; ov.onclick = end; const t0 = performance.now(), D = 3200;
    const tick = n => { if (fin) return; const p = Math.min(1, (n - t0) / D), b = document.getElementById('stChairBar'); if (b) b.style.width = p * 100 + '%'; p >= 1 ? end() : requestAnimationFrame(tick) }; requestAnimationFrame(tick);
  },

  /* ----- 143-145, 152 clothes, culture, work, seasonal ----- */
  t_clothes() {
    const sub = this.sub || 'top', slots = { top: ['top'], bottom: ['bottom'], hats: ['head'], face: ['face'] };
    return this.chips([['top', 'Tops'], ['bottom', 'Bottoms'], ['hats', 'Hats'], ['face', 'Glasses']], sub, 'STYLE.subTab') + `<p class="hint2">Wearing a full outfit (Culture / Work / Seasonal) replaces top and bottom.</p>` +
      this.list(this.of(i => i.cat === 'clothes' && slots[sub].includes(i.slot)));
  },
  subTab(s) { this.sub = s; this.paint() },
  t_culture() {
    const sub = this.sub || 'outfits';
    return this.chips([['outfits', 'Traditional outfits'], ['items', 'Cultural items']], sub, 'STYLE.subTab') + `<p class="hint2">Each piece shows where it comes from. Wear them with pride, and with respect.</p>` +
      (sub === 'outfits' ? this.list(this.of(i => i.cat === 'traditional')) : this.setProgress('culture') + this.list(this.of(i => i.cat === 'culture')));
  },
  t_work() {
    const me = this.me, job = me.jobId; const jn = job && this.D.catalog.items.find(i => i.job === job);
    return `<div class="stinfo">${job ? 'Your job uniform is <b>free to wear</b> while you work there.' : 'Get a job in the Jobs app to wear its uniform for free.'}</div>
      <button class="trow stt" onclick="STYLE.autoUni()"><span class="tl">Wear my uniform at work<small class="nsub">Weekdays 8am to 5pm (Lagos time) while employed</small></span><span class="sw2 ${me.identity.autoUniform ? 'on' : ''}"><i></i></span></button>
      ${this.list(this.of(i => i.cat === 'uniform').sort((a, b) => (b.job === job) - (a.job === job)))}`;
  },
  autoUni() { return this.call('/identity', 'PUT', { autoUniform: !this.me.identity.autoUniform }) },
  t_season() {
    const C = this.D.catalog;
    return C.seasons.map(s => `<div class="stseason ${s.on ? 'on' : ''}"><b>${s.icon} ${esc(s.name)}</b><span>${s.on ? `On now · ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left` : `Back in ${s.daysUntil} day${s.daysUntil === 1 ? '' : 's'}`}</span><small>${esc(s.blurb)}</small></div>`).join('') +
      `<p class="hint2">Seasonal pieces can only be bought while their season is on. Once you own one it is yours to wear all year.</p>` +
      C.seasons.map(s => { const l = this.of(i => i.season === s.id); return `<div class="lab2">${s.icon} ${esc(s.name.toUpperCase())}</div>` + this.list(l) }).join('');
  },

  /* ----- 150 shoes, 151 jewels ----- */
  t_shoes() {
    const sub = this.sub || 'sneakers';
    return this.chips([['sneakers', 'Sneakers'], ['other', 'Other shoes']], sub, 'STYLE.subTab') + (sub === 'sneakers' ? this.setProgress('sneakers') + this.list(this.of(i => i.cat === 'sneaker').sort((a, b) => a.price - b.price)) : this.list(this.of(i => i.cat === 'shoes' || (i.slot === 'shoes' && i.cat === 'seasonal'))));
  },
  t_jewel() {
    const names = { j_neck: 'Necklaces', j_ear: 'Earrings', j_wrist: 'Wrist', j_ring: 'Rings', j_waist: 'Waist beads', j_ankle: 'Anklets' };
    return this.setProgress('jewel') + Object.keys(names).map(sl => { const l = this.of(i => i.slot === sl); return l.length ? `<div class="lab2">${names[sl].toUpperCase()}</div>` + this.list(l) : '' }).join('');
  },

  /* ----- 153 makeup ----- */
  t_makeup() {
    const me = this.me, names = { m_lips: 'Lips', m_eyes: 'Eyes', m_liner: 'Liner', m_cheeks: 'Cheeks', m_glow: 'Glow' };
    return Object.keys(names).map(sl => `<div class="lab2">${names[sl].toUpperCase()}</div><div class="stlist">${this.of(i => i.slot === sl).map(it => {
      const owned = this.owns(it.id), k = this.slotKey(it), cur = me.look.makeup && me.look.makeup[k] && me.look.makeup[k].id === it.id ? me.look.makeup[k] : null, sea = it.season ? this.seasonOf(it.season) : null;
      return `<div class="stcard ${cur ? 'eq' : ''}"><div class="stmain"><div class="stnm">${esc(it.name)} ${this.rar(it)}</div>${owned ? `${this.swatches(it.palette, cur ? cur.c : '', `((c)=>STYLE.shade('${it.id}',c))`)}${cur ? `<label class="stint">Strength <input type="range" id="stInt" min=".3" max="1" step=".1" value="${cur.a}" onchange="STYLE.strength('${it.id}',this.value)"><span id="stIntV">${Math.round(cur.a * 100)}%</span></label>` : ''}` : `<div class="stsw">${it.palette.map(c => `<button style="--c:${c}" disabled><i></i></button>`).join('')}</div>`}</div>
        <div class="stact">${!owned ? (sea && !sea.on ? `<button class="stb dis" disabled>Back in ${sea.daysUntil} d</button>` : `<button class="stb ghost" onclick="STYLE.tryOn('${it.id}')">Try</button><button class="stb buy" onclick="STYLE.buy('${it.id}')">${this.money(it.price)}</button>`) : `<button class="stb ${cur ? 'on' : ''}" onclick="STYLE.wear('${it.id}')">${cur ? 'Remove' : 'Wear'}</button>`}</div></div>`;
    }).join('')}</div>`).join('');
  },

  /* ----- 146 tailor ----- */
  tf: { base: 'kaftan', fabric: 'ankara', fit: 'regular', c1: '#d9b24a', c2: '#2f9e63', label: '', rush: false },
  tprice() { const T = this.D.catalog.tailor, f = this.tf, b = T.bases[f.base], fa = T.fabrics[f.fabric]; let p = Math.round(b.price * fa.mult / 500) * 500 + (f.label ? T.embroidery : 0); if (this.me.jobId === 'fashion') p = Math.round(p * (1 - T.fashionDiscount) / 500) * 500; return f.rush ? Math.round(p * (1 + T.rush) / 500) * 500 : p },
  tpiece(f) { const T = this.D.catalog.tailor, b = T.bases[f.base], fa = T.fabrics[f.fabric], K = { agbada: 'agbada', buba_sokoto: 'longtop', kaftan: 'longtop', iro_buba: 'iro', dress: 'dress', senator: 'longtop', jumpsuit: 'coverall', shirt_set: 'dashiki' }; return { k: K[f.base], c1: f.c1, c2: f.c2, pat: fa.pat, deco: f.base === 'senator' ? 'senator' : 'trim', fit: T.fits.includes(f.fit) ? { slim: .93, regular: 1, loose: 1.1 }[f.fit] : 1, label: f.label, id: 'preview' } },
  tpreview() { const r = JSON.parse(JSON.stringify(S.render)); r.outfit = this.tpiece(this.tf); r.top = null; r.bottom = null; this.tried = 'tailor'; this.pv && this.pv.look(r); const b = document.getElementById('stTry'); if (b) { b.style.display = 'flex'; b.querySelector('span').textContent = 'Previewing your design' } },
  t_tailor() {
    const me = this.me, T = this.D.catalog.tailor, f = this.tf, now = Date.now(), mins = Math.max(1, Math.round(T.fabrics[f.fabric].mins));
    const opt = (obj, cur, fn) => this.chips(Object.entries(obj).map(([k, v]) => [k, v.name + ' · ' + this.money(v.price || 0)].slice(0, 2)), cur, fn);
    const orders = me.tailored.map(t => { const left = t.readyAt - now, ready = left <= 0; return `<div class="stcard ${t.collected && me.look.outfit === t.itemId ? 'eq' : ''}"><span class="stdot" style="background:${t.c1}"><i style="background:${t.c2}"></i></span><div class="stmain"><div class="stnm">${esc(T.bases[t.base].name)} · ${esc(T.fabrics[t.fabric].name)}</div><div class="stsub">${esc(t.fit)} fit${t.label ? ' · "' + esc(t.label) + '"' : ''}</div>${t.collected ? this.bar(t.itemId) : ''}</div>
      <div class="stact">${!t.collected ? (ready ? `<button class="stb buy" onclick="STYLE.collect('${t.id}')">Collect</button>` : `<button class="stb dis" disabled>${Math.ceil(left / 60000)} min</button>`) : `<button class="stb ${me.look.outfit === t.itemId ? 'on' : ''}" onclick="STYLE.wear('${t.itemId}')">${me.look.outfit === t.itemId ? 'Remove' : 'Wear'}</button><button class="stb ghost" onclick="STYLE.delT('${t.id}')" aria-label="Remove piece">🗑</button>`}</div></div>` }).join('');
    return `<div class="stinfo">${me.jobId === 'fashion' ? '🧵 Fashion job discount: <b>20% off</b> ' : ''}Design a one-off piece. Up to ${T.maxPieces} pieces, ${T.maxPending} being made at once.</div>
      <div class="lab2">STYLE</div>${this.chips(Object.entries(T.bases).map(([k, v]) => [k, v.name]), f.base, 'STYLE.ts_base')}
      <div class="lab2">FABRIC</div>${this.chips(Object.entries(T.fabrics).map(([k, v]) => [k, `${v.name} ×${v.mult}`]), f.fabric, 'STYLE.ts_fabric')}
      <div class="lab2">FIT</div>${this.chips(T.fits.map(k => [k, k[0].toUpperCase() + k.slice(1)]), f.fit, 'STYLE.ts_fit')}
      <div class="lab2">MAIN COLOUR</div>${this.swatches(this.D.catalog.dyes, f.c1, 'STYLE.ts_c1')}<div class="lab2">TRIM / PATTERN COLOUR</div>${this.swatches(this.D.catalog.dyes, f.c2, 'STYLE.ts_c2')}
      <div class="lab2">EMBROIDERY NAME (optional, +${this.money(T.embroidery)})</div><input class="sinput" id="stLab" maxlength="${T.labelMax}" value="${esc(f.label)}" placeholder="e.g. Tolu" onchange="STYLE.tf.label=this.value;STYLE.paint()">
      <button class="trow stt" onclick="STYLE.tf.rush=!STYLE.tf.rush;STYLE.paint()"><span class="tl">Rush order<small class="nsub">+${Math.round(T.rush * 100)}% · ready in 30 seconds instead of ${mins} min</small></span><span class="sw2 ${f.rush ? 'on' : ''}"><i></i></span></button>
      <div class="sthb"><button class="fopt" onclick="STYLE.tpreview()"><span>👁 Preview on me</span></button><button class="fopt grn" onclick="STYLE.order()"><span>Order · ${this.money(this.tprice())}</span></button></div>
      ${orders ? `<div class="lab2">YOUR TAILOR-MADE PIECES</div><div class="stlist">${orders}</div>` : ''}`;
  },
  tset(k, v) { this.tf[k] = v; this.paint(); this.tpreview() },
  ts_base(v) { this.tset('base', v) }, ts_fabric(v) { this.tset('fabric', v) }, ts_fit(v) { this.tset('fit', v) }, ts_c1(v) { this.tset('c1', v) }, ts_c2(v) { this.tset('c2', v) },
  async order() { const r = await this.call('/tailor/order', 'POST', this.tf); if (r) { toast('Order placed 🧵'); this.resetTry() } },
  async collect(id) { const r = await this.call('/tailor/collect', 'POST', { id }); if (r) toast('Ready to wear!') },
  async delT(id) { if (!confirm('Remove this piece for good? You will not get a refund.')) return; this.call('/tailor/' + id, 'DELETE') },

  /* ----- 148 outfit presets + 149 durability ----- */
  t_outfits() {
    const me = this.me, wearable = Object.keys(me.dura).filter(id => me.dura[id] < 100 && (id.startsWith('t_') || this.it(id))), nm = id => id.startsWith('t_') ? 'Tailor-made piece' : this.it(id).name;
    return `<div class="lab2">SAVE THIS OUTFIT</div><div class="stsave"><input class="sinput" id="stPn" maxlength="20" placeholder="Name, e.g. Owambe Saturday"><button class="stb buy" onclick="STYLE.savePreset()">Save</button></div>
      <p class="hint2">Presets remember your clothes, shoes, accessories, jewellery and makeup (up to 8).</p>
      ${me.presets.length ? `<div class="stlist">${me.presets.map(p => `<div class="stcard"><div class="stmain"><div class="stnm">${esc(p.name)}</div><div class="stsub">${esc(ACAvatar.describe(p.render, this.names, '').replace(/^: ?/, '').slice(0, 110))}</div></div><div class="stact"><button class="stb ghost" onclick="STYLE.tryPreset('${p.id}')">Try</button><button class="stb buy" onclick="STYLE.loadPreset('${p.id}')">Wear</button><button class="stb ghost" onclick="STYLE.updPreset('${p.id}','${esc(p.name)}')" title="Overwrite with what I'm wearing">💾</button><button class="stb ghost" onclick="STYLE.delPreset('${p.id}')" aria-label="Delete preset">🗑</button></div></div>`).join('')}</div>` : '<p class="empty">No presets yet.</p>'}
      <div class="lab2">CONDITION</div><p class="hint2">Clothes and shoes wear out the longer you wear them. Worn-out pieces look ragged and can't be worn until repaired.</p>
      ${wearable.length ? `<div class="stlist">${wearable.map(id => `<div class="stcard ${me.dura[id] <= 0 ? 'out' : ''}"><div class="stmain"><div class="stnm">${esc(nm(id))}</div>${this.bar(id)}</div><div class="stact"><span class="stsub">${Math.round(me.dura[id])}%</span><button class="stb buy" onclick="STYLE.repair('${id}')">Repair</button></div></div>`).join('')}</div><button class="fopt" onclick="STYLE.repair('all')"><span>🧵 Repair everything</span></button>` : '<p class="empty">Everything is in good shape.</p>'}`;
  },
  savePreset() { const el = document.getElementById('stPn'); const n = (el && el.value || '').trim(); if (!n) return toast('Give the preset a name'); return this.call('/presets', 'POST', { name: n }).then(r => r && toast('Saved') ) },
  updPreset(id, name) { return this.call('/presets', 'POST', { id, name }).then(r => r && toast('Updated')) },
  loadPreset(id) { return this.call('/presets/' + id + '/load', 'PUT') }, delPreset(id) { return this.call('/presets/' + id, 'DELETE') },
  tryPreset(id) { const p = this.me.presets.find(x => x.id === id); if (!p) return; this.tried = 'preset'; this.pv && this.pv.look(Object.assign({}, p.render, { hair: S.render.hair, body: S.render.body, skin: S.render.skin, beard: S.render.beard, mood: S.render.mood })); const b = document.getElementById('stTry'); if (b) { b.style.display = 'flex'; b.querySelector('span').textContent = 'Trying ' + p.name } },

  /* ----- 156-158 motion ----- */
  t_motion() {
    const me = this.me, C = this.D.catalog, mo = me.motion, moods = Object.entries(C.moods);
    return `<div class="lab2">MOOD</div>
      <button class="trow stt" onclick="STYLE.autoMood()"><span class="tl">Mood follows my needs<small class="nsub">Hungry? Tired? Your avatar shows it. Right now: <b>${mo.shownMood}</b></small></span><span class="sw2 ${mo.autoMood ? 'on' : ''}"><i></i></span></button>
      ${this.chips(moods, mo.autoMood ? '' : mo.mood, 'STYLE.setMood')}
      <div class="lab2">WALK STYLE</div>${this.list(this.of(i => i.slot === 'walk')).replace(/onclick="STYLE.wear\('(walk_[a-z]+)'\)"/g, `onclick="STYLE.wear('$1');STYLE.demo('walk','$1')"`)}
      <div class="lab2">IDLE ANIMATION</div>${this.list(this.of(i => i.slot === 'idle')).replace(/onclick="STYLE.wear\('(idle_[a-z]+)'\)"/g, `onclick="STYLE.wear('$1');STYLE.demo('idle','$1')"`)}`;
  },
  async setMood(m) { await this.call('/motion', 'PUT', { mood: m, autoMood: false }) },
  autoMood() { return this.call('/motion', 'PUT', { autoMood: !this.me.motion.autoMood }) },
  demo(kind, id) { if (!this.pv) return; this.pv.ext(Object.assign(this.ext(), { [kind]: id })); this.pv.state(kind === 'walk' ? 'walk' : 'idle'); this.pv.av.speed = 1.5; clearTimeout(this.dt); if (kind === 'walk') this.dt = setTimeout(() => this.pv && this.pv.state('idle'), 3500) },

  /* ----- 155 photo studio ----- */
  bgs: [['Studio grey', '#d9dde6'], ['Sunset', 'linear-gradient(#ffb36b,#e8337a)'], ['Lagos night', 'linear-gradient(#1b2150,#6a3fb5)'], ['Naija green', 'linear-gradient(#2f9e63,#f4f4f0)'], ['Gold', 'linear-gradient(#f2d03b,#d9b24a)'], ['Sky', 'linear-gradient(#9ed3ff,#e9f6ff)']],
  t_pose() {
    const me = this.me, pose = this.curPose || '', vis = me.identity.privacy.poses;
    return `<p class="hint2">Strike a pose and save it to your Camera gallery. Photos you take are yours to share; "who can see my photo poses" is in Identity (currently: <b>${vis}</b>).</p>
      <div class="lab2">POSE</div><div class="stchips"><button class="${!pose ? 'on' : ''}" onclick="STYLE.setPose('')">No pose</button></div>${this.list(this.of(i => i.slot === 'pose'))}
      <div class="lab2">BACKDROP</div><div class="stchips">${this.bgs.map((b, i) => `<button class="${(this.bg || 0) === i ? 'on' : ''}" onclick="STYLE.setBg(${i})">${b[0]}</button>`).join('')}</div>
      <button class="fopt grn" onclick="STYLE.snap()"><span>📸 Take photo</span></button>`;
  },
  setPose(p) { this.curPose = p; if (this.pv) { if (p) this.pv.pose(p); else { this.pv.pose(''); this.pv.state('idle') } } this.paint() },
  setBg(i) { this.bg = i; const cv = document.getElementById('stCv'); if (cv) cv.parentNode.style.background = this.bgs[i][1]; this.paint() },
  /* the pose cards use the same list() as the shop, so "Wear" means "strike this pose" */
  async snap() {
    const cv = document.getElementById('stCv'); if (!cv || !this.pv) return; const b = this.bgs[this.bg || 0][1], W = 600, H = 800, o = document.createElement('canvas'); o.width = W; o.height = H; const c = o.getContext('2d');
    if (b[0] === '#') c.fillStyle = b; else { const m = /#[0-9a-f]{6}/gi, cols = b.match(m), g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]); c.fillStyle = g } c.fillRect(0, 0, W, H);
    c.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.font = '600 22px system-ui,sans-serif'; c.fillText('AllConnect Style', 22, H - 24);
    try { const r = await NET.api('/api/ac/photos', { method: 'POST', body: { image: o.toDataURL('image/jpeg', .85), w: W, h: H } }); toast('📸 Saved to your gallery'); if (window.CAM) { CAM.loaded = false } } catch (e) { toast(e.message) }
  },

  /* ----- 159 pronouns + accessibility, 160 privacy ----- */
  t_id() {
    const me = this.me, id = me.identity, C = this.D.catalog, a = id.access, pv = id.privacy;
    const sw = (label, sub, on, fn) => `<button class="trow stt" onclick="${fn}"><span class="tl">${label}${sub ? `<small class="nsub">${sub}</small>` : ''}</span><span class="sw2 ${on ? 'on' : ''}"><i></i></span></button>`;
    const vis = (k, label) => `<label class="trow"><span class="tl">${label}</span><select class="ssel" onchange="STYLE.priv('${k}',this.value)">${[['everyone', 'Everyone'], ['friends', 'Friends only'], ['me', 'Only me']].map(o => `<option value="${o[0]}" ${pv[k] === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>`;
    return `<div class="lab2">PRONOUNS</div><div class="sgrp"><label class="trow"><span class="tl">My pronouns</span><select class="ssel" onchange="STYLE.setPron(this.value)">${Object.entries(C.pronouns).map(([k, v]) => `<option value="${k}" ${id.pronouns === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${id.pronouns === 'custom' ? `<div class="trow"><input class="sinput" id="stCp" maxlength="20" value="${esc(id.custom)}" placeholder="e.g. xe/xem" onchange="STYLE.setCustom(this.value)"></div>` : ''}
      ${(me.titles || []).length ? `<label class="trow"><span class="tl">Collector title</span><select class="ssel" onchange="STYLE.setTitle(this.value)"><option value="">None</option>${me.titles.map(t => `<option ${id.title === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : ''}</div>
      <p class="hint2">Pronouns are shown on your profile to whoever you choose below. They do not change your character's model or body.</p>
      <div class="lab2">ACCESSIBILITY</div><div class="sgrp">
        ${sw('Reduce avatar motion', 'No idle sway, bouncing or spinning. Uses the global setting too.', a.reduceMotion, "STYLE.acc('reduceMotion')")}
        ${sw('Describe my avatar in text', 'Shows a written description (screen readers always get it)', a.describe, "STYLE.acc('describe')")}
        ${sw('High-contrast outlines', 'Thick black outlines on your avatar', a.contrast, "STYLE.acc('contrast')")}
        ${sw('Captions for avatar changes', 'A short message when your look or mood changes', a.captions, "STYLE.acc('captions')")}
        ${sw('No sparkles or flashes', 'Turns off the "fresh" sparkle and sleepy "z"', a.noSparkle, "STYLE.acc('noSparkle')")}
        ${sw('Show colour names', 'Names under every colour swatch', a.colourNames, "STYLE.acc('colourNames')")}</div>
      <div class="lab2">WHO CAN SEE WHAT</div><div class="sgrp">${vis('look', 'My look and outfit')}${vis('pronouns', 'My pronouns')}${vis('mood', 'My mood')}${vis('collection', 'My collections and title')}${vis('poses', 'My photo poses')}
        ${sw('Show my avatar to people on the map', 'Off: others see a plain default character instead', pv.roster, "STYLE.priv('roster',!STYLE.me.identity.privacy.roster)")}
        ${sw('Hide my character model', 'Others will not see which base model you use', pv.hideModel, "STYLE.priv('hideModel',!STYLE.me.identity.privacy.hideModel)")}</div>
      <p class="hint2">Strangers on the map only ever see your look if "My look and outfit" is set to Everyone and the map switch is on. Friends-only details are shown to friends on your profile.</p>
      <div class="lab2">PRIVACY CHECK</div><div class="stinfo">${this.seen('Strangers', 'stranger')}<br>${this.seen('Friends', 'friend')}</div>
      <button class="fopt red out" onclick="STYLE.clearId()"><span>Erase my pronouns and title</span></button>`;
  },
  seen(label, rel) { const pv = this.me.identity.privacy, can = v => v === 'everyone' || (v === 'friends' && rel === 'friend'), pr = this.me.identity.pronouns; const list = [['look', 'outfit'], ['pronouns', 'pronouns'], ['mood', 'mood'], ['collection', 'collections'], ['poses', 'photo poses']].filter(x => can(pv[x[0]])).map(x => x[1]); if (rel === 'stranger' && !pv.roster) list.splice(list.indexOf('outfit'), 1); return `<b>${label}</b> can see: ${list.length ? list.join(', ') : 'nothing about your look'}${pr ? '' : ' (no pronouns set)'}.` },
  acc(k) { return this.call('/identity', 'PUT', { access: { [k]: !this.me.identity.access[k] } }) },
  priv(k, v) { return this.call('/identity', 'PUT', { privacy: { [k]: v } }) },
  setPron(v) { return this.call('/identity', 'PUT', { pronouns: v }) }, setCustom(v) { return this.call('/identity', 'PUT', { custom: v }) }, setTitle(v) { return this.call('/identity', 'PUT', { title: v }) },
  clearId() { if (!confirm('Erase your pronouns and collector title?')) return; this.call('/identity/clear', 'POST').then(r => r && toast('Erased')) }
};

/* pronouns + collector title under the name on a profile (only what that player lets this viewer see) */
STYLE.decorate = async function (pf) {
  try {
    const r = pf && pf.r; if (!r || !r.user) return; let v;
    if (r.isMe) { if (!this.me) return; const id = this.me.identity; v = { pronouns: id.pronouns === 'custom' ? id.custom : (this.D.catalog.pronouns[id.pronouns] || ''), title: id.title }; if (id.pronouns === '') v.pronouns = '' }
    else { const c = (this.pcache = this.pcache || {})[r.user.id]; if (c && Date.now() - c.t < 60000) v = c.v; else { v = await NET.api('/api/ac/style/of/' + r.user.id); this.pcache[r.user.id] = { t: Date.now(), v } } }
    const el = document.querySelector('.gprof .gun'); if (!el || (window.GIST && GIST.pf !== pf)) return;
    const bits = [v.pronouns, v.title && '🏅 ' + v.title].filter(Boolean); if (!bits.length || el.parentNode.querySelector('.gpron')) return;
    el.insertAdjacentHTML('afterend', `<p class="gpron">${bits.map(esc).join(' · ')}</p>`);
  } catch (e) { /* profile still works without it */ }
};
window.addEventListener('load', () => { if (window.GIST && !GIST._styled) { GIST._styled = 1; const d = GIST.drawProfile; GIST.drawProfile = function () { const x = d.apply(this, arguments); STYLE.decorate(this.pf); return x } } });
window.STYLE = STYLE;
