// A photo taken with the in-game Camera app. The image itself lives on imgbb; we keep the links.
const mongoose = require('mongoose');
const ACPhotoSchema = new mongoose.Schema({
  user: { type: String, index: true },
  url: String,        // full-size image
  thumb: String,      // small preview
  medium: String,
  deleteUrl: String,  // imgbb page that removes the file for good
  imgbbId: String,
  store: { type: String, default: 'imgbb' },   // 'imgbb' or 'db' (backup when imgbb failed)
  w: Number,
  h: Number,
  createdAt: { type: Date, default: Date.now, index: true },
});
module.exports = mongoose.model('ACPhoto', ACPhotoSchema);
