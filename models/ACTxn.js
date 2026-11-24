const mongoose = require('mongoose');
// One row per side of a transfer (debit for sender, credit for receiver), sharing the same ref.
const S = new mongoose.Schema({
  user: { type: String, required: true, index: true }, type: { type: String, enum: ['debit', 'credit'], required: true },
  amount: { type: Number, required: true }, cpName: String, cpNum: String, note: { type: String, default: '' }, kind: { type: String, default: 'transfer' },
  ref: { type: String, required: true }, at: { type: Date, default: Date.now }
});
S.index({ user: 1, at: -1 });
module.exports = mongoose.model('ACTxn', S);
