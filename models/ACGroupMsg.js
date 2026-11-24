const mongoose = require('mongoose');
// kind: text | system. Deleted messages keep their row (text emptied) so the chat shows "This message was deleted".
const S = new mongoose.Schema({
  group: { type: String, required: true }, from: { type: String, default: '' }, text: { type: String, default: '' },
  image: { url: String, thumb: String, w: Number, h: Number }, reply: { mid: String, from: String, text: String },
  reactions: { type: [{ _id: false, u: String, e: String }], default: [] }, edited: { type: Boolean, default: false }, fwd: { type: Boolean, default: false },
  hidden: { type: [String], default: [] },
  kind: { type: String, default: 'text' }, deleted: { type: Boolean, default: false }, at: { type: Date, default: Date.now }
});
S.index({ group: 1, at: -1 });
module.exports = mongoose.model('ACGroupMsg', S);
