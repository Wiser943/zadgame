const mongoose = require('mongoose');
const MatchSchema = new mongoose.Schema({
  game: { type: String, required: true, index: true },
  roomCode: String,
  players: [{ userId: String, name: String, bot: Boolean }],
  winnerIndex: { type: Number, default: null },
  result: { type: String, enum: ['win','draw'], required: true },
  reason: String,
  ranked: { type: Boolean, default: false },
  moves: { type: [mongoose.Schema.Types.Mixed], default: [] },
  durationMs: Number,
  createdAt: { type: Date, default: Date.now, index: true }
});
module.exports = mongoose.model('Match', MatchSchema);
