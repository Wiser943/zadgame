/* AllConnect Police app. Your record, report a player, and the Support page (moved here from Settings).
   TODO: put your real support contacts below. */
const SUPPORT_EMAIL='support@gamehub.example',SUPPORT_WHATSAPP='https://wa.me/10000000000';
const POL={
  rec:null,
  async open(){
    PH.view='police';
    PH.shell('Police','PH.close()',`<div class="abody" id="ab">${this.body(null)}</div>`);
    try{this.rec=await NET.api('/api/ac/police/status')}catch(e){this.rec=null}
    if(PH.view==='police'){const ab=document.getElementById('ab');if(ab){const keep=this.keep();ab.innerHTML=this.body(this.rec);this.restore(keep)}}
  },
  keep(){const g=i=>(document.getElementById(i)||{}).value||'';return{u:g('pol_u'),d:g('pol_d')}},
  restore(k){const u=document.getElementById('pol_u'),d=document.getElementById('pol_d');if(u)u.value=k.u;if(d)d.value=k.d;this.check()},
  banner(r){
    const s={clean:['Clean record 😇','linear-gradient(135deg,#1d4ed8,#1e1b6b)'],watch:['Under watch 👀','linear-gradient(135deg,#b45309,#7c2d12)'],wanted:['Wanted 🚨','linear-gradient(135deg,#b91c1c,#4c0519)']}[(r&&r.record)||'clean'];
    return `<div class="polban" style="background:${s[1]}"><span class="polcar">🚓</span><b>Eko Police Division</b><em>${s[0]}</em></div>`},
  body(r){
    const n=r&&r.open||0;
    return `${this.banner(r)}
      <div class="polcard"><b>🕵🏾 ${n?`${n} open report${n>1?'s':''} on you`:'No EFCC file on you'}</b>
        <p>${n?'Other players have reported you. Our team reviews every report, so play fair and keep chats friendly.':'The EFCC notices sudden wealth and big spending, and sometimes digs into past crimes. A raid only ever takes cash (never what you topped up).'}</p></div>
      <div class="polcard"><b>📝 Report someone to the police</b>
        <p>For crimes in the game, like a robbery. Robbing gets riskier for whoever the police have reports on. For harassment or anything real, use ⚑ Report on their profile.</p>
        <input class="sinput" id="pol_u" placeholder="@username" maxlength="17" autocapitalize="none" autocomplete="off" oninput="POL.check()">
        <input class="sinput" id="pol_d" placeholder="What happened? (optional)" maxlength="200" autocomplete="off">
        <div class="aerr" id="pol_e"></div>
        <button class="btn p" id="pol_b" disabled onclick="POL.file()">File the report</button></div>
      <div class="lab2">HELP &amp; SUPPORT</div>
      <p class="hint2">Stuck on a match, spotted a bug, or something about your ₦ balance looks off? Reach us directly:</p>
      <div class="sgrp"><a class="trow" href="mailto:${SUPPORT_EMAIL}"><span class="ti">✉️</span><span class="tl">Email support</span><span class="chv">›</span></a><a class="trow" href="${SUPPORT_WHATSAPP}" target="_blank" rel="noopener"><span class="ti">💬</span><span class="tl">Chat on WhatsApp</span><span class="chv">›</span></a></div>
      <div class="lab2">COMMON QUESTIONS</div><div class="sgrp">${PH.faq('My ₦ didn’t update after a match.','The stake is taken when a match starts and the winner is paid the moment it ends (a draw pays nobody, and bot matches never touch your ₦). If your balance still looks wrong after reopening the app, tell us the room code in a support message.')}${PH.faq('A match seems frozen.','Leave the room and rejoin with the same code — most stalls clear up on reconnect. If it keeps happening, it’s worth reporting.')}${PH.faq('My profile photo won’t show.','Try re-uploading it from Settings → Edit. Very large photos can occasionally fail to save.')}${PH.faq('I got removed from a Ludo match.','Three missed turns (not rolling, or not picking a token within 15s) removes you from that room and forfeits your stake for that match.')}${PH.faq('My transfer didn’t go through.','Check your Account ID and payment PIN. Daily and per-transfer limits apply in AllConnect Pay.')}${PH.faq('My camera photo did not save.','Check you allowed camera access and that you are online. Failed shots show a retry button in the Camera app.')}</div>`},
  check(){const v=((document.getElementById('pol_u')||{}).value||'').trim().replace(/^@/,'').toLowerCase(),b=document.getElementById('pol_b');if(b)b.disabled=!/^[a-z0-9_]{3,16}$/.test(v)},
  async file(){
    const u=document.getElementById('pol_u'),d=document.getElementById('pol_d'),e=document.getElementById('pol_e'),b=document.getElementById('pol_b');if(!u)return;
    e.textContent='';b.disabled=true;b.textContent='Filing…';
    try{await NET.api('/api/ac/police/report',{method:'POST',body:{username:u.value,details:d.value}});u.value='';d.value='';toast('Report filed. Thank you 🙏🏾')}
    catch(x){e.textContent=x.message}
    b.textContent='File the report';this.check()}
};

window.POL = POL;
