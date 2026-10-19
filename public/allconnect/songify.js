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

  /* ----- YouTube backend: official embedded player (full songs, nothing is downloaded or re-hosted).
     The rest of Songify talks to paused() / time() / dur() / setTime() / resume() / pauseMedia() so the same
     controls, queue, favourites and progress bar work for both <audio> tracks and YouTube tracks. ----- */
  yt: { player: null, want: null, playing: false, t: 0, d: 0, timer: null, fails: 0 },
  isYT(s) { return !!s && s.provider === 'youtube' && /^[\w-]{11}$/.test(s.videoId || ''); },
  ytActive() { return this.isYT(this.current); },
  paused() { return this.ytActive() ? !this.yt.playing : (!this.audio || this.audio.paused); },
  time() { return this.ytActive() ? this.yt.t : ((this.audio && this.audio.currentTime) || 0); },
  dur() { const d = this.ytActive() ? this.yt.d : (this.audio && this.audio.duration); return Number.isFinite(d) ? d : 0; },
  setTime(t) {
    if (this.ytActive()) { try { this.yt.player && this.yt.player.seekTo(t, true); } catch (e) {} this.yt.t = t; this.paintProgress(); }
    else if (this.audio) this.audio.currentTime = t;
  },
  resume() { if (this.ytActive()) { try { this.yt.player && this.yt.player.playVideo(); } catch (e) {} } else if (this.audio) this.audio.play().catch(() => {}); },
  pauseMedia() { if (this.ytActive()) { try { this.yt.player && this.yt.player.pauseVideo(); } catch (e) {} } else if (this.audio) this.audio.pause(); },
  ytHost() {
    let h = document.getElementById('sg-yt'); if (h) return h;
    h = document.createElement('div'); h.id = 'sg-yt';
    h.innerHTML = '<div class="sg-yt-box"></div><button class="sg-yt-x" type="button" aria-label="Stop music" onclick="SONGIFY.stop()"><i class="fa-solid fa-xmark"></i></button>';
    document.body.appendChild(h); return h;
  },
  ytApi() {
    if (this._ytApi) return this._ytApi;
    this._ytApi = new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) return resolve();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { try { if (prev) prev(); } catch (e) {} resolve(); };
      const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api';
      sc.onerror = () => { this._ytApi = null; reject(new Error('Could not load the YouTube player. Check your connection.')); };
      document.head.appendChild(sc);
    });
    return this._ytApi;
  },
  async ytPlay(song) {
    this.yt.want = song.videoId; this.yt.t = 0; this.yt.d = 0; this.yt.playing = false;
    const host = this.ytHost(); host.classList.add('on');
    try { await this.ytApi(); } catch (e) { this.setStatus(e.message, true); return; }
    if (this.yt.want !== song.videoId) return;                      // another song was picked while the API loaded
    if (!this.yt.player) {
      const frame = document.createElement('iframe');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');   // the site's own policy is "same-origin", which YouTube rejects
      frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      frame.setAttribute('title', 'Song player');
      frame.src = `https://www.youtube.com/embed/${song.videoId}?enablejsapi=1&autoplay=1&controls=0&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(location.origin)}`;
      host.querySelector('.sg-yt-box').appendChild(frame);
      this.yt.player = new window.YT.Player(frame, { events: { onStateChange: (e) => this.ytState(e.data), onError: (e) => this.ytError(e.data) } });
    } else {
      try { this.yt.player.loadVideoById(song.videoId); } catch (e) { this.setStatus('The player is not ready yet. Tap play.', true); }
    }
    setTimeout(() => { if (this.yt.want === song.videoId && !this.yt.playing && this.ytActive()) this.setStatus('Tap play to start the song.'); }, 4500);
  },
  ytTick(on) {
    clearInterval(this.yt.timer); this.yt.timer = null;
    const read = () => { const p = this.yt.player; if (!p || !p.getCurrentTime) return; this.yt.t = p.getCurrentTime() || 0; this.yt.d = p.getDuration() || this.yt.d; this.paintProgress(); };
    try { read(); } catch (e) {}
    if (on) this.yt.timer = setInterval(() => { try { read(); } catch (e) {} }, 500);
  },
  ytState(code) {                                                   // -1 unstarted · 0 ended · 1 playing · 2 paused · 3 buffering · 5 cued
    if (!this.ytActive()) return;
    if (code === 1) { this.yt.playing = true; this.yt.fails = 0; this.ytTick(true); if (/^Tap play/.test(this.status)) this.setStatus(''); }
    else if (code === 2) { this.yt.playing = false; this.ytTick(false); }
    else if (code === 0) { this.yt.playing = false; this.ytTick(false); this.onEnded(); }
    this.repaint();
  },
  ytError(code) {
    if (!this.ytActive()) return;
    this.yt.playing = false; this.ytTick(false);
    const blocked = code === 101 || code === 150;
    this.setStatus(blocked ? 'The owner does not allow this song to play outside YouTube. Skipping…' : code === 153 ? 'YouTube refused to play inside this page.' : 'This song could not be played. Skipping…', true);
    this.repaint();
    if (code !== 153 && ++this.yt.fails <= 3 && this.queue.length > 1) setTimeout(() => this.next(), 1200);
  },
  ytHalt() {
    this.yt.want = null; this.yt.playing = false; this.ytTick(false);
    try { if (this.yt.player && this.yt.player.stopVideo) this.yt.player.stopVideo(); } catch (e) {}
    const h = document.getElementById('sg-yt'); if (h) h.classList.remove('on');
  },

  /* ----- audio (created once, survives leaving the app) ----- */
  init() {
    if (this.audio) return;
    this.audio = new Audio(); this.audio.preload = 'metadata';
    this.audio.addEventListener('timeupdate', () => this.paintProgress());
    this.audio.addEventListener('loadedmetadata', () => this.paintProgress());
    this.audio.addEventListener('play', () => this.repaint());
    this.audio.addEventListener('pause', () => this.repaint());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('error', () => { if (!this.current || this.ytActive()) return; this.setStatus('This track could not be streamed. Try another result.', true); this.busy = false; this.repaint(); });
  },
  repaint() { this.paint(); this.paintMini(); this.paintIsland(); },
  /* is the Songify screen the one on show? */
  alive() { return typeof S !== 'undefined' && S.page === 'phone' && typeof PH !== 'undefined' && PH.view === this.view; },
  idx() { return this.queue.findIndex((s) => s.streamUrl === this.current?.streamUrl); },
  /* play a song from one of the lists; the queue is that list */
  playAt(name, i, quiet) {
    const song = this.lst(name)[i]; if (!song) return;
    if (!quiet && this.current && this.current.streamUrl === song.streamUrl) { this.openNP(); return; }   // same song: just open the player
    this.listName = name; this.queue = this.lst(name).slice(); this.np = !quiet; this.start(song);
  },
  start(song) {
    this.init(); this.current = song; this.remember(song);
    if (this.isYT(song)) { this.audio.pause(); this.ytPlay(song); }
    else {
      this.ytHalt();
      this.audio.src = song.streamUrl;
      this.audio.play().catch(() => this.setStatus('Tap play again to start audio on this device.', true));
    }
    this.repaint(); this.paintResults();
  },
  stop() { this.ytHalt(); if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } this.current = null; this.queue = []; this.np = false; this.repaint(); this.paintResults(); },
  toggle() { if (!this.current) return; this.paused() ? this.resume() : this.pauseMedia(); },
  next() {
    const q = this.queue; if (!q.length) return; let i = this.idx();
    if (this.shuffle && q.length > 1) { let n; do { n = Math.floor(Math.random() * q.length); } while (n === i); i = n; } else i = (i + 1) % q.length;
    this.start(q[i]);
  },
  prev() {
    const q = this.queue; if (!q.length) return;
    if (this.time() > 3) { this.setTime(0); return; }
    const i = this.idx(); this.start(q[(i - 1 + q.length) % q.length]);
  },
  onEnded() {
    if (this.repeat === 'one') { this.setTime(0); this.resume(); return; }
    if (!this.shuffle && this.repeat === 'off' && this.idx() >= this.queue.length - 1) { this.repaint(); return; }
    this.next();
  },
  toggleShuffle() { this.shuffle = !this.shuffle; this.paint(); },
  cycleRepeat() { this.repeat = { off: 'all', all: 'one', one: 'off' }[this.repeat]; this.paint(); },
  seek(value) { if (this.dur()) this.setTime((Number(value) / 100) * this.dur()); },
  format(s) { if (!Number.isFinite(s)) return '0:00'; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; },

  /* ----- screen ----- */
  open() {
    this.init(); this.favs = this.load('favs'); this.recent = this.load('recent');
    document.querySelector('.screen')?.classList.add('light');
    PH.view = this.view;
    PH.shell('Songify', 'SONGIFY.close()', '<div class="sg-wrap"><div class="sg-body" id="sg-body"></div><div id="sg-mini"></div><nav class="sg-nav" id="sg-nav"></nav></div>');
    this.draw();
  },
  close() { this.closeNP(true); document.querySelector('.screen')?.classList.remove('sg-dark'); PH.close(); },   // music keeps playing
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
    const label = { youtube: 'YouTube', audius: 'Audius', jiosaavn: 'JioSaavn', itunes: '30s previews (iTunes)' }[data.provider] || data.provider;
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
      if (r.list.length) { this.playAt('results', 0, true); return; }
    } catch (e) { this.results = []; this.setStatus(e.message || 'Music search failed.', true); }
    this.busy = false; this.paintResults();
  },

  /* ----- painting ----- */
  paintProgress() {
    const pct = this.dur() ? (this.time() / this.dur()) * 100 : 0;
    const range = document.getElementById('songify-progress'); if (range) range.value = pct;
    const now = document.getElementById('songify-now'); if (now) now.textContent = this.format(this.time());
    const total = document.getElementById('songify-total'); if (total) total.textContent = this.format(this.dur());
    const fill = document.getElementById('mp-fill'); if (fill) fill.style.width = pct + '%';
    const f2 = document.getElementById('sgm-fill'); if (f2) f2.style.width = pct + '%';
    if (range) range.style.setProperty('--p', pct + '%');
  },
  paint() {
    const el = document.getElementById('songify-player'); if (el) el.innerHTML = '';
    this.paintSgMini(); this.paintNP(); this.paintProgress();
  },

  /* ----- Spotify-style: mini bar on the list, full "Now playing" with a spinning record ----- */
  np: false, npQueue: false, npKey: '', npCol: {},
  hue(s) { return [...String((s && s.title) || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360; },
  colour(song) { return this.npCol[song.albumArt || ''] || `hsl(${this.hue(song)} 42% 26%)`; },
  /* backdrop colour = the cover's average colour, darkened (falls back to a colour made from the title) */
  tone(song) {
    const url = song.albumArt || ''; if (!url || url in this.npCol) return;
    this.npCol[url] = null;
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 8, 8);
        const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0; const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        this.npCol[url] = `rgb(${Math.round(r / n * .55)},${Math.round(g / n * .55)},${Math.round(b / n * .55)})`;
        if (this.current && (this.current.albumArt || '') === url) { this.setTone(); this.paintSgMini(); }
      } catch (e) { /* cover has no CORS: keep the fallback colour */ }
    };
    im.src = url;
  },
  setTone() { const el = document.getElementById('sg-np'); if (el && this.current) el.style.setProperty('--np', this.colour(this.current)); },
  listLabel() { return this.listName === 'favs' ? 'Favorites' : this.listName === 'recent' ? 'Recently played' : (this.searched ? 'Search results' : 'Trending now'); },
  openNP() { if (!this.current) return; this.np = true; this.paint(); },
  closeNP(quiet) { this.np = false; this.npQueue = false; this.npKey = ''; const el = document.getElementById('sg-np'); if (el) el.remove(); document.querySelector('.screen')?.classList.remove('sg-npon'); if (!quiet) this.paint(); },
  toggleQueue() { this.npQueue = !this.npQueue; this.paintNP(); },
  playQ(i) { const s = this.queue[i]; if (s) this.start(s); },
  paintSgMini() {
    const el = document.getElementById('sg-mini'); if (!el) return;
    if (!this.current || this.np) { el.innerHTML = ''; return; }
    const s = this.current, paused = this.paused(), fav = this.isFav(s);
    this.tone(s);
    el.innerHTML = `<div class="sgm" style="--np:${this.colour(s)}"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><div class="sgm-t" onclick="SONGIFY.openNP()"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>
      <button class="sgm-b ${fav ? 'on' : ''}" onclick="SONGIFY.toggleFav(SONGIFY.current)" aria-label="Favorite"><i class="fa-${fav ? 'solid' : 'regular'} fa-heart"></i></button>
      <button class="sgm-b" onclick="SONGIFY.toggle()" aria-label="${paused ? 'Play' : 'Pause'}"><i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i></button><i class="sgm-bar"><u id="sgm-fill"></u></i></div>`;
    this.paintProgress();
  },
  npHtml(s) {
    return `<div class="np-top"><button class="np-ic" onclick="SONGIFY.closeNP()" aria-label="Minimise"><i class="fa-solid fa-chevron-down"></i></button><div class="np-from"><small>PLAYING FROM</small><b>${esc(this.listLabel())}</b></div><button class="np-ic" onclick="SONGIFY.share()" aria-label="Share to Gist"><i class="fa-solid fa-share-nodes"></i></button></div>
      <div class="np-stage"><div class="np-disc"><img class="np-art" src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"></div></div>
      <div class="np-meta"><div class="np-tt"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div><button class="np-ic np-heart" onclick="SONGIFY.toggleFav(SONGIFY.current)" aria-label="Favorite"><i class="fa-regular fa-heart"></i></button></div>
      <input id="songify-progress" class="np-range" type="range" min="0" max="100" step="0.1" value="0" oninput="SONGIFY.seek(this.value)" aria-label="Track progress">
      <div class="np-times"><small id="songify-now">0:00</small><small id="songify-total">0:00</small></div>
      <div class="np-ctl"><button class="np-sh" onclick="SONGIFY.toggleShuffle()" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button><button onclick="SONGIFY.prev()" aria-label="Previous"><i class="fa-solid fa-backward-step"></i></button>
        <button class="np-pp" onclick="SONGIFY.toggle()" aria-label="Play or pause"><i class="fa-solid fa-play"></i></button><button onclick="SONGIFY.next()" aria-label="Next"><i class="fa-solid fa-forward-step"></i></button>
        <button class="np-rp" onclick="SONGIFY.cycleRepeat()" aria-label="Repeat"><i class="fa-solid fa-repeat"></i><sup></sup></button></div>
      <div class="np-foot"><button onclick="SONGIFY.toggleQueue()"><i class="fa-solid fa-list"></i> Up next</button></div>
      <div class="np-q" id="np-q"></div>`;
  },
  paintNP() {
    const sc = document.querySelector('.screen'); if (!sc) return;
    let el = document.getElementById('sg-np');
    if (!this.np || !this.current || !this.alive()) { if (el) el.remove(); sc.classList.remove('sg-npon'); this.npKey = ''; return; }
    const s = this.current, paused = this.paused(), fav = this.isFav(s);
    if (!el) { el = document.createElement('div'); el.id = 'sg-np'; el.className = 'sg-np'; sc.appendChild(el); this.npKey = ''; requestAnimationFrame(() => el.classList.add('on')); }
    sc.classList.add('sg-npon');
    if (this.npKey !== s.streamUrl) { this.npKey = s.streamUrl; el.innerHTML = this.npHtml(s); this.tone(s); }
    this.setTone();
    /* only flip the small bits so the record keeps turning smoothly */
    el.classList.toggle('paused', paused); el.classList.toggle('qopen', this.npQueue);
    const q = (c) => el.querySelector(c);
    q('.np-pp i').className = `fa-solid fa-${paused ? 'play' : 'pause'}`;
    q('.np-heart').classList.toggle('on', fav); q('.np-heart i').className = `fa-${fav ? 'solid' : 'regular'} fa-heart`;
    q('.np-sh').classList.toggle('on', this.shuffle); q('.np-rp').classList.toggle('on', this.repeat !== 'off'); q('.np-rp sup').textContent = this.repeat === 'one' ? '1' : '';
    q('.np-from b').textContent = this.listLabel();
    const i = Math.max(0, this.idx()), up = this.queue.slice(i, i + 25);
    q('#np-q').innerHTML = `<div class="npq-h"><b>Up next</b><button onclick="SONGIFY.toggleQueue()" aria-label="Close queue"><i class="fa-solid fa-xmark"></i></button></div>` + (up.map((t, k) => { const on = k === 0; return `<div class="npq-r ${on ? 'on' : ''}" onclick="SONGIFY.playQ(${i + k})"><img src="${esc(t.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><span><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span>${on ? '<i class="fa-solid fa-volume-high"></i>' : ''}</div>`; }).join('') || '<p class="empty">Nothing queued.</p>');
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
      return `<div class="songify-result${playing ? ' playing' : ''}" role="button" tabindex="0" onclick="SONGIFY.playAt('${name}',${i})"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><span><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></span>
        <button class="sg-heart ${fav ? 'on' : ''}" onclick="event.stopPropagation();SONGIFY.favAt('${name}',${i})" aria-label="Favorite"><i class="fa-${fav ? 'solid' : 'regular'} fa-heart"></i></button>
        <em><i class="fa-solid ${playing ? (!this.paused() ? 'fa-volume-high' : 'fa-pause') : 'fa-play'}"></i></em></div>`;
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
    const s = this.current, paused = this.paused();
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
    const s = this.current, paused = this.paused();
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

/* Songify is a dark, Spotify-style app: switch the phone chrome (status bar, header, tint) while it is on screen,
   and tidy the full-screen player away whenever another app takes over. */
(function () {
  if (typeof PH === 'undefined' || PH._sgShell) return;
  if (PH.TINT) PH.TINT.songify = '#121212';
  PH._sgShell = PH.shell;
  PH.shell = function () {
    const sc = document.querySelector('.screen');
    if (sc) sc.classList.toggle('sg-dark', this.view === 'songify');
    if (this.view !== 'songify') SONGIFY.closeNP(true);
    return PH._sgShell.apply(this, arguments);
  };
})();
