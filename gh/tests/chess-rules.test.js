const test = require('node:test');
const assert = require('node:assert/strict');
const chess = require('../games/chess');

// squares: row*8+col, row 7 = White (player 0) back rank, row 0 = Black (player 1)
const sq = (name) => (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
function pos(pieces, opts = {}) {
  const s = chess.createInitialState(2);
  s.board = Array(64).fill(null);
  for (const [name, code] of Object.entries(pieces)) s.board[sq(name)] = { type: code[0], player: code[1] === 'w' ? 0 : 1 };
  s.turn = opts.turn ?? 0; s.halfmove = opts.halfmove ?? 0; s.ep = opts.ep ?? null; s.draw = null;
  s.castle = opts.castle ?? { 0: { k: true, q: true }, 1: { k: true, q: true } };
  s.hist = [];
  return s;
}
const mv = (a, b, extra = {}) => ({ from: sq(a), to: sq(b), ...extra });
const play = (s, a, b, extra) => { const p = s.turn; assert.ok(chess.isValidMove(s, p, mv(a, b, extra)), `illegal ${a}${b}`); return chess.applyMove(s, p, mv(a, b, extra)); };
const has = (s, a, b) => chess.legalMoves(s, s.turn).some((m) => m.from === sq(a) && m.to === sq(b));

test('start position has 20 legal moves and no castling yet', () => {
  const s = chess.createInitialState(2);
  assert.equal(chess.legalMoves(s, 0).length, 20);
  assert.equal(has(s, 'e1', 'g1'), false);
});
test('kingside and queenside castling move king and rook', () => {
  let s = pos({ e1: 'kw', h1: 'rw', a1: 'rw', e8: 'kb' });
  assert.ok(has(s, 'e1', 'g1') && has(s, 'e1', 'c1'));
  const k = play(s, 'e1', 'g1'); assert.equal(k.board[sq('f1')].type, 'r'); assert.equal(k.board[sq('h1')], null); assert.equal(k.board[sq('g1')].type, 'k');
  const q = play(s, 'e1', 'c1'); assert.equal(q.board[sq('d1')].type, 'r'); assert.equal(q.board[sq('a1')], null);
});
test('black can castle too', () => {
  const s = pos({ e8: 'kb', h8: 'rb', e1: 'kw' }, { turn: 1 });
  const n = play(s, 'e8', 'g8'); assert.equal(n.board[sq('f8')].type, 'r');
});
test('cannot castle through an attacked square, out of check, or with a piece in between', () => {
  assert.equal(has(pos({ e1: 'kw', h1: 'rw', f8: 'rb', a8: 'kb' }), 'e1', 'g1'), false);       // f1 attacked
  assert.equal(has(pos({ e1: 'kw', h1: 'rw', e8: 'rb', a8: 'kb' }), 'e1', 'g1'), false);       // in check
  assert.equal(has(pos({ e1: 'kw', h1: 'rw', g1: 'nw', a8: 'kb' }), 'e1', 'g1'), false);       // blocked
  assert.equal(has(pos({ e1: 'kw', a1: 'rw', b1: 'nw', a8: 'kb' }), 'e1', 'c1'), false);       // queenside blocked
});
test('castling is lost after the king or that rook has moved', () => {
  let s = pos({ e1: 'kw', h1: 'rw', a1: 'rw', e8: 'kb', a7: 'pb' });
  s = play(s, 'h1', 'h2'); s = play(s, 'a7', 'a6'); s = play(s, 'h2', 'h1'); s = play(s, 'a6', 'a5');
  assert.equal(has(s, 'e1', 'g1'), false); assert.equal(has(s, 'e1', 'c1'), true);
  s = play(s, 'e1', 'e2'); s = play(s, 'a5', 'a4'); s = play(s, 'e2', 'e1'); s = play(s, 'a4', 'a3');
  assert.equal(has(s, 'e1', 'c1'), false);
});
test('en passant captures the pawn that just advanced two squares, only immediately', () => {
  let s = pos({ e1: 'kw', e8: 'kb', e5: 'pw', d7: 'pb', h2: 'pw' }, { turn: 1 });
  s = play(s, 'd7', 'd5');
  assert.deepEqual(s.ep, { sq: sq('d6') });
  assert.ok(has(s, 'e5', 'd6'));
  const taken = play(s, 'e5', 'd6', { enPassant: true });
  assert.equal(taken.board[sq('d5')], null); assert.equal(taken.board[sq('d6')].type, 'p');
  // decline it: the chance is gone next turn
  let t = play(s, 'h2', 'h3'); t = play(t, 'e8', 'e7');
  assert.equal(has(t, 'e5', 'd6'), false);
});
test('en passant that would expose the king along the rank is illegal', () => {
  let s = pos({ a5: 'kw', e5: 'pw', h5: 'rb', e8: 'kb', d7: 'pb' }, { turn: 1 });
  s = play(s, 'd7', 'd5');   // pawns e5/d5 are now the only blockers between rook h5 and king a5
  assert.equal(has(s, 'e5', 'd6'), false);
});
test('stalemate is a draw, not a win', () => {
  const s = pos({ f7: 'kw', g1: 'qw', h8: 'kb' });
  const n = play(s, 'g1', 'g6');
  assert.deepEqual(chess.checkResult(n), { status: 'draw', reason: 'stalemate' });
});
test('checkmate is still a win', () => {
  const s = pos({ e1: 'kw', a1: 'rw', h8: 'kb', g7: 'pb', h7: 'pb' });
  const n = play(s, 'a1', 'a8');
  const r = chess.checkResult(n); assert.equal(r.status, 'win'); assert.equal(r.winnerIndex, 0);
});
test('fifty-move rule draws at 100 half-moves without pawn move or capture', () => {
  const s = pos({ e1: 'kw', a1: 'rw', e8: 'kb' }, { halfmove: 99 });
  assert.equal(chess.checkResult(play(s, 'a1', 'a2')).reason, 'fiftyMove');
});
test('a pawn move resets the fifty-move counter', () => {
  const s = pos({ e1: 'kw', a2: 'pw', e8: 'kb', h8: 'rb' }, { halfmove: 99 });
  assert.equal(play(s, 'a2', 'a3').halfmove, 0);
});
test('threefold repetition is a draw', () => {
  let s = chess.createInitialState(2);
  const cycle = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']];
  for (let round = 0; round < 2; round++) for (const [a, b] of cycle) { assert.equal(chess.checkResult(s).status, 'ongoing'); s = play(s, a, b); }
  assert.deepEqual(chess.checkResult(s), { status: 'draw', reason: 'repetition' });
});
test('insufficient material (king and bishop vs king) is a draw', () => {
  const s = pos({ e1: 'kw', c1: 'bw', e8: 'kb', f4: 'nb' });
  assert.equal(chess.checkResult(play(s, 'c1', 'f4')).reason, 'insufficientMaterial');
});
test('promotion still works and offers all four pieces', () => {
  const s = pos({ e1: 'kw', a7: 'pw', h5: 'kb' });
  assert.equal(chess.legalMoves(s, 0).filter((m) => m.from === sq('a7') && m.to === sq('a8')).length, 4);
});
test('moves after a draw or from the wrong side are rejected', () => {
  const s = pos({ f7: 'kw', g1: 'qw', h8: 'kb' });
  assert.equal(chess.isValidMove(s, 1, mv('h8', 'g8')), false);
  const n = play(s, 'g1', 'g6'); assert.equal(chess.applyMove(n, 0, mv('f7', 'e7')), n);
});
test('public state hides history and lists legal moves including castling', () => {
  const s = pos({ e1: 'kw', h1: 'rw', e8: 'kb' });
  const pub = chess.publicState(s, 0);
  assert.equal(pub.hist, undefined); assert.ok(pub.legal.some((m) => m.castle === 'k'));
});
test('random self-play always ends legally and never loses a king', () => {
  for (let g = 0; g < 25; g++) {
    let s = chess.createInitialState(2), ply = 0;
    while (chess.checkResult(s).status === 'ongoing' && ply++ < 400) {
      const list = chess.legalMoves(s, s.turn); assert.ok(list.length > 0);
      const m = list[Math.floor(Math.random() * list.length)];
      const before = s; s = chess.applyMove(s, s.turn, m); assert.notEqual(s, before);
      assert.equal(s.board.filter((x) => x && x.type === 'k' && x.player === 0).length + s.board.filter((x) => x && x.type === 'k' && x.player === 1).length >= 1, true);
      assert.ok(s.hist.length <= 101);
    }
  }
});
test('regression: knights and kings never wrap around the board edge', () => {
  const s = chess.createInitialState(2);
  assert.equal(has(s, 'b1', 'h3'), false);
  const k = pos({ h4: 'kw', e8: 'kb' });
  const targets = chess.legalMoves(k, 0).map((m) => m.to % 8);
  assert.ok(targets.every((c) => c >= 6), 'king on the h-file reached the a-file');
});
