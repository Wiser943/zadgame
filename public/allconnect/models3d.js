/* AllConnect 3D models (glTF/GLB).
   M3D loads the .glb files in /allconnect/models/, caches them, and hands out ready-to-place clones that are
   auto-sized (so it doesn't matter what scale the artist exported at) and stand on y = 0.

   It also REPLACES the old blocky box-and-cylinder character in the 3D room (and in AvatarView, which inherits
   from ROOM3D) with real animated characters. The old procedural character is still built first and stays as the
   fallback: if the models or the loader script can't be fetched, nothing changes for the player.

   Needs room3d.js (for ROOM3D.load(), which brings in Three.js r128). Load this file after room3d.js + avatarview.js. */
(function () {
  const BASE = '/allconnect/models/';
  const LIB = [
    ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', 'https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js'],
    ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js', 'https://unpkg.com/three@0.128.0/examples/js/utils/SkeletonUtils.js']
  ];
  const FILES = {
    // characters (all share the same animation set: Idle, Walk, Run, Wave, Interact, ...)
    woman: 'characters/woman.glb', worker: 'characters/worker.glb', suit: 'characters/suit.glb',
    casual: 'men/casual_character.glb', businessman: 'men/business_man.glb', hoodie: 'men/hoodie_character.glb', beach: 'men/beach_character.glb',
    farmer: 'men/farmer.glb', adventurer: 'men/adventurer.glb', king: 'men/king.glb', punk: 'men/punk.glb', swat: 'men/swat.glb', astronaut: 'men/astronaut.glb', menworker: 'men/worker.glb',
    // things
    sportscar: 'vehicles/sports_car.glb', motorcycle: 'vehicles/motorcycle.glb', roads: 'world/road_bits.glb', office: 'world/business_building.glb', houseinterior: 'world/house_interior.glb',
    rocks: 'nature/rocks.glb', trees: 'nature/trees.glb', palms: 'nature/palm_trees.glb', pines: 'nature/pine_trees.glb', maples: 'nature/maple_trees.glb', birches: 'nature/birch_trees.glb',
    bushes: 'nature/bushes.glb', flowerbushes: 'nature/flower_bushes.glb', flowers: 'nature/flowers.glb', grass: 'nature/grass.glb'
  };
  const CHARACTERS = ['casual', 'woman', 'worker', 'businessman', 'hoodie', 'beach', 'farmer', 'adventurer', 'king', 'punk', 'swat', 'astronaut', 'menworker', 'suit'];
  const CHAR_H = 1.65;                           // character height in room units (one floor cell = 1 unit)

  function script(urls) {
    return new Promise((ok, no) => {
      const next = i => { if (i >= urls.length) return no(new Error('script failed: ' + urls[0])); const s = document.createElement('script'); s.src = urls[i]; s.onload = ok; s.onerror = () => next(i + 1); document.head.appendChild(s) };
      next(0)
    })
  }

  const M3D = window.M3D = {
    FILES, CHARACTERS, _libs: null, _cache: {},
    /* Three.js + GLTFLoader + SkeletonUtils, loaded once */
    libs() {
      if (this._libs) return this._libs;
      return this._libs = (async () => {
        if (!window.THREE) await ROOM3D.load();
        if (!THREE.GLTFLoader) await script(LIB[0]);
        if (!THREE.SkeletonUtils) await script(LIB[1]);
        return true
      })().catch(e => { this._libs = null; throw e })
    },
    /* the parsed glTF (shared; never add it to a scene directly — use spawn / part) */
    async get(key) {
      if (!FILES[key]) throw new Error('unknown model ' + key);
      await this.libs();
      if (!this._cache[key]) this._cache[key] = new Promise((ok, no) => new THREE.GLTFLoader().load(BASE + FILES[key], ok, undefined, no)).catch(e => { delete this._cache[key]; throw e });
      return this._cache[key]
    },
    /* bounding box that follows the skinned pose (Box3.setFromObject ignores skinning) */
    box(obj) {
      const b = new THREE.Box3(), v = new THREE.Vector3(); obj.updateMatrixWorld(true);
      obj.traverse(o => {
        if (o.isSkinnedMesh && o.geometry.attributes.position && o.boneTransform) {
          o.skeleton.update(); const n = o.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 4000));
          for (let i = 0; i < n; i += step) { o.boneTransform(i, v); v.applyMatrix4(o.matrixWorld); b.expandByPoint(v) }
        } else if (o.isMesh) { const bb = new THREE.Box3().setFromObject(o); if (!bb.isEmpty()) b.union(bb) }
      });
      return b
    },
    /* wrap `obj` so it is `height` tall, centred on x/z, standing on y = 0 */
    fit(obj, height) {
      const b = this.box(obj), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      const g = new THREE.Group(); obj.position.set(-c.x, -b.min.y, -c.z); g.add(obj); g.scale.setScalar(height / (s.y || 1));
      obj.traverse(o => { if (o.isMesh) { o.frustumCulled = false } });
      return g
    },
    /* a whole model, e.g. M3D.spawn('sportscar', { height: .9 }).  Returns { root, clips, mixer } */
    async spawn(key, o) {
      o = o || {}; const gl = await this.get(key), obj = THREE.SkeletonUtils.clone(gl.scene), root = this.fit(obj, o.height || 1);
      if (o.rotY) root.rotation.y = o.rotY;
      const clips = gl.animations || [], mixer = clips.length ? new THREE.AnimationMixer(obj) : null;
      return { root, obj, clips, mixer }
    },
    /* one named piece of a multi-object pack, e.g. M3D.part('palms', 'PalmTree_2', { height: 3 }) */
    async part(key, name, o) {
      o = o || {}; const gl = await this.get(key); let src = null; gl.scene.traverse(n => { if (!src && n.name === name) src = n });
      if (!src) throw new Error(name + ' not in ' + key);
      return this.fit(THREE.SkeletonUtils.clone(src), o.height || 1)
    },
    /* names of the pieces inside a pack (to pick from) */
    async pieces(key) {
      const gl = await this.get(key); let top = gl.scene.children; if (top.length === 1 && top[0].children.length) top = top[0].children;
      return top.filter(n => n.name).map(n => n.name)
    },

    /* ---------- the yard around the house: bushes, rocks and flowers, plus a ride once the home is expanded ---------- */
    yard(room) {
      if (!room.scene || !window.THREE) return;
      const tok = room._ytok = (room._ytok || 0) + 1;
      (async () => {
        try {
          const G = room.grid || 6, off = room.off || 0, lv = G === 10 ? 2 : G === 8 ? 1 : 0, g = new THREE.Group(), jobs = [];
          let seed = 7 + G; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
          const [bush, fbush, flow, rock] = await Promise.all(['bushes', 'flowerbushes', 'flowers', 'rocks'].map(k => this.pieces(k)));
          const put = (key, list, h, x, z) => { if (!list.length) return; const nm = list[Math.floor(rnd() * list.length)]; jobs.push(this.part(key, nm, { height: h * (.8 + rnd() * .5) }).then(o => { o.position.set(x, 0, z); o.rotation.y = rnd() * 6.28; g.add(o) }).catch(() => { })) };
          const edge = G / 2 + 1.0;                                          // just outside the walls
          for (let i = 0; i < G + 2; i += 1.5) {                              // south + east hedge line
            const t = -G / 2 + i + off;
            put(rnd() < .5 ? 'bushes' : 'flowerbushes', rnd() < .5 ? bush : fbush, .75, t, edge + off + rnd() * .5);
            put(rnd() < .5 ? 'bushes' : 'flowerbushes', rnd() < .5 ? bush : fbush, .75, edge + off + rnd() * .5, t);
          }
          for (let i = 0; i < 3 + lv * 2; i++) put('rocks', rock, .5, -5.8 - rnd() * .8, -edge + rnd() * (G + 1) + off);   // rocks on the far (west) side
          for (let i = 0; i < 4 + lv * 3; i++) { const a = rnd() * 6.28, r = G / 2 + 2.2 + rnd() * 2.5; put('flowers', flow, .35, off + Math.cos(a) * r, off + Math.sin(a) * r) }
          if (lv >= 1) jobs.push(this.spawn('sportscar', { height: 1.1 }).then(m => { m.root.position.set(-4.9, 0, 1.2); g.add(m.root) }).catch(() => { }));
          if (lv >= 2) jobs.push(this.spawn('motorcycle', { height: .95, rotY: Math.PI / 2 }).then(m => { m.root.position.set(-4.6, 0, -2.6); g.add(m.root) }).catch(() => { }));
          await Promise.all(jobs);
          if (room._ytok !== tok) return;
          if (room.yardG) room.scene.remove(room.yardG);
          room.yardG = g; room.scene.add(g)
        } catch (e) { console.warn('yard models unavailable', e) }
      })()
    },

    /* ---------- the player's character ---------- */
    charKey(gender, look) {
      let k = look && look.model || ''; try { k = k || localStorage.getItem('ac_char_' + (gender === 'female' ? 'f' : 'm')) || '' } catch (e) { }
      if (FILES[k] && CHARACTERS.includes(k)) return k;
      return gender === 'female' ? 'woman' : 'casual'
    },
    /* pick a different character for the player (kept on this device) */
    setCharacter(key) {
      if (!CHARACTERS.includes(key)) return; const g = ROOM3D.gender || 'male';
      try { localStorage.setItem('ac_char_' + (g === 'female' ? 'f' : 'm'), key) } catch (e) { }
      if (ROOM3D.on && ROOM3D.scene) ROOM3D.buildAvatar(g, ROOM3D.look)
    },
    clip(g, ...names) {
      for (const n of names) { const c = g.clips.find(c => { const s = c.name.split('|').pop().replace(/^Man_/, ''); return s.toLowerCase() === n.toLowerCase() }); if (c) return c }
      return g.clips[0] || null
    },
    async attach(room, gender, look) {
      const av = room.avatar, tok = room._gtok = (room._gtok || 0) + 1;
      try {
        const m = await this.spawn(this.charKey(gender, look), { height: CHAR_H });
        if (room._gtok !== tok || room.avatar !== av) return;           // rebuilt while loading
        av.children.forEach(c => { c.visible = false });                 // hide the old blocky one, keep it as a fallback
        av.add(m.root);
        const g = room.glb = { root: m.root, obj: m.obj, clips: m.clips, mixer: m.mixer, acts: {}, cur: null, spin: 0, tt: 0, base: m.root.position.y };
        this.play(g, 'idle', 0);
      } catch (e) { console.warn('3D character unavailable, keeping the basic one', e) }
    },
    play(g, state, fade) {
      if (!g.mixer || g.cur === state) return; g.cur = state;
      const dn = g.dn || 0;
      const map = {
        idle: [['Idle_Neutral', 'Idle'], 1], walk: [['Walk'], 1.1], wave: [['Wave', 'Clapping'], 1],
        dance0: [['Wave', 'Clapping'], 1.5], dance1: [['Run'], .7], dance2: [['Idle_Neutral', 'Idle'], 1], dance3: [['Interact', 'Clapping'], 1.1]
      }[state] || [['Idle'], 1];
      const c = this.clip(g, ...map[0]); if (!c) return;
      const next = g.acts[c.name] || (g.acts[c.name] = g.mixer.clipAction(c)); next.enabled = true; next.setEffectiveTimeScale(map[1]); next.setEffectiveWeight(1);
      if (g.act && g.act !== next) { next.reset(); next.play(); g.act.crossFadeTo(next, fade == null ? .25 : fade, false) } else { next.reset().play() }
      g.act = next
    },
    /* drives the GLB character instead of the procedural joints (same signature as ROOM3D.animate) */
    step(room, t, dt, moving) {
      const g = room.glb; if (room.em && moving) { room.em = null; if (window.emoteEnded) window.emoteEnded() }
      const ext = room.ext || {}, st = moving ? 'walk' : (room.em || 'idle'), dn = room.dn || 0, dm = dn % 4;
      g.dn = dn; g.tt += dt;
      this.play(g, st === 'dance' ? 'dance' + dm : st);
      let bob = 0, spinning = false;
      if (st === 'dance') { bob = Math.abs(Math.sin(g.tt * 6)) * .07; spinning = dm === 2 }
      if (spinning) g.spin += dt * 5.2; else g.spin += (Math.round(g.spin / (Math.PI * 2)) * Math.PI * 2 - g.spin) * Math.min(1, dt * 7);
      g.root.rotation.y = g.spin; g.root.position.y = bob;
      g.mixer.update(ext.reduce ? dt * .5 : dt)
    }
  };

  /* ---- hook into the 3D room: build the old one first (instant fallback), then swap in the real model ---- */
  const R = window.ROOM3D;
  if (R && !R._m3d) {
    R._m3d = true; const build0 = R.buildAvatar, anim0 = R.animate;
    R.buildAvatar = function (gender, look) {
      if (this.glb) this.glb = null;
      build0.call(this, gender, look);
      if (window.WebGLRenderingContext) M3D.attach(this, gender || this.gender || 'male', look || this.look)
    };
    const sync0 = R.sync;
    R.sync = function () {
      const r = sync0.apply(this, arguments);
      if (this === window.ROOM3D && this.on && this._yardKey !== this.grid) { this._yardKey = this.grid; M3D.yard(this) }
      return r
    };
    R.animate = function (t, dt, moving) {
      if (this.glb && this.glb.mixer) { try { return M3D.step(this, t, dt, moving) } catch (e) { console.warn('3D character step failed, using the basic one', e); if (this.glb && this.glb.root && this.glb.root.parent) this.glb.root.parent.remove(this.glb.root); this.glb = null; if (this.avatar) this.avatar.children.forEach(c => { c.visible = true }) } }
      return anim0.call(this, t, dt, moving)
    };
  }
})();
