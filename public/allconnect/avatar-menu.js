/* Tap your profile picture → Edit avatar / Create new / From my photo.
   Binds to #avbtn (and anything marked data-av-menu). Uses what app.js + room3d.js expose: setGender(), ROOM3D.setLook(), ROOM3D.look,
   ACAvatar.BODIES, paintPortraits(). "Edit" hands over to the Style app (styleapp.js). */
const AVMENU = {
  SKINS: ['#4a2f23', '#6b4226', '#8a5a3c', '#a9714b', '#c58f66'],
  HAIRS: [['Black', '#16100d'], ['Dark brown', '#3a2418'], ['Auburn', '#6e3a24'], ['Honey', '#b58a4a'], ['Grey', '#9aa0a6']],
  d: { g: 'female', skin: '#8a5a3c', hair: '#16100d', body: 0, height: 1 },

  css() {
    if (document.getElementById('avm-css')) return; const s = document.createElement('style'); s.id = 'avm-css';
    s.textContent = `#avm{position:fixed;inset:0;z-index:9000;display:none;align-items:flex-end;justify-content:center;background:rgba(5,8,20,.55);font-family:'DM Sans',system-ui,sans-serif}
#avm.on{display:flex}
#avm .sh{width:100%;max-width:520px;background:#fff;color:#14172b;border-radius:24px 24px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));max-height:88%;overflow-y:auto}
@media(min-width:760px){#avm{align-items:center}#avm .sh{border-radius:24px}}
#avm h3{margin:0 0 10px;font:800 19px Outfit,system-ui,sans-serif;display:flex;align-items:center;gap:8px}
#avm h3 .x{margin-left:auto;border:0;background:#eef0f6;width:34px;height:34px;border-radius:50%;font-size:16px;cursor:pointer}
#avm h3 .bk{border:0;background:#eef0f6;width:34px;height:34px;border-radius:50%;font-size:16px;cursor:pointer}
#avm .opt{display:flex;align-items:center;gap:14px;width:100%;border:0;background:#f4f5fa;border-radius:16px;padding:14px;margin-bottom:10px;text-align:left;cursor:pointer;color:inherit;font:inherit}
#avm .opt i{flex:none;width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:20px;background:#6d4aff;color:#fff;font-style:normal}
#avm .opt b{display:block;font-size:15px}#avm .opt span{font-size:12.5px;color:#6b7280}
#avm h4{margin:12px 0 6px;font:700 12px 'DM Sans',sans-serif;letter-spacing:.08em;color:#6b7280;text-transform:uppercase}
#avm .seg{display:flex;gap:8px;flex-wrap:wrap}
#avm .seg button{border:2px solid #e5e7ef;background:#fff;border-radius:999px;padding:9px 16px;font:700 14px 'DM Sans',sans-serif;cursor:pointer;color:#14172b}
#avm .seg button.on{background:#14172b;color:#fff;border-color:#14172b}
#avm .dots{display:flex;gap:12px}
#avm .dots button{width:44px;height:44px;border-radius:50%;border:3px solid transparent;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15);cursor:pointer}
#avm .dots button.on{border-color:#6d4aff}
#avm .go{width:100%;margin-top:16px;border:0;border-radius:999px;padding:15px;font:800 16px Outfit,system-ui,sans-serif;background:linear-gradient(#f9d56a,#f2b33d);color:#1b1405;cursor:pointer}
#avm .go.sec{background:#eef0f6;color:#14172b;margin-top:8px}
#avm .ph{display:flex;gap:14px;align-items:center;margin:8px 0}
#avm .ph canvas{width:110px;height:110px;border-radius:50%;background:#eee;flex:none}
#avm .ph p{margin:0;font-size:13px;color:#4b5263;line-height:1.4}
#avm .sw2{display:inline-block;width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-right:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}`;
    document.head.appendChild(s)
  },
  el() { let e = document.getElementById('avm'); if (!e) { this.css(); e = document.createElement('div'); e.id = 'avm'; e.onclick = ev => { if (ev.target === e) this.close() }; document.body.appendChild(e) } return e },
  open() { this.menu(); this.el().classList.add('on') },
  close() { const e = document.getElementById('avm'); if (e) e.classList.remove('on') },

  menu() {
    this.el().innerHTML = `<div class="sh"><h3>Your avatar<button class="x" onclick="AVMENU.close()" aria-label="Close">✕</button></h3>
<button class="opt" onclick="AVMENU.edit()"><i>✏️</i><div><b>Edit avatar</b><span>Clothes, hair, shoes and looks in the Style app</span></div></button>
<button class="opt" onclick="AVMENU.create()"><i>✨</i><div><b>Create new avatar</b><span>Pick person, skin tone, hair colour, body and height</span></div></button>
<button class="opt" onclick="AVMENU.photo()"><i>📸</i><div><b>Make it look like me</b><span>Use a selfie to pick your skin tone and hair colour</span></div></button>
<button class="opt" onclick="AVMENU.needs()"><i>❤️</i><div><b>Show my needs</b><span>Hunger, energy, mood and more</span></div></button></div>`
  },
  needs() { this.close(); if (typeof toggleNeeds === 'function') toggleNeeds() },
  edit() {
    this.close();
    try { if (window.STYLE && typeof STYLE.open === 'function') return STYLE.open() } catch (e) { }
    try { nav('phone'); setTimeout(() => { try { PH.open('style') } catch (e) { if (typeof toast === 'function') toast('Open the Style app on your phone') } }, 90) } catch (e) { }
  },

  /* ---------- creator (same controls as the MyOfficeo "Choose your person" screen) ---------- */
  create(preset) {
    const R = window.ROOM3D && ROOM3D.look; if (preset) Object.assign(this.d, preset); else if (R) this.d = Object.assign({}, this.d, { g: R.g || this.d.g, skin: R.skin || this.d.skin, hair: (R.hair && R.hair.color) || this.d.hair });
    this.draw()
  },
  bodyKeys() { try { return Object.keys(ACAvatar.BODIES) } catch (e) { return [] } },
  draw() {
    const d = this.d, bk = this.bodyKeys(), names = ['Slim', 'Curvy', 'Fuller'], hs = [['Shorter', .94], ['Average', 1], ['Taller', 1.06]];
    const seg = (arr, on, fn) => arr.map((x, i) => `<button type="button" class="${on === i ? 'on' : ''}" onclick="${fn}(${i})">${x}</button>`).join('');
    this.el().innerHTML = `<div class="sh"><h3><button class="bk" onclick="AVMENU.menu()" aria-label="Back">‹</button>Choose your person<button class="x" onclick="AVMENU.close()" aria-label="Close">✕</button></h3>
<div class="seg"><button class="${d.g === 'female' ? 'on' : ''}" onclick="AVMENU.set('g','female')">Woman</button><button class="${d.g === 'male' ? 'on' : ''}" onclick="AVMENU.set('g','male')">Man</button></div>
<h4>Skin tone</h4><div class="dots">${this.SKINS.map(c => `<button style="background:${c}" class="${d.skin === c ? 'on' : ''}" onclick="AVMENU.set('skin','${c}')" aria-label="Skin tone"></button>`).join('')}</div>
<h4>Hair colour</h4><div class="seg">${this.HAIRS.map(h => `<button class="${d.hair === h[1] ? 'on' : ''}" onclick="AVMENU.set('hair','${h[1]}')"><span class="sw2" style="background:${h[1]}"></span>${h[0]}</button>`).join('')}</div>
${bk.length ? `<h4>Body</h4><div class="seg">${seg(names, d.body, 'AVMENU.body')}</div>` : ''}
<h4>Height</h4><div class="seg">${hs.map((h, i) => `<button class="${d.height === h[1] ? 'on' : ''}" onclick="AVMENU.set('height',${h[1]})">${h[0]}</button>`).join('')}</div>
<button class="go" onclick="AVMENU.apply()">Next</button></div>`
  },
  set(k, v) { this.d[k] = v; this.draw() },
  body(i) { this.d.body = i; this.draw() },

  /* Applies to the live 3D character, refreshes the portraits, and keeps the choice on this device.
     Gender goes through the game's own setGender() so it is saved to the account. */
  apply() {
    const d = this.d, bk = this.bodyKeys();
    try { if (typeof setGender === 'function') setGender(d.g) } catch (e) { }
    const base = (window.ROOM3D && ROOM3D.look && ROOM3D.look.g === d.g) ? ROOM3D.look : ((window.ACAvatar && ACAvatar.defaultRender) ? ACAvatar.defaultRender(d.g) : null);
    if (base && window.ROOM3D) {
      const look = Object.assign({}, base, { g: d.g, skin: d.skin, hair: Object.assign({}, base.hair || {}, { color: d.hair }) });
      if (bk.length) look.body = bk[Math.min(d.body, bk.length - 1)] || look.body;
      try { ROOM3D.setLook(look); const a = ROOM3D.avatar; if (a) a.scale.setScalar(d.height) } catch (e) { }
    }
    try { localStorage.setItem('acavatar:create', JSON.stringify(d)) } catch (e) { }
    try { if (typeof paintPortraits === 'function') paintPortraits() } catch (e) { }
    try { if (window.NET && NET.save) NET.save() } catch (e) { }
    this.close(); if (typeof toast === 'function') toast('Avatar updated ✨')
  },

  /* ---------- from a photo: reads skin tone + hair colour from a selfie, then opens the creator with them filled in ---------- */
  photo() {
    this.el().innerHTML = `<div class="sh"><h3><button class="bk" onclick="AVMENU.menu()" aria-label="Back">‹</button>Make it look like me<button class="x" onclick="AVMENU.close()" aria-label="Close">✕</button></h3>
<div class="ph"><canvas id="avmc" width="220" height="220"></canvas><p>Pick a clear, front-facing selfie in good light. Your photo stays on your phone: only the average skin tone and hair colour are read from it.</p></div>
<input id="avmf" type="file" accept="image/*" capture="user" style="display:none" onchange="AVMENU.read(this)">
<button class="go" onclick="document.getElementById('avmf').click()">📸 Take or choose a photo</button></div>`
  },
  read(inp) {
    const f = inp.files && inp.files[0]; if (!f) return; const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => { try { this.sample(img) } finally { URL.revokeObjectURL(url) } };
    img.onerror = () => { URL.revokeObjectURL(url); if (typeof toast === 'function') toast('Could not read that photo') }; img.src = url
  },
  avg(g, x, y, w, h, pick) {
    const px = g.getImageData(x, y, w, h).data, rows = []; for (let i = 0; i < px.length; i += 4) rows.push([px[i], px[i + 1], px[i + 2], px[i] * .3 + px[i + 1] * .59 + px[i + 2] * .11]);
    rows.sort((a, b) => a[3] - b[3]); const s = pick === 'dark' ? rows.slice(0, Math.max(1, rows.length * .35 | 0)) : rows.slice(rows.length * .2 | 0, rows.length * .8 | 0);
    const m = s.reduce((a, r) => [a[0] + r[0], a[1] + r[1], a[2] + r[2]], [0, 0, 0]).map(v => v / s.length); return m
  },
  near(rgb, list) {
    const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); let best = list[0], bd = 1e9;
    list.forEach(c => { const a = h(Array.isArray(c) ? c[1] : c), d = (a[0] - rgb[0]) ** 2 + (a[1] - rgb[1]) ** 2 + (a[2] - rgb[2]) ** 2; if (d < bd) { bd = d; best = c } }); return Array.isArray(best) ? best[1] : best
  },
  sample(img) {
    const c = document.getElementById('avmc'), g = c.getContext('2d', { willReadFrequently: true }), s = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 220, 220);
    const skin = this.avg(g, 80, 90, 60, 50, 'mid'), hair = this.avg(g, 70, 8, 80, 34, 'dark');
    const sk = this.near(skin, this.SKINS), hr = this.near(hair, this.HAIRS);
    this.d.skin = sk; this.d.hair = hr;
    const box = document.querySelector('#avm .ph p'); if (box) box.innerHTML = `Found a skin tone <span class="sw2" style="background:${sk}"></span> and hair colour <span class="sw2" style="background:${hr}"></span>. You can adjust them next.`;
    const go = document.querySelector('#avm .go'); if (go) { go.textContent = 'Continue'; go.onclick = () => this.create() }
    const sec = document.createElement('button'); sec.className = 'go sec'; sec.textContent = 'Use a different photo'; sec.onclick = () => document.getElementById('avmf').click(); go.parentNode.appendChild(sec)
  },

  boot() {
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('#avbtn,[data-av-menu]'); if (!t) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); this.open()
    }, true);
    // restore a saved creator look after the 3D room is ready
    let n = 0; const t = setInterval(() => {
      if (++n > 60) return clearInterval(t); if (!(window.ROOM3D && ROOM3D.look && window.ACAvatar)) return; clearInterval(t);
      try { const d = JSON.parse(localStorage.getItem('acavatar:create') || 'null'); if (d && d.g === ROOM3D.look.g) { this.d = Object.assign(this.d, d); this.apply2() } } catch (e) { }
    }, 800)
  },
  apply2() { const d = this.d, bk = this.bodyKeys(); const look = Object.assign({}, ROOM3D.look, { skin: d.skin, hair: Object.assign({}, ROOM3D.look.hair || {}, { color: d.hair }) }); if (bk.length) look.body = bk[Math.min(d.body, bk.length - 1)] || look.body; ROOM3D.setLook(look); if (ROOM3D.avatar) ROOM3D.avatar.scale.setScalar(d.height) }
};
window.AVMENU = AVMENU; AVMENU.boot();
