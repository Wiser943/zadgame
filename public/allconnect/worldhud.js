/* HUD + input + enter/exit plumbing for the 3D street world (engine: world3d.js). */
(function (g) {
  'use strict';
  const X = g.WORLD; if (!X) return;
  const $ = id => document.getElementById(id), clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const toast = m => { if (typeof g.toast === 'function') g.toast(m); };
  const coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;
  let mounted = false, nav0 = null;

  function mount() {
    if (mounted) return; const app = $('app'); if (!app) return; mounted = true;
    const w = document.createElement('div'); w.id = 'world';
    w.innerHTML =
      '<canvas id="wcv"></canvas>' +
      '<div id="wLoad"><i></i><span>Stepping outside…</span></div>' +
      '<div id="wMob"><button id="wmHome">🏠</button><button id="wmPhone">📱</button><span id="wmClk"></span></div>' +
      '<div id="wChips"><button id="wConvoy" class="wchip">🚗 <span>Convoy</span></button><button id="wRace" class="wchip">🏁 Race on the long roads</button></div>' +
      '<div id="wRc"><div class="wcol"><button id="wLoc" title="Recentre camera">◎</button><button id="wCam" title="Camera (C)">🚗</button><button id="wSnd" title="Sound">🔊</button></div><canvas id="wMini" width="220" height="220"></canvas></div>' +
      '<button id="wGoal"></button>' +
      '<div id="wBot"><button id="wRadio">📻 Radio</button><div id="wSpeed"><b id="wKmh">0</b><small>km/h</small><em id="wDist"></em></div></div>' +
      '<button id="wUse"><kbd>E</kbd><span></span></button>' +
      '<div id="wHelp">WASD move · Shift run · drag to look · click to walk · E use · G dance · V wave</div>' +
      '<div id="wJoy"><i></i></div>' +
      '<div id="wCar"><div id="wSteer"><b>◀</b><i></i><b>▶</b></div>' +
      '<div id="wRight"><div class="wtop"><button id="wHorn">HORN</button><button id="wOut">🚪 Get out</button></div><div class="wped"><button id="wBrake">BRAKE<small>HOLD · R</small></button><button id="wGas">GAS</button></div></div></div>';
    app.appendChild(w);
    const cv = $('wcv');
    // camera: drag to look; a short tap/click walks to that spot
    let dn = null;
    cv.addEventListener('pointerdown', e => { dn = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; cv.setPointerCapture(e.pointerId); X.audio(); });
    cv.addEventListener('pointermove', e => { if (!dn) return; const dx = e.clientX - dn.x, dy = e.clientY - dn.y; dn.moved += Math.abs(dx) + Math.abs(dy); dn.x = e.clientX; dn.y = e.clientY; if (dn.moved < 4) return;
      if (X.me.mode === 'car') X.orbit = clamp(X.orbit + dx * .006, -1.6, 1.6); else { X.camYaw += dx * .0055; X.camPitch = clamp(X.camPitch + dy * .004, .08, 1.15); } });
    cv.addEventListener('pointerup', e => { if (dn && dn.moved < 6 && performance.now() - dn.t < 400 && X.me.mode === 'foot') walkToPointer(e); dn = null; });
    cv.addEventListener('wheel', e => { e.preventDefault(); X.zoom = clamp(X.zoom * (e.deltaY > 0 ? 1.1 : .91), 3, 16); }, { passive: false });
    // buttons
    $('wLoc').onclick = () => { X.camYaw = X.me.h; X.orbit = 0; X.camPitch = .34; X.zoom = 6.6; };
    $('wCam').onclick = () => { if (X.me.mode === 'car') { X.cam = X.cam === 'chase' ? 'hood' : 'chase'; } else { X.camYaw = X.me.h; } hud.mode(); };
    $('wSnd').onclick = () => { X.sfx = !X.sfx; $('wSnd').textContent = X.sfx ? '🔊' : '🔇'; if (X.sfx) X.audio(); };
    $('wRadio').onclick = () => { try { g.nav('phone'); g.SONGIFY.open(); } catch (e) { toast('Radio is not available right now.'); } };
    $('wRace').onclick = () => { if (typeof g.openLagosRun === 'function') g.openLagosRun(); };
    $('wConvoy').onclick = () => { const d = nearbyDrivers(); toast(d.length ? '🚗 Drivers nearby: ' + d.slice(0, 4).map(o => o.name + ' (' + Math.round(o.dist) + ' m)').join(', ') : '🚗 No other drivers nearby. Friends who are out driving will show up here.'); };
    $('wGoal').onclick = () => X.setGoal(null);
    $('wUse').onclick = () => hud.use();
    $('wOut').onclick = () => X.exitCar(); $('wHorn').onclick = () => X.horn();
    $('wmHome').onclick = () => { X.exit(true); g.nav('home'); }; $('wmPhone').onclick = () => { if (g.PHONEUI) g.PHONEUI.open(); };
    hold($('wGas'), v => X.pedal.gas = v); hold($('wBrake'), v => X.pedal.brake = v);
    // steering pad: drag the thumb left / right
    const pad = $('wSteer'), th = pad.querySelector('i');
    const pset = e => { const r = pad.getBoundingClientRect(), v = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 24), -1, 1); X.pedal.steer = v; th.style.transform = 'translateX(' + (v * (r.width / 2 - 34)) + 'px)'; };
    pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); pset(e); }); pad.addEventListener('pointermove', e => { if (pad.hasPointerCapture(e.pointerId)) pset(e); });
    const prel = () => { X.pedal.steer = 0; th.style.transform = ''; }; pad.addEventListener('pointerup', prel); pad.addEventListener('pointercancel', prel);
    // touch stick for walking
    const joy = $('wJoy'), jt = joy.querySelector('i');
    const jset = e => { const r = joy.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), m = r.width / 2 - 14, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / m); X.joy.x = dx / l * k; X.joy.y = dy / l * k; jt.style.transform = 'translate(' + (dx / l * k * m) + 'px,' + (dy / l * k * m) + 'px)'; };
    joy.addEventListener('pointerdown', e => { joy.setPointerCapture(e.pointerId); jset(e); X.audio(); }); joy.addEventListener('pointermove', e => { if (joy.hasPointerCapture(e.pointerId)) jset(e); });
    const jrel = () => { X.joy.x = X.joy.y = 0; jt.style.transform = ''; }; joy.addEventListener('pointerup', jrel); joy.addEventListener('pointercancel', jrel);
    if (coarse) w.classList.add('wtouch');
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', e => X.keys.delete(e.code));
    window.addEventListener('blur', () => { X.keys.clear(); X.joy.x = X.joy.y = 0; X.pedal.gas = X.pedal.brake = X.pedal.steer = 0; });
    window.addEventListener('resize', () => X.on && X.resize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) X.keys.clear(); });
  }
  function hold(el, set) { el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); set(1); el.classList.add('dn'); X.audio(); }); const up = () => { set(0); el.classList.remove('dn'); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up); }
  function onKey(e) {
    if (!X.on || X.paused || (typeof S !== 'undefined' && S.page === 'phone')) return; const t = document.activeElement; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    X.keys.add(e.code); X.audio(); if (e.repeat) return;
    if (e.code === 'KeyE') hud.use(); else if (e.code === 'KeyH') X.horn(); else if (e.code === 'KeyC') $('wCam').click();
    else if (e.code === 'KeyG' && X.me.mode === 'foot') { X.me.st = X.me.st === 'dance' ? 'idle' : 'dance'; } else if (e.code === 'KeyV' && X.me.mode === 'foot') { X.me.st = 'wave'; X.me.emoteUntil = performance.now() + 2600; }
  }
  function walkToPointer(e) {
    const cv = $('wcv'), r = cv.getBoundingClientRect(), ndc = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), rc = new THREE.Raycaster(); rc.setFromCamera(ndc, X.cam3);
    const p = new THREE.Vector3(); if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
    if (!X.landAt(p.x, p.z) || Math.hypot(p.x - X.me.x, p.z - X.me.z) > 400) return; X.goalPt = [p.x, p.z]; X.me.st = 'walk';
  }
  function nearbyDrivers() { const out = []; X.others.forEach(o => { if (o.st === 'drive') { const d = Math.hypot(o.x - X.me.x, o.z - X.me.z); if (d < 320) out.push({ name: o.name, dist: d }); } }); return out.sort((a, b) => a.dist - b.dist); }

  /* ------------------------------------------------ prompts ("press E ...") ------------------------------------------------ */
  function homeInfo() { const m = (X.marks || []).find(q => q.pin[5] === 'home'); return m ? { x: (m.x0 + m.x1) / 2, z: m.z1 + 3 } : null; }
  function calcPrompt() {
    const me = X.me, d2 = (x, z) => Math.hypot(me.x - x, me.z - z); let pr = null;
    if (me.mode === 'foot') {
      if (X.car && d2(X.car.x, X.car.z) < 6.5) pr = { txt: 'Drive ' + X.carName(), fn: () => X.enterCar() };
      if (!pr) { const h = homeInfo(); if (h && d2(h.x, h.z) < 13) pr = { txt: 'Go inside', fn: () => hud.goHome() }; }
      if (!pr) for (const l of X.labels) { if (l.pin[5] === 'home') continue; const m = (X.marks || []).find(q => q.pin === l.pin), px = m ? (m.x0 + m.x1) / 2 : l.x, pz = m ? m.z1 + 3 : l.z; if (d2(px, pz) < (m ? 12 : 16)) { pr = { txt: String(l.pin[0]).replace(' · Coming soon', ''), fn: () => openPin(l.pin) }; break; } }
      if (!pr) for (const o of X.others.values()) if (Math.hypot(o.x - me.x, o.z - me.z) < 4.5) { pr = { txt: 'Wave at ' + o.name, fn: () => { me.st = 'wave'; me.emoteUntil = performance.now() + 2600; } }; break; }
    }
    X.prompt = pr;
  }
  function openPin(p) { if (/Coming soon/.test(p[0])) { toast('🚧 ' + String(p[0]).replace(' · Coming soon', '') + ' is coming soon'); return; } try { MAP3D.openByName(p[0]); } catch (e) { toast('Could not open ' + p[0]); } }

  /* ------------------------------------------------ minimap ------------------------------------------------ */
  function mini() {
    const c = $('wMini'), x = c.getContext('2d'), N = c.width, me = X.me, hd = me.mode === 'car' ? me.h : X.camYaw, a = -Math.PI / 2 - hd, view = 100, sc = (N / 2) / view;
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#1d5a85'; x.fillRect(0, 0, N, N);
    x.save(); x.translate(N / 2, N / 2); x.rotate(a); x.scale(sc, sc); x.translate(-me.x, -me.z); x.drawImage(X.groundCv, 0, 0, 1000, 1000);
    x.fillStyle = '#22c55e'; X.others.forEach(o => { x.beginPath(); x.arc(o.x, o.z, 4.5, 0, 6.3); x.fill(); });
    x.fillStyle = '#ffffff'; X.traffic.forEach(t => { if (Math.abs(t.x - me.x) < view * 1.3 && Math.abs(t.z - me.z) < view * 1.3) { x.beginPath(); x.arc(t.x, t.z, 3, 0, 6.3); x.fill(); } });
    if (X.car && me.mode === 'foot') { x.fillStyle = '#ffc83d'; x.fillRect(X.car.x - 3, X.car.z - 3, 6, 6); }
    x.restore();
    if (X.goal) { const dx = X.goal.x - me.x, dz = X.goal.z - me.z, rx = dx * Math.cos(a) - dz * Math.sin(a), rz = dx * Math.sin(a) + dz * Math.cos(a); let px = rx * sc, pz = rz * sc; const l = Math.hypot(px, pz), mx = N / 2 - 16; if (l > mx) { px *= mx / l; pz *= mx / l; } x.fillStyle = '#22c55e'; x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.arc(N / 2 + px, N / 2 + pz, 9, 0, 6.3); x.fill(); x.stroke(); }
    x.save(); x.translate(N / 2, N / 2); x.fillStyle = '#fff'; x.strokeStyle = '#0b6b3a'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, -14); x.lineTo(10, 11); x.lineTo(0, 6); x.lineTo(-10, 11); x.closePath(); x.fill(); x.stroke(); x.restore();
  }

  /* ------------------------------------------------ per-frame HUD ------------------------------------------------ */
  let acc = 0, accM = 0;
  const hud = X.hud = {
    mode() {
      const app = $('app'), car = X.me.mode === 'car'; app.classList.toggle('driving', car); const w = $('world'); if (!w) return;
      w.classList.toggle('drv', car); $('wCam').textContent = car ? (X.cam === 'hood' ? '⏱' : '🚗') : '🎯'; $('wCam').title = car ? 'Camera (C)' : 'Recentre';
    },
    use() { if (X.prompt && X.prompt.fn) X.prompt.fn(); },
    goHome() { X.exit(true); if (typeof g.nav === 'function') g.nav('home'); },
    frame(dt) {
      acc += dt; accM += dt; const me = X.me;
      if (accM > .06) { accM = 0; if (X.on) mini(); }
      X.send();
      if (acc < .2) return; acc = 0; calcPrompt();
      const kmh = Math.round(Math.abs(me.v) * 3.6); $('wKmh').textContent = kmh; $('wDist').textContent = X.district(me.x, me.z);
      const u = $('wUse'), p = X.prompt; u.classList.toggle('on', !!p && !X.paused); if (p) u.querySelector('span').textContent = p.txt;
      const gl = $('wGoal'); if (X.goal) { gl.style.display = 'flex'; gl.textContent = '📍 ' + X.goal.name + ' · ' + Math.round(Math.hypot(X.goal.x - me.x, X.goal.z - me.z)) + ' m  ✕'; } else gl.style.display = 'none';
      const n = nearbyDrivers().length; $('wConvoy').querySelector('span').textContent = n ? 'Convoy · ' + n : 'Convoy';
      $('wmClk').textContent = typeof g.hm === 'function' || typeof hm === 'function' ? (function () { try { const t = hm(S.min); return t.h + ':' + t.mm + ' ' + t.ap; } catch (e) { return ''; } })() : '';
      $('wHelp').style.opacity = (performance.now() - (X.t0 || 0) < 14000) ? 1 : 0;
    }
  };

  /* ------------------------------------------------ enter / exit ------------------------------------------------ */
  async function fetchVehicle() {
    try {
      if (typeof TR === 'undefined') return null; await TR.load(); const list = (TR.D && TR.D.vehicles) || [];
      return list.find(q => q.kind === 'car') || list.find(q => q.kind === 'van') || list.find(q => q.kind === 'bus') || list.find(q => q.kind === 'motorcycle') || null;
    } catch (e) { return null; }
  }
  X.enter = async function (opts) {
    opts = opts || {}; if (X.on) return true; if (X.loading) return false;
    try { const c = document.createElement('canvas'); if (!(c.getContext('webgl') || c.getContext('experimental-webgl'))) throw new Error('no webgl'); } catch (e) { toast('3D is not supported on this device.'); return false; }
    X.loading = true; mount(); const app = $('app'), load = $('wLoad'); load.style.display = 'flex'; $('world').style.display = 'block'; app.classList.add('inworld');
    try {
      await M3D.libs(); MAP3D.init();
      if (MAP3D.hud && MAP3D.hud.city && MAP3D.hud.city !== 'lagos') { app.classList.remove('inworld'); $('world').style.display = 'none'; X.loading = false; toast('The 3D street is only built for Lagos so far. Opening the map.'); return false; }
      if (!X.built) { await new Promise(r => setTimeout(r, 30)); await X.build($('wcv')); X.resize(); }
      // where do we start?
      const me = X.me, hp = (MAP3D.pins || []).find(p => p[5] === 'home'), hm0 = homeInfo();
      let sx, sz;
      if (opts.from === 'map' && MAP3D.me && Number.isFinite(MAP3D.me.x)) { sx = MAP3D.me.x; sz = MAP3D.me.y; }
      else if (opts.from === 'home' || !X.last) { sx = hm0 ? hm0.x : hp ? hp[2] : 470; sz = hm0 ? hm0.z + 2 : hp ? hp[3] + 34 : 290; }
      else { sx = X.last.x; sz = X.last.z; }
      const f = X.findFree(sx, sz, .7); me.x = f[0]; me.z = f[1]; me.h = Math.PI / 2; me.v = 0; me.mode = 'foot'; me.st = 'idle'; X.camYaw = Math.PI / 2; X.orbit = 0;
      if (me.person) { me.person.holder.visible = true; }
      fetchVehicle().then(v => X.setMyVehicle(v));
      X.joinNet();
    } catch (e) { console.warn('[world]', e); app.classList.remove('inworld'); $('world').style.display = 'none'; load.style.display = 'none'; X.loading = false; toast('The 3D street could not load. Opening the map instead.'); return false; }
    X.on = true; X.loading = false; X.paused = false; X.t0 = performance.now(); load.style.display = 'none';
    if (typeof S !== 'undefined') S.page = 'world';
    try { MAP3D.hide(); } catch (e) { } try { ROOM3D.page('map'); } catch (e) { }
    X.resize(); X.applyTime(); hud.mode(); X.audio(); cancelAnimationFrame(X.raf); X.raf = requestAnimationFrame(X.frame); X.send(true);
    if (window.DK) DK.paint(); return true;
  };
  X.joinNet = function () {
    const s = typeof NET !== 'undefined' ? NET.sock : null; if (!s || X.bound === s) return; X.bound = s; s.on('players', l => { if (X.on) X.onPlayers(l); }); s.on('pos', p => { if (X.on) X.onPos(p); }); s.on('connect', () => { if (X.on) X.send(true); });
  };
  X.exit = function (silent) {
    if (!X.on) return; X.on = false; cancelAnimationFrame(X.raf); X.keys.clear(); X.joy.x = X.joy.y = 0; X.pedal.gas = X.pedal.brake = X.pedal.steer = 0;
    const me = X.me; if (me.mode === 'car') X.exitCar(); X.last = { x: me.x, z: me.z }; me.st = 'idle'; me.v = 0; X.send(true);
    try { if (MAP3D.me) { MAP3D.me.x = me.x; MAP3D.me.y = me.z; MAP3D.me.h = me.h; } } catch (e) { }
    const app = $('app'); app.classList.remove('inworld', 'driving'); const w = $('world'); if (w) w.style.display = 'none'; stopAudio();
    if (typeof S !== 'undefined' && S.page === 'world') S.page = 'home';
  };
  function stopAudio() { if (X.A) { try { X.A.g.gain.value = 0; } catch (e) { } } }
  X.nearHome = () => { const h = homeInfo(); return !!h && Math.hypot(X.me.x - h.x, X.me.z - h.z) < 14; };
  X.goHome = () => hud.goHome();
  X.work = async function () {
    const me = X.me; if (me.mode === 'car') { toast('Get out of the car first.'); return; }
    try { if (g.JOBS && !g.JOBS.data && g.JOBS.load) await g.JOBS.load(); } catch (e) { }
    const mine = g.JOBS && g.JOBS.data && g.JOBS.data.mine; if (!mine) { toast('Pick a job first. Opening Jobs…'); try { g.nav('phone'); g.JOBS.open(); } catch (e) { } return; }
    me.job = String(mine.title || mine.name || 'Working').slice(0, 24); me.workUntil = performance.now() + 4200; me.st = 'work'; try { g.JOBS.work(); } catch (e) { } X.send(true);
  };

  // wrap nav(): the street stays up under the phone; any other page tears it down
  function hookNav() {
    if (nav0 || typeof g.nav !== 'function') return; nav0 = g.nav;
    g.nav = function (w) {
      if (X.on) {
        if (w === 'phone') { X.paused = true; X.keys.clear(); const r = nav0.apply(this, arguments); hud.mode(); return r; }
        if (typeof S !== 'undefined' && S.page === 'phone' && w === 'home') { const r = nav0.apply(this, arguments); S.page = 'world'; X.paused = false; try { MAP3D.hide(); ROOM3D.page('map'); } catch (e) { } if (window.DK) DK.paint(); return r; }
        X.exit(true);
      }
      return nav0.apply(this, arguments);
    };
  }
  // the old "Step outside" door button and the Map screen's walk now open the street
  function hookDoor() {
    const D = g.DOOR; if (!D || D.__w) return; D.__w = true; const press0 = D.press;
    D.press = async function () {
      if (!(D.btn && D.btn.dataset.mode === 'out')) return press0.apply(this, arguments);
      const ok = await X.enter({ from: 'home' }); if (!ok) return press0.apply(this, arguments);
    };
  }
  function boot() { hookNav(); hookDoor(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);
})(window);
