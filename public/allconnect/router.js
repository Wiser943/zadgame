/* AllConnect router: makes the game behave like a single-page app.
   - Remembers where you are (Home / Map / Phone + the phone app that is open).
   - The browser Back / Forward buttons and the phone's Back gesture move between those places instead of leaving the game.
   - Closing the phone (or GameHub / Lagos Run) returns to the tab you came from (e.g. Map), not always Home.
   - After a refresh, "Continue" drops you straight back where you were (kept for 2 hours).
   It only wraps nav(), PH.open() and PH.close(), so no other file needs to know about it. */
const ROUTER = (() => {
  const KEY = 'ac:route', TTL = 2 * 3600e3, TABS = ['home', 'map', 'phone'];
  const APPS = ['contacts', 'messages', 'settings', 'bank', 'camera', 'police', 'gist', 'jobs', 'invest', 'venues', 'style', 'ads'];
  let cur = { page: 'home', app: '' }, base = 'home', applying = false, live = false, started = false;
  const snap = () => ({ ac: 1, page: cur.page, app: cur.app, base });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...snap(), t: Date.now() })) } catch (e) {} };
  const same = (a, b) => a && b && a.page === b.page && (a.app || '') === (b.app || '');
  function commit() {
    if (!live || applying) return;
    const st = snap(), h = history.state;
    if (!started) { history.replaceState(st, ''); started = true }
    else if (!same(h, st)) history.pushState(st, '');
    else history.replaceState(st, '');
    save();
  }
  function onPage(p) {
    if (!TABS.includes(p) && p !== 'buy') return;
    cur.page = p; if (p !== 'phone') cur.app = '';
    if (p === 'home' || p === 'map') base = p;
    commit();
  }
  function onApp(name) {
    const k = String(name || '').toLowerCase();
    cur.app = APPS.includes(k) ? k : ''; if (cur.app) cur.page = 'phone';
    commit();
  }
  /* go to a saved place without writing new history entries */
  function go(s) {
    if (!s || !live) return;
    applying = true;
    try {
      if (s.base) base = s.base;
      const want = TABS.includes(s.page) ? s.page : 'home';
      if (want === 'phone') {
        if (S.page !== 'phone') nav('phone');
        if (s.app && window.PH && PH.open) { try { PH.open(s.app) } catch (e) {} cur = { page: 'phone', app: s.app } }
        else { if (window.PH && PH.view) PH.close(); cur = { page: 'phone', app: '' } }
      } else {
        if (S.page !== want) nav(want);
        cur = { page: want, app: '' };
      }
    } finally { applying = false }
    save();
  }
  window.addEventListener('popstate', e => { if (live && e.state && e.state.ac) go(e.state) });
  return {
    /* called once, when the player taps Continue / New life */
    start(restore) {
      live = true; started = false;
      let s = null;
      if (restore) { try { s = JSON.parse(localStorage.getItem(KEY) || 'null') } catch (e) {} }
      if (s && Date.now() - (s.t || 0) < TTL && (s.page === 'map' || (s.page === 'phone' && s.app))) {
        history.replaceState({ ac: 1, page: 'home', app: '', base: 'home' }, ''); started = true;
        applying = true; cur = { page: 'home', app: '' }; applying = false;
        setTimeout(() => { go(s); history.pushState(snap(), '') }, 60);
      } else commit();
    },
    /* where the phone / overlays should return to */
    back() { return base === 'map' ? 'map' : 'home' },
    pause() { live = false },
    onPage, onApp, go,
    get state() { return { ...cur, base } }
  };
})();
window.ROUTER = ROUTER;

(function () {
  const _nav = window.nav;
  window.nav = function (w, keep) {
    const was = S.page, r = _nav.apply(this, arguments);
    if (S.page !== was || w === 'home') ROUTER.onPage(S.page);
    return r;
  };
  if (window.PH) {
    const _open = PH.open, _close = PH.close;
    PH.open = function (name) { const r = _open.apply(this, arguments); ROUTER.onApp(name); return r };
    PH.close = function () { const r = _close.apply(this, arguments); ROUTER.onApp(''); return r };
  }
  /* closing the phone, GameHub or Lagos Run returns to the tab you were on */
  if (window.PHONEUI) PHONEUI.close = function () {
    if (this.busy || S.page !== 'phone') return; this.busy = true;
    const host = document.getElementById('phone'); host && host.classList.add('powering-off');
    setTimeout(() => { host && host.classList.remove('powering-off', 'powering-on'); this.busy = false; nav(ROUTER.back()) }, 280);
  };
  window.closeHub = function () { document.getElementById('hub').style.display = 'none'; nav(ROUTER.back()) };
  const _clr = window.closeLagosRun;
  if (_clr) window.closeLagosRun = function () {
    const f = document.getElementById('lrf'); document.getElementById('lagosrun').style.display = 'none'; f.removeAttribute('src'); f.src = 'about:blank';
    try { if (document.fullscreenElement) document.exitFullscreen() } catch (e) {}
    try { if (window.BGM) BGM.sync() } catch (e) {}
    nav(ROUTER.back());
  };
  /* start() is where the splash hands over to the game */
  const _start = window.start;
  if (_start) window.start = async function (n) {
    ROUTER.pause();
    const r = await _start.apply(this, arguments);
    const deep = /[?&]open=/.test(location.search);
    ROUTER.start(!n && !deep);
    return r;
  };
})();
