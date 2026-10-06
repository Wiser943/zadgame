// AllConnect Pay: Account ID, payment PIN, transfers between AllConnect users, history. (Bank transfers: coming soon.)
const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const ACWallet = require('../models/ACWallet');
const ACTxn = require('../models/ACTxn');
const { Friendship } = require('../models/Social');
const ensureAuth = require('../middleware/auth');
const { notify, emitUser } = require('../utils/acnotify');
const { ensureAC } = require('./allconnect');
const { MONEY, parseAmount, moneyError, normalizeUsername } = require('../utils/allconnect');
const B = require('../utils/acbank');

const router = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const io = (req) => req.app.get('io');
const bad = (res, code, message) => res.status(code).json({ message });
const label = (u) => (u.acUsername ? '@' + u.acUsername : u.displayName);
const hits = new Map();
const limited = (id, max) => { const now = Date.now(), a = (hits.get(id) || []).filter((t) => now - t < 60000); if (a.length >= max) { hits.set(id, a); return true; } a.push(now); hits.set(id, a); return false; };
const isBlocked = (a, b) => Friendship.exists({ status: 'blocked', $or: [{ requester: a, recipient: b }, { requester: b, recipient: a }] });

async function ensureWallet(id) {
  const have = await ACWallet.findOne({ user: id }); if (have) return have;
  for (let i = 0; i < 8; i++) {
    try { return await ACWallet.create({ user: id, acNum: B.genAcNum() }); }
    catch (e) { if (e.code !== 11000) throw e; const again = await ACWallet.findOne({ user: id }); if (again) return again; }
  }
  throw new Error('Could not create wallet');
}
// Returns null when the PIN is right, otherwise { code, message }. 5 wrong tries lock the PIN for 15 minutes.
async function checkPin(me, w, pin) {
  if (w.lockUntil && w.lockUntil > new Date()) return { code: 423, message: `Too many wrong PINs. Try again in ${Math.ceil((w.lockUntil - Date.now()) / 60000)} min.` };
  if (B.verifyPin(pin, w.pinSalt, w.pinHash)) { if (w.fails) await ACWallet.updateOne({ user: me }, { $set: { fails: 0 } }); return null; }
  const u = await ACWallet.findOneAndUpdate({ user: me }, { $inc: { fails: 1 } }, { new: true });
  if (u.fails >= 5) { await ACWallet.updateOne({ user: me }, { $set: { fails: 0, lockUntil: new Date(Date.now() + 15 * 60000) } }); return { code: 423, message: 'Too many wrong PINs. Try again in 15 minutes.' }; }
  return { code: 401, message: `Wrong PIN. ${5 - u.fails} attempt${5 - u.fails === 1 ? '' : 's'} left.` };
}
const tv = (t) => ({ id: String(t._id), type: t.type, amount: t.amount, name: t.cpName, num: t.cpNum, note: t.note, ref: t.ref, at: t.at });

router.get('/summary', async (req, res, next) => {
  try {
    const me = uid(req), w = await ensureWallet(me), u = await ensureAC(me), day = new Date().toISOString().slice(0, 10);
    res.json({ acNum: w.acNum, hasPin: !!w.pinHash, cash: u.ac.cash, name: u.displayName, username: u.acUsername || '', limits: MONEY, sentToday: u.ac.sentDay === day ? (u.ac.sentAmt || 0) : 0 });
  } catch (e) { next(e); }
});
router.get('/history', async (req, res, next) => {
  try { res.json({ txns: (await ACTxn.find({ user: uid(req) }).sort({ at: -1 }).limit(30).lean()).map(tv) }); } catch (e) { next(e); }
});
router.post('/pin', async (req, res, next) => {
  try {
    const me = uid(req), pin = String((req.body && req.body.pin) || ''), cur = String((req.body && req.body.current) || '');
    if (!B.validPin(pin)) return bad(res, 400, 'PIN must be 4 digits.');
    const w = await ensureWallet(me);
    if (w.pinHash) { const err = await checkPin(me, w, cur); if (err) return bad(res, err.code, err.message); }
    const salt = crypto.randomBytes(16).toString('hex');
    await ACWallet.updateOne({ user: me }, { $set: { pinSalt: salt, pinHash: B.hashPin(pin, salt), fails: 0, lockUntil: null } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
// Resolve "Account ID" (10 digits) or @username to a name, so the sender can confirm who they are paying.
router.get('/lookup', async (req, res, next) => {
  try {
    const me = uid(req); if (limited(me, 30)) return bad(res, 429, 'Slow down a little.');
    const q = String(req.query.q || '').trim(); let user = null;
    if (B.validAcNum(q)) { const w = await ACWallet.findOne({ acNum: q }); if (w) user = await User.findById(w.user).select('displayName acUsername'); }
    else { const n = normalizeUsername(q); if (/^[a-z0-9_]{3,16}$/.test(n)) user = await User.findOne({ acUsername: n }).select('displayName acUsername'); }
    if (!user) return bad(res, 404, 'No AllConnect account found.');
    if (String(user._id) === me) return bad(res, 400, "That's your own account.");
    if (await isBlocked(me, String(user._id))) return bad(res, 403, 'You cannot send money to this account.');
    const w = await ensureWallet(String(user._id));
    res.json({ account: { name: user.displayName, username: user.acUsername || '', acNum: w.acNum } });
  } catch (e) { next(e); }
});
router.post('/transfer', async (req, res, next) => {
  try {
    const me = uid(req); if (limited(me + ':t', 12)) return bad(res, 429, 'Slow down a little.');
    const b = req.body || {}, amount = parseAmount(b.amount), err = moneyError(amount);
    if (err) return bad(res, 400, err);
    if (!B.validPin(b.pin)) return bad(res, 400, 'Enter your 4-digit payment PIN.');
    const w = await ensureWallet(me);
    if (!w.pinHash) return bad(res, 409, 'Set your payment PIN first.');
    const pe = await checkPin(me, w, String(b.pin)); if (pe) return bad(res, pe.code, pe.message);
    const rw = B.validAcNum(b.to) ? await ACWallet.findOne({ acNum: String(b.to) }) : null;
    if (!rw) return bad(res, 404, 'Recipient not found.');
    const other = rw.user;
    if (other === me) return bad(res, 400, "You can't send money to yourself.");
    if (await isBlocked(me, other)) return bad(res, 403, 'You cannot send money to this account.');
    const rec = await User.findById(other).select('displayName acUsername');
    if (!rec) return bad(res, 404, 'Recipient not found.');
    await ensureAC(me); await ensureAC(other);
    const day = new Date().toISOString().slice(0, 10);
    await User.updateOne({ _id: me, 'ac.sentDay': { $ne: day } }, { $set: { 'ac.sentDay': day, 'ac.sentAmt': 0 } });
    const sender = await User.findOneAndUpdate({ _id: me, 'ac.cash': { $gte: amount }, 'ac.sentAmt': { $lte: MONEY.daily - amount } }, { $inc: { 'ac.cash': -amount, 'ac.sentAmt': amount } }, { new: true });
    if (!sender) {
      const cur = await User.findById(me).select('ac');
      return bad(res, cur.ac.cash < amount ? 402 : 429, cur.ac.cash < amount ? 'Insufficient balance.' : `Daily transfer limit is ₦${MONEY.daily.toLocaleString('en-NG')}.`);
    }
    try { await User.updateOne({ _id: other }, { $inc: { 'ac.cash': amount } }); }
    catch (e) { await User.updateOne({ _id: me }, { $inc: { 'ac.cash': amount, 'ac.sentAmt': -amount } }); throw e; }   // refund if the credit fails
    const ref = B.makeRef(), note = String(b.note || '').trim().slice(0, 60);
    const [d] = await ACTxn.create([{ user: me, type: 'debit', amount, cpName: label(rec), cpNum: rw.acNum, note, ref }, { user: other, type: 'credit', amount, cpName: label(req.user), cpNum: w.acNum, note, ref }]);
    notify(io(req), other, { icon: '💸', text: `${label(req.user)} sent you ₦${amount.toLocaleString('en-NG')}`, kind: 'good' }).catch(() => {});
    emitUser(io(req), other, 'cash', { delta: amount });
    res.json({ cash: sender.ac.cash, txn: tv(d) });
  } catch (e) { next(e); }
});
module.exports = router;
