const mongoose = require('mongoose');
// One wallet top-up order. `status` only ever moves pending -> paid (atomically), so a webhook and the redirect check can never credit twice.
module.exports = mongoose.model('ACTopup', new mongoose.Schema({
  user: { type: String, required: true, index: true }, reference: { type: String, required: true, unique: true },
  pack: { type: String, required: true }, currency: { type: String, enum: ['NGN', 'USD'], required: true },
  amountMinor: { type: Number, required: true },            // kobo or cents actually charged
  coins: { type: Number, required: true },                  // game money credited when paid
  status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  paidAt: { type: Date, default: null }
}, { timestamps: true }));
