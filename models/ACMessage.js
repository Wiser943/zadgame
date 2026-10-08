const mongoose = require('mongoose');
// Private chat between two friends. kind: text | money | food | invite | system
const S = new mongoose.Schema({
  from: { type: String, required: true }, to: { type: String, required: true },
  text: { type: String, default: '' }, kind: { type: String, default: 'text' }, amount: { type: Number, default: 0 },
  reply: { mid: String, from: String, text: String },
  read: { type: Boolean, default: false }, at: { type: Date, default: Date.now }
});
S.index({ from: 1, to: 1, at: -1 }); S.index({ to: 1, read: 1 });
module.exports = mongoose.model('ACMessage', S);
