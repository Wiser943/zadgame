'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
  userAgent: { type: String, default: '' },
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('PushSubscription', schema);
