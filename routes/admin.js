const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const registry = require('../games/registry');
const ensureAdmin = require('../middleware/admin');
const { effectiveGames, effectiveGame, saveGameSettings } = require('../config/gameSettings');
const router = express.Router();
const ADMIN_PHONE = String(process.env.ADMIN_PHONE || '');
const ADMIN_PIN = String(process.env.ADMIN_PIN || '');
const loginHits = new Map();
function allowed(ip){ const now=Date.now(), a=(loginHits.get(ip)||[]).filter(t=>now-t<15*60*1000); if(a.length>=10){loginHits.set(ip,a);return false;} a.push(now);loginHits.set(ip,a);return true; }
function same(a, b) { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
router.post('/login', (req, res) => {
  if (!ADMIN_PHONE || !ADMIN_PIN) return res.status(503).json({ message: 'Admin login is not configured.' });
  if (!allowed(req.ip)) return res.status(429).json({ message: 'Too many login attempts. Try again later.' });
  const { phone, pin } = req.body || {};
  if (!same(phone, ADMIN_PHONE) || !same(pin, ADMIN_PIN)) return res.status(401).json({ message: 'Invalid admin credentials.' });
  req.session.isAdmin = true;
  req.session.save(() => res.json({ ok: true }));
});
router.get('/session', (req, res) => res.json({ authenticated: req.session?.isAdmin === true }));
router.post('/logout', (req, res) => { req.session.isAdmin = false; req.session.save(() => res.json({ ok: true })); });
router.use(ensureAdmin);
router.get('/games', (req, res) => res.json({ games: effectiveGames() }));
router.put('/games/:key', async (req, res, next) => {
  try {
    const current = effectiveGame(req.params.key);
    if (!current) return res.status(404).json({ message: 'Game not found.' });
    const body = req.body || {};
    const available = typeof body.available === 'boolean' ? body.available : current.available;
    const playerCounts = Array.isArray(body.playerCounts) ? [...new Set(body.playerCounts.map(Number).filter(n => [2,3,4].includes(n)))].sort((a,b)=>a-b) : current.playerCounts;
    if (!playerCounts.length) return res.status(400).json({ message: 'Choose at least one player count.' });
    const rules = Array.isArray(body.rules) ? body.rules.map(x => String(x).trim()).filter(Boolean).slice(0, 20) : current.rules;
    res.json({ game: await saveGameSettings(current.key, { available, playerCounts, rules }) });
  } catch (err) { next(err); }
});
router.get('/users', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = q ? { $or: [{ displayName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { phone: q }, { email: q.toLowerCase() }] } : {};
    const users = await User.find(filter).select('displayName phone email coins stats suspendedUntil penaltyPoints adminNote createdAt').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ users: users.map(u => ({ ...u, id: String(u._id) })) });
  } catch (err) { next(err); }
});
router.post('/users/:id/penalize', async (req, res, next) => {
  try {
    const coins = Math.max(0, Math.min(1000000, Number(req.body?.coins) || 0));
    const suspendMinutes = Math.max(0, Math.min(525600, Number(req.body?.suspendMinutes) || 0));
    const reason = String(req.body?.reason || '').trim().slice(0, 240);
    if (!coins && !suspendMinutes) return res.status(400).json({ message: 'Add a coin penalty or suspension duration.' });
    const update = { $inc: { coins: -coins, penaltyPoints: 1 }, $set: { adminNote: reason } };
    if (suspendMinutes) update.$set.suspendedUntil = new Date(Date.now() + suspendMinutes * 60000);
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('displayName coins suspendedUntil penaltyPoints adminNote');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ user: { id: user.id, displayName: user.displayName, coins: user.coins, suspendedUntil: user.suspendedUntil, penaltyPoints: user.penaltyPoints, adminNote: user.adminNote } });
  } catch (err) { next(err); }
});
module.exports = router;
