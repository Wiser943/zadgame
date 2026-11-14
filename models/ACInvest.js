const mongoose = require('mongoose');
// One document per player: what they own in the Invest app. Money itself lives in User.ac.cash (the shared balance).
const S = new mongoose.Schema({
  user: { type: String, required: true, unique: true },
  land: { type: [{ _id: false, id: String, place: String, paid: Number, at: Number }], default: [] },
  biz: { type: [{ _id: false, key: String, paid: Number, at: Number }], default: [] },
  trucks: { type: [{ _id: false, id: String, paid: Number, at: Number }], default: [] },
  lastPayoutAt: { type: Date, default: null },          // the last 6 PM that has been paid. Moved atomically so an evening is paid once.
  since: { type: Date, default: null },                 // first purchase ("payouts counted from ...")
  earned: { type: Number, default: 0 },                 // all payouts received so far, after tax
  ledger: { type: [{ _id: false, k: String, item: String, pre: Number, tax: Number, net: Number, broke: Boolean }], default: [] },   // last ~300 payout lines
  tot: { type: mongoose.Schema.Types.Mixed, default: {} } // per-item lifetime "before tax" totals
}, { timestamps: true, minimize: false });
module.exports = mongoose.model('ACInvest', S);
