/* Desktop HUD (see desktop.css). Builds a second, desktop-style set of controls and keeps it in step with the game state.
   Nothing in the old phone-style HUD is removed: on a desktop-sized window the CSS just hides it, so every existing
   function (nav, openBank, PHONEUI, GOALS ...) keeps working and this file only calls into them. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const MQ = window.matchMedia('(min-width:900px) and (min-height:560px)');
  const ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9H4z"/></svg>',
    door: '<svg viewBox="0 0 24 24"><path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h20M13 4 6 6v14h7zM10 12h.01"/></svg>',
    shop: '<svg viewBox="0 0 24 24"><path d="M5 11V8a2 2 0 012-2h10a2 2 0 012 2v3"/><path d="M3 13a2 2 0 014 0v2h10v-2a2 2 0 014 0v5H3z"/><path d="M5 18v2M19 18v2"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    kb: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>'
  };

  const DK = window.DK = {
    on: false, built: false, q: '', sel: 0,
    build() {
      if (this.built) return; const app = $('app'); if (!app) return; this.built = true;
      const d = document.createElement('div'); d.id = 'dk';
      d.innerHTML =
        '<div id="dkTop" class="dkp">' +
        '<button class="dkb" id="dkHome" aria-label="Home" title="Home">' + ICON.home.replace('<svg', '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"') + '</button>' +
        '<div class="dkclk"><i>☀</i><span id="dkClk">--</span></div>' +
        '<span class="dkmood" id="dkMood"></span>' +
        '<button id="dkWhere" aria-label="Where to?">' + ICON.pin + '<span>Where to?</span></button>' +
        '<span class="dkon" id="dkOn"></span>' +
        '<button id="dkWallet" aria-label="Open AllConnect Pay"><span id="dkBal">₦0</span><i id="dkPlus" role="button" aria-label="Deposit">+</i></button>' +
        '</div>' +
        '<div id="dkSearch" class="dkp" role="dialog" aria-label="Where to?"><input id="dkQ" placeholder="Search a place in Lagos…" autocomplete="off"><div class="dklst" id="dkList"></div></div>' +
        '<div id="dkMe"><div class="dkm dkp"><span id="dkMoodIc">😄</span><span id="dkMood2">Very Happy</span></div>' +
        '<div class="dkr"><button class="dkav dkp" id="dkAv" aria-label="Your profile"></button><div class="dkneeds dkp" id="dkNeeds"></div></div></div>' +
        '<div id="dkDock"><div id="dkNav" class="dkp">' +
        '<button data-p="home">' + ICON.home + '<span>Home</span></button>' +
        '<button data-p="buy">' + ICON.shop + '<span>Shop</span></button>' +
        '<button data-p="map">' + ICON.map + '<span>Map</span></button></div>' +
        '<button id="dkPhone" aria-label="Phone">' + ICON.phone + '<i class="dknw"></i></button></div>' +
        '<div id="dkRail">' +
        '<button class="dkr dkp" id="dkParty" title="House parties" aria-label="House parties">🏠</button>' +
        '<button class="dkr dkp" id="dkYard" title="Yard / back inside" aria-label="Go to the yard or back inside">🌳</button>' +
        '<button class="dkr dkp" id="dkFloor" title="Go upstairs / downstairs" aria-label="Go upstairs or downstairs" hidden>⬆</button>' +
        '<button class="dkr dkp" id="dkEye" title="View: click for first person · press and hold to walk around (W A S D)" aria-label="Change view"></button>' +
        '<button class="dkr dkp" id="dkMusic" title="Game song on / off" aria-label="Game song on or off"></button>' +
        '<button class="dkr dkp" id="dkMic" title="Say something" aria-label="Voice" hidden>🎙️</button>' +
        '</div>' +
        '<div id="dkAct">' +
        '<button class="dka dkp" id="dkRadio">🎧 Radio</button>' +
        '<button class="dka dkp" id="dkOut">🚪 Go outside</button>' +
        '<div class="dkwork"><button id="dkWork">💼 Go to work</button><button id="dkCar" title="Garage and fuel">🚗 <span id="dkFuel">Garage</span> ⌃</button></div>' +
        '</div>';
      app.appendChild(d);
      $('dkHome').onclick = () => this.go('home');
      $('dkWallet').onclick = () => { if (window.openBank) openBank(); };
      $('dkPlus').onclick = e => { e.stopPropagation(); if (window.openBank) openBank(true); };
      $('dkNav').onclick = e => { const b = e.target.closest('button[data-p]'); if (!b) return; if (b.dataset.p === 'home' && b.dataset.out === 'true') this.outside(); else this.go(b.dataset.p); };
      $('dkPhone').onclick = () => { if (window.PHONEUI) PHONEUI.open(); };
      $('dkAv').onclick = () => { if (typeof nav === 'function') { nav('phone'); try { PH.open('style'); } catch (e) { } } };
      $('dkRadio').onclick = () => { try { nav('phone'); SONGIFY.open(); } catch (e) { if (typeof toast === 'function') toast('Radio is not available right now.'); } };
      $('dkOut').onclick = () => this.outside();
      // the same controls the phone has: house parties, view switcher (tap = first person, hold = walk mode), stairs, game song, voice
      $('dkParty').onclick = () => { try { PARTY.open(); } catch (e) { if (typeof toast === 'function') toast('House parties are not available right now.'); } };
      const eye = $('dkEye'); eye.onpointerdown = e => { if (window.V2) V2.eyeDown(e); }; eye.onpointerup = e => { if (window.V2) V2.eyeUp(e); this.railSync(); }; eye.onpointercancel = () => { if (window.V2) V2.eyeCancel(); }; eye.oncontextmenu = () => false;
      $('dkFloor').onclick = () => { if (window.V2) V2.floor(); this.railSync(); };
      $('dkYard').onclick = () => { if (window.V2) V2.yard(); this.railSync(); };
      $('dkMusic').onclick = () => { if (window.V2) V2.music(); this.railSync(); };
      $('dkMic').onclick = () => { if (window.V2) V2.mic(); };
      this.railSync();
      $('dkWork').onclick = () => this.work();
      $('dkCar').onclick = () => { try { nav('phone'); TR.open('garage'); } catch (e) { } };
      $('dkWhere').onclick = () => this.search(!$('dkSearch').classList.contains('open'));
      $('dkQ').oninput = e => { this.q = e.target.value; this.sel = 0; this.list(); };
      $('dkQ').onkeydown = e => this.searchKey(e);
      document.addEventListener('pointerdown', e => { const s = $('dkSearch'); if (s && s.classList.contains('open') && !e.target.closest('#dkSearch,#dkWhere')) this.search(false); });
      const av = $('avbtn'); if (av) $('dkAv').innerHTML = av.innerHTML;
    },
    apply() {
      this.on = MQ.matches; if (this.on) this.build();
      document.body.classList.toggle('dk', this.on); this.paint();
    },
    /* which of the big screens is showing, so the nav pill + CSS follow it */
    mode() {
      if (window.WORLD && WORLD.on) return S.page === 'phone' ? 'phone' : 'world';
      return (typeof S !== 'undefined' && S.page) || 'home';
    },
    paint() {
      if (!this.on || typeof S === 'undefined') return;
      const m = this.mode(), app = $('app');
      ['inbuy', 'inworld', 'inphone'].forEach(c => app.classList.remove(c));
      if (m === 'buy') app.classList.add('inbuy'); if (m === 'world') app.classList.add('inworld'); if (S.page === 'phone') app.classList.add('inphone');
      const t = typeof hm === 'function' ? hm(S.min) : { h: 12, mm: '00', ap: 'PM' };
      let day = ''; try { day = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }) + ' · '; } catch (e) { }
      $('dkClk').textContent = day + t.h + ':' + t.mm + ' ' + t.ap;
      const hr = Math.floor(((S.min % 1440) + 1440) % 1440 / 60), ic = $('dkClk').previousSibling; if (ic) ic.textContent = hr >= 6 && hr < 18 ? '☀' : '🌙';
      $('dkBal').textContent = typeof fmtBal === 'function' ? fmtBal(S.cash) : S.cash;
      $('dkBal').title = typeof fmt === 'function' ? fmt(S.cash) : '';
      const lo = Math.min.apply(null, S.needs), mood = lo > .65 ? ['😄', 'Very Happy'] : lo > .4 ? ['🙂', 'Happy'] : lo > .2 ? ['😐', 'Okay'] : ['😩', 'Struggling'];
      $('dkMood').textContent = mood[0] + ' ' + mood[1]; $('dkMoodIc').textContent = mood[0]; $('dkMood2').textContent = mood[1];
      const N = typeof NEED !== 'undefined' ? NEED : [];
      $('dkNeeds').innerHTML = S.needs.map((v, i) => '<div class="dknd ' + (v < .15 ? 'crit' : v < .4 ? 'lo' : '') + '" title="' + Math.round(v * 100) + '%"><span>' + (N[i] || '') + '</span><b><u style="width:' + Math.round(v * 100) + '%"></u></b></div>').join('');
      const on = $('dkOn'), vis = $('vis'), onl = $('onl'); if (on && vis && onl) on.innerHTML = '👁 <b>' + vis.textContent + '</b> <u>● ' + onl.textContent + ' active today</u>';
      [].forEach.call($('dkNav').querySelectorAll('button'), b => b.classList.toggle('on', b.dataset.p === (m === 'phone' ? this.lastPage : m)));
      if (m !== 'phone') this.lastPage = m === 'world' ? '' : m;
      // the first nav button: "Home" in the street and everywhere else, "Outside" while you are at home
      { const hb = $('dkNav').querySelector('[data-p="home"]'), iw = m === 'world' || !!(window.WORLD && WORLD.on), outNow = m === 'home' && !iw; if (hb && hb.dataset.out !== String(outNow)) { hb.dataset.out = String(outNow); hb.innerHTML = (outNow ? ICON.door : ICON.home) + '<span>' + (outNow ? 'Outside' : 'Home') + '</span>'; } }
      // Go outside / Go inside
      const out = $('dkOut'), inWorld = m === 'world' || (window.WORLD && WORLD.on);
      out.hidden = !(m === 'map' || inWorld) || !!(window.WORLD && WORLD.on && WORLD.me.mode === 'car');
      out.textContent = inWorld ? (window.WORLD && WORLD.nearHome && WORLD.nearHome() ? '🚪 Go inside' : '🏠 Go home') : m === 'map' ? '🚶 Explore in 3D' : '🚪 Go outside';
      $('dkRadio').hidden = m === 'map' || m === 'buy';
      $('dkWork').parentNode.hidden = m === 'buy';
      const f = $('dkFuel'); if (f) f.textContent = window.TR && TR.D && TR.D.fuelPrice ? '₦' + Math.round(TR.D.fuelPrice) : 'Garage';
      this.railSync(); const bb = $('dkNav') && $('dkNav').querySelector('[data-p="buy"] span'); if (bb) bb.textContent = 'Buy mode';
      const ph = $('dkPhone'), nw0 = document.querySelector('#menubtn .nw, #menubtn .dot, #menubtn .badge'); if (ph) ph.classList.toggle('has', !!(nw0 && nw0.offsetParent !== null));
    },
    /* keep the rail in step with the game: icons, stairs button, voice button, walk mode */
    railSync() {
      if (!$('dkRail')) return;
      const walking = !!(window.V2 && V2.walking), eye = $('dkEye'), fl = $('dkFloor'), mu = $('dkMusic'), mic = $('dkMic'), pa = $('dkParty');
      const home = typeof S !== 'undefined' && S.page === 'home' && !(window.WORLD && WORLD.on), visiting = !!(window.VISIT && VISIT.on);
      $('dkRail').hidden = !home;
      if (eye) { const html = walking ? '✕' : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'; if (eye.dataset.w !== String(walking)) { eye.dataset.w = String(walking); eye.innerHTML = html; } eye.classList.toggle('walk', walking); }
      const P = typeof S !== 'undefined' && S.activeProperty;
      const yd = $('dkYard'); if (yd) { yd.hidden = !P || visiting || walking; yd.textContent = (S.floor || 0) === 2 ? '🏠' : '🌳'; }
      if (fl) { fl.hidden = !(P && P.upstairs) || (S.floor || 0) === 2 || visiting || walking; fl.textContent = (S.floor || 0) === 0 ? '⬆' : '⬇'; fl.title = (S.floor || 0) === 0 ? 'Go upstairs' : 'Go downstairs'; }
      if (mu) mu.innerHTML = !(window.GP && GP.get().music === false) ? '<i class="fa-solid fa-music"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
      if (mic) mic.hidden = !((window.VISIT && VISIT.on) || (window.PARTY && PARTY.isLive && PARTY.isLive()));
      if (pa) pa.hidden = visiting || walking;
      document.body.classList.toggle('dkvisit', visiting);
    },
    go(p) {
      if (typeof nav !== 'function') return;
      this.search(false);
      if (window.WORLD && WORLD.on) { WORLD.exit(true); }
      if (p === 'home') { nav('home'); } else nav(p);
      this.paint();
    },
    outside() {
      if (window.WORLD && WORLD.on) { WORLD.goHome(); return; }
      if (window.WORLD && WORLD.enter) { WORLD.enter({ from: S.page === 'map' ? 'map' : 'home' }); return; }
      if (window.DOOR) DOOR.press();
    },
    work() {
      if (window.WORLD && WORLD.on && WORLD.work) return WORLD.work();
      if (window.JOBS && JOBS.data && JOBS.data.mine) return JOBS.work();
      try { nav('phone'); JOBS.open(); } catch (e) { }
    },
    /* ---- "Where to?" ---- */
    search(open) {
      const s = $('dkSearch'); if (!s) return; s.classList.toggle('open', !!open);
      if (open) { this.q = ''; $('dkQ').value = ''; this.sel = 0; this.list(); setTimeout(() => $('dkQ').focus(), 30); }
    },
    places() {
      const pins = (window.MAP3D && MAP3D.pins) || [];
      return pins.filter(p => p && p[0] && Number.isFinite(p[2]) && p[5] !== 'district').map(p => ({ name: String(p[0]).replace(' · Coming soon', ''), em: p[1] || '📍', x: p[2], y: p[3], soon: /Coming soon/.test(p[0]), home: p[5] === 'home' }));
    },
    filtered() { const q = this.q.trim().toLowerCase(), me = window.MAP3D && MAP3D.me; return this.places().filter(p => !q || p.name.toLowerCase().includes(q)).map(p => ({ ...p, d: me ? Math.hypot(p.x - me.x, p.y - me.y) : 0 })).sort((a, b) => a.d - b.d).slice(0, 40); },
    list() {
      const L = $('dkList'), arr = this.filtered(); this.cur = arr;
      L.innerHTML = arr.length ? arr.map((p, i) => '<button data-i="' + i + '" class="' + (i === this.sel ? 'hi' : '') + '"><em>' + p.em + '</em>' + (window.UI ? UI.esc(p.name) : p.name) + (p.soon ? ' <small>soon</small>' : '<small>' + (p.d ? Math.round(p.d) + ' m' : '') + '</small>') + '</button>').join('') : '<div class="dknone">No place matches “' + (window.UI ? UI.esc(this.q) : this.q) + '”.</div>';
      [].forEach.call(L.querySelectorAll('button'), b => b.onclick = () => this.pick(+b.dataset.i));
    },
    searchKey(e) {
      if (e.key === 'Escape') return this.search(false);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = (this.cur || []).length; if (n) { this.sel = (this.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; this.list(); } }
      if (e.key === 'Enter') { e.preventDefault(); this.pick(this.sel); }
    },
    pick(i) {
      const p = (this.cur || [])[i]; if (!p) return; this.search(false);
      if (p.soon) { if (typeof toast === 'function') toast('🚧 ' + p.name + ' is coming soon'); return; }
      if (window.WORLD && WORLD.on) { WORLD.setGoal(p); return; }
      if (S.page !== 'map') nav('map');
      setTimeout(() => { try { MAP3D.focus(p.x, p.y, 240); MAP3D.walkTo(p.x, p.y); } catch (e) { } }, 120);
    }
  };

  // keep the HUD in step with the game: render() runs on every state change, nav() on every page change
  const wrap = (name) => { const f0 = window[name]; if (typeof f0 !== 'function') return; window[name] = function () { const r = f0.apply(this, arguments); try { DK.paint(); } catch (e) { } return r; }; };
  /* Keyboard walking: while walk mode (or the first-person view) is on, W A S D / arrow keys drive the same joystick the phone uses.
     Runs in the capture phase so letters like S and H do not trigger their other shortcuts while you are walking. */
  const held = new Set(), KEYS = { w: 'u', arrowup: 'u', s: 'd', arrowdown: 'd', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
  const joyFromKeys = () => { const x = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0), y = (held.has('u') ? 1 : 0) - (held.has('d') ? 1 : 0), L = Math.hypot(x, y) || 1; try { ROOM3D.setJoy(x / L, y / L); } catch (e) { } };
  const walkingNow = () => !!((window.V2 && V2.walking) || (window.ROOM3D && ROOM3D.fpv)) && typeof S !== 'undefined' && S.page === 'home';
  window.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYS[String(e.key).toLowerCase()]; if (!k || !walkingNow()) return;
    e.preventDefault(); e.stopImmediatePropagation(); held.add(k); joyFromKeys();
  }, true);
  window.addEventListener('keyup', e => { const k = KEYS[String(e.key).toLowerCase()]; if (!k) return; if (held.delete(k)) joyFromKeys(); }, true);
  window.addEventListener('blur', () => { held.clear(); try { ROOM3D.setJoy(0, 0); } catch (e) { } });
  const boot = () => { wrap('render'); wrap('nav'); DK.apply(); setInterval(() => { if (DK.on) DK.paint(); }, 1500); setInterval(() => { if (DK.on) DK.railSync(); }, 600); };
  if (MQ.addEventListener) MQ.addEventListener('change', () => DK.apply()); else if (MQ.addListener) MQ.addListener(() => DK.apply());
  window.addEventListener('resize', () => { if (MQ.matches !== DK.on) DK.apply(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);
})();
