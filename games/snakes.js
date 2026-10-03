// Snakes & Ladders — every game gets its own randomly generated board (snake/ladder positions change each match).
const crypto = require('crypto');
const rnd = n => crypto.randomInt(n);
const rowOf = n => Math.floor((n - 1) / 10);

// Classic layout used only as a fallback for old saved states.
const CLASSIC = { 3:22, 5:8, 11:26, 20:29, 27:1, 21:9, 17:4, 19:7, 43:34, 50:31, 54:36, 62:18, 64:60, 87:24, 91:73, 93:68, 95:75, 99:78 };

// Builds a fair random board: ~7 snakes + ~7 ladders, no square used twice, nothing on 1 or 100, no tiny hops,
// and every jump moves at least 2 rows so it is visible on the board.
function generateJumps(snakeCount = 7, ladderCount = 7) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const used = new Set([1, 100]), jumps = {};
    const free = n => n > 1 && n < 100 && !used.has(n);
    const place = (isSnake) => {
      for (let t = 0; t < 80; t++) {
        const hi = 12 + rnd(88), lo = 2 + rnd(hi - 2);        // hi in 12..99, lo below it
        if (!free(hi) || !free(lo)) continue;
        if (rowOf(hi) - rowOf(lo) < 2) continue;              // must span at least 2 rows
        if (hi - lo > 70) continue;                           // keep slides/climbs readable
        if (isSnake && hi >= 100) continue;
        used.add(hi); used.add(lo);
        if (isSnake) jumps[hi] = lo; else jumps[lo] = hi;     // snake: head(high) -> tail(low); ladder: bottom -> top
        return true;
      }
      return false;
    };
    let ok = true;
    for (let i = 0; i < snakeCount && ok; i++) ok = place(true);
    for (let i = 0; i < ladderCount && ok; i++) ok = place(false);
    // Don't let a snake sit right before the finish line twice in a row (squares 94-99 all snakes would be cruel).
    const nearEnd = Object.keys(jumps).filter(k => +k >= 94 && jumps[k] < +k).length;
    if (ok && nearEnd <= 2) return jumps;
  }
  return { ...CLASSIC };
}

function createInitialState() { return { positions: [0, 0], turn: 0, lastRoll: null, jumps: generateJumps() }; }
function isValidMove(s, i, m) { return s.turn === i && m?.type === 'roll'; }
function applyMove(s, i) {
  const roll = 1 + crypto.randomInt(6), p = Math.min(100, s.positions[i] + roll), jumps = s.jumps || CLASSIC;
  return { ...s, positions: s.positions.map((x, n) => n === i ? (jumps[p] || p) : x), turn: 1 - i, lastRoll: roll };
}
function checkResult(s) { const i = s.positions.findIndex(x => x === 100); return i >= 0 ? { status: 'win', winnerIndex: i } : { status: 'ongoing' }; }
function botMove() { return { type: 'roll' }; }
module.exports = { createInitialState, isValidMove, applyMove, checkResult, botMove, generateJumps, J: CLASSIC };
