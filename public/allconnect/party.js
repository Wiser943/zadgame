// House Party: a sheet opened from Homes ("Your place"). Server-authoritative — see routes/acparty.js.
const PARTY = {
  d: null, live: null, openHouse: false, busy: false, joining: '',
  esc: (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  money(n) { return '₦' + Math.round(n || 0).toLocaleString('en-NG'); },
  async open() {
    SHEET.open({ id: 'party', title: '🎉 House Parties', body: () => this.body() });
    await Promise.all([this.load(), this.loadLive()]);
    clearInterval(this.tick); this.tick = setInterval(() => { if (!SHEET.isOpen('party')) return clearInterval(this.tick); this.loadLive(); }, 20000);
  },
  async loadLive() {
    try { this.live = (await NET.api('/api/ac/party/live')).parties; if (SHEET.isOpen('party')) SHEET.paint(); } catch (e) { this.live = this.live || []; }
  },
  // the list of parties other players are throwing, with a Join button on each
  liveHtml() {
    const L = this.live; let h = '<h4>Parties you can join</h4>';
    if (!L) return h + '<p class="empty">Looking for parties…</p>';
    if (!L.length) return h + '<p class="empty">No parties going on right now. Parties from your friends show up here while they last.</p>';
    return h + L.map((x) => `<div class="lgq"><span class="lgi">🎉</span><div><b>${this.esc(x.name)}'s party</b><small>${x.guests}/${x.maxGuests} guests · ${this.left(x.endsAt)} left${x.openHouse ? ' · Open house' : ''}</small></div>
      ${x.joined ? '<button class="lgbtn ghost" disabled>✅ Joined</button>' : x.full ? '<button class="lgbtn ghost" disabled>Full</button>' : `<button class="lgbtn" onclick="PARTY.join('${x.hostId}')">Join</button>`}</div>`).join('') + `<p class="lgnote">Join, then stay until it ends to earn ${this.money(L[0].reward)}.</p>`;
  },
  async load() {
    try { this.d = await NET.api('/api/ac/party/state'); if (SHEET.isOpen('party')) SHEET.paint(); }
    catch (e) { toast(e.message || 'Could not load your party status.'); }
  },
  left(ms) { const s = Math.max(0, Math.round((ms - Date.now()) / 1000)), m = Math.floor(s / 60), sec = s % 60; return m + ':' + String(sec).padStart(2, '0'); },
  body() {
    const d = this.d;
    if (!d) return '<p class="empty">Loading…</p>';
    if (d.active) {
      return `<p>🎵 Music for everyone here, and you're the DJ (free)<br>💃 Dancing and emotes<br>${d.durationMin} minutes, up to ${d.maxGuests} guests<br>${this.money(d.guestReward)} for every guest who stays 5 minutes</p>
        <div class="party-live"><b id="partyClock">${this.left(d.endsAt)}</b><span>left · ${d.guests}/${d.maxGuests} guests${d.openHouse ? ' · Open house' : ''}</span></div>
        <p class="lgnote">Share the word — friends got a notification when you started this.</p>${this.liveHtml()}`;
    }
    return `<p>🎵 Music for everyone here, and you're the DJ (free)<br>💃 Dancing and emotes<br>${d.durationMin} minutes, up to ${d.maxGuests} guests<br>${this.money(d.guestReward)} for you and your guests when it ends (guests who stay 5 minutes)</p>
      <div class="chk-row"><b>Open house</b><p>Your friends, and friends of your guests, can join without an invitation.</p>
        <div class="trchips"><button class="${!this.openHouse ? 'on' : ''}" onclick="PARTY.openHouse=false;SHEET.paint()">Friends only</button><button class="${this.openHouse ? 'on' : ''}" onclick="PARTY.openHouse=true;SHEET.paint()">Open house</button></div></div>
      <p class="lgnote">${d.canStartToday ? `One party a day. Drinks and snacks cost ${this.money(d.cost)}.` : 'You already threw a party today — come back tomorrow.'}</p>
      <div class="trc"><button class="lgbtn big" ${this.busy || !d.canStartToday ? 'disabled' : ''} onclick="PARTY.start()">🎉 Start the party · ${this.money(d.cost)}</button></div>${this.liveHtml()}`;
  },
  async start() {
    if (this.busy) return; this.busy = true; SHEET.paint();
    try {
      this.d = await NET.api('/api/ac/party/start', { method: 'POST', body: { openHouse: this.openHouse } });
      toast('The party has started 🎉');
      if (typeof S !== 'undefined') { S.cash = this.d.cash; if (typeof render === 'function') render(); }
    }
    catch (e) { toast(e.status === 402 ? e.message : e.status === 409 ? e.message : (e.message || 'Could not start the party.')); }
    finally { this.busy = false; SHEET.paint(); }
  },
  // Join a party someone else is throwing: PARTY.join('<hostId>')
  async join(hostId) {
    if (this.joining) return; this.joining = hostId;
    try { const r = await NET.api('/api/ac/party/join/' + encodeURIComponent(hostId), { method: 'POST' }); toast(r.note || 'You joined the party 🎉'); await this.loadLive(); }
    catch (e) { toast(e.message || 'Could not join that party.'); await this.loadLive(); }
    finally { this.joining = ''; }
  }
};
window.PARTY = PARTY;
