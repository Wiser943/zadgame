/* btnbusy.js: any button you tap that starts a save / buy / send request shows a small spinner INSIDE the button until the server answers.
   No per-button code needed: it watches the tap, then the request that tap starts (POST / PUT / PATCH / DELETE only). */
(function () {
  if (window.__btnBusy) return; window.__btnBusy = true;
  const SEL = 'button,.btn,.lgbtn,[role="button"],.uact,.tropt,a.btn';
  let last = null, lastT = 0;
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (b && !b.disabled && !b.classList.contains('is-busy')) { last = b; lastT = Date.now() }
  }, true);
  const raw = window.fetch; if (typeof raw !== 'function') return;
  const mutating = (a) => { const o = a[1] || (a[0] && typeof a[0] === 'object' ? a[0] : {}); return /^(POST|PUT|PATCH|DELETE)$/i.test(o.method || '') };
  function start(b) {
    if (!b._bn) {
      try { b.style.setProperty('--bb-c', getComputedStyle(b).color) } catch (e) {}
      b.classList.add('is-busy'); b.setAttribute('aria-busy', 'true'); b._bt = Date.now()
    }
    b._bn = (b._bn || 0) + 1
  }
  function end(b) {
    b._bn = Math.max(0, (b._bn || 1) - 1); if (b._bn) return;
    const wait = Math.max(0, 380 - (Date.now() - (b._bt || 0)));          // show it long enough to be seen, never flicker
    setTimeout(() => { if (b._bn) return; b.classList.remove('is-busy'); b.removeAttribute('aria-busy'); b.style.removeProperty('--bb-c') }, wait)
  }
  window.fetch = function () {
    const p = raw.apply(this, arguments), b = last && Date.now() - lastT < 500 && last.isConnected ? last : null;
    if (b && mutating(arguments)) { start(b); const done = () => end(b); p.then(done, done) }
    return p
  };
})();
