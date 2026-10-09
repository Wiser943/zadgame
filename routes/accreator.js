// Creator programme: eligibility, milestones, stats and applying. Payouts are not switched on yet.
const express = require('express');
const User = require('../models/User');
const { GistPost, GistFollow } = require('../models/Gist');
const ensureAuth = require('../middleware/auth');
const { notify } = require('../utils/acnotify');
const C = require('../utils/accreator');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const DAY = 86400e3;

async function gather(id) {
  const u = await User.findById(id).select('createdAt verified penaltyPoints suspendedUntil creator').lean();
  if (!u) return null;
  const since = new Date(Date.now() - 30 * DAY);
  const [followers, newFollowers, agg, last30, top] = await Promise.all([
    GistFollow.countDocuments({ following: id }),
    GistFollow.countDocuments({ following: id, createdAt: { $gte: since } }),
    GistPost.aggregate([{ $match: { author: id } }, { $group: { _id: null, posts: { $sum: 1 }, reactions: { $sum: '$likes' }, comments: { $sum: '$comments' }, shares: { $sum: '$shares' } } }]),
    GistPost.aggregate([{ $match: { author: id, createdAt: { $gte: since } } }, { $group: { _id: null, posts: { $sum: 1 }, reactions: { $sum: '$likes' }, comments: { $sum: '$comments' } } }]),
    GistPost.findOne({ author: id }).sort({ likes: -1 }).select('text likes comments createdAt').lean()
  ]);
  const a = agg[0] || {}, l = last30[0] || {};
  const stats = { verified: !!u.verified, followers, posts: a.posts || 0, reactions: a.reactions || 0, comments: a.comments || 0, shares: a.shares || 0,
    ageDays: Math.floor((Date.now() - new Date(u.createdAt).getTime()) / DAY), penalties: u.penaltyPoints || 0, suspended: !!(u.suspendedUntil && new Date(u.suspendedUntil) > new Date()) };
  return { u, stats, extra: { newFollowers, posts30: l.posts || 0, reactions30: l.reactions || 0, comments30: l.comments || 0,
    avgReactions: stats.posts ? Math.round((stats.reactions / stats.posts) * 10) / 10 : 0, top: top ? { text: String(top.text || '').slice(0, 90), likes: top.likes || 0, comments: top.comments || 0 } : null } };
}
const view = (g) => {
  const ev = C.evaluate(g.stats), st = C.stateOf(g.u.creator, ev), c = g.u.creator || {};
  return { state: st.state, canApply: st.canApply, waitDays: st.waitDays || 0, appliedAt: c.appliedAt || null, approvedAt: c.approvedAt || null, note: st.state === 'suspended' || st.state === 'rejected' ? (c.note || '') : '',
    criteria: ev.criteria, metCount: ev.metCount, total: ev.criteria.length, milestones: C.milestones(g.stats), stats: { ...g.stats, ...g.extra }, payouts: { open: false, text: 'Payouts open soon. Approved creators will be paid in real money once payments go live.' } };
};

router.get('/status', async (req, res, next) => {
  try { const g = await gather(uid(req)); if (!g) return res.status(404).json({ message: 'No account.' }); res.json(view(g)); } catch (e) { next(e); }
});
router.post('/apply', async (req, res, next) => {
  try {
    const me = uid(req), g = await gather(me); if (!g) return res.status(404).json({ message: 'No account.' });
    const v = view(g);
    if (v.state === 'applied') return res.status(409).json({ message: 'Your application is already being reviewed.' });
    if (v.state === 'approved') return res.status(409).json({ message: 'You are already in the creator programme.' });
    if (v.state === 'suspended') return res.status(403).json({ message: 'Your creator access is paused. Contact support.' });
    if (!v.canApply) return res.status(409).json({ message: v.waitDays ? `You can apply again in ${v.waitDays} day${v.waitDays === 1 ? '' : 's'}.` : 'You do not meet every requirement yet.' });
    const r = await User.updateOne({ _id: me, 'creator.status': { $nin: ['applied', 'approved', 'suspended'] } }, { $set: { 'creator.status': 'applied', 'creator.appliedAt': new Date(), 'creator.note': '' } });
    if (!r.modifiedCount && !r.nModified) return res.status(409).json({ message: 'Already applied.' });
    notify(req.app.get('io'), me, { icon: '📝', text: 'Creator application received. We will review it soon.', kind: 'info' }).catch(() => {});
    res.json(view(await gather(me)));
  } catch (e) { next(e); }
});
module.exports = router;
