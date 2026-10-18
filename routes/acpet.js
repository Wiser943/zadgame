// Pet app: the player's pet cat. State lives here (so it follows the player to any device) and EVERY cost is charged
// from the main balance (User.ac.cash) with an atomic "only if enough" update, then written to the bank statement.
const express = require('express');
const User = require('../models/User');
const ACTxn = require('../models/ACTxn');
const ACPet = require('../models/ACPet');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const { makeRef } = require('../utils/acbank');
const { emitUser } = require('../utils/acnotify');
const L = require('../utils/aclagos');
const P = require('../utils/acpet');
const AI = require('../utils/acpetai');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const event = () => { try { return L.currentEvent(); } catch (e) { return null; } };

async function loadPet(me) {
  let d = await ACPet.findOne({ user: me });
  if (!d) { try { d = await ACPet.create(P.defaults(me)); } catch (e) { if (e && e.code === 11000) d = await ACPet.findOne({ user: me }); else throw e; } }
  P.advance(d);
  return d;
}
const aiInfo = (d, now = Date.now()) => ({ on: !!AI.keyInfo().key, daily: AI.daily(), left: Math.max(0, AI.daily() - (d.aiDay === P.dayKey(now) ? d.aiCount : 0)) });
const full = async (me, d, extra) => {
  const u = await User.findById(me).select('ac.cash').lean();
  return Object.assign({ pet: P.view(d), cash: (u && u.ac && u.ac.cash) || 0 }, extra || {});
};

router.get('/', async (req, res, next) => {
  try {
    const me = uid(req); await ensureAC(me);
    const d = await loadPet(me); await d.save();
    const day = P.dayKey(), earned = d.gameDay === day ? d.gameEarned : 0;
    res.json(await full(me, d, { catalog: P.catalog(event()), slots: P.SLOTS, ai: aiInfo(d), game: { earned, cap: P.GAME.cap, cooldownMs: P.GAME.cooldownMs, energy: P.GAME.energy }, rates: P.RATE }));
  } catch (e) { next(e); }
});

/* buy something for her: food, care (bath, vitamins, vet…), a toy session or clothes */
router.post('/buy', async (req, res, next) => {
  try {
    const me = uid(req), kind = String((req.body || {}).kind || ''), id = String((req.body || {}).id || '');
    const tbl = P.KINDS[kind]; if (!tbl || !Object.prototype.hasOwnProperty.call(tbl, id)) return bad(res, 400, 'Unknown item.');
    const it = tbl[id]; await ensureAC(me);
    const d = await loadPet(me), nm = d.name;
    // things that would waste her owner's money are refused before anything is charged
    if (kind === 'cloth') { if ((d.owned || []).includes(id)) return bad(res, 409, 'You already own this.'); }
    else if (d.asleep) return bad(res, 409, `${nm} is asleep. Wake her first.`);
    if (kind === 'food' && d.hunger > 92) return bad(res, 409, `${nm} is full.`);
    if (kind === 'care' && d[it.need] > it.max) return bad(res, 409, it.need === 'clean' ? `${nm} is already clean.` : `${nm} is healthy. No need.`);
    if (kind === 'toy' && d.energy < 12) return bad(res, 409, `${nm} is too tired to play.`);
    if (kind === 'toy' && P.sick(d)) return bad(res, 409, `${nm} is not well enough to play. Take her to the vet.`);
    const price = P.priceOf(kind, id, event());
    let grew = null;
    const u = await User.findOneAndUpdate({ _id: me, 'ac.cash': { $gte: price } }, { $inc: { 'ac.cash': -price } }, { new: true });
    if (!u) return bad(res, 402, 'Not enough ₦.');
    try {
      if (kind === 'cloth') { d.owned = [...(d.owned || []), id]; d.worn = Object.assign({}, d.worn, { [it.slot]: id }); d.markModified('worn'); }
      else { P.apply(d, Object.assign({}, it, { love: it.love || 1 })); if (kind === 'food') d.clean = P.cl(d.clean - 3); }
      if (kind !== 'cloth') grew = P.gain(d, P.xpFor(kind, id), false);
      d.spent = (d.spent || 0) + price; await d.save();
    } catch (e) { await User.updateOne({ _id: me }, { $inc: { 'ac.cash': price } }); throw e; }   // never keep the money if she did not get it
    await ACTxn.create({ user: me, type: 'debit', amount: price, cpName: 'Pet shop', cpNum: '', note: `${it.name} for ${nm}`, ref: makeRef(), kind: 'pet' });
    emitUser(req.app.get('io'), me, 'cash', { delta: -price });
    res.json(await full(me, d, { price, grew, item: { kind, id, name: it.name, emoji: it.emoji } }));
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
    await d.save(); res.json(await full(me, d, { grew }));
  } catch (e) { next(e); }
});

router.post('/rename', async (req, res, next) => {
  try {
    const me = uid(req), n = P.validName((req.body || {}).name); if (!n) return bad(res, 400, 'Pick a name up to 14 letters or numbers.');
    const d = await loadPet(me); d.name = n; await d.save(); res.json(await full(me, d));
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
    d.lastGame = new Date(now); d.gameEarned += prize; P.apply(d, { energy: -P.GAME.energy, fun: P.GAME.fun, hunger: -3, love: 1 }); const grew = P.gain(d, P.XP.game, false); await d.save();
    if (prize) {
      await User.updateOne({ _id: me }, { $inc: { 'ac.cash': prize } });
      await ACTxn.create({ user: me, type: 'credit', amount: prize, cpName: 'Pet games', cpNum: '', note: `${game === 'mouse' ? 'Mouse Tap' : 'Paw Pattern'} with ${d.name}`, ref: makeRef(), kind: 'reward' });
      emitUser(req.app.get('io'), me, 'cash', { delta: prize });
    }
    res.json(await full(me, d, { prize, grew, game: { earned: d.gameEarned, cap: P.GAME.cap, capped: d.gameEarned >= P.GAME.cap } }));
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
    if (out.reply && !out.blocked) { d.love = (d.love || 0) + 1; d.words = (d.words || 0) + 1; if (d.fun < 60) d.fun = P.cl(d.fun + 2); grew = P.gain(d, P.XP.ask, true); }
    await d.save();
    res.json(await full(me, d, { heard: out.heard, reply: out.reply, grew, ai: aiInfo(d, now) }));
  } catch (e) { next(e); }
});

/* "New life" wipes her clothes and history together with the balance (see routes/allconnect.js) */
module.exports = router;
module.exports.resetPet = async function resetPet(userId) { await ACPet.deleteOne({ user: String(userId) }); };
