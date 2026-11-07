const mongoose = require('mongoose');
const S = new mongoose.Schema({
  user: { type: String, required: true, unique: true, index: true },
  eligibleUnits: { type: Number, default: 0, min: 0 },
  carriedUnits: { type: Number, default: 0, min: 0 },
  startingBatch: { type: Number, enum: [1, 2, 3], default: null },
  nextSlot: { type: Number, default: 0 },
  bankName: { type: String, default: '' },
  accountName: { type: String, default: '' },
  accountNumberCipher: { type: String, default: '' },
  accountNumberLast4: { type: String, default: '' },
  bankBoundAt: { type: Date, default: null },
  eligibilityNoticeAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
module.exports = mongoose.model('PayoutAccount', S);
