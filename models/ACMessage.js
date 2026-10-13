const mongoose = require('mongoose');
// Private chat between two friends. kind: text | money | food | invite | system
const S = new mongoose.Schema({
  from: { type: String, required: true }, to: { type: String, required: true },
  text: { type: String, default: '' }, kind: { type: String, default: 'text' }, amount: { type: Number, default: 0 },
  reply: { mid: String, from: String, text: String },
  image: { url: String, thumb: String, w: Number, h: Number },                  // optional photo (text becomes the caption)
  reactions: { type: [{ _id: false, u: String, e: String }], default: [] },     // one emoji per person
  edited: { type: Boolean, default: false }, deleted: { type: Boolean, default: false }, fwd: { type: Boolean, default: false },
  hidden: { type: [String], default: [] },                                      // 'delete for me': user ids who no longer see it
  read: { type: Boolean, default: false }, at: { type: Date, default: Date.now }
});
S.index({ from: 1, to: 1, at: -1 }); S.index({ to: 1, read: 1 });
module.exports = mongoose.model('ACMessage', S);
