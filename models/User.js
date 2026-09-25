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
  stats: {
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
