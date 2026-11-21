/* gl3d: a small WebGL2 engine made for Drive Race (no outside libraries).
   Meshes are built from simple shapes with per-vertex colour, lit by a sun plus sky/ground ambient light, with distance fog and optional textures.
   Static scenery is merged into a few big meshes, so a whole track costs only a handful of draw calls on a phone. */
const GL3D = (() => {
  'use strict';
  const hex = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, f) => [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)];

  /* ---------- 4x4 matrices (column-major) ---------- */
  const M = {
    id() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    mul(a, b, o) { o = o || new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
    lookAt(e, t, up) {
      let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2]; let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
      let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    /* translate, then rotate about y, x and z, then scale */
    trs(tx, ty, tz, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
      const cy = Math.cos(ry), sy_ = Math.sin(ry), cx = Math.cos(rx), sx_ = Math.sin(rx), cz = Math.cos(rz), sz_ = Math.sin(rz);
      // R = Ry * Rx * Rz
      const r00 = cy * cz + sy_ * sx_ * sz_, r01 = -cy * sz_ + sy_ * sx_ * cz, r02 = sy_ * cx;
      const r10 = cx * sz_, r11 = cx * cz, r12 = -sx_;
      const r20 = -sy_ * cz + cy * sx_ * sz_, r21 = sy_ * sz_ + cy * sx_ * cz, r22 = cy * cx;
      return new Float32Array([r00 * sx, r10 * sx, r20 * sx, 0, r01 * sy, r11 * sy, r21 * sy, 0, r02 * sz, r12 * sz, r22 * sz, 0, tx, ty, tz, 1]);
    },
    point(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; },
    dir(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; }
  };

  /* ---------- building meshes out of simple shapes ---------- */
  class Builder {
    constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; this.alp = []; }
    get count() { return this.pos.length / 3; }
    /* add raw triangles, moved by matrix m (optional) */
    raw(pos, nor, col, uv, idx, m) {
      const base = this.count;
      for (let i = 0; i < pos.length; i += 3) {
        let p = [pos[i], pos[i + 1], pos[i + 2]], n = [nor[i], nor[i + 1], nor[i + 2]];
        if (m) { p = M.point(m, p[0], p[1], p[2]); n = M.dir(m, n[0], n[1], n[2]); const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l]; }
        this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.alp.push(1);
      }
      for (let i = 0; i < col.length; i++) this.col.push(col[i]);
      for (let i = 0; i < uv.length; i++) this.uv.push(uv[i]);
      for (let i = 0; i < idx.length; i++) this.idx.push(idx[i] + base);
      return this;
    }
    /* a box, centred on the origin. colour can be one colour or { top, side, bottom } */
    box(w, h, d, c, m, uvs = 1) {
      const x = w / 2, y = h / 2, z = d / 2, P = [], N = [], C = [], U = [], I = [];
      const top = c.top || c, side = c.side || c, bot = c.bottom || c;
      const face = (ax, nx, ny, nz, col, uw, uh) => { const b = P.length / 3; for (let k = 0; k < 4; k++) { P.push(ax[k][0], ax[k][1], ax[k][2]); N.push(nx, ny, nz); C.push(col[0], col[1], col[2]); } U.push(0, 0, uw * uvs, 0, uw * uvs, uh * uvs, 0, uh * uvs); I.push(b, b + 1, b + 2, b, b + 2, b + 3); };
      face([[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]], 0, 1, 0, top, w / 1000, d / 1000);
      face([[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], 0, -1, 0, bot, w / 1000, d / 1000);
      face([[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], 0, 0, 1, side, w / 1000, h / 1000);
      face([[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]], 0, 0, -1, side, w / 1000, h / 1000);
      face([[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]], 1, 0, 0, side, d / 1000, h / 1000);
      face([[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]], -1, 0, 0, side, d / 1000, h / 1000);
      return this.raw(P, N, C, U, I, m);
    }
    /* a cylinder or cone along y, centred on the origin */
    cyl(rt, rb, h, seg, c, m, caps = true, uvs = 1) {
      const P = [], N = [], C = [], U = [], I = [], y = h / 2, slope = (rb - rt) / h, ctop = c.top || c, cside = c.side || c;
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a), nl = Math.hypot(1, slope), nx = cs / nl, nz = sn / nl, ny = slope / nl;
        P.push(cs * rt, y, sn * rt, cs * rb, -y, sn * rb); N.push(nx, ny, nz, nx, ny, nz); C.push(...cside, ...cside); U.push(i / seg * uvs * 4, 0, i / seg * uvs * 4, uvs);
        if (i < seg) { const b = i * 2; I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      this.raw(P, N, C, U, I, m);
      if (caps) for (const [yy, r, ny, col] of [[y, rt, 1, ctop], [-y, rb, -1, c.bottom || cside]]) { if (r <= 0) continue; const Pc = [0, yy, 0], Nc = [0, ny, 0], Cc = [...col], Uc = [.5, .5], Ic = []; for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; Pc.push(Math.cos(a) * r, yy, Math.sin(a) * r); Nc.push(0, ny, 0); Cc.push(...col); Uc.push(.5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5); if (i < seg) Ic.push(0, ny > 0 ? i + 2 : i + 1, ny > 0 ? i + 1 : i + 2); } this.raw(Pc, Nc, Cc, Uc, Ic, m); }
      return this;
    }
    sphere(r, ws, hs, c, m) {
      const P = [], N = [], C = [], U = [], I = [];
      for (let j = 0; j <= hs; j++) for (let i = 0; i <= ws; i++) { const th = j / hs * Math.PI, ph = i / ws * Math.PI * 2, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph); P.push(x * r, y * r, z * r); N.push(x, y, z); C.push(...c); U.push(i / ws, j / hs); }
      for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) { const a = j * (ws + 1) + i, b = a + ws + 1; I.push(a, a + 1, b, a + 1, b + 1, b); }
      return this.raw(P, N, C, U, I, m);
    }
    /* a ribbon along a path: left and right edges per point, for roads, walls, kerbs */
    ribbon(L, R, c, uvLen = 1, uvW = 1, up = [0, 1, 0]) {
      const P = [], N = [], C = [], U = [], I = []; let d = 0;
      for (let i = 0; i < L.length; i++) {
        if (i) d += Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1], L[i][2] - L[i - 1][2]);
        const col = typeof c === 'function' ? c(i) : c;
        P.push(...L[i], ...R[i]); N.push(...up, ...up); C.push(...col, ...col); U.push(0, d / 1000 * uvLen, uvW, d / 1000 * uvLen);
        if (i < L.length - 1) { const b = i * 2; I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      return this.raw(P, N, C, U, I, null);
    }
    /* a vertical wall strip between a bottom path and a top path */
    wall(A, B, c, uvLen = 1, uvH = 1) {
      const P = [], N = [], C = [], U = [], I = []; let d = 0;
      for (let i = 0; i < A.length; i++) {
        if (i) d += Math.hypot(A[i][0] - A[i - 1][0], A[i][2] - A[i - 1][2]);
        const col = typeof c === 'function' ? c(i) : c; let nx = 0, nz = 0;
        if (i < A.length - 1) { const dx = A[i + 1][0] - A[i][0], dz = A[i + 1][2] - A[i][2], l = Math.hypot(dx, dz) || 1; nx = dz / l; nz = -dx / l; }
        else if (this._ln) { nx = this._ln[0]; nz = this._ln[1]; }
        this._ln = [nx, nz];
        P.push(...A[i], ...B[i]); N.push(nx, 0, nz, nx, 0, nz); C.push(...col, ...col); U.push(d / 1000 * uvLen, 0, d / 1000 * uvLen, uvH);
        if (i < A.length - 1) { const b = i * 2; I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      return this.raw(P, N, C, U, I, null);
    }
  }

  /* ---------- the renderer ---------- */
  const VS = `#version 300 es
  layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol; layout(location=3) in vec2 aUV; layout(location=4) in float aA;
  uniform mat4 uVP, uM; uniform vec3 uCam; uniform vec2 uUV; out vec3 vCol; out vec3 vNor; out vec2 vUV; out float vDist; out float vH; out float vA; out vec3 vW;
  void main(){ vec4 w = uM * vec4(aPos,1.0); gl_Position = uVP * w; vNor = normalize(mat3(uM) * aNor); vCol = aCol; vUV = aUV + uUV; vDist = length(w.xyz - uCam); vH = w.y; vA = aA; vW = w.xyz; }`;
  const FS = `#version 300 es
  precision highp float; in vec3 vCol; in vec3 vNor; in vec2 vUV; in float vDist; in float vH; in float vA; in vec3 vW;
  uniform sampler2D uTex; uniform float uUseTex, uUnlit, uAlpha, uTexMix; uniform vec4 uTint; uniform vec3 uSun, uSunCol, uSky, uGround, uFog; uniform float uFogNear, uFogFar, uTime; uniform vec3 uCam;
  out vec4 o;
  void main(){
    vec3 base = vCol * uTint.rgb; float a = uAlpha * uTint.a * vA;
    if (uUseTex > 0.5) { vec4 t = texture(uTex, vUV); base *= mix(vec3(1.0), t.rgb, uTexMix); a *= t.a; }
    vec3 n = normalize(vNor); float d = max(dot(n, uSun), 0.0);
    vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
    vec3 lit = base * (amb + uSunCol * d);
    vec3 c = mix(lit, base, uUnlit);
    float dist = length(vW - uCam); float f = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0); f = f * f * (3.0 - 2.0 * f);
    o = vec4(mix(c, uFog, f), a);
  }`;

  class Mesh {
    constructor(r, b, dynamic) {
      const gl = r.gl; this.r = r; this.gl = gl; this.vao = gl.createVertexArray(); this.vb = gl.createBuffer(); this.ib = gl.createBuffer(); this.dynamic = !!dynamic; this.n = 0;
      gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
      const S = 48; [[0, 3, 0], [1, 3, 12], [2, 3, 24], [3, 2, 36], [4, 1, 44]].forEach(([i, n, o]) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, S, o); });
      gl.bindVertexArray(null); if (b) this.set(b);
    }
    set(b) {
      const gl = this.gl, n = b.count, v = new Float32Array(n * 12);
      for (let i = 0; i < n; i++) { v.set(b.pos.slice(i * 3, i * 3 + 3), i * 12); v.set(b.nor.slice(i * 3, i * 3 + 3), i * 12 + 3); v.set(b.col.slice(i * 3, i * 3 + 3), i * 12 + 6); v.set(b.uv.slice(i * 2, i * 2 + 2), i * 12 + 9); v[i * 12 + 11] = b.alp[i] == null ? 1 : b.alp[i]; }
      gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.vb); gl.bufferData(gl.ARRAY_BUFFER, v, this.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(b.idx), this.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); this.n = b.idx.length; gl.bindVertexArray(null);
    }
    draw(model, o = {}) { this.r.draw(this, model, o); }
    dispose() { const gl = this.gl; gl.deleteBuffer(this.vb); gl.deleteBuffer(this.ib); gl.deleteVertexArray(this.vao); }
  }

  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!gl) throw new Error('WebGL2 is not available');
      this.gl = gl; this.canvas = canvas; this.W = canvas.width; this.H = canvas.height; this.time = 0;
      const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
      const p = this.prog = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      this.u = {}; for (const n of ['uVP', 'uM', 'uCam', 'uTex', 'uUseTex', 'uUnlit', 'uAlpha', 'uTexMix', 'uTint', 'uSun', 'uSunCol', 'uSky', 'uGround', 'uFog', 'uFogNear', 'uFogFar', 'uTime', 'uUV']) this.u[n] = gl.getUniformLocation(p, n);
      gl.useProgram(p); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.env = { sun: [.4, .8, .35], sunCol: [.62, .58, .5], sky: [.62, .72, .9], ground: [.5, .45, .38], fog: [.78, .88, .98], fogNear: 30000, fogFar: 140000 };
      this.white = this.texture(Object.assign(document.createElement('canvas'), { width: 2, height: 2 }));
      this.VP = M.id(); this.cam = [0, 0, 0];
    }
    resize(w, h) { this.canvas.width = w; this.canvas.height = h; this.W = w; this.H = h; this.gl.viewport(0, 0, w, h); }
    texture(canvas, o = {}) {
      const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      if (canvas.width === 2 && canvas.height === 2) { const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 2, 2); }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      const pot = (canvas.width & (canvas.width - 1)) === 0 && (canvas.height & (canvas.height - 1)) === 0;
      if (pot) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pot ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const wrap = o.clamp || !pot ? gl.CLAMP_TO_EDGE : gl.REPEAT; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      const an = gl.getExtension('EXT_texture_filter_anisotropic'); if (an && pot) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return t;
    }
    mesh(b, dynamic) { return new Mesh(this, b, dynamic); }
    /* camera: { eye, target, fov (radians), near, far } */
    frame(cam, env) {
      const gl = this.gl, e = this.env = Object.assign(this.env, env || {});
      const proj = M.persp(cam.fov, this.W / this.H, cam.near || 100, cam.far || 160000), view = M.lookAt(cam.eye, cam.target, cam.up || [0, 1, 0]);
      this.VP = M.mul(proj, view); this.cam = cam.eye; this.view = view; this.proj = proj;
      gl.viewport(0, 0, this.W, this.H); gl.clearColor(e.fog[0], e.fog[1], e.fog[2], 1); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.prog); const u = this.u;
      gl.uniformMatrix4fv(u.uVP, false, this.VP); gl.uniform3fv(u.uCam, cam.eye); gl.uniform3fv(u.uSun, e.sun); gl.uniform3fv(u.uSunCol, e.sunCol); gl.uniform3fv(u.uSky, e.sky); gl.uniform3fv(u.uGround, e.ground); gl.uniform3fv(u.uFog, e.fog);
      gl.uniform1f(u.uFogNear, e.fogNear); gl.uniform1f(u.uFogFar, e.fogFar); gl.uniform1f(u.uTime, this.time); gl.uniform1i(u.uTex, 0);
    }
    /* o: { tex, texMix, tint:[r,g,b,a], unlit (0..1), alpha, blend, noDepthWrite, noCull } */
    draw(mesh, model, o = {}) {
      const gl = this.gl, u = this.u;
      gl.bindTexture(gl.TEXTURE_2D, o.tex || this.white); gl.uniform1f(u.uUseTex, o.tex ? 1 : 0); gl.uniform1f(u.uTexMix, o.texMix == null ? 1 : o.texMix);
      gl.uniform4fv(u.uTint, o.tint || [1, 1, 1, 1]); gl.uniform1f(u.uUnlit, o.unlit || 0); gl.uniform1f(u.uAlpha, o.alpha == null ? 1 : o.alpha);
      gl.uniformMatrix4fv(u.uM, false, model || M.id()); gl.uniform2fv(u.uUV, o.uv || [0, 0]);
      if (o.blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, o.add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
      gl.depthMask(!o.noDepthWrite); if (o.noCull) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
      gl.depthMask(true); gl.enable(gl.CULL_FACE);
    }
    /* project a world point to screen pixels (for name tags); returns null if behind the camera */
    project(p) {
      const m = this.VP, x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      if (w <= 0) return null; return [(x / w * .5 + .5) * this.W, (1 - (y / w * .5 + .5)) * this.H, w];
    }
  }
  return { Renderer, Builder, Mesh, M, hex, mix, shade };
})();
if (typeof module === 'object' && module.exports) module.exports = GL3D;
