/* Songify: a compact music search and player for the AllConnect phone. */
const SONGIFY = {
  view: 'songify', results: [], queue: [], current: null, audio: null, busy: false, recent: [],
  recentKey() { return `allconnect:songify:recent:${NET.user?.id || 'guest'}`; },
  loadRecent() { try { this.recent = JSON.parse(localStorage.getItem(this.recentKey()) || '[]').slice(0, 12); } catch { this.recent = []; } },
  remember(song) {
    this.recent = [song, ...this.recent.filter((item) => item.streamUrl !== song.streamUrl)].slice(0, 12);
    try { localStorage.setItem(this.recentKey(), JSON.stringify(this.recent)); } catch {}
  },
  open() {
    this.audio = this.audio || new Audio();
    if (!this.audio.songifyBound) {
      this.audio.songifyBound = true;
      this.audio.preload = 'metadata';
      this.audio.addEventListener('timeupdate', () => this.paintProgress());
      this.audio.addEventListener('loadedmetadata', () => this.paintProgress());
      this.audio.addEventListener('ended', () => this.next());
      this.audio.addEventListener('error', () => { this.setStatus('This track could not be streamed. Try another result.', true); this.busy = false; this.paint(); });
    }
    this.loadRecent();
    PH.view = this.view;
    PH.shell('Songify', 'SONGIFY.close()', `<div class="songify-head"><div><b>Soundtrack your Lagos</b><span>Search Afrobeats, street-hop and more</span></div><span class="songify-mark">♫</span></div><form class="songify-search" onsubmit="event.preventDefault();SONGIFY.search()"><input id="songify-q" class="sinput" placeholder="Search Burna Boy, Asake, Amapiano…" autocomplete="off"><button class="songify-go" type="submit" aria-label="Search">⌕</button></form><div id="songify-status" class="songify-status"></div><div id="songify-player"></div><div class="lab2">RECENTLY PLAYED BY YOU</div><div id="songify-recent" class="songify-recent"></div><div class="lab2">SEARCH RESULTS</div><div id="songify-results" class="songify-results"><p class="empty">Search for a song to start listening.</p></div>`);
    this.paint();
    document.getElementById('songify-q')?.focus();
  },
  close() { this.stop(); PH.close(); },
  setStatus(message, error = false) { const el = document.getElementById('songify-status'); if (el) { el.textContent = message || ''; el.className = `songify-status${error ? ' error' : ''}`; } },
  async search() {
    const input = document.getElementById('songify-q'); const query = input?.value.trim();
    if (!query || query.length < 2) return this.setStatus('Enter at least 2 characters to search.', true);
    this.busy = true; this.setStatus('Searching JioSaavn…'); this.paintResults();
    try {
      const data = await NET.api(`/api/ac/music/search?q=${encodeURIComponent(query)}`);
      this.results = data.results || [];
      this.setStatus(this.results.length ? `${this.results.length} tracks · ${data.provider === 'audiomack' ? 'Audiomack fallback' : 'JioSaavn'}` : (data.errors || ['No tracks found. Try another search.']).join(' '), !this.results.length);
    } catch (error) { this.results = []; this.setStatus(error.message || 'Music search failed.', true); }
    this.busy = false; this.paintResults();
  },
  play(song) {
    this.current = song; this.remember(song); this.queue = [...this.results];
    const idx = this.queue.indexOf(song); if (idx > 0) this.queue = this.queue.slice(idx).concat(this.queue.slice(0, idx));
    this.audio.src = song.streamUrl; this.audio.play().catch(() => this.setStatus('Tap play again to start audio on this device.', true)); this.paint();
  },
  stop() { if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } this.current = null; this.queue = []; },
  toggle() { if (!this.current) return; this.audio.paused ? this.audio.play() : this.audio.pause(); this.paint(); },
  next() { if (!this.queue.length) return; const next = this.queue[(this.queue.indexOf(this.current) + 1) % this.queue.length]; this.play(next); },
  seek(value) { if (this.audio?.duration) this.audio.currentTime = (Number(value) / 100) * this.audio.duration; },
  format(seconds) { if (!Number.isFinite(seconds)) return '0:00'; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; },
  paintProgress() { const range = document.getElementById('songify-progress'); if (range && this.audio?.duration) range.value = (this.audio.currentTime / this.audio.duration) * 100; const now = document.getElementById('songify-now'); if (now) now.textContent = this.format(this.audio?.currentTime); const total = document.getElementById('songify-total'); if (total) total.textContent = this.format(this.audio?.duration); },
  paint() {
    const el = document.getElementById('songify-player'); if (!el) return;
    if (!this.current) { el.innerHTML = '<div class="songify-empty-player"><span>♫</span><div><b>Ready when you are</b><small>Pick a result and press play</small></div></div>'; this.paintRecent(); return; }
    const s = this.current, paused = !this.audio || this.audio.paused;
    el.innerHTML = `<div class="songify-player"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><div class="songify-track"><b>${esc(s.title)}</b><span>${esc(s.artist)} · ${esc(s.provider)}</span><input id="songify-progress" type="range" min="0" max="100" value="0" oninput="SONGIFY.seek(this.value)" aria-label="Track progress"><div class="songify-times"><small id="songify-now">0:00</small><small id="songify-total">0:00</small></div></div><button class="songify-play" onclick="SONGIFY.toggle()" aria-label="${paused ? 'Play' : 'Pause'}">${paused ? '▶' : 'Ⅱ'}</button><button class="songify-share" onclick="SONGIFY.share()" aria-label="Share to Gist">↗</button></div>`;
    this.paintProgress(); this.paintRecent();
  },
  paintRecent() {
    const el = document.getElementById('songify-recent'); if (!el) return;
    el.innerHTML = this.recent.length ? this.recent.slice(0, 6).map((s, i) => `<button class="songify-recent-item" onclick="SONGIFY.play(SONGIFY.recent[${i}])"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><span><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></span><em>▶</em></button>`).join('') : '<p class="songify-recent-empty">Your played tracks will appear here.</p>';
  },
  paintResults() { const el = document.getElementById('songify-results'); if (!el) return; if (this.busy) { el.innerHTML = '<p class="empty">Finding your next vibe…</p>'; return; } el.innerHTML = this.results.length ? this.results.map((s, i) => `<button class="songify-result" onclick="SONGIFY.play(SONGIFY.results[${i}])"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><span><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></span><em>${this.current?.streamUrl === s.streamUrl ? '●' : '▶'}</em></button>`).join('') : '<p class="empty">No results yet.</p>'; },
  share() { if (!this.current) return; GIST.nav('compose'); setTimeout(() => { const input = document.getElementById('gc_t'); if (input) { input.value = `🎵 Listening on Songify: ${this.current.title} — ${this.current.artist}`; input.dispatchEvent(new Event('input')); } }, 0); }
};
window.SONGIFY = SONGIFY;
