// P-Gist API (mounted at /api/ac/gist): feed, posts, likes, comments, follows, profiles, galleries.
const express = require('express');
const User = require('../models/User');
const ACPhoto = require('../models/ACPhoto');
const { Report, Friendship } = require('../models/Social');
const { GistPost, GistLike, GistComment, GistFollow } = require('../models/Gist');
const registry = require('../games/registry');
const ensureAuth = require('../middleware/auth');
const { normalizeUsername } = require('../utils/allconnect');

const router = express.Router();
router.use(ensureAuth);

const isId = (s) => /^[a-f\d]{24}$/i.test(String(s || ''));
const me = (req) => String(req.user.id);
const PAGE = 12;
const bad = (res, m, c = 400) => res.status(c).json({ message: m });

/* tiny per-user rate limiter */
const buckets = new Map();
const limit = (name, max, ms) => (req, res, next) => {
  const k = name + ':' + me(req), now = Date.now(), a = (buckets.get(k) || []).filter((t) => now - t < ms);
  if (a.length >= max) { buckets.set(k, a); return bad(res, 'Slow down a little and try again shortly.', 429); }
  a.push(now); buckets.set(k, a); next();
};

const pubUser = (u) => u ? { id: String(u._id), username: u.acUsername || '', displayName: u.displayName || 'Player', avatar: u.avatar || '' } : { id: '', username: '', displayName: 'Deleted user', avatar: '' };
const USER_FIELDS = 'displayName avatar acUsername';

async function blockedSet(uid) {
  const rows = await Friendship.find({ status: 'blocked', $or: [{ requester: uid }, { recipient: uid }] }).select('requester recipient').lean();
  return [...new Set(rows.map((r) => (r.requester === uid ? r.recipient : r.requester)))];
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
  const liked = new Set((await GistLike.find({ user: uid, post: { $in: allIds } }).select('post').lean()).map((l) => l.post));
  const shape = (p, withShared) => {
    const o = {
      id: String(p._id), author: pubUser(uMap.get(p.author)), mine: p.author === uid, text: p.text || '', images: p.images || [],
      game: p.game && p.game.key ? { key: p.game.key, name: p.game.name, code: p.game.code || '' } : null,
      likes: Math.max(0, p.likes || 0), comments: Math.max(0, p.comments || 0), shares: Math.max(0, p.shares || 0),
      liked: liked.has(String(p._id)), createdAt: p.createdAt,
    };
    if (withShared && p.sharedFrom) { const og = origMap.get(p.sharedFrom); o.shared = og ? shape(og, false) : { deleted: true }; }
    return o;
  };
  return posts.map((p) => shape(p, true));
}

async function page(filter, req, uid) {
  const q = { ...filter };
  if (req.query.before && !isNaN(Date.parse(req.query.before))) q.createdAt = { $lt: new Date(req.query.before) };
  const rows = await GistPost.find(q).sort({ createdAt: -1 }).limit(PAGE + 1).lean();
  const more = rows.length > PAGE; if (more) rows.pop();
  return { posts: await hydrate(rows, uid), more };
}

/* ---------- feed ---------- */
router.get('/feed', async (req, res, next) => {
  try {
    const uid = me(req), blocked = await blockedSet(uid);
    const filter = {};
    if (req.query.tab === 'following') {
      const f = await GistFollow.find({ follower: uid }).select('following').lean();
      filter.author = { $in: f.map((x) => x.following).concat(uid).filter((id) => !blocked.includes(id)) };
    } else if (blocked.length) filter.author = { $nin: blocked };
    res.json(await page(filter, req, uid));
  } catch (e) { next(e); }
});

/* ---------- create / delete posts ---------- */
router.post('/posts', limit('post', 10, 60000), async (req, res, next) => {
  try {
    const uid = me(req), b = req.body || {};
    const text = String(b.text || '').trim().slice(0, 500);
    const images = [];
    for (const it of (Array.isArray(b.images) ? b.images : []).slice(0, 4)) {
      if (it && it.src === 'mine' && isId(it.id)) {
        const p = await ACPhoto.findOne({ _id: it.id, user: uid }).lean();
        if (!p) return bad(res, 'One of your photos could not be found.');
        images.push({ url: p.url, thumb: p.medium || p.thumb || p.url });
      } else if (it && it.src === 'platform' && typeof it.url === 'string') {
        const src = await GistPost.findOne({ 'images.url': it.url }).select('images').lean();
        const hit = src && src.images.find((i) => i.url === it.url);
        if (!hit) return bad(res, 'That platform photo is no longer available.');
        images.push({ url: hit.url, thumb: hit.thumb || hit.url });
      } else return bad(res, 'Invalid photo.');
    }
    let game;
    if (b.game && b.game.key) {
      const g = registry.find((x) => x.key === b.game.key && x.available);
      if (!g) return bad(res, 'Unknown game.');
      const code = String(b.game.code || '').trim().toUpperCase();
      if (code && !/^[A-Z0-9]{3,8}$/.test(code)) return bad(res, 'Room codes are 3 to 8 letters or numbers.');
      game = { key: g.key, name: g.name, code };
    }
    let sharedFrom = '';
    if (b.sharedFrom) {
      if (!isId(b.sharedFrom)) return bad(res, 'Invalid post.');
      let orig = await GistPost.findById(b.sharedFrom).lean();
      if (!orig) return bad(res, 'That post was deleted.', 404);
      if (orig.sharedFrom && isId(orig.sharedFrom)) { const root = await GistPost.findById(orig.sharedFrom).lean(); if (root) orig = root; }
      sharedFrom = String(orig._id);
      await GistPost.updateOne({ _id: orig._id }, { $inc: { shares: 1 } });
    }
    if (!text && !images.length && !game && !sharedFrom) return bad(res, 'Write something or add a photo first.');
    const post = await GistPost.create({ author: uid, text, images, game, sharedFrom });
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

router.delete('/posts/:id', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid post.');
    const p = await GistPost.findOneAndDelete({ _id: req.params.id, author: me(req) });
    if (!p) return bad(res, 'Post not found.', 404);
    await Promise.all([GistLike.deleteMany({ post: String(p._id) }), GistComment.deleteMany({ post: String(p._id) })]);
    if (p.sharedFrom) await GistPost.updateOne({ _id: p.sharedFrom, shares: { $gt: 0 } }, { $inc: { shares: -1 } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- likes ---------- */
router.post('/posts/:id/like', limit('like', 60, 60000), async (req, res, next) => {
  try {
    const uid = me(req), id = req.params.id;
    if (!isId(id) || !(await GistPost.exists({ _id: id }))) return bad(res, 'This post was deleted.', 404);
    let liked;
    try { await GistLike.create({ post: id, user: uid }); await GistPost.updateOne({ _id: id }, { $inc: { likes: 1 } }); liked = true; }
    catch (e) {
      if (e.code !== 11000) throw e;
      const d = await GistLike.deleteOne({ post: id, user: uid });
      if (d.deletedCount) await GistPost.updateOne({ _id: id, likes: { $gt: 0 } }, { $inc: { likes: -1 } });
      liked = false;
    }
    const p = await GistPost.findById(id).select('likes').lean();
    res.json({ liked, likes: Math.max(0, (p && p.likes) || 0) });
  } catch (e) { next(e); }
});

/* ---------- comments ---------- */
router.get('/posts/:id/comments', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid post.');
    const q = { post: req.params.id };
    if (req.query.after && !isNaN(Date.parse(req.query.after))) q.createdAt = { $gt: new Date(req.query.after) };
    const rows = await GistComment.find(q).sort({ createdAt: 1 }).limit(51).lean();
    const more = rows.length > 50; if (more) rows.pop();
    const post = await GistPost.findById(req.params.id).select('author').lean();
    const users = await User.find({ _id: { $in: [...new Set(rows.map((c) => c.author).filter(isId))] } }).select(USER_FIELDS).lean();
    const uMap = new Map(users.map((u) => [String(u._id), u]));
    const uid = me(req);
    res.json({ more, comments: rows.map((c) => ({ id: String(c._id), text: c.text, createdAt: c.createdAt, author: pubUser(uMap.get(c.author)), canDelete: c.author === uid || (post && post.author === uid) })) });
  } catch (e) { next(e); }
});

router.post('/posts/:id/comments', limit('comment', 20, 60000), async (req, res, next) => {
  try {
    const uid = me(req), id = req.params.id, text = String((req.body && req.body.text) || '').trim().slice(0, 300);
    if (!text) return bad(res, 'Write a comment first.');
    const post = await GistPost.findById(isId(id) ? id : null).select('author').lean();
    if (!post) return bad(res, 'This post was deleted.', 404);
    const c = await GistComment.create({ post: id, author: uid, text });
    await GistPost.updateOne({ _id: id }, { $inc: { comments: 1 } });
    const u = await User.findById(uid).select(USER_FIELDS).lean();
    res.json({ comment: { id: String(c._id), text, createdAt: c.createdAt, author: pubUser(u), canDelete: true } });
  } catch (e) { next(e); }
});

router.delete('/comments/:id', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid comment.');
    const c = await GistComment.findById(req.params.id).lean();
    if (!c) return bad(res, 'Comment not found.', 404);
    const post = await GistPost.findById(c.post).select('author').lean();
    if (c.author !== me(req) && !(post && post.author === me(req))) return bad(res, 'You cannot delete this comment.', 403);
    await GistComment.deleteOne({ _id: c._id });
    await GistPost.updateOne({ _id: c.post, comments: { $gt: 0 } }, { $inc: { comments: -1 } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- profiles & follows ---------- */
async function findUser(key) {
  key = String(key || '');
  return isId(key) ? User.findById(key).select(USER_FIELDS).lean() : User.findOne({ acUsername: normalizeUsername(key) }).select(USER_FIELDS).lean();
}

router.get('/profile/:key', async (req, res, next) => {
  try {
    const uid = me(req), u = await findUser(req.params.key === 'me' ? me(req) : req.params.key);
    if (!u) return bad(res, 'Player not found.', 404);
    const id = String(u._id);
    if ((await blockedSet(uid)).includes(id)) return bad(res, 'Player not found.', 404);
    const [followers, following, postsCount, isFollowing, first] = await Promise.all([
      GistFollow.countDocuments({ following: id }), GistFollow.countDocuments({ follower: id }), GistPost.countDocuments({ author: id }),
      GistFollow.exists({ follower: uid, following: id }), page({ author: id }, req, uid)]);
    res.json({ user: pubUser(u), isMe: id === uid, isFollowing: !!isFollowing, followers, following, postsCount, ...first });
  } catch (e) { next(e); }
});

router.get('/profile/:key/posts', async (req, res, next) => {
  try {
    const u = await findUser(req.params.key === 'me' ? me(req) : req.params.key);
    if (!u) return bad(res, 'Player not found.', 404);
    res.json(await page({ author: String(u._id) }, req, me(req)));
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
    try { await GistFollow.create({ follower: uid, following: id }); following = true; }
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

module.exports = router;
