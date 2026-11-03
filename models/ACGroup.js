const mongoose = require('mongoose');
// Group chat. owner is always in admins and members. onlyAdmins = "only admins can send messages".
// joined/reads are keyed by user id: new members only see messages from when they joined; reads drives unread counts.
const S = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 40 }, owner: { type: String, required: true },
  admins: { type: [String], default: [] }, members: { type: [String], default: [], index: true },
  onlyAdmins: { type: Boolean, default: false },
  joined: { type: Map, of: Date, default: {} }, reads: { type: Map, of: Date, default: {} },
  lastAt: { type: Date, default: Date.now, index: true }, createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('ACGroup', S);
