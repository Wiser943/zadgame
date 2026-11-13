// House Party: a sheet opened from Homes ("Your place"). Server-authoritative — see routes/acparty.js.
const PARTY = {
  d: null, openHouse: false, busy: false,
  esc: (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  money(n) { return '₦' + Math.round(n || 0).toLocaleString('en-NG'); },
  async open() {
    SHEET.open({ id: 'party', title: '🎉 Throw a House Party', body: () => this.body() });
    await this.load();
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
        <p class="lgnote">Share the word — friends got a notification when you started this.</p>`;
    }
    return `<p>🎵 Music for everyone here, and you're the DJ (free)<br>💃 Dancing and emotes<br>${d.durationMin} minutes, up to ${d.maxGuests} guests<br>${this.money(d.guestReward)} for you and your guests when it ends (guests who stay 5 minutes)</p>
      <div class="chk-row"><b>Open house</b><p>Your friends, and friends of your guests, can join without an invitation.</p>
        <div class="trchips"><button class="${!this.openHouse ? 'on' : ''}" onclick="PARTY.openHouse=false;SHEET.paint()">Friends only</button><button class="${this.openHouse ? 'on' : ''}" onclick="PARTY.openHouse=true;SHEET.paint()">Open house</button></div></div>
      <p class="lgnote">${d.canStartToday ? `One party a day. Drinks and snacks cost ${this.money(d.cost)}.` : 'You already threw a party today — come back tomorrow.'}</p>
      <div class="trc"><button class="lgbtn big" ${this.busy || !d.canStartToday ? 'disabled' : ''} onclick="PARTY.start()">🎉 Start the party · ${this.money(d.cost)}</button></div>`;
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
  // Called from a party invite notification/link: PARTY.join('<hostId>')
  async join(hostId) {
    try { const r = await NET.api('/api/ac/party/join/' + encodeURIComponent(hostId), { method: 'POST' }); toast(r.note || 'You joined the party 🎉'); }
    catch (e) { toast(e.message || 'Could not join that party.'); }
  }
};
window.PARTY = PARTY;
