/* ================= AllConnect client =================
   Login: same accounts as GameHub (POST /auth/login, /auth/register, Google). Realtime: Socket.io namespace /ac. */
const NET={
  sock:null,saveT:0,user:null,
  async api(url,opt={}){
    const r=await fetch(url,{method:opt.method||'GET',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:opt.body?JSON.stringify(opt.body):undefined});
    let j={};try{j=await r.json()}catch{}
    if(!r.ok)throw Object.assign(new Error(j.message||'Something went wrong. Try again.'),{status:r.status});return j},
  connect(){
    if(this.sock)return;this.sock=io('/ac',{withCredentials:true});
    this.sock.on('stats',m=>{$('vis').textContent=fmtN(m.visits);$('onl').textContent=fmtN(m.online);S.gems=m.gems;gemText()});
    this.sock.on('players',drawPlayers);
    this.sock.on('gem',m=>{S.cash=m.cash;toast(m.prize?`💎 Gem found! +₦${m.prize.toLocaleString()}`:'💎 Gem found!');render()})},
  save(){if(!this.user)return;clearTimeout(this.saveT);
    this.saveT=setTimeout(()=>this.api('/api/ac/save',{method:'POST',body:{paint:S.paint,needs:S.needs,min:S.min}}).catch(()=>{}),1500)}
};
const fmtN=n=>n>=1e6?(n/1e6).toFixed(1)+'m':n>=1e4?(n/1e3).toFixed(1)+'k':String(n);
function gemText(){const e=$('gem');if(e)e.textContent=`${(S.gems||0).toLocaleString()} found · next prize ₦3,000`}
function findGem(){if(NET.sock)NET.sock.emit('gem')}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function drawPlayers(list){
  let box=$('players');if(!box){box=document.createElement('div');box.id='players';$('map').appendChild(box)}
  box.innerHTML=list.filter(p=>p.name!==(NET.user&&NET.user.displayName)).slice(0,25).map(p=>{
    let h=0;for(const c of p.name)h=(h*31+c.charCodeAt(0))%997;
    return `<span class="pill mp" style="left:${10+h%80}%;top:${14+(h*7)%76}%;padding:3px 10px;font-size:12px;opacity:.9">🟢 ${esc(p.name)}</span>`}).join('')}
function applyAC(ac){Object.assign(S,{cash:ac.cash,paint:ac.paint,needs:ac.needs,min:ac.min});S.owned=Object.fromEntries(ac.owned.map(n=>[n,1]));setPaint(S.paint)}
let AM='login';
function authMode(m){AM=m;$('tl').className=m=='login'?'on':'';$('tr').className=m=='login'?'':'on';$('fname').style.display=m=='login'?'none':'block';
  $('abtn').textContent=m=='login'?'Sign in':'Create account';$('fpw').autocomplete=m=='login'?'current-password':'new-password';$('aerr').textContent=''}
async function doAuth(){
  const id=$('fid').value.trim(),pw=$('fpw').value,name=$('fname').value.trim(),b=$('abtn');$('aerr').textContent='';
  if(!id||!pw||(AM=='register'&&!name))return $('aerr').textContent=AM=='register'?'Enter your name, email/phone and password.':'Enter your email/phone and password.';
  b.disabled=true;try{await NET.api(AM=='login'?'/auth/login':'/auth/register',{method:'POST',body:AM=='login'?{identifier:id,password:pw}:{name,identifier:id,password:pw}});await boot()}
  catch(e){$('aerr').textContent=e.message}b.disabled=false}
function logout(){location.href='/auth/logout'}
async function boot(){
  if(window.top!==window.self){window.top.location.href='/';return}   // GameHub logout redirects here: never nest the platform
  try{const j=await NET.api('/api/ac/state');NET.user=j.user;applyAC(j.ac);S.gems=j.stats.gems;
    $('uname').textContent=j.user.displayName;$('uname2').textContent=j.user.displayName;
    $('auth').style.display='none';$('resume').style.display='block';NET.connect();render()}
  catch(e){$('auth').style.display='block';$('resume').style.display='none';if(e.status&&e.status!==401)$('aerr').textContent=e.message}
  if(/auth_error/.test(location.search)){$('aerr').textContent='Google sign-in is not available right now. Use email or phone.';history.replaceState(null,'','/')}}
function openHub(){const f=$('hubf');if(!f.getAttribute('src'))f.src='/gamehub';$('hub').style.display='flex'}
function closeHub(){$('hub').style.display='none';nav('home')}
const $=id=>document.getElementById(id);
const S={cash:2025000,min:19*60+53,needs:[.55,.9,.95,.85,.95,.9],paint:'#d9a93a',tab:'Design',sel:null,owned:{'Classic Cream':1},clean:false};
const NEED=['🥧','⚡','🎉','💬','🫧','🚽'];
const fmt=n=>'₦'+n.toLocaleString('en-NG');
const hm=m=>{m=(m%1440+1440)%1440;let h=Math.floor(m/60),mm=String(m%60).padStart(2,'0');return{h:(h%12)||12,mm,ap:h<12?'AM':'PM'}};
function toast(t){const e=$('toast');e.textContent=t;e.style.opacity=1;clearTimeout(e.t);e.t=setTimeout(()=>e.style.opacity=0,1600)}
function render(){NET.save();const t=hm(S.min);$('clk').textContent=`${t.h}:${t.mm} ${t.ap}`;$('pt').textContent=`${t.h}:${t.mm}${t.ap}`;$('pb').textContent=`${t.h}:${t.mm}`;
 $('bal').textContent=fmt(S.cash);$('bal2').textContent=fmt(S.cash);
 $('needs').innerHTML=S.needs.map((v,i)=>`<div class="n"><span>${NEED[i]}</span><div class="bar"><u style="width:${v*100}%;${v<.5?'background:#f5a623':''}"></u></div></div>`).join('');
 const lo=Math.min(...S.needs);$('mood').textContent=lo>.7?'😄 Very Happy':lo>.4?'🙂 Okay':'😩 Hungry'}
setInterval(()=>{S.min++;S.needs=S.needs.map(v=>Math.max(0,v-.004));render()},3000);
function eat(e){e.stopPropagation();S.needs[0]=Math.min(1,S.needs[0]+.4);toast('Yum! Ate jollof 🍛');render()}
function walk(e){const r=$('room').getBoundingClientRect(),k=400/r.width;let x=(e.clientX-r.left)*k,y=(e.clientY-r.top)*k-60;
 x=Math.max(30,Math.min(370,x));y=Math.max(130,Math.min(290,y));$('me').style.transition='transform .6s ease';$('me').setAttribute('transform',`translate(${x} ${y})`)}
function toggleClean(){S.clean=!S.clean;['homeUI','chips'].forEach(i=>$(i).style.display=S.clean?'none':'');}
const NAV=[['home','Home','<path d="M4 11l8-7 8 7v9H4z"/>'],['buy','Buy','<rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 9V7a2 2 0 012-2h8a2 2 0 012 2v2M7 17v2M17 17v2"/>'],['map','Map','<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>'],['phone','Phone','<rect x="7" y="3" width="10" height="18" rx="2"/>']];
function nav(w){S.page=w;$('nav').innerHTML=NAV.map(n=>`<button class="${n[0]==w?'on':''}" onclick="nav('${n[0]}')"><svg viewBox="0 0 24 24">${n[2]}</svg>${n[1]}</button>`).join('');
 const home=w=='home';
 $('map').style.display=w=='map'?'block':'none';$('buy').style.display=w=='buy'?'block':'none';$('phone').style.display=w=='phone'?'block':'none';
 $('room').style.display=(w=='map')?'none':'block';$('needsbar').style.display=(home||w=='map')?'flex':'none';$('nav').style.display=(w=='buy')?'none':'flex';
 $('hud').style.display=(w=='buy')?'none':'flex';$('chips').style.display=(home&&!S.clean||w=='map')?'flex':'none';$('homeUI').style.display=(home&&!S.clean)?'block':'none';
 if(w=='phone'){$('room').style.display='block';$('hud').style.display='flex'}
 if(w=='buy'){$('room').style.top='44px';buyUI()}else $('room').style.top='';
 if(w=='map'){let p=18;$('ld').style.display='block';const i=setInterval(()=>{p+=Math.ceil(Math.random()*14);if(p>=100){clearInterval(i);$('ld').style.display='none'}else $('ld').textContent='Loading Lagos… '+p+'%'},500)}}
const PINS=[['📻 Naija Radio',20,22],['⚽ Viewing Centre',26,29],['🍲 Amala Shitta',19,37],['🏠 Home',47,34,0],['💡 CcHub',74,27],['🎓 UNILAG',78,32],['🚧 ✈️ Airport · Coming soon',34,42,1],['⛵ Boat Cruise',58,45],['🏋️ i-Fitness',44,59],['⚖️ High Court',22,63],['📚 The Library',70,61],['🏨 Eko Hotels',40,69],['🎭 Freedom Park',24,73],['🌐 Quilox',64,75],['🕯 Ivory Rooftop',76,80],['🎰 Eko Casino',36,80]];
$('pins').innerHTML=PINS.map(p=>`<button class="pill mp ${p[3]?'y':''}" style="left:${p[1]}%;top:${p[2]}%" onclick="${p[0].includes('Home')?"nav('home')":"toast('"+p[0].split(' ').slice(1).join(' ')+" opens soon')"}">${p[0]}</button>`).join('');
const CAT={Design:[['WALL PAINT',[['Classic Cream',3000,'#e8dcb4'],['Lagos Sky',3000,'#86b6dc'],['Mint Fresh',3000,'#93d3b5'],['Peach Glow',3000,'#f2a585'],['Soft Lilac',3000,'#bba4d9'],['Naija Green',4000,'#2f9e63'],['Lekki Charcoal',5000,'#4a4e57'],['Owambe Gold',6000,'#d9a93a']]]],Sleep:[['BEDS',[['Single Bed',45000,'#d63a2f'],['Foam Mattress',60000,'#cfd4dc'],['Queen Bed',250000,'#7a4b2a'],['Net',8000,'#eee']]]],Kitchen:[['APPLIANCES',[['Gas Cooker',85000,'#bbb'],['Fridge',320000,'#dfe6ee'],['Gen Set',180000,'#d94']]]],Bath:[['BATHROOM',[['Bucket Set',2000,'#2f6fd8'],['Water Closet',70000,'#fff'],['Shower',40000,'#9cc']]]]};
function buyUI(){$('sheet').style.maxHeight='42%';$('tabs').innerHTML=Object.keys(CAT).map(t=>`<button class="${t==S.tab?'on':''}" onclick="S.tab='${t}';S.sel=null;buyUI()">${{Design:'🎨',Sleep:'🛏️',Kitchen:'🍳',Bath:'🚿'}[t]} ${t}</button>`).join('');
 const g=CAT[S.tab][0];$('lab').textContent=g[0];$('items').innerHTML=g[1].map((it,i)=>`<button class="sw ${S.sel===i?'sel':''}" onclick="pick(${i})"><i style="background:linear-gradient(90deg,${it[2]} 50%,${it[2]}cc 50%)"></i>${it[0]}<span>${S.owned[it[0]]?'Owned':fmt(it[1])}</span></button>`).join('');
 const it=g[1][S.sel];$('buyb').style.display=it?'block':'none';if(it)$('buyb').textContent=S.owned[it[0]]?'Use':'Buy '+it[0]+' · '+fmt(it[1])}
function setPaint(c){S.paint=c;document.documentElement.style.setProperty('--wall',c)}
function pick(i){S.sel=i;const it=CAT[S.tab][0][1][i];if(S.tab=='Design')setPaint(it[2]);buyUI()}
async function buyIt(){const it=CAT[S.tab][0][1][S.sel];if(!S.owned[it[0]]){try{const r=await NET.api('/api/ac/buy',{method:'POST',body:{name:it[0]}});S.cash=r.ac.cash;S.owned=Object.fromEntries(r.ac.owned.map(n=>[n,1]));toast('Bought '+it[0]+' ✓')}catch(e){return toast(e.message)}}else toast('Applied');render();buyUI()}
const APPS=[['Jobs','💼','linear-gradient(#34d399,#10b981)'],['Messages','💬','linear-gradient(#60a5fa,#2563eb)'],['Meetumo','◐','#0f2a2a;color:#4de0c0'],['Salary Index','SI','#2d5a1b;color:#c8f04a;font-size:44px'],['PopOut Tickets','P','#fff;color:#6d28d9',1],['GameHub','🎮','#151a35'],['Nollywood','N','#000;color:#7ed321',1],['Bet Tips','⚽','#e11d2e',1],['use.live','✺','#111;color:#fff',1],['versiah.com','▽','#fff;color:#111',1],['Contacts','📞','linear-gradient(#34d399,#16a34a)'],['Ride','🚕','#fbbf24'],['Chowdeck','🛵','linear-gradient(#fb7185,#e11d48)'],['Bank','🏛️','linear-gradient(#a78bfa,#6d5ce8)'],['Boutique','👠','linear-gradient(#c084fc,#9333ea)'],['Forbes','👑','#0f3d2e'],['Naija Radio','📻','linear-gradient(#f59e0b,#d97706)'],['Eko Hotels','🏨','linear-gradient(#38bdf8,#0369a1)'],['i-Fitness','🏋️','linear-gradient(#f43f5e,#be123c)'],['Library','📚','linear-gradient(#a3e635,#4d7c0f)'],['Casino','🎰','#2b0f3a'],['Airport','✈️','linear-gradient(#93c5fd,#3b82f6)'],['Camera','📷','#2a2d36'],['Settings','⚙️','linear-gradient(#9ca3af,#4b5563)']];
$('apps').innerHTML=APPS.map(a=>`<button class="app" onclick="${a[0]=='GameHub'?'openHub()':`toast('${a[0]} opens soon')`}">${a[3]?'<span class="nw">NEW</span>':''}<div class="ic" style="background:${a[2]}">${a[1]}</div><em>${a[0]}</em></button>`).join('');
async function start(n){if(n){try{applyAC((await NET.api('/api/ac/new',{method:'POST'})).ac)}catch(e){return toast(e.message)}}$('splash').style.display='none';render();nav('home')}
$('sd').textContent=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});
render();nav('home');boot();

/* isometric checker floor (aligned to the room's walls) */
(function(){const L=[4,262],T=[196,-92],B=[196,92],N=6,f=document.getElementById('floor');if(!f)return;let s='';
 const P=(u,v)=>[(L[0]+u*T[0]+v*B[0]).toFixed(1),(L[1]+u*T[1]+v*B[1]).toFixed(1)].join(',');
 for(let i=0;i<N;i++)for(let k=0;k<N;k++)s+=`<polygon points="${P(i/N,k/N)} ${P((i+1)/N,k/N)} ${P((i+1)/N,(k+1)/N)} ${P(i/N,(k+1)/N)}" fill="${(i+k)%2?'#c58a52':'#a8693a'}"/>`;
 f.innerHTML=s})();
(function(){const r=document.getElementById('room');if(!r)return;let s=r.outerHTML.replace(/ id="room"/,'').replace(/ onclick="walk\(event\)"/,'').replace(/id="(ck|lg)"/g,'id="$1s"').replace(/url\(#(ck|lg)\)/g,'url(#$1s)').replace(/ id="(me|wl|wr)"/g,'').replace('class="room"','class="room splash-room"');
  const sp=document.getElementById('splash');sp.insertAdjacentHTML('afterbegin',s)})();

