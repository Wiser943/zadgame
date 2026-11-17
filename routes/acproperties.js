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
  try { const u = await ensureAC(req.user.id); res.json({ catalogue: Object.entries(HOMES).map(([id, h]) => ({ id, ...h, baseBedrooms: baseBedrooms(id), maxBedrooms: baseBedrooms(id) + maxExtra(id) })), properties: (u.ac.properties || []).map(publicHome), cash: u.ac.cash, homesApi: 2 }); } catch (e) { next(e); }
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
router.post('/acquire', async (req, res, next) => {
  try {
    const type = String(req.body?.type || '');
    if (!isHome(type)) return bad(res, 'Unknown home type.');

    const home = HOMES[type];
    const price = home.mode === 'rent' ? home.rent : home.price;
    if (!Number.isSafeInteger(price) || price < 1) return bad(res, 'Home price is not available.', 503);

    // Use the existing User document and wallet. This single conditional update
    // debits cash and creates the property together, while blocking duplicate
    // active leases/permanent ownership. Expired rentals may be rented again.
    const now = new Date();
    const property = {
      id: F.newId(),
      type,
      tenure: home.mode === 'rent' ? 'rent' : 'owned',
      boughtAt: now,
      leaseExpiresAt: home.mode === 'rent' ? new Date(now.getTime() + home.rentDays * 86400000) : null,
      paint: home.paint,
      level: 0, bedrooms: 0, insured: false, condition: 100, lastWeatherEvent: '',
      items: A.furnishedItems(type)           // luxury homes arrive fully furnished
    };
    const filter = {
      'ac.cash': { $gte: price },
      $nor: [{
        'ac.properties': {
          $elemMatch: {
            type,
            $or: [
              { tenure: 'owned' },
              { tenure: 'rent', leaseExpiresAt: { $gt: now } }
            ]
          }
        }
      }]
    };
    // No runValidators here: on a $push, Mongoose validates the WHOLE ac.properties array, not just the new
    // entry — so one stray legacy record (e.g. from earlier testing) would block every future purchase with a
    // CastError, no matter what's being bought. The object above is built from known-good, already-typed values
    // (a crypto id, a type checked by isHome(), literal strings, Date.now(), the catalogue's own paint), so it
    // doesn't need re-validating.
    const u = await rawUpdate(req.user.id, filter, { $inc: { 'ac.cash': -price }, $push: { 'ac.properties': property } });

    if (!u) {
      const cur = await User.findById(req.user.id).select('ac.cash ac.properties');
      if (!cur) return bad(res, 'Account not found. Please sign in again.', 401);
      const hasActive = (cur.ac?.properties || []).some(p => p.type === type &&
        (p.tenure === 'owned' || (p.tenure === 'rent' && p.leaseExpiresAt && new Date(p.leaseExpiresAt) > now)));
      if (hasActive) return bad(res, 'You already have this home.', 409);
      if ((cur.ac?.cash || 0) < price) return bad(res, 'Not enough ₦.', 402);
      return bad(res, 'Could not complete the home purchase. Please refresh and try again.', 409);
    }

    res.json({ ac: publicAC(u.ac), property: publicHome(property) });
  } catch (e) {
    const ref = randomUUID().slice(0, 12);
    console.error('[home-acquire]', ref, { user: String(req.user?.id || ''), type: String(req.body?.type || ''), name: e?.name, code: e?.code, message: e?.message });
    return res.status(500).json({ message: 'This home action hit an unexpected server problem (code ' + ref + '). Please try again.', reference: ref });
  }
});
// Add bedrooms to a home you own. Body: { bedrooms: <the TOTAL number of bedrooms you want> }, e.g. 3 for a 3-bedroom.
// One conditional update takes the cash and records the new size together, so a double tap or two devices can never
// charge twice. Every failure answers with a short, specific message the app can show as it is.
// Renovate: back extension, an upstairs floor (+ its staircase), a new upstairs layout, or the luxury finish. One atomic charge each.
router.post('/:id/renovate', async (req, res) => {
  try {
    const c = await getOwned(req); if (!c.p) return bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404);
    const want = String(req.body && req.body.id || 'bath'), opt = A.renovationOptions(c.p).find((o) => o.id === want);
    if (!opt) return bad(res, 'That renovation is not available for this home (it may already be done).', 409);
    const [kind, arg] = want.split(':'), cond = { id: String(req.params.id), tenure: 'owned' }, set = {}, push = {};
    if (kind === 'bath') { cond.bath = { $ne: true }; set['ac.properties.$.bath'] = true; }
    else if (kind === 'finish') { cond.finish = { $ne: 'luxury' }; set['ac.properties.$.finish'] = 'luxury'; }
    else if (kind === 'upstyle') { cond.upstairs = true; set['ac.properties.$.upStyle'] = arg; }
    else if (kind === 'upstairs') {
      // the staircase needs a free 2x3 space on the ground floor; it is built together with the floor
      const spot = F.autoPlace((c.p.items || []).filter((i) => !(Number(i.floor) > 0)), A.STAIRS, gridOf(c.p, 0));
      if (!spot) return bad(res, 'There is no free 2 by 3 space downstairs for the staircase. Move some furniture, then try again.', 409);
      cond.upstairs = { $ne: true }; set['ac.properties.$.upstairs'] = true; set['ac.properties.$.upStyle'] = arg;
      push['ac.properties.$.items'] = { id: F.newId(), name: A.STAIRS, x: spot.x, z: spot.z, rot: spot.rot || 0, floor: 0, placed: true };
    }
    const update = { $inc: { 'ac.cash': -opt.cost }, $set: set }; if (Object.keys(push).length) update.$push = push;
    const u = await rawUpdate(req.user.id, { 'ac.cash': { $gte: opt.cost }, 'ac.properties': { $elemMatch: cond } }, update);
    if (!u) return bad(res, 'Not enough money, or the home was already renovated.', 402);
    if (kind === 'upstyle') await unplaceMisfits(req.user.id, req.params.id).catch(() => {});
    const fresh = await User.findById(req.user.id), prop = (fresh.ac.properties || []).find((p) => p.id === String(req.params.id));
    res.json({ ac: publicAC(fresh.ac), property: publicHome(prop), cost: opt.cost });
  } catch (e) { console.error('[home-renovate]', e.message); return res.status(500).json({ message: 'The renovation hit a server problem and you were not charged.' }); }
});
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
    const floor = Number(req.body?.floor) === 1 ? 1 : 0; if (floor === 1 && !c.p.upstairs) return bad(res, 'This home has no upstairs floor yet.');
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
  const floor = storedOnly && req.body?.floor != null ? (Number(req.body.floor) === 1 ? 1 : 0) : (Number(c.it.floor) || 0);
  if (floor === 1 && !c.p.upstairs) return bad(res, 'This home has no upstairs floor yet.');
  if (def.stairs && floor !== 0) return bad(res, 'The staircase stays downstairs.');
  const items = F.onFloor(c.items, floor), grid = gridOf(c.p, floor), x = Number(req.body?.x), z = Number(req.body?.z), rot = Number(req.body?.rot) || 0;
  if (!(def.hang ? F.canHang(items, c.it.name, x, z, c.it.id, grid) : F.canPlace(items, c.it.name, x, z, rot, c.it.id, grid))) return bad(res, 'That spot is taken or outside the room.');
  const r = await updateItem(req, res, { x, z, rot, floor, placed: true });
  if (def.stairs) await unplaceMisfits(req.user.id, req.params.id).catch(() => {});      // the opening upstairs moved with the staircase
  return r;
}
// After the upstairs opening or layout changes: anything upstairs that no longer fits goes into storage (placed: false)
async function unplaceMisfits(userId, propertyId) {
  const u = await User.findById(userId).select('ac.properties'), p = u && (u.ac.properties || []).find((x) => x.id === propertyId); if (!p || !p.upstairs) return;
  const grid = gridOf(p, 1), kept = [], bad_ = [];
  for (const it of F.onFloor(p.items || [], 1)) { if (it.placed === false) continue; const ok = F.isHang(it.name) ? F.canHang(kept, it.name, it.x, it.z, it.id, grid) : F.canPlace(kept, it.name, it.x, it.z, it.rot, it.id, grid); if (ok) kept.push(it); else bad_.push(it.id); }
  if (bad_.length) await User.updateOne({ _id: userId }, { $set: { 'ac.properties.$[p].items.$[i].placed': false } }, { arrayFilters: [{ 'p.id': propertyId }, { 'i.id': { $in: bad_ } }] });
}
router.post('/:id/furniture/:itemId/move', async (req,res,next)=>{ try { return await place(req,res,false); } catch(e){next(e);} });
router.post('/:id/furniture/:itemId/place', async (req,res,next)=>{ try { return await place(req,res,true); } catch(e){next(e);} });
router.post('/:id/furniture/:itemId/store', async (req,res,next)=>{ try { const c=await itemContext(req,res); if(!c)return; if(F.ITEMS[c.it.name]?.locked)return bad(res,'You need that one in the room.'); return await updateItem(req,res,{placed:false}); } catch(e){next(e);} });
router.post('/:id/furniture/:itemId/sell', async (req,res,next)=>{ try { const c=await itemContext(req,res); if(!c)return; if(F.ITEMS[c.it.name]?.locked)return bad(res,'You cannot sell that one.'); const pay=F.sellPrice(c.it.name); const u=await User.findOneAndUpdate({_id:req.user.id,'ac.properties.items.id':req.params.itemId,...activePropertyFilter(req.params.id)},{$pull:{'ac.properties.$[p].items':{id:req.params.itemId}},$inc:{'ac.cash':pay}},{new:true,arrayFilters:[{'p.id':req.params.id}]}); if(!u)return bad(res,'Item not found.',404); res.json({ac:publicAC(u.ac),property:publicHome((u.ac.properties||[]).find(p=>p.id===req.params.id)),paid:pay}); } catch(e){next(e);} });
module.exports = router;
