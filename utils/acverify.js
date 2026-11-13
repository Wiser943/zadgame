// Verified badge: pricing, status view and expiry sweep (shared by the player and admin routes)
const DAY = 86400e3;
const DEFAULTS = { enabled: true, monthly: 50000, yearly: 500000 };   // game money (Naira); the admin can change these
async function pricing() {
  const ACSetting = require('../models/ACSetting');
  const d = await ACSetting.findById('verifyPricing').lean().catch(() => null), v = (d && d.value) || {};
  return { enabled: v.enabled !== false, monthly: Math.max(0, Math.round(Number(v.monthly ?? DEFAULTS.monthly))), yearly: Math.max(0, Math.round(Number(v.yearly ?? DEFAULTS.yearly))) };
}
const priceFor = (u, plan, P) => { const r = u.vreq || {}; return plan === 'yearly' ? (r.yearly > 0 ? r.yearly : P.yearly) : (r.monthly > 0 ? r.monthly : P.monthly) };
// turn off the tick of anybody whose paid subscription ran out
async function sweep() {
  const User = require('../models/User');
  const now = new Date();
  const r = await User.updateMany({ 'vreq.mode': 'paid', 'vreq.status': 'active', 'vreq.expiresAt': { $lt: now } }, { $set: { verified: false, 'vreq.status': 'expired' } });
  return r.modifiedCount || r.nModified || 0;
}
async function expireOne(id) { const User = require('../models/User'); await User.updateOne({ _id: id, 'vreq.mode': 'paid', 'vreq.status': 'active', 'vreq.expiresAt': { $lt: new Date() } }, { $set: { verified: false, 'vreq.status': 'expired' } }) }
function view(u, P) {
  const r = u.vreq || {}; let status = r.status || '', mode = r.mode || '';
  if (!status && u.verified) { status = 'active'; mode = 'permanent' }          // ticks the admin gave by hand count as permanent
  const left = r.expiresAt ? Math.max(0, Math.ceil((new Date(r.expiresAt) - Date.now()) / DAY)) : null;
  return { status, mode, plan: r.plan || '', verified: !!u.verified, note: status === 'rejected' ? (r.note || '') : '', requestedAt: r.requestedAt || null, expiresAt: r.expiresAt || null, daysLeft: left,
    prices: { monthly: priceFor(u, 'monthly', P), yearly: priceFor(u, 'yearly', P) }, enabled: P.enabled, cash: (u.ac && u.ac.cash) || 0,
    canRequest: P.enabled && ['', 'rejected'].includes(status) && !u.verified, canSubscribe: mode === 'paid' && ['approved', 'active', 'expired'].includes(status) }
}
module.exports = { pricing, priceFor, sweep, expireOne, view, DAY, DEFAULTS };
