/* ---------- AvatarView: a standalone 3D avatar, for screens that aren't the house ----------
   room3d.js already builds a properly-lit 3D humanoid (boxes/cylinders, same technique as the map's buildings) —
   it's just always been part of the one big house scene. This file does NOT touch room3d.js: it creates a second,
   tiny object with ROOM3D as its prototype (Object.create), so every avatar-building method (buildAvatar,
   addAccessories3, applyMood, animate, setLook, setGender, setPose, setExt, emote...) is reused exactly as-is,
   working off this object's own scene/camera/parts instead of the house's. Zero risk to the working room feature —
   nothing here can be called by it, and nothing in it is changed.
   Returns the same { av, stop, state, look, ext, pose } shape ACAvatar.preview() does, so callers (styleapp.js)
   don't need to know which renderer they got. If WebGL isn't available, mount() returns null and the caller should
   fall back to ACAvatar.preview() as before. */
window.AvatarView = {
  /* true the moment we can tell this device could show the 3D model at all — doesn't require Three.js to be loaded
     yet, just WebGL support and room3d.js (which knows how to fetch Three.js) being present. Check this first and
     mount the flat 2D preview immediately regardless, so there's no blank gap while the library loads; then await
     ready() and swap in mount() once it resolves. */
  canUpgrade() { try { const c = document.createElement('canvas'); return !!(window.ROOM3D && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } },
  /* resolves true once window.THREE exists (loading it via room3d.js's own loader if this is the very first 3D
     view of the session — e.g. Style opened before the player ever visited their house), false if it can't load. */
  ready() {
    if (window.THREE) return Promise.resolve(true);
    if (!window.ROOM3D || !window.ROOM3D.load) return Promise.resolve(false);
    return window.ROOM3D.load().then(() => true).catch(() => false);
  },
  supported() { return this.canUpgrade() && !!window.THREE; },   // kept for anything that only wants a synchronous yes/no once THREE is already loaded

  mount(cv, gender, o) {
    if (!this.supported()) return null;
    o = o || {};
    let R; try { R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return null; }
    const AV = Object.create(window.ROOM3D);                    // borrows all of ROOM3D's avatar methods; none of its room state
    AV.on = true;                                                // own property, shadowing the real house's on/off — setLook/setGender gate on `this.on` and must see this one, not the house's
    AV.R = R; R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    AV.scene = new THREE.Scene();
    AV.cam = new THREE.PerspectiveCamera(28, (cv.clientWidth || 1) / (cv.clientHeight || 1), .1, 30);
    AV.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, .9));
    const sun = new THREE.DirectionalLight(0xfff0d0, .6); sun.position.set(2, 4, 3); AV.scene.add(sun);
    AV.pose = {}; AV.tp = {}; AV.ph = 0; AV.tt = 0; AV.spin = 0; AV.dn = 0;
    AV.buildAvatar(gender, o.render || null);
    AV.avatar.position.set(0, 0, 0);   // buildAvatar defaults a brand-new avatar to the house's spawn point (-1,0,1.2); this view's orbit camera circles the origin, so recenter here or the model swings toward/away from camera as it turns — looking like it's scaling, with legs clipping out of frame
    AV.setExt(o.ext || {});
    if (o.pose) AV.setPose(o.pose);

    let az = 0, pol = 1.4, dist = 4.4, ty = .86, dragging = false, lastX = 0, on = true, last = performance.now(), raf, walking = false;
    const resize = () => {
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = w * dpr; cv.height = h * dpr;
      R.setSize(w, h, false); AV.cam.aspect = w / h; AV.cam.updateProjectionMatrix();
    };
    resize(); window.addEventListener('resize', resize);
    cv.style.touchAction = 'none';
    const down = e => { dragging = true; lastX = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (x) { } if (o.onTouch) o.onTouch(); };
    const drag = e => { if (!dragging) return; az -= (e.clientX - lastX) * .012; lastX = e.clientX; };
    const up = () => dragging = false;
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', drag);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    const tick = now => {
      if (!on) return; raf = requestAnimationFrame(tick);
      if (!cv.isConnected) { on = false; return; }
      const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
      if (!dragging && o.turn !== false && !(AV.ext && AV.ext.reduce)) az += dt * .35;   // auto-turn, like the preview this replaces; drag always overrides
      const sp = Math.sin(pol);
      AV.cam.position.set(dist * sp * Math.sin(az), ty + dist * Math.cos(pol), dist * sp * Math.cos(az));   // far enough back that the whole 1.65-tall model (hats included) sits inside the card from every angle
      AV.cam.lookAt(0, ty, 0);
      AV.animate(now / 1000, dt, walking);
      R.render(AV.scene, AV.cam);
    };
    raf = requestAnimationFrame(tick);

    return {
      av: AV,
      stop() {
        on = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize);
        cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', drag);
        cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up);
        try { R.dispose(); } catch (e) { }
      },
      state(s) { walking = s === 'walk'; if (s === 'dance' || s === 'wave') AV.emote(s); else if (!walking) AV.emote(null); },
      look(r) { AV.setLook(r); },
      ext(e) { AV.setExt(e); },
      pose(p) { AV.setPose(p); }
    };
  }
};
