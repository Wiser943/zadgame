/* Leaderboard app: richest, most wins and best rating, shown as a podium (top 3) with a list under it.
   Only draws what /api/leaderboard returns. */
const LB = {
  by: 'coins', D: null,
  naira: n => '₦' + Math.round(n || 0).toLocaleString('en-NG'),
  /* 3,210,000 -> ₦3.21m, 63,840 -> ₦63,840 */
  short(n) {
    n = Math.round(n || 0); const a = Math.abs(n);
    const f = (v, s) => '₦' + (Math.floor(v * 100) / 100).toString().replace(/\.0+$/, '') + s;
    return a >= 1e9 ? f(n / 1e9, 'b') : a >= 1e6 ? f(n / 1e6, 'm') : '₦' + n.toLocaleString('en-NG');
  },
  css() {
    if (document.getElementById('lbcss')) return;
    const s = document.createElement('style'); s.id = 'lbcss';
    s.textContent = `
.lbk{padding-bottom:26px}
.lbk .lbseg{margin-bottom:12px}
.lbk .lbhero{background:#fff8ee;border:1px solid #fde7c8;border-radius:22px;padding:14px 12px 14px;margin-bottom:12px}
.lbk .lbhd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 8px}
.lbk .lbhd b{font-weight:800;font-size:17px;line-height:1.2;color:#1f2430}.lbk .lbhd span{font-weight:700;font-size:11px;line-height:1;color:#b45309;background:#ffedd5;border-radius:999px;padding:5px 9px;white-space:nowrap}
.lbpod{display:flex;align-items:flex-end;justify-content:center;gap:8px}
.lbpc{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;text-align:center}
.lbpc .lbmed{font-size:20px;line-height:1;margin-bottom:-6px;position:relative;z-index:2}
.lbpc.p1 .lbmed{font-size:26px}
.lbpc .avi{width:62px;height:62px;font-size:24px;border:3px solid #fff;box-shadow:0 6px 16px rgba(0,0,0,.14)}
.lbpc.p1 .avi{width:78px;height:78px;font-size:30px;border-color:#fcd34d}
.lbpc.p2 .avi{border-color:#cbd5e1}.lbpc.p3 .avi{border-color:#e0a070}
.lbpc .lbn{margin-top:7px;max-width:100%;font-weight:700;font-size:14px;line-height:1.2;color:#1f2430;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbpc .lbn small{font-weight:700;font-size:9px;line-height:1;color:#fff;background:#6366f1;border-radius:6px;padding:2px 5px;margin-left:3px;vertical-align:middle}
.lbpc .lbv{margin-top:3px;font-weight:800;font-size:17px;line-height:1.15;color:#ea580c}.lbpc.p1 .lbv{font-size:20px}
.lbpc .lbs{margin-top:2px;font-weight:500;font-size:11px;line-height:1.3;color:#8a90a2}
.lbpc .lbbl{width:100%;margin-top:9px;border-radius:12px 12px 6px 6px;display:grid;place-items:center;font-weight:800;font-size:24px;line-height:1;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.18)}
.lbpc.p1 .lbbl{height:62px;background:linear-gradient(#fcd34d,#f5b021)}
.lbpc.p2 .lbbl{height:46px;background:linear-gradient(#cdd5e1,#9aa7ba)}
.lbpc.p3 .lbbl{height:36px;background:linear-gradient(#f59e55,#e0701f)}
.lbrow{display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #eef0f5;border-radius:18px;padding:10px 14px;margin-bottom:9px;box-shadow:0 1px 0 rgba(20,24,40,.03)}
.lbrow.me{border-color:#a5b4fc;background:#f5f6ff}
.lbrow .lbrk{flex:none;width:34px;height:34px;border-radius:50%;background:#f1f3f8;display:grid;place-items:center;font-weight:800;font-size:14px;line-height:1;color:#566}
.lbrow .lbav .avi{width:38px;height:38px;font-size:15px}
.lbrow .lbmid{flex:1;min-width:0}
.lbrow .lbnm{display:block;font-weight:700;font-size:15px;line-height:1.25;color:#1f2430;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbrow .lbnm small{font-weight:700;font-size:9px;line-height:1;color:#fff;background:#6366f1;border-radius:6px;padding:2px 5px;margin-left:4px;vertical-align:middle}
.lbrow .lbsub{display:block;margin-top:2px;font-weight:500;font-size:12px;line-height:1.3;color:#8a90a2}
.lbrow .lbval{flex:none;font-weight:800;font-size:16px;line-height:1;color:#ea580c;text-align:right}.lbrow .lbval small{font-weight:600;font-size:11px;line-height:1;color:#9aa0b2;margin-left:2px}
.lbk .lbgap{margin:14px 4px 8px;font-weight:700;font-size:12px;line-height:1;color:#8a90a2;letter-spacing:.06em;text-transform:uppercase}
.lbk .lbempty{text-align:center;color:#8a90a2;padding:26px 8px}
html[data-theme="dark"] .lbk .lbhero{background:#2a2118;border-color:#4a3720}
html[data-theme="dark"] .lbk .lbhd b,html[data-theme="dark"] .lbpc .lbn,html[data-theme="dark"] .lbrow .lbnm{color:#f2f4fa}
html[data-theme="dark"] .lbrow{background:#171b2b;border-color:#262c44}
html[data-theme="dark"] .lbrow.me{background:#1d2140;border-color:#4f56c9}
html[data-theme="dark"] .lbrow .lbrk{background:#232944;color:#c7cde4}
html[data-theme="dark"] .lbpc .avi{border-color:#171b2b}
`;
    document.head.appendChild(s);
  },
  async open() {
    this.css();
    try { PH.pauseGistMedia() } catch (e) { }
    const sc = document.querySelector('.screen'); if (sc) sc.classList.add('light');   /* same first step PH.open takes for every other app: it is what makes the app screen show */
    PH.view = 'lb'; PH.TINT.lb = '#f7f3e6';
    PH.shell('Leaderboard', 'PH.close()', '<div class="abody lbk" id="ab"><p class="empty">Loading…</p></div>');
    await this.load()
  },
  async load() {
    try { this.D = await NET.api('/api/leaderboard?by=' + this.by + '&limit=50'); if (PH.view === 'lb') this.draw() }
    catch (e) { const ab = document.getElementById('ab'); if (ab) ab.innerHTML = `<p class="empty">${esc(e.message || 'Could not load the leaderboard.')}</p><button class="btn p" onclick="LB.open()">Try again</button>` }
  },
  pick(by) { this.by = by; this.D = null; const ab = document.getElementById('ab'); if (ab) ab.innerHTML = '<p class="empty">Loading…</p>'; this.load() },
  main(u) { return this.by === 'wins' ? ((u.stats && u.stats.wins) || 0) + ' wins' : this.by === 'rating' ? Math.round(u.rating || 1000) + ' rating' : this.short(u.coins) },
  sub(u) {
    const w = (u.stats && u.stats.wins) || 0, g = (u.stats && u.stats.gamesPlayed) || 0;
    return this.by === 'coins' ? `${w} wins · ${g} games` : this.by === 'wins' ? `${g} games · ${Math.round(u.rating || 1000)} rating` : `${w} wins · ${g} games`;
  },
  avatar(u) { return PH.av ? PH.av({ displayName: u.displayName, avatar: u.avatar }, 1) : '' },
  you(me) { return me ? ' <small>you</small>' : '' },
  pod(u, k, myId) {
    if (!u) return '';
    const medal = ['', '🥇', '🥈', '🥉'][u.rank];
    return `<div class="lbpc p${u.rank}"><span class="lbmed">${medal}</span>${this.avatar(u)}<div class="lbn">${esc(u.displayName || 'Player')}${this.you(u.id === myId)}</div><div class="lbv">${this.main(u)}</div><div class="lbs">${this.sub(u)}</div><div class="lbbl">${u.rank}</div></div>`;
  },
  row(u, me) {
    return `<div class="lbrow${me ? ' me' : ''}"><span class="lbrk">${u.rank}</span><span class="lbav">${this.avatar(u)}</span><span class="lbmid"><span class="lbnm">${esc(u.displayName || 'Player')}${this.you(me)}</span><span class="lbsub">${this.sub(u)}</span></span><span class="lbval">${this.main(u)}</span></div>`;
  },
  draw() {
    const ab = document.getElementById('ab'), D = this.D; if (!ab || !D) return;
    const tabs = [['coins', 'Richest'], ['wins', 'Most wins'], ['rating', 'Best rating']];
    const myId = D.me && D.me.id, L = D.leaderboard || [];
    const top = L.slice(0, 3), rest = L.slice(3);
    const title = this.by === 'coins' ? 'Richest players' : this.by === 'wins' ? 'Most wins' : 'Best rated';
    ab.innerHTML = `<div class="seg2 lbseg">${tabs.map(t => `<button class="${this.by === t[0] ? 'on' : ''}" onclick="LB.pick('${t[0]}')">${t[1]}</button>`).join('')}</div>`
      + (top.length ? `<div class="lbhero"><div class="lbhd"><b>🏆 ${title}</b>${D.me ? `<span>Your rank: #${D.me.rank}</span>` : ''}</div><div class="lbpod">${this.pod(top[1], 2, myId)}${this.pod(top[0], 1, myId)}${this.pod(top[2], 3, myId)}</div></div>` : '<p class="lbempty">Nobody here yet.</p>')
      + rest.map(u => this.row(u, u.id === myId)).join('')
      + (D.me && D.me.outsideTop ? `<p class="lbgap">Your place</p>${this.row(D.me, true)}` : '')
  }
};
window.LB = LB;
