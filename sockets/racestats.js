/* Drive Race results that are kept: points, wins, best times, and a weekly board (Lagos week, Monday to Sunday).
   Only ranked races count (two or more real players), so racing alone against bots cannot farm points. */
const L = require('../utils/lagosrun');

/* Adds one race to a stats record. Pure, so the same rule is used by the database and by the tests. */
function applyResult(d, e, weekKey) {
  d.name = e.name || d.name || '';
  if (d.weekKey !== weekKey) { d.weekKey = weekKey; d.weekPoints = 0; d.weekRaces = 0; }
  const pts = e.dnf ? 0 : Math.max(0, Number(e.points) || 0);
  d.races = (d.races || 0) + 1; d.weekRaces = (d.weekRaces || 0) + 1; d.points = (d.points || 0) + pts; d.weekPoints = (d.weekPoints || 0) + pts;
  if (!e.dnf && e.place === 1) d.wins = (d.wins || 0) + 1;
  if (!e.dnf && e.place <= 3) d.podiums = (d.podiums || 0) + 1;
  if (!e.dnf && e.timeMs && (!d.bestTimeMs || e.timeMs < d.bestTimeMs)) d.bestTimeMs = e.timeMs;
  if (e.bestLapMs && (!d.bestLapMs || e.bestLapMs < d.bestLapMs)) d.bestLapMs = e.bestLapMs;
  return d;
}
/* The rows to save for a finished race: real players only, and only when the race was ranked. */
function entriesFrom(results) {
  if (!results || !results.ranked) return [];
  return results.order.filter((r) => !r.bot && !r.left).map((r) => ({ id: r.id, name: r.name, place: r.place, points: r.points, timeMs: r.timeMs, bestLapMs: r.bestLapMs, dnf: r.dnf }));
}
const row = (d, i) => ({ rank: i + 1, id: String(d.user || d.id), name: d.name, points: d.points, weekPoints: d.weekPoints, wins: d.wins, races: d.races });

/* the real store, on MongoDB (loaded only when it is first used) */
function mongoStore() {
  let M; const model = () => M || (M = require('../models/RaceStat'));
  return {
    async record(e, now = Date.now()) {
      const wk = L.periodKeys(now).week, R = model(); let d = await R.findOne({ user: e.id });
      if (!d) d = new R({ user: e.id }); applyResult(d, e, wk); await d.save();
    },
    async board(uid, now = Date.now()) {
      const wk = L.periodKeys(now).week, R = model();
      const [week, all, me] = await Promise.all([R.find({ weekKey: wk, weekPoints: { $gt: 0 } }).sort({ weekPoints: -1, wins: -1 }).limit(10).lean(), R.find({ points: { $gt: 0 } }).sort({ points: -1 }).limit(10).lean(), R.findOne({ user: uid }).lean()]);
      let rank = null; if (me && me.weekKey === wk && me.weekPoints > 0) rank = (await R.countDocuments({ weekKey: wk, weekPoints: { $gt: me.weekPoints } })) + 1;
      return { weekKey: wk, week: week.map(row), all: all.map(row), me: me ? { name: me.name, races: me.races, wins: me.wins, podiums: me.podiums, points: me.points, weekPoints: me.weekKey === wk ? me.weekPoints : 0, weekRank: rank, bestLapMs: me.bestLapMs, bestTimeMs: me.bestTimeMs } : null };
    }
  };
}
/* a store that lives in memory: for tests, and so the race still works if the database is down */
function memoryStore() {
  const m = new Map();
  return {
    async record(e, now = Date.now()) { const d = m.get(e.id) || { id: e.id }; applyResult(d, e, L.periodKeys(now).week); m.set(e.id, d); },
    async board(uid, now = Date.now()) {
      const wk = L.periodKeys(now).week, all = [...m.values()];
      const week = all.filter((d) => d.weekKey === wk && d.weekPoints > 0).sort((a, b) => b.weekPoints - a.weekPoints || b.wins - a.wins).slice(0, 10).map(row);
      const top = all.filter((d) => d.points > 0).sort((a, b) => b.points - a.points).slice(0, 10).map(row), me = m.get(uid) || null;
      return { weekKey: wk, week, all: top, me: me ? { name: me.name, races: me.races, wins: me.wins, podiums: me.podiums, points: me.points, weekPoints: me.weekKey === wk ? me.weekPoints : 0, weekRank: me.weekKey === wk && me.weekPoints > 0 ? week.findIndex((x) => x.id === uid) + 1 || null : null, bestLapMs: me.bestLapMs, bestTimeMs: me.bestTimeMs } : null };
    }
  };
}
module.exports = { applyResult, entriesFrom, mongoStore, memoryStore };
