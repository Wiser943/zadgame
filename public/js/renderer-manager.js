/* GameHub renderer manager: no React/build step. DOM is always the fallback. */
window.GameHubRenderers = (() => {
  const sources = {
    phaser: 'https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js',
    pixi: 'https://cdn.jsdelivr.net/npm/pixi.js@8.2.5/dist/pixi.min.js',
    three: 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.min.js'
  };
  let active = null;
  const canWebGL = () => { try { const c=document.createElement('canvas'); return !!(c.getContext('webgl')||c.getContext('experimental-webgl')); } catch { return false; } };
  const load = name => new Promise((resolve,reject) => {
    if (window.Phaser && name==='phaser' || window.PIXI && name==='pixi' || window.THREE && name==='three') return resolve();
    const old=document.querySelector(`script[data-gh-renderer="${name}"]`); if(old) return old.addEventListener('load',()=>resolve(),{once:true});
    const s=document.createElement('script'); s.src=sources[name]; s.dataset.ghRenderer=name; s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
  });
  // Only Snakes & Ladders uses a WebGL renderer now (see js/snakes.js); everything else is plain DOM.
  function choice(game) { return game === 'snakes' && canWebGL() ? 'phaser' : 'dom'; }
  function badge(root,name){ const b=document.createElement('small'); b.className='renderer-badge'; b.textContent=name==='dom'?'Classic':`${name} enhanced`; root.appendChild(b); }
  function phaser(root, game, state) {
    const host=document.createElement('div'); host.className='render-layer'; root.appendChild(host);
    const config={type:Phaser.AUTO,width:Math.min(root.clientWidth||420,520),height:Math.min(root.clientWidth||420,520),parent:host,transparent:true,scene:{create(){this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');this.draw=()=>{this.children.removeAll();const w=this.scale.width,h=this.scale.height;this.add.rectangle(w/2,h/2,w-10,h-10,0x8f1017,.16).setStrokeStyle(3,0xf7c52b,.7);if(game==='snakes'){for(let i=0;i<10;i++)for(let j=0;j<10;j++)this.add.rectangle(25+j*w/10,25+i*h/10,w/10-2,h/10-2,0xffffff,.08).setOrigin(.5);(state.positions||[]).forEach((p,i)=>{const x=((p-1)%10+.5)*w/10,y=(9-Math.floor((p-1)/10)+.5)*h/10;this.add.circle(x,y,Math.max(8,w/55),i?0x3d8de8:0xf7c52b);});}else if(game==='ludo'){(state.tokens||[]).forEach((row,i)=>row.forEach((pos,j)=>{if(pos>0){const x=(pos%14+1)*w/16,y=(i+1)*h/5;this.add.circle(x,y,Math.max(7,w/48),[0xf7c52b,0x3d8de8,0x44b86b,0xe64e4e][i]||0xffffff);} }));}else{for(let i=0;i<7;i++)this.add.circle((i+1)*w/8,h*.8,Math.max(8,w/42),0x3d8de8);}};this.draw();},update(){if(this.draw)this.draw();}}};
    active=new Phaser.Game(config); badge(root,'Phaser');
  }
  async function pixi(root, game, state) {
    const host=document.createElement('div'); host.className='render-layer'; root.appendChild(host); const app=new PIXI.Application();
    await app.init({width:Math.min(root.clientWidth||420,520),height:260,backgroundAlpha:0,antialias:true}); host.appendChild(app.canvas);
    const g=new PIXI.Graphics(); app.stage.addChild(g); const w=app.renderer.width,h=app.renderer.height; g.roundRect(5,5,w-10,h-10,18).fill({color:0xf7c52b,alpha:.08}).stroke({color:0xf7c52b,width:3,alpha:.45});
    if(game==='dominoes') (state.chain||[]).forEach((t,i)=>g.roundRect(18+i*48,h/2-30,42,60,6).fill(0xffffff).stroke(0x8f1017).moveTo(18+i*48+21,h/2-30).lineTo(18+i*48+21,h/2+30));
    else if(game==='words') (state.words||[]).slice(-8).forEach((wrd,i)=>g.roundRect(20+i*55,35,48,48,7).fill(0xf7c52b).stroke(0x8f1017));
    else (state.hand||[]).forEach((_,i)=>g.roundRect(20+i*48,h/2-30,40,60,6).fill(0xb3141c).stroke(0xf7c52b));
    badge(root,'PixiJS'); active=app;
  }
  async function three(root, game, state) {
    const host=document.createElement('div'); host.className='render-layer'; root.appendChild(host); const w=Math.min(root.clientWidth||420,520),h=280;
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true}); renderer.setSize(w,h); host.appendChild(renderer.domElement); const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,w/h,.1,100);camera.position.set(0,5,8);camera.lookAt(0,0,0);scene.add(new THREE.HemisphereLight(0xffffff,0x552222,2));
    const board=new THREE.Mesh(new THREE.BoxGeometry(6,.25,4.5),new THREE.MeshStandardMaterial({color:0x8f1017,roughness:.7}));scene.add(board);
    const count=game==='mancala'?12:game==='checkers'?24:16; for(let i=0;i<count;i++){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.12,24),new THREE.MeshStandardMaterial({color:i%2?0xf7c52b:0x3d8de8}));mesh.position.set((i%8)-3.5,.25,Math.floor(i/8)-1.5);scene.add(mesh);} 
    let t=0;(function loop(){if(!host.isConnected)return;t+=.01;board.rotation.y=Math.sin(t)*.04;renderer.render(scene,camera);requestAnimationFrame(loop);})(); badge(root,'Three.js'); active=renderer;
  }
  const ENHANCED=new Set(); // games with a real overlay here; Snakes & Ladders has its own renderer (js/snakes.js) that uses load('phaser')
  async function mount(root,game,state){ if(!root||!ENHANCED.has(game))return; if(active?.destroy)try{active.destroy(true)}catch{}; root.querySelectorAll('.render-layer,.renderer-badge').forEach(x=>x.remove()); const c=choice(game); if(c==='dom'){badge(root,'dom');return;} try{if(c==='phaser')phaser(root,game,state);else if(c==='pixi')await pixi(root,game,state);else await three(root,game,state);}catch(e){console.warn('[renderer]',e.message);root.querySelectorAll('.render-layer').forEach(x=>x.remove());badge(root,'dom fallback');} }
  return {mount,choice,canWebGL,load};
})();
