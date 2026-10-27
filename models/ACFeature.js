'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Cross-app product records. Payload is deliberately flexible because each app owns its
// fields, while owner/kind/key/members remain server-controlled and indexed.
const ACFeatureSchema = new Schema({
  owner: { type: String, required: true, index: true },
  kind: { type: String, required: true, index: true },
  key: { type: String, default: '' },
  title: { type: String, default: '' },
  payload: { type: Schema.Types.Mixed, default: {} },
  members: { type: [String], default: [] },
  visibility: { type: String, enum: ['private', 'shared'], default: 'private' },
  status: { type: String, enum: ['active', 'draft', 'scheduled', 'done', 'archived'], default: 'active' },
  dueAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { minimize: false });
ACFeatureSchema.index({ owner: 1, kind: 1, updatedAt: -1 });
ACFeatureSchema.index({ kind: 1, members: 1, updatedAt: -1 });
ACFeatureSchema.pre('save', function (next) { this.updatedAt = new Date(); next(); });
module.exports = mongoose.models.ACFeature || mongoose.model('ACFeature', ACFeatureSchema);
