// Transport app (items 81-100): vehicles, rental, fuel, garage, licence, quizzes, minigames, insurance, roadside help,
// parking, bus and shuttle routes, community traffic reports and reputation.
// Every price, payout and rule is decided here (rules live in utils/actransport.js). The browser only sends ids and its answers.
// Money moves with one atomic update that also checks the balance and the vehicle's current state, so double taps and parallel requests cannot cheat.
const express = require('express');
const User = require('../models/User');
const ACTrafficReport = require('../models/ACTrafficReport');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const T = require('../utils/actransport');
const L = require('../utils/aclagos');
const profanity = require('../utils/profanity');
const { queueCard, timeline } = require('../utils/accards');
const { emitUser } = require('../utils/acnotify');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const trOf = (u) => { const o = u && typeof u.toObject === 'function' ? u.toObject() : u; return (o && o.ac && o.ac.tr) || {}; };
const SESSION_MS = 15 * 60000;
const GAP_MSG = 'Phone → Transport';

/* load the player, make sure the transport block exists and today's counters are fresh */
async function load(id, now = Date.now()) {
  await ensureAC(id);
  const today = T.dayKey(now);
  await User.updateOne({ _id: id, 'ac.tr.rep': { $exists: false } }, { $set: { 'ac.tr.rep': T.REP.start } });
  await User.updateOne({ _id: id, 'ac.tr.day': { $ne: today } }, { $set: { 'ac.tr.day': today, 'ac.tr.signsToday': 0, 'ac.tr.lightToday': 0, 'ac.tr.rideToday': 0, 'ac.tr.rideEarn': 0, 'ac.tr.callsToday': 0 } });
  return User.findById(id);
}
/* pay for something and change the player in the same atomic step */
function pay(id, amount, query = {}, update = {}) {
  const upd = { ...update }; upd.$inc = { ...(update.$inc || {}), 'ac.cash': -amount };
  return User.findOneAndUpdate({ _id: id, 'ac.cash': { $gte: amount }, ...query }, upd, { new: true });
}
const credit = (id, amount, update = {}) => User.findOneAndUpdate({ _id: id }, { ...update, $inc: { ...(update.$inc || {}), 'ac.cash': amount } }, { new: true });
const find = (u, id) => T.vehiclesOf(trOf(u)).find((v) => v.id === id) || null;
const money = T.naira;

async function occupancy(now) {
  const when = new Date(now);
  const rows = await User.aggregate([{ $match: { 'ac.tr.vehicles.park.until': { $gt: when } } }, { $unwind: '$ac.tr.vehicles' }, { $match: { 'ac.tr.vehicles.park.until': { $gt: when } } }, { $group: { _id: '$ac.tr.vehicles.park.lot', n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}
async function state(u, now, extra = {}) {
  const tr = trOf(u), ev = L.currentEvent(now), occ = await occupancy(now), q = T.QUIZ.licence;
  const lastTry = tr.licLast ? new Date(tr.licLast).getTime() : 0, member = T.isMember(tr, now);
  return {
    now, cash: u.ac.cash, event: { id: ev.id, title: ev.title, icon: ev.icon, fa: ev.fa, color: ev.color }, fuelPrice: T.fuelPrice(ev), fareMult: T.fareMult(ev),
    licence: { ok: !!tr.licOk, theory: !!tr.licTheory && !tr.licOk, tries: tr.licTries || 0, retryIn: Math.max(0, lastTry + q.retryMs - now), fee: q.fee },
    vehicles: T.vehiclesOf(tr).map((v) => T.describe(v, now, tr)).filter(Boolean),
    rent: T.rentActive(tr, now) ? { until: new Date(tr.rentUntil).getTime() } : null,
    rep: { ...T.tierOf(tr.rep), insDiscount: T.insDiscount(tr.rep), mult: Math.round((T.repMult(tr.rep) - 1) * 1000) / 10, todayLeft: Math.max(0, T.REP.perDay - (tr.repDay === T.dayKey(now) ? tr.repToday || 0 : 0)) },
    assist: { member, until: member ? new Date(tr.assistUntil).getTime() : 0, callsLeft: Math.max(0, T.ASSIST.maxPerDay - (tr.callsToday || 0)) },
    today: { signsLeft: Math.max(0, T.QUIZ.signs.perDay - (tr.signsToday || 0)), lightLeft: Math.max(0, T.LIGHT.perDay - (tr.lightToday || 0)), ridesLeft: Math.max(0, T.OKADA.perDay - (tr.rideToday || 0)), rideEarn: tr.rideEarn || 0, rideCap: T.OKADA.cap,
      rideWait: Math.max(0, (tr.lastRide ? new Date(tr.lastRide).getTime() : 0) + T.OKADA.cooldownMs - now) },
    lots: T.LOTS.map((l) => ({ ...l, used: Math.min(l.cap, occ[l.id] || 0) })),
    stats: { rides: tr.rides || 0, fines: tr.fines || 0, crashes: tr.crashes || 0, earned: tr.earned || 0 },
    ...extra
  };
}
function catalogue() {
  return {
    vehicles: T.KINDS.map((k) => ({ kind: k, ...T.VEHICLES[k], paintPrice: T.paintPrice(k), mods: T.modsFor(k) })), paints: T.PAINTS, rent: T.RENT,
    ins: Object.entries(T.INS).map(([id, t]) => ({ id, ...t })), insDays: T.INS_DAYS, assist: T.ASSIST, parkMax: T.PARK_MAX_HOURS,
    routes: T.ROUTES, routeMaxHours: T.MAX_ROUTE_HOURS, tiers: T.REP_TIERS, roads: T.ROADS, reportKinds: T.REPORT_KINDS, reports: T.REPORTS,
    quiz: T.QUIZ, light: { rounds: T.LIGHT.rounds, payPerPoint: T.LIGHT.payPerPoint, perDay: T.LIGHT.perDay, pass: T.LIGHT.licencePass }, okada: { rounds: T.OKADA.rounds, lanes: T.OKADA.lanes, perDay: T.OKADA.perDay, cap: T.OKADA.cap, base: T.OKADA.base, perSafe: T.OKADA.perSafe }
  };
}
/* A write can succeed before the follow-up state refresh fails. Never turn that committed
   action into a 500: the client might retry and accidentally repeat a purchase/collection.
   Return the action result, and let the client refresh the state separately. */
async function reply(res, id, now, extra = {}) {
  try {
    const u = await User.findById(id);
    if (!u) return res.status(404).json({ message: 'Your player account could not be refreshed. Reopen Transport and try again.' });
    return res.json(await state(u, now, extra));
  } catch (err) {
    console.error('[transport:post-action-state]', err);
    return res.json({ ...extra, stateRefreshFailed: true, message: 'Your action was processed, but the latest transport status could not be loaded. Refresh Transport before repeating it.' });
  }
}

/* ----- reputation (100): small daily gains, bigger penalties ----- */
async function addRep(id, n, now = Date.now()) {
  await User.updateOne({ _id: id, 'ac.tr.rep': { $exists: false } }, { $set: { 'ac.tr.rep': T.REP.start } });
  if (n < 0) { const r = await User.updateOne({ _id: id, 'ac.tr.rep': { $gte: -n } }, { $inc: { 'ac.tr.rep': n } }); if (!r.modifiedCount) await User.updateOne({ _id: id }, { $set: { 'ac.tr.rep': 0 } }); return n; }
  const u = await User.findById(id).select('ac.tr.rep ac.tr.repDay ac.tr.repToday'), tr = trOf(u), today = T.dayKey(now), used = tr.repDay === today ? tr.repToday || 0 : 0;
  const grant = Math.min(n, T.REP.perDay - used, T.REP.max - (tr.rep || 0)); if (grant <= 0) return 0;
  await User.updateOne({ _id: id }, { $inc: { 'ac.tr.rep': grant }, $set: { 'ac.tr.repDay': today, 'ac.tr.repToday': used + grant } });
  return grant;
}
/* ----- after a motor trip: maybe a crash or a street ticket. Called by the Okada minigame and by Jobs shifts. ----- */
async function afterTrip(id, veh, now = Date.now(), rnd = Math.random) {
  if (!veh || veh.rental) return null;
  const inc = T.incident(veh, now, rnd); if (!inc) return null;
  const hit = await User.findOneAndUpdate({ _id: id, 'ac.cash': { $gte: inc.pay } }, { $inc: { 'ac.cash': -inc.pay, [inc.type === 'crash' ? 'ac.tr.crashes' : 'ac.tr.fines']: 1 } }, { new: true });
  const paid = hit ? inc.pay : 0;
  if (!hit) await User.updateOne({ _id: id }, { $inc: { [inc.type === 'crash' ? 'ac.tr.crashes' : 'ac.tr.fines']: 1 } });   // too broke to pay: waived, still counted
  if (inc.type === 'crash') {
    const w = await User.updateOne({ _id: id, 'ac.tr.vehicles': { $elemMatch: { id: veh.id, cond: { $gte: 8 } } } }, { $inc: { 'ac.tr.vehicles.$.cond': -8 } });
    if (!w.modifiedCount) await User.updateOne({ _id: id, 'ac.tr.vehicles.id': veh.id }, { $set: { 'ac.tr.vehicles.$.cond': 0 } });
  }
  await addRep(id, inc.type === 'crash' ? -2 : -1, now);
  return { type: inc.type, gross: inc.gross, covered: inc.covered, paid };
}
const incidentLine = (i) => (i ? (i.type === 'crash' ? `💥 Minor crash. Repairs ${money(i.gross)}${i.covered ? `, insurance paid ${money(i.covered)}` : ''}.` : `🚔 LASTMA street ticket ${money(i.gross)}${i.covered ? ` (insurance paid ${money(i.covered)})` : ''}. Park in a lot to avoid these.`) : '');

/* ================= state ================= */
router.get('/state', wrap(async (req, res) => { const now = Date.now(), u = await load(uid(req), now); res.json({ ...(await state(u, now)), cat: catalogue() }); }));

/* ================= buy, sell, rent (81-85) ================= */
router.post('/buy', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(), kind = String((req.body && req.body.kind) || ''), d = T.vdef(kind);
  if (!d) return bad(res, 400, 'Unknown vehicle.');
  const u0 = await load(id, now), tr = trOf(u0), list = T.vehiclesOf(tr);
  if (d.licence && !T.hasLicence(tr)) return bad(res, 403, 'You need your driving licence first. Open the Licence tab.');
  if (list.length >= T.MAX_VEHICLES) return bad(res, 409, 'Your garage is full. Sell something first.');
  if (list.filter((v) => v.kind === kind).length >= d.max) return bad(res, 409, d.max === 1 ? `You already own a ${d.name}.` : `You can own at most ${d.max} of those.`);
  const v = T.newVehicle(kind, now);
  const u = await pay(id, d.price, { ['ac.tr.vehicles.' + (T.MAX_VEHICLES - 1)]: { $exists: false } }, { $push: { 'ac.tr.vehicles': v } });
  if (!u) return bad(res, 402, 'Not enough ₦.');
  timeline(id, d.emoji, 'Bought a ' + d.name);
  emitUser(req.app.get('io'), id, 'cash', { delta: -d.price });
  await reply(res, id, now, { card: { icon: d.emoji, title: 'New ride!', text: `${d.name} is yours. The tank is ${Math.round(d.tank ? 60 : 0)}% full, so check the fuel before a long trip.`, lines: [['Paid', money(d.price)]], tone: 'gold', btn: 'Nice one' }, vid: v.id });
}));
router.post('/sell', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(), u0 = await load(id, now), v = find(u0, String((req.body && req.body.id) || ''));
  if (!v) return bad(res, 404, 'Vehicle not found.');
  if (v.route && v.route.id) return bad(res, 409, 'Collect from its route and stop the route first.');
  const price = T.sellPrice(v);
  const u = await User.findOneAndUpdate({ _id: id, 'ac.tr.vehicles': { $elemMatch: { id: v.id, cond: v.cond } } }, { $pull: { 'ac.tr.vehicles': { id: v.id } }, $inc: { 'ac.cash': price } }, { new: true });
  if (!u) return bad(res, 409, 'Something changed. Try again.');
  emitUser(req.app.get('io'), id, 'cash', { delta: price });
  await reply(res, id, now, { flash: `Sold for ${money(price)}` });
}));
router.post('/rent', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(); await load(id, now);
  const until = new Date(now + T.RENT.hours * T.HOUR);
  const u = await pay(id, T.RENT.price, { 'ac.tr.rentUntil': { $not: { $gt: new Date(now) } } }, { $set: { 'ac.tr.rentUntil': until } });
  if (!u) { const cur = await User.findById(id); return T.rentActive(trOf(cur), now) ? bad(res, 409, 'You already have a rented bicycle.') : bad(res, 402, 'Not enough ₦.'); }
  emitUser(req.app.get('io'), id, 'cash', { delta: -T.RENT.price });
  await reply(res, id, now, { flash: `Bicycle rented for ${T.RENT.hours} hours` });
}));

/* ================= fuel, service, garage (86, 87) ================= */
const owned = async (req, res) => {
  const now = Date.now(), id = uid(req), u = await load(id, now), v = find(u, String((req.body && req.body.id) || ''));
  if (!v) { bad(res, 404, 'Vehicle not found.'); return null; }
  return { id, now, u, v, d: T.vdef(v.kind), ev: L.currentEvent(now) };
};
router.post('/fuel', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v, d, ev } = c;
  if (!d.burn) return bad(res, 400, 'A bicycle runs on legs. No fuel needed.');
  const space = Math.round((d.tank - v.fuel) * 10) / 10; if (space <= 0.05) return bad(res, 409, 'The tank is already full.');
  const want = req.body && req.body.full ? space : Math.round(Number(req.body && req.body.litres) * 10) / 10;
  if (!Number.isFinite(want) || want <= 0) return bad(res, 400, 'Choose how many litres.');
  const litres = Math.min(want, space), cost = T.fuelCost(litres, ev);
  const u = await pay(id, cost, { 'ac.tr.vehicles': { $elemMatch: { id: v.id, fuel: v.fuel } } }, { $inc: { 'ac.tr.vehicles.$.fuel': litres } });
  if (!u) return bad(res, 402, 'Not enough ₦, or the tank changed. Try again.');
  emitUser(req.app.get('io'), id, 'cash', { delta: -cost });
  await reply(res, id, now, { flash: `${litres} L added for ${money(cost)}` });
}));
router.post('/service', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v } = c;
  if (v.cond >= 99.5) return bad(res, 409, 'It is already like new.');
  const cost = T.serviceCost(v.kind, v.cond);
  const u = await pay(id, cost, { 'ac.tr.vehicles': { $elemMatch: { id: v.id, cond: v.cond } } }, { $set: { 'ac.tr.vehicles.$.cond': 100 } });
  if (!u) return bad(res, 402, 'Not enough ₦, or the condition changed. Try again.');
  emitUser(req.app.get('io'), id, 'cash', { delta: -cost });
  await reply(res, id, now, { flash: `Serviced for ${money(cost)}` });
}));
router.post('/paint', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v } = c, p = T.PAINT_BY[String((req.body && req.body.paint) || '')];
  if (!p) return bad(res, 400, 'Unknown colour.'); if (v.paint === p.id) return bad(res, 409, 'It already has that colour.');
  const cost = T.paintPrice(v.kind);
  const u = await pay(id, cost, { 'ac.tr.vehicles.id': v.id }, { $set: { 'ac.tr.vehicles.$.paint': p.id } });
  if (!u) return bad(res, 402, 'Not enough ₦.');
  emitUser(req.app.get('io'), id, 'cash', { delta: -cost });
  await reply(res, id, now, { flash: `Sprayed ${p.name}` });
}));
router.post('/mod', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v } = c, key = String((req.body && req.body.mod) || ''), m = T.MODS[key];
  if (!m || !m.for.includes(v.kind)) return bad(res, 400, 'That upgrade does not fit this vehicle.');
  if ((v.mods || []).includes(key)) return bad(res, 409, 'Already installed.');
  const cost = T.modPrice(key, v.kind);
  const u = await pay(id, cost, { 'ac.tr.vehicles': { $elemMatch: { id: v.id, mods: { $ne: key } } } }, { $push: { 'ac.tr.vehicles.$.mods': key } });
  if (!u) return bad(res, 402, 'Not enough ₦.');
  emitUser(req.app.get('io'), id, 'cash', { delta: -cost });
  await reply(res, id, now, { flash: `${m.name} fitted. Pay boost +${m.tip}%` });
}));

/* ================= insurance (96) and roadside assistance (97) ================= */
router.post('/insure', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v, u: u0 } = c, tier = String((req.body && req.body.tier) || ''), t = T.INS[tier];
  if (!t) return bad(res, 400, 'Pick a cover plan.');
  const cur = T.insured(v, now), left = cur ? new Date(v.insUntil).getTime() - now : 0;
  if (cur && v.insTier === tier && left > 5 * T.DAY) return bad(res, 409, 'You are covered. You can renew in the last 5 days.');
  const base = cur && v.insTier === tier ? new Date(v.insUntil).getTime() : now, until = new Date(base + T.INS_DAYS * T.DAY), cost = T.insPrice(tier, v.kind, trOf(u0).rep);
  const u = await pay(id, cost, { 'ac.tr.vehicles': { $elemMatch: { id: v.id } } }, { $set: { 'ac.tr.vehicles.$.insTier': tier, 'ac.tr.vehicles.$.insUntil': until } });
  if (!u) return bad(res, 402, 'Not enough ₦.');
  timeline(id, '🛡️', `Insured a ${T.vdef(v.kind).name} (${t.name})`);
  emitUser(req.app.get('io'), id, 'cash', { delta: -cost });
  await reply(res, id, now, { flash: `${t.name} cover active for ${T.INS_DAYS} days` });
}));
router.post('/assist/join', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(), u0 = await load(id, now), tr = trOf(u0), cur = T.isMember(tr, now) ? new Date(tr.assistUntil).getTime() : now;
  if (cur - now > 21 * T.DAY) return bad(res, 409, 'You are covered for weeks already.');
  const u = await pay(id, T.ASSIST.weekPrice, {}, { $set: { 'ac.tr.assistUntil': new Date(cur + T.ASSIST.days * T.DAY) } });
  if (!u) return bad(res, 402, 'Not enough ₦.');
  emitUser(req.app.get('io'), id, 'cash', { delta: -T.ASSIST.weekPrice });
  await reply(res, id, now, { flash: 'Roadside membership active' });
}));
router.post('/assist/call', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v, d, ev, u: u0 } = c, kind = String((req.body && req.body.service) || ''), member = T.isMember(trOf(u0), now);
  if ((trOf(u0).callsToday || 0) >= T.ASSIST.maxPerDay) return bad(res, 429, 'The recovery team is busy. Try again tomorrow.');
  const callout = member ? 0 : T.ASSIST.callout;
  let cost, set;
  if (kind === 'fuel') {
    if (!d.burn) return bad(res, 400, 'Bicycles do not need fuel.');
    if (v.fuel > d.tank * 0.2) return bad(res, 409, 'Your tank is fine. Roadside fuel is only for nearly empty tanks.');
    const litres = Math.min(T.ASSIST.litres, Math.round((d.tank - v.fuel) * 10) / 10);
    cost = callout + Math.round(T.fuelCost(litres, ev) * (member ? 1 - T.ASSIST.memberFuelOff : 1)); set = { $inc: { 'ac.tr.vehicles.$.fuel': litres } };
  } else if (kind === 'fix') {
    if (v.cond >= T.ASSIST.fixTo) return bad(res, 409, 'It does not need an emergency fix.');
    cost = callout + Math.round(T.serviceCost(v.kind, v.cond, T.ASSIST.fixTo) * (member ? 0.8 : 1)); set = { $set: { 'ac.tr.vehicles.$.cond': T.ASSIST.fixTo } };
  } else return bad(res, 400, 'Choose fuel or fix.');
  const u = await pay(id, cost, { 'ac.tr.vehicles': { $elemMatch: { id: v.id, fuel: v.fuel, cond: v.cond } }, 'ac.tr.callsToday': { $lt: T.ASSIST.maxPerDay } }, { ...set, $inc: { ...(set.$inc || {}), 'ac.tr.callsToday': 1 } });
  if (!u) return bad(res, 402, 'Not enough ₦, or the vehicle changed. Try again.');
  emitUser(req.app.get('io'), id, 'cash', { delta: -cost });
  await reply(res, id, now, { flash: `Help arrived. ${money(cost)}` });
}));

/* ================= parking lots (98) ================= */
router.post('/park', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v, d, u: u0 } = c, lot = T.LOT_BY[String((req.body && req.body.lot) || '')], hours = Math.floor(Number(req.body && req.body.hours));
  if (!lot) return bad(res, 400, 'Unknown parking lot.'); if (!(hours >= 1 && hours <= T.PARK_MAX_HOURS)) return bad(res, 400, `Park for 1 to ${T.PARK_MAX_HOURS} hours.`);
  if (v.kind === 'boat') return bad(res, 400, 'Boats berth at the marina, not in car parks.');
  if (v.route && v.route.id) return bad(res, 409, 'That vehicle is out on a route.');
  if (T.parked(v, now)) return bad(res, 409, 'It is already parked.');
  if (T.vehiclesOf(trOf(u0)).some((x) => x.id !== v.id && T.parked(x, now) && x.park.lot === lot.id)) return bad(res, 409, 'You already have a vehicle in this lot.');
  const occ = await occupancy(now); if ((occ[lot.id] || 0) >= lot.cap) return bad(res, 409, `${lot.name} is full. Try another lot.`);
  const cost = lot.hr * hours, until = new Date(now + hours * T.HOUR);
  const u = await pay(id, cost, { 'ac.tr.vehicles': { $elemMatch: { id: v.id } } }, { $set: { 'ac.tr.vehicles.$.park.lot': lot.id, 'ac.tr.vehicles.$.park.until': until } });
  if (!u) return bad(res, 402, 'Not enough ₦.');
  const after = await occupancy(now);       // two players grabbing the last space together: whoever lands second is refunded
  if ((after[lot.id] || 0) > lot.cap) {
    await User.updateOne({ _id: id, 'ac.tr.vehicles.id': v.id }, { $set: { 'ac.tr.vehicles.$.park.lot': '', 'ac.tr.vehicles.$.park.until': null }, $inc: { 'ac.cash': cost } });
    return bad(res, 409, `${lot.name} just filled up. You were not charged.`);
  }
  emitUser(req.app.get('io'), id, 'cash', { delta: -cost });
  await reply(res, id, now, { flash: `Parked at ${lot.name} for ${hours}h` });
}));
router.post('/unpark', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v } = c;
  if (!T.parked(v, now)) return bad(res, 409, 'It is not parked.');
  await User.updateOne({ _id: id, 'ac.tr.vehicles.id': v.id }, { $set: { 'ac.tr.vehicles.$.park.lot': '', 'ac.tr.vehicles.$.park.until': null } });
  await reply(res, id, now, { flash: 'Left the lot. The time you paid for is not refunded.' });
}));

/* ================= rounds that need an answer from the browser: quiz (88, 89), lights (90), Okada (84) =================
   The server keeps the right answers / hazards in tr.sess and takes the round back with one atomic update, so a round can only be finished once. */
const newToken = () => T.newId() + T.newId();
async function takeRound(id, token, kinds) {
  const old = await User.findOneAndUpdate({ _id: id, 'ac.tr.sess.token': String(token || '') }, { $set: { 'ac.tr.sess': null } }, { new: false });
  const s = old && trOf(old).sess; if (!s || !kinds.includes(s.kind)) return null; return s;
}
router.post('/quiz/start', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(), kind = String((req.body && req.body.kind) || ''), u0 = await load(id, now), tr = trOf(u0);
  if (kind !== 'signs' && kind !== 'licence') return bad(res, 400, 'Unknown quiz.');
  const quiz = T.buildQuiz(kind), token = newToken(), sess = { kind, token, answers: quiz.answers, startedAt: now, count: quiz.answers.length };
  let u;
  if (kind === 'signs') {
    if ((tr.signsToday || 0) >= T.QUIZ.signs.perDay) return bad(res, 429, 'You have done enough sign quizzes today. Come back tomorrow.');
    u = await User.findOneAndUpdate({ _id: id, 'ac.tr.signsToday': { $lt: T.QUIZ.signs.perDay } }, { $inc: { 'ac.tr.signsToday': 1 }, $set: { 'ac.tr.sess': sess } }, { new: true });
  } else {
    if (tr.licOk) return bad(res, 409, 'You already have your licence.');
    if (tr.licTheory) return bad(res, 409, 'You passed the theory. Take the practical test (traffic lights) next.');
    const wait = (tr.licLast ? new Date(tr.licLast).getTime() : 0) + T.QUIZ.licence.retryMs - now;
    if (wait > 0) return bad(res, 429, `Come back in ${Math.ceil(wait / 1000)} seconds to try again.`);
    u = await pay(id, T.QUIZ.licence.fee, { 'ac.tr.licOk': null, 'ac.tr.licTheory': null }, { $set: { 'ac.tr.sess': sess, 'ac.tr.licLast': new Date(now) }, $inc: { 'ac.tr.licTries': 1 } });
    if (!u) return bad(res, 402, `The test fee is ${money(T.QUIZ.licence.fee)}. You need more ₦.`);
    emitUser(req.app.get('io'), id, 'cash', { delta: -T.QUIZ.licence.fee });
  }
  if (!u) return bad(res, 409, 'Could not start. Try again.');
  res.json({ token, questions: quiz.questions, kind, cash: u.ac.cash, fee: kind === 'licence' ? T.QUIZ.licence.fee : 0 });
}));
router.post('/quiz/finish', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(), s = await takeRound(id, req.body && req.body.token, ['signs', 'licence']);
  if (!s) return bad(res, 409, 'That round is already over.');
  const cfg = T.QUIZ[s.kind];
  if (now - s.startedAt > SESSION_MS) return bad(res, 410, 'Time ran out for that round.');
  if (now - s.startedAt < cfg.minSecondsPerQ * s.count * 1000) return bad(res, 400, 'That was too fast to be real.');
  const right = T.gradeQuiz(req.body && req.body.answers, s.answers); if (right == null) return bad(res, 400, 'Bad answers.');
  let out = { kind: s.kind, right, count: s.count, answers: s.answers };
  if (s.kind === 'signs') {
    const reward = T.signsReward(right); if (reward) await credit(id, reward);
    if (right === s.count) await addRep(id, 1, now);
    out = { ...out, reward, perfect: right === s.count };
    if (reward) emitUser(req.app.get('io'), id, 'cash', { delta: reward });
  } else {
    const pass = right >= cfg.pass; out = { ...out, pass, need: cfg.pass };
    if (pass) { await User.updateOne({ _id: id }, { $set: { 'ac.tr.licTheory': new Date(now) } }); timeline(id, '📘', 'Passed the driving theory test'); }
  }
  await reply(res, id, now, { result: out });
}));
router.post('/light/start', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(), mode = req.body && req.body.mode === 'licence' ? 'licence_light' : 'light', u0 = await load(id, now), tr = trOf(u0);
  const plan = T.lightPlan(), sess = { kind: mode, token: newToken(), plan, startedAt: now };
  let u;
  if (mode === 'light') {
    if ((tr.lightToday || 0) >= T.LIGHT.perDay) return bad(res, 429, 'You have done enough timing rounds today.');
    u = await User.findOneAndUpdate({ _id: id, 'ac.tr.lightToday': { $lt: T.LIGHT.perDay } }, { $inc: { 'ac.tr.lightToday': 1 }, $set: { 'ac.tr.sess': sess } }, { new: true });
  } else {
    if (tr.licOk) return bad(res, 409, 'You already have your licence.'); if (!tr.licTheory) return bad(res, 409, 'Pass the theory test first.');
    const wait = (tr.licLast ? new Date(tr.licLast).getTime() : 0) + 30000 - now; if (wait > 0) return bad(res, 429, `Wait ${Math.ceil(wait / 1000)} seconds before the next attempt.`);
    u = await User.findOneAndUpdate({ _id: id, 'ac.tr.licOk': null }, { $set: { 'ac.tr.sess': sess, 'ac.tr.licLast': new Date(now) } }, { new: true });
  }
  if (!u) return bad(res, 409, 'Could not start. Try again.');
  res.json({ token: sess.token, delays: plan, mode, rounds: plan.length });
}));
router.post('/light/finish', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(), s = await takeRound(id, req.body && req.body.token, ['light', 'licence_light']);
  if (!s) return bad(res, 409, 'That round is already over.');
  const times = req.body && req.body.times, g = T.gradeLight(s.plan, times);
  if (g.bad) return bad(res, 400, 'Those timings do not look right.');
  if (now - s.startedAt < T.lightMinElapsed(s.plan, times) - 1500) return bad(res, 400, 'That was too fast to be real.');
  let out = { points: g.points, max: s.plan.length * 3, early: g.early, avg: g.avg };
  if (s.kind === 'light') {
    const reward = g.points * T.LIGHT.payPerPoint; if (reward) { await credit(id, reward); emitUser(req.app.get('io'), id, 'cash', { delta: reward }); }
    if (g.points >= s.plan.length * 3 - 3) await addRep(id, 1, now);
    out = { ...out, mode: 'light', reward };
  } else {
    const pass = g.points >= T.LIGHT.licencePass && g.early <= T.LIGHT.maxEarly; out = { ...out, mode: 'licence', pass, need: T.LIGHT.licencePass };
    if (pass) { await User.updateOne({ _id: id }, { $set: { 'ac.tr.licOk': new Date(now) } }); timeline(id, '🪪', 'Got my driving licence'); }
  }
  await reply(res, id, now, { result: out });
}));
router.post('/okada/start', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(), u0 = await load(id, now), tr = trOf(u0);
  const pick = T.pickVehicle(tr, ['motorcycle'], now, T.OKADA.hours); if (pick.err) return bad(res, 409, pick.err);
  if ((tr.rideToday || 0) >= T.OKADA.perDay) return bad(res, 429, 'You have given enough rides today. Rest your motorcycle.');
  if ((tr.rideEarn || 0) >= T.OKADA.cap) return bad(res, 429, 'You hit the daily Okada earnings limit. Come back tomorrow.');
  const wait = (tr.lastRide ? new Date(tr.lastRide).getTime() : 0) + T.OKADA.cooldownMs - now; if (wait > 0) return bad(res, 429, `Next passenger in ${Math.ceil(wait / 1000)}s.`);
  const plan = T.okadaPlan(), sess = { kind: 'okada', token: newToken(), plan, vid: pick.v.id, startedAt: now };
  const u = await User.findOneAndUpdate({ _id: id, 'ac.tr.rideToday': { $lt: T.OKADA.perDay }, $or: [{ 'ac.tr.lastRide': null }, { 'ac.tr.lastRide': { $lte: new Date(now - T.OKADA.cooldownMs) } }] }, { $inc: { 'ac.tr.rideToday': 1 }, $set: { 'ac.tr.sess': sess, 'ac.tr.lastRide': new Date(now) } }, { new: true });
  if (!u) return bad(res, 429, 'Next passenger is not ready yet.');
  res.json({ token: sess.token, passenger: plan.passenger, from: plan.from, to: plan.to, rounds: plan.rounds });
}));
router.post('/okada/finish', wrap(async (req, res) => {
  const id = uid(req), now = Date.now(), s = await takeRound(id, req.body && req.body.token, ['okada']);
  if (!s) return bad(res, 409, 'That ride is already over.');
  if (now - s.startedAt > SESSION_MS) return bad(res, 410, 'The passenger got tired of waiting.');
  if (now - s.startedAt < T.OKADA.minMs) return bad(res, 400, 'That was too fast to be real.');
  const safe = T.gradeOkada(s.plan, req.body && req.body.lanes); if (safe == null) return bad(res, 400, 'Bad ride data.');
  const u0 = await load(id, now), tr = trOf(u0), pick = T.pickVehicle(tr, ['motorcycle'], now, T.OKADA.hours);
  if (pick.err || pick.v.id !== s.vid) return bad(res, 409, pick.err || 'Your motorcycle is not available any more.');
  const ev = L.currentEvent(now); let fare = T.okadaFare(safe, ev, T.tipPct(pick.v)); fare = Math.max(0, Math.min(fare, T.OKADA.cap - (tr.rideEarn || 0)));
  const u = await User.findOneAndUpdate({ _id: id, 'ac.tr.vehicles': { $elemMatch: { id: pick.v.id, fuel: { $gte: pick.burn }, cond: { $gte: pick.wear } } } },
    { $inc: { 'ac.cash': fare, 'ac.tr.earned': fare, 'ac.tr.rideEarn': fare, 'ac.tr.rides': 1, 'ac.tr.vehicles.$.fuel': -pick.burn, 'ac.tr.vehicles.$.cond': -pick.wear } }, { new: true });
  if (!u) return bad(res, 409, 'Your motorcycle ran out of fuel or needs a service.');
  emitUser(req.app.get('io'), id, 'cash', { delta: fare });
  if (safe === T.OKADA.rounds) await addRep(id, 1, now);
  const inc = await afterTrip(id, pick.v, now);
  await reply(res, id, now, { result: { safe, rounds: T.OKADA.rounds, fare, passenger: s.plan.passenger, to: s.plan.to, incident: incidentLine(inc) } });
}));

/* ================= bus route business (91) and airport shuttle business (95) ================= */
router.post('/route/assign', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v, u: u0 } = c, r = T.ROUTE_BY[String((req.body && req.body.route) || '')], tr = trOf(u0);
  if (!r) return bad(res, 400, 'Unknown route.'); if (r.kind !== v.kind) return bad(res, 400, `That route needs a ${T.vdef(r.kind).name}.`);
  if (v.route && v.route.id) return bad(res, 409, 'Already on a route. Collect and stop it first.');
  if (!T.hasLicence(tr)) return bad(res, 403, 'You need your driving licence first.');
  if ((tr.rep || 0) < r.minRep) return bad(res, 403, `This route opens at reputation ${r.minRep}. Yours is ${Math.floor(tr.rep || 0)}.`);
  if (v.fuel < r.burn || v.cond <= 0) return bad(res, 409, 'Refuel or service the vehicle first.');
  const u = await User.findOneAndUpdate({ _id: id, 'ac.tr.vehicles': { $elemMatch: { id: v.id, 'route.id': { $in: ['', null] } } } }, { $set: { 'ac.tr.vehicles.$.route.id': r.id, 'ac.tr.vehicles.$.route.since': new Date(now), 'ac.tr.vehicles.$.park.lot': '', 'ac.tr.vehicles.$.park.until': null } }, { new: true });
  if (!u) return bad(res, 409, 'Something changed. Try again.');
  timeline(id, T.vdef(v.kind).emoji, 'Started the ' + r.name + ' route');
  await reply(res, id, now, { flash: `${r.name} is running` });
}));
router.post('/route/collect', wrap(async (req, res) => {
  const c = await owned(req, res); if (!c) return; const { id, now, v, ev, u: u0 } = c, tr = trOf(u0), stop = !!(req.body && req.body.stop);
  const r = v.route && v.route.id ? T.ROUTE_BY[v.route.id] : null; if (!r) return bad(res, 409, 'That vehicle is not on a route.');
  const a = T.accrue(r, v, v.route.since, now, { rep: tr.rep, ev });
  if (!a.income && !stop && !a.limited) return bad(res, 409, 'Nothing to collect yet. Give it a few more minutes.');
  const fuelUsed = Math.min(v.fuel, a.fuelUsed), wear = Math.min(v.cond, a.wear), end = stop || !!a.limited;          // out of fuel or worn out: the route stops
  const set = end ? { 'ac.tr.vehicles.$.route.id': '', 'ac.tr.vehicles.$.route.since': null } : { 'ac.tr.vehicles.$.route.since': new Date(now) };
  const u = await User.findOneAndUpdate({ _id: id, 'ac.tr.vehicles': { $elemMatch: { id: v.id, 'route.since': new Date(v.route.since) } } },
    { $set: set, $inc: { 'ac.cash': a.income, 'ac.tr.earned': a.income, 'ac.tr.vehicles.$.fuel': -fuelUsed, 'ac.tr.vehicles.$.cond': -wear } }, { new: true });
  if (!u) return bad(res, 409, 'Already collected. Try again.');
  if (a.income) emitUser(req.app.get('io'), id, 'cash', { delta: a.income });
  let repNote = '';
  if (a.limited) { await addRep(id, -1, now); repNote = a.limited === 'fuel' ? 'Passengers were stranded when the fuel ran out (reputation -1).' : 'The vehicle was too worn to keep going (reputation -1).'; }
  else if (a.hours >= 4) { const g = await addRep(id, 1, now); if (g) repNote = 'Passengers were happy (reputation +1).'; }
  const card = a.income ? { icon: T.vdef(v.kind).emoji, title: r.kind === 'van' ? 'Shuttle earnings' : 'Fares collected', text: `${r.name}: ${Math.round(a.hours * 10) / 10} hours on the road.${repNote ? ' ' + repNote : ''}`, lines: [['Earned', money(a.income)], ['Fuel used', fuelUsed + ' L']], tone: a.limited ? 'warn' : 'good', btn: 'Nice one' } : null;
  await reply(res, id, now, { card, flash: !card ? (repNote || 'Route stopped') : '' });
}));

/* ================= community traffic reports (99) ================= */
router.get('/reports', wrap(async (req, res) => {
  const me = uid(req), now = Date.now(), u = await load(me, now), tr = trOf(u);
  const list = await ACTrafficReport.find({ at: { $gte: new Date(now - T.REPORTS.ttlMs) } }).sort({ at: -1 }).limit(200).lean();
  const reports = T.summarize(list, now).map((r) => ({ id: String(r._id), road: r.road, kind: r.kind, note: r.note, name: r.name, at: new Date(r.at).getTime(), up: (r.up || []).length, down: (r.down || []).length, mine: r.user === me, vote: (r.up || []).includes(me) ? 'up' : (r.down || []).includes(me) ? 'down' : '' }));
  const used = tr.reportsDay === T.dayKey(now) ? tr.reportsToday || 0 : 0;
  res.json({ reports, left: Math.max(0, T.REPORTS.perDay - used), waitMs: Math.max(0, (tr.lastReport ? new Date(tr.lastReport).getTime() : 0) + T.REPORTS.gapMs - now) });
}));
router.post('/reports', wrap(async (req, res) => {
  const me = uid(req), now = Date.now(), b = req.body || {}, u = await load(me, now), tr = trOf(u), today = T.dayKey(now);
  if (!T.ROADS.includes(String(b.road))) return bad(res, 400, 'Pick a road from the list.'); if (!T.REPORT_KINDS[b.kind]) return bad(res, 400, 'Pick what is happening.');
  const note = profanity.clean(String(b.note || '').replace(/\s+/g, ' ').trim().slice(0, T.REPORTS.noteMax));
  const used = tr.reportsDay === today ? tr.reportsToday || 0 : 0; if (used >= T.REPORTS.perDay) return bad(res, 429, 'That is enough reports for today. Thank you!');
  if (await ACTrafficReport.exists({ user: me, road: b.road, at: { $gte: new Date(now - T.REPORTS.ttlMs) } })) return bad(res, 409, 'You already reported that road. Others can confirm it.');
  const gate = await User.findOneAndUpdate({ _id: me, $or: [{ 'ac.tr.lastReport': null }, { 'ac.tr.lastReport': { $lte: new Date(now - T.REPORTS.gapMs) } }] }, { $set: { 'ac.tr.lastReport': new Date(now), 'ac.tr.reportsDay': today, 'ac.tr.reportsToday': used + 1 } }, { new: true });
  if (!gate) return bad(res, 429, 'Slow down. One report every few minutes.');
  await ACTrafficReport.create({ road: b.road, kind: b.kind, note, user: me, name: u.acUsername ? '@' + u.acUsername : u.displayName || 'Driver' });
  res.json({ ok: true, flash: 'Report posted. Thanks for helping other drivers!' });
}));
router.post('/reports/:id/vote', wrap(async (req, res) => {
  const me = uid(req), now = Date.now(), dir = req.body && req.body.v === 'down' ? 'down' : 'up';
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return bad(res, 400, 'Bad report.');
  const r = await ACTrafficReport.findOneAndUpdate({ _id: req.params.id, at: { $gte: new Date(now - T.REPORTS.ttlMs) }, user: { $ne: me }, up: { $ne: me }, down: { $ne: me } }, { $addToSet: { [dir]: me } }, { new: true });
  if (!r) return bad(res, 409, 'You cannot vote on that one (your own, already voted, or expired).');
  if (dir === 'up' && !r.paid && r.up.length >= T.REPORTS.confirmsToPay) {
    const won = await ACTrafficReport.findOneAndUpdate({ _id: r._id, paid: false }, { $set: { paid: true } }, { new: true });
    if (won) {                              // the reporter earns a small reward once enough drivers confirm it, up to a daily limit
      const today = T.dayKey(now), a = await User.findById(won.user).select('ac.tr.reportPaidDay ac.tr.reportPaidToday'), at = trOf(a), spent = at.reportPaidDay === today ? at.reportPaidToday || 0 : 0, amt = Math.min(T.REPORTS.pay, T.REPORTS.paidPerDay - spent);
      if (amt > 0 && a) {
        await credit(won.user, amt, { $set: { 'ac.tr.reportPaidDay': today, 'ac.tr.reportPaidToday': spent + amt } });
        await addRep(won.user, 1, now);
        queueCard(req.app.get('io'), won.user, { icon: '🚦', title: 'Your report helped!', text: `Other drivers confirmed your ${T.REPORT_KINDS[won.kind].label.toLowerCase()} report on ${won.road}.`, lines: [['Reward', money(amt)]], tone: 'good', btn: 'Nice one' }).catch(() => {});
      }
    }
  }
  res.json({ ok: true, up: r.up.length, down: r.down.length });
}));

/* ================= reputation board (100) ================= */
router.get('/top', wrap(async (req, res) => {
  const me = uid(req), now = Date.now(), u = await load(me, now), mine = trOf(u).rep || 0, has = { 'ac.tr.vehicles.0': { $exists: true } };
  const rows = await User.find({ ...has, 'ac.tr.rep': { $gt: 0 } }).sort({ 'ac.tr.rep': -1, _id: 1 }).limit(10).select('acUsername displayName ac.tr.rep').lean();
  const rank = (await User.countDocuments({ ...has, 'ac.tr.rep': { $gt: mine } })) + 1;
  res.json({ top: rows.map((r, i) => ({ rank: i + 1, name: r.acUsername ? '@' + r.acUsername : r.displayName || 'Driver', rep: Math.floor(r.ac.tr.rep), tier: T.tierOf(r.ac.tr.rep).name, me: String(r._id) === me })), mine: { rank, rep: Math.floor(mine) } });
}));

module.exports = router;
module.exports.afterTrip = afterTrip;
module.exports.addRep = addRep;
module.exports.incidentLine = incidentLine;
module.exports.GAP_MSG = GAP_MSG;
