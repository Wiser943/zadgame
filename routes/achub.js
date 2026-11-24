// AllConnect Hub: onboarding, beginner missions, welcome parcel, return recap, newspaper + ticker, near-me feed,
// feature voting, invites, result cards, account recovery and the public status page.
// All rewards are decided and paid here, never by the client.
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const ACVote = require('../models/ACVote');
const ACTxn = require('../models/ACTxn');
const ACMessage = require('../models/ACMessage');
const ACUpdate = require('../models/ACUpdate');
const ACGroup = require('../models/ACGroup');
const Match = require('../models/Match');
const { Friendship } = require('../models/Social');
const { GistPost } = require('../models/Gist');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const { normalizeUsername, validUsername } = require('../utils/allconnect');
const profanity = require('../utils/profanity');
const { makeRef } = require('../utils/acbank');
const { emitUser } = require('../utils/acnotify');
const { queueCard, timeline } = require('../utils/accards');
const presence = require('../utils/acpresence');
const J = require('../utils/acjobs');
const L = require('../utils/aclagos');
const H = require('../utils/achub');

const STARTER_ITEMS = 8;
const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');
const bad = (res, code, message) => res.status(code).json({ message });
const uid = (req) => String(req.user.id);
const io = (req) => req.app.get('io');

/* ---------- tiny per-key rate limiter ---------- */
const hits = new Map();
const limited = (key, max, ms) => { const n = Date.now(), a = (hits.get(key) || []).filter((t) => n - t < ms); if (a.length >= max) { hits.set(key, a); return true; } a.push(n); hits.set(key, a); return false; };
setInterval(() => { const n = Date.now(); for (const [k, a] of hits) if (!a.some((t) => n - t < 3600e3)) hits.delete(k); }, 600e3).unref();

/* ---------- pay a reward once, with a ledger line ---------- */
async function pay(req, me, amount, note) {
  await ACTxn.create({ user: me, type: 'credit', amount, cpName: 'AllConnect', cpNum: '', note, ref: makeRef(), kind: 'reward' });
  emitUser(io(req), me, 'cash', { delta: amount });
}

/* ---------- missions: every "done" flag is checked against real data ---------- */
async function missionState(me) {
  const u = await ensureAC(me), a = u.ac, h = a.hub || {}, claimed = new Set(h.missionsClaimed || []);
  const [fr, grp, placed, human, recent] = await Promise.all([
    Friendship.exists({ status: 'accepted', $or: [{ requester: me }, { recipient: me }] }),
    ACGroup.exists({ members: me }),
    Match.countDocuments({ 'players.userId': me, 'players.bot': true }),
    Match.exists({ 'players.userId': me, 'players.bot': { $ne: true }, 'players.1': { $exists: true } }),
    Match.find({ 'players.userId': me }).sort({ createdAt: -1 }).limit(80).select('createdAt').lean()
  ]);
  const shifts = a.jobShifts ? [...(a.jobShifts.values ? a.jobShifts.values() : Object.values(a.jobShifts))].reduce((s, n) => s + (n || 0), 0) : 0;
  const days = new Set(recent.map((m) => H.dayKey(new Date(m.createdAt).getTime())));
  const done = {
    m_hood: !!h.hood, m_job: !!a.jobId, m_shift: shifts > 0, m_decor: (a.items || []).length >= STARTER_ITEMS + 3,
    m_friend: !!fr, m_group: !!grp, m_place: placed >= H.PLACEMENT_NEEDED, m_human: !!human, m_streak: days.size >= 2, m_bill: (a.bills || []).some((b) => b.paidAt)
  };
  const progress = { m_place: [Math.min(placed, H.PLACEMENT_NEEDED), H.PLACEMENT_NEEDED], m_streak: [Math.min(days.size, 2), 2], m_decor: [Math.max(0, Math.min(3, (a.items || []).length - STARTER_ITEMS)), 3] };
  const list = H.MISSIONS.map((m) => ({ id: m.id, title: m.title, hint: m.hint, reward: m.reward, fa: m.fa, group: m.group, done: !!done[m.id], claimed: claimed.has(m.id), progress: progress[m.id] || null }));
  return { u, list, shifts };
}

const parcelState = (u, now) => {
  const h = u.ac.hub || {}, today = H.dayKey(now), n = h.parcelCount || 0;
  const open = n < H.PARCEL.length && H.isProtected(u.createdAt, now + 2 * 86400e3);       // parcels only for new players (first ~9 days)
  return { claimable: open && h.parcelDay !== today, amount: H.parcelFor(n), day: n + 1, total: H.PARCEL.length, over: n >= H.PARCEL.length };
};

/* ---------- caches for the shared city feed (same for everyone, so cheap) ---------- */
let cityCache = { at: 0, v: null };
async function cityFeed(now) {
  if (cityCache.v && now - cityCache.at < 60000) return cityCache.v;
  const [rich, players, gists, topGist, admin] = await Promise.all([
    User.findOne({ 'ac.cash': { $gt: 0 } }).sort({ 'ac.cash': -1 }).select('displayName acUsername ac.cash').lean(),
    User.estimatedDocumentCount(),
    GistPost.countDocuments({ createdAt: { $gte: new Date(now - 86400e3) } }).catch(() => 0),
    GistPost.findOne({ createdAt: { $gte: new Date(now - 86400e3) } }).sort({ likes: -1 }).select('text').lean().catch(() => null),
    ACUpdate.find({ user: null, kind: 'admin' }).sort({ at: -1 }).limit(3).select('text').lean()
  ]);
  const v = {
    richest: rich ? { name: rich.acUsername ? '@' + rich.acUsername : rich.displayName, cash: naira(rich.ac.cash) } : null, players,
    gist: { count: gists, top: topGist && topGist.text ? String(topGist.text).slice(0, 60) : '' }, admin: admin.map((x) => x.text)
  };
  cityCache = { at: now, v }; return v;
}

const router = express.Router();
const pub = express.Router();
router.pub = pub;

/* =============================== PUBLIC (no login) =============================== */
// Status page data
const BOOT = Date.now();
pub.get('/status', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const t0 = Date.now(); let dbOk = false, dbMs = null;
  try { if (mongoose.connection.readyState === 1) { await mongoose.connection.db.admin().ping(); dbOk = true; dbMs = Date.now() - t0; } } catch (e) { /* down */ }
  const mem = process.memoryUsage().rss;
  res.json({
    ok: dbOk, checkedAt: new Date().toISOString(), uptimeSec: Math.floor((Date.now() - BOOT) / 1000), version: (H.CHANGELOG[0] || {}).v || '',
    services: [
      { id: 'web', name: 'Web app', ok: true }, { id: 'db', name: 'Database', ok: dbOk, ms: dbMs },
      { id: 'live', name: 'Live play and chat', ok: !!req.app.get('io') }, { id: 'push', name: 'Notifications', ok: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) }
    ],
    online: presence.count(), memoryMb: Math.round(mem / 1048576), event: (() => { const e = L.publicEvent(L.currentEvent(Date.now())); return { title: e.title, endsAt: e.endsAt }; })()
  });
});

// One-tap recovery with the recovery code shown at setup (no email needed)
const scrypt = (code, salt) => crypto.scryptSync(String(code), salt, 32).toString('hex');
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
pub.post('/recover', async (req, res, next) => {
  try {
    const b = req.body || {}, ip = req.ip || '';
    if (limited('rec:' + ip, 8, 900e3)) return bad(res, 429, 'Too many tries. Wait 15 minutes and try again.');
    const { normalizeIdentifier } = require('../utils/identifier'), bcrypt = require('bcryptjs');
    const id = normalizeIdentifier(b.identifier || ''), code = normCode(b.code), pw = String(b.password || '');
    if (code.length !== 12) return bad(res, 400, 'Enter your 12-character recovery code.');
    if (pw.length < 6) return bad(res, 400, 'Choose a new password with at least 6 characters.');
    const u = id && id.value ? await User.findOne(id.type === 'email' ? { email: id.value } : { phone: id.value }) : null;
    const h = u && u.ac && u.ac.hub;
    const ok = h && h.recoveryHash && h.recoverySalt && crypto.timingSafeEqual(Buffer.from(scrypt(code, h.recoverySalt), 'hex'), Buffer.from(h.recoveryHash, 'hex'));
    if (!ok) return bad(res, 400, 'That code does not match this account.');
    await User.updateOne({ _id: u._id }, { $set: { passwordHash: await bcrypt.hash(pw, 10) } });
    res.json({ ok: true, message: 'Password changed. You can sign in now.' });
  } catch (e) { next(e); }
});

/* =============================== SIGNED IN =============================== */
router.use(ensureAuth);

// Static-ish content for every hub screen (one call, cached by the client)
router.get('/content', (req, res) => {
  const now = Date.now();
  res.json({
    promise: H.PROMISE, hoods: H.NEIGHBOURHOODS, hobbies: H.HOBBIES, steps: H.ONBOARD_STEPS, theme: H.weeklyTheme(now),
    jobs: J.catalogue().filter((j) => H.STARTER_JOBS.includes(j.id)), help: H.HELP, roadmap: H.ROADMAP, votes: H.VOTES, changelog: H.CHANGELOG, lore: H.LORE, anthem: H.ANTHEM,
    protect: { days: H.PROTECT_DAYS, transferMax: H.PROTECT.transferMax, investMax: H.PROTECT.investMax }, invite: H.INVITE
  });
});

// Everything the player needs on one screen: setup state, missions, tasks, parcel, protection, timeline, recap
router.get('/me', async (req, res, next) => {
  try {
    const me = uid(req), now = Date.now(), st = await missionState(me), u = st.u, h = u.ac.hub || {};
    const prot = H.isProtected(u.createdAt, now);
    const recap = H.recapKind(h.lastSeen, now);
    let recapData = null;
    if (recap && h.done) {
      const since = new Date(h.lastSeen);
      const [earned, unread, updates] = await Promise.all([
        ACTxn.aggregate([{ $match: { user: me, type: 'credit', at: { $gt: since } } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
        ACMessage.countDocuments({ to: me, read: false }), ACUpdate.countDocuments({ user: me, at: { $gt: since } })
      ]);
      const ev = L.publicEvent(L.currentEvent(now)), bills = (u.ac.bills || []).filter((b) => !b.paidAt).length;
      recapData = { days: recap.days, long: recap.long, gift: recap.long && h.returnGiftDay !== H.dayKey(now) ? H.RETURN.gift : 0, earned: (earned[0] && earned[0].t) || 0, unread, updates, bills, event: { title: ev.title, pidgin: ev.pidgin, icon: ev.icon } };
    } else if (!recap) User.updateOne({ _id: me }, { $set: { 'ac.hub.lastSeen': new Date(now) } }).catch(() => {});
    const claimable = st.list.filter((m) => m.done && !m.claimed).length;
    res.json({
      now, cash: u.ac.cash, joinedAt: u.createdAt,
      hub: { hood: h.hood || '', hobby: h.hobby || '', done: !!h.done, tourDone: !!h.tourDone, controlsDone: !!h.controlsDone, hasRecovery: !!h.recoveryHash, username: u.acUsername || '', invites: h.invites || 0, invitedBy: !!h.invitedBy },
      protection: { active: prot, daysLeft: H.protectionLeftDays(u.createdAt, now), transferMax: H.PROTECT.transferMax, investMax: H.PROTECT.investMax },
      missions: { list: st.list, done: st.list.filter((m) => m.done).length, total: st.list.length, claimable },
      tasks: H.personalTasks({ hobby: h.hobby }, st.list), parcel: parcelState(u, now), timeline: (h.timeline || []).slice(-30).reverse(), map: H.progressMap(h, st.list), recap: recapData,
      todo: claimable + (parcelState(u, now).claimable ? 1 : 0) + (h.done ? 0 : 1)
    });
  } catch (e) { next(e); }
});

/* ---------- onboarding ---------- */
router.post('/usernames', async (req, res, next) => {
  try {
    if (limited('un:' + uid(req), 20, 60000)) return bad(res, 429, 'Slow down a little.');
    const b = req.body || {}, u = await ensureAC(uid(req));
    const all = H.usernameSuggestions(b.name || u.displayName, H.cleanId(b.hobby, H.HOBBY_IDS), H.cleanId(b.hood, H.HOOD_IDS), Math.abs(parseInt(b.seed, 10) || 0))
      .filter((n) => validUsername(n) && !profanity.isDirty(n));
    const taken = new Set((await User.find({ acUsername: { $in: all } }).select('acUsername').lean()).map((x) => x.acUsername));
    res.json({ names: all.filter((n) => !taken.has(n)).slice(0, 4), current: u.acUsername || '' });
  } catch (e) { next(e); }
});

const makeRecovery = () => { const raw = crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').toUpperCase().padEnd(12, 'K').slice(0, 12); return raw; };

router.post('/onboard', async (req, res, next) => {
  try {
    const me = uid(req), b = req.body || {}, now = Date.now();
    if (limited('ob:' + me, 10, 60000)) return bad(res, 429, 'Slow down a little.');
    const hood = H.cleanId(b.hood, H.HOOD_IDS), hobby = H.cleanId(b.hobby, H.HOBBY_IDS), job = H.cleanId(b.job, H.STARTER_JOBS);
    if (!hood || !hobby) return bad(res, 400, 'Pick an area and a hobby.');
    const u0 = await ensureAC(me), first = !(u0.ac.hub && u0.ac.hub.done);
    const set = { 'ac.hub.hood': hood, 'ac.hub.hobby': hobby, 'ac.hub.done': true };
    if (job && !u0.ac.jobId) set['ac.jobId'] = job;
    if ((b.gender === 'male' || b.gender === 'female') && !u0.ac.gender) set['ac.gender'] = b.gender;   // chosen once; later changes go through Style
    if (!(u0.ac.hub && u0.ac.hub.lastSeen)) set['ac.hub.lastSeen'] = new Date(now);
    let recovery = null;
    if (!u0.ac.hub.recoveryHash) { recovery = makeRecovery(); const salt = crypto.randomBytes(12).toString('hex'); set['ac.hub.recoverySalt'] = salt; set['ac.hub.recoveryHash'] = scrypt(recovery, salt); }
    const name = b.username ? normalizeUsername(b.username) : '';
    if (name && name !== u0.acUsername) {
      if (!validUsername(name)) return bad(res, 400, 'Use 3–16 letters, numbers or underscores.');
      if (profanity.isDirty(name)) return bad(res, 400, 'Please pick a different username.');
      set.acUsername = name;
    }
    try { await User.updateOne({ _id: me }, { $set: set }); }
    catch (e) { if (e && e.code === 11000) return bad(res, 409, 'That username is taken. Pick another.'); throw e; }
    if (first) {
      const h = H.NEIGHBOURHOODS.find((x) => x.id === hood), j = job && J.jobOf(job);
      timeline(me, '🏠', `Moved into ${h.name}`); if (j) timeline(me, j.emoji, `Started work: ${j.ladder[0].title}`);
    }
    res.json({ ok: true, recovery, username: set.acUsername || u0.acUsername || '' });
  } catch (e) { next(e); }
});

// New recovery code (the old one stops working)
router.post('/recovery/new', async (req, res, next) => {
  try {
    const me = uid(req); if (limited('rc:' + me, 5, 600e3)) return bad(res, 429, 'Slow down a little.');
    const code = makeRecovery(), salt = crypto.randomBytes(12).toString('hex');
    await User.updateOne({ _id: me }, { $set: { 'ac.hub.recoverySalt': salt, 'ac.hub.recoveryHash': scrypt(code, salt) } });
    res.json({ code });
  } catch (e) { next(e); }
});

router.post('/tour', async (req, res, next) => {
  try {
    const kind = (req.body && req.body.kind) === 'controls' ? 'controls' : 'tour';
    await User.updateOne({ _id: uid(req) }, { $set: { [kind === 'controls' ? 'ac.hub.controlsDone' : 'ac.hub.tourDone']: true } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- missions + parcel ---------- */
router.get('/missions', async (req, res, next) => { try { const st = await missionState(uid(req)); res.json({ missions: st.list }); } catch (e) { next(e); } });
router.post('/missions/claim', async (req, res, next) => {
  try {
    const me = uid(req), id = String((req.body && req.body.id) || ''), m = H.MBYID[id];
    if (!m) return bad(res, 400, 'Unknown mission.');
    const st = await missionState(me), s = st.list.find((x) => x.id === id);
    if (!s.done) return bad(res, 409, 'Not finished yet.');
    if (s.claimed) return bad(res, 409, 'Already claimed.');
    const u = await User.findOneAndUpdate({ _id: me, 'ac.hub.missionsClaimed': { $ne: id } }, { $inc: { 'ac.cash': m.reward }, $push: { 'ac.hub.missionsClaimed': id } }, { new: true });
    if (!u) return bad(res, 409, 'Already claimed.');
    await pay(req, me, m.reward, 'Mission: ' + m.title); timeline(me, '🎯', `Mission done: ${m.title}`);
    const next2 = await missionState(me);
    res.json({ reward: m.reward, cash: u.ac.cash, missions: next2.list, title: m.title });
  } catch (e) { next(e); }
});

router.post('/parcel', async (req, res, next) => {
  try {
    const me = uid(req), now = Date.now(), u0 = await ensureAC(me), p = parcelState(u0, now);
    if (!p.claimable) return bad(res, 409, p.over ? 'You have collected every welcome parcel.' : 'Come back tomorrow for your next parcel.');
    const u = await User.findOneAndUpdate({ _id: me, 'ac.hub.parcelDay': { $ne: H.dayKey(now) }, 'ac.hub.parcelCount': u0.ac.hub.parcelCount || 0 },
      { $inc: { 'ac.cash': p.amount, 'ac.hub.parcelCount': 1 }, $set: { 'ac.hub.parcelDay': H.dayKey(now) } }, { new: true });
    if (!u) return bad(res, 409, 'Already collected.');
    await pay(req, me, p.amount, `Welcome parcel, day ${p.day}`);
    res.json({ amount: p.amount, cash: u.ac.cash, parcel: parcelState(u, now) });
  } catch (e) { next(e); }
});

/* ---------- returning player ---------- */
router.post('/recap/ack', async (req, res, next) => {
  try {
    const me = uid(req), now = Date.now(), u0 = await ensureAC(me), h = u0.ac.hub || {}, r = H.recapKind(h.lastSeen, now);
    let gift = 0, cash = u0.ac.cash;
    if (r && r.long && h.returnGiftDay !== H.dayKey(now)) {
      const u = await User.findOneAndUpdate({ _id: me, 'ac.hub.returnGiftDay': { $ne: H.dayKey(now) } }, { $inc: { 'ac.cash': H.RETURN.gift }, $set: { 'ac.hub.returnGiftDay': H.dayKey(now), 'ac.hub.lastSeen': new Date(now) } }, { new: true });
      if (u) { gift = H.RETURN.gift; cash = u.ac.cash; await pay(req, me, gift, 'Welcome back gift'); timeline(me, '👋', `Came back after ${r.days} days`); }
    }
    await User.updateOne({ _id: me }, { $set: { 'ac.hub.lastSeen': new Date(now) } });
    res.json({ gift, cash });
  } catch (e) { next(e); }
});

/* ---------- newspaper + ticker + near me ---------- */
router.get('/news', async (req, res, next) => {
  try {
    const now = Date.now(), c = await cityFeed(now), ev = L.publicEvent(L.currentEvent(now)), nx = L.publicEvent(L.currentEvent(ev.endsAt + 1)), theme = H.weeklyTheme(now);
    const ctx = { now, event: ev, next: nx, theme, richest: c.richest, gist: c.gist, players: c.players, online: presence.count(), admin: c.admin, gistCount: c.gist.count };
    res.json({ paper: H.newspaper(ctx), ticker: H.ticker(ctx), theme });
  } catch (e) { next(e); }
});

router.get('/near', async (req, res, next) => {
  try {
    const me = uid(req), u = await ensureAC(me), hood = (u.ac.hub && u.ac.hub.hood) || '', now = Date.now();
    const ev = L.publicEvent(L.currentEvent(now)), h = H.NEIGHBOURHOODS.find((x) => x.id === hood);
    const blocked = u.blocked || [];
    const rows = hood ? await User.find({ 'ac.hub.hood': hood, _id: { $ne: me, $nin: blocked.filter((x) => mongoose.isValidObjectId(x)) } }).sort({ 'ac.hub.lastSeen': -1 }).limit(8).select('displayName acUsername avatar verified ac.hub.hobby').lean() : [];
    const hob = Object.fromEntries(H.HOBBIES.map((x) => [x.id, x]));
    const vibe = h ? (Object.entries(ev.districts || {}).find(([k]) => k.toLowerCase() === h.name.toLowerCase()) || [])[1] || '' : '';
    res.json({
      hood: h || null, vibe, event: { title: ev.title, icon: ev.icon },
      neighbours: rows.map((x) => ({ id: String(x._id), username: x.acUsername || '', displayName: x.displayName, avatar: x.avatar || '', verified: !!x.verified, online: presence.isOnline(x._id), hobby: (hob[x.ac && x.ac.hub && x.ac.hub.hobby] || {}).emoji || '' }))
    });
  } catch (e) { next(e); }
});

/* ---------- roadmap voting ---------- */
async function voteView(me) {
  const [agg, mine] = await Promise.all([ACVote.aggregate([{ $group: { _id: '$feature', n: { $sum: 1 } } }]), ACVote.find({ user: me }).select('feature').lean()]);
  const n = Object.fromEntries(agg.map((x) => [x._id, x.n])), my = new Set(mine.map((x) => x.feature));
  return H.VOTES.map((v) => ({ ...v, votes: n[v.id] || 0, mine: my.has(v.id) })).sort((a, b) => b.votes - a.votes);
}
router.get('/votes', async (req, res, next) => { try { res.json({ votes: await voteView(uid(req)), max: 3 }); } catch (e) { next(e); } });
router.post('/vote', async (req, res, next) => {
  try {
    const me = uid(req), id = String((req.body && req.body.id) || '');
    if (!H.VBYID[id]) return bad(res, 400, 'Unknown feature.');
    if (limited('vote:' + me, 20, 60000)) return bad(res, 429, 'Slow down a little.');
    const had = await ACVote.findOne({ feature: id, user: me });
    if (had) await ACVote.deleteOne({ _id: had._id });
    else {
      if ((await ACVote.countDocuments({ user: me })) >= 3) return bad(res, 409, 'You have 3 votes. Remove one first.');
      try { await ACVote.create({ feature: id, user: me }); } catch (e) { if (e.code !== 11000) throw e; }
    }
    res.json({ votes: await voteView(me), max: 3 });
  } catch (e) { next(e); }
});

/* ---------- invite a friend (co-op onboarding) ---------- */
router.get('/invite', async (req, res, next) => {
  try { const u = await ensureAC(uid(req)); res.json({ code: u.acUsername || String(u._id), invites: (u.ac.hub && u.ac.hub.invites) || 0, ...H.INVITE }); } catch (e) { next(e); }
});
router.post('/invite/redeem', async (req, res, next) => {
  try {
    const me = uid(req), now = Date.now(), code = normalizeUsername((req.body && req.body.code) || '');
    if (limited('inv:' + me, 6, 600e3)) return bad(res, 429, 'Slow down a little.');
    const u = await ensureAC(me);
    if (u.ac.hub.invitedBy) return bad(res, 409, 'You already used an invite.');
    if (now - new Date(u.createdAt).getTime() > H.INVITE.windowDays * 86400e3) return bad(res, 409, 'Invites only work in your first week.');
    const inviter = mongoose.isValidObjectId(code) ? await User.findById(code) : await User.findOne({ acUsername: code });
    if (!inviter) return bad(res, 404, 'No player has that invite code.');
    if (String(inviter._id) === me) return bad(res, 400, "You can't invite yourself.");
    const claim = await User.updateOne({ _id: me, 'ac.hub.invitedBy': '' }, { $set: { 'ac.hub.invitedBy': String(inviter._id) }, $inc: { 'ac.cash': H.INVITE.invitee } });
    if (!claim.modifiedCount) return bad(res, 409, 'You already used an invite.');
    await User.updateOne({ _id: inviter._id }, { $inc: { 'ac.cash': H.INVITE.inviter, 'ac.hub.invites': 1 } });
    await pay(req, me, H.INVITE.invitee, 'Invite bonus'); await ACTxn.create({ user: String(inviter._id), type: 'credit', amount: H.INVITE.inviter, cpName: 'AllConnect', cpNum: '', note: 'Friend joined with your invite', ref: makeRef(), kind: 'reward' });
    emitUser(io(req), String(inviter._id), 'cash', { delta: H.INVITE.inviter });
    queueCard(io(req), String(inviter._id), { icon: '🤝', title: 'Your friend joined!', text: `${u.displayName} joined Lagos with your invite. You both get a bonus.`, lines: [['Bonus', naira(H.INVITE.inviter)]], tone: 'gold' }).catch(() => {});
    timeline(me, '🤝', 'Joined with an invite'); timeline(String(inviter._id), '🤝', `${u.displayName} joined with your invite`);
    const after = await User.findById(me).select('ac.cash');
    res.json({ bonus: H.INVITE.invitee, cash: after.ac.cash, from: inviter.acUsername || inviter.displayName });
  } catch (e) { next(e); }
});

/* ---------- result cards (back from work, payouts, gifts) ---------- */
router.get('/cards', async (req, res, next) => { try { const u = await ensureAC(uid(req)); res.json({ cards: (u.ac.hub.cards || []).map((c) => ({ id: c.id, icon: c.icon, title: c.title, text: c.text, tone: c.tone, btn: c.btn, lines: (c.lines || []).map((l) => [l.k, l.v]) })) }); } catch (e) { next(e); } });
router.post('/cards/seen', async (req, res, next) => {
  try { const ids = (Array.isArray(req.body && req.body.ids) ? req.body.ids : []).map(String).slice(0, 12); await User.updateOne({ _id: uid(req) }, { $pull: { 'ac.hub.cards': { id: { $in: ids } } } }); res.json({ ok: true }); } catch (e) { next(e); }
});
/* ---------- life timeline ---------- */
router.get('/timeline', async (req, res, next) => { try { const u = await ensureAC(uid(req)); res.json({ joinedAt: u.createdAt, items: (u.ac.hub.timeline || []).slice().reverse() }); } catch (e) { next(e); } });

module.exports = router;
