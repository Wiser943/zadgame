// Additional homes reuse the existing AllConnect account, shared wallet and furniture placement rules.
const express = require('express');
const { randomUUID } = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const F = require('../utils/furniture');
const { publicAC } = require('../utils/allconnect');
const { ensureAC } = require('./allconnect');
const { HOMES, isHome, publicHome, gridOf, extraOf, baseBedrooms, maxExtra, expansionCost, totalOf, assetValue } = require('../utils/acproperties');
const A = require('../utils/acproperties');
const router = express.Router();
router.use(ensureAuth);
const bad = (res, message, status = 400) => res.status(status).json({ message });
const activePropertyFilter = (id) => ({ 'ac.properties': { $elemMatch: { id, $or: [{ tenure: 'owned' }, { tenure: 'rent', leaseExpiresAt: { $gt: new Date() } }] } } });

// Raw (driver-level) atomic update. Mongoose casts every filter and then re-hydrates the returned document, and one odd
// legacy value anywhere inside ac.properties made that step throw a CastError, which the server reported as
// "That item or player could not be found". These two writes only use values built right here, so they go straight to
// MongoDB: nothing is cast, and the returned document is plain data.
const rawUpdate = async (uid, filter, update) => {
  if (!mongoose.Types.ObjectId.isValid(String(uid))) return null;
  const r = await User.collection.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(String(uid)), ...filter }, update, { returnDocument: 'after' });
  return r && Object.prototype.hasOwnProperty.call(r, 'ok') && Object.prototype.hasOwnProperty.call(r, 'value') ? r.value : r;
};
const getOwned = async (req) => {
  const u = await ensureAC(req.user.id);
  const p = (u.ac.properties || []).find(x => x.id === String(req.params.id));
  if (!p) return { u, p: null };
  if (p.tenure === 'rent' && p.leaseExpiresAt && new Date(p.leaseExpiresAt) <= new Date()) return { u, p: null, expired: true };
  return { u, p };
};
router.get('/', async (req, res, next) => {
  try { const u = await ensureAC(req.user.id); res.json({ catalogue: Object.entries(HOMES).map(([id, h]) => ({ id, ...h, baseBedrooms: baseBedrooms(id), maxBedrooms: baseBedrooms(id) + maxExtra(id) })), properties: (u.ac.properties || []).map(publicHome), builds: builds(u), now: Date.now(), cash: u.ac.cash, homesApi: 2 }); } catch (e) { next(e); }
});
/* Remembers which home the player entered last. It only accepts a home they own (or rent with time left); '' is the Starter Room. */
router.post('/active', async (req, res, next) => {
  try {
    const id = String(req.body?.id || '').slice(0, 80);
    const u = await rawUpdate(req.user.id, id ? activePropertyFilter(id) : {}, { $set: { 'ac.activeProperty': id } });
    if (!u) return bad(res, 'You do not have access to that home.', 409);
    res.json({ activeProperty: id });
  } catch (err) { next(err); }
});
/* Buying / renting a home. The shared core: one conditional update debits the cash and creates the property together, while blocking
   duplicate active leases / permanent ownership. Returns { ok, u, property } or { ok: false, code, msg }. */
async function acquireHome(userId, type) {
  const home = HOMES[type], price = home.mode === 'rent' ? home.rent : home.price;
  if (!Number.isSafeInteger(price) || price < 1) return { ok: false, code: 503, msg: 'Home price is not available.' };
  const now = new Date();
  const property = {
    id: F.newId(), type, tenure: home.mode === 'rent' ? 'rent' : 'owned', boughtAt: now,
    leaseExpiresAt: home.mode === 'rent' ? new Date(now.getTime() + home.rentDays * 86400000) : null,
    paint: home.paint, level: 0, bedrooms: 0, insured: false, condition: 100, lastWeatherEvent: '',
    items: A.furnishedItems(type)           // luxury homes arrive fully furnished
  };
  const filter = { 'ac.cash': { $gte: price }, $nor: [{ 'ac.properties': { $elemMatch: { type, $or: [{ tenure: 'owned' }, { tenure: 'rent', leaseExpiresAt: { $gt: now } }] } } }] };
  // No runValidators on a $push: Mongoose would validate the WHOLE ac.properties array, so one stray legacy record would block every purchase.
  const u = await rawUpdate(userId, filter, { $inc: { 'ac.cash': -price }, $push: { 'ac.properties': property } });
  if (u) return { ok: true, u, property };
  const cur = await User.findById(userId).select('ac.cash ac.properties');
  if (!cur) return { ok: false, code: 401, msg: 'Account not found. Please sign in again.' };
  if ((cur.ac?.properties || []).some(p => p.type === type && (p.tenure === 'owned' || (p.tenure === 'rent' && p.leaseExpiresAt && new Date(p.leaseExpiresAt) > now)))) return { ok: false, code: 409, msg: 'You already have this home.' };
  if ((cur.ac?.cash || 0) < price) return { ok: false, code: 402, msg: 'Not enough naira.' };
  return { ok: false, code: 409, msg: 'Could not complete the home purchase. Please refresh and try again.' };
}
const MAX_BUILDS = 3;
const builds = (u, now = Date.now()) => (u.ac.builds || []).map((b) => A.publicBuild(b, now));
router.post('/acquire', async (req, res, next) => {
  try {
    const type = String(req.body?.type || '');
    if (!isHome(type)) return bad(res, 'Unknown home type.');
    const home = HOMES[type];
    if (home.mode === 'rent') {                                  // renting: you move in right away
      const r = await acquireHome(req.user.id, type); if (!r.ok) return bad(res, r.msg, r.code);
      return res.json({ ac: publicAC(r.u.ac), property: publicHome(r.property) });
    }
    // buying: the builders get to work first. You pay when they say the home is finished.
    const u = await ensureAC(req.user.id), mine = u.ac.properties || [], q = u.ac.builds || [];
    if (mine.some((p) => p.type === type && p.tenure === 'owned')) return bad(res, 'You already have this home.', 409);
    if (q.some((b) => b.kind === 'home' && b.homeType === type)) return bad(res, 'The builders are already working on this home.', 409);
    if (q.length >= MAX_BUILDS) return bad(res, 'The builders can only handle ' + MAX_BUILDS + ' projects at a time. Finish or cancel one first.', 409);
    const mins = Math.max(1, Math.round(A.homeBuildMinutes(type) * (u.ac.jobId === 'builder' ? 0.75 : 1))), now = Date.now();
    const job = { id: F.newId(), kind: 'home', homeType: type, name: home.name, cost: home.price, startedAt: new Date(now), readyAt: new Date(now + mins * 60000), notified: false };
    await User.updateOne({ _id: req.user.id }, { $push: { 'ac.builds': job } });
    res.json({ building: true, minutes: mins, build: A.publicBuild(job), builds: builds(await User.findById(req.user.id)) });
  } catch (e) {
    const ref = randomUUID().slice(0, 12);
    console.error('[home-acquire]', ref, { user: String(req.user?.id || ''), type: String(req.body?.type || ''), name: e?.name, code: e?.code, message: e?.message });
    return res.status(500).json({ message: 'This home action hit an unexpected server problem (code ' + ref + '). Please try again.', reference: ref });
  }
});
// Add bedrooms to a home you own. Body: { bedrooms: <the TOTAL number of bedrooms you want> }, e.g. 3 for a 3-bedroom.
// One conditional update takes the cash and records the new size together, so a double tap or two devices can never
// charge twice. Every failure answers with a short, specific message the app can show as it is.
// Renovations. Ordering one starts a build (no charge yet). When the builders finish you pay and the work is applied in ONE atomic update.
async function applyReno(userId, propertyId, want) {
  const u0 = await User.findById(userId); const p0 = u0 && (u0.ac.properties || []).find((p) => p.id === propertyId);
  if (!p0) return { ok: false, code: 404, msg: 'Home not found.' };
  const opt = A.renovationOptions(p0).find((o) => o.id === want);
  if (!opt) return { ok: false, code: 409, msg: 'That renovation is not available for this home (it may already be done).' };
  const [kind, arg] = want.split(':'), cond = { id: String(propertyId), tenure: 'owned' }, set = {}, push = {};
  if (kind === 'bath') { cond.bath = { $ne: true }; set['ac.properties.$.bath'] = true; }
  else if (kind === 'garage') { cond.garage = { $ne: true }; set['ac.properties.$.garage'] = true; }
  else if (kind === 'gstyle') { set['ac.properties.$.groundStyle'] = arg; }
  else if (kind === 'finish') { cond.finish = { $ne: 'luxury' }; set['ac.properties.$.finish'] = 'luxury'; }
  else if (kind === 'upstyle') { cond.upstairs = true; set['ac.properties.$.upStyle'] = arg; }
  else if (kind === 'upstairs') {
    // the staircase needs a free 2x3 space on the ground floor; it is built together with the floor
    const spot = F.autoPlace((p0.items || []).filter((i) => !(Number(i.floor) > 0)), A.STAIRS, gridOf(p0, 0));
    if (!spot) return { ok: false, code: 409, msg: 'There is no free 2 by 3 space downstairs for the staircase. Move some furniture, then pay again.' };
    cond.upstairs = { $ne: true }; set['ac.properties.$.upstairs'] = true; set['ac.properties.$.upStyle'] = arg;
    push['ac.properties.$.items'] = { id: F.newId(), name: A.STAIRS, x: spot.x, z: spot.z, rot: spot.rot || 0, floor: 0, placed: true };
  }
  const update = { $inc: { 'ac.cash': -opt.cost }, $set: set }; if (Object.keys(push).length) update.$push = push;
  const u = await rawUpdate(userId, { 'ac.cash': { $gte: opt.cost }, 'ac.properties': { $elemMatch: cond } }, update);
  if (!u) return { ok: false, code: 402, msg: 'Not enough naira, or the home was already renovated.' };
  if (kind === 'upstyle' || kind === 'gstyle' || kind === 'garage' || kind === 'bath') await unplaceMisfits(userId, propertyId).catch(() => {});
  const fresh = await User.findById(userId), prop = (fresh.ac.properties || []).find((p) => p.id === String(propertyId));
  return { ok: true, fresh, property: prop, cost: opt.cost, name: opt.name };
}
router.post('/:id/renovate', async (req, res) => {
  try {
    const c = await getOwned(req); if (!c.p) return bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404);
    const want = String(req.body && req.body.id || 'bath'), opt = A.renovationOptions(c.p).find((o) => o.id === want);
    if (!opt) return bad(res, 'That renovation is not available for this home (it may already be done).', 409);
    const u = await ensureAC(req.user.id), q = u.ac.builds || [];
    if (q.some((b) => b.kind === 'reno' && b.propertyId === String(req.params.id) && b.optId.split(':')[0] === want.split(':')[0])) return bad(res, 'The builders are already on that job.', 409);
    if (q.length >= MAX_BUILDS) return bad(res, 'The builders can only handle ' + MAX_BUILDS + ' projects at a time. Finish or cancel one first.', 409);
    const mins = Math.max(1, Math.round(A.renoBuildMinutes(c.p, want) * (u.ac.jobId === 'builder' ? 0.75 : 1))), now = Date.now();
    const job = { id: F.newId(), kind: 'reno', propertyId: String(req.params.id), optId: want, name: opt.name + ' · ' + (A.HOMES[c.p.type] ? A.HOMES[c.p.type].name : 'Home'), cost: opt.cost, startedAt: new Date(now), readyAt: new Date(now + mins * 60000), notified: false };
    await User.updateOne({ _id: req.user.id }, { $push: { 'ac.builds': job } });
    res.json({ building: true, minutes: mins, build: A.publicBuild(job), builds: builds(await User.findById(req.user.id)) });
  } catch (e) { console.error('[home-renovate]', e.message); return res.status(500).json({ message: 'Could not start the renovation. Nothing was charged.' }); }
});
// Furnish pack: buy a ready-made set for a room or floor. The server places the items; the charge and the items go in ONE atomic update.
router.post('/:id/pack', async (req, res) => {
  try {
    const c = await getOwned(req); if (!c.p) return bad(res, 'Home not found.', 404);
    const packId = String(req.body && req.body.pack || ''), plan = A.packPlan(c.p, packId, req.body && req.body.floor);
    if (!plan) return bad(res, 'That pack is not available for this home.', 409);
    if (!plan.items.length) return bad(res, 'Nothing from this pack fits in your home right now.', 409);
    const u = await rawUpdate(req.user.id, { 'ac.cash': { $gte: plan.cost }, 'ac.properties': { $elemMatch: { id: String(req.params.id), tenure: 'owned' } } }, { $inc: { 'ac.cash': -plan.cost }, $push: { 'ac.properties.$.items': { $each: plan.items } } });
    if (!u) return bad(res, 'Not enough naira.', 402);
    const prop = (u.ac.properties || []).find((p) => p.id === String(req.params.id));
    res.json({ ac: publicAC(u.ac), property: publicHome(prop), placed: plan.items.length, skipped: plan.skipped, cost: plan.cost });
  } catch (e) { console.error('[home-pack]', e.message); return res.status(500).json({ message: 'Could not furnish. You were not charged.' }); }
});
// ---- construction orders ----
router.get('/builds/list', async (req, res, next) => { try { const u = await ensureAC(req.user.id); res.json({ builds: builds(u), now: Date.now() }); } catch (e) { next(e); } });
router.post('/builds/:buildId/pay', async (req, res) => {
  try {
    const u = await ensureAC(req.user.id), b = (u.ac.builds || []).find((x) => x.id === String(req.params.buildId));
    if (!b) return bad(res, 'That project is gone.', 404);
    if (Date.now() < new Date(b.readyAt).getTime()) return bad(res, 'The builders are not finished yet.', 409);
    // claim the order first so two taps can never build and charge twice
    const claimed = await User.updateOne({ _id: req.user.id, 'ac.builds.id': b.id }, { $pull: { 'ac.builds': { id: b.id } } });
    if (!(claimed.modifiedCount || claimed.nModified)) return bad(res, 'That project was already paid.', 409);
    let r;
    if (b.kind === 'home') { r = await acquireHome(req.user.id, b.homeType); if (r.ok) { const fresh = await User.findById(req.user.id); return res.json({ ac: publicAC(fresh.ac), property: publicHome(r.property), builds: builds(fresh), name: b.name }); } }
    else { r = await applyReno(req.user.id, b.propertyId, b.optId); if (r.ok) return res.json({ ac: publicAC(r.fresh.ac), property: publicHome(r.property), builds: builds(r.fresh), cost: r.cost, name: b.name }); }
    await User.updateOne({ _id: req.user.id }, { $push: { 'ac.builds': b.toObject ? b.toObject() : b } });      // could not pay: the finished project stays waiting
    return bad(res, r.msg, r.code);
  } catch (e) { console.error('[build-pay]', e.message); return res.status(500).json({ message: 'Could not complete the payment. You were not charged.' }); }
});
router.post('/builds/:buildId/cancel', async (req, res, next) => {
  try { await User.updateOne({ _id: req.user.id }, { $pull: { 'ac.builds': { id: String(req.params.buildId) } } }); res.json({ builds: builds(await User.findById(req.user.id)) }); } catch (e) { next(e); }
});
// background: tell players when the builders are done (called every minute from server.js)
router.notifyReady = async function (io) {
  const now = new Date(), due = await User.find({ 'ac.builds': { $elemMatch: { readyAt: { $lte: now }, notified: { $ne: true } } } }).select('ac.builds').limit(200);
  for (const u of due) for (const b of (u.ac.builds || [])) {
    if (b.notified || new Date(b.readyAt) > now) continue;
    const r = await User.updateOne({ _id: u._id, 'ac.builds': { $elemMatch: { id: b.id, notified: { $ne: true } } } }, { $set: { 'ac.builds.$.notified': true } });
    if (r.modifiedCount || r.nModified) require('../utils/acnotify').notify(io, String(u._id), { icon: '👷', text: `The builders have finished building your ${b.name} and are awaiting payment (₦${Number(b.cost).toLocaleString('en-NG')}). Open Homes to pay and move in.`, kind: 'good' }).catch(() => {});
  }
};
router.post('/:id/expand', async (req, res) => {
  const ref = randomUUID().slice(0, 12);
  try {
    const c = await getOwned(req); if (!c.p) return bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404);
    if (c.p.tenure !== 'owned') return bad(res, 'Only homes you own can get more bedrooms.', 409);
    const type = c.p.type, cur = extraOf(c.p), base = baseBedrooms(type), top = maxExtra(type);
    if (!top) return bad(res, 'This home has a fixed floor plan, so it cannot get more bedrooms.', 409);
    if (cur >= top) return bad(res, `This home already has the most bedrooms it can hold (${base + top}).`, 409);
    const want = req.body && req.body.bedrooms !== undefined ? Number(req.body.bedrooms) : base + cur + 1;
    if (!Number.isInteger(want) || want <= base + cur) return bad(res, 'Choose a bigger size than your home has now.');
    if (want > base + top) return bad(res, `The most bedrooms this home can have is ${base + top}.`);
    const target = want - base, cost = expansionCost(type, cur, target);
    if (!Number.isSafeInteger(cost) || cost < 1) return bad(res, 'That expansion is not available for this home.', 409);
    const sameSize = cur === 0 ? [{ bedrooms: 0 }, { bedrooms: null }, { bedrooms: { $exists: false } }] : [{ bedrooms: cur }];
    const u = await rawUpdate(req.user.id,
      { 'ac.cash': { $gte: cost }, 'ac.properties': { $elemMatch: { id: String(req.params.id), tenure: 'owned', $or: sameSize } } },
      { $inc: { 'ac.cash': -cost }, $set: { 'ac.properties.$.bedrooms': target } });
    if (!u) {
      const now = await User.findById(req.user.id).select('ac.cash ac.properties');
      const p2 = now && (now.ac?.properties || []).find(x => x.id === String(req.params.id));
      if (!p2) return bad(res, 'Home not found.', 404);
      if (extraOf(p2) !== cur) return bad(res, 'This home was already expanded. Refresh to see its new size.', 409);
      if ((now.ac?.cash || 0) < cost) return bad(res, 'You do not have enough money for this expansion.', 402);
      return bad(res, 'Could not complete the expansion. Please refresh and try again.', 409);
    }
    const prop = (u.ac.properties || []).find(p => p.id === String(req.params.id));
    res.json({ ac: publicAC(u.ac), property: publicHome(prop), cost, total: totalOf(prop) });
  } catch (e) {
    console.error('[home-expand]', ref, { user: String(req.user?.id || ''), home: String(req.params?.id || ''), name: e?.name, code: e?.code, message: e?.message });
    return res.status(500).json({ message: 'The expansion hit a server problem and you were not charged. Please try again.', reference: ref });
  }
});
// Optional weekly home cover. It protects against simulated severe-weather damage.
router.post('/:id/insurance', async (req, res, next) => {
  try {
    const c = await getOwned(req); if (!c.p) return bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404);
    if (c.p.insured) return res.json({ message: 'This property is already insured.', property: publicHome(c.p) });
    const premium = Math.max(5000, Math.round(((assetValue(c.p.type) || 250000) * 0.025) / 100) * 100);
    const u = await User.findOneAndUpdate({ _id: req.user.id, 'ac.cash': { $gte: premium }, 'ac.properties': { $elemMatch: { id: req.params.id, insured: { $ne: true } } } }, { $inc: { 'ac.cash': -premium }, $set: { 'ac.properties.$[p].insured': true } }, { new: true, arrayFilters: [{ 'p.id': req.params.id }] });
    if (!u) return bad(res, 'Not enough money for the insurance premium, or the property status changed.', 409);
    res.json({ message: 'Property insurance activated for the current weather cycle.', premium, property: publicHome((u.ac.properties || []).find(p => p.id === req.params.id)), cash: u.ac.cash });
  } catch (e) { next(e); }
});

router.get('/:id/furniture', async (req, res, next) => { try { const c = await getOwned(req); if (!c.p) return bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404); res.json({ property: publicHome(c.p), ac: publicAC(c.u.ac) }); } catch (e) { next(e); } });
router.post('/:id/furniture/buy', async (req, res, next) => {
  try {
    const name = String(req.body?.name || ''); if (!F.isItem(name)) return bad(res, 'Unknown furniture item.');
    const c = await getOwned(req); if (!c.p) return bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404);
    const it = F.ITEMS[name], all = c.p.items || []; if (all.length >= 120) return bad(res, 'This home is full of furniture.');
    if (it.hidden) return bad(res, 'That is not sold in the shop.');
    const floor = Number(req.body?.floor) === 2 ? 2 : Number(req.body?.floor) === 1 ? 1 : 0; if (floor === 1 && !c.p.upstairs) return bad(res, 'This home has no upstairs floor yet.');
    const items = F.onFloor(all, floor), grid = gridOf(c.p, floor);
    if (it.hang ? !F.canHang(items, name, Number(req.body?.x), Number(req.body?.z), undefined, grid) : it.fixed ? all.some(i => i.name === name) : !F.canPlace(items, name, Number(req.body?.x), Number(req.body?.z), Number(req.body?.rot) || 0, undefined, grid)) return bad(res, it.hang ? 'Pick a free spot inside the room to hang it.' : it.fixed ? 'You already have that.' : 'That spot is taken or outside the room.');
    const inst = { id: F.newId(), name, x: Number(req.body?.x) || 0, z: Number(req.body?.z) || 0, rot: Number(req.body?.rot) || 0, floor, placed: true };
    const path = 'ac.properties.$[p].items';
    const u = await User.findOneAndUpdate({ _id: req.user.id, 'ac.cash': { $gte: it.price }, ...activePropertyFilter(req.params.id) }, { $inc: { 'ac.cash': -it.price }, $push: { [path]: inst } }, { new: true, arrayFilters: [{ 'p.id': req.params.id }] });
    if (!u) return bad(res, 'Not enough ₦ or home no longer available.', 409);
    res.json({ ac: publicAC(u.ac), property: publicHome((u.ac.properties || []).find(p => p.id === req.params.id)), item: inst });
  } catch (e) { next(e); }
});
async function itemContext(req, res) { const c = await getOwned(req); if (!c.p) { bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404); return null; } const it = (c.p.items || []).find(i => i.id === req.params.itemId); if (!it) { bad(res, 'Item not found.', 404); return null; } return { ...c, it, items: c.p.items }; }
async function updateItem(req, res, fields) { const set = Object.fromEntries(Object.entries(fields).map(([k,v]) => [`ac.properties.$[p].items.$[i].${k}`, v])); const u = await User.findOneAndUpdate({ _id: req.user.id, 'ac.properties.items.id': req.params.itemId, ...activePropertyFilter(req.params.id) }, { $set: set }, { new: true, arrayFilters: [{ 'p.id': req.params.id }, { 'i.id': req.params.itemId }] }); if (!u) return bad(res, 'Item not found.', 404); res.json({ ac: publicAC(u.ac), property: publicHome((u.ac.properties || []).find(p => p.id === req.params.id)) }); }
async function place(req, res, storedOnly) {
  const c = await itemContext(req, res); if (!c) return; const def = F.ITEMS[c.it.name];
  if (!def || (def.fixed && !def.hang)) return bad(res, 'That item cannot be moved.');
  if (storedOnly && c.it.placed !== false) return bad(res, 'Already in your room.');
  // a stored item can be put on either floor; a placed one stays on its own floor
  // an item can be moved to ANY floor (house, upstairs or the yard); the staircase always stays on the ground floor
  const floor = def.stairs ? 0 : (req.body?.floor != null ? (Number(req.body.floor) === 2 ? 2 : Number(req.body.floor) === 1 ? 1 : 0) : (Number(c.it.floor) || 0));
  if (floor === 1 && !c.p.upstairs) return bad(res, 'This home has no upstairs floor yet.');
  if (def.stairs && floor !== 0) return bad(res, 'The staircase stays downstairs.');
  const items = F.onFloor(c.items, floor), grid = gridOf(c.p, floor), x = Number(req.body?.x), z = Number(req.body?.z), rot = Number(req.body?.rot) || 0;
  if (!(def.hang ? F.canHang(items, c.it.name, x, z, c.it.id, grid) : F.canPlace(items, c.it.name, x, z, rot, c.it.id, grid))) return bad(res, 'That spot is taken or outside the room.');
  const r = await updateItem(req, res, { x, z, rot, floor, placed: true });
  if (def.stairs) await unplaceMisfits(req.user.id, req.params.id).catch(() => {});      // the opening upstairs moved with the staircase
  return r;
}
// After a layout change (upstairs style, downstairs style, garage, staircase moved): anything that no longer fits goes into storage (placed: false).
// The staircase can't be stored, so it is moved to the nearest free spot instead.
async function unplaceMisfits(userId, propertyId) {
  const u = await User.findById(userId).select('ac.properties'), p = u && (u.ac.properties || []).find((x) => x.id === propertyId); if (!p) return;
  const bad_ = [], moved = [];
  for (const floor of (p.upstairs ? [0, 1, 2] : [0, 2])) {
    const grid = gridOf(p, floor), all = F.onFloor(p.items || [], floor).filter((it) => it.placed !== false), kept = [];
    const order = [...all.filter((i) => i.name === A.STAIRS), ...all.filter((i) => i.name !== A.STAIRS)];
    for (const it of order) {
      const ok = F.isHang(it.name) ? F.canHang(kept, it.name, it.x, it.z, it.id, grid) : F.canPlace(kept, it.name, it.x, it.z, it.rot, it.id, grid);
      if (ok) { kept.push(it); continue; }
      if (it.name === A.STAIRS) { const spot = F.autoPlace(kept, A.STAIRS, grid); if (spot) { moved.push({ id: it.id, x: spot.x, z: spot.z, rot: spot.rot || 0 }); kept.push({ ...(it.toObject ? it.toObject() : it), x: spot.x, z: spot.z, rot: spot.rot || 0 }); continue; } }
      bad_.push(it.id);
    }
  }
  if (bad_.length) await User.updateOne({ _id: userId }, { $set: { 'ac.properties.$[p].items.$[i].placed': false } }, { arrayFilters: [{ 'p.id': propertyId }, { 'i.id': { $in: bad_ } }] });
  for (const m of moved) await User.updateOne({ _id: userId }, { $set: { 'ac.properties.$[p].items.$[i].x': m.x, 'ac.properties.$[p].items.$[i].z': m.z, 'ac.properties.$[p].items.$[i].rot': m.rot } }, { arrayFilters: [{ 'p.id': propertyId }, { 'i.id': m.id }] });
}
router.post('/:id/furniture/:itemId/move', async (req,res,next)=>{ try { return await place(req,res,false); } catch(e){next(e);} });
router.post('/:id/furniture/:itemId/place', async (req,res,next)=>{ try { return await place(req,res,true); } catch(e){next(e);} });
router.post('/:id/furniture/:itemId/store', async (req,res,next)=>{ try { const c=await itemContext(req,res); if(!c)return; if(F.ITEMS[c.it.name]?.locked)return bad(res,'You need that one in the room.'); return await updateItem(req,res,{placed:false}); } catch(e){next(e);} });
router.post('/:id/furniture/:itemId/sell', async (req,res,next)=>{ try { const c=await itemContext(req,res); if(!c)return; if(F.ITEMS[c.it.name]?.locked)return bad(res,'You cannot sell that one.'); const pay=F.sellPrice(c.it.name); const u=await User.findOneAndUpdate({_id:req.user.id,'ac.properties.items.id':req.params.itemId,...activePropertyFilter(req.params.id)},{$pull:{'ac.properties.$[p].items':{id:req.params.itemId}},$inc:{'ac.cash':pay}},{new:true,arrayFilters:[{'p.id':req.params.id}]}); if(!u)return bad(res,'Item not found.',404); res.json({ac:publicAC(u.ac),property:publicHome((u.ac.properties||[]).find(p=>p.id===req.params.id)),paid:pay}); } catch(e){next(e);} });
module.exports = router;
