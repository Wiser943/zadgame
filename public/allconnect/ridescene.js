/* ================= Drive ride scene =================
   When a player takes a taxi (ride), a tricycle (keke) or a bus, the trip plays as a short Drive-style scene instead of
   a long crawl across the map: a side-on street scene, 5 to 10 seconds, with the route, the time left and the fare,
   and a Skip button. When it ends (or on Skip) the caller moves the player to the end of that leg.
   Art comes from the Drive game (/lagosrun/assets/sprites/): the danfo, asphalt, road decals, zinc / metal / tarp roofs.
   Every image is optional: until it has loaded (or if it never does) the scene draws the same thing with plain shapes.
   Usage: RIDE.play({ mode: 'ride' | 'keke' | 'bus', from, to, mins, fare, done }) - done() is called exactly once. */
const RIDE = (() => {
  const ART = '/lagosrun/assets/sprites/';
  const FILES = { bus: 'buses/fresh', asph: 'textures/asphalt-seamless', zinc: 'textures/zinc-patchwork', red: 'textures/roof-red-metal', tarp: 'textures/roof-blue-tarp',
    pothole: 'decals/pothole-dry', manhole: 'decals/manhole-cover', puddle: 'decals/puddle-shallow', zebra: 'decals/zebra-block', litter: 'decals/sachet-litter' };
  const IMG = {}; let started = false, cur = null;
  const MODE = { ride: { e: '🚕', n: 'Taxi' }, keke: { e: '🛺', n: 'Keke' }, bus: { e: '🚌', n: 'Bus' } };
  const say = (en, pcm) => (window.NG && NG.say ? NG.say(en, pcm) : en);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, '');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const saver = () => { try { return !!JSON.parse(localStorage.getItem('ghPrefs') || '{}').lowPower } catch (e) { return false } };
  const reduced = () => { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) } catch (e) { return false } };

  function preload() {
    if (started || saver()) return; started = true;
    Object.entries(FILES).forEach(([k, f]) => { const im = new Image(); im.decoding = 'async'; im.onload = () => { IMG[k] = im }; im.src = ART + f + '.webp' });
  }

  const CSS = `
  #ridescene{position:fixed;inset:0;z-index:9500;background:#0b1020;color:#fff;font-family:"Plus Jakarta Sans",system-ui,sans-serif;overflow:hidden;opacity:0;transition:opacity .28s;touch-action:manipulation;user-select:none;-webkit-user-select:none}
  #ridescene.on{opacity:1}
  #ridescene canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
  #ridescene .rs-top{position:absolute;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 12px);display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:rgba(12,16,34,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  #ridescene .rs-mode{font-size:26px;line-height:1}
  #ridescene .rs-route{min-width:0;display:flex;flex-direction:column;gap:1px}
  #ridescene .rs-route small{font-size:11px;opacity:.7;font-weight:600;letter-spacing:.02em}
  #ridescene .rs-route b{font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #ridescene .rs-prog{position:absolute;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 82px)}
  #ridescene .rs-bar{height:6px;border-radius:6px;background:rgba(255,255,255,.22);overflow:hidden}
  #ridescene .rs-bar i{display:block;height:100%;width:0;border-radius:6px;background:linear-gradient(90deg,#f5b700,#ffd95c)}
  #ridescene .rs-eta{display:flex;justify-content:space-between;margin-top:6px;font-size:12px;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.55)}
  #ridescene .rs-cap{position:absolute;left:16px;right:16px;top:30%;text-align:center;font-size:16px;font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,.6);transition:opacity .25s;opacity:0}
  #ridescene .rs-cap.on{opacity:1}
  #ridescene .rs-bot{position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);display:flex;align-items:center;justify-content:space-between;gap:10px}
  #ridescene .rs-tag{font-size:12px;font-weight:800;padding:8px 12px;border-radius:12px;background:rgba(12,16,34,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  #ridescene .rs-skip{appearance:none;border:0;cursor:pointer;font:inherit;font-weight:800;font-size:15px;color:#fff;padding:12px 22px;border-radius:999px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  #ridescene .rs-skip:active{transform:scale(.96)}`;

  /* ---------- tiny helpers ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 };
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;

  /* sky colours by the in-game hour: [top, bottom] */
  function skyFor(h) {
    const NIGHT = [[10, 14, 44], [34, 38, 86]], DAWN = [[255, 170, 110], [255, 214, 160]], DAY = [[96, 170, 236], [196, 228, 250]], DUSK = [[240, 120, 80], [255, 186, 120]];
    let a, b, t = 0;
    if (h < 5) a = b = NIGHT; else if (h < 6.5) { a = NIGHT; b = DAWN; t = (h - 5) / 1.5 } else if (h < 8) { a = DAWN; b = DAY; t = (h - 6.5) / 1.5 } else if (h < 17) a = b = DAY;
    else if (h < 18.5) { a = DAY; b = DUSK; t = (h - 17) / 1.5 } else if (h < 20) { a = DUSK; b = NIGHT; t = (h - 18.5) / 1.5 } else a = b = NIGHT;
    const top = mix(a[0], b[0], t), bot = mix(a[1], b[1], t);
    return { top, bot, dark: h >= 19.5 || h < 5.5 ? 1 : h >= 18.5 ? (h - 18.5) / 1.0 : h < 6.5 ? (6.5 - h) / 1.0 : 0 };
  }

  /* ---------- vehicles drawn with shapes (the danfo uses the Drive sprite when it has loaded) ---------- */
  function wheel(c, x, y, r, rot) {
    c.fillStyle = '#16181f'; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
    c.fillStyle = '#c9ced8'; c.beginPath(); c.arc(x, y, r * .5, 0, 6.3); c.fill();
    c.strokeStyle = '#6b7280'; c.lineWidth = Math.max(1, r * .12); c.beginPath(); c.moveTo(x + Math.cos(rot) * r * .45, y + Math.sin(rot) * r * .45); c.lineTo(x - Math.cos(rot) * r * .45, y - Math.sin(rot) * r * .45); c.stroke();
  }
  /* a car seen from the side. (x, y) is the ground point under its middle; dir -1 = faces left, 1 = faces right */
  function car(c, x, y, w, col, dir, rot, taxi, night) {
    const h = w * .34; c.save(); c.translate(x, y); c.scale(dir, 1);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(0, 0, w * .5, h * .12, 0, 0, 6.3); c.fill();
    c.fillStyle = col; rr(c, -w / 2, -h * .66, w, h * .42, h * .12); c.fill();
    c.beginPath(); c.moveTo(-w * .3, -h * .64); c.lineTo(-w * .19, -h); c.lineTo(w * .16, -h); c.lineTo(w * .3, -h * .64); c.closePath(); c.fill();
    c.fillStyle = night ? '#ffe9a8' : '#bfe3f5';
    c.beginPath(); c.moveTo(-w * .26, -h * .67); c.lineTo(-w * .17, -h * .94); c.lineTo(-w * .01, -h * .94); c.lineTo(-w * .01, -h * .67); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(w * .02, -h * .67); c.lineTo(w * .02, -h * .94); c.lineTo(w * .15, -h * .94); c.lineTo(w * .26, -h * .67); c.closePath(); c.fill();
    if (taxi) { c.fillStyle = '#16181f'; c.fillRect(-w / 2, -h * .5, w, h * .07); c.fillStyle = '#fff'; rr(c, -w * .07, -h * 1.1, w * .14, h * .12, 2); c.fill() }
    c.fillStyle = '#fff3b0'; c.fillRect(w * .44, -h * .52, w * .06, h * .1); c.fillStyle = '#e5484d'; c.fillRect(-w * .5, -h * .52, w * .04, h * .1);
    wheel(c, -w * .3, -h * .17, h * .21, rot); wheel(c, w * .3, -h * .17, h * .21, rot);
    c.restore();
  }
  function keke(c, x, y, w, rot, night) {
    const h = w * .62; c.save(); c.translate(x, y); c.scale(-1, 1);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(0, 0, w * .48, h * .06, 0, 0, 6.3); c.fill();
    c.fillStyle = '#1f9d55'; rr(c, -w * .46, -h * .52, w * .92, h * .28, h * .06); c.fill();                 // body
    c.fillStyle = '#f2b705'; c.beginPath(); c.moveTo(-w * .42, -h * .5); c.lineTo(-w * .42, -h * .9); c.quadraticCurveTo(-w * .1, -h * 1.02, w * .22, -h * .9); c.lineTo(w * .3, -h * .5); c.closePath(); c.fill();   // canopy
    c.fillStyle = night ? '#ffe9a8' : '#bfe3f5'; c.beginPath(); c.moveTo(w * .02, -h * .52); c.lineTo(w * .02, -h * .84); c.quadraticCurveTo(w * .2, -h * .86, w * .27, -h * .52); c.closePath(); c.fill();   // windscreen
    c.fillStyle = '#16181f'; c.fillRect(-w * .42, -h * .56, w * .84, h * .04);
    c.fillStyle = '#fff3b0'; c.beginPath(); c.arc(w * .45, -h * .38, h * .05, 0, 6.3); c.fill();
    wheel(c, w * .34, -h * .16, h * .16, rot); wheel(c, -w * .3, -h * .16, h * .16, rot); wheel(c, -w * .18, -h * .16, h * .16, rot);
    c.restore();
  }

  /* ---------- the scene's static pieces, made once per trip so every trip looks a little different ---------- */
  function build(opts, W, H) {
    const R = rng(hash((opts.from || '') + '>' + (opts.to || '') + (opts.mode || ''))), S = { far: [], mid: [], deco: [], traffic: [], clouds: [], rain: [] };
    S.farTotal = Math.max(W * 3, 1100); S.midTotal = Math.max(W * 3.2, 1200); S.roadTotal = Math.max(W * 3.5, 1300);
    for (let x = 0; x < S.farTotal;) { const w = 34 + R() * 60, h = 50 + R() * 130; S.far.push({ x, w, h, s: R() }); x += w + 4 + R() * 14 }
    const roofs = ['zinc', 'red', 'tarp'], names = ['BUKA MAMA PUT', 'FAST FIX GSM', 'JOLLOF HOUSE', 'USE THE BRIDGE', 'COLD DRINKS', 'TAILOR SHOP', 'GEN REPAIR'];
    for (let x = 40; x < S.midTotal;) {
      const k = R(); let it;
      if (k < .34) it = { t: 'shack', w: 90 + R() * 80, h: 46 + R() * 30, roof: roofs[(R() * 3) | 0], col: ['#d9c7a3', '#c9b58f', '#b9d1c1', '#e2b9a4'][(R() * 4) | 0] };
      else if (k < .5) it = { t: 'stall', w: 70 + R() * 30, h: 40, col: ['#e5484d', '#f5a623', '#2f7fd8', '#22b573'][(R() * 4) | 0] };
      else if (k < .64) it = { t: 'board', w: 120, h: 78, txt: names[(R() * names.length) | 0], col: ['#2f6fd8', '#e5484d', '#22b573', '#8e5bd1'][(R() * 4) | 0] };
      else if (k < .84) it = { t: 'palm', w: 40, h: 90 + R() * 40 };
      else it = { t: 'lamp', w: 20, h: 96 };
      it.x = x; S.mid.push(it); x += it.w + 30 + R() * 90;
    }
    // road decals in the near lane: [x, kind]
    const kinds = ['pothole', 'manhole', 'puddle', 'litter', 'zebra'];
    for (let x = W * .9; x < S.roadTotal; x += 240 + R() * 420) S.deco.push({ x, k: kinds[(R() * kinds.length) | 0] });
    // oncoming traffic in the far lane, a bit more of it in a go-slow
    const n = opts.goslow ? 9 : 5;
    for (let i = 0; i < n; i++) S.traffic.push({ x: R() * S.roadTotal, v: 1.5 + R() * .9, w: 62 + R() * 22, col: ['#e5e7eb', '#e5484d', '#2f7fd8', '#22b573', '#8d6e63', '#f2b705'][(R() * 6) | 0], taxi: R() < .3 });
    for (let i = 0; i < 6; i++) S.clouds.push({ x: R() * W * 3, y: .06 + R() * .2, w: 60 + R() * 90 });
    if (opts.rain) for (let i = 0; i < 70; i++) S.rain.push({ x: R() * W, y: R() * H, l: 10 + R() * 14, v: 700 + R() * 500 });
    S.caps = captions(opts);
    return S;
  }
  function captions(o) {
    const c = [];
    if (o.rain) c.push(say('Heavy rain. Wipers on.', 'Rain dey fall o. Wiper dey work.'));
    if (o.goslow) c.push(say('Go-slow ahead…', 'Go-slow dey front…'));
    if (o.mode === 'bus') c.push(say('“Oya, enter! Change ready!”', '“Oya enter! Change dey!”'), say('Conductor is counting the fare', 'Conductor dey count money'));
    else if (o.mode === 'keke') c.push(say('Keke weaving through the traffic', 'Keke dey enter gap for traffic'), say('Hold on tight!', 'Hold body o!'));
    else c.push(say('Driver is on his favourite radio station', 'Driver don tune him radio'), say('AC is on. Window is up.', 'AC dey on. Window up.'));
    c.push(say('Passing the market…', 'We dey pass market…'), say('Almost there', 'We don near reach'));
    return c;
  }

  /* ---------- the scene ---------- */
  function play(o) {
    o = o || {}; const done = typeof o.done === 'function' ? o.done : () => {};
    if (cur || !RIDE.can(o.mode)) { done(); return false }
    preload();
    if (!document.getElementById('ridescene-css')) { const st = document.createElement('style'); st.id = 'ridescene-css'; st.textContent = CSS; document.head.appendChild(st) }
    const M = MODE[o.mode] || MODE.ride, mins = Math.max(1, Number(o.mins) || 6), DUR = clamp(4 + mins * .3, 5, 10) * 1000;
    const root = document.createElement('div'); root.id = 'ridescene'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', M.n + ' ride');
    root.innerHTML = `<canvas></canvas>
      <div class="rs-top"><span class="rs-mode">${M.e}</span><div class="rs-route"><small>${M.n} · ${say('on the way', 'we dey go')}</small><b>${esc(o.from || say('Here', 'Here'))} ➜ ${esc(o.to || '')}</b></div></div>
      <div class="rs-prog"><div class="rs-bar"><i></i></div><div class="rs-eta"><span class="rs-left"></span><span>${o.fare ? '₦' + Math.round(o.fare).toLocaleString('en-NG') : ''}</span></div></div>
      <div class="rs-cap"></div>
      <div class="rs-bot"><span class="rs-tag">🚌 Drive</span><button class="rs-skip" type="button">${say('Skip', 'Skip')} ›</button></div>`;
    document.body.appendChild(root);
    const cv = root.querySelector('canvas'), c = cv.getContext('2d'), bar = root.querySelector('.rs-bar i'), left = root.querySelector('.rs-left'), cap = root.querySelector('.rs-cap');
    let W = 0, H = 0, dpr = 1, S = null, t0 = performance.now(), last = t0, raf = 0, finished = false, capI = -1, off = 0, wrot = 0, bump = 0;
    const night = o.night != null ? !!o.night : false, sky = skyFor(Number.isFinite(o.hour) ? o.hour : 12), darkness = Number.isFinite(o.hour) ? sky.dark : (night ? 1 : 0);
    const opts = { mode: o.mode, from: o.from, to: o.to, rain: !!o.rain, goslow: !!o.goslow };
    function size() { dpr = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); S = build(opts, W, H) }
    size(); window.addEventListener('resize', size);

    function finish(skipped) {
      if (finished) return; finished = true; cancelAnimationFrame(raf); clearInterval(guard); window.removeEventListener('resize', size); document.removeEventListener('keydown', key);
      root.classList.remove('on'); cur = null;
      setTimeout(() => root.remove(), 320);
      try { done(!!skipped) } catch (e) { console.error(e) }
    }
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); finish(true) } };
    document.addEventListener('keydown', key);
    root.querySelector('.rs-skip').addEventListener('click', (e) => { e.stopPropagation(); finish(true) });
    const guard = setInterval(() => { if (performance.now() - t0 > DUR + 4000) finish(false) }, 1000);   // never leave the player stuck if the tab was in the background

    function draw(now) {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(.05, (now - last) / 1000); last = now; const el = now - t0, p = clamp(el / DUR, 0, 1), ts = el / 1000;
      const ramp = Math.min(1, ts / .8) * Math.min(1, Math.max(.15, (DUR / 1000 - ts) / .9)), v = W * (o.mode === 'bus' ? .62 : o.mode === 'keke' ? .7 : .85) * ramp;
      off += v * dt; wrot += v * dt / 9;
      bar.style.width = (p * 100).toFixed(1) + '%';
      const rem = Math.round(mins * (1 - p)); left.textContent = p >= .97 ? say('Arriving…', 'We don reach…') : rem + ' min ' + say('left', 'remain');
      const nc = S.caps.length, ci = p > .8 ? nc - 1 : Math.min(Math.max(0, nc - 2), Math.floor(ts / 2.1)); if (ci !== capI) { capI = ci; cap.classList.remove('on'); setTimeout(() => { if (!finished) { cap.textContent = S.caps[ci]; cap.classList.add('on') } }, 120) }

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const U = clamp(H / 620, .9, 1.5), horizon = H * .5, roadTop = H * .6, roadBot = H * .93, nearY = H * .82, farY = H * .685;
      // sky
      const g = c.createLinearGradient(0, 0, 0, horizon); g.addColorStop(0, rgb(sky.top)); g.addColorStop(1, rgb(sky.bot)); c.fillStyle = g; c.fillRect(0, 0, W, horizon + 2);
      if (darkness > .6) { c.fillStyle = '#fff'; for (let i = 0; i < 30; i++) { c.globalAlpha = .3 + ((i * 37) % 7) / 12; c.fillRect((i * 97) % W, ((i * 53) % Math.max(1, horizon * .8)), 1.6, 1.6) } c.globalAlpha = 1 }
      if (darkness > .5 || !opts.rain) { c.fillStyle = darkness > .5 ? '#f4f1d0' : '#fff2b8'; c.beginPath(); c.arc(W * .8, H * .13, darkness > .5 ? 20 : 28, 0, 6.3); c.fill() }
      c.fillStyle = `rgba(255,255,255,${darkness > .5 ? .12 : .75})`;
      S.clouds.forEach((k) => { const x = ((k.x + off * .05) % (W * 3)) - W * .3; c.beginPath(); c.ellipse(x, H * k.y + 20, k.w, k.w * .28, 0, 0, 6.3); c.ellipse(x + k.w * .5, H * k.y + 12, k.w * .55, k.w * .24, 0, 0, 6.3); c.fill() });
      // far skyline
      S.far.forEach((b) => {
        const x = ((b.x + off * .12) % S.farTotal) - 60; for (const xx of [x, x - S.farTotal]) {
          if (xx > W || xx + b.w < -10) continue; const by = horizon + 4, bh = b.h * U;
          c.fillStyle = rgb(mix([150, 170, 195], [46, 54, 104], darkness)); c.fillRect(xx, by - bh, b.w, bh);
          if (darkness > .4) { c.fillStyle = '#ffd36b'; for (let wy = by - bh + 8; wy < by - 8; wy += 14) for (let wx = xx + 6; wx < xx + b.w - 8; wx += 12) if (((wx * 7 + wy * 3 + b.s * 100) | 0) % 3 === 0) c.fillRect(wx, wy, 4, 6) }
        }
      });
      // ground behind the street
      c.fillStyle = darkness > .5 ? '#2b2f3f' : '#b9b4a6'; c.fillRect(0, horizon, W, roadTop - horizon + 2);
      // street-side things
      const baseY = roadTop - 2;
      S.mid.forEach((m) => {
        const x = ((m.x + off * .5) % S.midTotal) - 160; for (const xx of [x, x - S.midTotal]) {
          if (xx > W + 20 || xx + m.w * U < -20) continue;
          c.save(); c.translate(xx, baseY); c.scale(U, U); c.translate(-xx, -baseY);
          if (m.t === 'shack') {
            c.fillStyle = m.col; c.fillRect(xx, baseY - m.h, m.w, m.h); c.fillStyle = '#6b4f3a'; c.fillRect(xx + m.w * .15, baseY - m.h * .6, m.w * .2, m.h * .6); c.fillStyle = '#9ac7e0'; c.fillRect(xx + m.w * .55, baseY - m.h * .7, m.w * .26, m.h * .3);
            const im = IMG[m.roof]; if (im) { const pt = c.createPattern(im, 'repeat'); if (pt) { pt.setTransform(new DOMMatrix([.12, 0, 0, .12, xx, 0])); c.fillStyle = pt } else c.fillStyle = '#8a8f98' } else c.fillStyle = m.roof === 'red' ? '#b3392b' : m.roof === 'tarp' ? '#2f6fd8' : '#8a8f98';
            c.beginPath(); c.moveTo(xx - 6, baseY - m.h); c.lineTo(xx + 10, baseY - m.h - 16); c.lineTo(xx + m.w - 10, baseY - m.h - 16); c.lineTo(xx + m.w + 6, baseY - m.h); c.closePath(); c.fill();
          } else if (m.t === 'stall') {
            c.fillStyle = '#7a5a3a'; c.fillRect(xx + 6, baseY - 22, m.w - 12, 22); c.fillStyle = m.col; c.beginPath(); c.moveTo(xx, baseY - 38); c.lineTo(xx + m.w, baseY - 38); c.lineTo(xx + m.w - 8, baseY - 52); c.lineTo(xx + 8, baseY - 52); c.closePath(); c.fill();
            c.fillStyle = '#5b4630'; c.fillRect(xx + 4, baseY - 38, 3, 38); c.fillRect(xx + m.w - 7, baseY - 38, 3, 38);
          } else if (m.t === 'board') {
            c.fillStyle = '#4b4f5a'; c.fillRect(xx + m.w * .46, baseY - 34, 7, 34); c.fillStyle = m.col; rr(c, xx, baseY - m.h - 20, m.w, m.h * .55, 5); c.fill();
            c.fillStyle = '#fff'; c.font = '800 11px "Plus Jakarta Sans",system-ui,sans-serif'; c.textAlign = 'center'; c.fillText(m.txt.length > 16 ? m.txt.slice(0, 16) : m.txt, xx + m.w / 2, baseY - m.h - 20 + m.h * .55 / 2 + 4); c.textAlign = 'left';
          } else if (m.t === 'palm') {
            c.strokeStyle = '#7a5a3a'; c.lineWidth = 6; c.beginPath(); c.moveTo(xx + 20, baseY); c.quadraticCurveTo(xx + 14, baseY - m.h * .5, xx + 22, baseY - m.h); c.stroke();
            c.fillStyle = darkness > .5 ? '#1f5a3a' : '#2f9a55'; for (let a = 0; a < 6; a++) { c.save(); c.translate(xx + 22, baseY - m.h); c.rotate(-1.2 + a * .5 + Math.sin(ts * 2 + a) * .04); c.beginPath(); c.ellipse(22, 0, 24, 5, 0, 0, 6.3); c.fill(); c.restore() }
          } else {
            c.fillStyle = '#3f4452'; c.fillRect(xx + 8, baseY - m.h, 4, m.h); c.fillRect(xx + 8, baseY - m.h, 18, 4);
            if (darkness > .3) { const lg = c.createRadialGradient(xx + 24, baseY - m.h + 8, 2, xx + 24, baseY - m.h + 8, 70); lg.addColorStop(0, 'rgba(255,225,140,.65)'); lg.addColorStop(1, 'rgba(255,225,140,0)'); c.fillStyle = lg; c.fillRect(xx - 46, baseY - m.h - 62, 140, 140) }
            c.fillStyle = darkness > .3 ? '#fff1b0' : '#d8dbe3'; c.fillRect(xx + 20, baseY - m.h + 4, 10, 5);
          }
          c.restore();
        }
      });
      // road
      c.fillStyle = '#383b44'; c.fillRect(0, roadTop, W, roadBot - roadTop);
      if (IMG.asph) { const pt = c.createPattern(IMG.asph, 'repeat'); if (pt) { pt.setTransform(new DOMMatrix([.22, 0, 0, .22, off, roadTop])); c.globalAlpha = .55; c.fillStyle = pt; c.fillRect(0, roadTop, W, roadBot - roadTop); c.globalAlpha = 1 } }
      c.fillStyle = 'rgba(10,12,20,.28)'; c.fillRect(0, roadTop, W, roadBot - roadTop);
      c.fillStyle = darkness > .5 ? '#8a8f9c' : '#cfd3dc'; c.fillRect(0, roadTop - 2, W, 4); c.fillRect(0, roadBot, W, H - roadBot);                  // kerbs
      c.fillStyle = darkness > .5 ? '#242836' : '#9aa0ad'; c.fillRect(0, roadBot + 4, W, H - roadBot);
      c.fillStyle = 'rgba(255,255,255,.7)'; const dash = 46, gap = 38, per = dash + gap, o2 = off % per;
      for (let x = -per + o2; x < W; x += per) c.fillRect(x, (farY + nearY) / 2 - 2, dash, 4);
      // decals on the near lane, and the bump when one goes under the vehicle
      const vx = W * .52; let bumpNow = 0;
      S.deco.forEach((d) => {
        const x = ((d.x + off) % S.roadTotal) - 200, im = IMG[d.k]; if (!im || x > W + 100 || x < -200) return;
        const dw = d.k === 'zebra' ? 130 : 70, dh = dw * (im.height / im.width) * .42;
        c.globalAlpha = .9; c.drawImage(im, x - dw / 2, nearY + 4 - dh / 2, dw, dh); c.globalAlpha = 1;
        if ((d.k === 'pothole' || d.k === 'manhole') && Math.abs(x - vx) < 26) bumpNow = 1;
      });
      bump += (bumpNow - bump) * Math.min(1, dt * 18);
      // oncoming traffic in the far lane (they drive the other way, so they pass quickly)
      S.traffic.forEach((tr) => { const x = ((tr.x + off * (1 + tr.v)) % S.roadTotal) - 120; if (x > W + 120 || x < -140) return; car(c, x, farY + 18, tr.w * .8, tr.col, 1, wrot * 1.3, tr.taxi, darkness > .5) });
      // our vehicle
      const by = Math.sin(ts * 15) * 1.2 * ramp - bump * 5, vy = nearY + 10 + by;
      if (o.mode === 'bus' && IMG.bus) {
        const bw = Math.min(W * .78, 330), bh = bw * (IMG.bus.height / IMG.bus.width);
        c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(vx, nearY + 12, bw * .45, 9, 0, 0, 6.3); c.fill();
        c.save(); c.translate(vx, vy); c.rotate(Math.sin(ts * 3) * .006 + bump * .012); c.drawImage(IMG.bus, -bw / 2, -bh * .885 + 8, bw, bh); c.restore();
      } else if (o.mode === 'keke') keke(c, vx, vy, Math.min(W * .56, 230), wrot, darkness > .5);
      else car(c, vx, vy, Math.min(W * .68, 280), o.mode === 'bus' ? '#f2b705' : '#f2b705', -1, wrot, o.mode !== 'bus', darkness > .5);
      // headlight beam at night
      if (darkness > .4) { const bx = vx - Math.min(W * .3, 140), hg = c.createLinearGradient(bx, 0, bx - W * .4, 0); hg.addColorStop(0, `rgba(255,240,170,${.45 * darkness})`); hg.addColorStop(1, 'rgba(255,240,170,0)'); c.fillStyle = hg; c.beginPath(); c.moveTo(bx, vy - 26); c.lineTo(bx - W * .4, vy - 70); c.lineTo(bx - W * .4, vy + 30); c.lineTo(bx, vy - 6); c.closePath(); c.fill() }
      // dust behind (right side, because we face left)
      if (ramp > .3) { c.fillStyle = 'rgba(210,205,195,.22)'; for (let i = 0; i < 4; i++) { const k = ((ts * 2 + i * .25) % 1); c.beginPath(); c.arc(vx + Math.min(W * .34, 150) + k * 60, vy + 6 - k * 14, 5 + k * 12, 0, 6.3); c.fill() } }
      // grade: dusk warmth / night blue
      if (darkness > 0) { c.fillStyle = `rgba(8,12,44,${.32 * darkness})`; c.fillRect(0, 0, W, H) }
      else if (sky.top[0] > 200) { c.fillStyle = 'rgba(255,140,60,.1)'; c.fillRect(0, 0, W, H) }
      // rain
      if (opts.rain) { c.fillStyle = 'rgba(60,70,90,.22)'; c.fillRect(0, 0, W, H) }
      if (S.rain.length) { c.strokeStyle = 'rgba(200,220,255,.45)'; c.lineWidth = 1.2; c.beginPath(); S.rain.forEach((r) => { r.y += r.v * dt; r.x -= r.v * .18 * dt; if (r.y > H) { r.y = -20; r.x = Math.random() * (W + 80) } c.moveTo(r.x, r.y); c.lineTo(r.x + r.l * .18, r.y + r.l) }); c.stroke() }
      // arrival fade
      if (p >= .93) { c.fillStyle = `rgba(11,16,32,${(p - .93) / .07 * .85})`; c.fillRect(0, 0, W, H) }
      if (el >= DUR) finish(false);
    }
    cur = { root, finish };
    requestAnimationFrame(() => root.classList.add('on'));
    raf = requestAnimationFrame(draw);
    return true;
  }

  return {
    preload, play, MODE,
    /* the scene is for road vehicles only, and is skipped in Saver mode or when the phone asks for reduced motion */
    can(mode) { return !cur && !!MODE[mode] && !saver() && !reduced() && !!document.createElement('canvas').getContext },
    playing() { return !!cur },
    skip() { if (cur) cur.finish(true) }
  };
})();
window.RIDE = RIDE;
