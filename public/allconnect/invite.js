/* AllConnect Invite app. Your invite link, who joined, what you earned (join bonuses + commission) and how it works. */
const INVAPP = {
  d: null,
  async open() {
    PH.view = 'invite';
    PH.shell('Invite', 'PH.close()', `<div class="abody" id="ab"><p class="hint2">Loading your invite stats…</p></div>`);
    try { this.d = await NET.api('/api/ac/hub/invite') } catch (e) { const ab = document.getElementById('ab'); if (ab) ab.innerHTML = `<p class="hint2">${esc(e.message || 'Could not load')}</p>`; return }
    if (PH.view === 'invite') this.paint();
  },
  link() { return location.origin + '/?ref=' + encodeURIComponent(this.d.code) },
  paint() {
    const ab = document.getElementById('ab'); if (!ab) return;
    const d = this.d, s = d.stats, f = n => '₦' + Math.round(n || 0).toLocaleString('en-NG');
    const me = (typeof HUB !== 'undefined' && HUB.me) || null, newish = me && me.protection && me.protection.active, used = me && me.hub && me.hub.invitedBy;
    const box = (v, l) => `<div class="ivbox"><b>${v}</b><span>${l}</span></div>`;
    ab.innerHTML = `<div class="ivhero"><div class="ivemo">🤝</div><h3>Play together, earn together</h3><p>Friends who join with your link get ${f(d.invitee)}. You get ${f(d.inviter)} for each one, plus ${d.commissionPct}% of every shift they work for ${d.commissionDays} days.</p>
        <div class="ivcode">${esc(d.code)}</div><button class="btn p" onclick="INVAPP.share()"><span class="fa-solid fa-share-nodes"></span> Share my invite link</button><button class="btn s" onclick="INVAPP.copy()">Copy link</button></div>
      <div class="lab2">YOUR EARNINGS</div>
      <div class="ivtotal"><span>Total earned from invites</span><b>${f(s.total)}</b></div>
      <div class="ivgrid">${box(f(s.bonus), 'Join bonuses')}${box(f(s.commission), 'Commission')}${box(s.friends, 'Friends joined')}${box(s.active, 'Earning you commission')}${box(s.online, 'Online now')}${box(s.thisWeek, 'Joined this week')}</div>
      <div class="lab2">HOW YOU EARN</div>
      <div class="sgrp"><div class="trow"><span class="ti">🎁</span><span class="tl">Join bonus<span class="sub ivsub">${f(d.inviter)} lands in your wallet the moment a friend joins with your link in their first ${d.windowDays} days.</span></span></div>
        <div class="trow"><span class="ti">💼</span><span class="tl">Commission<span class="sub ivsub">${d.commissionPct}% of each shift your friend works, paid by us on top of their pay, for ${d.commissionDays} days after they join. Their pay is never reduced.</span></span></div></div>
      <div class="lab2">YOUR FRIENDS (${s.friends})</div>
      <div class="sgrp">${d.friends.length ? d.friends.map(x => `<div class="trow"><span class="tl">${esc(x.name)} ${x.online ? '<i class="ond"></i>' : ''}<span class="sub ivsub">Joined ${new Date(x.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${x.daysLeft ? x.daysLeft + ' day' + (x.daysLeft === 1 ? '' : 's') + ' of commission left' : 'commission ended'}</span></span><b style="color:#16a34a">${f(x.commission)}</b></div>`).join('') : '<p class="hint2">Nobody yet. Share your link and your first friend shows up here.</p>'}</div>
      ${newish && !used ? `<div class="lab2">WERE YOU INVITED?</div><input class="sinput" id="ivin" placeholder="Friend's invite code" autocapitalize="off" autocomplete="off"><button class="btn p" onclick="INVAPP.redeem(this)">Use code</button>` : ''}`;
  },
  async share() { const text = 'Come live your Naija life with me on AllConnect: ' + this.link(); try { if (navigator.share) await navigator.share({ title: 'AllConnect', text, url: this.link() }); else { await navigator.clipboard.writeText(text); toast('Invite link copied ✓') } } catch (e) {} },
  async copy() { try { await navigator.clipboard.writeText(this.link()); toast('Invite link copied ✓') } catch (e) { toast(this.link()) } },
  async redeem(btn) {
    const v = (document.getElementById('ivin') || {}).value; if (!v) return toast('Enter a code'); btn.disabled = true;
    try { const r = await NET.api('/api/ac/hub/invite/redeem', { method: 'POST', body: { code: v } }); if (HUB.setCash) HUB.setCash(r.cash); if (HUB.loadMe) await HUB.loadMe(); toast('Invite bonus ' + UI.fmt(r.bonus) + ' 🎉'); this.open() } catch (e) { toast(e.message); btn.disabled = false }
  }
};
