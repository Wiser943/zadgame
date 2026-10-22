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
    this.stop(); this.cfg().catch(() => {}); this.start = startId || ''; GIST.set('reels', this.start); PH.view = 'gist';
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
      if (first) { const keep = F.p.filter(x => x.id === this.start && !r.posts.some(y => y.id === x.id)); F.p = keep.concat(r.posts) }
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
    return `<section class="rl-card" data-id="${p.id}" data-i="${i}"><video class="rl-v" playsinline webkit-playsinline loop preload="none" ${p.video && p.video.poster ? `poster="${esc(this.src(p.video.poster))}"` : ''} data-src="${esc(p.video && p.video.kind === 'mux' ? p.video.url : this.src(p.video && p.video.url || ''))}" ${this.muted ? 'muted' : ''}></video>
      <div class="rl-wash"></div><span class="rl-no">${String(i + 1).padStart(2, '0')}</span><div class="rl-pz"><i class="fa-solid fa-play"></i></div><div class="rl-burst"></div>
      ${p.video.cc ? `<button class="rl-cc ${this.ccOn ? 'on' : ''}" onclick="event.stopPropagation();RL.cc()" aria-label="Captions">CC</button>` : ''}
      <button class="rl-snd" onclick="event.stopPropagation();RL.snd()" aria-label="Sound"><i class="fa-solid ${this.muted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i></button>
      <div class="rl-info"><div class="rl-who" onclick="event.stopPropagation();RL.profile('${a.id}')">${PH.av({ avatar: a.avatar, displayName: a.displayName, username: a.username })}<span class="rl-nm"><b>${a.username ? '@' + esc(a.username) : esc(a.displayName)}${GIST.vb(a)}</b><i>${esc(a.displayName)} · ${GIST.ago(p.createdAt)}</i></span>${fol}</div>
      ${p.text ? `<div class="rl-cap">${GIST.txt(p.text)}</div>` : ''}${p.views ? `<small class="rl-views"><i class="fa-solid fa-eye"></i> ${this.fmt(p.views)} views</small>` : ''}</div>
      <div class="rl-act"><button class="rl-more-btn" onclick="event.stopPropagation();RL.actions(this)" aria-label="More reel actions" aria-expanded="false"><span><i class="fa-solid fa-ellipsis"></i></span></button>
      <div class="rl-actions-menu" role="menu"><button class="lk ${p.myRx ? 'on' : ''}" data-action="like" onclick="event.stopPropagation();RL.action('${p.id}','like')" aria-label="Like"><span class="rl-like-ico">${p.myRx ? RXE[p.myRx] : '<i class="fa-solid fa-heart"></i>'}</span><em>${this.fmt(p.likes) || 'Like'}</em></button>
      <button data-action="comments" onclick="event.stopPropagation();RL.action('${p.id}','comments')" aria-label="Comments"><i class="fa-solid fa-comment-dots"></i><em>${this.fmt(p.comments) || 'Comments'}</em></button>
      <button data-action="share" onclick="event.stopPropagation();RL.action('${p.id}','share')" aria-label="Share"><i class="fa-solid fa-share"></i><em>${this.fmt(p.shares) || 'Share'}</em></button>
      <button data-action="sound" onclick="event.stopPropagation();RL.action('${p.id}','sound')" aria-label="Toggle sound"><i class="fa-solid ${this.muted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i><em>${this.muted ? 'Unmute' : 'Mute'}</em></button>
      <button data-action="options" onclick="event.stopPropagation();RL.action('${p.id}','options')" aria-label="More post options"><i class="fa-solid fa-ellipsis"></i><em>Post options</em></button></div></div>
      <div class="rl-bar"><i></i></div></section>`
  },
  draw() {
    const f = this.feedEl(); if (!f) return; const F = this.List();
    if (this.obs) this.obs.disconnect();
    const av = PH.$a(); if (av) av.classList.toggle('rlfull', !!F.p.length);
    if (!F.p.length) { f.innerHTML = F.ok ? this.empty() : '<div class="rl-empty"><span class="rl-spin"></span><p>Finding your next reel…</p></div>'; return }
    f.innerHTML = F.p.map((p, i) => this.card(p, i)).join(''); this.bind(f);
    let at = Math.max(0, F.p.findIndex(p => p.id === this.start)); this.start = '';
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
      if ((d === 0 || (d === 1 && !this.saver())) && !v.getAttribute('src') && !v._h && !v._want) this.attach(v, d > 0);
      if (k === i && v._h) v._h.config.maxBufferLength = 12;
      if (d > 2 && (v.getAttribute('src') || v._h)) this.detach(v);
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
    const b = c.querySelector('.rl-burst'), r = c.getBoundingClientRect(); b.innerHTML = `<i class="fa-solid fa-heart" style="left:${e.clientX - r.left}px;top:${e.clientY - r.top}px"></i>`; const h = b.firstChild; h.getBoundingClientRect(); h.classList.add('go'); setTimeout(() => { b.innerHTML = '' }, 700)
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
    else if (kind === 'sound') this.snd();
    else if (kind === 'options') GIST.menu(id)
  },
  sync(id) {
    const p = GIST.cache.get(id); if (!p) return;
    document.querySelectorAll(`.rl-card[data-id="${id}"]`).forEach(c => {
      const l = c.querySelector('[data-action="like"]'); l.classList.toggle('on', !!p.myRx); l.querySelector('.rl-like-ico').innerHTML = p.myRx ? RXE[p.myRx] : '<i class="fa-solid fa-heart"></i>'; l.querySelector('em').textContent = this.fmt(p.likes) || 'Like';
      const m = c.querySelector('[data-action="comments"] em'), s = c.querySelector('[data-action="share"] em'); if (m) m.textContent = this.fmt(p.comments) || 'Comments'; if (s) s.textContent = this.fmt(p.shares) || 'Share'
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
  openFrom(id) { GIST.nav('reels', id) },

  /* ---------- posting a reel (called from the gist composer) ---------- */
  cfg() {
    if (this._cfg) return Promise.resolve(this._cfg);
    const oldApi = async () => { try { return await this.legacyConfig() } catch (e) { if (e && e.status === 404) return null; throw e } };
    return GIST.api('/reels/config').then(async c => {
      if (!c || typeof c.mux !== 'boolean') throw new Error('The server returned an invalid video configuration.');
      if (!c.mux) { const old = await oldApi(); if (old) return old }
      this._legacyApi = false; this._cfg = c; return c
    }).catch(async e => {
      if (e && e.status === 404) {
        const old = await oldApi();
        if (old) return old;
        throw new Error('The video API is missing. Deploy the full P-Gist backend and frontend together.');
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
      GIST.C.video = { file, url, poster, dur: v.duration || 0, w: v.videoWidth, h: v.videoHeight }; GIST.attDraw()
    };
    v.src = url
  },
  prevHtml(C) {
    const V = C.video; if (!V) return '';
    return `<div class="rl-prev"><video src="${V.url}" ${V.poster ? `poster="${V.poster}"` : ''} controls playsinline muted preload="metadata"></video><button onclick="RL.rm()" aria-label="Remove video"><i class="fa-solid fa-xmark"></i></button><small><i class="fa-solid fa-clapperboard"></i> ${this.dur(V.dur)} · ${(V.file.size / 1048576).toFixed(1)} MB</small></div>`
  },
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
    post = this.compatPost(post); URL.revokeObjectURL(V.url); GIST.C = null; GIST.put([post]); GIST.cache.set(post.id, post); GIST.afterPost(post, '');
    this.L.foryou.p = [post, ...this.L.foryou.p.filter(p => p.id !== post.id)]; this.L.foryou.ok = true; this.tab = 'foryou'; GIST.stack = [{ fn: 'feed', args: [], scroll: 0 }]; toast('Reel posted ✓'); this.show(post.id)
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
      try { m = await GIST.api('/reels/mux-upload', { method: 'POST' }) }
      catch (e) {
        if (!e || e.status !== 404) throw e;
        try { await this.legacyConfig() }
        catch (legacyError) { if (legacyError && legacyError.status === 404) throw new Error('The video API is missing. Deploy the full P-Gist backend and frontend together.'); throw legacyError }
        return await this.publishLegacy(C, V, set)
      }
      if (!m || !m.uploadId || !m.url) throw new Error('The server did not return a Mux upload URL.'); await this.xhr(V.file, f => set('Uploading ' + Math.round(f * 100) + '%'), m.url); set('Processing…'); let mx = null;
      for (let n = 0; n < 90 && !mx; n++) { await new Promise(r => setTimeout(r, n < 5 ? 2000 : 4000)); const st = await GIST.api('/reels/mux-status/' + m.uploadId); if (st.error) throw new Error(st.error); if (st.ready) mx = st }
      if (!mx) throw new Error('Your video is taking long to process. It will appear in your gallery when ready; try posting it again in a minute.');
      set('Posting…');
      const r = await GIST.api('/posts', { method: 'POST', body: { text: C.text, video: { mux: { assetId: mx.assetId }, dur: mx.dur }, poll: C.poll || undefined } });
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
    a.classList.toggle('pgist-social', gist); a.classList.toggle('rlmode', !!reels); a.classList.remove('rlfull');
    if (gist && GIST.cur && ['feed', 'reels', 'profile', 'post'].includes(GIST.cur.fn)) a.insertAdjacentHTML('beforeend', RL.dock(GIST.cur.fn));
    return r
  };
  PH.close = function () { const a = this.$a(); if (a) a.classList.remove('pgist-social', 'rlmode', 'rlfull'); if (typeof RL !== 'undefined') RL.stop(); return close.apply(this, arguments) };
})();
Object.assign(RL, {
  dock(at) {
    const active = at === 'profile' ? 'me' : at === 'post' ? 'feed' : at, it = (k, ic, lb, fn) => `<button class="${active === k ? 'on' : ''}" onclick="${fn}"><i class="fa-solid ${ic}"></i><span>${lb}</span></button>`;
    return `<nav class="tkdock" aria-label="Gist navigation">${it('feed', 'fa-house', 'Pulse', 'RL.goFeed()')}${it('reels', 'fa-clapperboard', 'Reels', 'RL.goReels()')}<button class="mk" onclick="RL.create()" aria-label="Create"><i class="fa-solid fa-plus"></i></button>${it('me', 'fa-user', 'Studio', 'RL.goMe()')}</nav>`
  },
  goFeed() { this.stop(); GIST.stack = []; GIST.tab = 'latest'; GIST.tagF = ''; GIST.feed() },
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
