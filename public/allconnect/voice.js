/* ================= Voice notes (private chats + group chats) =================
   Tap the mic: a small bar shows the time while you record. Send uploads the clip once (/api/ac/voice) and then sends a
   normal chat message that carries { url, dur }. Clips are limited to 60 seconds; the server checks size, type and rate.
   Loaded before chatx.js, which draws the players and the mic button. */
(function () {
  'use strict';
  const MAX_S = 60;
  const $ = id => document.getElementById(id);
  const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') };
  const pickMime = () => { if (!window.MediaRecorder) return ''; return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => { try { return MediaRecorder.isTypeSupported(t) } catch (e) { return false } }) || '' };
  const blobToUrl = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Could not read the recording')); r.readAsDataURL(b) });
  let rec = null, audio = null, playing = null;

  const VN = window.VN = {
    supported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),
    /* ----- recording bar: opens over the bottom of the phone screen ----- */
    async record(onSend) {
      if (rec) return;
      if (!VN.supported()) return toast(window.isSecureContext ? 'Voice notes are not supported on this browser.' : 'Voice notes need a secure (https) connection.');
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (e) { return toast('Allow the microphone to send a voice note.') }
      const mime = pickMime(), mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream), chunks = [], t0 = Date.now();
      const bar = document.createElement('div'); bar.className = 'vnrec'; bar.id = 'vnrec';
      bar.innerHTML = '<button class="vnx" aria-label="Cancel recording"><span class="fa-solid fa-trash"></span></button><i class="vndot"></i><b id="vntm">0:00</b><span class="vnhint">Recording…</span><button class="vns" aria-label="Send voice note"><span class="fa-solid fa-paper-plane"></span></button>';
      (document.getElementById('appview') || document.body).appendChild(bar);
      const s = rec = { mr, stream, bar, cancelled: false, sent: false };
      const tick = setInterval(() => { const e = (Date.now() - t0) / 1000, t = $('vntm'); if (t) t.textContent = fmt(e); if (e >= MAX_S) finish(true) }, 250);
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) };
      const cleanup = () => { clearInterval(tick); stream.getTracks().forEach(t => t.stop()); bar.remove(); rec = null; if (window.PH && PH._vn === s) PH._vn = null };
      const finish = send => { if (s.sent || s.cancelled) return; if (send) s.sent = true; else s.cancelled = true; try { if (mr.state !== 'inactive') mr.stop() } catch (e) {} };
      mr.onstop = async () => {
        const dur = (Date.now() - t0) / 1000; cleanup();
        if (s.cancelled) return;
        if (dur < 1) return toast('Hold on a little longer. Voice note too short.');
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
          if (blob.size > 650000) return toast('That voice note is too long. Keep it shorter.');
          toast('Sending voice note…');
          const r = await NET.api('/api/ac/voice', { method: 'POST', body: { audio: await blobToUrl(blob), dur } });
          onSend(r.voice);
        } catch (e) { toast(e.message || 'Could not send the voice note') }
      };
      bar.querySelector('.vnx').onclick = () => finish(false);
      bar.querySelector('.vns').onclick = () => finish(true);
      mr.start(); if (window.PH) PH._vn = s;
    },
    cancel() { if (rec) { rec.cancelled = true; try { rec.mr.stop() } catch (e) {} } },
    /* ----- player ----- */
    bubble(v, plain) {
      const bars = Array.from({ length: 22 }, (_, i) => `<i style="height:${30 + Math.round(Math.abs(Math.sin(i * 1.7 + v.dur)) * 60)}%"></i>`).join('');
      return `<div class="vnp" data-u="${esc(v.url)}" data-d="${v.dur}"><button class="vnpb" ${plain ? 'disabled' : 'onclick="event.stopPropagation();VN.toggle(this)"'} aria-label="Play voice note"><span class="fa-solid fa-play"></span></button><div class="vnw">${bars}<em></em></div><span class="vnt">${fmt(v.dur)}</span></div>`;
    },
    toggle(btn) {
      const box = btn.closest('.vnp'); if (!box) return;
      if (playing && playing.box === box && audio && !audio.paused) { audio.pause(); return }
      if (audio) { audio.pause(); VN.reset(playing && playing.box) }
      audio = new Audio(box.dataset.u); playing = { box };
      const bar = box.querySelector('em'), t = box.querySelector('.vnt'), ic = btn.firstElementChild, dur = Number(box.dataset.d) || 1;
      audio.ontimeupdate = () => { const d = audio.duration && isFinite(audio.duration) ? audio.duration : dur; if (bar) bar.style.width = Math.min(100, audio.currentTime / d * 100) + '%'; if (t) t.textContent = fmt(audio.currentTime) };
      audio.onplay = () => { ic.className = 'fa-solid fa-pause'; box.classList.add('on') };
      audio.onpause = () => { ic.className = 'fa-solid fa-play' };
      audio.onended = () => VN.reset(box);
      audio.onerror = () => { VN.reset(box); toast('Could not play that voice note') };
      audio.play().catch(() => { VN.reset(box); toast('Could not play that voice note') });
    },
    reset(box) { if (!box) return; box.classList.remove('on'); const i = box.querySelector('.vnpb span'); if (i) i.className = 'fa-solid fa-play'; const e = box.querySelector('em'); if (e) e.style.width = '0'; const t = box.querySelector('.vnt'); if (t) t.textContent = fmt(Number(box.dataset.d) || 0) }
  };
  /* ================= WhatsApp-style mic: hold to record =================
     The round button next to a chat box is a microphone while the box is empty and turns into "send" as soon as you type (CSS only,
     using :placeholder-shown). Press and HOLD the mic: the box becomes a live sound wave with a timer. Release to send, slide left to
     cancel, slide up to lock (hands free, then tap send or the bin). A quick tap only shows a hint.
     Any screen can use it: give the button class "sbtn vnmic" and data-vn="name", put it right after the <input> inside a .cin row,
     and register VN.cfg.name = { send(), voice(voiceObj) } (or blob(blob, seconds) to handle the raw recording yourself,
     plus optional canStart(), onStart(), onEnd()). */
  const CFG = VN.cfg = {};
  let hold = null;
  const buzz = n => { try { navigator.vibrate && navigator.vibrate(n || 12) } catch (e) {} };
  const hasText = btn => { const i = btn.closest('.cin') && btn.closest('.cin').querySelector('input'); return !!(i && i.value.trim()) };

  async function holdStart(btn, e) {
    const row = btn.closest('.cin'), cfg = CFG[btn.dataset.vn] || {};
    if (rec && rec.locked && rec.btn === btn) { hold = { btn, lockedSend: true, id: e.pointerId }; return }      // locked recording: the button is "send"
    if (hasText(btn)) { hold = { btn, send: true, id: e.pointerId }; return }                                    // text typed: the button is "send"
    if (rec || !row) return;
    if (cfg.canStart && cfg.canStart() === false) return;
    if (!VN.supported()) return toast(window.isSecureContext ? 'Voice notes are not supported on this browser.' : 'Voice notes need a secure (https) connection.');
    const h = hold = { btn, id: e.pointerId, x: e.clientX, y: e.clientY, up: false, t: Date.now() };
    try { btn.setPointerCapture(e.pointerId) } catch (er) {}
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (er) { if (hold === h) hold = null; return toast('Allow the microphone to send a voice note.') }
    if (h.up || hold !== h) { stream.getTracks().forEach(t => t.stop()); if (hold === h) hold = null; if (h.up) toast(Date.now() - h.t > 700 ? 'Microphone ready. Now hold the mic to record.' : 'Hold the mic to record, release to send'); return }
    startLive(h, stream, row, btn, cfg);
  }

  function startLive(h, stream, row, btn, cfg) {
    const mime = pickMime(), mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream), chunks = [], t0 = Date.now();
    const live = document.createElement('div'); live.className = 'vnlive';
    live.innerHTML = '<button type="button" class="vnx" aria-label="Cancel recording"><span class="fa-solid fa-trash"></span></button><i class="vndot"></i><b class="vntm">0:00</b><canvas class="vnwave"></canvas><span class="vnslide"><span class="fa-solid fa-chevron-left"></span> Slide to cancel</span>';
    const lock = document.createElement('div'); lock.className = 'vnlockhint'; lock.innerHTML = '<span class="fa-solid fa-lock"></span><span class="fa-solid fa-chevron-up"></span>';
    row.insertBefore(live, btn); row.appendChild(lock); row.classList.add('vnon'); btn.classList.add('vnkeep', 'recing');
    const s = rec = { mr, stream, bar: live, cancelled: false, sent: false, locked: false, btn, t0 };
    // live sound wave from the microphone (falls back to a gentle random wave if the browser has no analyser)
    let ac = null, an = null, buf = null; try { ac = new (window.AudioContext || window.webkitAudioContext)(); an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an); buf = new Uint8Array(an.fftSize) } catch (er) { an = null }
    const cv = live.querySelector('canvas'), g = cv.getContext('2d'), tm = live.querySelector('.vntm'), col = getComputedStyle(cv).color, bars = []; let raf = 0, last = 0, lastSec = -1;
    const draw = now => {
      raf = requestAnimationFrame(draw); const dpr = window.devicePixelRatio || 1, w = Math.max(10, cv.clientWidth), ht = Math.max(10, cv.clientHeight);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(ht * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(ht * dpr) }
      if (now - last > 55) { last = now; let pk = 0; if (an) { an.getByteTimeDomainData(buf); for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i] - 128)) } else pk = 6 + Math.random() * 40; bars.push(Math.min(1, pk / 70)) }
      const bw = 3 * dpr, gap = 2.2 * dpr, n = Math.floor(cv.width / (bw + gap)); while (bars.length > n) bars.shift();
      g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = col;
      for (let i = 0; i < bars.length; i++) { const bh = Math.max(3 * dpr, bars[i] * cv.height), x = cv.width - (bars.length - i) * (bw + gap), y = (cv.height - bh) / 2; if (g.roundRect) { g.beginPath(); g.roundRect(x, y, bw, bh, bw / 2); g.fill() } else g.fillRect(x, y, bw, bh) }
      const sec = Math.floor((Date.now() - t0) / 1000); if (sec !== lastSec) { lastSec = sec; tm.textContent = fmt(sec) }
      if (sec >= (cfg.max || MAX_S)) finishRec(true);
    };
    raf = requestAnimationFrame(draw);
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) };
    const cleanup = () => { cancelAnimationFrame(raf); try { ac && ac.close() } catch (er) {} stream.getTracks().forEach(t => t.stop()); live.remove(); lock.remove(); row.classList.remove('vnon'); btn.classList.remove('vnkeep', 'recing', 'locked'); rec = null; hold = null; if (window.PH && PH._vn === s) PH._vn = null; if (cfg.onEnd) cfg.onEnd() };
    s.finish = send => { if (s.sent || s.cancelled) return; if (send) s.sent = true; else s.cancelled = true; try { if (mr.state !== 'inactive') mr.stop() } catch (er) { cleanup() } };
    mr.onstop = async () => {
      const dur = (Date.now() - t0) / 1000; cleanup();
      if (s.cancelled) return;
      if (dur < 1) return toast('Hold on a little longer. Voice note too short.');
      try {
        const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
        if (blob.size > 650000) return toast('That voice note is too long. Keep it shorter.');
        if (cfg.blob) return cfg.blob(blob, dur);                                      // the screen wants the raw recording (e.g. the pet)
        toast('Sending voice note…');
        const r = await NET.api('/api/ac/voice', { method: 'POST', body: { audio: await blobToUrl(blob), dur } });
        if (cfg.voice) cfg.voice(r.voice);
      } catch (er) { toast(er.message || 'Could not send the voice note') }
    };
    live.querySelector('.vnx').onclick = () => finishRec(false);
    mr.start(); if (window.PH) PH._vn = s; buzz(14); if (cfg.onStart) cfg.onStart();
  }
  function finishRec(send) { if (rec && rec.finish) rec.finish(send) }
  function lockRec() { if (!rec || rec.locked) return; rec.locked = true; rec.bar.classList.add('locked'); rec.btn.classList.add('locked'); const l = document.querySelector('.vnlockhint'); if (l) l.remove(); buzz(20) }

  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.vnmic'); if (!b || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); holdStart(b, e);
  });
  document.addEventListener('pointermove', e => {
    const h = hold; if (!h || h.send || h.lockedSend || e.pointerId !== h.id || !rec || rec.locked) return;
    const dx = e.clientX - h.x, dy = e.clientY - h.y;
    rec.bar.style.setProperty('--dx', Math.min(0, dx) + 'px'); rec.bar.style.setProperty('--o', String(Math.max(0, 1 - Math.max(0, -dx) / 110)));
    rec.bar.classList.toggle('near', dx < -45);
    const lk = document.querySelector('.vnlockhint'); if (lk) { lk.style.setProperty('--ly', Math.max(-70, Math.min(0, dy)) + 'px'); lk.classList.toggle('near', dy < -35) }
    if (dx < -100) { buzz([10, 40, 10]); finishRec(false) } else if (dy < -75) lockRec();
  }, { passive: true });
  const up = e => {
    const h = hold; if (!h || e.pointerId !== h.id) return; h.up = true;
    if (h.send) { hold = null; const c = CFG[h.btn.dataset.vn]; if (c && c.send && e.type === 'pointerup') c.send(); return }
    if (h.lockedSend) { hold = null; if (e.type === 'pointerup') finishRec(true); return }
    if (!rec) return;                                                          // still asking for the microphone: holdStart will tidy up
    if (rec.locked) { hold = null; return }
    hold = null; if (e.type === 'pointercancel') return finishRec(false);
    if (Date.now() - rec.t0 < 700) { toast('Hold the mic to record, release to send'); finishRec(false) } else finishRec(true);
  };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.vnmic')) e.preventDefault() });
  /* keyboard / old browsers without pointer events: Enter or tap sends text, or opens the tap-to-record bar */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.vnmic'); if (!b || (window.PointerEvent && e.detail !== 0)) return;
    const c = CFG[b.dataset.vn] || {}; if (hasText(b)) return c.send && c.send();
    if (c.voice) VN.record(c.voice); else toast('Hold the mic to record');
  });
})();
