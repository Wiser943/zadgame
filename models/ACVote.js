const mongoose = require('mongoose');
// One vote per player per feature (feature voting plaza).
const S = new mongoose.Schema({ feature: { type: String, required: true, index: true }, user: { type: String, required: true }, at: { type: Date, default: Date.now } });
S.index({ feature: 1, user: 1 }, { unique: true });
module.exports = mongoose.model('ACVote', S);
