const mongoose = require('mongoose');
// Community traffic report (Transport app > Traffic). Reports vanish by themselves after 6 hours (the app only shows the last 90 minutes).
module.exports = mongoose.model('ACTrafficReport', new mongoose.Schema({
  road: { type: String, required: true, index: true }, kind: { type: String, required: true }, note: { type: String, default: '' },
  user: { type: String, required: true, index: true }, name: { type: String, default: '' },
  up: { type: [String], default: [] }, down: { type: [String], default: [] }, paid: { type: Boolean, default: false },
  at: { type: Date, default: Date.now, expires: 6 * 3600 }
}));
