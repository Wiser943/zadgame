function moveScore(game, entry) {
  const m = entry?.move || {};
  if (game === 'chess' || game === 'checkers') return Number.isInteger(m.to) ? (m.capture || m.captured ? 4 : 2) : 1;
  if (game === 'connectfour') return Number.isInteger(m.column) ? 2 : 1;
  if (game === 'ludo') return m.type === 'move' ? (m.capture ? 5 : m.tokenHome ? 4 : 2) : 1;
  if (game === 'whot' || game === 'joker') return m.type === 'play' ? 3 : 1;
  if (game === 'words') return String(m.word || '').length ** 2;
  if (game === 'battleship') return 2;
  if (game === 'mancala') return 2;
  return 1;
}
function selectHighlights(game, moves, winnerIndex) {
  const source = (moves || []).filter(x => winnerIndex == null || x.player === winnerIndex);
  return source.map(x => ({ ...x, score: moveScore(game, x) }))
    .sort((a,b) => b.score - a.score || a.at - b.at)
    .slice(0, 6)
    .sort((a,b) => a.at - b.at)
    .map((x,i) => ({ index:i+1, player:x.player, move:x.move, state:x.state, at:x.at, score:x.score }));
}
module.exports = { selectHighlights };
