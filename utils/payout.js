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
    let ok = true, actual = '';
    if (r.key === 'minBalance') { ok = units >= Number(r.value || 0); actual = units.toLocaleString('en-NG') + ' units'; }
    if (r.key === 'accountAgeDays') { const days = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000); ok = days >= Number(r.value || 0); actual = days + ' day(s)'; }
    if (r.key === 'legalDetails') { ok = !!(user.rewardsInterest && user.rewardsInterest.legalName && user.rewardsInterest.country && user.rewardsInterest.over18); actual = ok ? 'completed' : 'not completed'; }
    if (r.key === 'noSuspension') { ok = !(user.suspendedUntil && new Date(user.suspendedUntil) > new Date()); actual = ok ? 'good standing' : 'suspended'; }
    if (r.key === 'posts') { const count = await userPostCount(user._id); ok = count >= Number(r.value || 0); actual = count + ' post(s)'; }
    results.push({ key: r.key, label: r.label, ok, actual, description: r.description });
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
