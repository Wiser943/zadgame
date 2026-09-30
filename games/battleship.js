function ships(){return Array.from({length:10},()=>Array(10).fill(false));}
function createInitialState(){const boards=[ships(),ships()];for(let i=0;i<5;i++){boards[0][0][i]=true;boards[1][9][i]=true;}return {boards,shots:[[],[]],turn:0};}
function isValidMove(s,i,m){return s.turn===i&&Number.isInteger(m?.row)&&Number.isInteger(m?.col)&&m.row>=0&&m.row<10&&m.col>=0&&m.col<10&&!s.shots[i].some(x=>x[0]===m.row&&x[1]===m.col)}
function applyMove(s,i,m){const shots=s.shots.map(x=>x.slice());shots[i].push([m.row,m.col]);return {...s,shots,turn:1-i};}
function checkResult(s){for(let i=0;i<2;i++){const opp=1-i;if(s.shots[i].filter(([r,c])=>s.boards[opp][r][c]).length>=5)return {status:'win',winnerIndex:i};}return {status:'ongoing'};}
function publicState(s,i){return {boards:s.boards.map((b,n)=>n===i?b:s.boards[n].map(r=>r.map(()=>false))),shots:s.shots,turn:s.turn};}
function botMove(s,i){for(let r=0;r<10;r++)for(let c=0;c<10;c++)if(isValidMove(s,i,{row:r,col:c}))return {row:r,col:c};return null}module.exports={createInitialState,isValidMove,applyMove,checkResult,publicState,botMove};
