/* State House (Phone -> State House): elections for Governor, Commissioner and President every 14 days,
   plus the policies and announcements of whoever wins. Built on the shared SHEET (tabs) from ui.js, the same rows / buttons
   as Lagos Life, and PH.av for avatars. All rules and numbers come from the server (routes/acgov.js, utils/acgov.js);
   this file only draws them. */
const GOV = {
  D: null, office: 'governor', timer: null, busy: false, draft: { slogan: {}, ann: {} }, q: '',
  esc: (s) => UI.esc(s),
  money: (n) => UI.fmt(n),
  api(path, body) { return NET.api('/api/ac/gov/' + path, body === undefined ? undefined : { method: 'POST', body }) },
  cash(c) { if (typeof c === 'number' && typeof S !== 'undefined') { S.cash = c; if (typeof render === 'function') render() } },
  left(ms) { const s = Math.max(0, Math.round((ms - Date.now()) / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + m + 'm' : Math.max(1, m) + ' min' },
  av(u, big) { return PH.av({ avatar: u.avatar, displayName: u.name, username: u.username }, big) },
  who(u) { return u.username ? '@' + this.esc(u.username) : this.esc(u.name) },

  /* ---------- open / load ---------- */
  async open(office) {
    if (office) this.office = office;
    this.stop();
    SHEET.open({
      id: 'gov', title: 'State House', wide: true, tab: this.office, onTab: (t) => { this.office = t }, onClose: () => this.stop(),
      tabs: () => this.tabs(), body: (t) => this.body(t)
    });
    try { await this.load() } catch (e) { toast(e.message); SHEET.close(); return }
    if (SHEET.isOpen('gov')) { SHEET.paint(); this.timer = setInterval(() => this.tick(), 30000) }
  },
  stop() { clearInterval(this.timer); this.timer = null },
  async load(q) { this.take(await this.api('state' + (q ? '?q=' + encodeURIComponent(q) : '')), true) },
  take(r, quiet) { this.D = r; this.cash(r.cash); if (!quiet) this.paint() },
  /* refresh the numbers every 30 s, but never while somebody is typing (a repaint would wipe the box) */
  async tick() {
    if (!SHEET.isOpen('gov')) return this.stop();
    const a = document.activeElement; if (this.busy || (a && /^(INPUT|TEXTAREA)$/.test(a.tagName))) return;
    try { await this.load(this.q); this.paint() } catch (e) {}
  },
  paint() { if (SHEET.isOpen('gov')) SHEET.paint() },
  async act(path, body, done) {
    if (this.busy) return; this.busy = true;
    try { const r = await this.api(path, body); this.take(r); if (done) done(r) } catch (e) { toast(e.message) }
    this.busy = false;
  },

  /* ---------- tabs + body ---------- */
  tabs() {
    const D = this.D; if (!D) return ['governor', 'commissioner', 'president'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }));
    return Object.values(D.offices).map((o) => ({ id: o.id, label: o.icon + ' ' + o.title, badge: D.voterOk && o.election.ballot && !o.election.myVote && o.election.total ? 1 : 0 }));
  },
  body(t) {
    const D = this.D; if (!D) return '<p class="empty">Loading…</p>';
    const o = D.offices[t] || D.offices.governor;
    return this.holder(o) + this.race(o) + this.policies(o) + this.announcements(o) +
      `<p class="lgnote">A new election round starts every 14 days (Monday). The campaign runs for 10 days, then the ${D.shortlistSize} candidates with the most backers go on the ballot and everyone votes for 4 days. The winner holds office for the next round. Filing fees are refunded to anyone who does not make the ballot, and to the winner, who also gets a term allowance. Policy prices apply straight away, except bills, which use the policy in place on the Monday they are issued.</p>`;
  },

  /* the sitting officeholder (blue card like the other Lagos Life cards) */
  holder(o) {
    const h = o.holder;
    if (!h) return `<div class="gvhold vac" style="--c:${o.color}"><small>${this.esc(o.title.toUpperCase())} OF ${this.esc(o.scope.toUpperCase())}</small><h3>Nobody yet</h3><p>This office is empty. Win the election below to take it, and earn ${this.money(o.salary)} for the term.</p></div>`;
    const ann = h.mine ? `<div class="gvann"><textarea id="gvann" maxlength="200" placeholder="Announce something to the whole city…" oninput="GOV.draft.ann['${o.id}']=this.value">${this.esc(this.draft.ann[o.id] || '')}</textarea><button class="lgbtn" ${o.ann && o.ann.left ? '' : 'disabled'} onclick="GOV.announce('${o.id}',this)">Post</button></div><small class="gvhint">${o.ann ? o.ann.left + ' announcement' + (o.ann.left === 1 ? '' : 's') + ' left today. It goes to every player\'s Updates and to P-Gist.' : ''}</small>` : '';
    return `<div class="gvhold" style="--c:${o.color}"><small>${this.esc(o.title.toUpperCase())} OF ${this.esc(o.scope.toUpperCase())} · THIS TERM</small>
      <div class="gvh">${this.av(h.user, true)}<div><h3>${this.who(h.user)}</h3><p>${h.slogan ? '“' + this.esc(h.slogan) + '” · ' : ''}${(h.votes || 0).toLocaleString('en-NG')} votes</p></div></div>
      <small>${h.mine ? 'You are in office. ' : ''}Term ends in ${this.left(h.until)}</small>${ann}</div>`;
  },

  /* the election: campaign (file + back candidates) or voting (the ballot) */
  race(o) {
    const D = this.D, e = o.election, c = D.cycle, voting = e.phase === 'voting';
    const head = `<div class="gvph"><h4>Next election</h4><span>${voting ? 'Polls close in ' + this.left(c.end) : 'Ballot set in ' + this.left(c.shortlistAt)}</span></div>`;
    let box = '';
    if (!voting && !e.iRun) box = this.fileBox(o);
    else if (e.iRun) box = `<div class="gvok">${voting ? 'You are on the ballot. Share your race and get people to vote.' : 'You are running for ' + this.esc(o.title) + '. Ask people to back you: the top ' + D.shortlistSize + ' make the ballot.'}</div>`;
    else if (voting) box = '<div class="gvok">Filing is closed. Vote for one of the candidates below.</div>';
    if (voting && !e.total) return head + '<p class="empty">Nobody ran for this office this round.</p>';
    const search = e.total > 8 ? `<input class="sinput gvq" id="gvq" placeholder="Search ${e.total} candidates by @username or name" value="${this.esc(this.q)}" oninput="GOV.search(this.value)" autocomplete="off">` : '';
    const rows = e.candidates.map((x) => this.cand(o, x, voting)).join('') || `<p class="empty">${voting ? 'Nobody is on the ballot.' : 'No candidates yet. Be the first to file!'}</p>`;
    const msg = voting && !e.myVote && D.voterOk ? '<small class="gvhint">One vote per race, and it is final. Counts show after you vote.</small>' : (!D.voterOk ? '<small class="gvhint">Your account is too new to back or vote. Come back tomorrow.</small>' : '');
    return head + box + search + msg + rows;
  },
  fileBox(o) {
    const e = o.election, el = e.eligibility, sl = this.draft.slogan[o.id] || '';
    const chk = el.checks.map((x) => `<li class="${x.ok ? 'ok' : 'no'}"><span class="fa-solid fa-${x.ok ? 'circle-check' : 'circle-xmark'}"></span>${this.esc(x.label)}${!x.ok && x.have != null && x.id !== 'fee' ? ` <i>(you have ${x.have})</i>` : ''}</li>`).join('');
    return `<div class="gvfile"><b>Run for ${this.esc(o.title)}</b><ul class="gvchk">${chk}</ul>
      ${el.ok ? `<input class="sinput" id="gvsl" maxlength="80" placeholder="Your campaign slogan" value="${this.esc(sl)}" oninput="GOV.draft.slogan['${o.id}']=this.value" autocomplete="off"><button class="lgbtn big" onclick="GOV.file('${o.id}',this)">File and pay ${this.money(o.fee)}</button><small class="gvhint">If you do not make the ballot your fee comes back. If you reach the ballot and lose, the fee is gone. If you win, you get it back plus ${this.money(o.salary)}.</small>` : `<small class="gvhint">${e.filedElsewhere ? 'You are already running in another race this round.' : 'Meet every requirement above to file.'}</small>`}</div>`;
  },
  cand(o, x, voting) {
    const e = o.election, total = e.voteTotal || 0;
    const sub = `${x.slogan ? '“' + this.esc(x.slogan) + '”' : ''}`;
    let right = '', extra = '';
    if (voting) {
      const mine = e.myVote === x.user.id;
      if (e.myVote) { const pct = total ? Math.round((x.votes / total) * 100) : 0; extra = `<div class="gvbar"><i style="width:${pct}%"></i></div>`; right = `<span class="gvn">${(x.votes || 0).toLocaleString('en-NG')} · ${pct}%${mine ? ' ✓' : ''}</span>`; }
      else if (!x.mine && this.D.voterOk) right = `<button class="lgbtn" onclick="GOV.vote('${o.id}','${x.user.id}',this)">Vote</button>`;
    } else {
      const backed = e.myBack === x.user.id;
      right = `<span class="gvn">${x.support.toLocaleString('en-NG')} backer${x.support === 1 ? '' : 's'}</span>` + (x.mine || !this.D.voterOk ? '' : `<button class="lgbtn ${backed ? 'ghost' : ''}" onclick="GOV.back('${o.id}','${backed ? '' : x.user.id}',this)">${backed ? 'Backed ✓' : 'Back'}</button>`);
    }
    return `<div class="gvc ${x.mine ? 'me' : ''}">${this.av(x.user)}<div><b>${this.who(x.user)}${x.mine ? ' (you)' : ''}</b>${sub ? `<small>${sub}</small>` : ''}${!voting && x.top ? '<small class="gvtop">On track for the ballot</small>' : ''}${extra}</div><div class="gvr">${right}</div></div>`;
  },

  /* policies: everybody sees what is in force; the sitting officeholder can change them */
  policies(o) {
    const mine = !!(o.holder && o.holder.mine), active = !!o.holder;
    const fx = (list) => list.length ? `<div class="lgfx">${list.map((e) => `<span class="${e.good ? 'good' : 'bad'}">${this.esc(e.label)} <b>${e.pct > 0 ? '+' : ''}${e.pct}%</b></span>`).join('')}</div>` : '';
    const blocks = o.policies.map((p) => {
      const cur = p.options.find((x) => x.id === p.current) || p.options[0], wait = mine && p.cooldownUntil > Date.now();
      if (!mine) return `<div class="gvpol"><b>${this.esc(p.name)}</b><div class="gvcur">${this.esc(cur.label)}</div>${active ? fx(cur.effects) : ''}</div>`;
      return `<div class="gvpol"><b>${this.esc(p.name)}</b>${wait ? `<small class="gvhint">Can change again in ${this.left(p.cooldownUntil)}</small>` : ''}` +
        p.options.map((x) => `<div class="gvopt ${x.id === p.current ? 'on' : ''}"><div><b>${this.esc(x.label)}</b><small>${this.esc(x.text)}</small>${fx(x.effects)}</div>${x.id === p.current ? '<span class="gvn">In force</span>' : `<button class="lgbtn" ${wait ? 'disabled' : ''} onclick="GOV.policy('${o.id}','${p.slot}','${x.id}',this)">Choose</button>`}</div>`).join('') + '</div>';
    }).join('');
    return `<div class="gvph"><h4>${mine ? 'Your policies' : 'Policies in force'}</h4></div>${blocks}${!active ? '<p class="gvhint">Policies start when someone takes office.</p>' : ''}`;
  },
  announcements(o) {
    if (!o.announcements.length) return '';
    return `<div class="gvph"><h4>Announcements</h4></div>` + o.announcements.map((a) => `<div class="gva"><b>${this.who(a.by)}</b><span>${UI.ago(a.at)}</span><p>${this.esc(a.text)}</p></div>`).join('');
  },

  /* ---------- actions ---------- */
  search(v) { this.q = v; clearTimeout(this.sq); this.sq = setTimeout(async () => { try { await this.load(this.q); this.paint(); const i = document.getElementById('gvq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length) } } catch (e) { toast(e.message) } }, 350) },
  file(office, btn) {
    const slogan = (this.draft.slogan[office] || '').trim(); if (slogan.length < 3) return toast('Write a campaign slogan first (at least 3 characters).');
    if (btn) btn.disabled = true;
    this.act('file', { office, slogan }, () => {
      const o = this.D.offices[office]; this.draft.slogan[office] = '';
      CARD.show({ icon: o.icon, title: 'You are in the race!', text: `You filed for ${o.title} of ${o.scope}. Get people to back you before the ballot is set.`, lines: [['Filing fee', this.money(o.fee)], ['Slogan', slogan]], tone: 'gold', btn: 'Let us go' });
    }).then(() => { if (btn) btn.disabled = false });
  },
  back(office, candidate, btn) { if (btn) btn.disabled = true; this.act('support', { office, candidate }).then(() => { if (btn) btn.disabled = false }) },
  vote(office, candidate, btn) { if (btn) btn.disabled = true; this.act('vote', { office, candidate }, () => toast('Vote counted. Thank you!')).then(() => { if (btn) btn.disabled = false }) },
  announce(office, btn) {
    const text = (this.draft.ann[office] || '').trim(); if (text.length < 3) return toast('Write your announcement first.');
    if (btn) btn.disabled = true;
    this.act('announce', { office, text }, () => { this.draft.ann[office] = ''; toast('Announced to the whole city') }).then(() => { if (btn) btn.disabled = false });
  },
  policy(office, slot, option, btn) { if (btn) btn.disabled = true; this.act('policy', { office, slot, option }, () => toast('Policy changed. Everybody has been told.')).then(() => { if (btn) btn.disabled = false }) }
};
window.GOV = GOV;
