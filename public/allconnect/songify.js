/* Songify: music search + player for the AllConnect phone.
   The audio element lives on SONGIFY itself (not inside the Songify screen), so music keeps playing when the
   player leaves the app, closes the phone or goes back to the home scene. A mini player on the home/map scenes
   (#miniplayer) controls it from there. */
const SONGIFY = {
  view: 'songify', tab: 'home', q: '', results: [], defaults: null, queue: [], current: null, audio: null,
  busy: false, loading: false, searched: false, resLabel: 'TRENDING NOW', status: '', statusErr: false,
  recent: [], favs: [], shuffle: false, repeat: 'off', listName: 'results',
  key(n) { return `allconnect:songify:${n}:${NET.user?.id || 'guest'}`; },
  load(n) { try { return JSON.parse(localStorage.getItem(this.key(n)) || '[]').slice(0, n === 'recent' ? 12 : 200); } catch { return []; } },
  save(n, v) { try { localStorage.setItem(this.key(n), JSON.stringify(v)); } catch {} },
  lst(name) { return name === 'favs' ? this.favs : name === 'recent' ? this.recent : this.results; },
  remember(song) { this.recent = [song, ...this.recent.filter((s) => s.streamUrl !== song.streamUrl)].slice(0, 12); this.save('recent', this.recent); },
  isFav(song) { return !!song && this.favs.some((s) => s.streamUrl === song.streamUrl); },
  toggleFav(song) {
    if (!song) return;
    this.favs = this.isFav(song) ? this.favs.filter((s) => s.streamUrl !== song.streamUrl) : [song, ...this.favs];
    this.save('favs', this.favs);
    this.paint(); this.paintResults();
  },
  favAt(name, i) { this.toggleFav(this.lst(name)[i]); },

  /* ----- audio (created once, survives leaving the app) ----- */
  init() {
    if (this.audio) return;
    this.audio = new Audio(); this.audio.preload = 'metadata';
    this.audio.addEventListener('timeupdate', () => this.paintProgress());
    this.audio.addEventListener('loadedmetadata', () => this.paintProgress());
    this.audio.addEventListener('play', () => this.repaint());
    this.audio.addEventListener('pause', () => this.repaint());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('error', () => { if (!this.current) return; this.setStatus('This track could not be streamed. Try another result.', true); this.busy = false; this.repaint(); });
  },
  repaint() { this.paint(); this.paintMini(); this.paintIsland(); },
  idx() { return this.queue.findIndex((s) => s.streamUrl === this.current?.streamUrl); },
  /* play a song from one of the lists; the queue is that list */
  playAt(name, i) { const song = this.lst(name)[i]; if (!song) return; this.listName = name; this.queue = this.lst(name).slice(); this.start(song); },
  start(song) {
    this.init(); this.current = song; this.remember(song);
    this.audio.src = song.streamUrl;
    this.audio.play().catch(() => this.setStatus('Tap play again to start audio on this device.', true));
    this.repaint(); this.paintResults();
  },
  stop() { if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } this.current = null; this.queue = []; this.repaint(); this.paintResults(); },
  toggle() { if (!this.current) return; this.audio.paused ? this.audio.play().catch(() => {}) : this.audio.pause(); },
  next() {
    const q = this.queue; if (!q.length) return; let i = this.idx();
    if (this.shuffle && q.length > 1) { let n; do { n = Math.floor(Math.random() * q.length); } while (n === i); i = n; } else i = (i + 1) % q.length;
    this.start(q[i]);
  },
  prev() {
    const q = this.queue; if (!q.length) return;
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    const i = this.idx(); this.start(q[(i - 1 + q.length) % q.length]);
  },
  onEnded() {
    if (this.repeat === 'one') { this.audio.currentTime = 0; this.audio.play().catch(() => {}); return; }
    if (!this.shuffle && this.repeat === 'off' && this.idx() >= this.queue.length - 1) { this.repaint(); return; }
    this.next();
  },
  toggleShuffle() { this.shuffle = !this.shuffle; this.paint(); },
  cycleRepeat() { this.repeat = { off: 'all', all: 'one', one: 'off' }[this.repeat]; this.paint(); },
  seek(value) { if (this.audio?.duration) this.audio.currentTime = (Number(value) / 100) * this.audio.duration; },
  format(s) { if (!Number.isFinite(s)) return '0:00'; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; },

  /* ----- screen ----- */
  open() {
    this.init(); this.favs = this.load('favs'); this.recent = this.load('recent');
    document.querySelector('.screen')?.classList.add('light');
    PH.view = this.view;
    PH.shell('Songify', 'SONGIFY.close()', '<div class="sg-wrap"><div class="sg-body" id="sg-body"></div><nav class="sg-nav" id="sg-nav"></nav></div>');
    this.draw();
  },
  close() { PH.close(); },   // music keeps playing
  setTab(t) { this.tab = t; this.draw(); },
  navHtml() {
    return [['home', 'fa-house', 'Home'], ['favs', 'fa-heart', 'Favorites'], ['recent', 'fa-clock-rotate-left', 'Recent']]
      .map((t) => `<button class="${this.tab === t[0] ? 'on' : ''}" onclick="SONGIFY.setTab('${t[0]}')"><i class="fa-solid ${t[1]}"></i><span>${t[2]}</span></button>`).join('');
  },
  draw() {
    const body = document.getElementById('sg-body'); if (!body) return;
    document.getElementById('sg-nav').innerHTML = this.navHtml();
    const player = '<div id="songify-player"></div>';
    if (this.tab === 'home') {
      body.innerHTML = `<div class="songify-head"><div><b>Music for every mood</b><span>Search Afrobeats, street-hop and more</span></div><i class="fa-solid fa-music songify-mark"></i></div>
        <form class="songify-search" onsubmit="event.preventDefault();SONGIFY.search()"><input id="songify-q" class="sinput" value="${esc(this.q)}" oninput="SONGIFY.q=this.value" placeholder="Search Burna Boy, Asake, Amapiano…" autocomplete="off"><button class="songify-go" type="submit" aria-label="Search"><i class="fa-solid fa-magnifying-glass"></i></button></form>
        <div id="songify-status" class="songify-status"></div>${player}
        <div class="lab2 sg-lab" id="sg-lab">${this.resLabel}</div><div id="songify-results" class="songify-results"></div>`;
      this.setStatus(this.status, this.statusErr);
      if (!this.results.length && !this.busy) this.loadDefault();
    } else {
      const title = this.tab === 'favs' ? 'Favorites' : 'Recently played';
      body.innerHTML = `<div class="sg-title">${title}</div>${player}<div id="songify-results" class="songify-results"></div>`;
    }
    this.paint(); this.paintResults();
  },
  setStatus(message, error = false) {
    this.status = message || ''; this.statusErr = error;
    const el = document.getElementById('songify-status'); if (el) { el.textContent = this.status; el.className = `songify-status${error ? ' error' : ''}`; }
  },
  async fetchSongs(query) {
    const data = await NET.api(`/api/ac/music/search?q=${encodeURIComponent(query)}`);
    const label = { audius: 'Audius', jiosaavn: 'JioSaavn', itunes: '30s previews (iTunes)' }[data.provider] || data.provider;
    return { list: data.results || [], label, errors: data.errors };
  },
  /* songs are loaded as soon as the app opens so the list is never empty */
  async loadDefault() {
    if (this.loading) return;
    if (this.defaults) { if (!this.searched) { this.results = this.defaults; this.resLabel = 'TRENDING NOW'; } this.paintResults(); return; }
    this.loading = true; this.busy = true; this.setStatus('Loading songs…'); this.paintResults();
    try {
      const r = await this.fetchSongs('Afrobeats');
      this.defaults = r.list;
      if (!this.searched) { this.results = r.list; this.resLabel = 'TRENDING NOW'; }
      this.setStatus(r.list.length ? `${r.list.length} tracks · ${r.label}` : (r.errors || ['No tracks found.']).join(' '), !r.list.length);
    } catch (e) { this.setStatus(e.message || 'Could not load songs.', true); }
    this.loading = false; this.busy = false;
    const lab = document.getElementById('sg-lab'); if (lab) lab.textContent = this.resLabel;
    this.paintResults();
  },
  async search() {
    const query = (this.q || '').trim().replace(/^\.?play\s+/i, '');
    if (!query || query.length < 2) return this.setStatus('Enter at least 2 characters to search.', true);
    this.searched = true; this.busy = true; this.resLabel = 'SEARCH RESULTS'; this.setStatus('Finding your song…'); this.draw();
    try {
      const r = await this.fetchSongs(query);
      this.results = r.list;
      this.setStatus(r.list.length ? `${r.list.length} tracks · ${r.label}` : (r.errors || ['No tracks found. Try another search.']).join(' '), !r.list.length);
      this.busy = false; this.paintResults();
      if (r.list.length) { this.playAt('results', 0); return; }
    } catch (e) { this.results = []; this.setStatus(e.message || 'Music search failed.', true); }
    this.busy = false; this.paintResults();
  },

  /* ----- painting ----- */
  paintProgress() {
    const pct = this.audio?.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0;
    const range = document.getElementById('songify-progress'); if (range) range.value = pct;
    const now = document.getElementById('songify-now'); if (now) now.textContent = this.format(this.audio?.currentTime);
    const total = document.getElementById('songify-total'); if (total) total.textContent = this.format(this.audio?.duration);
    const fill = document.getElementById('mp-fill'); if (fill) fill.style.width = pct + '%';
  },
  paint() {
    const el = document.getElementById('songify-player'); if (!el) return;
    if (!this.current) { el.innerHTML = '<div class="songify-empty-player"><i class="fa-solid fa-music"></i><div><b>Ready when you are</b><small>Pick a result and press play</small></div></div>'; return; }
    const s = this.current, paused = !this.audio || this.audio.paused, fav = this.isFav(s);
    el.innerHTML = `<div class="songify-player"><div class="sp-top"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><div class="songify-track"><b>${esc(s.title)}</b><span>${esc(s.artist)} · ${esc(s.provider)}</span></div>
      <button class="sp-ic ${fav ? 'on' : ''}" onclick="SONGIFY.toggleFav(SONGIFY.current)" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}"><i class="fa-${fav ? 'solid' : 'regular'} fa-heart"></i></button>
      <button class="sp-ic" onclick="SONGIFY.share()" aria-label="Share to Gist"><i class="fa-solid fa-share-nodes"></i></button></div>
      <input id="songify-progress" type="range" min="0" max="100" step="0.1" value="0" oninput="SONGIFY.seek(this.value)" aria-label="Track progress"><div class="songify-times"><small id="songify-now">0:00</small><small id="songify-total">0:00</small></div>
      <div class="sp-ctl"><button class="${this.shuffle ? 'on' : ''}" onclick="SONGIFY.toggleShuffle()" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
        <button onclick="SONGIFY.prev()" aria-label="Previous"><i class="fa-solid fa-backward-step"></i></button>
        <button class="big" onclick="SONGIFY.toggle()" aria-label="${paused ? 'Play' : 'Pause'}"><i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i></button>
        <button onclick="SONGIFY.next()" aria-label="Next"><i class="fa-solid fa-forward-step"></i></button>
        <button class="${this.repeat !== 'off' ? 'on' : ''}" onclick="SONGIFY.cycleRepeat()" aria-label="Repeat ${this.repeat}"><i class="fa-solid fa-repeat"></i>${this.repeat === 'one' ? '<sup>1</sup>' : ''}</button></div></div>`;
    this.paintProgress();
  },
  paintResults() {
    const el = document.getElementById('songify-results'); if (!el) return;
    const name = this.tab === 'favs' ? 'favs' : this.tab === 'recent' ? 'recent' : 'results', list = this.lst(name);
    if (this.tab === 'home' && this.busy) { el.innerHTML = '<p class="empty">Loading songs…</p>'; return; }
    if (!list.length) {
      el.innerHTML = this.tab === 'favs' ? '<p class="empty">No favorites yet. Tap the heart on a song to save it here.</p>'
        : this.tab === 'recent' ? '<p class="empty">Songs you play will show up here.</p>'
        : '<p class="empty">No songs to show.<br><button class="songify-retry" onclick="SONGIFY.retry()">Try again</button></p>';
      return;
    }
    el.innerHTML = list.map((s, i) => {
      const playing = this.current?.streamUrl === s.streamUrl, fav = this.isFav(s);
      return `<div class="songify-result" role="button" tabindex="0" onclick="SONGIFY.playAt('${name}',${i})"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><span><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></span>
        <button class="sg-heart ${fav ? 'on' : ''}" onclick="event.stopPropagation();SONGIFY.favAt('${name}',${i})" aria-label="Favorite"><i class="fa-${fav ? 'solid' : 'regular'} fa-heart"></i></button>
        <em><i class="fa-solid ${playing ? (this.audio && !this.audio.paused ? 'fa-volume-high' : 'fa-pause') : 'fa-play'}"></i></em></div>`;
    }).join('');
  },
  retry() { this.defaults = null; this.searched = false; this.results = []; this.loadDefault(); },

  /* ----- mini player on the home / map scenes ----- */
  paintMini() {
    const el = document.getElementById('miniplayer'), app = document.getElementById('app'); if (!el) return;
    const pg = typeof S !== 'undefined' ? S.page : 'home', clean = typeof S !== 'undefined' && S.clean;
    const show = !!this.current && (pg === 'home' || pg === 'map') && !(pg === 'home' && clean);
    el.style.display = show ? 'flex' : 'none'; if (app) app.classList.toggle('has-mini', show);
    if (!show) return;
    const s = this.current, paused = !this.audio || this.audio.paused;
    el.innerHTML = `<img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><div class="mp-t" onclick="SONGIFY.openFromMini()"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>
      <button onclick="SONGIFY.prev()" aria-label="Previous"><i class="fa-solid fa-backward-step"></i></button>
      <button class="pp" onclick="SONGIFY.toggle()" aria-label="${paused ? 'Play' : 'Pause'}"><i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i></button>
      <button onclick="SONGIFY.next()" aria-label="Next"><i class="fa-solid fa-forward-step"></i></button>
      <button onclick="SONGIFY.stop()" aria-label="Stop"><i class="fa-solid fa-xmark"></i></button><i class="mp-bar"><u id="mp-fill"></u></i>`;
    this.paintProgress();
  },
  /* the phone's dynamic island shows what is playing: tap it to expand the controls */
  islandOpen: false,
  islandToggle() { this.islandOpen = !this.islandOpen; this.paintIsland(); },
  paintIsland() {
    const el = document.querySelector('.screen .island'); if (!el) return;
    if (!this.current) { el.className = 'island'; el.innerHTML = ''; this.islandOpen = false; return; }
    const s = this.current, paused = !this.audio || this.audio.paused;
    el.className = `island music${this.islandOpen ? ' open' : ''}${paused ? ' paused' : ''}`;
    el.innerHTML = `<div class="isl-row" onclick="SONGIFY.islandToggle()"><img class="isl-art" src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><span class="eq"><i></i><i></i><i></i></span><div class="isl-t"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>
      <button class="isl-pp" onclick="event.stopPropagation();SONGIFY.toggle()" aria-label="${paused ? 'Play' : 'Pause'}"><i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i></button></div>
      <div class="isl-ctl"><button onclick="SONGIFY.prev()" aria-label="Previous"><i class="fa-solid fa-backward-step"></i></button><button onclick="SONGIFY.toggle()" aria-label="${paused ? 'Play' : 'Pause'}"><i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i></button><button onclick="SONGIFY.next()" aria-label="Next"><i class="fa-solid fa-forward-step"></i></button><button onclick="SONGIFY.stop()" aria-label="Stop"><i class="fa-solid fa-xmark"></i></button></div>`;
  },
  openFromMini() { nav('phone'); this.open(); },
  share() {
    if (!this.current) return;
    GIST.nav('compose');
    setTimeout(() => { const input = document.getElementById('gc_t'); if (input) { input.value = `Listening on Songify: ${this.current.title} - ${this.current.artist}`; input.dispatchEvent(new Event('input')); } }, 0);
  }
};
window.SONGIFY = SONGIFY;
SONGIFY.init();
