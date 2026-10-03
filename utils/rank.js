// Competitive tier from rating (coins are cosmetic and never used for rank).
const TIERS = [
  { name: 'Bronze', min: 0 }, { name: 'Silver', min: 1100 }, { name: 'Gold', min: 1250 },
  { name: 'Platinum', min: 1400 }, { name: 'Diamond', min: 1550 }, { name: 'Master', min: 1700 }
];
function rankFor(rating) {
  const r = Number.isFinite(rating) ? rating : 1000;
  let i = 0; TIERS.forEach((t, k) => { if (r >= t.min) i = k; });
  const next = TIERS[i + 1] || null;
  return { tier: TIERS[i].name, rating: r, next: next ? { tier: next.name, at: next.min } : null };
}
module.exports = { TIERS, rankFor };
