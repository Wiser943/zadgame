'use strict';

const express = require('express');
const ensureAuth = require('../middleware/auth');
const PushSubscription = require('../models/PushSubscription');
const push = require('../services/push');

const router = express.Router();
router.use(ensureAuth);

router.get('/config', (req, res) => res.json({ configured: push.configured(), publicKey: push.config().publicKey || null }));

router.post('/subscribe', async (req, res, next) => {
  try {
    const subscription = req.body?.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return res.status(400).json({ message: 'Invalid push subscription.' });
    await PushSubscription.findOneAndUpdate(
      { endpoint: String(subscription.endpoint) },
      { user: String(req.user.id), endpoint: String(subscription.endpoint), keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) }, userAgent: String(req.get('user-agent') || '').slice(0, 300), lastSeenAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.delete('/subscribe', async (req, res, next) => {
  try { await PushSubscription.deleteOne({ user: String(req.user.id), endpoint: String(req.body?.endpoint || '') }); res.json({ ok: true }); }
  catch (error) { next(error); }
});

module.exports = router;
