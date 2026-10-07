/* AllConnect Settings app. Everything that used to be on GameHub's profile/settings screen lives here now:
   profile edit, socials, tutorial, about, legal, shop, sound/theme/accessibility toggles, voice, language, log out.
   GameHub preferences are stored in the same localStorage key ('ghPrefs'), so the game picks changes up live. */
const SOCIALS=[['💬','WhatsApp Community','https://wa.me/10000000000'],['✖','X (Twitter)','https://twitter.com/'],['📸','Instagram','https://instagram.com/'],['🎧','Discord','https://discord.gg/']];
const GP_DEF={theme:'light',music:true,sound:true,vibration:true,voice:true,lowPower:false,reducedMotion:false,highContrast:false,largeText:false,colorSafe:false,winnerReplay:true,voiceCmd:false,voiceURI:'',voiceRate:1,lang:''};
const GP={
  get(){try{return Object.assign({},GP_DEF,JSON.parse(localStorage.getItem('ghPrefs')||'{}'))}catch(e){return Object.assign({},GP_DEF)}},
  set(k,v){const p=this.get();p[k]=v;try{localStorage.setItem('ghPrefs',JSON.stringify(p))}catch(e){}
    try{const w=document.getElementById('hubf').contentWindow;if(w&&w.GHBridge)w.GHBridge.sync()}catch(e){}}
};
/* Sound / display toggles, grouped. Only what players actually need. */
const FX_SOUND=[['music','Music','🎵'],['sound','Game sound','🔊'],['voice','Voice announcements','📣'],['vibration','Vibration','📳']];
const FX_LOOK=[['theme','Dark mode','🌙'],['lowPower','Saver mode · less data, no background loading','🔋'],['reducedMotion','Reduce animations','🐢'],['largeText','Larger text','🔠'],['highContrast','High contrast','◐'],['colorSafe','Colour-blind friendly','🎨']];
const FALLBACK_RULES={};
Object.assign(PH,{
  me:null,
  trow(k,label,ic,on){return `<button class="trow" data-k="${k}" onclick="PH.tgl('${k}')"><span class="ti">${ic}</span><span class="tl">${label}</span><span class="sw2 ${on?'on':''}"><i></i></span></button>`},
  lrow(label,ic,fn,extra){return `<button class="trow" onclick="${fn}"><span class="ti">${ic}</span><span class="tl">${label}</span>${extra||'<span class="chv">›</span>'}</button>`},
  isOn(k,p){return k==='theme'?p.theme==='dark':!!p[k]},
  tgl(k){const p=GP.get(),on=!this.isOn(k,p);GP.set(k,k==='theme'?(on?'dark':'light'):on);
    const el=document.querySelector(`.trow[data-k="${k}"] .sw2`);if(el)el.classList.toggle('on',on);
    if(k==='vibration'&&on&&navigator.vibrate)navigator.vibrate(30);
    if(k==='music'||k==='lowPower'){if(window.BGM)BGM.sync()}
    if(window.refreshMute)refreshMute();
    if(k==='lowPower')on?toast('Saver mode on: nothing loads in the background'):(toast('Saver mode off: loading apps in the background'),warmUp(true))},
  async settings(){this.view='settings';document.querySelector('.screen').classList.add('light');
    const p=GP.get(),u=Object.assign({},NET.user||{},this.me||{}),np='Notification' in window?Notification.permission:'unsupported';
    const auto=this.me?this.me.autoPostWins!==false:true;
    this.shell('Settings','PH.close()',`<div class="abody">
      <div class="swho tap" onclick="GIST.openProfile('me',()=>PH.settings())"><div id="swav">${this.av({avatar:u.avatar,displayName:u.displayName,username:u.username},1)}</div><div class="rt"><b>${esc(u.displayName||'Player')}${this.vb(u)}</b><span>${u.username?'@'+esc(u.username):'Tap to see your profile'}</span></div><button class="pbtn blu" onclick="event.stopPropagation();PH.editProfile()">Edit ✎</button></div>
      <div class="lab2">ACCOUNT</div><div class="sgrp">${this.lrow('Edit profile · photo, cover, name, @username, bio','👤',"PH.editProfile()")}
        <div class="trow"><span class="ti">🔔</span><span class="tl">Message alerts</span>${np==='granted'?'<b class="okc">On</b>':np==='unsupported'?'<b>Not supported</b>':`<button class="pbtn blu" onclick="PH.notifOn();setTimeout(()=>PH.settings(),800)">Turn on</button>`}</div>
        <button class="trow" data-k="autoPost" onclick="PH.tglAuto()"><span class="ti">🏆</span><span class="tl">Auto-post my match wins</span><span class="sw2 ${auto?'on':''}"><i></i></span></button></div>
      <div class="lab2">SOUND</div><div class="sgrp">${FX_SOUND.map(f=>this.trow(f[0],f[1],f[2],this.isOn(f[0],p))).join('')}</div>
      <div class="lab2">DISPLAY</div><div class="sgrp">${FX_LOOK.map(f=>this.trow(f[0],f[1],f[2],this.isOn(f[0],p))).join('')}
        <label class="trow"><span class="ti">🌐</span><span class="tl">Language</span><select class="ssel" onchange="PH.setPref('lang',this.value)"><option value="" ${p.lang?'':'selected'}>Auto</option><option value="en" ${p.lang==='en'?'selected':''}>English</option><option value="fr" ${p.lang==='fr'?'selected':''}>Français</option></select></label></div>
      <div class="lab2">SHOP</div><div class="sgrp">${this.lrow('Backgrounds, boards, tokens & announcers','🏆',"openHub(b=>b.shop())")}</div>
      <div class="lab2">HELP</div><div class="sgrp">${this.lrow('Game tutorial','🎓',"PH.sub('tutorial')")}${this.lrow('Join our socials','📣',"PH.sub('socials')")}${this.lrow('About us','ℹ️',"PH.sub('about')")}${this.lrow('Legal','⚖️',"PH.sub('legal')")}</div>
      <button class="fopt red out" onclick="logout()"><span>Log out</span></button><p class="ver">AllConnect 1.1 · GameHub 1.0.10141</p></div>`);
    if(!this.me){try{this.me=(await NET.api('/api/me')).user;if(this.view==='settings')this.settings()}catch(e){}}},
  setPref(k,v){GP.set(k,v)},
  tglAuto(){const on=!(this.me?this.me.autoPostWins!==false:true);if(this.me)this.me.autoPostWins=on;const el=document.querySelector('.trow[data-k="autoPost"] .sw2');if(el)el.classList.toggle('on',on);
    NET.api('/api/me/profile',{method:'POST',body:{autoPostWins:on}}).catch(e=>{toast(e.message);if(this.me)this.me.autoPostWins=!on;if(el)el.classList.toggle('on',!on)})},
  /* ----- edit profile: ONE screen for photo, cover, name, @username and bio ----- */
  editProfile(back){this.view='settings-edit';this.editBack=back||this.editBack||'PH.settings()';const u=Object.assign({},NET.user||{},this.me||{});
    this.shell('Edit profile',this.editBack==='PH.settings()'?'PH.settings()':this.editBack,`<div class="abody"><div class="pedit">
      <div class="pecover" id="pecov" ${u.cover?`style="background-image:url('${esc(u.cover)}')"`:''}><label class="pbtn blu pick">🖼️ Cover<input type="file" accept="image/*" style="display:none" onchange="PH.pickCover(this)"></label></div>
      <div id="pedav">${this.av({avatar:u.avatar,displayName:u.displayName,username:u.username},1).replace('class="avi big"','class="avi huge"')}</div>
      <label class="pbtn blu pick">📷 Change photo<input type="file" accept="image/*" style="display:none" onchange="PH.pickPhoto(this)"></label></div>
      <div class="lab2">DISPLAY NAME</div><input id="dname" class="sinput" value="${esc(u.displayName||'')}" maxlength="40" placeholder="Your name">
      <div class="lab2">USERNAME</div><div class="cin2"><span class="at">@</span><input id="uname_in" class="sinput" value="${esc(u.username||'')}" placeholder="yourname" maxlength="16" autocapitalize="none" autocomplete="off"></div><p class="hint2">3–16 letters, numbers or _. Friends find you with this.</p>
      <div class="lab2">BIO</div><textarea id="bio_in" class="gedit" maxlength="160" placeholder="Tell people about yourself (160 characters)">${esc(u.bio||'')}</textarea>
      <div class="aerr" id="uerr"></div><button class="btn p" id="pesave" onclick="PH.saveProfile()">Save changes</button></div>`);
    if(!this.me)NET.api('/api/me').then(r=>{this.me=r.user;if(this.view==='settings-edit'&&!document.getElementById('bio_in').value)this.editProfile()}).catch(()=>{})},
  resize(file,max=480,q=.82){return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);let w=img.width,h=img.height;if(w>h&&w>max){h=h/w*max;w=max}else if(h>max){w=w/h*max;h=max}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);res(c.toDataURL('image/jpeg',q))};img.onerror=rej;img.src=url})},
  resizeCover(file){return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);const W=900,H=300,c=document.createElement('canvas');c.width=W;c.height=H;const r=Math.max(W/img.width,H/img.height),w=img.width*r,h=img.height*r;c.getContext('2d').drawImage(img,(W-w)/2,(H-h)/2,w,h);res(c.toDataURL('image/jpeg',.8))};img.onerror=rej;img.src=url})},
  after(r){this.me=Object.assign(this.me||{},r.user);Object.assign(NET.user,{avatar:r.user.avatar,displayName:r.user.displayName,bio:r.user.bio,cover:r.user.cover});NET.drop('/gist/profile');NET.drop('/api/me')},
  async pickPhoto(inp){const f=inp.files[0];if(!f)return;if(!f.type.startsWith('image/'))return toast('Please choose an image file.');
    try{const d=await this.resize(f);const r=await NET.api('/api/me/profile',{method:'POST',body:{avatar:d}});this.after(r);
      document.getElementById('pedav').innerHTML=this.av(this.me,1).replace('class="avi big"','class="avi huge"');toast('Photo updated ✓');this.hubRefresh()}catch(e){toast(e.message||'Could not upload photo')}},
  async pickCover(inp){const f=inp.files[0];if(!f)return;if(!f.type.startsWith('image/'))return toast('Please choose an image file.');
    try{const d=await this.resizeCover(f);const r=await NET.api('/api/me/profile',{method:'POST',body:{cover:d}});this.after(r);document.getElementById('pecov').style.backgroundImage=`url('${d}')`;toast('Cover updated ✓')}catch(e){toast(e.message||'Could not upload cover')}},
  async saveProfile(){const b=document.getElementById('pesave'),err=document.getElementById('uerr');err.textContent='';
    const name=document.getElementById('dname').value.trim(),bio=document.getElementById('bio_in').value,un=document.getElementById('uname_in').value.trim().replace(/^@/,'').toLowerCase();
    if(!name)return err.textContent='Enter a display name.';b.disabled=true;
    try{const r=await NET.api('/api/me/profile',{method:'POST',body:{displayName:name,bio}});this.after(r);
      if(un&&un!==(NET.user.username||'')){const x=await NET.api('/api/ac/username',{method:'POST',body:{username:un}});NET.user.username=x.username;this.me.username=x.username}
      ['uname','uname2'].forEach(i=>{const e=document.getElementById(i);if(e)e.textContent=name});this.hubRefresh();toast('Profile saved ✓');
      const back=this.editBack;this.editBack=null;back==='PH.settings()'?this.settings():(new Function(back))()}catch(e){err.textContent=e.message||'Could not save'}b.disabled=false},
  hubRefresh(){try{const w=document.getElementById('hubf').contentWindow;if(w&&w.GHBridge&&w.GHBridge.ready())w.GHBridge.refreshMe()}catch(e){}},
  /* ----- info pages ----- */
  sub(name){this.view='settings-'+name;const T={socials:'Join our Socials',tutorial:'Game Tutorial',about:'About Us',legal:'Legal'}[name];
    this.shell(T,'PH.settings()',`<div class="abody" id="ab">${this.subBody(name)}</div>`);if(name==='tutorial')this.loadRules()},
  faq(q,a){return `<div class="faq"><b>${esc(q)}</b><p>${esc(a)}</p></div>`},
  subBody(n){
    if(n==='socials')return `<p class="hint2">Follow along for updates, and hang out with other players.</p><div class="sgrp">${SOCIALS.map(s=>`<a class="trow" href="${esc(s[2])}" target="_blank" rel="noopener"><span class="ti">${s[0]}</span><span class="tl">${esc(s[1])}</span><span class="chv">›</span></a>`).join('')}</div>`;
    if(n==='tutorial')return `<div class="lab2">GETTING STARTED</div><div class="sgrp"><ul class="tut"><li>Open GameHub on the phone, pick a game, then Quick match, Create a room, or join with a code.</li><li>Share your room code so a friend can jump straight into your room.</li><li>Win matches to earn coins — your total sits at the top of the lobby.</li><li>Use the emote bar during a match to react without typing.</li><li>Tap any player's avatar in a match to see their profile and stats.</li></ul></div><div id="rules"><p class="empty">Loading game rules…</p></div>`;
    if(n==='about')return `<div class="sgrp"><div class="faq"><p style="margin-top:0">AllConnect is one account for a whole Lagos world: live your life in the city, chat with friends, send money with AllConnect Pay, and play real-time games in GameHub.</p><p>GameHub is a for-fun multiplayer arcade — quick matches of Connect Four, Rock Paper Scissors, Snakes &amp; Ladders, Word Clash and more with friends, right in the browser. Coins track bragging rights across matches.</p><p style="color:var(--mut)">Built with Node.js, Socket.IO and a lot of care for snappy, mobile-first play.</p></div></div>`;
    return `<div class="lab2">TERMS OF SERVICE</div><div class="sgrp"><div class="faq"><p>By using AllConnect and GameHub you agree to play fair, keep your account to yourself, and treat other players with respect. Coins and ₦ earned in-game have no cash value and can’t be withdrawn, exchanged for real money, or sold.</p><p>We can suspend accounts that cheat, abuse other players, or interfere with the service. Features, games and rules may change as the app evolves.</p></div></div>
      <div class="lab2">PRIVACY POLICY</div><div class="sgrp"><div class="faq"><p>We store your account details (name, email or phone, avatar), friends, private chats, match history and balances to run the apps. We don’t sell your data or show ads.</p><p>Your photo, if hosted externally, is publicly reachable by anyone with the link — don’t upload anything you’d rather keep private.</p></div></div>
      <p class="hint2" style="text-align:center">This is a starting template, not legal advice — have it reviewed before relying on it.</p>`},
  async loadRules(){let games=[];try{games=(await NET.api('/api/games')).games||[]}catch(e){}const el=document.getElementById('rules');if(!el)return;
    el.innerHTML=games.filter(g=>Array.isArray(g.rules)&&g.rules.length).map(g=>`<div class="lab2">${esc(String(g.name||g.key).toUpperCase())}</div><div class="sgrp"><ul class="tut">${g.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`).join('')||'<p class="empty">Rules appear here once games load.</p>'}
});
