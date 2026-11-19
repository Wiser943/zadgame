// Voice notes sent in private chats, groups and game chat. Small audio clips kept in our own database.
const mongoose = require('mongoose');
module.exports = mongoose.model('ACVoiceBlob', new mongoose.Schema({ user: { type: String, index: true }, mime: String, dur: Number, data: Buffer, createdAt: { type: Date, default: Date.now, index: true } }));
