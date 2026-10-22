// Pet alerts: while the owner is away, a gentle notification (stored in Updates + push) when the pet is hungry or ill,
// and the surprise "sudden illness" can start here too. At most 2 alerts per absence, 6 hours apart, never at night (Lagos time).
// Needs are only measured here, never saved, so the 8-hour "away" limit in utils/acpet.js stays the same.
const P = require('../utils/acpet');
const GAP_MS = 6 * 3600e3, IDLE_MS = 90 * 60e3, MAX_ALERTS = 2;
const quiet = (now, prefs) => {
  const p = Object.assign({}, P.ALERT_DEFAULTS, prefs || {}), h = new Date(now + 3600e3).getUTCHours();
  if (p.quietStart === p.quietEnd) return false;
  return p.quietStart < p.quietEnd ? h >= p.quietStart && h < p.quietEnd : h >= p.quietStart || h < p.quietEnd;
};
/* c = her needs after catching up with the time that passed (a plain copy) */
function decide(c, prefs) {
  const p = Object.assign({}, P.ALERT_DEFAULTS, prefs || {});
  if (p.illness && P.sick(c)) return c.emergency && c.emergency.name ? { icon: '🤒', text: `${c.name} has ${c.emergency.name}! A vet visit would help.` } : { icon: '🤒', text: `${c.name} is not feeling well. Medicine or a vet visit would help.` };
  if (p.hunger && c.hunger < 20) return { icon: '🍛', text: `${c.name} is hungry! Feed her before she gets ill.` };
  if (p.clean && c.clean < 12) return { icon: '🛁', text: `${c.name} is very dirty and would love a bath.` };
  return null;
}
async function tick(io, now = Date.now(), deps = {}) {
  const ACPet = deps.ACPet || require('../models/ACPet'), notify = deps.notify || require('../utils/acnotify').notify, cut = new Date(now - GAP_MS);
  const due = { $or: [{ lastNote: null }, { lastNote: { $lt: cut } }] };
  const rows = await ACPet.find({ alerts: { $ne: false }, t: { $lt: new Date(now - IDLE_MS) }, noteN: { $not: { $gte: MAX_ALERTS } }, ...due }).limit(200).lean();
  let sent = 0;
  for (const row of rows) {
    const c = Object.assign({}, row); P.roll(c, now); const pending = !!c.sickPending; P.advance(c, now);
    const prefs = P.alertPrefs(row); if (quiet(now, prefs)) continue;
    const msg = decide(c, prefs); if (!msg) continue;
    const claim = await ACPet.updateOne({ _id: row._id, noteN: { $not: { $gte: MAX_ALERTS } }, ...due },
      { $set: { lastNote: new Date(now), nextEmergency: c.nextEmergency, emergency: c.emergency || null, sickPending: pending || !!row.sickPending }, $inc: { noteN: 1 } });
    if (!(claim.modifiedCount || claim.nModified)) continue;               // another server instance got there first
    try { await notify(io, row.user, { icon: msg.icon, text: msg.text, kind: 'info' }); sent++; } catch (e) { console.error('[pet alert]', e.message); }
  }
  return sent;
}
module.exports = { tick, decide, quiet };
