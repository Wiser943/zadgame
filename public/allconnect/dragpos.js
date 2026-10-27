/* Movable home-screen buttons: press and hold a control for a moment, then drag it. Where you drop it is saved per
   player and per screen (home / map) in this browser, and applied again the next time you come back. */
const DRAGPOS = {
  ids: ['viewctl', 'emotes', 'doorbtn', 'homeUI'], page: 'home', HOLD: 380, hinted: false,
  key(id, page) { const u = (typeof NET !== 'undefined' && NET.user && NET.user.id) || 'guest'; return 'acdrag:' + u + ':' + (page || this.page) + ':' + id },
  read(id, page) { try { const j = JSON.parse(localStorage.getItem(this.key(id, page)) || 'null'); return j && isFinite(j.x) && isFinite(j.y) ? j : null } catch (e) { return null } },
  write(id, v) { try { localStorage.setItem(this.key(id), JSON.stringify(v)) } catch (e) {} },
  /* put one element where it was saved (fractions of the app box), kept fully on screen */
  place(el, pos) {
    const app = document.getElementById('app'); if (!app || !el) return;
    const A = app.getBoundingClientRect(), r = el.getBoundingClientRect(); if (!A.width) return;
    const w = r.width || 40, h = r.height || 40;
    const x = Math.max(4, Math.min(A.width - w - 4, pos.x * A.width)), y = Math.max(4, Math.min(A.height - h - 4, pos.y * A.height));
    Object.assign(el.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
    if (el.id === 'homeUI') el.style.width = 'auto';
  },
  clear(el) { ['left', 'top', 'right', 'bottom', 'transform', 'width'].forEach(k => el.style[k] = '') },
  apply(page) {
    this.page = page === 'map' ? 'map' : 'home';
    for (const id of this.ids) { const el = document.getElementById(id); if (!el) continue; const p = this.read(id); if (p) this.place(el, p); else this.clear(el) }
  },
  reset() { for (const pg of ['home', 'map']) for (const id of this.ids) { try { localStorage.removeItem(this.key(id, pg)) } catch (e) {} } this.apply(this.page); if (typeof toast === 'function') toast('Buttons are back in their original places') },
  mount() {
    for (const id of this.ids) {
      const el = document.getElementById(id) || null; if (!el || el._dp) continue; el._dp = 1;
      let t = 0, on = false, sx = 0, sy = 0, ox = 0, oy = 0, pid = null, moved = false;
      const app = () => document.getElementById('app').getBoundingClientRect();
      const stop = () => { clearTimeout(t); if (on) { el.classList.remove('dragpos-on'); const A = app(), r = el.getBoundingClientRect(); if (moved) this.write(id, { x: (r.left - A.left) / A.width, y: (r.top - A.top) / A.height }) } on = false; pid = null };
      el.addEventListener('pointerdown', e => {
        if (e.button > 0) return; sx = e.clientX; sy = e.clientY; pid = e.pointerId; moved = false;
        clearTimeout(t); t = setTimeout(() => {
          const r = el.getBoundingClientRect(), A = app(); on = true; ox = r.left - A.left; oy = r.top - A.top; el.classList.add('dragpos-on');
          Object.assign(el.style, { left: ox + 'px', top: oy + 'px', right: 'auto', bottom: 'auto', transform: 'none' }); if (id === 'homeUI') el.style.width = r.width + 'px';
          try { el.setPointerCapture(pid) } catch (x) {} if (navigator.vibrate) try { navigator.vibrate(12) } catch (x) {}
        }, this.HOLD);
      }, true);
      el.addEventListener('pointermove', e => {
        if (!on) { if (pid === e.pointerId && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) clearTimeout(t); return }
        e.preventDefault(); moved = true; const A = app(), r = el.getBoundingClientRect();
        const x = Math.max(4, Math.min(A.width - r.width - 4, ox + e.clientX - sx)), y = Math.max(4, Math.min(A.height - r.height - 4, oy + e.clientY - sy));
        el.style.left = x + 'px'; el.style.top = y + 'px';
      });
      ['pointerup', 'pointercancel'].forEach(n => el.addEventListener(n, () => { const was = on && moved; stop(); if (was) el._swallow = Date.now() }));
      el.addEventListener('click', e => { if (on || (el._swallow && Date.now() - el._swallow < 400)) { e.stopPropagation(); e.preventDefault() } }, true);
      el.addEventListener('contextmenu', e => { if (on) e.preventDefault() });
    }
    if (!this.hinted && !localStorage.getItem('acdrag:hint')) { this.hinted = true; setTimeout(() => { if (typeof toast === 'function') toast('Tip: hold a side button, then drag to move it'); try { localStorage.setItem('acdrag:hint', '1') } catch (e) {} }, 6000) }
  }
};
window.DRAGPOS = DRAGPOS;
(function () { const n0 = window.nav; if (typeof n0 === 'function') window.nav = function (w) { const r = n0.apply(this, arguments); try { DRAGPOS.mount(); setTimeout(() => DRAGPOS.apply(w), 0) } catch (e) {} return r } })();
window.addEventListener('resize', () => { try { DRAGPOS.apply(DRAGPOS.page) } catch (e) {} });
setTimeout(() => { try { DRAGPOS.mount(); DRAGPOS.apply('home') } catch (e) {} }, 0);
