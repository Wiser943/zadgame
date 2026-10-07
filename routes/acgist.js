// P-Gist API (mounted at /api/ac/gist): feed, posts, reactions, comments + replies, polls, pins, follows, unified profiles.
const express = require('express');
const User = require('../models/User');
const ACPhoto = require('../models/ACPhoto');
const { Report, Friendship } = require('../models/Social');
const { GistPost, GistLike, GistComment, GistCommentLike, GistVote, GistFollow } = require('../models/Gist');
const registry = require('../games/registry');
const ensureAuth = require('../middleware/auth');
const { normalizeUsername } = require('../utils/allconnect');
const { notify } = require('../utils/acnotify');
const acPresence = require('../utils/acpresence');
const ghPresence = require('../utils/presence');

const router = express.Router();
router.use(ensureAuth);

const isId = (s) => /^[a-f\d]{24}$/i.test(String(s || ''));
const me = (req) => String(req.user.id);
const PAGE = 12;
const bad = (res, m, c = 400) => res.status(c).json({ message: m });
const RX = { like: '❤️', laugh: '😂', fire: '🔥', sad: '😢', wow: '😮' };
const RX_KEYS = Object.keys(RX);

/* tiny per-user rate limiter */
const buckets = new Map();
const limit = (name, max, ms) => (req, res, next) => {
  const k = name + ':' + me(req), now = Date.now(), a = (buckets.get(k) || []).filter((t) => now - t < ms);
  if (a.length >= max) { buckets.set(k, a); return bad(res, 'Slow down a little and try again shortly.', 429); }
  a.push(now); buckets.set(k, a); next();
};

const pubUser = (u) => u ? { id: String(u._id), username: u.acUsername || '', displayName: u.displayName || 'Player', avatar: u.avatar || '', verified: !!u.verified } : { id: '', username: '', displayName: 'Deleted user', avatar: '', verified: false };
const USER_FIELDS = 'displayName avatar acUsername verified';
const label = (u) => (u.acUsername ? '@' + u.acUsername : u.displayName || 'Someone');

async function blockedSet(uid) {
  const rows = await Friendship.find({ status: 'blocked', $or: [{ requester: uid }, { recipient: uid }] }).select('requester recipient').lean();
  return [...new Set(rows.map((r) => (r.requester === uid ? r.recipient : r.requester)))];
}

/* ---- notifications (de-duplicated so likes/unlikes can't spam someone) ---- */
const recent = new Map();
function ping(req, to, text, { icon = '🗣️', ref = '', key = '' } = {}) {
  to = String(to || ''); if (!to || to === me(req)) return;
  if (key) { const k = to + '|' + key, now = Date.now(); if (now - (recent.get(k) || 0) < 10 * 60 * 1000) return; recent.set(k, now); if (recent.size > 5000) recent.clear(); }
  notify(req.app.get('io'), to, { icon, text, kind: 'gist', ref, from: me(req) }).catch(() => {});
}

/* ---- text parsing: #hashtags and @mentions ---- */
function parseTags(text) {
  const out = new Set(); for (const m of String(text || '').matchAll(/(?:^|[^\w&])#([\p{L}\p{N}_]{2,30})/gu)) out.add(m[1].toLowerCase());
  return [...out].slice(0, 10);
}
async function parseMentions(text) {
  const names = [...new Set([...String(text || '').matchAll(/(?:^|[^\w])@([a-z0-9_]{3,16})/gi)].map((m) => m[1].toLowerCase()))].slice(0, 10);
  if (!names.length) return [];
  const us = await User.find({ acUsername: { $in: names } }).select('_id').lean();
  return us.map((u) => String(u._id));
}

/* turn raw posts into what the app shows */
async function hydrate(posts, uid) {
  const origIds = [...new Set(posts.map((p) => p.sharedFrom).filter(isId))];
  const origs = origIds.length ? await GistPost.find({ _id: { $in: origIds } }).lean() : [];
  const origMap = new Map(origs.map((o) => [String(o._id), o]));
  const authorIds = [...new Set(posts.map((p) => p.author).concat(origs.map((o) => o.author)).filter(isId))];
  const users = authorIds.length ? await User.find({ _id: { $in: authorIds } }).select(USER_FIELDS).lean() : [];
  const uMap = new Map(users.map((u) => [String(u._id), u]));
  const allIds = posts.map((p) => String(p._id)).concat(origs.map((o) => String(o._id)));
  const [likes, votes] = await Promise.all([
    GistLike.find({ user: uid, post: { $in: allIds } }).select('post type').lean(),
    GistVote.find({ user: uid, post: { $in: allIds } }).select('post option').lean()]);
  const liked = new Map(likes.map((l) => [l.post, l.type || 'like']));
  const voted = new Map(votes.map((v) => [v.post, v.option]));
  const shape = (p, withShared) => {
    const id = String(p._id), o = {
      id, author: pubUser(uMap.get(p.author)), mine: p.author === uid, text: p.text || '', images: p.images || [],
      game: p.game && p.game.key ? { key: p.game.key, name: p.game.name, code: p.game.code || '' } : null,
      match: p.match && p.match.game ? { game: p.match.game, name: p.match.name, score: p.match.score || '', opponent: p.match.opponent || '', result: p.match.result || 'win' } : null,
      tags: p.tags || [], pinned: !!p.pinned, edited: !!p.editedAt,
      likes: Math.max(0, p.likes || 0), rx: p.rx || {}, comments: Math.max(0, p.comments || 0), shares: Math.max(0, p.shares || 0),
      myRx: liked.get(id) || '', liked: liked.has(id), createdAt: p.createdAt,
    };
    if (p.poll && p.poll.options && p.poll.options.length) {
      const total = p.poll.options.reduce((a, x) => a + (x.votes || 0), 0);
      o.poll = { options: p.poll.options.map((x) => ({ text: x.text, votes: x.votes || 0 })), total, endsAt: p.poll.endsAt, ended: !!(p.poll.endsAt && new Date(p.poll.endsAt) < new Date()), myVote: voted.has(id) ? voted.get(id) : -1 };
    }
    if (withShared && p.sharedFrom) { const og = origMap.get(p.sharedFrom); o.shared = og ? shape(og, false) : { deleted: true }; }
    return o;
  };
  return posts.map((p) => shape(p, true));
}

async function page(filter, req, uid, extra = {}) {
  const q = { ...filter };
  if (req.query.before && !isNaN(Date.parse(req.query.before))) q.createdAt = { $lt: new Date(req.query.before) };
  const rows = await GistPost.find(q).sort({ createdAt: -1 }).limit(PAGE + 1).lean();
  const more = rows.length > PAGE; if (more) rows.pop();
  return { posts: await hydrate(rows, uid), more, ...extra };
}

/* ---------- feed: latest | trending | following | me (+ ?tag=) ---------- */
router.get('/feed', async (req, res, next) => {
  try {
    const uid = me(req), blocked = await blockedSet(uid), tab = String(req.query.tab || 'latest');
    const filter = {};
    if (tab === 'following') {
      const f = await GistFollow.find({ follower: uid }).select('following').lean();
      filter.author = { $in: f.map((x) => x.following).concat(uid).filter((id) => !blocked.includes(id)) };
    } else if (tab === 'me') filter.author = uid;
    else if (blocked.length) filter.author = { $nin: blocked };
    const tag = String(req.query.tag || '').toLowerCase().replace(/^#/, '');
    if (tag) filter.tags = tag;
    if (tab === 'trending' && !tag) {
      const off = Math.max(0, parseInt(req.query.offset, 10) || 0), since = new Date(Date.now() - 7 * 86400000);
      const rows = await GistPost.aggregate([
        { $match: { ...filter, createdAt: { $gte: since } } },
        { $addFields: { score: { $add: ['$likes', { $multiply: ['$comments', 2] }, { $multiply: ['$shares', 3] }] } } },
        { $sort: { score: -1, createdAt: -1 } }, { $skip: off }, { $limit: PAGE + 1 }]);
      const more = rows.length > PAGE; if (more) rows.pop();
      return res.json({ posts: await hydrate(rows, uid), more, next: off + rows.length });
    }
    res.json(await page(filter, req, uid));
  } catch (e) { next(e); }
});

router.get('/trending', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 48 * 3600000);
    const rows = await GistPost.aggregate([{ $match: { createdAt: { $gte: since }, 'tags.0': { $exists: true } } }, { $unwind: '$tags' },
      { $group: { _id: '$tags', n: { $sum: 1 }, last: { $max: '$createdAt' } } }, { $sort: { n: -1, last: -1 } }, { $limit: 10 }]);
    res.json({ tags: rows.map((r) => ({ tag: r._id, count: r.n })) });
  } catch (e) { next(e); }
});

/* ---------- create / edit / delete posts ---------- */
async function buildImages(list, uid, res) {
  const images = [];
  for (const it of (Array.isArray(list) ? list : []).slice(0, 10)) {
    if (it && it.src === 'mine' && isId(it.id)) {
      const p = await ACPhoto.findOne({ _id: it.id, user: uid }).lean();
      if (!p) { bad(res, 'One of your photos could not be found.'); return null; }
      images.push({ url: p.url, thumb: p.medium || p.thumb || p.url });
    } else if (it && it.src === 'platform' && typeof it.url === 'string') {
      const src = await GistPost.findOne({ 'images.url': it.url }).select('images').lean();
      const hit = src && src.images.find((i) => i.url === it.url);
      if (!hit) { bad(res, 'That platform photo is no longer available.'); return null; }
      images.push({ url: hit.url, thumb: hit.thumb || hit.url });
    } else { bad(res, 'Invalid photo.'); return null; }
  }
  return images;
}

router.post('/posts', limit('post', 10, 60000), async (req, res, next) => {
  try {
    const uid = me(req), b = req.body || {};
    const text = String(b.text || '').trim().slice(0, 500);
    const images = await buildImages(b.images, uid, res); if (!images) return;
    let game;
    if (b.game && b.game.key) {
      const g = registry.find((x) => x.key === b.game.key && x.available);
      if (!g) return bad(res, 'Unknown game.');
      const code = String(b.game.code || '').trim().toUpperCase();
      if (code && !/^[A-Z0-9]{3,8}$/.test(code)) return bad(res, 'Room codes are 3 to 8 letters or numbers.');
      game = { key: g.key, name: g.name, code };
    }
    let poll;
    if (b.poll && Array.isArray(b.poll.options)) {
      const opts = b.poll.options.map((x) => String(x || '').trim().slice(0, 40)).filter(Boolean).slice(0, 4);
      if (opts.length < 2) return bad(res, 'A poll needs at least 2 options.');
      const hrs = Math.min(168, Math.max(1, parseInt(b.poll.hours, 10) || 24));
      poll = { options: opts.map((t) => ({ text: t, votes: 0 })), endsAt: new Date(Date.now() + hrs * 3600000) };
    }
    let sharedFrom = '', origAuthor = '';
    if (b.sharedFrom) {
      if (!isId(b.sharedFrom)) return bad(res, 'Invalid post.');
      let orig = await GistPost.findById(b.sharedFrom).lean();
      if (!orig) return bad(res, 'That post was deleted.', 404);
      if (orig.sharedFrom && isId(orig.sharedFrom)) { const root = await GistPost.findById(orig.sharedFrom).lean(); if (root) orig = root; }
      sharedFrom = String(orig._id); origAuthor = orig.author;
      await GistPost.updateOne({ _id: orig._id }, { $inc: { shares: 1 } });
    }
    if (!text && !images.length && !game && !sharedFrom && !poll) return bad(res, 'Write something or add a photo first.');
    const tags = parseTags(text), mentions = await parseMentions(text);
    const post = await GistPost.create({ author: uid, text, images, game, poll, sharedFrom, tags, mentions });
    const pid = String(post._id), who = label(req.user);
    if (origAuthor) ping(req, origAuthor, `${who} reshared your gist`, { icon: '🔁', ref: sharedFrom, key: 'rs:' + uid + sharedFrom });
    mentions.forEach((m) => ping(req, m, `${who} mentioned you in a gist`, { icon: '＠', ref: pid }));
    const io = req.app.get('io'); if (io) io.of('/ac').emit('gist:new', { id: pid, author: uid });
    res.json({ post: (await hydrate([post.toObject()], uid))[0] });
  } catch (e) { next(e); }
});

router.get('/posts/:id', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid post.');
    const p = await GistPost.findById(req.params.id).lean();
    if (!p) return bad(res, 'This post was deleted.', 404);
    res.json({ post: (await hydrate([p], me(req)))[0] });
  } catch (e) { next(e); }
});

router.put('/posts/:id', limit('edit', 20, 60000), async (req, res, next) => {
  try {
    const uid = me(req); if (!isId(req.params.id)) return bad(res, 'Invalid post.');
    const p = await GistPost.findOne({ _id: req.params.id, author: uid });
    if (!p) return bad(res, 'Post not found.', 404);
    const text = String((req.body && req.body.text) || '').trim().slice(0, 500);
    if (!text && !p.images.length && !p.game && !p.sharedFrom && !(p.poll && p.poll.options && p.poll.options.length)) return bad(res, 'A gist cannot be empty.');
    if (text === p.text) return res.json({ post: (await hydrate([p.toObject()], uid))[0] });
    const old = new Set((p.mentions || []).map(String));
    p.text = text; p.tags = parseTags(text); p.mentions = await parseMentions(text); p.editedAt = new Date();
    await p.save();
    p.mentions.filter((m) => !old.has(m)).forEach((m) => ping(req, m, `${label(req.user)} mentioned you in a gist`, { icon: '＠', ref: String(p._id) }));
    res.json({ post: (await hydrate([p.toObject()], uid))[0] });
  } catch (e) { next(e); }
});

router.delete('/posts/:id', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid post.');
    const p = await GistPost.findOneAndDelete({ _id: req.params.id, author: me(req) });
    if (!p) return bad(res, 'Post not found.', 404);
    const id = String(p._id);
    const cids = (await GistComment.find({ post: id }).select('_id').lean()).map((c) => String(c._id));
    await Promise.all([GistLike.deleteMany({ post: id }), GistComment.deleteMany({ post: id }), GistVote.deleteMany({ post: id }), GistCommentLike.deleteMany({ comment: { $in: cids } })]);
    if (p.sharedFrom) await GistPost.updateOne({ _id: p.sharedFrom, shares: { $gt: 0 } }, { $inc: { shares: -1 } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/posts/:id/pin', async (req, res, next) => {
  try {
    const uid = me(req); if (!isId(req.params.id)) return bad(res, 'Invalid post.');
    const p = await GistPost.findOne({ _id: req.params.id, author: uid });
    if (!p) return bad(res, 'Post not found.', 404);
    const pin = !p.pinned;
    if (pin) await GistPost.updateMany({ author: uid, pinned: true }, { $set: { pinned: false } });
    p.pinned = pin; await p.save();
    res.json({ pinned: pin });
  } catch (e) { next(e); }
});

/* ---------- reactions (❤️ 😂 🔥 😢 😮). A like is just the default reaction. ---------- */
async function react(req, res, next, type) {
  try {
    const uid = me(req), id = req.params.id;
    if (!RX_KEYS.includes(type)) return bad(res, 'Unknown reaction.');
    const post = isId(id) ? await GistPost.findById(id).select('author likes rx').lean() : null;
    if (!post) return bad(res, 'This post was deleted.', 404);
    const prev = await GistLike.findOne({ post: id, user: uid }).lean();
    let mine = '', inc = {};
    if (prev && (prev.type || 'like') === type) {            // same reaction again = remove
      await GistLike.deleteOne({ post: id, user: uid });
      inc = { likes: -1, ['rx.' + type]: -1 };
    } else if (prev) {                                        // switch reaction
      await GistLike.updateOne({ post: id, user: uid }, { $set: { type } });
      inc = { ['rx.' + (prev.type || 'like')]: -1, ['rx.' + type]: 1 }; mine = type;
    } else {
      try { await GistLike.create({ post: id, user: uid, type }); } catch (e) { if (e.code !== 11000) throw e; }
      inc = { likes: 1, ['rx.' + type]: 1 }; mine = type;
      ping(req, post.author, `${label(req.user)} ${type === 'like' ? 'liked' : 'reacted ' + RX[type] + ' to'} your gist`, { icon: RX[type], ref: id, key: 'lk:' + uid + id });
    }
    await GistPost.updateOne({ _id: id }, { $inc: inc });
    const p = await GistPost.findById(id).select('likes rx').lean();
    const rx = {}; RX_KEYS.forEach((k) => { if (p.rx && p.rx[k] > 0) rx[k] = p.rx[k]; });
    res.json({ liked: !!mine, myRx: mine, likes: Math.max(0, p.likes || 0), rx });
  } catch (e) { next(e); }
}
router.post('/posts/:id/like', limit('like', 90, 60000), (req, res, next) => react(req, res, next, 'like'));
router.post('/posts/:id/react', limit('like', 90, 60000), (req, res, next) => react(req, res, next, String((req.body && req.body.type) || 'like')));

/* ---------- polls ---------- */
router.post('/posts/:id/vote', limit('vote', 30, 60000), async (req, res, next) => {
  try {
    const uid = me(req), id = req.params.id, opt = parseInt(req.body && req.body.option, 10);
    const p = isId(id) ? await GistPost.findById(id).lean() : null;
    if (!p || !p.poll || !p.poll.options || !p.poll.options.length) return bad(res, 'Poll not found.', 404);
    if (p.poll.endsAt && new Date(p.poll.endsAt) < new Date()) return bad(res, 'This poll has ended.');
    if (!(opt >= 0 && opt < p.poll.options.length)) return bad(res, 'Pick one of the options.');
    try { await GistVote.create({ post: id, user: uid, option: opt }); } catch (e) { if (e.code === 11000) return bad(res, 'You already voted.', 409); throw e; }
    await GistPost.updateOne({ _id: id }, { $inc: { ['poll.options.' + opt + '.votes']: 1 } });
    ping(req, p.author, `${label(req.user)} voted on your poll`, { icon: '📊', ref: id, key: 'vt:' + uid + id });
    res.json({ post: (await hydrate([await GistPost.findById(id).lean()], uid))[0] });
  } catch (e) { next(e); }
});

/* ---------- comments, replies, comment likes ---------- */
router.get('/posts/:id/comments', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid post.');
    const uid = me(req), rows = await GistComment.find({ post: req.params.id }).sort({ createdAt: 1 }).limit(201).lean();
    const more = rows.length > 200; if (more) rows.pop();
    const post = await GistPost.findById(req.params.id).select('author').lean();
    const users = await User.find({ _id: { $in: [...new Set(rows.map((c) => c.author).filter(isId))] } }).select(USER_FIELDS).lean();
    const uMap = new Map(users.map((u) => [String(u._id), u]));
    const liked = new Set((await GistCommentLike.find({ user: uid, comment: { $in: rows.map((c) => String(c._id)) } }).select('comment').lean()).map((l) => l.comment));
    res.json({ more, comments: rows.map((c) => ({ id: String(c._id), text: c.text, parent: c.parent || '', likes: c.likes || 0, liked: liked.has(String(c._id)), createdAt: c.createdAt, author: pubUser(uMap.get(c.author)), canDelete: c.author === uid || (post && post.author === uid) })) });
  } catch (e) { next(e); }
});

router.post('/posts/:id/comments', limit('comment', 20, 60000), async (req, res, next) => {
  try {
    const uid = me(req), id = req.params.id, text = String((req.body && req.body.text) || '').trim().slice(0, 300);
    if (!text) return bad(res, 'Write a comment first.');
    const post = await GistPost.findById(isId(id) ? id : null).select('author').lean();
    if (!post) return bad(res, 'This post was deleted.', 404);
    let parent = '', parentAuthor = '';
    if (req.body.parent) {
      const pc = isId(req.body.parent) ? await GistComment.findById(req.body.parent).lean() : null;
      if (!pc || pc.post !== id) return bad(res, 'That comment was deleted.', 404);
      parent = pc.parent || String(pc._id); parentAuthor = pc.author;       // replies stay one level deep
    }
    const c = await GistComment.create({ post: id, author: uid, text, parent });
    await GistPost.updateOne({ _id: id }, { $inc: { comments: 1 } });
    const u = await User.findById(uid).select(USER_FIELDS).lean(), who = label(u || req.user), snip = text.length > 40 ? text.slice(0, 38) + '…' : text;
    const told = new Set([uid]);
    if (parentAuthor && !told.has(parentAuthor)) { told.add(parentAuthor); ping(req, parentAuthor, `${who} replied to your comment: “${snip}”`, { icon: '↩️', ref: id }); }
    if (!told.has(post.author)) { told.add(post.author); ping(req, post.author, `${who} commented on your gist: “${snip}”`, { icon: '💬', ref: id }); }
    (await parseMentions(text)).filter((m) => !told.has(m)).forEach((m) => ping(req, m, `${who} mentioned you in a comment`, { icon: '＠', ref: id }));
    res.json({ comment: { id: String(c._id), text, parent, likes: 0, liked: false, createdAt: c.createdAt, author: pubUser(u), canDelete: true } });
  } catch (e) { next(e); }
});

router.post('/comments/:id/like', limit('clike', 90, 60000), async (req, res, next) => {
  try {
    const uid = me(req); if (!isId(req.params.id)) return bad(res, 'Invalid comment.');
    const c = await GistComment.findById(req.params.id).lean();
    if (!c) return bad(res, 'Comment not found.', 404);
    let liked;
    try { await GistCommentLike.create({ comment: String(c._id), user: uid }); await GistComment.updateOne({ _id: c._id }, { $inc: { likes: 1 } }); liked = true; ping(req, c.author, `${label(req.user)} liked your comment`, { icon: '❤️', ref: c.post, key: 'cl:' + uid + c._id }); }
    catch (e) { if (e.code !== 11000) throw e; const d = await GistCommentLike.deleteOne({ comment: String(c._id), user: uid }); if (d.deletedCount) await GistComment.updateOne({ _id: c._id, likes: { $gt: 0 } }, { $inc: { likes: -1 } }); liked = false; }
    const n = await GistComment.findById(c._id).select('likes').lean();
    res.json({ liked, likes: Math.max(0, (n && n.likes) || 0) });
  } catch (e) { next(e); }
});

router.delete('/comments/:id', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid comment.');
    const c = await GistComment.findById(req.params.id).lean();
    if (!c) return bad(res, 'Comment not found.', 404);
    const post = await GistPost.findById(c.post).select('author').lean();
    if (c.author !== me(req) && !(post && post.author === me(req))) return bad(res, 'You cannot delete this comment.', 403);
    const kids = c.parent ? [] : await GistComment.find({ parent: String(c._id) }).select('_id').lean();   // deleting a comment removes its replies
    const ids = [String(c._id), ...kids.map((k) => String(k._id))];
    await GistComment.deleteMany({ _id: { $in: ids } }); await GistCommentLike.deleteMany({ comment: { $in: ids } });
    await GistPost.updateOne({ _id: c.post }, [{ $set: { comments: { $max: [0, { $subtract: ['$comments', ids.length] }] } } }]);
    res.json({ ok: true, removed: ids.length });
  } catch (e) { next(e); }
});

/* ---------- profiles & follows (the ONE profile used everywhere) ---------- */
const PROFILE_FIELDS = USER_FIELDS + ' bio cover stats level bestStreak tournamentWins rating createdAt';
async function findUser(key, fields = USER_FIELDS) {
  key = String(key || '');
  return isId(key) ? User.findById(key).select(fields).lean() : User.findOne({ acUsername: normalizeUsername(key) }).select(fields).lean();
}

router.get('/profile/:key', async (req, res, next) => {
  try {
    const uid = me(req), u = await findUser(req.params.key === 'me' ? uid : req.params.key, PROFILE_FIELDS);
    if (!u) return bad(res, 'Player not found.', 404);
    const id = String(u._id);
    if ((await blockedSet(uid)).includes(id)) return bad(res, 'Player not found.', 404);
    const [followers, following, postsCount, isFollowing, rel, first, pinned] = await Promise.all([
      GistFollow.countDocuments({ following: id }), GistFollow.countDocuments({ follower: id }), GistPost.countDocuments({ author: id }),
      GistFollow.exists({ follower: uid, following: id }),
      id === uid ? null : Friendship.findOne({ $or: [{ requester: uid, recipient: id }, { requester: id, recipient: uid }], status: { $ne: 'blocked' } }).lean(),
      page({ author: id, pinned: { $ne: true } }, req, uid),
      GistPost.findOne({ author: id, pinned: true }).lean()]);
    const posts = first.posts;
    if (pinned) posts.unshift((await hydrate([pinned], uid))[0]);
    const s = u.stats || {};
    const played = s.gamesPlayed || 0;
    res.json({
      user: { ...pubUser(u), bio: u.bio || '', cover: u.cover || '' }, isMe: id === uid, isFollowing: !!isFollowing, followers, following, postsCount,
      relation: id === uid ? 'me' : !rel ? 'none' : rel.status === 'accepted' ? 'friend' : (rel.requester === uid ? 'sent' : 'received'),
      online: acPresence.isOnline(u._id) || ghPresence.isOnline(u._id),
      game: { played, wins: s.wins || 0, losses: s.losses || 0, draws: s.draws || 0, winRate: played ? Math.round(((s.wins || 0) / played) * 100) : 0, level: u.level || 1, bestStreak: u.bestStreak || 0, tournamentWins: u.tournamentWins || 0, rating: u.rating || 1000, since: u.createdAt },
      posts, more: first.more,
    });
  } catch (e) { next(e); }
});

router.get('/profile/:key/posts', async (req, res, next) => {
  try {
    const u = await findUser(req.params.key === 'me' ? me(req) : req.params.key);
    if (!u) return bad(res, 'Player not found.', 404);
    res.json(await page({ author: String(u._id), pinned: { $ne: true } }, req, me(req)));
  } catch (e) { next(e); }
});

router.get('/profile/:key/people', async (req, res, next) => {
  try {
    const uid = me(req), u = await findUser(req.params.key === 'me' ? me(req) : req.params.key);
    if (!u) return bad(res, 'Player not found.', 404);
    const id = String(u._id), followers = req.query.kind !== 'following';
    const rows = await GistFollow.find(followers ? { following: id } : { follower: id }).sort({ createdAt: -1 }).limit(100).lean();
    const ids = rows.map((r) => (followers ? r.follower : r.following)).filter(isId);
    const users = await User.find({ _id: { $in: ids } }).select(USER_FIELDS).lean();
    const uMap = new Map(users.map((x) => [String(x._id), x]));
    const mine = new Set((await GistFollow.find({ follower: uid, following: { $in: ids } }).select('following').lean()).map((f) => f.following));
    res.json({ people: ids.filter((i) => uMap.has(i)).map((i) => ({ ...pubUser(uMap.get(i)), isFollowing: mine.has(i), isMe: i === uid })) });
  } catch (e) { next(e); }
});

router.post('/follow/:key', limit('follow', 40, 60000), async (req, res, next) => {
  try {
    const uid = me(req), u = await findUser(req.params.key === 'me' ? me(req) : req.params.key);
    if (!u) return bad(res, 'Player not found.', 404);
    const id = String(u._id);
    if (id === uid) return bad(res, 'You cannot follow yourself.');
    if ((await blockedSet(uid)).includes(id)) return bad(res, 'Player not found.', 404);
    let following;
    try { await GistFollow.create({ follower: uid, following: id }); following = true; ping(req, id, `${label(req.user)} started following you`, { icon: '➕', ref: 'u:' + uid, key: 'fl:' + uid }); }
    catch (e) { if (e.code !== 11000) throw e; await GistFollow.deleteOne({ follower: uid, following: id }); following = false; }
    res.json({ following, followers: await GistFollow.countDocuments({ following: id }) });
  } catch (e) { next(e); }
});

/* ---------- galleries, games, reports ---------- */
router.get('/gallery/platform', async (req, res, next) => {
  try {
    const uid = me(req), blocked = await blockedSet(uid);
    const rows = await GistPost.find({ 'images.0': { $exists: true }, ...(blocked.length ? { author: { $nin: blocked } } : {}) }).sort({ createdAt: -1 }).limit(40).select('images').lean();
    const seen = new Set(), out = [];
    for (const r of rows) for (const i of r.images) if (!seen.has(i.url)) { seen.add(i.url); out.push({ url: i.url, thumb: i.thumb || i.url }); }
    res.json({ photos: out.slice(0, 60) });
  } catch (e) { next(e); }
});

router.get('/games', (req, res) => res.json({ games: registry.filter((g) => g.available).map((g) => ({ key: g.key, name: g.name })) }));

router.post('/posts/:id/report', limit('report', 10, 3600000), async (req, res, next) => {
  try {
    const uid = me(req);
    const p = await GistPost.findById(isId(req.params.id) ? req.params.id : null).select('author').lean();
    if (!p) return bad(res, 'This post was deleted.', 404);
    if (p.author === uid) return bad(res, 'You cannot report your own post.');
    const reason = String((req.body && req.body.reason) || 'Inappropriate').slice(0, 120);
    await Report.create({ reporter: uid, target: p.author, roomCode: 'GIST', reason: `P-Gist post ${req.params.id}: ${reason}` });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- auto-post match wins (called by sockets when a match with a real opponent finishes) ---------- */
const lastWin = new Map();
router.postMatchWin = async function postMatchWin(io, { userId, game, name, score, opponent }) {
  try {
    userId = String(userId); const now = Date.now();
    if (now - (lastWin.get(userId) || 0) < 90 * 1000) return;                 // at most one auto-post / 90s / player
    const u = await User.findById(userId).select('autoPostWins').lean();
    if (!u || u.autoPostWins === false) return;
    lastWin.set(userId, now); if (lastWin.size > 5000) lastWin.clear();
    const post = await GistPost.create({ author: userId, text: '', match: { game, name, score: String(score || ''), opponent: String(opponent || '').slice(0, 40), result: 'win' } });
    if (io) io.of('/ac').emit('gist:new', { id: String(post._id), author: userId });
  } catch (e) { console.error('[gist win]', e.message); }
};

module.exports = router;
