const mongoose = require('mongoose');
// Drive, stored on the main server. One account document per AllConnect user (no separate game login),
// plus one best-score row per user per leaderboard period.
const account = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  save: { type: mongoose.Schema.Types.Mixed, default: null },                 // the game's progress / streak / settings
  wallet: { bank: { type: Number, default: 0 }, tyre: { type: Number, default: 0 }, shield: { type: Number, default: 0 }, magnet: { type: Number, default: 0 } },
  seq: { type: Number, default: 0 },                                          // last wallet change applied from the phone (so a retry is never counted twice)
  usedRuns: { type: [String], default: [] },                                  // recent run tokens already scored
  runs: { type: Number, default: 0 },
}, { timestamps: true, minimize: false });

const best = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  board: { type: String, enum: ['day', 'week', 'all'], required: true },
  period: { type: String, required: true },                                   // '2026-11-01' (day), Monday's date (week), 'all'
  score: { type: Number, required: true },
  name: { type: String, default: '' },
  metres: { type: Number, default: 0 },
  at: { type: Date, default: Date.now },
});
best.index({ user: 1, board: 1, period: 1 }, { unique: true });
best.index({ board: 1, period: 1, score: -1, at: 1 });

module.exports = {
  LagosRunAccount: mongoose.models.LagosRunAccount || mongoose.model('LagosRunAccount', account),
  LagosRunBest: mongoose.models.LagosRunBest || mongoose.model('LagosRunBest', best),
};
