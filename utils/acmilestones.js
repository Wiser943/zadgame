// Life milestones for the Profile page (not a separate app — see public/allconnect/gist.js drawProfile()).
// Pure function: the route (routes/acgist.js) gathers the numbers from across the game (jobs, cash, properties,
// transport, Invest, friends, gists, bills, insurance) into a flat `ctx` object; this file only decides which
// milestones are unlocked from those numbers. No database access in here, so it is easy to unit test.
const MILESTONES = [
  // Career
  { id: 'first_job', group: 'Career', emoji: '💼', title: 'First Job', desc: 'Got hired for the first time.', ok: (c) => !!c.jobId },
  { id: 'clocked_in', group: 'Career', emoji: '⏱️', title: 'Clocked In', desc: 'Worked your first shift.', ok: (c) => c.shifts >= 1 },
  { id: 'moving_up', group: 'Career', emoji: '📈', title: 'Moving Up', desc: 'Earned your first promotion.', ok: (c) => c.jobLevel >= 1 },
  { id: 'top_ladder', group: 'Career', emoji: '🪜', title: 'Top of the Ladder', desc: 'Reached the top title in a career.', ok: (c) => c.jobTop },
  // Money
  { id: 'first_cash', group: 'Money', emoji: '💵', title: 'First ₦50,000', desc: 'Built up your first ₦50,000.', ok: (c) => c.cash >= 50000 },
  { id: 'six_figures', group: 'Money', emoji: '💰', title: 'Six Figures', desc: 'Reached ₦100,000 in cash.', ok: (c) => c.cash >= 100000 },
  { id: 'half_million', group: 'Money', emoji: '🏦', title: 'Half a Million', desc: 'Reached ₦500,000 in cash.', ok: (c) => c.cash >= 500000 },
  { id: 'millionaire', group: 'Money', emoji: '🤑', title: 'Millionaire', desc: 'Reached ₦1,000,000 in cash.', ok: (c) => c.cash >= 1000000 },
  { id: 'multi_millionaire', group: 'Money', emoji: '👑', title: 'Multi-Millionaire', desc: 'Reached ₦10,000,000 in cash.', ok: (c) => c.cash >= 10000000 },
  { id: 'bill_payer', group: 'Money', emoji: '🧾', title: 'Bill Payer', desc: 'Paid a household bill.', ok: (c) => c.billsPaid >= 1 },
  { id: 'insured', group: 'Money', emoji: '🛡️', title: 'Insured', desc: 'Took out insurance on a car or a home.', ok: (c) => c.insured >= 1 },
  // Home
  { id: 'first_home', group: 'Home', emoji: '🏠', title: 'First Home', desc: 'Moved into a place of your own.', ok: (c) => c.properties >= 1 },
  { id: 'homeowner', group: 'Home', emoji: '🔑', title: 'Homeowner', desc: 'Own a home outright (no rent to pay).', ok: (c) => c.owned >= 1 },
  { id: 'family_house', group: 'Home', emoji: '🏡', title: 'Room to Grow', desc: 'Moved into a Family House or bigger.', ok: (c) => c.bigHome },
  { id: 'banana_island', group: 'Home', emoji: '🏝️', title: 'Banana Island Life', desc: 'Own the Banana Island Mansion.', ok: (c) => c.topHome },
  { id: 'styled_home', group: 'Home', emoji: '🛋️', title: 'Decorator', desc: 'Furnished a home with 5 or more pieces.', ok: (c) => c.furniture >= 5 },
  // Transport
  { id: 'getting_around', group: 'Transport', emoji: '🚲', title: 'Getting Around', desc: 'Bought your first ride.', ok: (c) => c.vehicles >= 1 },
  { id: 'first_car', group: 'Transport', emoji: '🚗', title: 'First Car', desc: 'Own a car.', ok: (c) => c.hasCar },
  { id: 'licensed', group: 'Transport', emoji: '🪪', title: 'Licensed Driver', desc: 'Passed the driving licence test.', ok: (c) => c.licOk },
  { id: 'collector', group: 'Transport', emoji: '🧰', title: 'Collector', desc: 'Own 3 or more vehicles.', ok: (c) => c.vehicles >= 3 },
  { id: 'fleet_owner', group: 'Transport', emoji: '🚌', title: 'Fleet Owner', desc: 'Own a bus or a boat.', ok: (c) => c.hasFleetVehicle },
  // Business
  { id: 'first_biz', group: 'Business', emoji: '🏪', title: 'First Business', desc: 'Opened a business, a plot or a trailer.', ok: (c) => c.holdings >= 1 },
  { id: 'running_it', group: 'Business', emoji: '🧑‍💼', title: 'Running It', desc: 'Hired staff for a business you own.', ok: (c) => c.staffed },
  { id: 'business_mogul', group: 'Business', emoji: '🏙️', title: 'Business Mogul', desc: 'Hold 3 or more businesses, plots or trailers.', ok: (c) => c.holdings >= 3 },
  // Social
  { id: 'first_friend', group: 'Social', emoji: '🤝', title: 'First Friend', desc: 'Made your first friend.', ok: (c) => c.friends >= 1 },
  { id: 'social_star', group: 'Social', emoji: '🌟', title: 'Social Star', desc: 'Made 10 or more friends.', ok: (c) => c.friends >= 10 },
  { id: 'host', group: 'Social', emoji: '🎉', title: 'The Host', desc: 'Threw a house party.', ok: (c) => c.partiesThrown >= 1 },
  { id: 'first_gist', group: 'Social', emoji: '📝', title: 'First Gist', desc: 'Made your first post.', ok: (c) => c.posts >= 1 },
  { id: 'influencer', group: 'Social', emoji: '📣', title: 'Influencer', desc: 'Reached 50 followers.', ok: (c) => c.followers >= 50 }
];
// `ctx` fields (all plain numbers/booleans, no raw documents): jobId, shifts, jobLevel, jobTop, cash, billsPaid,
// insured, properties, owned, bigHome, topHome, furniture, vehicles, hasCar, licOk, hasFleetVehicle, holdings,
// staffed, friends, partiesThrown, posts, followers.
function milestonesFor(ctx) {
  const c = ctx || {};
  const list = MILESTONES.map((m) => ({ id: m.id, group: m.group, emoji: m.emoji, title: m.title, desc: m.desc, done: !!m.ok(c) }));
  return { list, total: list.length, done: list.filter((m) => m.done).length };
}
module.exports = { MILESTONES, milestonesFor };
