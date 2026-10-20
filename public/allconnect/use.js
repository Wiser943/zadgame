/* Use your furniture: tap a bed, chair, sofa, toilet, shower, cooker ... in your home and a sheet offers what you can do
   with it. Pick one and your character walks over and does it (lies down, sits, ...), for a few seconds, and your needs go up.
   The walking + poses live in room3d.js / models3d.js; this file is the catalogue of actions, the sheet and the needs. */
const USE = {
  // needs: 0 hunger, 1 energy, 2 fun, 3 social, 4 hygiene, 5 bladder (same order as S.needs in app.js)
  ICON: ['🥧', '⚡', '🎉', '💬', '🫧', '🚽'],
  ACTS: {
    bed: [
      { id: 'sleep', label: 'Sleep', sec: 45, pose: 'lie', fx: [[1, .6]], doing: 'Sleeping…', done: 'You feel rested 😴' },
      { id: 'nap', label: 'Nap', sec: 15, pose: 'lie', fx: [[1, .2]], doing: 'Napping…', done: 'Quick nap done' },
      { id: 'liein', label: 'Lie in', sec: 20, pose: 'lie', fx: [[1, .08], [2, .06]], doing: 'Lying in…', done: 'Nice and cosy' },
      { id: 'dress', label: 'Change outfit', style: true, hint: 'Open Style' }
    ],
    chair: [
      { id: 'sit', label: 'Sit', sec: 10, pose: 'sit', fx: [[1, .03]], doing: 'Sitting…', done: '' },
      { id: 'rest', label: 'Rest', sec: 30, pose: 'sit', fx: [[1, .12]], doing: 'Resting…', done: 'Feeling refreshed' }
    ],
    sofa: [
      { id: 'sit', label: 'Sit', sec: 10, pose: 'sit', fx: [[1, .03]], doing: 'Sitting…', done: '' },
      { id: 'rest', label: 'Rest', sec: 30, pose: 'sit', fx: [[1, .12]], doing: 'Resting…', done: 'Feeling refreshed' },
      { id: 'chill', label: 'Chill', sec: 20, pose: 'sit', fx: [[2, .12]], doing: 'Chilling…', done: 'Good vibes 🎉' }
    ],
    toilet: [{ id: 'wc', label: 'Use toilet', sec: 10, pose: 'sit', fx: [[5, .8]], doing: 'Using the toilet…', done: 'Much better 🚽' }],
    shower: [{ id: 'shower', label: 'Take a shower', sec: 20, pose: 'stand', fx: [[4, .6]], doing: 'Showering…', done: 'Squeaky clean 🫧' }],
    bucket: [{ id: 'wash', label: 'Wash up', sec: 12, pose: 'stand', fx: [[4, .3]], doing: 'Washing up…', done: 'Fresh and clean' }],
    cooker: [{ id: 'cook', label: 'Cook', sec: 15, pose: 'stand', fx: [[0, .25]], doing: 'Cooking…', done: 'Smells great 🍲' }],
    fridge: [{ id: 'snack', label: 'Grab a snack', sec: 6, pose: 'stand', fx: [[0, .12], [2, .03]], doing: 'Snacking…', done: 'Tasty 😋' }],
    cooler: [{ id: 'eat', label: 'Eat jollof', sec: 8, pose: 'stand', fx: [[0, .4]], doing: 'Eating…', done: 'Yum! Ate jollof 🍛' }],
    table: [{ id: 'meal', label: 'Have a meal', sec: 12, pose: 'stand', fx: [[0, .35]], doing: 'Eating…', done: 'Yum! Ate jollof 🍛' }]
  },
  HINT: { bed: 'Rest or freshen up', chair: 'Take a seat', stool: 'Take a seat', sofa: 'Take a seat', armchair: 'Take a seat', toilet: 'Nature calls', shower: 'Freshen up', bucket: 'Freshen up', cooker: 'Make something to eat', fridge: 'See what is inside', cooler: 'Something to eat', table: 'Time to eat' },
  kindOf(it) { const D = window.FURN && FURN.ITEMS[it.name]; const k = D && D.kind; return k === 'armchair' ? 'sofa' : k === 'stool' ? 'chair' : k },
  actsFor(it) { return this.ACTS[this.kindOf(it)] || [] },
  el: null, bar: null, timer: 0, cur: null,
  mount() {
    if (this.el) return; const host = (document.getElementById('buy') || document.body).parentNode || document.body;
    this.el = document.createElement('div'); this.el.id = 'use'; this.el.style.display = 'none'; host.appendChild(this.el);
    this.bar = document.createElement('div'); this.bar.id = 'usebar'; this.bar.style.display = 'none'; host.appendChild(this.bar);
  },
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) },
  /* open the sheet for a tapped item; returns false when there is nothing to do with it (the caller keeps its old behaviour) */
  open(id) {
    const it = (S.items || []).find(i => i.id === id); if (!it) return false; const acts = this.actsFor(it); if (!acts.length) return false;
    this.mount(); const k = this.kindOf(it);
    this.el.innerHTML = `<div class="sheet usesheet"><h2>${this.esc(it.name)}<small onclick="USE.close()">✕</small></h2><p class="usesub">${this.esc(this.HINT[window.FURN && FURN.ITEMS[it.name] && FURN.ITEMS[it.name].kind] || this.HINT[k] || '')}</p>` +
      `<div class="uacts">${acts.map(a => `<button class="uact" onclick="USE.run('${this.esc(id)}','${a.id}')"><span class="u1"><b>${this.esc(a.label)}</b>${a.sec ? `<i>${a.sec} s</i>` : ''}</span><span class="u2">${a.style ? this.esc(a.hint || '') : 'Free'}</span><span class="u3">${(a.fx || []).map(f => `<em>${this.ICON[f[0]]} +${Math.round(f[1] * 100)}</em>`).join('')}</span></button>`).join('')}</div></div>`;
    this.el.style.display = 'block'; return true
  },
  close() { if (this.el) this.el.style.display = 'none' },
  run(id, actId) {
    const it = (S.items || []).find(i => i.id === id), act = it && this.actsFor(it).find(a => a.id === actId); this.close(); if (!it || !act) return;
    if (act.style) { if (window.STYLE && STYLE.open) STYLE.open(); return }
    this.stop(true);
    const cb = { done: (frac, cancelled) => this.finish(act, frac, cancelled), fail: m => { if (typeof toast === 'function') toast(m) } };
    this.cur = { act, id }; ROOM3D.useItem(it, act, cb);
    this.watch()
  },
  /* needs go up in proportion to how much of the action was done */
  finish(act, frac, cancelled) {
    this.cur = null; this.hideBar(); if (!(frac > 0)) return;
    (act.fx || []).forEach(f => { S.needs[f[0]] = Math.min(1, S.needs[f[0]] + f[1] * frac) });
    if (typeof render === 'function') render();
    if (typeof toast === 'function') toast(cancelled ? 'You got up early' : (act.done || 'Done'));
    if (!cancelled && window.PH && act.done) PH.local_('✨', act.done, 'good')
  },
  stop(silent) { if (window.ROOM3D && ROOM3D.act) ROOM3D.endAct(true); this.hideBar() },
  /* the little "Sleeping… 31 s  [Stop]" pill while the action runs */
  watch() {
    this.mount(); clearInterval(this.timer);
    this.timer = setInterval(() => {
      const A = window.ROOM3D && ROOM3D.act;
      if (!A) { if (this.cur && !ROOM3D.pending) { this.hideBar() } return }
      const left = Math.max(0, Math.ceil((A.dur - (performance.now() - A.t0)) / 1000));
      this.bar.innerHTML = `<span>${this.esc(A.act.doing || 'Doing…')} <b>${left} s</b></span><button onclick="USE.stop()">${A.kind === 'lie' ? 'Wake up' : A.kind === 'sit' ? 'Get up' : 'Stop'}</button>`; this.bar.style.display = 'flex'
    }, 250)
  },
  hideBar() { if (this.bar) this.bar.style.display = 'none'; if (!this.cur) clearInterval(this.timer) }
};
window.USE = USE;
