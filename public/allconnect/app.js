/* ================= AllConnect client =================
   Login: same accounts as GameHub (POST /auth/login, /auth/register, Google). Realtime: Socket.io namespace /ac. */
const NET = {
  sock: null,
  saveT: 0,
  user: null,
  async api(url, opt = {}) {
    const r = await fetch(url, { method: opt.method || 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
    let j = {};
    try { j = await r.json() } catch {}
    if (!r.ok) throw Object.assign(new Error(j.message || 'Something went wrong. Try again.'), { status: r.status });
    return j
  },
  /* ---- instant UI: stale-while-revalidate cache. cb(data, fromCache) fires immediately with cached data (if any),
     then again with fresh data. opt.ttl = skip the network when the cache is younger than this (ms). opt.persist = keep in localStorage so even a cold start is instant. ---- */
  cache: new Map(),
  pkey(url) { return 'acc:' + ((this.user && this.user.id) || '?') + ':' + url },
  async swr(url, cb, opt = {}) {
    let c = this.cache.get(url);
    if (!c && opt.persist) { try { const j = JSON.parse(localStorage.getItem(this.pkey(url)) || 'null'); if (j && j.d) { c = j;
          this.cache.set(url, c) } } catch (e) {} }
    if (c) { cb(c.d, true); if (opt.ttl && Date.now() - c.t < opt.ttl) return c.d }
    try {
      const d = await this.api(url);
      const rec = { d, t: Date.now() };
      this.cache.set(url, rec);
      if (opt.persist) { try { localStorage.setItem(this.pkey(url), JSON.stringify(rec).slice(0, 400000)) } catch (e) {} }
      cb(d, false);
      return d
    } catch (e) { if (c) return c.d; throw e }
  },
  drop(part) { for (const k of [...this.cache.keys()])
      if (k.includes(part)) this.cache.delete(k) },
  prefetch(url) { return this.api(url).then(d => { this.cache.set(url, { d, t: Date.now() }); return d }).catch(() => null) },
  connect() {
    if (this.sock) return;
    this.sock = io('/ac', { withCredentials: true });
    this.sock.on('stats', m => {
      $('vis').textContent = fmtN(m.visits);
      $('onl').textContent = fmtN(m.online);
      S.gems = m.gems;
      gemText()
    });
    this.sock.on('players', drawPlayers);
    ['dm', 'update', 'friends', 'seen', 'cash', 'gist:new', 'gmsg', 'group'].forEach(ev => this.sock.on(ev, p => window.PH && PH.on(ev, p)));
    this.sock.on('gem', m => {
      S.cash = m.cash;
      toast(m.prize ? `💎 Gem found! +₦${m.prize.toLocaleString()}` : '💎 Gem found!');
      render()
    })
  },
  save() {
    if (!this.user) return;
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => this.api('/api/ac/save', { method: 'POST', body: { paint: S.paint, needs: S.needs, min: S.min } }).catch(() => {}), 1500)
  }
};
const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n);

function gemText() { const e = $('gem'); if (e) e.textContent = `${(S.gems||0).toLocaleString()} found · next prize ₦3,000` }

function findGem() { if (NET.sock) NET.sock.emit('gem') }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } [c]));

function drawPlayers(list) {
  let box = $('players');
  if (!box) {
    box = document.createElement('div');
    box.id = 'players';
    $('map').appendChild(box)
  }
  box.innerHTML = list.filter(p => p.name !== (NET.user && NET.user.displayName)).slice(0, 25).map(p => {
    let h = 0;
    for (const c of p.name) h = (h * 31 + c.charCodeAt(0)) % 997;
    return `<span class="pill mp" style="left:${10+h%80}%;top:${14+(h*7)%76}%;padding:3px 10px;font-size:12px;opacity:.9">🟢 ${esc(p.name)}</span>`
  }).join('')
}

function applyAC(ac) {
  Object.assign(S, { cash: ac.cash, paint: ac.paint, needs: ac.needs, min: ac.min });
  S.owned = Object.fromEntries(ac.owned.map(n => [n, 1]));
  S.items = ac.items || [];
  S.wish = ac.wish || [];
  setPaint(S.paint);
  if (window.ROOM3D) ROOM3D.sync();
  if (window.BUY && BUY.active) BUY.draw()
}
let AM = 'login';

function authMode(m) {
  AM = m;
  $('tl').className = m == 'login' ? 'on' : '';
  $('tr').className = m == 'login' ? '' : 'on';
  $('fname').style.display = m == 'login' ? 'none' : 'block';
  $('abtn').textContent = m == 'login' ? 'Sign in' : 'Create account';
  $('fpw').autocomplete = m == 'login' ? 'current-password' : 'new-password';
  $('aerr').textContent = ''
}
async function doAuth() {
  const id = $('fid').value.trim(),
    pw = $('fpw').value,
    name = $('fname').value.trim(),
    b = $('abtn');
  $('aerr').textContent = '';
  if (!id || !pw || (AM == 'register' && !name)) return $('aerr').textContent = AM == 'register' ? 'Enter your name, email/phone and password.' : 'Enter your email/phone and password.';
  b.disabled = true;
  try {
    await NET.api(AM == 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: AM == 'login' ? { identifier: id, password: pw } : { name, identifier: id, password: pw } });
    window.JUST_AUTHED = true;
    await boot();
    window.JUST_AUTHED = false
  }
  catch (e) { $('aerr').textContent = e.message } b.disabled = false
}

function logout() { location.href = '/auth/logout' }
async function boot() {
  if (window.top !== window.self) { window.top.location.href = '/'; return } // GameHub logout redirects here: never nest the platform
  try {
    const j = await NET.api('/api/ac/state');
    NET.user = j.user;
    applyAC(j.ac);
    S.gems = j.stats.gems;
    $('uname').textContent = j.user.displayName;
    $('uname2').textContent = j.user.displayName;
    $('auth').style.display = 'none';
    $('resume').style.display = 'block';
    NET.connect();
    render();
    if (window.PH) PH.init();
    if (window.PUSH) PUSH.init();
    warmUp()
  }
  catch (e) {
    $('auth').style.display = 'block';
    $('resume').style.display = 'none';
    if (e.status && e.status !== 401) $('aerr').textContent = e.message;
    else if (!e.status) $('aerr').textContent = 'Cannot reach the server. Check your connection and try again.';
    else if (window.JUST_AUTHED) $('aerr').textContent = 'Signed in, but your session was not saved. Allow cookies for this site and try again.'
  }
  if (/auth_error/.test(location.search)) {
    $('aerr').textContent = 'Google sign-in is not available right now. Use email or phone.';
    history.replaceState(null, '', '/')
  }
}

function openHub(cb) {
  const f = $('hubf'),
    first = !f.getAttribute('src');
  if (first) f.src = '/gamehub';
  $('hub').style.display = 'flex';
  if (cb) { first ? f.addEventListener('load', () => hubRun(cb), { once: true }) : hubRun(cb) }
}
/* run cb(bridge) once GameHub has finished loading (works with the hub hidden too) */
function hubRun(cb, n) {
  n = n || 0;
  const w = $('hubf').contentWindow;
  let ok = false;
  try { ok = w && w.GHBridge && w.GHBridge.ready() } catch (e) {}
  if (ok) cb(w.GHBridge);
  else if (n < 40) setTimeout(() => hubRun(cb, n + 1), 300)
}

function hubQuiet(cb) {
  const f = $('hubf'),
    first = !f.getAttribute('src');
  if (first) f.src = '/gamehub';
  first ? f.addEventListener('load', () => hubRun(cb), { once: true }) : hubRun(cb)
}

function closeHub() {
  $('hub').style.display = 'none';
  nav('home')
}
const $ = id => document.getElementById(id);
const S = { cash: 2025000, min: 19 * 60 + 53, needs: [.55, .9, .95, .85, .95, .9], paint: '#d9a93a', tab: 'Design', sel: null, owned: { 'Classic Cream': 1 }, clean: false };
const NEED = ['🥧', '⚡', '🎉', '💬', '🫧', '🚽'];
const fmt = n => '₦' + n.toLocaleString('en-NG');
/* Balance shown in the HUD: up to 4 figures stays exact (₦9,999); anything longer is shortened: ₦10K, ₦4.25M, ₦5B, ₦8T... (cut, never rounded up) */
const BAL_UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];

function fmtBal(n) {
  n = Math.floor(Number(n) || 0);
  const sign = n < 0 ? '-' : '',
    a = Math.abs(n);
  if (a < 10000) return sign + '₦' + a.toLocaleString('en-NG');
  let v = a,
    i = 0;
  while (v >= 1000 && i < BAL_UNITS.length - 1) { v /= 1000;
    i++ }
  return sign + '₦' + (Math.floor(v * 100) / 100) + BAL_UNITS[i]
}
const hm = m => {
  m = (m % 1440 + 1440) % 1440;
  let h = Math.floor(m / 60),
    mm = String(m % 60).padStart(2, '0');
  return { h: (h % 12) || 12, mm, ap: h < 12 ? 'AM' : 'PM' }
};

function toast(t) {
  const e = $('toast');
  e.textContent = t;
  e.style.opacity = 1;
  clearTimeout(e.t);
  e.t = setTimeout(() => e.style.opacity = 0, 1600)
}

function render() {
  NET.save();
  const t = hm(S.min);
  $('bal').textContent = fmtBal(S.cash);
  $('bal2').textContent = fmtBal(S.cash);
  $('bal').title = $('bal2').title = fmt(S.cash);
  const q1 = $('q1');
  if (q1 && window.JOBS) JOBS.quest(q1);
  $('needs').innerHTML = S.needs.map((v, i) => `<div class="n"><span>${NEED[i]}</span><div class="bar"><u style="width:${v*100}%;${v<.5?'background:#f5a623':''}"></u></div></div>`).join('');
  const lo = Math.min(...S.needs);
  $('mood').textContent = lo > .7 ? '😄 Very Happy' : lo > .4 ? '🙂 Okay' : '😩 Hungry'
}
const NEEDN = ['You are getting hungry — eat something 🍛', 'Energy is getting low!', 'Your fun is running out 🎉', 'You are feeling lonely 💬', 'You need a bath 🫧', 'Nature is calling 🚽'],
  NEEDI = ['🥧', '⚡', '🎉', '💬', '🫧', '🚽'],
  LOW = {};
setInterval(() => {
  S.min++;
  S.needs = S.needs.map(v => Math.max(0, v - .004));
  S.needs.forEach((v, i) => { if (v < .3 && !LOW[i]) { LOW[i] = 1; if (window.PH) PH.local_(NEEDI[i], NEEDN[i], 'warn') } else if (v > .5) LOW[i] = 0 });
  render()
}, 3000);

function eat(e) {
  e.stopPropagation();
  S.needs[0] = Math.min(1, S.needs[0] + .4);
  toast('Yum! Ate jollof 🍛');
  if (window.PH) PH.local_('🍛', 'You ate something · hunger restored', 'good');
  render()
}

function walk(e) {
  const r = $('room').getBoundingClientRect(),
    k = 400 / r.width;
  if (CAMV.moved()) return;
  let x = (e.clientX - r.left) * k,
    y = (e.clientY - r.top) * k - 60;
  if (CAMV.fl < 0) x = 400 - x;
  x = Math.max(30, Math.min(370, x));
  y = Math.max(130, Math.min(290, y));
  $('me').style.transition = 'transform .6s ease';
  $('me').setAttribute('transform', `translate(${x} ${y})`)
}

/* The six need bars stay hidden until the player taps their profile picture. */
function toggleNeeds(force) {
  S.needsOpen = typeof force === 'boolean' ? force : !S.needsOpen;
  const n = $('needs');
  if (n) n.style.display = S.needsOpen ? 'grid' : 'none';
  const a = $('avbtn');
  if (a) a.setAttribute('aria-expanded', S.needsOpen ? 'true' : 'false')
}

function toggleClean() {
  S.clean = !S.clean;
  nav('home', true)
}
const NAV = [
  ['home', 'Home', '<path d="M4 11l8-7 8 7v9H4z"/>'],
  ['buy', 'Buy', '<rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 9V7a2 2 0 012-2h8a2 2 0 012 2v2M7 17v2M17 17v2"/>'],
  ['map', 'Map', '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>'],
  ['phone', 'Phone', '<rect x="7" y="3" width="10" height="18" rx="2"/>']
];

function nav(w, keep) {
  if (S.page === 'buy' && w !== 'buy' && window.BUY) BUY.leave();
  S.page = w;
  if (!keep) S.clean = false;
  if (w !== 'phone' && window.PH && PH.view) PH.close();
  toggleNeeds(false);
  $('nav').innerHTML = NAV.map(n => `<button class="${n[0]==w?'on':''}" onclick="nav('${n[0]}')"><svg viewBox="0 0 24 24">${n[2]}</svg>${n[1]}</button>`).join('');
  const home = w == 'home';
  $('map').style.display = w == 'map' ? 'block' : 'none';
  $('buy').style.display = w == 'buy' ? 'block' : 'none';
  $('phone').style.display = w == 'phone' ? 'block' : 'none';
  $('room').style.display = (w == 'map') ? 'none' : 'block';
  const cl = S.clean && home;
  $('needsbar').style.display = ((home && !cl) || w == 'map') ? 'flex' : 'none';
  $('nav').style.display = (w == 'buy' || cl) ? 'none' : 'flex';
  $('menubtn').style.display = cl ? 'block' : 'none';
  $('viewctl').style.display = home ? 'flex' : 'none';
  if (window.ROOM3D) ROOM3D.page(w);
  $('hud').style.display = (w == 'buy') ? 'none' : 'flex';
  $('chips').style.display = (home || w == 'map') ? 'flex' : 'none';
  $('homeUI').style.display = (home && !cl) ? 'block' : 'none';
  if (w == 'phone') {
    $('room').style.display = 'block';
    $('hud').style.display = 'flex'
  }
  if (w == 'buy') {
    $('room').style.top = '44px';
    BUY.enter()
  } else $('room').style.top = '';
  if (w == 'map') {
    if (window.ADS) ADS.paintMap();
    let p = 18;
    $('ld').style.display = 'block';
    const i = setInterval(() => {
      p += Math.ceil(Math.random() * 14);
      if (p >= 100) {
        clearInterval(i);
        $('ld').style.display = 'none'
      } else $('ld').textContent = 'Loading Lagos… ' + p + '%'
    }, 500)
  }
}
const PINS = [
  ['📻 Naija Radio', 20, 22],
  ['⚽ Viewing Centre', 26, 29],
  ['🍲 Amala Shitta', 19, 37],
  ['🏠 Home', 47, 34, 0],
  ['💡 CcHub', 74, 27],
  ['🎓 UNILAG', 78, 32],
  ['🚧 ✈️ Airport · Coming soon', 34, 42, 1],
  ['⛵ Boat Cruise', 58, 45],
  ['🏋️ i-Fitness', 44, 59],
  ['⚖️ High Court', 22, 63],
  ['📚 The Library', 70, 61],
  ['🏨 Eko Hotels', 40, 69],
  ['🎭 Freedom Park', 24, 73],
  ['🌐 Quilox', 64, 75],
  ['🕯 Ivory Rooftop', 76, 80],
  ['🎰 Eko Casino', 36, 80]
];
$('pins').innerHTML = PINS.map(p => `<button class="pill mp ${p[3]?'y':''}" style="left:${p[1]}%;top:${p[2]}%" onclick="${p[0].includes('Home')?"nav('home')":"toast('"+p[0].split(' ').slice(1).join(' ')+" opens soon')"}">${p[0]}</button>`).join('');
const CAT = {
  Design: [
    ['WALL PAINT', [
      ['Classic Cream', 3000, '#e8dcb4'],
      ['Lagos Sky', 3000, '#86b6dc'],
      ['Mint Fresh', 3000, '#93d3b5'],
      ['Peach Glow', 3000, '#f2a585'],
      ['Soft Lilac', 3000, '#bba4d9'],
      ['Naija Green', 4000, '#2f9e63'],
      ['Lekki Charcoal', 5000, '#4a4e57'],
      ['Owambe Gold', 6000, '#d9a93a']
    ]]
  ]
};

function buyUI() { if (window.BUY) BUY.enter() }

function setPaint(c) {
  S.paint = c;
  if (window.ROOM3D) ROOM3D.paint(c);
  document.documentElement.style.setProperty('--wall', c)
}
const APPS = [
  ['Camera', '📷', '#2a2d36'],
  ['Contacts', '📞', 'linear-gradient(#34d399,#16a34a)'],
  ['Bank', '🏦', '#151a35'],
  ['GameHub', '🎮', '#151a35'],
  ['Jobs', '💼', 'linear-gradient(#34d399,#10b981)'],
  ['Messages', '💬', 'linear-gradient(#60a5fa,#2563eb)'],
  ['Ads', '📢', 'linear-gradient(135deg,#f472b6,#be185d)', 1],
  ['Police', '🚓', 'linear-gradient(#3b5bdb,#1e2a78)'],
  ['P-Gist', '🗣️', 'linear-gradient(135deg,#ff7a18,#e8337a)'],
  ['Songify', '♫', 'linear-gradient(135deg,#15142d,#7b2cbf 58%,#f15a29)'],
  ['Settings', '⚙️', 'linear-gradient(#9ca3af,#4b5563)']
];

const OPEN = { GameHub: 'openHub()', Contacts: "PH.open('contacts')", Messages: "PH.open('messages')", Settings: "PH.open('settings')", Bank: "PH.open('bank')", Camera: "PH.open('camera')", Police: "PH.open('police')", "P-Gist": "PH.open('gist')", Songify: 'SONGIFY.open()', Jobs: "PH.open('jobs')", Ads: "PH.open('ads')" }; 
$('apps').innerHTML = APPS.map(a => `<button class="app" data-app="${a[0]}" onclick="${OPEN[a[0]]||`toast('${a[0]} opens soon')`}"><b class="bdg"></b>${a[3]?'<span class="nw">NEW</span>':''}<div class="ic" style="background:${a[2]}">${a[1]}</div><em>${a[0]}</em></button>`).join('');
async function start(n) {
  if (window.ROOM3D) ROOM3D.init();
  if (n) { try { applyAC((await NET.api('/api/ac/new', { method: 'POST' })).ac) } catch (e) { return toast(e.message) } } $('splash').style.display = 'none';
  render();
  nav('home');
  if (window.PH) setTimeout(() => PH.openDeepLink && PH.openDeepLink(), 80);
  if (window.JOBS) JOBS.boot()
}
$('sd').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
/* Phone clock = SERVER time (Lagos), not the device clock. Offset is measured against /api/ac/time and re-synced every 5 min. */
const CLOCK = {
  off: 0,
  tz: 'Africa/Lagos',
  async sync() {
    const t0 = Date.now();
    try {
      const r = await fetch('/api/ac/time', { cache: 'no-store' }),
        j = await r.json(),
        t1 = Date.now();
      if (Number.isFinite(j.now)) this.off = j.now + (t1 - t0) / 2 - t1
    } catch (e) {} this.tick()
  },
  now() { return new Date(Date.now() + this.off) },
  tick() {
    const d = this.now(),
      o = { timeZone: this.tz },
      tm = d.toLocaleTimeString('en-US', { ...o, hour: 'numeric', minute: '2-digit', hour12: true }),
      m = /^(\d+:\d+)\s?(AM|PM)$/i.exec(tm) || [tm, tm, ''];
    const a = $('pt'),
      b = $('pb'),
      c = $('pd');
    if (a) a.textContent = m[1] + m[2];
    if (b) b.textContent = m[1];
    if (c) c.textContent = d.toLocaleDateString('en-GB', { ...o, weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '') + ' · Lagos';
    const hc = $('clk'),
      hi = $('hico');
    if (hc) hc.textContent = m[1] + ' ' + m[2]; { const hr = parseInt(d.toLocaleString('en-US', { ...o, hour: 'numeric', hour12: false }), 10) % 24,
        mi = parseInt(d.toLocaleString('en-US', { ...o, minute: 'numeric' }), 10) || 0;
      ENV.apply(hr * 60 + mi) }
  },
  start() {
    this.sync();
    setInterval(() => this.tick(), 1000);
    setInterval(() => this.sync(), 300000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.sync() })
  }
};
CLOCK.start();
render();
nav('home');
boot();

/* isometric checker floor (aligned to the room's walls) */
(function() {
  const L = [4, 262],
    T = [196, -92],
    B = [196, 92],
    N = 6,
    f = document.getElementById('floor');
  if (!f) return;
  let s = '';
  const P = (u, v) => [(L[0] + u * T[0] + v * B[0]).toFixed(1), (L[1] + u * T[1] + v * B[1]).toFixed(1)].join(',');
  for (let i = 0; i < N; i++)
    for (let k = 0; k < N; k++) s += `<polygon points="${P(i/N,k/N)} ${P((i+1)/N,k/N)} ${P((i+1)/N,(k+1)/N)} ${P(i/N,(k+1)/N)}" fill="${(i+k)%2?'#c58a52':'#a8693a'}"/>`;
  f.innerHTML = s
})();
(function() {
  const r = document.getElementById('room');
  if (!r) return;
  let s = r.outerHTML.replace(/ id="room"/, '').replace(/ onclick="walk\(event\)"/, '').replace(/id="(ck|lg)"/g, 'id="$1s"').replace(/url\(#(ck|lg)\)/g, 'url(#$1s)').replace(/ id="(me|wl|wr)"/g, '').replace('class="room"', 'class="room splash-room"');
  const sp = document.getElementById('splash');
  sp.insertAdjacentHTML('afterbegin', s)
})();

/* ================= instant feel: preload everything in the background (unless Saver mode is on) ================= */
const isSaver = () => { try { return !!JSON.parse(localStorage.getItem('ghPrefs') || '{}').lowPower } catch (e) { return false } };
let warmed = false;

function warmUp(force) {
  if (isSaver() || (warmed && !force)) return;
  warmed = true;
  const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 2500 }) : f => setTimeout(f, 600);
  idle(() => {
    const A = u => NET.prefetch(u);
    // 1) the small API calls every app needs, all in parallel
    Promise.all(['/api/ac/chats', '/api/ac/updates', '/api/ac/friends', '/api/ac/bank/summary', '/api/ac/bank/history', '/api/ac/photos', '/api/me',
      '/api/ac/gist/trending', '/api/ac/gist/feed?tab=latest', '/api/ac/gist/feed?tab=trending', '/api/ac/gist/feed?tab=following', '/api/ac/gist/profile/me'
    ].map(A)).then(() => {
      // 2) warm the first screen of images in the feed
      const f = NET.cache.get('/api/ac/gist/feed?tab=latest');
      if (f && f.d) f.d.posts.slice(0, 8).forEach(p => {
        (p.images || []).slice(0, 2).forEach(i => { const im = new Image();
          im.src = i.thumb || i.url }); if (p.author && /^https?:/.test(p.author.avatar || '')) { const im = new Image();
          im.src = p.author.avatar } });
      if (window.PH) { PH.B = PH.B || (NET.cache.get('/api/ac/bank/summary') || {}).d || null; const h = NET.cache.get('/api/ac/bank/history'); if (h && !PH.H.length) PH.H = h.d.txns || [];
        PH.refreshBadges() }
    });
    // 3) load GameHub itself in the hidden frame so it opens instantly
    setTimeout(() => { if (isSaver()) return; const fr = $('hubf'); if (fr && !fr.getAttribute('src')) fr.src = '/gamehub' }, 1800);
  })
}

/* ================= ONE profile: leaderboard / room avatars in GameHub, Settings, Contacts all open the same profile ================= */
function openUserProfile(id, fromHub) {
  if (!NET.user || !id) return;
  let ret = null;
  if (fromHub) { $('hub').style.display = 'none';
    ret = () => { PH.close();
      openHub() } }
  if (S.page !== 'phone') nav('phone');
  document.querySelector('.screen').classList.add('light');
  GIST.openProfile(id, ret)
}
window.addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  const d = e.data || {};
  if (d.type === 'ac:profile' && d.id) openUserProfile(String(d.id), true)
});


/* ================= time of day (server / Lagos time): sun icon 6:30am-6:30pm, sky + house light follow it ================= */
const ENV = {
  dl: -1,
  calc(m) { const c = x => Math.max(0, Math.min(1, x)); return Math.min(c((m - 330) / 120), c((1170 - m) / 120)) },
  mix(a, b, t) { const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); const A = h(a),
      B = h(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('') },
  apply(min) {
    const day = min >= 390 && min < 1110,
      hi = $('hico');
    if (hi) hi.textContent = day ? '☀️' : '🌙';
    const dl = this.calc(min);
    if (Math.abs(dl - this.dl) < .004) return;
    this.dl = dl;
    const T = dl > .5 ? [
      ['#f59e6c', '#fbd9a8'],
      ['#a9d8f5', '#e6f2f8'], (dl - .5) * 2
    ] : [
      ['#0b1433', '#1d2c5e'],
      ['#f59e6c', '#fbd9a8'], dl * 2
    ];
    const a = $('app');
    a.style.setProperty('--sky1', this.mix(T[0][0], T[1][0], T[2]));
    a.style.setProperty('--sky2', this.mix(T[0][1], T[1][1], T[2]));
    a.style.setProperty('--dl', dl.toFixed(3));
    if (window.ROOM3D) ROOM3D.env(dl)
  }
};

/* ================= social links: set in the admin panel; no links = no footer ================= */
const SOC_META = { x: ['X', 'fa-brands fa-x-twitter', '✖', 'X (Twitter)'], tiktok: ['TikTok', 'fa-brands fa-tiktok', '🎵', 'TikTok'], instagram: ['Instagram', 'fa-brands fa-instagram', '📸', 'Instagram'], linkedin: ['LinkedIn', 'fa-brands fa-linkedin-in', '💼', 'LinkedIn'] };
window.SOCIAL = {};
async function loadSocials() {
  try {
    const r = await fetch('/api/ac/public-config', { cache: 'no-store' });
    const d = await r.json();
    window.SOCIAL = d.socials || {};
  } catch (e) { window.SOCIAL = {} }
  const f = $('sfoot'),
    ks = Object.keys(SOC_META).filter(k => window.SOCIAL[k]);
  if (!f) return;
  f.innerHTML = ks.length ? '<span class="official"><i class="fa-solid fa-circle-check"></i> Official</span>' + ks.map(k => `<a href="${esc(window.SOCIAL[k])}" target="_blank" rel="noopener noreferrer" aria-label="${SOC_META[k][0]}"><i class="${SOC_META[k][1]}"></i></a>`).join('') : '';
  f.style.display = ks.length ? 'flex' : 'none'
}
loadSocials();

/* ================= HUD mute: one tap mutes / unmutes ALL game sound (music, effects, announcer) ================= */
const soundOn = () => { const p = GP.get(); return p.music !== false || p.sound !== false || p.voice !== false };

function refreshMute() { const b = $('mute'); if (b) b.textContent = soundOn() ? '🔊' : '🔇' }

function toggleMute() {
  const on = !soundOn();
  ['music', 'sound', 'voice'].forEach(k => GP.set(k, on));
  if (window.BGM) BGM.sync();
  refreshMute();
  toast(on ? '🔊 Sound on' : '🔇 Sound off')
}
window.addEventListener('storage', e => { if (e.key === 'ghPrefs') refreshMute() });
setTimeout(refreshMute, 0);

/* ================= NEPA & city banners: pop up now and then ================= */
const BAN = {
  t: 0,
  show(text, ms = 4800) { const b = $('banner'); if (!b) return;
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(b.h);
    b.h = setTimeout(() => b.classList.remove('show'), ms) },
  light: true,
  cycle() {
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      const idle = $('splash').style.display !== 'none' || $('hub').style.display === 'flex';
      if (!idle) {
        if (this.light) { this.light = false;
          $('app').classList.add('blackout'); if (window.ROOM3D) ROOM3D.dark(true);
          this.show('🕯️ NEPA took light! 🕯️');
          this.t = setTimeout(() => this.cycle(), 20000 + Math.random() * 25000); return }
        this.light = true;
        $('app').classList.remove('blackout');
        if (window.ROOM3D) ROOM3D.dark(false);
        this.show('💡 UP NEPA! Light don come! 💡')
      }
      this.cycle()
    }, this.light ? 45000 + Math.random() * 75000 : 1000)
  }
};
BAN.cycle();

/* ================= zoom + rotate the house ================= */
const CAMV = {
  z: 1,
  x: 0,
  y: 0,
  fl: 1,
  ptr: new Map(),
  pinch: 0,
  mv: false,
  mvT: 0,
  el() { return $('room') },
  apply() { const e = this.el(); if (!e) return;
    e.style.setProperty('--zm', this.z);
    e.style.setProperty('--fl', this.fl);
    e.style.setProperty('--tx', this.x + 'px');
    e.style.setProperty('--ty', this.y + 'px') },
  clamp() { const r = this.el().getBoundingClientRect(),
      w = r.width / this.z,
      h = r.height / this.z,
      mx = (this.z - 1) * w / 2 + 40,
      my = (this.z - 1) * h / 2 + 40;
    this.x = Math.max(-mx, Math.min(mx, this.x));
    this.y = Math.max(-my, Math.min(my, this.y)) },
  zoom(f) { if (window.ROOM3D && ROOM3D.on) return ROOM3D.zoom(1 / f);
    this.z = Math.max(.8, Math.min(3.2, this.z * f));
    this.clamp();
    this.apply() },
  flip() { if (window.ROOM3D && ROOM3D.on) { ROOM3D.flip(); return } this.fl = -this.fl;
    this.apply();
    toast('View rotated 🔄') },
  reset() { if (window.ROOM3D && ROOM3D.on) return ROOM3D.reset();
    this.z = 1;
    this.x = 0;
    this.y = 0;
    this.apply() },
  moved() { return this.mv },
  flag() { this.mv = true;
    clearTimeout(this.mvT);
    this.mvT = setTimeout(() => { this.mv = false }, 260) },
  init() {
    const e = this.el();
    if (!e) return;
    e.addEventListener('pointerdown', ev => { this.ptr.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); try { e.setPointerCapture(ev.pointerId) } catch (x) {} if (this.ptr.size === 2) { const [a, b] = [...this.ptr.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y) } });
    e.addEventListener('pointermove', ev => {
      const p = this.ptr.get(ev.pointerId);
      if (!p) return;
      const dx = ev.clientX - p.x,
        dy = ev.clientY - p.y;
      if (this.ptr.size === 2) {
        p.x = ev.clientX;
        p.y = ev.clientY;
        const [a, b] = [...this.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) { this.z = Math.max(.8, Math.min(3.2, this.z * d / this.pinch));
          this.clamp();
          this.apply() } this.pinch = d;
        this.flag()
      } else if (this.ptr.size === 1 && (Math.abs(dx) + Math.abs(dy) > 5 || this.dragging)) {
        this.dragging = true;
        this.x += dx;
        this.y += dy;
        p.x = ev.clientX;
        p.y = ev.clientY;
        this.clamp();
        this.apply();
        this.flag()
      }
    });
    const up = ev => { this.ptr.delete(ev.pointerId);
      this.pinch = 0; if (!this.ptr.size) this.dragging = false };
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
    e.addEventListener('wheel', ev => { ev.preventDefault();
      this.zoom(ev.deltaY < 0 ? 1.12 : 1 / 1.12) }, { passive: false });
    e.addEventListener('dblclick', () => this.reset())
  }
};
CAMV.init();
