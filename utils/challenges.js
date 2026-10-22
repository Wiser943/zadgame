const { CHALLENGE_REWARD } = require('../config/economy');
const CHALLENGES = [
  { id: 'play-3', title: 'Play 3 matches', stat: 'play', target: 3, reward: CHALLENGE_REWARD['play-3'] },
  { id: 'win-1', title: 'Win a match against a real player', stat: 'win', target: 1, reward: CHALLENGE_REWARD['win-1'] }
];
const today = () => new Date().toISOString().slice(0, 10);
const find = (id) => CHALLENGES.find(c => c.id === id) || null;

// Pure helper: what should a finished match add to each player's progress?
// Anti-exploit: wins only count when at least one OTHER human was in the match (no farming bots).
function matchDeltas(players, winnerIndex) {
  const humans = players.filter(p => !p.bot);
  return players.map((p, i) => {
    if (p.bot) return null;
    const won = winnerIndex === i;
    return { userId: String(p.id), play: 1, win: won && humans.length >= 2 ? 1 : 0 };
  }).filter(Boolean);
}
module.exports = { CHALLENGES, today, find, matchDeltas };
