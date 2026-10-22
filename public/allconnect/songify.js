/* Songify: music search + player for the AllConnect phone.
   The audio element lives on SONGIFY itself (not inside the Songify screen), so music keeps playing when the
   player leaves the app, closes the phone or goes back to the home scene. A mini player on the home/map scenes
   (#miniplayer) controls it from there. */
const SONGIFY = {
  view: 'songify', tab: 'home', q: '', results: [], defaults: null, queue: [], current: null, audio: null,
  busy: false, loading: false, searched: false, resLabel: 'TRENDING NOW', status: '', statusErr: false, ytPlaying: false,
  _searchSeq: 0, _searchPending: 0, _fallbackKey: '',
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
    this.audio.addEventListener('error', () => {
      if (!this.current) return;
      const key = `${this.current.title || ''}|${this.current.artist || ''}`.toLowerCase();
      if (key !== this._fallbackKey) { this._fallbackKey = key; this.setStatus('Stream unavailable. Looking for another source…'); this.refetch(this.current); return; }
      this.setStatus('This track could not be streamed. Try another source or choose a different result.', true); if (typeof toast === 'function') toast('Songify could not play this track.'); this.busy = false; this.repaint();
    });
  },
  repaint() { this.paint(); this.paintMini(); this.paintIsland(); },
  youtubeId(song) {
    if (!song) return '';
    const id = String(song.videoId || '').trim();
    if (/^[\w-]{6,20}$/.test(id)) return id;
    const m = String(song.streamUrl || '').match(/(?:youtube\.com\/(?:watch\?.*?v=|embed\/)|youtu\.be\/)([\w-]{6,20})/i);
    return m ? m[1] : '';
  },
  isPlaying() { return this.youtubeId(this.current) ? !!this.ytPlaying : !!(this.audio && !this.audio.paused); },
  ytCommand(func) {
    const frame = document.querySelector('#sg-np iframe.songify-youtube');
    if (frame && frame.contentWindow) frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube-nocookie.com');
  },
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
    this.init(); if (`${song.title || ''}|${song.artist || ''}`.toLowerCase() !== this._fallbackKey) this._fallbackKey = ''; this.current = song; this.remember(song); this.setStatus('');
    if (this.youtubeId(song)) {
      this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.ytPlaying = true;
    } else {
      this.ytCommand('stopVideo'); this.ytPlaying = false; this.audio.src = song.streamUrl;
      this.audio.play().catch(() => { this.setStatus('Tap play again to start audio on this device.', true); if (typeof toast === 'function') toast('Tap play again to start Songify audio.'); });
    }
    this.repaint(); this.paintResults();
  },
  stop() { this.ytCommand('stopVideo'); this.ytPlaying = false; if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } this.current = null; this.queue = []; this.np = false; this.repaint(); this.paintResults(); },
  toggle() {
    if (!this.current) return;
    if (this.youtubeId(this.current)) {
      if (!document.querySelector('#sg-np iframe.songify-youtube') && this.alive()) { this.np = true; this.ytPlaying = true; this.paint(); return; }
      this.ytPlaying = !this.ytPlaying; this.ytCommand(this.ytPlaying ? 'playVideo' : 'pauseVideo'); this.repaint(); return;
    }
    this.audio.paused ? this.audio.play().catch(() => {}) : this.audio.pause();
  },
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
    PH.shell('Songify', 'SONGIFY.close()', '<div class="sg-wrap"><div class="sg-body" id="sg-body"></div><div id="sg-mini"></div><nav class="sg-nav" id="sg-nav"></nav></div>');
    this.draw();
  },
  close() { if (this.youtubeId(this.current)) this.stop(); else this.closeNP(true); document.querySelector('.screen')?.classList.remove('sg-dark'); PH.close(); },
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
    const pe = document.getElementById('np-error'); if (pe) { pe.hidden = !error; const text = pe.querySelector('span'); if (text) text.textContent = this.status; }
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
    this.loading = true; this.busy = true; if (!this._searchPending) this.setStatus('Loading songs…'); this.paintResults();
    try {
      const r = await this.fetchSongs('Afrobeats');
      this.defaults = r.list;
      if (!this.searched) { this.results = r.list; this.resLabel = 'TRENDING NOW'; }
      if (!this._searchPending) this.setStatus(r.list.length ? `${r.list.length} tracks · ${r.label}` : (r.errors || ['No tracks found.']).join(' '), !r.list.length);
    } catch (e) { if (!this._searchPending) this.setStatus(e.message || 'Could not load songs.', true); }
    this.loading = false; this.busy = !!this._searchPending;
    const lab = document.getElementById('sg-lab'); if (lab) lab.textContent = this.resLabel;
    this.paintResults();
  },
  async search() {
    const raw = (this.q || '').trim(), playIntent = /^\.?play\s+/i.test(raw), query = raw.replace(/^\.?play\s+/i, '');
    if (!query || query.length < 2) return this.setStatus('Enter at least 2 characters to search.', true);
    const seq = ++this._searchSeq;
    this._searchPending = seq; this.searched = true; this.busy = true; this.resLabel = 'SEARCH RESULTS'; this.setStatus('Finding your song…');
    const lab = document.getElementById('sg-lab'); if (lab) lab.textContent = this.resLabel;
    this.paintResults();
    try {
      const r = await this.fetchSongs(query);
      if (seq !== this._searchSeq) return;
      this.results = r.list;
      this.setStatus(r.list.length ? `${r.list.length} tracks · ${r.label}` : (r.errors || ['No tracks found. Try another search.']).join(' '), !r.list.length);
      if (playIntent && r.list.length) { this.queue = r.list.slice(); this.listName = 'results'; this.np = true; this.start(r.list[0]); this.setStatus(`Now playing first result · ${r.label}.`); }
    } catch (e) { if (seq !== this._searchSeq) return; this.results = []; this.setStatus(e.message || 'Music search failed.', true); }
    if (seq === this._searchSeq) { this._searchPending = 0; this.busy = this.loading; this.paintResults(); }
  },

  /* ----- painting ----- */
  paintProgress() {
    if (this.youtubeId(this.current)) {
      const range = document.getElementById('songify-progress'); if (range) range.value = 0;
      const fill = document.getElementById('mp-fill'), mini = document.getElementById('sgm-fill'); if (fill) fill.style.width = '0%'; if (mini) mini.style.width = '0%';
      return;
    }
    const pct = this.audio?.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0;
    const range = document.getElementById('songify-progress'); if (range) range.value = pct;
    const now = document.getElementById('songify-now'); if (now) now.textContent = this.format(this.audio?.currentTime);
    const total = document.getElementById('songify-total'); if (total) total.textContent = this.format(this.audio?.duration);
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
  closeNP(quiet) { if (this.youtubeId(this.current)) { this.ytCommand('pauseVideo'); this.ytPlaying = false; } this.np = false; this.npQueue = false; this.npKey = ''; const el = document.getElementById('sg-np'); if (el) el.remove(); document.querySelector('.screen')?.classList.remove('sg-npon'); if (!quiet) this.paint(); },
  toggleQueue() { this.npQueue = !this.npQueue; this.paintNP(); },
  playQ(i) { const s = this.queue[i]; if (s) this.start(s); },
  paintSgMini() {
    const el = document.getElementById('sg-mini'); if (!el) return;
    if (!this.current || this.np) { el.innerHTML = ''; return; }
    const s = this.current, paused = !this.isPlaying(), fav = this.isFav(s);
    this.tone(s);
    el.innerHTML = `<div class="sgm" style="--np:${this.colour(s)}"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><div class="sgm-t" onclick="SONGIFY.openNP()"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>
      <button class="sgm-b ${fav ? 'on' : ''}" onclick="SONGIFY.toggleFav(SONGIFY.current)" aria-label="Favorite"><i class="fa-${fav ? 'solid' : 'regular'} fa-heart"></i></button>
      <button class="sgm-b" onclick="SONGIFY.toggle()" aria-label="${paused ? 'Play' : 'Pause'}"><i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i></button><i class="sgm-bar"><u id="sgm-fill"></u></i></div>`;
    this.paintProgress();
  },
  npHtml(s) {
    const yt = this.youtubeId(s), stage = yt
      ? `<div class="np-youtube"><iframe class="songify-youtube" title="Play ${esc(s.title)} on YouTube" src="https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&amp;playsinline=1&amp;controls=1&amp;rel=0&amp;enablejsapi=1&amp;origin=${encodeURIComponent(location.origin)}" allow="autoplay; encrypted-media; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><p class="np-provider-note">Official YouTube player · use its playback controls</p>`
      : `<div class="np-stage"><div class="np-disc"><img class="np-art" src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"></div></div>`;
    const controls = yt ? `<div class="np-ctl np-yt-ctl"><button onclick="SONGIFY.prev()" aria-label="Previous result"><i class="fa-solid fa-backward-step"></i></button><button onclick="SONGIFY.next()" aria-label="Next result"><i class="fa-solid fa-forward-step"></i></button></div>` : `<input id="songify-progress" class="np-range" type="range" min="0" max="100" step="0.1" value="0" oninput="SONGIFY.seek(this.value)" aria-label="Track progress">
      <div class="np-times"><small id="songify-now">0:00</small><small id="songify-total">0:00</small></div>
      <div class="np-ctl"><button class="np-sh" onclick="SONGIFY.toggleShuffle()" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button><button onclick="SONGIFY.prev()" aria-label="Previous"><i class="fa-solid fa-backward-step"></i></button>
        <button class="np-pp" onclick="SONGIFY.toggle()" aria-label="Play or pause"><i class="fa-solid fa-play"></i></button><button onclick="SONGIFY.next()" aria-label="Next"><i class="fa-solid fa-forward-step"></i></button>
        <button class="np-rp" onclick="SONGIFY.cycleRepeat()" aria-label="Repeat"><i class="fa-solid fa-repeat"></i><sup></sup></button></div>`;
    return `<div class="np-top"><button class="np-ic" onclick="SONGIFY.closeNP()" aria-label="Minimise"><i class="fa-solid fa-chevron-down"></i></button><div class="np-from"><small>PLAYING FROM</small><b>${esc(this.listLabel())}</b></div><button class="np-ic" onclick="SONGIFY.share()" aria-label="Share to Gist"><i class="fa-solid fa-share-nodes"></i></button></div>
      ${stage}
      <div class="np-meta"><div class="np-tt"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div><button class="np-ic np-heart" onclick="SONGIFY.toggleFav(SONGIFY.current)" aria-label="Favorite"><i class="fa-regular fa-heart"></i></button></div>
      ${controls}
      <div class="np-foot"><button onclick="SONGIFY.toggleQueue()"><i class="fa-solid fa-list"></i> Queue</button></div>
      <div class="np-q" id="np-q"></div><div class="np-error" id="np-error" role="status" aria-live="polite" hidden><span></span><button onclick="SONGIFY.retryCurrent()">Try another source</button></div>`;
  },
  paintNP() {
    const sc = document.querySelector('.screen'); if (!sc) return;
    let el = document.getElementById('sg-np');
    if (!this.np || !this.current || !this.alive()) { if (el) el.remove(); sc.classList.remove('sg-npon'); this.npKey = ''; return; }
    const s = this.current, paused = !this.isPlaying(), fav = this.isFav(s);
    if (!el) { el = document.createElement('div'); el.id = 'sg-np'; el.className = 'sg-np'; sc.appendChild(el); this.npKey = ''; requestAnimationFrame(() => el.classList.add('on')); }
    sc.classList.add('sg-npon');
    if (this.npKey !== s.streamUrl) { this.npKey = s.streamUrl; el.innerHTML = this.npHtml(s); this.tone(s); }
    this.setTone();
    /* only flip the small bits so the record keeps turning smoothly */
    el.classList.toggle('paused', paused); el.classList.toggle('qopen', this.npQueue);
    const q = (c) => el.querySelector(c);
    const pp = q('.np-pp i'); if (pp) pp.className = `fa-solid fa-${paused ? 'play' : 'pause'}`;
    q('.np-heart').classList.toggle('on', fav); q('.np-heart i').className = `fa-${fav ? 'solid' : 'regular'} fa-heart`;
    const sh = q('.np-sh'), rp = q('.np-rp'); if (sh) sh.classList.toggle('on', this.shuffle); if (rp) { rp.classList.toggle('on', this.repeat !== 'off'); rp.querySelector('sup').textContent = this.repeat === 'one' ? '1' : ''; }
    q('.np-from b').textContent = this.listLabel();
    const i = Math.max(0, this.idx()), up = this.queue.slice(i, i + 25);
    q('#np-q').innerHTML = `<div class="npq-h"><b>Queue</b><button onclick="SONGIFY.toggleQueue()" aria-label="Close queue"><i class="fa-solid fa-xmark"></i></button></div>` + (up.map((t, k) => { const on = k === 0; return `<div class="npq-r ${on ? 'on' : ''}" onclick="SONGIFY.playQ(${i + k})"><img src="${esc(t.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><span><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span>${on ? '<i class="fa-solid fa-volume-high"></i>' : ''}</div>`; }).join('') || '<p class="empty">Nothing queued.</p>');
    const err = q('#np-error'); if (err) { err.hidden = !this.statusErr; const text = err.querySelector('span'); if (text) text.textContent = this.statusErr ? this.status : ''; }
    this.paintProgress();
  },
  paintResults() {
    const el = document.getElementById('songify-results'); if (!el) return;
    const name = this.tab === 'favs' ? 'favs' : this.tab === 'recent' ? 'recent' : 'results', list = this.lst(name);
    if (this.tab === 'home' && (this._searchPending || (!this.searched && this.loading))) { el.innerHTML = '<p class="empty">Finding your song…</p>'; return; }
    if (!list.length) {
      el.innerHTML = this.tab === 'favs' ? '<p class="empty">No favorites yet. Tap the heart on a song to save it here.</p>'
        : this.tab === 'recent' ? '<p class="empty">Songs you play will show up here.</p>'
        : '<p class="empty">No songs to show.<br><button class="songify-retry" onclick="SONGIFY.retry()">Try again</button></p>';
      return;
    }
    el.innerHTML = list.map((s, i) => {
      const playing = this.current?.streamUrl === s.streamUrl, fav = this.isFav(s);
      return `<div class="songify-result${playing ? ' playing' : ''}" role="button" tabindex="0" onclick="SONGIFY.playAt('${name}',${i})" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();SONGIFY.playAt('${name}',${i})}"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><span><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></span>
        <button class="sg-heart ${fav ? 'on' : ''}" onclick="event.stopPropagation();SONGIFY.favAt('${name}',${i})" aria-label="Favorite"><i class="fa-${fav ? 'solid' : 'regular'} fa-heart"></i></button>
        <em><i class="fa-solid ${playing ? (this.isPlaying() ? 'fa-volume-high' : 'fa-pause') : 'fa-play'}"></i></em></div>`;
    }).join('');
  },
  retry() { this._searchSeq++; this._searchPending = 0; this.defaults = null; this.searched = false; this.results = []; this.busy = false; this.loadDefault(); },
  retryCurrent() { if (!this.current) return; const song = this.current; this._fallbackKey = ''; this.setStatus('Looking for another source…'); this.refetch(song); },

  /* ----- mini player on the home / map scenes ----- */
  paintMini() {
    const el = document.getElementById('miniplayer'), app = document.getElementById('app'); if (!el) return;
    const pg = typeof S !== 'undefined' ? S.page : 'home', clean = typeof S !== 'undefined' && S.clean;
    const show = !!this.current && (pg === 'home' || pg === 'map') && !(pg === 'home' && clean);
    el.style.display = show ? 'flex' : 'none'; if (app) app.classList.toggle('has-mini', show);
    if (!show) return;
    const s = this.current, paused = !this.isPlaying();
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
    const s = this.current, paused = !this.isPlaying();
    el.className = `island music${this.islandOpen ? ' open' : ''}${paused ? ' paused' : ''}`;
    el.innerHTML = `<div class="isl-row" onclick="SONGIFY.islandToggle()"><img class="isl-art" src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><span class="eq"><i></i><i></i><i></i></span><div class="isl-t"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>
      <button class="isl-pp" onclick="event.stopPropagation();SONGIFY.toggle()" aria-label="${paused ? 'Play' : 'Pause'}"><i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i></button></div>
      <div class="isl-ctl"><button onclick="SONGIFY.prev()" aria-label="Previous"><i class="fa-solid fa-backward-step"></i></button><button onclick="SONGIFY.toggle()" aria-label="${paused ? 'Play' : 'Pause'}"><i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i></button><button onclick="SONGIFY.next()" aria-label="Next"><i class="fa-solid fa-forward-step"></i></button><button onclick="SONGIFY.stop()" aria-label="Stop"><i class="fa-solid fa-xmark"></i></button></div>`;
  },
  openFromMini() { nav('phone'); this.open(); },
  /* a song someone shared in P-Gist: jump into Songify and play it (opens the full player) */
  openSong(song) {
    if (!song || !song.streamUrl) return;
    // P-Gist and Songify live inside the same phone page. Calling nav('phone') when already
    // there is a toggle that closes the phone, so only navigate in from another app/page.
    if (typeof RL !== 'undefined' && RL.stop) RL.stop();
    if (typeof S === 'undefined' || S.page !== 'phone') nav('phone');
    this.open();
    this.listName = 'results'; this.queue = [song]; this.np = true; this._fb = song; this.start(song);
  },
  async openSharedTrack(song) {
    if (!song || typeof song !== 'object') return this.setStatus('This shared song link is invalid.', true);
    if (typeof RL !== 'undefined' && RL.stop) RL.stop();
    if (typeof S === 'undefined' || S.page !== 'phone') nav('phone');
    this.open();
    const track = { title: String(song.title || 'Song').slice(0, 120), artist: String(song.artist || '').slice(0, 120), albumArt: String(song.albumArt || '').slice(0, 1000), streamUrl: String(song.streamUrl || '') };
    this.listName = 'results'; this.queue = []; this.np = true; this._fb = track;
    if (track.streamUrl) { this.queue = [track]; this.start(track); return }
    this.setStatus('Finding the shared track…');
    await this.refetch(track);
  },
  /* the shared stream link no longer works: look the track up again by name and play the best match */
  async refetch(song) {
    try {
      const r = await this.fetchSongs(`${song.title} ${song.artist || ''}`.trim());
      const t = (song.title || '').toLowerCase(), hit = r.list.find((x) => (x.title || '').toLowerCase() === t) || r.list[0];
      if (!hit) { this.setStatus('This shared song is no longer available.', true); if (typeof toast === 'function') toast('This shared song is no longer available.'); return; }
      this.queue = [hit]; this.start(hit);
    } catch (e) { this.setStatus('This shared song is no longer available.', true); if (typeof toast === 'function') toast('Could not find another stream for this song.'); }
  },
  share() {
    if (!this.current) return;
    const cur = this.current, song = { title: cur.title, artist: cur.artist || '', albumArt: cur.albumArt || '', streamUrl: cur.streamUrl };
    GIST.nav('compose');
    setTimeout(() => { if (GIST.C) { GIST.C.song = song; GIST.attDraw(); } const input = document.getElementById('gc_t'); if (input) { input.value = `Listening on Songify: ${this.current.title} - ${this.current.artist}`; input.dispatchEvent(new Event('input')); } }, 0);
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
    if (this.view !== 'songify') { if (SONGIFY.youtubeId(SONGIFY.current)) SONGIFY.stop(); else SONGIFY.closeNP(true); }
    return PH._sgShell.apply(this, arguments);
  };
})();
