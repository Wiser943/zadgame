  /* Reels for P-Gist: full-screen vertical feed, direct browser-to-Mux upload, and support for the earlier P-Gist video API. */
const RL = {
  tab: 'foryou', L: { foryou: { p: [], more: false, ok: false }, following: { p: [], more: false, ok: false } }, i: 0, muted: true, obs: null, seen: new Set(), busy: false, start: '', tapT: 0, gen: 0,
  src(u) { return window.apiUrl ? window.apiUrl(u) : u },
  fmt(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n || '') },
  dur(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') },
  /* Mux streams HLS: native HLS where it works, otherwise hls.js; start with the previously working jsDelivr build. */
  hlsLib() { return this._hl || (this._hl = new Promise(resolve => {
    if (window.Hls) return resolve(true);
    const urls = ['https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js', 'https://unpkg.com/hls.js@1.5.17/dist/hls.min.js'];
    const next = () => {
      const url = urls.shift(); if (!url) return resolve(false); const s = document.createElement('script'); s.async = true; s.src = url; let done = false;
      const timer = setTimeout(() => { if (done) return; done = true; s.remove(); next() }, 10000);
      s.onload = () => { if (done) return; done = true; clearTimeout(timer); window.Hls ? resolve(true) : next() };
      s.onerror = () => { if (done) return; done = true; clearTimeout(timer); s.remove(); next() }; document.head.appendChild(s)
    };
    next()
  })) },
  saver() { const c = navigator.connection || {}; return !!(c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || '')) },
  dataLib() { return this._dl || (this._dl = new Promise(r => { if (window.mux) return r(true); const s = document.createElement('script'); s.src = 'https://src.litix.io/core/4/mux.js'; s.onload = () => r(!!window.mux); s.onerror = () => r(false); document.head.appendChild(s) })) },
  attach(v, near) {
    const u = v.dataset.src; if (!u || v._want === u || v._h) return; v._want = u;
      if (!/\.m3u8(?:\?|$)/i.test(u)) { v.onerror = () => this.playFail(v, this.playReason(v)); v.src = u; v.preload = 'auto'; v.load(); if (v._go) this.playReady(v); return }
    const native = v.canPlayType('application/vnd.apple.mpegurl');
    const useNative = () => {
      if (v._want !== u || !v.isConnected) return;
      v.onerror = () => { if (v._want !== u || !v.isConnected) return; v.onerror = null; this.hlsLib().then(ok => { if (ok && window.Hls && window.Hls.isSupported()) this.attachHls(v, u, near); else this.playFail(v, this.playReason(v)) }) };
      v.src = u; v.load(); if (v._go) this.playReady(v)
    };
    if (native === 'probably') { useNative(); return }
    this.hlsLib().then(ok => {
      if (v._want !== u || v._h || !v.isConnected) return;
      if (ok && window.Hls && window.Hls.isSupported()) this.attachHls(v, u, near);
      else if (native) useNative();
      else this.playFail(v, 'The HLS playback library could not load. Check the connection or browser content restrictions, then retry.')
    })
  },
  attachHls(v, u, near) {
    const H = window.Hls; if (v._want !== u || v._h || !v.isConnected || !H || !H.isSupported()) return;
    v.onerror = null; v.removeAttribute('src'); v.load();
    const sv = this.saver(), cf = this._cfg || {}, h = new H({ maxBufferLength: near ? 3 : 10, maxMaxBufferLength: 20, startLevel: 0, capLevelToPlayerSize: true, abrEwmaDefaultEstimate: sv ? 400000 : 1500000, enableWorker: true });
    v._h = h; let netRetries = 0, mediaRetries = 0;
    h.on(H.Events.MANIFEST_PARSED, (e, d) => { if (sv && d.levels && d.levels.length > 2) h.autoLevelCapping = 1; if (v._go) this.playReady(v) });
    h.on(H.Events.SUBTITLE_TRACKS_UPDATED, () => { h.subtitleDisplay = !!this.ccOn; h.subtitleTrack = this.ccOn ? 0 : -1 });
    h.on(H.Events.ERROR, (e, d) => {
      if (!d || !d.fatal || v._want !== u) return;
      if (d.type === H.ErrorTypes.NETWORK_ERROR && netRetries++ < 2) { h.startLoad(); return }
      if (d.type === H.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 1) { h.recoverMediaError(); return }
      const code = Number(d.response && d.response.code || d.data && d.data.response && d.data.response.code || 0);
      const reason = code === 403 || code === 401 ? `Mux denied this stream (HTTP ${code}). Check its playback policy or MUX signing-key settings.` : code === 404 ? 'Mux could not find this stream (HTTP 404). Check the stored playback ID and upload processing result.' : d.type === H.ErrorTypes.NETWORK_ERROR ? 'The HLS stream could not be fetched. Check the network, playback URL and Mux availability.' : d.type === H.ErrorTypes.MEDIA_ERROR ? 'This video stream could not be decoded. Try an MP4 encoded with H.264.' : 'The HLS player reported a fatal playback error.';
      this.playFail(v, reason)
    });
    h.loadSource(u); h.attachMedia(v); if (v._go) this.playReady(v);
    if (cf.dataKey && !v._md) { v._md = 1; const c = v.closest('.rl-card'); this.dataLib().then(k => { if (k && window.mux) try { mux.monitor(v, { debug: false, hlsjs: h, Hls: H, data: { env_key: cf.dataKey, video_id: c ? c.dataset.id : '', video_title: 'P-Gist reel', player_name: 'P-Gist reels' } }) } catch (e) { } }) }
  },
  playReady(v) {
    if (!v || !v._go) return; const c = v.closest('.rl-card'), p = v.play();
    if (p && p.then) p.then(() => { if (c) c.classList.remove('paused') }).catch(() => { if (c) c.classList.add('paused') });
    else if (c) c.classList.remove('paused')
  },
  playReason(v) {
    const code = v && v.error && v.error.code;
    if (code === 2) return 'A network error stopped the video. Check your connection and retry.';
    if (code === 3) return 'This browser could not decode the video. Try an MP4 encoded with H.264.';
    if (code === 4) return 'The video source is unavailable. Check the Mux playback URL and make sure its asset is public.';
    return 'The video source could not load. Check the connection and Mux playback configuration, then retry.';
  },
  playFail(v, reason) {
    const c = v && v.closest('.rl-card'); if (!c) return; c.classList.add('play-error', 'paused');
    if (!c.querySelector('.rl-error')) c.insertAdjacentHTML('beforeend', '<div class="rl-error"><div><i class="fa-solid fa-triangle-exclamation"></i><b>Video could not load</b><small></small><button type="button" onclick="RL.retry(this)">Tap to retry</button></div></div>');
    const small = c.querySelector('.rl-error small'); if (small) small.textContent = reason || this.playReason(v)
  },
  retry(button) {
    const c = button.closest('.rl-card'), v = c && c.querySelector('.rl-v'); if (!c || !v) return;
    c.classList.remove('play-error', 'paused'); const err = c.querySelector('.rl-error'); if (err) err.remove(); const i = Number(c.dataset.i) || 0; this.detach(v); this._hl = null; this.cur(i)
  },
  cc(btn) {
    this.ccOn = !this.ccOn; document.querySelectorAll('.rl-cc').forEach(b => b.classList.toggle('on', this.ccOn));
    document.querySelectorAll('.rl-v').forEach(v => { if (v._h) { v._h.subtitleDisplay = this.ccOn; v._h.subtitleTrack = this.ccOn ? 0 : -1 } else [...(v.textTracks || [])].forEach(t => { t.mode = this.ccOn ? 'showing' : 'disabled' }) });
    toast(this.ccOn ? 'Captions on' : 'Captions off')
  },
  detach(v) { v._want = ''; v.onerror = null; if (v._h) { try { v._h.destroy() } catch (e) { } v._h = null } v.pause(); v.removeAttribute('src'); v.load() },
  List() { return this.L[this.tab] },
  feedEl() { return document.getElementById('rlf') },
  compatPost(p) {
    if (!p || typeof p !== 'object') return p;
    if (p.video) {
      const v = p.video, id = String(v.playbackId || '').trim();
      const url = v.url || v.playbackUrl || (id ? `https://stream.mux.com/${id}.m3u8` : '');
      if (url && (/^https:\/\/stream\.mux\.com\/[A-Za-z0-9_-]{6,}\.m3u8(?:\?[^\s]*)?$/i.test(url))) {
        p.video = { ...v, kind: 'mux', url, dur: Number(v.dur || v.duration || 0), poster: v.poster || (id ? `https://image.mux.com/${id}/thumbnail.jpg?width=480&time=1` : ''), preview: v.preview || (id ? `https://image.mux.com/${id}/animated.webp?width=320&fps=10&start=0&end=4` : ''), cc: !!v.cc };
      }
    }
    if (p.shared && p.shared.video) this.compatPost(p.shared);
    return p;
  },
  async legacyConfig() {
    const r = await GIST.api('/videos/uploads/pending');
    if (!r || !Array.isArray(r.uploads)) throw new Error('The legacy video API returned an invalid response.');
    this._legacyApi = true;
    this._cfg = { mux: true, legacy: true, maxMB: 500, maxSec: 600, playbackPolicy: 'public' };
    return this._cfg;
  },
  async legacyFeed(first, last) {
    const q = new URLSearchParams({ tab: this.tab === 'following' ? 'clips-following' : 'clips' });
    if (!first && last && last.createdAt) q.set('before', last.createdAt);
    return GIST.api('/feed?' + q.toString());
  },
  /* ---------- the reels screen ---------- */
  show(startId) {
    this.stop(); this.cfg().catch(() => {}); this.start = startId || ''; this.openId = this.start; GIST.set('reels', this.start); PH.view = 'gist';
    const tabs = [['foryou', 'For you'], ['following', 'Following']];
    PH.shell('Reels', 'GIST.back()', `<div class="abody rlb" id="ab"><div class="rl-top"><button class="rl-back" onclick="GIST.back()" aria-label="Back"><i class="fa-solid fa-chevron-left"></i></button><div class="rl-tabs">${tabs.map(t => `<button class="${this.tab === t[0] ? 'on' : ''}" onclick="RL.setTab('${t[0]}')">${t[1]}</button>`).join('')}</div><span class="rl-sp"></span></div><div class="rl-feed" id="rlf"></div></div>`);
    const F = this.List(), first = startId && GIST.cache.get(startId); if (first) this.compatPost(first);
    if (first && first.video && !F.p.some(x => x.id === first.id)) F.p.unshift(first);
    if (F.p.length) this.draw();
    this.load(true)
  },
  setTab(t) { if (this.tab === t) return; this.stop(); this.tab = t; this.show('') },
  async load(first) {
    const F = this.List(), tab = this.tab, g = ++this.gen; if (this.busy && !first) return; this.busy = true;
    try {
      const last = F.p[F.p.length - 1], q = '?tab=' + tab + (tab === 'foryou' ? '&offset=' + (first ? 0 : F.next || 0) : (!first && last ? '&before=' + encodeURIComponent(last.createdAt) : ''));
      let r;
      if (this._legacyApi) r = await this.legacyFeed(first, last);
      else {
        try { r = await GIST.api('/reels' + q) }
        catch (e) {
          if (!e || e.status !== 404) throw e;
          try { await this.legacyConfig() } catch (legacyError) { throw e }
          r = await this.legacyFeed(first, last)
        }
      }
      if (tab !== this.tab) return;
      r.posts = (r.posts || []).map(p => this.compatPost(p));
      GIST.put(r.posts);
      if (first) {
        const keep = F.p.filter(x => x.id === this.openId && !r.posts.some(y => y.id === x.id));
        F.p = keep.concat(r.posts);
        if (this.openId) this.start = this.openId;
        this.openId = '';
      }
      else F.p = F.p.concat(r.posts.filter(x => !F.p.some(y => y.id === x.id)));
      F.more = r.more; F.ok = true; F.next = r.next || 0;
      if (first) this.draw(); else this.append(r.posts)
    } catch (e) { if (!F.ok && this.feedEl()) this.feedEl().innerHTML = `<div class="rl-empty"><p>Could not load reels.</p><button class="btn p" onclick="RL.load(true)">Try again</button></div>` }
    finally { this.busy = false }
  },
  empty() {
    return `<div class="rl-empty"><i class="fa-solid fa-clapperboard"></i><h3>${this.tab === 'following' ? 'Nothing from people you follow yet' : 'No reels yet'}</h3><p>${this.tab === 'following' ? 'Follow creators from For you to fill this feed.' : 'Be the first to post one!'}</p><button class="btn p" onclick="GIST.nav('compose','video')">Post a reel</button></div>`
  },
  card(p, i) {
    p = this.compatPost(p);
    const a = p.author, em = p.myRx ? RXE[p.myRx] : '';
    const fol = !p.mine ? `<button class="rl-fol ${a.following ? 'on' : ''}" data-a="${a.id}" onclick="event.stopPropagation();RL.follow('${a.id}')">${a.following ? 'Following' : 'Follow'}</button>` : '';
    return `<section class="rl-card" data-id="${p.id}" data-i="${i}" tabindex="0" role="group" aria-label="Reel ${i + 1} by ${esc(a.displayName || a.username || 'creator')}. Press Space to play or pause; use arrow keys to move between Reels."><video class="rl-v" playsinline webkit-playsinline loop preload="none" ${p.video && p.video.poster ? `poster="${esc(this.src(p.video.poster))}"` : ''} data-src="${esc(p.video && p.video.kind === 'mux' ? p.video.url : this.src(p.video && p.video.url || ''))}" ${this.muted ? 'muted' : ''}></video>
      <div class="rl-wash"></div><span class="rl-no">${String(i + 1).padStart(2, '0')}</span><div class="rl-pz"><i class="fa-solid fa-play"></i></div><div class="rl-burst"></div>
      ${p.video.cc ? `<button class="rl-cc ${this.ccOn ? 'on' : ''}" onclick="event.stopPropagation();RL.cc()" aria-label="Captions">CC</button>` : ''}
      <button class="rl-snd" onclick="event.stopPropagation();RL.snd()" aria-label="Sound"><i class="fa-solid ${this.muted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i></button>
      <div class="rl-info"><div class="rl-who" onclick="event.stopPropagation();RL.profile('${a.id}')">${PH.av({ avatar: a.avatar, displayName: a.displayName, username: a.username })}<span class="rl-nm"><b>${a.username ? '@' + esc(a.username) : esc(a.displayName)}${GIST.vb(a)}</b><i>${esc(a.displayName)} · ${GIST.ago(p.createdAt)}</i></span>${fol}</div>
      ${this.descHtml(p.text)}${p.views ? `<small class="rl-views"><i class="fa-solid fa-eye"></i> ${this.fmt(p.views)} views</small>` : ''}</div>
      <div class="rl-act"><button class="rl-more-btn" onclick="event.stopPropagation();RL.actions(this)" aria-label="More reel actions" aria-expanded="false"><span><i class="fa-solid fa-ellipsis"></i></span></button>
      <div class="rl-actions-menu" role="menu" aria-label="Reel actions"><button role="menuitem" class="lk ${p.myRx ? 'on' : ''}" data-action="like" onclick="event.stopPropagation();RL.action('${p.id}','like')" aria-label="Like"><span class="rl-like-ico">${p.myRx ? RXE[p.myRx] : '<i class="fa-solid fa-bolt"></i>'}</span><em>${this.fmt(p.likes) || 'Like'}</em></button>
      <button role="menuitem" data-action="comments" onclick="event.stopPropagation();RL.action('${p.id}','comments')" aria-label="Comments"><i class="fa-solid fa-comment-dots"></i><em>${this.fmt(p.comments) || 'Comments'}</em></button>
      <button role="menuitem" data-action="share" onclick="event.stopPropagation();RL.action('${p.id}','share')" aria-label="Share"><i class="fa-solid fa-share"></i><em>${this.fmt(p.shares) || 'Share'}</em></button>
      <button role="menuitem" data-action="save" onclick="event.stopPropagation();RL.action('${p.id}','save')" aria-label="${p.saved ? 'Remove saved Reel' : 'Save Reel'}"><i class="fa-${p.saved ? 'solid' : 'regular'} fa-bookmark"></i><em>${p.saved ? 'Saved' : 'Save Reel'}</em></button>
      <button role="menuitem" data-action="sound" onclick="event.stopPropagation();RL.action('${p.id}','sound')" aria-label="Toggle sound"><i class="fa-solid ${this.muted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i><em>${this.muted ? 'Unmute' : 'Mute'}</em></button>
      <button role="menuitem" data-action="options" onclick="event.stopPropagation();RL.action('${p.id}','options')" aria-label="More post options"><i class="fa-solid fa-ellipsis"></i><em>Post options</em></button></div></div>
      <div class="rl-bar"><i></i></div></section>`
  },
  draw() {
    const f = this.feedEl(); if (!f) return; const F = this.List();
    if (this.obs) this.obs.disconnect();
    const av = PH.$a(); if (av) av.classList.toggle('rlfull', !!F.p.length);
    if (!F.p.length) { f.innerHTML = F.ok ? this.empty() : '<div class="rl-empty"><span class="rl-spin"></span><p>Finding your next reel…</p></div>'; return }
    f.innerHTML = F.p.map((p, i) => this.card(p, i)).join(''); this.bind(f);
    const target = this.start || this.openId;
    let at = Math.max(0, F.p.findIndex(p => p.id === target)); this.start = '';
    requestAnimationFrame(() => { this.fit(); f.scrollTop = at * f.clientHeight; this.observe(); this.cur(at) })
  },
  append(posts) {
    const f = this.feedEl(); if (!f || !posts.length) return; const F = this.List(), n = f.querySelectorAll('.rl-card').length;
    const have = new Set([...f.querySelectorAll('.rl-card')].map(c => c.dataset.id));
    const add = F.p.filter(p => !have.has(p.id)); if (!add.length) return;
    f.insertAdjacentHTML('beforeend', add.map((p, k) => this.card(p, n + k)).join('')); this.fit(); this.observe()
  },
  fit() { const f = this.feedEl(); if (f) f.style.setProperty('--rlh', f.clientHeight + 'px') },
  bind(f) {
    if (f._b) return; f._b = 1;
    f.addEventListener('click', e => {
      const c = e.target.closest('.rl-card'); if (!c || e.target.closest('button,a,.rl-who')) return;
      const t = e.target.closest('[data-tag],[data-u]'); if (t) return;
      if (this.tapT) { clearTimeout(this.tapT); this.tapT = 0; this.dbl(c, e); return }
      this.tapT = setTimeout(() => { this.tapT = 0; this.toggle(c) }, 260)
    });
    f.addEventListener('keydown', e => {
      const c = e.target.closest('.rl-card'); if (!c) return;
      if (e.key === 'Escape') { c.classList.remove('actions-open'); const b = c.querySelector('.rl-more-btn'); if (b) { b.setAttribute('aria-expanded', 'false'); b.focus() } return }
      if (e.target.closest('button,a,input,textarea')) return;
      const idx = Number(c.dataset.i);
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.toggle(c) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); const n = f.querySelector(`.rl-card[data-i="${idx + 1}"]`); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); const n = f.querySelector(`.rl-card[data-i="${idx - 1}"]`); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
    });
    f.addEventListener('loadedmetadata', e => { const v = e.target; if (v.classList && v.classList.contains('rl-v')) v.classList.toggle('fit', v.videoWidth > v.videoHeight * 1.05) }, true);
    window.addEventListener('resize', () => this.fit())
  },
  observe() {
    const f = this.feedEl(); if (!f || !window.IntersectionObserver) return; if (this.obs) this.obs.disconnect();
    this.obs = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) this.cur(Number(en.target.dataset.i)) }), { root: f, threshold: 0.7 });
    f.querySelectorAll('.rl-card').forEach(c => this.obs.observe(c))
  },
  /* the clip on screen plays; neighbours are preloaded; far ones are released to save memory */
  cur(i) {
    const f = this.feedEl(); if (!f) return;
    if (this.i !== i) document.querySelectorAll('.rl-card.actions-open').forEach(c => { c.classList.remove('actions-open'); const b = c.querySelector('.rl-more-btn'); if (b) b.setAttribute('aria-expanded', 'false') });
    this.i = i; const cards = [...f.querySelectorAll('.rl-card')], F = this.List();
    cards.forEach((c, k) => {
      const v = c.querySelector('video'), d = Math.abs(k - i);
      const ahead = k - i, reach = this.saver() ? 1 : 3;   // data saver: preload 1 reel ahead, otherwise 3
      if ((d === 0 || (ahead >= 1 && ahead <= reach)) && !v.getAttribute('src') && !v._h && !v._want) this.attach(v, d > 0);
      if (k === i && v._h) v._h.config.maxBufferLength = 12;
      if ((ahead > reach || ahead < -1) && (v.getAttribute('src') || v._h)) this.detach(v);
      if (k === i) { c.classList.remove('paused'); v.muted = this.muted; v._go = 1; this.playReady(v) }
      else { v._go = 0; v.pause(); if (d > 0) try { v.currentTime = 0 } catch (e) { } }
      v.ontimeupdate = k === i ? () => { const b = c.querySelector('.rl-bar i'); if (b && v.duration) b.style.width = (v.currentTime / v.duration * 100) + '%' } : null
    });
    this.flushWatch(); const p = F.p[i]; if (!p) return; const cv = cards[i].querySelector('video'); this.w = { id: p.id, t: Date.now(), dur: p.video && p.video.dur || 0, last: 0, loops: 0 }; cv.ontimeupdate = () => { const b = cards[i].querySelector('.rl-bar i'); if (b && cv.duration) b.style.width = (cv.currentTime / cv.duration * 100) + '%'; if (this.w && cv.currentTime + 0.8 < this.w.last) this.w.loops++; if (this.w) this.w.last = cv.currentTime };
    if (GIST.cur && GIST.cur.fn === 'reels') GIST.cur.args = [p.id];
    if (!this.seen.has(p.id)) { this.seen.add(p.id); GIST.api('/posts/' + p.id + '/view', { method: 'POST' }).catch(() => { }) }
    if (F.more && i >= F.p.length - 3) this.load(false)
  },
  /* watch analytics: sent when you swipe away or leave (feeds the For you ranking) */
  flushWatch() {
    const w = this.w; this.w = null; if (!w) return; const ms = Date.now() - w.t; if (ms < 700) return;
    const body = JSON.stringify({ ms, completed: w.loops > 0 || (w.dur && ms >= w.dur * 900) });
    try { fetch(this.src('/api/ac/gist/posts/' + w.id + '/watch'), { method: 'POST', keepalive: true, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body }).catch(() => { }) } catch (e) { }
  },
  toggle(c) { const v = c.querySelector('video'); if (v.paused) { v._go = 1; this.playReady(v) } else { v._go = 0; v.pause(); c.classList.add('paused') } },
  dbl(c, e) {
    const id = c.dataset.id, p = GIST.cache.get(id); if (p && !p.myRx) GIST.react(id, 'like');
    const b = c.querySelector('.rl-burst'), r = c.getBoundingClientRect(); b.innerHTML = `<i class="fa-solid fa-bolt" style="left:${e.clientX - r.left}px;top:${e.clientY - r.top}px"></i>`; const h = b.firstChild; h.getBoundingClientRect(); h.classList.add('go'); setTimeout(() => { b.innerHTML = '' }, 700)
  },
  snd() { this.muted = !this.muted; document.querySelectorAll('.rl-v').forEach(v => { v.muted = this.muted }); this.sndIcons(); const v = this.feedEl() && this.feedEl().querySelectorAll('.rl-v')[this.i]; if (v && v.paused && !v.closest('.rl-card').classList.contains('paused')) this.playReady(v) },
  sndIcons() {
    document.querySelectorAll('.rl-snd i,[data-action="sound"] i').forEach(i => { i.className = 'fa-solid ' + (this.muted ? 'fa-volume-xmark' : 'fa-volume-high') });
    document.querySelectorAll('[data-action="sound"] em').forEach(e => { e.textContent = this.muted ? 'Unmute' : 'Mute' })
  },
  actions(btn) {
    const card = btn.closest('.rl-card'), open = !card.classList.contains('actions-open');
    document.querySelectorAll('.rl-card.actions-open').forEach(c => { c.classList.remove('actions-open'); const b = c.querySelector('.rl-more-btn'); if (b) b.setAttribute('aria-expanded', 'false') });
    if (open) { card.classList.add('actions-open'); btn.setAttribute('aria-expanded', 'true') }
  },
  action(id, kind) {
    const card = document.querySelector(`.rl-card[data-id="${id}"]`); if (card) { card.classList.remove('actions-open'); const b = card.querySelector('.rl-more-btn'); if (b) b.setAttribute('aria-expanded', 'false') }
    if (kind === 'like') GIST.react(id, 'like');
    else if (kind === 'comments') this.comments(id);
    else if (kind === 'share') GIST.shareSheet(id);
    else if (kind === 'save') GIST.toggleSaved(id);
    else if (kind === 'sound') this.snd();
    else if (kind === 'options') GIST.menu(id)
  },
  sync(id) {
    const p = GIST.cache.get(id); if (!p) return;
    document.querySelectorAll(`.rl-card[data-id="${id}"]`).forEach(c => {
      const l = c.querySelector('[data-action="like"]'); l.classList.toggle('on', !!p.myRx); l.querySelector('.rl-like-ico').innerHTML = p.myRx ? RXE[p.myRx] : '<i class="fa-solid fa-bolt"></i>'; l.querySelector('em').textContent = this.fmt(p.likes) || 'Like';
      const m = c.querySelector('[data-action="comments"] em'), s = c.querySelector('[data-action="share"] em'), save = c.querySelector('[data-action="save"]'); if (m) m.textContent = this.fmt(p.comments) || 'Comments'; if (s) s.textContent = this.fmt(p.shares) || 'Share'; if (save) { save.setAttribute('aria-label', p.saved ? 'Remove saved Reel' : 'Save Reel'); save.querySelector('em').textContent = p.saved ? 'Saved' : 'Save Reel'; save.querySelector('i').className = 'fa-' + (p.saved ? 'solid' : 'regular') + ' fa-bookmark' }
    })
  },
  follow(aid) {
    const all = Object.values(this.L).flatMap(F => F.p).filter(p => p.author.id === aid); if (!all.length) return;
    const was = !!all[0].author.following, set = v => { all.forEach(p => { p.author.following = v }); document.querySelectorAll(`.rl-fol[data-a="${aid}"]`).forEach(b => { b.classList.toggle('on', v); b.textContent = v ? 'Following' : 'Follow' }) };
    set(!was); Object.values(GIST.F).forEach(f => f.stale = true);
    GIST.api('/follow/' + aid, { method: 'POST' }).then(r => set(r.following)).catch(e => { set(was); GIST.err(e) })
  },
  profile(id) { this.stop(); GIST.nav('profile', id) },
  comments(id) { this.stop(); GIST.nav('post', id) },
  removed(id) { Object.values(this.L).forEach(F => { F.p = F.p.filter(x => x.id !== id) }); this.start = ''; this.draw() },
  stop() { this.flushWatch(); if (this.obs) { this.obs.disconnect(); this.obs = null } clearTimeout(this.tapT); this.tapT = 0; document.querySelectorAll('.rl-v,.gvid video').forEach(v => { try { v.pause() } catch (e) { } }) },
  async openFrom(id) {
    if (!GIST.cache.has(id)) {
      try { const r = await GIST.api('/posts/' + encodeURIComponent(id)); if (r && r.post) GIST.put([this.compatPost(r.post)]) }
      catch (e) { /* Continue with the feed; the server may still return the clip in its Reel page. */ }
    }
    GIST.nav('reels', id)
  },

  /* ---------- posting a reel (called from the gist composer) ---------- */
  cfg() {
    if (this._cfg) return Promise.resolve(this._cfg);
    const oldApi = async () => { try { return await this.legacyConfig() } catch (e) { if (e && e.status === 404) return null; throw e } };
    const normalize = c => {
      if (!c || typeof c !== 'object') return null;
      const mux = typeof c.mux === 'boolean' ? c.mux : typeof c.enabled === 'boolean' ? c.enabled : typeof c.videoEnabled === 'boolean' ? c.videoEnabled : typeof c.uploadsEnabled === 'boolean' ? c.uploadsEnabled : null;
      if (mux === null) return null;
      return { ...c, mux, maxMB: Number(c.maxMB || c.maxSizeMB || 500), maxSec: Number(c.maxSec || c.maxDurationSec || 600) };
    };
    return GIST.api('/reels/config').then(async c => {
      const conf = normalize(c);
      if (!conf) {
        const old = await oldApi(); if (old) return old;
        // Configuration endpoints from early deployments used several shapes. Let the actual
        // upload route provide the precise failure instead of blocking the picker here.
        this._legacyApi = false; this._cfg = { mux: true, maxMB: 500, maxSec: 600, configUnknown: true }; return this._cfg
      }
      if (!conf.mux) { const old = await oldApi(); if (old) return old }
      this._legacyApi = false; this._cfg = conf; return conf
    }).catch(async e => {
      if (e && e.status === 404) {
        const old = await oldApi();
        if (old) return old;
        // Some earlier builds had the upload route but no config endpoint.
        this._legacyApi = false; this._cfg = { mux: true, maxMB: 500, maxSec: 600, configUnknown: true }; return this._cfg
      }
      throw e
    })
  },
  async pick() {
    const C = GIST.C; if (!C) return; let cf;
    try { cf = await this.cfg() } catch (e) { return toast(e.message || 'Could not check video setup. Check the server connection.') }
    if (!cf.mux) {
      const missing = Array.isArray(cf.missing) && cf.missing.length ? cf.missing.join(' and ') : 'MUX_TOKEN_ID and MUX_TOKEN_SECRET';
      return toast('Video uploads are disabled on the server. Missing: ' + missing + '. Add these in your host settings, then restart the app.');
    }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'video/mp4,video/webm,video/quicktime,video/*'; inp.style.display = 'none';
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) this.prepare(f) }; document.body.appendChild(inp); inp.click()
  },
  prepare(file) {
    const C = GIST.C; if (!C) return; const cf = this._cfg || { maxMB: 25, maxSec: 60 }, MAX = cf.maxMB * 1048576;
    if (file.size > MAX) return toast('That video is ' + (file.size / 1048576).toFixed(0) + ' MB. Keep it under ' + cf.maxMB + ' MB (try a shorter clip).');
    if (file.type && !/^video\/(mp4|webm|quicktime)$/.test(file.type)) return toast('Please use an MP4, MOV or WebM video.');
    const url = URL.createObjectURL(file), v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'metadata'; let done = false;
    const fail = () => { if (done) return; done = true; URL.revokeObjectURL(url); toast('This browser could not read that video. Try an MP4 (H.264).') };
    const t = setTimeout(fail, 12000);
    v.onerror = () => { clearTimeout(t); fail() };
    v.onloadedmetadata = () => {
      if (v.duration > cf.maxSec + 0.5) { done = true; clearTimeout(t); URL.revokeObjectURL(url); return toast('Reels can be up to ' + (cf.maxSec >= 120 ? cf.maxSec / 60 + ' minutes' : cf.maxSec + ' seconds') + '. Yours is ' + Math.round(v.duration) + 's.') }
      try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2) } catch (e) { }
    };
    v.onseeked = () => {
      if (done) return; done = true; clearTimeout(t);
      let poster = ''; try { const s = Math.min(1, 480 / (v.videoWidth || 480)), c = document.createElement('canvas'); c.width = Math.round((v.videoWidth || 480) * s); c.height = Math.round((v.videoHeight || 854) * s); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); poster = c.toDataURL('image/jpeg', 0.72) } catch (e) { }
      if (!GIST.C) return URL.revokeObjectURL(url);
      if (GIST.C.video) URL.revokeObjectURL(GIST.C.video.url);
      if (GIST.C.images.length) { GIST.C.images = []; toast('A post has photos or a video, so your photos were removed.') }
      GIST.C.video = { file, url, poster, dur: v.duration || 0, w: v.videoWidth, h: v.videoHeight }; GIST.C.set = GIST.C.set || { visibility: 'public', allowComments: true, allowReuse: true }; GIST.attDraw(); this.editor()
    };
    v.src = url
  },
  prevHtml(C) {
    const V = C.video; if (!V) return ''; const T = C.set = C.set || { visibility: 'public', allowComments: true, allowReuse: true };
    return `<div class="rl-prev"><video src="${V.url}" ${V.poster ? `poster="${V.poster}"` : ''} controls playsinline muted preload="metadata"></video><button onclick="RL.rm()" aria-label="Remove video"><i class="fa-solid fa-xmark"></i></button><small><i class="fa-solid fa-clapperboard"></i> ${this.dur(V.dur)} · ${(V.file.size / 1048576).toFixed(1)} MB</small></div>
      <button class="fopt" onclick="RL.editor()"><span><i class="fa-solid fa-wand-magic-sparkles"></i> Edit video (crop, mirror, speed, trim)</span></button>
      <div class="rl-set"><div class="lab2">STEP 2 OF 2 · POST SETTINGS</div>
        <div class="sr"><span><b>Who can watch</b><small>Followers-only and private videos are hidden from everyone else</small></span><select onchange="RL.setOpt('visibility',this.value)"><option value="public" ${T.visibility === 'public' ? 'selected' : ''}>Everyone</option><option value="followers" ${T.visibility === 'followers' ? 'selected' : ''}>Followers</option><option value="private" ${T.visibility === 'private' ? 'selected' : ''}>Only me</option></select></div>
        <div class="sr"><span><b>Allow comments</b><small>Let people comment on this video</small></span><label class="sw"><input type="checkbox" ${T.allowComments ? 'checked' : ''} onchange="RL.setOpt('allowComments',this.checked)"><i></i></label></div>
        <div class="sr"><span><b>Allow reuse</b><small>Let others repost this video to their feed</small></span><label class="sw"><input type="checkbox" ${T.allowReuse ? 'checked' : ''} onchange="RL.setOpt('allowReuse',this.checked)"><i></i></label></div>
        <small style="opacity:.7">Every video goes live as "Under review". If it does not follow the rules it can be flagged and hidden, and you can request a review.</small></div>`
  },
  setOpt(k, v) { if (GIST.C && GIST.C.set) GIST.C.set[k] = v },
  /* ---------- step 1 of 2: edit the video (crop to a ratio, mirror, speed, trim). The edits are baked into the file just before step 2. ---------- */
  editor() {
    const C = GIST.C, V = C && C.video, host = PH.$a(); if (!V || !host) return;
    const old = host.querySelector('.rl-edit'); if (old) old.remove();
    const dur = Math.max(0.5, V.dur || 1), E = this.E = { ar: 'orig', mirror: false, speed: 1, start: 0, end: dur, bright: 0, contrast: 0, sat: 0 }; this._dur = dur; this.tool = '';
    const T = [['trim', 'fa-scissors', 'Trim'], ['speed', 'fa-gauge-high', 'Speed'], ['transform', 'fa-crop-simple', 'Transform'], ['mirror', 'fa-left-right', 'Mirror'], ['adjust', 'fa-sliders', 'Adjust']];
    const el = document.createElement('div'); el.className = 'rl-edit'; el.innerHTML = `<div class="rle-top"><button class="rle-ib sq" onclick="RL.editClose(false)" aria-label="Close editor"><i class="fa-solid fa-xmark"></i></button><b>Edit video<span class="rle-step">Step 1 of 2</span></b><button class="rle-ib" onclick="RL.editClose(false)">Skip</button></div>
      <div class="rle-stage" id="rle_stage"><div class="rle-box" id="rle_box"><video id="rle_v" src="${V.url}" playsinline muted loop autoplay></video></div></div>
      <div class="rle-panel" id="rle_panel"></div>
      <div class="rle-bar" id="rle_bar">${T.map(t => `<button class="rle-tb" data-t="${t[0]}" onclick="RL.edTool('${t[0]}')"><i class="fa-solid ${t[1]}"></i><span>${t[2]}</span></button>`).join('')}</div>
      <div class="rle-go"><button class="btn p" id="rle_next" onclick="RL.editClose(true)">Next</button></div>`;
    host.appendChild(el); this._edUp = () => this.edLayout(); window.addEventListener('resize', this._edUp); this.edLayout(); this.edApply();
    const v = $('rle_v'); if (v) { v.ontimeupdate = () => { if (v.currentTime >= E.end - 0.05 || v.currentTime < E.start - 0.2) v.currentTime = E.start }; v.onloadedmetadata = () => { this.edLayout() }; v.play().catch(() => { }) }
  },
  /* tapping a tool opens just its options above the toolbar (tap it again, or the tick, to close). Mirror flips straight away. */
  edTool(t) {
    if (t === 'mirror') { this.edSet('mirror', !this.E.mirror); return }
    this.tool = this.tool === t ? '' : t; this.edPanel(); this.edApply(); requestAnimationFrame(() => this.edLayout())
  },
  edPanel() {
    const pn = $('rle_panel'), t = this.tool, E = this.E; if (!pn) return; if (!t) { pn.className = 'rle-panel'; pn.innerHTML = ''; return }
    const chip = (k, val, label) => `<button data-c="${k}:${val}" onclick="RL.edSet('${k}',${typeof val === 'string' ? `'${val}'` : val})">${label}</button>`;
    const sl = (k, label, v) => `<div class="rle-sl"><label>${label}</label><input type="range" min="-50" max="50" step="1" value="${v}" oninput="RL.edAdj('${k}',this.value)"><span id="rle_v_${k}">${v}</span></div>`;
    const title = { trim: 'Trim', speed: 'Speed', transform: 'Transform', adjust: 'Adjust' }[t];
    const body = t === 'trim' ? `<div class="rle-sl"><label>Start</label><input type="range" id="rle_s" min="0" max="${this._dur}" step="0.1" value="${E.start}" oninput="RL.edTrim()"><span id="rle_sv">${E.start.toFixed(1)}s</span></div><div class="rle-sl"><label>End</label><input type="range" id="rle_e" min="0" max="${this._dur}" step="0.1" value="${E.end}" oninput="RL.edTrim()"><span id="rle_ev">${E.end.toFixed(1)}s</span></div>`
      : t === 'speed' ? `<div class="rle-chips">${[0.5, 0.75, 1, 1.5, 2].map(x => chip('speed', x, x + 'x')).join('')}</div>`
      : t === 'transform' ? `<div class="rle-chips">${[['orig', 'Original'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:5', '4:5'], ['16:9', '16:9']].map(x => chip('ar', x[0], x[1])).join('')}</div><p class="rle-hint">The video is cropped from the centre to fit the ratio.</p>`
      : `${sl('bright', 'Brightness', E.bright)}${sl('contrast', 'Contrast', E.contrast)}${sl('sat', 'Saturation', E.sat)}<button class="rle-reset" onclick="RL.edReset()">Reset</button>`;
    pn.className = 'rle-panel open'; pn.innerHTML = `<div class="rle-ph"><b>${title}</b><button class="rle-ib sq" onclick="RL.edTool('${t}')" aria-label="Done"><i class="fa-solid fa-check"></i></button></div>${body}`
  },
  edRatio() { const V = GIST.C && GIST.C.video, a = this.E.ar; if (a === 'orig') return (V && V.w && V.h) ? V.w / V.h : 9 / 16; const [w, h] = a.split(':').map(Number); return w / h },
  edLayout() { const st = $('rle_stage'), bx = $('rle_box'); if (!st || !bx) return; const W = st.clientWidth - 28, H = st.clientHeight - 12, r = this.edRatio(), w = Math.max(60, Math.min(W, H * r)), h = w / r; bx.style.width = w + 'px'; bx.style.height = h + 'px' },
  /* CSS filter text for the colour sliders (also used when the edit is baked into the file) */
  edFilter(E) { E = E || this.E; if (!E.bright && !E.contrast && !E.sat) return ''; return `brightness(${(1 + E.bright / 100).toFixed(2)}) contrast(${(1 + E.contrast / 100).toFixed(2)}) saturate(${(1 + E.sat / 50).toFixed(2)})` },
  edApply() {
    const E = this.E, v = $('rle_v'); if (v) { v.style.transform = E.mirror ? 'scaleX(-1)' : ''; v.style.filter = this.edFilter(E); v.playbackRate = E.speed }
    document.querySelectorAll('.rle-chips [data-c]').forEach(b => { const d = b.dataset.c, i = d.indexOf(':'), k = d.slice(0, i), val = d.slice(i + 1); b.classList.toggle('on', String(E[k]) === val) });
    const mod = { trim: E.start > 0.05 || E.end < this._dur - 0.05, speed: E.speed !== 1, transform: E.ar !== 'orig', mirror: E.mirror, adjust: !!(E.bright || E.contrast || E.sat) };
    document.querySelectorAll('#rle_bar [data-t]').forEach(b => { const t = b.dataset.t; b.classList.toggle('on', this.tool === t || (t === 'mirror' && E.mirror)); b.classList.toggle('mod', !!mod[t]) }); this.edLayout()
  },
  edSet(k, v) { this.E[k] = v; this.edApply() },
  edAdj(k, val) { this.E[k] = Number(val); const o = $('rle_v_' + k); if (o) o.textContent = val; this.edApply() },
  edReset() { Object.assign(this.E, { bright: 0, contrast: 0, sat: 0 }); this.edPanel(); this.edApply() },
  edTrim() { const E = this.E, s = $('rle_s'), e = $('rle_e'); let a = Number(s.value), b = Number(e.value); if (b - a < 0.5) { if (document.activeElement === s) { a = Math.max(0, b - 0.5); s.value = a } else { b = Math.min(Number(e.max), a + 0.5); e.value = b } } E.start = a; E.end = b; $('rle_sv').textContent = a.toFixed(1) + 's'; $('rle_ev').textContent = b.toFixed(1) + 's'; const v = $('rle_v'); if (v && (v.currentTime < a || v.currentTime > b)) v.currentTime = a; this.edApply() },
  async editClose(apply) {
    const C = GIST.C, V = C && C.video, host = PH.$a(), el = host && host.querySelector('.rl-edit'); if (!V) { if (el) el.remove(); return }
    const E = this.E, finish = () => { window.removeEventListener('resize', this._edUp); if (el) el.remove(); GIST.attDraw(); const t = $('gc_t'); if (t && !('ontouchstart' in window)) t.focus() };
    if (!apply) return finish();
    const nb = $('rle_next'); if (nb) { nb.disabled = true; nb.textContent = 'Applying edits…' }
    try {
      const r = await this.bake(V, E, f => { const b = $('rle_next'); if (b) b.textContent = 'Applying edits ' + Math.round(f * 100) + '%' });
      if (r.file !== V.file) { URL.revokeObjectURL(V.url); V.file = r.file; V.url = URL.createObjectURL(r.file); V.w = r.w; V.h = r.h; V.dur = r.dur; V.poster = '' }
    } catch (e) { toast('Could not apply the edits, so your original video will be used.') }
    finish()
  },
  /* draws the video frame by frame to a canvas (crop + mirror), plays it at the chosen speed between start and end and records it again */
  async bake(V, E, onp) {
    const file = V.file, plain = { file, w: V.w, h: V.h, dur: V.dur };
    const same = E.ar === 'orig' && !E.mirror && E.speed === 1 && E.start < 0.05 && E.end >= V.dur - 0.05 && !this.edFilter(E); if (same) return plain;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream || !(window.AudioContext || window.webkitAudioContext)) { toast('This browser cannot apply video edits, so your original video will be posted.'); return plain }
    const mimes = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], mime = mimes.find(m => MediaRecorder.isTypeSupported(m)); if (!mime) return plain;
    const v = document.createElement('video'); v.src = V.url; v.playsInline = true; v.muted = false; v.preload = 'auto';
    await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; setTimeout(no, 10000) });
    const sw = v.videoWidth, sh = v.videoHeight, r = this.edRatio(); let cw = sw, ch = sh, cx = 0, cy = 0;
    if (sw / sh > r) { cw = sh * r; cx = (sw - cw) / 2 } else { ch = sw / r; cy = (sh - ch) / 2 }
    const sc = Math.min(1, 1280 / Math.max(cw, ch)), ow = Math.max(2, Math.round(cw * sc / 2) * 2), oh = Math.max(2, Math.round(ch * sc / 2) * 2), cv = document.createElement('canvas'); cv.width = ow; cv.height = oh; const g = cv.getContext('2d');
    const AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), dest = ac.createMediaStreamDestination(); ac.createMediaElementSource(v).connect(dest);
    const st = cv.captureStream(30); dest.stream.getAudioTracks().forEach(t => st.addTrack(t));
    const rec = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: 3000000, audioBitsPerSecond: 96000 }), chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) };
    const stopped = new Promise(res => { rec.onstop = res });
    v.currentTime = E.start; await new Promise(res => { v.onseeked = res; setTimeout(res, 1500) }); v.playbackRate = E.speed; try { v.preservesPitch = true } catch (e) { }
    const span = Math.max(0.5, E.end - E.start); let alive = true;
    const stop = () => { if (!alive) return; alive = false; try { rec.stop() } catch (e) { } v.pause() };
    let flt = this.edFilter(E); if (flt && !('filter' in g)) { flt = ''; toast('This browser cannot apply colour adjustments, so they were skipped.') }
    const draw = () => { if (!alive) return; g.save(); if (flt) g.filter = flt; if (E.mirror) { g.translate(ow, 0); g.scale(-1, 1) } g.drawImage(v, cx, cy, cw, ch, 0, 0, ow, oh); g.restore(); onp(Math.min(0.99, (v.currentTime - E.start) / span)); if (v.currentTime >= E.end - 0.03) return stop(); v.requestVideoFrameCallback ? v.requestVideoFrameCallback(draw) : requestAnimationFrame(draw) };
    const guard = setTimeout(stop, span / E.speed * 1000 + 15000); v.onended = stop;
    rec.start(500); await ac.resume(); await v.play(); draw(); await stopped; clearTimeout(guard); ac.close().catch(() => { });
    const blob = new Blob(chunks, { type: mime.split(';')[0] }); if (!blob.size) return plain;
    return { file: new File([blob], 'reel.' + (blob.type.includes('mp4') ? 'mp4' : 'webm'), { type: blob.type }), w: ow, h: oh, dur: span / E.speed }
  },
  /* "Learn more" on a flagged video: why, what it means and what the creator can do (like TikTok) */
  learnMore(id) {
    const c = GIST.cache.get(id), m = c && c.moderation; if (!m) return; const L = m.learn || { title: 'Community guidelines', why: m.reason || 'This video may not follow our rules.', fix: 'Post videos that follow the community guidelines.' };
    const what = m.status === 'appealed' ? 'Your review request is with the team. We will tell you what they decide.' : m.status === 'rejected' ? 'The team checked your video again and it stays hidden. You can delete it.' : 'Only you can see this video. It is hidden from everyone else until it is reviewed.';
    PH.sheet(`<h3>${esc(L.title)}</h3><p style="margin:6px 0 10px;line-height:1.45"><b>Why:</b> ${esc(m.reason || L.why)}</p><p style="margin:0 0 10px;line-height:1.45"><b>What this means:</b> ${esc(what)}</p><p style="margin:0 0 12px;line-height:1.45"><b>What you can do:</b> ${esc(L.fix)}</p>${m.reviewNote ? `<p style="margin:0 0 12px;line-height:1.45"><b>Note from the team:</b> ${esc(m.reviewNote)}</p>` : ''}${m.canAppeal ? `<button class="fopt" onclick="PH.closeSheet();RL.appealSheet('${id}',${esc(JSON.stringify(m.reason || ''))})"><span><i class="fa-solid fa-flag"></i> Request a review</span></button>` : ''}<button class="fopt red out" onclick="RL.delMine('${id}')"><span><i class="fa-solid fa-trash"></i> Delete this video</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Close</span></button>`)
  },
  async delMine(id) { if (!confirm('Delete this video for good?')) return; try { await GIST.api('/posts/' + id, { method: 'DELETE' }); GIST.cache.delete(id); PH.closeSheet(); toast('Video deleted'); this.goFeed() } catch (e) { GIST.err(e) } },
  rm() { const C = GIST.C; if (C && C.video) { URL.revokeObjectURL(C.video.url); C.video = null; GIST.attDraw() } },
  online() { return new Promise(r => { if (navigator.onLine) return r(); const f = () => { window.removeEventListener('online', f); r() }; window.addEventListener('online', f) }) },
  /* Proven direct-upload path: send the complete selected file from the browser to Mux. The Node server only creates the signed upload URL and checks processing status. */
  async xhr(file, onp, url) {
    onp(0);
    await new Promise((resolve, reject) => {
      const req = new XMLHttpRequest(); req.open('PUT', url, true); req.timeout = 45 * 60 * 1000;
      req.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      req.upload.onprogress = e => { if (e.lengthComputable) onp(Math.min(1, e.loaded / e.total)) };
      req.onload = () => {
        if (req.status >= 200 && req.status < 300) { onp(1); resolve(); return }
        let detail = ''; try { const j = JSON.parse(req.responseText); detail = j.error && (j.error.message || (j.error.messages || []).join(', ')) || '' } catch (e) {}
        reject(new Error(detail || `Mux rejected the video upload (HTTP ${req.status}). Check the Mux upload URL and app-origin CORS settings.`))
      };
      req.onerror = () => reject(new Error('Could not connect to Mux. Check your connection and the Mux upload CORS origin.'));
      req.ontimeout = () => reject(new Error('The upload timed out. Try again on a stable connection.'));
      req.onabort = () => reject(new Error('The upload was cancelled.'));
      req.send(file)
    })
  },
  /* shrink big phone videos to 720p before uploading (saves data + time + Mux cost). Falls back to the original on any problem. */
  async optimize(V, onp) {
    const file = V.file;
    try {
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream || !(window.AudioContext || window.webkitAudioContext)) return file;
      if (!(file.size > 30 * 1048576 || Math.max(V.w || 0, V.h || 0) > 1280) || V.dur > 90 || V.dur < 1) return file;
      const mimes = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], mime = mimes.find(m => MediaRecorder.isTypeSupported(m)); if (!mime) return file;
      const v = document.createElement('video'); v.src = V.url; v.playsInline = true; v.muted = false; await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; setTimeout(no, 8000) });
      const sc = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)), w = Math.round(v.videoWidth * sc / 2) * 2, h = Math.round(v.videoHeight * sc / 2) * 2, cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
      const AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), dest = ac.createMediaStreamDestination(); ac.createMediaElementSource(v).connect(dest);   // audio goes to the recorder, not the speakers
      const st = cv.captureStream(30); dest.stream.getAudioTracks().forEach(t => st.addTrack(t));
      const rec = new MediaRecorder(st, { mimeType: mime, videoBitsPerSecond: 2500000, audioBitsPerSecond: 96000 }), chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) };
      const done = new Promise(r => { rec.onstop = r });
      let alive = true; const draw = () => { if (!alive) return; g.drawImage(v, 0, 0, w, h); onp(Math.min(0.99, v.currentTime / v.duration)); v.requestVideoFrameCallback ? v.requestVideoFrameCallback(draw) : requestAnimationFrame(draw) }; draw();
      const guard = setTimeout(() => { alive = false; try { rec.stop() } catch (e) { } v.pause() }, V.dur * 2000 + 15000);
      rec.start(500); await ac.resume(); await v.play(); await new Promise(r => { v.onended = r }); alive = false; clearTimeout(guard); rec.stop(); await done; v.pause(); ac.close().catch(() => { });
      const blob = new Blob(chunks, { type: mime.split(';')[0] }); if (!blob.size || blob.size >= file.size * 0.9) return file;
      return new File([blob], 'reel.' + (blob.type.includes('mp4') ? 'mp4' : 'webm'), { type: blob.type })
    } catch (e) { return file }
  },
  finishPublish(post, V) {
    post = this.compatPost(post); URL.revokeObjectURL(V.url); GIST.clearDraft(); GIST.C = null; GIST.put([post]); GIST.cache.set(post.id, post); GIST.afterPost(post, '');
    this.L.foryou.p = [post, ...this.L.foryou.p.filter(p => p.id !== post.id)]; this.L.foryou.ok = true; this.tab = 'foryou'; GIST.stack = [{ fn: 'feed', args: [], scroll: 0 }]; toast(post.moderation && post.moderation.status === 'review' ? 'Reel posted · under review' : 'Reel posted ✓'); this.show(post.id)
  },
  /* file fingerprint = SHA-256 of the first + last 2 MB and the size; lets the server spot someone re-uploading another creator's clip */
  async fp(file) {
    try {
      const n = 2 * 1024 * 1024, a = new Uint8Array(await file.slice(0, n).arrayBuffer()), b = new Uint8Array(await file.slice(Math.max(0, file.size - n)).arrayBuffer()), z = new TextEncoder().encode(String(file.size));
      const all = new Uint8Array(a.length + b.length + z.length); all.set(a, 0); all.set(b, a.length); all.set(z, a.length + b.length);
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', all))].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32)
    } catch (e) { return '' }
  },
  /* the originality check held this reel: it is not public yet, the creator is told why and can appeal */
  heldPublish(post, V, flag) {
    try { URL.revokeObjectURL(V.url) } catch (e) { } GIST.clearDraft(); GIST.C = null; post = this.compatPost(post); GIST.put([post]); GIST.cache.set(post.id, post);
    GIST.stack = [{ fn: 'feed', args: [], scroll: 0 }]; toast('Reel held for review'); GIST.nav('post', post.id); setTimeout(() => this.appealSheet(post.id, flag && flag.reason), 350)
  },
  appealSheet(id, reason) {
    PH.sheet(`<h3>Reel held for review</h3><p style="margin:6px 0 10px;line-height:1.45">${esc(reason || 'This video may not be original.')}</p><p class="muted" style="margin:0 0 8px;font-size:12.5px">If this is your own video, tell us why and an admin will watch it and decide.</p><textarea id="rl_ap" maxlength="500" rows="3" placeholder="e.g. I filmed this myself" style="width:100%;box-sizing:border-box"></textarea><button class="fopt" id="rl_apb" onclick="RL.sendAppeal('${id}')"><span><i class="fa-solid fa-paper-plane"></i> Appeal</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Not now</span></button>`)
  },
  async sendAppeal(id) {
    const t = $('rl_ap'), b = $('rl_apb'); if (b) b.disabled = true;
    try { await GIST.api('/posts/' + id + '/appeal', { method: 'POST', body: { text: t ? t.value : '' } }); PH.closeSheet(); toast('Appeal sent. An admin will review it.'); const c = GIST.cache.get(id); if (c && c.moderation) c.moderation.status = 'appealed'; if (GIST.cur && GIST.cur.fn === 'post') GIST.nav('post', id) }
    catch (e) { if (b) b.disabled = false; GIST.err(e) }
  },
  async publishLegacy(C, V, set) {
    const upload = await GIST.api('/videos/uploads', { method: 'POST', body: { caption: C.text, fileSize: V.file.size, contentType: V.file.type || 'application/octet-stream' } });
    if (!upload || !upload.uploadId || !upload.uploadUrl) throw new Error('The earlier P-Gist upload API did not return a Mux URL.');
    await this.xhr(V.file, f => set('Uploading ' + Math.round(f * 100) + '%'), upload.uploadUrl); set('Processing…');
    for (let n = 0; n < 180; n++) {
      const state = await GIST.api('/videos/uploads/' + encodeURIComponent(upload.uploadId));
      if (state.status === 'ready' && state.post) { this.finishPublish(state.post, V); return }
      if (state.status === 'failed') throw new Error(state.message || 'Mux could not process this clip. Try an MP4 (H.264).');
      set(state.status === 'processing' ? 'Processing…' : 'Finishing upload…');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error('The clip is still processing on Mux. Wait a few minutes and check Reels before uploading it again.');
  },
  async publish() {
    const C = GIST.C; if (!C || !C.video || C.busy) return; C.busy = true; C.text = ($('gc_t') && $('gc_t').value) || C.text; const V = C.video, b = $('gc_b'), set = t => { const e = $('gc_b'); if (e) { e.disabled = true; e.textContent = t } }; set('Uploading 0%');
    try {
      if (this._legacyApi) return await this.publishLegacy(C, V, set);
      let m;
      try { m = await GIST.api('/reels/mux-upload', { method: 'POST', body: { origin: location.origin } }) }
      catch (e) {
        if (!e || e.status !== 404) throw e;
        try { await this.legacyConfig() }
        catch (legacyError) { if (legacyError && legacyError.status === 404) throw new Error('The video API is missing. Deploy the full P-Gist backend and frontend together.'); throw legacyError }
        return await this.publishLegacy(C, V, set)
      }
      if (!m || !m.uploadId || !m.url) throw new Error('The server did not return a Mux upload URL.'); try { await this.xhr(V.file, f => set('Uploading ' + Math.round(f * 100) + '%'), m.url) }
      catch (ue) {
        // A blocked-by-CORS upload and a dropped connection look the same to the browser. Ask for a fresh upload link that
        // accepts any origin and try once more before showing an error.
        if (!ue || !/Could not connect to Mux/.test(ue.message || '')) throw ue;
        await this.online(); set('Retrying…');
        const m2 = await GIST.api('/reels/mux-upload', { method: 'POST', body: { origin: '*' } });
        if (!m2 || !m2.uploadId || !m2.url) throw ue; m = m2;
        await this.xhr(V.file, f => set('Uploading ' + Math.round(f * 100) + '%'), m.url)
      }
      set('Processing…'); let mx = null;
      for (let n = 0; n < 90 && !mx; n++) { await new Promise(r => setTimeout(r, n < 5 ? 2000 : 4000)); const st = await GIST.api('/reels/mux-status/' + m.uploadId); if (st.error) throw new Error(st.error); if (st.ready) mx = st }
      if (!mx) throw new Error('Your video is taking long to process. It will appear in your gallery when ready; try posting it again in a minute.');
      set('Posting…');
      const r = await GIST.api('/posts', { method: 'POST', body: { text: C.text, video: { mux: { assetId: mx.assetId }, dur: mx.dur }, poll: C.poll || undefined, settings: C.set || undefined, fingerprint: await this.fp(V.file) } });
      if (r.flagged) return this.heldPublish(r.post, V, r.flagged);
      this.finishPublish(r.post, V)
    } catch (e) { C.busy = false; const e2 = $('gc_e'); if (e2) e2.textContent = e.message; GIST.btn(); const bb = $('gc_b'); if (bb) bb.textContent = 'Post'; GIST.err(e) }
  },
};

/* ---------- P-Gist bottom dock (Pulse / Reels / + / Studio) + full-bleed reels mode. Colours come from the app's own theme. ---------- */
(function () {
  if (typeof PH === 'undefined' || PH._tk) return; PH._tk = 1;
  const shell = PH.shell, close = PH.close;
  PH.shell = function () {
    const r = shell.apply(this, arguments), a = this.$a(), old = a.querySelector('.tkdock'); if (old) old.remove();
    const gist = this.view === 'gist', reels = gist && GIST.cur && GIST.cur.fn === 'reels';
    a.classList.toggle('pgist-social', gist); a.classList.toggle('rlmode', !!reels); a.classList.remove('rlfull'); a.classList.toggle('navc', gist && RL.navCollapsed(!!reels));
    if (gist && GIST.cur && ['feed', 'reels', 'profile'].includes(GIST.cur.fn)) a.insertAdjacentHTML('beforeend', RL.dock(GIST.cur.fn));
    return r
  };
  PH.close = function () { const a = this.$a(); if (a) a.classList.remove('pgist-social', 'rlmode', 'rlfull'); if (typeof RL !== 'undefined') RL.stop(); return close.apply(this, arguments) };
})();
Object.assign(RL, {
  /* tablet / desktop: the Gist menu is a left rail that can collapse to icons. The choice is remembered; until the player picks, Reels start collapsed and the feed starts open. */
  navCollapsed(reels) { let v = null; try { v = localStorage.getItem('ac:gnavc') } catch (e) {} return v === null ? !!reels : v === '1' },
  toggleNav() { const a = PH.$a(); if (!a) return; const on = !a.classList.contains('navc'); a.classList.toggle('navc', on); try { localStorage.setItem('ac:gnavc', on ? '1' : '0') } catch (e) {} },
  /* description: hashtags first (max 5, in a small box that scrolls up/down if it overflows), then the caption clamped to 2 lines with See more / See less */
  descHtml(text) {
    const raw = String(text || '').trim(); if (!raw) return '';
    const TAG = /#[\p{L}\p{N}_]{2,30}/gu, tags = [...new Set(raw.match(TAG) || [])].slice(0, 5);
    const clean = raw.replace(TAG, '').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
    const long = clean.length > 90 || clean.split('\n').length > 2;
    const tagsH = tags.length ? `<div class="rl-tags" onclick="event.stopPropagation()">${tags.map(t => `<a class="rl-tag" data-tag="${esc(t.slice(1))}">${esc(t)}</a>`).join('')}</div>` : '';
    const capH = clean ? `<div class="rl-desc${long ? ' clamp' : ''}"><div class="rl-cap">${GIST.txt(clean)}</div>${long ? '<button type="button" class="rl-more" onclick="event.stopPropagation();RL.moreDesc(this)">See more</button>' : ''}</div>` : '';
    return tagsH + capH
  },
  moreDesc(btn) { const d = btn.closest('.rl-desc'); if (!d) return; const open = d.classList.toggle('open'); btn.textContent = open ? 'See less' : 'See more' },
  /* bottom bar: four icons, no text. Home (feed + reels), Discover, Create, Profile (the unified profile) */
  dock(at) {
    const disc = at === 'feed' && GIST.tab === 'trending' && !GIST.tagF, active = at === 'profile' ? 'me' : disc ? 'disc' : 'home',
      it = (k, ic, lb, fn) => `<button class="${active === k ? 'on' : ''}" onclick="${fn}" aria-label="${lb}"${active === k ? ' aria-current="page"' : ''}><i class="fa-solid ${ic}"></i><span class="dl">${lb}</span></button>`;
    return `<nav class="tkdock gicons" aria-label="Gist navigation"><button class="dtog" onclick="RL.toggleNav()" aria-label="Collapse or expand the menu"><i class="fa-solid fa-bars"></i><span class="dl">Menu</span></button>${it('home', 'fa-house', 'Home', 'RL.goFeed()')}${it('disc', 'fa-compass', 'Discover', 'RL.goDiscover()')}<button class="mk" onclick="RL.create()" aria-label="Create"><i class="fa-solid fa-plus"></i><span class="dl">Create</span></button>${it('me', 'fa-user', 'Profile', 'RL.goMe()').replace('</button>', (((window.PH && PH.badges && PH.badges.updates) || 0) + ((window.PH && PH.localUnread) || 0) > 0 ? '<span class="gdot" aria-label="New activity"></span>' : '') + '</button>')}</nav>`
  },
  goDiscover() { this.stop(); GIST.stack = []; GIST.tab = 'trending'; GIST.tagF = ''; GIST.feed() },
  goFeed() { this.stop(); GIST.stack = []; if (GIST.tab === 'trending' || GIST.tab === 'me') GIST.tab = 'latest'; GIST.tagF = ''; GIST.feed() },
  goReels() { if (GIST.cur && GIST.cur.fn === 'reels') { const f = this.feedEl(); if (f) f.scrollTo({ top: 0, behavior: 'smooth' }); return } this.stop(); GIST.stack = [{ fn: 'feed', args: [], scroll: 0 }]; this.show('') },
  goMe() { this.stop(); GIST.stack = [{ fn: 'feed', args: [], scroll: 0 }]; GIST.nav('profile', 'me') },
  create() { this.stop(); PH.sheet(`<h3>Create</h3><button class="fopt" onclick="PH.closeSheet();GIST.nav('compose','video')"><span><i class="fa-solid fa-clapperboard"></i> Post a reel</span></button><button class="fopt" onclick="PH.closeSheet();GIST.nav('compose')"><span><i class="fa-solid fa-pen-nib"></i> Write a gist</span></button><button class="fopt" onclick="PH.closeSheet();GIST.nav('compose','photos')"><span><i class="fa-solid fa-image"></i> Share photos</span></button>`) },
});

/* feed cards swap their cover for a short animated Mux preview while on screen (skipped on data saver) */
(function () {
  if (!window.IntersectionObserver) return;
  const io = new IntersectionObserver(es => es.forEach(en => { const im = en.target; if (en.isIntersecting && !RL.saver()) { if (!im._p) { im._p = im.src; im.src = im.dataset.prev } } else if (im._p) { im.src = im._p; im._p = '' } }), { threshold: 0.6 });
  const scan = n => { if (n.nodeType !== 1) return; (n.matches && n.matches('img[data-prev]') ? [n] : n.querySelectorAll ? n.querySelectorAll('img[data-prev]') : []).forEach(im => { if (!im._o) { im._o = 1; io.observe(im) } }) };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
})();
