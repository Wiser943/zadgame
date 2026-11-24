/* ================= Chat extras (private chats + group chats) =================
   Press and hold a message (or right-click it) for a WhatsApp-style menu:
     react  ·  reply  ·  forward  ·  copy  ·  edit (your own, 15 min)  ·  delete (for me / for everyone)
   Double-tap still replies. The paperclip-style photo button sends a picture (with an optional caption).
   Every rule is enforced by the server (routes/acsocial.js, routes/acgroups.js, utils/acchat.js); this file only draws and asks.
   Adds to PH (phone.js + groups.js), so it must load after both. */
(function () {
  'use strict';
  const EMO = ['👍', '❤️', '😂', '😮', '😢', '🙏'], MORE = ['🔥', '👏', '🎉', '😍', '😭', '🤝'];
  const EDIT_MS = 15 * 60 * 1000, DEL_MS = 48 * 3600 * 1000, LONG_MS = 450, PHOTO = '📷 Photo';
  const ME = () => NET.user.id;
  const isG = () => PH.view === 'group';
  const list = () => (isG() ? (PH.g && PH.g.messages) : PH.msgs) || [];
  const find = id => list().find(x => x.id === id);
  const label = m => m.text || (m.image ? PHOTO : '');
  const nameOf = id => id === ME() ? 'You' : isG() ? PH.gname(id) : PH.name(PH.peer);
  const U = {
    react: id => isG() ? `/api/ac/groups/${PH.gid}/messages/${id}/react` : `/api/ac/message/${id}/react`,
    one: id => isG() ? `/api/ac/groups/${PH.gid}/messages/${id}` : `/api/ac/message/${id}`
  };
  const redraw = keep => isG() ? PH.gmsgs(keep) : PH.drawMsgs(keep);
  const $ = id => document.getElementById(id);
  const myReaction = m => ((m.reactions || []).find(r => r.u === ME()) || {}).e || '';

  const CHATX = window.CHATX = {
    /* ---------- drawing ---------- */
    inner(m, plain) {
      let h = '';
      if (m.fwd) h += '<div class="fwdl">↪ Forwarded</div>';
      if (m.reply) h += `<div class="mrep"${plain ? '' : ` onclick="event.stopPropagation();CHATX.jump('${esc(m.reply.id)}')"`}><b>${esc(nameOf(m.reply.from))}</b><span>${esc(m.reply.text)}</span></div>`;
      if (m.image) {
        const ar = m.image.w && m.image.h ? `style="aspect-ratio:${m.image.w}/${m.image.h}"` : '';
        h += `<img class="mimg" ${ar} src="${esc(m.image.thumb || m.image.url)}" data-u="${esc(m.image.url)}" alt="Photo" loading="lazy" draggable="false"${plain ? '' : ` onclick="event.stopPropagation();CHATX.view(this.dataset.u)"`}>`;
      }
      if (m.text) h += `<div class="mtx">${esc(m.text)}</div>`;
      return h;
    },
    rx(m) {
      const rs = m.reactions || []; if (!rs.length) return '';
      const by = {}; rs.forEach(r => { (by[r.e] = by[r.e] || []).push(r.u) });
      return `<div class="rxs">${Object.keys(by).map(e => `<button class="rx ${by[e].includes(ME()) ? 'on' : ''}" onclick="event.stopPropagation();CHATX.react('${m.id}','${e}')">${e}${by[e].length > 1 ? `<i>${by[e].length}</i>` : ''}</button>`).join('')}</div>`;
    },
    deletedBubble(m, mine) {
      return `<div class="msg ${mine ? 'me' : 'th'}" data-id="${m.id}"><div class="mb gdel">🚫 ${mine ? 'You deleted this message' : 'This message was deleted'}</div><small>${PH.time(m.at)}</small></div>`;
    },
    /* ---------- long press ---------- */
    bind(el) {
      if (!el || el._cx) return; el._cx = 1;
      let t = null, sx = 0, sy = 0, lastTouch = 0;
      const clear = () => { clearTimeout(t); t = null };
      const arm = (e, x, y) => {
        const m = e.target.closest && e.target.closest('.msg[data-id]'); if (!m) return;
        sx = x; sy = y; clear();
        t = setTimeout(() => { t = null; PH._lp = Date.now(); if (navigator.vibrate) navigator.vibrate(18); CHATX.menu(m.dataset.id) }, LONG_MS);
      };
      el.addEventListener('touchstart', e => { lastTouch = Date.now(); const p = e.touches[0]; arm(e, p.clientX, p.clientY) }, { passive: true });
      el.addEventListener('touchmove', e => { const p = e.touches[0]; if (Math.abs(p.clientX - sx) > 10 || Math.abs(p.clientY - sy) > 10) clear() }, { passive: true });
      ['touchend', 'touchcancel'].forEach(n => el.addEventListener(n, () => { lastTouch = Date.now(); clear() }, { passive: true }));
      el.addEventListener('mousedown', e => { if (e.button !== 0 || Date.now() - lastTouch < 800) return; arm(e, e.clientX, e.clientY) });
      ['mouseup', 'mouseleave'].forEach(n => el.addEventListener(n, clear));
      el.addEventListener('contextmenu', e => { const m = e.target.closest && e.target.closest('.msg[data-id]'); if (!m) return; e.preventDefault(); clear(); PH._lp = Date.now(); CHATX.menu(m.dataset.id) });
    },
    /* ---------- the menu ---------- */
    closeMenu() { const o = PH.$a().querySelector('.cxm'); if (o) o.remove() },
    menu(id) {
      const m = find(id); if (!m || PH.$a().querySelector('.cxm')) return;
      const me = ME(), mine = m.from === me, del = !!m.deleted, canType = !!$('cinput');
      const canEdit = mine && !del && !!m.text && Date.now() - new Date(m.at).getTime() <= EDIT_MS && canType;
      const mr = myReaction(m);
      const act = (ico, txt, fn, red) => `<button class="${red ? 'red' : ''}" onclick="CHATX.closeMenu();${fn}"><span>${ico}</span>${txt}</button>`;
      const acts = (del ? '' : (canType ? act('↩️', 'Reply', `PH.setReply('${id}')`) : '') + act('↪️', 'Forward', `CHATX.fwd('${id}')`) + (m.text ? act('📋', 'Copy', `CHATX.copy('${id}')`) : '') + (canEdit ? act('✏️', 'Edit', `CHATX.startEdit('${id}')`) : '')) + act('🗑️', 'Delete', `CHATX.delAsk('${id}')`, true);
      const o = document.createElement('div'); o.className = 'cxm';
      o.onclick = e => { if (e.target === o) CHATX.closeMenu() };
      o.innerHTML = `<div class="cxwrap ${mine ? 'me' : 'th'}">
        ${del ? '' : `<div class="cxbar">${EMO.map(e => `<button class="${mr === e ? 'on' : ''}" onclick="CHATX.react('${id}','${e}')">${e}</button>`).join('')}<button class="more" aria-label="More reactions" onclick="this.parentNode.nextElementSibling.classList.toggle('open')">＋</button></div>
        <div class="cxbar cxbar2">${MORE.map(e => `<button class="${mr === e ? 'on' : ''}" onclick="CHATX.react('${id}','${e}')">${e}</button>`).join('')}</div>`}
        <div class="cxprev msg ${mine ? 'me' : 'th'}"><div class="mb ${del ? 'gdel' : ''}">${del ? '🚫 This message was deleted' : CHATX.inner(m, true)}</div></div>
        <div class="cxact">${acts}</div></div>`;
      PH.$a().appendChild(o);
    },
    /* ---------- actions ---------- */
    apply(m) { const L = list(), i = L.findIndex(x => x.id === m.id); if (i >= 0) L[i] = m; redraw(true) },
    async react(id, e) {
      CHATX.closeMenu();
      try { const r = await NET.api(U.react(id), { method: 'POST', body: { emoji: e } }); CHATX.apply(r.message) } catch (x) { toast(x.message) }
    },
    copy(id) {
      const m = find(id); if (!m || !m.text) return;
      const done = () => toast('Copied');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text).then(done, () => CHATX.copyOld(m.text));
      else CHATX.copyOld(m.text);
    },
    copyOld(t) { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); toast('Copied') } catch (e) { toast('Could not copy') } a.remove() },
    jump(id) {
      const el = document.querySelector(`.msg[data-id="${id}"]`);
      if (!el) return toast('That message is not in view');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl');
    },
    view(u) {
      const d = document.createElement('div'); d.className = 'cxview';
      d.innerHTML = `<img src="${esc(u)}" alt="Photo"><button aria-label="Close">✕</button>`; d.onclick = () => d.remove(); PH.$a().appendChild(d);
    },
    /* ---------- edit ---------- */
    bars() {
      const r = $('crep'); if (!r) return;
      if (PH.editing) r.innerHTML = `<div class="crepl ed"><div><b>Editing message</b><span>${esc(PH.editing.orig)}</span></div><button onclick="PH.cancelEdit()" aria-label="Cancel edit">✕</button></div>`;
      else if (PH.replyTo) r.innerHTML = `<div class="crepl"><div><b>Replying to ${esc(nameOf(PH.replyTo.from))}</b><span>${esc(PH.replyTo.text)}</span></div><button onclick="PH.cancelReply()" aria-label="Cancel reply">✕</button></div>`;
      else r.innerHTML = '';
    },
    startEdit(id) {
      const m = find(id); if (!m || !m.text) return;
      PH.replyTo = null; PH.editing = { id, orig: m.text.slice(0, 120) }; CHATX.bars();
      const i = $('cinput'); if (i) { i.value = m.text; i.focus() }
    },
    async saveEdit(t) {
      const e = PH.editing; if (!e) return;
      const m = find(e.id); if (!m) { PH.cancelEdit(); return }
      if (!t && !m.image) return toast('A message cannot be empty');
      if (t === m.text) { PH.cancelEdit(); return }
      try { const r = await NET.api(U.one(e.id), { method: 'PUT', body: { text: t } }); PH.cancelEdit(); CHATX.apply(r.message); NET.drop('/api/ac/chats'); NET.drop('/api/ac/groups') } catch (x) { toast(x.message) }
    },
    /* ---------- delete ---------- */
    delAsk(id) {
      const m = find(id); if (!m) return;
      const mine = m.from === ME(), admin = isG() && PH.isAdm();
      const all = !m.deleted && ((mine && Date.now() - new Date(m.at).getTime() <= DEL_MS) || admin);
      PH.sheet(`<h3>Delete message?</h3>${all && !mine ? '<p class="hint2">You are an admin, so you can remove this for everyone.</p>' : ''}
        <button class="fopt red" onclick="CHATX.del('${id}','me')"><span>🗑️ Delete for me</span></button>
        ${all ? `<button class="fopt red" onclick="CHATX.del('${id}','all')"><span>🗑️ Delete for everyone</span></button>` : ''}
        <button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`);
    },
    async del(id, scope) {
      try {
        const r = await NET.api(U.one(id) + '?scope=' + scope, { method: 'DELETE' }); PH.closeSheet();
        if (scope === 'me') { const L = list(), i = L.findIndex(x => x.id === id); if (i >= 0) L.splice(i, 1); redraw(true) }
        else if (r.message) CHATX.apply(r.message);
        NET.drop('/api/ac/chats'); NET.drop('/api/ac/groups');
      } catch (x) { toast(x.message) }
    },
    /* ---------- forward ---------- */
    async fwd(id) {
      const m = find(id); if (!m || m.deleted) return;
      CHATX._fw = { src: { kind: isG() ? 'group' : 'dm', id }, sel: new Set(), t: [] };
      PH.sheet('<h3>Forward to…</h3><p class="hint2">Loading your chats…</p>');
      let chats = [], friends = [], groups = [];
      try {
        [chats, friends, groups] = await Promise.all([
          NET.api('/api/ac/chats').then(r => r.chats.map(c => c.peer)).catch(() => []),
          NET.api('/api/ac/friends').then(r => r.friends).catch(() => []),
          NET.api('/api/ac/groups').then(r => r.groups).catch(() => [])]);
      } catch (e) { PH.closeSheet(); return toast(e.message) }
      const seen = new Set([ME()]), T = [];
      groups.filter(g => !(g.onlyAdmins && g.role === 'member')).forEach(g => T.push({ k: 'g', id: g.id, name: '👥 ' + g.name }));
      chats.concat(friends).forEach(u => { if (u && u.id && !seen.has(u.id)) { seen.add(u.id); T.push({ k: 'u', id: u.id, name: PH.name(u) }) } });
      CHATX._fw.t = T;
      PH.closeSheet();
      PH.sheet(`<h3>Forward to…</h3><p class="hint2">Pick up to 5 chats.</p>
        <input class="sinput" id="fwq" placeholder="Search" oninput="CHATX.fwdFilter(this.value)" autocomplete="off">
        <div class="fwlist" id="fwl">${CHATX.fwdRows(T)}</div>
        <button class="btn p" id="fwgo" onclick="CHATX.fwdGo()" disabled>Send</button>`);
    },
    fwdRows(T) {
      return T.length ? T.map((t, i) => `<label class="fwrow"><input type="checkbox" ${CHATX._fw.sel.has(i) ? 'checked' : ''} onchange="CHATX.fwdPick(${i},this)"><span>${t.name}</span></label>`).join('') : '<p class="hint2">No chats to forward to yet.</p>';
    },
    fwdFilter(q) {
      q = q.trim().toLowerCase(); const F = CHATX._fw, rows = F.t.map((t, i) => [t, i]).filter(x => !q || x[0].name.toLowerCase().includes(q));
      $('fwl').innerHTML = rows.length ? rows.map(([t, i]) => `<label class="fwrow"><input type="checkbox" ${F.sel.has(i) ? 'checked' : ''} onchange="CHATX.fwdPick(${i},this)"><span>${t.name}</span></label>`).join('') : '<p class="hint2">Nobody found.</p>';
    },
    fwdPick(i, el) {
      const F = CHATX._fw;
      if (el.checked) { if (F.sel.size >= 5) { el.checked = false; return toast('You can forward to 5 chats at a time') } F.sel.add(i) } else F.sel.delete(i);
      const b = $('fwgo'); if (b) { b.disabled = !F.sel.size; b.textContent = F.sel.size ? `Send to ${F.sel.size}` : 'Send' }
    },
    async fwdGo() {
      const F = CHATX._fw, b = $('fwgo'); if (!F || !F.sel.size || b.disabled) return; b.disabled = true; b.textContent = 'Sending…';
      let ok = 0, fail = 0, lastErr = '';
      for (const i of F.sel) {
        const t = F.t[i];
        try {
          const r = await NET.api(t.k === 'g' ? `/api/ac/groups/${t.id}/messages` : `/api/ac/messages/${t.id}`, { method: 'POST', body: { forward: F.src } });
          ok++; if (t.k === 'g' && isG() && PH.gid === t.id) PH.gpush(r.message); else if (t.k === 'u' && PH.view === 'chat' && PH.chatId === t.id) PH.push(r.message);
        } catch (e) { fail++; lastErr = e.message }
      }
      NET.drop('/api/ac/chats'); NET.drop('/api/ac/groups'); PH.closeSheet();
      toast(fail ? (ok ? `Forwarded to ${ok}, ${fail} failed: ${lastErr}` : lastErr || 'Could not forward') : ok > 1 ? `Forwarded to ${ok} chats ✓` : 'Forwarded ✓');
    },
    /* ---------- photos ---------- */
    pick() {
      const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*';
      f.onchange = () => { if (f.files && f.files[0]) CHATX.prep(f.files[0]) };
      f.click();
    },
    prep(file) {
      if (!/^image\//.test(file.type)) return toast('Pick a photo');
      const url = URL.createObjectURL(file), img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); toast('Could not open that photo') };
      img.onload = () => {
        URL.revokeObjectURL(url);
        const enc = (max, q) => {
          const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
          const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
          return { data: c.toDataURL('image/jpeg', q), w, h };
        };
        let p = enc(1280, .82); if (p.data.length > 1.9e6) p = enc(1024, .7);
        if (p.data.length > 2.6e6) return toast('That photo is too large');
        CHATX._pend = p;
        PH.sheet(`<h3>Send photo</h3><img class="pvimg" src="${p.data}" alt="Preview">
          <input class="sinput" id="pvcap" maxlength="${isG() ? 500 : 300}" placeholder="Add a caption…" autocomplete="off" onkeydown="if(event.key==='Enter')CHATX.sendPhoto()">
          <button class="btn p" id="pvsend" onclick="CHATX.sendPhoto()">Send</button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`);
      };
      img.src = url;
    },
    async sendPhoto() {
      const p = CHATX._pend, b = $('pvsend'); if (!p || !b || b.disabled) return; b.disabled = true; b.textContent = 'Sending…';
      const cap = ($('pvcap') || {}).value || '';
      try {
        const r = await NET.api('/api/ac/photos/chat', { method: 'POST', body: { image: p.data, w: p.w, h: p.h } });
        PH.closeSheet(); CHATX._pend = null;
        isG() ? PH.gSend(cap.trim(), { image: r.image }) : PH.send(cap.trim(), { image: r.image });
      } catch (e) { b.disabled = false; b.textContent = 'Send'; toast(e.message) }
    }
  };

  /* ---------- hook into the existing chat code ---------- */
  Object.assign(PH, {
    editing: null,
    bubble(m, last) {
      const mine = m.from === ME();
      if (m.kind === 'money' || m.kind === 'food' || m.kind === 'system') return `<div class="sys">${esc(m.text)} · ${this.time(m.at)}</div>`;
      if (m.kind === 'invite') return `<div class="sys inv">${esc(m.text)} · ${this.time(m.at)}${mine ? '' : '<br><button onclick="PH.visit()">Go over 🏠</button>'}</div>`;
      if (m.deleted) return CHATX.deletedBubble(m, mine);
      return `<div class="msg ${mine ? 'me' : 'th'}${m.reactions && m.reactions.length ? ' hasrx' : ''}" data-id="${m.id}"><div class="mb${m.image ? ' hasimg' : ''}">${CHATX.inner(m)}</div>${CHATX.rx(m)}<small>${this.time(m.at)}${m.edited ? ' · edited' : ''}${mine && last && m.read ? ' · Seen' : ''}</small></div>`;
    },
    gbubble(m) {
      const mine = m.from === ME();
      if (m.kind === 'system') return `<div class="sys">${esc(m.text)} · ${this.time(m.at)}</div>`;
      if (m.deleted) return CHATX.deletedBubble(m, mine);
      return `<div class="msg ${mine ? 'me' : 'th'}${m.reactions && m.reactions.length ? ' hasrx' : ''}" data-id="${m.id}">${mine ? '' : `<span class="gsn" style="color:${this.gcolor(m.from)}">${this.gname(m.from)}</span>`}<div class="mb${m.image ? ' hasimg' : ''}">${CHATX.inner(m)}</div>${CHATX.rx(m)}<small>${this.time(m.at)}${m.edited ? ' · edited' : ''}</small></div>`;
    },
    /* double-tap a message to reply (a long press opens the menu instead) */
    tapMsg(e) {
      if (Date.now() - (this._lp || 0) < 700) { this._tp = null; return }
      const el = e.target.closest && e.target.closest('.msg[data-id]'); if (!el) return;
      const id = el.dataset.id, now = Date.now();
      if (this._tp && this._tp.id === id && now - this._tp.t < 380) { this._tp = null; this.setReply(id) } else this._tp = { id, t: now };
    },
    setReply(id, focus) {
      const m = find(id); if (!m || m.kind !== 'text' || m.deleted || !$('cinput')) return;
      this.editing = null; this.replyTo = { id: m.id, from: m.from, text: label(m).slice(0, 120) }; CHATX.bars();
      if (focus !== false) { if (navigator.vibrate) navigator.vibrate(15); const i = $('cinput'); if (i) i.focus() }
    },
    cancelReply() { this.replyTo = null; CHATX.bars() },
    cancelEdit(keep) { this.editing = null; if (keep !== true) { const i = $('cinput'); if (i) i.value = '' } CHATX.bars() },
    sendInput() { const i = $('cinput'), t = i.value.trim(); if (this.editing) return CHATX.saveEdit(t); if (!t) return; i.value = ''; this.send(t) },
    gSendInput() { const i = $('cinput'), t = i.value.trim(); if (this.editing) return CHATX.saveEdit(t); if (!t) return; i.value = ''; this.gSend(t) },
    async send(t, extra) {
      const rid = this.replyTo && this.replyTo.id; this.cancelReply();
      try { this.push((await NET.api('/api/ac/messages/' + this.chatId, { method: 'POST', body: { text: t, replyTo: rid || undefined, ...(extra || {}) } })).message) } catch (e) { toast(e.message) }
    },
    async gSend(t, extra) {
      const rid = this.replyTo && this.replyTo.id; this.cancelReply();
      try { const r = await NET.api(`/api/ac/groups/${this.gid}/messages`, { method: 'POST', body: { text: t, replyTo: rid || undefined, ...(extra || {}) } }); this.gpush(r.message) }
      catch (e) { toast(e.message); if (e.status === 403 || e.status === 404) this.gRefresh() }
    }
  });

  /* live updates from the other side: reactions, edits, deletes */
  const _on = PH.on;
  PH.on = function (ev, p) {
    if (ev === 'dmupd') {
      const peer = p.from === ME() ? p.to : p.from;
      NET.drop('/api/ac/chats');
      const h = NET.cache.get('/api/ac/messages/' + peer);
      if (h && h.d && h.d.messages) { const i = h.d.messages.findIndex(x => x.id === p.id); if (i >= 0) h.d.messages[i] = p }
      if (this.view === 'chat' && this.chatId === peer) { const j = this.msgs.findIndex(x => x.id === p.id); if (j >= 0) this.msgs[j] = p; this.drawMsgs(true) }
      else if (this.view === 'messages' && this.tab === 'chats') this.drawChats();
      return;
    }
    if (ev === 'gmsgupd') {
      NET.drop('/api/ac/groups');
      if (this.g && this.gid === p.group) { const i = this.g.messages.findIndex(x => x.id === p.id); if (i >= 0) this.g.messages[i] = p; if (this.view === 'group') this.gmsgs(true) }
      else if (this.view === 'messages' && this.tab === 'groups') this.drawGroups();
      return;
    }
    return _on.call(this, ev, p);
  };
})();
