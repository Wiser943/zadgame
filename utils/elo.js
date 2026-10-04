// Elo rating helpers. Coins are cosmetic and never used here.
const START = 1000, PLACEMENT_GAMES = 10;
const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
const kFor = (gamesPlayedInGame) => (gamesPlayedInGame < PLACEMENT_GAMES ? 48 : 24);
// scoreA: 1 win, 0.5 draw, 0 loss. Returns integer deltas for each side (never takes a rating below 100).
function eloDeltas(ra, rb, scoreA, gamesA = 99, gamesB = 99) {
  const ea = expected(ra, rb);
  let da = Math.round(kFor(gamesA) * (scoreA - ea));
  let db = Math.round(kFor(gamesB) * ((1 - scoreA) - (1 - ea)));
  if (scoreA === 1 && da < 1) da = 1;           // a win always gains something
  if (scoreA === 0 && db < 1) db = 1;
  if (ra + da < 100) da = 100 - ra;
  if (rb + db < 100) db = 100 - rb;
  return [da, db];
}
// Matchmaking band widens with waiting time: 100 +50 every 10s, capped at 600.
const bandFor = (waitMs) => Math.min(600, 100 + 50 * Math.floor(waitMs / 10000));
const canPair = (a, b, now) => Math.abs(a.rating - b.rating) <= Math.max(bandFor(now - a.since), bandFor(now - b.since));
module.exports = { START, PLACEMENT_GAMES, expected, kFor, eloDeltas, bandFor, canPair };
