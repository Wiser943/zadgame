const mongoose = require('mongoose');
// Daily gem hunt. One day doc (_id = Lagos date) counts finders; one find doc per player per day (unique) so nobody is paid twice.
const Day = new mongoose.Schema({ _id: String, count: { type: Number, default: 0 }, first: { type: [{ user: String, name: String }], default: [] } });
const Find = new mongoose.Schema({
  day: { type: String, index: true }, user: { type: String, index: true },
  name: { type: String, default: '' }, rank: { type: Number, default: 0 }, prize: { type: Number, default: 0 }, at: { type: Date, default: Date.now }
});
Find.index({ day: 1, user: 1 }, { unique: true });
module.exports = {
  ACGemDay: mongoose.models.ACGemDay || mongoose.model('ACGemDay', Day),
  ACGemFind: mongoose.models.ACGemFind || mongoose.model('ACGemFind', Find)
};
