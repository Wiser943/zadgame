const mongoose = require('mongoose');
// Notifications feed. user = null means a global post (admin post, leaderboard news, app update).
const S = new mongoose.Schema({
  user: { type: String, default: null, index: true }, icon: { type: String, default: '🔔' }, text: { type: String, required: true },
  kind: { type: String, default: 'info' }, at: { type: Date, default: Date.now, index: true }
});
module.exports = mongoose.model('ACUpdate', S);
