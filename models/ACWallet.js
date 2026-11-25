const mongoose = require('mongoose');
// Pay wallet identity per user: public 10-digit Account ID + hashed payment PIN (never sent to the client).
module.exports = mongoose.model('ACWallet', new mongoose.Schema({
  user: { type: String, required: true, unique: true }, acNum: { type: String, required: true, unique: true },
  pinHash: { type: String, default: '' }, pinSalt: { type: String, default: '' },
  fails: { type: Number, default: 0 }, lockUntil: { type: Date, default: null }
}));
