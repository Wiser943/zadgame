/* P-Gist: the AllConnect social feed. Text, photos (own gallery / platform gallery / device), game links,
   likes, comments, follows, profiles and reshares. API: /api/ac/gist/* */
const GIST={
  tab:'all',F:{all:{p:[],more:false,ok:false},following:{p:[],more:false,ok:false}},C:null,stack:[],cur:null,cache:new Map(),
  pk:{tab:'mine',mine:null,plat:null,busy:false},games:null,
  api(u,o){return NET.api('/api/ac/gist'+u,o)},
  uid(){return (NET.user&&NET.user.id)||'me'},
  put(list){(list||[]).forEach(p=>{this.cache.set(p.id,p);if(p.shared&&p.shared.id)this.cache.set(p.shared.id,p.shared)});return list},
  ago(d){const s=Math.max(1,(Date.now()-new Date(d).getTime())/1000);if(s<60)return 'now';if(s<3600)return Math.floor(s/60)+'m';if(s<86400)return Math.floor(s/3600)+'h';if(s<604800)return Math.floor(s/86400)+'d';return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})},
  txt(t){return esc(t).replace(/(https?:\/\/[^\s<]+)/g,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u.length>38?u.slice(0,36)+'…':u}</a>`).replace(/\n/g,'<br>')},
  plural(n,w){return n+' '+w+(n===1?'':'s')},
  /* ---------- navigation ---------- */
  open(){PH.view='gist';this.stack=[];this.cur=null;this.C=null;this.F.all.ok=this.F.following.ok=false;this.feed()},
  nav(fn,...a){const ab=$('ab');if(this.cur)this.stack.push({...this.cur,scroll:ab?ab.scrollTop:0});this[fn](...a)},
  back(){const s=this.stack.pop();if(!s){this.C=null;return PH.close()}this[s.fn](...s.args);requestAnimationFrame(()=>{const ab=$('ab');if(ab)ab.scrollTop=s.scroll||0})},
  set(fn,...args){this.cur={fn,args}},
  err(e){toast((e&&e.message)||'Something went wrong. Try again.')},
  /* ---------- post card ---------- */
  imgs(p){const n=Math.min(4,p.images.length);if(!n)return '';return `<div class="gimgs n${n}">${p.images.slice(0,4).map((im,i)=>`<button class="gim" onclick="GIST.lightbox('${p.id}',${i})"><img loading="lazy" src="${esc(im.thumb||im.url)}" alt=""></button>`).join('')}</div>`},
  gamecard(g){if(!g)return '';return `<div class="ggame"><span class="gg">🎮</span><div><b>${esc(g.name)}</b><small>${g.code?'Room code <code>'+esc(g.code)+'</code>':'Open in GameHub'}</small></div><button onclick="GIST.play('${esc(g.code||'')}')">${g.code?'Join':'Play'}</button></div>`},
  card(p,o){o=o||{};
    const a=p.author,who=`<button class="gph" onclick="GIST.nav('profile','${a.id}')">${PH.av({avatar:a.avatar,displayName:a.displayName,username:a.username})}<span><b>${esc(a.displayName)}</b><i>${a.username?'@'+esc(a.username)+' · ':''}${this.ago(p.createdAt)}</i></span></button>`;
    let shared='';
    if(p.shared)shared=p.shared.deleted?`<div class="gshared gone">This post is no longer available.</div>`:`<div class="gshared" onclick="GIST.nav('post','${p.shared.id}')"><div class="gsh"><b>${esc(p.shared.author.displayName)}</b><i>${p.shared.author.username?'@'+esc(p.shared.author.username):''} · ${this.ago(p.shared.createdAt)}</i></div>${p.shared.text?`<div class="gtx">${this.txt(p.shared.text)}</div>`:''}${this.imgs(p.shared)}${this.gamecard(p.shared.game)}</div>`;
    return `<article class="gp" data-id="${p.id}"><div class="gtop">${who}<button class="gmore" onclick="GIST.menu('${p.id}')" aria-label="More">⋯</button></div>
      ${p.text?`<div class="gtx">${this.txt(p.text)}</div>`:''}${this.imgs(p)}${this.gamecard(p.game)}${shared}
      <div class="gact"><button class="lk ${p.liked?'on':''}" onclick="GIST.like('${p.id}')"><span>${p.liked?'❤️':'🤍'}</span><em>${p.likes||''}</em></button>
      <button class="cm" onclick="${o.detail?"$('gc_in')&&$('gc_in').focus()":`GIST.nav('post','${p.id}')`}"><span>💬</span><em>${p.comments||''}</em></button>
      <button class="sh" onclick="GIST.shareSheet('${p.id}')"><span>🔁</span><em>${p.shares||''}</em></button></div></article>`},
  list(arr){return arr.map(p=>this.card(p)).join('')},
  /* ---------- feed ---------- */
  async feed(){
    this.set('feed');PH.view='gist';const T=this.tab,F=this.F[T],u=NET.user||{};
    const seg=`<div class="seg2"><button class="${T==='all'?'on':''}" onclick="GIST.setTab('all')">For you</button><button class="${T==='following'?'on':''}" onclick="GIST.setTab('following')">Following</button></div>`;
    PH.shell('P-Gist','GIST.back()',`<div class="abody" id="ab"><div class="gtease"><button class="gme" onclick="GIST.nav('profile','me')" aria-label="My profile">${PH.av({avatar:u.avatar,displayName:u.displayName,username:u.username})}</button><button class="gwhat" onclick="GIST.nav('compose')">What’s the gist, ${esc((u.displayName||'player').split(' ')[0])}?</button><button class="gphoto" onclick="GIST.nav('compose','photos')" aria-label="Add photo">🖼️</button></div>
      <div class="gfind"><input class="sinput" id="gf" placeholder="Find a player: @username" autocapitalize="none" autocomplete="off" onkeydown="if(event.key==='Enter')GIST.find()"></div>
      <div id="gfeed">${F.ok?this.feedHtml(F):'<p class="empty">Loading…</p>'}</div></div>`,seg);
    if(!F.ok)await this.loadFeed(true)},
  setTab(t){if(this.tab===t)return;this.tab=t;this.stack=[];this.feed()},
  feedHtml(F){if(!F.p.length)return this.tab==='following'?'<p class="empty">Nothing here yet. Follow players to see their gists. Find someone above, or open a profile from a post.</p>':'<p class="empty">No gists yet. Be the first to post something! 🎉</p>';
    return this.list(F.p)+(F.more?'<button class="gmorebtn" id="gmb" onclick="GIST.loadFeed()">Load more</button>':'<p class="empty gend">You are all caught up ✨</p>')},
  async loadFeed(first){const T=this.tab,F=this.F[T];if(F.busy)return;F.busy=true;
    try{const q=first?'':'&before='+encodeURIComponent(F.p.length?F.p[F.p.length-1].createdAt:'');const r=await this.api('/feed?tab='+T+q);
      this.put(r.posts);F.p=first?r.posts:F.p.concat(r.posts);F.more=r.more;F.ok=true}
    catch(e){this.err(e);if(first&&!F.ok){const f=$('gfeed');if(f)f.innerHTML='<p class="empty">Could not load the feed. <button class="gretry" onclick="GIST.loadFeed(true)">Try again</button></p>'}F.busy=false;return}
    F.busy=false;if(this.cur&&this.cur.fn==='feed'&&this.tab===T){const f=$('gfeed');if(f)f.innerHTML=this.feedHtml(F);this.watchMore()}},
  watchMore(){const b=$('gmb');if(!b||!window.IntersectionObserver)return;const o=new IntersectionObserver(es=>{if(es[0].isIntersecting){o.disconnect();this.loadFeed()}},{root:$('ab'),rootMargin:'200px'});o.observe(b)},
  find(){const v=($('gf').value||'').trim().replace(/^@/,'');if(!v)return;this.nav('profile',v)},
  /* ---------- likes / counts ---------- */
  async like(id){const p=this.cache.get(id);if(!p)return;p.liked=!p.liked;p.likes=Math.max(0,p.likes+(p.liked?1:-1));this.sync(id);
    try{const r=await this.api('/posts/'+id+'/like',{method:'POST'});p.liked=r.liked;p.likes=r.likes;this.sync(id)}
    catch(e){p.liked=!p.liked;p.likes=Math.max(0,p.likes+(p.liked?1:-1));this.sync(id);this.err(e)}},
  sync(id){const p=this.cache.get(id);if(!p)return;document.querySelectorAll(`.gp[data-id="${id}"]`).forEach(c=>{const l=c.querySelector('.lk');l.classList.toggle('on',p.liked);l.querySelector('span').textContent=p.liked?'❤️':'🤍';l.querySelector('em').textContent=p.likes||'';c.querySelector('.cm em').textContent=p.comments||'';c.querySelector('.sh em').textContent=p.shares||''})},
  /* ---------- game link ---------- */
  play(code){const f=$('hubf');if(code)f.src='/gamehub?code='+encodeURIComponent(code);openHub()},
  /* ---------- post detail + comments ---------- */
  async post(id){
    this.set('post',id);PH.shell('Gist','GIST.back()',`<div class="abody" id="ab"><p class="empty">Loading…</p></div>`);
    try{const r=await this.api('/posts/'+id);this.put([r.post]);this.cache.set(id,r.post);if(this.cur.fn!=='post'||this.cur.args[0]!==id)return;
      PH.shell('Gist','GIST.back()',`<div class="abody" id="ab">${this.card(r.post,{detail:1})}<div class="lab2">COMMENTS</div><div id="gcm"><p class="empty">Loading…</p></div></div>
        <div class="gcin"><input id="gc_in" placeholder="Write a comment…" maxlength="300" autocomplete="off" onkeydown="if(event.key==='Enter')GIST.send('${id}')"><button onclick="GIST.send('${id}')" aria-label="Send">➤</button></div>`);
      this.loadComments(id)}
    catch(e){$('ab').innerHTML=`<p class="empty">${esc(e.message)}</p>`}},
  cmHtml(c){const a=c.author;return `<div class="gc" data-c="${c.id}"><button class="gph sm" onclick="GIST.nav('profile','${a.id}')">${PH.av({avatar:a.avatar,displayName:a.displayName,username:a.username})}</button><div class="gcb"><b>${esc(a.displayName)}</b><p>${this.txt(c.text)}</p><small>${this.ago(c.createdAt)}${c.canDelete?` · <button onclick="GIST.delComment('${c.id}')">Delete</button>`:''}</small></div></div>`},
  async loadComments(id){try{const r=await this.api('/posts/'+id+'/comments');const b=$('gcm');if(!b)return;
    b.innerHTML=r.comments.length?r.comments.map(c=>this.cmHtml(c)).join('')+(r.more?'<p class="empty">Showing the first 50 comments.</p>':''):'<p class="empty">No comments yet. Start the conversation 💬</p>'}
    catch(e){const b=$('gcm');if(b)b.innerHTML=`<p class="empty">${esc(e.message)}</p>`}},
  async send(id){const i=$('gc_in'),t=(i.value||'').trim();if(!t)return;i.disabled=true;
    try{const r=await this.api('/posts/'+id+'/comments',{method:'POST',body:{text:t}});const b=$('gcm');if(b){if(!b.querySelector('.gc'))b.innerHTML='';b.insertAdjacentHTML('beforeend',this.cmHtml(r.comment));b.lastElementChild.scrollIntoView({block:'nearest'})}
      const p=this.cache.get(id);if(p){p.comments++;this.sync(id)}i.value=''}catch(e){this.err(e)}i.disabled=false;i.focus()},
  async delComment(cid){try{await this.api('/comments/'+cid,{method:'DELETE'});const el=document.querySelector(`[data-c="${cid}"]`);if(el)el.remove();const id=this.cur&&this.cur.args[0],p=this.cache.get(id);if(p&&p.comments>0){p.comments--;this.sync(id)}}catch(e){this.err(e)}},
  /* ---------- profile ---------- */
  async profile(key){
    this.set('profile',key);PH.shell('Profile','GIST.back()',`<div class="abody" id="ab"><p class="empty">Loading…</p></div>`);
    try{const r=await this.api('/profile/'+encodeURIComponent(key));this.put(r.posts);this.pf={key,r,posts:r.posts,more:r.more};this.drawProfile()}
    catch(e){const ab=$('ab');if(ab)ab.innerHTML=`<p class="empty">${esc(e.message)}</p>`}},
  drawProfile(){const {r,posts,more}=this.pf,u=r.user;if(!this.cur||this.cur.fn!=='profile')return;
    $('ab').innerHTML=`<div class="gprof">${PH.av({avatar:u.avatar,displayName:u.displayName,username:u.username},1).replace('class="avi big"','class="avi huge"')}<h3>${esc(u.displayName)}</h3><p>${u.username?'@'+esc(u.username):''}</p>
      <div class="gstats"><div><b>${r.postsCount}</b><span>Posts</span></div><button onclick="GIST.nav('people','${u.id}','followers')"><b id="gfc">${r.followers}</b><span>Followers</span></button><button onclick="GIST.nav('people','${u.id}','following')"><b>${r.following}</b><span>Following</span></button></div>
      ${r.isMe?`<button class="btn p" onclick="GIST.nav('compose')">✏️ New gist</button>`:`<button class="btn ${r.isFollowing?'s':'p'}" id="gfb" onclick="GIST.follow()">${r.isFollowing?'Following ✓':'Follow'}</button>`}</div>
      <div class="lab2">GISTS</div>${posts.length?this.list(posts)+(more?'<button class="gmorebtn" onclick="GIST.moreProfile()">Load more</button>':''):'<p class="empty">No gists yet.</p>'}`},
  async moreProfile(){const p=this.pf;try{const r=await this.api('/profile/'+p.r.user.id+'/posts?before='+encodeURIComponent(p.posts[p.posts.length-1].createdAt));this.put(r.posts);p.posts=p.posts.concat(r.posts);p.more=r.more;const s=$('ab').scrollTop;this.drawProfile();$('ab').scrollTop=s}catch(e){this.err(e)}},
  async follow(){const p=this.pf;if(!p)return;const b=$('gfb');if(b)b.disabled=true;
    try{const r=await this.api('/follow/'+p.r.user.id,{method:'POST'});p.r.isFollowing=r.following;p.r.followers=r.followers;Object.values(this.F).forEach(f=>f.ok=false);this.drawProfile()}catch(e){this.err(e);if(b)b.disabled=false}},
  async people(id,kind){
    this.set('people',id,kind);PH.shell(kind==='following'?'Following':'Followers','GIST.back()',`<div class="abody" id="ab"><p class="empty">Loading…</p></div>`);
    try{const r=await this.api('/profile/'+id+'/people?kind='+kind);this.pl=r.people;$('ab').innerHTML=r.people.length?r.people.map((u,i)=>`<div class="gperson"><button class="gph" onclick="GIST.nav('profile','${u.id}')">${PH.av({avatar:u.avatar,displayName:u.displayName,username:u.username})}<span><b>${esc(u.displayName)}</b><i>${u.username?'@'+esc(u.username):''}</i></span></button>${u.isMe?'':`<button class="gfollow ${u.isFollowing?'on':''}" onclick="GIST.followRow(${i},this)">${u.isFollowing?'Following':'Follow'}</button>`}</div>`).join(''):'<p class="empty">Nobody here yet.</p>'}
    catch(e){$('ab').innerHTML=`<p class="empty">${esc(e.message)}</p>`}},
  async followRow(i,b){const u=this.pl[i];b.disabled=true;try{const r=await this.api('/follow/'+u.id,{method:'POST'});u.isFollowing=r.following;b.textContent=r.following?'Following':'Follow';b.classList.toggle('on',r.following);Object.values(this.F).forEach(f=>f.ok=false)}catch(e){this.err(e)}b.disabled=false},
  /* ---------- menus ---------- */
  menu(id){const p=this.cache.get(id);if(!p)return;
    PH.sheet(`<h3>Gist options</h3>${p.mine?`<button class="fopt red out" onclick="GIST.askDelete('${id}')"><span>🗑 Delete gist</span></button>`:`<button class="fopt" onclick="PH.closeSheet();GIST.nav('profile','${p.author.id}')"><span>👤 View ${esc(p.author.displayName)}’s profile</span></button><button class="fopt" onclick="GIST.reportSheet('${id}')"><span>⚑ Report gist</span></button>`}${p.text?`<button class="fopt" onclick="GIST.copy('${id}')"><span>📋 Copy text</span></button>`:''}<button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)},
  async copy(id){PH.closeSheet();try{await navigator.clipboard.writeText(this.cache.get(id).text);toast('Copied ✓')}catch(e){toast('Could not copy')}},
  askDelete(id){PH.closeSheet();PH.sheet(`<h3>Delete this gist?</h3><p class="hint2">Likes and comments on it are removed too. This cannot be undone.</p><button class="fopt red out" onclick="GIST.del('${id}')"><span>Delete</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)},
  async del(id){PH.closeSheet();try{await this.api('/posts/'+id,{method:'DELETE'});this.cache.delete(id);Object.values(this.F).forEach(f=>{f.p=f.p.filter(p=>p.id!==id)});
    if(this.pf)this.pf.posts=this.pf.posts.filter(p=>p.id!==id);toast('Gist deleted');
    if(this.cur.fn==='post')this.back();else if(this.cur.fn==='profile'){this.pf.r.postsCount--;this.drawProfile()}else{const f=$('gfeed');if(f)f.innerHTML=this.feedHtml(this.F[this.tab])}}catch(e){this.err(e)}},
  reportSheet(id){PH.closeSheet();PH.sheet(`<h3>Report this gist</h3><p class="hint2">Pick a reason. Our team reviews every report.</p>${['Spam','Harassment','Inappropriate content','Scam'].map(r=>`<button class="fopt" onclick="GIST.report('${id}','${r}')"><span>${r}</span></button>`).join('')}`)},
  async report(id,r){PH.closeSheet();try{await this.api('/posts/'+id+'/report',{method:'POST',body:{reason:r}});toast('Report sent. Thank you 🙏🏾')}catch(e){this.err(e)}},
  shareSheet(id){const p=this.cache.get(id);if(!p)return;if(p.shared&&p.shared.id)id=p.shared.id;
    PH.sheet(`<h3>Share this gist</h3><button class="fopt" onclick="GIST.repost('${id}')"><span>🔁 Repost to my feed</span></button><button class="fopt" onclick="PH.closeSheet();GIST.nav('compose','share','${id}')"><span>✍️ Share with a comment</span></button>${navigator.share?`<button class="fopt" onclick="GIST.ext('${id}')"><span>📤 Share outside AllConnect</span></button>`:''}<button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)},
  async ext(id){PH.closeSheet();const p=this.cache.get(id);try{await navigator.share({title:'P-Gist',text:((p.text||'A gist on AllConnect P-Gist')+'').slice(0,120),url:location.origin})}catch(e){}},
  async repost(id){PH.closeSheet();try{const r=await this.api('/posts',{method:'POST',body:{sharedFrom:id}});this.afterPost(r.post,id);toast('Reposted ✓')}catch(e){this.err(e)}},
  afterPost(post,origId){this.put([post]);this.cache.set(post.id,post);this.F.all.p.unshift(post);if(this.F.following.ok)this.F.following.p.unshift(post);
    const o=this.cache.get(origId);if(o){o.shares++;this.sync(origId)}
    if(this.cur&&this.cur.fn==='feed'){const f=$('gfeed');if(f)f.innerHTML=this.feedHtml(this.F[this.tab])}},
  /* ---------- lightbox ---------- */
  lightbox(id,i){const p=this.cache.get(id);if(!p||!p.images[i])return;this.lb={id,i};this.drawLb()},
  drawLb(){const {id,i}=this.lb,p=this.cache.get(id),n=p.images.length;let el=$('glb');if(!el){el=document.createElement('div');el.id='glb';el.className='glb';PH.$a().appendChild(el)}
    el.innerHTML=`<div class="glbt"><button onclick="GIST.closeLb()" aria-label="Close">✕</button><span>${i+1} / ${n}</span><button onclick="GIST.shareImg()">Share photo</button></div><div class="glbi"><button class="vnav l" ${i?'':'disabled'} onclick="GIST.lbGo(-1)">‹</button><img src="${esc(p.images[i].url)}" alt=""><button class="vnav r" ${i<n-1?'':'disabled'} onclick="GIST.lbGo(1)">›</button></div>`},
  lbGo(d){this.lb.i+=d;this.drawLb()},closeLb(){const e=$('glb');if(e)e.remove()},
  shareImg(){const p=this.cache.get(this.lb.id),im=p.images[this.lb.i];this.closeLb();this.nav('compose','image',{src:'platform',url:im.url,thumb:im.thumb||im.url})},
  /* ---------- composer ---------- */
  compose(mode,arg){
    this.set('compose',mode,arg);const u=NET.user||{};
    if(!this.C)this.C={text:'',images:[],game:null,shared:null,busy:false};
    const C=this.C;
    if(mode==='share'&&arg){C.shared=this.cache.get(arg)||null}
    if(mode==='image'&&arg&&!C.images.some(i=>i.url===arg.url))C.images.push(arg);
    PH.shell(C.shared?'Share gist':'New gist','GIST.cancelCompose()',`<div class="abody" id="ab"><div class="gcomp"><div class="gcwho">${PH.av({avatar:u.avatar,displayName:u.displayName,username:u.username})}<b>${esc(u.displayName||'You')}</b></div>
      <textarea id="gc_t" maxlength="500" placeholder="${C.shared?'Add a comment…':'What’s the gist? Share a thought, a photo or a game 🎮'}" oninput="GIST.cc()">${esc(C.text)}</textarea><div class="gcount" id="gcc"></div>
      <div id="gc_att"></div><div class="gtools"><button onclick="GIST.pickOpen()">🖼️ Photos</button><button onclick="GIST.gameSheet()">🎮 Game link</button></div>
      <div class="aerr" id="gc_e"></div><button class="btn p" id="gc_b" onclick="GIST.submit()">${C.shared?'Share':'Post'}</button></div></div>`);
    this.attDraw();this.cc();if(mode==='photos')this.pickOpen();else if(!('ontouchstart' in window))$('gc_t').focus()},
  cancelCompose(){const t=$('gc_t');if(this.C)this.C.text=t?t.value:'';const C=this.C;if(C&&(C.text||C.images.length||C.game)&&!C.shared){PH.sheet(`<h3>Discard this gist?</h3><button class="fopt red out" onclick="PH.closeSheet();GIST.C=null;GIST.back()"><span>Discard</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Keep writing</span></button>`)}else{this.C=null;this.back()}},
  cc(){const t=$('gc_t');if(!t)return;this.C.text=t.value;const n=t.value.length,c=$('gcc');c.textContent=n?n+' / 500':'';this.btn()},
  btn(){const C=this.C,b=$('gc_b');if(!b)return;b.disabled=C.busy||!(C.text.trim()||C.images.length||C.game||C.shared);b.textContent=C.busy?'Posting…':(C.shared?'Share':'Post')},
  attDraw(){const C=this.C,a=$('gc_att');if(!a)return;
    a.innerHTML=(C.images.length?`<div class="gprev">${C.images.map((im,i)=>`<div><img src="${esc(im.thumb||im.url)}" alt=""><button onclick="GIST.rmImg(${i})" aria-label="Remove">✕</button></div>`).join('')}</div>`:'')+
      (C.game?`<div class="ggame"><span class="gg">🎮</span><div><b>${esc(C.game.name)}</b><small>${C.game.code?'Room code <code>'+esc(C.game.code)+'</code>':'Open in GameHub'}</small></div><button onclick="GIST.C.game=null;GIST.attDraw()">✕</button></div>`:'')+
      (C.shared?`<div class="gshared"><div class="gsh"><b>${esc(C.shared.author.displayName)}</b></div>${C.shared.text?`<div class="gtx">${this.txt(C.shared.text.slice(0,200))}</div>`:''}${this.imgs(C.shared)}</div>`:'');this.btn()},
  rmImg(i){this.C.images.splice(i,1);this.attDraw()},
  async submit(){const C=this.C;if(C.busy)return;C.text=($('gc_t').value||'');C.busy=true;this.btn();$('gc_e').textContent='';
    try{const body={text:C.text,images:C.images.map(i=>i.src==='mine'?{src:'mine',id:i.id}:{src:'platform',url:i.url})};
      if(C.game)body.game={key:C.game.key,code:C.game.code};if(C.shared)body.sharedFrom=C.shared.id;
      const r=await this.api('/posts',{method:'POST',body});const orig=C.shared&&C.shared.id;this.C=null;this.stack=[];this.tab='all';this.afterPost(r.post,orig);toast('Posted ✓');this.feed()}
    catch(e){C.busy=false;this.btn();$('gc_e').textContent=e.message}},
  /* ---------- photo picker ---------- */
  pickOpen(){this.pk.tab='mine';PH.sheet(`<h3>Add photos</h3><div class="seg2 gpk" id="pk_tabs"></div><div id="pk_body"></div><button class="btn p" onclick="PH.closeSheet();GIST.attDraw()">Done</button>`);this.pickDraw();this.pickLoad()},
  pickTab(t){this.pk.tab=t;this.pickDraw();this.pickLoad()},
  async pickLoad(){const k=this.pk;try{if(k.tab==='mine'&&!k.mine){const r=await NET.api('/api/ac/photos');k.mine=r.photos||[]}
      if(k.tab==='plat'&&!k.plat){const r=await this.api('/gallery/platform');k.plat=r.photos||[]}}catch(e){this.err(e);if(k.tab==='mine')k.mine=[];else k.plat=[]}this.pickDraw()},
  has(it){return this.C.images.some(i=>(i.id&&i.id===it.id)||(i.url&&i.url===it.url))},
  pickDraw(){const k=this.pk,t=$('pk_tabs'),b=$('pk_body');if(!t||!b)return;
    t.innerHTML=[['mine','My gallery'],['plat','Platform'],['dev','Device']].map(x=>`<button class="${k.tab===x[0]?'on':''}" onclick="GIST.pickTab('${x[0]}')">${x[1]}</button>`).join('');
    const n=this.C.images.length,head=`<p class="hint2">${n} of 4 selected</p>`;
    if(k.tab==='dev'){b.innerHTML=head+`<label class="btn s pickf">📁 Choose photos from this device<input type="file" accept="image/*" multiple hidden onchange="GIST.pickFiles(this)"></label><p class="hint2">${k.busy?'Uploading…':'Photos you pick are also saved to your gallery.'}</p>`;return}
    const L=k.tab==='mine'?k.mine:k.plat;
    if(!L){b.innerHTML=head+'<p class="empty">Loading…</p>';return}
    if(!L.length){b.innerHTML=head+`<p class="empty">${k.tab==='mine'?'Your gallery is empty. Take a photo with the Camera app or choose one from your device.':'No platform photos yet.'}</p>`;return}
    b.innerHTML=head+`<div class="gpick">${L.map((p,i)=>`<button class="${this.has(p)?'sel':''}" onclick="GIST.pickToggle('${k.tab}',${i})"><img src="${esc(p.thumb||p.url)}" alt=""><i>✓</i></button>`).join('')}</div>`},
  pickToggle(tab,i){const L=tab==='mine'?this.pk.mine:this.pk.plat,p=L[i],C=this.C;const at=C.images.findIndex(x=>(x.id&&x.id===p.id)||(x.url&&x.url===p.url));
    if(at>=0)C.images.splice(at,1);else{if(C.images.length>=4)return toast('You can add up to 4 photos');C.images.push(tab==='mine'?{src:'mine',id:p.id,url:p.url,thumb:p.thumb||p.url}:{src:'platform',url:p.url,thumb:p.thumb||p.url})}this.pickDraw()},
  async pickFiles(inp){const files=[...inp.files];inp.value='';const k=this.pk;if(!files.length)return;k.busy=true;this.pickDraw();
    for(const f of files){if(this.C.images.length>=4){toast('You can add up to 4 photos');break}if(!f.type.startsWith('image/'))continue;
      try{const data=await PH.resize(f,1600,.88),r=await NET.api('/api/ac/photos',{method:'POST',body:{image:data}});k.mine=null;if(window.CAM&&CAM.photos)CAM.photos.unshift(r.photo);
        this.C.images.push({src:'mine',id:r.photo.id,url:r.photo.url,thumb:r.photo.thumb||r.photo.url})}catch(e){this.err(e);break}}
    k.busy=false;this.pickDraw();this.attDraw()},
  /* ---------- game link picker ---------- */
  async gameSheet(){if(!this.games){try{this.games=(await this.api('/games')).games}catch(e){return this.err(e)}}
    this.gsel=this.C.game?this.C.game.key:null;
    PH.sheet(`<h3>Attach a game</h3><p class="hint2">Pick a game. Add a room code if you already created a room so friends can join in one tap.</p><div class="pre" id="gg_list"></div><input class="sinput" id="gg_code" placeholder="Room code or invite link (optional)" autocapitalize="characters" autocomplete="off" value="${esc(this.C.game&&this.C.game.code||'')}"><div class="aerr" id="gg_e"></div><button class="btn p" onclick="GIST.gameAttach()">Attach</button>`);this.gameDraw()},
  gameDraw(){const l=$('gg_list');if(l)l.innerHTML=this.games.map(g=>`<button class="${g.key===this.gsel?'on':''}" onclick="GIST.gsel='${g.key}';GIST.gameDraw()">${esc(g.name)}</button>`).join('')},
  gameAttach(){if(!this.gsel)return $('gg_e').textContent='Pick a game first.';let v=($('gg_code').value||'').trim();const m=/[?&]code=([A-Za-z0-9]+)/.exec(v);if(m)v=m[1];v=v.toUpperCase();
    if(v&&!/^[A-Z0-9]{3,8}$/.test(v))return $('gg_e').textContent='Room codes are 3 to 8 letters or numbers.';
    const g=this.games.find(x=>x.key===this.gsel);this.C.game={key:g.key,name:g.name,code:v};PH.closeSheet();this.attDraw()}
};
