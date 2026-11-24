/* Keyboard shortcuts (desktop): a "Keyboard" button that opens the list, plus the keys themselves.
   Only shortcuts that are wired up in this build are listed. Keys are ignored while typing in a field. */
const KEYS = {
  list: [
    ['N', 'Open the map'], ['H', 'Home'], ['B', 'Buy mode (at home)'], ['P', 'Phone'], ['S', "Your Sim's needs"],
    ['C', 'Catalogue (Buy mode)'], ['← ↑ → ↓', 'Move furniture (Buy mode)'], ['R', 'Rotate furniture'], ['Enter', 'Place / confirm'], ['Del', 'Sell selected furniture'], ['Esc', 'Close / cancel'], ['K', 'Show or hide this list']
  ],
  fine() { try { return window.matchMedia('(min-width:768px) and (min-height:520px) and (pointer:fine)').matches } catch (e) { return false } },
  typing(e) { const t = e.target, n = t && t.tagName; return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || (t && t.isContentEditable) },
  open() {
    SHEET.open({ id: 'keys', title: '⌨️ Keyboard shortcuts', body: () => `<p class="hsub">Play Lagos Life without a mouse</p>${this.list.map(([k, t]) => `<div class="kbrow"><kbd>${UI.esc(k)}</kbd><span>${UI.esc(t)}</span></div>`).join('')}` });
  },
  toggle() { if (SHEET.isOpen('keys')) SHEET.close(); else this.open() },
  mount() {
    if (document.getElementById('kbbtn')) return; const b = document.createElement('button'); b.id = 'kbbtn'; b.type = 'button'; b.className = 'pill'; b.innerHTML = '⌨️ Keyboard'; b.setAttribute('aria-label', 'Show keyboard shortcuts'); b.onclick = () => this.toggle(); document.body.appendChild(b); this.sync();
  },
  sync() { const b = document.getElementById('kbbtn'); if (b) b.style.display = this.fine() ? 'block' : 'none' },
  key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || this.typing(e)) return; const k = e.key, K = k.length === 1 ? k.toUpperCase() : k, buy = S.page === 'buy' && !!window.BUY;
    if (K === 'K' || K === '?') { e.preventDefault(); return this.toggle() }
    if (k === 'Escape') { if (document.getElementById('lgm')) { SHEET.close(); e.preventDefault() } return }
    if (document.getElementById('lgm')) return;           // a sheet is open: let it have the keys
    const go = (fn) => { e.preventDefault(); fn() };
    if (K === 'N') return go(() => nav('map')); if (K === 'H') return go(() => nav('home')); if (K === 'P') return go(() => nav('phone')); if (K === 'B') return go(() => nav('buy')); if (K === 'S') return go(() => toggleNeeds());
    if (buy) {
      if (K === 'C') return go(() => BUY.openSheet()); if (K === 'R') return go(() => BUY.g ? BUY.spin() : BUY.turn()); if (k === 'Enter') return go(() => BUY.commit()); if (k === 'Delete') return go(() => BUY.sell());
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k]; if (d && BUY.g) return go(() => BUY.nudge(d[0], d[1]));
    }
  },
  init() { this.mount(); document.addEventListener('keydown', e => this.key(e)); try { window.matchMedia('(min-width:768px) and (min-height:520px) and (pointer:fine)').addEventListener('change', () => this.sync()) } catch (e) {} window.addEventListener('resize', () => this.sync()) }
};
window.KEYS = KEYS; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => KEYS.init()); else KEYS.init();
