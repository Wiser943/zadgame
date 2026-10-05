const mongoose = require('mongoose');
// One document (_id: 'global') holding platform-wide counters.
module.exports = mongoose.model('ACStat', new mongoose.Schema({ _id: String, visits: { type: Number, default: 0 }, gems: { type: Number, default: 0 } }));
