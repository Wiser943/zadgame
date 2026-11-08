// Character sheet (traits, memory book), privacy choices, password / email, and wallet top-ups.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ACTopup = require('../models/ACTopup');
const ensureAuth = require('../middleware/auth');
const { TRAIT_IDS, PREF_DEFAULTS, PACKS, clean } = require('../utils/acv2');

const router = express.Router();
const webhook = express.Router();
router.use(ensureAuth);
const uid = (req) => String(req.user.id);
const bad = (res, code, message) => res.status(code).json({ message });
const mask = (e) => { const [a, b] = String(e || '').split('@'); return b ? a[0] + '•'.repeat(Math.max(2, Math.min(7, a.length - 1))) + '@' + b : ''; };
const hits = new Map();
const limited = (k, max = 8, ms = 60000) => { const now = Date.now(), a = (hits.get(k) || []).filter((t) => now - t < ms); if (a.length >= max) { hits.set(k, a); return true; } a.push(now); hits.set(k, a); return false; };

router.get('/me', async (req, res, next) => {
  try {
    const u = await User.findById(uid(req)).select('ac.traits ac.memories ac.prefs ac.bday email emailVerifiedAt passwordHash');
    if (!u) return bad(res, 404, 'Player not found.');
    const a = u.ac || {};
    res.json({ traits: a.traits || [], prefs: { ...PREF_DEFAULTS, ...(a.prefs && a.prefs.toObject ? a.prefs.toObject() : a.prefs || {}) }, bday: a.bday || { m: 0, d: 0 },
      memories: (a.memories || []).slice(-40).reverse(), email: mask(u.email), hasEmail: !!u.email, emailVerified: !!u.emailVerifiedAt, hasPassword: !!u.passwordHash });
  } catch (e) { next(e); }
});

router.post('/traits', async (req, res, next) => {
  try {
    const t = [...new Set((Array.isArray((req.body || {}).traits) ? req.body.traits : []).map(String))];
    if (t.length !== 3 || t.some((x) => !TRAIT_IDS.includes(x))) return bad(res, 400, 'Pick exactly three traits.');
    await User.updateOne({ _id: uid(req) }, { $set: { 'ac.traits': t } });
    res.json({ traits: t });
  } catch (e) { next(e); }
});

const PREF_CHECK = { readReceipts: (v) => typeof v === 'boolean', whoCanMessage: (v) => ['everyone', 'friends'].includes(v), whoCanSendMoney: (v) => ['anyone', 'friends'].includes(v),
  showRelationships: (v) => typeof v === 'boolean', showBirthday: (v) => typeof v === 'boolean', marketingEmails: (v) => typeof v === 'boolean' };
router.post('/prefs', async (req, res, next) => {
  try {
    const b = req.body || {}, set = {};
    for (const k of Object.keys(PREF_CHECK)) if (k in b) { if (!PREF_CHECK[k](b[k])) return bad(res, 400, 'That choice is not valid.'); set['ac.prefs.' + k] = b[k]; }
    if (!Object.keys(set).length) return bad(res, 400, 'Nothing to change.');
    await User.updateOne({ _id: uid(req) }, { $set: set });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.post('/bday', async (req, res, next) => {
  try {
    const m = Math.floor(Number((req.body || {}).m)), d = Math.floor(Number((req.body || {}).d));
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    if (!max || !(d >= 1 && d <= max)) return bad(res, 400, 'Choose a real month and day.');
    await User.updateOne({ _id: uid(req) }, { $set: { 'ac.bday': { m, d } } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Memory book: big moments with how they felt. Cosmetic only. Capped at 60, newest kept. */
router.post('/memories', async (req, res, next) => {
  try {
    if (limited(uid(req) + ':mem', 20)) return bad(res, 429, 'Slow down a little.');
    const b = req.body || {}, title = clean(b.title, 60);
    if (!title) return bad(res, 400, 'A memory needs a title.');
    const m = { id: crypto.randomBytes(5).toString('hex'), icon: clean(b.icon, 8) || '⭐', title, text: clean(b.text, 160), mood: Math.max(-50, Math.min(50, Math.round(Number(b.mood) || 0))), at: new Date() };
    const u = await User.findById(uid(req)).select('ac.memories');
    const last = (u.ac.memories || []).slice(-8);
    if (last.some((x) => x.title === title && Date.now() - new Date(x.at) < 600000)) return res.json({ memory: null, dup: true });
    await User.updateOne({ _id: uid(req) }, { $push: { 'ac.memories': { $each: [m], $slice: -60 } } });
    res.json({ memory: m });
  } catch (e) { next(e); }
});

/* Security */
router.post('/password', async (req, res, next) => {
  try {
    if (limited(uid(req) + ':pw', 6, 600000)) return bad(res, 429, 'Too many tries. Wait a few minutes.');
    const { current, next: nw } = req.body || {};
    if (String(nw || '').length < 6) return bad(res, 400, 'New password must be at least 6 characters.');
    const u = await User.findById(uid(req)).select('passwordHash');
    if (u.passwordHash && !(await bcrypt.compare(String(current || ''), u.passwordHash))) return bad(res, 403, 'Your current password is not correct.');
    await User.updateOne({ _id: uid(req) }, { $set: { passwordHash: await bcrypt.hash(String(nw), 10) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Email verification: a 6-digit code sent through Resend. Works only when RESEND_API_KEY (and MAIL_FROM) are set. */
router.post('/email/send-code', async (req, res, next) => {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return bad(res, 503, 'Email sending is not set up yet. Ask the admin to add RESEND_API_KEY and MAIL_FROM.');
    if (limited(uid(req) + ':ec', 3, 600000)) return bad(res, 429, 'Too many codes requested. Try again in a few minutes.');
    const u = await User.findById(uid(req)).select('email emailVerifiedAt');
    if (!u.email) return bad(res, 400, 'There is no email on this account.');
    if (u.emailVerifiedAt) return res.json({ ok: true, verified: true });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [u.email], subject: 'Your Lagos Life verification code', text: `Your code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.` }) });
    if (!r.ok) return bad(res, 502, 'The email could not be sent. Try again later.');
    await User.updateOne({ _id: uid(req) }, { $set: { emailCode: { hash: crypto.createHash('sha256').update(code + uid(req)).digest('hex'), expires: new Date(Date.now() + 600000), tries: 0, sentAt: new Date() } } });
    res.json({ ok: true, to: mask(u.email) });
  } catch (e) { next(e); }
});
router.post('/email/verify', async (req, res, next) => {
  try {
    const code = String((req.body || {}).code || '').replace(/\D/g, '').slice(0, 6);
    const u = await User.findById(uid(req)).select('emailCode emailVerifiedAt');
    const c = u.emailCode || {};
    if (!c.hash || !c.expires || c.expires < new Date()) return bad(res, 400, 'That code has expired. Ask for a new one.');
    if ((c.tries || 0) >= 5) return bad(res, 429, 'Too many wrong codes. Ask for a new one.');
    if (crypto.createHash('sha256').update(code + uid(req)).digest('hex') !== c.hash) { await User.updateOne({ _id: uid(req) }, { $inc: { 'emailCode.tries': 1 } }); return bad(res, 400, 'That code is not right.'); }
    await User.updateOne({ _id: uid(req) }, { $set: { emailVerifiedAt: new Date(), 'emailCode.hash': '', 'emailCode.expires': null } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Wallet top-up through Paystack (Naira, and USD if your Paystack account has USD enabled). Off until PAYSTACK_SECRET_KEY is set. */
const payOn = () => !!process.env.PAYSTACK_SECRET_KEY;
const minor = (p, cur) => (cur === 'USD' ? p.usd : p.ngn) * 100;
router.get('/topup/packs', (req, res) => res.json({ live: payOn(), packs: PACKS }));
router.post('/topup/checkout', async (req, res, next) => {
  try {
    if (!payOn()) return bad(res, 503, 'Payments are not live yet.');
    if (limited(uid(req) + ':co', 6)) return bad(res, 429, 'Slow down a little.');
    const p = PACKS.find((x) => x.id === String((req.body || {}).pack)), cur = (req.body || {}).currency === 'USD' ? 'USD' : 'NGN';
    if (!p) return bad(res, 400, 'Choose a pack.');
    const u = await User.findById(uid(req)).select('email');
    const reference = 'lg_' + crypto.randomBytes(10).toString('hex'), origin = (process.env.PUBLIC_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    const email = u.email || `noreply+${uid(req)}@${process.env.TOPUP_EMAIL_DOMAIN || 'lagoslife.app'}`;
    const r = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: minor(p, cur), currency: cur, reference, callback_url: origin + '/allconnect/?topup=' + reference, metadata: { user: uid(req), pack: p.id } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.status || !j.data || !j.data.authorization_url) return bad(res, 502, (j && j.message) || 'The payment page could not be opened.');
    await ACTopup.create({ user: uid(req), reference, pack: p.id, currency: cur, amountMinor: minor(p, cur), coins: p.coins });
    res.json({ url: j.data.authorization_url, reference });
  } catch (e) { next(e); }
});
// Credits the wallet once, only if Paystack confirms the exact amount and currency we asked for.
async function settle(reference) {
  const o = await ACTopup.findOne({ reference });
  if (!o) return { ok: false, message: 'Unknown payment.' };
  if (o.status === 'paid') return { ok: true, credited: false, coins: o.coins };
  const r = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), { headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY } });
  const j = await r.json().catch(() => ({})), d = j && j.data;
  if (!r.ok || !d) return { ok: false, message: 'Could not check the payment yet.' };
  if (d.status !== 'success') return { ok: false, pending: d.status === 'pending' || d.status === 'ongoing', message: 'Payment not completed.' };
  if (d.amount !== o.amountMinor || String(d.currency).toUpperCase() !== o.currency) return { ok: false, message: 'The amount paid did not match.' };
  const claimed = await ACTopup.findOneAndUpdate({ reference, status: 'pending' }, { $set: { status: 'paid', paidAt: new Date() } });
  if (!claimed) return { ok: true, credited: false, coins: o.coins };
  await User.updateOne({ _id: o.user }, { $inc: { 'ac.cash': o.coins } });
  return { ok: true, credited: true, coins: o.coins };
}
router.get('/topup/verify', async (req, res, next) => {
  try {
    if (!payOn()) return bad(res, 503, 'Payments are not live yet.');
    const ref = String(req.query.reference || '');
    const o = await ACTopup.findOne({ reference: ref }).select('user');
    if (!o || o.user !== uid(req)) return bad(res, 404, 'Unknown payment.');
    const r = await settle(ref); res.status(r.ok ? 200 : 202).json(r);
  } catch (e) { next(e); }
});
webhook.post('/', async (req, res) => {
  try {
    if (!payOn()) return res.sendStatus(503);
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const sig = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
    if (sig !== req.get('x-paystack-signature')) return res.sendStatus(401);
    const ev = JSON.parse(raw.toString('utf8'));
    if (ev.event === 'charge.success' && ev.data && ev.data.reference) await settle(String(ev.data.reference));
    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});
module.exports = router; module.exports.webhook = webhook;
