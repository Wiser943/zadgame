/* AllConnect Camera app.
   Front + back camera, flash/torch, timer, grid, zoom (hardware or digital, pinch too), aspect ratios, live filters,
   mirror, import from device, and a gallery. Photos upload to imgbb through POST /api/ac/photos (key lives in IMGBB_KEY on the server). */
const CAMF=[['Normal','',0],['Vivid','saturate(1.5) contrast(1.08)',1],['Warm','sepia(.25) saturate(1.3) hue-rotate(-10deg)',2],['Cool','saturate(1.1) hue-rotate(15deg) brightness(1.03)',3],['B&W','grayscale(1) contrast(1.1)',4],['Fade','contrast(.85) brightness(1.1) saturate(.8)',5],['Sepia','sepia(1)',6]];
const CAMR=['4:3','1:1','16:9','Full'];
const CAM={
  stream:null,track:null,video:null,facing:'environment',isFront:false,ro:null,
  s:{flash:false,timer:0,grid:false,ratio:0,filter:0,mirror:true,zoom:1,fOpen:false},
  hw:{zoom:null,torch:false},photos:[],pending:[],configured:true,loaded:false,
  boxAR:4/3,count:0,cdT:0,mode:'cam',idx:0,vlist:[],tid:0,keyFn:null,
  $(id){return document.getElementById(id)},
  /* ---------- open / close ---------- */
  open(){
    PH.view='camera';this.mode='cam';
    const scr=document.querySelector('.screen');scr.classList.add('light','camdark');PH.$a().classList.add('camv');
    this.draw();this.loadPhotos();this.start();
    this.keyFn=e=>{if(PH.view!=='camera'||this.mode!=='cam')return;if(/INPUT|TEXTAREA/.test((e.target||{}).tagName))return;
      if(e.key===' '||e.key==='Enter'){e.preventDefault();this.snap()}else if(e.key==='f'||e.key==='F')this.flip()};
    document.addEventListener('keydown',this.keyFn)},
  exit(){PH.close()},
  teardown(){this.stop();clearInterval(this.cdT);this.count=0;
    if(this.keyFn){document.removeEventListener('keydown',this.keyFn);this.keyFn=null}
    const scr=document.querySelector('.screen');if(scr)scr.classList.remove('camdark');const a=PH.$a();if(a)a.classList.remove('camv')},
  stop(){
    if(this.ro){this.ro.disconnect();this.ro=null}
    if(this.track&&this.hw.torch){try{this.track.applyConstraints({advanced:[{torch:false}]})}catch(e){}}
    if(this.stream)this.stream.getTracks().forEach(t=>t.stop());
    this.stream=null;this.track=null;if(this.video)this.video.srcObject=null},
  /* ---------- camera ---------- */
  async start(){
    this.stop();this.msg('');
    const md=navigator.mediaDevices;
    if(!md||!md.getUserMedia)return this.msg(window.isSecureContext?'This browser cannot open the camera.':'The camera needs a secure (https) connection.',true);
    const f=this.facing,base={width:{ideal:1920},height:{ideal:1080}};
    const tries=[{video:{...base,facingMode:{exact:f}},audio:false},{video:{...base,facingMode:{ideal:f}},audio:false},{video:true,audio:false}];
    let st=null,err=null;
    for(const c of tries){try{st=await md.getUserMedia(c);break}catch(e){err=e;if(e&&(e.name==='NotAllowedError'||e.name==='SecurityError'))break}}
    if(PH.view!=='camera'||this.mode!=='cam'){if(st)st.getTracks().forEach(t=>t.stop());return}
    if(!st){const n=err&&err.name;return this.msg(n==='NotAllowedError'||n==='SecurityError'?'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.':n==='NotFoundError'||n==='OverconstrainedError'?'No camera was found on this device.':n==='NotReadableError'?'Another app is using the camera. Close it and try again.':'The camera could not start.',true)}
    this.stream=st;this.track=st.getVideoTracks()[0];this.video=this.$('cam-v');if(!this.video)return this.stop();
    this.video.srcObject=st;try{await this.video.play()}catch(e){}
    const set=this.track.getSettings?this.track.getSettings():{},caps=this.track.getCapabilities?this.track.getCapabilities():{};
    const touch=navigator.maxTouchPoints>0&&/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    this.isFront=set.facingMode?set.facingMode==='user':(f==='user'||!touch);
    this.hw.zoom=caps.zoom&&caps.zoom.max>caps.zoom.min?{min:caps.zoom.min,max:Math.min(caps.zoom.max,10),step:caps.zoom.step||.1}:null;
    this.hw.torch=!!caps.torch;
    this.s.zoom=this.hw.zoom?this.hw.zoom.min:1;this.drawZoom();this.applyView();this.fit();this.drawTop();
    if(window.ResizeObserver){this.ro=new ResizeObserver(()=>this.fit());this.ro.observe(this.$('cam-stage'))}
    try{const d=(await md.enumerateDevices()).filter(x=>x.kind==='videoinput');this.ndev=d.length}catch(e){this.ndev=2}},
  async flip(){this.facing=this.facing==='user'?'environment':'user';
    if(this.ndev===1&&!/Android|iPhone|iPad/i.test(navigator.userAgent))toast('Only one camera found on this device');
    this.s.flash=false;await this.start()},
  msg(t,retry){const m=this.$('cam-msg');if(!m)return;
    m.style.display=t?'flex':'none';m.innerHTML=t?`<div>${esc(t)}</div>${retry?`<button class="pbtn grn" onclick="CAM.start()">Try again</button>`:''}<label class="pbtn blu pickf"><i class="fa-solid fa-folder-open"></i> Choose a photo<input type="file" accept="image/*" capture="${this.facing==='user'?'user':'environment'}" hidden onchange="CAM.importFile(this)"></label>`:''},
  /* ---------- view helpers ---------- */
  fit(){const st=this.$('cam-stage'),v=this.$('cam-view');if(!st||!v)return;
    const W=st.clientWidth,H=st.clientHeight;if(!W||!H)return;
    let w=W,h=H;const r=CAMR[this.s.ratio];
    if(r!=='Full'){const[a,b]=r.split(':').map(Number);const ar=H>W?Math.min(a,b)/Math.max(a,b):Math.max(a,b)/Math.min(a,b);
      if(W/H>ar){h=H;w=H*ar}else{w=W;h=W/ar}}
    v.style.width=Math.floor(w)+'px';v.style.height=Math.floor(h)+'px';this.boxAR=w/h},
  applyView(){const v=this.video;if(!v)return;
    const mir=this.isFront&&this.s.mirror?'scaleX(-1) ':'';
    v.style.transform=mir+(this.hw.zoom?'':`scale(${this.s.zoom})`);
    v.style.filter=CAMF[this.s.filter][1]||'none'},
  setZoom(z){const h=this.hw.zoom,lo=h?h.min:1,hi=h?h.max:4;z=Math.max(lo,Math.min(hi,+z||lo));this.s.zoom=z;
    if(h&&this.track)this.track.applyConstraints({advanced:[{zoom:z}]}).catch(()=>{});
    this.applyView();const l=this.$('cam-zl'),r=this.$('cam-zr');if(l)l.textContent=z.toFixed(1).replace(/\.0$/,'')+'×';if(r&&+r.value!==z)r.value=z},
  pinch(el){let d0=0,z0=1;const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
    el.addEventListener('touchstart',e=>{if(e.touches.length===2){d0=dist(e.touches);z0=this.s.zoom}},{passive:true});
    el.addEventListener('touchmove',e=>{if(e.touches.length===2&&d0){e.preventDefault();this.setZoom(z0*dist(e.touches)/d0)}},{passive:false});
    el.addEventListener('touchend',()=>{d0=0},{passive:true});
    el.addEventListener('wheel',e=>{e.preventDefault();this.setZoom(this.s.zoom*(e.deltaY<0?1.08:.93))},{passive:false})},
  /* ---------- controls ---------- */
  tFlash(){if(this.facing==='user'&&!this.s.flash)toast('Screen flash on');this.s.flash=!this.s.flash;this.drawTop()},
  tTimer(){this.s.timer={0:3,3:10,10:0}[this.s.timer];this.drawTop()},
  tGrid(){this.s.grid=!this.s.grid;this.drawTop()},
  tRatio(){this.s.ratio=(this.s.ratio+1)%CAMR.length;this.fit();this.drawTop()},
  tMirror(){this.s.mirror=!this.s.mirror;toast(this.s.mirror?'Mirror on':'Mirror off');this.applyView();this.drawTop()},
  tFilters(){this.s.fOpen=!this.s.fOpen;this.drawFilters();this.drawTop();setTimeout(()=>this.fit(),30)},
  setFilter(i){this.s.filter=i;this.applyView();this.drawFilters()},
  /* ---------- drawing ---------- */
  draw(){
    PH.$a().innerHTML=`<div class="cam" id="cam">
      <div class="cam-top" id="cam-top"></div>
      <div class="cam-stage" id="cam-stage"><div class="cam-view" id="cam-view"><video id="cam-v" playsinline muted autoplay></video><div class="cam-grid" id="cam-grid"></div><div class="cam-count" id="cam-count"></div></div>
        <div class="cam-flash" id="cam-flash"></div><div class="cam-msg" id="cam-msg" style="display:none"></div></div>
      <div class="cam-ctl">
        <div class="cam-zoom"><span id="cam-zl">1×</span><input type="range" id="cam-zr" min="1" max="4" step="0.1" value="1" oninput="CAM.setZoom(this.value)" aria-label="Zoom"></div>
        <div class="cam-filters" id="cam-filters"></div>
        <div class="cam-bar"><button class="cam-th" id="cam-th" onclick="CAM.gallery()" aria-label="Open gallery"></button>
          <button class="cam-shut" id="cam-shut" onclick="CAM.snap()" aria-label="Take photo"><i></i></button>
          <button class="cam-flip" onclick="CAM.flip()" aria-label="Switch camera"><i class="fa-solid fa-camera-rotate"></i></button></div></div></div>`;
    this.drawTop();this.drawFilters();this.drawThumb();this.drawZoom();this.pinch(this.$('cam-stage'))},
  drawTop(){const t=this.$('cam-top');if(!t)return;const s=this.s,g=this.$('cam-grid');if(g)g.style.display=s.grid?'block':'none';
    const b=(fn,ic,lab,on,x)=>`<button class="cam-b ${on?'on':''}" onclick="${fn}" aria-label="${lab}">${ic}${x?`<small>${x}</small>`:''}</button>`;
    t.innerHTML=`<button class="cam-b" onclick="CAM.exit()" aria-label="Close camera">‹</button><span class="cam-sp"></span>`+
      b('CAM.tFlash()',s.flash?'<i class="fa-solid fa-bolt"></i>':'<i class="fa-solid fa-ban"></i>','Flash',s.flash)+b('CAM.tTimer()','<i class="fa-solid fa-stopwatch"></i>','Timer',s.timer,s.timer?s.timer+'s':'')+b('CAM.tGrid()','<i class="fa-solid fa-border-all"></i>','Grid',s.grid)+
      b('CAM.tRatio()','<i class="fa-solid fa-crop-simple"></i>','Ratio',false,CAMR[s.ratio])+(this.isFront?b('CAM.tMirror()','<i class="fa-solid fa-left-right"></i>','Mirror',s.mirror):'')+b('CAM.tFilters()','<i class="fa-solid fa-wand-magic-sparkles"></i>','Filters',s.fOpen||s.filter)+
      `<label class="cam-b" aria-label="Import a photo"><i class="fa-solid fa-upload"></i><input type="file" accept="image/*" hidden onchange="CAM.importFile(this)"></label>`},
  drawFilters(){const f=this.$('cam-filters');if(!f)return;f.style.display=this.s.fOpen?'flex':'none';
    f.innerHTML=CAMF.map((x,i)=>`<button class="${i===this.s.filter?'on':''}" onclick="CAM.setFilter(${i})">${x[0]}</button>`).join('')},
  drawZoom(){const r=this.$('cam-zr'),h=this.hw.zoom;if(!r)return;r.min=h?h.min:1;r.max=h?h.max:4;r.step=h?h.step:.1;r.value=this.s.zoom;this.setZoom(this.s.zoom)},
  drawThumb(){const t=this.$('cam-th');if(!t)return;const l=this.pending[this.pending.length-1],p=this.photos[0],src=l?l.thumb:p&&(p.thumb||p.url);
    const n=this.pending.length+this.photos.length;
    t.innerHTML=src?`<img src="${esc(src)}" alt="">${l?`<i class="${l.state==='fail'?'bad':'spin'}">${l.state==='fail'?'!':''}</i>`:''}${n>1?`<b>${n>99?'99+':n}</b>`:''}`:'<i class="fa-solid fa-image"></i>'},
  /* ---------- taking a photo ---------- */
  snap(){
    if(!this.stream||!this.video||!this.video.videoWidth)return toast('Camera is not ready yet');
    if(this.count){clearInterval(this.cdT);this.count=0;this.$('cam-count').textContent='';return}
    const T=this.s.timer;if(!T)return this.shoot();
    this.count=T;const c=this.$('cam-count');c.textContent=this.count;
    this.cdT=setInterval(()=>{this.count--;if(this.count<=0){clearInterval(this.cdT);c.textContent='';this.count=0;this.shoot()}else c.textContent=this.count},1000)},
  async shoot(){
    const fl=this.$('cam-flash');let torch=false;
    if(this.s.flash){
      if(this.hw.torch&&!this.isFront){try{await this.track.applyConstraints({advanced:[{torch:true}]});torch=true;await new Promise(r=>setTimeout(r,350))}catch(e){}}
      if(!torch&&fl){fl.className='cam-flash full';await new Promise(r=>setTimeout(r,320))}}
    const out=this.grab();
    if(torch){try{this.track.applyConstraints({advanced:[{torch:false}]})}catch(e){}}
    if(fl){fl.className='cam-flash pop';setTimeout(()=>{if(fl)fl.className='cam-flash'},160)}
    this.click();if(navigator.vibrate&&GP.get().vibration)navigator.vibrate(20);
    if(out)this.queue(out)},
  grab(){
    const v=this.video,vw=v.videoWidth,vh=v.videoHeight;if(!vw)return null;
    const ar=this.boxAR,sar=vw/vh;let sw,sh;if(sar>ar){sh=vh;sw=vh*ar}else{sw=vw;sh=vw/ar}
    if(!this.hw.zoom){sw/=this.s.zoom;sh/=this.s.zoom}
    const sx=(vw-sw)/2,sy=(vh-sh)/2,k=Math.min(1,1600/Math.max(sw,sh)),ow=Math.round(sw*k),oh=Math.round(sh*k);
    const c=document.createElement('canvas');c.width=ow;c.height=oh;const x=c.getContext('2d');
    const nat='filter' in CanvasRenderingContext2D.prototype,fi=this.s.filter;
    if(nat&&CAMF[fi][1])x.filter=CAMF[fi][1];
    x.save();if(this.isFront&&this.s.mirror){x.translate(ow,0);x.scale(-1,1)}
    x.drawImage(v,sx,sy,sw,sh,0,0,ow,oh);x.restore();
    if(!nat&&fi)this.manual(x,ow,oh,fi);
    return{data:c.toDataURL('image/jpeg',.88),w:ow,h:oh,thumb:this.mkThumb(c)}},
  mkThumb(c){const t=document.createElement('canvas'),k=240/Math.max(c.width,c.height);t.width=Math.round(c.width*k);t.height=Math.round(c.height*k);t.getContext('2d').drawImage(c,0,0,t.width,t.height);return t.toDataURL('image/jpeg',.7)},
  manual(x,w,h,i){const d=x.getImageData(0,0,w,h),p=d.data;
    for(let k=0;k<p.length;k+=4){let r=p[k],g=p[k+1],b=p[k+2];const l=.299*r+.587*g+.114*b;
      if(i===1){r=l+(r-l)*1.5;g=l+(g-l)*1.5;b=l+(b-l)*1.5}else if(i===2){r*=1.08;g*=1.02;b*=.9}else if(i===3){r*=.94;b*=1.08}
      else if(i===4){r=g=b=l*1.05}else if(i===5){r=r*.85+28;g=g*.85+28;b=b*.85+28}
      else if(i===6){const R=.393*r+.769*g+.189*b,G=.349*r+.686*g+.168*b,B=.272*r+.534*g+.131*b;r=R;g=G;b=B}
      p[k]=r;p[k+1]=g;p[k+2]=b}
    x.putImageData(d,0,0)},
  click(){try{if(!GP.get().sound)return;const a=this.ac||(this.ac=new(window.AudioContext||window.webkitAudioContext)()),o=a.createOscillator(),g=a.createGain();
    o.frequency.value=1400;g.gain.value=.07;o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+.05)}catch(e){}},
  /* ---------- upload / library ---------- */
  queue(o){const it={id:'t'+(++this.tid),data:o.data,thumb:o.thumb,w:o.w,h:o.h,state:'up',err:''};this.pending.push(it);this.drawThumb();this.upload(it)},
  async upload(it){it.state='up';it.err='';this.drawThumb();this.refreshGallery();
    try{const r=await NET.api('/api/ac/photos',{method:'POST',body:{image:it.data,w:it.w,h:it.h}});
      this.pending=this.pending.filter(x=>x!==it);this.photos.unshift(r.photo);toast('Saved to gallery ✓')}
    catch(e){it.state='fail';it.err=e.message||'Upload failed';toast(it.err)}
    this.drawThumb();this.refreshGallery()},
  async loadPhotos(){try{const r=await NET.api('/api/ac/photos');this.photos=r.photos||[];this.configured=r.configured!==false;this.loaded=true}catch(e){}
    this.drawThumb();this.refreshGallery();if(!this.configured&&this.mode==='cam')toast('Photo storage is not set up yet')},
  async importFile(inp){const f=inp.files&&inp.files[0];inp.value='';if(!f)return;if(!f.type.startsWith('image/'))return toast('Please choose an image file.');
    try{const data=await PH.resize(f,1600,.88),im=new Image();await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src=data});
      const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);
      this.msg('');this.queue({data,w:im.width,h:im.height,thumb:this.mkThumb(c)})}catch(e){toast('Could not read that photo')}},
  /* ---------- gallery ---------- */
  list(){return this.pending.slice().reverse().map(p=>({local:1,id:p.id,thumb:p.thumb,url:p.data,state:p.state,err:p.err})).concat(this.photos)},
  gallery(){this.mode='gallery';this.stop();this.s.fOpen=false;this.drawGallery()},
  backToCam(){this.mode='cam';this.draw();this.start()},
  refreshGallery(){if(this.mode==='gallery')this.drawGallery(true);else if(this.mode==='view')this.drawViewer()},
  drawGallery(keep){const L=this.list();
    PH.$a().innerHTML=`<div class="cam gal"><div class="cam-top"><button class="cam-b" onclick="CAM.backToCam()" aria-label="Back to camera">‹</button><h3>Gallery</h3><span class="cam-sp"></span><small>${L.length} photo${L.length===1?'':'s'}</small></div>
      <div class="gal-body">${L.length?`<div class="gal-grid">${L.map((p,i)=>`<button class="gi" onclick="CAM.view(${i})"><img loading="lazy" src="${esc(p.thumb||p.url)}" alt="">${p.local?`<i class="${p.state==='fail'?'bad':'spin'}">${p.state==='fail'?'!':''}</i>`:''}</button>`).join('')}</div>`:
      `<p class="empty" style="color:#9aa0b4">${this.loaded?'No photos yet. Take one and it appears here.':'Loading…'}</p>`}</div></div>`},
  view(i){this.mode='view';this.idx=i;this.drawViewer()},
  drawViewer(){const L=this.list();if(!L.length)return this.gallery();this.idx=Math.max(0,Math.min(this.idx,L.length-1));const p=L[this.idx];
    const acts=p.local?`${p.state==='fail'?`<button class="pbtn grn" onclick="CAM.retry('${p.id}')">Retry upload</button>`:'<span class="cam-note">Uploading…</span>'}<button class="pbtn" onclick="CAM.saveLocal('${p.id}')">Save to device</button><button class="pbtn" onclick="CAM.discard('${p.id}')">Discard</button>`:
      `<button class="pbtn blu" onclick="CAM.share(${this.idx})">${navigator.share?'Share':'Copy link'}</button><button class="pbtn" onclick="CAM.download(${this.idx})">Download</button><button class="pbtn red" onclick="CAM.askDel(${this.idx})">Delete</button>`;
    PH.$a().innerHTML=`<div class="cam gal"><div class="cam-top"><button class="cam-b" onclick="CAM.gallery()" aria-label="Back to gallery">‹</button><span class="cam-sp"></span><small>${this.idx+1} / ${L.length}</small></div>
      <div class="vwr"><button class="vnav l" onclick="CAM.view(${this.idx-1})" ${this.idx?'':'disabled'} aria-label="Previous">‹</button><img src="${esc(p.url)}" alt="Photo"><button class="vnav r" onclick="CAM.view(${this.idx+1})" ${this.idx<L.length-1?'':'disabled'} aria-label="Next">›</button></div>
      ${p.err?`<p class="cam-err">${esc(p.err)}</p>`:''}<div class="vact">${acts}</div></div>`},
  retry(id){const it=this.pending.find(x=>x.id===id);if(it)this.upload(it)},
  discard(id){this.pending=this.pending.filter(x=>x.id!==id);this.drawThumb();this.gallery()},
  saveLocal(id){const it=this.pending.find(x=>x.id===id);if(!it)return;const a=document.createElement('a');a.href=it.data;a.download='allconnect-photo.jpg';document.body.appendChild(a);a.click();a.remove()},
  async share(i){const p=this.list()[i];if(!p)return;
    try{if(navigator.share){await navigator.share({title:'My AllConnect photo',url:p.url})}else{await navigator.clipboard.writeText(p.url);toast('Link copied ✓')}}
    catch(e){if(e&&e.name!=='AbortError'){try{await navigator.clipboard.writeText(p.url);toast('Link copied ✓')}catch(x){window.open(p.url,'_blank','noopener')}}}},
  async download(i){const p=this.list()[i];if(!p)return;
    try{const r=await fetch(p.url,{mode:'cors'}),b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='allconnect-photo.jpg';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
    catch(e){window.open(p.url,'_blank','noopener')}},
  askDel(i){const p=this.list()[i];if(!p)return;PH.sheet(`<h3>Delete this photo?</h3><p class="hint2">It is removed from your gallery. This cannot be undone.</p><button class="fopt red out" onclick="CAM.del('${p.id}')"><span>Delete photo</span></button><button class="fopt" onclick="PH.closeSheet()"><span>Cancel</span></button>`)},
  async del(id){PH.closeSheet();try{await NET.api('/api/ac/photos/'+id,{method:'DELETE'});this.photos=this.photos.filter(p=>p.id!==id);toast('Photo deleted');this.drawThumb();this.idx=Math.max(0,this.idx-1);this.list().length?this.view(this.idx):this.gallery()}catch(e){toast(e.message)}}
};
/* make sure the camera always switches off when the phone app closes or the tab is hidden */
(function(){const close=PH.close;PH.close=function(){if(PH.view==='camera')CAM.teardown();return close.apply(this,arguments)};
  document.addEventListener('visibilitychange',()=>{if(PH.view!=='camera'||CAM.mode!=='cam')return;if(document.hidden)CAM.stop();else CAM.start()})})();

window.CAM = CAM;
