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
    /* tell the player once (and the console) when the 3D files can't be loaded, instead of failing silently */
    fail(what, e) {
      console.warn('[M3D] ' + what, e);
      if (!this._warned && typeof toast === 'function') { this._warned = 1; try { toast('3D models could not load (' + ((e && e.message) || e || 'unknown') + '). Using the basic look.') } catch (x) { } }
    },
    /* the parsed glTF (shared; never add it to a scene directly — use spawn / part) */
    async get(key) {
      if (!FILES[key]) throw new Error('unknown model ' + key);
      await this.libs();
      if (!this._cache[key]) this._cache[key] = new Promise((ok, no) => new THREE.GLTFLoader().load(BASE + FILES[key], ok, undefined, no)).then(gl => this.fixColors(gl)).catch(e => { delete this._cache[key]; throw e });
      return this._cache[key]
    },
    /* glTF colours are linear but this scene is drawn without colour management (like the hand-built parts), so convert once */
    fixColors(gl) {
      gl.scene.traverse(o => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          if (!m || (m.userData && m.userData._srgb)) return; m.userData = m.userData || {}; m.userData._srgb = 1;
          if (m.color) m.color.convertLinearToSRGB(); if (m.emissive && m.emissive.getHex()) m.emissive.convertLinearToSRGB();
          if (m.map) { m.map.encoding = THREE.LinearEncoding; m.map.needsUpdate = true }
          if (m.metalness != null) m.metalness = Math.min(m.metalness, .1); if (m.roughness != null) m.roughness = Math.max(m.roughness, .7)
        })
      });
      return gl
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

    /* ---------- the Market Shop's built-in counter, shelves, crates and barrels (tap them to use) ---------- */
    dropFixtures(room) { if (room.fxG && room.scene) { room.scene.remove(room.fxG); room.fxG.traverse(o => { if (o.geometry) o.geometry.dispose() }) } room.fxG = null },
    /* ---------- bedroom plans (homes with added bedrooms): low partition walls with doorways, tinted bedroom floors, name tags ---------- */
    bedroomRooms(room, L) {
      if (!room.scene || !window.THREE) return; this.dropFixtures(room);
      const g = new THREE.Group(), mats = {}, M = (c, o) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {})));
      const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); g.add(m); return m };
      const WALL_H = 1.55, T = .14, wallColor = '#efe6d2', capColor = '#cdbd9c';
      // every wall edge "ax,az|bx,bz" becomes one slab on the line between the two cells
      for (const e of L.walls) {
        const [a, b] = e.split('|').map(t => t.split(',').map(Number));
        const cx = room.cc(a[0]) + (b[0] - a[0]) / 2, cz = room.cc(a[1]) + (b[1] - a[1]) / 2;
        if (a[0] !== b[0]) { box(T, WALL_H, 1 + T, wallColor, cx, WALL_H / 2, cz); box(T + .04, .05, 1 + T + .04, capColor, cx, WALL_H + .02, cz) }
        else { box(1 + T, WALL_H, T, wallColor, cx, WALL_H / 2, cz); box(1 + T + .04, .05, T + .04, capColor, cx, WALL_H + .02, cz) }
      }
      // a soft rug-coloured floor and a name tag in each bedroom
      const tag = (text) => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = 'rgba(27,34,54,.82)'; x.beginPath(); (x.roundRect ? x.roundRect(4, 4, 248, 56, 28) : x.rect(4, 4, 248, 56)); x.fill(); x.fillStyle = '#fff'; x.font = '800 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 34); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false })); sp.scale.set(1.9, .475, 1); sp.renderOrder = 5; return sp };
      for (const r of L.rooms || []) {
        const w = r.x1 - r.x0 + 1, d = r.z1 - r.z0 + 1, cx = room.cc(r.x0) + (w - 1) / 2, cz = room.cc(r.z0) + (d - 1) / 2;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(w - .1, d - .1), M('#d9c3a0', { transparent: true, opacity: .55 })); f.rotation.x = -Math.PI / 2; f.position.set(cx, .012, cz); g.add(f);
        const t = tag(r.name); t.position.set(cx, 2.05, cz); g.add(t);
      }
      room.scene.add(g); room.fxG = g
    },
    shopFixtures(room, L) {
      if (!room.scene || !window.THREE) return; this.dropFixtures(room);
      const g = new THREE.Group(), mat = {}, M = c => mat[c] || (mat[c] = new THREE.MeshLambertMaterial({ color: c }));
      const box = (par, w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); par.add(m); return m };
      const cyl = (par, r, h, c, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), M(c)); m.position.set(x, y, z); par.add(m); return m };
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, GOODS = ['#e5484d', '#ffc83d', '#3ddc84', '#4a86d6', '#f08a24', '#fff2d6', '#8b4be0'];
      const sign = (text, w, h) => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = Math.round(256 * h / w); const x = cv.getContext('2d'); x.fillStyle = '#e8a500'; x.fillRect(0, 0, cv.width, cv.height); x.strokeStyle = '#7a4d2a'; x.lineWidth = 10; x.strokeRect(5, 5, cv.width - 10, cv.height - 10); x.fillStyle = '#3a2412'; x.font = '800 ' + Math.round(cv.height * .5) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, cv.width / 2, cv.height / 2 + 4); const t = new THREE.CanvasTexture(cv); return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t })) };
      for (const f of L.fixtures) {
        const grp = new THREE.Group(); grp.userData.id = 'fx:' + f.id; grp.position.set(room.cc(f.x) + (f.w - 1) / 2, 0, room.cc(f.z) + (f.d - 1) / 2);
        if (f.kind === 'counter') {
          const w = f.w; box(grp, w - .1, .85, .7, '#8b5a33', 0, .425, 0); box(grp, w - .25, .5, .02, '#6e4526', 0, .45, .36); box(grp, w + .05, .08, .85, '#efe2c4', 0, .89, 0);
          box(grp, .5, .26, .4, '#2b2f3a', -w / 2 + .55, 1.06, -.05); box(grp, .4, .18, .02, '#7fe0c3', -w / 2 + .55, 1.1, .16);   // the till
          for (let i = 0; i < 3; i++) box(grp, .16, .2 + rnd() * .12, .16, GOODS[(i * 2) % GOODS.length], .2 + i * .28, 1.03, -.05 + rnd() * .1);
          const sg = sign('OPEN', .7, .3); sg.position.set(w / 2 - .6, 1.2, .3); grp.add(sg)
        } else if (f.kind === 'shelves') {
          const L0 = f.d; box(grp, .08, 2.2, L0, '#7a4d2a', .46, 1.1, 0);                                       // back panel against the east wall
          for (let i = 0; i <= L0; i += 2) box(grp, .5, 2.2, .07, '#6a4223', .2, 1.1, -L0 / 2 + i);               // uprights
          [.18, .7, 1.22, 1.74].forEach(y => { box(grp, .52, .05, L0 - .05, '#a8743f', .2, y, 0); for (let z = -L0 / 2 + .25; z < L0 / 2 - .2; z += .3 + rnd() * .25) box(grp, .16 + rnd() * .2, .16 + rnd() * .2, .2 + rnd() * .12, GOODS[Math.floor(rnd() * GOODS.length)], .15 + rnd() * .12, y + .12, z) });
        } else if (f.id === 'crates') {
          [[-.5, 0, -.5], [.5, 0, -.5], [-.5, 0, .5], [.5, 0, .5], [-.5, .82, -.5]].forEach(p => { box(grp, .86, .8, .86, '#b07a42', p[0], .4 + p[1], p[2]); box(grp, .9, .06, .9, '#8a5a30', p[0], .83 + p[1], p[2]); box(grp, .06, .8, .9, '#8a5a30', p[0] - .3, .4 + p[1], p[2]); box(grp, .06, .8, .9, '#8a5a30', p[0] + .3, .4 + p[1], p[2]) })
        } else if (f.id === 'barrels') {
          [-.5, .5].forEach(z => { cyl(grp, .36, .85, '#7a4a24', 0, .425, z); cyl(grp, .375, .05, '#555a63', 0, .2, z); cyl(grp, .375, .05, '#555a63', 0, .65, z); cyl(grp, .33, .02, '#a8743f', 0, .86, z) })
        }
        g.add(grp)
      }
      room.scene.add(g); room.fxG = g
    },

    /* ---------- the house model (Family House): replaces the box walls/floor, cut away low so you can see in ---------- */
    async houseShell(room, L) {
      const tok = room._stok = (room._stok || 0) + 1;
      try {
        const gl = await this.get('houseinterior'); if (room._stok !== tok || room.layout !== L) return;
        if (room.shellG) room.scene.remove(room.shellG);
        room.R.localClippingEnabled = true;
        const m = L.model, obj = THREE.SkeletonUtils.clone(gl.scene), plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), m.cutY), walls = [];
        const COL = { mat19: '#b9824d', mat17: '#b9824d', mat21: '#f3efe6' };   // unified wood floor, bathroom/kitchen floor, trim and frames
        obj.traverse(o => {
          if (!o.isMesh) return; const src = o.material, mat = new THREE.MeshLambertMaterial({ color: src.color.clone(), side: THREE.DoubleSide, clippingPlanes: [plane] });
          if (src.name === 'mat18') { mat.color.set((typeof S !== 'undefined' && S.paint) || '#e6d9c0'); walls.push(mat) } else if (COL[src.name]) {
            mat.color.set(COL[src.name]);
            if ((src.name === 'mat19' || src.name === 'mat17') && this.floor && this.floor.material.map) { mat.map = this.floor.material.map.clone(); mat.color.set('#ffffff'); mat.needsUpdate = true; }
          }
          o.material = mat; o.frustumCulled = false
        });
        const g = new THREE.Group(); g.add(obj); g.scale.setScalar(m.k); g.position.set(m.tx, m.ty, m.tz);
        room.scene.add(g); room.shellG = g; room.shellWalls = walls
      } catch (e) {
        this.fail('house model', e);       // fallback: a bare floor the size of the plan, walls come from the blocked cells
        if (room._stok === tok && room.floor) { room.floor.geometry.dispose(); room.floor.geometry = new THREE.PlaneGeometry(L.w, L.d); room.floor.position.set(room.offX, 0, room.offZ); room.floor.material.map.repeat.set(L.w / 2, L.d / 2); room.floor.visible = true }
      }
    },
    dropShell(room) { room._stok = (room._stok || 0) + 1; if (room.shellG && room.scene) room.scene.remove(room.shellG); room.shellG = null; room.shellWalls = null },

    /* ---------- the yard around the house: bushes, rocks and flowers, a ride once the home is expanded, the shop for the Family House ---------- */
    yard(room) {
      if (!room.scene || !window.THREE) return;
      const tok = room._ytok = (room._ytok || 0) + 1;
      (async () => {
        try {
          const gw = room.gw || 6, gd = room.gd || 6, ox = room.offX || 0, oz = room.offZ || 0, L = room.layout, lv = L ? 2 : gw >= 10 ? 2 : gw >= 8 ? 1 : 0, g = new THREE.Group(), jobs = [];
          let seed = 7 + gw * 31 + gd; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
          const [bush, fbush, flow, rock] = await Promise.all(['bushes', 'flowerbushes', 'flowers', 'rocks'].map(k => this.pieces(k)));
          const put = (key, list, h, x, z) => { if (!list.length) return; const nm = list[Math.floor(rnd() * list.length)]; jobs.push(this.part(key, nm, { height: h * (.8 + rnd() * .5) }).then(o => { o.position.set(x, 0, z); o.rotation.y = rnd() * 6.28; g.add(o) }).catch(() => { })) };
          const hedge = () => (rnd() < .5 ? ['bushes', bush] : ['flowerbushes', fbush]);
          const ex = gw / 2 + 1.0, ez = gd / 2 + 1.0;
          if (!L) for (let i = 0; i < gw + 2; i += 1.5) { const h = hedge(); put(h[0], h[1], .75, -gw / 2 + i + ox, ez + oz + rnd() * .5) }     // south hedge (the Family House keeps its front door clear)
          for (let i = 0; i < gd + 2; i += 1.5) { const h = hedge(); put(h[0], h[1], .75, ex + ox + rnd() * .5, -gd / 2 + i + oz) }                   // east hedge
          for (let i = 0; i < 3 + lv * 2; i++) put('rocks', rock, .5, -5.8 - rnd() * .8, -ez + rnd() * (gd + 1) + oz);                                // rocks on the west side
          for (let i = 0; i < 4 + lv * 3; i++) { const a = rnd() * 6.28, r = Math.max(gw, gd) / 2 + 2.2 + rnd() * 2.5; put('flowers', flow, .35, ox + Math.cos(a) * r, oz + Math.sin(a) * r) }
          if (lv >= 1 && !(L && L.id === 'market_shop')) jobs.push(this.spawn('sportscar', { height: 1.1 }).then(m => { m.root.position.set(-4.9, 0, 1.2); g.add(m.root) }).catch(() => { }));
          if (lv >= 2 && !(L && L.id === 'market_shop')) jobs.push(this.spawn('motorcycle', { height: .95, rotY: Math.PI / 2 }).then(m => { m.root.position.set(-4.6, 0, -2.6); g.add(m.root) }).catch(() => { }));
          if (L && L.id === 'market_shop') jobs.push(this.spawn('office', { height: 3.6, rotY: -Math.PI / 2 }).then(m => { m.root.position.set(ox + gw / 2 + 5.2, 0, oz + 0.2); g.add(m.root) }).catch(() => { }));   // your Business Building, next door to the shop floor
          else if (L) jobs.push(this.spawn('office', { height: 3.4, rotY: -Math.PI / 2 }).then(m => { m.root.position.set(ox + gw / 2 + 4.6, 0, oz - gd / 2 + 3); g.add(m.root) }).catch(() => { }));   // the Business Building, as the family's shop
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
    /* Style-app look -> the model: skin, hair, top, bottom and shoe colours (only the parts the player has actually changed
       from the default look; the rest keep the model's own colours), then hats, glasses, neckwear and jewellery. */
    dress(g, R, gender, key) {
      if (!R || !window.ACAvatar) return;
      const fem = (R.g || gender) === 'female', D = ACAvatar.defaultRender(fem ? 'female' : 'male'), W = ACAvatar.wardrobe(R, fem), sh = ACAvatar.shade;
      const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
      const top = R.outfit ? ((W.torso && W.torso.col) || R.outfit.c1) : R.top && R.top.c1, topSet = !!R.outfit || (R.top && !same(R.top.c1, D.top.c1));
      const bot = R.outfit ? (W.legCol || (W.skirt && W.skirt.col) || R.outfit.c1) : R.bottom && R.bottom.c1, botSet = !!R.outfit || (R.bottom && !same(R.bottom.c1, D.bottom.c1));
      const shoe = R.shoes && R.shoes.c1, shoeSet = shoe && !same(shoe, D.shoes.c1);
      const skin = R.skin && !same(R.skin, D.skin) ? R.skin : null, hair = R.hair && R.hair.color && !same(R.hair.color, D.hair.color) ? R.hair.color : null;
      const clothes = !['astronaut', 'swat', 'king'].includes(key), done = {};
      const SKIP = /^(Eye|Eyebrows|Brown$|Earrings|Details|Moustache|Visor|Gold|Metal|Backpack)/i;
      g.obj.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone(); const m = o.material, nm = m.name || '', where = (o.name + ' ' + (o.parent ? o.parent.name : '')), part = /Feet/i.test(where) ? 'feet' : /Legs|Pants/i.test(where) ? 'legs' : /Body/i.test(where) ? 'body' : 'other';
        if (/^Skin/.test(nm)) { if (skin) m.color.set(/Darker/.test(nm) ? sh(skin, -.14) : skin); return }
        if (/^Hair/.test(nm)) { if (hair) m.color.set(hair); return }
        if (!clothes || SKIP.test(nm)) return;
        if (nm === 'Shirt') { if (topSet && top) m.color.set(top); return } if (nm === 'Pants') { if (botSet && bot) m.color.set(bot); return }
        if (part === 'body' && topSet && top && !done.body) { done.body = 1; m.color.set(top) }
        else if (part === 'legs' && botSet && bot && !done.legs) { done.legs = 1; m.color.set(bot) }
        else if (part === 'feet' && shoeSet && !done.feet) { done.feet = 1; m.color.set(shoe) }
      });
      this.accessories(g, R)
    },
    /* hats, glasses, necklaces, earrings: built by the old rig's addAccessories3, parked on anchors that follow the head and neck bones */
    accessories(g, R) {
      const room = g.room, av = room.avatar; if (!av || !R || !(R.head || R.face || R.neckwear || (R.jewel && Object.keys(R.jewel).length))) return;
      let head = null, tip = null, neck = null; g.obj.traverse(o => { if (o.name === 'Head') head = o; else if (o.name === 'Head_end') tip = o; else if (o.name === 'Neck') neck = o });
      if (!head) return;
      const hA = new THREE.Group(), tA = new THREE.Group(); av.add(hA); av.add(tA);
      const M = c => new THREE.MeshLambertMaterial({ color: c }), C = c => new THREE.Color(c), HAIR = (R.hair && R.hair.color) || '#16100d', hm = () => M(HAIR);
      const part = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (par || hA).add(m); return m };
      try { room.addAccessories3(R, hA, tA, part, M, C, hm) } catch (e) { console.warn('accessories failed', e); av.remove(hA); av.remove(tA); return }
      hA.scale.setScalar(.46); tA.scale.setScalar(.46); g.anch = { head, tip, neck, hA, tA, v: new THREE.Vector3(), w: new THREE.Vector3() }
    },
    followAnchors(g, av) {
      const a = g.anch; if (!a) return; av.updateMatrixWorld(true);
      a.head.getWorldPosition(a.v); if (a.tip) { a.tip.getWorldPosition(a.w); a.v.add(a.w).multiplyScalar(.5) }   // middle of the head
      av.worldToLocal(a.v); a.hA.position.copy(a.v); a.tA.position.set(a.v.x, a.v.y - .4, a.v.z)
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
        const key = this.charKey(gender, look), g = room.glb = { room, root: m.root, obj: m.obj, clips: m.clips, mixer: m.mixer, acts: {}, cur: null, spin: 0, tt: 0, base: m.root.position.y };
        g.bones = {}; m.obj.traverse(o => { if (!o.isBone) return; g.bones[o.name] = o; const dn = o.userData && o.userData.name; if (dn) g.bones[dn] = o; const al = o.name.replace(/([a-z])([LR])$/, '$1.$2'); if (al !== o.name) g.bones[al] = o });   // Three's GLTFLoader strips the dots from names ('UpperLeg.L' -> 'UpperLegL'), so register both spellings: the sit pose looks bones up by the dotted name
        this.dress(g, look || room.look, gender, key);
        this.play(g, 'idle', 0);
      } catch (e) { this.fail('character', e) }
    },
    play(g, state, fade) {
      if (!g.mixer || g.cur === state) return; g.cur = state;
      const dn = g.dn || 0;
      const map = {
        idle: [['Idle_Neutral', 'Idle'], 1], rest: [['Idle_Neutral', 'Idle'], .5], use: [['Interact', 'Wave', 'Clapping'], 1], walk: [['Walk'], 1.1], wave: [['Wave', 'Clapping'], 1],
        dance0: [['Wave', 'Clapping'], 1.5], dance1: [['Run'], .7], dance2: [['Idle_Neutral', 'Idle'], 1], dance3: [['Interact', 'Clapping'], 1.1]
      }[state] || [['Idle'], 1];
      const c = this.clip(g, ...map[0]); if (!c) return;
      const next = g.acts[c.name] || (g.acts[c.name] = g.mixer.clipAction(c)); next.enabled = true; next.setEffectiveTimeScale(map[1]); next.setEffectiveWeight(1);
      if (g.act && g.act !== next) { next.reset(); next.play(); g.act.crossFadeTo(next, fade == null ? .25 : fade, false) } else { next.reset().play() }
      g.act = next
    },
    /* rotate a bone by a rotation expressed in WORLD axes (so no need to know how the rig's bones are oriented) */
    rotW(bone, axis, ang) {
      const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), r = new THREE.Quaternion().setFromAxisAngle(axis, ang);
      bone.parent.getWorldQuaternion(q1); bone.getWorldQuaternion(q2);
      bone.quaternion.copy(q1.invert().multiply(r).multiply(q2)); bone.updateMatrixWorld(true)
    },
    /* sitting: thighs forward, shins down, feet (separate IK bones) back under the knees, hips on the seat */
    sitPose(g, av, seatTop) {
      const B = g.bones; if (!B || !B.Hips || !B['UpperLeg.L'] || !B['Foot.L']) return;
      const V = THREE.Vector3, X = new V(1, 0, 0).applyQuaternion(av.getWorldQuaternion(new THREE.Quaternion())), v = new V(), w = new V(), off = {};
      av.updateMatrixWorld(true); B.Hips.getWorldPosition(v); const hipRel = v.y - av.getWorldPosition(w).y;
      ['L', 'R'].forEach(s => { B['LowerLeg.' + s].getWorldPosition(v); B['Foot.' + s].getWorldPosition(w); off[s] = w.clone().sub(v) });
      // How far the thighs must slope down so the feet land on the floor (a chair is lower than the character's leg length):
      // thigh * sin(slope) = (hip height above the floor) - (shin height) ; the shins stay vertical, the feet stay flat.
      B['UpperLeg.L'].getWorldPosition(v); const uy = v.y - av.getWorldPosition(w).y; B['LowerLeg.L'].getWorldPosition(w); const knee = w.clone(); B['Foot.L'].getWorldPosition(w);
      const baseY = av.getWorldPosition(new V()).y, thigh = Math.max(.15, knee.distanceTo(v)), shin = Math.max(0, knee.y - w.y), footY = w.y - baseY;
      const hipJoint = seatTop + .03 - hipRel + uy, slope = Math.asin(Math.max(-.5, Math.min(.85, (hipJoint - footY - shin) / thigh))), ang = Math.PI / 2 - slope;
      ['L', 'R'].forEach(s => { this.rotW(B['UpperLeg.' + s], X, -ang); this.rotW(B['LowerLeg.' + s], X, ang) });
      ['L', 'R'].forEach(s => { const f = B['Foot.' + s]; B['LowerLeg.' + s].getWorldPosition(v); v.add(off[s]); f.parent.updateWorldMatrix(true, false); f.parent.worldToLocal(v); f.position.copy(v); f.updateMatrixWorld(true) });
      g.root.position.set(0, seatTop + .03 - hipRel, -.05)
    },
    /* an action is running (room.act): lie on the bed, sit on the seat, or stand and use the thing */
    stepAct(room, g, dt) {
      const A = room.act, av = room.avatar; g.posed = true;
      g.root.rotation.set(0, 0, 0); g.root.position.set(0, 0, 0); g.spin = 0;
      this.play(g, A.kind === 'stand' ? 'use' : 'rest'); g.mixer.update(dt);
      if (g.anch) g.anch.hA.visible = g.anch.tA.visible = A.kind !== 'lie';
      if (A.kind === 'lie') { g.root.rotation.x = -Math.PI / 2; g.root.position.set(0, A.h + .12 + Math.sin(g.tt * 1.6) * .004, CHAR_H / 2); g.tt += dt; return }   // on the back, head toward -z
      if (A.kind === 'sit') this.sitPose(g, av, A.h);
      g.tt += dt; this.followAnchors(g, av)
    },
    /* drives the GLB character instead of the procedural joints (same signature as ROOM3D.animate) */
    step(room, t, dt, moving) {
      const g = room.glb; if (room.act) return this.stepAct(room, g, dt);
      if (g.posed) { g.posed = false; g.root.rotation.set(0, 0, 0); g.root.position.set(0, 0, 0); if (g.anch) g.anch.hA.visible = g.anch.tA.visible = true; g.cur = null }
      if (room.em && moving) { room.em = null; if (window.emoteEnded) window.emoteEnded() }
      const ext = room.ext || {}, st = moving ? 'walk' : (room.em || 'idle'), dn = room.dn || 0, dm = dn % 4;
      g.dn = dn; g.tt += dt;
      this.play(g, st === 'dance' ? 'dance' + dm : st);
      let bob = 0, spinning = false;
      if (st === 'dance') { bob = Math.abs(Math.sin(g.tt * 6)) * .07; spinning = dm === 2 }
      if (spinning) g.spin += dt * 5.2; else g.spin += (Math.round(g.spin / (Math.PI * 2)) * Math.PI * 2 - g.spin) * Math.min(1, dt * 7);
      g.root.rotation.y = g.spin; g.root.position.y = bob;
      g.mixer.update(ext.reduce ? dt * .5 : dt); this.followAnchors(g, room.avatar)
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
    const paint0 = R.paint;
    R.paint = function (c) { paint0.call(this, c); if (this.shellWalls) this.shellWalls.forEach(m => m.color.set(c || '#e6d9c0')) };
    const sync0 = R.sync;
    R.sync = function () {
      const r = sync0.apply(this, arguments);
      if (this === window.ROOM3D && this.on && this._yardKey !== this.roomKey) { this._yardKey = this.roomKey; M3D.yard(this) }
      return r
    };
    R.animate = function (t, dt, moving) {
      if (this.glb && this.glb.mixer) { try { return M3D.step(this, t, dt, moving) } catch (e) { console.warn('3D character step failed, using the basic one', e); if (this.glb && this.glb.root && this.glb.root.parent) this.glb.root.parent.remove(this.glb.root); this.glb = null; if (this.avatar) this.avatar.children.forEach(c => { c.visible = true }) } }
      const r0 = anim0.call(this, t, dt, moving), body = this.parts && this.parts.body;     // basic character: just tilt/lower the whole body for the action
      if (body) { const A = this.act; if (A && A.kind === 'lie') { body.rotation.x = -Math.PI / 2; body.position.set(0, A.h + .25, .95) } else if (A && A.kind === 'sit') {
        // hips on the seat, thighs forward (sloping down just enough), shins straight down, feet flat on the floor
        const L1 = .36, L2 = .30, hipY = A.h + .03, sl = Math.asin(Math.max(0, Math.min(.9, (hipY - L2 - .08) / L1))), ang = Math.PI / 2 - sl;
        body.rotation.x = 0; body.position.set(0, hipY - .74, 0);
        [this.parts.legL, this.parts.legR].forEach((g, i) => { if (g && g.hip) { g.hip.rotation.set(-ang, 0, (i ? 1 : -1) * .06); g.knee.rotation.x = ang } })
      } else if (body.rotation.x) { body.rotation.x = 0; body.position.set(0, 0, 0) } }
      return r0
    };
  }
})();
