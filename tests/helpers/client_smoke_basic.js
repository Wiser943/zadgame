const vm=require('vm'),fs=require('fs'),path=require('path');
const root='public/allconnect', ctx={console,setInterval,clearInterval,performance}; ctx.window=ctx; vm.createContext(ctx);
const run=(f)=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
// the browser puts `const S` in the shared script scope, NOT on window
vm.runInContext("const S = { items: [], grid: 6, layout: null };",ctx);
run('layouts.js'); run('furniture.js');
const ok=(c,m)=>{ if(!c){ console.log('FAIL',m); process.exitCode=1 } else console.log('ok  ',m) };
const F=ctx.FURN;
ok(F.canPlace([], 'Plastic Chair', 7, 7, 0)===false,'6x6: cell 7,7 rejected');
vm.runInContext("S.grid = 8;",ctx); ok(F.canPlace([], 'Plastic Chair', 7, 7, 0)===true,'after expansion (S.grid=8): 7,7 accepted');
vm.runInContext("S.grid = 6; S.layout = window.homeLayout({type:'family_house'});",ctx);
const L=vm.runInContext("S.layout",ctx); ok(L&&L.w===10&&L.d===14,'family_house layout found');
const [bx,bz]=L.blocked[0]; ok(F.canPlace([], 'Plastic Chair', bx, bz, 0)===false,'blocked cell rejected');
const [sx,sz]=L.start; ok(F.canPlace([], 'Plastic Chair', sx, sz, 0)===true,'start cell accepted');
ok(!!F.autoPlace([], 'Plastic Chair'),'autoPlace finds a spot');
// models3d: hooks install on ROOM3D
ctx.ROOM3D={ buildAvatar(){ this.avatar={children:[]} }, animate(){ this.called='old' }, sync(){}, paint(){} , load(){return Promise.resolve()} };
ctx.WebGLRenderingContext=function(){}; ctx.localStorage={getItem(){return null},setItem(){}};
run('models3d.js'); ok(ctx.M3D&&ctx.ROOM3D._m3d===true,'models3d installed its hooks on ROOM3D');
ctx.ROOM3D.animate(0,.016,false); ok(ctx.ROOM3D.called==='old','without a loaded GLB, the old animate still runs (fallback)');
ok(ctx.M3D.charKey('male')==='casual'&&ctx.M3D.charKey('female')==='woman','default characters: casual (m) / woman (f)');
// ---- USE (tap-to-use sheet) with stubs
const html={}; ctx.document={ getElementById(){return null}, body:{parentNode:null,appendChild(e){}}, createElement(){ const e={style:{},set innerHTML(v){this._h=v},get innerHTML(){return this._h}}; return e } };
ctx.document.body.parentNode={appendChild(){}};
vm.runInContext("S.items=[{id:'b1',name:'Spring Bed',x:0,z:0,rot:0},{id:'c1',name:'Plastic Chair',x:3,z:3,rot:0},{id:'l1',name:'Standing Lamp',x:5,z:5,rot:0}]; S.needs=[.5,.2,.5,.5,.5,.5]; let _t=[]; function toast(t){_t.push(t)} function render(){}",ctx);
run('use.js'); const U=ctx.USE;
ok(U.actsFor({name:'Spring Bed'}).map(a=>a.id).join()==='sleep,nap,liein,dress','bed: sleep / nap / lie in / change outfit');
ok(U.actsFor({name:'Plastic Chair'}).map(a=>a.id).join()==='sit,rest','chair: sit / rest');
ok(U.actsFor({name:'Velvet Sofa'}).length===3 && U.actsFor({name:'Lounge Armchair'}).length===3,'sofa + armchair: sit / rest / chill');
ok(U.actsFor({name:'Standing Lamp'}).length===0 && U.open('l1')===false,'item with nothing to do: no sheet');
ok(U.open('b1')===true && /Sleep/.test(U.el.innerHTML) && /45 s/.test(U.el.innerHTML) && /\+60/.test(U.el.innerHTML),'tapping the bed opens the sheet with Sleep 45 s +60');
let called=null; ctx.ROOM3D.useItem=(it,act,cb)=>{called={it,act,cb}}; ctx.ROOM3D.act=null; ctx.ROOM3D.endAct=()=>{};
U.run('b1','sleep'); ok(called&&called.act.pose==='lie'&&called.it.id==='b1','choosing Sleep asks the room to walk over and lie down');
called.cb.done(1,false); ok(Math.abs(vm.runInContext("S.needs[1]",ctx)-.8)<1e-9,'finishing Sleep: energy .2 -> .8');
called.cb.done(.5,true); ok(Math.abs(vm.runInContext("S.needs[1]",ctx)-1)<1e-9,'needs are capped at 1');
vm.runInContext("S.needs[5]=.1",ctx); U.run('c1','rest'); called.cb.done(.5,true); ok(Math.abs(vm.runInContext("S.needs[1]",ctx)-1)<1e-9,'chair rest early exit applies partial effect (capped)');
clearInterval(U.timer);
