// Buy mode: buy / place / move / turn / store / sell furniture + wishlist. All prices and rules come from the server.
const express = require('express');
const User = require('../models/User');
const ensureAuth = require('../middleware/auth');
const F = require('../utils/furniture');
const { publicAC } = require('../utils/allconnect');
const { ensureAC } = require('./allconnect');

const router = express.Router();
router.use(ensureAuth);
const bad = (res, m, c = 400) => res.status(c).json({ message: m });
const MAX_ITEMS = 120, MAX_WISH = 30;
const pos = (b) => ({ x: Number(b && b.x), z: Number(b && b.z), rot: Number(b && b.rot) || 0 });

router.get('/', async (req, res, next) => { try { const u = await ensureAC(req.user.id); res.json({ ac: publicAC(u.ac) }); } catch (e) { next(e); } });

router.post('/buy', async (req, res, next) => {
  try {
    const name = String((req.body && req.body.name) || ''); if (!F.isItem(name)) return bad(res, 'Unknown item.');
    const it = F.ITEMS[name], u0 = await ensureAC(req.user.id), items = u0.ac.items || [];
    if (items.length >= MAX_ITEMS) return bad(res, 'Your house is full of stuff. Sell or store something first.');
    let inst = { id: F.newId(), name, x: 0, z: 0, rot: 0, placed: true };
    if (it.fixed) { if (items.some((i) => i.name === name)) return bad(res, 'You already have that.', 409); }
    else { const p = pos(req.body); if (!F.canPlace(items, name, p.x, p.z, p.rot)) return bad(res, 'That spot is taken or outside the room.'); Object.assign(inst, p); }
    const u = await User.findOneAndUpdate({ _id: req.user.id, 'ac.cash': { $gte: it.price } }, { $inc: { 'ac.cash': -it.price }, $push: { 'ac.items': inst }, $pull: { 'ac.wish': name } }, { new: true });
    if (!u) return bad(res, 'Not enough ₦.', 402);
    res.json({ ac: publicAC(u.ac), item: inst });
  } catch (e) { next(e); }
});

async function mine(req, res) {
  const u = await ensureAC(req.user.id), it = (u.ac.items || []).find((i) => i.id === req.params.id);
  if (!it) { bad(res, 'Item not found.', 404); return null; }
  return { u, it, items: u.ac.items };
}
async function save(req, res, id, set) {
  const sets = Object.fromEntries(Object.entries(set).map(([k, v]) => ['ac.items.$.' + k, v]));
  const u = await User.findOneAndUpdate({ _id: req.user.id, 'ac.items.id': id }, { $set: sets }, { new: true });
  res.json({ ac: publicAC(u.ac) });
}
// move, turn or place a stored item: body {x,z,rot}
async function putDown(req, res, next, needStored) {
  try {
    const c = await mine(req, res); if (!c) return; const { it, items } = c, def = F.ITEMS[it.name];
    if (def.fixed) return bad(res, 'That is fixed to the wall.');
    if (needStored && it.placed !== false) return bad(res, 'Already in your room.');
    const p = pos(req.body); if (!F.canPlace(items, it.name, p.x, p.z, p.rot, it.id)) return bad(res, 'That spot is taken or outside the room.');
    await save(req, res, it.id, { x: p.x, z: p.z, rot: p.rot, placed: true });
  } catch (e) { next(e); }
}
router.post('/:id/move', (req, res, next) => putDown(req, res, next, false));
router.post('/:id/place', (req, res, next) => putDown(req, res, next, true));

router.post('/:id/store', async (req, res, next) => {
  try {
    const c = await mine(req, res); if (!c) return; if (F.ITEMS[c.it.name].locked) return bad(res, 'You need that one in the room.');
    await save(req, res, c.it.id, { placed: false });
  } catch (e) { next(e); }
});

router.post('/:id/sell', async (req, res, next) => {
  try {
    const c = await mine(req, res); if (!c) return; if (F.ITEMS[c.it.name].locked) return bad(res, 'You cannot sell that one.');
    const pay = F.sellPrice(c.it.name);
    const u = await User.findOneAndUpdate({ _id: req.user.id, 'ac.items.id': c.it.id }, { $pull: { 'ac.items': { id: c.it.id } }, $inc: { 'ac.cash': pay } }, { new: true });
    if (!u) return bad(res, 'Item not found.', 404);
    res.json({ ac: publicAC(u.ac), paid: pay });
  } catch (e) { next(e); }
});

// wishlist: previewed but not bought. body {name, on}
router.post('/wish', async (req, res, next) => {
  try {
    const name = String((req.body && req.body.name) || ''); if (!F.isItem(name)) return bad(res, 'Unknown item.');
    const on = !(req.body && req.body.on === false);
    const u0 = await ensureAC(req.user.id); if (on && (u0.ac.wish || []).length >= MAX_WISH && !(u0.ac.wish || []).includes(name)) return bad(res, 'Your wishlist is full.');
    const u = await User.findByIdAndUpdate(req.user.id, on ? { $addToSet: { 'ac.wish': name } } : { $pull: { 'ac.wish': name } }, { new: true });
    res.json({ ac: publicAC(u.ac) });
  } catch (e) { next(e); }
});

module.exports = router;
