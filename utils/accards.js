// Result cards: a small popup the client shows for "Back from work", promotions, investment payouts, welcome gifts, etc.
// Stored on the player (so you still see it if you were offline) and announced live over the /ac socket.
const crypto = require('crypto');
const User = require('../models/User');
const { emitUser } = require('./acnotify');
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

function build(c) {
  return { id: crypto.randomBytes(5).toString('hex'), icon: clip(c.icon || '🎉', 8), title: clip(c.title, 60), text: clip(c.text, 280),
    tone: ['good', 'warn', 'info', 'gold'].includes(c.tone) ? c.tone : 'good', btn: clip(c.btn || 'Nice one', 24),
    lines: (c.lines || []).slice(0, 5).map((l) => ({ k: clip(l[0], 30), v: clip(l[1], 30) })), at: new Date() };
}
async function queueCard(io, userId, card) {
  const doc = build(card);
  await User.updateOne({ _id: userId }, { $push: { 'ac.hub.cards': { $each: [doc], $slice: -12 } } });
  emitUser(io, userId, 'card', { id: doc.id });
  return doc;
}
/* life timeline entry (kept to the last 60) */
const timeline = (userId, icon, text) => User.updateOne({ _id: userId }, { $push: { 'ac.hub.timeline': { $each: [{ at: new Date(), icon: clip(icon, 8), text: clip(text, 140) }], $slice: -60 } } }).catch(() => {});
module.exports = { build, queueCard, timeline };
