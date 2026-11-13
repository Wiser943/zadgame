const mongoose = require('mongoose');
// One document = the CURRENT holder of one billboard slot or sea plot. The unique (kind, slot) index is what
// stops two players booking the same spot; expired rows are deleted before every booking.
const S = new mongoose.Schema({
  owner: { type: String, required: true, index: true }, kind: { type: String, enum: ['billboard', 'sea', 'app'], required: true }, slot: { type: Number, required: true },
  title: { type: String, default: '' }, link: { type: String, default: '' }, image: { type: String, default: '' }, emoji: { type: String, default: '' },
  startAt: { type: Date, default: Date.now }, expiresAt: { type: Date, required: true, index: true }, clicks: { type: Number, default: 0 }
});
S.index({ kind: 1, slot: 1 }, { unique: true });
module.exports = mongoose.model('ACAd', S);
