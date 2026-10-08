/* ================= AllConnect avatars =================
   Procedural low-poly 3D characters (male + female) drawn on a 2D canvas. No libraries.
   - Camera:  tiny perspective camera (yaw / tilt / distance) shared by the map and the room.
   - Avatar:  skeleton + animation states: idle, walk, run, dance (4 moves), wave.
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
  const hex = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const shade = (h, f) => { const c = hex(h).map(v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255)); return `rgb(${c[0]},${c[1]},${c[2]})`; };

  const LOOK = {
    male: { top: '#d9b24a', bottom: '#262833', shoe: '#f2f2f2', hair: '#16100d', skin: '#6b4226' },
    female: { top: '#2f9e63', bottom: '#f4efe6', shoe: '#7a4b2a', hair: '#16100d', skin: '#6b4226' }
  };

  /* ---------- poses ---------- */
  const IDLE = () => ({
    la1: .04, lb1: .1, la2: .25, lb2: .1, ra1: .04, rb1: .1, ra2: .25, rb2: .1,
    ll: 0, llb: .03, llk: 0, rl: 0, rlb: .03, rlk: 0, lean: 0, twist: 0, sx: 0, sy: 0, head: 0, lift: 0
  });
  const KEYS = Object.keys(IDLE());
  const DANCES = 4;

  /* pose library shared by the map characters (this file) and the 3D room character (room3d.js) */
  function targetPose(P, s, f, tm, dance) {
    Object.assign(P, IDLE());
    const w = sin(f), w2 = sin(2 * f), av = { t: tm, dance: dance };
    if (s === 'idle') {
      const b = sin(av.t * 1.7);
      P.la1 = .04 + .03 * b; P.ra1 = .04 + .03 * b; P.la2 = .25 + .05 * b; P.ra2 = .25 + .05 * b;
      P.lean = .012 * b; P.head = .05 * sin(av.t * .6); P.lb1 = .1 + .02 * b; P.rb1 = .1 + .02 * b;
    } else if (s === 'walk' || s === 'run') {
      const run = s === 'run', A = run ? .95 : .52, K = run ? 1.5 : .95, arm = run ? 1.0 : .8 * A / .52 * .55;
      P.ll = A * w; P.rl = -A * w;
      P.llk = .1 + K * Math.max(0, cos(f)); P.rlk = .1 + K * Math.max(0, -cos(f));
      P.la1 = -arm * w; P.ra1 = arm * w;
      const bend = run ? 1.2 : .32; P.la2 = P.la1 + bend; P.ra2 = P.ra1 + bend;
      P.lb1 = P.rb1 = .12; P.lean = run ? .2 : .04; P.twist = (run ? .3 : .16) * w; P.sx = .015 * w;
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
  }

  const dirv = (side, a, b) => [side * sin(b), sin(a) * cos(b), -cos(a) * cos(b)];
  const RATE = { idle: 0, wave: 1, walk: 0, run: 0 };

  /* ---------- drawing primitives ---------- */
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
    if (outline) { capPath(c, A.x, A.y, r1 + 1, B.x, B.y, r2 + 1); c.fillStyle = outline; c.fill(); }
    capPath(c, A.x, A.y, r1, B.x, B.y, r2); c.fillStyle = col; c.fill();
  }
  function ball(c, A, r, col, outline) {
    const rr = r * A.k;
    if (outline) { c.beginPath(); c.arc(A.x, A.y, rr + 1, 0, TAU); c.fillStyle = outline; c.fill(); }
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

  /* ---------- avatar ---------- */
  class Avatar {
    constructor(gender, o) {
      o = o || {};
      this.g = gender === 'female' ? 'female' : 'male';
      const L = LOOK[this.g];
      this.col = { top: o.top || L.top, bottom: o.bottom || L.bottom, shoe: o.shoe || L.shoe, hair: o.hair || L.hair, skin: o.skin || L.skin };
      this.cs = {
        skin: this.col.skin, skinD: shade(this.col.skin, -.14), top: this.col.top, topD: shade(this.col.top, -.14),
        bot: this.col.bottom, botD: shade(this.col.bottom, -.14), shoe: this.col.shoe, hair: this.col.hair, line: 'rgba(15,10,8,.55)'
      };
      this.x = 0; this.y = 0; this.z = 0; this.h = PI / 2; this.spin = 0;
      this.state = 'idle'; this.dance = 0; this.speed = 0; this.phase = Math.random() * TAU; this.t = Math.random() * 10;
      this.pose = IDLE(); this.tp = IDLE();
    }
    setState(s) { if (s !== this.state) { this.state = s; if (s === 'wave') this.phase = 0; } }
    nextDance() { this.dance = (this.dance + 1) % DANCES; this.state = 'dance'; }
    update(dt) {
      dt = Math.min(dt, .1);
      let rate = RATE[this.state] || 0;
      if (this.state === 'walk') rate = clamp(this.speed / 1.5, .55, 1.5);
      else if (this.state === 'run') rate = clamp(this.speed / 2.6, 1.2, 2.3);
      else if (this.state === 'dance') rate = [1.15, 1.15, 1.0, 1.4][this.dance % DANCES];
      this.phase += dt * TAU * rate; this.t += dt;
      if (this.state === 'dance' && this.dance % DANCES === 2) this.spin += dt * 5.2;
      else this.spin += (Math.round(this.spin / TAU) * TAU - this.spin) * Math.min(1, dt * 7);
      targetPose(this.tp, this.state, this.phase, this.t, this.dance);
      const k = 1 - Math.exp(-dt * 14);
      for (const key of KEYS) this.pose[key] += (this.tp[key] - this.pose[key]) * k;
    }
    /* joints in world space; S = world units per metre */
    joints(S) {
      const P = this.pose, fem = this.g === 'female';
      const sw = fem ? .165 : .205, hw = fem ? .115 : .1, TH = .45, SH = .45, UA = .3, FA = .27, TO = .5, AN = .07;
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
      out.toL = add(out.anL, [0, 0, 0]); out.toL = add(hL, toe(L.an, L.a2)); out.toR = add(hR, toe(R.an, R.a2));
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
    /* Draw into ctx using camera cam. Returns { x, y, top, h } screen info (feet position, head-top y, pixel height). */
    draw(ctx, cam, S, opt) {
      S = S || 1; opt = opt || {};
      const feet = cam.project(this.x, this.y, this.z, {}), pxH = 1.8 * S * feet.k;
      const info = { x: feet.x, y: feet.y, top: feet.y - pxH, h: pxH, z: feet.z };
      if (feet.z < 1) return info;
      if (opt.shadow !== false) {   /* ground shadow */
        const pts = [], rr = .3 * S * (1 - clamp(this.pose.lift * 2, 0, .3));
        for (let i = 0; i < 12; i++) pts.push(cam.project(this.x + cos(i / 12 * TAU) * rr, this.y + sin(i / 12 * TAU) * rr, this.z, {}));
        ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fill();
      }
      const J = this.joints(S), c = this.cs, fem = this.g === 'female', pj = {};
      for (const k in J) if (k !== 'fwd' && k !== 'rgt') pj[k] = cam.project(J[k][0], J[k][1], J[k][2], {});
      if (pxH < 11) {   /* far away: simple doll */
        ctx.lineCap = 'round'; ctx.strokeStyle = c.top; ctx.lineWidth = Math.max(2, .3 * S * feet.k);
        ctx.beginPath(); ctx.moveTo(pj.H.x, pj.H.y); ctx.lineTo(pj.ch.x, pj.ch.y); ctx.stroke();
        ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(pj.head.x, pj.head.y, Math.max(1.4, .12 * S * feet.k), 0, TAU); ctx.fill();
        return info;
      }
      const ln = c.line, parts = [], dep = (...ps) => ps.reduce((a, p) => a + p.z, 0) / ps.length;
      const rad = .045;
      // legs (+ shoes)
      const leg = (hp, kn, an, to, side) => {
        const pc = fem ? c.skin : c.bot, pd = fem ? c.skinD : c.botD, col = side < 0 ? pd : pc;
        parts.push({ d: dep(pj[hp], pj[kn], pj[an]) + .01 * S, f: () => {
          limb(ctx, pj[hp], pj[kn], .075 * S, .062 * S, col, ln); limb(ctx, pj[kn], pj[an], .062 * S, .048 * S, fem ? (side < 0 ? c.skinD : c.skin) : col, ln);
          limb(ctx, pj[an], pj[to], .052 * S, .042 * S, c.shoe, ln);
        } });
      };
      leg('hL', 'knL', 'anL', 'toL', -1); leg('hR', 'knR', 'anR', 'toR', 1);
      // arms
      const arm = (sh, el, wr, side) => {
        const sleeve = fem ? (side < 0 ? c.skinD : c.skin) : (side < 0 ? c.topD : c.top), fore = side < 0 ? c.skinD : c.skin;
        parts.push({ d: dep(pj[sh], pj[el], pj[wr]), f: () => {
          limb(ctx, pj[sh], pj[el], .058 * S, .05 * S, sleeve, ln);
          limb(ctx, pj[el], pj[wr], .048 * S, .04 * S, fore, ln);
          ball(ctx, pj[wr], rad * S, fore, ln);
          if (fem) ball(ctx, pj[sh], .062 * S, side < 0 ? c.topD : c.top, ln);
        } });
      };
      arm('shL', 'elL', 'wrL', -1); arm('shR', 'elR', 'wrR', 1);
      // torso (+ pelvis, skirt)
      const hipC = [(J.hL[0] + J.hR[0]) / 2, (J.hL[1] + J.hR[1]) / 2, (J.hL[2] + J.hR[2]) / 2], ph = cam.project(hipC[0], hipC[1], hipC[2], {});
      const shC = [(J.shL[0] + J.shR[0]) / 2, (J.shL[1] + J.shR[1]) / 2, (J.shL[2] + J.shR[2]) / 2], ps = cam.project(shC[0], shC[1], shC[2], {});
      const tr = fem ? [.115, .135] : [.135, .17];
      parts.push({ d: dep(ph, ps) - .02 * S, f: () => {
        limb(ctx, pj.hL, pj.hR, .1 * S, .1 * S, c.bot, ln);                       // pelvis / trousers
        limb(ctx, ph, ps, tr[0] * S, tr[1] * S, c.top, ln);                          // top
        limb(ctx, pj.shL, pj.shR, .055 * S, .055 * S, c.top, ln);                    // shoulders
        const nk = cam.project(shC[0] + (J.head[0] - shC[0]) * .4, shC[1] + (J.head[1] - shC[1]) * .4, shC[2] + (J.head[2] - shC[2]) * .4, {});
        limb(ctx, ps, nk, .05 * S, .045 * S, c.skin, null);                          // neck
      } });
      if (fem) {   /* A-line skirt */
        const flare = .26 + .03 * Math.abs(sin(this.phase)) * (this.state === 'idle' ? 0 : 1), r1 = .12, ring = (cz, r) => {
          const a = []; for (let i = 0; i < 10; i++) a.push(cam.project(hipC[0] + cos(i / 10 * TAU) * r * S, hipC[1] + sin(i / 10 * TAU) * r * S, cz, {})); return a;
        };
        const sk = hull(ring(hipC[2] + .05 * S, r1).concat(ring(hipC[2] - .38 * S, flare)));
        parts.push({ d: ph.z - .035 * S, f: () => {
          ctx.beginPath(); sk.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
          ctx.fillStyle = c.bot; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = ln; ctx.stroke();
        } });
      }
      // head + hair
      const headR = fem ? .108 : .115, hd = pj.head, toCam = [cam.px - J.head[0], cam.px * 0 + cam.py - J.head[1], cam.pz - J.head[2]];
      const tl = Math.hypot(toCam[0], toCam[1], toCam[2]) || 1, front = (J.fwd[0] * toCam[0] + J.fwd[1] * toCam[1]) / tl;
      const rgt = J.rgt;
      const P3 = (dx, dy, dz) => cam.project(J.head[0] + (rgt[0] * dx + J.fwd[0] * dy) * S, J.head[1] + (rgt[1] * dx + J.fwd[1] * dy) * S, J.head[2] + dz * S, {});
      if (fem) {   // braids + bun
        const bkE = [J.bk[0] + (J.bkEnd[0] - J.bk[0]) * 0, 0, 0];
        const b0 = P3(0, -.07, -.02), b1 = cam.project(J.bkEnd[0], J.bkEnd[1], J.bkEnd[2], {});
        parts.push({ d: ph.z + (front > 0 ? .1 : -.1) * S, f: () => { limb(ctx, b0, b1, .06 * S, .035 * S, c.hair, ln); } });
      }
      parts.push({ d: hd.z - .22 * S, f: () => {
        const r = headR * S * hd.k;
        if (fem) { const bun = P3(0, -.04, .125); ball(ctx, bun, .05 * S, c.hair, ln); }
        ball(ctx, hd, headR * S, c.skin, ln);
        const hc = P3(0, -.018, .03), hr = headR * (fem ? 1.12 : 1.05) * S * hc.k;
        ctx.save();
        ctx.beginPath(); ctx.arc(hc.x, hc.y, hr, 0, TAU);
        if (front > .02) {
          const fc = P3(0, .05, fem ? -.035 : -.03), fr = headR * (fem ? .78 : .74) * S * fc.k;
          ctx.moveTo(fc.x + fr, fc.y); ctx.ellipse(fc.x, fc.y, fr, fr * 1.02, 0, 0, TAU, true);
          ctx.fillStyle = c.hair; ctx.fill('evenodd');
        } else { ctx.fillStyle = c.hair; ctx.fill(); }
        ctx.restore();
        if (front > .3 && r > 4) {   // eyes + smile
          const es = [-1, 1].map(s => P3(s * .038, .1, .018)), ek = Math.max(1.2, .013 * S * hd.k);
          ctx.fillStyle = '#fff'; es.forEach(e => { ctx.beginPath(); ctx.ellipse(e.x, e.y, ek * 1.4, ek * 1.8, 0, 0, TAU); ctx.fill(); });
          ctx.fillStyle = '#120c0a'; es.forEach(e => { ctx.beginPath(); ctx.arc(e.x, e.y + ek * .1, ek * .9, 0, TAU); ctx.fill(); });
          if (r > 7) { const m0 = P3(-.03, .108, -.03), m1 = P3(0, .112, -.045), m2 = P3(.03, .108, -.03);
            ctx.strokeStyle = '#2a1510'; ctx.lineWidth = Math.max(1, r * .08); ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.quadraticCurveTo(m1.x, m1.y + r * .12, m2.x, m2.y); ctx.stroke(); }
        }
      } });
      parts.sort((a, b) => b.d - a.d);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const p of parts) p.f();
      return info;
    }
  }

  /* ---------- previews / portraits (for cards and the HUD) ---------- */
  function previewCam(cv, full) {
    const w = cv.width, h = cv.height;
    return full
      ? new Camera({ cx: w / 2, cy: h * .5, F: h * 3.1, tx: 0, ty: 0, tz: .92, D: 5, yaw: 0, tilt: 1.3 })
      : new Camera({ cx: w / 2, cy: h * .62, F: h * 1.5, tx: 0, ty: 0, tz: 1.5, D: 2, yaw: 0, tilt: 1.42 });
  }
  /* static head-and-shoulders portrait (for the HUD ring) */
  function portrait(gender, size, o) {
    const cv = document.createElement('canvas'); cv.width = cv.height = (size || 96) * (Math.min(2, g.devicePixelRatio || 1));
    const c = cv.getContext('2d'), av = new Avatar(gender, o);
    c.fillStyle = '#dbe9ff'; c.fillRect(0, 0, cv.width, cv.height);
    const cam = previewCam(cv, false); av.h = PI / 2; av.pose = IDLE(); av.draw(c, cam, 1, { shadow: false });
    cv.style.width = cv.style.height = '100%'; return cv;
  }
  /* live animated preview inside an existing <canvas>; stops by itself when the canvas leaves the screen */
  function preview(cv, gender, o) {
    o = o || {}; const av = new Avatar(gender, o.look), c = cv.getContext('2d'); let on = true, last = performance.now(), cam = previewCam(cv, true);
    av.h = PI / 2; av.setState(o.state || 'idle');
    const tick = now => {
      if (!on) return;
      if (!cv.isConnected) { on = false; return; }
      if (cv.offsetParent !== null) {
        const dt = (now - last) / 1000; last = now; av.update(dt);
        if (o.turn) av.h = PI / 2 + Math.sin(now / 900) * .5;
        c.clearRect(0, 0, cv.width, cv.height); av.draw(c, cam, 1, { shadow: true });
      } else last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return { av, stop() { on = false; }, state(s) { av.setState(s); } };
  }

  g.ACPOSE = { idle: IDLE, target: targetPose, DANCES };
  g.ACAvatar = { Camera, Avatar, portrait, preview, DANCES, LOOK };
})(window);
