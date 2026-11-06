const { wordScore } = require('../games/words');
function moveScore(game, entry, prevRaw) {
  const m = entry?.move || {};
  if (game === 'snakes') {
    const a = entry?.state?.positions?.[entry.player] ?? 0, b = prevRaw?.positions?.[entry.player] ?? 0, r = entry?.state?.lastRoll || 0;
    const jump = a - b - r;   // >0 ladder, <0 snake, 0 plain move
    return a >= 100 ? 6 : jump > 0 ? 5 : jump < 0 ? 0 : r === 6 ? 2 : 1;
  }
  if (game === 'chess' || game === 'checkers') return Number.isInteger(m.to) ? (m.capture || m.captured ? 4 : 2) : 1;
  if (game === 'connectfour') return Number.isInteger(m.column) ? 2 : 1;
  if (game === 'ludo') return m.type === 'move' ? (m.capture ? 5 : m.tokenHome ? 4 : 2) : 1;
  if (game === 'whot' || game === 'joker') return m.type === 'play' ? 3 : 1;
  if (game === 'words') return (m.swap || m.pass || !m.word) ? 0 : Math.max(1, Math.round(wordScore(m.word) / 3));
  if (game === 'battleship') return 2;
  if (game === 'mancala') return 2;
  return 1;
}
// Picks the winner's best moves. Each clip carries the state AFTER the move (`state`) and the state BEFORE it (`prev`),
// both converted to the winner's point of view, so the client can animate the move itself.
function selectHighlights(game, moves, winnerIndex, publicState) {
  const all = moves || [];
  const view = st => {
    if (st == null) return null;
    if (typeof publicState === 'function' && winnerIndex != null) { try { return publicState(st, winnerIndex); } catch { return st; } }
    return st;
  };
  const source = all.map((x, idx) => ({ x, idx })).filter(({ x }) => winnerIndex == null || x.player === winnerIndex);
  return source.map(({ x, idx }) => ({ x, idx, score: moveScore(game, x, idx > 0 ? all[idx - 1].state : all[0].before) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score || a.x.at - b.x.at)
    .slice(0, 6)
    .sort((a, b) => a.x.at - b.x.at)
    .map((r, i) => ({ index: i + 1, player: r.x.player, move: r.x.move, state: view(r.x.state), prev: r.idx > 0 ? view(all[r.idx - 1].state) : view(all[0].before), at: r.x.at, score: r.score }));
}
module.exports = { selectHighlights, moveScore };
