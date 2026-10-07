// Group chats (WhatsApp style). Roles: owner (creator) > admin > member.
//  - owner/admins: add members, remove members, rename, turn "only admins can send messages" on/off, delete anyone's message, promote/demote
//  - admins cannot remove the owner or other admins; only the owner can delete the whole group
//  - anyone can leave. If the owner leaves, the oldest admin (else oldest member) becomes owner.
const express = require('express');
const User = require('../models/User');
const { Friendship } = require('../models/Social');
const ACGroup = require('../models/ACGroup');
const ACGroupMsg = require('../models/ACGroupMsg');
const ensureAuth = require('../middleware/auth');
const profanity = require('../utils/profanity');
const acPresence = require('../utils/acpresence');
const ghPresence = require('../utils/presence');
const { emitUser } = require('../utils/acnotify');
const { normalizeUsername } = require('../utils/allconnect');

const MAX_MEMBERS = 50, MAX_GROUPS = 30, MAX_OWNED = 10;
const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const io = (req) => req.app.get('io');
const isId = (s) => /^[a-f\d]{24}$/i.test(String(s));
const bad = (res, code, message) => res.status(code).json({ message });
const label = (u) => (u.acUsername ? '@' + u.acUsername : u.displayName);
const pub = (u) => ({ id: String(u._id), username: u.acUsername || '', displayName: u.displayName, avatar: u.avatar || '', online: acPresence.isOnline(u._id) || ghPresence.isOnline(u._id) });
const between = (a, b) => ({ $or: [{ requester: a, recipient: b }, { requester: b, recipient: a }] });
const hits = new Map();
const limited = (id) => { const n = Date.now(), a = (hits.get(id) || []).filter((t) => n - t < 60000); if (a.length >= 30) { hits.set(id, a); return true; } a.push(n); hits.set(id, a); return false; };
const isAdmin = (g, id) => g.owner === id || g.admins.includes(id);
const roleOf = (g, id) => (g.owner === id ? 'owner' : g.admins.includes(id) ? 'admin' : 'member');
const mv = (m) => ({ id: String(m._id), group: m.group, from: m.from, text: m.deleted ? '' : m.text, kind: m.kind, deleted: !!m.deleted, at: m.at });
const mapGet = (m, k) => (m && (m.get ? m.get(k) : m[k])) || null;

async function myGroup(req, res) {
  if (!isId(req.params.id)) { bad(res, 400, 'Invalid group.'); return null; }
  const g = await ACGroup.findOne({ _id: req.params.id, members: uid(req) });
  if (!g) { bad(res, 404, 'Group not found, or you are no longer in it.'); return null; }
  return g;
}
const sinceFor = (g, id) => mapGet(g.joined, id) || g.createdAt;
async function unreadFor(g, id) {
  const since = mapGet(g.reads, id) || sinceFor(g, id);
  return ACGroupMsg.countDocuments({ group: String(g._id), kind: 'text', from: { $ne: id }, deleted: false, at: { $gt: since } });
}
async function say(req, g, text, kind = 'system', from = '') {
  const m = await ACGroupMsg.create({ group: String(g._id), from, text, kind });
  g.lastAt = m.at; await g.save();
  g.members.forEach((id) => emitUser(io(req), id, 'gmsg', mv(m)));
  return m;
}
const ping = (req, g, ids, type) => (ids || g.members).forEach((id) => emitUser(io(req), id, 'group', { id: String(g._id), type }));
async function areBlocked(a, b) { return !!(await Friendship.exists({ ...between(a, b), status: 'blocked' })); }
async function areFriends(a, b) { return !!(await Friendship.exists({ ...between(a, b), status: 'accepted' })); }

// Turns a list of @usernames into addable user docs; reports why someone was skipped.
async function resolve(me, g, names) {
  const wanted = [...new Set((Array.isArray(names) ? names : []).map(normalizeUsername).filter(Boolean))].slice(0, MAX_MEMBERS);
  const users = wanted.length ? await User.find({ acUsername: { $in: wanted } }).select('displayName avatar acUsername').lean() : [];
  const by = new Map(users.map((u) => [u.acUsername, u]));
  const ok = [], skipped = [];
  for (const n of wanted) {
    const u = by.get(n); if (!u) { skipped.push(`@${n} not found`); continue; }
    const id = String(u._id);
    if (id === me || (g && g.members.includes(id))) { skipped.push(`@${n} is already in`); continue; }
    if (await areBlocked(me, id)) { skipped.push(`@${n} can't be added`); continue; }
    if (!(await areFriends(me, id))) { skipped.push(`@${n} is not your friend yet`); continue; }
    ok.push(u);
  }
  return { ok, skipped };
}

router.get('/', async (req, res, next) => {
  try {
    const me = uid(req), rows = await ACGroup.find({ members: me }).sort({ lastAt: -1 }).limit(MAX_GROUPS);
    const out = [];
    for (const g of rows) {
      const last = await ACGroupMsg.findOne({ group: String(g._id), at: { $gte: sinceFor(g, me) } }).sort({ at: -1 }).lean();
      out.push({ id: String(g._id), name: g.name, members: g.members.length, role: roleOf(g, me), onlyAdmins: g.onlyAdmins, unread: await unreadFor(g, me), lastAt: g.lastAt, last: last ? mv(last) : null });
    }
    res.json({ groups: out });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const me = uid(req);
    if (limited(me)) return bad(res, 429, 'Slow down a little.');
    const name = profanity.clean(String((req.body && req.body.name) || '').trim().slice(0, 40));
    if (name.length < 2) return bad(res, 400, 'Give the group a name (2+ characters).');
    if ((await ACGroup.countDocuments({ owner: me })) >= MAX_OWNED) return bad(res, 409, `You can own up to ${MAX_OWNED} groups.`);
    const { ok, skipped } = await resolve(me, null, req.body && req.body.usernames);
    if (ok.length + 1 > MAX_MEMBERS) return bad(res, 400, `A group holds up to ${MAX_MEMBERS} people.`);
    const now = new Date(), ids = [me, ...ok.map((u) => String(u._id))];
    const g = await ACGroup.create({ name, owner: me, admins: [], members: ids, joined: Object.fromEntries(ids.map((i) => [i, now])), reads: { [me]: now }, lastAt: now });
    const names = ok.map(label).join(', ');
    await say(req, g, `${label(req.user)} created the group${names ? ' and added ' + names : ''}`);
    ping(req, g, ids, 'new');
    res.json({ id: String(g._id), skipped });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const g = await myGroup(req, res); if (!g) return;
    const me = uid(req);
    const [users, rows] = await Promise.all([User.find({ _id: { $in: g.members } }).select('displayName avatar acUsername').lean(),
      ACGroupMsg.find({ group: String(g._id), at: { $gte: sinceFor(g, me) } }).sort({ at: -1 }).limit(80).lean()]);
    const by = new Map(users.map((u) => [String(u._id), u]));
    g.reads.set(me, new Date()); await g.save();
    res.json({ group: { id: String(g._id), name: g.name, onlyAdmins: g.onlyAdmins, owner: g.owner, role: roleOf(g, me), max: MAX_MEMBERS },
      members: g.members.filter((id) => by.has(id)).map((id) => ({ ...pub(by.get(id)), role: roleOf(g, id) })).sort((a, b) => ['owner', 'admin', 'member'].indexOf(a.role) - ['owner', 'admin', 'member'].indexOf(b.role)),
      messages: rows.reverse().map(mv) });
  } catch (e) { next(e); }
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    const me = uid(req);
    if (limited(me)) return bad(res, 429, 'Slow down a little.');
    const g = await myGroup(req, res); if (!g) return;
    if (g.onlyAdmins && !isAdmin(g, me)) return bad(res, 403, 'Only admins can send messages in this group.');
    const text = profanity.clean(String((req.body && req.body.text) || '').trim().slice(0, 500));
    if (!text) return bad(res, 400, 'Type a message first.');
    const m = await say(req, g, text, 'text', me);
    g.reads.set(me, new Date()); await g.save();
    res.json({ message: mv(m) });
  } catch (e) { next(e); }
});

router.delete('/:id/messages/:mid', async (req, res, next) => {
  try {
    const g = await myGroup(req, res); if (!g) return;
    const me = uid(req), m = isId(req.params.mid) ? await ACGroupMsg.findOne({ _id: req.params.mid, group: String(g._id), kind: 'text' }) : null;
    if (!m) return bad(res, 404, 'Message not found.');
    if (m.from !== me && !isAdmin(g, me)) return bad(res, 403, 'Only the sender or an admin can delete this.');
    m.deleted = true; m.text = ''; await m.save();
    ping(req, g, null, 'msgs');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/members', async (req, res, next) => {
  try {
    const g = await myGroup(req, res); if (!g) return;
    const me = uid(req);
    if (!isAdmin(g, me)) return bad(res, 403, 'Only admins can add people.');
    const { ok, skipped } = await resolve(me, g, req.body && req.body.usernames);
    if (g.members.length + ok.length > MAX_MEMBERS) return bad(res, 409, `A group holds up to ${MAX_MEMBERS} people.`);
    if (!ok.length) return bad(res, 400, skipped[0] || 'Enter a @username to add.');
    const now = new Date(), ids = ok.map((u) => String(u._id));
    ids.forEach((id) => { g.members.push(id); g.joined.set(id, now); g.reads.set(id, now); });
    await g.save();
    await say(req, g, `${label(req.user)} added ${ok.map(label).join(', ')}`);
    ping(req, g, null, 'members');
    res.json({ added: ok.length, skipped });
  } catch (e) { next(e); }
});

router.delete('/:id/members/:uid', async (req, res, next) => {
  try {
    const g = await myGroup(req, res); if (!g) return;
    const me = uid(req), target = String(req.params.uid);
    if (target === me) return bad(res, 400, 'Use Leave group to exit.');
    if (!g.members.includes(target)) return bad(res, 404, 'They are not in this group.');
    if (!isAdmin(g, me)) return bad(res, 403, 'Only admins can remove people.');
    if (target === g.owner) return bad(res, 403, 'The group owner cannot be removed.');
    if (g.admins.includes(target) && g.owner !== me) return bad(res, 403, 'Only the owner can remove an admin.');
    const u = await User.findById(target).select('displayName acUsername').lean();
    g.members = g.members.filter((x) => x !== target); g.admins = g.admins.filter((x) => x !== target); g.joined.delete(target); g.reads.delete(target);
    await g.save();
    await say(req, g, `${label(req.user)} removed ${u ? label(u) : 'a member'}`);
    emitUser(io(req), target, 'group', { id: String(g._id), type: 'removed' });
    ping(req, g, null, 'members');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/admins/:uid', async (req, res, next) => {
  try {
    const g = await myGroup(req, res); if (!g) return;
    const me = uid(req), target = String(req.params.uid);
    if (!isAdmin(g, me)) return bad(res, 403, 'Only admins can make someone an admin.');
    if (!g.members.includes(target)) return bad(res, 404, 'They are not in this group.');
    if (!isAdmin(g, target)) { g.admins.push(target); await g.save(); const u = await User.findById(target).select('displayName acUsername').lean(); await say(req, g, `${label(req.user)} made ${u ? label(u) : 'someone'} an admin`); ping(req, g, null, 'members'); }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id/admins/:uid', async (req, res, next) => {
  try {
    const g = await myGroup(req, res); if (!g) return;
    const me = uid(req), target = String(req.params.uid);
    if (!isAdmin(g, me)) return bad(res, 403, 'Only admins can change admins.');
    if (target === g.owner) return bad(res, 403, 'The group owner is always an admin.');
    if (g.admins.includes(target)) { g.admins = g.admins.filter((x) => x !== target); await g.save(); const u = await User.findById(target).select('displayName acUsername').lean(); await say(req, g, `${label(req.user)} removed ${u ? label(u) : 'someone'} as admin`); ping(req, g, null, 'members'); }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const g = await myGroup(req, res); if (!g) return;
    const me = uid(req), b = req.body || {};
    if (!isAdmin(g, me)) return bad(res, 403, 'Only admins can change group settings.');
    if (typeof b.name === 'string') {
      const name = profanity.clean(b.name.trim().slice(0, 40)); if (name.length < 2) return bad(res, 400, 'Give the group a name (2+ characters).');
      if (name !== g.name) { g.name = name; await g.save(); await say(req, g, `${label(req.user)} renamed the group to "${name}"`); }
    }
    if (typeof b.onlyAdmins === 'boolean' && b.onlyAdmins !== g.onlyAdmins) {
      g.onlyAdmins = b.onlyAdmins; await g.save();
      await say(req, g, g.onlyAdmins ? `${label(req.user)} changed settings: only admins can send messages` : `${label(req.user)} changed settings: everyone can send messages`);
    }
    ping(req, g, null, 'settings');
    res.json({ ok: true, name: g.name, onlyAdmins: g.onlyAdmins });
  } catch (e) { next(e); }
});

router.post('/:id/leave', async (req, res, next) => {
  try {
    const g = await myGroup(req, res); if (!g) return;
    const me = uid(req), name = label(req.user);
    g.members = g.members.filter((x) => x !== me); g.admins = g.admins.filter((x) => x !== me); g.joined.delete(me); g.reads.delete(me);
    if (!g.members.length) { await ACGroupMsg.deleteMany({ group: String(g._id) }); await g.deleteOne(); return res.json({ ok: true }); }
    let note = `${name} left`;
    if (g.owner === me) { g.owner = g.admins[0] || g.members[0]; if (!g.admins.includes(g.owner)) g.admins.push(g.owner); const u = await User.findById(g.owner).select('displayName acUsername').lean(); note += ` · ${u ? label(u) : 'someone'} is now the group owner`; }
    await g.save(); await say(req, g, note); ping(req, g, null, 'members');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const g = await myGroup(req, res); if (!g) return;
    if (g.owner !== uid(req)) return bad(res, 403, 'Only the group owner can delete the group.');
    const ids = [...g.members];
    await ACGroupMsg.deleteMany({ group: String(g._id) }); await g.deleteOne();
    ids.forEach((id) => emitUser(io(req), id, 'group', { id: String(g._id), type: 'removed' }));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Total unread group messages for the Messages badge.
async function unreadTotal(me) {
  let n = 0;
  for (const g of await ACGroup.find({ members: me }).limit(MAX_GROUPS)) n += await unreadFor(g, me);
  return n;
}
module.exports = router;
module.exports.unreadTotal = unreadTotal;
