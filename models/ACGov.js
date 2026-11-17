// State House data (see utils/acgov.js for the rules and services/govService.js for what happens to it).
const mongoose = require('mongoose');
const { Schema } = mongoose;

// One election per office per 14-day round: _id = "<round>:<office>", e.g. "3:governor".
const Candidate = new Schema({ _id: false, user: String, slogan: { type: String, default: '' }, filedAt: { type: Date, default: Date.now }, fee: { type: Number, default: 0 }, refunded: { type: Boolean, default: false } });
const ACElection = mongoose.model('ACElection', new Schema({
  _id: String, cycle: { type: Number, index: true }, office: String,
  candidates: { type: [Candidate], default: [] },
  shortlistDone: { type: Boolean, default: false },       // claimed by whichever server instance got there first
  shortlistReady: { type: Boolean, default: false },      // the list below has been written
  shortlist: { type: [String], default: [] }, support: { type: Schema.Types.Mixed, default: {} },
  resolved: { type: Boolean, default: false, index: true }, resolvedAt: Date,
  winner: { type: String, default: '' }, winnerVotes: { type: Number, default: 0 }, totalVotes: { type: Number, default: 0 }
}, { minimize: false }));

// One row per player per race: kind 'support' (campaign, can be changed) or 'vote' (ballot, final).
const BallotSchema = new Schema({ cycle: Number, office: String, kind: { type: String, enum: ['support', 'vote'] }, user: String, candidate: String, at: { type: Date, default: Date.now } });
BallotSchema.index({ cycle: 1, office: 1, kind: 1, user: 1 }, { unique: true });
BallotSchema.index({ cycle: 1, office: 1, kind: 1, candidate: 1 });
const ACBallot = mongoose.model('ACBallot', BallotSchema);

// Lock so a player can only be a candidate in one race per round: _id = "<round>:<userId>".
const ACFiling = mongoose.model('ACFiling', new Schema({ _id: String, office: String, at: { type: Date, default: Date.now } }));

// Who holds each office right now (_id = office id) and the policies they chose.
const ACOffice = mongoose.model('ACOffice', new Schema({
  _id: String, holder: { type: String, default: '' }, since: Date, until: Date, cycle: Number, slogan: { type: String, default: '' }, votes: { type: Number, default: 0 },
  policies: { type: Schema.Types.Mixed, default: {} },    // { slot: optionId }
  policyAt: { type: Schema.Types.Mixed, default: {} },    // { slot: Date of last change }
  ann: { day: { type: String, default: '' }, count: { type: Number, default: 0 }, last: { type: Date, default: null } }
}, { minimize: false }));

// Official announcements, newest first on the screen.
const AnnSchema = new Schema({ office: { type: String, index: true }, user: String, text: String, at: { type: Date, default: Date.now, index: true } });
const ACGovAnn = mongoose.model('ACGovAnn', AnnSchema);

module.exports = { ACElection, ACBallot, ACFiling, ACOffice, ACGovAnn };
