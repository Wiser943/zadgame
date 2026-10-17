/* Pet: a talking pet cat on the AllConnect phone (original character, "Kobo" by default).
   Talk to her (mic or typing) and she repeats it back in a squeaky voice. Feed her, take her to the vet, wash, play, dress her up, win ₦ in mini-games.
   Her state lives on the server (routes/acpet.js, rules in utils/acpet.js) so it follows you to any device, and EVERYTHING bought for her is
   charged from your main balance (S.cash). Reuses PH.shell / PH.sheet / CARD / UI.bar / LAGOS.setCash / NET.api / STYLE.mood / NG.say and the room's wall colour. */
const PET = {
  p: null, cat: null, gm: null, rates: null, tmr: null, rec: null, speaking: false, greeted: false, cry: 0, bt: null, g: null, n: 0, lt: 0, lastGame: 0, lastAct: 0, tab: 'hat', busy: false,
  NEEDS: [['hunger', '🍛', 'Hunger'], ['energy', '⚡', 'Energy'], ['fun', '🎾', 'Fun'], ['clean', '🛁', 'Clean'], ['health', '❤️‍🩹', 'Health']],
  SLOTS: [['hat', 'Hats'], ['face', 'Face'], ['neck', 'Neck'], ['body', 'Outfits']],
  q(id) { return document.getElementById(id) },
  t(en, pcm) { return window.NG ? NG.say(en, pcm) : en },
  pick(a) { return a[Math.floor(Math.random() * a.length)] },
  bal() { return typeof S !== 'undefined' ? (S.cash || 0) : 0 },
  setCash(c) { if (!Number.isFinite(c)) return; if (window.LAGOS && LAGOS.setCash) LAGOS.setCash(c); else if (typeof S !== 'undefined') { S.cash = c; if (typeof render === 'function') render() } this.paintChips() },
  /* ----- server sync ----- */
  apply(r) {
    if (r.pet) { const w = JSON.stringify(this.p && this.p.worn); this.p = Object.assign({}, r.pet); this.lt = Date.now(); if (w !== JSON.stringify(this.p.worn) && this.q('pfig')) { this.q('pfig').innerHTML = this.svg(); this.paintFig() } }
    if (r.catalog) this.cat = r.catalog; if (r.rates) this.rates = r.rates; if (r.game) this.gm = Object.assign(this.gm || {}, r.game);
    if (typeof r.cash === 'number') this.setCash(r.cash);
  },
  async load() { this.apply(await NET.api('/api/ac/pet')) },
  async post(path, body) { const r = await NET.api('/api/ac/pet/' + path, { method: 'POST', body: body || {} }); this.apply(r); return r },
  /* between syncs the bars keep moving at the same pace the server uses */
  local() {
    const p = this.p, R = this.rates, now = Date.now(); if (!p || !R) return; const m = Math.min(5, (now - (this.lt || now)) / 60000); this.lt = now; if (m <= 0) return; const z = p.asleep;
    p.hunger -= m * (z ? R.hungerSleep : R.hunger); p.fun -= m * (z ? R.funSleep : R.fun); p.clean -= m * R.clean; p.energy += z ? m * R.energyRest : -m * R.energy; p.health -= m * R.health;
    ['hunger', 'energy', 'fun', 'clean', 'health'].forEach(k => p[k] = Math.max(3, Math.min(100, p[k]))); p.sick = p.health < 30;
  },
  mood() {
    const p = this.p; if (p.asleep) return 'sleepy'; if (p.sick) return 'sick';
    const m = window.STYLE && STYLE.mood ? STYLE.mood([p.hunger, p.energy, p.fun, 90, p.clean, 90].map(v => v / 100)) : 'neutral';
    return m === 'angry' ? 'angry' : m === 'sad' || m === 'stressed' ? 'sad' : m === 'sleepy' ? 'sleepy' : m === 'happy' ? 'happy' : 'calm';
  },
  extra() {
    const p = this.p, t = this.t.bind(this);
    return p.sick ? t("I don't feel well…", 'Body no dey well me…') : p.hunger < 25 ? t("I'm so hungry!", 'Hunger dey kill me o!') : p.clean < 25 ? t('I need a bath.', 'I need to wash body.') :
      p.energy < 20 ? t("I'm sleepy…", 'Sleep dey catch me…') : p.fun < 25 ? t('Come play with me!', 'Come play with me na!') : '';
  },
  /* ----- screen ----- */
  async open() {
    document.querySelector('.screen').classList.add('light'); PH.view = 'pet';
    PH.shell('Pet', 'PH.close()', '<div class="abody chat pet" id="ab"><p class="empty">Loading…</p></div>');
    try { await this.load() } catch (e) { if (PH.view === 'pet') PH.shell('Pet', 'PH.close()', `<div class="abody chat pet" id="ab"><p class="empty">${UI.esc(e.message || 'Could not load.')}</p><button class="lgbtn" onclick="PET.open()">Try again</button></div>`); return }
    if (PH.view === 'pet') this.draw();
  },
  draw() {
    const p = this.p, t = this.t.bind(this);
    PH.shell(`<span onclick="PET.rename()" style="cursor:pointer">${UI.esc(p.name)} ✎</span>`, 'PH.close()', `<div class="abody chat pet" id="ab">
      <div class="pstage" id="pst" onclick="PET.poke(event)"><div class="pbub" id="pbub"></div><div id="pfig">${this.svg()}</div><span class="pill pchip" id="pchip"></span><span class="pill pchip pcash" id="pcash"></span></div>
      <div class="gln pneeds" id="pn"></div>
      <div class="pact"><button onclick="PET.foodSheet()"><b>🍛</b>${t('Feed', 'Chop')}</button><button onclick="PET.careSheet()"><b>🩺</b>${t('Care', 'Care')}</button><button onclick="PET.playSheet()"><b>🎾</b>${t('Play', 'Play')}</button><button onclick="PET.dress()"><b>👕</b>${t('Dress', 'Dress')}</button><button onclick="PET.sleep()" id="pslp"></button></div></div>
      <div class="qr">${[t('How far?', 'How far?'), t('I love you', 'I love you'), t('Jollof is the best', 'Jollof na the best'), t('Wetin dey happen?', 'Wetin dey happen?')].map(x => `<button onclick="PET.hear(this.textContent)">${UI.esc(x)}</button>`).join('')}</div>
      <div class="cin"><button class="ebtn" id="pmic" onclick="PET.listen()" aria-label="Talk">🎤</button><input id="pin" placeholder="${UI.esc(t('Say something to ' + p.name + '…', 'Talk to ' + p.name + '…'))}" maxlength="120" autocomplete="off" onkeydown="if(event.key==='Enter')PET.sendInput()"><button class="sbtn" onclick="PET.sendInput()" aria-label="Send">➤</button></div>`);
    this.paintAll(); clearInterval(this.tmr); this.n = 0; this.tmr = setInterval(() => this.step(), 4000);
    if (!this.greeted && !p.asleep) { this.greeted = true; setTimeout(() => this.speak(t(`Hi! I'm ${p.name}. Say something and I'll repeat it!`, `How far! I be ${p.name}. Talk anything, I go repeat am!`)), 500) }
  },
  leave() {
    clearInterval(this.tmr); this.tmr = null; clearTimeout(this.bt); this.g = null;
    if (this.rec) { try { this.rec.abort() } catch (e) {} this.rec = null }
    try { speechSynthesis.cancel() } catch (e) {} this.speaking = false;
  },
  step() {
    if (PH.view !== 'pet') return this.leave();
    this.local(); this.paintAll();
    if (++this.n % 6 === 0) this.load().then(() => this.paintAll()).catch(() => {});
    const p = this.p; if (!p.asleep && !this.speaking && Date.now() - this.cry > 40000) { const x = this.extra(); if (x && Math.random() < .5) { this.cry = Date.now(); this.speak(x); if (p.sick) this.fx('🤒') } }
  },
  paintAll() { this.paintNeeds(); this.paintFig() },
  paintNeeds() {
    const p = this.p, n = this.q('pn'); if (!n) return;
    n.innerHTML = this.NEEDS.map(x => `<div class="${p[x[0]] < 25 ? 'low' : ''}"><span>${x[1]} ${x[2]}</span>${UI.bar(p[x[0]])}</div>`).join('');
  },
  paintChips() { const c = this.q('pcash'); if (c) c.textContent = UI.fmt(this.bal()) },
  paintFig() {
    const f = this.fig(), p = this.p; if (!f || !p) return;
    ['m-happy', 'm-calm', 'm-sad', 'm-angry', 'm-sleepy', 'm-sick', 'sleep'].forEach(c => f.classList.remove(c));
    const m = this.mood(); f.classList.add('m-' + m); if (p.asleep) f.classList.add('sleep');
    const st = this.q('pst'); if (st) st.classList.toggle('night', !!p.asleep);
    const L = { happy: ['Happy', 'Dey happy'], calm: ['Calm', 'Dey calm'], sad: ['Sad', 'Dey sad'], angry: ['Hangry', 'Dey vex'], sick: ['Ill', 'Body no dey well'], sleepy: [p.asleep ? 'Sleeping' : 'Sleepy', p.asleep ? 'Dey sleep' : 'Sleep dey catch am'] }[m];
    const c = this.q('pchip'); if (c) c.textContent = '❤ ' + p.love + ' · ' + this.t(L[0], L[1]);
    const b = this.q('pslp'); if (b) b.innerHTML = p.asleep ? `<b>☀️</b>${this.t('Wake', 'Wake am')}` : `<b>😴</b>${this.t('Sleep', 'Sleep')}`;
    this.paintChips();
  },
  fig() { const p = this.q('pfig'); return p && p.firstElementChild },
  flash(c, ms) { const f = this.fig(); if (!f) return; f.classList.remove(c); void f.getBoundingClientRect(); f.classList.add(c); clearTimeout(this['_' + c]); this['_' + c] = setTimeout(() => { const g = this.fig(); if (g) g.classList.remove(c) }, ms) },
  fx(e, n) {
    const st = this.q('pst'); if (!st) return;
    for (let i = 0; i < (n || 1); i++) { const x = document.createElement('span'); x.className = 'pfx'; x.textContent = e; x.style.left = (32 + Math.random() * 34) + '%'; x.style.top = (26 + Math.random() * 30) + '%'; x.style.animationDelay = (i * .16) + 's'; st.appendChild(x); setTimeout(() => x.remove(), 1900) }
  },
  /* ----- talking: she repeats what you say, high pitched ----- */
  setTalk(on) { this.speaking = on; const f = this.fig(); if (f) f.classList.toggle('talk', on) },
  speak(text) {
    text = String(text || '').trim(); if (!text) return;
    const b = this.q('pbub'); if (b) { b.textContent = text; b.classList.add('on') }
    clearTimeout(this.bt);
    const done = () => { this.setTalk(false); this.bt = setTimeout(() => { const x = this.q('pbub'); if (x) x.classList.remove('on') }, 2400) };
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') { this.setTalk(true); setTimeout(done, 700 + text.length * 70); return }
    try {
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text);
      u.pitch = 2; u.rate = 1.12; u.lang = window.NG && NG.lang() === 'fr' ? 'fr-FR' : 'en-GB';
      u.onend = u.onerror = done; this.setTalk(true); speechSynthesis.speak(u);
    } catch (e) { this.setTalk(true); setTimeout(done, 700 + text.length * 70) }
  },
  say(text) { if (!this.speaking) this.speak(text) },
  /* free actions are saved on the server too, but never more than once every 1.5 seconds */
  act(a) { const n = Date.now(); if (n - this.lastAct < 1500) return; this.lastAct = n; this.post('act', { a }).then(() => this.paintAll()).catch(() => {}) },
  hear(text) {
    const p = this.p; text = String(text || '').trim().slice(0, 120); if (!text) return;
    if (p.asleep) return toast(this.t(`Shh, ${p.name} is sleeping`, `Shh, ${p.name} dey sleep`));
    p.love++; if (p.fun < 60) p.fun += 2; this.flash('joy', 1400); this.act('talk');
    this.fx(/love|sweet|good|nice/i.test(text) ? '💗' : '🎵');
    const x = this.extra(); this.speak(text + (x && Math.random() < .5 ? ' … ' + x : '')); this.paintAll();
  },
  sendInput() { const i = this.q('pin'); if (!i) return; const v = i.value; i.value = ''; this.hear(v) },
  listen() {
    const p = this.p; if (p.asleep) return toast(this.t(`Wake ${p.name} up first`, `Wake ${p.name} first`));
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast(this.t('Voice is not supported here. Type to talk instead.', 'Voice no work for here. Type am.')); const i = this.q('pin'); if (i) i.focus(); return }
    if (this.rec) { try { this.rec.stop() } catch (e) {} return }
    try { speechSynthesis.cancel() } catch (e) {}
    const r = this.rec = new SR(); r.lang = window.NG && NG.lang() === 'fr' ? 'fr-FR' : 'en-NG'; r.interimResults = false; r.maxAlternatives = 1;
    const mic = this.q('pmic'); if (mic) mic.classList.add('rec');
    r.onresult = e => this.hear(e.results[0][0].transcript);
    r.onerror = e => toast(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? this.t('Allow the microphone to talk to ' + p.name, 'Allow microphone make you talk to ' + p.name) : e.error === 'no-speech' ? this.t("I didn't hear you. Try again.", 'I no hear you. Try again.') : this.t('Could not hear you. Type instead.', 'E no work. Type am.'));
    r.onend = () => { this.rec = null; const m = this.q('pmic'); if (m) m.classList.remove('rec') };
    try { r.start() } catch (e) { this.rec = null; if (mic) mic.classList.remove('rec') }
  },
  /* ----- free care ----- */
  poke(e) {
    const p = this.p; if (p.asleep) return this.sleep();
    const r = e.currentTarget.getBoundingClientRect(), y = (e.clientY - r.top) / r.height, t = this.t.bind(this);
    if (navigator.vibrate) navigator.vibrate(12);
    p.love++; if (p.fun < 60) p.fun += 1; this.flash('joy', 1000); this.act('pet');
    if (y < .62) { this.fx('💗'); this.say(this.pick([t('Hehe!', 'Hehe!'), t('Purr purr…', 'Purr purr…'), t('Meow!', 'Meow!'), t('Mmm, nice!', 'Mmm, e sweet!')])) }
    else { this.fx('😂'); this.say(t('Hahaha! That tickles!', 'Hahaha! E dey tickle me!')) }
    this.paintAll();
  },
  async sleep() {
    const p = this.p, t = this.t.bind(this), was = p.asleep;
    try { speechSynthesis.cancel() } catch (e) {} this.setTalk(false);
    try { await this.post('act', { a: was ? 'wake' : 'sleep' }) } catch (e) { return toast(e.message) }
    this.paintAll();
    if (this.p.asleep) { const b = this.q('pbub'); if (b) { b.textContent = t('Good night… zzz', 'Good night o… zzz'); b.classList.add('on'); clearTimeout(this.bt); this.bt = setTimeout(() => b.classList.remove('on'), 2200) } }
    else this.speak(t('Good morning!', 'Good morning o!'));
  },
  rename() {
    PH.sheet(`<h3>${this.t('Name your pet', 'Give your pet name')}</h3><input class="sinput" id="pnm" maxlength="14" value="${UI.esc(this.p.name)}" autocomplete="off"><button class="fopt grn" onclick="PET.setName()"><span>${this.t('Save', 'Save')}</span></button>`);
  },
  async setName() { const n = String((this.q('pnm') || {}).value || '').trim(); if (!n) return; try { await this.post('rename', { name: n }); PH.closeSheet(); this.draw() } catch (e) { toast(e.message) } },
  /* ----- paid care: every price comes from the server and is charged from the main balance ----- */
  row(kind, it, note) {
    const poor = this.bal() < it.price;
    return `<button class="fopt" ${poor ? 'disabled' : ''} onclick="PET.buy('${kind}','${it.id}')"><span>${it.emoji} ${UI.esc(it.name)}${note ? `<small>${note}</small>` : ''}</span><b>${UI.fmt(it.price)}</b></button>`;
  },
  head(title, sub) { return `<h3>${title}</h3><p class="hint2">${sub} · ${this.t('Balance', 'Balance')} <b>${UI.fmt(this.bal())}</b></p>` },
  foodSheet() {
    const p = this.p; if (p.asleep) return toast(this.t(`${p.name} is sleeping`, `${p.name} dey sleep`));
    const fill = { chops: 12, suya: 24, jollof: 35, fish: 45 };
    PH.sheet(this.head(`${this.t('Feed', 'Give')} ${UI.esc(p.name)} 🍛`, this.t('Pet food costs more than people food', 'Pet food dey cost pass people food')) + this.cat.food.map(it => this.row('food', it, `+${fill[it.id] || 10} hunger`)).join(''));
  },
  careSheet() {
    const p = this.p, note = { bath: 'Fully clean', groom: 'Clean + happy', vitamins: '+20 health', medicine: '+45 health', vet: 'Full health' };
    PH.sheet(this.head(`${this.t('Care for', 'Care for')} ${UI.esc(p.name)} 🩺`, `${this.t('Health', 'Health')} ${Math.round(p.health)}%${p.sick ? ' · ' + this.t('she is ill', 'she no well') : ''}`) + this.cat.care.map(it => this.row('care', it, note[it.id])).join(''));
  },
  playSheet() {
    const p = this.p, g = this.gm || {}, note = { ball: '+22 fun', laser: '+40 fun' };
    PH.sheet(this.head(`${this.t('Play with', 'Play with')} ${UI.esc(p.name)} 🎾`, `${this.t('Won today', 'Won today')} ${UI.fmt(g.earned || 0)} / ${UI.fmt(g.cap || 0)}`) +
      `<div class="lab2">${this.t('TOYS', 'TOYS')}</div>` + this.cat.toy.map(it => this.row('toy', it, note[it.id])).join('') +
      `<div class="lab2">${this.t('MINI-GAMES · FREE, WIN ₦', 'MINI-GAMES · FREE, WIN ₦')}</div><button class="fopt grn" onclick="PET.mouse()"><span>🐭 Mouse Tap</span><b>${this.t('up to', 'up to')} ${UI.fmt(40 * 150)}</b></button><button class="fopt grn" onclick="PET.paws()"><span>🐾 Paw Pattern</span><b>${this.t('up to', 'up to')} ${UI.fmt(15 * 400)}</b></button>
      <p class="hint2">${this.t('Games tire her out a little. Winnings go to your balance (limited per day).', 'Games dey tire her small. Wetin you win go enter your balance (limit per day).')}</p>`);
  },
  async buy(kind, id) {
    if (this.busy) return; this.busy = true; const t = this.t.bind(this);
    try {
      const r = await this.post('buy', { kind, id }), it = r.item; toast(`${it.emoji} ${it.name} · −${UI.fmt(r.price)}`);
      if (kind === 'cloth') { this.fx('✨', 4); this.flash('joy', 1500); this.speak(t('I look so good!', 'I don fine well well!')); this.dress(); this.busy = false; return }
      PH.closeSheet();
      if (kind === 'food') { this.fx(it.emoji, 3); this.flash('eat', 1800); this.speak(t('Mmm, yummy! Thank you!', 'Mmm, e sweet die! Thank you!')) }
      else if (kind === 'toy') { this.toyFx(); this.flash('jump', 1300); this.fx('⭐', 3); this.speak(t('Wheee! Again, again!', 'Wheee! Do am again!')) }
      else if (id === 'bath' || id === 'groom') { this.fx('🫧', 6); this.flash('joy', 1800); this.speak(t('Brrr! I smell so good now!', 'Brrr! I don smell nice now!')) }
      else { this.fx('💚', 4); this.flash('joy', 1600); this.speak(t('I feel so much better! Thank you!', 'I don dey better! Thank you!')) }
      this.paintAll();
    } catch (e) { toast(e.message) }
    this.busy = false;
  },
  toyFx() { const st = this.q('pst'); if (!st) return; const b = document.createElement('span'); b.className = 'pball'; b.textContent = '🎾'; st.appendChild(b); setTimeout(() => b.remove(), 1700) },
  /* ----- dress-up ----- */
  dress(tab) {
    const p = this.p, bal = this.bal(); this.tab = tab || this.tab || 'hat';
    const items = this.cat.cloth.filter(c => c.slot === this.tab);
    PH.sheet(this.head(`${this.t('Dress up', 'Dress')} ${UI.esc(p.name)} 👕`, this.t('Clothes are yours once bought', 'Clothes na your own once you buy')) +
      `<div class="pre">${this.SLOTS.map(s => `<button class="${s[0] === this.tab ? 'on' : ''}" onclick="PET.dress('${s[0]}')">${s[1]}</button>`).join('')}</div>` +
      items.map(it => {
        const own = (p.owned || []).includes(it.id), on = (p.worn || {})[it.slot] === it.id;
        const right = own ? (on ? `<button class="pbtn" onclick="PET.wear('${it.slot}','')">${this.t('Take off', 'Remove')}</button>` : `<button class="pbtn grn" onclick="PET.wear('${it.slot}','${it.id}')">${this.t('Wear', 'Wear')}</button>`) : `<button class="pbtn blu" ${bal < it.price ? 'disabled' : ''} onclick="PET.buy('cloth','${it.id}')">${UI.fmt(it.price)}</button>`;
        return `<div class="fopt pdr"><span>${it.emoji} ${UI.esc(it.name)}</span>${right}</div>`;
      }).join(''));
  },
  async wear(slot, id) { try { await this.post('wear', { slot, id }); this.dress() } catch (e) { toast(e.message) } },
  /* ----- mini-games ----- */
  canPlay() {
    const p = this.p, t = this.t.bind(this), cd = (this.gm && this.gm.cooldownMs) || 45000;
    if (p.asleep) toast(t(`${p.name} is sleeping`, `${p.name} dey sleep`));
    else if (p.sick) toast(t(`${p.name} is ill. Visit the vet first.`, `${p.name} no well. Carry am go vet.`));
    else if (p.energy < 12) toast(t(`${p.name} is too tired to play`, `Tire don catch ${p.name}`));
    else if (Date.now() - this.lastGame < cd) toast(t('Let her catch her breath for a minute.', 'Make she rest small.'));
    else return true;
    return false;
  },
  alive(g) { return this.g === g && !!this.q('pgame') },
  mouse() {
    if (!this.canPlay()) return; PH.closeSheet();
    PH.sheet(`<h3>🐭 Mouse Tap</h3><p class="hint2">${this.t('Tap the mice before they hide. 20 seconds.', 'Tap the mice before dem hide. 20 seconds.')}</p><div class="pgh"><b>${this.t('Score', 'Score')} <i id="pgs">0</i></b><b><i id="pgt">20</i>s</b></div><div class="pgrid" id="pgame">${Array.from({ length: 9 }, (_, i) => `<button class="phole" data-i="${i}" onclick="PET.whack(${i})"></button>`).join('')}</div>`);
    const now = Date.now(), g = this.g = { game: 'mouse', score: 0, up: -1, last: -1, start: now, end: now + 20000, hide: 0, next: now + 500 };
    g.iv = setInterval(() => {
      if (!this.alive(g)) return clearInterval(g.iv);
      const n = Date.now(), tt = this.q('pgt'); if (tt) tt.textContent = Math.max(0, Math.ceil((g.end - n) / 1000));
      if (n >= g.end) { clearInterval(g.iv); this.finish('mouse', g.score); return }
      if (g.up >= 0 && n > g.hide) { this.hole(g.up, ''); g.up = -1; g.next = n + 120 + Math.random() * 200 }
      if (g.up < 0 && n > g.next) { let i; do { i = Math.floor(Math.random() * 9) } while (i === g.last); g.up = g.last = i; this.hole(i, '🐭'); g.hide = n + Math.max(430, 900 - (n - g.start) / 1000 * 22) }
    }, 70);
  },
  hole(i, s) { const b = document.querySelector('.phole[data-i="' + i + '"]'); if (b) b.textContent = s },
  whack(i) {
    const g = this.g; if (!g || g.game !== 'mouse' || g.up !== i) return;
    g.score++; g.up = -1; g.next = Date.now() + 150; this.hole(i, '💥'); setTimeout(() => this.hole(i, ''), 180);
    const s = this.q('pgs'); if (s) s.textContent = g.score; if (navigator.vibrate) navigator.vibrate(8);
  },
  paws() {
    if (!this.canPlay()) return; PH.closeSheet();
    PH.sheet(`<h3>🐾 Paw Pattern</h3><p class="hint2" id="pgm">${this.t('Watch, then copy the pattern.', 'Look well, then copy the pattern.')}</p><div class="pgh"><b>${this.t('Round', 'Round')} <i id="pgs">0</i></b></div><div class="pgrid pg2" id="pgame">${['#ef4444', '#22c55e', '#3b82f6', '#f59e0b'].map((c, i) => `<button class="ppad" style="background:${c}" data-i="${i}" onclick="PET.pad(${i})">🐾</button>`).join('')}</div>`);
    const g = this.g = { game: 'paws', seq: [], pos: 0, show: true, score: 0 }; this.round(g);
  },
  async round(g) {
    const sl = ms => new Promise(r => setTimeout(r, ms)), m = this.q('pgm');
    g.seq.push(Math.floor(Math.random() * 4)); g.pos = 0; g.show = true; if (m) m.textContent = this.t('Watch…', 'Look…');
    await sl(700); for (const i of g.seq) { if (!this.alive(g)) return; this.lit(i); await sl(540) }
    if (!this.alive(g)) return; g.show = false; const m2 = this.q('pgm'); if (m2) m2.textContent = this.t('Your turn!', 'Your turn!');
  },
  lit(i) { const b = document.querySelector('.ppad[data-i="' + i + '"]'); if (!b) return; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 320) },
  pad(i) {
    const g = this.g; if (!g || g.game !== 'paws' || g.show) return; this.lit(i);
    if (i !== g.seq[g.pos]) { g.show = true; return setTimeout(() => this.finish('paws', g.score), 350) }
    if (++g.pos === g.seq.length) { g.score = g.seq.length; const s = this.q('pgs'); if (s) s.textContent = g.score; g.show = true; if (g.score >= 15) return setTimeout(() => this.finish('paws', g.score), 400); setTimeout(() => this.round(g), 800) }
  },
  async finish(game, score) {
    this.g = null; PH.closeSheet(); const t = this.t.bind(this);
    if (score < 1) return toast(t('No points this time. Try again!', 'No point this time. Try again!'));
    try {
      const r = await this.post('game', { game, score }); this.lastGame = Date.now(); this.flash('jump', 1300); this.fx(game === 'mouse' ? '🐭' : '🐾', 4); this.paintAll();
      CARD.show({ icon: game === 'mouse' ? '🐭' : '🐾', title: t('Great game!', 'Correct game!'), text: r.prize ? t(`${this.p.name} had fun and you won some cash.`, `${this.p.name} enjoy am and you win small cash.`) : t('Daily game limit reached, so no cash this time.', 'Daily game limit don reach, no cash this time.'),
        lines: [[t('Score', 'Score'), String(score)], [t('You won', 'You win'), UI.fmt(r.prize || 0)], [t('Today', 'Today'), `${UI.fmt(r.game.earned)} / ${UI.fmt(r.game.cap)}`]], tone: 'gold', btn: t('Nice one', 'Nice one') });
    } catch (e) { toast(e.message) }
  },
  /* ----- the cat (drawn in SVG, so it needs no image files); clothes are extra layers ----- */
  LAY: {
    fila: '<path d="M62 56L70 28Q100 14 130 28L138 56Q100 46 62 56Z" fill="#7c3aed"/><path d="M62 56Q100 46 138 56" stroke="#fbbf24" stroke-width="5" fill="none"/>',
    party: '<path d="M100 6L76 52H124Z" fill="#a855f7"/><circle cx="100" cy="6" r="6" fill="#fbbf24"/><circle cx="92" cy="34" r="3.5" fill="#fde68a"/><circle cx="106" cy="42" r="3.5" fill="#fde68a"/>',
    gele: '<path d="M52 58Q54 18 100 14Q146 18 148 58Q100 42 52 58Z" fill="#e11d48"/><path d="M70 28Q100 2 130 28Q112 20 100 32Q88 20 70 28Z" fill="#fb7185"/><path d="M54 52Q100 36 146 52" stroke="#fbbf24" stroke-width="4" fill="none"/>',
    crown: '<path d="M68 50L72 20L88 36L100 12L112 36L128 20L132 50Z" fill="#fbbf24" stroke="#b45309" stroke-width="2.5" stroke-linejoin="round"/><circle cx="100" cy="30" r="4" fill="#e11d48"/><circle cx="80" cy="40" r="3" fill="#3b82f6"/><circle cx="120" cy="40" r="3" fill="#22c55e"/>',
    shades: '<rect x="54" y="74" width="38" height="24" rx="9" fill="#111"/><rect x="108" y="74" width="38" height="24" rx="9" fill="#111"/><path d="M92 82H108" stroke="#111" stroke-width="4"/><path d="M60 80L72 78" stroke="#fff" stroke-width="3" opacity=".5" stroke-linecap="round"/>',
    specs: '<g fill="none" stroke="#1f2937" stroke-width="4"><circle cx="74" cy="86" r="17"/><circle cx="126" cy="86" r="17"/><path d="M91 84H109"/></g>',
    bow: '<path d="M100 152L80 141V163Z M100 152L120 141V163Z" fill="#ef4444"/><circle cx="100" cy="152" r="6" fill="#b91c1c"/>',
    scarf: '<path d="M58 142Q100 164 142 142L142 153Q100 175 58 153Z" fill="#22c55e"/><path d="M120 160L134 192L116 188L110 164Z" fill="#16a34a"/>',
    beads: '<g fill="#f87171" stroke="#b91c1c" stroke-width="1"><circle cx="64" cy="141" r="5"/><circle cx="72" cy="150" r="5"/><circle cx="82" cy="157" r="5"/><circle cx="92" cy="161" r="5"/><circle cx="104" cy="161" r="5"/><circle cx="114" cy="158" r="5"/><circle cx="124" cy="152" r="5"/><circle cx="132" cy="146" r="5"/><circle cx="137" cy="140" r="5"/></g>',
    jersey: '<path d="M60 134Q100 150 140 134L152 192Q100 216 48 192Z" fill="#16a34a"/><path d="M86 144Q100 149 114 144L118 207Q100 212 82 207Z" fill="#fff"/>',
    hoodie: '<path d="M58 134Q100 150 142 134L154 194Q100 214 46 194Z" fill="#475569"/><path d="M80 176H120L116 200H84Z" fill="#334155"/><path d="M90 142V160M110 142V160" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>',
    ankara: '<path d="M58 134Q100 150 142 134L156 196Q100 214 44 196Z" fill="#f59e0b"/><circle cx="74" cy="164" r="7" fill="#7c2d12"/><circle cx="104" cy="180" r="8" fill="#0ea5e9"/><circle cx="130" cy="160" r="7" fill="#7c2d12"/><circle cx="86" cy="196" r="6" fill="#0ea5e9"/><circle cx="118" cy="150" r="5" fill="#fff"/>'
  },
  lay(slot) { const id = this.p && this.p.worn && this.p.worn[slot]; return id && this.LAY[id] ? `<g class="wear">${this.LAY[id]}</g>` : '' },
  svg() {
    return `<svg viewBox="0 0 200 220" class="pf" role="img" aria-label="${UI.esc(this.p.name)} the cat">
<ellipse cx="100" cy="212" rx="58" ry="7" fill="rgba(0,0,0,.14)"/>
<g class="tail"><path d="M148 182Q198 176 190 128Q187 112 172 118" fill="none" stroke="#f4a640" stroke-width="17" stroke-linecap="round"/><path d="M190 128Q187 112 172 118" fill="none" stroke="#c96f1c" stroke-width="17" stroke-linecap="round"/></g>
<g class="body"><ellipse cx="100" cy="162" rx="53" ry="48" fill="#f4a640"/><ellipse cx="100" cy="172" rx="33" ry="33" fill="#ffe6bf"/><ellipse cx="72" cy="206" rx="19" ry="9" fill="#f4a640"/><ellipse cx="128" cy="206" rx="19" ry="9" fill="#f4a640"/><ellipse cx="54" cy="168" rx="11" ry="24" fill="#f4a640" transform="rotate(14 54 168)"/><ellipse cx="146" cy="168" rx="11" ry="24" fill="#f4a640" transform="rotate(-14 146 168)"/>${this.lay('body')}</g>
<g class="head"><path d="M46 70L52 20L92 50Z" fill="#f4a640"/><path d="M58 60L60 34L80 49Z" fill="#f58aa0"/><path d="M154 70L148 20L108 50Z" fill="#f4a640"/><path d="M142 60L140 34L120 49Z" fill="#f58aa0"/>
<ellipse cx="100" cy="90" rx="64" ry="54" fill="#f4a640"/><path d="M100 38V54M88 40L90 54M112 40L110 54" stroke="#c96f1c" stroke-width="5" stroke-linecap="round"/>
<ellipse cx="66" cy="104" rx="10" ry="6" fill="#f58aa0" opacity=".55"/><ellipse cx="134" cy="104" rx="10" ry="6" fill="#f58aa0" opacity=".55"/>
<g class="eyes e-open"><ellipse cx="74" cy="86" rx="10" ry="12" fill="#2b2140"/><ellipse cx="126" cy="86" rx="10" ry="12" fill="#2b2140"/><circle cx="78" cy="81" r="4" fill="#fff"/><circle cx="130" cy="81" r="4" fill="#fff"/></g>
<g class="e-closed" fill="none" stroke="#2b2140" stroke-width="4" stroke-linecap="round"><path d="M64 88Q74 96 84 88"/><path d="M116 88Q126 96 136 88"/></g>
<g class="e-joy" fill="none" stroke="#2b2140" stroke-width="4" stroke-linecap="round"><path d="M64 90Q74 76 84 90"/><path d="M116 90Q126 76 136 90"/></g>
<g class="brow-sad" stroke="#2b2140" stroke-width="4" stroke-linecap="round"><path d="M62 74L86 66"/><path d="M138 74L114 66"/></g>
<g class="brow-ang" stroke="#2b2140" stroke-width="4" stroke-linecap="round"><path d="M62 64L86 72"/><path d="M138 64L114 72"/></g>
<path d="M93 99H107L100 107Z" fill="#e8527f" stroke="#e8527f" stroke-linejoin="round" stroke-width="3"/>
<path class="m-smile" d="M86 110Q93 120 100 108Q107 120 114 110" fill="none" stroke="#2b2140" stroke-width="3.5" stroke-linecap="round"/>
<path class="m-sad" d="M88 118Q100 106 112 118" fill="none" stroke="#2b2140" stroke-width="3.5" stroke-linecap="round"/>
<g class="m-open"><ellipse cx="100" cy="116" rx="11" ry="10" fill="#7a1f3d"/><ellipse cx="100" cy="122" rx="6" ry="4" fill="#f58aa0"/></g>
<path d="M50 100L20 94M50 108L20 112M150 100L180 94M150 108L180 112" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>${this.lay('face')}${this.lay('hat')}</g>${this.lay('neck')}
<g class="zz" fill="#fff" font-weight="800" font-family="system-ui"><text x="150" y="40" font-size="24">z</text><text x="166" y="20" font-size="17">z</text></g></svg>`;
  }
};
window.PET = PET;
(function () {
  const st = document.createElement('style');
  st.textContent = `.pet{display:flex;flex-direction:column;gap:4px}
.pstage{position:relative;flex:none;height:clamp(220px,36vh,310px);border-radius:22px;overflow:hidden;background:linear-gradient(var(--wall,#cfe0ff) 0 64%,#d9b98c 64%);cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}
.pstage::before{content:'';position:absolute;left:8%;top:12%;width:58px;height:68px;border-radius:10px;background:linear-gradient(#bfe6ff,#fff 85%);box-shadow:0 0 0 5px rgba(255,255,255,.85)}
.pstage.night::after{content:'';position:absolute;inset:0;background:rgba(15,20,50,.5);pointer-events:none;z-index:2}
#pfig{position:absolute;left:50%;bottom:2%;width:60%;max-width:205px;transform:translateX(-50%);z-index:1}
.pf{width:100%;display:block;overflow:visible}
.pf .body{animation:pbob 3.2s ease-in-out infinite;transform-origin:100px 205px}.pf .head{animation:phead 3.2s ease-in-out infinite;transform-origin:100px 140px}
.pf .tail{animation:ptail 2.4s ease-in-out infinite;transform-origin:150px 178px}.pf .eyes{animation:pblink 5s infinite;transform-origin:100px 86px}
@keyframes pbob{50%{transform:scaleY(1.025)}}@keyframes phead{50%{transform:translateY(-2px) rotate(-1.2deg)}}@keyframes ptail{50%{transform:rotate(10deg)}}@keyframes pblink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
.pf .e-closed,.pf .e-joy,.pf .m-open,.pf .m-sad,.pf .brow-sad,.pf .brow-ang,.pf .zz{display:none}
.pf.sleep .e-open{display:none}.pf.sleep .e-closed{display:inline}.pf.sleep .tail{animation:none}.pf.sleep .zz{display:inline;animation:pzz 2.4s ease-in-out infinite}
.pf.joy:not(.sleep) .e-open{display:none}.pf.joy:not(.sleep) .e-joy{display:inline}
.pf.m-sad .m-smile,.pf.m-sick .m-smile{display:none}.pf.m-sad .m-sad,.pf.m-sad .brow-sad,.pf.m-sick .m-sad,.pf.m-sick .brow-sad{display:inline}.pf.m-sick{filter:saturate(.55) hue-rotate(35deg)}.pf.m-angry .m-smile{display:none}.pf.m-angry .m-sad,.pf.m-angry .brow-ang{display:inline}
.pf.talk .m-smile,.pf.talk .m-sad,.pf.eat .m-smile,.pf.eat .m-sad{display:none}.pf.talk .m-open,.pf.eat .m-open{display:inline;transform-origin:100px 112px;animation:ptalk .2s infinite alternate}.pf.eat .m-open{animation-duration:.32s}
@keyframes ptalk{to{transform:scaleY(.4)}}@keyframes pzz{50%{transform:translateY(-6px);opacity:.5}}
.pf.jump{animation:pjump .65s ease-in-out 2}@keyframes pjump{40%{transform:translateY(-36px)}}
.pbub{position:absolute;top:10px;left:50%;transform:translateX(-50%) scale(.9);max-width:86%;background:#fff;color:#1b2236;border-radius:16px;padding:8px 13px;font:700 14px 'Plus Jakarta Sans',system-ui,sans-serif;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.15);opacity:0;transition:.2s;z-index:5;pointer-events:none}.pbub.on{opacity:1;transform:translateX(-50%) scale(1)}
.pchip{position:absolute;left:10px;bottom:10px;padding:5px 11px;font:700 12px 'Plus Jakarta Sans',system-ui,sans-serif;z-index:3}.pchip.pcash{left:auto;right:10px}
.pfx{position:absolute;font-size:26px;pointer-events:none;z-index:4;animation:pfx 1.5s ease-out forwards}@keyframes pfx{from{opacity:1;transform:translateY(0) scale(.7)}to{opacity:0;transform:translateY(-80px) scale(1.2)}}
.pball{position:absolute;left:6%;bottom:8%;font-size:28px;z-index:4;pointer-events:none;animation:pball 1.6s ease-in-out forwards}@keyframes pball{25%{transform:translate(70px,-80px)}50%{transform:translate(140px,0)}75%{transform:translate(210px,-50px)}to{transform:translate(260px,0);opacity:0}}
.pet .pneeds{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;padding-top:8px}.pet .pneeds>div{margin:0 0 6px}.pet .pneeds>div:last-child{grid-column:1/-1}.pet .pneeds span{font-size:12.5px;margin-bottom:3px}.pet .pneeds .low i{background:#e5484d}
.pact{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding-bottom:4px}.pact button{border:0;background:#f3f4f9;border-radius:16px;padding:8px 0;font:700 11px 'Plus Jakarta Sans',system-ui,sans-serif;color:var(--ink);display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer}.pact button:active{transform:scale(.95)}.pact b{font-size:21px;line-height:1.1}
.ebtn.rec{background:#e5484d;animation:prec 1s infinite}@keyframes prec{50%{opacity:.55}}
.fopt:disabled{opacity:.45}.fopt small{display:block;color:var(--mut);font-weight:600;font-size:11.5px;margin-top:2px}.fopt.pdr{cursor:default}.fopt.pdr .pbtn:disabled{opacity:.45}
.pgh{display:flex;justify-content:space-between;font:800 15px 'Plus Jakarta Sans',system-ui,sans-serif;margin:2px 2px 10px}.pgh i{font-style:normal}
.pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pgrid.pg2{grid-template-columns:repeat(2,1fr)}
.phole{aspect-ratio:1;border:0;border-radius:50%;background:radial-gradient(#4a2f18,#6b4a2b);font-size:38px;box-shadow:inset 0 7px 10px rgba(0,0,0,.45);-webkit-tap-highlight-color:transparent}
.ppad{height:84px;border:0;border-radius:18px;font-size:30px;opacity:.55;transition:.12s}.ppad.on{opacity:1;transform:scale(1.06);box-shadow:0 0 18px rgba(255,255,255,.7)}
:where(html[data-theme="dark"]) .pact button{background:#1b2034}
@media (prefers-reduced-motion:reduce){.pf *,.pf{animation:none!important}}`;
  document.head.appendChild(st);
})();
