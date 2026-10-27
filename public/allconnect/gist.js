/* P-Gist: the AllConnect social feed.
   Latest / Trending / Following / Me feeds, #hashtags + trending strip, @mentions, reactions (long-press), edit + "edited" label,
   polls, pinned post, comment replies + comment likes, photo carousel, match-win cards, live "new gists" pill, and the ONE
   unified profile (cover, bio, verified tick, game stats, follow / message). Everything optimistic: the UI never waits on the server.
   API: /api/ac/gist/* */
const RXE = { like: '❤️', laugh: '😂', fire: '🔥', sad: '😢', wow: '😮' };
const GIST = {
  tab: 'latest', tagF: '', F: {}, trend: [], pending: 0, stack: [], cur: null, ret: null, cache: new Map(), C: null, pf: null, cm: null, replyTo: null,
  pk: { tab: 'mine', mine: null, plat: null, busy: false }, games: null, ready: false,
  api(u, o) { return NET.api('/api/ac/gist' + u, o) },
  uid() { return (NET.user && NET.user.id) || 'me' },
  put(list) { (list || []).forEach(p => { this.cache.set(p.id, p); if (p.shared && p.shared.id) this.cache.set(p.shared.id, p.shared) }); return list },
  ago(d) { const s = Math.max(1, (Date.now() - new Date(d).getTime()) / 1000); if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; if (s < 604800) return Math.floor(s / 86400) + 'd'; return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) },
  vb(u) { return u && u.verified ? '<i class="vbadge" title="Verified">✔</i>' : '' },
  key() { return this.tagF ? 'tag:' + this.tagF : this.tab },
  FF(k) { return this.F[k || this.key()] || (this.F[k || this.key()] = { p: [], more: false, ok: false, next: 0 }) },
  /* #hashtags, @mentions and links inside text */
  txt(t) {
    return esc(t).split(/(https?:\/\/[^\s<]+)/).map((s, i) => i % 2 ? `<a href="${s}" target="_blank" rel="noopener noreferrer">${s.length > 38 ? s.slice(0, 36) + '…' : s}</a>`
      : s.replace(/(^|[^\w&])#([\p{L}\p{N}_]{2,30})/gu, '$1<a class="gtag" data-tag="$2">#$2</a>').replace(/(^|[^\w])@([a-z0-9_]{3,16})/gi, '$1<a class="gmen" data-u="$2">@$2</a>')).join('').replace(/\n/g, '<br>')
  },
  init() {
    if (this.ready) return; this.ready = true;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pauseMedia() });
    window.addEventListener('pagehide', () => this.pauseMedia());
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-tag],[data-u]'); if (!t || !PH.$a().contains(t)) return;
      e.preventDefault(); e.stopPropagation(); if (t.dataset.tag) this.tag(t.dataset.tag); else this.nav('profile', t.dataset.u)
    }, true);
    /* long-press a like button -> reaction menu */
    let timer = 0, fired = false, sx = 0, sy = 0;
    const lkOf = e => e.target.closest && e.target.closest('.gp .lk');
    document.addEventListener('pointerdown', e => { const b = lkOf(e); if (!b) { this.closeRx(); return } fired = false; sx = e.clientX; sy = e.clientY; clearTimeout(timer); timer = setTimeout(() => { fired = true; this.rxMenu(b) }, 420) });
    document.addEventListener('pointermove', e => { if (timer && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 14) { clearTimeout(timer); timer = 0 } });
    const up = () => { clearTimeout(timer); timer = 0 };
    document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    document.addEventListener('click', e => { const b = lkOf(e); if (!b) return; e.preventDefault(); e.stopPropagation(); if (fired) { fired = false; return } this.react(b.dataset.id, 'like') }, true);
    document.addEventListener('contextmenu', e => { if (lkOf(e)) e.preventDefault() });
  },
  pauseMedia() {
    if (typeof RL !== 'undefined') RL.stop();
    document.querySelectorAll('#appview video').forEach(v => {
      try { v.pause() } catch (e) {}
      const wrap = v.closest('.ginline'); if (wrap) { wrap.classList.remove('playing'); this.vtime(v) }
    });
  },
  /* ---------- navigation ---------- */
  open() { this.init(); PH.view = 'gist'; this.stack = []; this.cur = null; this.C = null; this.ret = null; this.tagF = ''; this.pending = 0; this.feed() },
  /* deep links: notifications, mentions, leaderboard, settings, contacts -> post / profile, with a way back */
  deep(fn, arg, ret) { this.init(); document.querySelector('.screen').classList.add('light'); PH.view = 'gist'; this.stack = []; this.cur = null; this.C = null; this.ret = ret || null; this.tagF = ''; this[fn](arg) },
  openProfile(id, ret) { this.deep('profile', id, ret) },
  openPost(id, ret) { this.deep('post', id, ret) },
  reels(id) { RL.show(id) },
  nav(fn, ...a) { if (typeof RL !== 'undefined') RL.stop(); const ab = $('ab'); if (this.cur) this.stack.push({ ...this.cur, scroll: ab ? ab.scrollTop : 0 }); this[fn](...a) },
  back() { if (typeof RL !== 'undefined') RL.stop(); const s = this.stack.pop(); if (!s) { this.C = null; const r = this.ret; this.ret = null; if (r) return r(); return PH.close() } this[s.fn](...s.args); requestAnimationFrame(() => { const ab = $('ab'); if (ab) ab.scrollTop = s.scroll || 0 }) },
  set(fn, ...args) { this.cur = { fn, args } },
  err(e) { toast((e && e.message) || 'Something went wrong. Try again.') },
  bell() { const n = (PH.badges.updates || 0) + (PH.localUnread || 0); return `<button class="gbell" onclick="PH.shade(true)" aria-label="Notifications"><i class="fa-solid fa-bell"></i>${n ? `<em>${n > 9 ? '9+' : n}</em>` : ''}</button>` },
  /* ---------- post card ---------- */
  imgs(p) {
    const n = p.images.length; if (!n) return '';
    const one = i => `<button class="gim" onclick="GIST.lightbox('${p.id}',${i})" aria-label="View photo ${i + 1} of ${n} by ${esc(p.author && p.author.displayName || 'creator')}"><img loading="lazy" decoding="async" src="${esc(p.images[i].thumb || p.images[i].url)}" alt="Photo ${i + 1} shared by ${esc(p.author && p.author.displayName || 'creator')}"></button>`;
    if (n === 1) return `<div class="gimgs n1">${one(0)}</div>`;
    return `<div class="gcar"><div class="gcs" onscroll="GIST.car(this)">${p.images.map((_, i) => one(i)).join('')}</div><span class="gcn">1/${n}</span><div class="gdots">${p.images.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></div>`
  },
  car(el) { const n = el.children.length, i = Math.min(n - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))), w = el.parentNode; w.querySelectorAll('.gdots i').forEach((d, k) => d.classList.toggle('on', k === i)); const c = w.querySelector('.gcn'); if (c) c.textContent = (i + 1) + '/' + n },
  vplay(button) {
    const w = button.closest('.ginline'), v = w && w.querySelector('video'); if (!v) return;
    if (v.paused) {
      document.querySelectorAll('#appview.pgist-social .ginline-v').forEach(x => { if (x !== v) { x.pause(); const p = x.closest('.ginline'); if (p) p.classList.remove('playing') } });
      const p = v.play(); if (p && p.then) p.then(() => { w.classList.remove('play-error'); this.vtime(v) }).catch(() => { w.classList.add('play-error'); toast('Could not play this video. Tap play to retry.') });
    } else v.pause();
    this.vtime(v)
  },
  vtime(v) {
    const w = v && v.closest('.ginline'); if (!w) return; w.classList.toggle('playing', !v.paused);
    const r = w.querySelector('.gvseek'), cur = Number.isFinite(v.currentTime) ? v.currentTime : 0, total = Number.isFinite(v.duration) ? v.duration : 0;
    if (r && total && !r.matches(':active')) r.value = String(cur / total * 100);
    const t = w.querySelector('.gvtime'); if (t) t.textContent = `${RL.dur(cur)} / ${total ? RL.dur(total) : '--:--'}`;
    w.querySelectorAll('.gvplay i,.gvcenter i').forEach(i => { i.className = 'fa-solid ' + (v.paused ? 'fa-play' : 'fa-pause') });
    const m = w.querySelector('.gvmute i'); if (m) m.className = 'fa-solid ' + (v.muted ? 'fa-volume-xmark' : 'fa-volume-high')
  },
  vseek(r) { const v = r.closest('.ginline').querySelector('video'); if (v && Number.isFinite(v.duration)) v.currentTime = v.duration * Number(r.value) / 100 },
  vmute(button) { const v = button.closest('.ginline').querySelector('video'); if (!v) return; v.muted = !v.muted; this.vtime(v) },
  vfull(button) {
    const w = button.closest('.ginline'); if (!w) return;
    if (document.fullscreenElement === w) { const p = document.exitFullscreen && document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); return }
    if (w.classList.contains('gv-full')) { w.classList.remove('gv-full'); return }
    if (w.requestFullscreen) { try { const p = w.requestFullscreen(); if (p && p.catch) p.catch(() => w.classList.add('gv-full')) } catch (e) { w.classList.add('gv-full') } } else w.classList.add('gv-full')
  },
  vid(p, detail) {
    if (!p || !p.video) return '';
    const v = p.video, id = String(v.playbackId || '').trim(), mux = v.kind === 'mux' || !!v.playbackUrl || !!id;
    const raw = v.url || v.playbackUrl || (id ? `https://stream.mux.com/${id}.m3u8` : ''), u = window.apiUrl ? apiUrl(raw) : raw;
    const poster = v.poster || (id ? `https://image.mux.com/${id}/thumbnail.jpg?width=480&time=1` : ''), po = poster ? (window.apiUrl ? apiUrl(poster) : poster) : '', dur = Number(v.dur || v.duration || 0), preview = v.preview || (id ? `https://image.mux.com/${id}/animated.webp?width=320&fps=10&start=0&end=4` : '');
    if (detail && !mux) return `<div class="gvid det ginline"><video class="ginline-v" src="${esc(u)}" ${po ? `poster="${esc(po)}"` : ''} playsinline webkit-playsinline preload="metadata" loop onloadedmetadata="GIST.vtime(this)" ontimeupdate="GIST.vtime(this)" onplay="GIST.vtime(this)" onpause="GIST.vtime(this)"></video><button class="gvcenter" onclick="GIST.vplay(this)" aria-label="Play or pause"><i class="fa-solid fa-play"></i></button><div class="gvcontrols"><button class="gvplay" onclick="GIST.vplay(this)" aria-label="Play or pause"><i class="fa-solid fa-play"></i></button><span class="gvtime">0:00 / --:--</span><input class="gvseek" type="range" min="0" max="100" value="0" aria-label="Seek video" oninput="GIST.vseek(this)"><button class="gvmute" onclick="GIST.vmute(this)" aria-label="Toggle sound"><i class="fa-solid fa-volume-xmark"></i></button><button onclick="GIST.vfull(this)" aria-label="Fullscreen"><i class="fa-solid fa-expand"></i></button></div></div>`;
    return `<button type="button" class="gvid" onclick="event.stopPropagation();RL.openFrom('${p.id}')" aria-label="Open Reel by ${esc(p.author && p.author.displayName || 'creator')}">${po || mux ? `<img loading="lazy" decoding="async" src="${esc(po)}" ${preview ? `data-prev="${esc(preview)}"` : ''} alt="Video thumbnail for a Reel by ${esc(p.author && p.author.displayName || 'creator')}">` : `<video src="${esc(u)}#t=0.1" muted playsinline preload="metadata" aria-hidden="true"></video>`}<span class="gvp" aria-hidden="true"><i class="fa-solid fa-play"></i></span><em><i class="fa-solid fa-clapperboard" aria-hidden="true"></i> Reel${dur ? ' · ' + RL.dur(dur) : ''}${p.views ? ' · ' + RL.fmt(p.views) + ' views' : ''}</em></button>`
  },
  /* a shared Songify track: tap it to open Songify and play it */
  songKey(s) { let h = 5381; const t = String(s.streamUrl); for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return 's' + h.toString(36) },
  songcard(s, rm) {
    if (!s || !s.streamUrl) return ''; const k = this.songKey(s); (this.sg = this.sg || {})[k] = s;
    return `<div class="gsong" onclick="GIST.listen('${k}',event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();GIST.listen('${k}',event)}" role="button" tabindex="0" aria-label="Play ${esc(s.title)} in Songify"><img src="${esc(s.albumArt || '/icon-192.png')}" alt="" onerror="this.src='/icon-192.png'"><div><b>${esc(s.title)}</b><small>${esc(s.artist || '')}</small><em><i class="fa-solid fa-music"></i> Listen on Songify</em></div>${rm ? `<button class="gsx" onclick="event.stopPropagation();GIST.C.song=null;GIST.attDraw()" aria-label="Remove song"><i class="fa-solid fa-xmark"></i></button>` : `<span class="gsp"><i class="fa-solid fa-play"></i></span>`}</div>`
  },
  listen(k, ev) { if (ev) { ev.preventDefault(); ev.stopPropagation() } const s = this.sg && this.sg[k]; if (!s) return; if (!window.SONGIFY || !SONGIFY.openSong) return toast('Songify is unavailable right now.'); SONGIFY.openSong(s) },
  gamecard(g) { if (!g) return ''; return `<div class="ggame"><span class="gg"><i class="fa-solid fa-gamepad"></i></span><div><b>${esc(g.name)}</b><small>${g.code ? 'Room code <code>' + esc(g.code) + '</code>' : 'Open in GameHub'}</small></div><button onclick="GIST.play('${esc(g.code || '')}')">${g.code ? 'Join' : 'Play'}</button></div>` },
  electioncard(e, id) {
    if (!e) return '';
    const head = e.kind === 'result' ? `ELECTED ${e.title.toUpperCase()} OF ${e.scope.toUpperCase()}` : e.kind === 'campaign' ? `RUNNING FOR ${e.title.toUpperCase()} OF ${e.scope.toUpperCase()}` : `OFFICIAL · ${e.title.toUpperCase()} OF ${e.scope.toUpperCase()}`;
    const mid = e.kind === 'result' ? `<div class="gms">${e.votes ? Number(e.votes).toLocaleString('en-NG') + ' votes' : 'Winner'}</div>` : e.slogan ? `<div class="gms sm">“${esc(e.slogan)}”</div>` : '';
    const btns = e.kind === 'result' ? `<button onclick="GIST.react('${id}','fire')"><i class="fa-solid fa-fire"></i> Congratulate</button>` : '';
    return `<div class="gelect" style="--c:${esc(e.color)}"><div class="get"><span>${e.icon} ${head}</span></div>${mid}<div class="gmb">${btns}<button onclick="window.GOV&&GOV.open('${esc(e.office)}')"><i class="fa-solid fa-landmark"></i> State House</button></div></div>`;
  },
  matchcard(m, id) { if (!m) return ''; return `<div class="gmatch"><div class="gmt"><span><i class="fa-solid fa-trophy"></i> VICTORY</span><b>${esc(m.name)}</b></div><div class="gms">${m.score ? esc(m.score) : 'Won!'}</div><div class="gmo">${m.opponent ? 'vs <b>' + esc(m.opponent) + '</b>' : 'Match win'}</div><div class="gmb"><button onclick="GIST.react('${id}','fire')"><i class="fa-solid fa-fire"></i> Cheer</button><button onclick="GIST.play('')"><i class="fa-solid fa-gamepad"></i> Play ${esc(m.name)}</button></div></div>` },
  pollHtml(p) {
    const q = p.poll; if (!q) return '';
    const show = q.myVote >= 0 || q.ended, tot = q.total || 0;
    const left = q.ended ? 'Poll ended' : (() => { const ms = new Date(q.endsAt) - Date.now(), h = Math.ceil(ms / 3600000); return h >= 48 ? Math.ceil(h / 24) + ' days left' : h > 1 ? h + ' hours left' : 'Ending soon' })();
    return `<div class="gpoll" data-id="${p.id}">${q.options.map((o, i) => show ? `<div class="gpo res ${q.myVote === i ? 'mine' : ''}"><u style="width:${tot ? Math.round(o.votes / tot * 100) : 0}%"></u><span>${esc(o.text)}${q.myVote === i ? ' ✓' : ''}</span><b>${tot ? Math.round(o.votes / tot * 100) : 0}%</b></div>` : `<button class="gpo" onclick="GIST.vote('${p.id}',${i})"><span>${esc(o.text)}</span></button>`).join('')}<small>${tot} vote${tot === 1 ? '' : 's'} · ${left}</small></div>`
  },
  fmtCount(n) { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'b' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n || '') },
  rxSummary(p) { const ks = Object.keys(RXE).filter(k => (p.rx || {})[k] > 0).sort((a, b) => p.rx[b] - p.rx[a]).slice(0, 3); return p.likes > 0 ? `<span class="grx-summary" aria-label="Reactions">${ks.map(k => RXE[k]).join('') || '⚡'}</span>` : '' },
  card(p, o) {
    o = o || {}; const a = p.author, tmp = String(p.id).startsWith('tmp');
    const who = `<button class="gph" onclick="GIST.nav('profile','${a.id}')">${PH.av({ avatar: a.avatar, displayName: a.displayName, username: a.username })}<span><b>${esc(a.displayName)}${this.vb(a)}</b><i>${a.username ? '@' + esc(a.username) + ' · ' : ''}${tmp ? 'posting…' : this.ago(p.createdAt)}${p.edited ? ' · edited' : ''}</i></span></button>`;
    let shared = '';
    if (p.shared) shared = p.shared.deleted ? `<div class="gshared gone">This post is no longer available.</div>` : `<div class="gshared"><button type="button" class="gshared-open" onclick="GIST.nav('post','${p.shared.id}')" aria-label="Open original post by ${esc(p.shared.author.displayName)}"><span class="gsh"><b>${esc(p.shared.author.displayName)}${this.vb(p.shared.author)}</b><i>${p.shared.author.username ? '@' + esc(p.shared.author.username) : ''} · ${this.ago(p.shared.createdAt)}</i></span><span>Open original post <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></span></button>${p.shared.text ? `<div class="gtx">${this.txt(p.shared.text)}</div>` : ''}${this.imgs(p.shared)}${this.vid(p.shared)}${this.matchcard(p.shared.match, p.shared.id)}${this.electioncard(p.shared.election, p.shared.id)}${this.gamecard(p.shared.game)}${this.songcard(p.shared.song)}</div>`;
    const em = p.myRx ? RXE[p.myRx] : '';
    // media comes right under the header, edge to edge — text moves below the action row, Instagram-style
    const media = `${this.matchcard(p.match, p.id)}${this.electioncard(p.election, p.id)}${this.imgs(p)}${this.vid(p, o.detail)}${this.pollHtml(p)}${this.gamecard(p.game)}${this.songcard(p.song)}${shared}`;
    // headline block: first line is the title, first #tag is the small kicker, plus a read-time hint
    const raw = String(p.text || '').trim(), lines = raw.split(/\n+/), first = (lines[0] || '').trim(), restTxt = lines.slice(1).join('\n').trim();
    const long = first.length > 110, title = long ? first.slice(0, 107).replace(/\s+\S*$/, '') + '…' : first, remain = long ? first.slice(title.length - 1).trim() + (restTxt ? '\n' + restTxt : '') : restTxt;
    const kick = ((raw.match(/#([\p{L}\p{N}_]+)/u) || [])[1] || '').replace(/_/g, ' '), mins = Math.max(1, Math.ceil(raw.split(/\s+/).filter(Boolean).length / 180));
    const caption = raw ? `<div class="gheadline">${kick ? `<div class="gkick">${esc(kick)}</div>` : ''}<h3 class="gtitle">${this.txt(title)}</h3>${remain ? `<div class="gtx gbody">${this.txt(remain)}</div>` : ''}<div class="gread"><span>${mins} minute${mins === 1 ? '' : 's'} read</span></div></div>` : '';
    const mine = a.id === this.uid(), fol = !mine && !tmp && !(a.isFollowing || (this.fol && this.fol.has(a.id)));
    const folBtn = fol ? `<button class="gfol" data-uid="${a.id}" onclick="GIST.quickFollow('${a.id}',this)">Follow</button>` : '';
    const nviews = Number(p.views || p.viewCount || 0), chip = (this.imgs(p) || this.vid(p, o.detail)) ? `<span class="gvchip"><i class="fa-regular fa-eye"></i> ${nviews > 999 ? (nviews / 1000).toFixed(1) + 'k' : nviews}</span>` : '';
    const vc = '';
    return `<article class="gp ${tmp ? 'pending' : ''}" data-id="${p.id}">${p.pinned ? '<div class="gpin"><i class="fa-solid fa-thumbtack"></i> Pinned</div>' : ''}<div class="gtop">${who}${folBtn}${tmp ? '' : `<button class="gmore" onclick="GIST.menu('${p.id}')" aria-label="More">⋯</button>`}</div>
      <div class="gmedia">${chip}${media}</div>
      ${caption}
      <div class="gact"><button class="lk ${p.myRx ? 'on' : ''}" data-id="${p.id}" aria-label="React to post${p.likes ? ' · ' + this.fmtCount(p.likes) : ''}" aria-pressed="${!!p.myRx}"><span>${em ? em : '<i class="fa-solid fa-bolt" aria-hidden="true"></i>'}</span><b class="gnum">${this.fmtCount(p.likes)}</b></button>
      <button class="cm" onclick="${o.detail ? "$('gc_in')&&$('gc_in').focus()" : `GIST.nav('post','${p.id}')`}" aria-label="${o.detail ? 'Write a comment' : 'View comments'}${p.comments ? ' · ' + this.fmtCount(p.comments) : ''}"><span><i class="fa-regular fa-comment" aria-hidden="true"></i></span><b class="gnum gcn">${this.fmtCount(p.comments)}</b></button>
      <button class="sh" onclick="GIST.shareSheet('${p.id}')" aria-label="Share post"><span><i class="fa-regular fa-paper-plane" aria-hidden="true"></i></span></button></div>
      <div class="grs">${this.rxSummary(p)}</div>
      ${vc}
      </article>`
  },
  list(arr) { return arr.map(p => this.card(p)).join('') },
  /* ---------- feed ---------- */
  feed() {
    this.set('feed'); PH.view = 'gist'; const T = this.tab, F = this.FF(), u = NET.user || {}, disc = T === 'trending' && !this.tagF, home = !disc && !this.tagF;
    const tabs = [['latest', 'For you'], ['following', 'Following']];
    // Home has the For you / Following switch; Discover and tag pages have none (their own header instead)
    const seg = this.tagF ? `<div class="gtagbar"><b>#${esc(this.tagF)}</b><button onclick="GIST.untag()"><i class="fa-solid fa-xmark"></i> Clear</button></div>` : disc ? '' : `<div class="gtabs"><div class="gseg">${tabs.map(t => `<button class="${T === t[0] ? 'on' : ''}" onclick="GIST.setTab('${t[0]}')">${t[1]}</button>`).join('')}</div></div>`;
    const kinds = home ? `<div class="gkinds" id="gkinds">${this.kindsHtml()}</div>` : '';
    const composer = home ? `<div class="gtease"><button class="gme" onclick="GIST.nav('profile','me')" aria-label="My profile">${PH.av({ avatar: u.avatar, displayName: u.displayName, username: u.username })}</button><button class="gwhat" onclick="GIST.nav('compose')">Share a moment, ${esc((u.displayName || 'player').split(' ')[0])}…</button><button class="gphoto" onclick="GIST.nav('compose','photos')" aria-label="Add photo"><i class="fa-solid fa-image"></i></button><button class="gphoto" onclick="GIST.nav('compose','video')" aria-label="Post a reel"><i class="fa-solid fa-video"></i></button></div>` : '';
    const discover = disc ? `<div class="gdiscover"><form role="search" onsubmit="event.preventDefault();GIST.searchOpen($('gsearch').value)"><label class="sr-only" for="gsearch">Search people, posts, or hashtags</label><input id="gsearch" type="search" maxlength="60" placeholder="Search people, posts, #tags" autocomplete="off"><button type="submit" aria-label="Search P-Gist"><i class="fa-solid fa-magnifying-glass"></i></button></form><button class="gsaved-link" onclick="GIST.savedOpen()" aria-label="Saved posts"><i class="fa-regular fa-bookmark"></i><span>Saved</span></button></div>` : '';
    PH.shell(this.tagF ? '#' + esc(this.tagF) : disc ? 'Discover' : 'P-Gist', this.tagF ? 'GIST.untag()' : 'GIST.back()', `<div class="abody" id="ab"><div id="gnew"></div>${composer}${kinds}${discover}
      <div id="gtrend">${disc ? this.trendHtml() : ''}</div><div id="gpeople">${disc ? this.peopleHtml() : ''}</div>
      <div id="gfeed">${F.ok ? this.feedHtml(F) : '<p class="empty">Loading…</p>'}</div></div>`, seg);
    this.loadTrend(); this.showPill(); this.loadFeed(true); if (F.ok) this.watchMore()
  },
  /* home filter: everything, only written posts, or only reels (video posts) */
  kind: 'all',
  kindsHtml() { return [['all', 'All'], ['posts', 'Posts'], ['reels', 'Reels']].map(k => `<button class="${this.kind === k[0] ? 'on' : ''}" onclick="GIST.setKind('${k[0]}')">${k[1]}</button>`).join('') },
  setKind(k) { if (this.kind === k) return; this.kind = k; const e = $('gkinds'); if (e) e.innerHTML = this.kindsHtml(); const f = $('gfeed'); if (f) { f.innerHTML = this.feedHtml(this.FF()); this.watchMore() } },
  byKind(list) { return this.tab === 'trending' || this.tagF || this.kind === 'all' ? list : list.filter(p => this.kind === 'reels' ? !!p.video : !p.video) },
  /* Discover: colourful tag cards ("Signals worth following") and "People to know" taken from the posts on screen */
  tagCards() {
    const T = (this.trend || []).slice(0, 4); if (!T.length) return '';
    const sub = ['what everyone is saying', 'worth a closer look', 'showing up counts', 'made with care'];
    return `<div class="gsec"><small>MOVING RIGHT NOW</small><h2>Signals worth following</h2></div><div class="gsig">${T.map((t, i) => `<a class="gsc c${i}" data-tag="${esc(t.tag)}"><em>0${i + 1}</em><i class="fa-solid fa-arrow-up-right-from-square"></i><b>#${esc(t.tag)}</b><span>${sub[i % 4]}</span><strong>${t.count} gist${t.count === 1 ? '' : 's'}</strong></a>`).join('')}</div>`;
  },
  peopleHtml() {
    const F = this.FF(), seen = new Set([this.uid()]), out = [];
    for (const p of (F.p || [])) { const a = p.author; if (!a || seen.has(a.id) || a.isFollowing || this.fol.has(a.id)) continue; seen.add(a.id); out.push(a); if (out.length >= 5) break }
    if (!out.length) return '';
    return `<div class="gsec"><small>CURATED FOR YOU</small><h2>People to know</h2></div><div class="gppl">${out.map(a => `<div class="gpp"><button class="gph" onclick="GIST.nav('profile','${a.id}')">${PH.av({ avatar: a.avatar, displayName: a.displayName, username: a.username })}<span><b>${a.username ? '@' + esc(a.username) : esc(a.displayName)}</b><i>${esc(a.displayName)}</i></span></button><button class="gfol lime" data-uid="${a.id}" onclick="GIST.quickFollow('${a.id}',this)">follow</button></div>`).join('')}</div>`;
  },
  setTab(t) { if (t === 'reels') return RL.show(''); if (this.tab === t && !this.tagF) return; this.tab = t; this.tagF = ''; this.stack = []; this.pending = 0; this.feed() },
  tag(t) { t = String(t).toLowerCase(); this.tagF = t; this.pending = 0; this.stack = [{ fn: 'feed', args: [], scroll: 0 }]; this.cur = null; this.feed() },
  untag() { this.tagF = ''; this.stack = []; this.feed() },
  trendHtml() { if (this.tab === 'trending' && !this.tagF) return this.tagCards(); if (!this.tagF) return ''; return this.trend.length ? `<div class="gtrend"><span><i class="fa-solid fa-fire"></i> Trending</span>${this.trend.map(t => `<a data-tag="${esc(t.tag)}">#${esc(t.tag)}<em>${t.count}</em></a>`).join('')}</div>` : '' },
  loadTrend() { NET.swr('/api/ac/gist/trending', (d) => { this.trend = d.tags || []; const e = $('gtrend'); if (e && !this.tagF) e.innerHTML = this.trendHtml(); const g = $('gpeople'); if (g && this.tab === 'trending' && !this.tagF) g.innerHTML = this.peopleHtml() }, { ttl: 60000 }).catch(() => { }) },
  searchOpen(q = '') { this.nav('search', String(q || '').trim()) },
  search(q = '') {
    q = String(q || '').trim().slice(0, 60); this.set('search', q); PH.shell('Search P-Gist', 'GIST.back()', `<div class="abody" id="ab"><form class="gsearch-page" role="search" onsubmit="event.preventDefault();GIST.searchGo($('gsearch2').value)"><label class="sr-only" for="gsearch2">Search people, posts, or hashtags</label><input id="gsearch2" type="search" maxlength="60" value="${esc(q)}" placeholder="People, captions, #hashtags" autocomplete="off"><button class="btn p" type="submit" aria-label="Search"><i class="fa-solid fa-magnifying-glass"></i> Search</button></form><div id="gsearch-results"><p class="empty">${q.length >= 2 ? 'Searching…' : 'Enter at least 2 characters to search.'}</p></div></div>`);
    if (q.length >= 2) this.searchGo(q)
  },
  async searchGo(q) {
    q = String(q || '').trim().slice(0, 60); if (q.length < 2) { const r = $('gsearch-results'); if (r) r.innerHTML = '<p class="empty">Enter at least 2 characters to search.</p>'; return }
    if (this.cur && this.cur.fn !== 'search') { this.nav('search', q); return }
    this.set('search', q); const r = $('gsearch-results'); if (r) r.innerHTML = '<p class="empty" role="status">Searching…</p>';
    try {
      const d = await this.api('/search?q=' + encodeURIComponent(q)); if (!this.cur || this.cur.fn !== 'search' || this.cur.args[0] !== q) return;
      this.put(d.posts || []); const people = (d.people || []).map(u => `<div class="gperson"><button class="gph" onclick="GIST.nav('profile','${u.id}')">${PH.av(u)}<span><b>${esc(u.displayName)}${this.vb(u)}</b><i>${u.username ? '@' + esc(u.username) : ''}</i></span></button>${u.isMe ? '<span class="gsearch-note">You</span>' : `<button class="gsearch-follow" aria-pressed="${u.isFollowing}" onclick="GIST.searchFollow('${u.id}',this)">${u.isFollowing ? 'Following' : 'Follow'}</button>`}</div>`).join('');
      r.innerHTML = `${people ? `<section aria-labelledby="gsearch-people"><h3 class="gsection-title" id="gsearch-people">People</h3>${people}</section>` : ''}${d.posts && d.posts.length ? `<section aria-labelledby="gsearch-posts"><h3 class="gsection-title" id="gsearch-posts">Posts</h3>${this.list(d.posts)}</section>` : ''}${!people && !(d.posts || []).length ? `<p class="empty" role="status">No people or posts found for “${esc(q)}”.</p>` : ''}`
    } catch (e) { if (r) r.innerHTML = `<p class="empty" role="alert">${esc(e.message)} <button class="gretry" onclick="GIST.searchGo($('gsearch2').value)">Try again</button></p>` }
  },
  fol: new Set(),
  async quickFollow(id, btn) {
    if (btn) btn.disabled = true;
    try { const r = await this.api('/follow/' + encodeURIComponent(id), { method: 'POST' }); if (r.following) this.fol.add(id); else this.fol.delete(id);
      document.querySelectorAll(`.gfol[data-uid="${id}"]`).forEach(b => { b.textContent = r.following ? 'Following' : 'Follow'; b.classList.toggle('on', !!r.following); b.disabled = false });
      Object.values(this.F).forEach(f => { f.stale = true }); NET.drop('/api/ac/gist/feed') }
    catch (e) { if (btn) btn.disabled = false; this.err(e) }
  },
  async searchFollow(id, button) {
    const old = button.textContent; button.disabled = true;
    try { const r = await this.api('/follow/' + encodeURIComponent(id), { method: 'POST' }); button.textContent = r.following ? 'Following' : 'Follow'; button.setAttribute('aria-pressed', String(!!r.following)); Object.values(this.F).forEach(f => { f.stale = true }); NET.drop('/api/ac/gist/feed'); toast(r.following ? 'Following creator' : 'Unfollowed creator') }
    catch (e) { button.textContent = old; this.err(e) } finally { button.disabled = false }
  },
  savedOpen() { this.nav('saved') },
  saved() {
    this.set('saved'); this.savedPage = { posts: [], more: false, next: null, busy: false };
    PH.shell('Saved posts', 'GIST.back()', '<div class="abody" id="ab"><p class="empty" role="status">Loading saved posts…</p></div>');
    this.loadSaved(true)
  },
  async loadSaved(first = false) {
    const s = this.savedPage || (this.savedPage = { posts: [], more: false, next: null, busy: false }); if (s.busy) return; s.busy = true;
    try {
      const url = '/saved' + (!first && s.next ? '?before=' + encodeURIComponent(s.next) : ''), d = await this.api(url);
      this.put(d.posts || []); s.posts = first ? d.posts || [] : s.posts.concat((d.posts || []).filter(p => !s.posts.some(x => x.id === p.id))); s.more = !!d.more; s.next = d.next || null;
      if (this.cur && this.cur.fn === 'saved') $('ab').innerHTML = s.posts.length ? this.list(s.posts) + (s.more ? '<button class="gmorebtn" onclick="GIST.loadSaved()">Load more saved posts</button>' : '<p class="empty gend">You’re all caught up.</p>') : '<p class="empty">No saved posts yet. Use the post menu to save a post for later.</p>'
    } catch (e) { if (this.cur && this.cur.fn === 'saved') $('ab').innerHTML = `<p class="empty" role="alert">${esc(e.message)} <button class="gretry" onclick="GIST.loadSaved(true)">Try again</button></p>` }
    finally { s.busy = false }
  },
  async toggleSaved(id) {
    const p = this.cache.get(id); if (!p || String(id).startsWith('tmp')) return;
    if (document.querySelector('.asheet')) PH.closeSheet();
    const was = !!p.saved; p.saved = !was; this.redraw(id); if (typeof RL !== 'undefined') RL.sync(id);
    if (!p.saved && this.cur && this.cur.fn === 'saved' && this.savedPage) { this.savedPage.posts = this.savedPage.posts.filter(x => x.id !== id); this.savedPage.more = true; const ab = $('ab'); if (ab) ab.innerHTML = this.savedPage.posts.length ? this.list(this.savedPage.posts) : '<p class="empty">No saved posts yet. Use the post menu to save a post for later.</p>' }
    try { const r = await this.api('/posts/' + id + '/save', { method: 'POST' }); p.saved = r.saved; this.redraw(id); if (typeof RL !== 'undefined') RL.sync(id); toast(p.saved ? 'Saved for later' : 'Removed from saved posts'); if (this.cur && this.cur.fn === 'saved' && p.saved) this.loadSaved(true) }
    catch (e) { p.saved = was; if (this.cur && this.cur.fn === 'saved') this.loadSaved(true); else this.redraw(id); if (typeof RL !== 'undefined') RL.sync(id); this.err(e) }
  },
  feedHtml(F) {
    if (!F.p.length) return this.tagF ? `<p class="empty">No gists with #${esc(this.tagF)} yet. Start it! 🎉</p>` : this.tab === 'following' ? '<p class="empty">Nothing here yet. Follow players to see their gists. Find someone, or open a profile from a post.</p>' : this.tab === 'me' ? '<p class="empty">You have not posted yet. Tap “What’s the gist?” above.</p>' : '<p class="empty">No gists yet. Be the first to post something! 🎉</p>';
    const shown = this.byKind(F.p);
    if (!shown.length) return `<p class="empty">${this.kind === 'reels' ? 'No reels in your feed yet.' : 'No posts in your feed yet.'}</p>` + (F.more ? '<button class="gmorebtn" id="gmb" onclick="GIST.loadFeed()">Load more</button>' : '');
    return this.list(shown) + (F.more ? '<button class="gmorebtn" id="gmb" onclick="GIST.loadFeed()">Load more</button>' : '<p class="empty gend">You are all caught up ✨</p>')
  },
  feedUrl(first) {
    const F = this.FF(), tab = this.tagF ? 'latest' : this.tab; let q = '/feed?tab=' + tab + (this.tagF ? '&tag=' + encodeURIComponent(this.tagF) : '');
    if (!first) q += tab === 'trending' ? '&offset=' + (F.next || 0) : '&before=' + encodeURIComponent(F.p.length ? F.p[F.p.length - 1].createdAt : ''); return q
  },
  loadFeed(first) {
    const k = this.key(), F = this.FF(k); if (F.busy && !first) return; const url = '/api/ac/gist' + this.feedUrl(first);
    const apply = (r, cached) => {
      this.put(r.posts); const pend = F.p.filter(p => String(p.id).startsWith('tmp'));
      F.p = (first ? pend.concat(r.posts) : F.p.concat(r.posts)).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i); F.more = r.more; F.next = r.next || 0; F.ok = true; F.busy = false;
      if (this.cur && this.cur.fn === 'feed' && this.key() === k) { const f = $('gfeed'); if (f) { const st = $('ab').scrollTop; f.innerHTML = this.feedHtml(F); const gp = $('gpeople'); if (gp && this.tab === 'trending' && !this.tagF) gp.innerHTML = this.peopleHtml(); if (first && !cached) $('ab').scrollTop = st; this.watchMore() } }
    };
    F.busy = true;
    NET.swr(url, apply, { persist: first && !this.tagF && this.tab === 'latest', ttl: first ? 0 : 5000 }).catch(e => {
      F.busy = false; this.err(e); if (!F.ok) { const f = $('gfeed'); if (f) f.innerHTML = '<p class="empty">Could not load the feed. <button class="gretry" onclick="GIST.loadFeed(true)">Try again</button></p>' }
    }).then(() => { F.busy = false })
  },
  watchMore() { const b = $('gmb'); if (!b || !window.IntersectionObserver) return; const o = new IntersectionObserver(es => { if (es[0].isIntersecting) { o.disconnect(); this.loadFeed() } }, { root: $('ab'), rootMargin: '300px' }); o.observe(b) },
  /* ---------- live "new gists" pill ---------- */
  onNew(p) {
    if (!p || p.author === this.uid()) return;
    Object.keys(this.F).forEach(k => { if (k !== 'me') this.F[k].stale = true });
    for (const k of [...NET.cache.keys()]) if (k.includes('/api/ac/gist/feed')) NET.cache.delete(k);
    if (PH.view !== 'gist' || !this.cur || this.cur.fn !== 'feed' || this.tab === 'me' || this.tab === 'trending') return;
    this.pending++; this.showPill()
  },
  showPill() { const e = $('gnew'); if (!e) return; e.innerHTML = this.pending > 0 ? `<button class="gpill" onclick="GIST.flush()">↑ ${this.pending} new gist${this.pending > 1 ? 's' : ''}</button>` : '' },
  flush() { this.pending = 0; this.showPill(); const ab = $('ab'); if (ab) ab.scrollTo({ top: 0, behavior: 'smooth' }); this.loadFeed(true) },
  /* ---------- reactions (optimistic) ---------- */
  react(id, type) {
    const p = this.cache.get(id); if (!p || String(id).startsWith('tmp')) return; this.closeRx(); if (navigator.vibrate) try { navigator.vibrate(8) } catch (e) { }
    const snap = { myRx: p.myRx, liked: p.liked, likes: p.likes, rx: { ...(p.rx || {}) } };
    p.rx = p.rx || {};
    if (p.myRx === type) { p.rx[type] = Math.max(0, (p.rx[type] || 1) - 1); p.myRx = ''; p.liked = false; p.likes = Math.max(0, p.likes - 1) }
    else { if (p.myRx) p.rx[p.myRx] = Math.max(0, (p.rx[p.myRx] || 1) - 1); else p.likes++; p.rx[type] = (p.rx[type] || 0) + 1; p.myRx = type; p.liked = true }
    this.sync(id);
    this.api('/posts/' + id + '/react', { method: 'POST', body: { type } }).then(r => { p.myRx = r.myRx; p.liked = r.liked; p.likes = r.likes; p.rx = r.rx; this.sync(id) }).catch(e => { Object.assign(p, snap); this.sync(id); this.err(e) })
  },
  rxMenu(btn) {
    this.closeRx(); const id = btn.dataset.id, r = btn.getBoundingClientRect(), a = PH.$a(), ar = a.getBoundingClientRect(); if (navigator.vibrate) try { navigator.vibrate(15) } catch (e) { }
    const m = document.createElement('div'); m.className = 'grx'; m.id = 'grx';
    m.innerHTML = Object.entries(RXE).map(([k, e]) => `<button data-t="${k}">${e}</button>`).join('');
    m.style.left = Math.max(6, Math.min(ar.width - 250, r.left - ar.left - 8)) + 'px'; m.style.top = Math.max(6, r.top - ar.top - 58) + 'px';
    m.onclick = e => { const b = e.target.closest('button'); if (b) { e.stopPropagation(); this.react(id, b.dataset.t) } }; m.onpointerdown = e => e.stopPropagation();
    a.appendChild(m)
  },
  closeRx() { const m = $('grx'); if (m) m.remove() },
  sync(id) {
    const p = this.cache.get(id); if (!p) return;
    document.querySelectorAll(`.gp[data-id="${id}"]`).forEach(c => {
      const l = c.querySelector('.lk'); l.classList.toggle('on', !!p.myRx); l.querySelector('span').innerHTML = p.myRx ? RXE[p.myRx] : '<i class="fa-solid fa-bolt"></i>'; const ln = l.querySelector('.gnum'); if (ln) ln.textContent = p.likes || ''; const cn = c.querySelector('.gcn'); if (cn) cn.textContent = p.comments || '';
      c.querySelector('.grs').innerHTML = this.rxSummary(p);
      const vc = c.querySelector('.gcmlk'); if (vc) vc.textContent = 'View ' + (p.comments === 1 ? 'the' : 'all ' + p.comments) + ' comment' + (p.comments === 1 ? '' : 's');
      const pl = c.querySelector('.gpoll'); if (pl) pl.outerHTML = this.pollHtml(p)
    }); if (typeof RL !== 'undefined') RL.sync(id)
  },
  /* ---------- polls ---------- */
  vote(id, i) {
    const p = this.cache.get(id); if (!p || !p.poll || p.poll.myVote >= 0 || p.poll.ended) return;
    p.poll.myVote = i; p.poll.options[i].votes++; p.poll.total++; this.sync(id);
    this.api('/posts/' + id + '/vote', { method: 'POST', body: { option: i } }).then(r => { p.poll = r.post.poll; this.sync(id) }).catch(e => { p.poll.myVote = -1; p.poll.options[i].votes--; p.poll.total--; this.sync(id); this.err(e) })
  },
  /* ---------- game link ---------- */
  play(code) { const f = $('hubf'); if (code) f.src = '/gamehub?code=' + encodeURIComponent(code); openHub() },
  /* ---------- post detail + comments ---------- */
  post(id) {
    this.set('post', id); this.replyTo = null; const have = this.cache.get(id);
    const draw = p => { if (!this.cur || this.cur.fn !== 'post' || this.cur.args[0] !== id) return;
      PH.shell('P-Gist', 'GIST.back()', `<div class="abody" id="ab">${this.card(p, { detail: 1 })}<div class="lab2">COMMENTS</div><div id="gcm" role="log" aria-live="polite" aria-relevant="additions text"><p class="empty">Loading…</p></div></div>
        <div id="grep"></div><div class="gcin"><label class="sr-only" for="gc_in">Write a comment</label><input id="gc_in" placeholder="Write a comment…" maxlength="300" autocomplete="off" onkeydown="if(event.key==='Enter')GIST.send('${id}')"><button onclick="GIST.send('${id}')" aria-label="Send comment"><i class="fa-solid fa-paper-plane"></i></button></div>`);
      this.loadComments(id) };
    if (have && !have.deleted) draw(have); else PH.shell('P-Gist', 'GIST.back()', `<div class="abody" id="ab"><p class="empty">Loading…</p></div>`);
    this.api('/posts/' + id).then(r => { this.put([r.post]); this.cache.set(id, r.post); if (!have) draw(r.post); else this.sync(id) }).catch(e => { if (!have) { const ab = $('ab'); if (ab) ab.innerHTML = `<p class="empty">${esc(e.message)}</p>` } })
  },
  cmOne(c, reply) {
    const a = c.author;
    return `<div class="gc ${reply ? 'rep' : ''} ${c.pending ? 'pending' : ''}" data-c="${c.id}"><button class="gph sm" onclick="GIST.nav('profile','${a.id}')">${PH.av({ avatar: a.avatar, displayName: a.displayName, username: a.username })}</button><div class="gcb"><b>${esc(a.displayName)}${this.vb(a)}</b><p>${this.txt(c.text)}</p>
      <small>${c.pending ? 'sending…' : this.ago(c.createdAt)}${c.pending ? '' : ` · <button class="${c.liked ? 'on' : ''}" onclick="GIST.likeComment('${c.id}')">${c.liked ? '❤️' : '🤍'}${c.likes ? ' ' + c.likes : ''}</button> · <button onclick="GIST.reply('${c.parent || c.id}','${esc(a.username || a.displayName).replace(/'/g, '')}')">Reply</button>${c.canDelete ? ` · <button onclick="GIST.delComment('${c.id}')">Delete</button>` : ''}`}</small></div></div>`
  },
  drawComments() {
    const b = $('gcm'); if (!b || !this.cm) return; const L = this.cm.list, top = L.filter(c => !c.parent);
    b.innerHTML = top.length ? top.map(c => this.cmOne(c) + L.filter(r => r.parent === c.id).map(r => this.cmOne(r, 1)).join('')).join('') + (this.cm.more ? '<p class="empty">Showing the first 200 comments.</p>' : '') : '<p class="empty">No comments yet. Start the conversation <i class="fa-solid fa-comment"></i></p>'
  },
  loadComments(id) {
    this.cm = { id, list: [], more: false };
    NET.swr('/api/ac/gist/posts/' + id + '/comments', r => { if (!this.cm || this.cm.id !== id) return; this.cm.list = r.comments.concat(this.cm.list.filter(c => c.pending)); this.cm.more = r.more; this.drawComments() }, { ttl: 0 }).catch(e => { const b = $('gcm'); if (b) b.innerHTML = `<p class="empty">${esc(e.message)}</p>` })
  },
  reply(pid, name) { this.replyTo = { id: pid, name }; const r = $('grep'); if (r) r.innerHTML = `<div class="grepl">Replying to <b>@${esc(name)}</b><button onclick="GIST.cancelReply()"><i class="fa-solid fa-xmark"></i></button></div>`; const i = $('gc_in'); if (i) { i.placeholder = 'Write a reply…'; i.focus() } },
  cancelReply() { this.replyTo = null; const r = $('grep'); if (r) r.innerHTML = ''; const i = $('gc_in'); if (i) i.placeholder = 'Write a comment…' },
  send(id) {
    const i = $('gc_in'), t = (i.value || '').trim(); if (!t || !this.cm) return; const rt = this.replyTo, u = NET.user || {};
    const tmp = { id: 'tmpc' + Date.now(), text: t, parent: rt ? rt.id : '', likes: 0, liked: false, createdAt: new Date().toISOString(), pending: true, canDelete: false, author: { id: u.id, displayName: u.displayName || 'You', username: u.username || '', avatar: u.avatar || '', verified: !!u.verified } };
    this.cm.list.push(tmp); i.value = ''; this.cancelReply(); this.drawComments(); const p = this.cache.get(id); if (p) { p.comments++; this.sync(id) }
    this.api('/posts/' + id + '/comments', { method: 'POST', body: { text: t, parent: rt ? rt.id : '' } }).then(r => { const k = this.cm.list.indexOf(tmp); if (k >= 0) this.cm.list[k] = r.comment; this.drawComments() })
      .catch(e => { this.cm.list = this.cm.list.filter(c => c !== tmp); this.drawComments(); if (p) { p.comments = Math.max(0, p.comments - 1); this.sync(id) } i.value = t; this.err(e) })
  },
  likeComment(cid) {
    const c = this.cm && this.cm.list.find(x => x.id === cid); if (!c) return; c.liked = !c.liked; c.likes = Math.max(0, c.likes + (c.liked ? 1 : -1)); this.drawComments();
    this.api('/comments/' + cid + '/like', { method: 'POST' }).then(r => { c.liked = r.liked; c.likes = r.likes; this.drawComments() }).catch(e => { c.liked = !c.liked; c.likes = Math.max(0, c.likes + (c.liked ? 1 : -1)); this.drawComments(); this.err(e) })
  },
  delComment(cid) {
    const L = this.cm.list, c = L.find(x => x.id === cid); if (!c) return; const gone = L.filter(x => x.id === cid || x.parent === cid), id = this.cm.id, p = this.cache.get(id);
    this.cm.list = L.filter(x => !gone.includes(x)); this.drawComments(); if (p) { p.comments = Math.max(0, p.comments - gone.length); this.sync(id) }
    this.api('/comments/' + cid, { method: 'DELETE' }).catch(e => { this.err(e); this.loadComments(id) })
  },
  /* ---------- Manage: creator programme (eligibility, milestones, stats) ---------- */
  manage() {
    this.set('manage'); PH.shell('Manage', 'GIST.back()', `<div class="abody" id="ab"><p class="empty">Loading…</p></div>`);
    NET.api('/api/ac/creator/status').then(d => { this.cr = d; if (this.cur && this.cur.fn === 'manage') this.drawManage() }).catch(e => { const ab = $('ab'); if (ab) ab.innerHTML = `<p class="empty">${esc(e.message)}</p>` })
  },
  drawManage() {
    const d = this.cr, n = x => Number(x || 0).toLocaleString('en-NG'), S = d.stats;
    const ST = {
      locked: ['lock', '#64748b', 'Not eligible yet', `You meet ${d.metCount} of ${d.total} requirements. Keep posting and growing.`],
      eligible: ['circle-check', '#22b573', 'You are eligible!', 'You meet every requirement. Apply to join the creator programme.'],
      applied: ['hourglass-half', '#f59e0b', 'Under review', 'We got your application. The team will review it soon.'],
      approved: ['star', '#6366f1', 'You are in the programme', 'Your gists can earn real money once payouts go live.'],
      rejected: ['circle-xmark', '#e5484d', 'Not approved this time', d.note || 'Keep improving and apply again.'],
      suspended: ['pause', '#e5484d', 'Access paused', d.note || 'Contact support to find out more.']
    }[d.state];
    const action = d.canApply ? `<button class="btn p" onclick="GIST.applyCreator(this)">Apply for the creator programme</button>` : d.state === 'rejected' && d.waitDays ? `<p class="gmnote">You can apply again in ${d.waitDays} day${d.waitDays === 1 ? '' : 's'}.</p>` : '';
    const crit = d.criteria.map(c => `<div class="gmc ${c.met ? 'gmdone' : ''}"><span class="gmck"><span class="fa-solid fa-${c.met ? 'check' : 'minus'}"></span></span><div><b>${esc(c.title)}</b><small>${c.met ? 'Done' : esc(c.hint)}</small>${c.flag ? '' : `<div class="gmbar"><i style="width:${c.pct}%"></i></div>`}</div>${c.flag ? '' : `<span class="gmv">${n(Math.min(c.have, c.need))}/${n(c.need)}</span>`}</div>`).join('');
    const ms = d.milestones.map(m => `<div class="gmm"><div class="gmmh"><span class="gmi"><span class="fa-solid fa-${m.fa}"></span></span><b>${esc(m.label)}</b><span>${n(m.value)}</span></div><div class="gmbar"><i style="width:${m.pct}%"></i></div><div class="gmsteps">${m.steps.map((s, i) => `<em class="${i < m.reached ? 'on' : ''}">${s >= 1000 ? s / 1000 + 'k' : s}</em>`).join('')}</div><small>${m.next ? `${n(m.next - m.value)} more to reach ${n(m.next)}` : 'All milestones reached!'}</small></div>`).join('');
    const grid = [['Followers', n(S.followers), S.newFollowers ? `+${n(S.newFollowers)} this month` : ''], ['Gists', n(S.posts), S.posts30 ? `${n(S.posts30)} this month` : ''], ['Reactions', n(S.reactions), S.reactions30 ? `+${n(S.reactions30)} this month` : ''], ['Comments', n(S.comments), S.comments30 ? `+${n(S.comments30)} this month` : ''], ['Shares', n(S.shares), ''], ['Avg reactions', n(S.avgReactions), 'per gist']];
    $('ab').innerHTML = `<div class="gm">
      <div class="gmst" style="--c:${ST[1]}"><span class="gmsi"><span class="fa-solid fa-${ST[0]}"></span></span><div><h3>${ST[2]}</h3><p>${esc(ST[3])}</p></div></div>${action}
      <h4>Requirements <small>${d.metCount}/${d.total}</small></h4><div class="gmcard">${crit}</div>
      <h4>Milestones</h4>${ms}
      <h4>Your stats</h4><div class="gmgrid">${grid.map(x => `<div><b>${x[1]}</b><span>${x[0]}</span>${x[2] ? `<small>${x[2]}</small>` : ''}</div>`).join('')}</div>
      ${S.top ? `<div class="gmtop"><small>Top gist</small><p>${esc(S.top.text) || 'Photo or poll gist'}</p><span><span class="fa-solid fa-heart"></span> ${n(S.top.likes)} &nbsp; <span class="fa-solid fa-comment"></span> ${n(S.top.comments)}</span></div>` : ''}
      <h4>Rewards &amp; payouts</h4><div class="gmrw" id="gmrw"><button class="gmrwh" onclick="GIST.rewards()"><span class="gmrwi">💰</span><span class="gmrwt"><b>Rewards and Payouts</b><small>Confirm your details so you are ready when we launch</small></span><span class="gmrwb">E dey come soon</span></button><div id="gmrwf"></div></div>
      <h4>Earnings</h4><div class="gmpay"><span class="fa-solid fa-wallet"></span><div><b>Real-money payouts</b><p>${esc(d.payouts.text)}</p></div></div>
    </div>`;
  },
  /* ---------- Rewards & payouts sign-up (moved here from the GameHub lobby) ---------- */
  async rewards() {
    const box = $('gmrwf'); if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return }
    box.innerHTML = '<p class="gmnote">Loading…</p>';
    let st = { launch: 'Late December', registered: false };
    try { st = await NET.api('/api/rewards/status') } catch (e) {}
    const C = [['NG', 'Nigeria'], ['GH', 'Ghana'], ['KE', 'Kenya'], ['ZA', 'South Africa'], ['UG', 'Uganda'], ['TZ', 'Tanzania'], ['GB', 'United Kingdom'], ['US', 'United States'], ['CA', 'Canada'], ['IN', 'India'], ['OT', 'Other']];
    const M = [['bank', 'Local bank transfer'], ['mobile_money', 'Mobile money'], ['crypto', 'Crypto wallet']];
    const opt = (L, v) => L.map(([c, n]) => `<option value="${c}" ${v === c ? 'selected' : ''}>${n}</option>`).join('');
    box.innerHTML = `<div class="gmrwform">
      <p class="gmrwhero">🚀 <b>Coming soon · ${esc(st.launch)}</b><br>Soon you will be able to turn approved rewards into real payouts. Your ₦ balance stays in-game money and is not cash.</p>
      ${st.registered ? `<p class="gmrwdone">✅ You are on the list${st.legalName ? ', ' + esc(st.legalName) : ''}. You can update your details below.</p>` : ''}
      <label>Full name (as on your ID)<input type="text" id="rwName" maxlength="80" autocomplete="name" value="${esc(st.legalName || '')}"></label>
      <label>Country<select id="rwCountry"><option value="">Select…</option>${opt(C, st.country)}</select></label>
      <label>Preferred payout method<select id="rwMethod"><option value="">Select…</option>${opt(M, st.method)}</select></label>
      <label class="chk"><input type="checkbox" id="rwAge"> I am 18 years or older</label>
      <label class="chk"><input type="checkbox" id="rwTerms"> I understand rewards are not available yet and may only be offered in supported countries after identity verification</label>
      <label class="chk"><input type="checkbox" id="rwNotify" ${st.notify === false ? '' : 'checked'}> Notify me when rewards go live</label>
      <button class="btn p" id="rwSave" onclick="GIST.saveRewards(this)">${st.registered ? 'Update my details' : 'Verify &amp; keep my spot'}</button>
      <p class="gmnote">Never enter bank numbers, wallet addresses, passwords or seed phrases here. Identity and payout details will be verified securely through a licensed provider at launch.</p></div>`;
  },
  async saveRewards(btn) {
    if (btn) btn.disabled = true;
    const v = i => ($(i) || {}).value, c = i => !!($(i) || {}).checked;
    try {
      const d = await NET.api('/api/rewards/register', { method: 'POST', body: { legalName: v('rwName'), country: v('rwCountry'), method: v('rwMethod'), over18: c('rwAge'), termsAccepted: c('rwTerms'), notify: c('rwNotify') } });
      toast('Saved. You are on the list for ' + d.launch);
      const box = $('gmrwf'); if (box) box.innerHTML = ''; this.rewards();
    } catch (e) { toast(e.message || 'Could not save'); if (btn) btn.disabled = false }
  },
  async applyCreator(btn) {
    if (btn) btn.disabled = true;
    try { this.cr = await NET.api('/api/ac/creator/apply', { method: 'POST' }); toast('Application sent'); this.drawManage() } catch (e) { toast(e.message); if (btn) btn.disabled = false }
  },
  /* ---------- the ONE profile ---------- */
  profile(key) {
    this.set('profile', key); PH.shell('Profile', 'GIST.back()', `<div class="abody" id="ab"><p class="empty">Loading…</p></div>`);
    NET.swr('/api/ac/gist/profile/' + encodeURIComponent(key), r => { this.put(r.posts); let saved = 'grid'; try { saved = localStorage.getItem('ac:gist:profile-view') || 'grid' } catch (e) {} const mode = this.pf && this.pf.key === key ? this.pf.mode : saved; this.pf = { key, r, posts: r.posts, more: r.more, mode: ['grid', 'posts', 'reels'].includes(mode) ? mode : 'grid' }; this.drawProfile() }, { ttl: 0 }).catch(e => { const ab = $('ab'); if (ab && !this.pf) ab.innerHTML = `<p class="empty">${esc(e.message)}</p>`; else if (ab) this.err(e) })
  },
  drawProfile() {
    const { r, posts, more } = this.pf, u = r.user, g = r.game || {}; if (!this.cur || this.cur.fn !== 'profile') return;
    const hd = document.querySelector('.appview .ahead');
    if (hd && r.isMe && !hd.querySelector('.gmanage')) hd.insertAdjacentHTML('beforeend', '<button class="gmanage" onclick="GIST.nav(\'manage\')"><span class="fa-solid fa-sliders"></span> Manage</button>');
    const since = g.since ? new Date(g.since).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
    const st = [['Level', g.level], ['Played', g.played], ['Wins', g.wins], ['Win rate', g.winRate + '%'], ['Losses', g.losses], ['Best streak', g.bestStreak], ['Cups won', g.tournamentWins], ['Rating', g.rating]];
    const btns = r.isMe ? `<button class="btn p" onclick="PH.editProfile('GIST.openProfile(\\'me\\')')"><i class="fa-solid fa-pen"></i> Edit profile</button><button class="btn s" onclick="GIST.nav('compose')">New gist</button>`
      : r.relation === 'blocked' ? `<div class="gpb"><button class="btn p" id="gmb2" onclick="GIST.unblock()"><i class="fa-solid fa-lock-open"></i> Unblock</button><button class="btn s gdots2" onclick="GIST.userMenu()" aria-label="More">⋯</button></div>`
      : `<div class="gpb"><button class="btn ${r.isFollowing ? 's' : 'p'}" id="gfb" onclick="GIST.follow()">${r.isFollowing ? 'Following ✓' : 'Follow'}</button><button class="btn s" id="gmb2" onclick="GIST.message()"><i class="fa-solid fa-comment"></i> Message</button><button class="btn s gdots2" onclick="GIST.userMenu()" aria-label="More">⋯</button></div>`;
    $('ab').innerHTML = `<div class="gprof"><div class="gcover" ${u.cover ? `style="background-image:url('${esc(u.cover)}')"` : ''}></div><div class="gavw">${PH.av({ avatar: u.avatar, displayName: u.displayName, username: u.username }, 1).replace('class="avi big"', 'class="avi huge"')}${r.online ? '<i class="gon"></i>' : ''}</div>
      <h3>${esc(u.displayName)}${this.vb(u)}</h3><p class="gun">${u.username ? '@' + esc(u.username) : ''}${r.online ? ' · <span class="gonl">Online</span>' : ''}</p>${u.bio ? `<p class="gbio">${this.txt(u.bio)}</p>` : (r.isMe ? '<p class="gbio mut">Add a bio in Edit profile</p>' : '')}
      <div class="gstats"><div><b>${r.postsCount}</b><span>Posts</span></div><button onclick="GIST.nav('people','${u.id}','followers')"><b id="gfc">${r.followers}</b><span>Followers</span></button><button onclick="GIST.nav('people','${u.id}','following')"><b>${r.following}</b><span>Following</span></button></div>${btns}
      <div class="ggs"><div class="ggh"><i class="fa-solid fa-gamepad"></i> Game stats${since ? `<small>Playing since ${since}</small>` : ''}</div><div class="ggg">${st.map(s => `<div><b>${s[1] == null ? 0 : s[1]}</b><span>${s[0]}</span></div>`).join('')}</div></div></div>
      <div class="gprofile-toolbar"><div class="gprofile-tabs" role="tablist" aria-label="Profile posts">${[['grid','Grid'],['posts','Posts'],['reels','Reels']].map(([m,n]) => `<button role="tab" aria-controls="gprofile-content" tabindex="${(this.pf.mode || 'grid') === m ? '0' : '-1'}" aria-selected="${(this.pf.mode || 'grid') === m}" class="${(this.pf.mode || 'grid') === m ? 'on' : ''}" onclick="GIST.profileMode('${m}')">${n}</button>`).join('')}</div><div class="gview-toggle" role="group" aria-label="Post layout"><button class="${this.pf.mode === 'grid' ? 'on' : ''}" onclick="GIST.profileMode('grid')" aria-label="Grid view" aria-pressed="${this.pf.mode === 'grid'}" title="Grid view"><i class="fa-solid fa-table-cells" aria-hidden="true"></i></button><button class="${this.pf.mode !== 'grid' ? 'on' : ''}" onclick="GIST.profileMode('posts')" aria-label="List view" aria-pressed="${this.pf.mode !== 'grid'}" title="List view"><i class="fa-solid fa-list" aria-hidden="true"></i></button></div></div><div id="gprofile-content" role="tabpanel">${this.profileContent(posts, more)}</div>`
  },
  profileMode(mode) { if (!['grid','posts','reels'].includes(mode) || !this.pf) return; this.pf.mode = mode; try { localStorage.setItem('ac:gist:profile-view', mode) } catch (e) {} this.drawProfile() },
  profileContent(posts, more) {
    const mode = this.pf.mode || 'grid', items = mode === 'reels' ? posts.filter(p => p.video) : posts;
    if (!items.length) return `<p class="empty">${mode === 'reels' && more ? 'No Reels on this page yet.' : mode === 'reels' ? 'No Reels posted yet.' : 'No gists yet.'}</p>${more ? '<button class="gmorebtn" onclick="GIST.moreProfile()">Load more</button>' : ''}`;
    const body = mode === 'grid' ? `<div class="gprofile-grid">${items.map(p => { const im = p.images && p.images[0], src = im && (im.thumb || im.url) || p.video && p.video.poster || p.song && p.song.albumArt || '', label = `${p.video ? 'Reel' : 'Post'} by ${p.author.displayName}: ${(p.text || '').slice(0, 80)}`; return `<button class="gprofile-tile" onclick="GIST.nav('post','${p.id}')" aria-label="${esc(label)}">${src ? `<img src="${esc(src)}" alt="${esc(label)}" loading="lazy">` : `<span class="gprofile-tile-text">${esc((p.text || p.game && p.game.name || 'Post').slice(0, 90))}</span>`}<span class="gprofile-tile-kind">${p.video ? '<i class="fa-solid fa-clapperboard" aria-hidden="true"></i>' : p.images && p.images.length > 1 ? '<i class="fa-solid fa-images" aria-hidden="true"></i>' : ''}</span></button>` }).join('')}</div>` : this.list(items);
    return body + (more ? '<button class="gmorebtn" onclick="GIST.moreProfile()">Load more</button>' : '')
  },
  async moreProfile() { const p = this.pf; try { const last = p.posts.filter(x => !x.pinned); const r = await this.api('/profile/' + p.r.user.id + '/posts?before=' + encodeURIComponent((last[last.length - 1] || p.posts[p.posts.length - 1]).createdAt)); this.put(r.posts); p.posts = p.posts.concat(r.posts); p.more = r.more; const s = $('ab').scrollTop; this.drawProfile(); $('ab').scrollTop = s } catch (e) { this.err(e) } },
  follow() {
    const p = this.pf; if (!p) return; const r = p.r, was = r.isFollowing; r.isFollowing = !was; r.followers = Math.max(0, r.followers + (was ? -1 : 1)); this.drawProfile();
    this.api('/follow/' + r.user.id, { method: 'POST' }).then(x => { r.isFollowing = x.following; r.followers = x.followers; Object.values(this.F).forEach(f => f.stale = true); NET.drop('/gist/profile'); this.drawProfile() }).catch(e => { r.isFollowing = was; r.followers = Math.max(0, r.followers + (was ? 1 : -1)); this.drawProfile(); this.err(e) })
  },
  unblock() { const p = this.pf; if (!p) return; this.friendAct(p.r.user.id, 'unblock') },
  message() { const id = this.pf.r.user.id; PH.chat(id, `GIST.openProfile('${id}')`) },
  userMenu() {
    const r = this.pf.r, u = r.user, id = u.id, rel = r.relation;
    if (rel === 'blocked') return PH.sheet(`<h3>${esc(u.displayName)}</h3><button class="fopt" onclick="GIST.friendAct('${id}','unblock')"><span>Unblock</span></button><button class="fopt" onclick="GIST.friendAct('${id}','report')"><span><i class="fa-solid fa-flag"></i> Report player</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`);
    const fr = rel === 'friend' ? `<button class="fopt" onclick="GIST.friendAct('${id}','remove')"><span><i class="fa-solid fa-user-xmark"></i> Remove friend</span></button>` : rel === 'sent' ? `<button class="fopt" onclick="GIST.friendAct('${id}','remove')"><span>⏳ Cancel friend request</span></button>` : rel === 'received' ? `<button class="fopt" onclick="GIST.friendAct('${id}','accept')"><span><i class="fa-solid fa-user-check"></i> Accept friend request</span></button>` : `<button class="fopt" onclick="GIST.friendAct('${id}','add')"><span><i class="fa-solid fa-plus"></i> Add friend</span></button>`;
    PH.sheet(`<h3>${esc(u.displayName)}</h3>${fr}<button class="fopt" onclick="GIST.muteUser()"><span><i class="fa-solid fa-volume-xmark"></i> ${r.isMuted ? 'Unmute posts and notifications' : 'Mute posts and notifications'}</span></button><button class="fopt" onclick="PH.closeSheet();PH.payUser('${id}','${esc(u.username)}','GIST.openProfile(\\'${id}\\')')"><span><i class="fa-solid fa-money-bill-transfer"></i> Send money</span></button><button class="fopt red" onclick="GIST.friendAct('${id}','block')"><span><i class="fa-solid fa-ban"></i> Block</span></button><button class="fopt" onclick="GIST.friendAct('${id}','report')"><span><i class="fa-solid fa-flag"></i> Report player</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)
  },
  async muteUser() {
    const p = this.pf; if (!p || p.r.isMe) return; const id = p.r.user.id, was = !!p.r.isMuted; p.r.isMuted = !was; PH.closeSheet(); this.drawProfile();
    try { const r = await this.api('/mute/' + encodeURIComponent(id), { method: 'POST', body: { muted: p.r.isMuted } }); p.r.isMuted = r.muted; Object.values(this.F).forEach(f => { f.stale = true }); NET.drop('/api/ac/gist/feed'); NET.drop('/api/ac/gist/reels'); toast(r.muted ? 'Posts and notifications muted' : 'Posts and notifications unmuted'); this.drawProfile() }
    catch (e) { p.r.isMuted = was; this.drawProfile(); this.err(e) }
  },
  async friendAct(id, act) {
    PH.closeSheet(); const N = (u, o) => NET.api('/api/ac' + u, o);
    try {
      if (act === 'add') { const r = await N(`/friends/${id}/request`, { method: 'POST' }); this.pf.r.relation = r.state === 'friend' ? 'friend' : 'sent'; toast(r.state === 'friend' ? 'You are now friends 🎉' : 'Friend request sent ✓') }
      else if (act === 'accept') { await N(`/friends/${id}/accept`, { method: 'POST' }); this.pf.r.relation = 'friend'; toast('Friend added 🎉') }
      else if (act === 'remove') { await N(`/friends/${id}`, { method: 'DELETE' }); this.pf.r.relation = 'none'; toast('Done') }
      else if (act === 'block') { await N(`/block/${id}`, { method: 'POST' }); this.pf.r.relation = 'blocked'; toast('Blocked'); NET.drop('/api/ac/'); return this.drawProfile() }
      else if (act === 'unblock') { await N(`/unblock/${id}`, { method: 'POST' }); this.pf.r.relation = 'none'; toast('Unblocked'); NET.drop('/api/ac/'); return this.drawProfile() }
      else if (act === 'report') return PH.sheet(`<h3>Report this player</h3><p class="hint2">Pick a reason. Our team reviews every report.</p>${['Spam', 'Harassment', 'Scam', 'Inappropriate'].map(x => `<button class="fopt" onclick="PH.closeSheet();NET.api('/api/ac/report/${id}',{method:'POST',body:{reason:'${x}'}}).then(()=>toast('Report sent. Thank you 🙏🏾')).catch(e=>toast(e.message))"><span>${x}</span></button>`).join('')}`)
      NET.drop('/api/ac/friends')
    } catch (e) { this.err(e) }
  },
  async people(id, kind) {
    this.set('people', id, kind); PH.shell(kind === 'following' ? 'Following' : 'Followers', 'GIST.back()', `<div class="abody" id="ab"><p class="empty">Loading…</p></div>`);
    NET.swr('/api/ac/gist/profile/' + id + '/people?kind=' + kind, r => {
      if (!this.cur || this.cur.fn !== 'people') return; this.pl = r.people;
      $('ab').innerHTML = r.people.length ? r.people.map((u, i) => `<div class="gperson"><button class="gph" onclick="GIST.nav('profile','${u.id}')">${PH.av({ avatar: u.avatar, displayName: u.displayName, username: u.username })}<span><b>${esc(u.displayName)}${this.vb(u)}</b><i>${u.username ? '@' + esc(u.username) : ''}</i></span></button>${u.isMe ? '' : `<button class="gfollow ${u.isFollowing ? 'on' : ''}" onclick="GIST.followRow(${i},this)">${u.isFollowing ? 'Following' : 'Follow'}</button>`}</div>`).join('') : '<p class="empty">Nobody here yet.</p>'
    }, { ttl: 0 }).catch(e => { const ab = $('ab'); if (ab) ab.innerHTML = `<p class="empty">${esc(e.message)}</p>` })
  },
  followRow(i, b) { const u = this.pl[i], was = u.isFollowing; u.isFollowing = !was; b.textContent = u.isFollowing ? 'Following' : 'Follow'; b.classList.toggle('on', u.isFollowing); this.api('/follow/' + u.id, { method: 'POST' }).then(r => { Object.values(this.F).forEach(f => f.stale = true) }).catch(e => { u.isFollowing = was; b.textContent = was ? 'Following' : 'Follow'; b.classList.toggle('on', was); this.err(e) }) },
  /* ---------- menus ---------- */
  menu(id) {
    const p = this.cache.get(id); if (!p) return;
    PH.sheet(`<h3>Gist options</h3><button class="fopt" onclick="GIST.toggleSaved('${id}')"><span><i class="fa-${p.saved ? 'solid' : 'regular'} fa-bookmark"></i> ${p.saved ? 'Remove from saved' : 'Save for later'}</span></button>${p.mine ? `${p.text || !p.shared ? `<button class="fopt" onclick="GIST.editSheet('${id}')"><span><i class="fa-solid fa-pen"></i> Edit gist</span></button>` : ''}<button class="fopt" onclick="GIST.pin('${id}')"><span><i class="fa-solid fa-thumbtack"></i> ${p.pinned ? 'Unpin from profile' : 'Pin to my profile'}</span></button><button class="fopt red out" onclick="GIST.askDelete('${id}')"><span><i class="fa-solid fa-trash"></i> Delete gist</span></button>` : `<button class="fopt" onclick="PH.closeSheet();GIST.nav('profile','${p.author.id}')"><span><i class="fa-solid fa-user"></i> View ${esc(p.author.displayName)}’s profile</span></button><button class="fopt" onclick="GIST.reportSheet('${id}')"><span><i class="fa-solid fa-flag"></i> Report gist</span></button>`}${p.text ? `<button class="fopt" onclick="GIST.copy('${id}')"><span><i class="fa-solid fa-copy"></i> Copy text</span></button>` : ''}<button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)
  },
  async copy(id) { PH.closeSheet(); try { await navigator.clipboard.writeText(this.cache.get(id).text); toast('Copied ✓') } catch (e) { toast('Could not copy') } },
  editSheet(id) {
    const p = this.cache.get(id); PH.closeSheet();
    PH.sheet(`<h3>Edit gist</h3><textarea class="gedit" id="ged" maxlength="500">${esc(p.text)}</textarea><div class="aerr" id="gede"></div><button class="btn p" onclick="GIST.saveEdit('${id}')">Save</button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`); const t = $('ged'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length) }
  },
  saveEdit(id) {
    const p = this.cache.get(id), t = ($('ged').value || '').trim(); if (!t && !p.images.length && !p.game && !p.poll && !p.shared) return $('gede').textContent = 'A gist cannot be empty.';
    if (t === p.text) return PH.closeSheet(); const old = { text: p.text, edited: p.edited, tags: p.tags }; PH.closeSheet(); p.text = t; p.edited = true; this.redraw(id);
    this.api('/posts/' + id, { method: 'PUT', body: { text: t } }).then(r => { this.put([r.post]); Object.assign(p, r.post); this.redraw(id); toast('Gist updated ✓') }).catch(e => { Object.assign(p, old); this.redraw(id); this.err(e) })
  },
  redraw(id) { const p = this.cache.get(id); if (!p) return; document.querySelectorAll(`.gp[data-id="${id}"]`).forEach(c => { c.outerHTML = this.card(p, { detail: this.cur && this.cur.fn === 'post' }) }) },
  pin(id) {
    PH.closeSheet(); const p = this.cache.get(id), was = p.pinned; p.pinned = !was;
    Object.values(this.F).forEach(f => f.p.forEach(x => { if (x.mine && x.id !== id && p.pinned) x.pinned = false })); if (this.pf) this.pf.posts.forEach(x => { if (x.id !== id && p.pinned) x.pinned = false });
    this.redraw(id); toast(p.pinned ? 'Pinned to your profile 📌' : 'Unpinned');
    this.api('/posts/' + id + '/pin', { method: 'POST' }).then(() => { NET.drop('/gist/profile'); if (this.cur && this.cur.fn === 'profile') this.profile(this.cur.args[0]) }).catch(e => { p.pinned = was; this.redraw(id); this.err(e) })
  },
  askDelete(id) { PH.closeSheet(); PH.sheet(`<h3>Delete this gist?</h3><p class="hint2">Likes and comments on it are removed too. This cannot be undone.</p><button class="fopt red out" onclick="GIST.del('${id}')"><span>Delete</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`) },
  del(id) {
    PH.closeSheet(); const p = this.cache.get(id); this.cache.delete(id); Object.values(this.F).forEach(f => { f.p = f.p.filter(x => x.id !== id) });
    if (this.pf) { this.pf.posts = this.pf.posts.filter(x => x.id !== id); this.pf.r.postsCount = Math.max(0, this.pf.r.postsCount - 1) } toast('Gist deleted');
    if (this.cur.fn === 'reels') RL.removed(id); else if (this.cur.fn === 'post') this.back(); else if (this.cur.fn === 'profile') this.drawProfile(); else { const f = $('gfeed'); if (f) f.innerHTML = this.feedHtml(this.FF()) }
    this.api('/posts/' + id, { method: 'DELETE' }).catch(e => { this.err(e); if (p) { this.cache.set(id, p); Object.values(this.F).forEach(f => f.stale = true); this.loadFeed(true) } })
  },
  reportSheet(id) { PH.closeSheet(); PH.sheet(`<h3>Report this gist</h3><p class="hint2">Pick a reason. Our team reviews every report.</p>${['Spam', 'Harassment', 'Inappropriate content', 'Scam'].map(r => `<button class="fopt" onclick="GIST.report('${id}','${r}')"><span>${r}</span></button>`).join('')}`) },
  async report(id, r) { PH.closeSheet(); try { await this.api('/posts/' + id + '/report', { method: 'POST', body: { reason: r } }); toast('Report sent. Thank you 🙏🏾') } catch (e) { this.err(e) } },
  shareSheet(id) {
    const p = this.cache.get(id); if (!p || String(id).startsWith('tmp')) return; if (p.shared && p.shared.id) id = p.shared.id;
    PH.sheet(`<h3>Share this gist</h3><button class="fopt" onclick="GIST.repost('${id}')"><span><i class="fa-solid fa-retweet"></i> Repost to my feed</span></button><button class="fopt" onclick="PH.closeSheet();GIST.nav('compose','share','${id}')"><span><i class="fa-solid fa-pen-nib"></i> Share with a comment</span></button><button class="fopt" onclick="GIST.copyLink('${id}')"><span><i class="fa-solid fa-link"></i> Copy link to this post</span></button>${navigator.share ? `<button class="fopt" onclick="GIST.ext('${id}')"><span><i class="fa-solid fa-share-nodes"></i> Share outside AllConnect</span></button>` : ''}<button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)
  },
  postLink(id) { const u = new URL('/play', location.origin); u.searchParams.set('open', 'gist'); u.searchParams.set('ref', id); return u.toString() },
  async copyLink(id) { PH.closeSheet(); try { await navigator.clipboard.writeText(this.postLink(id)); toast('Post link copied') } catch (e) { toast('Could not copy the post link') } },
  async ext(id) { PH.closeSheet(); const p = this.cache.get(id); try { await navigator.share({ title: 'AllConnect Gist', text: ((p.text || 'A gist on AllConnect') + '').slice(0, 120), url: this.postLink(id) }) } catch (e) { } },
  async repost(id) { PH.closeSheet(); try { const r = await this.api('/posts', { method: 'POST', body: { sharedFrom: id } }); this.afterPost(r.post, id); toast('Reposted ✓') } catch (e) { this.err(e) } },
  afterPost(post, origId) {
    this.put([post]); this.cache.set(post.id, post); ['latest', 'following', 'me'].forEach(k => { if (this.F[k] && this.F[k].ok) this.F[k].p.unshift(post) });
    const o = this.cache.get(origId); if (o) { o.shares++; this.sync(origId) }
    if (this.cur && this.cur.fn === 'feed') { const f = $('gfeed'); if (f) f.innerHTML = this.feedHtml(this.FF()) }
  },
  /* ---------- lightbox with swipe ---------- */
  lightbox(id, i) { const p = this.cache.get(id); if (!p || !p.images[i]) return; this.lb = { id, i }; this.drawLb() },
  drawLb() {
    const { id, i } = this.lb, p = this.cache.get(id), n = p.images.length; let el = $('glb'); if (!el) { el = document.createElement('div'); el.id = 'glb'; el.className = 'glb'; PH.$a().appendChild(el) }
    el.innerHTML = `<div class="glbt"><button onclick="GIST.closeLb()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><span>${i + 1} / ${n}</span><button onclick="GIST.shareImg()">Share photo</button></div><div class="glbi"><button class="vnav l" ${i ? '' : 'disabled'} onclick="GIST.lbGo(-1)">‹</button><img src="${esc(p.images[i].url)}" alt=""><button class="vnav r" ${i < n - 1 ? '' : 'disabled'} onclick="GIST.lbGo(1)">›</button></div>`;
    const z = el.querySelector('.glbi'); let x0 = null; z.ontouchstart = e => { x0 = e.touches[0].clientX }; z.ontouchend = e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 45) this.lbGo(dx < 0 ? 1 : -1) }
  },
  lbGo(d) { const n = this.cache.get(this.lb.id).images.length, k = this.lb.i + d; if (k < 0 || k >= n) return; this.lb.i = k; this.drawLb() }, closeLb() { const e = $('glb'); if (e) e.remove() },
  shareImg() { const p = this.cache.get(this.lb.id), im = p.images[this.lb.i]; this.closeLb(); this.nav('compose', 'image', { src: 'platform', url: im.url, thumb: im.thumb || im.url }) },
  /* ---------- composer ---------- */
  draftKey() { return 'pgist:draft:' + this.uid() },
  saveDraft() {
    const C = this.C; if (!C) return;
    const d = { at: Date.now(), text: C.text || '', images: (C.images || []).slice(0, 10).map(i => ({ src: i.src, id: i.id, url: i.url, thumb: i.thumb })), game: C.game || null, song: C.song || null, poll: C.poll || null, sharedId: C.shared && C.shared.id || C.sharedId || null };
    const has = d.text.trim() || d.images.length || d.game || d.song || d.poll || d.sharedId;
    try { if (has) localStorage.setItem(this.draftKey(), JSON.stringify(d)); else localStorage.removeItem(this.draftKey()) } catch (e) {}
  },
  restoreDraft() {
    try { const d = JSON.parse(localStorage.getItem(this.draftKey()) || 'null'); if (!d || Date.now() - Number(d.at || 0) > 14 * 86400000) { localStorage.removeItem(this.draftKey()); return null }
      return { text: String(d.text || ''), images: Array.isArray(d.images) ? d.images.filter(i => i && i.url).slice(0, 10) : [], game: d.game || null, song: d.song || null, shared: d.sharedId ? this.cache.get(d.sharedId) || null : null, sharedId: d.sharedId || null, poll: d.poll || null, busy: false };
    } catch (e) { return null }
  },
  clearDraft() { try { localStorage.removeItem(this.draftKey()) } catch (e) {} },
  compose(mode, arg) {
    this.set('compose', mode, arg); const u = NET.user || {};
    if (!this.C) { const draft = this.restoreDraft(); this.C = draft || { text: '', images: [], game: null, song: null, shared: null, poll: null, busy: false }; if (draft) this.C.restoredDraft = true }
    const C = this.C;
    if (C.sharedId && !C.shared) this.api('/posts/' + encodeURIComponent(C.sharedId)).then(r => { if (this.C === C && r.post) { C.shared = r.post; this.put([r.post]); this.attDraw() } }).catch(() => {});
    if (mode === 'share' && arg) { C.shared = this.cache.get(arg) || null }
    if (mode === 'image' && arg && !C.images.some(i => i.url === arg.url)) C.images.push(arg);
    PH.shell(C.shared ? 'Share post' : 'New post', 'GIST.cancelCompose()', `<div class="abody" id="ab"><div class="gcomp">${C.restoredDraft ? '<p class="gdraft-note" role="status">Draft restored from this device.</p>' : ''}<div class="gcwho">${PH.av({ avatar: u.avatar, displayName: u.displayName, username: u.username })}<b>${esc(u.displayName || 'You')}</b></div>
      <textarea id="gc_t" maxlength="500" placeholder="${C.shared ? 'Add a comment…' : 'Write a caption… Use #hashtags and @mentions'}" oninput="GIST.cc()">${esc(C.text)}</textarea><div class="gcount" id="gcc"></div>
      <div id="gc_att"></div><div class="gtools"><button onclick="GIST.pickOpen()"><i class="fa-solid fa-image"></i> Photos</button><button onclick="GIST.pollSheet()"><i class="fa-solid fa-chart-simple"></i> Poll</button><button onclick="RL.pick()"><i class="fa-solid fa-video"></i> Video</button><button onclick="GIST.gameSheet()"><i class="fa-solid fa-gamepad"></i> Game</button></div>
      <div class="aerr" id="gc_e" role="alert" aria-live="polite"></div><button class="btn p" id="gc_b" onclick="GIST.submit()" aria-live="polite">${C.shared ? 'Share' : 'Post'}</button></div></div>`);
    this.attDraw(); this.cc(); if (mode === 'photos') this.pickOpen(); else if (mode === 'video') RL.pick(); else if (!('ontouchstart' in window)) $('gc_t').focus()
  },
  cancelCompose() { const t = $('gc_t'); if (this.C) this.C.text = t ? t.value : ''; this.saveDraft(); if (this.C && this.C.video && !this.C.text) { RL.rm() } const C = this.C; if (C && (C.text || C.images.length || C.game || C.song || C.poll || C.video) && !C.shared) { PH.sheet(`<h3>Discard this gist?</h3><button class="fopt red out" onclick="PH.closeSheet();GIST.clearDraft();GIST.C=null;GIST.back()"><span>Discard</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Keep writing</span></button>`) } else { this.C = null; this.clearDraft(); this.back() } },
  cc() { const t = $('gc_t'); if (!t) return; this.C.text = t.value; const n = t.value.length, c = $('gcc'); c.textContent = n ? n + ' / 500' : ''; this.btn(); this.saveDraft() },
  btn() { const C = this.C, b = $('gc_b'); if (!b) return; b.disabled = C.busy || !(C.text.trim() || C.images.length || C.game || C.shared || C.poll || C.song || C.video); b.textContent = C.shared ? 'Share' : 'Post' },
  attDraw() {
    const C = this.C, a = $('gc_att'); if (!a) return;
    a.innerHTML = RL.prevHtml(C) + (C.images.length ? `<div class="gprev">${C.images.map((im, i) => `<div><img src="${esc(im.thumb || im.url)}" alt=""><button onclick="GIST.rmImg(${i})" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></div>`).join('')}</div>` : '') +
      (C.poll ? `<div class="gpollp"><b><i class="fa-solid fa-chart-simple"></i> Poll · ${C.poll.hours >= 24 ? C.poll.hours / 24 + 'd' : C.poll.hours + 'h'}</b>${C.poll.options.map(o => `<span>${esc(o)}</span>`).join('')}<button onclick="GIST.C.poll=null;GIST.attDraw()" aria-label="Remove poll"><i class="fa-solid fa-xmark"></i></button></div>` : '') +
      (C.game ? `<div class="ggame"><span class="gg"><i class="fa-solid fa-gamepad"></i></span><div><b>${esc(C.game.name)}</b><small>${C.game.code ? 'Room code <code>' + esc(C.game.code) + '</code>' : 'Open in GameHub'}</small></div><button onclick="GIST.C.game=null;GIST.attDraw()"><i class="fa-solid fa-xmark"></i></button></div>` : '') +
      (C.song ? this.songcard(C.song, true) : '') +
      (C.shared ? `<div class="gshared"><div class="gsh"><b>${esc(C.shared.author.displayName)}</b></div>${C.shared.text ? `<div class="gtx">${this.txt(C.shared.text.slice(0, 200))}</div>` : ''}${this.imgs(C.shared)}</div>` : ''); this.btn(); this.saveDraft()
  },
  rmImg(i) { this.C.images.splice(i, 1); this.attDraw() },
  pollSheet() {
    const P = this.C.poll || { options: ['', ''], hours: 24 }; this.pp = { options: P.options.slice(), hours: P.hours };
    PH.sheet(`<h3>Create a poll</h3><div id="pp_o"></div><button class="fopt" id="pp_add" onclick="GIST.ppAdd()"><span><i class="fa-solid fa-plus"></i> Add option</span></button><div class="lab2">POLL LENGTH</div><div class="pre" id="pp_h">${[[1, '1 hour'], [6, '6 hours'], [24, '1 day'], [72, '3 days'], [168, '7 days']].map(h => `<button class="${h[0] === this.pp.hours ? 'on' : ''}" onclick="GIST.pp.hours=${h[0]};GIST.ppDraw()">${h[1]}</button>`).join('')}</div><div class="aerr" id="pp_e"></div><button class="btn p" onclick="GIST.ppSave()">Add poll</button>`); this.ppDraw()
  },
  ppDraw() { const o = $('pp_o'); if (!o) return; o.innerHTML = this.pp.options.map((t, i) => `<input class="sinput" maxlength="40" placeholder="Option ${i + 1}" value="${esc(t)}" oninput="GIST.pp.options[${i}]=this.value" autocomplete="off">`).join(''); $('pp_add').style.display = this.pp.options.length >= 4 ? 'none' : ''; document.querySelectorAll('#pp_h button').forEach((b, i) => b.classList.toggle('on', [1, 6, 24, 72, 168][i] === this.pp.hours)) },
  ppAdd() { if (this.pp.options.length < 4) { this.pp.options.push(''); this.ppDraw() } },
  ppSave() { const o = this.pp.options.map(x => x.trim()).filter(Boolean); if (o.length < 2) return $('pp_e').textContent = 'Add at least 2 options.'; this.C.poll = { options: o, hours: this.pp.hours }; PH.closeSheet(); this.attDraw() },
  /* optimistic submit: the post shows up instantly; the server catches up in the background */
  submit() {
    const C = this.C; if (C.busy) return; if (C.video) return RL.publish(); C.text = ($('gc_t').value || ''); const u = NET.user || {}, orig = C.shared && C.shared.id;
    const body = { text: C.text, images: C.images.map(i => i.src === 'mine' ? { src: 'mine', id: i.id } : { src: 'platform', url: i.url }) };
    if (C.game) body.game = { key: C.game.key, code: C.game.code }; if (C.shared) body.sharedFrom = C.shared.id; if (C.poll) body.poll = C.poll; if (C.song) body.song = C.song;
    const tmp = { id: 'tmp' + Date.now(), author: { id: u.id, displayName: u.displayName || 'You', username: u.username || '', avatar: u.avatar || '', verified: !!u.verified }, mine: true, text: C.text.trim(), images: C.images.map(i => ({ url: i.url, thumb: i.thumb || i.url })), game: C.game ? { key: C.game.key, name: C.game.name, code: C.game.code } : null, song: C.song || null, match: null, election: null, tags: [], pinned: false, edited: false, likes: 0, rx: {}, comments: 0, shares: 0, myRx: '', liked: false, createdAt: new Date().toISOString(), shared: C.shared || undefined,
      poll: C.poll ? { options: C.poll.options.map(t => ({ text: t, votes: 0 })), total: 0, endsAt: new Date(Date.now() + C.poll.hours * 3600000).toISOString(), ended: false, myVote: -1 } : undefined };
    this.C = null; this.stack = []; this.tab = 'latest'; this.tagF = ''; this.cache.set(tmp.id, tmp); ['latest', 'following', 'me'].forEach(k => { if (this.F[k] && this.F[k].ok) this.F[k].p.unshift(tmp) }); this.F.latest = this.F.latest || { p: [tmp], more: false, ok: true, next: 0 }; this.F.latest.ok = true; if (!this.F.latest.p.includes(tmp)) this.F.latest.p.unshift(tmp);
    this.feed(); toast('Posting…');
    this.api('/posts', { method: 'POST', body }).then(r => {
      this.put([r.post]); this.cache.set(r.post.id, r.post); this.cache.delete(tmp.id); Object.values(this.F).forEach(f => { const k = f.p.indexOf(tmp); if (k >= 0) f.p[k] = r.post; f.p = f.p.filter((x, i, a) => a.findIndex(y => y.id === x.id) === i) });
      if (!this.C) this.clearDraft(); const o = orig && this.cache.get(orig); if (o) { o.shares++; this.sync(orig) } NET.drop('/gist/profile'); if (this.cur && this.cur.fn === 'feed') { const f = $('gfeed'); if (f) f.innerHTML = this.feedHtml(this.FF()) } toast('Posted ✓')
    }).catch(e => { this.cache.delete(tmp.id); Object.values(this.F).forEach(f => { f.p = f.p.filter(x => x !== tmp) }); this.err(e); this.C = C; if (this.cur && this.cur.fn === 'feed') this.nav('compose') })
  },
  /* ---------- photo picker ---------- */
  pickOpen() { if (this.C && this.C.video) return toast('Remove the video first to add photos.'); this.pk.tab = 'mine'; PH.sheet(`<h3>Add photos</h3><div class="seg2 gpk" id="pk_tabs"></div><div id="pk_body"></div><button class="btn p" onclick="PH.closeSheet();GIST.attDraw()">Done</button>`); this.pickDraw(); this.pickLoad() },
  pickTab(t) { this.pk.tab = t; this.pickDraw(); this.pickLoad() },
  async pickLoad() { const k = this.pk; try { if (k.tab === 'mine' && !k.mine) { const r = await NET.api('/api/ac/photos'); k.mine = (r.photos || []).filter(x => !x.video) } if (k.tab === 'plat' && !k.plat) { const r = await this.api('/gallery/platform'); k.plat = r.photos || [] } } catch (e) { this.err(e); if (k.tab === 'mine') k.mine = []; else k.plat = [] } this.pickDraw() },
  has(it) { return this.C.images.some(i => (i.id && i.id === it.id) || (i.url && i.url === it.url)) },
  pickDraw() {
    const k = this.pk, t = $('pk_tabs'), b = $('pk_body'); if (!t || !b) return;
    t.innerHTML = [['mine', 'My gallery'], ['plat', 'Platform'], ['dev', 'Device']].map(x => `<button class="${k.tab === x[0] ? 'on' : ''}" onclick="GIST.pickTab('${x[0]}')">${x[1]}</button>`).join('');
    const n = this.C.images.length, head = `<p class="hint2">${n} of 10 selected</p>`;
    if (k.tab === 'dev') { b.innerHTML = head + `<label class="btn s pickf"><i class="fa-solid fa-folder-open"></i> Choose photos from this device<input type="file" accept="image/*" multiple hidden onchange="GIST.pickFiles(this)"></label><p class="hint2">${k.busy ? 'Uploading…' : 'Photos you pick are also saved to your gallery.'}</p>`; return }
    const L = k.tab === 'mine' ? k.mine : k.plat; if (!L) { b.innerHTML = head + '<p class="empty">Loading…</p>'; return }
    if (!L.length) { b.innerHTML = head + `<p class="empty">${k.tab === 'mine' ? 'Your gallery is empty. Take a photo with the Camera app or choose one from your device.' : 'No platform photos yet.'}</p>`; return }
    b.innerHTML = head + `<div class="gpickp">${L.map((p, i) => `<button class="${this.has(p) ? 'sel' : ''}" onclick="GIST.pickToggle('${k.tab}',${i})"><img src="${esc(p.thumb || p.url)}" alt=""><i>✓</i></button>`).join('')}</div>`
  },
  pickToggle(tab, i) { const L = tab === 'mine' ? this.pk.mine : this.pk.plat, p = L[i], C = this.C; const at = C.images.findIndex(x => (x.id && x.id === p.id) || (x.url && x.url === p.url)); if (at >= 0) C.images.splice(at, 1); else { if (C.images.length >= 10) return toast('You can add up to 10 photos'); C.images.push(tab === 'mine' ? { src: 'mine', id: p.id, url: p.url, thumb: p.thumb || p.url } : { src: 'platform', url: p.url, thumb: p.thumb || p.url }) } this.pickDraw() },
  async pickFiles(inp) {
    const files = [...inp.files]; inp.value = ''; const k = this.pk; if (!files.length) return; k.busy = true; this.pickDraw();
    for (const f of files) { if (this.C.images.length >= 10) { toast('You can add up to 10 photos'); break } if (!f.type.startsWith('image/')) continue;
      try { const data = await PH.resize(f, 1600, .88), r = await NET.api('/api/ac/photos', { method: 'POST', body: { image: data } }); k.mine = null; if (window.CAM && CAM.photos) CAM.photos.unshift(r.photo); this.C.images.push({ src: 'mine', id: r.photo.id, url: r.photo.url, thumb: r.photo.thumb || r.photo.url }) } catch (e) { this.err(e); break } }
    k.busy = false; this.pickDraw(); this.attDraw()
  },
  /* ---------- game link picker ---------- */
  async gameSheet() { if (!this.games) { try { this.games = (await this.api('/games')).games } catch (e) { return this.err(e) } } this.gsel = this.C.game ? this.C.game.key : null; PH.sheet(`<h3>Attach a game</h3><p class="hint2">Pick a game. Add a room code if you already created a room so friends can join in one tap.</p><div class="pre" id="gg_list"></div><input class="sinput" id="gg_code" placeholder="Room code or invite link (optional)" autocapitalize="characters" autocomplete="off" value="${esc(this.C.game && this.C.game.code || '')}"><div class="aerr" id="gg_e"></div><button class="btn p" onclick="GIST.gameAttach()">Attach</button>`); this.gameDraw() },
  gameDraw() { const l = $('gg_list'); if (l) l.innerHTML = this.games.map(g => `<button class="${g.key === this.gsel ? 'on' : ''}" onclick="GIST.gsel='${g.key}';GIST.gameDraw()">${esc(g.name)}</button>`).join('') },
  gameAttach() { if (!this.gsel) return $('gg_e').textContent = 'Pick a game first.'; let v = ($('gg_code').value || '').trim(); const m = /[?&]code=([A-Za-z0-9]+)/.exec(v); if (m) v = m[1]; v = v.toUpperCase(); if (v && !/^[A-Z0-9]{3,8}$/.test(v)) return $('gg_e').textContent = 'Room codes are 3 to 8 letters or numbers.'; const g = this.games.find(x => x.key === this.gsel); this.C.game = { key: g.key, name: g.name, code: v }; PH.closeSheet(); this.attDraw() }
};

window.GIST = GIST;
