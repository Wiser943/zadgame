/* dpad.js: four arrow buttons that do the same job as the on-screen joystick (Settings -> Movement controls: Joystick | Buttons).
   DPAD.html() gives the markup, DPAD.bind(el, cb) calls cb(x, y) with x: -1 left .. 1 right and y: -1 down .. 1 up (0, 0 when nothing is held). */
(function (g) {
  'use strict';
  const DPAD = {
    use() { try { return !!(g.GP && GP.get().move === 'btns') } catch (e) { return false } },
    html() { return '<div class="dpad"><button type="button" data-d="u" aria-label="Forward">▲</button><button type="button" data-d="l" aria-label="Left">◀</button><button type="button" data-d="r" aria-label="Right">▶</button><button type="button" data-d="d" aria-label="Back">▼</button></div>' },
    bind(root, cb) {
      const held = new Set(), fire = () => { const x = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0), y = (held.has('u') ? 1 : 0) - (held.has('d') ? 1 : 0), L = Math.hypot(x, y) || 1; cb(x / L, y / L) };
      root.querySelectorAll('button[data-d]').forEach(b => {
        const d = b.dataset.d, on = e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId) } catch (x) {} held.add(d); b.classList.add('on'); fire() }, off = () => { if (held.delete(d)) { b.classList.remove('on'); fire() } };
        b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off); b.addEventListener('contextmenu', e => e.preventDefault())
      })
    }
  };
  g.DPAD = DPAD;
})(window);
