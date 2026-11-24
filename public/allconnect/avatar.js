/* ================= AllConnect avatars =================
   Procedural low-poly 3D characters (male + female) drawn on a 2D canvas. No libraries.
   - Camera:  tiny perspective camera (yaw / tilt / distance) shared by the map and the room.
   - Avatar:  skeleton + animation states: idle, walk, run, dance (4 moves), wave, pose (photo poses).
   Looks:   an Avatar can wear a 'render look' (see utils/acstyle.js resolve()): body type, hair, clothes, shoes, jewellery,
            cultural items, makeup, mood. Walk / idle styles and photo poses come in through the `ext` object.
   World axes: +x east, +y south, +z up. Heading h = direction the character faces (cos h, sin h).
   Units: Avatar.draw() takes S = world units per metre, so the same character works in the room (S=1) and on the map (S~9). */
(function (g) {
  'use strict';
  const TAU = Math.PI * 2, PI = Math.PI, sin = Math.sin, cos = Math.cos;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ---------- camera ---------- */
  class Camera {
    constructor(o) {
      Object.assign(this, { cx: 0, cy: 0, F: 600, tx: 0, ty: 0, tz: 0, D: 500, yaw: 0, tilt: .9 }, o || {});
      this.update();
    }
    /* tilt: 0 = looking straight down, ~1.2 = looking toward the horizon. yaw rotates the map. */
    update() {
      const c = cos(this.yaw), s = sin(this.yaw), ct = cos(this.tilt), st = sin(this.tilt);
      this.rx = c; this.ry = s;                       // screen-right on the ground
      this.ux = s * ct; this.uy = -c * ct; this.uz = st;   // screen-up
      this.fx = s * st; this.fy = -c * st; this.fz = -ct;  // view direction
      this.px = this.tx - this.fx * this.D; this.py = this.ty - this.fy * this.D; this.pz = this.tz - this.fz * this.D;
      return this;
    }
    project(x, y, z, o) {
      o = o || {};
      const vx = x - this.px, vy = y - this.py, vz = z - this.pz;
      const zc = vx * this.fx + vy * this.fy + vz * this.fz;
      const k = this.F / (zc > .001 ? zc : .001);
      o.x = this.cx + (vx * this.rx + vy * this.ry) * k;
      o.y = this.cy - (vx * this.ux + vy * this.uy + vz * this.uz) * k;
      o.z = zc; o.k = k;
      return o;
    }
    /* screen point -> point on the ground plane (z = zp). null if the ray misses (above the horizon). */
    pick(sx, sy, zp) {
      const xc = (sx - this.cx) / this.F, yc = -(sy - this.cy) / this.F;
      const dx = this.rx * xc + this.ux * yc + this.fx, dy = this.ry * xc + this.uy * yc + this.fy, dz = this.uz * yc + this.fz;
      if (dz > -1e-6) return null;
      const t = ((zp || 0) - this.pz) / dz;
      return { x: this.px + dx * t, y: this.py + dy * t };
    }
  }

  /* ---------- colour helpers ---------- */
  const hex = h => { if (h.charAt(0) === 'r') return h.replace(/[^\d,]/g, '').split(',').map(Number); h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const shade = (h, f) => { const c = hex(h).map(v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255)); return `rgb(${c[0]},${c[1]},${c[2]})`; };
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
  const worn = (col, on) => on ? mix(col, '#7d7a76', .5) : col;     // worn-out clothes look washed out

  const LOOK = {
    male: { top: '#d9b24a', bottom: '#262833', shoe: '#f2f2f2', hair: '#16100d', skin: '#6b4226' },
    female: { top: '#2f9e63', bottom: '#f4efe6', shoe: '#7a4b2a', hair: '#16100d', skin: '#6b4226' }
  };
  /* body types: keep in step with BODIES in utils/acstyle.js (tests/acstyle.test.js checks this) */
  const BODIES = {
    average: { h: 1, sh: 1, tw: 1, hp: 1, lw: 1 }, slim: { h: 1.02, sh: .92, tw: .84, hp: .9, lw: .86 }, lean: { h: 1.08, sh: .96, tw: .88, hp: .92, lw: .9 },
    athletic: { h: 1.03, sh: 1.12, tw: 1.02, hp: .96, lw: 1.08 }, broad: { h: 1.04, sh: 1.2, tw: 1.18, hp: 1.04, lw: 1.14 }, stocky: { h: .95, sh: 1.12, tw: 1.22, hp: 1.12, lw: 1.14 },
    curvy: { h: 1, sh: .98, tw: 1.1, hp: 1.24, lw: 1.1 }, plus: { h: 1, sh: 1.12, tw: 1.38, hp: 1.3, lw: 1.22 }, petite: { h: .9, sh: .88, tw: .86, hp: .9, lw: .86 }, tall: { h: 1.12, sh: 1.04, tw: .98, hp: .98, lw: 1 }
  };
  const WALKS = ['walk_normal', 'walk_swagger', 'walk_bouncy', 'walk_catwalk', 'walk_brisk', 'walk_relaxed', 'walk_tiptoe', 'walk_proud'];
  const IDLES = ['idle_breathe', 'idle_hips', 'idle_arms', 'idle_sway', 'idle_look', 'idle_stretch', 'idle_tap', 'idle_phone', 'idle_think'];
  const POSES = ['pose_hips', 'pose_peace', 'pose_cross', 'pose_hello', 'pose_flex', 'pose_model', 'pose_think', 'pose_salute', 'pose_selfie', 'pose_victory', 'pose_lean'];
  const MOODS = ['neutral', 'happy', 'excited', 'calm', 'cool', 'shy', 'sleepy', 'sad', 'angry', 'stressed'];

  /* the look every player had before the Style app existed (also used for people on the map we know nothing about) */
  function defaultRender(gender, o) {
    o = o || {}; const fem = gender === 'female', L = LOOK[fem ? 'female' : 'male'];
    return {
      v: 1, g: fem ? 'female' : 'male', body: 'average', skin: o.skin || L.skin, hair: { style: fem ? 'braids_bun' : 'lowcut', color: o.hair || L.hair }, beard: 'none',
      outfit: null, top: { k: 'tee', c1: o.top || L.top }, bottom: { k: fem ? 'skirt' : 'long', c1: o.bottom || L.bottom }, shoes: { k: 'sneaker', c1: o.shoe || L.shoe, c2: '#d8d8d8' },
      head: null, neckwear: null, hand: null, face: null, jewel: {}, makeup: {}, mood: 'neutral', fresh: false
    };
  }

  /* ---------- poses ---------- */
  const IDLE = () => ({
    la1: .04, lb1: .1, la2: .25, lb2: .1, ra1: .04, rb1: .1, ra2: .25, rb2: .1,
    ll: 0, llb: .03, llk: 0, rl: 0, rlb: .03, rlk: 0, lean: 0, twist: 0, sx: 0, sy: 0, head: 0, lift: 0
  });
  const KEYS = Object.keys(IDLE());
  const DANCES = 4;
  const set = (P, o) => Object.assign(P, o);
  const armsHips = P => set(P, { la1: -.1, lb1: .75, la2: .2, lb2: -.83, ra1: -.1, rb1: .75, ra2: .2, rb2: -.83 });
  const armsCross = P => set(P, { la1: .35, lb1: .25, la2: 1.0, lb2: -1.3, ra1: .35, rb1: .25, ra2: 1.0, rb2: -1.3 });
  const thinking = P => set(P, { ra1: .7, rb1: .15, ra2: 2.5, rb2: -.4, la1: .3, lb1: .2, la2: 1.0, lb2: -1.2 });

  /* 158 idle styles */
  function idleStyle(P, id, t, reduce) {
    const b = reduce ? 0 : 1;
    switch (id) {
      case 'idle_hips': armsHips(P); P.lean = -.01; P.ll = .04; P.llb = .1; break;
      case 'idle_arms': armsCross(P); P.rl = -.05; P.head = .04 * b * sin(t * .5); break;
      case 'idle_sway': P.sx = .03 * b * sin(t * 1.1); P.twist = .08 * b * sin(t * .8); P.lean = .01; break;
      case 'idle_look': P.head = .6 * b * sin(t * .7); P.twist = .1 * b * sin(t * .7); break;
      case 'idle_stretch': { const k = b * Math.pow(Math.max(0, sin(t * .6)), 2); P.lb1 = P.rb1 = .1 + 2.8 * k; P.lb2 = P.rb2 = .1 + 2.9 * k; P.la1 = P.ra1 = P.la2 = P.ra2 = .05; P.lean = -.1 * k; break; }
      case 'idle_tap': P.rlk = .25 + .25 * b * Math.max(0, sin(t * 6)); P.rl = .1; P.lb1 = P.rb1 = .2; break;
      case 'idle_phone': set(P, { ra1: 1.0, rb1: .2, ra2: 2.4, rb2: -.15, lean: .05 }); break;
      case 'idle_think': thinking(P); P.head = .05; break;
    }
  }
  /* 157 walk styles: tweak the base walk cycle (w = sin of the phase) */
  function walkStyle(P, id, f, run) {
    if (run || !id) return; const w = sin(f), a = Math.abs(w);
    switch (id) {
      case 'walk_swagger': P.sx = .05 * w; P.twist = .28 * w; P.lb1 = P.rb1 = .4; P.la1 *= .6; P.ra1 *= .6; P.lean = -.03; P.head = .12 * w; break;
      case 'walk_bouncy': P.lift = .05 * a; P.llk += .25; P.rlk += .25; P.lean = .02; break;
      case 'walk_catwalk': P.ll *= 1.15; P.rl *= 1.15; P.llb = P.rlb = -.09; P.twist = .36 * w; P.sx = .045 * w; P.lb1 = P.rb1 = .12; P.la1 *= .5; P.ra1 *= .5; P.lean = -.03; break;
      case 'walk_brisk': P.ll *= 1.2; P.rl *= 1.2; P.la1 *= 1.5; P.ra1 *= 1.5; P.la2 = P.la1 + 1.0; P.ra2 = P.ra1 + 1.0; P.lean = .1; break;
      case 'walk_relaxed': P.ll *= .75; P.rl *= .75; P.la1 *= .5; P.ra1 *= .5; P.la2 = P.la1 + .15; P.ra2 = P.ra1 + .15; P.lean = .02; P.head = .08 * w; break;
      case 'walk_tiptoe': P.ll *= .55; P.rl *= .55; P.lift = .05; P.llk *= .6; P.rlk *= .6; P.la1 *= .6; P.ra1 *= .6; break;
      case 'walk_proud': P.lean = -.07; P.lb1 = P.rb1 = .3; P.la1 *= .8; P.ra1 *= .8; P.head = -.02; break;
    }
  }
  /* 155 photo poses (held still) */
  function photoPose(P, id, t, reduce) {
    const br = reduce ? 0 : sin(t * 1.7) * .01;
    switch (id) {
      case 'pose_hips': armsHips(P); P.ll = .12; P.llb = .1; P.head = .1; P.lean = -.01; break;
      case 'pose_peace': set(P, { ra1: .2, rb1: 1.55, ra2: .1, rb2: 2.7, la1: -.1, lb1: .75, la2: .2, lb2: -.83, head: .14, twist: .15 }); P.ll = .1; break;
      case 'pose_cross': armsCross(P); P.ll = .12; P.rl = -.08; P.lean = -.02; break;
      case 'pose_hello': set(P, { ra1: 0, rb1: 2.6, ra2: 0, rb2: 2.9, la1: -.1, lb1: .75, la2: .2, lb2: -.83, head: .1 }); break;
      case 'pose_flex': set(P, { la1: 0, lb1: 1.55, la2: 0, lb2: 2.7, ra1: 0, rb1: 1.55, ra2: 0, rb2: 2.7, llb: .15, rlb: .15, lean: -.03 }); break;
      case 'pose_model': set(P, { la1: -.1, lb1: .75, la2: .2, lb2: -.83, ra1: 0, rb1: 1.9, ra2: -.6, rb2: -.2, ll: .25, rl: -.1, rlk: .15, twist: .22, lean: -.05, head: .12 }); break;
      case 'pose_think': thinking(P); P.ll = .1; break;
      case 'pose_salute': set(P, { ra1: .5, rb1: 1.2, ra2: .9, rb2: 2.3, la1: .04, lb1: .1, lean: -.02 }); break;
      case 'pose_selfie': set(P, { ra1: 1.25, rb1: .3, ra2: 1.1, rb2: .2, la1: -.1, lb1: .75, la2: .2, lb2: -.83, head: .18, twist: .2, ll: .08 }); break;
      case 'pose_victory': set(P, { la1: 0, lb1: 2.55, la2: 0, lb2: 2.8, ra1: 0, rb1: 2.55, ra2: 0, rb2: 2.8, llb: .12, rlb: .12, lift: .03, lean: -.03 }); break;
      case 'pose_lean': set(P, { la1: .1, lb1: .3, la2: .6, lb2: -.5, ra1: .1, rb1: .3, ra2: .6, rb2: -.5, sx: .1, twist: .25, ll: .3, rl: -.2, rlk: .1, lean: .06, head: .1 }); break;
    }
    P.lean += br;
  }
  /* 156 mood: small body language on top of idle / walk / wave */
  function moodMods(P, mood, t, s, reduce) {
    const k = reduce ? 0 : 1, calm = s === 'idle' || s === 'wave';
    switch (mood) {
      case 'happy': P.lean -= .01; P.lift += k * .008 * (1 + sin(t * 3)); break;
      case 'excited': P.lift += k * .03 * Math.abs(sin(t * 6)); if (calm && s === 'idle') { P.lb1 += .3; P.rb1 += .3; } break;
      case 'calm': P.lean -= .005; break;
      case 'cool': P.lean -= .03; P.head += .06; break;
      case 'shy': P.lean += .05; P.twist += .1; if (calm && s === 'idle') { P.la2 = .9; P.ra2 = .9; P.lb2 = -.5; P.rb2 = -.5; } break;
      case 'sleepy': P.lean += .05 + k * .04 * sin(t * .8); break;
      case 'sad': P.lean += .1; if (calm && s === 'idle') { P.la1 = P.ra1 = .1; } break;
      case 'angry': P.lean += .05; if (calm && s === 'idle') { P.lb1 += .3; P.rb1 += .3; P.la2 = P.ra2 = .8; P.lb2 = P.rb2 = -.2; } break;
      case 'stressed': P.sx += k * .01 * sin(t * 25); break;
    }
  }

  /* pose library shared by the map characters (this file) and the 3D room character (room3d.js).
     ext (optional): { walk, idle, pose, mood, reduce } = the player's personal styles. */
  function targetPose(P, s, f, tm, dance, ext) {
    ext = ext || {}; Object.assign(P, IDLE());
    if (ext.reduce && s === 'dance') s = 'idle';
    const w = sin(f), w2 = sin(2 * f), av = { t: tm, dance: dance };
    if (s === 'idle') {
      const b = ext.reduce ? 0 : sin(av.t * 1.7);
      P.la1 = .04 + .03 * b; P.ra1 = .04 + .03 * b; P.la2 = .25 + .05 * b; P.ra2 = .25 + .05 * b;
      P.lean = .012 * b; P.head = ext.reduce ? 0 : .05 * sin(av.t * .6); P.lb1 = .1 + .02 * b; P.rb1 = .1 + .02 * b;
      idleStyle(P, ext.idle, av.t, ext.reduce);
    } else if (s === 'pose') {
      photoPose(P, ext.pose, av.t, ext.reduce);
    } else if (s === 'walk' || s === 'run') {
      const run = s === 'run', A = run ? .95 : .52, K = run ? 1.5 : .95, arm = run ? 1.0 : .8 * A / .52 * .55;
      P.ll = A * w; P.rl = -A * w;
      P.llk = .1 + K * Math.max(0, cos(f)); P.rlk = .1 + K * Math.max(0, -cos(f));
      P.la1 = -arm * w; P.ra1 = arm * w;
      const bend = run ? 1.2 : .32; P.la2 = P.la1 + bend; P.ra2 = P.ra1 + bend;
      P.lb1 = P.rb1 = .12; P.lean = run ? .2 : .04; P.twist = (run ? .3 : .16) * w; P.sx = .015 * w;
      walkStyle(P, ext.walk, f, run);
    } else if (s === 'dance') {
      const d = av.dance % DANCES;
      if (d === 0) {                 /* shaku-shaku: bent elbows swinging side to side, alternate knee lifts */
        P.ll = .25 * w; P.rl = -.25 * w; P.llb = P.rlb = .1;
        P.llk = .55 + .45 * w; P.rlk = .55 - .45 * w;
        P.la1 = .3; P.lb1 = .7 + .35 * w; P.la2 = .3; P.lb2 = 2.7 + .3 * w;
        P.ra1 = .3; P.rb1 = .7 - .35 * w; P.ra2 = .3; P.rb2 = 2.7 - .3 * w;
        P.twist = .3 * w; P.lean = .12 + .06 * w2; P.sx = .05 * w; P.head = .08 * w;
      } else if (d === 1) {          /* hands up bounce */
        P.la1 = .1; P.lb1 = 2.5 + .45 * w; P.la2 = .1; P.lb2 = P.lb1 + .2;
        P.ra1 = .1; P.rb1 = 2.5 - .45 * w; P.ra2 = .1; P.rb2 = P.rb1 + .2;
        P.llk = P.rlk = .4 + .3 * w2; P.ll = .12 * w; P.rl = -.12 * w; P.llb = P.rlb = .12;
        P.sx = .1 * w; P.twist = .2 * w; P.lean = .08 * w2; P.head = .1 * w;
      } else if (d === 2) {          /* spin */
        P.la1 = 0; P.lb1 = 1.45; P.la2 = 0; P.lb2 = 1.45; P.ra1 = 0; P.rb1 = 1.45; P.ra2 = 0; P.rb2 = 1.45;
        P.llk = P.rlk = .3 + .2 * w2; P.lift = .03 + .05 * Math.max(0, w2); P.lean = .06;
      } else {                       /* zanku: leg kicks + arm pumps */
        P.ll = .8 * Math.max(0, w) - .1; P.llk = 1.2 * Math.max(0, w);
        P.rl = .8 * Math.max(0, -w) - .1; P.rlk = 1.2 * Math.max(0, -w);
        P.la1 = -.9 * w; P.la2 = P.la1 + 1.4; P.ra1 = .9 * w; P.ra2 = P.ra1 + 1.4;
        P.lean = .1; P.twist = .25 * w; P.sx = .04 * w;
      }
    } else if (s === 'wave') {
      P.ra1 = 0; P.rb1 = 1.35; P.ra2 = 0; P.rb2 = 2.45 + .5 * sin(f * 2.2); P.head = .12; P.lean = -.01;
    }
    if (ext.mood && s !== 'dance' && s !== 'pose') moodMods(P, ext.mood, tm, s, ext.reduce);
  }

  const dirv = (side, a, b) => [side * sin(b), sin(a) * cos(b), -cos(a) * cos(b)];
  const RATE = { idle: 0, wave: 1, walk: 0, run: 0, pose: 0 };

  /* ---------- drawing primitives ---------- */
  let OL = 1;      // outline thickness (thicker when the player turns on high contrast)
  function capPath(c, x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
    c.beginPath();
    if (d < .4 || d <= Math.abs(r1 - r2)) { const big = r1 > r2; c.arc(big ? x1 : x2, big ? y1 : y2, Math.max(r1, r2), 0, TAU); return; }
    const a = Math.atan2(dy, dx), o = Math.acos((r1 - r2) / d);
    c.arc(x1, y1, r1, a + o, a - o + TAU, false);
    c.arc(x2, y2, r2, a - o, a + o, false);
    c.closePath();
  }
  function limb(c, A, B, ra, rb, col, outline) {
    const r1 = ra * A.k, r2 = rb * B.k;
    if (outline) { capPath(c, A.x, A.y, r1 + OL, B.x, B.y, r2 + OL); c.fillStyle = outline; c.fill(); }
    capPath(c, A.x, A.y, r1, B.x, B.y, r2); c.fillStyle = col; c.fill();
  }
  function ball(c, A, r, col, outline) {
    const rr = r * A.k;
    if (outline) { c.beginPath(); c.arc(A.x, A.y, rr + OL, 0, TAU); c.fillStyle = outline; c.fill(); }
    c.beginPath(); c.arc(A.x, A.y, rr, 0, TAU); c.fillStyle = col; c.fill();
  }
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  const poly = (c, pts) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); };
  const ell = (c, p, rx, ry, col, rot) => { c.beginPath(); c.ellipse(p.x, p.y, Math.max(.3, rx), Math.max(.3, ry), rot || 0, 0, TAU); c.fillStyle = col; c.fill(); };

  /* cloth patterns, drawn inside whatever path is currently clipped. u = pixel size of one pattern cell */
  function pattern(c, kind, col, x, y, w, h, u) {
    if (!kind || kind === 'solid' || !(u > 1.2)) return;
    c.save(); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = Math.max(.8, u * .16);
    if (kind === 'stripe') { for (let i = x; i < x + w; i += u * .9) c.fillRect(i, y, u * .34, h); }
    else if (kind === 'aso') { for (let j = y, n = 0; j < y + h; j += u * .5, n++) c.fillRect(x, j, w, u * (n % 3 ? .12 : .24)); }
    else if (kind === 'dots' || kind === 'lace') { const s = kind === 'lace' ? u * .55 : u * .8; for (let j = y, n = 0; j < y + h; j += s, n++) for (let i = x + (n % 2 ? s / 2 : 0); i < x + w; i += s) { c.beginPath(); c.arc(i, j, u * (kind === 'lace' ? .1 : .14), 0, TAU); c.fill(); } }
    else if (kind === 'ankara') { const s = u * 1.2; for (let j = y, n = 0; j < y + h; j += s, n++) for (let i = x + (n % 2 ? s / 2 : 0); i < x + w; i += s) { c.beginPath(); c.arc(i, j, u * .36, 0, TAU); c.stroke(); c.beginPath(); c.arc(i, j, u * .13, 0, TAU); c.fill(); } }
    else if (kind === 'adire') { const s = u * 1.15; for (let j = y; j < y + h; j += s) for (let i = x; i < x + w; i += s) for (let r = .14; r < .6; r += .17) { c.beginPath(); c.arc(i, j, u * r, 0, TAU); c.stroke(); } }
    c.restore();
  }

  /* ---------- hairstyles: cap = [size, lift, face-hole size] ---------- */
  const HS = {
    lowcut: { cap: [1.05, .03, .74] }, fade: { cap: [1.0, .05, .8], fade: 1 }, highfade: { cap: [.98, .065, .8], fade: 1, flat: .04 }, waves: { cap: [1.04, .03, .74], waves: 1 },
    flattop: { cap: [1.0, .05, .8], fade: 1, flat: .07 }, bald: { cap: null }, afro: { cap: [1.04, .035, .74], back: 'afro' }, twists: { cap: [1.05, .03, .74], twists: 1 },
    locs: { cap: [1.05, .03, .74], strands: [9, .2, 0] }, bantu: { cap: [1.04, .03, .76], knots: 7 }, cornrows: { cap: [1.04, .03, .76], rows: 1 },
    braids_bun: { cap: [1.12, .03, .78], bun: 1, braid: 1 }, box_braids: { cap: [1.1, .03, .78], strands: [7, .5, 1] }, knotless: { cap: [1.1, .03, .78], strands: [9, .62, 1] },
    ghana: { cap: [1.05, .03, .78], rows: 1, strands: [5, .45, 1] }, afro_puff: { cap: [1.04, .03, .76], puffs: 1 }, twist_out: { cap: [1.08, .03, .76], back: 'curly' },
    space_buns: { cap: [1.06, .03, .76], buns: 1 }, locs_long: { cap: [1.06, .03, .76], strands: [11, .55, 0] }, bob: { cap: [1.12, .03, .78], wig: .22 },
    long_wig: { cap: [1.12, .03, .78], wig: .5 }, curly_wig: { cap: [1.1, .03, .78], back: 'curly' }
  };

  /* ---------- avatar ---------- */
  class Avatar {
    constructor(gender, o) {
      o = o || {};
      this.g = gender === 'female' ? 'female' : 'male';
      this.ext = {}; this.poseName = '';
      this.setLook(o.look || defaultRender(this.g, o));
      this.x = 0; this.y = 0; this.z = 0; this.h = PI / 2; this.spin = 0;
      this.state = 'idle'; this.dance = 0; this.speed = 0; this.phase = Math.random() * TAU; this.t = Math.random() * 10;
      this.pose = IDLE(); this.tp = IDLE(); this._x = {};
    }
    /* r = a "render look" from the server (or defaultRender). The model (male/female base shape) follows r.g when given. */
    setLook(r) {
      this.look = r || defaultRender(this.g); if (this.look.g === 'male' || this.look.g === 'female') this.g = this.look.g;
      this.B = BODIES[this.look.body] || BODIES.average;
      const skin = this.look.skin || '#6b4226';
      this.cs = { skin, skinD: shade(skin, -.14), line: 'rgba(15,10,8,.55)' };
    }
    /* personal styles: { walk, idle, reduce (less motion), contrast (thick outlines), noSparkle } */
    setExt(e) { this.ext = e || {}; }
    setPose(name) { this.poseName = name || ''; this.state = name ? 'pose' : 'idle'; }
    setState(s) { if (s !== this.state) { this.state = s; if (s === 'wave') this.phase = 0; } }
    nextDance() { this.dance = (this.dance + 1) % DANCES; this.state = 'dance'; }
    update(dt) {
      dt = Math.min(dt, .1);
      let rate = RATE[this.state] || 0;
      if (this.state === 'walk') rate = clamp(this.speed / 1.5, .55, 1.5);
      else if (this.state === 'run') rate = clamp(this.speed / 2.6, 1.2, 2.3);
      else if (this.state === 'dance') rate = [1.15, 1.15, 1.0, 1.4][this.dance % DANCES];
      this.phase += dt * TAU * rate; this.t += dt;
      if (this.state === 'dance' && this.dance % DANCES === 2 && !this.ext.reduce) this.spin += dt * 5.2;
      else this.spin += (Math.round(this.spin / TAU) * TAU - this.spin) * Math.min(1, dt * 7);
      const X = this._x; X.walk = this.ext.walk; X.idle = this.ext.idle; X.reduce = this.ext.reduce; X.mood = this.look.mood; X.pose = this.poseName;
      targetPose(this.tp, this.state, this.phase, this.t, this.dance, X);
      const k = 1 - Math.exp(-dt * 14);
      for (const key of KEYS) this.pose[key] += (this.tp[key] - this.pose[key]) * k;
    }
    /* joints in world space; S = world units per metre */
    joints(S) {
      const P = this.pose, fem = this.g === 'female', B = this.B;
      const sw = (fem ? .165 : .205) * B.sh, hw = (fem ? .115 : .1) * B.hp, TH = .45, SH = .45, UA = .3, FA = .27, TO = .5, AN = .07;
      const lg = (side, a, b, k) => {
        const d1 = dirv(side, a, b), d2 = dirv(side, a - k, b * .5);
        const kn = [d1[0] * TH, d1[1] * TH, d1[2] * TH];
        return { kn, an: [kn[0] + d2[0] * SH, kn[1] + d2[1] * SH, kn[2] + d2[2] * SH], a2: a - k };
      };
      const L = lg(-1, P.ll, P.llb, P.llk), R = lg(1, P.rl, P.rlb, P.rlk);
      const hz = AN - Math.min(L.an[2], R.an[2]) + P.lift;
      const H = [P.sx, P.sy, hz];
      const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
      const ch = [H[0], H[1] + sin(P.lean) * TO, H[2] + cos(P.lean) * TO];
      const tw = P.twist, sb = [ch[0], ch[1], ch[2] - .04];
      const shL = [sb[0] - sw * cos(tw), sb[1] - sw * sin(tw), sb[2]], shR = [sb[0] + sw * cos(tw), sb[1] + sw * sin(tw), sb[2]];
      const arm = (sh, side, a1, b1, a2, b2) => {
        const d1 = dirv(side, a1, b1), d2 = dirv(side, a2, b2);
        const el = [sh[0] + d1[0] * UA, sh[1] + d1[1] * UA, sh[2] + d1[2] * UA];
        return { el, wr: [el[0] + d2[0] * FA, el[1] + d2[1] * FA, el[2] + d2[2] * FA] };
      };
      const aL = arm(shL, -1, P.la1, P.lb1, P.la2, P.lb2), aR = arm(shR, 1, P.ra1, P.rb1, P.ra2, P.rb2);
      const head = [ch[0] + P.head * .12, ch[1] + .05 + sin(P.lean) * .1, ch[2] + .2];
      const toe = (an, a2) => { const p = clamp(-a2 * .6, -.5, .6); return [an[0], an[1] + .14 * cos(p), an[2] - .05 - .14 * sin(p)]; };
      const hL = add(H, [-hw, 0, 0]), hR = add(H, [hw, 0, 0]);
      const out = {
        H, ch, shL, shR, head, hL, hR, elL: aL.el, wrL: aL.wr, elR: aR.el, wrR: aR.wr,
        knL: add(hL, L.kn), anL: add(hL, L.an), knR: add(hR, R.kn), anR: add(hR, R.an)
      };
      out.toL = add(hL, toe(L.an, L.a2)); out.toR = add(hR, toe(R.an, R.a2));
      out.bk = [head[0], head[1] - .08, head[2] - .03];
      out.bkEnd = [ch[0], ch[1] - .1, ch[2] - .15];
      // local -> world
      const hh = this.h + this.spin, rx = -sin(hh), ry = cos(hh), fx = cos(hh), fy = sin(hh);
      const X = this.x, Y = this.y, Z = this.z;
      const W = {};
      for (const k in out) { const p = out[k]; W[k] = [X + (rx * p[0] + fx * p[1]) * S, Y + (ry * p[0] + fy * p[1]) * S, Z + p[2] * S]; }
      W.fwd = [fx, fy]; W.rgt = [rx, ry];
      return W;
    }

    /* Draw into ctx using camera cam. Returns { x, y, top, h } screen info (feet position, head-top y, pixel height).
       opt: { shadow:false, contrast:true, noSparkle:true } */
    draw(ctx, cam, S, opt) {
      S = S || 1; opt = opt || {};
      const B = this.B, SS = S * B.h, L = this.look, fem = this.g === 'female';
      OL = opt.contrast || this.ext.contrast ? 2.4 : 1;
      const feet = cam.project(this.x, this.y, this.z, {}), pxH = 1.8 * SS * feet.k;
      const info = { x: feet.x, y: feet.y, top: feet.y - pxH, h: pxH, z: feet.z };
      if (feet.z < 1) return info;
      if (opt.shadow !== false) {   /* ground shadow */
        const pts = [], rr = .3 * S * B.hp * (1 - clamp(this.pose.lift * 2, 0, .3));
        for (let i = 0; i < 12; i++) pts.push(cam.project(this.x + cos(i / 12 * TAU) * rr, this.y + sin(i / 12 * TAU) * rr, this.z, {}));
        ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fill();
      }
      const J = this.joints(SS), c = this.cs, pj = {};
      for (const k in J) if (k !== 'fwd' && k !== 'rgt') pj[k] = cam.project(J[k][0], J[k][1], J[k][2], {});
      const W = wardrobe(L, fem), hairCol = (L.hair && L.hair.color) || '#16100d';
      if (pxH < 11) {   /* far away: simple doll */
        ctx.lineCap = 'round'; ctx.strokeStyle = W.torso ? W.torso.col : '#888'; ctx.lineWidth = Math.max(2, .3 * SS * feet.k);
        ctx.beginPath(); ctx.moveTo(pj.H.x, pj.H.y); ctx.lineTo(pj.ch.x, pj.ch.y); ctx.stroke();
        ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(pj.head.x, pj.head.y, Math.max(1.4, .12 * SS * feet.k), 0, TAU); ctx.fill();
        return info;
      }
      const ln = opt.contrast || this.ext.contrast ? '#000' : c.line, parts = [], dep = (...ps) => ps.reduce((a, p) => a + p.z, 0) / ps.length;
      const rad = .045, hipC = [(J.hL[0] + J.hR[0]) / 2, (J.hL[1] + J.hR[1]) / 2, (J.hL[2] + J.hR[2]) / 2], ph = cam.project(hipC[0], hipC[1], hipC[2], {});
      const shC = [(J.shL[0] + J.shR[0]) / 2, (J.shL[1] + J.shR[1]) / 2, (J.shL[2] + J.shR[2]) / 2], ps = cam.project(shC[0], shC[1], shC[2], {});
      const headR = fem ? .108 : .115, hd = pj.head, toCam = [cam.px - J.head[0], cam.py - J.head[1], cam.pz - J.head[2]];
      const tl = Math.hypot(toCam[0], toCam[1], toCam[2]) || 1, front = (J.fwd[0] * toCam[0] + J.fwd[1] * toCam[1]) / tl, rgt = J.rgt;
      const P3 = (dx, dy, dz) => cam.project(J.head[0] + (rgt[0] * dx + J.fwd[0] * dy) * SS, J.head[1] + (rgt[1] * dx + J.fwd[1] * dy) * SS, J.head[2] + dz * SS, {});
      const BW = (base, dr, df, dz) => cam.project(base[0] + (rgt[0] * dr + J.fwd[0] * df) * SS, base[1] + (rgt[1] * dr + J.fwd[1] * df) * SS, base[2] + dz * SS, {});
      const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, k: a.k + (b.k - a.k) * t });
      const nk = cam.project(shC[0] + (J.head[0] - shC[0]) * .4, shC[1] + (J.head[1] - shC[1]) * .4, shC[2] + (J.head[2] - shC[2]) * .4, {});
      const U = SS * ps.k;   // pixels per metre at the body
      const J_ = L.jewel || {}, M = L.makeup || {};

      // ---- legs + shoes
      const leg = (hp, kn, an, to, side) => {
        const skinC = side < 0 ? c.skinD : c.skin, lc = W.legCol ? (side < 0 ? shade(W.legCol, -.14) : W.legCol) : null, lw = B.lw;
        parts.push({ d: dep(pj[hp], pj[kn], pj[an]) + .01 * SS, f: () => {
          limb(ctx, pj[hp], pj[kn], .075 * SS * lw, .062 * SS * lw, W.legs >= 1 && lc ? lc : skinC, ln);
          limb(ctx, pj[kn], pj[an], .062 * SS * lw, .048 * SS * lw, W.legs >= 2 && lc ? lc : skinC, ln);
          if (W.legs >= 2 && W.legDeco === 'cuff') limb(ctx, lerp(pj[an], pj[kn], .1), pj[an], .056 * SS * lw, .052 * SS * lw, shade(W.legCol, -.3), null);
          if (J_.ankle) { const a = lerp(pj[an], pj[kn], .1); ctx.strokeStyle = tone(J_.ankle.c1); ctx.lineWidth = Math.max(1, .012 * U); ctx.beginPath(); ctx.ellipse(a.x, a.y, .052 * SS * a.k, .02 * SS * a.k, 0, 0, TAU); ctx.stroke(); }
          shoe(ctx, L.shoes, pj[kn], pj[an], pj[to], SS, skinC, ln);
        } });
      };
      leg('hL', 'knL', 'anL', 'toL', -1); leg('hR', 'knR', 'anR', 'toR', 1);

      // ---- arms (sleeves, jewellery, held items)
      const arm = (sh, el, wr, side) => {
        const skinC = side < 0 ? c.skinD : c.skin, sl = W.slvCol ? (side < 0 ? shade(W.slvCol, -.14) : W.slvCol) : null, w = W.wide || 1, lw = B.lw;
        parts.push({ d: dep(pj[sh], pj[el], pj[wr]) - (W.robe || W.skirt ? .12 * SS : 0), f: () => {
          limb(ctx, pj[sh], pj[el], .058 * SS * lw * w, .05 * SS * lw * w, W.slv >= 1 && sl ? sl : skinC, ln);
          limb(ctx, pj[el], pj[wr], .048 * SS * lw * (W.slv >= 2 ? w * 1.1 : 1), .04 * SS * lw * (W.slv >= 2 ? w * 1.2 : 1), W.slv >= 2 && sl ? sl : skinC, ln);
          ball(ctx, pj[wr], rad * SS * lw, skinC, ln);
          if (W.slv < 1 && W.torso) ball(ctx, pj[sh], .062 * SS, side < 0 ? shade(W.torso.col, -.14) : W.torso.col, ln);
          const wj = J_.wrist; if (wj) wristItem(ctx, wj, pj[el], pj[wr], SS, side);
          if (J_.ring && side > 0) { ball(ctx, lerp(pj[wr], pj[el], -.05), .016 * SS, tone(J_.ring.c1), null); if (J_.ring.c2) ball(ctx, lerp(pj[wr], pj[el], -.05), .008 * SS, J_.ring.c2, null); }
        } });
      };
      arm('shL', 'elL', 'wrL', -1); arm('shR', 'elR', 'wrR', 1);

      // ---- torso, pelvis
      const tr = fem ? [.115, .135] : [.135, .17], T = W.torso, tcol = T ? T.col : '#888', trw = B.tw;
      parts.push({ d: dep(ph, ps) - .02 * SS, f: () => {
        limb(ctx, pj.hL, pj.hR, .1 * SS * B.hp, .1 * SS * B.hp, W.pelvis, ln);
        limb(ctx, ph, ps, tr[0] * SS * trw, tr[1] * SS * trw, tcol, ln);
        if (T && T.pat && T.pat !== 'solid') { ctx.save(); capPath(ctx, ph.x, ph.y, tr[0] * SS * trw * ph.k, ps.x, ps.y, tr[1] * SS * trw * ps.k); ctx.clip(); const q = tr[1] * SS * trw * ps.k; pattern(ctx, T.pat, T.c2, Math.min(ph.x, ps.x) - q, Math.min(ph.y, ps.y) - q, Math.abs(ph.x - ps.x) + 2 * q, Math.abs(ph.y - ps.y) + 2 * q, .09 * U); ctx.restore(); }
        limb(ctx, pj.shL, pj.shR, .055 * SS, .055 * SS, tcol, ln);
        limb(ctx, ps, nk, .05 * SS, .045 * SS, c.skin, null);
        if (front > .05 && T) deco(ctx, T.deco, T, ph, ps, nk, pj.shL, pj.shR, tr[1] * SS * trw * ps.k, U);
        if (T && T.it && T.it.tatter) rags(ctx, ph, ps, tr[1] * SS * trw * ps.k);
      } });
      if (T && T.deco === 'hood') parts.push({ d: ps.z + .03 * SS, f: () => ball(ctx, lerp(nk, ps, .15), .085 * SS, shade(T.col, -.12), ln) });

      // ---- skirt / robe / tunic
      const ring = (cx, cy, cz, r, n) => { const a = []; for (let i = 0; i < (n || 10); i++) a.push(cam.project(cx + cos(i / (n || 10) * TAU) * r * SS, cy + sin(i / (n || 10) * TAU) * r * SS, cz, {})); return a; };
      const flareK = .03 * Math.abs(sin(this.phase)) * (this.state === 'idle' || this.state === 'pose' ? 0 : 1);
      let cloth = null;
      if (W.skirt) { const s = W.skirt; cloth = { pts: hull(ring(hipC[0], hipC[1], hipC[2] + .05 * SS, .12 * B.hp).concat(ring(hipC[0], hipC[1], hipC[2] - s.len * SS, (s.r + flareK) * B.hp))), col: s.col, pat: s.pat, patCol: s.patCol, hem: ring(hipC[0], hipC[1], hipC[2] - s.len * SS, (s.r + flareK) * B.hp), deco: s.deco, it: s.it }; }
      else if (W.robe) { const r = W.robe, fitK = r.fit || 1; cloth = { pts: hull(ring(shC[0], shC[1], shC[2] - .03 * SS, r.rt * B.sh * fitK).concat(ring(hipC[0], hipC[1], hipC[2] - r.len * SS, r.rb * B.hp * fitK))), col: r.col, pat: r.pat, patCol: r.patCol, hem: ring(hipC[0], hipC[1], hipC[2] - r.len * SS, r.rb * B.hp * fitK), deco: r.deco, it: r.it }; }
      if (cloth) parts.push({ d: Math.min(ph.z, ps.z) - .06 * SS, f: () => {
        poly(ctx, cloth.pts); ctx.fillStyle = cloth.col; ctx.fill();
        if (cloth.pat && cloth.pat !== 'solid') { ctx.save(); poly(ctx, cloth.pts); ctx.clip(); const xs = cloth.pts.map(p => p.x), ys = cloth.pts.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys); pattern(ctx, cloth.pat, cloth.patCol, x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0, .09 * U); ctx.restore(); }
        if (cloth.deco === 'pleat') { ctx.strokeStyle = shade(cloth.col, -.25); ctx.lineWidth = 1; const top = cloth.pts.length; for (let i = 0; i < 6; i++) { const a = lerp(ph, ps, 0), t = i / 5 - .5; ctx.beginPath(); ctx.moveTo(ph.x + t * .2 * U, ph.y + .05 * U); ctx.lineTo(ph.x + t * .55 * U * B.hp, ph.y + (cloth.hem[0].y - ph.y)); ctx.stroke(); } }
        ctx.lineWidth = OL; ctx.strokeStyle = ln; poly(ctx, cloth.pts); ctx.stroke();
        if (cloth.deco === 'trim' && cloth.patCol) { ctx.strokeStyle = cloth.patCol; ctx.lineWidth = Math.max(1.5, .03 * U); poly(ctx, cloth.hem); ctx.stroke(); }
        if (cloth.it && cloth.it.tatter) { ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(0,0,0,.55)'; poly(ctx, cloth.hem); ctx.stroke(); ctx.restore(); }
        if (T && T.it && T.it.label && front > .1) { ctx.fillStyle = T.c2 || '#fff'; ctx.font = `bold ${Math.max(6, .075 * U)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText(T.it.label, lerp(ps, ph, .35).x, lerp(ps, ph, .35).y); }
      } });
      else if (T && T.it && T.it.label && front > .1) parts.push({ d: ph.z - .05 * SS, f: () => { ctx.fillStyle = T.c2 || '#fff'; ctx.font = `bold ${Math.max(6, .075 * U)}px system-ui,sans-serif`; ctx.textAlign = 'center'; const q = lerp(ps, ph, .4); ctx.fillText(T.it.label, q.x, q.y); } });

      // ---- waist beads, chest jewellery, neckwear
      if (J_.waist) parts.push({ d: ph.z - .04 * SS, f: () => { for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, q = cam.project(hipC[0] + cos(a) * .125 * SS * B.hp, hipC[1] + sin(a) * .125 * SS * B.hp, hipC[2] + .07 * SS, {}); ball(ctx, q, .013 * SS, i % 2 ? tone(J_.waist.c1) : J_.waist.c2 || tone(J_.waist.c1), null); } } });
      if (front > -.15) {
        const chest = (it, rows) => { const n = 11, pts = []; for (let i = 0; i < n; i++) { const a = i / (n - 1) * 2 - 1; pts.push(BW(shC, a * .1 * B.sh, .1 * B.tw + .02, -.025 - rows * (1 - a * a))); } return pts; };
        const nkItem = J_.neck, nw = L.neckwear;
        if (nkItem || nw) parts.push({ d: ps.z - .05 * SS, f: () => {
          if (nw) neckwear(ctx, nw, nk, ps, ph, SS, ln, chest, front);
          if (nkItem) neckJewel(ctx, nkItem, nk, SS, chest(nkItem, .1));
        } });
      }

      // ---- held item (right hand)
      if (L.hand) parts.push({ d: pj.wrR.z - .03 * SS, f: () => handItem(ctx, L.hand, pj.wrR, pj.elR, SS, ln, cam, J.wrR) });

      // ---- hair (back layer): afro, curly, strands, wigs, braid
      const hs = HS[(L.hair && L.hair.style) || 'lowcut'] || HS.lowcut, backD = ph.z + (front > 0 ? .1 : -.3) * SS;
      if (hs.back || hs.strands || hs.wig || hs.braid) parts.push({ d: backD, f: () => {
        if (hs.back === 'afro') { ball(ctx, P3(0, -.02, .07), headR * 1.62 * SS, hairCol, ln); ctx.fillStyle = shade(hairCol, .12); for (let i = 0; i < 7; i++) { const a = i * 2.4, q = P3(cos(a) * .1, -.03, .07 + sin(a) * .09); ctx.beginPath(); ctx.arc(q.x, q.y, .012 * SS * q.k, 0, TAU); ctx.fill(); } }
        if (hs.back === 'curly') { const q = P3(0, -.03, .05); ball(ctx, q, headR * 1.38 * SS, hairCol, ln); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, p = P3(cos(a) * .15, -.03, .05 + sin(a) * .13); ball(ctx, p, .045 * SS, hairCol, ln); } ball(ctx, q, headR * 1.3 * SS, hairCol, null); }
        if (hs.wig) { const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; pts.push(P3(cos(a) * .125, sin(a) * .115 - .01, .06)); pts.push(P3(cos(a) * .135, sin(a) * .125 - .02, -hs.wig)); } const hp = hull(pts); poly(ctx, hp); ctx.fillStyle = hairCol; ctx.fill(); ctx.lineWidth = OL; ctx.strokeStyle = ln; ctx.stroke(); }
        if (hs.braid) { const b0 = P3(0, -.07, -.02), b1 = cam.project(J.bkEnd[0], J.bkEnd[1], J.bkEnd[2], {}); limb(ctx, b0, b1, .06 * SS, .035 * SS, hairCol, ln); }
        if (hs.strands) { const n = hs.strands[0], len = hs.strands[1], thin = n > 8 ? .022 : .028; for (let i = 0; i < n; i++) { const th = (i / (n - 1) * 2 - 1) * 1.3, dx = sin(th) * .105, dy = -cos(th) * .095, a = P3(dx, dy, .01), b = P3(dx * 1.12, dy * 1.12, -len); limb(ctx, a, b, thin * SS, thin * .85 * SS, hairCol, ln); if (hs.strands[2]) for (let j = 1; j < 5; j++) { const q = lerp(a, b, j / 5); ball(ctx, q, thin * 1.05 * SS, j % 2 ? shade(hairCol, .14) : hairCol, null); } } }
      } });

      // ---- head
      parts.push({ d: hd.z - .22 * SS, f: () => {
        const r = headR * SS * hd.k, tint = col => col;
        if (hs.bun) ball(ctx, P3(0, -.04, .125), .05 * SS, hairCol, ln);
        if (hs.puffs) { ball(ctx, P3(-.09, -.01, .12), .06 * SS, hairCol, ln); ball(ctx, P3(.09, -.01, .12), .06 * SS, hairCol, ln); }
        if (hs.buns) { ball(ctx, P3(-.06, -.02, .135), .045 * SS, hairCol, ln); ball(ctx, P3(.06, -.02, .135), .045 * SS, hairCol, ln); }
        ball(ctx, hd, headR * SS, c.skin, ln);
        // beard (under the hair, clipped to the face)
        const bd = L.beard; if (bd && bd !== 'none' && front > .15) beard(ctx, bd, hd, P3, headR, SS, hairCol, ln, r);
        // hair cap, with a hole for the face when we look at it
        if (hs.cap) {
          const hc = P3(0, -.018, hs.cap[1]), hr = headR * hs.cap[0] * SS * hc.k;
          ctx.save(); ctx.beginPath(); ctx.arc(hc.x, hc.y, hr, 0, TAU);
          if (front > .02) { const fc = P3(0, .05, fem ? -.035 : -.03), fr = headR * hs.cap[2] * SS * fc.k; ctx.moveTo(fc.x + fr, fc.y); ctx.ellipse(fc.x, fc.y, fr, fr * 1.02, 0, 0, TAU, true); ctx.fillStyle = hairCol; ctx.fill('evenodd'); }
          else { ctx.fillStyle = hairCol; ctx.fill(); }
          ctx.restore();
          if (hs.fade) { ctx.save(); ctx.beginPath(); ctx.arc(hc.x, hc.y, hr, 0, TAU); ctx.clip(); const gr = ctx.createLinearGradient(0, hc.y - hr * .1, 0, hc.y + hr * .9), sk = hex(c.skin); gr.addColorStop(0, `rgba(${sk},0)`); gr.addColorStop(.8, `rgba(${sk},.8)`); ctx.fillStyle = gr; ctx.fillRect(hc.x - hr, hc.y - hr, hr * 2, hr * 2); ctx.restore(); }
          if (hs.flat) limb(ctx, P3(-.06, -.01, .12), P3(.06, -.01, .12), hs.flat * SS + .04 * SS, hs.flat * SS + .04 * SS, hairCol, ln);
          if (hs.rows || hs.waves || hs.twists || hs.knots) hairDetail(ctx, hs, P3, SS, hairCol, hc, hr, front);
          if (L.hair.messy) { ctx.strokeStyle = hairCol; ctx.lineWidth = Math.max(1, r * .07); for (let i = 0; i < 6; i++) { const a = -2.6 + i * .5, p = P3(cos(a) * .115, sin(a) * .1 - .01, .09), q = P3(cos(a) * .15, sin(a) * .13 - .01, .12 + (i % 2) * .02); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
        }
        if (front > .3 && r > 4) face(ctx, L, M, P3, r, hd, SS, c, front, this.t, opt.noSparkle || this.ext.noSparkle);
        if (L.face && front > .2 && r > 5) eyewear(ctx, L.face, P3, hd, SS);
        if (L.head) headwear(ctx, L.head, P3, SS, ln, front, hd, headR);
        if (J_.ear && r > 5) earrings(ctx, J_.ear, P3, SS, front);
        if (L.fresh && !(opt.noSparkle || this.ext.noSparkle) && r > 6) sparkles(ctx, P3, SS, this.t);
      } });

      parts.sort((a, b) => b.d - a.d);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const p of parts) p.f();
      return info;
    }
  }

  /* ---------- clothes ---------- */
  function wardrobe(L, fem) {
    const W = { torso: null, slv: 0, slvCol: null, legs: 0, legCol: null, legDeco: '', skirt: null, robe: null, wide: 1, pelvis: '#444' };
    const o = L.outfit;
    if (o) {
      const c1 = worn(o.c1, o.tatter), c2 = worn(o.c2 || shade(o.c1, -.3), o.tatter), dark = shade(o.c1, -.45);
      W.torso = { col: c1, c2, pat: o.pat, deco: o.deco, it: o }; W.pelvis = c1;
      const fit = o.fit || 1;
      switch (o.k) {
        case 'agbada': W.robe = { len: .8, rt: .2, rb: .36, col: c1, pat: o.pat, patCol: c2, deco: o.deco === 'embroidery' ? '' : o.deco, fit, it: o }; W.slv = 2; W.slvCol = c1; W.wide = 1.5; W.legs = 2; W.legCol = c2; W.pelvis = c2; break;
        case 'longtop': W.robe = { len: .5, rt: .17, rb: .23, col: c1, pat: o.pat, patCol: c2, deco: o.deco === 'trim' ? 'trim' : '', fit, it: o }; W.slv = 2; W.slvCol = c1; W.legs = 2; W.legCol = c1; W.pelvis = c1; break;
        case 'iro': W.skirt = { len: .72, r: .27 * fit, col: c2, pat: o.pat, patCol: c1, deco: 'trim', it: o }; W.slv = 2; W.slvCol = c1; W.wide = 1.25; W.pelvis = c2; W.torso.pat = 'solid'; break;
        case 'dress': W.skirt = { len: .42, r: .3 * fit, col: c1, pat: o.pat, patCol: c2, deco: 'trim', it: o }; W.slv = fem ? .5 : 1; W.slvCol = c1; W.pelvis = c1; break;
        case 'dashiki': W.robe = { len: .22, rt: .16, rb: .2, col: c1, pat: o.pat, patCol: c2, deco: '', fit, it: o }; W.slv = 1; W.slvCol = c1; W.legs = 2; W.legCol = dark; W.pelvis = dark; break;
        case 'coverall': W.slv = 2; W.slvCol = c1; W.legs = 2; W.legCol = c1; break;
        case 'suit': W.slv = 2; W.slvCol = c1; W.legs = 2; W.legCol = '#262833'; W.pelvis = '#262833'; break;
        case 'vest': W.slv = 1; W.slvCol = c2; W.legs = 2; W.legCol = c2; W.pelvis = c2; break;
        case 'apron': W.slv = 1; W.slvCol = '#e8e0d4'; W.legs = 2; W.legCol = '#3a3a45'; W.pelvis = '#3a3a45'; break;
        case 'long': W.slv = 2; W.slvCol = c1; W.legs = 2; W.legCol = '#262833'; W.pelvis = '#262833'; break;
        case 'scrubs': W.slv = 1; W.slvCol = c1; W.legs = 2; W.legCol = c1; break;
        default: W.slv = 1; W.slvCol = c1; W.legs = 2; W.legCol = dark; W.pelvis = dark;
      }
      return W;
    }
    const t = L.top, b = L.bottom;
    if (t) { const c = worn(t.c1, t.tatter); W.torso = { col: c, c2: worn(t.c2 || shade(t.c1, -.3), t.tatter), pat: t.pat, deco: t.deco, it: t }; W.slvCol = c; W.slv = t.k === 'tank' ? 0 : t.k === 'long' ? 2 : (fem && t.k === 'tee' ? .5 : 1); }
    if (b) {
      const c = worn(b.c1, b.tatter); W.pelvis = c;
      if (b.k === 'skirt') W.skirt = { len: .38, r: .26, col: c, pat: b.pat, patCol: b.c2 || shade(b.c1, -.3), deco: b.deco, it: b };
      else { W.legs = b.k === 'short' ? 1 : 2; W.legCol = c; W.legDeco = b.deco; if (b.k === 'short') W.legs = 1; }
    }
    return W;
  }
  const tone = c => c || '#d9b24a';

  function rags(c, A, B, r) {          // worn-out clothes: a few tears
    c.save(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.setLineDash([2, 2]);
    [.3, .62].forEach((t, i) => { const p = { x: A.x + (B.x - A.x) * t + (i ? r * .4 : -r * .35), y: A.y + (B.y - A.y) * t }; c.beginPath(); c.moveTo(p.x - r * .2, p.y - r * .1); c.lineTo(p.x, p.y + r * .12); c.lineTo(p.x + r * .2, p.y - r * .05); c.stroke(); });
    c.restore();
  }
  function deco(c, kind, T, ph, ps, nk, shL, shR, r, U) {
    if (!kind) return;
    const dx = shR.x - shL.x, dy = shR.y - shL.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, at = (t, side) => ({ x: ph.x + (ps.x - ph.x) * t + ux * r * (side || 0), y: ph.y + (ps.y - ph.y) * t + uy * r * (side || 0) });
    const line = (a, b, col, w) => { c.strokeStyle = col; c.lineWidth = Math.max(1, w); c.lineCap = 'butt'; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.lineCap = 'round'; };
    const band = (t, col, w) => line(at(t, -.92), at(t, .92), col, w);
    const dark = shade(T.col, -.35);
    c.save();
    if (kind === 'lapel') { line(nk, at(.45, -.2), dark, 1.4); line(nk, at(.45, .2), dark, 1.4); }
    else if (kind === 'collar') { line(nk, at(.82, -.28), shade(T.col, .5), Math.max(1.5, .02 * U)); line(nk, at(.82, .28), shade(T.col, .5), Math.max(1.5, .02 * U)); }
    else if (kind === 'tie') { line(nk, at(.3), T.c2, Math.max(2, .04 * U)); }
    else if (kind === 'hivis') { band(.4, T.c2, .045 * U); band(.75, T.c2, .045 * U); }
    else if (kind === 'trim') { line(nk, at(0), T.c2, Math.max(1.5, .03 * U)); band(.08, T.c2, .03 * U); }
    else if (kind === 'embroidery') { band(.8, T.c2, .04 * U); c.fillStyle = T.c2; for (let i = -3; i <= 3; i++) { const p = at(.62, i * .26); c.beginPath(); c.arc(p.x, p.y, Math.max(.8, .012 * U), 0, TAU); c.fill(); } }
    else if (kind === 'senator') { line(nk, at(.05), dark, 1.2); const p = at(.75, -.5); c.strokeStyle = dark; c.strokeRect(p.x - .03 * U, p.y - .02 * U, .06 * U, .045 * U); }
    else if (kind === 'puffer') { [.3, .5, .7].forEach(t => band(t, shade(T.col, -.3), 1.2)); }
    else if (kind === 'tape') { line(nk, at(.25, -.4), T.c2, Math.max(1.5, .025 * U)); line(nk, at(.25, .4), T.c2, Math.max(1.5, .025 * U)); }
    else if (kind === 'badge') { const p = at(.72, -.5); c.fillStyle = '#fff'; c.fillRect(p.x - .03 * U, p.y - .02 * U, .06 * U, .04 * U); }
    else if (kind === 'lanyard') { const p = at(.45); line(nk, p, T.c2, Math.max(1, .015 * U)); c.fillStyle = '#fff'; c.fillRect(p.x - .02 * U, p.y, .04 * U, .05 * U); }
    else if (kind === 'vest') { line(nk, at(.1), shade(T.c2, .2), 1.4); }
    c.restore();
  }

  /* ---------- shoes ---------- */
  function shoe(c, s, kn, an, to, S, skin, ln) {
    if (!s) return; const col = worn(s.c1, s.tatter), c2 = s.c2 ? worn(s.c2, s.tatter) : shade(s.c1, -.3), L = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, k: a.k + (b.k - a.k) * t });
    switch (s.k) {
      case 'sandal': limb(c, an, to, .05 * S, .04 * S, skin, ln); limb(c, L(an, to, .25), L(an, to, .55), .052 * S, .046 * S, col, null); break;
      case 'formal': limb(c, an, to, .048 * S, .034 * S, col, ln); break;
      case 'heel': limb(c, an, to, .038 * S, .03 * S, col, ln); break;
      case 'boot': limb(c, an, L(an, kn, .5), .062 * S, .058 * S, col, ln); limb(c, an, to, .056 * S, .046 * S, c2, ln); limb(c, an, to, .05 * S, .04 * S, col, null); break;
      case 'hightop': limb(c, an, L(an, kn, .22), .056 * S, .052 * S, col, ln); limb(c, an, to, .056 * S, .046 * S, c2, ln); limb(c, an, to, .05 * S, .04 * S, col, null); break;
      case 'chunky': limb(c, an, to, .068 * S, .058 * S, c2, ln); limb(c, an, to, .058 * S, .048 * S, col, null); break;
      default: limb(c, an, to, .056 * S, .046 * S, c2, ln); limb(c, an, to, .05 * S, .04 * S, col, null);   // sneaker: sole shows at the edge
    }
    if (s.deco === 'glow') { c.save(); c.globalAlpha = .5; ball(c, to, .03 * S, '#fff', null); c.restore(); }
    if (s.tatter) { c.save(); c.strokeStyle = 'rgba(0,0,0,.45)'; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(an.x, an.y); c.lineTo(to.x, to.y); c.stroke(); c.restore(); }
  }

  /* ---------- jewellery ---------- */
  function wristItem(c, j, el, wr, S, side) {
    const p = { x: wr.x + (el.x - wr.x) * .15, y: wr.y + (el.y - wr.y) * .15, k: wr.k }, col = tone(j.c1);
    if (j.k === 'watch') { c.save(); c.translate(p.x, p.y); const w = .05 * S * p.k; c.fillStyle = j.c2 || '#222'; c.fillRect(-w / 2, -w / 2, w, w); c.strokeStyle = col; c.lineWidth = 1.2; c.strokeRect(-w / 2, -w / 2, w, w); c.restore(); }
    else if (j.k === 'beads') { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; ball(c, { x: p.x + Math.cos(a) * .042 * S * p.k, y: p.y + Math.sin(a) * .016 * S * p.k, k: p.k }, .011 * S, i % 2 ? col : (j.c2 || col), null); } }
    else { c.strokeStyle = col; c.lineWidth = Math.max(1.4, .014 * S * p.k); c.beginPath(); c.ellipse(p.x, p.y, .05 * S * p.k, .02 * S * p.k, 0, 0, TAU); c.stroke(); }
  }
  function neckJewel(c, j, nk, S, pts) {
    const col = tone(j.c1);
    if (j.k === 'choker') { c.strokeStyle = col; c.lineWidth = Math.max(1.5, .02 * S * nk.k); c.beginPath(); c.ellipse(nk.x, nk.y + .01 * S * nk.k, .05 * S * nk.k, .02 * S * nk.k, 0, 0, Math.PI); c.stroke(); return; }
    pts.forEach((p, i) => ball(c, p, j.k === 'pearls' ? .017 * S : .011 * S, j.k === 'pearls' ? '#f4f4f0' : col, j.k === 'pearls' ? 'rgba(0,0,0,.25)' : null));
    if (j.k === 'pendant') { const m = pts[5]; ball(c, { x: m.x, y: m.y + .03 * S * m.k, k: m.k }, .022 * S, j.c2 || col, 'rgba(0,0,0,.35)'); }
  }
  function earrings(c, j, P3, S, front) {
    if (front < -.1) return;
    [-1, 1].forEach(s => {
      const e = P3(s * .112, .0, -.01), col = tone(j.c1), k = e.k;
      if (j.k === 'hoops') { c.strokeStyle = col; c.lineWidth = Math.max(1.2, .01 * S * k); c.beginPath(); c.arc(e.x, e.y + .02 * S * k, .022 * S * k, 0, TAU); c.stroke(); }
      else if (j.k === 'drops') { ball(c, e, .01 * S, col, null); ball(c, { x: e.x, y: e.y + .035 * S * k, k }, .014 * S, j.c2 || col, null); }
      else ball(c, e, .013 * S, col, 'rgba(0,0,0,.25)');
    });
  }

  /* ---------- neckwear, held items, hair details, beards ---------- */
  function neckwear(c, n, nk, ps, ph, S, ln, chest) {
    const c1 = n.c1, c2 = n.c2 || shade(n.c1, -.3);
    if (n.k === 'coral') { chest(n, .1).forEach((p, i) => ball(c, p, .02 * S, i % 3 ? c1 : (c2 || c1), 'rgba(0,0,0,.25)')); chest(n, .06).forEach((p) => ball(c, p, .016 * S, c1, null)); return; }
    const w = .08 * S * nk.k; c.beginPath(); c.ellipse(nk.x, nk.y + .01 * S * nk.k, w, w * .42, 0, 0, TAU); c.fillStyle = c1; c.fill(); c.lineWidth = OL; c.strokeStyle = ln; c.stroke();
    c.strokeStyle = c2; c.lineWidth = Math.max(1, w * .12); c.beginPath(); c.ellipse(nk.x, nk.y + .01 * S * nk.k, w * .85, w * .32, 0, .1, Math.PI - .1); c.stroke();
    const e = { x: nk.x + (ps.x - ph.x) * 0 + w * .35, y: nk.y + (ps.y - ph.y) * -.0 + .17 * S * nk.k, k: nk.k }; limb(c, { x: nk.x + w * .3, y: nk.y + w * .2, k: nk.k }, e, .03 * S, .03 * S, c1, ln);
  }
  function handItem(c, h, wr, el, S, ln, cam, w3) {
    const c1 = h.c1, c2 = h.c2 || shade(c1, -.3);
    if (h.k === 'fan') { const t = { x: wr.x + (wr.x - el.x) * .1, y: wr.y - .13 * S * wr.k, k: wr.k }; limb(c, wr, t, .01 * S, .01 * S, '#7a4b2a', null); ball(c, t, .075 * S, c1, ln); ball(c, t, .045 * S, c2, null); }
    else if (h.k === 'staff') { const t = { x: wr.x, y: wr.y - .22 * S * wr.k, k: wr.k }, b = { x: wr.x, y: wr.y + .85 * S * wr.k, k: wr.k }; limb(c, t, b, .014 * S, .012 * S, c1, ln); ball(c, t, .03 * S, c2, ln); }
    else if (h.k === 'umbrella') { const t = { x: wr.x, y: wr.y - .5 * S * wr.k, k: wr.k }; limb(c, wr, t, .01 * S, .01 * S, '#333', null); c.beginPath(); c.moveTo(t.x - .28 * S * t.k, t.y + .03 * S * t.k); c.quadraticCurveTo(t.x, t.y - .3 * S * t.k, t.x + .28 * S * t.k, t.y + .03 * S * t.k); c.closePath(); c.fillStyle = c1; c.fill(); c.lineWidth = OL; c.strokeStyle = ln; c.stroke(); c.strokeStyle = c2; c.lineWidth = 1.5; c.beginPath(); c.moveTo(t.x, t.y - .15 * S * t.k); c.lineTo(t.x, t.y + .02 * S * t.k); c.stroke(); }
    else if (h.k === 'clutch') { const w = .09 * S * wr.k; c.save(); c.translate(wr.x, wr.y + .03 * S * wr.k); c.fillStyle = c1; c.fillRect(-w / 2, -w * .35, w, w * .7); c.strokeStyle = ln; c.lineWidth = OL; c.strokeRect(-w / 2, -w * .35, w, w * .7); c.save(); c.beginPath(); c.rect(-w / 2, -w * .35, w, w * .7); c.clip(); pattern(c, h.pat, c2, -w / 2, -w * .35, w, w * .7, w * .5); c.restore(); c.restore(); }
  }
  function beard(c, kind, hd, P3, headR, S, col, ln, r) {
    c.save(); c.beginPath(); c.arc(hd.x, hd.y, headR * S * hd.k, 0, TAU); c.clip(); c.fillStyle = col;
    const e = (dx, dy, dz, rx, ry, a) => { const p = P3(dx, dy, dz); c.globalAlpha = a; c.beginPath(); c.ellipse(p.x, p.y, rx * S * p.k, ry * S * p.k, 0, 0, TAU); c.fill(); };
    if (kind === 'stubble') e(0, .06, -.085, .1, .075, .35);
    else if (kind === 'short') e(0, .06, -.085, .105, .085, .95);
    else if (kind === 'full') e(0, .055, -.08, .115, .11, 1);
    else if (kind === 'goatee') { e(0, .1, -.1, .04, .04, 1); e(0, .105, -.02, .045, .014, 1); }
    else if (kind === 'mustache') e(0, .11, -.018, .05, .014, 1);
    else if (kind === 'lineup') { const a = P3(-.09, .06, -.03), b = P3(0, .1, -.115), d = P3(.09, .06, -.03); c.globalAlpha = .9; c.strokeStyle = col; c.lineWidth = Math.max(1, r * .1); c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(b.x, b.y, d.x, d.y); c.stroke(); }
    c.restore();
  }
  function hairDetail(c, hs, P3, S, col, hc, hr, front) {
    c.save(); c.lineCap = 'round';
    if (hs.rows) { c.strokeStyle = shade(col, .38); c.lineWidth = Math.max(1, hr * .05); for (let x = -.05; x <= .051; x += .025) { const a = P3(x, .075, .1), b = P3(x * 1.1, -.09, .075); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); } }
    if (hs.waves) { c.strokeStyle = shade(col, .4); c.lineWidth = Math.max(1, hr * .04); for (let i = 0; i < 4; i++) { const a = P3(-.07, .03 - i * .03, .105), b = P3(0, .045 - i * .03, .115), d = P3(.07, .03 - i * .03, .105); c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(b.x, b.y, d.x, d.y); c.stroke(); } }
    if (hs.twists) for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, x = cos(a) * .065, y = sin(a) * .06; limb(c, P3(x, y - .01, .1), P3(x * 1.5, y * 1.5 - .01, .165), .016 * S, .012 * S, col, null); }
    if (hs.knots) for (let i = 0; i < hs.knots; i++) { const a = i / hs.knots * TAU, x = cos(a) * .07, y = sin(a) * .06; ball(c, P3(x, y - .01, .125), .03 * S, col, 'rgba(0,0,0,.4)'); }
    c.restore();
  }

  /* ---------- face: eyes, brows, mouth, mood, makeup ---------- */
  function face(c, L, M, P3, r, hd, S, cs, front, t, noSparkle) {
    const mood = L.mood || 'neutral', es = [-1, 1].map(s => P3(s * .038, .1, .018)), ek = Math.max(1.2, .013 * S * hd.k), A = a => (a == null ? .7 : a);
    // makeup under the eyes
    if (M.cheeks) { c.globalAlpha = .38 * A(M.cheeks.a); [-1, 1].forEach(s => { const p = P3(s * .062, .095, -.012); ell(c, p, .026 * S * p.k, .018 * S * p.k, M.cheeks.c); }); c.globalAlpha = 1; }
    if (mood === 'shy') { c.globalAlpha = .4; [-1, 1].forEach(s => { const p = P3(s * .062, .095, -.012); ell(c, p, .026 * S * p.k, .018 * S * p.k, '#e0607a'); }); c.globalAlpha = 1; }
    if (M.glow) { const gem = M.glow.id === 'mk_gems'; c.globalAlpha = gem ? 1 : .55 * A(M.glow.a); [-1, 1].forEach(s => { if (gem) [0, 1, 2].forEach(i => { const p = P3(s * (.07 + i * .004), .09 - i * .006, .012 + i * .016); ball(c, p, .007 * S, M.glow.c, null); }); else { const p = P3(s * .07, .092, .006); ell(c, p, .014 * S * p.k, .022 * S * p.k, M.glow.c); } }); c.globalAlpha = 1; }
    if (M.eyes) { c.globalAlpha = .7 * A(M.eyes.a); es.forEach((e, i) => { const p = P3((i ? 1 : -1) * .038, .1, .036); ell(c, p, ek * 2.3, ek * 1.4, M.eyes.c); }); c.globalAlpha = 1; }
    // eyes
    if (mood === 'sleepy') { c.strokeStyle = '#120c0a'; c.lineWidth = Math.max(1, ek * .7); es.forEach(e => { c.beginPath(); c.moveTo(e.x - ek * 1.3, e.y); c.quadraticCurveTo(e.x, e.y + ek * .7, e.x + ek * 1.3, e.y); c.stroke(); }); }
    else if (mood === 'happy' || mood === 'excited') {
      c.fillStyle = '#fff'; es.forEach(e => { c.beginPath(); c.ellipse(e.x, e.y, ek * 1.4, ek * 1.8, 0, 0, TAU); c.fill(); });
      c.fillStyle = '#120c0a'; es.forEach(e => { c.beginPath(); c.arc(e.x, e.y + ek * .1, ek * (mood === 'excited' ? 1.1 : .9), 0, TAU); c.fill(); });
      if (mood === 'excited') { c.fillStyle = '#fff'; es.forEach(e => { c.beginPath(); c.arc(e.x - ek * .3, e.y - ek * .2, ek * .3, 0, TAU); c.fill(); }); }
    } else {
      c.fillStyle = '#fff'; es.forEach(e => { c.beginPath(); c.ellipse(e.x, e.y, ek * 1.4, ek * 1.8, 0, 0, TAU); c.fill(); });
      c.fillStyle = '#120c0a'; es.forEach(e => { c.beginPath(); c.arc(e.x, e.y + ek * .1, ek * .9, 0, TAU); c.fill(); });
    }
    if (M.liner) { c.strokeStyle = M.liner.c; c.lineWidth = Math.max(1, ek * .55 * A(M.liner.a) + .4); [-1, 1].forEach(s => { const a = P3(s * .06, .1, .02), b = P3(s * .085, .09, .036); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }); }
    // eyebrows (only when the mood needs them)
    const tilt = { angry: -1, sad: 1, stressed: 1, shy: .5 }[mood];
    if (tilt) { c.strokeStyle = shade(L.hair ? L.hair.color : '#16100d', -.1); c.lineWidth = Math.max(1, r * .06); [-1, 1].forEach(s => { const a = P3(s * .02, .104, .05 + tilt * .012), b = P3(s * .058, .104, .05 - tilt * .012); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }); }
    // mouth
    if (r > 7) {
      const m0 = P3(-.03, .108, -.03), m1 = P3(0, .112, -.045), m2 = P3(.03, .108, -.03), sm = { neutral: 1, happy: 1.8, excited: 0, calm: 1.1, cool: 1, shy: .3, sleepy: .2, sad: -1.6, angry: -1.1, stressed: 0 }[mood];
      if (mood === 'excited') { c.fillStyle = '#4a1218'; c.beginPath(); c.ellipse(m1.x, m1.y - r * .02, r * .17, r * .13, 0, 0, TAU); c.fill(); c.fillStyle = '#d6455a'; c.beginPath(); c.ellipse(m1.x, m1.y + r * .03, r * .09, r * .05, 0, 0, TAU); c.fill(); }
      else {
        if (M.lips) { c.strokeStyle = M.lips.c; c.lineWidth = Math.max(1.5, r * (.07 + .12 * A(M.lips.a))); c.lineCap = 'round'; c.beginPath(); c.moveTo(m0.x, m0.y); c.quadraticCurveTo(m1.x, m1.y + r * .12 * sm, m2.x, m2.y); c.stroke(); }
        c.strokeStyle = '#2a1510'; c.lineWidth = Math.max(1, r * .08); c.lineCap = 'round'; c.beginPath();
        if (mood === 'stressed') { c.moveTo(m0.x, m0.y); c.lineTo(m0.x + (m1.x - m0.x) * .5, m0.y + r * .05); c.lineTo(m1.x, m0.y - r * .03); c.lineTo(m1.x + (m2.x - m1.x) * .5, m0.y + r * .05); c.lineTo(m2.x, m2.y); }
        else if (mood === 'cool') { c.moveTo(m0.x, m0.y + r * .03); c.quadraticCurveTo(m1.x, m1.y + r * .06, m2.x, m2.y - r * .05); }
        else { c.moveTo(m0.x, m0.y); c.quadraticCurveTo(m1.x, m1.y + r * .12 * sm, m2.x, m2.y); }
        c.stroke();
      }
      if (mood === 'stressed') { const p = P3(.095, .07, .06); c.fillStyle = '#7fc8ff'; c.beginPath(); c.moveTo(p.x, p.y - r * .15); c.quadraticCurveTo(p.x + r * .1, p.y, p.x, p.y + r * .08); c.quadraticCurveTo(p.x - r * .1, p.y, p.x, p.y - r * .15); c.fill(); }
      if (mood === 'sad') { const p = P3(.05, .1, -.002); c.fillStyle = '#7fc8ff'; c.beginPath(); c.ellipse(p.x, p.y + r * .12, r * .05, r * .09, 0, 0, TAU); c.fill(); }
      if (mood === 'sleepy' && !noSparkle) { const p = P3(.12, .06, .14); c.fillStyle = 'rgba(40,50,90,.8)'; c.font = `bold ${Math.max(7, r * .5)}px system-ui,sans-serif`; c.textAlign = 'center'; c.fillText('z', p.x, p.y); }
    }
  }
  function eyewear(c, e, P3, hd, S) {
    const p = [-1, 1].map(s => P3(s * .04, .104, .02)), k = hd.k, rx = .034 * S * k;
    if (e.k === 'shades') { c.fillStyle = e.c1; p.forEach(q => { c.beginPath(); c.ellipse(q.x, q.y, rx, rx * .72, 0, 0, TAU); c.fill(); }); c.strokeStyle = e.c1; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p[0].x + rx, p[0].y); c.lineTo(p[1].x - rx, p[1].y); c.stroke(); if (e.c2) { c.strokeStyle = e.c2; c.lineWidth = 1; p.forEach(q => { c.beginPath(); c.arc(q.x, q.y, rx * .6, 3.6, 4.6); c.stroke(); }); } }
    else { c.strokeStyle = e.c1; c.lineWidth = Math.max(1.2, .006 * S * k * 10); p.forEach(q => { c.beginPath(); c.arc(q.x, q.y, rx * .9, 0, TAU); c.stroke(); }); c.beginPath(); c.moveTo(p[0].x + rx * .9, p[0].y); c.lineTo(p[1].x - rx * .9, p[1].y); c.stroke(); }
  }
  function sparkles(c, P3, S, t) {
    [[-.16, .05, .12], [.17, .04, .03], [.12, .08, .2]].forEach((o, i) => {
      const p = P3(o[0], o[1], o[2]), s = (.012 + .006 * Math.sin(t * 4 + i * 2)) * S * p.k * 2; c.fillStyle = 'rgba(255,255,255,.95)'; c.strokeStyle = 'rgba(255,214,90,.9)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(p.x, p.y - s * 1.6); c.lineTo(p.x + s * .4, p.y - s * .4); c.lineTo(p.x + s * 1.6, p.y); c.lineTo(p.x + s * .4, p.y + s * .4); c.lineTo(p.x, p.y + s * 1.6); c.lineTo(p.x - s * .4, p.y + s * .4); c.lineTo(p.x - s * 1.6, p.y); c.lineTo(p.x - s * .4, p.y - s * .4); c.closePath(); c.fill(); c.stroke();
    });
  }

  /* ---------- headwear ---------- */
  function headwear(c, h, P3, S, ln, front, hd, headR) {
    const c1 = h.c1, c2 = h.c2 || shade(c1, -.3), k = hd.k, R = headR * S, o = (p, rx, ry, col, rot) => { ell(c, p, rx, ry, col, rot); c.lineWidth = OL; c.strokeStyle = ln; c.beginPath(); c.ellipse(p.x, p.y, rx, ry, rot || 0, 0, TAU); c.stroke(); };
    const base = P3(0, -.012, .075);
    switch (h.k) {
      case 'gele': { o(P3(-.02, -.01, .115), R * 1.55 * k, R * 1.02 * k, c1, -.12); o(P3(.07, 0, .17), R * 1.0 * k, R * .8 * k, shade(c1, .12), .35); o(P3(-.07, 0, .19), R * .75 * k, R * .6 * k, shade(c1, -.1), -.5); c.strokeStyle = c2; c.lineWidth = Math.max(1, R * k * .1); [[-.1, .1, .09], [0, .11, .1], [.1, .1, .09]].forEach((q, i) => { const a = P3(q[0], q[1] - .05, q[2]), b = P3(q[0] + .05, q[1] - .1, q[2] + .08); c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(b.x, a.y, b.x, b.y); c.stroke(); }); if (h.pat && h.pat !== 'solid') { c.save(); c.beginPath(); c.ellipse(P3(-.02, -.01, .115).x, P3(-.02, -.01, .115).y, R * 1.55 * k, R * 1.02 * k, -.12, 0, TAU); c.clip(); pattern(c, h.pat, c2, base.x - R * 2, base.y - R * 2.4, R * 4, R * 3, R * k * .55); c.restore(); } break; }
      case 'fila': { o(P3(.03, -.01, .115), R * 1.1 * k, R * .9 * k, c1, .45); o(base, R * 1.2 * k, R * .46 * k, c2, 0); break; }
      case 'redcap': { o(P3(0, -.01, .12), R * 1.08 * k, R * .7 * k, c1); c.fillStyle = c2; c.fillRect(base.x - R * 1.12 * k, base.y - R * .15 * k, R * 2.24 * k, R * .26 * k); break; }
      case 'hausacap': { const a = P3(-.1, -.01, .06), b = P3(.1, -.01, .06), t1 = P3(-.07, -.01, .14), t2 = P3(.07, -.01, .14); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(t1.x, t1.y); c.lineTo(t2.x, t2.y); c.lineTo(b.x, b.y); c.closePath(); c.fillStyle = c1; c.fill(); c.lineWidth = OL; c.strokeStyle = ln; c.stroke(); c.strokeStyle = c2; c.lineWidth = Math.max(1, R * k * .08); c.beginPath(); c.moveTo(a.x, a.y - R * .12 * k); c.lineTo(b.x, b.y - R * .12 * k); c.stroke(); break; }
      case 'beanie': { o(P3(0, -.01, .1), R * 1.12 * k, R * .85 * k, c1); o(P3(0, -.005, .06), R * 1.16 * k, R * .3 * k, c2); ball(c, P3(0, -.01, .2), R * .26, c2, ln); break; }
      case 'cap': { o(P3(0, -.01, .105), R * 1.1 * k, R * .78 * k, c1); if (front > -.2) { const b = P3(0, .1, .075); o(b, R * .95 * k, R * .24 * k, c2); } break; }
      case 'bucket': { o(P3(0, -.01, .095), R * 1.05 * k, R * .7 * k, c1); o(P3(0, 0, .065), R * 1.65 * k, R * .42 * k, shade(c1, -.08)); break; }
      case 'crown': { o(base, R * 1.15 * k, R * .5 * k, c1); for (let i = -2; i <= 2; i++) { const a = P3(i * .045, -.01, .09), b = P3(i * .045, -.01, .17 + (i === 0 ? .04 : 0)); limb(c, a, b, R * .1, R * .08, c2, ln); ball(c, b, R * .13, i % 2 ? c1 : c2, ln); } break; }
      case 'headtie': { o(P3(0, -.005, .085), R * 1.14 * k, R * .5 * k, c1); if (h.pat && h.pat !== 'solid') { c.save(); c.beginPath(); c.ellipse(base.x, P3(0, -.005, .085).y, R * 1.14 * k, R * .5 * k, 0, 0, TAU); c.clip(); pattern(c, h.pat, c2, base.x - R * 1.2, base.y - R, R * 2.4, R * 2, R * k * .5); c.restore(); } o(P3(.09, .0, .15), R * .5 * k, R * .32 * k, c1, .6); o(P3(.12, 0, .12), R * .42 * k, R * .26 * k, c2, -.5); break; }
    }
  }

  /* what a player looks like, in words (screen readers, captions) */
  const SKIN_NAMES = ['very light', 'light', 'light tan', 'tan', 'medium brown', 'brown', 'deep brown', 'dark brown', 'very dark brown', 'deepest brown'];
  const SKIN_HEX = ['#f1d3b3', '#e0b48f', '#c98e63', '#a8683f', '#8a5230', '#6b4226', '#573420', '#43281a', '#33200f', '#241509'];
  function describe(r, names, who) {
    names = names || {}; r = r || {}; const nm = it => (it && (names[it.id] || String(it.id || it.k || '').replace(/^[a-z]+_/, '').replace(/_/g, ' '))) || '';
    const bits = [], skin = SKIN_NAMES[SKIN_HEX.indexOf(r.skin)] || 'medium';
    const hair = r.hair && r.hair.style ? (names['hair:' + r.hair.style] || r.hair.style.replace(/_/g, ' ')) : 'hair';
    const wear = r.outfit ? [nm(r.outfit)] : [nm(r.top), nm(r.bottom)].filter(Boolean);
    if (r.shoes) wear.push(nm(r.shoes));
    const extra = [r.head, r.neckwear, r.hand, r.face].concat(Object.values(r.jewel || {})).map(nm).filter(Boolean);
    bits.push(`${(who || 'Avatar')}: ${r.body ? r.body.replace(/_/g, ' ') : 'average'} build, ${skin} skin tone, ${hair}${r.beard && r.beard !== 'none' ? ', ' + r.beard + ' beard' : ''}`);
    if (wear.length) bits.push('wearing ' + wear.join(', '));
    if (extra.length) bits.push('with ' + extra.join(', '));
    if (r.makeup && Object.keys(r.makeup).length) bits.push('wearing makeup');
    if (r.mood && r.mood !== 'neutral') bits.push('looking ' + r.mood);
    return bits.join('; ') + '.';
  }

  /* ---------- previews / portraits (for cards and the HUD) ---------- */
  function previewCam(cv, full) {
    const w = cv.width, h = cv.height;
    return full
      ? new Camera({ cx: w / 2, cy: h * .5, F: h * 2.4, tx: 0, ty: 0, tz: .9, D: 5, yaw: 0, tilt: 1.3 })
      : new Camera({ cx: w / 2, cy: h * .62, F: h * 1.5, tx: 0, ty: 0, tz: 1.5, D: 2, yaw: 0, tilt: 1.42 });
  }
  const optsOf = o => (o && o.render ? { look: o.render } : o && o.v === 1 ? { look: o } : o || {});
  /* static head-and-shoulders portrait (for the HUD ring). o = colours (old style) or { render } */
  function portrait(gender, size, o) {
    const cv = document.createElement('canvas'); cv.width = cv.height = (size || 96) * (Math.min(2, g.devicePixelRatio || 1));
    const c = cv.getContext('2d'), av = new Avatar(gender, optsOf(o));
    c.fillStyle = '#dbe9ff'; c.fillRect(0, 0, cv.width, cv.height);
    const cam = previewCam(cv, false); av.h = PI / 2; av.pose = IDLE(); av.draw(c, cam, 1, { shadow: false });
    cv.style.width = cv.style.height = '100%'; return cv;
  }
  /* live animated preview inside an existing <canvas>; stops by itself when the canvas leaves the screen.
     o: { render, state, turn, pose, ext, bg, contrast } */
  function preview(cv, gender, o) {
    o = o || {}; const av = new Avatar(gender, o.render ? { look: o.render } : o.look || {}), c = cv.getContext('2d'); let on = true, last = performance.now(), cam = previewCam(cv, true);
    av.h = PI / 2; av.setExt(o.ext || {}); if (o.pose) av.setPose(o.pose); else av.setState(o.state || 'idle');
    const tick = now => {
      if (!on) return;
      if (!cv.isConnected) { on = false; return; }
      if (cv.offsetParent !== null) {
        const dt = (now - last) / 1000; last = now; av.update(dt);
        if (o.turn && !(av.ext && av.ext.reduce)) av.h = PI / 2 + Math.sin(now / 900) * .5;
        c.clearRect(0, 0, cv.width, cv.height);
        if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, cv.width, cv.height); }
        av.draw(c, cam, 1, { shadow: true, contrast: av.ext && av.ext.contrast });
      } else last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return { av, stop() { on = false; }, state(s) { av.setState(s); }, look(r) { av.setLook(r); }, ext(e) { av.setExt(e); }, pose(p) { av.setPose(p); } };
  }

  const _pc = {};
  /* small tile of cloth pattern for the 3D room's materials */
  function patternCanvas(pat, c1, c2) {
    const key = pat + c1 + c2; if (_pc[key]) return _pc[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
    c.fillStyle = c1; c.fillRect(0, 0, 64, 64); pattern(c, pat, c2 || shade(c1, -.3), 0, 0, 64, 64, 14); return (_pc[key] = cv);
  }

  g.ACPOSE = { idle: IDLE, target: targetPose, DANCES };
  g.ACAvatar = { Camera, Avatar, portrait, preview, DANCES, LOOK, BODIES, WALKS, IDLES, POSES, MOODS, HS, defaultRender, describe, SKIN_HEX, wardrobe, patternCanvas, shade, worn };
})(window);
