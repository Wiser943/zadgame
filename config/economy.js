// One economy for the whole platform: the GameHub balance IS the AllConnect balance (User.ac.cash, in ₦).
// Everything that used to be "coins" is now naira, so old coin-sized amounts are multiplied by COIN.
const COIN = 1000;

// Every human-vs-human match costs each player a stake. The winner takes the pot (all stakes),
// a draw means everybody loses their stake, and matches that include a bot are free and have no effect on rankings.
const STAKE_DEFAULT = Math.max(0, Math.floor(Number(process.env.GAME_STAKE)) || 5000);
const STAKES = {            // per-game override, e.g. { ludo: 10000, chess: 20000 }. Set a game to 0 to make it free.
};
const stakeFor = (game) => (Object.prototype.hasOwnProperty.call(STAKES, game) && Number.isFinite(STAKES[game]) ? Math.max(0, Math.floor(STAKES[game])) : STAKE_DEFAULT);

module.exports = {
  COIN, STAKE_DEFAULT, STAKES, stakeFor,
  // Tournaments are never free: the admin must set a registration fee of at least this much (₦). Override with TOURNAMENT_MIN_FEE.
  MIN_ENTRY_FEE: Math.max(1, Math.floor(Number(process.env.TOURNAMENT_MIN_FEE)) || 1000),
  DAILY_REWARD: 25 * COIN,
  CHALLENGE_REWARD: { 'play-3': 30 * COIN, 'win-1': 20 * COIN },
  TOURNAMENT_PRIZES: { champion: { coins: 100 * COIN, xp: 30 }, runnerUp: { coins: 40 * COIN, xp: 10 } }
};
