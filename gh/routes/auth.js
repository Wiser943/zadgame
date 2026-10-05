const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { normalizeIdentifier, isValidEmail, isValidPhone } = require('../utils/identifier');

const router = express.Router();

const publicUser = (u) => ({ id: u.id, displayName: u.displayName, avatar: u.avatar, coins: u.coins, stats: u.stats });

router.post('/register', async (req, res, next) => {
  try {
    const { name, identifier, password } = req.body || {};
    if (!name || !identifier || !password) return res.status(400).json({ message: 'Name, email or phone, and password are all required.' });
    if (String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const id = normalizeIdentifier(identifier);
    if (id.type === 'email' && !isValidEmail(id.value)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (id.type === 'phone' && !isValidPhone(id.value)) return res.status(400).json({ message: 'Enter a valid phone number.' });

    const existing = await User.findOne(id.type === 'email' ? { email: id.value } : { phone: id.value });
    if (existing) return res.status(409).json({ message: 'An account with that email or phone already exists. Try signing in instead.' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      displayName: String(name).trim().slice(0, 40) || 'Player',
      passwordHash,
      [id.type]: id.value
    });
    req.login(user, (err) => (err ? next(err) : res.json({ user: publicUser(user) })));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'An account with that email or phone already exists.' });
    next(err);
  }
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ message: info?.message || 'Invalid email/phone or password.' });
    req.login(user, (err2) => (err2 ? next(err2) : res.json({ user: publicUser(user) })));
  })(req, res, next);
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect(process.env.CLIENT_URL || '/')
);

router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect(process.env.CLIENT_URL || '/'));
  });
});

module.exports = router;
