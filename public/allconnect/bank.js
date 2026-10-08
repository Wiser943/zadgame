/* AllConnect Pay (Bank app): balance, Account ID, payment PIN, transfer to AllConnect users, history.
   "To Bank Account" is shown as coming soon. All money rules are enforced by /api/ac/bank/* on the server. */
const naira=(n,d=0)=>'₦'+Number(n).toLocaleString('en-NG',{minimumFractionDigits:d,maximumFractionDigits:d});
const fdate=t=>{const d=new Date(t);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+', '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})};
Object.assign(PH,{
  B:null,H:[],hideBal:false,X:null,
  async bank(){this.view='bank';this.shell('AllConnect Pay','PH.close()','<div class="abody bk" id="ab"><p class="empty">Loading…</p></div>');await this.bankLoad()},
  async bankLoad(){const sc=NET.cache.get('/api/ac/bank/summary'),hc=NET.cache.get('/api/ac/bank/history');if(sc&&hc){this.B=sc.d;this.H=hc.d.txns;if(this.view==='bank')this.bankDraw()}
    try{const [s,h]=await Promise.all([NET.api('/api/ac/bank/summary'),NET.api('/api/ac/bank/history')]);NET.cache.set('/api/ac/bank/summary',{d:s,t:Date.now()});NET.cache.set('/api/ac/bank/history',{d:h,t:Date.now()});this.B=s;this.H=h.txns;S.cash=s.cash;render()}catch(e){if(!this.B)return toast(e.message)}if(this.view==='bank')this.bankDraw()},
  txRow(t){const cr=t.type==='credit';return `<div class="tx"><span class="tic ${cr?'in':'out'}">${cr?'↙':'↗'}</span><div class="rt"><b>${cr?'Received from':'Transfer to'} ${esc(t.name||'')}</b><span>${fdate(t.at)}${t.note?' · '+esc(t.note):''}</span></div><div class="tam ${cr?'in':''}">${cr?'+':'-'}${naira(t.amount,2)}</div></div>`},
  bankDraw(){const B=this.B,el=document.getElementById('ab');if(!el)return;
    const tiles=[['💸','Transfer','PH.xmenu()'],['📥','Receive','PH.receive()'],['🧾','History','PH.history()'],['🔐','Pay PIN','PH.pinMenu()'],['📱','Airtime','PH.soon()',1],['📶','Data','PH.soon()',1],['💡','Bills','PH.soon()',1],['🐷','Savings','PH.soon()',1]];
    el.innerHTML=`<div class="bcard"><div class="bt"><span>Total Balance</span><button onclick="PH.toggleBal()">${this.hideBal?'🙈':'👁'}</button></div>
      <div class="bamt">${this.hideBal?'₦ ••••••':naira(B.cash,2)}</div>
      <div class="bid"><span>Account ID&nbsp; <b>${B.acNum}</b></span><button onclick="PH.copy('${B.acNum}')">⧉ Copy</button></div></div>
      ${B.hasPin?'':`<div class="pinbn" onclick="PH.setPinFlow()"><span>🔐</span><div><b>Set your payment PIN</b><small>Required before you can send money</small></div><i>›</i></div>`}
      <div class="qgrid">${tiles.map(t=>`<button class="q" onclick="${t[2]}"><span class="qi">${t[0]}${t[3]?'<em>Soon</em>':''}</span>${t[1]}</button>`).join('')}</div>
      <div class="sech"><b>Recent transactions</b>${this.H.length>5?`<a onclick="PH.history()">View all ›</a>`:''}</div>
      ${this.H.length?this.H.slice(0,5).map(t=>this.txRow(t)).join(''):`<p class="empty">No transactions yet. Send or receive money and it shows here.</p>`}`},
  toggleBal(){this.hideBal=!this.hideBal;this.bankDraw()},
  soon(){toast('Coming soon 🚧')},
  copy(t){const ok=()=>toast('Copied ✓');try{navigator.clipboard.writeText(t).then(ok,()=>this.copyOld(t,ok))}catch(e){this.copyOld(t,ok)}},
  copyOld(t,ok){const i=document.createElement('textarea');i.value=t;document.body.appendChild(i);i.select();try{document.execCommand('copy');ok()}catch(e){toast('Copy failed')}i.remove()},
  history(){this.view='bank-h';this.shell('Transactions','PH.bank()',`<div class="abody bk">${this.H.length?this.H.map(t=>this.txRow(t)).join(''):'<p class="empty">No transactions yet.</p>'}</div>`)},
  receive(){this.view='bank-r';const B=this.B;this.shell('Receive money','PH.bank()',`<div class="abody bk"><div class="rcv"><span class="avi big" style="background:#00a86b">${esc((B.name||'?')[0].toUpperCase())}</span><h3>${esc(B.name)}</h3><p>${B.username?'@'+esc(B.username):'Set a username in Settings'}</p>
      <div class="rid">${B.acNum}</div><button class="btn p" onclick="PH.copy('${B.acNum}')">Copy Account ID</button><p class="hint2" style="margin-top:12px">Share your Account ID (or @username) with another AllConnect player so they can send you money.</p></div></div>`)},
  /* ----- transfer ----- */
  xmenu(){this.xBack=null;this.view='bank-m';this.shell('Transfer','PH.bank()',`<div class="abody bk"><button class="opt" onclick="PH.xfer()"><span class="oi" style="background:#e3f6ee">👑</span><div><b>To AllConnect User</b><small>Instant · Free · Needs Account ID</small></div><i>›</i></button>
      <button class="opt" onclick="PH.soon()"><span class="oi" style="background:#eef0f6">🏦</span><div><b>To Bank Account</b><small>Send to your bank app</small></div><em class="soonb">Coming soon</em></button></div>`)},
  xfer(){if(!this.B.hasPin)return this.setPinFlow(()=>this.xfer());this.view='bank-x';this.X=null;const B=this.B,left=Math.max(0,B.limits.daily-B.sentToday);
    this.shell('To AllConnect User',this.xBack||'PH.xmenu()',`<div class="abody bk"><div class="lab2">RECIPIENT</div><input class="sinput" id="xto" placeholder="Paste Account ID or @username" oninput="PH.xlook(this.value)" autocomplete="off" inputmode="text"><div id="xwho"></div>
      <div class="lab2">AMOUNT</div><div class="amt"><span>₦</span><input id="xamt" inputmode="numeric" placeholder="0" oninput="PH.xchk(true)" autocomplete="off"><button type="button" class="amax" onclick="PH.xmax()">Max</button></div>
      <div class="pre">${[1000,5000,10000,20000].map(n=>`<button onclick="PH.xpick(${n})">${n.toLocaleString('en-NG')}</button>`).join('')}</div>
      <div class="hint2">Balance ${naira(B.cash)} · Max ${naira(B.limits.max)} per transfer · ${naira(left)} left today</div>
      <input class="sinput" id="xnote" placeholder="Remark (optional)" maxlength="60" autocomplete="off"><button class="btn p" id="xnext" disabled onclick="PH.xconfirm()">Next</button></div>`)},
  xmax(){const B=this.B,left=Math.max(0,B.limits.daily-B.sentToday),cash=Math.floor(B.cash),a=Math.min(cash,B.limits.max,left);
    if(a<=0)return toast(cash<=0?'You have nothing to send yet':'You have reached your transfer limit for today');
    document.getElementById('xamt').value=a.toLocaleString('en-NG');this.xchk();
    toast(a>=cash?'You are about to transfer all your fortune 💸':'Max allowed for now: '+naira(a))},
  xpick(n){document.getElementById('xamt').value=n.toLocaleString('en-NG');this.xchk()},
  xamt(){const v=parseInt((document.getElementById('xamt')||{value:''}).value.replace(/\D/g,''),10);return Number.isFinite(v)?v:0},
  xchk(fmt){const i=document.getElementById('xamt');if(fmt){const n=this.xamt();i.value=n?n.toLocaleString('en-NG'):''}const a=this.xamt();document.getElementById('xnext').disabled=!(this.X&&a>=this.B.limits.min)},
  xlook(q){clearTimeout(this.xt);this.X=null;const box=document.getElementById('xwho');q=q.trim();this.xchk();
    if(!(/^\d{10}$/.test(q)||/^[a-f\d]{24}$/i.test(q)||/^@?[a-z0-9_]{3,16}$/i.test(q))){box.innerHTML=q.length>3?`<div class="xerr">Enter a 10-digit Account ID or @username</div>`:'';return}
    box.innerHTML='<div class="xwait">Checking…</div>';
    this.xt=setTimeout(async()=>{try{const r=await NET.api('/api/ac/bank/lookup?q='+encodeURIComponent(q));if(document.getElementById('xto').value.trim()!==q)return;this.X=r.account;
      box.innerHTML=`<div class="who2"><span class="ok">✓</span><div><b>${esc(r.account.name)}</b><small>${r.account.username?'@'+esc(r.account.username)+' · ':''}${r.account.acNum}</small></div></div>`;this.xchk()}catch(e){box.innerHTML=`<div class="xerr">${esc(e.message)}</div>`}},350)},
  xconfirm(){const a=this.xamt(),B=this.B,X=this.X,note=document.getElementById('xnote').value.trim();
    if(a>B.cash)return toast('Insufficient balance');this.X.note=note;this.X.amount=a;
    this.sheet(`<h3>Confirm transfer</h3><div class="bigamt">${naira(a,2)}</div><div class="kv"><span>To</span><b>${esc(X.name)}</b></div><div class="kv"><span>Account ID</span><b>${X.acNum}</b></div><div class="kv"><span>Fee</span><b>₦0.00</b></div>${note?`<div class="kv"><span>Remark</span><b>${esc(note)}</b></div>`:''}<button class="btn p" onclick="PH.xsend()">Confirm</button>`)},
  async xsend(){this.closeSheet();const pin=await this.askPin('Enter payment PIN','Confirm to send '+naira(this.X.amount,2));if(!pin)return;
    try{const r=await NET.api('/api/ac/bank/transfer',{method:'POST',body:{to:this.X.acNum,amount:this.X.amount,pin,note:this.X.note}});S.cash=r.cash;render();NET.drop('/api/ac/bank');this.xdone(r.txn)}catch(e){toast(e.message)}},
  xdone(t){this.view='bank-ok';this.last=t;this.shell('Receipt','PH.bank()',`<div class="abody bk okp"><div class="chk">✓</div><h3>Transfer successful</h3><div class="bigamt">${naira(t.amount,2)}</div><p class="hint2">Sent to ${esc(t.name)}</p>
      <div class="card2"><div class="kv"><span>Account ID</span><b>${t.num}</b></div><div class="kv"><span>Date</span><b>${fdate(t.at)}</b></div><div class="kv"><span>Reference</span><b class="sm">${t.ref}</b></div>${t.note?`<div class="kv"><span>Remark</span><b>${esc(t.note)}</b></div>`:''}</div>
      <button class="btn p" onclick="PH.bank()">Done</button><button class="btn s" onclick="PH.copy('AllConnect transfer ${t.ref}: ${naira(t.amount,2)} to ${(t.name||'').replace(/'/g,'')} (${t.num})')">Copy receipt</button></div>`)},
  /* open Transfer already pointed at one player (from a chat or a profile). back = JS to run when the user taps back. */
  async payUser(id,username,back){
    try{if(!this.B||!this.B.limits){this.B=await NET.api('/api/ac/bank/summary');try{this.H=(await NET.api('/api/ac/bank/history')).txns}catch(e){}}else NET.api('/api/ac/bank/summary').then(b=>{this.B=b}).catch(()=>{})}catch(e){return toast(e.message)}
    const q=username?'@'+username:id,go=()=>{this.xBack=back||null;this.xfer();const i=document.getElementById('xto');if(i){i.value=q;this.xlook(q)}};
    if(!this.B.hasPin)return this.setPinFlow(go);go()},
  /* ----- payment PIN ----- */
  pinMenu(){this.sheet(`<h3>Payment PIN</h3><p class="hint2">${this.B.hasPin?'Your 4-digit PIN protects every transfer.':'Create a 4-digit PIN to start sending money.'}</p><button class="fopt" onclick="PH.closeSheet();PH.${this.B.hasPin?'changePin':'setPinFlow'}()"><span>${this.B.hasPin?'🔄 Change PIN':'🔐 Set PIN'}</span></button>`)},
  async setPinFlow(next,cur){const a=await this.askPin(cur?'New payment PIN':'Create payment PIN','Choose a 4-digit PIN');if(!a)return;const b=await this.askPin('Confirm payment PIN','Enter it again');if(!b)return;
    if(a!==b)return toast('PINs do not match. Try again');
    try{await NET.api('/api/ac/bank/pin',{method:'POST',body:{pin:a,current:cur||''}});this.B.hasPin=true;toast('Payment PIN saved ✓');if(next)next();else if(this.view==='bank')this.bankDraw()}catch(e){toast(e.message)}},
  async changePin(){const cur=await this.askPin('Current PIN','Enter your current payment PIN');if(!cur)return;this.setPinFlow(null,cur)},
  askPin(title,sub){return new Promise(res=>{let v='';const ov=document.createElement('div');ov.className='asheet';
    ov.innerHTML=`<div class="shcard pinpad"><button class="px">✕</button><h3>${title}</h3><p class="hint2">${sub||''}</p><div class="dots">${'<i></i>'.repeat(4)}</div><div class="keys">${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k=>`<button data-k="${k}">${k}</button>`).join('')}</div></div>`;
    this.$a().appendChild(ov);const dots=[...ov.querySelectorAll('.dots i')];
    const done=val=>{document.removeEventListener('keydown',kd,true);ov.remove();res(val)};
    const press=k=>{if(k==='⌫')v=v.slice(0,-1);else if(/^\d$/.test(k)&&v.length<4)v+=k;dots.forEach((d,i)=>d.classList.toggle('f',i<v.length));if(v.length===4)setTimeout(()=>done(v),130)};
    const kd=e=>{if(e.key==='Escape'){e.stopPropagation();done(null)}else if(e.key==='Backspace')press('⌫');else if(/^\d$/.test(e.key))press(e.key)};
    document.addEventListener('keydown',kd,true);
    ov.querySelector('.keys').onclick=e=>{const k=e.target.closest('button');if(k)press(k.dataset.k)};ov.querySelector('.px').onclick=()=>done(null);ov.onclick=e=>{if(e.target===ov)done(null)}})}
});
