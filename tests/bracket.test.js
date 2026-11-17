const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../utils/bracket');

test('8 players: 3 rounds, 4 ready matches, no byes', () => {
  const br = B.buildBracket(['1','2','3','4','5','6','7','8']);
  assert.equal(br.rounds.length, 3);
  assert.equal(B.readyMatches(br).length, 4);
  assert.deepEqual(br.rounds[0].map(m => [m.a, m.b]), [['1','8'],['4','5'],['2','7'],['3','6']]); // top seeds meet late
});
test('5 players: 3 byes advance automatically', () => {
  const br = B.buildBracket(['1','2','3','4','5']);
  assert.equal(br.size, 8);
  const ready = B.readyMatches(br).map(r => [r.match.a, r.match.b].sort().join('v')).sort();
  assert.deepEqual(ready, ['2v3', '4v5']);                  // seed 1 has a bye; 2 and 3 meet in round 2 straight away
  assert.equal(br.rounds[1][0].a, '1');
});
test('winner advances and champion is found; setWinner is idempotent', () => {
  const br = B.buildBracket(['a','b','c','d']);
  const [m0, m1] = B.readyMatches(br);
  assert.equal(B.setWinner(br, m0.round, m0.slot, m0.match.a), true);
  assert.equal(B.setWinner(br, m0.round, m0.slot, m0.match.a), false);
  B.setWinner(br, m1.round, m1.slot, m1.match.b);
  const fin = B.readyMatches(br);
  assert.equal(fin.length, 1); assert.equal(fin[0].round, 1);
  B.setWinner(br, 1, 0, fin[0].match.a);
  assert.equal(B.champion(br), fin[0].match.a);
  assert.equal(B.runnerUp(br), fin[0].match.b);
});
test('a player not in the match cannot be reported as winner', () => {
  const br = B.buildBracket(['a','b','c','d']);
  const [m] = B.readyMatches(br);
  assert.throws(() => B.setWinner(br, m.round, m.slot, 'zzz'));
});
test('2 players is a single final', () => {
  const br = B.buildBracket(['x','y']);
  assert.equal(br.rounds.length, 1);
  assert.equal(B.roundName(br, 0), 'Final');
});
test('full 16-player run always produces one champion', () => {
  const ids = Array.from({ length: 16 }, (_, i) => 'p' + i);
  const br = B.buildBracket(ids);
  let guard = 0;
  while (!B.champion(br) && guard++ < 100) for (const r of B.readyMatches(br)) B.setWinner(br, r.round, r.slot, r.match.a);
  assert.ok(B.champion(br));
});
