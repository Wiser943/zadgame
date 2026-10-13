// Homes selector. Property catalogue, prices, ownership and furniture are server-authoritative.
const HOMES = {
  data: null,
  async open() { const panel=document.getElementById('homesPanel'); panel.style.display='flex'; await this.load(); },
  close() { const panel=document.getElementById('homesPanel'); if(panel) panel.style.display='none'; },
  async load() { const list=document.getElementById('homesList'); try { this.data=await NET.api('/api/ac/properties'); this.draw(); } catch(e) { list.innerHTML='<p>Could not load homes. Please try again.</p>'; } },
  money(n) { return '₦'+Number(n||0).toLocaleString('en-NG'); },
  draw() { const d=this.data; if(!d)return; const own=d.properties||[]; const active=S.activePropertyId; const rows=[];
    rows.push(`<div class="home-card"><div class="home-emoji">🛏️</div><div class="home-copy"><b>Starter Room</b><p>Your original AllConnect room and furniture are preserved.</p><small>Always available · Existing furniture</small></div><div class="home-actions"><button class="${!active?'secondary':''}" onclick="HOMES.enter('')">${!active?'Current home':'Enter'}</button></div></div>`);
    for(const h of d.catalogue||[]){ const p=own.find(x=>x.type===h.id&&!(x.tenure==='rent'&&x.leaseExpiresAt&&new Date(x.leaseExpiresAt)<=new Date())); const activeP=p&&p.id===active; const expired=p&&p.tenure==='rent'&&p.leaseExpiresAt&&new Date(p.leaseExpiresAt)<=new Date(); const price=h.mode==='rent'?h.rent:h.price; const term=h.mode==='rent'?`Rent · ${h.rentDays} days`:'Permanent ownership';
      rows.push(`<div class="home-card"><div class="home-emoji">🏡</div><div class="home-copy"><b>${this.esc(h.name)}</b><p>${this.esc(h.description)}</p><small>${term} · ${this.money(price)}</small>${p&&!expired?`<p>Owned/rented · ${p.items.length} furniture item${p.items.length===1?'':'s'}</p>`:''}</div><div class="home-actions">${p&&!expired?`<button onclick="HOMES.enter('${this.esc(p.id)}')">${activeP?'Current home':'Enter home'}</button>`:`<button onclick="HOMES.acquire('${this.esc(h.id)}')">${h.mode==='rent'?'Rent':'Buy'}</button>`}</div></div>`);
    }
    document.getElementById('homesList').innerHTML=rows.join('');
  },
  esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  async acquire(type){try{const r=await NET.api('/api/ac/properties/acquire',{method:'POST',body:{type}});applyAC(r.ac);this.data.properties=r.ac.properties||[];this.data.cash=r.ac.cash;this.draw();toast((r.property.tenure==='rent'?'Rented ':'Bought ')+r.property.name+' ✓');}catch(e){toast(e.message);}},
  enter(id){S.activePropertyId=id||'';const p=(S.properties||[]).find(x=>x.id===S.activePropertyId);S.activeProperty=p||null;S.items=p?p.items:(S.legacyItems||[]);setPaint(p?(p.paint||S.legacyPaint):S.legacyPaint);if(window.ROOM3D)ROOM3D.sync();if(window.BUY&&BUY.active)BUY.draw();this.close();toast(p?('Entered '+p.name):'Back to your starter room');}
};
window.HOMES=HOMES;
