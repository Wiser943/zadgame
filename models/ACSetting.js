const mongoose = require('mongoose');
// Small key/value settings edited from the admin panel (e.g. _id 'socials').
module.exports = mongoose.model('ACSetting', new mongoose.Schema({ _id: String, value: mongoose.Schema.Types.Mixed }, { minimize: false }));
