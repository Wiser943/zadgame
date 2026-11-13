const mongoose = require('mongoose');

const DeveloperProjectSchema = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  displayName: { type: String, default: 'Developer', maxlength: 80 },
  projectType: { type: String, enum: ['game', 'app', 'tool', 'experience'], required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
  description: { type: String, required: true, trim: true, minlength: 20, maxlength: 2000 },
  projectUrl: { type: String, required: true, trim: true, maxlength: 500 },
  integrationNotes: { type: String, trim: true, maxlength: 1500, default: '' },
  monetization: { type: String, enum: ['traffic', 'revenue-share', 'either', 'free'], default: 'either' },
  status: { type: String, enum: ['submitted', 'reviewing', 'approved', 'published', 'changes-requested', 'declined'], default: 'submitted', index: true },
  reviewNote: { type: String, maxlength: 1000, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

DeveloperProjectSchema.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model('DeveloperProject', DeveloperProjectSchema);
