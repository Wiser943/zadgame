/* Daily 5-Pillar Hustle UI (Phone -> Hustle / Gigs)
   Interacts with /api/ac/hustle to track daily grind, life, link, learn and step tasks. */
const HUSTLE = {
  data: null,
  timer: null,
  async load() {
    try {
      const res = await NET.api('/api/ac/hustle');
      if (res && res.ok) {
        this.data = res.state;
        if (typeof res.cash === 'number') { S.cash = res.cash; render(); }
      }
    } catch (e) {
      console.warn('Hustle load error', e);
    }
    return this.data;
  },
  open() {
    PH.view = 'hustle';
    PH.shell('Daily Hustle', 'PH.close()', '<div class="abody" id="ab"><p class="empty">Loading your hustle card…</p></div>');
    this.load().then(() => this.draw());
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (PH.view === 'hustle') this.tick();
      }, 1000);
    }
  },
  tick() {
    if (!this.data || !this.data.pillars) return;
    let changed = false;
    this.data.pillars.forEach(p => {
      if (p.cooldownLeft > 0) {
        p.cooldownLeft--;
        changed = true;
      }
    });
    if (changed) this.drawButtonsOnly();
  },
  drawButtonsOnly() {
    this.data.pillars.forEach(p => {
      const btn = document.getElementById('hbtn_' + p.id);
      if (!btn) return;
      if (p.done) {
        btn.textContent = 'Done ✓';
        btn.disabled = true;
      } else if (p.cooldownLeft > 0) {
        btn.textContent = `Wait ${p.cooldownLeft}s`;
        btn.disabled = true;
      } else {
        btn.textContent = `Hustle (+₦${p.cash.toLocaleString('en-NG')})`;
        btn.disabled = false;
      }
    });
  },
  async doPillar(pillarId) {
    const btn = document.getElementById('hbtn_' + pillarId);
    if (btn) { btn.disabled = true; btn.textContent = 'Hustling…'; }
    try {
      const res = await NET.api('/api/ac/hustle/do', { method: 'POST', body: { pillar: pillarId } });
      if (res && res.ok) {
        toast(`🔥 +₦${res.earnedCash.toLocaleString('en-NG')} (${res.flavor})`);
        if (res.breakthrough) {
          toast('💎 WINDFALL BREAKTHROUGH! +₦100,000 grant!');
        } else if (res.bonusAwarded) {
          toast('🌟 5/5 Pillars complete! +₦20,000 bonus cash!');
        }
        this.data = res.state;
        if (typeof res.cash === 'number') { S.cash = res.cash; render(); }
        this.draw();
      }
    } catch (e) {
      toast(e.message || 'Could not complete task.');
      this.load().then(() => this.draw());
    }
  },
  draw() {
    const ab = document.getElementById('ab');
    if (!ab || !this.data) return;
    const d = this.data;
    const pct = Math.round((d.completedCount / Math.max(1, d.totalPillars)) * 100);

    let h = `
      <div class="jmine" style="background:linear-gradient(135deg, #1b2838, #0e1722); color:#fff; border-radius:18px; padding:16px; margin-bottom:16px; box-shadow:0 8px 24px rgba(0,0,0,0.15);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:800; letter-spacing:1px; color:#ffc400;">DAILY LAGOS HUSTLE</span>
          <span style="font-size:12px; font-weight:700; background:rgba(255,255,255,0.15); padding:3px 8px; border-radius:12px;">🔥 ${d.streak} Day Streak</span>
        </div>
        <h3 style="margin:8px 0 4px; font-size:19px; font-weight:800;">${d.allDone ? 'All 5 Completed! 🎉' : `${d.completedCount}/5 Pillars Crushed`}</h3>
        <p style="margin:0 0 10px; font-size:12px; color:#b0c0d0;">Complete all 5 daily moves to trigger the ₦20,000 completion bonus and chance for a ₦100,000 breakthrough.</p>
        <div class="jbar" style="background:rgba(255,255,255,0.12); height:8px; border-radius:4px; overflow:hidden;">
          <u style="display:block; height:100%; width:${pct}%; background:#10b981; border-radius:4px; transition:width .3s;"></u>
        </div>
      </div>
    `;

    h += d.pillars.map(p => {
      const isDone = p.done;
      const cd = p.cooldownLeft;
      const btnText = isDone ? 'Done ✓' : cd > 0 ? `Wait ${cd}s` : `Hustle (+₦${p.cash.toLocaleString('en-NG')})`;
      const btnStyle = isDone ? 'background:#e2e8f0; color:#64748b;' : cd > 0 ? 'background:#cbd5e1; color:#94a3b8;' : 'background:#075BFF; color:#fff;';

      return `
        <div class="jcard" style="background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:14px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:28px; width:44px; height:44px; display:grid; place-items:center; background:#f8fafc; border-radius:12px;">${p.emoji}</span>
            <div style="flex:1;">
              <b style="font-size:15px; color:#0f172a;">${esc(p.name)}</b>
              <span style="display:block; font-size:11px; color:#64748b;">${esc(p.tagline)}</span>
            </div>
            <div style="text-align:right;">
              <b style="color:#059669; font-size:14px;">+₦${p.cash.toLocaleString('en-NG')}</b>
              <span style="display:block; font-size:10px; color:#94a3b8;">+${p.xp} XP</span>
            </div>
          </div>
          <p style="margin:10px 0 12px; font-size:12px; color:#475569; line-height:1.4;">${esc(p.desc)}</p>
          <button id="hbtn_${p.id}" onclick="HUSTLE.doPillar('${p.id}')" ${isDone || cd > 0 ? 'disabled' : ''} style="width:100%; height:40px; border-radius:10px; border:none; font-weight:700; font-size:13px; cursor:pointer; ${btnStyle}">
            ${btnText}
          </button>
        </div>
      `;
    }).join('');

    ab.innerHTML = h;
  }
};

window.HUSTLE = HUSTLE;
