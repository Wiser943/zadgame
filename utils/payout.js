const crypto = require('crypto');
const User = require('../models/User');
const PayoutAccount = require('../models/PayoutAccount');
const PayoutRequest = require('../models/PayoutRequest');
const PayoutSeason = require('../models/PayoutSeason');

const key = crypto.createHash('sha256').update(String(process.env.SESSION_SECRET || process.env.ADMIN_PIN || 'change-me-payout-secret')).digest();
const enc = (value) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([c.update(String(value), 'utf8'), c.final()]); return [iv.toString('hex'), c.getAuthTag().toString('hex'), data.toString('hex')].join(':'); };
const dec = (value) => { try { const [iv, tag, data] = String(value).split(':').map(x => Buffer.from(x, 'hex')); const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(data), d.final()]).toString('utf8'); } catch (_) { return ''; } };

const DEFAULT_RULES = [
  { key: 'minBalance', label: 'Minimum eligible balance', enabled: true, value: 3000000, description: 'Your eligible virtual balance must reach this amount.' },
  { key: 'accountAgeDays', label: 'Account age', enabled: true, value: 7, description: 'Your account must be this many days old.' },
  { key: 'legalDetails', label: 'Legal payout details', enabled: true, value: 1, description: 'You must complete the payout registration details.' },
  { key: 'noSuspension', label: 'Account in good standing', enabled: true, value: 1, description: 'Suspended or fraud-held accounts cannot withdraw.' },
  { key: 'posts', label: 'Minimum P-Gist posts', enabled: false, value: 0, description: 'Optional activity requirement set by the admin.' }
];
const rulesFor = season => season.rules && season.rules.length ? season.rules : DEFAULT_RULES;
const userPostCount = async userId => { try { const Post = require('../models/Gist').GistPost; return Post.countDocuments({ author: String(userId), hidden: { $ne: true } }); } catch (_) { return 0; } };
async function eligibility(user, season) {
  const a = await PayoutAccount.findOne({ user: String(user._id) }).lean();
  const units = Math.max(0, Number(user.ac && user.ac.cash || 0));
  const results = [];
  for (const r of rulesFor(season)) {
    if (!r.enabled) continue;
    let ok = true, actual = '', have = null, need = null, left = null, unit = '', detail = '';
    const fmt = n => Number(n).toLocaleString('en-NG'), plural = (n, w) => fmt(n) + ' ' + w + (Number(n) === 1 ? '' : 's');
    if (r.key === 'minBalance') {
      need = Number(r.value || 0); have = units; ok = have >= need; left = Math.max(0, need - have); unit = 'units'; actual = fmt(units) + ' units';
      detail = ok ? `You have ${fmt(have)} units. The minimum is ${fmt(need)}.` : `You have ${fmt(have)} of the ${fmt(need)} units needed. You still need ${fmt(left)} more units.`;
    }
    if (r.key === 'accountAgeDays') {
      need = Number(r.value || 0); have = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000); ok = have >= need; left = Math.max(0, need - have); unit = 'days'; actual = have + ' day(s)';
      const when = new Date(new Date(user.createdAt).getTime() + need * 86400000).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
      detail = ok ? `Your account is ${plural(have, 'day')} old. It needs to be at least ${plural(need, 'day')}.` : `Your account is ${plural(have, 'day')} old and must be ${plural(need, 'day')} old. ${plural(left, 'day')} to go. You qualify from ${when}.`;
    }
    if (r.key === 'legalDetails') {
      const ri = user.rewardsInterest || {}, missing = []; if (!ri.legalName) missing.push('your full legal name'); if (!ri.country) missing.push('your country'); if (!ri.over18) missing.push('the 18+ confirmation');
      need = 3; have = 3 - missing.length; left = missing.length; ok = !missing.length; unit = 'details'; actual = ok ? 'completed' : 'not completed';
      detail = ok ? 'Your payout registration is complete.' : `Still missing: ${missing.join(', ')}. Open PGist, tap the menu, then Rewards & payouts to finish it.`;
    }
    if (r.key === 'noSuspension') {
      const until = user.suspendedUntil && new Date(user.suspendedUntil) > new Date() ? new Date(user.suspendedUntil) : null; ok = !until; actual = ok ? 'good standing' : 'suspended';
      if (until) { const hrs = Math.max(1, Math.ceil((until - Date.now()) / 3600000)); detail = `Your account is suspended until ${until.toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} (about ${plural(hrs, 'hour')} left). You can withdraw again once it ends.`; }
      else detail = 'Your account is in good standing. Keep it that way: suspended or fraud-held accounts cannot withdraw.';
    }
    if (r.key === 'posts') {
      const count = await userPostCount(user._id); need = Number(r.value || 0); have = count; ok = have >= need; left = Math.max(0, need - have); unit = 'posts'; actual = count + ' post(s)';
      detail = ok ? `You have ${plural(have, 'post')} on P-Gist. The minimum is ${fmt(need)}.` : `You have ${plural(have, 'post')} of the ${fmt(need)} needed. Make ${plural(left, 'more post')} on P-Gist.`;
    }
    const progress = need ? Math.max(0, Math.min(1, have / need)) : (ok ? 1 : 0);
    results.push({ key: r.key, label: r.label, ok, actual, description: r.description, have, need, left, unit, detail, progress });
  }
  const failed = results.filter(x => !x.ok);
  return { eligible: failed.length === 0, units, rules: results, failed, account: a || null };
}
function batchOrder(startBatch) { const order = [1, 3, 2]; const i = order.indexOf(Number(startBatch)); return i < 0 ? order : order.slice(i).concat(order.slice(0, i)); }
function scheduleFor(startBatch, count = 9) { const o = batchOrder(startBatch), out = []; for (let i = 0; i < count; i++) out.push({ batch: o[i % 3], seasonOffset: Math.floor((i + 1) / 2), slotInSeason: i === 0 ? 0 : (i + 1) % 2 }); return out; }
function rawFor(units, batch) { return Math.max(0, Math.floor(Math.min(Number(units || 0), Number(batch.countedUnitsCap || 5000000)) / Number(batch.unitsPerNaira || 3333.333333))); }
/* What a player is told when an admin acts on their withdrawal. Payment is manual (a bank transfer made by the team, no payment gateway),
   so "approved" means "we will pay you" and "pay" means "the transfer has been sent". Only the last 4 digits of the account are ever shown. */
const naira = (n) => '₦' + Math.round(Number(n || 0)).toLocaleString('en-NG');
function statusMessage(action, r, note = '', ref = '') {
  const where = `Season ${r.seasonNo}, Batch ${r.batch}`, bank = r.bankLast4 ? ` (account ending ${r.bankLast4})` : '', n = note ? ` ${note}` : '';
  switch (action) {
    case 'approve': return { icon: '✅', kind: 'good', tone: 'good', title: 'Withdrawal approved', text: `Your withdrawal for ${where} was approved: ${naira(r.payoutAmount)}. The team pays by manual bank transfer to your account${bank}. You will get another message when it has been sent.` };
    case 'pay': return { icon: '💸', kind: 'good', tone: 'good', title: 'Withdrawal paid', text: `${naira(r.payoutAmount)} for ${where} has been sent to your bank account${bank}.${ref ? ` Transfer reference: ${ref}.` : ''} It can take a little while to show in your bank app.` };
    case 'hold': return { icon: '⏳', kind: 'info', tone: 'info', title: 'Withdrawal on hold', text: `Your withdrawal for ${where} is on hold while the team reviews it.${n}` };
    case 'rollover': return { icon: '🔁', kind: 'info', tone: 'info', title: 'Withdrawal rolled over', text: `Your withdrawal for ${where} was not paid in this batch. Your eligible units are kept for your next scheduled slot.${n}` };
    case 'reject': return { icon: '🚫', kind: 'info', tone: 'warn', title: 'Withdrawal not approved', text: `Your withdrawal for ${where} was not approved.${note ? ` Reason: ${note}` : ''} Open AllConnect Pay → Withdrawals to see what to do next.` };
    default: return null;
  }
}
module.exports = { enc, dec, DEFAULT_RULES, rulesFor, eligibility, scheduleFor, rawFor, statusMessage, naira, PayoutAccount, PayoutRequest, PayoutSeason };
