// Verified badge: pricing, status view and expiry sweep (shared by the player and admin routes)
const DAY = 86400e3;
const DEFAULTS = { enabled: true, monthly: 50000, yearly: 500000 };   // game money (Naira); the admin can change these
async function pricing() {
  const ACSetting = require('../models/ACSetting');
  const d = await ACSetting.findById('verifyPricing').lean().catch(() => null), v = (d && d.value) || {};
  return { enabled: v.enabled !== false, monthly: Math.max(0, Math.round(Number(v.monthly ?? DEFAULTS.monthly))), yearly: Math.max(0, Math.round(Number(v.yearly ?? DEFAULTS.yearly))) };
}
const priceFor = (u, plan, P) => { const r = u.vreq || {}; return plan === 'yearly' ? (r.yearly > 0 ? r.yearly : P.yearly) : (r.monthly > 0 ? r.monthly : P.monthly) };
const periodMs = (plan) => (plan === 'yearly' ? 365 : 30) * DAY;
// A paid badge ran out: renew it from the wallet when auto-renew is on and there is enough money, otherwise switch the tick off.
async function settleExpired(u, io) {
  const User = require('../models/User'), { notify } = require('./acnotify'), r = u.vreq || {}, plan = r.plan === 'yearly' ? 'yearly' : 'monthly', now = Date.now();
  if (r.autoRenew) {
    const P = await pricing(), price = priceFor(u, plan, P), base = r.expiresAt && now - new Date(r.expiresAt) < periodMs(plan) ? new Date(r.expiresAt).getTime() : now, expiresAt = new Date(base + periodMs(plan));
    const q = { _id: u._id, 'vreq.status': 'active', 'vreq.expiresAt': { $lt: new Date(now) } }; if (price > 0) q['ac.cash'] = { $gte: price };
    const ok = await User.findOneAndUpdate(q, { $inc: { 'ac.cash': -price }, $set: { verified: true, 'vreq.paidAt': new Date(), 'vreq.expiresAt': expiresAt } }, { new: true });
    if (ok) { notify(io, String(u._id), { icon: '✅', text: `Your verified badge was renewed for ${price.toLocaleString('en-NG')} naira. It now runs until ${expiresAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}.`, kind: 'good' }).catch(() => {}); return 'renewed' }
  }
  const done = await User.updateOne({ _id: u._id, 'vreq.status': 'active', 'vreq.expiresAt': { $lt: new Date(now) } }, { $set: { verified: false, 'vreq.status': 'expired' } });
  if (done.modifiedCount || done.nModified) { notify(io, String(u._id), { icon: '⏰', text: r.autoRenew ? 'Your verified badge ended: there was not enough money in your wallet to renew it.' : 'Your verified badge has ended. Renew it in Manage to get your tick back.', kind: 'info' }).catch(() => {}); return 'expired' }
  return ''
}
async function sweep(io) {
  const User = require('../models/User');
  const due = await User.find({ 'vreq.mode': 'paid', 'vreq.status': 'active', 'vreq.expiresAt': { $lt: new Date() } }).select('verified vreq ac.cash').limit(200).lean();
  let n = 0; for (const u of due) if (await settleExpired(u, io)) n++;
  return n;
}
async function expireOne(id, io) {
  const User = require('../models/User'), u = await User.findOne({ _id: id, 'vreq.mode': 'paid', 'vreq.status': 'active', 'vreq.expiresAt': { $lt: new Date() } }).select('verified vreq ac.cash').lean();
  if (u) await settleExpired(u, io)
}
function view(u, P) {
  const r = u.vreq || {}; let status = r.status || '', mode = r.mode || '';
  if (!status && u.verified) { status = 'active'; mode = 'permanent' }          // ticks the admin gave by hand count as permanent
  const left = r.expiresAt ? Math.max(0, Math.ceil((new Date(r.expiresAt) - Date.now()) / DAY)) : null;
  return { status, mode, plan: r.plan || '', verified: !!u.verified, note: status === 'rejected' ? (r.note || '') : '', requestedAt: r.requestedAt || null, expiresAt: r.expiresAt || null, daysLeft: left,
    prices: { monthly: priceFor(u, 'monthly', P), yearly: priceFor(u, 'yearly', P) }, enabled: P.enabled, cash: (u.ac && u.ac.cash) || 0,
    autoRenew: !!r.autoRenew, canRequest: P.enabled && ['', 'rejected'].includes(status) && !u.verified, canSubscribe: mode === 'paid' && ['approved', 'active', 'expired'].includes(status) }
}
module.exports = { pricing, priceFor, sweep, expireOne, view, DAY, DEFAULTS };
