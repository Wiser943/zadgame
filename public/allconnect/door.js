/* Step outside / step inside: a button on the home screen takes your character out the door onto the street (the map),
   and on the street the same button reads "Step inside" once you are at your door (or "Walk home" while you are further away). */
const DOOR = {
  btn: null, view: 'home', timer: 0,
  ICON: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/></svg>',
  mount() {
    if (this.btn) return; const b = document.createElement('button'); b.id = 'doorbtn'; b.className = 'doorbtn'; b.style.display = 'none'; b.onclick = () => DOOR.press();
    (document.getElementById('app') || document.body).appendChild(b); this.btn = b
  },
  /* called whenever the player switches between Home / Buy / Map / Phone */
  set(w) {
    this.view = w; this.mount(); clearInterval(this.timer);
    if (w === 'home' || w === 'map') { this.paint(); if (w === 'map') this.timer = setInterval(() => this.paint(), 500) } else this.btn.style.display = 'none'
  },
  paint() {
    const b = this.btn; if (!b) return; b.style.display = 'flex';
    if (this.view === 'home') { b.dataset.mode = 'out'; b.innerHTML = this.ICON + '<span>Step outside</span>'; return }
    const near = !!(window.MAP3D && MAP3D.nearHome && MAP3D.nearHome());
    b.dataset.mode = near ? 'in' : 'walk'; b.innerHTML = this.ICON + '<span>' + (near ? 'Step inside' : 'Walk home') + '</span>'
  },
  press() {
    const m = this.btn && this.btn.dataset.mode;
    if (m === 'out') { nav('map'); setTimeout(() => { if (window.MAP3D && MAP3D.stepOutside) MAP3D.stepOutside() }, 80) }
    else if (m === 'in') nav('home')
    else if (m === 'walk' && window.MAP3D && MAP3D.walkHome) { MAP3D.walkHome(); if (typeof toast === 'function') toast('🚶 Heading home…') }
  }
};
window.DOOR = DOOR;
(function () { const nav0 = window.nav; if (typeof nav0 === 'function') { window.nav = function (w) { const r = nav0.apply(this, arguments); try { DOOR.set(w) } catch (e) { } return r } } })();
setTimeout(() => { try { DOOR.set('home') } catch (e) { } }, 0);
