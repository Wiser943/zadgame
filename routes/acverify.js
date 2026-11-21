// Verified badge (player side): ask for it, then (if the team makes it a paid badge) subscribe monthly or yearly from the game wallet.
const express = require('express');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const { notify } = require('../utils/acnotify');
const V = require('../utils/acverify');
const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const load = async (id, io) => { await V.expireOne(id, io); return User.findById(id).select('verified vreq ac.cash displayName').lean() };

router.get('/status', async (req, res, next) => {
  try { const u = await load(uid(req), req.app.get('io')); if (!u) return res.status(404).json({ message: 'No account.' }); res.json(V.view(u, await V.pricing())) } catch (e) { next(e) }
});
router.post('/request', async (req, res, next) => {
  try {
    const me = uid(req), plan = req.body && req.body.plan === 'yearly' ? 'yearly' : 'monthly', reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
    const P = await V.pricing(); if (!P.enabled) return res.status(403).json({ message: 'Verification requests are closed right now.' });
    const u = await load(me); if (!u) return res.status(404).json({ message: 'No account.' });
    const v = V.view(u, P);
    if (v.status === 'pending') return res.status(409).json({ message: 'Your request is already being reviewed.' });
    if (!v.canRequest) return res.status(409).json({ message: v.verified ? 'You already have the verified badge.' : 'You cannot request it right now.' });
    const r = await User.updateOne({ _id: me, 'vreq.status': { $in: ['', 'rejected', null] } }, { $set: { 'vreq.status': 'pending', 'vreq.plan': plan, 'vreq.reason': reason, 'vreq.note': '', 'vreq.mode': '', 'vreq.requestedAt': new Date() } });
    if (!(r.modifiedCount || r.nModified)) return res.status(409).json({ message: 'Already requested.' });
    notify(req.app.get('io'), me, { icon: '✔️', text: 'Verified badge request received. The team will review it soon.', kind: 'info' }).catch(() => {});
    res.json(V.view(await load(me), P));
  } catch (e) { next(e) }
});
// pay for (or renew) a paid badge the team approved
router.post('/subscribe', async (req, res, next) => {
  try {
    const me = uid(req), plan = req.body && req.body.plan === 'yearly' ? 'yearly' : 'monthly', P = await V.pricing();
    const u = await load(me); if (!u) return res.status(404).json({ message: 'No account.' });
    const v = V.view(u, P); if (!v.canSubscribe) return res.status(403).json({ message: 'The team has not approved a paid badge for you yet.' });
    const price = V.priceFor(u, plan, P), now = Date.now(), auto = !(req.body && req.body.autoRenew === false);
    const base = v.status === 'active' && u.vreq.expiresAt && new Date(u.vreq.expiresAt) > now ? new Date(u.vreq.expiresAt).getTime() : now;   // renewing early keeps the days you have left
    const expiresAt = new Date(base + (plan === 'yearly' ? 365 : 30) * V.DAY);
    const paid = price > 0 ? await User.findOneAndUpdate({ _id: me, 'ac.cash': { $gte: price } }, { $inc: { 'ac.cash': -price }, $set: { verified: true, 'vreq.status': 'active', 'vreq.plan': plan, 'vreq.paidAt': new Date(), 'vreq.expiresAt': expiresAt, 'vreq.autoRenew': auto } }, { new: true })
      : await User.findOneAndUpdate({ _id: me }, { $set: { verified: true, 'vreq.status': 'active', 'vreq.plan': plan, 'vreq.paidAt': new Date(), 'vreq.expiresAt': expiresAt, 'vreq.autoRenew': auto } }, { new: true });
    if (!paid) return res.status(402).json({ message: 'Not enough money in your wallet.' });
    notify(req.app.get('io'), me, { icon: '✅', text: `You are verified until ${expiresAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}.`, kind: 'good' }).catch(() => {});
    res.json(V.view(await load(me), P));
  } catch (e) { next(e) }
});
// switch automatic renewal on or off (the wallet is charged again when the badge runs out)
router.post('/autorenew', async (req, res, next) => {
  try {
    const me = uid(req), u = await load(me, req.app.get('io')); if (!u) return res.status(404).json({ message: 'No account.' });
    if (!(u.vreq && u.vreq.mode === 'paid')) return res.status(403).json({ message: 'Auto-renew is only for paid badges.' });
    await User.updateOne({ _id: me }, { $set: { 'vreq.autoRenew': !!(req.body && req.body.on) } });
    res.json(V.view(await load(me), await V.pricing()));
  } catch (e) { next(e) }
});
module.exports = router;
