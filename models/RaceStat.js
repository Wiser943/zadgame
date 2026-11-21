const mongoose = require('mongoose');
// Drive Race results for ranked races (two or more real players). One document per user; the weekly numbers reset when the Lagos week changes.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  name: { type: String, default: '' },
  races: { type: Number, default: 0 }, wins: { type: Number, default: 0 }, podiums: { type: Number, default: 0 }, points: { type: Number, default: 0 },
  weekKey: { type: String, default: '' }, weekPoints: { type: Number, default: 0 }, weekRaces: { type: Number, default: 0 },
  bestLapMs: { type: Number, default: 0 }, bestTimeMs: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ weekKey: 1, weekPoints: -1 });
schema.index({ points: -1 });
module.exports = mongoose.models.RaceStat || mongoose.model('RaceStat', schema);
