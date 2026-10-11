// Venues app: open a cinema, restaurant, salon ... (ids 101-120). Prices, income and sale values are decided HERE and in
// utils/acvenues.js, never by the client. Money moves through utils/economy.js (the same balance as games, bank and Invest).
const express = require('express');
const ACVenue = require('../models/ACVenue');
const ensureAuth = require('../middleware/auth');
const econ = require('../utils/economy');
const V = require('../utils/acvenues');
const H = require('../utils/achub');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const naira = (n) => '₦' + Math.floor(n).toLocaleString('en-NG');
const hits = new Map();
const limited = (id) => { const n = Date.now(), a = (hits.get(id) || []).filter((t) => n - t < 60000); if (a.length >= 40) { hits.set(id, a); return true; } a.push(n); hits.set(id, a); return false; };
const ensureDoc = async (id) => { try { await ACVenue.updateOne({ user: id }, { $setOnInsert: { user: id } }, { upsert: true }); } catch (e) { if (e.code !== 11000) throw e; } return ACVenue.findOne({ user: id }); };

// New-player protection (same rule as Invest): big purchases wait until the first week is over.
const protectedBuy = (req, price) => H.isProtected(req.user.createdAt) && price > H.PROTECT.investMax;
const protectMsg = () => `New-player protection: you can spend up to ${naira(H.PROTECT.investMax)} on a venue for your first ${H.PROTECT_DAYS} days.`;

function view(id, doc, cash) {
  const now = Date.now(), own = new Map((doc.venues || []).map((v) => [v.key, v]));
  let pending = 0, worth = 0, perDay = 0;
  const list = V.VENUES.map((c) => {
    const o = own.get(c.key), row = { id: c.id, key: c.key, name: c.name, emoji: c.emoji, fa: c.fa, color: c.color, area: c.area, blurb: c.blurb, price: c.price, peak: V.PEAK_TEXT[c.peak] || '', owned: !!o,
      maxLevel: V.MAX_LEVEL, perDay1: V.netPerDay(c, 1) };
    if (o) {
      const acc = V.accrue(id, c, o.level, o.last || o.at || now, now), full = acc.hours >= V.MAX_HOURS;
      Object.assign(row, { level: o.level, paid: o.paid, since: o.at, pending: Math.max(0, acc.net), hours: acc.hours, full, perDay: V.netPerDay(c, o.level), sell: V.closeValue(o.paid),
        upgradeTo: o.level < V.MAX_LEVEL ? o.level + 1 : null, upgradePrice: o.level < V.MAX_LEVEL ? V.upgradePrice(c, o.level + 1) : null, total: (doc.tot && doc.tot[c.key]) || 0 });
      pending += row.pending; worth += row.sell; perDay += row.perDay;
    }
    return row;
  });
  return { cash, now, venues: list, summary: { owned: own.size, total: V.VENUES.length, pending, worth, perDay, earned: doc.earned || 0, taxPct: Math.round(V.TAX * 100), upkeepPct: Math.round(V.UPKEEP * 100), maxHours: V.MAX_HOURS } };
}
const send = async (req, res, extra = {}) => {
  const id = uid(req), doc = await ACVenue.findOne({ user: id }) || await ensureDoc(id);
  res.json({ ...view(id, doc, await econ.balance(id)), ...extra });
};

// Collect what one venue has earned. The compare-and-set on `last` means the same hours are paid exactly once, even with two screens open.
async function collectOne(id, key) {
  const c = V.venueOf(key); if (!c) return 0;
  for (let tries = 0; tries < 3; tries++) {
    const doc = await ACVenue.findOne({ user: id }); const o = doc && (doc.venues || []).find((x) => x.key === key); if (!o) return 0;
    const now = Date.now(), last = o.last || o.at || now, acc = V.accrue(id, c, o.level, last, now);
    if (acc.hours < 1) return 0;
    const net = Math.max(0, acc.net);
    const won = await ACVenue.updateOne({ user: id, venues: { $elemMatch: { key, last: o.last } } }, { $set: { 'venues.$.last': now }, $inc: { earned: net, ['tot.' + key]: net } });
    if (!won.modifiedCount) continue;                         // another screen collected first: look again
    if (net) await econ.credit(id, net);
    return net;
  }
  return 0;
}

router.get('/state', async (req, res, next) => { try { await ensureDoc(uid(req)); await send(req, res); } catch (e) { next(e); } });

router.post('/open', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const c = V.venueOf(req.body && req.body.key); if (!c) return bad(res, 400, 'Unknown venue.');
    if (protectedBuy(req, c.price)) return bad(res, 403, protectMsg());
    const doc = await ensureDoc(id);
    if ((doc.venues || []).some((x) => x.key === c.key)) return bad(res, 409, `You already run a ${c.name}.`);
    if ((await econ.debit(id, c.price)) == null) return bad(res, 402, 'Not enough ₦.');
    const now = Date.now();
    const ok = await ACVenue.updateOne({ user: id, 'venues.key': { $ne: c.key } }, { $push: { venues: { key: c.key, level: 1, paid: c.price, at: now, last: now } } });
    if (!ok.modifiedCount) { await econ.credit(id, c.price); return bad(res, 409, `You already run a ${c.name}.`); }
    await send(req, res, { message: `${c.name} is open`, flash: `${c.emoji} Your ${c.name} in ${c.area} is open for business. Come back to collect your income.` });
  } catch (e) { next(e); }
});

router.post('/upgrade', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const c = V.venueOf(req.body && req.body.key); if (!c) return bad(res, 400, 'Unknown venue.');
    const doc = await ensureDoc(id), o = (doc.venues || []).find((x) => x.key === c.key);
    if (!o) return bad(res, 404, `You don't run a ${c.name} yet.`);
    if (o.level >= V.MAX_LEVEL) return bad(res, 409, 'Already at the top level.');
    const to = o.level + 1, cost = V.upgradePrice(c, to);
    if (protectedBuy(req, cost)) return bad(res, 403, protectMsg());
    await collectOne(id, c.key);                                // bank what the old level earned first
    if ((await econ.debit(id, cost)) == null) return bad(res, 402, 'Not enough ₦.');
    const ok = await ACVenue.updateOne({ user: id, venues: { $elemMatch: { key: c.key, level: o.level } } }, { $set: { 'venues.$.level': to }, $inc: { 'venues.$.paid': cost } });
    if (!ok.modifiedCount) { await econ.credit(id, cost); return bad(res, 409, 'Something changed, try again.'); }
    await send(req, res, { message: `${c.name} upgraded`, flash: `${c.emoji} ${c.name} is now level ${to}. It earns more every day.` });
  } catch (e) { next(e); }
});

router.post('/collect', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const doc = await ensureDoc(id), b = req.body || {};
    const keys = b.all ? (doc.venues || []).map((x) => x.key) : [String(b.key || '')];
    if (!b.all && !V.venueOf(keys[0])) return bad(res, 400, 'Unknown venue.');
    let got = 0; for (const k of keys) got += await collectOne(id, k);
    await send(req, res, got ? { message: `Collected ${naira(got)}`, flash: `💰 You collected ${naira(got)} after upkeep and ${Math.round(V.TAX * 100)}% tax.` } : { message: 'Nothing to collect yet', flash: 'Nothing to collect yet. Customers are still coming in.' });
  } catch (e) { next(e); }
});

router.post('/close', async (req, res, next) => {
  try {
    const id = uid(req); if (limited(id)) return bad(res, 429, 'Slow down a little.');
    const c = V.venueOf(req.body && req.body.key); if (!c) return bad(res, 400, 'Unknown venue.');
    await collectOne(id, c.key);
    const old = await ACVenue.findOneAndUpdate({ user: id, 'venues.key': c.key }, { $pull: { venues: { key: c.key } } }, { new: false });
    const o = old && (old.venues || []).find((x) => x.key === c.key);
    if (!o) return bad(res, 404, `You don't run a ${c.name}.`);
    const back = V.closeValue(o.paid); await econ.credit(id, back);
    await send(req, res, { message: `${c.name} closed`, flash: `You closed your ${c.name} and got ${naira(back)} back.` });
  } catch (e) { next(e); }
});

module.exports = router;
