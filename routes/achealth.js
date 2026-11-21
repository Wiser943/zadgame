// Health app: sickness, the chemist, the General Hospital, player pharmacies and the Fresh Market.
// Every price, cure and stock count is decided here. Money moves with atomic "only if enough" updates and shows on the bank statement.
const express = require('express');
const User = require('../models/User');
const ACTxn = require('../models/ACTxn');
const ACPet = require('../models/ACPet');
const ACVenue = require('../models/ACVenue');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const { makeRef } = require('../utils/acbank');
const { emitUser } = require('../utils/acnotify');
const P = require('../utils/acpet');
const HL = require('../utils/achealth');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const io = (req) => req.app.get('io');
const isId = (s) => /^[a-f\d]{24}$/i.test(String(s));
const label = (u) => (u && (u.acUsername ? '@' + u.acUsername : u.displayName)) || 'A player';

async function pet(me) { return ACPet.findOne({ user: me }); }

/* loads the player, moves their health along (new illness, mild -> serious, hospital bill) and saves it */
async function current(req, me) {
  await ensureAC(me);
  const u = await User.findById(me).select('ac.cash ac.health').lean(), now = Date.now();
  const cash = (u && u.ac && u.ac.cash) || 0, { h, admit } = HL.tick(u && u.ac && u.ac.health, now);
  let billed = 0;
  if (admit) {
    const bill = Math.min(cash, HL.HOSPITAL);
    const r = await User.updateOne({ _id: me, 'ac.cash': { $gte: bill } }, { $inc: { 'ac.cash': -bill }, $set: { 'ac.health': { ill: null, checked: new Date(now), last: { kind: 'admitted', amount: bill, at: new Date(now) } } } });
    if (r.modifiedCount || r.nModified) {
      billed = bill; h.ill = null; h.last = { kind: 'admitted', amount: bill, at: new Date(now) };
      if (bill) { await ACTxn.create({ user: me, type: 'debit', amount: bill, cpName: 'General Hospital', cpNum: '', note: 'Emergency admission', ref: makeRef(), kind: 'health' }); emitUser(io(req), me, 'cash', { delta: -bill }); }
      return { cash: cash - bill, h, billed };
    }
  }
  await User.updateOne({ _id: me }, { $set: { 'ac.health': h } });
  return { cash, h, billed };
}
async function charge(req, me, price, who, note) {
  const u = await User.findOneAndUpdate({ _id: me, 'ac.cash': { $gte: price } }, { $inc: { 'ac.cash': -price } }, { new: true });
  if (!u) return null;
  await ACTxn.create({ user: me, type: 'debit', amount: price, cpName: who, cpNum: '', note, ref: makeRef(), kind: 'health' });
  emitUser(io(req), me, 'cash', { delta: -price });
  return u.ac.cash;
}
const refund = (me, price) => User.updateOne({ _id: me }, { $inc: { 'ac.cash': price } }).catch(() => {});

/* Is this purchase pointless? Checked BEFORE any money is taken. Returns an error text or '' */
async function precheck(me, it, h, pt) {
  if (it.cure) { if (!h.ill) return 'You are not sick. Save your money.'; if (h.ill.sev !== 'mild') return 'This is too serious for drugs. Go to the General Hospital.'; }
  if (it.who === 'pet') {
    if (!pt) return 'You do not have a pet yet. Adopt one in the Pet app first.';
    if (it.petCure && pt.health > 85) return `${pt.name} is healthy. No need.`;
    if (it.pet && it.pet.clean && pt.clean > 92) return `${pt.name} is already clean.`;
  }
  return '';
}
/* Gives the item its effect. Returns what the phone should show */
async function give(me, it, h, pt) {
  const out = { cured: false, needs: [], pet: null };
  if (it.cure) { await User.updateOne({ _id: me }, { $set: { 'ac.health': Object.assign({}, h, { ill: null, last: { kind: 'cured', at: new Date() } }) } }); out.cured = true; }
  if (it.need) out.needs = Object.entries(it.need).map(([i, d]) => [Number(i), d]);
  if (it.who === 'pet' && pt) { P.roll(pt); P.advance(pt); P.apply(pt, it.pet); P.settle(pt); await pt.save(); out.pet = { name: pt.name, health: Math.round(pt.health), clean: Math.round(pt.clean), energy: Math.round(pt.energy) }; }
  return out;
}

async function ownerShop(me) {
  const doc = await ACVenue.findOne({ user: me, 'venues.key': 'pharmacy' });
  if (!doc) return null;
  if (!HL.shopOf(doc)) { doc.shop = HL.newShop(me); doc.markModified('shop'); await doc.save(); }
  return doc;
}

router.get('/state', async (req, res, next) => {
  try {
    const me = uid(req), { cash, h, billed } = await current(req, me), pt = await pet(me), mine = await ownerShop(me);
    res.json({
      cash, ill: HL.view(h), last: h.last || null, billed, hospital: HL.HOSPITAL,
      pet: pt ? { name: pt.name, health: Math.round(pt.health), sick: pt.health < 30 } : null,
      chemist: HL.cat(null), market: Object.values(HL.MARKET),
      mine: mine ? { shop: HL.cat(mine.shop), sold: mine.shop.sold || 0, earned: mine.shop.earned || 0, max: HL.STOCK_MAX, minX: HL.MIN_X, maxX: HL.MAX_X } : null
    });
  } catch (e) { next(e); }
});

router.post('/chemist', async (req, res, next) => {
  try {
    const me = uid(req), id = String((req.body || {}).item || ''), it = HL.ITEMS[id]; if (!it) return bad(res, 400, 'Unknown item.');
    const { h } = await current(req, me), pt = it.who === 'pet' ? await pet(me) : null, err = await precheck(me, it, h, pt); if (err) return bad(res, 409, err);
    const cash = await charge(req, me, it.base, 'Chemist', it.name); if (cash == null) return bad(res, 402, 'Not enough ₦.');
    try { res.json(Object.assign({ cash, price: it.base, item: { id, name: it.name, emoji: it.emoji } }, await give(me, it, h, pt))); }
    catch (e) { await refund(me, it.base); throw e; }
  } catch (e) { next(e); }
});

router.post('/hospital', async (req, res, next) => {
  try {
    const me = uid(req), { h } = await current(req, me); if (!h.ill) return bad(res, 409, 'You are not sick. The doctor sent you home.');
    const cash = await charge(req, me, HL.HOSPITAL, 'General Hospital', 'Hospital treatment'); if (cash == null) return bad(res, 402, `The hospital bill is ₦${HL.HOSPITAL.toLocaleString('en-NG')}. You do not have enough.`);
    await User.updateOne({ _id: me }, { $set: { 'ac.health': Object.assign({}, h, { ill: null, last: { kind: 'hospital', at: new Date() } }) } });
    res.json({ cash, price: HL.HOSPITAL, cured: true });
  } catch (e) { next(e); }
});

router.post('/market', async (req, res, next) => {
  try {
    const me = uid(req), id = String((req.body || {}).item || ''), it = HL.MARKET[id]; if (!it) return bad(res, 400, 'Unknown item.');
    await ensureAC(me); const cash = await charge(req, me, it.price, 'Fresh Market', it.name); if (cash == null) return bad(res, 402, 'Not enough ₦.');
    res.json({ cash, price: it.price, needs: Object.entries(it.need).map(([i, d]) => [Number(i), d]), item: { id, name: it.name, emoji: it.emoji } });
  } catch (e) { next(e); }
});

/* player pharmacies = every player who opened the Pharmacy venue */
router.get('/shops', async (req, res, next) => {
  try {
    const docs = await ACVenue.find({ 'venues.key': 'pharmacy' }).sort({ updatedAt: -1 }).limit(40);
    const ids = docs.map((d) => d.user).filter(isId), users = await User.find({ _id: { $in: ids } }).select('acUsername displayName ac.hub.hood').lean(), by = new Map(users.map((u) => [String(u._id), u]));
    const shops = [];
    for (const d of docs) {
      const u = by.get(String(d.user)); if (!u) continue;
      if (!HL.shopOf(d)) { d.shop = HL.newShop(d.user); d.markModified('shop'); try { await d.save(); } catch (e) { continue; } }
      const lvl = (d.venues.find((v) => v.key === 'pharmacy') || {}).level || 1;
      shops.push({ owner: String(d.user), name: label(u), area: (u.ac && u.ac.hub && u.ac.hub.hood) || 'Lagos', level: lvl, from: HL.fromPrice(d.shop), me: String(d.user) === uid(req) });
    }
    res.json({ shops });
  } catch (e) { next(e); }
});
router.get('/shops/:owner', async (req, res, next) => {
  try {
    const o = req.params.owner; if (!isId(o)) return bad(res, 404, 'Pharmacy not found.');
    const d = await ACVenue.findOne({ user: o, 'venues.key': 'pharmacy' }), u = d && await User.findById(o).select('acUsername displayName ac.hub.hood').lean();
    if (!d || !u) return bad(res, 404, 'That pharmacy is closed.');
    if (!HL.shopOf(d)) { d.shop = HL.newShop(o); d.markModified('shop'); await d.save(); }
    const me = await User.findById(uid(req)).select('ac.cash').lean();
    res.json({ owner: o, name: label(u), area: (u.ac && u.ac.hub && u.ac.hub.hood) || 'Lagos', items: HL.cat(d.shop), cash: (me && me.ac && me.ac.cash) || 0, mine: o === uid(req) });
  } catch (e) { next(e); }
});
router.post('/buy', async (req, res, next) => {
  try {
    const me = uid(req), o = String((req.body || {}).owner || ''), id = String((req.body || {}).item || ''), it = HL.ITEMS[id];
    if (!it || !isId(o)) return bad(res, 400, 'Unknown item.'); if (o === me) return bad(res, 409, 'This is your own pharmacy. Use Manage to restock it.');
    const doc = await ACVenue.findOne({ user: o, 'venues.key': 'pharmacy' }); if (!doc || !HL.shopOf(doc)) return bad(res, 404, 'That pharmacy is closed.');
    const price = doc.shop.price[id]; if (!(doc.shop.stock[id] > 0)) return bad(res, 409, 'Sold out.');
    const { h } = await current(req, me), pt = it.who === 'pet' ? await pet(me) : null, err = await precheck(me, it, h, pt); if (err) return bad(res, 409, err);
    const left = await ACVenue.findOneAndUpdate({ user: o, ['shop.stock.' + id]: { $gte: 1 } }, { $inc: { ['shop.stock.' + id]: -1, 'shop.sold': 1, 'shop.earned': price } }, { new: true });
    if (!left) return bad(res, 409, 'Sold out.');
    const cash = await charge(req, me, price, 'Player pharmacy', it.name);
    if (cash == null) { await ACVenue.updateOne({ user: o }, { $inc: { ['shop.stock.' + id]: 1, 'shop.sold': -1, 'shop.earned': -price } }); return bad(res, 402, 'Not enough ₦.'); }
    try {
      const out = await give(me, it, h, pt);
      await User.updateOne({ _id: o }, { $inc: { 'ac.cash': price } });
      await ACTxn.create({ user: o, type: 'credit', amount: price, cpName: 'Pharmacy sale', cpNum: '', note: it.name, ref: makeRef(), kind: 'health' }); emitUser(io(req), o, 'cash', { delta: price });
      res.json(Object.assign({ cash, price, left: left.shop.stock[id], item: { id, name: it.name, emoji: it.emoji } }, out));
    } catch (e) { await refund(me, price); await ACVenue.updateOne({ user: o }, { $inc: { ['shop.stock.' + id]: 1, 'shop.sold': -1, 'shop.earned': -price } }); throw e; }
  } catch (e) { next(e); }
});

/* the owner's own shelf: prices and restocking */
router.post('/my/price', async (req, res, next) => {
  try {
    const me = uid(req), id = String((req.body || {}).item || ''); if (!HL.ITEMS[id]) return bad(res, 400, 'Unknown item.');
    const d = await ownerShop(me); if (!d) return bad(res, 409, 'Open the Pharmacy in the Venues app first.');
    const price = HL.clampPrice(id, (req.body || {}).price); await ACVenue.updateOne({ user: me }, { $set: { ['shop.price.' + id]: price } });
    res.json({ item: id, price });
  } catch (e) { next(e); }
});
router.post('/my/restock', async (req, res, next) => {
  try {
    const me = uid(req), id = String((req.body || {}).item || ''), qty = Math.max(1, Math.min(50, Math.floor(Number((req.body || {}).qty) || 10))); if (!HL.ITEMS[id]) return bad(res, 400, 'Unknown item.');
    const d = await ownerShop(me); if (!d) return bad(res, 409, 'Open the Pharmacy in the Venues app first.');
    const have = d.shop.stock[id] || 0, add = Math.min(qty, HL.STOCK_MAX - have); if (add < 1) return bad(res, 409, 'That shelf is full.');
    const cost = HL.restockCost(id, add), cash = await charge(req, me, cost, 'Pharmacy supplier', `Restock ${HL.ITEMS[id].name} x${add}`); if (cash == null) return bad(res, 402, 'Not enough ₦.');
    await ACVenue.updateOne({ user: me }, { $inc: { ['shop.stock.' + id]: add } });
    res.json({ item: id, stock: have + add, cost, cash });
  } catch (e) { next(e); }
});

module.exports = router;
