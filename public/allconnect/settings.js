/* AllConnect Settings app. Everything that used to be on GameHub's profile/settings screen lives here now:
   profile edit, support, socials, tutorial, about, legal, shop, sound/theme/accessibility toggles, voice, language, log out.
   GameHub preferences are stored in the same localStorage key ('ghPrefs'), so the game picks changes up live. */
const SUPPORT_EMAIL='support@gamehub.example',SUPPORT_WHATSAPP='https://wa.me/10000000000';   // TODO: put your real contacts here
const SOCIALS=[['💬','WhatsApp Community','https://wa.me/10000000000'],['✖','X (Twitter)','https://twitter.com/'],['📸','Instagram','https://instagram.com/'],['🎧','Discord','https://discord.gg/']];
const GP_DEF={theme:'light',music:true,sound:true,vibration:true,voice:true,lowPower:false,reducedMotion:false,highContrast:false,largeText:false,colorSafe:false,winnerReplay:true,voiceCmd:false,voiceURI:'',voiceRate:1,lang:''};
const GP={
  get(){try{return Object.assign({},GP_DEF,JSON.parse(localStorage.getItem('ghPrefs')||'{}'))}catch(e){return Object.assign({},GP_DEF)}},
  set(k,v){const p=this.get();p[k]=v;try{localStorage.setItem('ghPrefs',JSON.stringify(p))}catch(e){}
    try{const w=document.getElementById('hubf').contentWindow;if(w&&w.GHBridge)w.GHBridge.sync()}catch(e){}}
};
const FX=[['music','Music','🎵'],['sound','Game Sound','🔊'],['voice','Voice Announcements','📣'],['vibration','Vibration','📳'],['theme','Dark Mode','🌙'],['reducedMotion','Reduce Animations','🐢'],['highContrast','High contrast','◐'],['largeText','Larger text','🔠'],['colorSafe','Colour-blind friendly colours','🎨'],['lowPower','Low-power mode','🔋'],['winnerReplay','Cinematic winner highlights','🏆']];
const FALLBACK_RULES={};
Object.assign(PH,{
  me:null,
  trow(k,label,ic,on){return `<button class="trow" data-k="${k}" onclick="PH.tgl('${k}')"><span class="ti">${ic}</span><span class="tl">${label}</span><span class="sw2 ${on?'on':''}"><i></i></span></button>`},
  lrow(label,ic,fn,extra){return `<button class="trow" onclick="${fn}"><span class="ti">${ic}</span><span class="tl">${label}</span>${extra||'<span class="chv">›</span>'}</button>`},
  isOn(k,p){return k==='theme'?p.theme==='dark':!!p[k]},
  tgl(k){const p=GP.get(),on=!this.isOn(k,p);GP.set(k,k==='theme'?(on?'dark':'light'):on);
    const el=document.querySelector(`.trow[data-k="${k}"] .sw2`);if(el)el.classList.toggle('on',on);
    if(k==='vibration'&&on&&navigator.vibrate)navigator.vibrate(30)},
  async settings(){this.view='settings';document.querySelector('.screen').classList.add('light');
    const p=GP.get(),u=this.me||NET.user||{},np='Notification' in window?Notification.permission:'unsupported';
    const voices=('speechSynthesis' in window)?speechSynthesis.getVoices().slice().sort((a,b)=>(/^en/i.test(b.lang)?1:0)-(/^en/i.test(a.lang)?1:0)||a.name.localeCompare(b.name)):[];
    this.shell('Settings','PH.close()',`<div class="abody">
      <div class="swho"><div id="swav">${this.av({avatar:u.avatar,displayName:u.displayName,username:u.username},1)}</div><div class="rt"><b>${esc(u.displayName||'Player')}</b><span>${esc(u.email||u.phone||(NET.user&&NET.user.username?'@'+NET.user.username:''))}</span></div><button class="pbtn blu" onclick="PH.editProfile()">Edit ✎</button></div>
      <div class="lab2">GENERAL</div><div class="sgrp">${this.lrow('Chat Support','💬',"PH.sub('support')")}${this.lrow('Join our Socials','📣',"PH.sub('socials')")}${this.lrow('Game Tutorial','🎓',"PH.sub('tutorial')")}${this.lrow('About Us','ℹ️',"PH.sub('about')")}${this.lrow('Legal','⚖️',"PH.sub('legal')")}</div>
      <div class="lab2">THEMES</div><div class="sgrp">${this.lrow('Shop · backgrounds, boards & tokens','🏆',"openHub(b=>b.shop())")}</div>
      <div class="lab2">EFFECTS</div><div class="sgrp">${FX.map(f=>this.trow(f[0],f[1],f[2],this.isOn(f[0],p))).join('')}
        <label class="trow"><span class="ti">🌐</span><span class="tl">Language</span><select class="ssel" onchange="PH.setPref('lang',this.value)"><option value="" ${p.lang?'':'selected'}>Auto</option><option value="en" ${p.lang==='en'?'selected':''}>English</option><option value="fr" ${p.lang==='fr'?'selected':''}>Français</option></select></label>
        ${this.lrow('Replay the app tour','🧭',"openHub(b=>b.replayTour())")}</div>
      <div class="lab2">VOICE</div><div class="sgrp">${this.trow('voiceCmd','Voice commands · “Say” button in rooms','🎙️',!!p.voiceCmd)}
        <label class="trow"><span class="ti">🗣️</span><span class="tl">Voice</span><select class="ssel" onchange="PH.setPref('voiceURI',this.value)"><option value="">Auto (best available)</option>${voices.map(v=>`<option value="${esc(v.voiceURI)}" ${v.voiceURI===p.voiceURI?'selected':''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select></label>
        <label class="trow"><span class="ti">⏱️</span><span class="tl">Speed</span><input type="range" class="srange" min="0.7" max="1.3" step="0.05" value="${p.voiceRate||1}" onchange="PH.setPref('voiceRate',+this.value)"></label>
        ${this.lrow('Test announcer','🔈',"PH.testVoice()")}${this.lrow('Get more announcer styles','🏆',"openHub(b=>b.shop(true))")}</div>
      <div class="lab2">USERNAME</div><div class="card2"><p class="hint2">Friends find you with this. Use 3–16 letters, numbers or _.</p>
        <div class="cin2"><span class="at">@</span><input id="uname_in" value="${esc((NET.user&&NET.user.username)||'')}" placeholder="yourname" maxlength="16" autocapitalize="none" autocomplete="off"><button class="pbtn blu" onclick="PH.saveName()">Save</button></div><div class="aerr" id="uerr"></div></div>
      <div class="lab2">NOTIFICATIONS</div><div class="sgrp"><div class="trow"><span class="ti">🔔</span><span class="tl">Message alerts</span>${np==='granted'?'<b class="okc">On</b>':np==='unsupported'?'<b>Not supported</b>':`<button class="pbtn blu" onclick="PH.notifOn();setTimeout(()=>PH.settings(),800)">Turn on</button>`}</div></div>
      <button class="fopt red out" onclick="logout()"><span>Log out</span></button><p class="ver">AllConnect 1.0 · GameHub 1.0.10141</p></div>`);
    if(!this.me){try{this.me=(await NET.api('/api/me')).user;if(this.view==='settings')this.settings()}catch(e){}}},
  setPref(k,v){GP.set(k,v)},
  testVoice(){hubQuiet(b=>b.say('doubleSix'));toast('Playing the announcer…')},
  async saveName(){const v=document.getElementById('uname_in').value,e=document.getElementById('uerr');e.textContent='';
    try{const r=await NET.api('/api/ac/username',{method:'POST',body:{username:v}});NET.user.username=r.username;toast('Username saved ✓')}catch(x){e.textContent=x.message}},
  /* ----- edit profile (photo + name) ----- */
  editProfile(){this.view='settings-edit';const u=this.me||NET.user||{};
    this.shell('Edit profile','PH.settings()',`<div class="abody"><div class="pedit"><div id="pedav">${this.av({avatar:u.avatar,displayName:u.displayName,username:u.username},1).replace('class="avi big"','class="avi huge"')}</div>
      <label class="pbtn blu pick">📷 Change photo<input type="file" accept="image/*" style="display:none" onchange="PH.pickPhoto(this)"></label></div>
      <div class="lab2">DISPLAY NAME</div><div class="cin2"><input id="dname" class="sinput" value="${esc(u.displayName||'')}" maxlength="40" placeholder="Your name"><button class="pbtn blu" onclick="PH.saveDisplay()">Save</button></div></div>`)},
  resize(file,max=480,q=.82){return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);let w=img.width,h=img.height;if(w>h&&w>max){h=h/w*max;w=max}else if(h>max){w=w/h*max;h=max}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);res(c.toDataURL('image/jpeg',q))};img.onerror=rej;img.src=url})},
  async pickPhoto(inp){const f=inp.files[0];if(!f)return;if(!f.type.startsWith('image/'))return toast('Please choose an image file.');
    try{const d=await this.resize(f);const r=await NET.api('/api/me/profile',{method:'POST',body:{avatar:d}});this.me=Object.assign(this.me||{},r.user);NET.user.avatar=r.user.avatar;
      document.getElementById('pedav').innerHTML=this.av(this.me,1).replace('class="avi big"','class="avi huge"');toast('Photo updated ✓');this.hubRefresh()}catch(e){toast(e.message||'Could not upload photo')}},
  async saveDisplay(){const n=document.getElementById('dname').value.trim();if(!n)return toast('Enter a name first');
    try{const r=await NET.api('/api/me/profile',{method:'POST',body:{displayName:n}});this.me=Object.assign(this.me||{},r.user);NET.user.displayName=r.user.displayName;
      ['uname','uname2'].forEach(i=>{const e=document.getElementById(i);if(e)e.textContent=r.user.displayName});toast('Name updated ✓');this.hubRefresh()}catch(e){toast(e.message||'Could not update name')}},
  hubRefresh(){try{const w=document.getElementById('hubf').contentWindow;if(w&&w.GHBridge&&w.GHBridge.ready())w.GHBridge.refreshMe()}catch(e){}},
  /* ----- info pages ----- */
  sub(name){this.view='settings-'+name;const T={support:'Chat Support',socials:'Join our Socials',tutorial:'Game Tutorial',about:'About Us',legal:'Legal'}[name];
    this.shell(T,'PH.settings()',`<div class="abody" id="ab">${this.subBody(name)}</div>`);if(name==='tutorial')this.loadRules()},
  faq(q,a){return `<div class="faq"><b>${esc(q)}</b><p>${esc(a)}</p></div>`},
  subBody(n){
    if(n==='support')return `<p class="hint2">Stuck on a match, spotted a bug, or something about your coins or ₦ looks off? Reach us directly:</p><div class="sgrp"><a class="trow" href="mailto:${SUPPORT_EMAIL}"><span class="ti">✉️</span><span class="tl">Email support</span><span class="chv">›</span></a><a class="trow" href="${SUPPORT_WHATSAPP}" target="_blank" rel="noopener"><span class="ti">💬</span><span class="tl">Chat on WhatsApp</span><span class="chv">›</span></a></div>
      <div class="lab2">COMMON QUESTIONS</div><div class="sgrp">${this.faq('My coins didn’t update after a match.','Coins post right when a match ends. If you still don’t see them after reopening the app, tell us the room code in a support message.')}${this.faq('A match seems frozen.','Leave the room and rejoin with the same code — most stalls clear up on reconnect. If it keeps happening, it’s worth reporting.')}${this.faq('My profile photo won’t show.','Try re-uploading it from Settings → Edit. Very large photos can occasionally fail to save.')}${this.faq('I got removed from a Ludo match.','Three missed turns (not rolling, or not picking a token within 15s) removes you from that room and forfeits your stake for that match.')}${this.faq('My transfer didn’t go through.','Check your Account ID and payment PIN. Daily and per-transfer limits apply in AllConnect Pay.')}</div>`;
    if(n==='socials')return `<p class="hint2">Follow along for updates, and hang out with other players.</p><div class="sgrp">${SOCIALS.map(s=>`<a class="trow" href="${esc(s[2])}" target="_blank" rel="noopener"><span class="ti">${s[0]}</span><span class="tl">${esc(s[1])}</span><span class="chv">›</span></a>`).join('')}</div>`;
    if(n==='tutorial')return `<div class="lab2">GETTING STARTED</div><div class="sgrp"><ul class="tut"><li>Open GameHub on the phone, pick a game, then Quick match, Create a room, or join with a code.</li><li>Share your room code so a friend can jump straight into your room.</li><li>Win matches to earn coins — your total sits at the top of the lobby.</li><li>Use the emote bar during a match to react without typing.</li><li>Tap any player's avatar in a match to see their profile and stats.</li></ul></div><div id="rules"><p class="empty">Loading game rules…</p></div>`;
    if(n==='about')return `<div class="sgrp"><div class="faq"><p style="margin-top:0">AllConnect is one account for a whole Lagos world: live your life in the city, chat with friends, send money with AllConnect Pay, and play real-time games in GameHub.</p><p>GameHub is a for-fun multiplayer arcade — quick matches of Connect Four, Rock Paper Scissors, Snakes &amp; Ladders, Word Clash and more with friends, right in the browser. Coins track bragging rights across matches.</p><p style="color:var(--mut)">Built with Node.js, Socket.IO and a lot of care for snappy, mobile-first play.</p></div></div>`;
    return `<div class="lab2">TERMS OF SERVICE</div><div class="sgrp"><div class="faq"><p>By using AllConnect and GameHub you agree to play fair, keep your account to yourself, and treat other players with respect. Coins and ₦ earned in-game have no cash value and can’t be withdrawn, exchanged for real money, or sold.</p><p>We can suspend accounts that cheat, abuse other players, or interfere with the service. Features, games and rules may change as the app evolves.</p></div></div>
      <div class="lab2">PRIVACY POLICY</div><div class="sgrp"><div class="faq"><p>We store your account details (name, email or phone, avatar), friends, private chats, match history and balances to run the apps. We don’t sell your data or show ads.</p><p>Your photo, if hosted externally, is publicly reachable by anyone with the link — don’t upload anything you’d rather keep private.</p></div></div>
      <p class="hint2" style="text-align:center">This is a starting template, not legal advice — have it reviewed before relying on it.</p>`},
  async loadRules(){let games=[];try{games=(await NET.api('/api/games')).games||[]}catch(e){}const el=document.getElementById('rules');if(!el)return;
    el.innerHTML=games.filter(g=>Array.isArray(g.rules)&&g.rules.length).map(g=>`<div class="lab2">${esc(String(g.name||g.key).toUpperCase())}</div><div class="sgrp"><ul class="tut">${g.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`).join('')||'<p class="empty">Rules appear here once games load.</p>'}
});
