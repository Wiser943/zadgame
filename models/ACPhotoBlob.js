// Backup storage: when imgbb is unreachable / not configured the photo bytes are kept here so saving never fails.
const mongoose = require('mongoose');
module.exports = mongoose.model('ACPhotoBlob', new mongoose.Schema({ mime: String, data: Buffer, createdAt: { type: Date, default: Date.now } }));
