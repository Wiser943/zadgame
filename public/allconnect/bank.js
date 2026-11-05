/* AllConnect Pay (Bank app): balance, Account ID, payment PIN, transfer to AllConnect users, history.
   "To Bank Account" is shown as coming soon. All money rules are enforced by /api/ac/bank/* on the server. */
const naira=(n,d=0)=>'₦'+Number(n).toLocaleString('en-NG',{minimumFractionDigits:d,maximumFractionDigits:d});
/* 3,000,000 -> "3m", 1,250,000 -> "1.25m". Rounds down (up for "left") so a player is never shown more than they have. Keeps the boxes from stretching as numbers grow. */
const abbr=(n,up)=>{n=Number(n)||0;const a=Math.abs(n),r=v=>String(up?Math.ceil(v*100-1e-9)/100:Math.floor(v*100+1e-9)/100);if(a>=1e12)return r(n/1e12)+'t';if(a>=1e9)return r(n/1e9)+'b';if(a>=1e6)return r(n/1e6)+'m';if(a>=1e4)return r(n/1e3)+'k';return n.toLocaleString('en-NG')};
const fdate=t=>{const d=new Date(t);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+', '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})};
Object.assign(PH,{
  B:null,H:[],hideBal:false,X:null,
  async bank(){this.view='bank';this.shell('AllConnect Pay','PH.close()','<div class="abody bk" id="ab"><p class="empty">Loading…</p></div>');await this.bankLoad()},
  async bankLoad(){const sc=NET.cache.get('/api/ac/bank/summary'),hc=NET.cache.get('/api/ac/bank/history');if(sc&&hc){this.B=sc.d;this.H=hc.d.txns;if(this.view==='bank')this.bankDraw()}
    try{const [s,h]=await Promise.all([NET.api('/api/ac/bank/summary'),NET.api('/api/ac/bank/history')]);NET.cache.set('/api/ac/bank/summary',{d:s,t:Date.now()});NET.cache.set('/api/ac/bank/history',{d:h,t:Date.now()});this.B=s;this.H=h.txns;S.cash=s.cash;render()}catch(e){if(!this.B)return toast(e.message)}if(this.view==='bank')this.bankDraw()},
  txRow(t){const cr=t.type==='credit';return `<div class="tx"><span class="tic ${cr?'in':'out'}">${cr?'↙':'↗'}</span><div class="rt"><b>${cr?'Received from':'Transfer to'} ${esc(t.name||'')}</b><span>${fdate(t.at)}${t.note?' · '+esc(t.note):''}</span></div><div class="tam ${cr?'in':''}">${cr?'+':'-'}${naira(t.amount,2)}</div></div>`},
  bankDraw(){const B=this.B,el=document.getElementById('ab');if(!el)return;
    const tiles=[['<i class="fa-solid fa-money-bill-transfer"></i>','Transfer','PH.xmenu()'],['<i class="fa-solid fa-download"></i>','Receive','PH.receive()'],['<i class="fa-solid fa-receipt"></i>','History','PH.history()'],['<i class="fa-solid fa-building-columns"></i>','Withdraw','PH.payouts()'],['<i class="fa-solid fa-lock"></i>','Pay PIN','PH.pinMenu()'],['<i class="fa-solid fa-mobile-screen"></i>','Airtime','PH.soon()',1],['<i class="fa-solid fa-wifi"></i>','Data','PH.soon()',1],['<i class="fa-solid fa-lightbulb"></i>','Bills','PH.bills()',window.LAGOS?LAGOS.dueLabel():'' ]];
    el.innerHTML=`<div class="bcard"><div class="bt"><span>Total Balance</span><button onclick="PH.toggleBal()">${this.hideBal?'<i class="fa-solid fa-eye-slash"></i>':'<i class="fa-solid fa-eye"></i>'}</button></div>
      <div class="bamt">${this.hideBal?'₦ ••••••':naira(B.cash,2)}</div>
      <div class="bid"><span>Account ID&nbsp; <b>${B.acNum}</b></span><button onclick="PH.copy('${B.acNum}')"><i class="fa-solid fa-copy"></i> Copy</button></div></div>
      ${B.hasPin?'':`<div class="pinbn" onclick="PH.setPinFlow()"><span><i class="fa-solid fa-lock"></i></span><div><b>Set your payment PIN</b><small>Required before you can send money</small></div><i>›</i></div>`}
      <div class="qgrid">${tiles.map(t=>`<button class="q" onclick="${t[2]}"><span class="qi">${t[0]}${t[3]?`<em${t[3]===1?'':' class="due"'}>${t[3]===1?'Soon':t[3]}</em>`:''}</span>${t[1]}</button>`).join('')}</div>
      <div class="sech"><b>Recent transactions</b>${this.H.length>5?`<a onclick="PH.history()">View all ›</a>`:''}</div>
      ${this.H.length?this.H.slice(0,5).map(t=>this.txRow(t)).join(''):`<p class="empty">No transactions yet. Send or receive money and it shows here.</p>`}`},
  async payouts(){this.view='payouts';this.shell('Withdrawals','PH.bank()','<div class="abody bk" id="payoutBox"><p class="empty">Loading eligibility…</p></div>');try{this.P=await NET.api('/api/ac/payouts/status');this.payoutDraw()}catch(e){document.getElementById('payoutBox').innerHTML=`<p class="empty">${esc(e.message)}</p>`}},
  /* if the server is an older version and sent no numbers, work them out from the season rules so the card is still detailed */
  fillReq(r,p){if(r.need!=null)return r;const sr=((p.season&&p.season.rules)||[]).find(x=>x.key===r.key),v=sr?Number(sr.value||0):NaN,n=parseFloat(String(r.actual||'').replace(/,/g,'')),u={minBalance:'units',accountAgeDays:'days',posts:'posts'}[r.key];
    if(!u||!isFinite(v)||!isFinite(n))return r;const f=x=>Number(x).toLocaleString('en-NG'),left=Math.max(0,v-n);
    return Object.assign({},r,{have:n,need:v,left,unit:u,progress:v?Math.min(1,n/v):1,detail:r.ok?'You have '+abbr(n)+' '+u+'. The minimum is '+abbr(v)+'.':'You have '+abbr(n)+' of the '+abbr(v)+' '+u+' needed. You still need '+abbr(left,1)+' more.'})},
  /* one requirement: what it is, how far along you are, and exactly how much is left */
  reqCard(r){const f=n=>Number(n).toLocaleString('en-NG'),pct=Math.round((r.progress!=null?r.progress:(r.ok?1:0))*100),num=r.need!=null;
    return '<div class="wdq '+(r.ok?'met':'todo')+'"><div class="wdqh"><span class="wdqi">'+(r.ok?'✓':'✕')+'</span><div><b>'+esc(r.label)+'</b><small>'+esc(r.description||'')+'</small></div></div>'+
      (num?'<div class="wdqbar"><i style="width:'+pct+'%"></i></div><div class="wdqn"><span><em>You have</em><b title="'+f(r.have)+'">'+abbr(r.have)+'</b></span><span><em>Needed</em><b title="'+f(r.need)+'">'+abbr(r.need)+'</b></span><span><em>'+(r.ok?'Status':'Remaining')+'</em><b title="'+(r.ok?'':f(r.left))+'">'+(r.ok?'Done':abbr(r.left,1))+'</b></span></div><div class="wdqu">'+esc(r.unit||'')+'</div>':'')+
      '<p class="wdqd">'+esc(r.detail||r.actual||'')+'</p></div>'},
  payoutDraw(){
    const p=this.P,b=document.getElementById('payoutBox'); if(!b)return;
    if(!p.season){b.innerHTML=NOTICE.html()+'<div class="card2"><h3>No withdrawal season is open</h3><p class="hint2">Keep playing and watch Updates for the next season announcement.</p></div>';return}
    const e=p.eligibility||{}, fail=e.failed||[], rules=(e.rules||[]).map(r=>this.reqCard(this.fillReq(r,p))).join('');
    const start=p.account&&p.account.startingBatch, requests=p.requests||[], slots=(p.schedule||[]).map((s,i)=>{const r=requests.find(x=>Number(x.slot)===i),bat=(p.season.batches||[]).find(x=>Number(x.number)===Number(s.batch));return '<div class="fopt"><span>Season '+p.season.seasonNo+' · Batch '+s.batch+'<small>'+(r?PH.payStatus(r):'Limited slot. Unused eligible units roll forward if this batch closes.')+'</small></span>'+(!r&&p.account&&p.account.bankBoundAt&&bat&&bat.status==='open'?'<button class="pbtn blu" onclick="PH.submitPayout('+i+')">Submit</button>':'')+'</div>'}).join('');
    const all=e.rules||[], met=all.filter(x=>x.ok).length, pct=all.length?Math.round(met/all.length*100):100, fd=d=>d?new Date(d).toLocaleDateString('en-NG',{weekday:'short',day:'numeric',month:'short'}):'';
    let html='<div class="wdh"><div class="wdt"><span>'+esc(p.season.name)+'</span><em class="wdp '+(fail.length?'todo':'met')+'">'+(fail.length?'Not eligible yet':'Eligible')+'</em></div><div class="wdbal"><small>Eligible balance</small><b title="'+Number(e.units||0).toLocaleString('en-NG')+'">'+abbr(e.units||0)+'</b><u>units</u></div><div class="wdmeta"><span>Up to '+p.season.maxPayoutsPerSeason+' payout'+(Number(p.season.maxPayoutsPerSeason)===1?'':'s')+'</span>'+(p.season.endsAt?'<span>Season ends '+fd(p.season.endsAt)+'</span>':'')+'</div><div class="wdsum"><i style="width:'+pct+'%"></i></div><small class="wdsl">'+met+' of '+all.length+' requirements met</small></div>';
    if(fail.length) html+='<div class="sech"><b>Your requirements</b></div>'+rules+'<p class="wdnote">Still to do: '+fail.map(x=>esc(x.label.toLowerCase())).join(', ')+'. Complete these, then come back when a batch is open.</p>';
    else if(!start) html+='<div class="card2"><h3>Choose your first batch carefully</h3><p class="hint2">The three coconuts are a playful picker. We do not recommend a “best” batch. Your choice sets your future rotation.</p><div class="cocoPick"><button onclick="PH.pickBatch(1)">🥥<small>Batch 1</small></button><button onclick="PH.pickBatch(2)">🥥<small>Batch 2</small></button><button onclick="PH.pickBatch(3)">🥥<small>Batch 3</small></button></div></div>';
    else html+='<div class="sech"><b>Your requirements</b></div>'+rules+'<div class="card2"><h3>Ready to submit</h3><p class="hint2">You are eligible. Bind your bank details in AllConnect Pay, then submit during an open scheduled slot.</p><button class="btn p" onclick="PH.payoutBank()">'+(p.account&&p.account.bankBoundAt?'Review bank details':'Bind bank details')+'</button>'+slots+'</div>';
    b.innerHTML=NOTICE.html()+html;
  },
  payStatus(r){const L={submitted:'Waiting for review',held:'On hold while the team reviews it',approved:'Approved. Your payment is being sent by bank transfer',processing:'Being paid',paid:'Paid',rejected:'Not approved',rolled_over:'Rolled over to your next slot',failed:'Payment failed. Please contact support'};let t='Status: '+(L[r.status]||esc(r.status))+' · ₦'+Number(r.payoutAmount||0).toLocaleString('en-NG');if(r.status==='paid'&&r.reference)t+=' · ref '+esc(r.reference);if(r.status==='rejected'&&r.reason)t+=' · '+esc(r.reason);return t},
  async pickBatch(n){if(!confirm(`Choose Batch ${n}? This choice controls your future rotation.`))return;const bs=[...document.querySelectorAll('.cocoPick button')];bs.forEach(x=>x.disabled=true);let t=0;const spin=setInterval(()=>{bs.forEach((x,i)=>{x.style.transform=`rotate(${(t+i)*18}deg) scale(${1+((t+i)%2)*.06})`;x.style.opacity=((t+i)%3===0)?'.55':'1'});t++},70);setTimeout(async()=>{clearInterval(spin);bs.forEach(x=>{x.style.transform='';x.style.opacity='';});try{this.P=await NET.api('/api/ac/payouts/select-batch',{method:'POST',body:{batch:n}});this.payoutDraw()}catch(e){bs.forEach(x=>x.disabled=false);toast(e.message)}},850)},
  payoutBank(){const a=this.P&&this.P.account||{};this.view='payout-bank';this.shell('Bind bank details','PH.payouts()',`<div class="abody bk"><p class="hint2">Your bank details are used only for payout review. Confirm them carefully before submitting.</p><label class="lab2">BANK NAME<input class="sinput" id="poBank" value="${esc(a.bankName||'')}" placeholder="e.g. Access Bank"></label><label class="lab2">ACCOUNT NAME<input class="sinput" id="poName" value="${esc(a.accountName||'')}" placeholder="Name on the account"></label><label class="lab2">10-DIGIT ACCOUNT NUMBER<input class="sinput" id="poNum" inputmode="numeric" maxlength="10" placeholder="0123456789"></label><button class="btn p" onclick="PH.savePayoutBank()">Save bank details</button></div>`)},
  async savePayoutBank(){try{await NET.api('/api/ac/payouts/bank',{method:'POST',body:{bankName:document.getElementById('poBank').value,accountName:document.getElementById('poName').value,accountNumber:document.getElementById('poNum').value}});toast('Bank details saved ✓');this.payouts()}catch(e){toast(e.message)}},
  async submitPayout(slot){if(!confirm('Submit this withdrawal request? Your scheduled slot will be locked and the request will go to admin review.'))return;try{await NET.api('/api/ac/payouts/submit',{method:'POST',body:{slot,idempotencyKey:`${NET.user.id}:${this.P.season.id}:${slot}`}});toast('Withdrawal submitted ✓');this.payouts()}catch(e){toast(e.message)}},
  /* Deposit page (opened from the + next to the balance). Payments are not live yet. */
  deposit(){this.view='bank-d';this.shell('Deposit','PH.bank()',`<div class="abody bk"><div class="lab2">AMOUNT</div><div class="amt"><span>₦</span><input id="dpamt" inputmode="numeric" placeholder="0" oninput="PH.dpfmt()" autocomplete="off"></div>
      <div class="pre">${[1000,5000,10000,20000].map(n=>`<button onclick="PH.dppick(${n})">${n.toLocaleString('en-NG')}</button>`).join('')}</div>
      <div class="hint2">Current balance ${naira(S.cash,2)}</div>
      <button class="btn p" id="dpbtn" onclick="PH.dpgo()">Deposit now</button></div>`)},
  dpfmt(){const i=document.getElementById('dpamt'),n=parseInt(i.value.replace(/\D/g,''),10);i.value=Number.isFinite(n)?n.toLocaleString('en-NG'):''},
  dppick(n){const i=document.getElementById('dpamt');if(i)i.value=n.toLocaleString('en-NG')},
  dpgo(){const b=document.getElementById('dpbtn');if(b){b.textContent='Coming soon';setTimeout(()=>{const x=document.getElementById('dpbtn');if(x)x.textContent='Deposit now'},2200)}toast('Deposits are coming soon')},
  toggleBal(){this.hideBal=!this.hideBal;this.bankDraw()},
  bills(){this.view='bank-bills';this.shell('Bills','PH.bank()','<div class="abody bk"><div id="lgbills"><p class="empty">Loading…</p></div></div>');if(window.LAGOS)LAGOS.loadBills()},
  soon(){toast('Coming soon 🚧')},
  copy(t){const ok=()=>toast('Copied ✓');try{navigator.clipboard.writeText(t).then(ok,()=>this.copyOld(t,ok))}catch(e){this.copyOld(t,ok)}},
  copyOld(t,ok){const i=document.createElement('textarea');i.value=t;document.body.appendChild(i);i.select();try{document.execCommand('copy');ok()}catch(e){toast('Copy failed')}i.remove()},
  history(){this.view='bank-h';this.shell('Transactions','PH.bank()',`<div class="abody bk">${this.H.length?this.H.map(t=>this.txRow(t)).join(''):'<p class="empty">No transactions yet.</p>'}</div>`)},
  receive(){this.view='bank-r';const B=this.B;this.shell('Receive money','PH.bank()',`<div class="abody bk"><div class="rcv">${PH.av({avatar:(NET.user&&NET.user.avatar)||'',displayName:B.name},1)}<h3>${esc(B.name)}</h3><p>${B.username?'@'+esc(B.username):'Set a username in Settings'}</p>
      <div class="rid">${B.acNum}</div><button class="btn p" onclick="PH.copy('${B.acNum}')">Copy Account ID</button><p class="hint2" style="margin-top:12px">Share your Account ID (or @username) with another AllConnect player so they can send you money.</p></div></div>`)},
  /* ----- transfer ----- */
  xmenu(){this.xBack=null;this.view='bank-m';this.shell('Transfer','PH.bank()',`<div class="abody bk"><button class="opt" onclick="PH.xfer()"><span class="oi" style="background:var(--sfg)"><i class="fa-solid fa-crown"></i></span><div><b>To AllConnect User</b><small>Instant · Free · Needs Account ID</small></div><i>›</i></button>
      <button class="opt" onclick="PH.soon()"><span class="oi" style="background:var(--sf)"><i class="fa-solid fa-building-columns"></i></span><div><b>To Bank Account</b><small>Send to your bank app</small></div><em class="soonb">Coming soon</em></button></div>`)},
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
  pinMenu(){this.sheet(`<h3>Payment PIN</h3><p class="hint2">${this.B.hasPin?'Your 4-digit PIN protects every transfer.':'Create a 4-digit PIN to start sending money.'}</p><button class="fopt" onclick="PH.closeSheet();PH.${this.B.hasPin?'changePin':'setPinFlow'}()"><span>${this.B.hasPin?'🔄 Change PIN':'<i class="fa-solid fa-lock"></i> Set PIN'}</span></button>`)},
  async setPinFlow(next,cur){const a=await this.askPin(cur?'New payment PIN':'Create payment PIN','Choose a 4-digit PIN');if(!a)return;const b=await this.askPin('Confirm payment PIN','Enter it again');if(!b)return;
    if(a!==b)return toast('PINs do not match. Try again');
    try{await NET.api('/api/ac/bank/pin',{method:'POST',body:{pin:a,current:cur||''}});this.B.hasPin=true;toast('Payment PIN saved ✓');if(next)next();else if(this.view==='bank')this.bankDraw()}catch(e){toast(e.message)}},
  async changePin(){const cur=await this.askPin('Current PIN','Enter your current payment PIN');if(!cur)return;this.setPinFlow(null,cur)},
  askPin(title,sub){return new Promise(res=>{let v='';const ov=document.createElement('div');ov.className='asheet';
    ov.innerHTML=`<div class="shcard pinpad"><button class="px"><i class="fa-solid fa-xmark"></i></button><h3>${title}</h3><p class="hint2">${sub||''}</p><div class="dots">${'<i></i>'.repeat(4)}</div><div class="keys">${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k=>`<button data-k="${k}">${k}</button>`).join('')}</div></div>`;
    this.$a().appendChild(ov);const dots=[...ov.querySelectorAll('.dots i')];
    const done=val=>{document.removeEventListener('keydown',kd,true);ov.remove();res(val)};
    const press=k=>{if(k==='⌫')v=v.slice(0,-1);else if(/^\d$/.test(k)&&v.length<4)v+=k;dots.forEach((d,i)=>d.classList.toggle('f',i<v.length));if(v.length===4)setTimeout(()=>done(v),130)};
    const kd=e=>{if(e.key==='Escape'){e.stopPropagation();done(null)}else if(e.key==='Backspace')press('⌫');else if(/^\d$/.test(e.key))press(e.key)};
    document.addEventListener('keydown',kd,true);
    ov.querySelector('.keys').onclick=e=>{const k=e.target.closest('button');if(k)press(k.dataset.k)};ov.querySelector('.px').onclick=()=>done(null);ov.onclick=e=>{if(e.target===ov)done(null)}})}
});
