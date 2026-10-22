const mongoose = require('mongoose');
const GameConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true, index: true },
  available: { type: Boolean, default: true },
  playerCounts: { type: [Number], default: [2] },
  rules: { type: [String], default: [] }
}, { timestamps: true });
module.exports = mongoose.model('GameConfig', GameConfigSchema);
