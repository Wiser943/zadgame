// 3–4 player cross-board chess. The board is a 14x14 cross: cells in the
// central 8 ranks or central 8 files are playable. Each player owns a side:
// 0 = bottom/white, 1 = left/red, 2 = top/black, 3 = right/blue.
const SIZE = 14;
const PLAYERS = 4;
const TYPES = ['q', 'r', 'b', 'n'];
const KNIGHT = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAGONAL = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ORTHOGONAL = [[-1,0],[1,0],[0,-1],[0,1]];
const inside = (r,c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const playable = (r,c) => inside(r,c) && ((r >= 3 && r <= 10) || (c >= 3 && c <= 10));
const at = (s,r,c) => playable(r,c) ? s.board[r * SIZE + c] : null;
const colorOf = (p) => p?.player;
const own = (p, player) => p && p.player === player;
const enemy = (p, player) => p && p.player !== player;
const dir = (player) => [[-1,0],[0,1],[1,0],[0,-1]][player];
const left = (player) => [[0,-1],[1,0],[0,1],[-1,0]][player];
const clonePiece = (p) => p ? { type: p.type, player: p.player } : null;
function initialPieces(player) {
  const back = ['r','n','b','q','k','b','n','r'];
  const out = [];
  for (let i = 0; i < 8; i++) {
    if (player === 0) { out.push([13 * SIZE + 3 + i, back[i]]); out.push([12 * SIZE + 3 + i, 'p']); }
    if (player === 1) { out.push([(3 + i) * SIZE, back[i]]); out.push([(3 + i) * SIZE + 1, 'p']); }
    if (player === 2) { out.push([3 + i, back[i]]); out.push([(1 * SIZE) + 3 + i, 'p']); }
    if (player === 3) { out.push([(3 + i) * SIZE + 13, back[i]]); out.push([(3 + i) * SIZE + 12, 'p']); }
  }
  return out;
}
function createInitialState(playerCount = 4) {
  const count = playerCount === 3 ? 3 : 4, board = Array(SIZE * SIZE).fill(null);
  for (let player = 0; player < count; player++) for (const [sq,type] of initialPieces(player)) board[sq] = { type, player };
  return { size: SIZE, playerCount: count, board, turn: 0, active: Array(count).fill(true), halfmove: 0, fullmove: 1, lastMove: null };
}
function nextActive(s, from) {
  for (let n = 1; n <= s.playerCount; n++) { const p = (from + n) % s.playerCount; if (s.active[p]) return p; }
  return from;
}
function kingSquare(s, player) { return s.board.findIndex((p) => p?.type === 'k' && p.player === player); }
function isAttackedBy(s, sq, attacker) {
  const r = Math.floor(sq / SIZE), c = sq % SIZE;
  for (let i = 0; i < s.board.length; i++) {
    const p = s.board[i]; if (!p || p.player !== attacker) continue;
    const pr = Math.floor(i / SIZE), pc = i % SIZE, dr = r - pr, dc = c - pc;
    if (p.type === 'p') { const [vr,vc] = dir(attacker), [lr,lc] = left(attacker); if ((dr === vr + lr && dc === vc + lc) || (dr === vr - lr && dc === vc - lc)) return true; }
    else if (p.type === 'n' && KNIGHT.some(([a,b]) => a === dr && b === dc)) return true;
    else if (p.type === 'k' && Math.max(Math.abs(dr),Math.abs(dc)) === 1) return true;
    else if ((p.type === 'b' || p.type === 'q') && Math.abs(dr) === Math.abs(dc) && dr) { const sr=Math.sign(dr), sc=Math.sign(dc); let clear=true; for(let n=1;n<Math.abs(dr);n++) if(at(s,pr+sr*n,pc+sc*n)) clear=false; if(clear) return true; }
    if ((p.type === 'r' || p.type === 'q') && ((dr === 0) !== (dc === 0))) { const sr=Math.sign(dr), sc=Math.sign(dc), n=Math.max(Math.abs(dr),Math.abs(dc)); let clear=true; for(let k=1;k<n;k++) if(at(s,pr+sr*k,pc+sc*k)) clear=false; if(clear) return true; }
  }
  return false;
}
function inCheck(s, player) { const k=kingSquare(s,player); return k >= 0 && s.active.some((on, p) => on && p !== player && isAttackedBy(s,k,p)); }
function add(out, s, from, to, extra={}) { if (!playable(Math.floor(to/SIZE),to%SIZE)) return; const p=s.board[from], target=s.board[to]; if (!p || own(target,p.player) || target?.type === 'k') return; out.push({from,to,...extra}); }
function pseudo(s, player) {
  const out=[];
  for (let from=0;from<s.board.length;from++) { const p=s.board[from]; if (!own(p,player)) continue; const r=Math.floor(from/SIZE), c=from%SIZE;
    if (p.type === 'p') { const [vr,vc]=dir(player), [lr,lc]=left(player), one=(r+vr)*SIZE+c+vc; if(playable(r+vr,c+vc)&&!s.board[one]) { if (r+vr===0||r+vr===13||c+vc===0||c+vc===13) TYPES.forEach(t=>add(out,s,from,one,{promotion:t})); else add(out,s,from,one); }
      for(const sign of [-1,1]) { const rr=r+vr+lr*sign, cc=c+vc+lc*sign, to=rr*SIZE+cc; if(playable(rr,cc)&&enemy(s.board[to],player)) { if(rr===0||rr===13||cc===0||cc===13) TYPES.forEach(t=>add(out,s,from,to,{promotion:t})); else add(out,s,from,to); } }
      const rr=r+vr*2,cc=c+vc*2,to=rr*SIZE+cc; if((r===12&&player===0)||(c===1&&player===1)||(r===1&&player===2)||(c===12&&player===3)) if(playable(rr,cc)&&!s.board[(r+vr)*SIZE+c+vc]&&!s.board[to]) add(out,s,from,to);
    } else if (p.type === 'n' || p.type === 'k') { const steps=p.type==='n'?KNIGHT:KING; steps.forEach(([dr,dc])=>add(out,s,from,(r+dr)*SIZE+c+dc)); }
    else { const dirs=p.type==='b'?DIAGONAL:p.type==='r'?ORTHOGONAL:DIAGONAL.concat(ORTHOGONAL); for(const [dr,dc] of dirs) for(let n=1;n<SIZE;n++){const rr=r+dr*n,cc=c+dc*n;if(!playable(rr,cc))break;const to=rr*SIZE+cc;if(!s.board[to]) out.push({from,to}); else {add(out,s,from,to);break;}} }
  }
  return out;
}
function makeMove(s,m) { const board=s.board.map(clonePiece), p=board[m.from], captured=board[m.to], player=p.player; board[m.from]=null; board[m.to]={type:m.promotion||p.type,player}; const next={...s,board,turn:nextActive(s,player),halfmove:p.type==='p'||captured?0:s.halfmove+1,fullmove:player===s.playerCount-1?s.fullmove+1:s.fullmove,lastMove:m}; return next; }
function legalMoves(s,player=s.turn) { return pseudo(s,player).filter(m=>!inCheck(makeMove(s,m),player)); }
function isValidMove(s,player,move) { if(!s.active[player]||s.turn!==player||!move||!Number.isInteger(move.from)||!Number.isInteger(move.to))return false; return legalMoves(s,player).some(m=>m.from===move.from&&m.to===move.to&&(m.promotion||'q')===(move.promotion||'q')); }
function applyMove(s,player,move) { const exact=legalMoves(s,player).find(m=>m.from===move.from&&m.to===move.to&&(m.promotion||'q')===(move.promotion||'q')); const next=makeMove(s,exact||move); const opponent=next.turn, moves=legalMoves(next,opponent); if(!moves.length) { const active=next.active.slice(); active[opponent]=false; next.active=active; next.board=next.board.map(p=>p&&p.player===opponent?null:p); next.turn=nextActive(next,opponent); next.lastMove={...next.lastMove, eliminated:opponent, checkmate:inCheck(next,opponent)}; } return next; }
function checkResult(s) { const alive=s.active.map((on,i)=>on?i:-1).filter(i=>i>=0); if(alive.length===1)return{status:'win',winnerIndex:alive[0],reason:'lastKingStanding'}; if(!alive.length)return{status:'draw',reason:'draw'}; return{status:'ongoing'}; }
function publicState(s,playerIndex) { const king=kingSquare(s,s.turn); return {...s,legal:legalMoves(s,playerIndex),check:king>=0&&inCheck(s,s.turn)?king:null}; }
function botMove(s,player) { const moves=legalMoves(s,player); if(!moves.length)return null; return moves.map(m=>({m,score:(s.board[m.to]?10:0)+(m.promotion?8:0)+Math.random()*2})).sort((a,b)=>b.score-a.score)[0].m; }
function markOut(s,player) { const active=s.active.slice(); active[player]=false; const board=s.board.map(p=>p&&p.player===player?null:p); return {...s,active,board,turn:s.turn===player?nextActive({...s,active},player):s.turn}; }
module.exports={createInitialState,isValidMove,applyMove,checkResult,publicState,botMove,markOut};