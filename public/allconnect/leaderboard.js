/* Leaderboard app: richest, most wins and best rating. Only draws what /api/leaderboard returns. */
const LB = {
  by: 'coins', D: null,
  naira: n => '₦' + Math.round(n || 0).toLocaleString('en-NG'),
  async open() {
    PH.view = 'lb'; PH.TINT.lb = '#f7f3e6';
    PH.shell('Leaderboard', 'PH.close()', '<div class="abody lbk" id="ab"><p class="empty">Loading…</p></div>');
    await this.load()
  },
  async load() {
    try { this.D = await NET.api('/api/leaderboard?by=' + this.by + '&limit=50'); if (PH.view === 'lb') this.draw() }
    catch (e) { const ab = document.getElementById('ab'); if (ab) ab.innerHTML = `<p class="empty">${esc(e.message || 'Could not load the leaderboard.')}</p><button class="btn p" onclick="LB.open()">Try again</button>` }
  },
  pick(by) { this.by = by; this.D = null; const ab = document.getElementById('ab'); if (ab) ab.innerHTML = '<p class="empty">Loading…</p>'; this.load() },
  val(u) { return this.by === 'wins' ? ((u.stats && u.stats.wins) || 0) + ' wins' : this.by === 'rating' ? Math.round(u.rating || 1000) + ' rating' : this.naira(u.coins) },
  row(u, me) {
    const medal = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : '#' + u.rank;
    return `<div class="lbrow${me ? ' me' : ''}"><span class="lbrk">${medal}</span><span class="lbav">${PH.av ? PH.av({ displayName: u.displayName, avatar: u.avatar }, 1) : ''}</span><span class="lbnm">${esc(u.displayName || 'Player')}${me ? ' <small>you</small>' : ''}</span><b class="lbv">${esc(this.val(u))}</b></div>`
  },
  draw() {
    const ab = document.getElementById('ab'), D = this.D; if (!ab || !D) return;
    const tabs = [['coins', 'Richest'], ['wins', 'Most wins'], ['rating', 'Best rating']];
    const myId = D.me && D.me.id;
    ab.innerHTML = `<div class="seg2 lbseg">${tabs.map(t => `<button class="${this.by === t[0] ? 'on' : ''}" onclick="LB.pick('${t[0]}')">${t[1]}</button>`).join('')}</div>`
      + `<div class="lblist">${(D.leaderboard || []).map(u => this.row(u, u.id === myId)).join('') || '<p class="empty">Nobody here yet.</p>'}</div>`
      + (D.me && D.me.outsideTop ? `<p class="lbgap">Your place</p><div class="lblist">${this.row(D.me, true)}</div>` : '')
  }
};
window.LB = LB;
