// Full vanilla Three.js procedural furniture and TV engine converted from Turbopack bundle

const GOLD_MAT = { m: 0.85, r: 0.28 };
const CHROME_MAT = { m: 0.8, r: 0.25 };
const GOLD_HEX = '#c9a227';
const SOFT_WHITE = '#f6f3ec';

// Geometries cache for optimal memory & reuse
const geoCache = new Map();
function pGeo(key, fn) {
  let g = geoCache.get(key);
  if (!g) { g = fn(); geoCache.set(key, g); }
  return g;
}

// Material cache for MeshStandardMaterial & emissives
const matCache = new Map();
function getMat(c, s = {}) {
  const col = typeof c === 'string' ? c : ('#' + (c || 0).toString(16).padStart(6, '0'));
  const key = `${col}|${s.r ?? 0.7}|${s.m ?? 0}|${s.e ?? ''}|${s.ei ?? 0}|${s.o ?? 1}|${+!!s.dbl}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c),
      roughness: s.r ?? 0.7,
      metalness: s.m ?? 0
    });
    if (s.e) {
      m.emissive = new THREE.Color(s.e);
      m.emissiveIntensity = s.ei ?? 1;
    }
    if (s.o !== undefined && s.o < 1) {
      m.transparent = true;
      m.opacity = s.o;
      m.depthWrite = false;
    }
    if (s.dbl) m.side = THREE.DoubleSide;
    matCache.set(key, m);
  }
  return m;
}

// Glow plane material cache
const glowCache = new Map();
let glowTex = null;
function getGlowMat(c, opacity = 0.5) {
  const key = `${c}|${opacity}`;
  let m = glowCache.get(key);
  if (!m) {
    if (!glowTex && typeof document !== 'undefined') {
      try {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        const g2 = cv.getContext('2d');
        if (g2) {
          const grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
          grad.addColorStop(0, 'rgba(255,255,255,1)');
          grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          g2.fillStyle = grad;
          g2.fillRect(0, 0, 64, 64);
          glowTex = new THREE.CanvasTexture(cv);
        }
      } catch (e) {}
    }
    m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(c),
      map: glowTex,
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending || 2
    });
    glowCache.set(key, m);
  }
  return m;
}

// Basic Mesh Helpers
function mBox(w, h, d, mat, pos = [0, 0, 0], rot = null, par = null, sh = true) {
  const geo = pGeo(`box_${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = !!sh;
  m.receiveShadow = true;
  if (par) par.add(m);
  return m;
}

function mCyl(rTop, rBot, h, mat, pos = [0, 0, 0], rot = null, par = null, seg = 18, sh = true) {
  const geo = pGeo(`cyl_${rTop}_${rBot}_${h}_${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, h, seg));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = !!sh;
  if (par) par.add(m);
  return m;
}

function mSph(r, mat, pos = [0, 0, 0], sc = null, par = null, seg = 16, sh = true) {
  const geo = pGeo(`sph_${r}_${seg}`, () => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
  if (sc) {
    if (typeof sc === 'number') m.scale.setScalar(sc);
    else m.scale.set(sc[0] || 1, sc[1] || 1, sc[2] || 1);
  }
  m.castShadow = !!sh;
  if (par) par.add(m);
  return m;
}

function mTorus(r, tube, mat, pos = [0, 0, 0], rot = null, par = null, arc = Math.PI * 2) {
  const geo = pGeo(`tor_${r}_${tube}_${arc}`, () => new THREE.TorusGeometry(r, tube, 6, 24, arc));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  if (par) par.add(m);
  return m;
}

function mPlane(w, h, mat, pos = [0, 0, 0], rot = null, par = null) {
  const geo = pGeo(`plane_${w}_${h}`, () => new THREE.PlaneGeometry(w, h));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  if (par) par.add(m);
  return m;
}

console.log("Core helpers defined successfully");
