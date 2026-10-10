// Style app: avatar look, wardrobe, tailor, salon, motion, identity and privacy.
// The server decides prices, ownership, season, durability and who may see what. The client only sends ids and colours.
const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const ACStyle = require('../models/ACStyle');
const ensureAuth = require('../middleware/auth');
const econ = require('../utils/economy');
const { notify } = require('../utils/acnotify');
const S = require('../utils/acstyle');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const hits = new Map();
const limited = (id) => { const n = Date.now(), a = (hits.get(id) || []).filter((t) => n - t < 60000); if (a.length >= 60) { hits.set(id, a); return true; } a.push(n); hits.set(id, a); return false; };
const rid = () => crypto.randomBytes(5).toString('hex');
const naira = (n) => '₦' + Math.floor(n).toLocaleString('en-NG');
const ensureAC = (id) => require('./allconnect').ensureAC(id);

async function ensureDoc(id) {
  try { await ACStyle.updateOne({ user: id }, { $setOnInsert: { user: id } }, { upsert: true }); } catch (e) { if (e.code !== 11000) throw e; }
  return ACStyle.findOne({ user: id });
}
const cleanPrivacy = (p) => Object.assign({}, S.PRIVACY_DEFAULT, p || {});
const accessOf = (d) => Object.fromEntries(S.ACCESS_KEYS.map((k) => [k, !!(d.identity.access && d.identity.access[k])]));
const moodOf = (d, user) => (d.motion.autoMood ? S.autoMood(user.ac && user.ac.needs) : (S.MOODS[d.motion.mood] ? d.motion.mood : 'neutral'));
const dateMs = (v) => (v ? new Date(v).getTime() : 0);

// Everything the resolver needs for one player.
function ctxOf(d, user, now = Date.now()) {
  return { gender: user.ac && user.ac.gender, dyes: d.dyes || {}, dura: d.dura || {}, tailored: d.tailored || [], jobId: (user.ac && user.ac.jobId) || '', auto: !!d.identity.autoUniform,
    now, hairAt: dateMs(d.salon.hairAt), freshUntil: dateMs(d.salon.freshUntil), mood: moodOf(d, user) };
}
const wearCtx = (d, user, now = Date.now()) => ({ owned: new Set(d.owned || []), tailoredReady: new Set((d.tailored || []).filter((t) => t.collected && dateMs(t.readyAt) <= now).map((t) => 't_' + t.id)), dura: d.dura || {}, jobId: (user.ac && user.ac.jobId) || '' });
const lookOf = (d, user) => Object.assign(S.defaultLook(user.ac && user.ac.gender), d.look || {});
const renderOf = (d, user, now) => S.resolve(d.look, ctxOf(d, user, now));
const equippedIds = (look) => { const ids = []; for (const k of S.SLOTS_EQUIP) if (look[k]) ids.push(look[k]); Object.values(look.jewel || {}).forEach((v) => v && ids.push(v)); Object.values(look.makeup || {}).forEach((m) => m && m.id && ids.push(m.id)); return ids; };

function view(d, user, now = Date.now()) {
  const look = lookOf(d, user), ctx = ctxOf(d, user, now);
  const hs = S.HAIR[look.hair], overgrown = !!(hs && ctx.hairAt && now - ctx.hairAt > hs.g * S.DAY);
  const claimed = d.claimed || [];
  const loyal = (d.salon.visits + 1) % S.LOYALTY_EVERY === 0;
  return {
    now, cash: econ.cashOf(user), gender: (user.ac && user.ac.gender) || '', jobId: ctx.jobId, owned: [...(d.owned || [])], look, render: S.resolve(d.look, ctx),
    dura: d.dura || {}, dyes: d.dyes || {},
    tailored: (d.tailored || []).map((t) => ({ id: t.id, base: t.base, fabric: t.fabric, fit: t.fit, c1: t.c1, c2: t.c2, label: t.label || '', price: t.price, readyAt: dateMs(t.readyAt), collected: !!t.collected, itemId: 't_' + t.id })),
    presets: (d.presets || []).map((p) => ({ id: p.id, name: p.name, look: p.look, render: S.resolve(Object.assign({}, d.look, p.look), ctx) })),
    salon: { hairAt: ctx.hairAt, freshUntil: ctx.freshUntil, fresh: ctx.freshUntil > now, visits: d.salon.visits || 0, loyalNext: loyal, overgrown, touchupCost: S.touchupCost(look.hair), history: (d.salon.history || []).slice(-10).reverse().map((h) => ({ svc: h.svc, name: h.name, cost: h.cost, at: dateMs(h.at) })) },
    motion: { walk: d.motion.walk, idle: d.motion.idle, mood: d.motion.mood, autoMood: d.motion.autoMood !== false, shownMood: ctx.mood },
    identity: { pronouns: d.identity.pronouns || '', custom: d.identity.custom || '', title: d.identity.title || '', autoUniform: !!d.identity.autoUniform, access: accessOf(d), privacy: cleanPrivacy(d.identity.privacy) },
    collection: S.collectionOf(d.owned), claimed, titles: S.titlesOf(claimed), workHours: S.workHours(now)
  };
}
async function send(req, res, extra) {
  const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req));
  res.json(Object.assign({ me: view(d, user) }, extra || {}));
}
const refresh = (req) => { try { const io = req.app.get('io'); if (io) io.of('/ac').to('u:' + uid(req)).emit('style:changed', {}); } catch (e) { /* ignore */ } };

// Pay any collection milestones the player has just reached (once each), and tell them.
async function payMilestones(req, d) {
  const fresh = S.newTiers(d.owned, d.claimed); if (!fresh.length) return [];
  const got = [];
  for (const t of fresh) {
    const r = await ACStyle.updateOne({ user: uid(req), claimed: { $ne: t.key } }, { $addToSet: { claimed: t.key } });
    if (!r.modifiedCount) continue;
    await econ.credit(uid(req), t.reward); got.push(t);
    notify(req.app.get('io'), uid(req), { icon: '🏅', text: `Collection reward: "${t.title}" title and +${naira(t.reward)}`, kind: 'good' }).catch(() => {});
  }
  return got;
}

router.get('/catalog', (req, res) => { res.set('Cache-Control', 'no-cache'); res.json({ catalog: S.catalog() }); });
router.get('/state', async (req, res, next) => {
  try { const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req)); res.set('Cache-Control', 'no-store'); res.json({ catalog: S.catalog(), me: view(d, user) }); } catch (e) { next(e); }
});

/* ---------- equip: body, skin, clothes, accessories, jewellery, makeup (141, 143-153) ---------- */
router.put('/look', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req));
    const { look, errors } = S.cleanLook(req.body, wearCtx(d, user));
    const $set = {};
    for (const [k, v] of Object.entries(look)) $set['look.' + k] = v;
    if (Object.keys($set).length) await ACStyle.updateOne({ user: uid(req) }, { $set });
    refresh(req); await send(req, res, { errors });
  } catch (e) { next(e); }
});

/* ---------- buy (seasonal rules, uniforms, collections) ---------- */
router.post('/buy', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const id = String((req.body && req.body.id) || ''); const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req));
    const chk = S.buyCheck(id, new Set(d.owned), Date.now(), (user.ac && user.ac.jobId) || ''); if (!chk.ok) return bad(res, chk.code, chk.message);
    if (await econ.debit(uid(req), chk.price) == null) return bad(res, 402, 'Not enough ₦.');
    const r = await ACStyle.updateOne({ user: uid(req), owned: { $ne: id } }, { $addToSet: { owned: id }, $unset: { ['dura.' + id]: '' } });
    if (!r.modifiedCount) { await econ.credit(uid(req), chk.price); return bad(res, 409, 'You already own that.'); }
    const d2 = await ACStyle.findOne({ user: uid(req) }); const rewards = await payMilestones(req, d2);
    await send(req, res, { bought: { id, price: chk.price }, rewards: rewards.map((t) => ({ title: t.title, reward: t.reward })) });
  } catch (e) { next(e); }
});

/* ---------- 147 dye ---------- */
router.post('/dye', async (req, res, next) => {
  try {
    const id = String((req.body && req.body.id) || ''); const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req));
    const it = S.ITEMS[id], isT = id.startsWith('t_'); if (isT || !it || !it.dye) return bad(res, 400, 'That cannot be dyed.');
    if (!S.canWear(id, wearCtx(d, user)).ok) return bad(res, 403, `You don't own ${it.name} yet.`);
    if (req.body.reset) { await ACStyle.updateOne({ user: uid(req) }, { $unset: { ['dyes.' + id]: '' } }); refresh(req); return send(req, res); }
    const cur = (d.dyes && d.dyes[id]) || {}, next1 = {};
    const c1 = S.hexOk(req.body.c1) ? req.body.c1.toLowerCase() : cur.c1, c2 = it.dye >= 2 && S.hexOk(req.body.c2) ? req.body.c2.toLowerCase() : cur.c2;
    if (c1) next1.c1 = c1; if (c2) next1.c2 = c2;
    if (!next1.c1 && !next1.c2) return bad(res, 400, 'Pick a colour.');
    if (cur.c1 === next1.c1 && cur.c2 === next1.c2) return bad(res, 400, 'It already has those colours.');
    const price = S.dyeCost(id); if (await econ.debit(uid(req), price) == null) return bad(res, 402, 'Not enough ₦.');
    await ACStyle.updateOne({ user: uid(req) }, { $set: { ['dyes.' + id]: next1 } }); refresh(req); await send(req, res, { paid: price });
  } catch (e) { next(e); }
});

/* ---------- 149 repair ---------- */
router.post('/repair', async (req, res, next) => {
  try {
    const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req)); const want = String((req.body && req.body.id) || '');
    const priceOf = (id) => (id.startsWith('t_') ? ((d.tailored || []).find((t) => 't_' + t.id === id) || {}).price : (S.ITEMS[id] || {}).price) || 0;
    const ids = want === 'all' ? Object.keys(d.dura || {}) : [want];
    let total = 0; const fix = [];
    for (const id of ids) { const cur = d.dura && typeof d.dura[id] === 'number' ? d.dura[id] : S.DURA_MAX; if (cur >= S.DURA_MAX) continue; if (!id.startsWith('t_') && !S.ITEMS[id]) continue; if (!id.startsWith('t_') && !d.owned.includes(id) && !S.isFree(id)) continue; total += S.repairCost(priceOf(id), cur); fix.push(id); }
    if (!fix.length) return bad(res, 400, 'Nothing needs repairing.');
    if (await econ.debit(uid(req), total) == null) return bad(res, 402, `Repairs cost ${naira(total)}.`);
    const $set = {}; fix.forEach((id) => { $set['dura.' + id] = S.DURA_MAX; });
    await ACStyle.updateOne({ user: uid(req) }, { $set }); refresh(req); await send(req, res, { paid: total, fixed: fix.length });
  } catch (e) { next(e); }
});

/* ---------- 146 tailor ---------- */
router.post('/tailor/order', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req)), b = req.body || {}, now = Date.now();
    if (!S.TAILOR.bases[b.base] || !S.TAILOR.fabrics[b.fabric]) return bad(res, 400, 'Pick a style and a fabric.');
    const fit = Object.prototype.hasOwnProperty.call(S.TAILOR.fits, b.fit) ? b.fit : 'regular';
    const lab = S.cleanLabel(b.label); if (!lab.ok) return bad(res, 400, lab.message);
    if ((d.tailored || []).length >= S.TAILOR.maxPieces) return bad(res, 409, `Your tailor can keep ${S.TAILOR.maxPieces} pieces. Remove one first.`);
    if ((d.tailored || []).filter((t) => !t.collected && dateMs(t.readyAt) > now).length >= S.TAILOR.maxPending) return bad(res, 409, `The tailor is busy with ${S.TAILOR.maxPending} of your orders already.`);
    const o = { base: b.base, fabric: b.fabric, label: lab.label, rush: !!b.rush }, price = S.tailorPrice(o, (user.ac && user.ac.jobId) || '');
    if (await econ.debit(uid(req), price) == null) return bad(res, 402, `That order costs ${naira(price)}.`);
    const piece = { id: rid(), base: o.base, fabric: o.fabric, fit, c1: S.cleanHex(b.c1, '#d9b24a'), c2: S.cleanHex(b.c2, '#f4efe6'), label: lab.label, price, readyAt: new Date(now + S.tailorReadyMs(o)), collected: false, at: new Date(now) };
    await ACStyle.updateOne({ user: uid(req) }, { $push: { tailored: piece } }); await send(req, res, { paid: price, piece: piece.id });
  } catch (e) { next(e); }
});
router.post('/tailor/collect', async (req, res, next) => {
  try {
    const id = String((req.body && req.body.id) || ''); const d = await ensureDoc(uid(req)); const t = (d.tailored || []).find((x) => x.id === id);
    if (!t) return bad(res, 404, 'No such order.'); if (t.collected) return bad(res, 409, 'Already collected.');
    if (dateMs(t.readyAt) > Date.now()) return bad(res, 409, 'Not ready yet.');
    await ACStyle.updateOne({ user: uid(req), 'tailored.id': id }, { $set: { 'tailored.$.collected': true } });
    notify(req.app.get('io'), uid(req), { icon: '🧵', text: `Your tailor-made ${S.TAILOR.bases[t.base].name} is ready to wear`, kind: 'good' }).catch(() => {});
    await send(req, res, { collected: 't_' + id });
  } catch (e) { next(e); }
});
router.delete('/tailor/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id); const d = await ensureDoc(uid(req)); if (!(d.tailored || []).some((t) => t.id === id)) return bad(res, 404, 'No such piece.');
    const key = 't_' + id, $set = {}, $unset = { ['dura.' + key]: '', ['dyes.' + key]: '' };
    if (d.look && d.look.outfit === key) $set['look.outfit'] = '';
    for (const p of d.presets || []) if (p.look && p.look.outfit === key) { const i = d.presets.indexOf(p); $set[`presets.${i}.look.outfit`] = ''; }
    await ACStyle.updateOne({ user: uid(req) }, Object.assign({ $pull: { tailored: { id } }, $unset }, Object.keys($set).length ? { $set } : {})); refresh(req); await send(req, res);
  } catch (e) { next(e); }
});

/* ---------- 148 outfit presets ---------- */
const PRESET_KEYS = [...S.SLOTS_EQUIP, 'jewel', 'makeup'];
router.post('/presets', async (req, res, next) => {
  try {
    const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req));
    const name = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 20); if (!name) return bad(res, 400, 'Give the preset a name.');
    if (require('../utils/profanity').isDirty(name)) return bad(res, 400, 'Please pick a different name.');
    const look = lookOf(d, user), snap = {}; PRESET_KEYS.forEach((k) => { snap[k] = look[k]; });
    const existing = (d.presets || []).find((p) => p.id === req.body.id);
    if (existing) await ACStyle.updateOne({ user: uid(req), 'presets.id': existing.id }, { $set: { 'presets.$.name': name, 'presets.$.look': snap } });
    else { if ((d.presets || []).length >= 8) return bad(res, 409, 'You can keep 8 presets. Delete one first.'); await ACStyle.updateOne({ user: uid(req) }, { $push: { presets: { id: rid(), name, look: snap } } }); }
    await send(req, res);
  } catch (e) { next(e); }
});
router.put('/presets/:id/load', async (req, res, next) => {
  try {
    const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req)); const p = (d.presets || []).find((x) => x.id === req.params.id); if (!p) return bad(res, 404, 'No such preset.');
    const input = {}; PRESET_KEYS.forEach((k) => { if (p.look && k in p.look) input[k] = p.look[k]; });
    const { look, errors } = S.cleanLook(input, wearCtx(d, user)); const $set = {}; for (const [k, v] of Object.entries(look)) $set['look.' + k] = v;
    // anything that could not be worn any more (sold-out season, worn out) is simply left off
    for (const k of S.SLOTS_EQUIP) if (input[k] && !(k in look)) $set['look.' + k] = '';
    if (Object.keys($set).length) await ACStyle.updateOne({ user: uid(req) }, { $set }); refresh(req); await send(req, res, { errors });
  } catch (e) { next(e); }
});
router.delete('/presets/:id', async (req, res, next) => { try { await ACStyle.updateOne({ user: uid(req) }, { $pull: { presets: { id: req.params.id } } }); await send(req, res); } catch (e) { next(e); } });

/* ---------- 154 barber & salon ---------- */
router.post('/salon', async (req, res, next) => {
  try {
    if (limited(uid(req))) return bad(res, 429, 'Slow down a little.');
    const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req)), b = req.body || {}, now = Date.now(), look = lookOf(d, user);
    const svc = String(b.svc || ''), loyal = (d.salon.visits + 1) % S.LOYALTY_EVERY === 0, off = (p) => Math.max(0, Math.round(p * (loyal ? 1 - .1 : 1) / 100) * 100);
    const $set = {}; let base = 0, name = '', fresh = S.FRESH_MS, cut = false;
    if (svc === 'style') {
      const h = S.HAIR[b.hair]; if (!h) return bad(res, 400, 'Pick a style.'); name = h.name; base = h.price; $set['look.hair'] = h.id; cut = true;
      if (b.color != null && S.HAIR_HEX.includes(String(b.color).toLowerCase()) && String(b.color).toLowerCase() !== look.hairColor) { base += S.SALON.colour; $set['look.hairColor'] = String(b.color).toLowerCase(); name += ' + colour'; }
    } else if (svc === 'colour') {
      const c = String(b.color || '').toLowerCase(); if (!S.HAIR_HEX.includes(c)) return bad(res, 400, 'Pick a hair colour.'); if (c === look.hairColor) return bad(res, 400, 'Your hair is already that colour.');
      base = S.SALON.colour; name = 'Hair colour'; $set['look.hairColor'] = c;
    } else if (svc === 'beard') {
      const be = S.BEARDS[b.beard]; if (!be) return bad(res, 400, 'Pick a beard style.'); if (look.beard === b.beard) return bad(res, 400, 'You already have that.'); base = be[1]; name = be[0]; $set['look.beard'] = b.beard;
    } else if (svc === 'touchup') {
      const hs = S.HAIR[look.hair], hairAt = dateMs(d.salon.hairAt); if (!hs || !(hairAt && now - hairAt > hs.g * S.DAY)) return bad(res, 400, 'Your hair is still fresh.');
      base = S.touchupCost(look.hair); name = 'Touch-up'; cut = true;
    } else if (svc === 'wash') { base = S.SALON.wash; name = 'Wash & tidy'; fresh = S.DAY; }
    else if (svc === 'spa') { base = S.SALON.spa; name = 'Facial glow'; }
    else return bad(res, 400, 'Unknown service.');
    const cost = off(base);
    if (cost > 0 && await econ.debit(uid(req), cost) == null) return bad(res, 402, `That visit costs ${naira(cost)}.`);
    $set['salon.freshUntil'] = new Date(now + fresh); if (cut) $set['salon.hairAt'] = new Date(now);
    await ACStyle.updateOne({ user: uid(req) }, { $set, $inc: { 'salon.visits': 1 }, $push: { 'salon.history': { $each: [{ svc, name, cost, at: new Date(now) }], $slice: -20 } } });
    refresh(req); await send(req, res, { paid: cost, loyalty: loyal, chair: S.CHAIR_SECONDS });
  } catch (e) { next(e); }
});

/* ---------- 156/157/158 motion + mood ---------- */
router.put('/motion', async (req, res, next) => {
  try {
    const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req)), b = req.body || {}, owned = new Set(d.owned), $set = {}, errors = [];
    const okItem = (id, slot) => S.ITEMS[id] && S.ITEMS[id].slot === slot && (S.isFree(id) || owned.has(id));
    if ('walk' in b) { if (okItem(b.walk, 'walk')) $set['motion.walk'] = b.walk; else errors.push('You have not unlocked that walk.'); }
    if ('idle' in b) { if (okItem(b.idle, 'idle')) $set['motion.idle'] = b.idle; else errors.push('You have not unlocked that idle animation.'); }
    if ('mood' in b) { if (S.MOODS[b.mood]) $set['motion.mood'] = b.mood; else errors.push('Unknown mood.'); }
    if ('autoMood' in b) $set['motion.autoMood'] = !!b.autoMood;
    if (Object.keys($set).length) await ACStyle.updateOne({ user: uid(req) }, { $set }); refresh(req); await send(req, res, { errors });
  } catch (e) { next(e); }
});

/* ---------- 159 pronouns + accessibility, 160 privacy ---------- */
router.put('/identity', async (req, res, next) => {
  try {
    await ensureAC(uid(req)); await ensureDoc(uid(req)); const b = req.body || {}, $set = {}, errors = [];
    if ('pronouns' in b) { if (Object.prototype.hasOwnProperty.call(S.PRONOUNS, b.pronouns)) $set['identity.pronouns'] = b.pronouns; else errors.push('Unknown pronouns option.'); }
    if ('custom' in b) { const c = S.cleanCustomPronouns(b.custom); if (c.ok) $set['identity.custom'] = c.value; else errors.push(c.message); }
    if ('autoUniform' in b) $set['identity.autoUniform'] = !!b.autoUniform;
    if (b.access && typeof b.access === 'object') for (const k of S.ACCESS_KEYS) if (k in b.access) $set['identity.access.' + k] = !!b.access[k];
    if (b.privacy && typeof b.privacy === 'object') {
      for (const k of ['look', 'pronouns', 'mood', 'collection', 'poses']) if (k in b.privacy) { if (S.VIS.includes(b.privacy[k])) $set['identity.privacy.' + k] = b.privacy[k]; else errors.push('Unknown visibility.'); }
      for (const k of ['roster', 'hideModel']) if (k in b.privacy) $set['identity.privacy.' + k] = !!b.privacy[k];
    }
    if ('title' in b) { const d0 = await ACStyle.findOne({ user: uid(req) }); const earned = S.titlesOf(d0.claimed); if (!b.title || earned.includes(b.title)) $set['identity.title'] = b.title || ''; else errors.push('You have not earned that title.'); }
    if (Object.keys($set).length) await ACStyle.updateOne({ user: uid(req) }, { $set }); refresh(req); await send(req, res, { errors });
  } catch (e) { next(e); }
});
// Wipes what you told us about your identity (pronouns, title). Privacy and accessibility choices stay.
router.post('/identity/clear', async (req, res, next) => {
  try { await ensureAC(uid(req)); await ensureDoc(uid(req)); await ACStyle.updateOne({ user: uid(req) }, { $set: { 'identity.pronouns': '', 'identity.custom': '', 'identity.title': '' } }); refresh(req); await send(req, res); } catch (e) { next(e); }
});

/* ---------- 149 wear tick: the app calls this every ~5 minutes while you play ---------- */
router.post('/wear', async (req, res, next) => {
  try {
    const user = await ensureAC(uid(req)); const d = await ensureDoc(uid(req)), now = Date.now(), last = dateMs(d.lastWear);
    if (last && now - last < S.WEAR_MIN_GAP_MS) return res.json({ credited: 0 });
    const day = S.lagosParts ? new Date(now + 3600000).toISOString().slice(0, 10) : '', used = d.wearDay === day ? d.wearMs || 0 : 0;
    const credit = Math.max(0, Math.min(last ? now - last : S.WEAR_CREDIT_MS, S.WEAR_CREDIT_MS, S.WEAR_DAY_CAP_MS - used));
    const $set = { lastWear: new Date(now), wearDay: day, wearMs: used + credit }, broke = [];
    const look = lookOf(d, user), tl = new Map((d.tailored || []).map((t) => ['t_' + t.id, t]));
    for (const id of S.wornIds(look, ctxOf(d, user, now))) {
      const item = id.startsWith('t_') ? { wear: tl.has(id) ? S.TAILOR.fabrics[tl.get(id).fabric].wear : 1, name: 'tailor-made piece' } : S.ITEMS[id]; if (!item) continue;
      const cur = d.dura && typeof d.dura[id] === 'number' ? d.dura[id] : S.DURA_MAX, nxt = Math.max(0, +(cur - S.wearPoints(item, credit)).toFixed(2));
      if (nxt !== cur) $set['dura.' + id] = nxt;
      if (nxt <= 0 && cur > 0) { broke.push(item.name || id); const slot = S.slotOf(id), def = S.defaultLook(user.ac && user.ac.gender); if (look[slot] === id) $set['look.' + slot] = slot === 'outfit' ? '' : def[slot] || ''; }
    }
    await ACStyle.updateOne({ user: uid(req) }, { $set });
    if (broke.length) { notify(req.app.get('io'), uid(req), { icon: '🧵', text: `${broke.join(', ')} wore out. Repair it in Style to wear it again.`, kind: 'warn' }).catch(() => {}); refresh(req); }
    await send(req, res, { credited: credit, broke });
  } catch (e) { next(e); }
});

/* ---------- 160 what other people may see ---------- */
const relation = (viewer, target) => (String(viewer.id) === String(target._id) ? 'self' : (target.friends || []).includes(String(viewer.id)) ? 'friend' : 'stranger');
async function publicView(viewer, target) {
  const rel = relation(viewer, target); if ((target.blocked || []).includes(String(viewer.id))) return null;
  await ensureAC(String(target._id)); const t = await User.findById(target._id); const d = await ensureDoc(String(target._id)), pv = cleanPrivacy(d.identity.privacy), out = { id: String(t._id), relation: rel };
  if (S.canSee(pv.look, rel)) { out.render = renderOf(d, t); if (pv.hideModel && rel !== 'self') out.render.g = ''; }
  if (S.canSee(pv.pronouns, rel)) out.pronouns = S.pronounText(d.identity.pronouns, d.identity.custom);
  if (S.canSee(pv.mood, rel)) out.mood = moodOf(d, t);
  if (S.canSee(pv.collection, rel)) { const c = S.collectionOf(d.owned); out.collection = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { name: v.name, owned: v.owned, total: v.total }])); out.title = d.identity.title && S.titlesOf(d.claimed).includes(d.identity.title) ? d.identity.title : ''; }
  return out;
}
router.get('/of/:id', async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return bad(res, 400, 'Bad id.');
    const t = await User.findById(req.params.id).select('friends blocked'); if (!t) return bad(res, 404, 'No such player.');
    const v = await publicView(req.user, t); if (!v) return bad(res, 404, 'No such player.'); res.json(v);
  } catch (e) { next(e); }
});

module.exports = router;
// Used by the live roster (sockets/allconnect.js): the look strangers on the map get to see, or null when the player keeps it private.
const strip = (v) => {          // drop empty / default fields so the live roster stays small
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { if (x == null || x === '' || x === false || (k === 'pat' && x === 'solid') || (typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length)) continue; o[k] = strip(x); } return o; }
  return v;
};
module.exports.rosterEntry = async function rosterEntry(userId) {
  const user = await User.findById(userId).select('ac displayName'); if (!user) return null;
  const d = await ACStyle.findOne({ user: String(userId) }); if (!d) return { g: user.ac && user.ac.gender || '', l: null };
  const pv = cleanPrivacy(d.identity && d.identity.privacy), showLook = pv.roster && S.canSee(pv.look, 'stranger');
  return { g: pv.hideModel ? '' : (user.ac && user.ac.gender) || '', l: showLook ? strip(S.resolve(d.look, ctxOf(d, user))) : null };
};
// "New life": everything you bought goes, the way you look (body, skin, hair) and who you are (pronouns, privacy, accessibility) stays.
module.exports.resetWardrobe = async function resetWardrobe(userId) {
  const d = await ACStyle.findOne({ user: userId }); if (!d) return;
  const keep = {}; for (const k of ['body', 'skin', 'hair', 'hairColor', 'beard']) if (d.look && d.look[k] != null) keep[k] = d.look[k];
  await ACStyle.updateOne({ user: userId }, { $set: { owned: [], look: keep, dyes: {}, dura: {}, tailored: [], presets: [], claimed: [], 'motion.walk': 'walk_normal', 'motion.idle': 'idle_breathe', 'identity.title': '', 'identity.autoUniform': false } });
};
module.exports.view = view; module.exports.ctxOf = ctxOf;
