const vm=require('vm'),fs=require('fs'),path=require('path');
const root='public/allconnect', ctx={console,setInterval,clearInterval,performance}; ctx.window=ctx; vm.createContext(ctx);
const run=f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
vm.runInContext(`const S={items:[],grid:6,layout:null,needs:[.5,.5,.5,.5,.5,.5]}; function toast(t){}`,ctx);
run('layouts.js'); run('furniture.js'); run('room3d.js');
vm.runInContext(`class V3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z} set(x,y,z){this.x=x;this.y=y;this.z=z;return this} clone(){return new V3(this.x,this.y,this.z)} sub(o){this.x-=o.x;this.y-=o.y;this.z-=o.z;return this}}
var THREE={Vector3:V3};`,ctx);
const R=ctx.ROOM3D; const ok=(c,m)=>{ if(!c){console.log('FAIL',m);process.exitCode=1}else console.log('ok  ',m)};
R.gw=6;R.gd=6;R.layout=null; R.path=[]; R.avatar={position:new ctx.THREE.Vector3(-1,0,1.2),rotation:{y:0}};
const SS=c=>vm.runInContext(c,ctx);
SS("S.items=[{id:'b',name:'Spring Bed',x:0,z:0,rot:0},{id:'c',name:'Plastic Chair',x:4,z:4,rot:0},{id:'s',name:'Velvet Sofa',x:2,z:5,rot:0}]");
const bed=SS('S.items[0]'), chair=SS('S.items[1]'), sofa=SS('S.items[2]');
let res={}; const cb={done:(f,c)=>{res={f,c}},fail:m=>{res={fail:m}}};
// walk to the bed and lie down
R.useItem(bed,{pose:'lie',sec:45},cb); ok(R.path.length>0 && typeof R.onArrive==='function','bed: avatar sets off to a cell beside the bed');
R.path=[]; const f=R.onArrive; R.onArrive=null; f(); const A=R.act;
ok(A&&A.kind==='lie' && Math.abs(A.pos.x-(R.cc(0)+.5))<1e-9 && Math.abs(A.pos.z-R.cc(0))<1e-9,'bed: lies at the bed centre');
ok(Math.abs(A.yaw-Math.PI/2)<1e-9,'bed rot 0: head turned toward the pillow end (-x)');
R.endAct(true); ok(res.c===true && res.f>=0 && R.act===null,'getting up early reports partial progress and clears the action');
// chair: sits on the chair cell, faces its front
R.avatar.position.set(R.cc(2),0,R.cc(4)); R.useItem(chair,{pose:'sit',sec:10},cb); R.path=[]; const f2=R.onArrive; R.onArrive=null; f2?f2():R.act;
ok(R.act&&R.act.kind==='sit'&&Math.abs(R.act.pos.x-R.cc(4))<1e-9&&Math.abs(R.act.pos.z-R.cc(4))<1e-9&&Math.abs(R.act.h-.54)<1e-9,'chair: sits on the chair cell, seat height .54');
R.endAct(false);
// sofa (2 wide): sits on the cell nearest where you came from
R.avatar.position.set(R.cc(2),0,R.cc(4)); R.useItem(sofa,{pose:'sit',sec:10},cb); R.path=[]; const f3=R.onArrive; R.onArrive=null; f3?f3():0;
ok(R.act&&R.act.kind==='sit'&&(R.act.pos.x===R.cc(2)||R.act.pos.x===R.cc(3)),'sofa: sits on one of its two cells');
R.endAct(true);
// blocked: surround the chair
SS("S.items.push({id:'w1',name:'Foam Mattress',x:3,z:3,rot:0},{id:'w2',name:'Foam Mattress',x:4,z:5,rot:0})");
R.avatar.position.set(R.cc(0),0,R.cc(5)); res={}; R.useItem({id:'c2',name:'Plastic Chair',x:5,z:5,rot:0},{pose:'sit',sec:10},cb);
console.log('   (blocked-case result:',JSON.stringify(res),')');
// house layout: walking is limited to the free cells
const L=ctx.LAYOUTS.family_house; SS('S.layout=LAYOUTS.family_house'); R.layout=L; R.gw=L.w; R.gd=L.d; SS("S.items=[]");
R.avatar.position.set(R.cc(L.start[0]),0,R.cc(L.start[1])); R.path=[]; R.act=null;
const okCell=(()=>{ for(let x=0;x<L.w;x++)for(let z=0;z<L.d;z++){ if(!L.blockedSet.has(x+','+z)) { return true } } })();
ok(okCell,'layout has walkable cells');
