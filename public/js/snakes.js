/* Snakes & Ladders renderer.
 *
 * - Always draws a real board as SVG (numbered zig-zag squares, ladders, snakes)
 *   and animates tokens with plain requestAnimationFrame, so it works with no
 *   external library.
 * - If Phaser can be loaded (GameHubRenderers + WebGL/Canvas available and the
 *   player hasn't chosen "classic" mode) a transparent Phaser canvas is laid on
 *   top and takes over the tokens: hop tweens, ladder climb, snake slide,
 *   sparkle bursts and win confetti. Any failure falls back to the SVG tokens.
 *
 * The board persists per room (one SVG / one Phaser game), so re-rendering the
 * room view never interrupts a running animation.
 */
window.GHSnakes = (() => {
  const SIZE = 600, CELL = 60, H = 640;
  const START = { x: 46, y: 620 };
  const COLORS = ['#f7c52b', '#3d8de8', '#44b86b', '#e64e4e'];
  const DEFAULT_JUMPS = { 3: 22, 5: 8, 11: 26, 20: 29, 27: 1, 21: 9, 17: 4, 19: 7, 43: 34, 50: 31, 54: 36, 62: 18, 64: 60, 87: 24, 91: 73, 93: 68, 95: 75, 99: 78 };
  const SNAKE_COLORS = ['#2e9c4a', '#c0392b', '#8e44ad', '#d68910', '#16a085', '#2874a6', '#b03a6b'];
  const NS = 'http://www.w3.org/2000/svg';

  const center = n => {
    if (n <= 0) return { ...START };
    const r = Math.floor((n - 1) / 10), c = (n - 1) % 10, col = r % 2 ? 9 - c : c;
    return { x: col * CELL + CELL / 2, y: (9 - r) * CELL + CELL / 2 };
  };
  const tokenSpot = (n, i, count) => {
    const c = center(n);
    if (n <= 0) return { x: c.x + i * 30, y: c.y };
    const spread = count > 1 ? (i - (count - 1) / 2) * 15 : 0;
    return { x: c.x + spread, y: c.y + (count > 1 ? spread * 0.4 : 0) };
  };

  const jumpsOf = st => (st && st.jumps) || DEFAULT_JUMPS;
  const isSnake = (from, to) => to < from;

  /* Wiggly body for a snake, head (from) -> tail (to). */
  function snakePts(from, to, idx) {
    const a = center(from), b = center(to);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const waves = Math.max(2, Math.round(len / 90)), amp = Math.min(22, 10 + len / 28);
    const flip = idx % 2 ? -1 : 1, pts = [], steps = 28;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, env = Math.sin(Math.PI * t) * 0.85 + 0.15;
      const off = Math.sin(t * Math.PI * 2 * waves) * amp * env * flip;
      pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
    }
    return pts;
  }

  /* Everything the board needs to draw from the jump table. */
  function layout(jumps) {
    const snakes = [], ladders = [];
    Object.keys(jumps).map(Number).sort((x, y) => x - y).forEach(from => {
      const to = jumps[from];
      if (isSnake(from, to)) snakes.push({ from, to, pts: snakePts(from, to, snakes.length), color: SNAKE_COLORS[snakes.length % SNAKE_COLORS.length] });
      else ladders.push({ from, to });
    });
    return { snakes, ladders };
  }

  const poly = pts => pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');

  function boardMarkup(lay) {
    let s = `<defs><linearGradient id="ghSnBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f8f5b"/><stop offset="1" stop-color="#1f6b43"/></linearGradient></defs>`;
    s += `<rect x="0" y="0" width="${SIZE}" height="${H}" rx="18" fill="url(#ghSnBg)"/>`;
    for (let n = 1; n <= 100; n++) {
      const c = center(n), x = c.x - CELL / 2, y = c.y - CELL / 2;
      const r = Math.floor((n - 1) / 10), col = (n - 1) % 10;
      const fill = (r + col) % 2 ? '#f1e6b8' : '#e3efc9';
      s += `<rect x="${x + 1}" y="${y + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="5" fill="${n === 100 ? '#ffd95a' : fill}"/>`;
      s += `<text x="${x + 6}" y="${y + 15}" font-size="12" font-weight="700" fill="#35542f" opacity=".85" font-family="system-ui,sans-serif">${n}</text>`;
    }
    // ladders
    lay.ladders.forEach(l => {
      const a = center(l.from), b = center(l.to), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, nx = -uy * 7, ny = ux * 7;
      s += `<g class="gh-ladder" stroke-linecap="round">`;
      s += `<line x1="${a.x + nx}" y1="${a.y + ny}" x2="${b.x + nx}" y2="${b.y + ny}" stroke="#6b3f17" stroke-width="5"/>`;
      s += `<line x1="${a.x - nx}" y1="${a.y - ny}" x2="${b.x - nx}" y2="${b.y - ny}" stroke="#6b3f17" stroke-width="5"/>`;
      s += `<line x1="${a.x + nx}" y1="${a.y + ny}" x2="${b.x + nx}" y2="${b.y + ny}" stroke="#c98a3d" stroke-width="2.4"/>`;
      s += `<line x1="${a.x - nx}" y1="${a.y - ny}" x2="${b.x - nx}" y2="${b.y - ny}" stroke="#c98a3d" stroke-width="2.4"/>`;
      for (let d = 14; d < len - 6; d += 17) {
        const px = a.x + ux * d, py = a.y + uy * d;
        s += `<line x1="${px + nx}" y1="${py + ny}" x2="${px - nx}" y2="${py - ny}" stroke="#8b5a2b" stroke-width="3.4"/>`;
      }
      s += `</g>`;
    });
    // snakes
    lay.snakes.forEach(sn => {
      const d = poly(sn.pts), h = sn.pts[0], t = sn.pts[sn.pts.length - 1], h2 = sn.pts[2];
      const ang = Math.atan2(h.y - h2.y, h.x - h2.x) * 180 / Math.PI;
      s += `<g class="gh-snake" stroke-linecap="round" stroke-linejoin="round" fill="none">`;
      s += `<path d="${d}" stroke="rgba(0,0,0,.35)" stroke-width="13" transform="translate(1.5 2.5)"/>`;
      s += `<path d="${d}" stroke="#1c1c1c" stroke-width="12"/>`;
      s += `<path d="${d}" stroke="${sn.color}" stroke-width="9"/>`;
      s += `<path d="${d}" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-dasharray="3 9"/>`;
      s += `<circle cx="${t.x}" cy="${t.y}" r="3.2" fill="${sn.color}" stroke="#1c1c1c" stroke-width="1.4"/>`;
      s += `<g transform="translate(${h.x} ${h.y}) rotate(${ang})"><ellipse rx="11" ry="9" fill="${sn.color}" stroke="#1c1c1c" stroke-width="2.2"/>`;
      s += `<circle cx="3" cy="-4" r="2.6" fill="#fff"/><circle cx="3" cy="4" r="2.6" fill="#fff"/><circle cx="4" cy="-4" r="1.2" fill="#111"/><circle cx="4" cy="4" r="1.2" fill="#111"/>`;
      s += `<path d="M10 0 l8 0 m0 0 l4 -3 m-4 3 l4 3" stroke="#d62828" stroke-width="1.8"/></g>`;
      s += `</g>`;
    });
    s += `<text x="${START.x - 34}" y="${START.y - 14}" font-size="11" font-weight="700" fill="#e8f5d6" font-family="system-ui,sans-serif">START</text>`;
    return s;
  }

  function tokenMarkup(count) {
    let s = `<g class="gh-tokens">`;
    for (let i = 0; i < count; i++) {
      s += `<g class="gh-tok" data-i="${i}"><circle r="13" fill="${COLORS[i % 4]}" stroke="#fff" stroke-width="3"/><circle r="13" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/><text y="4.5" text-anchor="middle" font-size="13" font-weight="800" fill="#1b1b1b" font-family="system-ui,sans-serif">${i + 1}</text></g>`;
    }
    return s + `</g>`;
  }

  /* ---------- motion plan (shared by the SVG and Phaser animators) ---------- */
  const lerpPts = (a, b) => [a, b];
  function pointAt(pts, t) {
    if (pts.length === 1) return pts[0];
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
    let want = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < seg.length; i++) {
      if (want <= seg[i] || i === seg.length - 1) { const k = seg[i] ? want / seg[i] : 1; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k }; }
      want -= seg[i];
    }
    return pts[pts.length - 1];
  }

  /* Turn "square a -> square b after rolling r" into steps. */
  function plan(prev, next, roll, jumps, lay, player, count) {
    const steps = [], j = jumps || DEFAULT_JUMPS;
    const landed = roll ? Math.min(100, prev + roll) : null;
    const sp = (n) => tokenSpot(n, player, count);
    if (landed != null && (next === landed || next === j[landed])) {
      for (let s = prev + 1; s <= landed; s++) steps.push({ fx: 'hop', pts: lerpPts(sp(s - 1), sp(s)), dur: 170, arc: 14 });
      if (next !== landed) {
        if (next > landed) steps.push({ fx: 'ladder', pts: lerpPts(sp(landed), sp(next)), dur: 800, arc: 0 });
        else {
          const sn = lay.snakes.find(x => x.from === landed);
          const body = sn ? sn.pts.map((p, k) => (k === 0 ? sp(landed) : k === sn.pts.length - 1 ? sp(next) : p)) : lerpPts(sp(landed), sp(next));
          steps.push({ fx: 'snake', pts: body, dur: 1000, arc: 0 });
        }
      }
    } else steps.push({ fx: 'slide', pts: lerpPts(sp(prev), sp(next)), dur: 450, arc: 0 });
    if (next === 100) steps.push({ fx: 'win', pts: [sp(100)], dur: 1 });
    return steps;
  }

  const ease = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const reduced = () => document.documentElement.classList.contains('reduced-motion') || document.body.classList.contains('reduced-motion');

  /* ---------- per-room persistent state ---------- */
  const mem = { code: null };

  function build(code, st, count) {
    const jumps = jumpsOf(st), lay = layout(jumps);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${H}`);
    svg.setAttribute('class', 'snake-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Snakes and Ladders board');
    svg.innerHTML = boardMarkup(lay) + tokenMarkup(count);
    const m = { code, svg, lay, jumps, count, sq: (st.positions || []).slice(), pts: [], toks: [...svg.querySelectorAll('.gh-tok')], queue: Promise.resolve(), ph: null, phLoading: false };
    m.sq.forEach((n, i) => { m.pts[i] = tokenSpot(n, i, count); });
    placeSvgTokens(m);
    return m;
  }

  function placeSvgTokens(m) { m.toks.forEach((g, i) => { const p = m.pts[i]; if (p) g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`); }); }

  /* Re-space tokens when two share a square. */
  function respace(m) { m.sq.forEach((n, i) => { const same = m.sq.filter(x => x === n).length; const idx = m.sq.slice(0, i).filter(x => x === n).length; m.pts[i] = tokenSpot(n, idx, same); }); }

  function svgMove(m, i, step) {
    return new Promise(res => {
      if (step.fx === 'win') return res();
      const g = m.toks[i], t0 = performance.now(), dur = reduced() ? 1 : step.dur;
      g.parentNode.appendChild(g); // keep the moving token on top
      (function frame(now) {
        const k = Math.min(1, (now - t0) / dur), p = pointAt(step.pts, ease(k));
        const lift = step.arc ? Math.sin(Math.PI * k) * step.arc : 0;
        m.pts[i] = { x: p.x, y: p.y };
        g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${(p.y - lift).toFixed(1)})`);
        if (k < 1) requestAnimationFrame(frame); else res();
      })(t0);
    });
  }

  async function runSteps(m, i, steps) {
    for (const step of steps) {
      if (m.ph && m.ph.ready) await m.ph.move(i, step, m);
      else await svgMove(m, i, step);
      if (mem.code !== m.code) return;
    }
  }

  /* Queue animations so quick successive moves never overlap. */
  function enqueue(m, st) {
    const next = (st.positions || []).slice();
    const roll = st.lastRoll;
    const moved = [];
    next.forEach((n, i) => { if (m.sq[i] !== n) moved.push(i); });
    if (!moved.length) return;
    const prevSq = m.sq.slice();
    m.sq = next.slice();
    const finalSq = next.slice();
    m.queue = m.queue.then(async () => {
      for (const i of moved) {
        const steps = plan(prevSq[i], finalSq[i], moved.length === 1 ? roll : null, m.jumps, m.lay, i, m.count);
        await runSteps(m, i, steps);
      }
      if (mem.code !== m.code) return;
      respace(m); // settle shared squares
      if (m.ph && m.ph.ready) m.ph.snap(m); else placeSvgTokens(m);
    }).catch(() => { respace(m); placeSvgTokens(m); });
  }

  /* ---------- Phaser layer (optional) ---------- */
  function wantPhaser() {
    try { const r = window.GameHubRenderers; return !!(r && r.canWebGL() && r.choice('snakes') === 'phaser'); } catch { return false; }
  }

  async function startPhaser(m) {
    if (m.ph || m.phLoading || !wantPhaser()) return;
    m.phLoading = true;
    try {
      await window.GameHubRenderers.load('phaser');
      if (!window.Phaser || mem.code !== m.code) return;
      const host = document.createElement('div');
      host.className = 'snake-phaser';
      host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2';
      const ph = { ready: false, host };
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('phaser timeout')), 6000);
        const game = new Phaser.Game({
          type: Phaser.AUTO, width: SIZE, height: H, parent: host, transparent: true, banner: false,
          audio: { noAudio: true }, input: { mouse: false, touch: false, keyboard: false, gamepad: false },
          scale: { mode: Phaser.Scale.NONE },
          scene: {
            create() {
              const scene = this; ph.scene = scene; ph.game = game;
              ph.toks = [];
              for (let i = 0; i < m.count; i++) {
                const disc = scene.add.circle(0, 0, 13, parseInt(COLORS[i % 4].slice(1), 16)).setStrokeStyle(3, 0xffffff);
                const label = scene.add.text(0, 0, String(i + 1), { fontFamily: 'system-ui,sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#1b1b1b' }).setOrigin(0.5);
                const c = scene.add.container(m.pts[i].x, m.pts[i].y, [disc, label]);
                c.setDepth(5);
                ph.toks.push(c);
              }
              clearTimeout(timer); resolve();
            }
          }
        });
        ph.game = game;
      });
      ph.snap = mm => { mm.sq.forEach((_, i) => ph.toks[i] && ph.toks[i].setPosition(mm.pts[i].x, mm.pts[i].y).setScale(1)); };
      ph.burst = (x, y, color, n = 12, spread = 46) => {
        const sc = ph.scene;
        for (let k = 0; k < n; k++) {
          const dot = sc.add.circle(x, y, 2 + Math.random() * 3, color).setDepth(9);
          const a = Math.random() * Math.PI * 2, d = spread * (0.5 + Math.random() * 0.7);
          sc.tweens.add({ targets: dot, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.2, duration: 500 + Math.random() * 300, ease: 'Cubic.easeOut', onComplete: () => dot.destroy() });
        }
      };
      ph.move = (i, step, mm) => new Promise(res => {
        const sc = ph.scene, tok = ph.toks[i];
        if (!tok) return res();
        if (step.fx === 'win') {
          const p = step.pts[0];
          for (let b = 0; b < 4; b++) setTimeout(() => ph.burst(p.x + (Math.random() - .5) * 120, p.y + (Math.random() - .5) * 80, [0xf7c52b, 0x3d8de8, 0x44b86b, 0xe64e4e][b % 4], 16, 90), b * 220);
          return setTimeout(res, 900);
        }
        const dur = reduced() ? 1 : step.dur;
        tok.setDepth(8);
        if (step.fx === 'ladder' || step.fx === 'snake') ph.burst(step.pts[0].x, step.pts[0].y, step.fx === 'ladder' ? 0xc98a3d : 0xd62828, 10, 36);
        sc.tweens.addCounter({
          from: 0, to: 1, duration: dur, ease: step.fx === 'hop' ? 'Sine.easeInOut' : 'Cubic.easeInOut',
          onUpdate: tw => {
            const k = tw.getValue(), p = pointAt(step.pts, k), lift = step.arc ? Math.sin(Math.PI * k) * step.arc : 0;
            tok.setPosition(p.x, p.y - lift);
            if (step.fx === 'hop') tok.setScale(1 + Math.sin(Math.PI * k) * 0.18);
            else if (step.fx === 'snake') tok.setScale(1 - 0.25 * Math.sin(Math.PI * k));
            mm.pts[i] = { x: p.x, y: p.y };
          },
          onComplete: () => {
            tok.setScale(1).setDepth(5);
            const end = step.pts[step.pts.length - 1];
            tok.setPosition(end.x, end.y); mm.pts[i] = { x: end.x, y: end.y };
            if (step.fx === 'ladder') ph.burst(end.x, end.y, 0xf7c52b, 14, 44);
            else if (step.fx === 'hop') ph.burst(end.x, end.y + 8, 0xffffff, 3, 14);
            res();
          }
        });
      });
      ph.ready = true;
      m.ph = ph;
    } catch (e) {
      console.warn('[snakes] Phaser unavailable, using SVG tokens:', e && e.message);
      m.ph = null;
    } finally { m.phLoading = false; }
    if (m.ph && mem.code === m.code) { attachPhaser(m); }
  }

  function attachPhaser(m) {
    const stage = m.svg.parentNode; if (!stage || !m.ph) return;
    if (m.ph.host.parentNode !== stage) stage.appendChild(m.ph.host);
    const cv = m.ph.game && m.ph.game.canvas;
    if (cv) { cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block'; }
    m.svg.classList.add('ph-on'); // hides the SVG tokens
    m.ph.snap(m);
  }

  /* ---------- public API ---------- */
  function mount(el, st, opts) {
    if (!el || !st) return;
    opts = opts || {};
    const code = opts.code || 'local', count = Math.max(2, (st.positions || []).length || 2);
    if (mem.code !== code || !mem.m) {
      if (mem.m && mem.m.ph && mem.m.ph.game) { try { mem.m.ph.game.destroy(true); } catch (e) { /* ignore */ } }
      mem.code = code; mem.m = build(code, st, count);
    }
    const m = mem.m;
    if (m.svg.parentNode !== el) { el.textContent = ''; el.appendChild(m.svg); }
    el.classList.add('snake-stage');
    if (m.ph && m.ph.host) attachPhaser(m);
    enqueue(m, st);
    if (!m.ph) startPhaser(m);
  }

  function dispose() {
    if (mem.m && mem.m.ph && mem.m.ph.game) { try { mem.m.ph.game.destroy(true); } catch (e) { /* ignore */ } }
    mem.code = null; mem.m = null;
  }

  return { mount, dispose, layout, center, DEFAULT_JUMPS };
})();
