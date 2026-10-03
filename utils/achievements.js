const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Legendary'];
const DEFS = [
  { id: 'played', title: 'Regular', desc: 'Play matches', steps: [10, 50, 200, 1000], value: (u) => u.stats?.gamesPlayed || 0 },
  { id: 'wins', title: 'Winner', desc: 'Win matches', steps: [5, 25, 100, 500], value: (u) => u.stats?.wins || 0 },
  { id: 'streak', title: 'On Fire', desc: 'Best win streak against real players', steps: [3, 5, 8, 12], value: (u) => u.bestStreak || 0 }
];
// Derived from server-side stats only, so it can never be faked from the browser.
function achievementsFor(u) {
  return DEFS.map((d) => {
    const v = d.value(u);
    const reached = d.steps.filter((s) => v >= s).length;
    const next = d.steps[reached] ?? null;
    return { id: d.id, title: d.title, desc: d.desc, value: v, tier: reached ? TIER_NAMES[reached - 1] : null, tierIndex: reached, next, steps: d.steps };
  });
}
module.exports = { achievementsFor, TIER_NAMES };
