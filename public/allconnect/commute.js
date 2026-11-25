/* commute.js: the short "driving" cutscene. Plays when you leave work (car home), take a taxi or a bus.
   A side-scrolling street: sky that follows the real Lagos time (day / sunset / night), skyline, trees and lamp posts, a road with lane
   lines scrolling past, your ride with spinning wheels, and an oncoming car now and then.
   COMMUTE.play({ mode: 'car' | 'taxi' | 'bus', title, sub, ms }) returns a Promise that resolves when it ends (or when you tap Skip). */
(function (g) {
  'use strict';
  const COMMUTE = {
    on: false,
    play(o) {
      o = o || {}; if (this.on) return Promise.resolve();
      this.on = true; const mode = o.mode || 'car', reduce = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches, total = reduce ? 1400 : (o.ms || (mode === 'bus' ? 8000 : 6000));
      return new Promise(res => {
        const ov = document.createElement('div'); ov.id = 'cmt'; ov.innerHTML = `<canvas></canvas><div class="cmt-t"><b>${o.title || 'On the road…'}</b><small>${o.sub || ''}</small></div><div class="cmt-bar"><u></u></div><button class="cmt-skip" type="button">Skip ›</button>`;
        document.body.appendChild(ov); const cv = ov.querySelector('canvas'), cx = cv.getContext('2d'), bar = ov.querySelector('.cmt-bar u');
        let W = 0, H = 0, dpr = 1; const fit = () => { dpr = Math.min(2, g.devicePixelRatio || 1); W = ov.clientWidth; H = ov.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0) }; fit(); g.addEventListener('resize', fit);
        // time of day from the same clock as the rest of the game
        let min = 12 * 60; try { if (g.PREFX && PREFX.lagosMin) min = PREFX.lagosMin() } catch (e) {} const h = ((min % 1440) + 1440) % 1440 / 60, sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) };
        const day = sm(5.2, 7.4, h) * (1 - sm(17.4, 19.6, h)), dusk = Math.max(0, 1 - Math.abs(h - 18.2) / 1.2, 1 - Math.abs(h - 6.2) / 1.0), night = 1 - day;
        const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t)), css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
        const skyTop = mix(mix([8, 12, 40], [92, 175, 240], day), [255, 140, 90], dusk * .8), skyBot = mix(mix([30, 42, 90], [214, 238, 252], day), [255, 205, 150], dusk * .9);
        let seed = 17; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
        const sky = []; for (let i = 0; i < 26; i++) sky.push({ w: 60 + rnd() * 90, h: 90 + rnd() * 190, shade: .55 + rnd() * .3 });
        const stars = []; for (let i = 0; i < 40; i++) stars.push([rnd(), rnd() * .5, .6 + rnd()]);
        const t0 = performance.now(); let raf = 0, done = false;
        const finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); g.removeEventListener('resize', fit); ov.classList.add('out'); setTimeout(() => { ov.remove(); COMMUTE.on = false; res() }, 300) };
        ov.querySelector('.cmt-skip').onclick = finish;
        const ride = (x, y, S, t) => {          // the vehicle, facing right
          cx.save(); cx.translate(x, y + Math.sin(t * 9) * 1.2); cx.scale(S, S);
          const col = mode === 'bus' ? '#f2b705' : mode === 'taxi' ? '#f5c518' : '#d4383d', L = mode === 'bus' ? 3.1 : 1;
          const rr = (X, Y, w, hh, r, f) => { cx.fillStyle = f; cx.beginPath(); cx.moveTo(X + r, Y); cx.arcTo(X + w, Y, X + w, Y + hh, r); cx.arcTo(X + w, Y + hh, X, Y + hh, r); cx.arcTo(X, Y + hh, X, Y, r); cx.arcTo(X, Y, X + w, Y, r); cx.fill() };
          rr(-100 * L / 1, -44, 200 * L, 34, 10, col);                                   // body
          if (mode === 'bus') { rr(-96 * L, -88, 190 * L, 50, 8, '#2d5fa6'); for (let k = 0; k < 6; k++) rr(-80 * L + k * 52, -82, 40, 26, 4, '#bfe6f5'); rr(-100 * L, -62, 200 * L, 8, 2, '#f2b705') }
          else { rr(-56, -78, 112, 38, 12, col); rr(-46, -72, 40, 26, 5, '#bfe6f5'); rr(2, -72, 40, 26, 5, '#bfe6f5'); if (mode === 'taxi') { rr(-14, -90, 28, 12, 3, '#111'); cx.fillStyle = '#ffe58a'; cx.fillRect(-10, -88, 20, 8) } }
          cx.fillStyle = '#111'; cx.fillRect(-100 * L, -14, 200 * L, 6);
          cx.fillStyle = '#ffefb0'; cx.fillRect(96 * L, -38, 8, 10); cx.fillStyle = '#d43a3a'; cx.fillRect(-104 * L, -38, 6, 10);
          if (night > .35) { const gr = cx.createLinearGradient(104 * L, 0, 104 * L + 240, 0); gr.addColorStop(0, 'rgba(255,240,170,.55)'); gr.addColorStop(1, 'rgba(255,240,170,0)'); cx.fillStyle = gr; cx.beginPath(); cx.moveTo(104 * L, -38); cx.lineTo(104 * L + 240, -80); cx.lineTo(104 * L + 240, 20); cx.lineTo(104 * L, -26); cx.fill() }
          for (const wx of (mode === 'bus' ? [-150, 120] : [-62, 62])) { cx.save(); cx.translate(wx, -4); cx.rotate(t * 14); cx.fillStyle = '#17171a'; cx.beginPath(); cx.arc(0, 0, 22, 0, 7); cx.fill(); cx.fillStyle = '#b9bcc2'; cx.beginPath(); cx.arc(0, 0, 11, 0, 7); cx.fill(); cx.fillStyle = '#555'; cx.fillRect(-1.5, -11, 3, 22); cx.restore() }
          cx.restore();
        };
        const frame = now => {
          const t = (now - t0) / 1000, p = Math.min(1, (now - t0) / total); bar.style.width = (p * 100) + '%';
          const spd = 260 * (p < .12 ? p / .12 : p > .88 ? (1 - p) / .12 : 1) + 40, off = t * spd;       // pull away, cruise, slow down
          const gy = H * .72, sc = Math.min(W / 560, H / 420, 1.4);
          const sg = cx.createLinearGradient(0, 0, 0, gy); sg.addColorStop(0, css(skyTop)); sg.addColorStop(1, css(skyBot)); cx.fillStyle = sg; cx.fillRect(0, 0, W, H);
          if (night > .3) { cx.fillStyle = '#fff'; stars.forEach(s => { cx.globalAlpha = (night - .3) * (.5 + .5 * Math.sin(t * 2 + s[0] * 9)); cx.fillRect(s[0] * W, s[1] * gy, s[2], s[2]) }); cx.globalAlpha = 1 }
          const sx = W * (.78 - .12 * p), sy = gy * (.28 + .1 * (1 - day)); cx.fillStyle = day > .5 ? '#fff6c8' : '#e9eefc'; cx.beginPath(); cx.arc(sx, sy, 26 * sc, 0, 7); cx.fill();
          // skyline (slow), trees and lamp posts (faster)
          let x = -((off * .12) % 3000); for (let i = 0; x < W + 200; i++) { const b = sky[i % sky.length]; cx.fillStyle = css(mix([18, 22, 44], [120, 140, 170], day * b.shade)); cx.fillRect(x, gy - b.h * sc, b.w * sc, b.h * sc); if (night > .25) { cx.fillStyle = `rgba(255,222,140,${.7 * night})`; for (let wy = gy - b.h * sc + 10; wy < gy - 14; wy += 18 * sc) for (let wx = x + 8; wx < x + b.w * sc - 10; wx += 16 * sc) if (((wx * 7 + wy * 3) | 0) % 5 < 2) cx.fillRect(wx, wy, 6 * sc, 8 * sc) } x += b.w * sc + 6 }
          cx.fillStyle = css(mix([10, 30, 22], [44, 120, 60], day)); x = -((off * .45) % 400); for (; x < W + 80; x += 400) { cx.fillRect(x + 20, gy - 64 * sc, 6 * sc, 64 * sc); cx.beginPath(); cx.arc(x + 23 * sc, gy - 74 * sc, 28 * sc, 0, 7); cx.fill() }
          x = -((off * .7) % 520); for (; x < W + 40; x += 520) { cx.fillStyle = '#3a3d46'; cx.fillRect(x, gy - 120 * sc, 4 * sc, 120 * sc); cx.fillRect(x, gy - 120 * sc, 26 * sc, 4 * sc); if (night > .2) { cx.fillStyle = `rgba(255,236,160,${night})`; cx.beginPath(); cx.arc(x + 24 * sc, gy - 112 * sc, 9 * sc, 0, 7); cx.fill() } }
          // road: asphalt, white edge, double yellow centre (dashed while moving), kerb
          cx.fillStyle = css(mix([32, 34, 44], [70, 72, 80], day)); cx.fillRect(0, gy, W, H - gy); cx.fillStyle = '#8b8678'; cx.fillRect(0, gy - 6 * sc, W, 8 * sc);
          cx.fillStyle = '#eee9dc'; cx.fillRect(0, gy + 8 * sc, W, 3 * sc); cx.fillRect(0, H - 14 * sc, W, 3 * sc);
          const mid = gy + (H - gy) * .5; cx.fillStyle = '#f2c230'; cx.fillRect(0, mid - 4 * sc, W, 2.5 * sc); cx.fillRect(0, mid + 2 * sc, W, 2.5 * sc);
          cx.fillStyle = 'rgba(255,255,255,.85)'; x = -((off * 1.1) % 140); for (; x < W; x += 140) cx.fillRect(x, gy + (H - gy) * .27, 70, 3 * sc);
          // an oncoming car in the far lane now and then (it zips past in the other direction)
          const oc = ((t * .35) % 1.6); if (oc < 1.2) { const ox = W * (1.1 - oc * 1.3), oy = gy + (H - gy) * .3; cx.save(); cx.translate(ox, oy); cx.scale(-sc * .55, sc * .55); cx.fillStyle = '#2d6fb5'; cx.fillRect(-90, -40, 180, 32); cx.fillRect(-52, -70, 104, 32); cx.fillStyle = '#ffefb0'; cx.fillRect(86, -34, 8, 10); cx.restore() }
          // your ride, with speed lines
          cx.strokeStyle = 'rgba(255,255,255,.28)'; cx.lineWidth = 2; for (let i = 0; i < 9; i++) { const ly = gy + 20 + ((i * 53 + t * 140) % (H - gy - 30)), lx = (W * .1 + ((i * 97 + off * 1.6) % (W * .8))); cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(lx - 50 - spd * .1, ly); cx.stroke() }
          ride(W * .38, mid + (H - gy) * .2, sc * .85, t);
          if (p >= 1) finish(); else raf = requestAnimationFrame(frame)
        };
        raf = requestAnimationFrame(frame)
      })
    }
  };
  g.COMMUTE = COMMUTE;
})(window);
