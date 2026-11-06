const test = require('node:test');
const assert = require('node:assert/strict');
const games = require('../games');
for (const [name, engine] of Object.entries(games)) {
  test(`${name} exposes a safe authoritative engine`, () => {
    const state = engine.createInitialState(2);
    assert.ok(state);
    assert.equal(typeof engine.isValidMove, 'function');
    assert.equal(typeof engine.applyMove, 'function');
    assert.equal(typeof engine.checkResult, 'function');
    assert.ok(['ongoing','win','draw'].includes(engine.checkResult(state).status));
  });
}
test('checkers accepts a legal opening move', () => {
  const e=games.checkers, s=e.createInitialState(2);
  assert.equal(e.isValidMove(s,0,{from:40,to:33}),true);
});
test('mancala accepts a seeded pit', () => {
  const e=games.mancala, s=e.createInitialState(2);
  assert.equal(e.isValidMove(s,0,{pit:0}),true);
  assert.equal(e.applyMove(s,0,{pit:0}).pits[0][0],0);
});
test('winner highlights prefer higher-value moves', () => {
  const {selectHighlights}=require('../utils/highlights');
  const out=selectHighlights('words',[{player:0,move:{word:'GO'},at:1},{player:0,move:{word:'BOARD'},at:2},{player:1,move:{word:'GAME'},at:3}],0);
  assert.ok(out.some(x=>x.move.word==='BOARD'));
  assert.ok(out.find(x=>x.move.word==='BOARD').score > out.find(x=>x.move.word==='GO').score);
});
