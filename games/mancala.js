// Mancala (Kalah rules): 6 pits per side, 4 seeds each. Sow counter-clockwise through your own store (skipping the
// opponent's). Last seed in your store = extra turn. Last seed in one of your own EMPTY pits captures the opposite
// pit (plus the capturing seed) into your store. When one side is empty the other side keeps its remaining seeds.
const PITS = 6, TOTAL = 48;
function createInitialState() { return { pits: [[4, 4, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4]], stores: [0, 0], turn: 0 }; }
const sum = (a) => a.reduce((x, y) => x + y, 0);
const over = (s) => s.stores[0] > TOTAL / 2 || s.stores[1] > TOTAL / 2 || !sum(s.pits[0]) || !sum(s.pits[1]) || s.stores[0] + s.stores[1] === TOTAL;
function isValidMove(s, i, m) { return s.turn === i && Number.isInteger(m?.pit) && m.pit >= 0 && m.pit < PITS && s.pits[i][m.pit] > 0 && !over(s); }
function applyMove(s, i, m) {
  if (!isValidMove(s, i, m)) return s;
  const pits = s.pits.map((r) => r.slice()), stores = s.stores.slice();
  let hand = pits[i][m.pit], side = i, pos = m.pit, turn = 1 - i;
  pits[i][m.pit] = 0;
  while (hand > 0) {
    pos++;
    if (pos === PITS) {                       // reached the end of this row
      if (side === i) { stores[i]++; hand--; if (hand === 0) { turn = i; break; } }   // last seed in own store: extra turn
      side = 1 - side; pos = -1; continue;
    }
    pits[side][pos]++; hand--;
    if (hand === 0 && side === i && pits[i][pos] === 1 && pits[1 - i][PITS - 1 - pos] > 0) {   // capture
      stores[i] += pits[1 - i][PITS - 1 - pos] + 1; pits[1 - i][PITS - 1 - pos] = 0; pits[i][pos] = 0;
    }
  }
  if (!sum(pits[0]) || !sum(pits[1])) { stores[0] += sum(pits[0]); stores[1] += sum(pits[1]); pits[0].fill(0); pits[1].fill(0); }   // sweep
  return { pits, stores, turn };
}
function checkResult(s) {
  if (!over(s)) return { status: 'ongoing' };
  const a = s.stores[0] + sum(s.pits[0]), b = s.stores[1] + sum(s.pits[1]);
  return a === b ? { status: 'draw' } : { status: 'win', winnerIndex: a > b ? 0 : 1 };
}
function botMove(s, i) {
  const moves = s.pits[i].map((x, p) => (x ? { pit: p } : null)).filter(Boolean);
  if (!moves.length) return null;
  const score = (m) => { const n = applyMove(s, i, m); return (n.turn === i ? 6 : 0) + (n.stores[i] - s.stores[i]) * 2 + Math.random(); };
  return moves.map((m) => ({ m, v: score(m) })).sort((a, b) => b.v - a.v)[0].m;
}
module.exports = { createInitialState, isValidMove, applyMove, checkResult, botMove };
