/* Group chats inside Messages. Adds to PH (phone.js). Rules live on the server (routes/acgroups.js):
   owner/admins add + remove people, rename, switch "only admins can send messages", delete messages; anyone can leave. */
Object.assign(PH, {
  gid: null, g: null, groups: [], ng: [], gfriends: null,
  gname(id) { const m = this.g && this.g.members.find(x => x.id === id); return m ? (m.username ? '@' + esc(m.username) : esc(m.displayName)) : 'Former member' },
  gcolor(id) { return ['#6366f1', '#0ea5e9', '#f97316', '#10b981', '#ec4899', '#8b5cf6'][(id.charCodeAt(id.length - 1) || 0) % 6] },
  gav(big) { return `<span class="avi gav ${big ? 'big' : ''}">👥</span>` },
  isAdm() { return !!this.g && this.g.group.role !== 'member' },
  /* ----- list shown in Messages -> Chats (matches the "Groups" block in the design) ----- */
  groupSection() {
    const me = NET.user.id, prev = l => !l ? 'No messages yet' : l.deleted ? '🚫 Message deleted' : l.kind === 'text' ? (l.from === me ? 'You: ' : '') + esc(l.text) : esc(l.text);
    return `<div class="grph"><span class="lab2">GROUPS</span><button class="newg" onclick="PH.newGroup()">+ New group</button></div>` +
      (this.groups.length ? this.groups.map(g => `<div class="row tap" onclick="PH.group('${g.id}')">${this.gav(1)}<div class="rt"><b>${esc(g.name)}</b><span class="pv">${prev(g.last)}</span></div><div class="rm"><small>${this.rel(g.last ? g.last.at : g.lastAt)}</small>${g.unread ? `<em class="cnt">${g.unread}</em>` : ''}</div></div>`).join('')
        : `<div class="gpromo" onclick="PH.newGroup()"><span class="gpi">👯</span><div><b>Make a group with your friends</b><small>Add them by username, chat together and plan Quilox nights 🍾</small></div></div>`)
  },
  /* ----- create ----- */
  async newGroup() {
    this.ng = [];
    try { if (!this.gfriends) this.gfriends = (await NET.api('/api/ac/friends')).friends } catch (e) { return toast(e.message) }
    this.sheet(`<h3>New group</h3><p class="hint2">Name it, then add friends by @username. You become the group owner and admin.</p>
      <input class="sinput" id="gname" maxlength="40" placeholder="Group name, e.g. Quilox Nights 🍾">
      <div class="cin2" style="margin-top:8px"><input class="sinput" id="guser" placeholder="@username" autocomplete="off" onkeydown="if(event.key==='Enter')PH.ngAdd()"><button class="pbtn blu" onclick="PH.ngAdd()">Add</button></div>
      <div class="gchips" id="gchips"></div>
      ${this.gfriends.length ? `<div class="lab2">YOUR FRIENDS</div><div class="gpick">${this.gfriends.filter(f => f.username).map(f => `<button data-u="${esc(f.username)}" onclick="PH.ngTap('${esc(f.username)}')">@${esc(f.username)}</button>`).join('')}</div>` : '<p class="hint2">You have no friends added yet. Add some in Contacts first, or create the group now and add people later.</p>'}
      <button class="btn p" id="gmake" onclick="PH.createGroup()">Create group</button>`);
    this.ngDraw()
  },
  ngDraw() {
    const c = document.getElementById('gchips'); if (!c) return;
    c.innerHTML = this.ng.map(u => `<span class="gchip">@${esc(u)} <i onclick="PH.ngTap('${esc(u)}')">✕</i></span>`).join('');
    document.querySelectorAll('.gpick button').forEach(b => b.classList.toggle('on', this.ng.includes(b.dataset.u)));
    const m = document.getElementById('gmake'); if (m) m.textContent = this.ng.length ? `Create group · ${this.ng.length + 1} people` : 'Create group'
  },
  ngTap(u) { const i = this.ng.indexOf(u); i >= 0 ? this.ng.splice(i, 1) : this.ng.push(u); this.ngDraw() },
  ngAdd() {
    const i = document.getElementById('guser'), q = i.value.trim().replace(/^@/, '').toLowerCase(); if (!q) return;
    const f = (this.gfriends || []).find(x => (x.username || '').toLowerCase() === q);
    if (!f) return toast(`@${q} is not one of your friends yet. Add them in Contacts first.`);
    if (!this.ng.includes(f.username)) this.ng.push(f.username);
    i.value = ''; this.ngDraw()
  },
  async createGroup() {
    const b = document.getElementById('gmake'); if (b.disabled) return; b.disabled = true;
    try {
      const r = await NET.api('/api/ac/groups', { method: 'POST', body: { name: document.getElementById('gname').value, usernames: this.ng } });
      NET.drop('/api/ac/groups'); this.closeSheet(); if (r.skipped && r.skipped.length) toast(r.skipped[0]);
      this.group(r.id)
    } catch (e) { b.disabled = false; toast(e.message) }
  },
  /* ----- chat screen ----- */
  async gload(id) { const r = await NET.api('/api/ac/groups/' + id); this.g = r; return r },
  async group(id) {
    this.view = 'group'; this.gid = id; document.querySelector('.screen').classList.add('light');
    try { await this.gload(id) } catch (e) { this.view = 'messages'; toast(e.message); return this.messages('chats') }
    NET.drop('/api/ac/groups'); this.refreshBadges(); this.gdraw()
  },
  gdraw(keep) {
    const g = this.g.group, adm = this.isAdm(), locked = g.onlyAdmins && !adm, typed = keep !== undefined ? keep : (document.getElementById('cinput') || {}).value || '';
    this.shell(`<span onclick="PH.groupInfo()" style="cursor:pointer">${esc(g.name)}</span>`, 'PH.messages()', `<div class="abody chat" id="ab"><div class="cmsgs" id="cm"></div></div>` +
      (locked ? `<div class="glock">🔒 Only admins can send messages in this group</div>` : `<div class="emo" id="emo" style="display:none">${['😂', '😍', '🙏🏾', '🔥', '👏🏾', '😭', '🎉', '🍾'].map(e => `<button onclick="PH.emoji('${e}')">${e}</button>`).join('')}</div>
        <div class="cin"><button class="ebtn" onclick="document.getElementById('emo').style.display=document.getElementById('emo').style.display==='none'?'flex':'none'">☺</button><input id="cinput" placeholder="Message the group…" maxlength="500" autocomplete="off" onkeydown="if(event.key==='Enter')PH.gSendInput()"><button class="sbtn" onclick="PH.gSendInput()">➤</button></div>`),
      `<div class="csub" onclick="PH.groupInfo()" style="cursor:pointer">👥 ${this.g.members.length} members${g.onlyAdmins ? ' · admins only' : ''} · tap for group info</div>`);
    const i = document.getElementById('cinput'); if (i) i.value = typed;
    this.gmsgs()
  },
  gbubble(m) {
    const me = NET.user.id, mine = m.from === me;
    if (m.kind === 'system') return `<div class="sys">${esc(m.text)} · ${this.time(m.at)}</div>`;
    const tap = `onclick="PH.gMsgMenu('${m.id}')"`;
    if (m.deleted) return `<div class="msg ${mine ? 'me' : 'th'}"><div class="mb gdel">🚫 This message was deleted</div><small>${this.time(m.at)}</small></div>`;
    return `<div class="msg ${mine ? 'me' : 'th'}">${mine ? '' : `<span class="gsn" style="color:${this.gcolor(m.from)}">${this.gname(m.from)}</span>`}<div class="mb" ${tap}>${esc(m.text)}</div><small>${this.time(m.at)}</small></div>`
  },
  gmsgs() {
    const el = document.getElementById('cm'); if (!el) return;
    el.innerHTML = this.g.messages.length ? this.g.messages.map(m => this.gbubble(m)).join('') : '<p class="empty">No messages yet. Say hi to the group 👋</p>';
    const b = document.getElementById('ab'); b.scrollTop = b.scrollHeight
  },
  gSendInput() { const i = document.getElementById('cinput'); const t = i.value.trim(); if (!t) return; i.value = ''; this.gSend(t) },
  async gSend(t) {
    try { const r = await NET.api(`/api/ac/groups/${this.gid}/messages`, { method: 'POST', body: { text: t } }); this.gpush(r.message) }
    catch (e) { toast(e.message); if (e.status === 403 || e.status === 404) this.gRefresh() }
  },
  gpush(m) { if (!this.g || this.g.messages.some(x => x.id === m.id)) return; this.g.messages.push(m); NET.drop('/api/ac/groups'); this.gmsgs() },
  gMsgMenu(mid) {
    const m = this.g.messages.find(x => x.id === mid); if (!m) return;
    if (m.from !== NET.user.id && !this.isAdm()) return;
    this.sheet(`<h3>Message</h3><p class="hint2">${esc(m.text.slice(0, 80))}</p><button class="fopt red" onclick="PH.gDelMsg('${mid}')"><span>🗑️ Delete for everyone</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)
  },
  async gDelMsg(mid) {
    try { await NET.api(`/api/ac/groups/${this.gid}/messages/${mid}`, { method: 'DELETE' }); this.closeSheet(); const m = this.g.messages.find(x => x.id === mid); if (m) { m.deleted = true; m.text = '' } this.gmsgs() } catch (e) { toast(e.message) }
  },
  async gRefresh() {
    const keep = (document.getElementById('cinput') || {}).value || '', info = this.view === 'groupinfo';
    try { await this.gload(this.gid) } catch (e) { toast('You are no longer in this group'); return this.messages('chats') }
    if (this.view === 'group') this.gdraw(keep); else if (info) this.groupInfo()
  },
  /* ----- group info + moderation ----- */
  groupInfo() {
    this.view = 'groupinfo';
    const { group: g, members } = this.g, me = NET.user.id, adm = this.isAdm(), mine = g.role, tag = r => r === 'owner' ? '<span class="rtag own">Owner</span>' : r === 'admin' ? '<span class="rtag">Admin</span>' : '';
    const canAct = m => adm && m.id !== me && m.role !== 'owner' && (m.role === 'member' || mine === 'owner');
    this.shell('Group info', 'PH.group(PH.gid)', `<div class="abody" id="ab">
      <div class="ginfo">${this.gav(1)}<div class="rt"><b>${esc(g.name)}</b><span>Group · ${members.length} of ${g.max} people</span></div></div>
      ${adm ? `<div class="cin2" style="margin-top:6px"><input class="sinput" id="grn" maxlength="40" value="${esc(g.name)}"><button class="pbtn blu" onclick="PH.gRename()">Rename</button></div>` : ''}
      <div class="lab2">GROUP SETTINGS</div>
      <label class="gset ${adm ? '' : 'ro'}"><div><b>Only admins can send messages</b><small>${adm ? 'Everyone else can read but not reply.' : 'Only admins can change this.'}</small></div><input type="checkbox" class="gsw" ${g.onlyAdmins ? 'checked' : ''} ${adm ? '' : 'disabled'} onchange="PH.gSetOnly(this.checked)"></label>
      ${adm ? `<div class="lab2">ADD PEOPLE</div><div class="cin2"><input class="sinput" id="gadd" placeholder="Friend's @username" autocomplete="off" onkeydown="if(event.key==='Enter')PH.gAdd()"><button class="pbtn grn" onclick="PH.gAdd()">Add</button></div>` : ''}
      <div class="lab2">${members.length} MEMBERS</div>
      ${members.map(m => `<div class="row"><div class="rowp" ${this.prof(m.id, 'PH.groupInfo()')}>${this.av(m)}<div class="rt"><b>${m.id === me ? 'You' : this.name(m)}</b><span>${m.online ? '<i class="ond"></i>Online' : 'Offline'}</span></div></div>${tag(m.role)}${canAct(m) ? `<button class="rbtn gry" onclick="PH.gMember('${m.id}')">⋯</button>` : ''}</div>`).join('')}
      <button class="fopt" style="margin-top:16px" onclick="PH.gLeaveAsk()"><span>🚪 Leave group</span></button>
      ${mine === 'owner' ? `<button class="fopt red" onclick="PH.gDeleteAsk()"><span>🗑️ Delete group for everyone</span></button>` : ''}</div>`)
  },
  gMember(id) {
    const m = this.g.members.find(x => x.id === id); if (!m) return;
    this.sheet(`<h3>${this.name(m)}</h3><p class="hint2">${m.role === 'admin' ? 'Group admin' : 'Member'}</p>
      ${m.role === 'member' ? `<button class="fopt" onclick="PH.gAct('${id}','admin')"><span>⭐ Make group admin</span></button>` : `<button class="fopt" onclick="PH.gAct('${id}','unadmin')"><span>Remove as admin</span></button>`}
      <button class="fopt red" onclick="PH.gAct('${id}','remove')"><span>🚫 Remove from group</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)
  },
  async gAct(id, what) {
    const u = `/api/ac/groups/${this.gid}/`, call = { admin: ['admins/' + id, 'POST'], unadmin: ['admins/' + id, 'DELETE'], remove: ['members/' + id, 'DELETE'] }[what];
    try { await NET.api(u + call[0], { method: call[1] }); this.closeSheet(); toast(what === 'remove' ? 'Removed from group' : 'Done ✓'); await this.gRefresh(); if (this.view !== 'groupinfo') this.groupInfo() } catch (e) { toast(e.message) }
  },
  async gAdd() {
    const i = document.getElementById('gadd'), q = i.value.trim(); if (!q) return;
    try { const r = await NET.api(`/api/ac/groups/${this.gid}/members`, { method: 'POST', body: { usernames: [q] } }); toast(r.added ? 'Added to group ✓' : 'Nobody added'); await this.gRefresh() } catch (e) { toast(e.message) }
  },
  async gRename() {
    try { const r = await NET.api('/api/ac/groups/' + this.gid, { method: 'PATCH', body: { name: document.getElementById('grn').value } }); toast('Group renamed ✓'); NET.drop('/api/ac/groups'); await this.gRefresh() } catch (e) { toast(e.message) }
  },
  async gSetOnly(v) {
    try { await NET.api('/api/ac/groups/' + this.gid, { method: 'PATCH', body: { onlyAdmins: v } }); toast(v ? 'Only admins can message now 🔒' : 'Everyone can message again'); await this.gRefresh() }
    catch (e) { toast(e.message); await this.gRefresh() }
  },
  gLeaveAsk() { this.sheet(`<h3>Leave group?</h3><p class="hint2">You will stop getting messages from it.${this.g.group.role === 'owner' ? ' Ownership passes to another member.' : ''}</p><button class="fopt red" onclick="PH.gLeave()"><span>🚪 Leave</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`) },
  async gLeave() { try { await NET.api(`/api/ac/groups/${this.gid}/leave`, { method: 'POST' }); this.closeSheet(); NET.drop('/api/ac/groups'); toast('You left the group'); this.messages('chats') } catch (e) { toast(e.message) } },
  gDeleteAsk() { this.sheet(`<h3>Delete this group?</h3><p class="hint2">All messages are erased for everyone. This cannot be undone.</p><button class="fopt red" onclick="PH.gDelete()"><span>🗑️ Delete group</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`) },
  async gDelete() { try { await NET.api('/api/ac/groups/' + this.gid, { method: 'DELETE' }); this.closeSheet(); NET.drop('/api/ac/groups'); toast('Group deleted'); this.messages('chats') } catch (e) { toast(e.message) } },
  /* ----- live events from the /ac socket ----- */
  gEvent(ev, p) {
    NET.drop('/api/ac/groups');
    const inChat = (this.view === 'group' || this.view === 'groupinfo') && this.gid === (p.group || p.id);
    if (ev === 'gmsg') {
      if (inChat && this.g) { this.gpush(p); if (this.view === 'group') NET.api('/api/ac/groups/' + this.gid).catch(() => {}); return }
      if (p.kind === 'text' && p.from !== NET.user.id) { this.badges.messages++; toast('👥 New group message'); this.drawBadges() }
    } else if (ev === 'group') {
      if (p.type === 'removed' && inChat) { toast('You are no longer in that group'); return this.messages('chats') }
      if (inChat && p.type !== 'new') this.gRefresh()
    }
    if (this.view === 'messages') { if (this.tab === 'groups') this.drawGroups(); else if (this.tab === 'chats') this.drawChats() }
  }
});
