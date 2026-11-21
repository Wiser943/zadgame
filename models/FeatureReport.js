const mongoose = require('mongoose');

const FeatureReportSchema = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  displayName: { type: String, default: 'Player', maxlength: 80 },
  category: { type: String, enum: ['feature', 'bug', 'improvement', 'other'], default: 'feature', index: true },
  title: { type: String, required: true, trim: true, minlength: 4, maxlength: 100 },
  details: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
  status: { type: String, enum: ['new', 'reviewing', 'planned', 'completed', 'declined'], default: 'new', index: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

FeatureReportSchema.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model('FeatureReport', FeatureReportSchema);
