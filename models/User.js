const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // A user has either googleId, or (email or phone) + passwordHash, or both.
  googleId: { type: String, unique: true, sparse: true, index: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, sparse: true, trim: true },
  passwordHash: { type: String },
  displayName: { type: String, default: 'Player' },
  avatar: { type: String, default: '' },
  cover: { type: String, default: '' },                 // profile cover photo (small JPEG data URI)
  bio: { type: String, default: '', maxlength: 160 },
  verified: { type: Boolean, default: false },          // blue tick: granted only by an admin
  autoPostWins: { type: Boolean, default: true },       // auto-post match wins to P-Gist
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
    tokenSkin: { type: String, default: 'classic' },
    announcer: { type: String, default: 'classic' }
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
  tournamentWins: { type: Number, default: 0 },
  shareHighlights: { type: Boolean, default: false },   // opt-in: show my winning highlight reels in the public gallery
  winStreak: { type: Number, default: 0 },
  bestStreak: { type: Number, default: 0 },
  rating: { type: Number, default: 1000 },
  gameRatings: { type: Map, of: Number, default: {} },
  gameGames: { type: Map, of: Number, default: {} },
  adminNote: { type: String, default: '' },
  // Phase 2 pre-registration. Coming-soon only: no balances, no payouts, and NO bank/wallet/ID numbers are stored here.
  rewardsInterest: {
    registered: { type: Boolean, default: false },
    legalName: { type: String, default: '' },
    country: { type: String, default: '' },
    over18: { type: Boolean, default: false },
    method: { type: String, enum: ['', 'bank', 'mobile_money', 'crypto'], default: '' },
    notify: { type: Boolean, default: true },
    termsAccepted: { type: Boolean, default: false },
    registeredAt: { type: Date, default: null }
  },
  creator: {                                              // creator programme (real-money payouts, reviewed by the team)
    status: { type: String, enum: ['', 'applied', 'approved', 'rejected', 'suspended'], default: '' },
    appliedAt: { type: Date, default: null }, approvedAt: { type: Date, default: null }, decidedAt: { type: Date, default: null }, note: { type: String, default: '' }
  },
  acUsername: { type: String, unique: true, sparse: true, lowercase: true, trim: true }, // @handle used to find friends
  // ONE balance for the whole platform: ac.cash is the AllConnect balance AND the GameHub balance (₦). Changed only by the server.
  ac: {
    cash: { type: Number, default: 2000000 },
    paint: { type: String, default: '#d9a93a' },
    gender: { type: String, enum: ['', 'male', 'female'], default: '' },   // which character model the player uses
    owned: { type: [String], default: ['Classic Cream'] },
    v2: { type: Boolean, default: false },                 // furniture moved to placeable items
    items: { type: [{ _id: false, id: String, name: String, x: Number, z: Number, rot: Number, placed: { type: Boolean, default: true } }], default: [] },
    wish: { type: [String], default: [] },                 // previewed but not bought yet (wishlist / drafts)
    needs: { type: [Number], default: [.9, .9, .9, .9, .9, .9] },
    min: { type: Number, default: 1140 },
    gemsFound: { type: Number, default: 0 },
    sentDay: { type: String, default: '' },
    sentAmt: { type: Number, default: 0 },
    updatesSeen: { type: Date, default: null },
    updatesCleared: { type: Date, default: null },
    jobId: { type: String, default: '' },
    jobShifts: { type: Map, of: Number, default: {} },
    autoWork: { type: Boolean, default: true },
    lastShift: { type: Date, default: null },
    shiftDay: { type: String, default: '' },
    shiftsToday: { type: Number, default: 0 },
    bills: { type: [{ _id: false, key: String, cycle: String, amount: Number, due: Date, paidAt: { type: Date, default: null }, fee: { type: Number, default: 0 } }], default: [] },
    questsClaimed: { type: [String], default: [] },
    streak: { type: Number, default: 0 },
    lastDaily: { type: String, default: '' }
  },
  stats: {
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
