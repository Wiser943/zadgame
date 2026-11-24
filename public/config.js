/* ============================================================================
   Front-end deployment config. Loaded FIRST on every page.

   - Same host (everything on Render):      API_BASE = ''   SOCKET_URL = ''
   - Netlify + Render, "proxy" mode (best): API_BASE = ''   SOCKET_URL = 'https://YOUR-API.onrender.com'
   - Netlify + Render, "direct" mode:       API_BASE = 'https://YOUR-API.onrender.com'  (SOCKET_URL defaults to it)

   On Netlify these values are written automatically by scripts/netlify-build.js
   from the BACKEND_URL / API_MODE environment variables. Don't edit by hand there.
   ========================================================================= */
(function (g) {
  var CFG = /*CFG*/{ API_BASE: '', SOCKET_URL: '' }/*END*/;
  var strip = function (u) { return String(u || '').replace(/\/+$/, ''); };
  var API = strip(CFG.API_BASE), SOCK = strip(CFG.SOCKET_URL) || API;
  g.API_BASE = API; g.SOCKET_URL = SOCK;
  g.apiUrl = function (p) { return typeof p === 'string' && p.charAt(0) === '/' && p.charAt(1) !== '/' ? API + p : p; };

  /* Paths that belong to the backend (everything else stays on the static host). */
  var BACKEND = /^\/(api|auth|admin-api|lagosrun\/api|health|ready|assets)(\/|\?|$)/;
  var isBackend = function (p) { return BACKEND.test(p); };

  /* ---- Service worker: only needs the base for its inline-reply fetch ---- */
  if (typeof window === 'undefined') return;

  /* ---- fetch(): send API calls to the backend, with cookies ---- */
  if (API && g.fetch) {
    var nativeFetch = g.fetch.bind(g);
    g.fetch = function (input, init) {
      try {
        if (typeof input === 'string' && isBackend(input)) {
          init = Object.assign({}, init); if (!init.credentials || init.credentials === 'same-origin') init.credentials = 'include';
          input = API + input;
        } else if (input && typeof input === 'object' && input.url && input.url.indexOf(location.origin) === 0 && isBackend(input.url.slice(location.origin.length))) {
          input = new Request(API + input.url.slice(location.origin.length), input); // keeps method/headers/body
          init = Object.assign({}, init, { credentials: 'include' });
        }
      } catch (e) { /* fall through to the untouched call */ }
      return nativeFetch(input, init);
    };
  }

  /* ---- Links like <a href="/auth/google"> must leave the static host ---- */
  if (API) document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href^="/auth/"]');
    if (a) { e.preventDefault(); location.href = API + a.getAttribute('href'); }
  }, true);

  /* ---- Socket.io: load the client from the backend and point io() at it ---- */
  var tokenCache = null;
  function getToken() {                       // short-lived signed token, fetched over the normal (proxied/credentialed) API
    if (tokenCache && tokenCache.exp > Date.now() + 5000) return Promise.resolve(tokenCache.t);
    return fetch('/api/socket-token', { cache: 'no-store', credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { if (j.token) tokenCache = { t: j.token, exp: Date.now() + 100000 }; return j.token || ''; })
      .catch(function () { return ''; });
  }
  function wrap(real) {
    if (!SOCK) return real;                   // same host: nothing to change
    var io = function (a, b) {
      var opts = (typeof a === 'string' ? b : a) || {}, path = typeof a === 'string' ? a : '';
      var url = path.charAt(0) === '/' || path === '' ? SOCK + path : path;
      opts = Object.assign({ withCredentials: true }, opts);
      var userAuth = opts.auth;
      opts.auth = function (cb) {
        getToken().then(function (t) {
          if (typeof userAuth === 'function') return userAuth(function (d) { cb(Object.assign({ token: t }, d)); });
          cb(Object.assign({ token: t }, userAuth || {}));
        });
      };
      return real(url, opts);
    };
    for (var k in real) { try { io[k] = real[k]; } catch (e) {} }
    return io;
  }
  var _io; // socket.io's UMD bundle assigns window.io; intercept that assignment
  Object.defineProperty(g, 'io', { configurable: true, get: function () { return _io; }, set: function (v) { _io = (v && !v.__wrapped) ? wrap(v) : v; if (_io) _io.__wrapped = true; } });
  document.write('<script src="' + (SOCK || '') + '/socket.io/socket.io.js"><\/script>');
})(typeof self !== 'undefined' ? self : this);
