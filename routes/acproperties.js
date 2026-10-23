// Additional homes reuse the existing AllConnect account, shared wallet and furniture placement rules.
const express = require('express');
const { randomUUID } = require('crypto');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const F = require('../utils/furniture');
const { publicAC } = require('../utils/allconnect');
const { ensureAC } = require('./allconnect');
const { HOMES, EXPANSIONS, isHome, publicHome, levelOf, gridFor, gridOf, expansionCost, MAX_LEVEL } = require('../utils/acproperties');
const router = express.Router();
router.use(ensureAuth);
const bad = (res, message, status = 400) => res.status(status).json({ message });
const activePropertyFilter = (id) => ({ 'ac.properties': { $elemMatch: { id, $or: [{ tenure: 'owned' }, { tenure: 'rent', leaseExpiresAt: { $gt: new Date() } }] } } });
const getOwned = async (req) => {
  const u = await ensureAC(req.user.id);
  const p = (u.ac.properties || []).find(x => x.id === String(req.params.id));
  if (!p) return { u, p: null };
  if (p.tenure === 'rent' && p.leaseExpiresAt && new Date(p.leaseExpiresAt) <= new Date()) return { u, p: null, expired: true };
  return { u, p };
};
router.get('/', async (req, res, next) => {
  try { const u = await ensureAC(req.user.id); res.json({ catalogue: Object.entries(HOMES).map(([id, h]) => ({ id, ...h })), properties: (u.ac.properties || []).map(publicHome), expansions: EXPANSIONS, cash: u.ac.cash }); } catch (e) { next(e); }
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
      items: []
    };
    const filter = {
      _id: req.user.id,
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
    const u = await User.findOneAndUpdate(
      filter,
      { $inc: { 'ac.cash': -price }, $push: { 'ac.properties': property } },
      { new: true }
    );

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
    return res.status(500).json({ message: 'This home action hit an unexpected server problem. Please try again.', reference: ref });
  }
});
// Expand a home you own: more floor to furnish. One conditional update debits the cash and raises the level together.
router.post('/:id/expand', async (req, res, next) => {
  try {
    const c = await getOwned(req); if (!c.p) return bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404);
    if (c.p.tenure !== 'owned') return bad(res, 'Only homes you own can be expanded.', 409);
    const cur = levelOf(c.p); if (cur >= MAX_LEVEL) return bad(res, 'This home is already fully expanded.', 409);
    const cost = expansionCost(c.p.type, cur); if (!Number.isSafeInteger(cost) || cost < 1) return bad(res, 'This home cannot be expanded.', 409);
    const lvl = cur === 0 ? { $in: [0, null] } : cur;
    const u = await User.findOneAndUpdate(
      { _id: req.user.id, 'ac.cash': { $gte: cost }, 'ac.properties': { $elemMatch: { id: req.params.id, tenure: 'owned', level: lvl } } },
      { $inc: { 'ac.cash': -cost }, $set: { 'ac.properties.$[p].level': cur + 1 } },
      { new: true, arrayFilters: [{ 'p.id': req.params.id, 'p.tenure': 'owned', 'p.level': lvl }] }
    );
    if (!u) {
      const now = await User.findById(req.user.id).select('ac.cash ac.properties'); const p2 = (now?.ac?.properties || []).find(x => x.id === req.params.id);
      if (!p2) return bad(res, 'Home not found.', 404);
      if (levelOf(p2) !== cur) return bad(res, 'This home was already expanded. Refresh and check again.', 409);
      if ((now.ac?.cash || 0) < cost) return bad(res, 'Not enough ₦ for this expansion.', 402);
      return bad(res, 'Could not complete the expansion. Please refresh and try again.', 409);
    }
    res.json({ ac: publicAC(u.ac), property: publicHome((u.ac.properties || []).find(p => p.id === req.params.id)), cost });
  } catch (e) { next(e); }
});
// Optional weekly home cover. It protects against simulated severe-weather damage.
router.post('/:id/insurance', async (req, res, next) => {
  try {
    const c = await getOwned(req); if (!c.p) return bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404);
    if (c.p.insured) return res.json({ message: 'This property is already insured.', property: publicHome(c.p) });
    const premium = Math.max(5000, Math.round((({ mainland_room: 150000, self_contained: 350000, mini_flat: 900000, two_bedroom: 2200000 }[c.p.type] || 250000) * 0.025) / 100) * 100);
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
    const it = F.ITEMS[name], items = c.p.items || []; if (items.length >= 120) return bad(res, 'This home is full of furniture.');
    if (it.fixed ? items.some(i => i.name === name) : !F.canPlace(items, name, Number(req.body?.x), Number(req.body?.z), Number(req.body?.rot) || 0, undefined, gridOf(c.p))) return bad(res, it.fixed ? 'You already have that.' : 'That spot is taken or outside the room.');
    const inst = { id: F.newId(), name, x: Number(req.body?.x) || 0, z: Number(req.body?.z) || 0, rot: Number(req.body?.rot) || 0, placed: true };
    const path = 'ac.properties.$[p].items';
    const u = await User.findOneAndUpdate({ _id: req.user.id, 'ac.cash': { $gte: it.price }, ...activePropertyFilter(req.params.id) }, { $inc: { 'ac.cash': -it.price }, $push: { [path]: inst } }, { new: true, arrayFilters: [{ 'p.id': req.params.id }] });
    if (!u) return bad(res, 'Not enough ₦ or home no longer available.', 409);
    res.json({ ac: publicAC(u.ac), property: publicHome((u.ac.properties || []).find(p => p.id === req.params.id)), item: inst });
  } catch (e) { next(e); }
});
async function itemContext(req, res) { const c = await getOwned(req); if (!c.p) { bad(res, c.expired ? 'This rental has expired.' : 'Home not found.', 404); return null; } const it = (c.p.items || []).find(i => i.id === req.params.itemId); if (!it) { bad(res, 'Item not found.', 404); return null; } return { ...c, it, items: c.p.items }; }
async function updateItem(req, res, fields) { const set = Object.fromEntries(Object.entries(fields).map(([k,v]) => [`ac.properties.$[p].items.$[i].${k}`, v])); const u = await User.findOneAndUpdate({ _id: req.user.id, 'ac.properties.items.id': req.params.itemId, ...activePropertyFilter(req.params.id) }, { $set: set }, { new: true, arrayFilters: [{ 'p.id': req.params.id }, { 'i.id': req.params.itemId }] }); if (!u) return bad(res, 'Item not found.', 404); res.json({ ac: publicAC(u.ac), property: publicHome((u.ac.properties || []).find(p => p.id === req.params.id)) }); }
async function place(req, res, storedOnly) { const c = await itemContext(req, res); if (!c) return; const def = F.ITEMS[c.it.name]; if (!def || def.fixed) return bad(res, 'That item cannot be moved.'); if (storedOnly && c.it.placed !== false) return bad(res, 'Already in your room.'); const x = Number(req.body?.x), z = Number(req.body?.z), rot = Number(req.body?.rot) || 0; if (!F.canPlace(c.items, c.it.name, x, z, rot, c.it.id, gridOf(c.p))) return bad(res, 'That spot is taken or outside the room.'); return updateItem(req, res, { x, z, rot, placed: true }); }
router.post('/:id/furniture/:itemId/move', async (req,res,next)=>{ try { return await place(req,res,false); } catch(e){next(e);} });
router.post('/:id/furniture/:itemId/place', async (req,res,next)=>{ try { return await place(req,res,true); } catch(e){next(e);} });
router.post('/:id/furniture/:itemId/store', async (req,res,next)=>{ try { const c=await itemContext(req,res); if(!c)return; if(F.ITEMS[c.it.name]?.locked)return bad(res,'You need that one in the room.'); return await updateItem(req,res,{placed:false}); } catch(e){next(e);} });
router.post('/:id/furniture/:itemId/sell', async (req,res,next)=>{ try { const c=await itemContext(req,res); if(!c)return; if(F.ITEMS[c.it.name]?.locked)return bad(res,'You cannot sell that one.'); const pay=F.sellPrice(c.it.name); const u=await User.findOneAndUpdate({_id:req.user.id,'ac.properties.items.id':req.params.itemId,...activePropertyFilter(req.params.id)},{$pull:{'ac.properties.$[p].items':{id:req.params.itemId}},$inc:{'ac.cash':pay}},{new:true,arrayFilters:[{'p.id':req.params.id}]}); if(!u)return bad(res,'Item not found.',404); res.json({ac:publicAC(u.ac),property:publicHome((u.ac.properties||[]).find(p=>p.id===req.params.id)),paid:pay}); } catch(e){next(e);} });
module.exports = router;
