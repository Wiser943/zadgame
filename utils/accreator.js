// Creator programme: who can earn real money from their gists. Pure rules, no database access.
// Change the numbers here to make the programme easier or harder to join.
const DAY = 86400e3;
const REQ = { followers: 1000, posts: 20, ageDays: 30, engagement: 500 };
const COOLDOWN_DAYS = 14;                       // after a rejection, wait this long before applying again

const CRITERIA = [
  { id: 'verified', title: 'Verified account', hint: 'Get the blue tick from the AllConnect team', kind: 'flag', have: (s) => !!s.verified },
  { id: 'followers', title: `${REQ.followers.toLocaleString('en-NG')} followers`, hint: 'People who follow you on P-Gist', need: REQ.followers, have: (s) => s.followers },
  { id: 'posts', title: `${REQ.posts} gists posted`, hint: 'Post regularly, original gists count', need: REQ.posts, have: (s) => s.posts },
  { id: 'engagement', title: `${REQ.engagement} reactions and comments`, hint: 'Total reactions and comments on your gists', need: REQ.engagement, have: (s) => s.reactions + s.comments },
  { id: 'age', title: `Account is ${REQ.ageDays} days old`, hint: 'Counted from the day you joined', need: REQ.ageDays, have: (s) => s.ageDays },
  { id: 'standing', title: 'Good standing', hint: 'No penalties or suspensions on your account', kind: 'flag', have: (s) => !s.penalties && !s.suspended }
];
const MILESTONES = [
  { key: 'followers', label: 'Followers', steps: [100, 500, 1000, 5000, 10000, 50000], fa: 'user-group' },
  { key: 'posts', label: 'Gists posted', steps: [1, 10, 20, 50, 100, 500], fa: 'pen-nib' },
  { key: 'reactions', label: 'Reactions received', steps: [100, 500, 1000, 5000, 10000, 100000], fa: 'heart' }
];
function evaluate(s) {
  const criteria = CRITERIA.map((c) => {
    const have = c.have(s), met = c.kind === 'flag' ? !!have : have >= c.need;
    return { id: c.id, title: c.title, hint: c.hint, flag: c.kind === 'flag', need: c.need || 0, have: c.kind === 'flag' ? (have ? 1 : 0) : have, met, pct: c.kind === 'flag' ? (met ? 100 : 0) : Math.min(100, Math.round((have / c.need) * 100)) };
  });
  return { criteria, eligible: criteria.every((c) => c.met), metCount: criteria.filter((c) => c.met).length };
}
const milestones = (s) => MILESTONES.map((m) => {
  const v = s[m.key] || 0, done = m.steps.filter((x) => v >= x), next = m.steps.find((x) => v < x) || null, prev = done.length ? done[done.length - 1] : 0;
  return { key: m.key, label: m.label, fa: m.fa, value: v, steps: m.steps, reached: done.length, next, pct: next ? Math.round(((v - prev) / (next - prev)) * 100) : 100 };
});
// The state the player sees: locked -> eligible -> applied -> approved (or rejected / suspended by the team)
function stateOf(creator, ev, now = Date.now()) {
  const c = creator || {}, st = c.status || '';
  if (st === 'approved' || st === 'suspended' || st === 'applied') return { state: st, canApply: false };
  if (st === 'rejected') { const wait = c.decidedAt ? Math.ceil((new Date(c.decidedAt).getTime() + COOLDOWN_DAYS * DAY - now) / DAY) : 0; return { state: 'rejected', canApply: ev.eligible && wait <= 0, waitDays: Math.max(0, wait) }; }
  return { state: ev.eligible ? 'eligible' : 'locked', canApply: ev.eligible };
}
module.exports = { REQ, COOLDOWN_DAYS, CRITERIA, MILESTONES, evaluate, milestones, stateOf };
