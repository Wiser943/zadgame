const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // A user has either googleId, or (email or phone) + passwordHash, or both.
  googleId: { type: String, unique: true, sparse: true, index: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, sparse: true, trim: true },
  passwordHash: { type: String },
  displayName: { type: String, default: 'Player' },
  avatar: { type: String, default: '' },
  coins: { type: Number, default: 0 },
  suspendedUntil: { type: Date, default: null },
  penaltyPoints: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  achievements: { type: [String], default: [] },
  lastDailyClaim: { type: Date, default: null },
  cosmetics: { type: [String], default: ['default'] },
  equipped: {
    roomBg: { type: String, default: 'classic' },
    boardSkin: { type: String, default: 'classic' },
    tokenSkin: { type: String, default: 'classic' }
  },
  bestMoment: {
    matchId: { type: String },
    game: { type: String },
    score: { type: Number },
    at: { type: Date }
  },
  friends: { type: [String], default: [] },
  friendRequests: { type: [String], default: [] },
  blocked: { type: [String], default: [] },
  rating: { type: Number, default: 1000 },
  gameRatings: { type: Map, of: Number, default: {} },
  adminNote: { type: String, default: '' },
  stats: {
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
