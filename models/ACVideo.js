// Metadata for a video uploaded straight to Mux (the video bytes live on Mux, only this record lives in MongoDB).
// Created when the upload starts (status 'pending'), filled in once Mux has processed it ('ready').
// It stays until the player deletes the video from the gallery; deleting a reel post alone does not remove it.
const mongoose = require('mongoose');
module.exports = mongoose.model('ACVideo', new mongoose.Schema({
  user: { type: String, index: true },
  uploadId: { type: String, index: true },
  assetId: { type: String, unique: true, sparse: true },
  status: { type: String, default: 'ready' },   // 'pending' | 'ready'
  playbackId: String,
  url: String,        // HLS stream
  poster: String,     // cover image
  thumb: String,      // small cover
  dur: Number,
  signed: { type: Boolean, default: false },   // signed (expiring) playback links
  cc: { type: Boolean, default: false },       // auto captions were requested
  provider: { type: String, default: 'mux', index: true },   // which host stores the bytes (see services/video)
  bytes: { type: Number, default: 0 },         // size counted against the host's byte limit
  quota: { type: Boolean, default: true },     // true while this video holds a slot in its host's quota (so it is released exactly once)
  ext: { type: mongoose.Schema.Types.Mixed, default: {} },   // host-specific ids (Cloudinary public_id, Vimeo uri, ImageKit fileId ...)
  createdAt: { type: Date, default: Date.now, index: true },
}));
