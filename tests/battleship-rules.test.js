const test = require('node:test');
const assert = require('node:assert/strict');
const b = require('../games/battleship');
const { botMoveLevel, LEVELS } = require('../games/botlevels');

test('fleet placement: 5 ships, 17 cells, in bounds, no overlap, different every time', () => {
  const seen = new Set();
  for (let g = 0; g < 200; g++) {
    const ships = b.placeFleet(); const cells = ships.flatMap((s) => s.cells);
    assert.equal(ships.length, 5); assert.equal(cells.length, 17);
    assert.equal(new Set(cells.map(([r, c]) => r * 10 + c)).size, 17);
    assert.ok(cells.every(([r, c]) => r >= 0 && r < 10 && c >= 0 && c < 10));
    ships.forEach((s) => { const rows = new Set(s.cells.map((x) => x[0])), cols = new Set(s.cells.map((x) => x[1])); assert.ok(rows.size === 1 || cols.size === 1); });
    seen.add(JSON.stringify(ships));
  }
  assert.ok(seen.size > 150);
});
test('turns, repeats and bounds are enforced', () => {
  const s = b.createInitialState();
  assert.equal(b.isValidMove(s, 1, { row: 0, col: 0 }), false);
  assert.equal(b.isValidMove(s, 0, { row: 10, col: 0 }), false);
  assert.equal(b.isValidMove(s, 0, { row: 0.5, col: 0 }), false);
  const n = b.applyMove(s, 0, { row: 0, col: 0 });
  assert.equal(n.turn, 1);
  const t = b.applyMove(n, 1, { row: 3, col: 3 });
  assert.equal(b.isValidMove(t, 0, { row: 0, col: 0 }), false);       // cannot fire twice at the same cell
  assert.equal(b.applyMove(s, 0, { row: -1, col: 0 }), s);
});
test('hit, miss and sunk feedback; win only when the whole fleet is sunk', () => {
  const s = b.createInitialState();
  const target = s.fleets[1].find((x) => x.name === 'Destroyer');
  let st = s;
  const [a, c] = target.cells;
  st = b.applyMove(st, 0, { row: a[0], col: a[1] }); assert.equal(st.lastShot.hit, true); assert.equal(st.lastShot.sunk, null);
  st = b.applyMove(st, 1, b.botMove(st, 1));
  st = b.applyMove(st, 0, { row: c[0], col: c[1] }); assert.equal(st.lastShot.sunk, 'Destroyer');
  assert.equal(b.checkResult(st).status, 'ongoing');
  assert.equal(b.publicState(st, 0).sunkEnemy.length, 1);
  // sink the rest
  for (const ship of s.fleets[1]) for (const [r, cc] of ship.cells) {
    if (st.shots[0].some((x) => x[0] === r && x[1] === cc)) continue;
    if (st.turn === 1) st = b.applyMove(st, 1, b.botMove(st, 1));
    if (b.checkResult(st).status !== 'ongoing') break;
    st = b.applyMove(st, 0, { row: r, col: cc });
  }
  assert.deepEqual(b.checkResult(st), { status: 'win', winnerIndex: 0 });
  assert.equal(b.isValidMove(st, 1, { row: 9, col: 9 }), false);
});
test('public state never leaks unshot enemy ships', () => {
  const s = b.createInitialState();
  const pub = b.publicState(s, 0);
  assert.equal(pub.boards[1].flat().some(Boolean), false);
  assert.equal(pub.boards[0].flat().filter(Boolean).length, 17);      // you see your own fleet
  assert.equal(pub.fleets, undefined);
  const ship = s.fleets[1][0], [r, c] = ship.cells[0];
  const after = b.publicState(b.applyMove(s, 0, { row: r, col: c }), 0);
  assert.equal(after.boards[1][r][c], true); assert.equal(after.boards[1].flat().filter(Boolean).length, 1);
});
test('bot never repeats a shot, plays valid moves at every level and clears a board in under 100 shots', () => {
  for (const lvl of LEVELS) { const s = b.createInitialState(); assert.equal(b.isValidMove(s, 0, botMoveLevel('battleship', b, s, 0, lvl)), true); }
  let total = 0;
  for (let g = 0; g < 60; g++) {
    let s = b.createInitialState(), shots = 0;
    while (b.checkResult(s).status === 'ongoing') {
      const m = b.botMove(s, s.turn); assert.ok(m); assert.equal(b.isValidMove(s, s.turn, m), true);
      s = b.applyMove(s, s.turn, m); if (s.lastShot.by === 0) shots++;
    }
    assert.ok(shots <= 100); total += shots;
  }
  assert.ok(total / 60 < 75, 'hunt/target bot should beat blind scanning, avg ' + total / 60);
});
