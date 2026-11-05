const mongoose = require('mongoose');
const { Schema } = mongoose;

// One document per player: wardrobe, look, salon history, motion and identity/privacy settings.
// Money is never stored here (it lives on User.ac.cash). Prices come from utils/acstyle.js.
const ACStyleSchema = new Schema({
  user: { type: String, required: true, unique: true, index: true },
  owned: { type: [String], default: [] },                      // bought item ids (free items are always usable)
  look: { type: Schema.Types.Mixed, default: {} },             // only what differs from the default look
  dyes: { type: Schema.Types.Mixed, default: {} },             // { itemId: { c1, c2 } }
  dura: { type: Schema.Types.Mixed, default: {} },             // { itemId: 0..100 } (missing = 100)
  tailored: { type: [{ _id: false, id: String, base: String, fabric: String, fit: String, c1: String, c2: String, label: String, price: Number, readyAt: Date, collected: { type: Boolean, default: false }, at: Date }], default: [] },
  presets: { type: [{ _id: false, id: String, name: String, look: Schema.Types.Mixed }], default: [] },
  salon: {
    hairAt: { type: Date, default: null }, freshUntil: { type: Date, default: null }, visits: { type: Number, default: 0 },
    history: { type: [{ _id: false, svc: String, name: String, cost: Number, at: Date }], default: [] }
  },
  motion: {
    walk: { type: String, default: 'walk_normal' }, idle: { type: String, default: 'idle_breathe' },
    mood: { type: String, default: 'neutral' }, autoMood: { type: Boolean, default: true }
  },
  identity: {
    pronouns: { type: String, default: '' }, custom: { type: String, default: '' }, title: { type: String, default: '' }, autoUniform: { type: Boolean, default: false },
    access: { type: Schema.Types.Mixed, default: {} },
    privacy: { type: Schema.Types.Mixed, default: {} }
  },
  claimed: { type: [String], default: [] },                     // collection milestones already paid
  lastWear: { type: Date, default: null }, wearDay: { type: String, default: '' }, wearMs: { type: Number, default: 0 }
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('ACStyle', ACStyleSchema);
