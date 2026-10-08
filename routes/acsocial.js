// AllConnect social layer: @username, friend search/requests, private chat, money, food, invites, visits, block/report, updates feed.
// Friends + reports reuse GameHub's Friendship/Report models, so friends are shared across both apps.
const express = require('express');
const User = require('../models/User');
const { Friendship, Report } = require('../models/Social');
const ACMessage = require('../models/ACMessage');
const ACUpdate = require('../models/ACUpdate');
const ensureAuth = require('../middleware/auth');
const profanity = require('../utils/profanity');
const acPresence = require('../utils/acpresence');
const ghPresence = require('../utils/presence');
const { notify, emitUser } = require('../utils/acnotify');
const push = require('../services/push');
const { ensureAC } = require('./allconnect');
const { unreadTotal: groupUnread } = require('./acgroups');
const { FOOD, normalizeUsername, validUsername } = require('../utils/allconnect');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const isId = (s) => /^[a-f\d]{24}$/i.test(String(s));
const rxEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const io = (req) => req.app.get('io');
const label = (u) => (u.acUsername ? '@' + u.acUsername : u.displayName);
const pub = (u) => ({ id: String(u._id), username: u.acUsername || '', displayName: u.displayName, avatar: u.avatar || '', online: acPresence.isOnline(u._id) || ghPresence.isOnline(u._id) });
const mv = (m) => ({ id: String(m._id), from: m.from, to: m.to, text: m.text, kind: m.kind, amount: m.amount || 0, read: !!m.read, at: m.at, reply: m.reply && m.reply.mid ? { id: m.reply.mid, from: m.reply.from, text: m.reply.text } : undefined });
const between = (a, b) => ({ $or: [{ requester: a, recipient: b }, { requester: b, recipient: a }] });
const areFriends = (a, b) => Friendship.exists({ ...between(a, b), status: 'accepted' });
const isBlocked = (a, b) => Friendship.exists({ ...between(a, b), status: 'blocked' });
const bad = (res, code, message) => res.status(code).json({ message });
const hits = new Map();   // simple per-user rate limit: 25 actions / minute
const limited = (id) => { const now = Date.now(), a = (hits.get(id) || []).filter((t) => now - t < 60000); if (a.length >= 25) { hits.set(id, a); return true; } a.push(now); hits.set(id, a); return false; };

// Loads the other user and checks they are an accepted, unblocked friend.
async function friendOr(req, res) {
  const me = uid(req), other = String(req.params.id);
  if (!isId(other) || other === me) { bad(res, 400, 'Invalid player.'); return null; }
  const target = await User.findById(other).select('displayName avatar acUsername');
  if (!target) { bad(res, 404, 'Player not found.'); return null; }
  if (await isBlocked(me, other)) { bad(res, 403, 'You cannot interact with this player.'); return null; }
  if (!(await areFriends(me, other))) { bad(res, 403, `Add ${label(target)} as a friend first.`); return null; }
  return { me, other, target };
}
// Like friendOr, but for plain private messages: any player who has not blocked you / not blocked by you.
async function peerOr(req, res) {
  const me = uid(req), other = String(req.params.id);
  if (!isId(other) || other === me) { bad(res, 400, 'Invalid player.'); return null; }
  const target = await User.findById(other).select('displayName avatar acUsername');
  if (!target) { bad(res, 404, 'Player not found.'); return null; }
  if (await isBlocked(me, other)) { bad(res, 403, 'You cannot message this player.'); return null; }
  return { me, other, target, friend: !!(await areFriends(me, other)) };
}
async function addMessage(req, { to, text, kind = 'text', amount = 0, reply }) {
  const m = await ACMessage.create({ from: uid(req), to, text, kind, amount, ...(reply ? { reply } : {}) });
  emitUser(io(req), to, 'dm', mv(m));
  if (kind === 'text') push.sendToUser(to, { title: `New message from ${req.user.displayName || 'a player'}`, body: String(text).slice(0, 240), icon: '/pwa-192.png', target: { type: 'chat', id: uid(req), mid: String(m._id) } }).catch((e) => console.error('[push dm]', e.message));
  return mv(m);
}

/* ---------- username ---------- */
router.post('/username', async (req, res, next) => {
  try {
    const name = normalizeUsername(req.body && req.body.username);
    if (!validUsername(name)) return bad(res, 400, 'Use 3–16 letters, numbers or underscores.');
    if (profanity.isDirty(name)) return bad(res, 400, 'Please pick a different username.');
    try { await User.updateOne({ _id: uid(req) }, { $set: { acUsername: name } }); }
    catch (e) { if (e && e.code === 11000) return bad(res, 409, 'That username is taken.'); throw e; }
    res.json({ username: name });
  } catch (e) { next(e); }
});

/* ---------- friends ---------- */
router.get('/search', async (req, res, next) => {
  try {
    const me = uid(req), q = String(req.query.q || '').replace(/^@/, '').trim().slice(0, 30);
    if (q.length < 2) return res.json({ users: [] });
    const rows = await Friendship.find({ $or: [{ requester: me }, { recipient: me }] }).lean();
    const other = (x) => (x.requester === me ? x.recipient : x.requester);
    const hidden = new Set([me, ...rows.filter((x) => x.status === 'blocked').map(other)]);
    const state = new Map(rows.filter((x) => x.status !== 'blocked').map((x) => [other(x), x.status === 'accepted' ? 'friend' : (x.requester === me ? 'sent' : 'received')]));
    const users = await User.find({ $or: [{ acUsername: new RegExp('^' + rxEsc(q.toLowerCase())) }, { displayName: new RegExp(rxEsc(q), 'i') }] })
      .select('displayName avatar acUsername').limit(20).lean();
    res.json({ users: users.filter((u) => !hidden.has(String(u._id))).slice(0, 12).map((u) => ({ ...pub(u), relation: state.get(String(u._id)) || 'none' })) });
  } catch (e) { next(e); }
});
router.get('/friends', async (req, res, next) => {
  try {
    const me = uid(req);
    const rows = await Friendship.find({ $or: [{ requester: me }, { recipient: me }] }).lean();
    const other = (x) => (x.requester === me ? x.recipient : x.requester);
    const users = await User.find({ _id: { $in: [...new Set(rows.map(other))].filter(isId) } }).select('displayName avatar acUsername').lean();
    const by = new Map(users.map((u) => [String(u._id), pub(u)]));
    const pick = (f) => rows.filter(f).map((x) => by.get(other(x))).filter(Boolean);
    res.json({
      friends: pick((x) => x.status === 'accepted').sort((a, b) => (b.online - a.online) || (a.username || a.displayName).localeCompare(b.username || b.displayName)),
      incoming: pick((x) => x.status === 'pending' && x.recipient === me),
      outgoing: pick((x) => x.status === 'pending' && x.requester === me),
      blocked: pick((x) => x.status === 'blocked' && x.requester === me)
    });
  } catch (e) { next(e); }
});
router.post('/friends/:id/request', async (req, res, next) => {
  try {
    const me = uid(req), other = String(req.params.id);
    if (!isId(other)) return bad(res, 400, 'Invalid player.');
    if (me === other) return bad(res, 400, 'You cannot add yourself.');
    const target = await User.findById(other).select('displayName');
    if (!target) return bad(res, 404, 'Player not found.');
    if (await Friendship.exists({ requester: other, recipient: me, status: 'blocked' })) return bad(res, 403, 'You cannot send this request.');
    if (await Friendship.exists({ requester: me, recipient: other, status: 'blocked' })) return bad(res, 400, 'Unblock this player first.');
    const mine = await Friendship.findOne({ requester: me, recipient: other });
    if (mine) return res.json({ state: mine.status === 'accepted' ? 'friend' : 'sent' });
    const theirs = await Friendship.findOne({ requester: other, recipient: me, status: 'pending' });
    if (theirs) {                                    // they already asked you: just become friends
      theirs.status = 'accepted'; await theirs.save();
      notify(io(req), other, { icon: '🤝', text: `${label(req.user)} accepted your friend request`, kind: 'friend' }).catch(() => {});
      emitUser(io(req), other, 'friends', {}); return res.json({ state: 'friend' });
    }
    await Friendship.create({ requester: me, recipient: other, status: 'pending' });
    notify(io(req), other, { icon: '👋', text: `${label(req.user)} sent you a friend request`, kind: 'friend', ref: 'u:' + me, from: me }).catch(() => {});
    emitUser(io(req), other, 'friends', {});
    res.json({ state: 'sent' });
  } catch (e) { next(e); }
});
router.post('/friends/:id/accept', async (req, res, next) => {
  try {
    const me = uid(req), other = String(req.params.id);
    const row = await Friendship.findOneAndUpdate({ requester: other, recipient: me, status: 'pending' }, { $set: { status: 'accepted' } }, { new: true });
    if (!row) return bad(res, 404, 'Request not found.');
    notify(io(req), other, { icon: '🤝', text: `${label(req.user)} accepted your friend request`, kind: 'friend' }).catch(() => {});
    emitUser(io(req), other, 'friends', {});
    res.json({ state: 'friend' });
  } catch (e) { next(e); }
});
router.post('/friends/:id/decline', async (req, res, next) => {
  try { await Friendship.deleteOne({ requester: String(req.params.id), recipient: uid(req), status: 'pending' }); res.json({ ok: true }); } catch (e) { next(e); }
});
router.delete('/friends/:id', async (req, res, next) => {
  try {
    const me = uid(req), other = String(req.params.id);
    await Friendship.deleteMany({ ...between(me, other), status: { $ne: 'blocked' } });
    emitUser(io(req), other, 'friends', {}); res.json({ ok: true });
  } catch (e) { next(e); }
});
router.post('/block/:id', async (req, res, next) => {
  try {
    const me = uid(req), other = String(req.params.id);
    if (!isId(other) || other === me) return bad(res, 400, 'Invalid player.');
    await Friendship.deleteMany({ ...between(me, other), $nor: [{ requester: other, recipient: me, status: 'blocked' }] });
    await Friendship.findOneAndUpdate({ requester: me, recipient: other }, { $set: { status: 'blocked' } }, { upsert: true });
    await ACMessage.updateMany({ from: other, to: me }, { $set: { read: true } });
    emitUser(io(req), other, 'friends', {}); res.json({ ok: true });
  } catch (e) { next(e); }
});
router.post('/unblock/:id', async (req, res, next) => {
  try { await Friendship.deleteOne({ requester: uid(req), recipient: String(req.params.id), status: 'blocked' }); res.json({ ok: true }); } catch (e) { next(e); }
});
router.post('/report/:id', async (req, res, next) => {   // lands in the same admin reports queue as GameHub reports
  try {
    const other = String(req.params.id);
    if (!isId(other)) return bad(res, 400, 'Invalid player.');
    const r = await Report.create({ reporter: uid(req), target: other, roomCode: 'ALLCONN', reason: String((req.body && req.body.reason) || 'Unspecified').slice(0, 240) });
    res.json({ reportId: r.id });
  } catch (e) { next(e); }
});

/* ---------- chat ---------- */
router.get('/chats', async (req, res, next) => {
  try {
    const me = uid(req);
    const agg = await ACMessage.aggregate([
      { $match: { $or: [{ from: me }, { to: me }] } }, { $sort: { at: -1 } },
      { $group: { _id: { $cond: [{ $eq: ['$from', me] }, '$to', '$from'] }, last: { $first: '$$ROOT' }, unread: { $sum: { $cond: [{ $and: [{ $eq: ['$to', me] }, { $eq: ['$read', false] }] }, 1, 0] } } } },
      { $sort: { 'last.at': -1 } }, { $limit: 50 }]);
    const bl = await Friendship.find({ $or: [{ requester: me }, { recipient: me }], status: 'blocked' }).lean();
    const blockedSet = new Set(bl.map((x) => (x.requester === me ? x.recipient : x.requester)));
    const rows = agg.filter((a) => !blockedSet.has(a._id) && isId(a._id));
    const users = await User.find({ _id: { $in: rows.map((a) => a._id) } }).select('displayName avatar acUsername').lean();
    const by = new Map(users.map((u) => [String(u._id), pub(u)]));
    res.json({ chats: rows.filter((a) => by.has(a._id)).map((a) => ({ peer: by.get(a._id), last: mv(a.last), unread: a.unread })) });
  } catch (e) { next(e); }
});
router.get('/messages/:id', async (req, res, next) => {
  try {
    const f = await peerOr(req, res); if (!f) return;
    const rows = await ACMessage.find({ $or: [{ from: f.me, to: f.other }, { from: f.other, to: f.me }] }).sort({ at: -1 }).limit(60).lean();
    await ACMessage.updateMany({ from: f.other, to: f.me, read: false }, { $set: { read: true } });
    emitUser(io(req), f.other, 'seen', { by: f.me });
    res.json({ messages: rows.reverse().map(mv), peer: pub(f.target), isFriend: f.friend });
  } catch (e) { next(e); }
});
router.post('/messages/:id', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const f = await peerOr(req, res); if (!f) return;
    const text = profanity.clean(String((req.body && req.body.text) || '').trim().slice(0, 300));
    if (!text) return bad(res, 400, 'Type a message first.');
    // Optional WhatsApp-style reply: the client sends the id of the message it is replying to; we look it up so the quote cannot be faked.
    let reply;
    const rid = String((req.body && req.body.replyTo) || '');
    if (isId(rid)) {
      const o = await ACMessage.findById(rid).lean();
      const same = o && o.kind === 'text' && ((o.from === f.me && o.to === f.other) || (o.from === f.other && o.to === f.me));
      if (same) reply = { mid: String(o._id), from: o.from, text: String(o.text || '').slice(0, 120) };
    }
    res.json({ message: await addMessage(req, { to: f.other, text, reply }) });
  } catch (e) { next(e); }
});
router.post('/invite/:id', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const f = await friendOr(req, res); if (!f) return;
    notify(io(req), f.other, { icon: '🏠', text: `${label(req.user)} invited you over`, kind: 'friend' }).catch(() => {});
    res.json({ message: await addMessage(req, { to: f.other, text: `${label(req.user)} invited you over 🏠`, kind: 'invite' }) });
  } catch (e) { next(e); }
});
router.get('/visit/:id', async (req, res, next) => {
  try {
    const f = await friendOr(req, res); if (!f) return;
    await ensureAC(f.other);
    const host = await User.findById(f.other).select('displayName acUsername ac');
    notify(io(req), f.other, { icon: '👋', text: `${label(req.user)} visited your place`, kind: 'friend' }).catch(() => {});
    res.json({ host: { id: f.other, name: label(host), paint: host.ac.paint, items: (host.ac.owned || []).length } });
  } catch (e) { next(e); }
});
router.post('/buy-food/:id', async (req, res, next) => {
  try {
    const f = await friendOr(req, res); if (!f) return;
    const item = Object.prototype.hasOwnProperty.call(FOOD, req.body && req.body.item) ? FOOD[req.body.item] : null;
    if (!item) return bad(res, 400, 'Unknown food.');
    await ensureAC(f.me); await ensureAC(f.other);
    const sender = await User.findOneAndUpdate({ _id: f.me, 'ac.cash': { $gte: item.price } }, { $inc: { 'ac.cash': -item.price } }, { new: true });
    if (!sender) return bad(res, 402, 'Not enough ₦.');
    const r = await User.findById(f.other).select('ac.needs'); const cur = (r.ac.needs && r.ac.needs[0]) || 0;
    await User.updateOne({ _id: f.other }, { $set: { 'ac.needs.0': Math.min(1, cur + item.fill) } });
    notify(io(req), f.other, { icon: item.emoji, text: `${label(req.user)} bought you ${item.name}`, kind: 'good' }).catch(() => {});
    emitUser(io(req), f.other, 'cash', { delta: 0 });
    res.json({ cash: sender.ac.cash, message: await addMessage(req, { to: f.other, text: `${label(req.user)} bought you ${item.name} ${item.emoji}`, kind: 'food' }) });
  } catch (e) { next(e); }
});

/* ---------- updates feed + badges ---------- */
router.get('/updates', async (req, res, next) => {
  try {
    const rows = await ACUpdate.find({ $or: [{ user: uid(req) }, { user: null }] }).sort({ at: -1 }).limit(60).lean();
    res.json({ updates: rows.map((u) => ({ id: String(u._id), icon: u.icon, text: u.text, kind: u.kind, ref: u.ref || '', from: u.from || '', at: u.at })) });
  } catch (e) { next(e); }
});
router.post('/updates/seen', async (req, res, next) => {
  try { await User.updateOne({ _id: uid(req) }, { $set: { 'ac.updatesSeen': new Date() } }); res.json({ ok: true }); } catch (e) { next(e); }
});
router.get('/badges', async (req, res, next) => {
  try {
    const me = uid(req), u = await User.findById(me).select('createdAt ac.updatesSeen');
    const seen = (u.ac && u.ac.updatesSeen) || u.createdAt || new Date(0);
    const [messages, requests, updates] = await Promise.all([
      ACMessage.countDocuments({ to: me, read: false }), Friendship.countDocuments({ recipient: me, status: 'pending' }),
      ACUpdate.countDocuments({ $or: [{ user: me }, { user: null }], at: { $gt: seen } })]);
    res.json({ messages: messages + (await groupUnread(me).catch(() => 0)), requests, updates });
  } catch (e) { next(e); }
});
module.exports = router;
