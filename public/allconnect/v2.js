/* Mobile screens: HUD, character sheet (needs, feelings, traits, memory book), wallet top-up, privacy settings, catalogue filters.
   Phones only for the layout (body.v2m). The 3D house/room code is not changed: this file only calls its public buttons. */
(function () {
  const $ = id => document.getElementById(id), esc = s => UI.esc(s), mq = window.matchMedia('(max-width:767px)');
  const fmt = n => '₦' + Math.round(n || 0).toLocaleString('en-NG');
  const short = n => { n = Math.round(n || 0); const a = Math.abs(n), f = (v, s) => '₦' + (Math.floor(v * 10) / 10).toString().replace(/\.0$/, '') + s; return a >= 1e12 ? f(n / 1e12, 'T') : a >= 1e9 ? f(n / 1e9, 'B') : a >= 1e6 ? f(n / 1e6, 'M') : a >= 1e4 ? f(n / 1e3, 'K') : '₦' + n.toLocaleString('en-NG') };
  const I = {
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    chair: '<svg viewBox="0 0 24 24"><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM6 18v2M18 18v2"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/></svg>',
    bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.4 1 2.5h6c0-1.1.3-1.8 1-2.5A6 6 0 0 0 12 3z"/></svg>',
    bulbOff: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.4 1 2.5h6c0-1.1.3-1.8 1-2.5A6 6 0 0 0 12 3zM4 4l16 16"/></svg>',
    rot: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5M12 8l4 2.5v5L12 18l-4-2.5v-5z"/></svg>',
    dots: '<svg viewBox="0 0 24 24"><path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3.4"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    sofa: '<svg viewBox="0 0 24 24"><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM6 18v2M18 18v2"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M9 3h6l-2 4h-2zM8 8c-3 2-5 6-5 9a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4c0-3-2-7-5-9zM12 11v7M14 12.5c-.5-.7-1.3-1-2-1-1.2 0-2 .6-2 1.5 0 2 4 1 4 3 0 .9-.9 1.5-2 1.5-.8 0-1.6-.3-2-1"/></svg>',
    door: '<svg viewBox="0 0 24 24"><path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h20M13 4 6 6v14h7zM10 12h.01"/></svg>',
    work: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>',
    phone: '<svg viewBox="0 0 28 32" fill="none" stroke="#fff" stroke-width="2"><rect x="4" y="1.5" width="20" height="29" rx="5" fill="#5b3ea8" stroke="#8c6cf0"/><circle cx="14" cy="14" r="5.5" fill="none" stroke="#fff"/><path d="M11.8 13.5c0-1 .9-1.7 2.2-1.7s2.2.7 2.2 1.7c0 1.4-2.2 1.2-2.2 2.8" stroke-width="1.6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  const SS = () => { try { return (0, eval)('S') } catch (e) { return {} } };
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v } catch (e) { return d } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} } };
  const api = (u, o) => NET.api('/api/ac/v2' + u, o);
  const V2 = window.V2 = { me: null, queue: [], pick: false, price: 'any', q: '', sheetKey: '', lastUp: 0, lastCut: 0 };

  /* ============ Feelings: what is making the player feel good or bad right now ============ */
  const NEEDS = [['Hunger', 'utensils', '#f59e0b', '#3a2a1c'], ['Energy', 'bolt', '#3b82f6', '#1b2a48'], ['Fun', 'champagne-glasses', '#eab308', '#3a3314'], ['Social', 'comment', '#ec4899', '#3b1a2e'], ['Hygiene', 'shower', '#14b8a6', '#12332f'], ['Bladder', 'toilet', '#8b5cf6', '#2a2050']];
  const TRAIT_FX = {   // trait id -> [need index, up when at least, text, down when below, text]
    hustler: ['cash', 100000, ['💼', 'Hustle Pays', 'Money dey enter. You feel unstoppable.', 8], 5000, ['💼', 'Broke Hustler', 'A hustler with no cash feels it.', -8]],
    gymrat: [1, .6, ['💪', 'Strong Body', 'Energy is high. You could lift the whole house.', 8], .25, ['💪', 'Gym Skipped', 'Low energy hurts when you are a gym rat.', -8]],
    foodie: [0, .7, ['🍛', 'Belle Full', 'Good food, good mood.', 8], .4, ['🍛', 'Foodie Hungry', 'You think about jollof every minute.', -10]],
    party: [2, .7, ['🎉', 'Party Spirit', 'The vibes are loud and you love it.', 10], .4, ['🎉', 'FOMO', 'You need some fun, quick.', -10]],
    homebody: ['home', 4, ['🛋️', 'Home Sweet Home', 'You love being in your own place.', 10], 1, ['🛋️', 'Empty Nest', 'A homebody needs a nicer home.', -8]],
    social: [3, .7, ['🦋', 'Squad Love', 'Your people keep you going.', 10], .4, ['🦋', 'Lonely Butterfly', 'You miss your people.', -10]],
    neat: [4, .7, ['🧼', 'Fresh and Clean', 'Nothing beats a clean body.', 8], .4, ['🧼', 'Cannot Relax', 'You cannot rest when you are not clean.', -12]],
    music: [2, .5, ['🎵', 'In The Groove', 'A good song fixes most things.', 6], .2, ['🎵', 'Silence Hurts', 'You need some music.', -6]],
    bookworm: [1, .5, ['📚', 'Quiet Mind', 'Calm and curious. Nice.', 6], .15, ['📚', 'Brain Fog', 'Too tired to think.', -6]],
    explorer: [2, .6, ['🧭', 'Itchy Feet', 'Lagos has so much to see.', 6], .15, ['🧭', 'Cabin Fever', 'You need to see somewhere new.', -6]]
  };
  const FEEL = {
    items() { const S = SS() || {}, n = S.needs || [1, 1, 1, 1, 1, 1], out = [], put = (e, t, s, v) => out.push({ e, t, s, v });
      const own = ((S.activeProperty && S.activeProperty.items) || S.legacyItems || []).filter(i => i.placed !== false).length, cash = S.cash || 0;
      if (own >= 8) put('🏡', 'Fine House', 'Your place is looking good.', 18); else if (own >= 4) put('🏠', 'Cosy Corner', 'Your place is coming together.', 10); else if (own === 0) put('📦', 'Bare Room', 'This room needs some furniture.', -8);
      if (cash >= 1e6) put('🎉', 'Soft Life', 'Money dey. Enjoyment dey. Life is sweet.', 10); else if (cash < 5000) put('🪙', 'Broke', 'Account dey cry.', -12);
      const hu = n[0], en = n[1], fu = n[2], so = n[3], hy = n[4], bl = n[5];
      if (hu < .1) put('😫', 'Starving', 'Belle dey cry. Eat something now!', -30); else if (hu < .3) put('🍽️', 'Hungry', 'Your belle is making noise.', -12); else if (hu > .8) put('🍛', 'Well Fed', 'Belle full, mind free.', 8);
      if (en < .1) put('🥱', 'Exhausted', 'Body don tire. Go sleep.', -20); else if (en < .3) put('😴', 'Tired', 'Your eyes are heavy.', -8); else if (en > .85) put('⚡', 'Full Of Energy', 'You could run to Ikeja.', 6);
      if (fu < .2) put('🥲', 'Bored', 'Nothing dey happen. Find some fun.', -10); else if (fu > .8) put('🕺', 'Good Vibes', 'Enjoyment dey!', 8);
      if (so < .2) put('🫥', 'Lonely', 'You need to see your people.', -10); else if (so > .8) put('🤝', 'Good Company', 'Your people dey around.', 8);
      if (hy < .2) put('🤢', 'Smelly', 'You need a bath, bros.', -10); else if (hy > .85) put('✨', 'Fresh', 'Clean and sharp.', 6);
      if (bl < .15) put('🚽', 'Hold Am!', 'Nature is calling loudly.', -15);
      try { const ev = (typeof LAGOS!=='undefined'?LAGOS:undefined) && LAGOS.d && LAGOS.d.event;
        if (ev) { if (ev.id === 'owambe') put('🎊', 'Owambe Vibes', 'The whole city is partying.', 10); else if (ev.id === 'market') put('🛍️', 'Market Day', 'Prices are down. Nice.', 6); else if (ev.id === 'fuel') put('⛽', 'Fuel Scarcity', 'Queues everywhere.', -8); else if (ev.id === 'goslow') put('🚗', 'Go-slow', 'Traffic is crawling.', -4);
          else if (ev.id === 'rain') { if ((ev.intensity || 0) >= 3) put('🌊', 'Street Don Flood', 'Water reached knee level. Again.', -12); else put('🌧️', 'Rainy Day', 'The rain is falling.', -2) } } } catch (e) {}
      try { const now = Date.now(); if ((typeof BAN!=='undefined'?BAN:undefined) && BAN.light === false) put('🕯️', 'NEPA Don Carry Light', 'Everywhere is dark.', -8); else if (V2.lastUp && now - V2.lastUp < 600000) put('💡', 'UP NEPA!', 'Light don come! The whole street shouted.', 10) } catch (e) {}
      (V2.me && V2.me.traits || []).forEach(id => { const f = TRAIT_FX[id]; if (!f) return; const val = f[0] === 'cash' ? cash : f[0] === 'home' ? own : n[f[0]];
        if (val >= f[1]) put(...f[2]); else if (val < f[3]) put(...f[4]) });
      return out.sort((a, b) => b.v - a.v) },
    score() { return this.items().reduce((a, x) => a + x.v, 0) },
    mood() { const s = this.score(); return s >= 30 ? ['😄', 'Great'] : s >= 10 ? ['🙂', 'Good'] : s > -8 ? ['😊', 'Fine'] : s > -25 ? ['😕', 'Low'] : ['😩', 'Bad'] },
    status() { const n = ((typeof S!=='undefined'?S:undefined) && S.needs) || [1, 1, 1, 1, 1, 1], lo = Math.min.apply(null, n), i = n.indexOf(lo);
      return lo < .1 ? ['Starving', 'Exhausted', 'Bored stiff', 'Lonely', 'Filthy', 'Desperate'][i] : lo < .3 ? ['Hungry', 'Tired', 'Bored', 'Lonely', 'Dirty', 'Need the toilet'][i] : 'Doing well' }
  };
  V2.FEEL = FEEL;

  /* ============ HUD ============ */
  function timeLeft(ms) { const m = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? d + 'd ' + (h % 24) + 'h' : h ? h + 'h ' + (m % 60) + 'm' : m + 'm' }
  function build() {
    if ($('v2top')) return; const host = $('app') || document.body;
    const add = (id, html) => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; host.appendChild(d); return d };
    add('v2top', `<button class="v2p v2time" onclick="V2.sheet('char')" aria-label="How you feel"><span id="v2ic">🌙</span><span id="v2clk">--:--</span><span class="ap" id="v2ap"></span><span class="mf" id="v2mf">😊</span></button><button class="v2chev" id="v2chev" aria-label="Show or hide panels" onclick="V2.fold()">${I.chev}</button><div class="v2p v2bal" role="button" tabindex="0" onclick="openBank()" aria-label="Open AllConnect Pay"><span id="v2bal">₦0</span><button class="v2plus" onclick="event.stopPropagation();openBank(true)" aria-label="Top up wallet">+</button></div>`);
    add('v2strip', '');
    add('v2event', '');
    add('v2rail', `<button class="rb home" onclick="V2.homeTap()" aria-label="Homes">🏠<i id="v2hbang" style="display:none">!</i></button><button class="rb" id="v2bulb" onclick="V2.bulbTap()" aria-label="Power"></button><button class="rb" onclick="CAMV.flip()" aria-label="Rotate view">${I.rot}</button><button class="rb" onclick="V2.pop()" aria-label="More view options">${I.dots}</button>`);
    add('v2pop', `<button onclick="CAMV.zoom(1.2)" aria-label="Zoom in">＋</button><button onclick="CAMV.zoom(1/1.2)" aria-label="Zoom out">－</button><button onclick="CAMV.reset()" aria-label="Reset view">⟲</button><button id="v2eye" onclick="V2.eye()" aria-label="First person view">👁</button>`);
    add('v2radio', '<span>📻</span> Radio').onclick = () => { nav('phone'); setTimeout(() => { try { SONGIFY.open() } catch (e) { toast('Radio is not ready yet') } }, 80) };
    $('v2radio').className = 'v2p'; $('v2radio').setAttribute('role', 'button');
    add('v2act', `<button class="cb" onclick="V2.mic()" aria-label="Voice command">${I.mic}</button><button class="cb" onclick="nav('buy')" aria-label="Buy furniture">${I.sofa}</button><button class="cb" onclick="openBank()" aria-label="Wallet">${I.bag}</button><button class="pl" onclick="V2.outside()">${I.door}<span>Outside</span></button><div class="wk"><button id="v2work" onclick="V2.work()">${I.work}<span>Work</span></button><button class="car" onclick="V2.car()" aria-label="Transport">🚗<span style="font-size:11px">⌃</span></button></div>`);
    add('v2nav', `<button class="me" onclick="V2.sheet('char')" aria-label="Your character"><div class="in" id="v2av"></div><span class="mf" id="v2mf2">😊</span></button><div class="cap"><button data-p="home" onclick="nav('home')">${I.home}<span class="t">Home</span></button><button data-p="buy" onclick="nav('buy')" aria-label="Design">${I.chair}<span class="t">Design</span></button><button data-p="map" onclick="nav('map')" aria-label="Map">${I.map}<span class="t">Map</span></button></div><button class="ph" onclick="PHONEUI.open()" aria-label="Phone">${I.phone}<i id="v2phdot" style="display:none"></i></button>`);
    const sh = document.createElement('div'); sh.id = 'v2sheet'; host.appendChild(sh);
    $('v2av').addEventListener('error', () => {}, true);
  }
  function tick() {
    if (!$('v2top')) return; const S = SS() || {};
    document.body.classList.toggle('v2m', mq.matches); if (!mq.matches) return;
    ['home', 'map', 'buy', 'phone'].forEach(p => document.body.classList.toggle('pg-' + p, S.page === p)); document.body.classList.toggle('clean', !!S.clean);
    const clk = ($('clk') || {}).textContent || '--:--', m = clk.match(/^(\S+)\s*(AM|PM)?/i);
    $('v2clk').textContent = m ? m[1] : clk; $('v2ap').textContent = m && m[2] ? m[2].toUpperCase() : ''; $('v2ic').textContent = ($('hico') || {}).textContent || '🌙';
    const mood = FEEL.mood(); $('v2mf').textContent = mood[0]; $('v2mf2').textContent = mood[0]; const mm = $('mood'); if (mm) mm.textContent = mood[0] + ' ' + mood[1];
    $('v2bal').textContent = short(S.cash);
    document.querySelectorAll('#v2nav .cap button').forEach(b => b.classList.toggle('on', b.dataset.p === (S.page === 'buy' ? 'buy' : S.page === 'map' ? 'map' : 'home')));
    const n = S.needs || [], rc = v => v < .15 ? '#ef4444' : v < .4 ? '#f59e0b' : null, ring = $('v2nav').querySelector('.me'), df = ['#4ade80', '#60a5fa', '#fbbf24', '#f472b6', '#2dd4bf', '#a78bfa'];
    for (let i = 0; i < 6; i++) ring.style.setProperty('--r' + (i + 1), rc(n[i]) || df[[0, 1, 2, 3, 4, 5][i]]);
    try { const av = $('v2av'), u = NET.user || {}, key = (u.avatar || '') + '|' + (u.username || u.displayName || ''); if (av.dataset.k !== key) { av.dataset.k = key; av.innerHTML = (typeof PH!=='undefined'?PH:undefined) && PH.av ? PH.av(u, 1) : esc((u.displayName || '?')[0]) } } catch (e) {}
    const ev = (typeof LAGOS!=='undefined'?LAGOS:undefined) && LAGOS.d && LAGOS.d.event, dis = LS.get('v2dis', ''), strip = $('v2strip'), card = $('v2event'), todo = ((typeof LAGOS!=='undefined'?LAGOS:undefined) && LAGOS.todo) ? LAGOS.todo() : 0;
    const q = (typeof GOALS!=='undefined'?GOALS:undefined) && GOALS.next && GOALS.next(), gem = (typeof GEM!=='undefined'?GEM:undefined) ? 1 : 0, daily = (typeof LAGOS!=='undefined'?LAGOS:undefined) && LAGOS.d && LAGOS.d.daily, streak = (daily && (daily.streak || daily.count)) || S.streak || 0;
    const sKey = 'g' + (q ? q.id || q.title : 'x') + '|' + streak + '|' + (daily && daily.claimable);
    if (strip.dataset.k !== sKey) { strip.dataset.k = sKey;
      strip.innerHTML = (q && dis !== sKey ? `<div class="v2p v2chip" onclick="GOALS.open()"><span>🎯</span><b>${esc(q.title)}</b><button class="v2x" onclick="event.stopPropagation();V2.hideChip('${esc(sKey)}')" aria-label="Hide">✕</button></div>` : '') + (streak ? `<div class="v2fl" role="button" onclick="LAGOS.open('today')" aria-label="Daily streak">🔥${streak}${daily && daily.claimable ? '<i></i>' : ''}</div>` : '<span style="margin-left:auto"></span>') + (gem ? `<button class="v2gem" onclick="GEM.open()" aria-label="Daily gem hunt">💎</button>` : '') }
    const ck = ev ? ev.windowKey + '|' + todo + '|' + (dis === 'ev' + ev.windowKey) : '';
    if (ev && dis !== 'ev' + ev.windowKey) { const left = timeLeft(ev.endsAt - Date.now()), title = ((typeof NG!=='undefined'?NG:undefined) && NG.pcm && NG.pcm()) ? ev.pidgin : ev.title;
      card.innerHTML = `<div class="v2card" onclick="LAGOS.open()"><span class="v2ic" style="background:${esc(ev.color || '#b57416')}">${esc(ev.icon || '🎉')}</span><div class="v2tx"><b>${esc(title)}</b><small>${esc(ev.text || '')}</small></div><span class="tm">🕒 ${left}</span><button class="x" onclick="event.stopPropagation();V2.hideEv('${ev.windowKey}')" aria-label="Hide">✕</button></div>${todo ? `<button class="v2more" onclick="LAGOS.open()">+${todo}</button>` : ''}` } else if (card.innerHTML) card.innerHTML = '';
    const bulb = $('v2bulb'), lit = !((typeof BAN!=='undefined'?BAN:undefined) && BAN.light === false) && !(window.ROOM3D && ROOM3D.roomLight === false); bulb.innerHTML = lit ? I.bulb : I.bulbOff;
    const bang = $('v2hbang'); if (bang) bang.style.display = todo ? 'block' : 'none';
    const dot = $('v2phdot'); if (dot) { const b = ((typeof PH!=='undefined'?PH:undefined) && PH.badges) || {}, c = (b.messages || 0) + (b.updates || 0) + (b.requests || 0) + (((typeof PH!=='undefined'?PH:undefined) && PH.localUnread) || 0); dot.style.display = c ? 'block' : 'none' }
    const wk = $('v2work'); if (wk && (typeof JOBS!=='undefined'?JOBS:undefined) && JOBS.data && JOBS.data.mine) { const st = JOBS.btn(JOBS.data.mine); wk.querySelector('span').textContent = st.off ? (st.t.startsWith('On break') ? st.t.replace('On break · ', '') : st.t.length > 12 ? 'Work' : st.t) : 'Work'; wk.disabled = !!st.off } else if (wk) wk.querySelector('span').textContent = 'Work';
  }
  Object.assign(V2, {
    fold() { const on = document.body.classList.toggle('fold'); $('v2chev').classList.toggle('up', on) },
    hideChip(k) { LS.set('v2dis', k); const s = $('v2strip'); s.dataset.k = ''; tick() },
    hideEv(k) { LS.set('v2dis', 'ev' + k); tick() },
    eye() { const R = window.ROOM3D; if (!R || !R.avatar) { toast('Look around works inside your home'); return } const on = R.setFirstPerson(!R.fpv); const b = $('v2eye'); if (b) b.classList.toggle('on', !!on); this.pop(false); toast(on ? 'First person: drag to look around 👁' : 'Back to the room view') },
    pop(f) { const p = $('v2pop'); p.classList.toggle('on', typeof f === 'boolean' ? f : !p.classList.contains('on')) },
    homeTap() { try { HOMES.openApp() } catch (e) { nav('buy') } },
    bulbTap() {     // the bulb is a light switch: tap to brighten the room or dim it. If NEPA has taken light, it opens the bills instead.
      const R = window.ROOM3D; if (!R) { try { LAGOS.open('bills') } catch (e) {} return }
      if (typeof BAN !== 'undefined' && BAN.light === false && !(R.power && R.power())) { toast('NEPA don carry light. Pay your bills or get a Gen Set.'); try { LAGOS.open('bills') } catch (e) {} return }
      const on = R.roomLight === false; R.setLight(on); toast(on ? 'Lights on 💡' : 'Lights off 🌙'); tick() },
    outside() { try { if ((typeof DOOR!=='undefined'?DOOR:undefined) && DOOR.btn && DOOR.btn.dataset.mode === 'out') DOOR.press(); else { nav('map'); setTimeout(() => { if ((typeof MAP3D!=='undefined'?MAP3D:undefined) && MAP3D.stepOutside) MAP3D.stepOutside() }, 80) } } catch (e) { nav('map') } },
    work() { try { if ((typeof JOBS!=='undefined'?JOBS:undefined) && JOBS.data && JOBS.data.mine) JOBS.work(); else { nav('phone'); setTimeout(() => PH.open('jobs'), 60) } } catch (e) { toast('Work is not ready yet') } },
    car() { try { nav('phone'); setTimeout(() => TR.open(), 80) } catch (e) { toast('Transport is not ready yet') } },
    mic() { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return toast("Voice commands aren't supported in this browser."); try { const r = new SR(); r.lang = 'en-NG'; r.onresult = e => { const t = e.results[0][0].transcript; toast('🎙️ ' + t); try { VCMD.handle(t) } catch (x) {} }; r.onerror = () => toast('I could not hear you. Try again.'); r.start(); toast('Listening…') } catch (e) { toast('Voice is not available right now.') } }
  });

  /* ============ Bottom sheets ============ */
  const SH = { tab: 'needs', stack: [] };
  V2.sheet = function (key, arg) { SH.key = key; SH.arg = arg; const el = $('v2sheet'); el.classList.add('on'); V2.paint() };
  V2.closeSheet = function () { SH.key = ''; const el = $('v2sheet'); el.classList.remove('on'); el.innerHTML = '' };
  const shell = (cls, inner) => `<div class="v2sheet ${cls || ''}" role="dialog" aria-modal="true">${inner}</div>`;
  const closeBtn = '<button class="cl" onclick="V2.closeSheet()" aria-label="Close">✕</button>';
  V2.paint = async function () {
    const el = $('v2sheet'), k = SH.key; if (!k) return;
    if (!V2.me) { try { V2.me = await api('/me') } catch (e) { V2.me = { traits: [], prefs: {}, memories: [] } } }
    if (SH.key !== k) return;
    if (k === 'char') el.innerHTML = charHtml(); else if (k === 'traits') el.innerHTML = traitsHtml(); else if (k === 'memory') el.innerHTML = memoryHtml(); else if (k === 'topup') el.innerHTML = await topupHtml(); else if (k === 'notices') el.innerHTML = await noticesHtml(); else if (k === 'bday') el.innerHTML = bdayHtml(); else if (k === 'pw') el.innerHTML = pwHtml(); else if (k === 'email') el.innerHTML = emailHtml(); else if (k === 'reach') el.innerHTML = reachHtml(); else if (k === 'blocked') el.innerHTML = await blockedHtml();
    const b = el.querySelector('.v2bd'); if (b && SH.scroll != null && SH.keep) { b.scrollTop = SH.scroll; SH.keep = false }
  };
  const person = () => { const u = (typeof NET !== 'undefined' && NET.user) || {}; return { name: u.username || u.displayName || 'Player', u } };
  function charHtml() {
    const p = person(), mood = FEEL.mood(), tabs = [['profile', 'Profile'], ['needs', 'Needs'], ['goals', 'Goals'], ['skills', 'Skills'], ['people', 'People']];
    return shell('tall', `<div class="v2hd"><div class="av2">${(typeof PH!=='undefined'?PH:undefined) && PH.av ? PH.av(p.u, 1) : esc(p.name[0])}</div><div class="v2tx"><h2>${esc(p.name)}</h2><p>${mood[1]} · ${FEEL.status()}</p></div>${closeBtn}</div><div class="v2tabs">${tabs.map(t => `<button class="${SH.tab === t[0] ? 'on' : ''}" onclick="V2.tab('${t[0]}')">${t[1]}</button>`).join('')}</div><div class="v2bd" id="v2bd">${charBody()}</div>`);
  }
  V2.tab = function (t) { SH.tab = t; SH.keep = false; V2.paint(); if (t === 'people' || t === 'skills') loadTab(t) };
  function charBody() {
    const S = SS() || {}, n = S.needs || [];
    if (SH.tab === 'needs') {
      const rows = NEEDS.map((x, i) => { const v = Math.round((n[i] || 0) * 100), low = v < 20; return `<div class="v2nd"><span class="v2ic" style="background:${x[3]};color:${x[2]}"><span class="fa-solid fa-${x[1]}"></span></span><div class="bx"><div class="l"><span>${x[0]}</span><span style="${low ? 'color:#ff6b7d' : ''}">${v}</span></div><div class="tr"><i style="width:${v}%;background:${x[2]}"></i></div></div></div>` }).join('');
      const fe = FEEL.items().map(f => `<div class="v2fe"><span class="e">${f.e}</span><div class="t"><b>${esc(f.t)}</b><small>${esc(f.s)}</small></div><span class="v ${f.v >= 0 ? 'up' : 'dn'}">${f.v > 0 ? '+' : ''}${f.v}</span></div>`).join('') || '<p class="v2em">Nothing special right now.</p>';
      const tr = (V2.me.traits || []).map(id => { const t = (V2.TRAITS || []).find(x => x.id === id); return t ? t.icon + ' ' + t.name : '' }).filter(Boolean);
      const nm = person().name;
      return rows + `<div class="v2h">Feelings</div>${fe}${tr.length ? `<div class="v2tl">Traits: <b>${tr.join(' · ')}</b></div>` : ''}<div class="v2h" style="text-transform:none;letter-spacing:0;font-size:15px;color:#fff;margin-top:12px">Inner life</div><div class="v2gp"><button onclick="V2.sheet('traits')"><span class="v2ic">✨</span><div><b>Who is ${esc(nm)}?</b><small>${(V2.me.traits || []).length === 3 ? 'Change the three traits that shape you' : 'Pick three traits. They shape how you feel and what you want'}</small></div><span class="r">›</span></button><button onclick="V2.sheet('memory')"><span class="v2ic">📖</span><div><b>Memory book</b><small>Your big moments, with how they felt</small></div><span class="r">${(V2.me.memories || []).length}<span>›</span></span></button></div>`;
    }
    if (SH.tab === 'goals') { try { return GOALS.goalsHtml.call(Object.assign({}, GOALS, { head: () => '' })) } catch (e) { return '<p class="v2em">Goals are loading…</p>' } }
    if (SH.tab === 'profile') {
      const p = person(), u = p.u;
      return `<div class="v2gp" style="margin-top:0"><button onclick="V2.closeSheet();PH.open('settings');setTimeout(()=>PH.editProfile('PH.settings()'),120);nav('phone')"><span class="v2ic">✏️</span><div><b>Edit profile</b><small>Name, photo and bio</small></div><span class="r">›</span></button></div><div class="v2h">About you</div><div class="v2fe"><span class="e">🪪</span><div class="t"><b>${esc(u.displayName || p.name)}</b><small>${u.username ? '@' + esc(u.username) : 'No username yet'}</small></div></div><div class="v2fe"><span class="e">💰</span><div class="t"><b>${fmt(S.cash)}</b><small>In your wallet</small></div></div>${u.bio ? `<div class="v2fe"><span class="e">💬</span><div class="t"><small style="font-size:13px;color:#fff">${esc(u.bio)}</small></div></div>` : ''}<div class="v2gp"><button onclick="V2.closeSheet();PH.open('settings');nav('phone')"><span class="v2ic">⚙️</span><div><b>Settings</b><small>Privacy, sound and security</small></div><span class="r">›</span></button></div>`;
    }
    if (SH.tab === 'skills') {
      const m = (typeof JOBS!=='undefined'?JOBS:undefined) && JOBS.data && JOBS.data.mine;
      if (!m) return '<p class="v2em">Get a job in the Jobs app to start building skills.</p>';
      const nx = m.next, pct = nx ? Math.min(100, Math.round(((m.shifts - nx.from) / Math.max(1, nx.at - nx.from)) * 100)) : 100;
      return `<div class="v2nd"><span class="v2ic" style="background:#1b2a48;color:#3b82f6"><span class="fa-solid fa-briefcase"></span></span><div class="bx"><div class="l"><span>${esc(m.title)}</span><span>${m.shifts || 0} shifts</span></div><div class="tr"><i style="width:${pct}%;background:#3b82f6"></i></div></div></div><p class="v2tl">${nx ? `Next promotion at <b>${nx.at}</b> shifts.` : 'You are at the top of this career.'} ${esc(m.field || '')} · ${fmt(m.pay)} per shift</p><div class="v2gp"><button onclick="V2.closeSheet();nav('phone');setTimeout(()=>PH.open('jobs'),80)"><span class="v2ic">💼</span><div><b>Open Jobs</b><small>Switch jobs or work a shift</small></div><span class="r">›</span></button></div>`;
    }
    if (SH.tab === 'people') {
      const f = V2.friends; if (!f) return '<p class="v2em">Loading…</p>';
      if (!f.length) return '<p class="v2em">No friends yet. Find people in Contacts.</p><div class="v2gp"><button onclick="V2.closeSheet();nav(\'phone\');setTimeout(()=>PH.open(\'contacts\'),80)"><span class="v2ic">👥</span><div><b>Find people</b><small>Add friends in Contacts</small></div><span class="r">›</span></button></div>';
      return f.map(u => `<div class="v2fe"><span class="e" style="width:40px;height:40px;border-radius:50%;overflow:hidden;font-size:0">${(typeof PH!=='undefined'?PH:undefined) && PH.av ? PH.av(u, 1) : ''}</span><div class="t"><b>${esc(u.username ? '@' + u.username : u.displayName)}</b><small>${u.online ? '🟢 Online' : 'Offline'}</small></div></div>`).join('');
    }
    return '';
  }
  async function loadTab(t) { try { if (t === 'people') { V2.friends = (await NET.api('/api/ac/friends')).friends || [] } if (t === 'skills' && (typeof JOBS!=='undefined'?JOBS:undefined) && !JOBS.data) await JOBS.load() } catch (e) { if (t === 'people') V2.friends = [] } if (SH.key === 'char' && SH.tab === t) V2.paint() }
  /* traits picker */
  V2.TRAITS = [{ id: 'hustler', icon: '💼', name: 'Hustler', text: 'Money matters. You feel good when cash is flowing.' }, { id: 'gymrat', icon: '💪', name: 'Gym Rat', text: 'Strong body, strong mind.' }, { id: 'foodie', icon: '🍛', name: 'Foodie', text: 'A full belle is a happy belle.' }, { id: 'party', icon: '🎉', name: 'Party Animal', text: 'You need fun like you need air.' }, { id: 'homebody', icon: '🏠', name: 'Homebody', text: 'A nice home makes you glow.' }, { id: 'social', icon: '🦋', name: 'Social Butterfly', text: 'Friends are your fuel.' }, { id: 'neat', icon: '🧼', name: 'Neat Freak', text: 'You cannot relax when dirty.' }, { id: 'music', icon: '🎵', name: 'Music Lover', text: 'A good song fixes most things.' }, { id: 'bookworm', icon: '📚', name: 'Bookworm', text: 'Calm and curious.' }, { id: 'explorer', icon: '🧭', name: 'Explorer', text: 'You love new corners of Lagos.' }];
  function traitsHtml() {
    SH.pick = SH.pick || (V2.me.traits || []).slice(); const p = SH.pick, nm = person().name;
    return shell('tall', `<div class="v2hd"><div class="v2tx"><h2>Who is ${esc(nm)}?</h2><p>Pick exactly three traits.</p></div>${closeBtn}</div><div class="v2bd"><div class="v2tg">${V2.TRAITS.map(t => `<button class="${p.includes(t.id) ? 'on' : ''}" onclick="V2.togTrait('${t.id}')"><span class="e">${t.icon}</span><b>${t.name}</b><small>${t.text}</small></button>`).join('')}</div><button class="v2btn" ${p.length === 3 ? '' : 'disabled'} onclick="V2.saveTraits()">${p.length === 3 ? 'Save traits' : `Pick ${3 - p.length} more`}</button><button class="v2btn alt" onclick="SH_back()">Back</button></div>`);
  }
  V2.togTrait = function (id) { const p = SH.pick = SH.pick || []; const i = p.indexOf(id); if (i >= 0) p.splice(i, 1); else if (p.length < 3) p.push(id); else toast('Only three. Tap one to swap it out.'); V2.paint() };
  V2.saveTraits = async function () { try { const r = await api('/traits', { method: 'POST', body: { traits: SH.pick } }); V2.me.traits = r.traits; V2.mem('✨', 'Who I am', 'I chose my three traits: ' + r.traits.map(id => (V2.TRAITS.find(t => t.id === id) || {}).name).join(', ') + '.', 5); SH.pick = null; toast('Traits saved ✓'); window.SH_back() } catch (e) { toast(e.message) } };
  window.SH_back = function () { SH.pick = null; SH.tab = 'needs'; V2.sheet('char') };
  /* memory book */
  function memoryHtml() {
    const ms = V2.me.memories || [];
    return shell('tall', `<div class="v2hd"><div class="v2tx"><h2>Memory book</h2><p>Your big moments, with how they felt.</p></div>${closeBtn}</div><div class="v2bd">${ms.length ? ms.map(m => `<div class="v2mem"><span class="e">${esc(m.icon)}</span><div style="flex:1;min-width:0"><b>${esc(m.title)}</b>${m.text ? `<small>${esc(m.text)}</small>` : ''}<div class="d">${UI.ago(m.at)}${m.mood ? ` · felt ${m.mood > 0 ? '+' : ''}${m.mood}` : ''}</div></div></div>`).join('') : '<p class="v2em">No memories yet. Promotions, big wins and gifts will show up here.</p>'}<button class="v2btn alt" onclick="SH_back()">Back</button></div>`);
  }
  V2.mem = async function (icon, title, text, mood) { try { const r = await api('/memories', { method: 'POST', body: { icon, title, text, mood } }); if (r && r.memory && V2.me) { V2.me.memories = [r.memory].concat(V2.me.memories || []).slice(0, 40) } } catch (e) {} };
  /* wallet top-up */
  V2.cur = LS.get('v2cur', 'NGN'); V2.pk = 'biglife';
  async function topupHtml() {
    if (!V2.packs) { try { V2.packs = await api('/topup/packs') } catch (e) { V2.packs = { live: false, packs: [] } } }
    const usd = V2.cur === 'USD', rate = 1000, price = p => usd ? '$' + p.usd : fmt(p.ngn), alt = p => usd ? '≈ ' + fmt(p.ngn) : '≈ $' + p.usd;
    return shell('tall', `<div class="v2wal"><span class="v2ic">💳</span><div style="flex:1"><h2>Top up wallet</h2><p>Balance ${fmt(((typeof S!=='undefined'?S:undefined) || {}).cash)}</p></div>${closeBtn}</div><div class="v2bd"><div class="v2pay"><span>Pay in</span><div class="sg"><button class="${usd ? '' : 'on'}" onclick="V2.setCur('NGN')">₦ Naira</button><button class="${usd ? 'on' : ''}" onclick="V2.setCur('USD')">$ USD</button></div></div>${(V2.packs.packs || []).map(p => `<button class="v2pk ${V2.pk === p.id ? 'on' : ''}" onclick="V2.pickPack('${p.id}')"><span class="e">${p.icon}</span><div><b>+${fmt(p.coins)} game money</b><small>${p.name}${p.best ? ' · best value' : ''}</small></div><div class="pr"><span>${price(p)}</span><small>${alt(p)}</small></div></button>`).join('')}<button class="v2btn" id="v2pay" onclick="V2.checkout()">Pay ${(() => { const p = (V2.packs.packs || []).find(x => x.id === V2.pk); return p ? price(p) : '' })()}</button><p class="v2note">${V2.packs.live ? 'You pay on a secure Paystack page. Game money is added as soon as the payment is confirmed.' : 'Payments are not live yet. You can look around, but nothing will be charged.'}</p></div>`);
  }
  V2.setCur = function (c) { V2.cur = c; LS.set('v2cur', c); V2.paint() };
  V2.pickPack = function (id) { V2.pk = id; V2.paint() };
  V2.checkout = async function () { const b = $('v2pay'); if (b) b.disabled = true; try { const r = await api('/topup/checkout', { method: 'POST', body: { pack: V2.pk, currency: V2.cur } }); location.href = r.url } catch (e) { toast(e.message); if (b) b.disabled = false } };
  async function checkReturn() { const m = location.search.match(/[?&]topup=([\w-]+)/); if (!m) return; history.replaceState(null, '', location.pathname + location.hash);
    for (let i = 0; i < 4; i++) { try { const r = await api('/topup/verify?reference=' + m[1]); if (r && r.ok) { if (r.credited) { toast('✅ ' + fmt(r.coins) + ' added to your wallet'); V2.mem('💳', 'Wallet top-up', fmt(r.coins) + ' game money added.', 4) } if ((typeof CARD!=='undefined'?CARD:undefined)) CARD.refreshCash(); return } } catch (e) { return } await new Promise(r => setTimeout(r, 2500)) } toast('We are still confirming your payment. It will show in your wallet shortly.') }
  /* notices */
  async function noticesHtml() {
    let ups = []; try { ups = (await NET.api('/api/ac/updates')).updates || [] } catch (e) {}
    return shell('tall', `<div class="v2hd"><div class="v2tx"><h2>Notices</h2><p>What happened while you were busy.</p></div>${closeBtn}</div><div class="v2bd">${ups.length ? ups.map(u => `<div class="v2fe"><span class="e">${esc(u.icon || '🔔')}</span><div class="t"><b style="font-size:14px;font-weight:600">${esc(u.text)}</b><small>${UI.ago(u.at)}</small></div></div>`).join('') + '<button class="v2btn alt" onclick="V2.clearNotices()">Clear all</button>' : '<p class="v2em">Nothing new. You are all caught up.</p>'}<button class="v2btn alt" onclick="V2.closeSheet()">Close</button></div>`);
  }
  V2.clearNotices = async function () { try { await NET.api('/api/ac/updates/clear', { method: 'POST' }); toast('Cleared'); if ((typeof PH!=='undefined'?PH:undefined)) PH.badges.updates = 0; V2.paint() } catch (e) { toast(e.message) } };
  /* birthday, password, email */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function bdayHtml() { const b = V2.me.bday || {}; return shell('', `<div class="v2hd"><div class="v2tx"><h2>Your birthday</h2><p>We post a birthday card on P-Gist on this day. Your year of birth is never shown.</p></div>${closeBtn}</div><div class="v2bd"><div class="v2form"><select id="bm">${MONTHS.map((m, i) => `<option value="${i + 1}" ${b.m === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select><select id="bd">${Array.from({ length: 31 }, (_, i) => `<option ${b.d === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div><button class="v2btn" onclick="V2.saveBday()">Celebrate me</button><button class="v2btn alt" onclick="V2.closeSheet()">Cancel</button></div>`) }
  V2.saveBday = async function () { try { const m = +$('bm').value, d = +$('bd').value; await api('/bday', { method: 'POST', body: { m, d } }); await api('/prefs', { method: 'POST', body: { showBirthday: true } }); V2.me.bday = { m, d }; V2.me.prefs.showBirthday = true; toast('Saved ✓'); V2.closeSheet(); V2.decorate() } catch (e) { toast(e.message) } };
  function pwHtml() { return shell('', `<div class="v2hd"><div class="v2tx"><h2>Change password</h2><p>You will need your current one.</p></div>${closeBtn}</div><div class="v2bd"><div class="v2form">${V2.me.hasPassword ? '<input id="pw0" type="password" placeholder="Current password" autocomplete="current-password">' : ''}<input id="pw1" type="password" placeholder="New password (6+ characters)" autocomplete="new-password"><input id="pw2" type="password" placeholder="Repeat new password" autocomplete="new-password"></div><button class="v2btn" onclick="V2.savePw()">Change password</button><button class="v2btn alt" onclick="V2.closeSheet()">Cancel</button></div>`) }
  V2.savePw = async function () { const a = $('pw1').value, b = $('pw2').value; if (a !== b) return toast('The two new passwords are different.'); if (a.length < 6) return toast('Use at least 6 characters.'); try { await api('/password', { method: 'POST', body: { current: ($('pw0') || {}).value || '', next: a } }); toast('Password changed ✓'); V2.closeSheet() } catch (e) { toast(e.message) } };
  function emailHtml() { return shell('', `<div class="v2hd"><div class="v2tx"><h2>Verify email</h2><p>We will send a 6-digit code to ${esc(V2.me.email)}.</p></div>${closeBtn}</div><div class="v2bd"><div class="v2form"><input id="ec" inputmode="numeric" maxlength="6" placeholder="6-digit code" autocomplete="one-time-code"></div><button class="v2btn alt" onclick="V2.sendCode()">Send me a code</button><button class="v2btn" onclick="V2.verifyCode()">Verify</button><button class="v2btn alt" onclick="V2.closeSheet()">Cancel</button></div>`) }
  V2.sendCode = async function () { try { const r = await api('/email/send-code', { method: 'POST' }); toast(r.verified ? 'Already verified ✓' : 'Code sent to ' + r.to) } catch (e) { toast(e.message) } };

  function reachHtml() {
    const p = (V2.me && V2.me.prefs) || {}, sw = (k, ic, t, sub) => `<button class="trow" onclick="V2.reachTap('${k}')"><span class="ti">${ic}</span><span class="tl">${t}<span class="sub">${sub}</span></span><span class="sw2 ${p[k] !== false ? 'on' : ''}"><i></i></span></button>`;
    return shell('', `<div class="v2hd"><div class="v2tx"><h2>What reaches you</h2><p>Choose what is allowed to notify you.</p></div>${closeBtn}</div><div class="v2bd"><div class="sgrp">${sw('notifMessages', '💬', 'Messages', 'Chats and group messages')}${sw('notifKnocks', '🚪', 'Knocks', 'Friends knocking at your door')}${sw('notifMoney', '💰', 'Money', 'Transfers, payouts and bonuses')}${sw('notifUpdates', '📣', 'Everything else', 'City news, missions, events and game updates')}</div>
      <div class="lab2">QUIET HOURS</div><div class="sgrp"><button class="trow" onclick="V2.reachTap('quietOn')"><span class="ti">🌙</span><span class="tl">Quiet hours<span class="sub">No push notifications at night (Lagos time). Everything still waits in Notices.</span></span><span class="sw2 ${p.quietOn ? 'on' : ''}"><i></i></span></button>
      <div class="trow" style="cursor:default"><span class="tl">From<span class="sub">Quiet hours start</span></span><input type="time" class="v2time2" value="${p.quietFrom || '22:00'}" onchange="V2.reachTime('quietFrom',this.value)"></div>
      <div class="trow" style="cursor:default"><span class="tl">Until<span class="sub">Quiet hours end</span></span><input type="time" class="v2time2" value="${p.quietTo || '07:00'}" onchange="V2.reachTime('quietTo',this.value)"></div></div></div>`)
  }
  V2.reachTap = async function (k) { const p = V2.me.prefs, cur = k === 'quietOn' ? !!p[k] : p[k] !== false, v = !cur, old = p[k]; p[k] = v; V2.paint(); V2.decorate(); try { await api('/prefs', { method: 'POST', body: { [k]: v } }) } catch (e) { p[k] = old; V2.paint(); V2.decorate(); toast(e.message) } };
  V2.reachTime = async function (k, v) { if (!v) return; const p = V2.me.prefs, old = p[k]; p[k] = v; try { await api('/prefs', { method: 'POST', body: { [k]: v } }); V2.decorate() } catch (e) { p[k] = old; toast(e.message); V2.paint() } };
  async function blockedHtml() {
    let list = []; try { list = (await api2('/friends')).blocked || [] } catch (e) {}
    const rows = list.length ? list.map(u => `<div class="trow" style="cursor:default"><span class="tl">${esc(u.username ? '@' + u.username : u.displayName)}<span class="sub">${esc(u.displayName || '')}</span></span><button class="v2mini" onclick="V2.unblock('${u.id}')">Unblock</button></div>`).join('') : '<p class="hint2" style="padding:6px 16px 14px">You have not blocked anyone.</p>';
    return shell('', `<div class="v2hd"><div class="v2tx"><h2>Blocked players</h2><p>They cannot message you or send requests.</p></div>${closeBtn}</div><div class="v2bd"><div class="sgrp">${rows}</div></div>`)
  }
  V2.unblock = async function (id) { try { await NET.api('/api/ac/unblock/' + id, { method: 'POST' }); toast('Unblocked'); V2.paint(); V2.decorate() } catch (e) { toast(e.message) } };
  V2.verifyCode = async function () { try { await api('/email/verify', { method: 'POST', body: { code: $('ec').value } }); V2.me.emailVerified = true; toast('Email verified ✓'); V2.closeSheet(); V2.decorate() } catch (e) { toast(e.message) } };

  /* ============ Settings: privacy rows added to the Settings app ============ */
  const trow = (k, ic, t, sub, on) => `<button class="trow" onclick="V2.pref('${k}')"><span class="ti"><i class="${ic}"></i></span><span class="tl">${t}<span class="sub">${sub}</span></span><span class="sw2 ${on ? 'on' : ''}"><i></i></span></button>`;
  const segrow = (k, ic, t, sub, opts, cur) => `<div class="segrow v2seg-wrap"><div class="segt"><span class="sege">${ic}</span><b>${t}</b></div><p class="segd">${sub}</p><div class="v2seg">${opts.map(o => `<button class="${o[0] === cur ? 'on' : ''}" onclick="V2.setPref('${k}','${o[0]}')">${o[1]}</button>`).join('')}</div></div>`;
  V2.decorate = function () {
    const ab = document.getElementById('ab'); if (!ab || !(typeof PH!=='undefined'?PH:undefined) || PH.view !== 'settings') return; const old = document.getElementById('v2set'); if (old) old.remove();
    const p = (V2.me && V2.me.prefs) || {}, me = V2.me || {}, first = ab.querySelector('.lab2'); if (!V2.me) { api('/me').then(r => { V2.me = r; V2.decorate() }).catch(() => {}); return }
    const d = document.createElement('div'); d.id = 'v2set'; d.className = 'v2set';
    d.innerHTML = `<div class="lab2">YOUR SIM</div><div class="sgrp">${trow('freeWill', 'fa-solid fa-person-walking', 'Free will', 'Your Sim looks after their needs when you\'re away', p.freeWill !== false)}</div><div class="lab2">NOTIFICATIONS</div><div class="sgrp"><button class="trow" onclick="V2.sheet('notices')"><span class="ti"><i class="fa-solid fa-bell"></i></span><span class="tl">Notices<span class="sub">What happened while you were busy, with its buttons</span></span><span class="chv" style="font-size:13px;color:#8a93a6">${((typeof PH!=='undefined'?PH:undefined) && PH.badges && PH.badges.updates) || 'None'} ›</span></button><button class="trow" onclick="V2.pushTap()"><span class="ti"><i class="fa-solid fa-bell"></i></span><span class="tl">Push notifications<span class="sub">Messages, knocks and money reach you when the game is closed</span></span><span class="chv" id="v2pushst" style="font-size:13px;color:#8a93a6">…</span></button><button class="trow" onclick="V2.sheet('reach')"><span class="ti"><i class="fa-solid fa-sliders"></i></span><span class="tl">What reaches you<span class="sub">Messages, knocks, money and the rest, and quiet hours</span></span><span class="chv" style="font-size:13px;color:#8a93a6">${p.quietOn ? 'Quiet ' + (p.quietFrom || '22:00') : ''}</span></button></div><div class="lab2">PRIVACY</div><div class="sgrp">${trow('readReceipts', 'fa-solid fa-check-double', 'Read receipts', "Others see when you've read their messages", p.readReceipts !== false)}${segrow('whoCanMessage', '💬', 'Who can message me', p.whoCanMessage === 'friends' ? 'Only friends: strangers cannot message you' : "Everyone: strangers' chats wait in Messages", [['everyone', 'Everyone'], ['friends', 'Only friends']], p.whoCanMessage || 'everyone')}${segrow('whoCanSendMoney', '💸', 'Who can send me money', p.whoCanSendMoney === 'friends' ? 'Only friends can send you money' : 'Anyone can send you money', [['anyone', 'Anyone'], ['friends', 'Friends only']], p.whoCanSendMoney || 'anyone')}${trow('showRelationships', 'fa-solid fa-heart', 'Show my relationships on my profile', p.showRelationships ? 'On: friends can see who your baes are' : 'Off: nobody else sees who your baes are or how many you have', !!p.showRelationships)}${trow('showBirthday', 'fa-solid fa-cake-candles', 'Celebrate my birthday on P-Gist', p.showBirthday && me.bday && me.bday.m ? 'On: a birthday card for you is posted on ' + me.bday.d + ' ' + MONTHS[me.bday.m - 1] : 'Off: nobody sees your birthday and no card is posted', !!p.showBirthday)}${trow('marketingEmails', 'fa-solid fa-envelope', 'Emails about offers and events', p.marketingEmails ? 'On: we may email you about offers and events' : 'Off: we only email you about your account', !!p.marketingEmails)}</div>${me.hasEmail ? `<div class="lab2">EMAIL</div><div class="sgrp"><div class="trow" style="cursor:default"><span class="tl" style="align-items:flex-start;gap:3px"><b style="font-size:17px">${esc(me.email)}</b><span class="sub">${me.emailVerified ? 'Verified ✓ You can log in with it too. It cannot be changed.' : 'Not verified yet. You can log in with it too. It cannot be changed.'}</span></span>${me.emailVerified ? '' : `<button class="chv" style="background:none;border:0;color:#6aa5ff;font-weight:700;font-size:16px;cursor:pointer" onclick="V2.sheet('email')">Verify</button>`}</div></div>` : ''}<div class="lab2">SAFETY</div><div class="sgrp"><button class="trow" onclick="V2.sheet('blocked')"><span class="ti"><i class="fa-solid fa-ban"></i></span><span class="tl">Blocked players</span><span class="chv" id="v2blk" style="font-size:13px;color:#8a93a6">…</span></button></div><div class="lab2">SECURITY</div><div class="sgrp"><button class="trow" onclick="V2.sheet('pw')"><span class="ti"><i class="fa-solid fa-key"></i></span><span class="tl">Change password<span class="sub">You'll need your current one</span></span><span class="chv" style="color:#6aa5ff;font-weight:700">Change</span></button></div>`;
    if (first) first.parentNode.insertBefore(d, first); else ab.appendChild(d);
    if (window.PUSH) PUSH.status().then(st => { const e = document.getElementById('v2pushst'); if (e) e.innerHTML = st.perm === 'unsupported' ? 'Not supported' : st.on ? '<b style="color:#16a34a">On</b>' : st.perm === 'denied' ? 'Blocked' : '<b style="color:#6aa5ff">Turn on</b>' }).catch(() => {});
    api2('/friends').then(r => { const e = document.getElementById('v2blk'); if (e) e.textContent = (r.blocked || []).length ? String(r.blocked.length) : 'None' }).catch(() => { const e = document.getElementById('v2blk'); if (e) e.textContent = 'None' });
  };
  const api2 = p => NET.api('/api/ac' + p);
  V2.pushTap = async function () { if (!window.PUSH) return; const st = await PUSH.status(); if (st.perm === 'unsupported') return toast('This browser cannot send push notifications.'); if (st.on) return toast('Push notifications are on. Turn them off in your browser site settings.'); if (st.perm === 'denied') return toast('Notifications are blocked in your browser. Allow them in site settings.'); const ok = await PUSH.enable(); if (ok) toast('Notifications on 🔔'); V2.decorate() };
  V2.pref = async function (k) { const p = V2.me.prefs; if (k === 'showBirthday' && !p.showBirthday && !(V2.me.bday && V2.me.bday.m)) return V2.sheet('bday'); const v = !p[k]; p[k] = v; V2.decorate(); try { await api('/prefs', { method: 'POST', body: { [k]: v } }) } catch (e) { p[k] = !v; V2.decorate(); toast(e.message) } };
  V2.setPref = async function (k, v) { const p = V2.me.prefs, old = p[k]; p[k] = v; V2.decorate(); try { await api('/prefs', { method: 'POST', body: { [k]: v } }) } catch (e) { p[k] = old; V2.decorate(); toast(e.message) } };


  /* ============ Free will: when you're away (idle or tab hidden) the Sim eats, rests and freshens up on their own ============ */
  (function () {
    let act = Date.now(), last = {}; ['pointerdown', 'keydown', 'touchstart'].forEach(e => window.addEventListener(e, () => { act = Date.now() }, { passive: true }));
    const NAME = ['ate something 🍛', 'took a nap ⚡', 'had some fun 🎉', 'chatted with a neighbour 💬', 'had a bath 🫧', 'used the toilet 🚽'];
    setInterval(() => {
      try {
        const S0 = SS(); if (!S0 || !S0.needs || !V2.me || !V2.me.prefs || V2.me.prefs.freeWill === false) return;
        if (!(document.hidden || Date.now() - act > 90000)) return;
        const now = Date.now(); let did = [];
        S0.needs.forEach((v, i) => { if (v < .22 && now - (last[i] || 0) > 120000) { last[i] = now; S0.needs[i] = Math.min(1, v + .4); did.push(NAME[i]) } });
        if (did.length) { if (typeof PH !== 'undefined' && PH.local_) PH.local_('🧠', 'Free will: your Sim ' + did.join(', '), 'good'); if (typeof render === 'function') render() }
      } catch (e) {}
    }, 5000);
  })();

  /* ============ Catalogue: search, price filter, pick several ============ */
  const PRICE = [['any', 'Any price', 0, 1e12], ['u20', 'Under ₦20,000', 0, 20000], ['m', '₦20,000 to ₦100,000', 20000, 100000], ['o100', 'Over ₦100,000', 100000, 1e12]];
  function decorateBuy() {
    const sh = $('sheet'), tabs = $('tabs'); if (!sh || !tabs || $('v2cf')) return;
    const f = document.createElement('div'); f.id = 'v2cf'; f.innerHTML = `<select id="v2pr" aria-label="Price">${PRICE.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('')}</select><button id="v2pk" onclick="V2.togPick()">☑ Pick several</button><span class="sp"></span><button class="ib" onclick="V2.togSearch()" aria-label="Search">${I.search}</button><button class="ib" onclick="BUY.hideSheet()" aria-label="Close catalogue">${I.close}</button>`;
    const s = document.createElement('div'); s.id = 'v2cs'; s.innerHTML = '<input id="v2q" placeholder="Search furniture…" autocomplete="off">';
    const pk = document.createElement('div'); pk.id = 'v2pick'; pk.innerHTML = '<button onclick="V2.buyPicked()"></button>';
    tabs.parentNode.insertBefore(f, tabs.nextSibling); tabs.parentNode.insertBefore(s, f.nextSibling); $('items').parentNode.appendChild(pk);
    $('v2pr').onchange = e => { V2.price = e.target.value; V2.apply() }; $('v2q').oninput = e => { V2.q = e.target.value.toLowerCase(); V2.apply() };
    $('items').addEventListener('click', e => { const c = e.target.closest('.cc'); if (!c || !V2.pick) return; e.stopPropagation(); e.preventDefault(); const n = (c.querySelector('.cn') || {}).textContent; if (!n) return; c.classList.toggle('picked'); V2.picked = V2.picked || new Set(); V2.picked.has(n) ? V2.picked.delete(n) : V2.picked.add(n); V2.pickBar() }, true);
    const oldRot = $('v2rot'); if (oldRot) oldRot.remove();     // the extra rotate icon beside the close button was removed
  }
  V2.apply = function () { const pr = PRICE.find(p => p[0] === V2.price) || PRICE[0]; document.querySelectorAll('#items .cc').forEach(c => { const n = ((c.querySelector('.cn') || {}).textContent || ''), D = (typeof FURN!=='undefined'?FURN:undefined) && FURN.ITEMS[n], price = D ? D.price : 0, ok = (!V2.q || n.toLowerCase().includes(V2.q)) && (!D || (price >= pr[2] && price < pr[3])); c.style.display = ok ? '' : 'none'; if (V2.picked) c.classList.toggle('picked', V2.picked.has(n)) }) };
  V2.togSearch = function () { const s = $('v2cs'); s.classList.toggle('on'); if (s.classList.contains('on')) $('v2q').focus(); else { V2.q = ''; $('v2q').value = ''; V2.apply() } };
  V2.togPick = function () { V2.pick = !V2.pick; V2.picked = new Set(); $('v2pk').classList.toggle('on', V2.pick); V2.pickBar(); V2.apply() };
  V2.pickBar = function () { const b = $('v2pick'), n = V2.picked ? V2.picked.size : 0, tot = [...(V2.picked || [])].reduce((a, x) => a + ((FURN.ITEMS[x] || {}).price || 0), 0); b.classList.toggle('on', V2.pick && n > 0); b.firstChild.textContent = n ? `Place ${n} item${n > 1 ? 's' : ''} · ${fmt(tot)}` : '' };
  V2.buyPicked = function () { const list = [...(V2.picked || [])]; if (!list.length) return; V2.queue = list; V2.pick = false; V2.picked = new Set(); $('v2pk').classList.remove('on'); V2.pickBar(); V2.apply(); toast(list.length > 1 ? 'Place each item. The next one opens after you place it.' : 'Place your item'); BUY.startGhost(V2.queue.shift(), 'new') };
  function hookBuy() { if (!(typeof BUY!=='undefined'?BUY:undefined) || BUY._v2) return; BUY._v2 = 1; const c0 = BUY.commit, x0 = BUY.cancel, d0 = BUY.drawSheet;
    BUY.commit = function () { const r = c0.apply(this, arguments); Promise.resolve(r).then(() => { if (V2.queue.length) setTimeout(() => { if (BUY.active && !BUY.g) BUY.startGhost(V2.queue.shift(), 'new') }, 350) }); return r };
    BUY.cancel = function () { V2.queue = []; return x0.apply(this, arguments) };
    BUY.drawSheet = function () { const r = d0.apply(this, arguments); decorateBuy(); V2.apply(); return r } }

  /* ============ boot ============ */
  function hookGlobals() {
    if ((typeof BAN!=='undefined'?BAN:undefined) && !BAN._v2) { BAN._v2 = 1; const s0 = BAN.show.bind(BAN); BAN.show = function (t) { if (/UP NEPA/i.test(t)) V2.lastUp = Date.now(); return s0.apply(BAN, arguments) } }
    if ((typeof CARD!=='undefined'?CARD:undefined) && !CARD._v2) { CARD._v2 = 1; const s0 = CARD.show.bind(CARD); CARD.show = function (c) { try { if (c && c.title && c.tone !== 'warn') V2.mem(c.icon || '⭐', c.title, c.text || '', c.tone === 'gold' ? 12 : 6) } catch (e) {} return s0(c) } }
    if (typeof window.openBank === 'function' && !window.openBank._v2) { const o = window.openBank; window.openBank = function (dep) { if (dep) { V2.sheet('topup'); if ((typeof PHONEUI!=='undefined'?PHONEUI:undefined) && S.page === 'phone') {} return } return o.apply(this, arguments) }; window.openBank._v2 = 1 }
    if ((typeof PH!=='undefined'?PH:undefined) && PH.settings && !PH.settings._v2) { const o = PH.settings; PH.settings = async function () { const r = await o.apply(this, arguments); try { V2.decorate() } catch (e) {} return r }; PH.settings._v2 = 1 }
    if ((typeof PH!=='undefined'?PH:undefined) && PH.deposit && !PH.deposit._v2) { PH.deposit = function () { PH.close && PH.close(); nav('home'); V2.sheet('topup') }; PH.deposit._v2 = 1 }
    if (typeof window.nav === 'function' && !window.nav._v2) { const o = window.nav; window.nav = function () { const r = o.apply(this, arguments); setTimeout(tick, 0); if (window.V2) V2.closeSheet(); return r }; window.nav._v2 = 1 }
    hookBuy();
  }
  function init() {
    build(); hookGlobals(); tick(); document.body.classList.toggle('v2m', mq.matches); mq.addEventListener && mq.addEventListener('change', tick);
    api('/me').then(r => { V2.me = r; tick() }).catch(() => {});
    setInterval(() => { tick(); hookGlobals() }, 1000); checkReturn();
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && SH.key) V2.closeSheet() });
  }
  let tries = 0; (function wait() { if ((typeof S!=='undefined'?S:undefined) && (typeof NET!=='undefined'?NET:undefined) && window.nav && (typeof UI!=='undefined'?UI:undefined) && $('app')) { try { init() } catch (e) { console.error('v2 init', e) } } else if (tries++ < 200) setTimeout(wait, 100) })();
})();
