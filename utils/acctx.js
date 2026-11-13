// The one shared "player context" builder that touches the database. Both the Profile milestones
// (routes/acgist.js) and the Transport Residency/Visa tab (routes/actransport.js) need the same cross-system
// numbers — job, cash, homes, vehicles, businesses, friends, posts, pet care — so the Friendship / GistPost /
// GistFollow / ACInvest / ACPet joins live in exactly one place instead of being copied into two route files.
const User = require('../models/User');
const { Friendship } = require('../models/Social');
const { GistPost, GistFollow } = require('../models/Gist');
const ACInvest = require('../models/ACInvest');
const ACPet = require('../models/ACPet');
const J = require('./acjobs');
const { HOMES } = require('./acproperties');

const CTX_FIELDS = 'ac.jobId ac.jobShifts ac.cash ac.bills ac.properties ac.items ac.tr.vehicles ac.tr.licOk ac.party.thrown ac.visa.investorAt';

// `over` lets a caller that already fetched the user doc, friend count, post count or follower count (as
// routes/acgist.js's profile endpoint does, for its own response) pass them in so this does not re-query them.
async function playerContext(id, over = {}) {
  const u = over.u || await User.findById(id).select(CTX_FIELDS).lean();
  if (!u) return null;
  const a = u.ac || {}, tr = a.tr || {};
  const shifts = (a.jobShifts && (a.jobShifts.get ? a.jobShifts.get(a.jobId) : a.jobShifts[a.jobId])) || 0;
  const job = J.jobOf(a.jobId), jobLevel = job ? J.levelOf(job, shifts) : 0, jobTop = !!(job && jobLevel >= job.ladder.length - 1);
  const props = a.properties || [], vehicles = tr.vehicles || [];
  const furniture = (a.items || []).length + props.reduce((s, p) => s + (p.items || []).length, 0);
  const need = []; const idx = {};
  ['friends', 'posts', 'followers', 'invest', 'pet'].forEach((k) => { if (over[k] === undefined) { idx[k] = need.length; need.push(k); } });
  const fetchers = {
    friends: () => Friendship.countDocuments({ status: 'accepted', $or: [{ requester: id }, { recipient: id }] }),
    posts: () => GistPost.countDocuments({ author: id }),
    followers: () => GistFollow.countDocuments({ following: id }),
    invest: () => ACInvest.findOne({ user: id }).select('biz land trucks').lean(),
    pet: () => ACPet.findOne({ user: id }).select('stats').lean()
  };
  const got = await Promise.all(need.map((k) => fetchers[k]()));
  const pick = (k) => (over[k] !== undefined ? over[k] : got[idx[k]]);
  const invest = pick('invest'), pet = pick('pet');
  const biz = (invest && invest.biz) || [], land = (invest && invest.land) || [], trucks = (invest && invest.trucks) || [];
  return {
    jobId: a.jobId || '', shifts, jobLevel, jobTop, cash: Number(a.cash || 0),
    billsPaid: (a.bills || []).filter((b) => b.paidAt).length,
    insured: props.filter((p) => p.insured).length + vehicles.filter((v) => v.insTier).length,
    properties: props.length, owned: props.filter((p) => p.tenure === 'owned').length,
    bigHome: props.some((p) => ((HOMES[p.type] && HOMES[p.type].comfort) || 1) >= 1.4), topHome: props.some((p) => p.type === 'banana_island_mansion'),
    furniture, vehicles: vehicles.length, hasCar: vehicles.some((v) => v.kind === 'car'), licOk: !!tr.licOk,
    hasFleetVehicle: vehicles.some((v) => v.kind === 'bus' || v.kind === 'boat'),
    holdings: biz.length + land.length + trucks.length, staffed: biz.some((b) => (b.staff || 0) > 0),
    friends: pick('friends'), partiesThrown: (a.party && a.party.thrown) || 0, posts: pick('posts'), followers: pick('followers'),
    vetVisits: (pet && pet.stats && pet.stats.vet) || 0, investorPaid: !!(a.visa && a.visa.investorAt)
  };
}
module.exports = { playerContext, CTX_FIELDS };
