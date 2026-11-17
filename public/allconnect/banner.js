/* Notification banner, iPhone style: it drops down from the top with a short sound, stays a few seconds,
   and goes away when you swipe it up (or tap it to open what it is about). */
const BANNER = {
  el: null, o: null, tm: 0, ac: null,
  /* the sound is its own tiny Web Audio context, so it never touches the game's background music */
  prime() { try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; if (!this.ac) this.ac = new AC(); if (this.ac.state === 'suspended') this.ac.resume().catch(() => {}) } catch (e) {} },
  sfx() {
    const gp = window.GP ? GP.get() : {};
    if (gp.vibration !== false && navigator.vibrate) { try { navigator.vibrate(28) } catch (e) {} }
    if (gp.sound === false) return; this.prime(); const c = this.ac; if (!c || c.state !== 'running') return;
    const t = c.currentTime, out = c.createGain(); out.gain.value = 0.2; out.connect(c.destination);
    [[1318.5, 0], [1568, 0.11], [2093, 0.22]].forEach(([f, d]) => {                         // three quick rising notes
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(1, t + d + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.34); o.start(t + d); o.stop(t + d + 0.36)
    })
  },
  /* o = { icon, app, title, text, tap } */
  show(o) {
    if (document.hidden) return false;
    this.kill(true); const el = document.createElement('div'); el.className = 'ntb'; el.setAttribute('role', 'alert');
    const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    el.innerHTML = `<div class="ntb-i">${e(o.icon || '🔔')}</div><div class="ntb-t"><div class="ntb-h"><span>${e(o.app || 'AllConnect')}</span><time>now</time></div><b>${e(o.title || '')}</b><p>${e(o.text || '')}</p></div>`;
    document.body.appendChild(el); this.el = el; this.o = o; this.bind(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in'))); this.timer(5200); this.sfx(); return true
  },
  timer(ms) { clearTimeout(this.tm); this.tm = setTimeout(() => this.dismiss(), ms) },
  bind(el) {
    let y0 = 0, t0 = 0, dy = 0, drag = false;
    el.addEventListener('pointerdown', ev => { drag = true; y0 = ev.clientY; t0 = ev.timeStamp; dy = 0; try { el.setPointerCapture(ev.pointerId) } catch (x) {} clearTimeout(this.tm); el.classList.add('drag') });
    el.addEventListener('pointermove', ev => { if (!drag) return; dy = ev.clientY - y0; el.style.transform = `translateY(${dy < 0 ? dy : dy * 0.18}px)` });   // follows your finger up; resists going down
    const end = ev => {
      if (!drag) return; drag = false; el.classList.remove('drag'); const v = dy / Math.max(1, ev.timeStamp - t0);
      if (dy < -22 || (v < -0.5 && dy < -8)) return this.dismiss();                                    // swipe up: gone, like the iPhone
      if (Math.abs(dy) < 8) { const f = this.o && this.o.tap; this.dismiss(); if (typeof f === 'function') setTimeout(f, 80); return }  // tap: open it
      el.style.transform = ''; this.timer(3000)                                                         // let go halfway: it springs back
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end)
  },
  dismiss() { const el = this.el; if (!el) return; clearTimeout(this.tm); this.el = null; el.style.transform = ''; el.classList.remove('in', 'drag'); el.classList.add('out'); setTimeout(() => el.remove(), 360) },
  kill(now) { clearTimeout(this.tm); if (this.el) { this.el.remove(); this.el = null } }
};
window.BANNER = BANNER;
/* browsers only let sound start after a touch, so the first touch wakes the sound up */
['pointerdown', 'keydown', 'touchstart'].forEach(k => document.addEventListener(k, () => BANNER.prime(), { capture: true, passive: true }));
