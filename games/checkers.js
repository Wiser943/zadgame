// Checkers (American/English draughts), 2 players, 8x8. Player 0 starts at the bottom and moves up.
// Rules: men move/capture forward only, kings move/capture one step diagonally either way, captures are
// mandatory, multi-jumps continue with the same piece, a man that crowns ends its turn, a player with no
// legal move loses, and the game is drawn by repetition (3x) or 40 moves each without a capture or man move.
const SIZE = 8, QUIET_LIMIT = 80;
const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const cloneBoard = (b) => b.map((row) => row.map((x) => x && { ...x }));
function key(st) { let h = 2166136261; const str = st.board.flat().map((x) => (x ? (x.king ? 'K' : 'm') + x.player : '-')).join('') + st.turn + (st.mustContinue ?? ''); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }

function createInitialState() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (let r = 0; r < 3; r++) for (let c = 0; c < SIZE; c++) if ((r + c) % 2) board[r][c] = { player: 1, king: false };
  for (let r = 5; r < 8; r++) for (let c = 0; c < SIZE; c++) if ((r + c) % 2) board[r][c] = { player: 0, king: false };
  const st = { board, turn: 0, mustContinue: null, quiet: 0, draw: null, hist: [] };
  st.hist = [key(st)];
  return st;
}
const dirsFor = (p) => (p.king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : p.player === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
function jumpsFrom(b, r, c) {
  const p = b[r][c], out = [];
  for (const [dr, dc] of dirsFor(p)) {
    const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
    if (inside(lr, lc) && b[mr][mc] && b[mr][mc].player !== p.player && !b[lr][lc]) out.push({ from: r * 8 + c, to: lr * 8 + lc, capture: mr * 8 + mc });
  }
  return out;
}
function stepsFrom(b, r, c) {
  const p = b[r][c], out = [];
  for (const [dr, dc] of dirsFor(p)) { const nr = r + dr, nc = c + dc; if (inside(nr, nc) && !b[nr][nc]) out.push({ from: r * 8 + c, to: nr * 8 + nc }); }
  return out;
}
function legalMoves(st, i = st.turn) {
  if (st.draw || st.turn !== i) return [];
  const b = st.board, jumps = [], steps = [];
  const squares = st.mustContinue != null ? [st.mustContinue] : [...Array(64).keys()];
  for (const sq of squares) {
    const r = Math.floor(sq / 8), c = sq % 8, p = b[r][c];
    if (!p || p.player !== i) continue;
    jumps.push(...jumpsFrom(b, r, c));
    if (st.mustContinue == null) steps.push(...stepsFrom(b, r, c));
  }
  return jumps.length ? jumps : steps;               // a capture, if there is one, is compulsory
}
function isValidMove(st, i, m) {
  if (!m || !Number.isInteger(m.from) || !Number.isInteger(m.to) || m.from < 0 || m.from > 63 || m.to < 0 || m.to > 63) return false;
  return legalMoves(st, i).some((x) => x.from === m.from && x.to === m.to);
}
function applyMove(st, i, m) {
  const exact = isValidMove(st, i, m) && legalMoves(st, i).find((x) => x.from === m.from && x.to === m.to);
  if (!exact) return st;
  const b = cloneBoard(st.board), fr = Math.floor(exact.from / 8), fc = exact.from % 8, tr = Math.floor(exact.to / 8), tc = exact.to % 8;
  const p = b[fr][fc]; b[fr][fc] = null; b[tr][tc] = p;
  const wasMan = !p.king;
  if (exact.capture != null) b[Math.floor(exact.capture / 8)][exact.capture % 8] = null;
  let crowned = false;
  if (!p.king && ((i === 0 && tr === 0) || (i === 1 && tr === 7))) { p.king = true; crowned = true; }
  const next = { board: b, turn: i, mustContinue: null, draw: null, quiet: 0, hist: [] };
  if (exact.capture != null && !crowned && jumpsFrom(b, tr, tc).length) next.mustContinue = exact.to;   // keep jumping
  else next.turn = 1 - i;
  const irreversible = exact.capture != null || wasMan;
  next.quiet = irreversible ? 0 : (st.quiet || 0) + 1;
  next.hist = irreversible ? [key(next)] : [...(st.hist || []), key(next)];
  if (next.mustContinue == null) {
    if (next.quiet >= QUIET_LIMIT) next.draw = 'noProgress';
    else if (next.hist.filter((h) => h === next.hist[next.hist.length - 1]).length >= 3) next.draw = 'repetition';
  }
  return next;
}
function checkResult(st) {
  const n = [0, 0]; st.board.flat().forEach((p) => { if (p) n[p.player]++; });
  if (!n[0] || !n[1]) return { status: 'win', winnerIndex: n[0] ? 0 : 1, reason: 'noPieces' };
  if (st.draw) return { status: 'draw', reason: st.draw };
  if (!legalMoves(st, st.turn).length) return { status: 'win', winnerIndex: 1 - st.turn, reason: 'noMoves' };
  return { status: 'ongoing' };
}
function publicState(st, i) { const legal = legalMoves(st, i); return { ...st, hist: undefined, legal, mustCapture: legal.some((m) => m.capture != null) }; }
function botMove(st, i) {
  const list = legalMoves(st, i); if (!list.length) return null;
  const score = (m) => {
    const tr = Math.floor(m.to / 8), p = st.board[Math.floor(m.from / 8)][m.from % 8];
    const crown = !p.king && ((i === 0 && tr === 0) || (i === 1 && tr === 7)) ? 3 : 0;
    const edge = m.to % 8 === 0 || m.to % 8 === 7 ? 0.5 : 0;           // edge squares are harder to capture
    return (m.capture != null ? 5 : 0) + crown + edge + Math.random();
  };
  return list.map((m) => ({ m, s: score(m) })).sort((a, b) => b.s - a.s)[0].m;
}
module.exports = { createInitialState, isValidMove, applyMove, checkResult, publicState, botMove, legalMoves };
