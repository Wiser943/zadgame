const mongoose = require('mongoose');
// One document per user per UTC day. Progress is only ever incremented server-side from finished matches.
const ChallengeProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  day: { type: String, required: true },          // YYYY-MM-DD (UTC)
  progress: { type: Map, of: Number, default: {} },
  claimed: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});
ChallengeProgressSchema.index({ userId: 1, day: 1 }, { unique: true });
module.exports = mongoose.model('ChallengeProgress', ChallengeProgressSchema);
