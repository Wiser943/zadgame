// Tells every player when a withdrawal season or batch opens (and when a batch is about to close).
// Each notice is claimed atomically on the season document, so it is sent once even with several server instances.
const PayoutSeason = require('../models/PayoutSeason');
const { notify } = require('../utils/acnotify');

const money = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
const when = (d) => new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

async function claim(season, key) {
  const r = await PayoutSeason.updateOne({ _id: season._id, announced: { $ne: key } }, { $addToSet: { announced: key } });
  return r.modifiedCount === 1;
}
const send = (io, text, icon = '🏦') => notify(io, null, { icon, text, kind: 'good', ref: 'u:payouts' }).catch((e) => console.error('[withdrawal notice]', e.message));

async function tick(io) {
  const now = new Date(), sent = [];
  const seasons = await PayoutSeason.find({ status: { $in: ['scheduled', 'active'] }, startsAt: { $lte: now }, endsAt: { $gte: now } }).lean();
  for (const s of seasons) {
    if (await claim(s, 'season:open')) {
      await send(io, `Withdrawal Season ${s.seasonNo} is now open! Open AllConnect Pay → Withdrawals to check your eligibility and get ready. Season ends ${when(s.endsAt)}.`, '🎉');
      sent.push('season:open');
    }
    for (const b of s.batches || []) {
      const live = b.status === 'open' && new Date(b.opensAt) <= now && new Date(b.closesAt) >= now;
      if (!live) continue;
      if (await claim(s, `batch:${b.number}:open`)) {
        await send(io, `Withdrawals are open for Season ${s.seasonNo}, Batch ${b.number}. Submit your request in AllConnect Pay before ${when(b.closesAt)}. Up to ${money(b.maxPayout)} per player.`);
        sent.push(`batch:${b.number}:open`);
      }
      const left = new Date(b.closesAt) - now;
      if (left > 0 && left <= 24 * 3600 * 1000 && await claim(s, `batch:${b.number}:closing`)) {
        await send(io, `Last chance: Season ${s.seasonNo}, Batch ${b.number} withdrawals close ${when(b.closesAt)}.`, '⏰');
        sent.push(`batch:${b.number}:closing`);
      }
    }
  }
  return sent;
}

// Called when the admin changes a status, so players hear about it straight away instead of waiting for the next tick.
// reopen: forget earlier notices for that part so a re-opened season/batch is announced again.
async function afterAdminChange(io, seasonId, { season = false, batch = 0 } = {}) {
  const pull = [];
  if (season) pull.push('season:open');
  if (batch) pull.push(`batch:${batch}:open`, `batch:${batch}:closing`);
  if (pull.length) await PayoutSeason.updateOne({ _id: seasonId }, { $pull: { announced: { $in: pull } } });
  return tick(io);
}
module.exports = { tick, afterAdminChange };
