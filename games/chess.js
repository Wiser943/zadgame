// Chess engine: standard 8x8 chess for 2 players; 14x14 cross-board for 3-4.
const CROSS_SIZE=14, STANDARD_SIZE=8, TYPES=['q','r','b','n'];
const KNIGHT=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]], KING=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]], DIAGONAL=[[-1,-1],[-1,1],[1,-1],[1,1]], ORTHOGONAL=[[-1,0],[1,0],[0,-1],[0,1]];
const inside=(s,r,c)=>r>=0&&r<s.size&&c>=0&&c<s.size;
const playable=(s,r,c)=>inside(s,r,c)&&(s.size===STANDARD_SIZE||(r>=3&&r<=10)||(c>=3&&c<=10));
const at=(s,r,c)=>playable(s,r,c)?s.board[r*s.size+c]:null;
const own=(p,i)=>p&&p.player===i, enemy=(p,i)=>p&&p.player!==i, clone=p=>p?{type:p.type,player:p.player}:null;
function direction(s,p){return s.size===8?(p===0?[-1,0]:[1,0]):[[-1,0],[0,1],[1,0],[0,-1]][p];}
function leftVector(s,p){return s.size===8?(p===0?[0,-1]:[0,1]):[[0,-1],[1,0],[0,1],[-1,0]][p];}
function initialPieces(s,p){const back=['r','n','b','q','k','b','n','r'],out=[],z=s.size;if(z===8){const row=p===0?7:0,pawn=p===0?6:1;for(let i=0;i<8;i++){out.push([row*z+i,back[i]]);out.push([pawn*z+i,'p']);}return out;}for(let i=0;i<8;i++){if(p===0){out.push([13*z+3+i,back[i]]);out.push([12*z+3+i,'p']);}if(p===1){out.push([(3+i)*z,back[i]]);out.push([(3+i)*z+1,'p']);}if(p===2){out.push([3+i,back[i]]);out.push([z+3+i,'p']);}if(p===3){out.push([(3+i)*z+13,back[i]]);out.push([(3+i)*z+12,'p']);}}return out;}
function createInitialStateBase(playerCount=4){const count=Number(playerCount)===2?2:Number(playerCount)===3?3:4,size=count===2?8:14,s={size,mode:count===2?'standard':'cross',playerCount:count,board:Array(size*size).fill(null),turn:0,active:Array(count).fill(true),halfmove:0,fullmove:1,lastMove:null};for(let p=0;p<count;p++)for(const[sq,type]of initialPieces(s,p))s.board[sq]={type,player:p};return s;}
function nextActive(s,from){for(let n=1;n<=s.playerCount;n++){const p=(from+n)%s.playerCount;if(s.active[p])return p;}return from;}
function kingSquare(s,p){return s.board.findIndex(x=>x?.type==='k'&&x.player===p);}
function isAttackedBy(s,sq,attacker){const r=Math.floor(sq/s.size),c=sq%s.size;for(let i=0;i<s.board.length;i++){const p=s.board[i];if(!p||p.player!==attacker)continue;const pr=Math.floor(i/s.size),pc=i%s.size,dr=r-pr,dc=c-pc;if(p.type==='p'){const[vr,vc]=direction(s,attacker),[lr,lc]=leftVector(s,attacker);if((dr===vr+lr&&dc===vc+lc)||(dr===vr-lr&&dc===vc-lc))return true;}else if(p.type==='n'&&KNIGHT.some(([a,b])=>a===dr&&b===dc))return true;else if(p.type==='k'&&Math.max(Math.abs(dr),Math.abs(dc))===1)return true;else if((p.type==='b'||p.type==='q')&&Math.abs(dr)===Math.abs(dc)&&dr){const sr=Math.sign(dr),sc=Math.sign(dc);let clear=true;for(let n=1;n<Math.abs(dr);n++)if(at(s,pr+sr*n,pc+sc*n))clear=false;if(clear)return true;}if((p.type==='r'||p.type==='q')&&((dr===0)!==(dc===0))){const sr=Math.sign(dr),sc=Math.sign(dc),n=Math.max(Math.abs(dr),Math.abs(dc));let clear=true;for(let k=1;k<n;k++)if(at(s,pr+sr*k,pc+sc*k))clear=false;if(clear)return true;}}return false;}
function inCheck(s,p){const k=kingSquare(s,p);return k>=0&&s.active.some((on,i)=>on&&i!==p&&isAttackedBy(s,k,i));}
function add(out,s,from,to,extra={}){const r=Math.floor(to/s.size),c=to%s.size,p=s.board[from],target=s.board[to];if(!playable(s,r,c)||!p||own(target,p.player)||target?.type==='k')return;out.push({from,to,...extra});}
function pseudoBase(s,player){const out=[];for(let from=0;from<s.board.length;from++){const p=s.board[from];if(!own(p,player))continue;const r=Math.floor(from/s.size),c=from%s.size;if(p.type==='p'){const[vr,vc]=direction(s,player),[lr,lc]=leftVector(s,player),rr=r+vr,cc=c+vc,one=rr*s.size+cc,promote=s.size===8?(rr===0||rr===7):(rr===0||rr===13||cc===0||cc===13);if(playable(s,rr,cc)&&!s.board[one]){if(promote)TYPES.forEach(t=>add(out,s,from,one,{promotion:t}));else add(out,s,from,one);}for(const sign of[-1,1]){const ar=r+vr+lr*sign,ac=c+vc+lc*sign,to=ar*s.size+ac;if(playable(s,ar,ac)&&enemy(s.board[to],player)){const pr=s.size===8?(ar===0||ar===7):(ar===0||ar===13||ac===0||ac===13);if(pr)TYPES.forEach(t=>add(out,s,from,to,{promotion:t}));else add(out,s,from,to);}}const canDouble=s.size===8?((player===0&&r===6)||(player===1&&r===1)):((player===0&&r===12)||(player===1&&c===1)||(player===2&&r===1)||(player===3&&c===12));const r2=r+vr*2,c2=c+vc*2,to=r2*s.size+c2;if(canDouble&&playable(s,r2,c2)&&!s.board[(r+vr)*s.size+c+vc]&&!s.board[to])add(out,s,from,to);}else if(p.type==='n'||p.type==='k'){(p.type==='n'?KNIGHT:KING).forEach(([dr,dc])=>{if(playable(s,r+dr,c+dc))add(out,s,from,(r+dr)*s.size+c+dc);});}else{const dirs=p.type==='b'?DIAGONAL:p.type==='r'?ORTHOGONAL:DIAGONAL.concat(ORTHOGONAL);for(const[dr,dc]of dirs)for(let n=1;n<s.size;n++){const rr=r+dr*n,cc=c+dc*n;if(!playable(s,rr,cc))break;const to=rr*s.size+cc;if(!s.board[to])out.push({from,to});else{add(out,s,from,to);break;}}}}return out;}
function makeMoveBase(s,m){const board=s.board.map(clone),p=board[m.from],captured=board[m.to],player=p.player;board[m.from]=null;board[m.to]={type:m.promotion||p.type,player};return{...s,board,turn:nextActive(s,player),halfmove:p.type==='p'||captured?0:s.halfmove+1,fullmove:player===s.playerCount-1?s.fullmove+1:s.fullmove,lastMove:m};}
function legalMoves(s,p=s.turn){return pseudo(s,p).filter(m=>!inCheck(makeMove(s,m),p));}
function isValidMove(s,p,m){if(!s.active[p]||s.turn!==p||!m||!Number.isInteger(m.from)||!Number.isInteger(m.to))return false;return legalMoves(s,p).some(x=>x.from===m.from&&x.to===m.to&&(x.promotion||'q')===(m.promotion||'q'));}
function applyMoveBase(s,p,m){const exact=legalMoves(s,p).find(x=>x.from===m.from&&x.to===m.to&&(x.promotion||'q')===(m.promotion||'q'));if(!exact)return s;const next=makeMove(s,exact),op=next.turn,moves=legalMoves(next,op);if(!moves.length){const active=next.active.slice();active[op]=false;next.active=active;next.board=next.board.map(x=>x&&x.player===op?null:x);next.turn=nextActive(next,op);next.lastMove={...next.lastMove,eliminated:op,checkmate:inCheck(next,op)};}return next;}
function checkResultBase(s){const alive=s.active.map((on,i)=>on?i:-1).filter(i=>i>=0);if(alive.length===1)return{status:'win',winnerIndex:alive[0],reason:'lastKingStanding'};if(!alive.length)return{status:'draw',reason:'draw'};return{status:'ongoing'};}
function publicStateBase(s,p){const king=kingSquare(s,s.turn);return{...s,legal:legalMoves(s,p),check:king>=0&&inCheck(s,s.turn)?king:null,hist:undefined};}
function botMove(s,p){const moves=legalMoves(s,p);if(!moves.length)return null;return moves.map(m=>({m,score:(s.board[m.to]?10:0)+(m.promotion?8:0)+Math.random()*2})).sort((a,b)=>b.score-a.score)[0].m;}
// ---- Standard-chess rules added on top of the base engine (2-player 8x8 only): castling, en passant,
// stalemate, threefold repetition, fifty-move rule and insufficient material. The 3-4 player cross board is unchanged.
const ROOK_HOME={0:{k:63,q:56},1:{k:7,q:0}}, KING_HOME={0:60,1:4};
function hashKey(s){let h=2166136261;const str=s.board.map(x=>x?x.type+x.player:'-').join('')+s.turn+(s.castle?[0,1].map(p=>(s.castle[p].k?'k':'')+(s.castle[p].q?'q':'')).join('|'):'')+(s.ep?s.ep.sq:'');for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}return h;}
function createInitialState(playerCount=4){const s=createInitialStateBase(playerCount);if(s.size===8){s.castle={0:{k:true,q:true},1:{k:true,q:true}};s.ep=null;s.draw=null;s.hist=[hashKey(s)];}return s;}
function extraMoves(s,player){
  const out=[],opp=1-player,vr=player===0?-1:1;
  if(s.ep){for(let from=0;from<64;from++){const p=s.board[from];if(!p||p.type!=='p'||p.player!==player)continue;const r=Math.floor(from/8),c=from%8;for(const dc of[-1,1])if((r+vr)*8+c+dc===s.ep.sq&&c+dc>=0&&c+dc<8)out.push({from,to:s.ep.sq,enPassant:true});}}
  const rights=s.castle&&s.castle[player],ks=KING_HOME[player];
  if(rights&&s.board[ks]&&s.board[ks].type==='k'&&s.board[ks].player===player&&!isAttackedBy(s,ks,opp)){
    const rookOk=sq=>s.board[sq]&&s.board[sq].type==='r'&&s.board[sq].player===player;
    if(rights.k&&rookOk(ROOK_HOME[player].k)&&!s.board[ks+1]&&!s.board[ks+2]&&!isAttackedBy(s,ks+1,opp)&&!isAttackedBy(s,ks+2,opp))out.push({from:ks,to:ks+2,castle:'k'});
    if(rights.q&&rookOk(ROOK_HOME[player].q)&&!s.board[ks-1]&&!s.board[ks-2]&&!s.board[ks-3]&&!isAttackedBy(s,ks-1,opp)&&!isAttackedBy(s,ks-2,opp))out.push({from:ks,to:ks-2,castle:'q'});
  }
  return out;
}
function pseudo(s,player){return s.size===8?pseudoBase(s,player).concat(extraMoves(s,player)):pseudoBase(s,player);}
function makeMove(s,m){
  const next=makeMoveBase(s,m);if(s.size!==8)return next;
  const mover=s.board[m.from],player=mover.player;
  if(m.enPassant)next.board[Math.floor(m.from/8)*8+(m.to%8)]=null;
  if(m.castle==='k'){next.board[m.to-1]=next.board[m.to+1];next.board[m.to+1]=null;}
  if(m.castle==='q'){next.board[m.to+1]=next.board[m.to-2];next.board[m.to-2]=null;}
  next.ep=mover.type==='p'&&Math.abs(m.to-m.from)===16?{sq:(m.from+m.to)/2}:null;
  const castle={0:{...s.castle[0]},1:{...s.castle[1]}};
  if(mover.type==='k'){castle[player].k=false;castle[player].q=false;}
  for(const pl of[0,1])for(const side of['k','q'])if(m.from===ROOK_HOME[pl][side]||m.to===ROOK_HOME[pl][side])castle[pl][side]=false;
  next.castle=castle;
  const irreversible=mover.type==='p'||!!s.board[m.to]||m.enPassant||m.castle||castle[0].k!==s.castle[0].k||castle[0].q!==s.castle[0].q||castle[1].k!==s.castle[1].k||castle[1].q!==s.castle[1].q;
  next.hist=irreversible?[hashKey(next)]:[...(s.hist||[]),hashKey(next)];
  return next;
}
function insufficient(s){const rest=s.board.filter(x=>x&&x.type!=='k');return rest.length===0||(rest.length===1&&(rest[0].type==='b'||rest[0].type==='n'));}
function applyMove(s,p,m){
  if(s.size!==8)return applyMoveBase(s,p,m);
  if(s.draw||!m)return s;
  const exact=legalMoves(s,p).find(x=>x.from===m.from&&x.to===m.to&&(x.promotion||'q')===(m.promotion||'q'));if(!exact)return s;
  const next=makeMove(s,exact),op=next.turn;
  if(!legalMoves(next,op).length){
    if(inCheck(next,op)){const active=next.active.slice();active[op]=false;next.active=active;next.board=next.board.map(x=>x&&x.player===op?null:x);next.turn=nextActive(next,op);next.lastMove={...next.lastMove,eliminated:op,checkmate:true};}
    else next.draw='stalemate';
  }else if(insufficient(next))next.draw='insufficientMaterial';
  else if(next.halfmove>=100)next.draw='fiftyMove';
  else if(next.hist.filter(h=>h===next.hist[next.hist.length-1]).length>=3)next.draw='repetition';
  return next;
}
function checkResult(s){if(s.draw)return{status:'draw',reason:s.draw};return checkResultBase(s);}
function publicState(s,p){return publicStateBase(s,p);}
function markOut(s,p){const active=s.active.slice();active[p]=false;const board=s.board.map(x=>x&&x.player===p?null:x);return{...s,active,board,turn:s.turn===p?nextActive({...s,active},p):s.turn};}
module.exports={createInitialState,isValidMove,applyMove,checkResult,publicState,botMove,markOut,legalMoves};
