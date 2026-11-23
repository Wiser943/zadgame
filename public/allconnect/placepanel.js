/* placepanel.js: the bottom "place card" shown whenever you are INSIDE a place with other people: a workplace, a friend's home you visit, ...
   Shows where you are, the main actions (Work a shift, Leave, Go home), a chat box to everyone there, quick emotes, "Take a seat" and "Spots here"
   (tap one to walk there). It is only the screen: each place passes in what the buttons do (see PLACE.show below). Works on phones and desktop. */
(function (g) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const EMO = [['wave', '👋', 'Wave'], ['laugh', '😂', 'Laugh'], ['dance', '💃', 'Dance'], ['abeg', '🙏', 'Abeg'], ['hiss', '😤', 'Hiss'], ['clap', '👏', 'Clap']];
  const PLACE = {
    el: null, cfg: null, folded: null, logT: [],
    /* cfg = { id, icon, name, sub, actions:[{id,label,icon,kind:'primary'|'ghost',on,disabled}], count (number of people here), onSay(text), onEmote(id), onSeat(), spots:[{label,badge,go}], more:[{label,on}], host (element to mount in, default body) } */
    show(cfg) {
      this.hide(); this.cfg = cfg; this.logT = []; if (this.folded === null) this.folded = window.innerWidth < 520;     // phones start folded so you can see the room
      const el = this.el = document.createElement('div'); el.id = 'plc'; el.className = 'plc' + (this.folded ? ' folded' : '');
      el.innerHTML = `<div class="plc-log" id="plcLog" aria-live="polite"></div><div class="plc-card"><button class="plc-grab" aria-label="Show or hide the place card"></button>
        <div class="plc-head"><span class="plc-ic" id="plcIc"></span><div class="plc-ti"><b id="plcName"></b><small id="plcSub"></small></div><button class="plc-b" id="plcMore" aria-label="More">⋯</button><button class="plc-b" id="plcFold" aria-label="Show or hide">⌃</button></div>
        <div class="plc-acts" id="plcActs"></div>
        <div class="plc-body" id="plcBody">
          <form class="plc-say" id="plcSay" autocomplete="off"><input id="plcIn" type="text" maxlength="140" enterkeyhint="send" aria-label="Say something"><kbd>Enter</kbd><button type="submit" aria-label="Send"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 11.5 21 3l-8.5 18-2.2-7.3z"/></svg></button></form>
          <div class="plc-emo" id="plcEmo"></div>
          <button class="plc-seat" id="plcSeat" type="button">🪑 Take a seat</button>
          <div class="plc-sh" id="plcSh"><b>Spots here</b><small>Tap one to walk there</small></div><div class="plc-spots" id="plcSpots"></div>
        </div></div><div class="plc-menu" id="plcMenu" hidden></div>`;
      (cfg.host || document.body).appendChild(el);
      const $ = id => el.querySelector('#' + id);
      $('plcEmo').innerHTML = EMO.map(e => `<button type="button" data-e="${e[0]}"><i>${e[1]}</i><span>${e[2]}</span></button>`).join('');
      $('plcEmo').onclick = ev => { const b = ev.target.closest('button[data-e]'); if (b && this.cfg.onEmote) this.cfg.onEmote(b.dataset.e) };
      $('plcSay').onsubmit = ev => { ev.preventDefault(); const i = $('plcIn'), t = i.value.trim(); if (!t) return; i.value = ''; if (this.cfg.onSay) this.cfg.onSay(t) };
      // keep game shortcuts (W A S D, H, S ...) from firing while you type
      $('plcIn').addEventListener('keydown', ev => ev.stopPropagation()); $('plcIn').addEventListener('keyup', ev => ev.stopPropagation());
      $('plcSeat').onclick = () => { if (this.cfg.onSeat) this.cfg.onSeat() };
      const fold = () => { this.folded = !this.folded; el.classList.toggle('folded', this.folded); $('plcFold').textContent = this.folded ? '⌃' : '⌄' };
      el.querySelector('.plc-grab').onclick = fold; $('plcFold').onclick = fold; $('plcFold').textContent = this.folded ? '⌃' : '⌄';
      $('plcMore').onclick = ev => { ev.stopPropagation(); const m = $('plcMenu'); if (!(this.cfg.more || []).length) return; m.hidden = !m.hidden; if (!m.hidden) setTimeout(() => document.addEventListener('click', () => { m.hidden = true }, { once: true }), 0) };
      this.paint(); return el;
    },
    /* update any part: PLACE.patch({ sub: '...', count: 5, actions: [...] }) */
    patch(p) { if (!this.el) return; Object.assign(this.cfg, p); const c = this.cfg, sig = JSON.stringify([c.name, c.sub, c.count, c.icon, (c.actions || []).map(a => [a.label, a.disabled]), (c.spots || []).map(x => x.label)]); if (sig === this._sig) return; this._sig = sig; this.paint() },
    paint() {
      const el = this.el, c = this.cfg; if (!el || !c) return; const $ = id => el.querySelector('#' + id);
      $('plcIc').textContent = c.icon || '📍'; $('plcName').textContent = c.name || ''; $('plcSub').textContent = c.sub || '';
      const n = Number(c.count) || 0; $('plcIn').placeholder = c.placeholder || (n > 1 ? `Say something to all ${n} here...` : 'Say something...');
      $('plcActs').innerHTML = (c.actions || []).map((a, i) => `<button type="button" class="plc-a ${a.kind === 'primary' ? 'pri' : 'gh'}" data-i="${i}" ${a.disabled ? 'disabled' : ''}>${a.icon ? '<i>' + a.icon + '</i>' : ''}<span>${esc(a.label)}</span></button>`).join('');
      $('plcActs').onclick = ev => { const b = ev.target.closest('button[data-i]'); if (!b) return; const a = c.actions[+b.dataset.i]; if (a && a.on && !a.disabled) a.on() };
      $('plcSeat').hidden = !c.onSeat;
      const sp = c.spots || []; $('plcSh').hidden = $('plcSpots').hidden = !sp.length;
      $('plcSpots').innerHTML = sp.map((s, i) => `<button type="button" data-i="${i}">${esc(s.label)}${s.badge != null ? `<em>${esc(s.badge)}</em>` : ''}</button>`).join('');
      $('plcSpots').onclick = ev => { const b = ev.target.closest('button[data-i]'); if (b && sp[+b.dataset.i] && sp[+b.dataset.i].go) sp[+b.dataset.i].go() };
      $('plcMore').hidden = !(c.more || []).length;
      $('plcMenu').innerHTML = (c.more || []).map((m, i) => `<button type="button" data-i="${i}">${esc(m.label)}</button>`).join('');
      $('plcMenu').onclick = ev => { const b = ev.target.closest('button[data-i]'); if (b && c.more[+b.dataset.i]) { $('plcMenu').hidden = true; c.more[+b.dataset.i].on() } };
    },
    /* a line of chat above the card: PLACE.chat('Amaka', 'hello', false) */
    chat(from, text, mine) {
      const log = this.el && this.el.querySelector('#plcLog'); if (!log) return;
      const row = document.createElement('div'); row.className = 'plc-msg' + (mine ? ' me' : ''); row.innerHTML = `<b>${esc(from)}</b> ${esc(text)}`; log.appendChild(row);
      while (log.children.length > 4) log.firstChild.remove();
      setTimeout(() => { row.classList.add('out'); setTimeout(() => row.remove(), 600) }, 9000)
    },
    hide() { if (this.el) { this.el.remove(); this.el = null } this.cfg = null }
  };
  g.PLACE = PLACE;
})(window);
