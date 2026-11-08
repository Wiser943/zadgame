/* Step outside: a button on the home screen takes your character out the door onto the street (the map). It's home-only
   now — it used to also sit on the map ("Step inside" near your door, or "Walk home" further away), but that's been
   removed from the map screen; getting back home from the street still works via the map's own city/home navigation. */
const DOOR = {
  btn: null, view: 'home', timer: 0,
  ICON: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/></svg>',
  mount() {
    if (this.btn) return; const b = document.createElement('button'); b.id = 'doorbtn'; b.className = 'doorbtn'; b.style.display = 'none'; b.onclick = () => DOOR.press();
    (document.getElementById('app') || document.body).appendChild(b); this.btn = b
  },
  /* called whenever the player switches between Home / Buy / Map / Phone */
  set(w) {
    this.view = w; this.mount(); clearInterval(this.timer); if (w === 'home' && window.MAP3D && MAP3D.inside) MAP3D.inside();
    if (w === 'home') this.paint(); else this.btn.style.display = 'none'
  },
  paint() {
    const b = this.btn; if (!b) return; b.style.display = 'flex';
    b.dataset.mode = 'out'; b.innerHTML = this.ICON + '<span>Step outside</span>'
  },
  press() {
    if ((this.btn && this.btn.dataset.mode) === 'out') { nav('map'); setTimeout(() => { if (window.MAP3D && MAP3D.stepOutside) MAP3D.stepOutside() }, 80) }
  }
};
window.DOOR = DOOR;
(function () { const nav0 = window.nav; if (typeof nav0 === 'function') { window.nav = function (w) { const r = nav0.apply(this, arguments); try { DOOR.set(w) } catch (e) { } return r } } })();
setTimeout(() => { try { DOOR.set('home') } catch (e) { } }, 0);
