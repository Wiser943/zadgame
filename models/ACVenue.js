const mongoose = require('mongoose');
// One document per player: the venues they have opened (Venues app). Money lives in User.ac.cash (the shared balance).
const S = new mongoose.Schema({
  user: { type: String, required: true, unique: true },
  venues: { type: [{ _id: false, key: String, level: { type: Number, default: 1 }, paid: Number, at: Number, last: Number }], default: [] },   // last = ms of the last collection
  earned: { type: Number, default: 0 },                     // everything collected so far, after upkeep and tax
  tot: { type: mongoose.Schema.Types.Mixed, default: {} }   // per-venue lifetime net
}, { timestamps: true, minimize: false });
module.exports = mongoose.model('ACVenue', S);
