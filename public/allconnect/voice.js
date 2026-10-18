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
})();
