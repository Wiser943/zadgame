// State House engine. Rules live in utils/acgov.js; this file does the database work.
// Everything that must happen exactly once (the shortlist, the winner, a refund) is claimed with a single atomic update,
// so it is safe when several server instances run the tick at the same time.
const User = require('../models/User');
const ACTxn = require('../models/ACTxn');
const { GistPost, GistFollow } = require('../models/Gist');
const { ACElection, ACBallot, ACFiling, ACOffice, ACGovAnn } = require('../models/ACGov');
const G = require('../utils/acgov');
const eco = require('../utils/economy');
const { notify } = require('../utils/acnotify');
const { makeRef } = require('../utils/acbank');
const profanity = require('../utils/profanity');

const eid = (n, office) => `${n}:${office}`;
const handle = (u) => (u && u.acUsername ? '@' + u.acUsername : (u && u.displayName) || 'Someone');
const lagosDay = (now) => new Date(now + G.HOUR).toISOString().slice(0, 10);
const fail = (code, message) => Object.assign(new Error(message), { code, expose: true });

async function userMap(ids) {
  ids = [...new Set(ids.filter(Boolean).map(String))];
  const rows = ids.length ? await User.find({ _id: { $in: ids } }).select('displayName avatar acUsername verified').lean() : [];
  return new Map(rows.map((u) => [String(u._id), u]));
}
const pub = (u, id) => u ? { id: String(u._id), name: u.displayName || 'Player', username: u.acUsername || '', avatar: u.avatar || '', verified: !!u.verified } : { id: String(id || ''), name: 'Player', username: '', avatar: '', verified: false };

/* ---------- money (every move is also written to the bank statement) ---------- */
async function payIn(userId, amount, note) {
  if (!(amount > 0)) return;
  await eco.credit(userId, amount);
  await ACTxn.create({ user: String(userId), type: 'credit', amount, cpName: 'Lagos State House', cpNum: '', note, ref: makeRef(), kind: 'election' }).catch(() => {});
}
async function payOut(userId, amount, note) {
  const after = await eco.debit(userId, amount); if (after == null) return null;
  await ACTxn.create({ user: String(userId), type: 'debit', amount, cpName: 'Lagos State House', cpNum: '', note, ref: makeRef(), kind: 'election' }).catch(() => {});
  return after;
}
// Give a candidate's filing fee back, once, ever (the flag flips in the same update that decides who pays).
async function refundOnce(electionId, userId, note) {
  const r = await ACElection.updateOne({ _id: electionId, candidates: { $elemMatch: { user: userId, refunded: { $ne: true } } } }, { $set: { 'candidates.$.refunded': true } });
  if (!r.modifiedCount) return 0;
  const el = await ACElection.findById(electionId).select('candidates').lean();
  const c = (el.candidates || []).find((x) => x.user === userId); const fee = c ? c.fee : 0;
  await payIn(userId, fee, note); return fee;
}

/* ---------- gist posts + announcements ---------- */
async function gistPost(io, author, text, election) {
  try {
    const post = await GistPost.create({ author: String(author), text: text || '', election });
    if (io) io.of('/ac').emit('gist:new', { id: String(post._id), author: String(author) });
    return String(post._id);
  } catch (e) { console.error('[gov gist]', e.message); return ''; }
}

/* ---------- election documents ---------- */
async function getElection(n, office) {
  const _id = eid(n, office);
  try { return await ACElection.findOneAndUpdate({ _id }, { $setOnInsert: { cycle: n, office } }, { upsert: true, new: true }); }
  catch (e) { const el = await ACElection.findById(_id); if (el) return el; throw e; }   // two servers created it at the same moment
}
async function tally(n, office, kind) {
  const rows = await ACBallot.aggregate([{ $match: { cycle: n, office, kind } }, { $group: { _id: '$candidate', n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

/* Day 10: pick the 5 on the ballot. Returns { office, count } when THIS call wrote the list (so the caller announces it once), else null. */
async function shortlistIfDue(io, n, office, now) {
  let el = await getElection(n, office);
  const at = G.cycleBounds(n).shortlistAt;
  if (now < at) return null;
  let claimedNow = false;
  if (!el.shortlistDone) {
    const c = await ACElection.findOneAndUpdate({ _id: el._id, shortlistDone: false }, { $set: { shortlistDone: true } }, { new: true });   // from here on nobody can file
    if (c) { el = c; claimedNow = true; } else el = await ACElection.findById(el._id);
  }
  // Whoever claimed it writes the list. If that server died before writing, any server takes over after 60 s.
  if (el.shortlistReady || !(claimedNow || now - at > 60e3)) return null;
  const support = await tally(n, office, 'support');
  const list = G.shortlist(el.candidates, support).map((x) => x.user);
  const w = await ACElection.updateOne({ _id: el._id, shortlistReady: false }, { $set: { shortlistReady: true, shortlist: list, support } });
  if (!w.modifiedCount) return null;
  const off = G.OFFICES[office];
  for (const cand of el.candidates) {
    if (list.includes(cand.user)) { notify(io, cand.user, { icon: off.icon, text: `You are on the ballot for ${off.title} of ${off.scope}! Voting is open until the round ends.`, kind: 'good' }).catch(() => {}); continue; }
    const back = await refundOnce(el._id, cand.user, `${off.title} filing fee refunded (not on the ballot)`);
    if (back) notify(io, cand.user, { icon: '💸', text: `You did not make the top ${G.SHORTLIST_SIZE} for ${off.title}. Your ${G.naira(back)} filing fee is back in your wallet.`, kind: 'info' }).catch(() => {});
  }
  return { office, count: list.length };
}

/* Day 14: count the votes, announce the winner, start their term. */
async function resolveElection(io, n, office, now) {
  if (now < G.cycleBounds(n).end) return;
  await shortlistIfDue(io, n, office, now);
  const claimed = await ACElection.findOneAndUpdate({ _id: eid(n, office), resolved: false, shortlistReady: true }, { $set: { resolved: true, resolvedAt: new Date(now) } }, { new: true });
  if (!claimed) return;
  const [votes, support] = await Promise.all([tally(n, office, 'vote'), tally(n, office, 'support')]);
  const entries = (claimed.candidates || []).filter((c) => claimed.shortlist.includes(c.user));
  const total = Object.values(votes).reduce((a, b) => a + b, 0), win = G.pickWinner(entries, votes, support);
  if (!win) return;                                                                 // nobody ran: the office simply stays empty
  await ACElection.updateOne({ _id: claimed._id }, { $set: { winner: win.user, winnerVotes: votes[win.user] || 0, totalVotes: total } });
  const off = G.OFFICES[office], term = G.termOf(n);
  if (now >= term.until) return;                                                    // the server was down for the whole term: nothing left to hand over
  await ACOffice.findOneAndUpdate({ _id: office }, { $set: { holder: win.user, since: new Date(term.since), until: new Date(term.until), cycle: n, slogan: win.slogan || '', votes: votes[win.user] || 0, policies: {}, policyAt: {}, ann: { day: '', count: 0, last: null } } }, { upsert: true });
  await refreshOffices();
  await refundOnce(claimed._id, win.user, `${off.title} filing fee refunded (you won!)`);
  await payIn(win.user, off.salary, `${off.title} of ${off.scope}: term allowance`);
  const names = await userMap([win.user, ...entries.map((c) => c.user)]), w = names.get(win.user), line = G.wonLine(off, handle(w));
  const pid = await gistPost(io, win.user, line, { office, kind: 'result', slogan: win.slogan || '', votes: votes[win.user] || 0 });
  notify(io, null, { icon: off.icon, text: `${line} ${(votes[win.user] || 0).toLocaleString('en-NG')} votes.`, kind: 'gov', ref: pid, from: win.user }).catch(() => {});
  notify(io, win.user, { icon: '🎉', text: `You are the ${off.title} of ${off.scope}! ${G.naira(off.salary)} allowance paid. Open State House to set policies and make announcements.`, kind: 'good' }).catch(() => {});
  for (const c of entries) if (c.user !== win.user) notify(io, c.user, { icon: off.icon, text: `${handle(w)} won the ${off.title} race. Thank you for running. Try again next round!`, kind: 'info' }).catch(() => {});
}

async function refreshOffices() { G.setOffices(await ACOffice.find().lean()); }

/* Called every 30 seconds, and (throttled) when anybody opens State House. */
let lastTick = 0, ticking = null;
async function tick(io, now = Date.now()) {
  if (ticking) return ticking;
  ticking = (async () => {
    try {
      const c = G.cycleOf(now);
      const old = await ACElection.find({ cycle: { $lt: c.n }, resolved: false }).sort({ cycle: 1 }).select('cycle office').lean();
      for (const e of old) if (G.OFFICES[e.office]) await resolveElection(io, e.cycle, e.office, now);
      const made = [];
      for (const office of G.OFFICE_IDS) { const m = await shortlistIfDue(io, c.n, office, now); if (m && m.count) made.push(G.OFFICES[m.office].title); }
      if (made.length) notify(io, null, { icon: '🗳️', text: `Voting is open! The ballot is set for ${made.join(', ')}. Open State House and cast your vote before the round ends.`, kind: 'gov' }).catch(() => {});
      await refreshOffices(); lastTick = Date.now();
    } finally { ticking = null; }
  })();
  return ticking;
}
const progress = (io, now = Date.now()) => (Date.now() - lastTick < 5000 ? Promise.resolve() : tick(io, now));

/* ---------- player actions ---------- */
async function facts(uid, now) {
  const [u, followers] = await Promise.all([User.findById(uid).select('createdAt acUsername ac.cash displayName').lean(), GistFollow.countDocuments({ following: uid })]);
  if (!u) throw fail(404, 'No account.');
  return { u, f: { username: u.acUsername || '', ageDays: G.ageDays(u.createdAt, now), followers, cash: (u.ac && u.ac.cash) || 0 } };
}
const cleanText = (s, min, max, what) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
  if (t.length < min) throw fail(400, `${what} must be at least ${min} characters.`);
  if (profanity.isDirty(t)) throw fail(400, `Please keep your ${what.toLowerCase()} clean.`);
  return t;
};

async function file(io, uid, officeId, sloganRaw, now = Date.now()) {
  const off = G.OFFICES[officeId]; if (!off) throw fail(400, 'Unknown office.');
  const c = G.cycleOf(now); if (c.phase !== 'campaign') throw fail(409, 'Filing is closed. Voting is on, so wait for the next round.');
  const slogan = cleanText(sloganRaw, 3, 80, 'Campaign slogan');
  const { u, f } = await facts(uid, now);
  const el = await getElection(c.n, officeId); if (el.shortlistDone) throw fail(409, 'Filing is closed for this round.');
  const lockId = `${c.n}:${uid}`;
  try { await ACFiling.create({ _id: lockId, office: officeId }); } catch (e) { throw fail(409, 'You are already running in this round. One race per round.'); }
  const undo = async () => { await ACFiling.deleteOne({ _id: lockId }).catch(() => {}); };
  const el2 = G.eligibility(officeId, { ...f, running: false });
  if (!el2.ok) { await undo(); throw fail(el2.first.id === 'fee' ? 402 : 400, `You cannot run yet: ${el2.first.label}.`); }
  const after = await payOut(uid, off.fee, `${off.title} of ${off.scope}: filing fee`);
  if (after == null) { await undo(); throw fail(402, 'Not enough ₦ for the filing fee.'); }
  const pushed = await ACElection.updateOne({ _id: eid(c.n, officeId), shortlistDone: false, 'candidates.user': { $ne: uid } }, { $push: { candidates: { user: uid, slogan, filedAt: new Date(now), fee: off.fee } } });
  if (!pushed.modifiedCount) { await payIn(uid, off.fee, `${off.title} filing fee refunded`); await undo(); throw fail(409, 'Filing just closed. Your fee was returned.'); }
  await gistPost(io, uid, '', { office: officeId, kind: 'campaign', slogan, votes: 0 });
  return { cash: after, handle: handle(u) };
}

async function support(uid, officeId, candidate, now = Date.now()) {
  if (!G.OFFICES[officeId]) throw fail(400, 'Unknown office.');
  const c = G.cycleOf(now); if (c.phase !== 'campaign') throw fail(409, 'Campaign backing is over. Voting is on.');
  const { f } = await facts(uid, now); if (!G.voterOk(f.ageDays)) throw fail(403, 'Your account is too new to back a candidate. Try again tomorrow.');
  const _id = eid(c.n, officeId), key = { cycle: c.n, office: officeId, kind: 'support', user: uid };
  if (!candidate) { await ACBallot.deleteOne(key); return { backed: '' }; }
  candidate = String(candidate); if (candidate === uid) throw fail(400, 'You cannot back yourself.');
  const el = await ACElection.findOne({ _id, 'candidates.user': candidate, shortlistDone: false }).select('_id').lean(); if (!el) throw fail(404, 'That person is not running (or the campaign just ended).');
  await ACBallot.updateOne(key, { $set: { candidate, at: new Date(now) } }, { upsert: true });
  return { backed: candidate };
}

async function vote(uid, officeId, candidate, now = Date.now()) {
  if (!G.OFFICES[officeId]) throw fail(400, 'Unknown office.');
  const c = G.cycleOf(now); if (c.phase !== 'voting') throw fail(409, 'Voting has not started. The ballot is set when the campaign ends.');
  const { f } = await facts(uid, now); if (!G.voterOk(f.ageDays)) throw fail(403, 'Your account is too new to vote. Try again tomorrow.');
  candidate = String(candidate || ''); if (candidate === uid) throw fail(400, 'You cannot vote for yourself.');
  const el = await ACElection.findOne({ _id: eid(c.n, officeId), shortlistReady: true, shortlist: candidate }).select('_id').lean(); if (!el) throw fail(404, 'That person is not on the ballot.');
  try { await ACBallot.create({ cycle: c.n, office: officeId, kind: 'vote', user: uid, candidate, at: new Date(now) }); }
  catch (e) { if (e && e.code === 11000) throw fail(409, 'You already voted in this race. Votes are final.'); throw e; }
  return { voted: candidate };
}

async function activeOffice(uid, officeId, now) {
  const o = await ACOffice.findById(officeId).lean();
  if (!o || o.holder !== uid || !G.isActive(o, now)) throw fail(403, 'Only the sitting ' + ((G.OFFICES[officeId] || {}).title || 'officeholder') + ' can do that.');
  return o;
}

async function announce(io, uid, officeId, textRaw, now = Date.now()) {
  if (!G.OFFICES[officeId]) throw fail(400, 'Unknown office.');
  const off = G.OFFICES[officeId]; await activeOffice(uid, officeId, now);
  const text = cleanText(textRaw, 3, 200, 'Announcement'), day = lagosDay(now);
  const same = await ACOffice.updateOne({ _id: officeId, holder: uid, 'ann.day': day, 'ann.count': { $lt: G.ANN_PER_DAY }, 'ann.last': { $not: { $gt: new Date(now - G.ANN_GAP) } } }, { $inc: { 'ann.count': 1 }, $set: { 'ann.last': new Date(now) } });
  if (!same.modifiedCount) {
    const fresh = await ACOffice.updateOne({ _id: officeId, holder: uid, 'ann.day': { $ne: day } }, { $set: { ann: { day, count: 1, last: new Date(now) } } });
    if (!fresh.modifiedCount) throw fail(429, `You can post ${G.ANN_PER_DAY} announcements a day, a minute apart.`);
  }
  await ACGovAnn.create({ office: officeId, user: uid, text, at: new Date(now) });
  const who = (await userMap([uid])).get(uid);
  const pid = await gistPost(io, uid, text, { office: officeId, kind: 'announce' });
  notify(io, null, { icon: off.icon, text: `${off.title} ${handle(who)}: ${text}`, kind: 'gov', ref: pid, from: uid }).catch(() => {});
  return { text };
}

async function setPolicy(io, uid, officeId, slot, optionId, now = Date.now()) {
  const off = G.OFFICES[officeId]; if (!off) throw fail(400, 'Unknown office.');
  const pol = off.policies[slot]; if (!pol) throw fail(400, 'Unknown policy.');
  const opt = pol.options.find((x) => x.id === optionId); if (!opt) throw fail(400, 'Unknown option.');
  const cur = await activeOffice(uid, officeId, now);
  if (G.currentOption(officeId, slot, cur.policies).id === opt.id) throw fail(400, 'That policy is already in place.');
  const r = await ACOffice.updateOne({ _id: officeId, holder: uid, until: { $gt: new Date(now) }, [`policyAt.${slot}`]: { $not: { $gt: new Date(now - G.POLICY_COOLDOWN) } } }, { $set: { [`policies.${slot}`]: opt.id, [`policyAt.${slot}`]: new Date(now) } });
  if (!r.modifiedCount) throw fail(429, 'You changed this policy recently. Policies can change once every 6 hours.');
  await refreshOffices();
  const who = (await userMap([uid])).get(uid), fx = G.describeFx(opt.fx).map((e) => `${e.label} ${e.pct > 0 ? '+' : ''}${e.pct}%`).join(', ');
  notify(io, null, { icon: off.icon, text: `${off.title} ${handle(who)}: ${pol.name} is now "${opt.label}"${fx ? ` (${fx})` : ''}.`, kind: 'gov', from: uid }).catch(() => {});
  return { slot, option: opt.id };
}

/* ---------- everything the State House screen needs, in one call ---------- */
async function state(uid, query = {}, now = Date.now()) {
  const c = G.cycleOf(now), q = String(query.q || '').trim().toLowerCase().slice(0, 30);
  const [{ u, f }, offices, elections, mine, filing, counts, anns] = await Promise.all([
    facts(uid, now), ACOffice.find().lean(), ACElection.find({ cycle: c.n }).lean(), ACBallot.find({ cycle: c.n, user: uid }).lean(), ACFiling.findById(`${c.n}:${uid}`).lean(),
    ACBallot.aggregate([{ $match: { cycle: c.n } }, { $group: { _id: { o: '$office', k: '$kind', c: '$candidate' }, n: { $sum: 1 } } }]),
    ACGovAnn.find().sort({ at: -1 }).limit(40).lean()]);
  const oBy = Object.fromEntries(offices.map((o) => [o._id, o])), eBy = Object.fromEntries(elections.map((e) => [e.office, e]));
  const cnt = { support: {}, vote: {} }; for (const r of counts) { const k = cnt[r._id.k]; (k[r._id.o] = k[r._id.o] || {})[r._id.c] = r.n; }
  const names = await userMap([...offices.map((o) => o.holder), ...elections.flatMap((e) => e.candidates.map((x) => x.user)), ...anns.map((a) => a.user)]);
  const out = {};
  for (const id of G.OFFICE_IDS) {
    const d = G.OFFICES[id], o = oBy[id], el = eBy[id] || { candidates: [], shortlist: [], shortlistDone: false, shortlistReady: false };
    const active = G.isActive(o, now), myS = mine.find((b) => b.office === id && b.kind === 'support'), myV = mine.find((b) => b.office === id && b.kind === 'vote');
    const sup = (cnt.support || {})[id] || {}, vts = (cnt.vote || {})[id] || {};
    const voting = c.phase === 'voting' && el.shortlistReady, ranked = [...el.candidates].sort((a, b) => ((sup[b.user] || 0) - (sup[a.user] || 0)) || (new Date(a.filedAt) - new Date(b.filedAt)));
    let list = voting ? ranked.filter((x) => el.shortlist.includes(x.user)) : ranked;
    const rankOf = new Map(list.map((x, i) => [x.user, i + 1])), total = list.length; if (q) list = list.filter((x) => { const p = names.get(x.user) || {}; return `${p.acUsername || ''} ${p.displayName || ''} ${x.slogan}`.toLowerCase().includes(q); });
    const showVotes = !!myV, voteTotal = Object.values(vts).reduce((a, b) => a + b, 0);
    const iRun = el.candidates.some((x) => x.user === uid), elig = G.eligibility(id, { ...f, running: !!filing && !iRun });
    out[id] = {
      id, title: d.title, scope: d.scope, icon: d.icon, fa: d.fa, color: d.color, fee: d.fee, salary: d.salary,
      holder: active ? { user: pub(names.get(o.holder), o.holder), slogan: o.slogan || '', votes: o.votes || 0, until: +new Date(o.until), mine: o.holder === uid } : null,
      election: {
        phase: c.phase, ballot: voting, total, iRun, filedElsewhere: !!filing && !iRun, myBack: myS ? myS.candidate : '', myVote: myV ? myV.candidate : '', voteTotal: showVotes ? voteTotal : null,
        eligibility: elig,
        candidates: list.slice(0, 40).map((x) => ({ user: pub(names.get(x.user), x.user), slogan: x.slogan, support: sup[x.user] || 0, rank: rankOf.get(x.user), mine: x.user === uid, top: rankOf.get(x.user) <= G.SHORTLIST_SIZE, votes: showVotes ? (vts[x.user] || 0) : null }))
      },
      policies: Object.entries(d.policies).map(([slot, p]) => {
        const cur = G.currentOption(id, slot, o && o.policies), at = o && o.policyAt && o.policyAt[slot] ? +new Date(o.policyAt[slot]) : 0;
        return { slot, name: p.name, current: active ? cur.id : 'std', cooldownUntil: active && at ? at + G.POLICY_COOLDOWN : 0, options: p.options.map((x) => ({ id: x.id, label: x.label, text: x.text, effects: G.describeFx(x.fx) })) };
      }),
      announcements: anns.filter((a) => a.office === id).slice(0, 5).map((a) => ({ text: a.text, at: +new Date(a.at), by: pub(names.get(a.user), a.user) })),
      ann: active && o.holder === uid ? { left: Math.max(0, G.ANN_PER_DAY - (o.ann && o.ann.day === lagosDay(now) ? o.ann.count : 0)) } : null
    };
  }
  return { now, cash: f.cash, voterOk: G.voterOk(f.ageDays), cycle: { n: c.n, start: c.start, end: c.end, shortlistAt: c.shortlistAt, phase: c.phase }, shortlistSize: G.SHORTLIST_SIZE, offices: out };
}

module.exports = { tick, progress, refreshOffices, file, support, vote, announce, setPolicy, state, fail };
