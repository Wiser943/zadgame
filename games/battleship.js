// Battleship, 2 players, 10x10. Each fleet (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2) is placed
// at random without overlap when the match is created, so positions are not predictable. You win by sinking every
// enemy ship. Players only ever receive the cells they have already fired at, plus ships that have been sunk.
const N = 10;
const FLEET = [['Carrier', 5], ['Battleship', 4], ['Cruiser', 3], ['Submarine', 3], ['Destroyer', 2]];
const SHIP_CELLS = FLEET.reduce((a, [, n]) => a + n, 0);
const grid = () => Array.from({ length: N }, () => Array(N).fill(false));

function placeFleet(rand = Math.random) {
  for (;;) {                                         // retry until every ship fits (almost always first try)
    const taken = new Set(), ships = []; let ok = true;
    for (const [name, len] of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horiz = rand() < 0.5, r = Math.floor(rand() * (horiz ? N : N - len + 1)), c = Math.floor(rand() * (horiz ? N - len + 1 : N));
        const cells = Array.from({ length: len }, (_, k) => [horiz ? r : r + k, horiz ? c + k : c]);
        if (cells.some(([a, b]) => taken.has(a * N + b))) continue;
        cells.forEach(([a, b]) => taken.add(a * N + b)); ships.push({ name, cells }); placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}
const toBoard = (ships) => { const b = grid(); ships.forEach((sh) => sh.cells.forEach(([r, c]) => { b[r][c] = true; })); return b; };
function createInitialState(_n, rand) {
  const fleets = [placeFleet(rand), placeFleet(rand)];
  return { fleets, boards: fleets.map(toBoard), shots: [[], []], turn: 0, lastShot: null };
}
const fired = (s, i, r, c) => s.shots[i].some((x) => x[0] === r && x[1] === c);
const isSunk = (s, shooter, ship) => ship.cells.every(([r, c]) => fired(s, shooter, r, c));
const sunkShips = (s, shooter) => s.fleets[1 - shooter].filter((sh) => isSunk(s, shooter, sh));

function isValidMove(s, i, m) {
  return s.turn === i && Number.isInteger(m?.row) && Number.isInteger(m?.col) && m.row >= 0 && m.row < N && m.col >= 0 && m.col < N
    && !fired(s, i, m.row, m.col) && checkResult(s).status === 'ongoing';
}
function applyMove(s, i, m) {
  if (!isValidMove(s, i, m)) return s;
  const shots = s.shots.map((x) => x.slice()); shots[i].push([m.row, m.col]);
  const next = { ...s, shots, turn: 1 - i };
  const hit = !!s.boards[1 - i][m.row][m.col];
  const ship = hit ? s.fleets[1 - i].find((sh) => sh.cells.some(([r, c]) => r === m.row && c === m.col)) : null;
  next.lastShot = { by: i, row: m.row, col: m.col, hit, sunk: ship && isSunk(next, i, ship) ? ship.name : null };
  return next;
}
function checkResult(s) {
  for (let i = 0; i < 2; i++) if (s.fleets[1 - i].every((sh) => isSunk(s, i, sh))) return { status: 'win', winnerIndex: i };
  return { status: 'ongoing' };
}
function publicState(s, i) {
  const opp = 1 - i, hidden = grid();
  s.shots[i].forEach(([r, c]) => { hidden[r][c] = s.boards[opp][r][c]; });          // reveal only cells you have fired at
  const boards = [null, null]; boards[i] = s.boards[i]; boards[opp] = hidden;
  return { boards, shots: s.shots, turn: s.turn, lastShot: s.lastShot,
    sunkEnemy: sunkShips(s, i).map((sh) => ({ name: sh.name, cells: sh.cells })),            // ships you have sunk (revealed)
    sunkOwn: sunkShips(s, opp).map((sh) => sh.name), remaining: FLEET.length - sunkShips(s, i).length, fleetSize: FLEET.length };
}
// Hunt/target bot. Uses only what a player could know: its own shots, which of them hit, and which ships are sunk.
function botMove(s, i) {
  const opp = 1 - i, tried = (r, c) => fired(s, i, r, c);
  const sunkCells = new Set(); sunkShips(s, i).forEach((sh) => sh.cells.forEach(([r, c]) => sunkCells.add(r * N + c)));
  const liveHits = s.shots[i].filter(([r, c]) => s.boards[opp][r][c] && !sunkCells.has(r * N + c));
  const valid = (r, c) => r >= 0 && r < N && c >= 0 && c < N && !tried(r, c);
  const targets = [];
  for (const [r, c] of liveHits) {
    const line = liveHits.filter(([a, b]) => (a === r && Math.abs(b - c) === 1) || (b === c && Math.abs(a - r) === 1));
    const dirs = line.length ? line.map(([a, b]) => [a - r, b - c]) : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dr, dc] of dirs) { let rr = r + dr, cc = c + dc; while (rr >= 0 && rr < N && cc >= 0 && cc < N && s.boards[opp][rr][cc] && tried(rr, cc)) { rr += dr; cc += dc; } if (valid(rr, cc)) targets.push({ row: rr, col: cc }); }
  }
  if (targets.length) return targets[Math.floor(Math.random() * targets.length)];
  const all = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (valid(r, c)) all.push({ row: r, col: c });
  if (!all.length) return null;
  const parity = all.filter((m) => (m.row + m.col) % 2 === 0);                              // no ship is shorter than 2
  const pool = parity.length ? parity : all;
  return pool[Math.floor(Math.random() * pool.length)];
}
module.exports = { createInitialState, isValidMove, applyMove, checkResult, publicState, botMove, FLEET, placeFleet };
