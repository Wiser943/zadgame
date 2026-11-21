// Daily gem hunt for players: today's state + claiming the gem once you reach the place.
const express = require('express');
const User = require('../models/User');
const ACTxn = require('../models/ACTxn');
const { ACGemDay, ACGemFind } = require('../models/ACGem');
const ensureAuth = require('../middleware/auth');
const { ensureAC } = require('./allconnect');
const { makeRef } = require('../utils/acbank');
const { emitUser } = require('../utils/acnotify');
const G = require('../utils/acgem');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);

async function stateFor(me, now = Date.now()) {
  const c = await G.getConfig(), day = G.dayKey(now);
  const [d, mine] = await Promise.all([ACGemDay.findById(day).lean(), ACGemFind.findOne({ day, user: me }).lean()]);
  const found = (d && d.count) || 0, on = G.active(c);
  return {
    enabled: on, resetIn: G.msToReset(now), found, first: ((d && d.first) || []).map((x) => x.name),
    clue: on ? (c.clueOn ? c.clue : '') : '', clueHidden: on && !c.clueOn,
    hasHint: on && c.hintOn && !!c.hint, place: on ? c.place : '', prizes: c.prizes, nextPrize: G.prizeFor(found + 1, c),
    mine: mine ? { rank: mine.rank, prize: mine.prize } : null
  };
}
router.get('/state', async (req, res, next) => { try { res.json(await stateFor(uid(req))); } catch (e) { next(e); } });
router.get('/hint', async (req, res, next) => {
  try { const c = await G.getConfig(); if (!G.active(c) || !c.hintOn || !c.hint) return res.status(404).json({ message: 'No hint today.' }); res.json({ hint: c.hint }); } catch (e) { next(e); }
});
router.post('/claim', async (req, res, next) => {
  try {
    const me = uid(req), now = Date.now(), c = await G.getConfig(), day = G.dayKey(now);
    if (!G.active(c)) return res.status(409).json({ message: 'The gem hunt is paused right now.' });
    const u0 = await ensureAC(me); if (!u0) return res.status(401).json({ message: 'Sign in again.' });
    const name = (req.user.acUsername ? '@' + req.user.acUsername : req.user.displayName) || 'player';
    let find; try { find = await ACGemFind.create({ day, user: me, name }); } catch (e) { if (e && e.code === 11000) return res.status(409).json({ message: 'You already found today\u2019s gem. Come back tomorrow!' }); throw e; }
    const d = await ACGemDay.findByIdAndUpdate(day, { $inc: { count: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const rank = d.count, prize = G.prizeFor(rank, c);
    if (rank <= 3) await ACGemDay.updateOne({ _id: day }, { $push: { first: { $each: [{ user: me, name }], $slice: 3 } } });
    await ACGemFind.updateOne({ _id: find._id }, { $set: { rank, prize } });
    const u = prize ? await User.findByIdAndUpdate(me, { $inc: { 'ac.cash': prize, 'ac.gemsFound': 1 } }, { new: true }) : await User.findByIdAndUpdate(me, { $inc: { 'ac.gemsFound': 1 } }, { new: true });
    if (prize) { await ACTxn.create({ user: me, type: 'credit', amount: prize, cpName: 'AllConnect', cpNum: '', note: `Daily gem hunt, #${rank}`, ref: makeRef(), kind: 'reward' }); emitUser(req.app.get('io'), me, 'cash', { delta: prize }); }
    res.json({ rank, prize, cash: u.ac.cash, state: await stateFor(me, now) });
  } catch (e) { next(e); }
});
module.exports = router;
module.exports.stateFor = stateFor;
