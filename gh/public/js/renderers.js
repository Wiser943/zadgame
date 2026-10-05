/* Optional renderer layer: the game remains playable with DOM/CSS when these libraries are unavailable. */
window.GHRenderers = {
  enhance(root, kind, state) {
    if (!root || !state) return;
    root.dataset.renderer = 'canvas-ready';
    // Lightweight Canvas glow used by new games; no framework or build step required.
    if (!root.querySelector('canvas')) return;
    const canvas = root.querySelector('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * dpr); canvas.height = Math.max(1, rect.height * dpr);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);
    const glow = ctx.createRadialGradient(rect.width/2, rect.height/2, 10, rect.width/2, rect.height/2, rect.width/2);
    glow.addColorStop(0, 'rgba(247,197,43,.18)'); glow.addColorStop(1, 'rgba(143,16,23,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, rect.width, rect.height);
  },
  loadLibrary(name) {
    const urls = { phaser:'https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js', pixi:'https://cdn.jsdelivr.net/npm/pixi.js@8.2.5/dist/pixi.min.js', three:'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.min.js' };
    if (!urls[name] || document.querySelector(`script[data-gh-lib="${name}"]`)) return Promise.resolve(window[name]);
    return new Promise((resolve, reject) => { const s=document.createElement('script'); s.src=urls[name]; s.dataset.ghLib=name; s.onload=()=>resolve(window[name]); s.onerror=reject; document.head.appendChild(s); });
  }
};
