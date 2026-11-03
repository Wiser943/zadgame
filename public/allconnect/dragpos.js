/* Movable home / map buttons. Press and hold ANY floating button for a moment, then drag it: every button moves on its
   own. Where you drop it is saved per player and per screen (home / map) and applied again on the next visit.
   Positions are stored as an offset from the button's normal place (so they still make sense after the layout changes),
   and applied with the CSS `translate` property, which never fights the buttons' own transforms. */
const DRAGPOS = {
  page: 'home', HOLD: 360, hinted: false,
  /* selector -> id. Each match is its own draggable button. */
  targets: [['#viewctl', 'viewctl'], ['#emotes > button', 'emo'], ['#doorbtn', 'door'], ['#homeUI .quest', 'quest'], ['#homeUI .clean', 'clean'], ['#usebar', 'usebar']],
  uid() { return (typeof NET !== 'undefined' && NET.user && NET.user.id) || 'guest' },
  keyOf(el) { return el._dpId },
  key(id, page) { return 'acdrag2:' + this.uid() + ':' + (page || this.page) + ':' + id },
  read(id) { try { const j = JSON.parse(localStorage.getItem(this.key(id)) || 'null'); return j && isFinite(j.x) && isFinite(j.y) ? j : null } catch (e) { return null } },
  write(id, v) { try { if (v) localStorage.setItem(this.key(id), JSON.stringify(v)); else localStorage.removeItem(this.key(id)) } catch (e) {} },
  appBox() { const a = document.getElementById('app'); return a ? a.getBoundingClientRect() : null },
  cur(el) { return { x: el._dx || 0, y: el._dy || 0 } },
  set(el, x, y) { el._dx = x; el._dy = y; el.style.translate = (x || y) ? x + 'px ' + y + 'px' : '' },
  /* keep the button fully inside the app box; (nx, ny) is the wanted offset in px */
  clamp(el, nx, ny) {
    const A = this.appBox(); if (!A) return [nx, ny]; const r = el.getBoundingClientRect(), c = this.cur(el);
    const nat = { l: r.left - c.x, t: r.top - c.y }, M = 4;
    const minX = A.left + M - nat.l, maxX = A.right - M - r.width - nat.l, minY = A.top + M - nat.t, maxY = A.bottom - M - r.height - nat.t;
    return [Math.max(Math.min(minX, maxX), Math.min(maxX, nx)), Math.max(Math.min(minY, maxY), Math.min(maxY, ny))];
  },
  applyOne(el) {
    const p = this.read(el._dpId), A = this.appBox();
    if (!p || !A || !A.width) return this.set(el, 0, 0);
    const [x, y] = this.clamp(el, p.x * A.width, p.y * A.height); this.set(el, x, y);
  },
  apply(page) { if (page) this.page = page === 'map' ? 'map' : 'home'; this.mount(); document.querySelectorAll('[data-dp]').forEach(el => this.applyOne(el)) },
  reset() { for (const pg of ['home', 'map']) for (const el of document.querySelectorAll('[data-dp]')) { try { localStorage.removeItem(this.key(el._dpId, pg)) } catch (e) {} } document.querySelectorAll('[data-dp]').forEach(el => this.set(el, 0, 0)); if (typeof toast === 'function') toast('Buttons are back in their original places') },
  /* give every matching button an id (quests by their own class, emotes by order) and the drag behaviour */
  mount() {
    for (const [sel, base] of this.targets) {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (el._dp) return; el._dp = 1;
        const cls = base === 'quest' ? ((el.className.match(/\bq\d\b/) || ['q' + i])[0]) : '';
        el._dpId = base === 'emo' ? 'emo' + i : base === 'quest' ? cls : base; el.setAttribute('data-dp', '1'); this.bind(el); this.applyOne(el);
      });
    }
    if (!this.hinted && !localStorage.getItem('acdrag:hint')) { this.hinted = true; setTimeout(() => { if (typeof toast === 'function') toast('Tip: hold any button, then drag it where you like'); try { localStorage.setItem('acdrag:hint', '1') } catch (e) {} }, 6000) }
  },
  bind(el) {
    let t = 0, on = false, sx = 0, sy = 0, ox = 0, oy = 0, pid = null, moved = false;
    const move = e => {
      if (e.pointerId !== pid) return;
      if (!on) { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) { clearTimeout(t); off() } return }
      e.preventDefault(); moved = true; const [x, y] = this.clamp(el, ox + e.clientX - sx, oy + e.clientY - sy); this.set(el, x, y);
    };
    const up = e => { if (e.pointerId !== pid) return; clearTimeout(t); const was = on; off(); if (was) { el.classList.remove('dragpos-on'); if (moved) { const A = this.appBox(), c = this.cur(el); if (A && A.width) this.write(el._dpId, (Math.abs(c.x) + Math.abs(c.y) < 1) ? null : { x: c.x / A.width, y: c.y / A.height }); el._swallow = Date.now() } } on = false; pid = null };
    const off = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); if (!on) pid = null };
    el.addEventListener('pointerdown', e => {
      if (e.button > 0 || pid !== null) return; sx = e.clientX; sy = e.clientY; pid = e.pointerId; moved = false; on = false;
      window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
      clearTimeout(t); t = setTimeout(() => { const c = this.cur(el); ox = c.x; oy = c.y; on = true; el.classList.add('dragpos-on'); if (navigator.vibrate) try { navigator.vibrate(12) } catch (x) {} }, this.HOLD);
    }, true);
    el.addEventListener('click', e => { if (on || (el._swallow && Date.now() - el._swallow < 450)) { e.stopPropagation(); e.preventDefault() } }, true);
    el.addEventListener('contextmenu', e => { e.preventDefault() });
  }
};
window.DRAGPOS = DRAGPOS;
(function () { const n0 = window.nav; if (typeof n0 === 'function') window.nav = function (w) { const r = n0.apply(this, arguments); try { setTimeout(() => DRAGPOS.apply(w), 0); setTimeout(() => DRAGPOS.apply(w), 600) } catch (e) {} return r } })();
window.addEventListener('resize', () => { try { DRAGPOS.apply() } catch (e) {} });
setInterval(() => { try { DRAGPOS.mount() } catch (e) {} }, 2000);   // pick up buttons created later (door, quests, sleep bar)
setTimeout(() => { try { DRAGPOS.apply('home') } catch (e) {} }, 0);
