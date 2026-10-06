/* AllConnect phone apps: Contacts, Messages (chats + updates), Settings, friend visits.
   Everything talks to /api/ac/* (same login as GameHub) and live events from the /ac socket. */
const FOOD=[['jollof','🍛','Jollof rice & chicken',2500],['suya','🍢','Suya',1500],['chops','🥟','Small chops',1000]];
const KIND_BG={warn:'#fdecec',good:'#e8f5ee',friend:'#e8f0fe',admin:'#fff4d6',update:'#efe8ff',info:'#f1f3f9'};
const PH={
  view:null,tab:'chats',chatId:null,peer:null,msgs:[],friends:null,updates:[],local:[],localUnread:0,badges:{messages:0,requests:0,updates:0},low:{},
  $a(){return document.getElementById('appview')},
  init(){this.refreshBadges()},
  async refreshBadges(){try{this.badges=await NET.api('/api/ac/badges')}catch(e){}this.drawBadges()},
  drawBadges(){const n={Messages:this.badges.messages+this.badges.updates+this.localUnread,Contacts:this.badges.requests};
    document.querySelectorAll('.app[data-app]').forEach(a=>{const b=a.querySelector('.bdg');if(!b)return;const v=n[a.dataset.app]||0;b.textContent=v>9?'9+':(v||'')})},
  /* ----- shell ----- */
  open(name){document.querySelector('.screen').classList.add('light');({contacts:()=>this.contacts(),messages:()=>this.messages(),settings:()=>this.settings(),bank:()=>this.bank(),camera:()=>CAM.open(),police:()=>POL.open()})[name]()},
  close(){document.querySelector('.screen').classList.remove('light');this.view=null;this.chatId=null;this.$a().innerHTML='';this.refreshBadges()},
  shell(title,back,body,sub){this.$a().innerHTML=`<div class="ahead"><button class="aback" onclick="${back}">‹</button><h2>${title}</h2></div>${sub||''}${body}`},
  sheet(html){const s=document.createElement('div');s.className='asheet';s.innerHTML=`<div class="shcard">${html}</div>`;s.onclick=e=>{if(e.target===s)s.remove()};this.$a().appendChild(s)},
  closeSheet(){const s=this.$a().querySelector('.asheet');if(s)s.remove()},
  av(u,big){const n=(u.username||u.displayName||'?').replace(/^@/,'')[0].toUpperCase();const c=['#6366f1','#0ea5e9','#f97316','#10b981','#ec4899','#8b5cf6'][(n.charCodeAt(0)||0)%6];
    return /^(https?:|data:image\/)/.test(u.avatar||'')?`<img class="avi ${big?'big':''}" src="${esc(u.avatar)}" alt="">`:`<span class="avi ${big?'big':''}" style="background:${c}">${esc(n)}</span>`},
  name(u){return u.username?'@'+esc(u.username):esc(u.displayName)},
  time(t){const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')},
  rel(t){const s=(Date.now()-new Date(t))/1000;return s<60?'now':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d'},
  /* ----- Contacts ----- */
  async contacts(){this.view='contacts';this.shell('Contacts','PH.close()','<div class="abody" id="ab"><p class="empty">Loading…</p></div>');await this.loadFriends()},
  async loadFriends(){try{this.friends=await NET.api('/api/ac/friends')}catch(e){return toast(e.message)}if(this.view==='contacts')this.drawContacts()},
  drawContacts(){const f=this.friends,keep=(document.getElementById('psearch')||{}).value||'';
    const row=(u,right,sub)=>`<div class="row">${this.av(u)}<div class="rt"><b>${this.name(u)}</b><span>${sub}</span></div>${right}</div>`;
    let h=`<div class="row"><span class="avi" style="background:#ffe9d6;font-size:22px">👵🏾</span><div class="rt"><b>Mummy</b><span>Always picks up</span></div><button class="rbtn grn" onclick="PH.mummy()">📞</button></div>
      <div class="lab2">FIND A PLAYER</div><input class="sinput" id="psearch" value="${esc(keep)}" placeholder="Search by username, e.g. @tobi" oninput="PH.search(this.value)" autocomplete="off"><div id="sres"></div>`;
    if(f.incoming.length)h+=`<div class="lab2">FRIEND REQUESTS</div>`+f.incoming.map(u=>row(u,`<button class="rbtn grn" onclick="PH.respond('${u.id}',1)">✓</button><button class="rbtn gry" onclick="PH.respond('${u.id}',0)">✕</button>`,'wants to be friends')).join('');
    if(f.outgoing.length)h+=`<div class="lab2">PENDING</div>`+f.outgoing.map(u=>row(u,`<button class="pbtn" onclick="PH.unfriend('${u.id}')">Cancel</button>`,'Waiting for them to accept')).join('');
    h+=`<div class="lab2">${f.friends.length?'MY FRIENDS':'PLAYERS YOU\'VE MET'}</div>`;
    h+=f.friends.length?f.friends.map(u=>row(u,`<button class="rbtn blu" onclick="PH.chat('${u.id}')">💬</button>`,u.online?'<i class="ond"></i>Online':'Offline')).join(''):`<p class="empty">Search a friend's username above to add them. When they accept, they show up here.</p>`;
    document.getElementById('ab').innerHTML=h;if(keep)this.search(keep,true)},
  mummy(){toast('Mummy: "Wetin you chop today? Come home o!" 🍲')},
  search(q,quiet){clearTimeout(this.st);const box=document.getElementById('sres');q=q.trim();if(q.replace(/^@/,'').length<2){if(box)box.innerHTML='';return}
    this.st=setTimeout(async()=>{try{const r=await NET.api('/api/ac/search?q='+encodeURIComponent(q));const b=document.getElementById('sres');if(!b)return;
      b.innerHTML=r.users.length?r.users.map(u=>{const btn={none:`<button class="pbtn blu" onclick="PH.add('${u.id}')">Add</button>`,sent:`<span class="tag">Pending</span>`,received:`<button class="pbtn grn" onclick="PH.respond('${u.id}',1)">Accept</button>`,friend:`<button class="pbtn blu" onclick="PH.chat('${u.id}')">Chat</button>`}[u.relation];
        return `<div class="row">${this.av(u)}<div class="rt"><b>${this.name(u)}</b><span>${u.username?esc(u.displayName):'No username yet'}</span></div>${btn}</div>`}).join(''):'<p class="empty">No players found.</p>'}catch(e){if(!quiet)toast(e.message)}},quiet?0:300)},
  async add(id){try{const r=await NET.api(`/api/ac/friends/${id}/request`,{method:'POST'});toast(r.state==='friend'?'You are now friends 🎉':'Friend request sent ✓');await this.loadFriends()}catch(e){toast(e.message)}},
  async respond(id,yes){try{await NET.api(`/api/ac/friends/${id}/${yes?'accept':'decline'}`,{method:'POST'});toast(yes?'Friend added 🎉':'Request declined');await this.loadFriends();this.refreshBadges()}catch(e){toast(e.message)}},
  async unfriend(id){try{await NET.api(`/api/ac/friends/${id}`,{method:'DELETE'});await this.loadFriends()}catch(e){toast(e.message)}},
  /* ----- Messages ----- */
  async messages(tab){this.view='messages';this.chatId=null;if(tab)this.tab=tab;
    const seg=`<div class="seg2"><button class="${this.tab==='chats'?'on':''}" onclick="PH.messages('chats')">Chats</button><button class="${this.tab==='updates'?'on':''}" onclick="PH.messages('updates')">Updates${this.badges.updates+this.localUnread?` <i class="dot"></i>`:''}</button></div>`;
    this.shell('Messages','PH.close()',seg+'<div class="abody" id="ab"><p class="empty">Loading…</p></div>');
    this.tab==='chats'?await this.drawChats():await this.drawUpdates()},
  async drawChats(){let list=[];try{list=(await NET.api('/api/ac/chats')).chats}catch(e){toast(e.message)}if(this.view!=='messages'||this.tab!=='chats')return;
    const nt='Notification' in window&&Notification.permission==='default';
    const prev=m=>m.kind==='text'?(m.from===NET.user.id?'You: ':'')+esc(m.text):esc(m.text);
    document.getElementById('ab').innerHTML=(nt?`<div class="banner">🔔 <span>Get notified when friends message you</span><button onclick="PH.notifOn()">Turn on</button></div>`:'')+
      `<input class="sinput" id="msgto" placeholder="✏️ Message someone: @username" onkeydown="if(event.key==='Enter')PH.msgTo(this.value)" autocomplete="off">
       <div class="lab2">CHATS</div>`+(list.length?list.map(c=>`<div class="row tap" onclick="PH.chat('${c.peer.id}')">${this.av(c.peer,1)}<div class="rt"><b>${this.name(c.peer)}</b><span class="pv">${prev(c.last)}</span></div><div class="rm"><small>${this.rel(c.last.at)}</small>${c.unread?`<em class="cnt">${c.unread}</em>`:''}</div></div>`).join(''):`<p class="empty">No chats yet. Add friends in Contacts, then message them here.</p>`)},
  async msgTo(v){const q=v.trim().replace(/^@/,'').toLowerCase();if(!q)return;try{const f=await NET.api('/api/ac/friends');const m=f.friends.find(u=>(u.username||'').toLowerCase()===q||u.displayName.toLowerCase()===q);m?this.chat(m.id):toast(`Add @${q} as a friend in Contacts first`)}catch(e){toast(e.message)}},
  notifOn(){if(!('Notification' in window))return toast('Not supported on this device');Notification.requestPermission().then(p=>{toast(p==='granted'?'Notifications on 🔔':'Notifications blocked in browser settings');this.view==='messages'&&this.messages()})},
  async drawUpdates(){let rows=[];try{rows=(await NET.api('/api/ac/updates')).updates}catch(e){}this.updates=rows;
    NET.api('/api/ac/updates/seen',{method:'POST'}).then(()=>{this.badges.updates=0;this.localUnread=0;this.drawBadges()}).catch(()=>{});
    if(this.view!=='messages'||this.tab!=='updates')return;
    const all=[...rows,...this.local].sort((a,b)=>new Date(b.at)-new Date(a.at));
    document.getElementById('ab').innerHTML=all.length?all.map(u=>`<div class="upd"><span class="uic">${u.icon}</span><div class="ub" style="background:${KIND_BG[u.kind]||KIND_BG.info}">${esc(u.text)}<small>${this.time(u.at)}</small></div></div>`).join(''):`<p class="empty">Nothing yet. Friend requests, leaderboard news and updates from the team show up here.</p>`},
  local_(icon,text,kind){this.local.unshift({id:'l'+Date.now(),icon,text,kind,at:Date.now(),local:true});this.local.length=Math.min(this.local.length,30);if(!(this.view==='messages'&&this.tab==='updates'))this.localUnread++;this.drawBadges();if(this.view==='messages'&&this.tab==='updates')this.drawUpdates()},
  /* ----- Chat ----- */
  async chat(id){this.view='chat';this.chatId=id;document.querySelector('.screen').classList.add('light');
    try{const r=await NET.api('/api/ac/messages/'+id);this.peer=r.peer;this.msgs=r.messages}catch(e){this.view='messages';return toast(e.message)}
    const n=this.name(this.peer);
    this.shell(n,"PH.messages()",`<div class="abody chat" id="ab"><div class="cmsgs" id="cm"></div></div>
      <div class="qr">${['How far? 👋','I dey o 😄','Wetin dey happen?'].map(t=>`<button onclick="PH.send('${t}')">${t}</button>`).join('')}</div>
      <div class="emo" id="emo" style="display:none">${['😂','😍','🙏🏾','🔥','👏🏾','😭','🎉','🍛'].map(e=>`<button onclick="PH.emoji('${e}')">${e}</button>`).join('')}</div>
      <div class="cin"><button class="ebtn" onclick="document.getElementById('emo').style.display=document.getElementById('emo').style.display==='none'?'flex':'none'">☺</button><input id="cinput" placeholder="Message ${n}…" maxlength="300" autocomplete="off" onkeydown="if(event.key==='Enter')PH.sendInput()"><button class="sbtn" onclick="PH.sendInput()">➤</button></div>`,
      `<div class="csub">🔒 Private · only you and ${n} can see this</div><div class="chips2">
        <button class="c1" onclick="PH.invite()">🏠 Invite over</button><button class="c2" onclick="PH.visit()">🚪 Visit them</button><button class="c4" onclick="PH.foodSheet()">🍛 Buy food</button><button class="c5" onclick="PH.blockSheet()">🚫 Block</button><button class="c5" onclick="PH.reportSheet()">⚑ Report</button></div>`);
    this.drawMsgs();this.refreshBadges()},
  bubble(m,last){const mine=m.from===NET.user.id;
    if(m.kind==='money'||m.kind==='food'||m.kind==='system')return `<div class="sys">${esc(m.text)} · ${this.time(m.at)}</div>`;
    if(m.kind==='invite')return `<div class="sys inv">${esc(m.text)} · ${this.time(m.at)}${mine?'':`<br><button onclick="PH.visit()">Go over 🏠</button>`}</div>`;
    return `<div class="msg ${mine?'me':'th'}"><div class="mb">${esc(m.text)}</div><small>${this.time(m.at)}${mine&&last&&m.read?' · Seen':''}</small></div>`},
  drawMsgs(){const el=document.getElementById('cm');if(!el)return;const lastMine=[...this.msgs].reverse().find(m=>m.from===NET.user.id&&m.kind==='text');
    el.innerHTML=this.msgs.length?this.msgs.map(m=>this.bubble(m,lastMine&&m.id===lastMine.id)).join(''):`<p class="empty">Say hi to ${this.name(this.peer)} 👋</p>`;const b=document.getElementById('ab');b.scrollTop=b.scrollHeight},
  push(m){if(this.msgs.some(x=>x.id===m.id))return;this.msgs.push(m);this.drawMsgs()},
  emoji(e){const i=document.getElementById('cinput');i.value+=e;i.focus()},
  sendInput(){const i=document.getElementById('cinput');const t=i.value.trim();if(!t)return;i.value='';this.send(t)},
  async send(t){try{this.push((await NET.api('/api/ac/messages/'+this.chatId,{method:'POST',body:{text:t}})).message)}catch(e){toast(e.message)}},
  async invite(){try{this.push((await NET.api('/api/ac/invite/'+this.chatId,{method:'POST'})).message);toast('Invite sent 🏠')}catch(e){toast(e.message)}},
  foodSheet(){this.sheet(`<h3>Buy food 🍛</h3><p class="hint2">Fills their hunger bar. You pay.</p>${FOOD.map(f=>`<button class="fopt" onclick="PH.buyFood('${f[0]}')"><span>${f[1]} ${f[2]}</span><b>₦${f[3].toLocaleString('en-NG')}</b></button>`).join('')}`)},
  async buyFood(k){try{const r=await NET.api('/api/ac/buy-food/'+this.chatId,{method:'POST',body:{item:k}});S.cash=r.cash;render();this.closeSheet();this.push(r.message);toast('Food delivered 🍛')}catch(e){toast(e.message)}},
  blockSheet(){this.sheet(`<h3>Block ${this.name(this.peer)}?</h3><p class="hint2">They won't be able to find you, message you or send you money. You can unblock later.</p><button class="fopt red" onclick="PH.block()"><span>🚫 Block</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)},
  async block(){try{await NET.api('/api/ac/block/'+this.chatId,{method:'POST'});toast('Blocked');this.tab='chats';this.messages()}catch(e){toast(e.message)}},
  reportSheet(){this.sheet(`<h3>Report ${this.name(this.peer)}</h3><p class="hint2">Pick a reason. Our team reviews every report.</p>${['Spam','Harassment','Scam','Inappropriate'].map(r=>`<button class="fopt" onclick="PH.report('${r}')"><span>${r}</span></button>`).join('')}`)},
  async report(r){try{await NET.api('/api/ac/report/'+this.chatId,{method:'POST',body:{reason:r}});this.closeSheet();toast('Report sent. Thank you 🙏🏾')}catch(e){toast(e.message)}},
  async visit(){try{const r=await NET.api('/api/ac/visit/'+this.chatId);openVisit(r.host)}catch(e){toast(e.message)}},
  /* ----- live events ----- */
  on(ev,p){
    if(ev==='dm'){this.badges.messages++;const open=this.view==='chat'&&this.chatId===p.from;
      if(open){this.push(p);NET.api('/api/ac/messages/'+p.from).catch(()=>{});this.badges.messages=Math.max(0,this.badges.messages-1)}
      else{if(p.kind==='text'||p.kind==='invite')toast('💬 '+p.text.slice(0,40));if(document.hidden&&'Notification' in window&&Notification.permission==='granted')try{new Notification('AllConnect',{body:p.text})}catch(e){}
        if(this.view==='messages'&&this.tab==='chats')this.drawChats()}
      this.drawBadges()}
    if(ev==='update'){this.badges.updates++;toast(p.icon+' '+p.text.slice(0,48));this.drawBadges();if(this.view==='messages'&&this.tab==='updates')this.drawUpdates();if(document.hidden&&'Notification' in window&&Notification.permission==='granted')try{new Notification('AllConnect',{body:p.text})}catch(e){}}
    if(ev==='friends'){this.refreshBadges();if(this.view==='contacts')this.loadFriends()}
    if(ev==='seen'&&this.view==='chat'&&this.chatId===p.by){this.msgs.forEach(m=>{if(m.from===NET.user.id)m.read=true});this.drawMsgs()}
    if(ev==='cash'&&this.view==='bank')this.bankLoad();if(ev==='cash')NET.api('/api/ac/state').then(j=>{S.cash=j.ac.cash;S.needs=j.ac.needs;render()}).catch(()=>{})}
};
const fmtCash=n=>'₦'+Number(n).toLocaleString('en-NG');
/* ----- visiting a friend's place ----- */
function openVisit(h){const v=document.getElementById('visit');
  let s=document.getElementById('room').outerHTML.replace(/ id="room"/,'').replace(/ onclick="walk\(event\)"/,'').replace(/ id="[a-z]+"/g,'').replace('class="room"','class="room vroom"');
  v.style.setProperty('--wall',h.paint);v.innerHTML=`${s}<div class="vtop"><span class="pill">🏠 ${esc(h.name)}'s place</span><button class="pill" onclick="closeVisit()">Leave</button></div><div class="pill vnote">You're visiting ${esc(h.name)} · ${h.items} item${h.items===1?'':'s'} bought</div>`;v.style.display='block'}
function closeVisit(){document.getElementById('visit').style.display='none'}

/* Desktop: Esc steps back (visit -> GameHub -> phone app) */
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const vis=document.getElementById('visit'),hub=document.getElementById('hub');
  if(vis&&vis.style.display==='block')closeVisit();else if(hub&&hub.style.display==='flex')closeHub();else if(PH.view==='chat')PH.messages();else if(PH.view)PH.close()});
