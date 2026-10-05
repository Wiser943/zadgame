const test = require('node:test');
const assert = require('node:assert/strict');
const { rankFor } = require('../utils/rank');
const { achievementsFor } = require('../utils/achievements');

test('rank tiers follow rating, default 1000 is Bronze', () => {
  assert.equal(rankFor(1000).tier, 'Bronze');
  assert.equal(rankFor(1100).tier, 'Silver');
  assert.equal(rankFor(1699).tier, 'Diamond');
  assert.equal(rankFor(1700).tier, 'Master');
  assert.equal(rankFor(1700).next, null);
  assert.equal(rankFor(undefined).tier, 'Bronze');
});
test('achievement tiers are derived from stats', () => {
  const a = achievementsFor({ stats: { gamesPlayed: 60, wins: 4 }, bestStreak: 12 });
  const by = Object.fromEntries(a.map(x => [x.id, x]));
  assert.equal(by.played.tier, 'Silver');
  assert.equal(by.wins.tier, null);
  assert.equal(by.wins.next, 5);
  assert.equal(by.streak.tier, 'Legendary');
  assert.equal(by.streak.next, null);
});
test('achievements handle a brand new user', () => {
  assert.ok(achievementsFor({}).every(x => x.tier === null && x.value === 0));
});
