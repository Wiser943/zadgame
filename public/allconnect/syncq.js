/* "Tap now, tell the server later."
   A like, save or follow shows on screen at once. The request is held for 30 seconds so that taps which cancel each other out
   (like, then unlike) never reach the server, and everything that is left goes up together in ONE request (POST /api/ac/batch).
   If the page is hidden or closed first, whatever is waiting is sent right then. */
const SYNCQ = {
  q: new Map(), timer: 0, DELAY: 30000,
  /* key     one thing that can be toggled, for example 'rx:<postId>'
     base    the state the SERVER has right now (taken from the first tap)
     want    the state on screen now
     make    (base, want) => { path, body } the single request that moves the server from base to want
     apply   (serverReply) => void   show what the server finally says
     revert  (meta, message) => void put the screen back if the server refuses
     meta    anything revert needs (stored from the first tap only) */
  queue(key, base, want, make, apply, revert, meta) {
    let e = this.q.get(key);
    if (!e) e = { base, make, meta };
    e.want = want; e.apply = apply; e.revert = revert;
    if (e.want === e.base) this.q.delete(key); else this.q.set(key, e);          // back where it started: nothing to send
    if (this.q.size && !this.timer) this.timer = setTimeout(() => this.flush(), this.DELAY)
  },
  pending() { return this.q.size },
  async flush(unload) {
    clearTimeout(this.timer); this.timer = 0; if (!this.q.size) return;
    const pairs = [...this.q.entries()].map(([k, e]) => ({ k, e, op: e.make(e.base, e.want) })).filter(x => x.op); this.q.clear();
    if (!pairs.length) return;
    const body = { ops: pairs.map(x => x.op) };
    if (unload) { try { navigator.sendBeacon('/api/ac/batch', new Blob([JSON.stringify(body)], { type: 'application/json' })) } catch (e) { } return }
    try {
      const r = await NET.api('/api/ac/batch', { method: 'POST', body });
      pairs.forEach((x, i) => { const res = (r.results || [])[i]; if (res && res.ok) { if (x.e.apply) x.e.apply(res.data || {}) } else if (x.e.revert) x.e.revert(x.e.meta, (res && res.message) || '') })
    } catch (err) {
      pairs.forEach(x => { if (!this.q.has(x.k)) this.q.set(x.k, x.e) });           // network trouble: keep them and try again later
      if (!this.timer) this.timer = setTimeout(() => this.flush(), this.DELAY)
    }
  }
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') SYNCQ.flush(true) });
window.addEventListener('pagehide', () => SYNCQ.flush(true));
window.SYNCQ = SYNCQ;
