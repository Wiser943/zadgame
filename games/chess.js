// Standard two-player chess engine. Board indexes are rank * 8 + file,
// with rank 0 = White's back rank and uppercase pieces = White.
const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
const PROMOTIONS = ['q', 'r', 'b', 'n'];
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const inside = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
const colorOf = (p) => p && (p === p.toUpperCase() ? 0 : 1);
const enemy = (p, c) => p && colorOf(p) !== c;
const own = (p, c) => p && colorOf(p) === c;
const pieceAt = (state, r, f) => inside(r, f) ? state.board[r * 8 + f] : null;

function createInitialState() {
  const board = Array(64).fill(null);
  for (let f = 0; f < 8; f++) {
    board[f] = BACK[f].toUpperCase();
    board[8 + f] = 'P';
    board[48 + f] = 'p';
    board[56 + f] = BACK[f];
  }
  return { board, turn: 0, castling: 'KQkq', enPassant: null, halfmove: 0, fullmove: 1, lastMove: null };
}
function kingSquare(board, c) { return board.findIndex((p) => p === (c === 0 ? 'K' : 'k')); }
function isSquareAttacked(state, sq, by) {
  const r = Math.floor(sq / 8), f = sq % 8, b = state.board;
  const pawn = by === 0 ? 'P' : 'p', pawnR = r + (by === 0 ? -1 : 1);
  for (const df of [-1, 1]) if (inside(pawnR, f + df) && b[pawnR * 8 + f + df] === pawn) return true;
  const knight = by === 0 ? 'N' : 'n';
  for (const [dr, df] of KNIGHT) if (pieceAt(state, r + dr, f + df) === knight) return true;
  const bishop = by === 0 ? 'B' : 'b', rook = by === 0 ? 'R' : 'r', queen = by === 0 ? 'Q' : 'q';
  for (const [dr, df] of DIAGONAL) {
    for (let n = 1; n < 8; n++) { const p = pieceAt(state, r + dr * n, f + df * n); if (!p) continue; if (p === bishop || p === queen) return true; break; }
  }
  for (const [dr, df] of ORTHOGONAL) {
    for (let n = 1; n < 8; n++) { const p = pieceAt(state, r + dr * n, f + df * n); if (!p) continue; if (p === rook || p === queen) return true; break; }
  }
  const king = by === 0 ? 'K' : 'k';
  return KING.some(([dr, df]) => pieceAt(state, r + dr, f + df) === king);
}
function inCheck(state, c) { const k = kingSquare(state.board, c); return k < 0 || isSquareAttacked(state, k, 1 - c); }
function pushMove(out, state, from, to, extra = {}) {
  const p = state.board[from], r = Math.floor(to / 8);
  if (!p || own(state.board[to], colorOf(p)) || state.board[to]?.toLowerCase() === 'k') return;
  if (p.toLowerCase() === 'p' && (r === 0 || r === 7)) {
    for (const promotion of PROMOTIONS) out.push({ from, to, promotion });
  } else out.push({ from, to, ...extra });
}
function pseudoMoves(state, c) {
  const out = [], b = state.board;
  for (let from = 0; from < 64; from++) {
    const p = b[from]; if (!own(p, c)) continue;
    const r = Math.floor(from / 8), f = from % 8, type = p.toLowerCase();
    if (type === 'p') {
      const dir = c === 0 ? 1 : -1, start = c === 0 ? 1 : 6;
      const one = (r + dir) * 8 + f;
      if (inside(r + dir, f) && !b[one]) {
        pushMove(out, state, from, one);
        const two = (r + dir * 2) * 8 + f;
        if (r === start && !b[two]) out.push({ from, to: two });
      }
      for (const df of [-1, 1]) {
        const nr = r + dir, nf = f + df; if (!inside(nr, nf)) continue;
        const to = nr * 8 + nf;
        if (enemy(b[to], c)) pushMove(out, state, from, to);
        if (state.enPassant === to && !b[to]) out.push({ from, to, enPassant: true });
      }
    } else if (type === 'n' || type === 'k') {
      const offsets = type === 'n' ? KNIGHT : KING;
      for (const [dr, df] of offsets) { const nr = r + dr, nf = f + df; if (inside(nr, nf)) pushMove(out, state, from, nr * 8 + nf); }
      if (type === 'k' && !inCheck(state, c)) {
        const rights = c === 0 ? [['K', 6, 5], ['Q', 2, 3]] : [['k', 62, 61], ['q', 58, 59]];
        for (const [right, to, through] of rights) {
          const path = right.toLowerCase() === 'k' ? (c === 0 ? [5, 6] : [61, 62]) : (c === 0 ? [1, 2, 3] : [57, 58, 59]);
          if (state.castling.includes(right) && path.every((x) => !b[x]) && !isSquareAttacked(state, through, 1 - c) && !isSquareAttacked(state, to, 1 - c)) out.push({ from, to, castle: right });
        }
      }
    } else {
      const dirs = type === 'b' ? DIAGONAL : type === 'r' ? ORTHOGONAL : DIAGONAL.concat(ORTHOGONAL);
      for (const [dr, df] of dirs) for (let n = 1; n < 8; n++) { const nr = r + dr * n, nf = f + df * n; if (!inside(nr, nf)) break; const to = nr * 8 + nf; if (!b[to]) out.push({ from, to }); else { if (enemy(b[to], c)) pushMove(out, state, from, to); break; } }
    }
  }
  return out;
}
function makeMove(state, move) {
  const b = state.board.slice(), p = b[move.from], c = colorOf(p), captured = b[move.to];
  b[move.from] = null; b[move.to] = move.promotion ? (c === 0 ? move.promotion.toUpperCase() : move.promotion) : p;
  if (move.enPassant) b[move.to + (c === 0 ? -8 : 8)] = null;
  if (move.castle) {
    const rookFrom = move.to > move.from ? move.to + 1 : move.to - 2, rookTo = move.to > move.from ? move.to - 1 : move.to + 1;
    b[rookTo] = b[rookFrom]; b[rookFrom] = null;
  }
  let rights = state.castling;
  const remove = (x) => { rights = rights.replace(x, ''); };
  if (p.toLowerCase() === 'k') (c === 0 ? ['K', 'Q'] : ['k', 'q']).forEach(remove);
  if (p.toLowerCase() === 'r' || captured?.toLowerCase() === 'r') {
    [[0, 'Q'], [7, 'K'], [56, 'q'], [63, 'k']].forEach(([sq, x]) => { if (move.from === sq || move.to === sq) remove(x); });
  }
  return { ...state, board: b, turn: 1 - c, castling: rights, enPassant: p.toLowerCase() === 'p' && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : null, halfmove: p.toLowerCase() === 'p' || captured || move.enPassant ? 0 : state.halfmove + 1, fullmove: c === 1 ? state.fullmove + 1 : state.fullmove, lastMove: move };
}
function legalMoves(state, c = state.turn) { return pseudoMoves(state, c).filter((m) => !inCheck(makeMove(state, m), c)); }
function isValidMove(state, playerIndex, move) {
  if (playerIndex !== state.turn || !move || !Number.isInteger(move.from) || !Number.isInteger(move.to)) return false;
  return legalMoves(state, playerIndex).some((m) => m.from === move.from && m.to === move.to && (m.promotion || 'q') === (move.promotion || 'q'));
}
function applyMove(state, playerIndex, move) {
  const exact = legalMoves(state, playerIndex).find((m) => m.from === move.from && m.to === move.to && (m.promotion || 'q') === (move.promotion || 'q'));
  return makeMove(state, exact || move);
}
function insufficientMaterial(board) {
  const pieces = board.filter(Boolean).map((p) => p.toLowerCase());
  if (pieces.some((p) => ['p', 'q', 'r'].includes(p))) return false;
  return pieces.filter((p) => p === 'b' || p === 'n').length <= 2;
}
function checkResult(state) {
  const moves = legalMoves(state, state.turn);
  if (!moves.length) return inCheck(state, state.turn) ? { status: 'win', winnerIndex: 1 - state.turn, reason: 'checkmate' } : { status: 'draw', reason: 'stalemate' };
  if (state.halfmove >= 100 || insufficientMaterial(state.board)) return { status: 'draw', reason: 'draw' };
  return { status: 'ongoing' };
}
function publicState(state, playerIndex) { return { ...state, legal: legalMoves(state, playerIndex) }; }
function botMove(state, playerIndex) {
  const moves = legalMoves(state, playerIndex);
  if (!moves.length) return null;
  const scored = moves.map((m) => { const captured = state.board[m.to]; const next = makeMove(state, m); const result = checkResult(next); return { m, score: (result.status === 'win' ? 10000 : 0) + (captured ? 10 : 0) + (m.promotion ? 8 : 0) + Math.random() * 2 }; });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].m;
}
module.exports = { createInitialState, isValidMove, applyMove, checkResult, publicState, botMove, markOut: (state, i) => ({ ...state, turn: state.turn === i ? 1 - i : state.turn }) };