const mongoose = require('mongoose');
const S = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  season: { type: mongoose.Schema.Types.ObjectId, ref: 'PayoutSeason', required: true },
  seasonNo: { type: Number, required: true, index: true },
  batch: { type: Number, enum: [1, 2, 3], required: true },
  slot: { type: Number, required: true },
  eligibleUnits: { type: Number, required: true, min: 0 },
  rawPayout: { type: Number, required: true, min: 0 },
  payoutAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['submitted', 'held', 'approved', 'processing', 'paid', 'rejected', 'rolled_over', 'failed'], default: 'submitted', index: true },
  bankLast4: { type: String, default: '' },
  idempotencyKey: { type: String, required: true, unique: true },
  providerReference: { type: String, default: '' },
  adminNote: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null }
}, { timestamps: true });
S.index({ user: 1, season: 1, slot: 1 }, { unique: true });
module.exports = mongoose.model('PayoutRequest', S);
