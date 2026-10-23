const mongoose = require('mongoose');
// One document per player: the pet's needs, clothes and game earnings. Money is never stored here (it lives on User.ac.cash).
// Prices and effects come from utils/acpet.js.
const S = new mongoose.Schema({
  user: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: 'Kobo' },
  hunger: { type: Number, default: 80 }, energy: { type: Number, default: 80 }, fun: { type: Number, default: 80 },
  clean: { type: Number, default: 80 }, health: { type: Number, default: 90 },
  love: { type: Number, default: 0 }, words: { type: Number, default: 0 },
  asleep: { type: Boolean, default: false },
  t: { type: Date, default: Date.now },                         // when the needs were last brought up to date
  owned: { type: [String], default: [] },
  worn: { type: mongoose.Schema.Types.Mixed, default: {} },    // { hat, face, neck, body } -> item id
  spent: { type: Number, default: 0 },
  gameDay: { type: String, default: '' }, gameEarned: { type: Number, default: 0 }, lastGame: { type: Date, default: null },
  lastAct: { type: Date, default: null },
  xp: { type: Number, default: 0 }, xpDay: { type: String, default: '' }, xpToday: { type: Number, default: 0 }, xpFree: { type: Number, default: 0 },   // growth
  aiDay: { type: String, default: '' }, aiCount: { type: Number, default: 0 },                                                         // answers from Gemini today
  streak: { type: Number, default: 0 }, lastCheckin: { type: String, default: '' },                                                   // daily check-in
  stats: { type: mongoose.Schema.Types.Mixed, default: {} }, badges: { type: mongoose.Schema.Types.Mixed, default: {} },              // counters + unlocked milestones
  memory: { type: [String], default: [] },                                                                                             // what she remembers about her owner
  inRoom: { type: Boolean, default: false }, alerts: { type: Boolean, default: true },
  tricks: { type: mongoose.Schema.Types.Mixed, default: {} }, trickAt: { type: Date, default: null },
  roomItem: { type: String, enum: ['bed', 'scratch', 'toy'], default: 'bed' }, alertPrefs: { type: mongoose.Schema.Types.Mixed, default: {} },
  visits: { type: [mongoose.Schema.Types.Mixed], default: [] }, vDay: { type: String, default: '' }, vLog: { type: mongoose.Schema.Types.Mixed, default: {} },   // friends visiting
  nextEmergency: { type: Date, default: null }, protectUntil: { type: Date, default: null }, emergency: { type: mongoose.Schema.Types.Mixed, default: null }, sickPending: { type: Boolean, default: false },
  lastNote: { type: Date, default: null }, noteN: { type: Number, default: 0 }                                                          // alerts sent while the owner is away                                                         // answers from Gemini today
}, { timestamps: true, minimize: false });
module.exports = mongoose.models.ACPet || mongoose.model('ACPet', S);
