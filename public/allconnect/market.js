/* Street Market & Haggling UI (Balogun, Computer Village, Makola)
   Interacts with /api/ac/market for authentic street trade, haggling and wholesale reselling. */
const MARKET = {
  tab: 'stalls', // 'stalls' or 'bag'
  selectedStall: 'balogun_fabrics',
  data: null,
  haggled: {}, // itemId -> { finalPrice, quote, quality }

  async load() {
    try {
      const res = await NET.api('/api/ac/market');
      if (res && res.ok) {
        this.data = res;
        if (typeof res.cash === 'number') { S.cash = res.cash; render(); }
      }
    } catch (e) {
      console.warn('Market load error', e);
    }
    return this.data;
  },

  open() {
    PH.view = 'market';
    PH.shell('Street Market', 'PH.close()', '<div class="abody" id="ab"><p class="empty">Heading to the market…</p></div>');
    this.load().then(() => this.draw());
  },

  setTab(tab) {
    this.tab = tab;
    this.draw();
  },

  setStall(stallId) {
    this.selectedStall = stallId;
    this.draw();
  },

  async haggle(itemId) {
    const btn = document.getElementById('hgl_' + itemId);
    if (btn) { btn.disabled = true; btn.textContent = 'Pricin’…'; }
    try {
      const res = await NET.api('/api/ac/market/haggle', { method: 'POST', body: { itemId } });
      if (res && res.ok) {
        this.haggled[itemId] = {
          finalPrice: res.finalPrice,
          quote: res.quote,
          discount: res.discount,
          quality: res.quality
        };
        toast(res.quote);
        this.draw();
      }
    } catch (e) {
      toast(e.message || 'Haggling failed.');
      this.draw();
    }
  },

  async buy(itemId, price) {
    try {
      const res = await NET.api('/api/ac/market/buy', { method: 'POST', body: { itemId, price } });
      if (res && res.ok) {
        toast(`Bought ${res.item.name} for ₦${price.toLocaleString('en-NG')}! 🛍️`);
        if (typeof res.cash === 'number') { S.cash = res.cash; render(); }
        if (res.bag) this.data.bag = res.bag;
        delete this.haggled[itemId];
        this.draw();
      }
    } catch (e) {
      toast(e.message || 'Purchase failed.');
    }
  },

  async resell(bagItemId) {
    try {
      const res = await NET.api('/api/ac/market/resell', { method: 'POST', body: { bagItemId } });
      if (res && res.ok) {
        toast(`💰 Sold for ₦${res.resalePrice.toLocaleString('en-NG')} (+₦${res.netProfit.toLocaleString('en-NG')} profit!)`);
        if (typeof res.cash === 'number') { S.cash = res.cash; render(); }
        if (res.bag) this.data.bag = res.bag;
        this.draw();
      }
    } catch (e) {
      toast(e.message || 'Resale failed.');
    }
  },

  draw() {
    const ab = document.getElementById('ab');
    if (!ab || !this.data) return;
    const d = this.data;

    const seg = `
      <div style="display:flex; gap:8px; margin-bottom:14px; background:#f1f5f9; padding:4px; border-radius:12px;">
        <button onclick="MARKET.setTab('stalls')" style="flex:1; height:36px; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; ${this.tab === 'stalls' ? 'background:#075BFF; color:#fff;' : 'background:transparent; color:#64748b;'}">Market Stalls</button>
        <button onclick="MARKET.setTab('bag')" style="flex:1; height:36px; border:none; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; ${this.tab === 'bag' ? 'background:#075BFF; color:#fff;' : 'background:transparent; color:#64748b;'}">My Bag & Resell (${(d.bag || []).length})</button>
      </div>
    `;

    if (this.tab === 'bag') {
      let bagHtml = seg;
      const bag = d.bag || [];
      if (!bag.length) {
        bagHtml += `<p class="empty" style="text-align:center; padding:30px 10px; color:#64748b;">Your market bag is empty.<br>Buy fabrics, wholesale tech packs, or provisions to use or flip on the street!</p>`;
      } else {
        bagHtml += `<div class="lab2" style="font-size:11px; font-weight:800; color:#64748b; margin-bottom:10px;">ITEMS IN BAG</div>`;
        bagHtml += bag.map(item => {
          const resalePrice = Math.round((item.pricePaid * (item.resellBonus || 1.35)) / 100) * 100;
          const profit = resalePrice - item.pricePaid;
          return `
            <div class="jcard" style="background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:12px; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
              <span style="font-size:26px;">${item.emoji || '🛍️'}</span>
              <div style="flex:1;">
                <b style="font-size:14px; color:#0f172a;">${esc(item.name)}</b>
                <span style="display:block; font-size:11px; color:#64748b;">Paid: ₦${item.pricePaid.toLocaleString('en-NG')}</span>
              </div>
              <div style="text-align:right;">
                <b style="color:#059669; font-size:13px;">₦${resalePrice.toLocaleString('en-NG')}</b>
                <button onclick="MARKET.resell('${item.id}')" style="margin-top:4px; display:block; padding:4px 10px; font-size:11px; font-weight:700; background:#10b981; color:#fff; border:none; border-radius:6px; cursor:pointer;">
                  Flip (+₦${profit.toLocaleString('en-NG')})
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
      ab.innerHTML = bagHtml;
      return;
    }

    // Stalls Tab
    const stall = d.stalls.find(s => s.id === this.selectedStall) || d.stalls[0];

    let stallSelector = `
      <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; margin-bottom:12px;">
    `;
    d.stalls.forEach(s => {
      const active = s.id === stall.id;
      stallSelector += `
        <button onclick="MARKET.setStall('${s.id}')" style="white-space:nowrap; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid ${active ? '#075BFF' : '#cbd5e1'}; ${active ? 'background:#e0edff; color:#075BFF;' : 'background:#fff; color:#475569;'}">
          ${s.emoji} ${esc(s.market)}
        </button>
      `;
    });
    stallSelector += `</div>`;

    let h = seg + stallSelector;

    // Stall Banner
    h += `
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:14px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:32px;">${stall.emoji}</span>
          <div>
            <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">${esc(stall.name)}</h3>
            <span style="font-size:11px; color:#64748b;">Vendor: <b>${esc(stall.vendor)}</b> (${esc(stall.marketLocation)})</span>
          </div>
        </div>
        <p style="margin:8px 0 0; font-size:12px; color:#475569; line-height:1.4;">${esc(stall.blurb)}</p>
      </div>
    `;

    // Stall Items
    h += `<div class="lab2" style="font-size:11px; font-weight:800; color:#64748b; margin-bottom:10px;">AVAILABLE GOODS</div>`;
    h += stall.items.map(it => {
      const hgl = this.haggled[it.id];
      const currentPrice = hgl ? hgl.finalPrice : it.price;
      const isDiscounted = hgl && hgl.discount > 0;

      return `
        <div class="jcard" style="background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="display:flex; gap:10px; align-items:center;">
              <span style="font-size:26px;">${it.emoji || '📦'}</span>
              <div>
                <b style="font-size:14px; color:#0f172a;">${esc(it.name)}</b>
                <span style="display:block; font-size:11px; color:#64748b;">${it.category.toUpperCase()}</span>
              </div>
            </div>
            <div style="text-align:right;">
              ${isDiscounted ? `<s style="font-size:11px; color:#94a3b8;">₦${it.price.toLocaleString('en-NG')}</s><br>` : ''}
              <b style="font-size:15px; color:${isDiscounted ? '#10b981' : '#075BFF'};">₦${currentPrice.toLocaleString('en-NG')}</b>
            </div>
          </div>

          ${hgl ? `
            <div style="margin:10px 0; background:#f8fafc; border-left:3px solid ${isDiscounted ? '#10b981' : '#f59e0b'}; padding:8px 10px; border-radius:0 8px 8px 0; font-size:11px; color:#334155; font-style:italic;">
              ${esc(hgl.quote)}
            </div>
          ` : ''}

          <div style="display:flex; gap:8px; margin-top:10px;">
            <button id="hgl_${it.id}" onclick="MARKET.haggle('${it.id}')" style="flex:1; height:36px; border:1px solid #075BFF; background:#f0f6ff; color:#075BFF; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;">
              🤝 Haggle / Last Price
            </button>
            <button onclick="MARKET.buy('${it.id}', ${currentPrice})" style="flex:1; height:36px; border:none; background:#075BFF; color:#fff; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;">
              🛍️ Buy Now
            </button>
          </div>
        </div>
      `;
    }).join('');

    ab.innerHTML = h;
  }
};

window.MARKET = MARKET;
