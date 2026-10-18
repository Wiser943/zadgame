// Pet app: the player's pet cat. State lives here (so it follows the player to any device) and EVERY cost is charged
// from the main balance (User.ac.cash) with an atomic "only if enough" update, then written to the bank statement.
// Also here: the daily check-in (the game's only daily reward), milestones, sudden illnesses, friends visiting, pet memory and Gemini answers.
const express = require('express');
const User = require('../models/User');
const ACTxn = require('../models/ACTxn');
const ACPet = require('../models/ACPet');
const { Friendship } = require('../models/Social');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const { makeRef } = require('../utils/acbank');
const { emitUser, notify } = require('../utils/acnotify');
const L = require('../utils/aclagos');
const P = require('../utils/acpet');
const AI = require('../utils/acpetai');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const isId = (s) => /^[a-f\d]{24}$/i.test(String(s));
const bad = (res, code, message) => res.status(code).json({ message });
const event = () => { try { return L.currentEvent(); } catch (e) { return null; } };
const label = (u) => (u && (u.acUsername ? '@' + u.acUsername : u.displayName)) || 'A friend';
const io = (req) => req.app.get('io');

async function loadPet(me) {
  let d = await ACPet.findOne({ user: me });
  if (!d) { try { d = await ACPet.create(P.defaults(me)); } catch (e) { if (e && e.code === 11000) d = await ACPet.findOne({ user: me }); else throw e; } }
  const hit = P.roll(d); P.advance(d); d.noteN = 0;                      // she is being looked at, so away-alerts start over
  if (hit) await d.save();
  return d;
}
const aiInfo = (d, now = Date.now()) => ({ on: !!AI.keyInfo().key, daily: AI.daily(), left: Math.max(0, AI.daily() - (d.aiDay === P.dayKey(now) ? d.aiCount : 0)) });
const full = async (me, d, extra) => {
  const u = await User.findById(me).select('ac.cash').lean();
  return Object.assign({ pet: P.view(d), cash: (u && u.ac && u.ac.cash) || 0 }, extra || {});
};
/* money in (rewards): atomic, on the bank statement, live balance update */
async function credit(req, to, amount, note) {
  if (!(amount > 0)) return;
  await User.updateOne({ _id: to }, { $inc: { 'ac.cash': amount } });
  await ACTxn.create({ user: to, type: 'credit', amount, cpName: 'Pet', cpNum: '', note, ref: makeRef(), kind: 'reward' });
  emitUser(io(req), to, 'cash', { delta: amount });
}
/* save, pay out any milestones she just earned, and answer */
async function settle(req, me, d, extra) {
  const nb = P.unlock(d); await d.save();
  const total = nb.reduce((a, b) => a + (b.reward || 0), 0);
  if (total) await credit(req, me, total, `Pet milestone${nb.length > 1 ? 's' : ''}: ${nb.map((b) => b.name).join(', ')}`);
  return full(me, d, Object.assign({}, extra, nb.length ? { badges: nb } : {}));
}

router.get('/', async (req, res, next) => {
  try {
    const me = uid(req); await ensureAC(me);
    const d = await loadPet(me); await d.save();
    const day = P.dayKey(), ev = event(), earned = d.gameDay === day ? d.gameEarned : 0;
    res.json(await full(me, d, { catalog: P.catalog(ev), slots: P.SLOTS, ai: aiInfo(d), ach: P.ACH.map(({ id, icon, name, desc, reward }) => ({ id, icon, name, desc, reward })),
      city: ev ? { id: ev.id, title: ev.title, icon: ev.icon } : null, game: { earned, cap: P.GAME.cap, cooldownMs: P.GAME.cooldownMs, energy: P.GAME.energy }, rates: P.RATE }));
  } catch (e) { next(e); }
});

/* buy something for her: food, care (bath, vitamins, vet, vaccine…), a toy session or clothes */
router.post('/buy', async (req, res, next) => {
  try {
    const me = uid(req), kind = String((req.body || {}).kind || ''), id = String((req.body || {}).id || '');
    const tbl = P.KINDS[kind]; if (!tbl || !Object.prototype.hasOwnProperty.call(tbl, id)) return bad(res, 400, 'Unknown item.');
    const it = tbl[id]; await ensureAC(me);
    const d = await loadPet(me), nm = d.name, ev = event(), now = Date.now();
    // things that would waste her owner's money are refused before anything is charged
    if (kind === 'cloth') {
      if ((d.owned || []).includes(id)) return bad(res, 409, 'You already own this.');
      if (it.event && !(ev && ev.id === it.event)) return bad(res, 409, `Only sold during ${P.eventTitle(it.event)}.`);
    } else if (d.asleep) return bad(res, 409, `${nm} is asleep. Wake her first.`);
    if (kind === 'food' && d.hunger > 92) return bad(res, 409, `${nm} is full.`);
    if (kind === 'care' && it.protect && P.protectedUntil(d, now)) return bad(res, 409, `${nm} is already protected.`);
    if (kind === 'care' && it.need && d[it.need] > it.max) return bad(res, 409, it.need === 'clean' ? `${nm} is already clean.` : `${nm} is healthy. No need.`);
    if (kind === 'toy' && d.energy < 12) return bad(res, 409, `${nm} is too tired to play.`);
    if (kind === 'toy' && P.sick(d)) return bad(res, 409, `${nm} is not well enough to play. Take her to the vet.`);
    const price = P.priceOf(kind, id, ev);
    const u = await User.findOneAndUpdate({ _id: me, 'ac.cash': { $gte: price } }, { $inc: { 'ac.cash': -price } }, { new: true });
    if (!u) return bad(res, 402, 'Not enough ₦.');
    let grew = null;
    try {
      if (kind === 'cloth') { d.owned = [...(d.owned || []), id]; d.worn = Object.assign({}, d.worn, { [it.slot]: id }); d.markModified('worn'); }
      else {
        P.apply(d, Object.assign({}, it, { love: it.love || 1 })); if (kind === 'food') d.clean = P.cl(d.clean - 3);
        if (it.protect) d.protectUntil = new Date(now + it.protect * P.DAY);
        P.bump(d, kind === 'food' ? 'meals' : kind === 'toy' ? 'toys' : id === 'bath' || id === 'groom' ? 'baths' : id === 'vaccine' ? 'vaccines' : 'vet');
        P.settle(d); grew = P.gain(d, P.xpFor(kind, id), false);
      }
      d.spent = (d.spent || 0) + price; await d.save();
    } catch (e) { await User.updateOne({ _id: me }, { $inc: { 'ac.cash': price } }); throw e; }   // never keep the money if she did not get it
    await ACTxn.create({ user: me, type: 'debit', amount: price, cpName: 'Pet shop', cpNum: '', note: `${it.name} for ${nm}`, ref: makeRef(), kind: 'pet' });
    emitUser(io(req), me, 'cash', { delta: -price });
    res.json(await settle(req, me, d, { price, grew, item: { kind, id, name: it.name, emoji: it.emoji } }));
  } catch (e) { next(e); }
});

/* put on or take off clothes she owns (free) */
router.post('/wear', async (req, res, next) => {
  try {
    const me = uid(req), slot = String((req.body || {}).slot || ''), id = (req.body || {}).id ? String(req.body.id) : '';
    if (!P.SLOTS.includes(slot)) return bad(res, 400, 'Unknown slot.');
    const d = await loadPet(me);
    if (id) { const c = P.CLOTHES[id]; if (!c || c.slot !== slot || !(d.owned || []).includes(id)) return bad(res, 409, 'Buy this first.'); }
    d.worn = Object.assign({}, d.worn); if (id) d.worn[slot] = id; else delete d.worn[slot]; d.markModified('worn'); await d.save();
    res.json(await full(me, d));
  } catch (e) { next(e); }
});

/* free things: sleep / wake / cuddle / chat. Cuddles only lift her fun up to 60, so real fun (toys, games) still costs or takes effort. */
router.post('/act', async (req, res, next) => {
  try {
    const me = uid(req), a = String((req.body || {}).a || '');
    if (!['sleep', 'wake', 'pet', 'talk'].includes(a)) return bad(res, 400, 'Unknown action.');
    const d = await loadPet(me), now = Date.now(); let grew = null;
    if (a === 'sleep') d.asleep = true;
    else if (a === 'wake') d.asleep = false;
    else if (!d.asleep && (!d.lastAct || now - new Date(d.lastAct).getTime() > 1200)) {
      d.lastAct = new Date(now); d.love = (d.love || 0) + 1; if (a === 'talk') d.words = (d.words || 0) + 1;
      if (d.fun < 60) d.fun = P.cl(d.fun + (a === 'talk' ? 2 : 1));
      grew = P.gain(d, P.XP.free1, true);
    }
    res.json(await settle(req, me, d, { grew }));
  } catch (e) { next(e); }
});

router.post('/rename', async (req, res, next) => {
  try {
    const me = uid(req), n = P.validName((req.body || {}).name); if (!n) return bad(res, 400, 'Pick a name up to 14 letters or numbers.');
    const d = await loadPet(me); d.name = n; await d.save(); res.json(await full(me, d));
  } catch (e) { next(e); }
});

/* the only daily reward in the game: check in with your pet once a day */
router.post('/checkin', async (req, res, next) => {
  try {
    const me = uid(req), now = Date.now(); await ensureAC(me);
    const d = await loadPet(me), c = P.checkinView(d, now);
    if (!c.claimable) return bad(res, 409, 'You already checked in today. Come back tomorrow!');
    const day = P.dayKey(now), amount = P.checkinAmount(c.streak);
    const r = await ACPet.updateOne({ user: me, lastCheckin: { $ne: day } }, { $set: { lastCheckin: day, streak: c.streak } });   // claimed once, even if tapped twice
    if (!(r.modifiedCount || r.nModified)) return bad(res, 409, 'You already checked in today. Come back tomorrow!');
    d.lastCheckin = day; d.streak = c.streak; d.love = (d.love || 0) + 1; P.bump(d, 'checkins'); const grew = P.gain(d, 2, true);
    await credit(req, me, amount, `Pet daily check-in, day ${c.streak}`);
    res.json(await settle(req, me, d, { amount, grew, week: c.streak % 7 === 0 }));
  } catch (e) { next(e); }
});

/* settings: away alerts on/off, show her in the 3D room on/off */
router.post('/settings', async (req, res, next) => {
  try {
    const me = uid(req), b = req.body || {}, d = await loadPet(me);
    if (typeof b.alerts === 'boolean') d.alerts = b.alerts; if (typeof b.inRoom === 'boolean') d.inRoom = b.inRoom;
    await d.save(); res.json(await full(me, d));
  } catch (e) { next(e); }
});
/* what the 3D room needs to draw her (nothing is created if she does not exist yet) */
router.get('/room', async (req, res, next) => {
  try {
    const d = await ACPet.findOne({ user: uid(req) }).lean();
    if (!d || !d.inRoom) return res.json({ on: false });
    res.json({ on: true, name: d.name, stage: P.stageView(d), worn: d.worn || {} });
  } catch (e) { next(e); }
});
/* the client reports a photo it saved (milestone only, no reward beyond the badge) */
router.post('/snap', async (req, res, next) => {
  try { const me = uid(req), d = await loadPet(me); P.bump(d, 'photos'); res.json(await settle(req, me, d)); } catch (e) { next(e); }
});
/* she forgets one thing, or everything */
router.post('/forget', async (req, res, next) => {
  try {
    const me = uid(req), b = req.body || {}, d = await loadPet(me);
    if (b.all) d.memory = []; else { const i = Number(b.i); if (Number.isInteger(i) && i >= 0 && i < (d.memory || []).length) d.memory = d.memory.filter((_, k) => k !== i); }
    await d.save(); res.json(await full(me, d));
  } catch (e) { next(e); }
});

/* ----- friends visiting ----- */
router.get('/friends', async (req, res, next) => {
  try {
    const me = uid(req), rows = await Friendship.find({ $or: [{ requester: me }, { recipient: me }], status: 'accepted' }).lean();
    const ids = [...new Set(rows.map((x) => (x.requester === me ? x.recipient : x.requester)))].filter(isId).slice(0, 80);
    const pets = ids.length ? await ACPet.find({ user: { $in: ids } }).lean() : [];
    const users = pets.length ? await User.find({ _id: { $in: pets.map((p) => p.user) } }).select('displayName acUsername').lean() : [];
    const by = new Map(users.map((u) => [String(u._id), u])), day = P.dayKey(), now = Date.now();
    res.json({ friends: pets.map((p) => {
      const c = Object.assign({}, p); P.advance(c, now); const log = (p.vDay === day && p.vLog && p.vLog[me]) || {};
      return { id: String(p.user), who: label(by.get(String(p.user))), pet: { name: p.name, stage: P.stageView(p, now), worn: p.worn || {}, hunger: Math.round(c.hunger), sick: P.sick(c), asleep: !!p.asleep }, cuddled: (log.c || 0) >= 1, giftsLeft: Math.max(0, P.VISIT.maxGifts - (log.g || 0)) };
    }) });
  } catch (e) { next(e); }
});
router.post('/visit', async (req, res, next) => {
  try {
    const me = uid(req), b = req.body || {}, to = String(b.to || ''), act = b.act === 'gift' ? 'gift' : 'cuddle';
    if (!isId(to) || to === me) return bad(res, 400, 'Pick a friend.');
    if (!(await Friendship.exists({ $or: [{ requester: me, recipient: to }, { requester: to, recipient: me }], status: 'accepted' }))) return bad(res, 403, 'You can only visit friends.');
    const od = await ACPet.findOne({ user: to }); if (!od) return bad(res, 404, 'Your friend has no pet yet.');
    await ensureAC(me); P.advance(od); const day = P.dayKey(), nm = od.name;
    if (od.vDay !== day) { od.vDay = day; od.vLog = {}; }
    const log = Object.assign({ c: 0, g: 0 }, od.vLog && od.vLog[me]), meU = await User.findById(me).select('displayName acUsername ac.cash').lean(), who = label(meU);
    let price = 0, food = null;
    if (act === 'cuddle') {
      if (log.c >= 1) return bad(res, 429, `You already cuddled ${nm} today.`);
      log.c = 1; od.love = (od.love || 0) + 2; if (od.fun < P.VISIT.funMax) od.fun = P.cl(od.fun + P.VISIT.cuddleFun);
    } else {
      food = P.FOOD[String(b.gift || '')]; if (!food) return bad(res, 400, 'Pick a gift.');
      if (log.g >= P.VISIT.maxGifts) return bad(res, 429, 'That is plenty of gifts for today.');
      if (od.hunger > 92) return bad(res, 409, `${nm} is full.`);
      price = P.priceOf('food', String(b.gift), event());
      const u = await User.findOneAndUpdate({ _id: me, 'ac.cash': { $gte: price } }, { $inc: { 'ac.cash': -price } }, { new: true });
      if (!u) return bad(res, 402, 'Not enough ₦.');
      try { P.apply(od, { hunger: food.hunger, fun: food.fun, love: 1 }); log.g += 1; }
      catch (e) { await User.updateOne({ _id: me }, { $inc: { 'ac.cash': price } }); throw e; }
      await ACTxn.create({ user: me, type: 'debit', amount: price, cpName: 'Pet gift', cpNum: '', note: `${food.name} for ${nm}`, ref: makeRef(), kind: 'pet' });
      emitUser(io(req), me, 'cash', { delta: -price });
    }
    od.vLog = Object.assign({}, od.vLog, { [me]: log }); od.markModified('vLog');
    od.visits = [{ from: me, name: who, act, gift: food ? food.name : '', at: new Date() }, ...(od.visits || [])].slice(0, 15); P.bump(od, 'visits');
    const nbO = P.unlock(od); await od.save();
    if (nbO.length) await credit(req, to, nbO.reduce((a, x) => a + (x.reward || 0), 0), `Pet milestone: ${nbO.map((x) => x.name).join(', ')}`);
    notify(io(req), to, { icon: act === 'gift' ? '🎁' : '🐾', text: act === 'gift' ? `${who} gave ${nm} ${food.name}!` : `${who} came to cuddle ${nm}.`, kind: 'info', from: me }).catch(() => {});
    const mine = await ACPet.findOne({ user: me });                         // the visitor's own pet earns milestones too
    let badges = [];
    if (mine) { P.bump(mine, 'given'); if (act === 'gift') P.bump(mine, 'gifts'); badges = P.unlock(mine); await mine.save(); if (badges.length) await credit(req, me, badges.reduce((a, x) => a + (x.reward || 0), 0), `Pet milestone: ${badges.map((x) => x.name).join(', ')}`); }
    const after = await User.findById(me).select('ac.cash').lean();
    res.json({ ok: true, price, cash: (after && after.ac && after.ac.cash) || 0, badges, text: act === 'gift' ? `${nm} loved the ${food.name}!` : `${nm} purrs and loves the cuddle.` });
  } catch (e) { next(e); }
});

/* mini-games: the pet works up an appetite (energy down, fun up) and the owner wins a small, capped amount of ₦ */
router.post('/game', async (req, res, next) => {
  try {
    const me = uid(req), game = String((req.body || {}).game || '');
    if (!P.GAME.perPoint[game]) return bad(res, 400, 'Unknown game.');
    await ensureAC(me); const d = await loadPet(me), now = Date.now(), day = P.dayKey(now);
    if (d.asleep) return bad(res, 409, `${d.name} is asleep.`);
    if (d.energy < 12) return bad(res, 409, `${d.name} is too tired to play.`);
    if (P.sick(d)) return bad(res, 409, `${d.name} is not well enough to play. Take her to the vet.`);
    if (d.lastGame && now - new Date(d.lastGame).getTime() < P.GAME.cooldownMs) return bad(res, 429, 'Let her catch her breath for a minute.');
    if (d.gameDay !== day) { d.gameDay = day; d.gameEarned = 0; }
    const prize = P.reward(game, (req.body || {}).score, d.gameEarned);
    d.lastGame = new Date(now); d.gameEarned += prize; P.apply(d, { energy: -P.GAME.energy, fun: P.GAME.fun, hunger: -3, love: 1 }); P.bump(d, 'games'); const grew = P.gain(d, P.XP.game, false);
    if (prize) {
      await User.updateOne({ _id: me }, { $inc: { 'ac.cash': prize } });
      await ACTxn.create({ user: me, type: 'credit', amount: prize, cpName: 'Pet games', cpNum: '', note: `${game === 'mouse' ? 'Mouse Tap' : 'Paw Pattern'} with ${d.name}`, ref: makeRef(), kind: 'reward' });
      emitUser(io(req), me, 'cash', { delta: prize });
    }
    res.json(await settle(req, me, d, { prize, grew, game: { earned: d.gameEarned, cap: P.GAME.cap, capped: d.gameEarned >= P.GAME.cap } }));
  } catch (e) { next(e); }
});

/* Answer mode: ask her a question by text or voice note and she answers using Gemini (key stays on the server). Repeat mode only uses this to transcribe a voice note. */
router.post('/ask', async (req, res, next) => {
  try {
    const me = uid(req), b = req.body || {}, mode = b.mode === 'repeat' ? 'repeat' : 'answer';
    const text = AI.cleanText(b.text), audio = b.audio ? AI.cleanAudio(b.audio) : null;
    if (b.audio && !audio) return bad(res, 400, 'That voice note could not be used.');
    if (!text && !audio) return bad(res, 400, 'Say or type something first.');
    if (mode === 'repeat' && !audio) return bad(res, 400, 'Nothing to look up in repeat mode.');
    if (!AI.keyInfo().key) return bad(res, 503, 'Answer mode is not set up yet.');
    if (AI.limited(me)) return bad(res, 429, 'Slow down a little, she is thinking.');
    const d = await loadPet(me), now = Date.now(), day = P.dayKey(now);
    if (d.asleep) return bad(res, 409, `${d.name} is asleep.`);
    if (d.aiDay !== day) { d.aiDay = day; d.aiCount = 0; }
    if (d.aiCount >= AI.daily()) return bad(res, 429, `${d.name} has talked enough for today. Come back tomorrow!`);
    let out;
    try { out = await AI.ask({ mode, text, audio, pet: d, history: b.history, ctx: { stage: P.stageView(d, now).name.toLowerCase(), clothes: P.CLOTHES } }); }
    catch (e) { if (e && e.user) return bad(res, e.status || 502, e.message); throw e; }
    d.aiCount += 1; let grew = null;
    if (out.reply && !out.blocked) {
      d.love = (d.love || 0) + 1; d.words = (d.words || 0) + 1; if (d.fun < 60) d.fun = P.cl(d.fun + 2); grew = P.gain(d, P.XP.ask, true);
      if (mode === 'answer') { P.bump(d, 'answers'); if (out.remember) d.memory = AI.addMemory(d.memory, out.remember); }
    }
    res.json(await settle(req, me, d, { heard: out.heard, reply: out.reply, grew, ai: aiInfo(d, now) }));
  } catch (e) { next(e); }
});

/* "New life" wipes her clothes and history together with the balance (see routes/allconnect.js) */
module.exports = router;
module.exports.resetPet = async function resetPet(userId) { await ACPet.deleteOne({ user: String(userId) }); };
