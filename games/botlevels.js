// Bot difficulty (easy | normal | hard | expert). Built only on each engine's public API, so every move it
// returns is still re-checked with isValidMove by the server before it is played.
const LEVELS = ['easy', 'normal', 'hard', 'expert'];
const normLevel = (l) => (LEVELS.includes(l) ? l : 'normal');
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Games where this module can enumerate candidate moves (difficulty has an effect there).
function candidates(game, eng, s, i) {
  if (game === 'tictactoe') return s.board.map((v, k) => (v === null ? { index: k } : null)).filter(Boolean);
  if (game === 'connectfour') return [0, 1, 2, 3, 4, 5, 6].filter((c) => s.board[0][c] === null).map((c) => ({ column: c }));
  if ((game === 'chess' || game === 'checkers' || game === 'dominoes') && eng.legalMoves) return eng.legalMoves(s, i);
  if (game === 'mancala') return (s.pits?.[i] || []).map((x, p) => (x ? { pit: p } : null)).filter(Boolean);
  if (game === 'battleship') { const out = []; for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (eng.isValidMove(s, i, { row: r, col: c })) out.push({ row: r, col: c }); return out; }
  return null;
}
const SUPPORTED = ['tictactoe', 'connectfour', 'chess', 'mancala', 'battleship', 'checkers', 'dominoes'];

// ---- generic negamax over engine API (2-player games) ----
function negamax(eng, s, me, toMove, depth, alpha, beta, evalFn, moves) {
  const res = eng.checkResult(s);
  if (res.status === 'win') return (res.winnerIndex === toMove ? 1 : -1) * (100000 + depth);
  if (res.status === 'draw') return 0;
  if (depth === 0) return evalFn(s, toMove);
  const list = moves(s, toMove);
  if (!list.length) return 0;
  let best = -Infinity;
  for (const m of list) {
    const ns = eng.applyMove(s, toMove, m);
    const v = -negamax(eng, ns, me, 1 - toMove, depth - 1, -beta, -alpha, evalFn, moves);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
function searchBest(eng, s, i, depth, evalFn, moves) {
  let best = [], bv = -Infinity;
  for (const m of moves(s, i)) {
    const v = -negamax(eng, eng.applyMove(s, i, m), i, 1 - i, depth - 1, -Infinity, Infinity, evalFn, moves);
    if (v > bv + 1e-9) { bv = v; best = [m]; } else if (Math.abs(v - bv) < 1e-9) best.push(m);
  }
  return best.length ? pick(best) : null;
}

// Connect Four evaluation: centre control + open windows of 2/3.
function c4Eval(s, p) {
  const b = s.board, R = 6, C = 7; let score = 0;
  for (let r = 0; r < R; r++) if (b[r][3] === p) score += 3; else if (b[r][3] === 1 - p) score -= 3;
  const win = (cells) => { const mine = cells.filter((v) => v === p).length, theirs = cells.filter((v) => v === 1 - p).length;
    if (mine && theirs) return 0; if (mine === 3) return 5; if (mine === 2) return 2; if (theirs === 3) return -5; if (theirs === 2) return -2; return 0; };
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = []; for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= R || cc < 0 || cc >= C) { cells.length = 0; break; } cells.push(b[rr][cc]); }
    if (cells.length === 4) score += win(cells);
  }
  return score;
}
// Turn-aware negamax for games where one player can move several times in a row (checkers multi-jumps).
function negamaxT(eng, s, toMove, depth, alpha, beta, evalFn) {
  const res = eng.checkResult(s);
  if (res.status === 'win') return (res.winnerIndex === toMove ? 1 : -1) * (100000 + depth);
  if (res.status === 'draw') return 0;
  if (depth === 0) return evalFn(s, toMove);
  const list = eng.legalMoves(s, toMove);
  let best = -Infinity;
  for (const m of list) {
    const ns = eng.applyMove(s, toMove, m);
    const v = ns.turn === toMove ? negamaxT(eng, ns, toMove, depth - 1, alpha, beta, evalFn) : -negamaxT(eng, ns, ns.turn, depth - 1, -beta, -alpha, evalFn);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
function searchBestT(eng, s, i, depth, evalFn) {
  let best = [], bv = -Infinity;
  for (const m of eng.legalMoves(s, i)) {
    const ns = eng.applyMove(s, i, m);
    const v = ns.turn === i ? negamaxT(eng, ns, i, depth - 1, -Infinity, Infinity, evalFn) : -negamaxT(eng, ns, ns.turn, depth - 1, -Infinity, Infinity, evalFn);
    if (v > bv + 1e-9) { bv = v; best = [m]; } else if (Math.abs(v - bv) < 1e-9) best.push(m);
  }
  return best.length ? pick(best) : null;
}
function checkersEval(s, p) {
  let v = 0;
  s.board.forEach((row, r) => row.forEach((x) => { if (!x) return; const adv = x.player === 0 ? 7 - r : r; v += (x.player === p ? 1 : -1) * (x.king ? 1.8 : 1 + adv * 0.04); }));
  return v + Math.random() * 0.01;
}
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function chessEval(s, p) { let v = 0; for (const x of s.board) if (x) v += (x.player === p ? 1 : -1) * (VAL[x.type] || 0); return v + Math.random() * 0.01; }

function botMoveLevel(game, eng, s, i, level) {
  level = normLevel(level);
  const normal = () => eng.botMove(s, i);
  if (level === 'normal' || !SUPPORTED.includes(game)) return normal();
  const cand = candidates(game, eng, s, i);
  if (!cand || !cand.length) return normal();
  if (level === 'easy') return Math.random() < 0.6 ? pick(cand) : normal();
  const twoPlayer = (s.playerCount || 2) === 2 && (game !== 'chess' || s.size === 8);
  const expert = level === 'expert';
  if (game === 'connectfour') return searchBest(eng, s, i, expert ? 6 : 3, c4Eval, (st) => candidates('connectfour', eng, st));
  if (game === 'tictactoe' && s.size === 3 && twoPlayer && expert) return searchBest(eng, s, i, 9, () => 0, (st) => candidates('tictactoe', eng, st));
  if (game === 'checkers') return searchBestT(eng, s, i, expert ? 6 : 3, checkersEval);
  if (game === 'chess' && twoPlayer) {
    if (level === 'hard' && Math.random() < 0.15) return normal();
    return searchBest(eng, s, i, 2, chessEval, (st, p) => eng.legalMoves(st, p));
  }
  return normal(); // hard/expert for the remaining games use the standard bot
}
module.exports = { LEVELS, normLevel, botMoveLevel, SUPPORTED };
