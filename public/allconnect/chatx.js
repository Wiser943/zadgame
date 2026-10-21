/* ================= Chat extras (private chats + group chats) =================
   Press and hold a message (or right-click it) for a WhatsApp-style menu:
     react  ·  reply  ·  forward  ·  copy  ·  edit (your own, 15 min)  ·  delete (for me / for everyone)
   Double-tap still replies. The paperclip-style photo button sends a picture (with an optional caption).
   Every rule is enforced by the server (routes/acsocial.js, routes/acgroups.js, utils/acchat.js); this file only draws and asks.
   Adds to PH (phone.js + groups.js), so it must load after both. */
(function () {
  'use strict';
  const EMO = ['👍', '❤️', '😂', '😮', '😢', '🙏'], MORE = ['🔥', '👏', '🎉', '😍', '😭', '🤝'];
  /* Line icons that replace the emoji in the long-press menu and on reaction badges. The server still stores the emoji
     (that is what a reaction IS); only what is drawn changes. Each icon has an accent colour. */
  const ICON = {
    "👍": ["#2f6fdb", "<path d=\"M7 10v12\"/><path d=\"M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z\"/>"],
    "❤️": ["#e5314b", "<path fill=\"currentColor\" d=\"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z\"/>"],
    "😂": ["#e8a500", "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z\"/><path d=\"M9 9h.01M15 9h.01\"/>"],
    "😮": ["#e8a500", "<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"16\" r=\"2\"/><path d=\"M9 9h.01M15 9h.01\"/>"],
    "😢": ["#4a86d6", "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M16 16s-1.5-2-4-2-4 2-4 2\"/><path d=\"M9 9h.01M15 9h.01\"/><path d=\"M8.2 12.2c-.5 1.2-.5 2 0 2.6.5-.6.5-1.4 0-2.6Z\" fill=\"currentColor\"/>"],
    "🙏": ["#c47f1a", "<path d=\"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2\"/><path d=\"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2\"/><path d=\"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8\"/><path d=\"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15\"/>"],
    "🔥": ["#f26b1d", "<path fill=\"currentColor\" d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z\"/>"],
    "👏": ["#d99a1c", "<path d=\"M8.5 20.5 4.2 15.8a1.8 1.8 0 0 1 0-2.5l.4-.4a1.8 1.8 0 0 1 2.5 0l1.5 1.5\"/><path d=\"M8 14.2 5.3 11.5a1.8 1.8 0 0 1 0-2.5 1.8 1.8 0 0 1 2.5 0L11 12.2\"/><path d=\"M11 12.2 8.9 10a1.8 1.8 0 0 1 0-2.5 1.8 1.8 0 0 1 2.5 0l3.9 4\"/><path d=\"M15.3 11.5 17 9.8a1.8 1.8 0 0 1 2.5 2.5l-5.6 7.2a4 4 0 0 1-5.4.9\"/><path d=\"M15 3.2 16 5M19.5 5 18 6.3M21 9.5h-1.8\"/>"],
    "🎉": ["#8b4be0", "<path d=\"M5.8 11.3 2 22l10.7-3.79\"/><path d=\"M4 3h.01M22 8h.01M15 2h.01M22 20h.01\"/><path d=\"m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10\"/><path d=\"m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11-.11.7-.72 1.22-1.43 1.22H17\"/><path d=\"m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7\"/><path d=\"M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z\"/>"],
    "😍": ["#e5314b", "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M8 14s1.5 2 4 2 4-2 4-2\"/><path fill=\"currentColor\" stroke=\"none\" d=\"M8.6 10.8c-1.4-1-2.1-1.8-2.1-2.7 0-.8.6-1.4 1.3-1.4.5 0 .8.2 .8.6.0-.4.3-.6.8-.6.7 0 1.3.6 1.3 1.4 0 .9-.7 1.7-2.1 2.7Z\"/><path fill=\"currentColor\" stroke=\"none\" d=\"M15.4 10.8c-1.4-1-2.1-1.8-2.1-2.7 0-.8.6-1.4 1.3-1.4.5 0 .8.2.8.6 0-.4.3-.6.8-.6.7 0 1.3.6 1.3 1.4 0 .9-.7 1.7-2.1 2.7Z\"/>"],
    "😭": ["#4a86d6", "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M16 17s-1.5-2-4-2-4 2-4 2\"/><path d=\"M8 9v4M16 9v4\"/><path d=\"M9 9h.01M15 9h.01\"/>"],
    "🤝": ["#1f9d6b", "<path d=\"m11 17 2 2a1 1 0 1 0 3-3\"/><path d=\"m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.55-2.55a5.8 5.8 0 0 1 7.2-.8L21 7\"/><path d=\"m21 3 1 11h-2\"/><path d=\"M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3\"/><path d=\"M3 4h8\"/>"],
    "reply": ["#5b6477", "<path d=\"M9 14 4 9l5-5\"/><path d=\"M20 20v-7a4 4 0 0 0-4-4H4\"/>"],
    "forward": ["#5b6477", "<path d=\"m15 14 5-5-5-5\"/><path d=\"M4 20v-7a4 4 0 0 1 4-4h12\"/>"],
    "copy": ["#5b6477", "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>"],
    "edit": ["#5b6477", "<path d=\"M12 20h9\"/><path d=\"M16.38 3.62a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z\"/>"],
    "trash": ["#d33a3f", "<path d=\"M3 6h18\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/><path d=\"M10 11v6M14 11v6\"/>"],
    "plus": ["#5b6477", "<path d=\"M12 5v14M5 12h14\"/>"],
    "ban": ["#8a90a2", "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m4.9 4.9 14.2 14.2\"/>"],
    "other": ["#e8a500", "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M8 14s1.5 2 4 2 4-2 4-2\"/><path d=\"M9 9h.01M15 9h.01\"/>"]
  };
  const NAMES = { '👍': 'Like', '❤️': 'Love', '😂': 'Haha', '😮': 'Wow', '😢': 'Sad', '🙏': 'Thanks', '🔥': 'Fire', '👏': 'Applause', '🎉': 'Celebrate', '😍': 'Adore', '😭': 'Crying', '🤝': 'Deal' };
  const cxi = (k, cls) => { const d = ICON[k] || ICON.other; return `<svg class="cxi ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="color:${d[0]}" aria-hidden="true">${d[1]}</svg>` };
  const EDIT_MS = 15 * 60 * 1000, DEL_MS = 48 * 3600 * 1000, LONG_MS = 450, PHOTO = '📷 Photo';
  const ME = () => NET.user.id;
  const isG = () => PH.view === 'group';
  const list = () => (isG() ? (PH.g && PH.g.messages) : PH.msgs) || [];
  const find = id => list().find(x => x.id === id);
  const label = m => m.text || (m.image ? PHOTO : '') || (m.voice ? ' Voice note' : '');
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
      if (m.voice) h += window.VN ? VN.bubble(m.voice, plain) : '';
      if (m.text) h += `<div class="mtx">${esc(m.text)}</div>`;
      return h;
    },
    rx(m) {
      const rs = m.reactions || []; if (!rs.length) return '';
      const by = {}; rs.forEach(r => { (by[r.e] = by[r.e] || []).push(r.u) });
      return `<div class="rxs">${Object.keys(by).map(e => `<button class="rx ${by[e].includes(ME()) ? 'on' : ''}" onclick="event.stopPropagation();CHATX.react('${m.id}','${e}')" aria-label="${NAMES[e] || 'Reaction'}">${cxi(e)}${by[e].length > 1 ? `<i>${by[e].length}</i>` : ''}</button>`).join('')}</div>`;
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
      const act = (ic, txt, fn, red) => `<button class="${red ? 'red' : ''}" onclick="CHATX.closeMenu();${fn}"><span>${cxi(ic)}</span>${txt}</button>`;
      const acts = (del ? '' : (canType ? act('reply', 'Reply', `PH.setReply('${id}')`) : '') + act('forward', 'Forward', `CHATX.fwd('${id}')`) + (m.text ? act('copy', 'Copy', `CHATX.copy('${id}')`) : '') + (canEdit ? act('edit', 'Edit', `CHATX.startEdit('${id}')`) : '')) + act('trash', 'Delete', `CHATX.delAsk('${id}')`, true);
      const o = document.createElement('div'); o.className = 'cxm';
      o.onclick = e => { if (e.target === o) CHATX.closeMenu() };
      o.innerHTML = `<div class="cxwrap ${mine ? 'me' : 'th'}">
        ${del ? '' : `<div class="cxbar">${EMO.map(e => `<button class="${mr === e ? 'on' : ''}" aria-label="${NAMES[e] || 'React'}" onclick="CHATX.react('${id}','${e}')">${cxi(e)}</button>`).join('')}<button class="more" aria-label="More reactions" onclick="this.parentNode.nextElementSibling.classList.toggle('open')">${cxi('plus')}</button></div>
        <div class="cxbar cxbar2">${MORE.map(e => `<button class="${mr === e ? 'on' : ''}" aria-label="${NAMES[e] || 'React'}" onclick="CHATX.react('${id}','${e}')">${cxi(e)}</button>`).join('')}</div>`}
        <div class="cxprev msg ${mine ? 'me' : 'th'}"><div class="mb ${del ? 'gdel' : ''}">${del ? cxi('ban', 'sm') + ' This message was deleted' : CHATX.inner(m, true)}</div></div>
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
      if (!t && !m.image && !m.voice) return toast('A message cannot be empty');
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
    /* ---------- voice notes ---------- */
    mic() { if (!window.VN) return; VN.record(v => { isG() ? PH.gSend('', { voice: v }) : PH.send('', { voice: v }) }) },
    /* the round button next to the box: send when there is text, otherwise hold to record (voice.js) */
    vn: { send() { isG() ? PH.gSendInput() : PH.sendInput() }, voice(v) { isG() ? PH.gSend('', { voice: v }) : PH.send('', { voice: v }) } },
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
      return `<div class="msg ${mine ? 'me' : 'th'}${m.reactions && m.reactions.length ? ' hasrx' : ''}" data-id="${m.id}"><div class="mb${m.image ? ' hasimg' : ''}${m.voice ? ' hasvn' : ''}">${CHATX.inner(m)}</div>${CHATX.rx(m)}<small>${this.time(m.at)}${m.edited ? ' · edited' : ''}${mine && last && m.read ? ' · Seen' : ''}</small></div>`;
    },
    gbubble(m) {
      const mine = m.from === ME();
      if (m.kind === 'system') return `<div class="sys">${esc(m.text)} · ${this.time(m.at)}</div>`;
      if (m.deleted) return CHATX.deletedBubble(m, mine);
      return `<div class="msg ${mine ? 'me' : 'th'}${m.reactions && m.reactions.length ? ' hasrx' : ''}" data-id="${m.id}">${mine ? '' : `<span class="gsn" style="color:${this.gcolor(m.from)}">${this.gname(m.from)}</span>`}<div class="mb${m.image ? ' hasimg' : ''}${m.voice ? ' hasvn' : ''}">${CHATX.inner(m)}</div>${CHATX.rx(m)}<small>${this.time(m.at)}${m.edited ? ' · edited' : ''}</small></div>`;
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
  if (window.VN && window.CHATX) VN.cfg.chat = CHATX.vn;
})();
