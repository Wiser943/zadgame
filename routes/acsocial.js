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
const L = require('../utils/aclagos');
const { FOOD, normalizeUsername, validUsername } = require('../utils/allconnect');

const router = express.Router();
const CH = require('../utils/acchat');
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const isId = (s) => /^[a-f\d]{24}$/i.test(String(s));
const rxEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const io = (req) => req.app.get('io');
const label = (u) => (u.acUsername ? '@' + u.acUsername : u.displayName);
const pub = (u) => ({ id: String(u._id), username: u.acUsername || '', displayName: u.displayName, avatar: u.avatar || '', online: acPresence.isOnline(u._id) || ghPresence.isOnline(u._id) });
const mv = (m) => ({ id: String(m._id), from: m.from, to: m.to, text: m.deleted ? '' : m.text, kind: m.kind, amount: m.amount || 0, read: !!m.read, at: m.at,
  reply: m.reply && m.reply.mid ? { id: m.reply.mid, from: m.reply.from, text: m.reply.text } : undefined,
  image: CH.imageView(m), reactions: CH.reactionsView(m), edited: !!m.edited, deleted: !!m.deleted, fwd: !!m.fwd });
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
async function addMessage(req, { to, text, kind = 'text', amount = 0, reply, image, fwd }) {
  const m = await ACMessage.create({ from: uid(req), to, text, kind, amount, ...(reply ? { reply } : {}), ...(image ? { image } : {}), ...(fwd ? { fwd: true } : {}) });
  emitUser(io(req), to, 'dm', mv(m));
  if (kind === 'text') push.sendToUser(to, { title: `New message from ${req.user.displayName || 'a player'}`, body: (image ? CH.PHOTO_LABEL + (text ? ' ' + text : '') : String(text)).slice(0, 240), icon: '/pwa-192.png', target: { type: 'chat', id: uid(req), mid: String(m._id) } }).catch((e) => console.error('[push dm]', e.message));
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
    // people who blocked ME stay hidden; people I blocked still show up (relation 'blocked') so I can open their profile and unblock
    const hidden = new Set([me, ...rows.filter((x) => x.status === 'blocked' && x.recipient === me).map(other)]);
    const state = new Map(rows.filter((x) => x.status !== 'blocked' || x.requester === me).map((x) => [other(x), x.status === 'blocked' ? 'blocked' : x.status === 'accepted' ? 'friend' : (x.requester === me ? 'sent' : 'received')]));
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
      { $match: { $or: [{ from: me }, { to: me }], hidden: { $ne: me } } }, { $sort: { at: -1 } },
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
    const rows = await ACMessage.find({ $or: [{ from: f.me, to: f.other }, { from: f.other, to: f.me }], hidden: { $ne: f.me } }).sort({ at: -1 }).limit(60).lean();
    await ACMessage.updateMany({ from: f.other, to: f.me, read: false }, { $set: { read: true } });
    emitUser(io(req), f.other, 'seen', { by: f.me });
    res.json({ messages: rows.reverse().map(mv), peer: pub(f.target), isFriend: f.friend });
  } catch (e) { next(e); }
});
router.post('/messages/:id', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const f = await peerOr(req, res); if (!f) return;
    const b = req.body || {};
    let text = profanity.clean(String(b.text || '').trim().slice(0, 300)), image = null, fwd = false;
    if (b.forward) {   // forward: the server copies the original so it cannot be faked
      const src = await CH.resolveForward(b.forward, f.me);
      if (!src) return bad(res, 404, 'That message is no longer available to forward.');
      text = profanity.clean(src.text.slice(0, 300)); image = src.image; fwd = true;
    } else if (b.image) {
      image = CH.cleanImage(b.image);
      if (!image) return bad(res, 400, 'That photo could not be sent.');
    }
    if (!text && !image) return bad(res, 400, 'Type a message first.');
    // Optional WhatsApp-style reply: the client sends the id of the message it is replying to; we look it up so the quote cannot be faked.
    let reply;
    const rid = String(b.replyTo || '');
    if (!fwd && CH.isId(rid)) {
      const o = await ACMessage.findById(rid).lean();
      const same = o && o.kind === 'text' && !o.deleted && ((o.from === f.me && o.to === f.other) || (o.from === f.other && o.to === f.me));
      if (same) reply = { mid: String(o._id), from: o.from, text: CH.quoteText(o) };
    }
    res.json({ message: await addMessage(req, { to: f.other, text, reply, image, fwd }) });
  } catch (e) { next(e); }
});

/* ---------- react / edit / delete one message ---------- */
async function myMsg(req, res, { open = true } = {}) {
  const me = uid(req), mid = String(req.params.mid);
  if (!CH.isId(mid)) { bad(res, 400, 'Invalid message.'); return null; }
  const m = await ACMessage.findById(mid);
  if (!m || m.kind !== 'text' || (m.from !== me && m.to !== me) || (m.hidden || []).includes(me)) { bad(res, 404, 'Message not found.'); return null; }
  const other = m.from === me ? m.to : m.from;
  if (open && await isBlocked(me, other)) { bad(res, 403, 'You cannot message this player.'); return null; }
  return { m, me, other };
}
const pushUpd = (req, c) => { const v = mv(c.m); emitUser(io(req), c.other, 'dmupd', v); emitUser(io(req), c.me, 'dmupd', v); return v; };
router.post('/message/:mid/react', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const c = await myMsg(req, res); if (!c) return;
    if (c.m.deleted) return bad(res, 400, 'This message was deleted.');
    const e = String((req.body && req.body.emoji) || '');
    if (e && !CH.REACTIONS.includes(e)) return bad(res, 400, 'That reaction is not available.');
    c.m.reactions = CH.toggleReaction(c.m.reactions, c.me, e); await c.m.save();
    res.json({ message: pushUpd(req, c) });
  } catch (e) { next(e); }
});
router.put('/message/:mid', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const c = await myMsg(req, res); if (!c) return;
    if (c.m.from !== c.me) return bad(res, 403, 'You can only edit your own messages.');
    if (!CH.canEdit(c.m, c.me)) return bad(res, 403, 'You can only edit a message within 15 minutes of sending it.');
    const text = profanity.clean(String((req.body && req.body.text) || '').trim().slice(0, 300));
    if (!text && !(c.m.image && c.m.image.url)) return bad(res, 400, 'A message cannot be empty.');
    if (text !== c.m.text) { c.m.text = text; c.m.edited = true; await c.m.save(); }
    res.json({ message: pushUpd(req, c) });
  } catch (e) { next(e); }
});
router.delete('/message/:mid', async (req, res, next) => {
  try {
    const c = await myMsg(req, res, { open: false }); if (!c) return;
    if (String(req.query.scope) === 'me') {   // delete for me: only hides it from this player
      await ACMessage.updateOne({ _id: c.m._id }, { $addToSet: { hidden: c.me } });
      return res.json({ ok: true, scope: 'me' });
    }
    if (c.m.from !== c.me) return bad(res, 403, 'You can only delete your own messages for everyone.');
    if (c.m.deleted) return res.json({ ok: true, message: mv(c.m) });
    if (!CH.canDeleteAll(c.m, c.me)) return bad(res, 403, 'You can delete for everyone only within 2 days. You can still delete it for yourself.');
    c.m.deleted = true; c.m.text = ''; c.m.reactions = []; c.m.set('image', undefined); await c.m.save();
    res.json({ ok: true, scope: 'all', message: pushUpd(req, c) });
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
    const price = Math.round(item.price * ((L.currentEvent().mult || {}).food || 1) / 10) * 10;      // the city event moves food prices
    const sender = await User.findOneAndUpdate({ _id: f.me, 'ac.cash': { $gte: price } }, { $inc: { 'ac.cash': -price } }, { new: true });
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
    const me = await User.findById(uid(req)).select('ac.updatesCleared').lean();
    const cleared = me && me.ac && me.ac.updatesCleared;
    const q = { $or: [{ user: uid(req) }, { user: null }] };
    if (cleared) q.at = { $gt: cleared };
    const rows = await ACUpdate.find(q).sort({ at: -1 }).limit(60).lean();
    res.json({ updates: rows.map((u) => ({ id: String(u._id), icon: u.icon, text: u.text, kind: u.kind, ref: u.ref || '', from: u.from || '', at: u.at })) });
  } catch (e) { next(e); }
});
router.post('/updates/seen', async (req, res, next) => {
  try { await User.updateOne({ _id: uid(req) }, { $set: { 'ac.updatesSeen': new Date() } }); res.json({ ok: true }); } catch (e) { next(e); }
});
/* "Clear" in the Updates panel: personal updates are deleted, shared ones are hidden for this player only */
router.post('/updates/clear', async (req, res, next) => {
  try {
    const now = new Date();
    await ACUpdate.deleteMany({ user: uid(req) });
    await User.updateOne({ _id: uid(req) }, { $set: { 'ac.updatesCleared': now, 'ac.updatesSeen': now } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.get('/badges', async (req, res, next) => {
  try {
    const me = uid(req), u = await User.findById(me).select('createdAt ac.updatesSeen ac.updatesCleared');
    const seen = new Date(Math.max(+((u.ac && u.ac.updatesSeen) || u.createdAt || 0), +((u.ac && u.ac.updatesCleared) || 0)));
    const [messages, requests, updates] = await Promise.all([
      ACMessage.countDocuments({ to: me, read: false }), Friendship.countDocuments({ recipient: me, status: 'pending' }),
      ACUpdate.countDocuments({ $or: [{ user: me }, { user: null }], at: { $gt: seen } })]);
    res.json({ messages: messages + (await groupUnread(me).catch(() => 0)), requests, updates });
  } catch (e) { next(e); }
});
module.exports = router;
