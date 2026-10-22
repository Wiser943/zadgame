// Invest app: land, street businesses and haulage trucks. Prices, payouts and values are decided HERE (utils/acinvest.js),
// never by the client. Money moves through utils/economy.js so the balance is the same one the games and the bank use.
const express = require('express');
const crypto = require('crypto');
const ACInvest = require('../models/ACInvest');
const ensureAuth = require('../middleware/auth');
const econ = require('../utils/economy');
const { notify } = require('../utils/acnotify');
const I = require('../utils/acinvest');
const { queueCard } = require('../utils/accards');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const hits = new Map();
const limited = (id) => { const n = Date.now(), a = (hits.get(id) || []).filter((t) => n - t < 60000); if (a.length >= 30) { hits.set(id, a); return true; } a.push(n); hits.set(id, a); return false; };
const H = require('../utils/achub');
// New-player protection: big-ticket purchases wait until the player's first week is over
router.post(['/land/buy', '/biz/buy', '/truck/buy'], (req, res, next) => {
  if (!H.isProtected(req.user.createdAt)) return next();
  const b = req.body || {}, price = req.path.startsWith('/land') ? (I.landOf(String(b.place || '')) || {}).price : req.path.startsWith('/biz') ? (I.bizOf(String(b.key || '')) || {}).price : I.TRUCK.price;
  if (price > H.PROTECT.investMax) return bad(res, 403, `New-player protection: you can buy investments up to ${naira(H.PROTECT.investMax)} for your first ${H.PROTECT_DAYS} days.`);
  next();
});
const nid = () => crypto.randomBytes(6).toString('hex');
const naira = (n) => '₦' + Math.floor(n).toLocaleString('en-NG');

const ensureDoc = async (id) => { try { await ACInvest.updateOne({ user: id }, { $setOnInsert: { user: id } }, { upsert: true }); } catch (e) { if (e.code !== 11000) throw e; } return ACInvest.findOne({ user: id }); };

// Pay every evening (6 PM Lagos) that has passed since the last settlement. The CAS on lastPayoutAt means an evening is paid exactly once,
// even if two screens open at the same moment.
async function settle(io, id) {
  let doc = await ACInvest.findOne({ user: id });
  for (let round = 0; doc && doc.lastPayoutAt && round < 4; round++) {
    const now = Date.now(), last = doc.lastPayoutAt.getTime();
    const calc = I.settle(id, { biz: doc.biz, trucks: doc.trucks }, last, now);
    if (calc.newLast === last) break;
    const inc = { earned: calc.net };
    for (const e of calc.entries) inc['tot.' + e.item] = (inc['tot.' + e.item] || 0) + e.pre;
    const upd = { $set: { lastPayoutAt: new Date(calc.newLast) }, $inc: inc };
    if (calc.entries.length) upd.$push = { ledger: { $each: calc.entries, $slice: -300 } };
    const won = await ACInvest.findOneAndUpdate({ user: id, lastPayoutAt: doc.lastPayoutAt }, upd, { new: true });
    if (!won) { doc = await ACInvest.findOne({ user: id }); continue; }   // another screen settled first
    if (calc.net) {
      await econ.adjust(id, calc.net);
      const tax = calc.entries.reduce((t, e) => t + (e.tax || 0), 0), nights = new Set(calc.entries.map((e) => e.k)).size || 1;
      queueCard(io, id, calc.net >= 0
        ? { icon: '💰', title: 'Investment payout', text: 'Your businesses and trucks paid out. Money don enter.', lines: [['Paid in', naira(calc.net)], ['Tax paid', naira(tax)], ['Evenings', String(nights)]], tone: 'gold', btn: 'Collect' }
        : { icon: '🔧', title: 'Truck repairs', text: 'Your trucks needed fixing today.', lines: [['Cost', naira(-calc.net)]], tone: 'warn', btn: 'Okay' }).catch(() => {});
      notify(io, id, { icon: calc.net >= 0 ? '💰' : '🔧', text: calc.net >= 0 ? `Invest payout: +${naira(calc.net)} after tax` : `Invest: truck repairs cost you ${naira(-calc.net)} today`, kind: calc.net >= 0 ? 'good' : 'warn' }).catch(() => {});
    }
    doc = won; if (!calc.more) break;
  }
  return doc;
}

function view(doc, cash) {
  const now = Date.now(), land = (doc.land || []), biz = (doc.biz || []), trucks = (doc.trucks || []), ledger = doc.ledger || [], tot = doc.tot || {};
  const worthOf = (l) => I.landWorth(l, now);
  const landWorth = land.reduce((a, l) => a + worthOf(l), 0), landPaid = land.reduce((a, l) => a + (l.paid || 0), 0);
  const bizWorth = biz.reduce((a, b) => a + I.bizSellValue(b.key), 0), bizPaid = biz.reduce((a, b) => a + (b.paid || 0), 0);
  const truckWorth = trucks.length * I.TRUCK.sellOne, truckPaid = trucks.reduce((a, t) => a + (t.paid || 0), 0);
  const portfolio = landWorth + bizWorth + truckWorth, paid = landPaid + bizPaid + truckPaid;
  const all = I.rollup(ledger, now);
  const ownedBiz = new Map(biz.map((b) => [b.key, b]));
  return {
    cash, now, nextPayoutAt: I.nextBoundary(now), since: doc.since ? doc.since.getTime() : null,
    summary: { portfolio, plots: land.length, landDelta: landWorth - landPaid, trucks: trucks.length, businesses: biz.length,
      today: all.todayNet, week: all.weekNet, total: (doc.earned || 0) + portfolio - paid, taxPct: Math.round(I.TAX * 100) },
    land: land.map((l) => { const c = I.landOf(l.place); return { id: l.id, place: l.place, name: c ? c.name : l.place, emoji: c ? c.emoji : '🌴', paid: l.paid, worth: worthOf(l), delta: worthOf(l) - l.paid, grewWeek: I.landGrewWeek(l, now) }; }),
    market: Object.entries(I.LAND).map(([id, c]) => ({ id, name: c.name, emoji: c.emoji, price: c.price, sell: Math.floor(c.price * I.LAND_SELL_PCT), weekPct: Math.round(c.rate * 7 * 1000) / 10 })),
    businesses: Object.entries(I.BIZ).map(([key, b]) => { const r = I.rollup(ledger, now, key), own = ownedBiz.get(key);
      return { key, name: b.name, area: b.area, emoji: b.emoji, blurb: b.blurb, price: b.price, min: b.min, max: b.max, sell: I.bizSellValue(key), owned: !!own, since: own ? own.at : null, today: r.today, week: r.week, total: tot[key] || 0 }; }),
    haulage: { ...I.TRUCK, count: trucks.length, maxCount: I.MAX_TRUCKS, today: I.rollup(ledger, now, 'truck').today, week: I.rollup(ledger, now, 'truck').week, total: tot.truck || 0 },
    coming: I.COMING, limits: { land: I.MAX_LAND }
  };
}
const send = async (req, res, extra = {}) => {
  const doc = await ACInvest.findOne({ user: uid(req) }) || await ensureDoc(uid(req));
  res.json({ ...view(doc, await econ.balance(uid(req))), ...extra });
};
// First purchase starts the payout clock at the most recent 6 PM, so only evenings from now on count.
const startClock = (id) => ACInvest.updateOne({ user: id, lastPayoutAt: null }, { $set: { lastPayoutAt: new Date(I.lastBoundary(Date.now())), since: new Date() } });

router.get('/state', async (req, res, next) => {
  try { await settle(req.app.get('io'), uid(req)); await ensureDoc(uid(req)); await send(req, res); } catch (e) { next(e); }
});

router.post('/land/buy', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const place = String((req.body && req.body.place) || ''), c = I.landOf(place);
    if (!c) return bad(res, 400, 'Unknown place.');
    const doc = await ensureDoc(id);
    if ((doc.land || []).length >= I.MAX_LAND) return bad(res, 409, `You can own at most ${I.MAX_LAND} plots.`);
    if ((await econ.debit(id, c.price)) == null) return bad(res, 402, 'Not enough ₦.');
    const ok = await ACInvest.updateOne({ user: id, [`land.${I.MAX_LAND - 1}`]: { $exists: false } }, { $push: { land: { id: nid(), place, paid: c.price, at: Date.now() } } });
    if (!ok.modifiedCount) { await econ.credit(id, c.price); return bad(res, 409, `You can own at most ${I.MAX_LAND} plots.`); }
    await startClock(id);
    await send(req, res, { message: `You bought a plot in ${c.name} 🌴`, flash: `${c.emoji} You now own a plot in ${c.name}. It grows a little every day.` });
  } catch (e) { next(e); }
});

router.post('/land/sell', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const lid = String((req.body && req.body.id) || '');
    const old = await ACInvest.findOneAndUpdate({ user: id, 'land.id': lid }, { $pull: { land: { id: lid } } }, { new: false });
    const l = old && (old.land || []).find((x) => x.id === lid);
    if (!l) return bad(res, 404, 'You don\'t own that plot any more.');
    const worth = I.landWorth(l, Date.now()), c = I.landOf(l.place);
    await econ.credit(id, worth);
    await send(req, res, { message: `Sold ${c ? c.name : 'plot'} for ${naira(worth)}`, flash: `You sold your plot in ${c ? c.name : 'Lagos'} for ${naira(worth)}.` });
  } catch (e) { next(e); }
});

router.post('/biz/buy', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const key = String((req.body && req.body.key) || ''), b = I.bizOf(key);
    if (!b) return bad(res, 400, 'Unknown business.');
    const doc = await ensureDoc(id);
    if ((doc.biz || []).some((x) => x.key === key)) return bad(res, 409, 'You already own that one.');
    if ((await econ.debit(id, b.price)) == null) return bad(res, 402, 'Not enough ₦.');
    const ok = await ACInvest.updateOne({ user: id, 'biz.key': { $ne: key } }, { $push: { biz: { key, paid: b.price, at: Date.now() } } });
    if (!ok.modifiedCount) { await econ.credit(id, b.price); return bad(res, 409, 'You already own that one.'); }
    await startClock(id);
    await send(req, res, { message: `You now own a ${b.name}`, flash: `${b.emoji} You now own a ${b.name} in ${b.area} ${b.emoji} It pays you every evening.` });
  } catch (e) { next(e); }
});

router.post('/biz/sell', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const key = String((req.body && req.body.key) || ''), b = I.bizOf(key);
    if (!b) return bad(res, 400, 'Unknown business.');
    await settle(req.app.get('io'), id);                      // pay what it already earned before it goes
    const old = await ACInvest.findOneAndUpdate({ user: id, 'biz.key': key }, { $pull: { biz: { key } } }, { new: false });
    if (!old) return bad(res, 404, 'You don\'t own that business.');
    const v = I.bizSellValue(key); await econ.credit(id, v);
    await send(req, res, { message: `Sold for ${naira(v)}`, flash: `You sold your ${b.name} for ${naira(v)}.` });
  } catch (e) { next(e); }
});

router.post('/truck/buy', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const doc = await ensureDoc(id), T = I.TRUCK;
    if ((doc.trucks || []).length >= I.MAX_TRUCKS) return bad(res, 409, `You can run at most ${I.MAX_TRUCKS} trailers.`);
    if ((await econ.debit(id, T.price)) == null) return bad(res, 402, 'Not enough ₦.');
    const ok = await ACInvest.updateOne({ user: id, [`trucks.${I.MAX_TRUCKS - 1}`]: { $exists: false } }, { $push: { trucks: { id: nid(), paid: T.price, at: Date.now() } } });
    if (!ok.modifiedCount) { await econ.credit(id, T.price); return bad(res, 409, `You can run at most ${I.MAX_TRUCKS} trailers.`); }
    await startClock(id);
    await send(req, res, { message: 'Trailer bought 🚛', flash: `${T.emoji} A new ${T.name} is on the road. It pays every evening.` });
  } catch (e) { next(e); }
});

router.post('/truck/sell', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const doc = await settle(req.app.get('io'), id);
    const last = doc && (doc.trucks || [])[doc.trucks.length - 1];
    if (!last) return bad(res, 404, 'You don\'t own a trailer.');
    const old = await ACInvest.findOneAndUpdate({ user: id, 'trucks.id': last.id }, { $pull: { trucks: { id: last.id } } }, { new: false });
    if (!old) return bad(res, 409, 'Try again.');
    await econ.credit(id, I.TRUCK.sellOne);
    await send(req, res, { message: `Sold for ${naira(I.TRUCK.sellOne)}`, flash: `You sold a trailer for ${naira(I.TRUCK.sellOne)}.` });
  } catch (e) { next(e); }
});

module.exports = router;
