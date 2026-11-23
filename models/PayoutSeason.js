const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  value: { type: Number, default: 0 },
  description: { type: String, default: '' }
}, { _id: false });

const BatchSchema = new mongoose.Schema({
  number: { type: Number, enum: [1, 2, 3], required: true },
  name: { type: String, default: '' },
  opensAt: { type: Date, required: true },
  closesAt: { type: Date, required: true },
  budget: { type: Number, min: 0, default: 0 },
  maxPayout: { type: Number, min: 0, default: 1500 },
  minPayout: { type: Number, min: 0, default: 100 },
  minBalance: { type: Number, min: 0, default: 3000000 },
  unitsPerNaira: { type: Number, min: 1, default: 3333.333333 },
  countedUnitsCap: { type: Number, min: 0, default: 5000000 },
  budgetRollover: { type: String, enum: ['none', 'next_batch', 'next_season'], default: 'none' },
  status: { type: String, enum: ['draft', 'open', 'paused', 'closed'], default: 'draft' }
}, { _id: false });

const S = new mongoose.Schema({
  seasonNo: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  status: { type: String, enum: ['draft', 'scheduled', 'active', 'paused', 'closed'], default: 'draft' },
  maxPayoutsPerSeason: { type: Number, min: 1, max: 2, default: 2 },
  rules: { type: [RuleSchema], default: [] },
  batches: { type: [BatchSchema], default: [] },
  createdBy: { type: String, default: '' },
  publishedAt: { type: Date, default: null },
  announced: { type: [String], default: [] },   // which player notices were already sent (season open, batch open, closing soon): each goes out once
  updatedBy: { type: String, default: '' }
}, { timestamps: true });
S.index({ status: 1, startsAt: 1 });
module.exports = mongoose.model('PayoutSeason', S);
