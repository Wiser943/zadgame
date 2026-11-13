/* Notice banner: the yellowish "good to know" card that explains how withdrawals work (rules, seasons, batches).
   It sits at the top of PGist Discover, Bank > Withdraw and Messages, rotates through a few short cards, and can be hidden. */
const NOTICE = {
  KEY: 'ac:notice:hide', i: 0, timer: 0, sx: 0,
  SLIDES: [
    ['How withdrawals work', 'Your ₦ is virtual game money. Real payouts run in limited seasons: when one is open you check your eligibility, add your bank details and submit a request during an open batch.'],
    ['Seasons', 'A season is a fixed window with a start and an end date, and it allows 1 or 2 payouts per player. Between seasons withdrawals are closed. Watch Updates: we announce when the next one opens.'],
    ['Batches', 'Every season has 3 batches. Each one opens and closes at set times, has its own limited budget and its own smallest and biggest payout. Your first batch choice sets your rotation, so pick carefully.'],
    ['Missed your batch?', 'If a batch closes before you are paid, your unused eligible units roll forward to your next slot.'],
    ['Eligibility', 'Usually you need a minimum eligible balance, an account that is at least a week old, completed payout details and an account in good standing. The exact rules are listed on the Withdraw page.'],
    ['Account verification notice', 'Accounts without properties, furniture, or cars may be flagged as potential bot accounts, resulting in temporary withdrawal holds. This ensures real players benefit.'],
    ['After you submit', 'Your request goes to admin review: Waiting for review, then Approved, then Being paid, then Paid by bank transfer. If it is held or not approved, the reason shows on the request.']
  ],
  hidden() { try { return localStorage.getItem(this.KEY) === '1' } catch (e) { return false } },
  html() {
    if (this.hidden()) return '<div class="nbn off"><button type="button" class="nbmini" onclick="NOTICE.toggle()" aria-label="Show the withdrawal notice">📌 Withdrawal info <u>Show ▾</u></button></div>';
    this.start();
    const s = this.SLIDES[this.i % this.SLIDES.length];
    return `<div class="nbn" role="region" aria-label="Withdrawal notice" ontouchstart="NOTICE.ts(event)" ontouchend="NOTICE.te(event)">
      <div class="nbh"><b>📌 GOOD TO KNOW</b><button type="button" onclick="NOTICE.toggle()" aria-label="Hide this notice">Hide <i>▴</i></button></div>
      <div class="nbc"><div class="nbt">${s[0]}</div><p>${s[1]}</p></div>
      <div class="nbd">${this.SLIDES.map((_, k) => `<button type="button" class="${k === this.i % this.SLIDES.length ? 'on' : ''}" onclick="NOTICE.go(${k})" aria-label="Notice ${k + 1}"></button>`).join('')}</div></div>`;
  },
  /* put the banner at the top of a screen body (used where the body is redrawn by other code) */
  inject(el) { if (!el || el.querySelector(':scope > .nbn')) return; el.insertAdjacentHTML('afterbegin', this.html()) },
  paint() { document.querySelectorAll('.nbn:not(.off)').forEach(e => { const w = document.createElement('div'); w.innerHTML = this.html(); e.replaceWith(w.firstElementChild) }) },
  go(k) { this.i = k; this.paint(); this.start(true) },
  step(d) { this.i = (this.i + d + this.SLIDES.length) % this.SLIDES.length; this.paint() },
  toggle() { try { localStorage.setItem(this.KEY, this.hidden() ? '0' : '1') } catch (e) {} document.querySelectorAll('.nbn').forEach(e => { const w = document.createElement('div'); w.innerHTML = this.html(); e.replaceWith(w.firstElementChild) }) },
  ts(e) { this.sx = e.changedTouches[0].clientX },
  te(e) { const dx = e.changedTouches[0].clientX - this.sx; if (Math.abs(dx) > 40) { this.step(dx < 0 ? 1 : -1); this.start(true) } },
  start(again) { if (again) clearInterval(this.timer); else if (this.timer) return; this.timer = setInterval(() => { if (!document.querySelector('.nbn:not(.off)')) { clearInterval(this.timer); this.timer = 0; return } this.step(1) }, 7000) }
};
window.NOTICE = NOTICE;
/* the banner also sits above the Chats and Groups lists (those lists are redrawn by phone.js / groups.js) */
if (typeof PH !== 'undefined') {
  const pc = PH.paintChats; PH.paintChats = function () { const r = pc.apply(this, arguments); if (this.view === 'messages') NOTICE.inject(document.getElementById('ab')); return r };
  if (typeof PH.groupSection === 'function') { const gs = PH.groupSection; PH.groupSection = function () { const h = gs.apply(this, arguments); return this.view === 'messages' && this.tab === 'groups' ? NOTICE.html() + h : h } }
}
