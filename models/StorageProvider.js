const mongoose = require('mongoose');
// One row per video host ("storage_providers"). The router reads these rows to decide where the next upload goes.
//   maxVideos  0 = no limit on the NUMBER of videos (Mux's free plan allows 10, so its row says 10)
//   maxBytes   0 = no limit on TOTAL STORED BYTES (Cloudinary, ImageKit, Gumlet and Vimeo are limited by storage)
//   maxFileMB  0 = no limit on a single file
// usedVideos / usedBytes are kept exact by the router (reserve on upload start, adjust when ready, free on delete) and re-counted by reconcile().
module.exports = mongoose.model('StorageProvider', new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  label: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  priority: { type: Number, default: 100, index: true },       // lowest number is tried first
  maxVideos: { type: Number, default: 0 },
  maxBytes: { type: Number, default: 0 },
  maxFileMB: { type: Number, default: 0 },
  usedVideos: { type: Number, default: 0 },
  usedBytes: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  lastErrorAt: { type: Date, default: null }
}, { timestamps: true, collection: 'storage_providers' }));
