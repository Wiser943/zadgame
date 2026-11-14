/* ===================== Drive Race: the menus =====================
   Title, main menu, garage (upgrade, powerups, switch car, switch driver), career series with stars, pre-race, results,
   friends and quick race lobbies, the weekly board, settings, daily reward. Progress (coins, gems, tickets, stars, upgrades) is kept on the phone.
   Plugs into the 3D race (driverace.js) through DRACE.attachMenu(). */
const RACEMENU = (() => {
  'use strict';
  let ui = null, api = null, ok3d = true, screen = '', hist = [], modal = null, dlg = null, ctx = {}, tipI = 0, timers = [], board = null;
  const RT = RaceTrack, esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const COLORS = ['#e5484d', '#f2b705', '#2f7fd8', '#22b573', '#8e5bd1', '#ff7a29', '#14b8c4', '#e84393', '#8d6e63', '#9aa3b2'];
  const CARS = [{ id: 'buggy', name: 'Dune Buggy', cost: 0, blurb: 'Balanced and tough.' }, { id: 'danfo', name: 'Danfo', cost: 600, blurb: 'Big, loud and a little slow off the line.' }, { id: 'taxi', name: 'Taxi', cost: 900, blurb: 'Fast on the straights.' }, { id: 'keke', name: 'Keke', cost: 1200, blurb: 'Light, quick to turn.' }];
  const DRIVER_COST = 300;
  const PU = ['nitro', 'shield', 'oil', 'rocket', 'goslow', 'mega'];
  const UP = [['speed', 'Speed', '🏎️'], ['acc', 'Acceleration', '⚡'], ['hand', 'Handling', '🎯']];
  const UP_COST = [150, 300, 600, 1100, 1800], PU_COST = [250, 500, 1000, 2000];
  const TIPS = ['Hold DRIFT while steering to charge a boost, then let go.', 'Yellow pads on the road give a free boost.', 'Upgrade your car\'s acceleration to get a head start on your competition.', 'Drive through the ? bubbles to collect power-ups. You can hold two.', 'Races with 2 or more real players are ranked and count for the weekly board.', 'Upgrade a power-up in the Powerups screen to make it last longer.', 'Tired of buttons? Turn on Tilt in Settings and steer like a wheel.'];
  const SERIES = [
    { id: 'easy', name: 'Easy Street', need: 0, races: [{ track: 'beach', laps: 2, level: 1, grid: 6, reward: 150 }, { track: 'harbor', laps: 2, level: 1, grid: 6, reward: 170 }, { track: 'market', laps: 2, level: 1, grid: 6, reward: 190, need: 1 }, { track: 'beach', laps: 3, level: 2, grid: 6, reward: 220, need: 3 }, { track: 'harbor', laps: 3, level: 2, grid: 6, reward: 250, need: 5 }, { track: 'market', laps: 3, level: 2, grid: 8, reward: 320, need: 8, driver: 6 }] },
    { id: 'sunset', name: 'Sunset Road', need: 12, races: [{ track: 'harbor', laps: 3, level: 2, grid: 8, reward: 300 }, { track: 'market', laps: 3, level: 2, grid: 8, reward: 330 }, { track: 'beach', laps: 3, level: 2, grid: 8, reward: 360, need: 21 }, { track: 'harbor', laps: 4, level: 3, grid: 8, reward: 400, need: 24 }, { track: 'market', laps: 4, level: 3, grid: 8, reward: 440, need: 27 }, { track: 'beach', laps: 4, level: 3, grid: 10, reward: 520, need: 30 }] },
    { id: 'gp', name: 'Grand Prix', need: 30, races: [{ track: 'market', laps: 4, level: 3, grid: 10, reward: 500 }, { track: 'harbor', laps: 4, level: 3, grid: 10, reward: 540 }, { track: 'beach', laps: 5, level: 3, grid: 10, reward: 600, need: 38 }, { track: 'market', laps: 5, level: 3, grid: 10, reward: 650, need: 42 }, { track: 'harbor', laps: 5, level: 3, grid: 10, reward: 700, need: 46 }, { track: 'beach', laps: 5, level: 3, grid: 10, reward: 900, need: 50 }] }
  ];
  const TOTAL_STARS = SERIES.length * 6 * 3;

  /* ---------- progress kept on the phone ---------- */
  const KEY = 'drace.save.v1';
  const fresh = () => ({ v: 1, coins: 300, gems: 10, tix: { n: 6, at: Date.now() }, stars: {}, best: {}, car: { type: 'buggy', color: COLORS[0], up: { speed: 0, acc: 0, hand: 0 } }, cars: ['buggy'], driver: 0, drivers: [0], pu: { nitro: 1, shield: 1, oil: 1, rocket: 1, goslow: 1, mega: 1 }, seen: {}, daily: { last: '', streak: 0 }, chal: { day: '', id: 0, prog: 0, done: false }, stats: { races: 0, wins: 0 } });
  let SAVE = fresh();
  function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1) { SAVE = Object.assign(fresh(), o); SAVE.car = Object.assign(fresh().car, o.car); SAVE.car.up = Object.assign({ speed: 0, acc: 0, hand: 0 }, o.car && o.car.up); SAVE.pu = Object.assign(fresh().pu, o.pu); SAVE.tix = Object.assign(fresh().tix, o.tix); } } catch (e) { SAVE = fresh(); } }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(SAVE)); } catch (e) { /* storage can be blocked */ } };
  const TIX_EVERY = 5 * 60 * 1000, TIX_MAX = 6;
  function tickets() { const t = SAVE.tix, now = Date.now(); if (t.n < TIX_MAX) { const add = Math.floor((now - t.at) / TIX_EVERY); if (add > 0) { t.n = Math.min(TIX_MAX, t.n + add); t.at += add * TIX_EVERY; if (t.n >= TIX_MAX) t.at = now; } } else t.at = now; return t.n; }
  const starsOf = (id) => SAVE.stars[id] || 0;
  const totalStars = () => Object.values(SAVE.stars).reduce((a, b) => a + b, 0);
  const seriesStars = (s) => s.races.reduce((a, _, i) => a + starsOf(s.id + i), 0);
  const raceNeed = (s, i) => s.races[i].need || 0;
  const raceOpen = (s, i) => seriesUnlocked(s) && totalStars() >= raceNeed(s, i);
  const seriesUnlocked = (s) => totalStars() >= s.need;
  const day = () => new Date().toISOString().slice(0, 10);
  const pushStyle = () => { api.setStyle({ type: SAVE.car.type, color: SAVE.car.color, driver: SAVE.driver, levels: SAVE.pu }); api.applyCar(SAVE); };

  /* ---------- look ---------- */
  const CSS = `
  #drace .dr-ui{position:absolute;inset:0;z-index:10;pointer-events:none}
  #drace .dr-ui *{box-sizing:border-box}
  #drace .scr{position:absolute;inset:0;pointer-events:none}
  #drace .scr>*{pointer-events:auto}
  #drace .t{color:#fff}
  #drace button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
  #drace .tt{color:#fff;-webkit-text-stroke:@4 #0b2a66;paint-order:stroke fill;text-shadow:0 @3 0 #0b2a66}
  #drace .panel{background:linear-gradient(#2f7cf0 0%,#1757c9 55%,#1247ad 100%);border:@5 solid #0b2a7a;border-radius:@24;box-shadow:inset 0 @3 0 rgba(255,255,255,.4),inset 0 @-6 0 rgba(0,0,0,.18),0 @6 0 #081f5a,0 @12 @20 rgba(0,0,0,.4)}
  #drace .panel.dark{background:linear-gradient(#1a54b8,#0f3a8c);}
  #drace .topbar{position:absolute;left:0;right:0;top:@6;height:@46;display:flex;align-items:center;justify-content:center;gap:@10;pointer-events:none}
  #drace .topbar>*{pointer-events:auto}
  #drace .pill{height:@38;min-width:@104;padding:0 @10 0 @12;border-radius:@8;background:linear-gradient(#17479f,#0d2f72);border:@3 solid #0a2260;box-shadow:inset 0 @2 0 rgba(255,255,255,.2);display:flex;align-items:center;justify-content:space-between;gap:@8;font-size:@22}
  #drace .pill b{font-weight:400;color:#fff;-webkit-text-stroke:@3 #06163d;paint-order:stroke fill}
  #drace .pill.a{min-width:@124}
  #drace .coin-i,#drace .gem-i,#drace .tix-i{display:inline-block;width:@34;height:@34;margin:@-6 @-8 @-6 0;flex:none}
  #drace .coin-i{border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3a0,#ffc928 45%,#c98a00);border:@3 solid #8a5a00;box-shadow:0 @2 0 #5a3a00;position:relative}
  #drace .coin-i::after{content:'';position:absolute;left:28%;top:34%;width:44%;height:30%;border-bottom:@3 solid #8a5a00;border-radius:0 0 50% 50%}
  #drace .gem-i{background:linear-gradient(135deg,#e7c4ff,#9b4fe0 55%,#5b2a9e);clip-path:polygon(50% 0,92% 30%,78% 88%,50% 100%,22% 88%,8% 30%);filter:drop-shadow(0 @2 0 #2a1052)}
  #drace .tix-i{background:linear-gradient(#59d86a,#1fa13a);border:@3 solid #0e6a22;border-radius:@6;transform:rotate(-8deg);position:relative}
  #drace .tix-i::after{content:'★';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ffe85a;font-size:@18}
  #drace .gift{width:@54;height:@46;border:0;background:none;font-size:@38;padding:0;filter:drop-shadow(0 @3 0 rgba(0,0,0,.35))}
  #drace .gift.new{animation:bump 1.2s infinite}
  @keyframes bump{50%{transform:scale(1.14) rotate(-6deg)}}
  #drace .rb{position:absolute;left:@12;top:@8;width:@58;height:@58;border-radius:50%;border:@4 solid #0b2a7a;background:radial-gradient(#3b8cff,#1257d1);color:#fff;font-size:@26;padding:0;box-shadow:0 @4 0 #081f5a;z-index:3}
  #drace .rb small{position:absolute;left:0;right:0;bottom:@-18;font-size:@15;-webkit-text-stroke:@3 #0b2a66;paint-order:stroke fill}
  #drace .ib{position:relative;width:@98;height:@104;border:0;background:none;padding:0;color:#fff;text-align:center}
  #drace .ib .tile{display:flex;width:@84;height:@84;margin:0 auto;border-radius:@18;border:@4 solid #0b2a7a;background:linear-gradient(#3b8cff,#1257d1);box-shadow:inset 0 @2 0 rgba(255,255,255,.45),0 @4 0 #081f5a;align-items:center;justify-content:center;font-size:@46}
  #drace .ib small{display:block;margin-top:@2;font-size:@18;font-weight:400;-webkit-text-stroke:@3 #0b2a66;paint-order:stroke fill;white-space:nowrap}
  #drace .ib .bad{position:absolute;right:@2;top:@-4;width:@28;height:@28;border-radius:50%;background:#e5242b;border:@3 solid #fff;font-size:@18;line-height:@22;text-align:center;box-shadow:0 0 @10 #ff6b6b}
  #drace .ib.off .tile{filter:grayscale(1);opacity:.7}
  #drace .oval{position:relative;width:@188;height:@118;border:0;background:none;padding:0;color:#fff}
  #drace .oval::before{content:'';position:absolute;left:@6;right:@6;top:@8;bottom:@22;border-radius:50%;background:conic-gradient(from 45deg,#1a62d6 0 25%,#2f86f6 0 50%,#1a62d6 0 75%,#2f86f6 0) 0 0/@40 @40;border:@5 solid #0b2a7a;box-shadow:inset 0 @3 0 rgba(255,255,255,.4),0 @5 0 #081f5a}
  #drace .oval .fl{position:absolute;left:0;right:0;top:@10;font-size:@60;filter:drop-shadow(0 @4 0 rgba(0,0,0,.35))}
  #drace .oval small{position:absolute;left:0;right:0;bottom:@-2;font-size:@30;font-weight:400;-webkit-text-stroke:@4 #0b2a66;paint-order:stroke fill}
  #drace .oval.off::before{filter:grayscale(1)}
  #drace .row-b{position:absolute;left:@10;right:@10;bottom:@4;display:flex;align-items:flex-end;justify-content:space-between}
  #drace .row-b .g{display:flex;gap:@8;align-items:flex-end}
  #drace .logo{position:absolute;left:0;right:0;top:@14;text-align:center;pointer-events:none}
  #drace .logo .a{display:block;font-size:@104;line-height:@92;color:#ffd21f;-webkit-text-stroke:@10 #b3210d;paint-order:stroke fill;text-shadow:0 @8 0 #7a1608;transform:rotate(-4deg)}
  #drace .logo .b{display:block;font-size:@108;line-height:@88;color:#fff;-webkit-text-stroke:@10 #1e2a5a;paint-order:stroke fill;text-shadow:0 @8 0 #10163a;margin-top:@-8}
  #drace .logo .fl{display:block;font-size:@46;margin-top:@-14;letter-spacing:@40}
  #drace .sign{position:absolute;left:50%;top:@78;transform:translateX(-50%);width:@430;height:@240;background:linear-gradient(#a8743c,#855524);border:@6 solid #5a3513;border-radius:@12;box-shadow:0 @8 0 #3a210a,0 @14 @20 rgba(0,0,0,.4);display:flex}
  #drace .sign .art{width:@170;margin:@10 0 @10 @10;border-radius:@8;background:linear-gradient(135deg,#ff9d2e,#e5484d);display:flex;align-items:center;justify-content:center;font-size:@78;transform:rotate(-3deg);border:@4 solid #fff4d6}
  #drace .sign .note{flex:1;margin:@14 @14 @14 @10;background:#f6ecd2;border-radius:@8;padding:@12 @14;color:#3a2a14;font-family:"Patrick Hand","Comic Sans MS",system-ui,sans-serif;font-size:@16;line-height:1.25;text-align:center;box-shadow:inset 0 0 @16 rgba(120,80,20,.35)}
  #drace .sign .note b{display:block;font-size:@22;margin-bottom:@6;color:#2a1c0a;font-family:inherit}
  #drace .side{position:absolute;top:@170;width:@120;text-align:center;border:0;background:none;color:#fff;padding:0}
  #drace .side .r{display:block;width:@112;height:@112;margin:0 auto;border-radius:@18;background:linear-gradient(#3b8cff,#1257d1);border:@4 solid #0b2a7a;box-shadow:0 @4 0 #081f5a;font-size:@64;line-height:@100}
  #drace .side em{position:absolute;left:@-6;top:@-14;font-style:normal;background:#e5242b;border:@3 solid #fff;border-radius:@6;padding:0 @8;font-size:@17;transform:rotate(-12deg)}
  #drace .side small{display:block;margin-top:@4;font-size:@17;-webkit-text-stroke:@3 #0b2a66;paint-order:stroke fill}
  #drace .modal{position:absolute;inset:0;z-index:20;background:rgba(5,12,40,.55);display:flex;align-items:center;justify-content:center;pointer-events:auto}
  #drace .modal .panel{position:relative;padding:@18 @22 @20;max-width:96%;max-height:94%;overflow:auto}
  #drace .modal h2{margin:0 0 @10;font-size:@34;text-align:center;font-weight:400}
  #drace .x{position:absolute;right:@10;top:@10;width:@38;height:@38;border-radius:50%;border:@3 solid #0b2a7a;background:radial-gradient(#ff6b6b,#d91c2b);color:#fff;font-size:@18;padding:0;z-index:2}
  #drace .btn{display:inline-flex;align-items:center;justify-content:center;gap:@8;min-width:@110;height:@46;padding:0 @18;border-radius:@14;border:@4 solid #0a5a22;background:linear-gradient(#5be06c,#1fa13a);color:#fff;font-size:@22;-webkit-text-stroke:@3 #0a4a1c;paint-order:stroke fill;box-shadow:inset 0 @2 0 rgba(255,255,255,.5),0 @4 0 #08481a}
  #drace .btn.blue{border-color:#0b2a7a;background:linear-gradient(#4b9bff,#1a62d6);-webkit-text-stroke-color:#0b2a66;box-shadow:inset 0 @2 0 rgba(255,255,255,.5),0 @4 0 #081f5a}
  #drace .btn.gold{border-color:#7a5200;background:linear-gradient(#ffe36a,#f0a400);-webkit-text-stroke-color:#6a4300;box-shadow:inset 0 @2 0 rgba(255,255,255,.6),0 @4 0 #5a3a00}
  #drace .btn.red{border-color:#7a0f16;background:linear-gradient(#ff6b6b,#d91c2b);-webkit-text-stroke-color:#5a0d12}
  #drace .btn:disabled,#drace .btn.off{filter:grayscale(.85);opacity:.7}
  #drace .btn:active,#drace .ib:active .tile,#drace .oval:active{transform:translateY(@2) scale(.98)}
  #drace .seg{display:flex;gap:@6}
  #drace .seg button{flex:1;height:@31;border-radius:@10;border:@3 solid #0a2260;background:linear-gradient(#17479f,#0d2f72);color:#cfe0ff;font-size:@16;padding:0 @8;box-shadow:inset 0 @2 0 rgba(255,255,255,.18)}
  #drace .seg button.on{background:linear-gradient(#ffe36a,#f0a400);border-color:#7a5200;color:#3a2600}
  #drace .lab{font-size:@14;opacity:.85;letter-spacing:.04em;margin:@4 0 @2}
  #drace .star{width:@46;height:@46;filter:drop-shadow(0 @3 0 rgba(0,0,0,.35))}
  #drace .star.e path{fill:#1a45b0;stroke:#0b2a7a}
  #drace .stars{display:flex;justify-content:center;gap:@10}
  #drace .stars .star:nth-child(2){transform:translateY(@-12) scale(1.12)}
  #drace .tiles{position:absolute;left:50%;top:@84;transform:translateX(-50%);display:grid;grid-template-columns:repeat(3,@100);gap:@10 @10}
  #drace .tl{position:relative;height:@100;border-radius:@14;border:@4 solid #0b2a7a;background:linear-gradient(#2a74e8,#123f9c);color:#fff;padding:0;box-shadow:inset 0 @2 0 rgba(255,255,255,.35),0 @4 0 #081f5a;overflow:visible}
  #drace .tl .n{font-size:@60;line-height:@90;opacity:.55;display:block}
  #drace .tl .s{position:absolute;left:0;right:0;top:@-12;display:flex;justify-content:center;gap:@-2}
  #drace .tl .s .star{width:@30;height:@30}
  #drace .tl.lock{background:linear-gradient(#143a85,#0b2561)}
  #drace .tl.lock .n{opacity:1;font-size:@58}
  #drace .tl.lock small{position:absolute;left:0;right:0;bottom:@6;font-size:@20;color:#ffd21f;-webkit-text-stroke:@3 #06163d;paint-order:stroke fill}
  #drace .ban{position:absolute;left:0;right:0;bottom:0;height:@56;background:linear-gradient(rgba(14,52,140,.92),rgba(8,32,92,.96));border-top:@4 solid #0b2a7a;display:flex;align-items:center;justify-content:space-between;padding:0 @28;font-size:@34}
  #drace .arr{position:absolute;top:@170;width:@62;height:@62;border-radius:50%;border:@4 solid #0b2a7a;background:radial-gradient(#3b8cff,#1257d1);color:#fff;font-size:@28;padding:0}
  #drace .hint{font-size:@13;opacity:.85;line-height:1.3}
  #drace .err{color:#ffb3b3;font-size:@15;min-height:@18}
  #drace table{width:100%;border-collapse:collapse;font-size:@17}
  #drace td,#drace th{padding:@4 @8;text-align:left;white-space:nowrap}
  #drace th{opacity:.7;font-size:@13;font-weight:400}
  #drace tr.me{background:rgba(255,226,90,.28)}
  #drace .rr{display:flex;align-items:center;gap:@10;height:@50;padding:0 @14;margin:@3 0;border-radius:@6;background:linear-gradient(rgba(20,70,170,.6),rgba(10,40,110,.75));font-size:@24}
  #drace .rr.me{background:linear-gradient(#2f86f6,#1a62d6);box-shadow:0 0 0 @2 #ffd23f}
  #drace .rr b{font-weight:400;width:@28}
  #drace .rr .nm{flex:1}
  #drace .rr .ca{width:@124;font-size:@17;color:#ffd21f;text-align:center}
  #drace .rr .tm{width:@100;text-align:right;font-size:@20}
  #drace .dlg{position:absolute;left:0;right:0;bottom:@6;display:flex;align-items:flex-end;justify-content:center;gap:@10;z-index:25;pointer-events:auto}
  #drace .dlg .av{width:@92;height:@92;margin-bottom:@-10;flex:none}
  #drace .dlg .bx{position:relative;width:@500;padding:@14 @20 @16;background:#f1ead8;border:@5 solid #8e8b82;border-radius:@18;color:#2a2a2a;font-family:inherit;font-size:@22;line-height:1.15;box-shadow:0 @6 0 rgba(0,0,0,.3)}
  #drace .dlg .nx{width:@64;height:@64;border-radius:50%;border:@5 solid #0b2a7a;background:radial-gradient(#3b8cff,#1257d1);color:#fff;font-size:@30;padding:0;flex:none;margin-bottom:@-6}
  #drace .rest{position:absolute;inset:0;background:rgba(5,12,40,.45)}
  #drace .pickrow{display:flex;gap:@8;flex-wrap:wrap;justify-content:center;margin:@8 0}
  #drace .sw{width:@34;height:@34;border-radius:50%;border:@3 solid #fff;box-shadow:0 @3 0 rgba(0,0,0,.4);padding:0}
  #drace .sw.on{outline:@4 solid #ffd23f}
  #drace .card{position:relative;width:@168;padding:@10;border-radius:@16;background:linear-gradient(#1c5cc8,#103f96);border:@4 solid #0a2a78;text-align:center;box-shadow:inset 0 @2 0 rgba(255,255,255,.3),0 @4 0 #081f5a}
  #drace .card .ic{font-size:@50;line-height:@56}
  #drace .card h3{margin:@2 0;font-size:@22;font-weight:400}
  #drace .pips{display:flex;justify-content:center;gap:@4;margin:@4 0}
  #drace .pips i{width:@18;height:@10;border-radius:@4;background:#0a2a78;border:@2 solid #06163d}
  #drace .pips i.on{background:linear-gradient(#ffe36a,#f0a400)}
  #drace .cn{display:inline-block;vertical-align:middle;width:@22;height:@22;margin-left:@4}
  #drace .wait{position:absolute;left:0;right:0;top:@120;text-align:center;font-size:@32}
  `.replace(/@(-?\d+(\.\d+)?)/g, (m, n) => `calc(var(--u)*${n}px)`);

  /* ---------- small pieces ---------- */
  const STAR = '<svg class="star" viewBox="0 0 24 24"><defs><linearGradient id="dr-sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff27a"/><stop offset="1" stop-color="#f2a900"/></linearGradient></defs><path d="M12 1.6l3.1 6.8 7.4.9-5.5 5.1 1.5 7.4L12 18.1 5.5 21.8 7 14.4 1.5 9.3l7.4-.9z" fill="url(#dr-sg)" stroke="#a66b00" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const STAR_E = '<svg class="star e" viewBox="0 0 24 24"><path d="M12 1.6l3.1 6.8 7.4.9-5.5 5.1 1.5 7.4L12 18.1 5.5 21.8 7 14.4 1.5 9.3l7.4-.9z" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const stars3 = (n) => `<div class="stars">${[0, 1, 2].map((i) => (i < n ? STAR : STAR_E)).join('')}</div>`;
  const AVATAR = '<svg class="av" viewBox="0 0 100 100"><circle cx="50" cy="56" r="38" fill="#d9966a" stroke="#7a4a2a" stroke-width="3"/><path d="M14 52c4-30 26-40 48-34 18 4 26 18 24 34-6-14-18-20-36-20-14 0-30 6-36 20z" fill="#2a1a12"/><ellipse cx="34" cy="60" rx="11" ry="13" fill="#fff"/><ellipse cx="66" cy="60" rx="11" ry="13" fill="#fff"/><circle cx="36" cy="62" r="6" fill="#2a1a12"/><circle cx="68" cy="62" r="6" fill="#2a1a12"/><path d="M38 82q12 8 24 0" stroke="#7a2a2a" stroke-width="4" fill="none" stroke-linecap="round"/><g transform="translate(20,34)"><circle r="9" fill="#c05bd9"/><circle r="4" fill="#ffe85a"/></g></svg>';
  const topbar = (back) => { const t = tickets(), st = totalStars(), pct = Math.round(st / TOTAL_STARS * 100), can = SAVE.daily.last !== day(); return `${back ? '<button class="rb" data-act="back" aria-label="Back">◀<small class="tt">Back</small></button>' : ''}<div class="topbar"><div class="pill a"><span style="font-size:calc(var(--u)*28px)">🏆</span><b>${st}/${TOTAL_STARS}</b></div><div class="pill"><span style="font-size:calc(var(--u)*26px)">📈</span><b>${pct}%</b></div><button class="gift ${can ? 'new' : ''}" data-act="daily" aria-label="Daily reward">🎁</button><div class="pill a"><b>${SAVE.coins}</b><i class="coin-i"></i></div><div class="pill"><b>${SAVE.gems}</b><i class="gem-i"></i></div><div class="pill"><b>${t}</b><i class="tix-i"></i></div></div>`; };
  const ib = (act, icon, label, o = {}) => `<button class="ib ${o.off ? 'off' : ''}" data-act="${act}" ${o.v != null ? `data-v="${o.v}"` : ''}><span class="tile">${icon}</span>${o.bad ? '<span class="bad t">!</span>' : ''}<small>${label}</small></button>`;
  const oval = (act, label, o = {}) => `<button class="oval ${o.off ? 'off' : ''}" data-act="${act}" ${o.v != null ? `data-v="${o.v}"` : ''}><span class="fl">🏁</span><small>${label}</small></button>`;
  const fmt = (ms) => api.fmt(ms);
  const trackThumbs = {};
  function thumb(id) {
    if (trackThumbs[id]) return trackThumbs[id]; const T = RT.build(id), c = document.createElement('canvas'); c.width = 240; c.height = 170; const x = c.getContext('2d'), th = RACEGFX.THEME[T.theme];
    const g = x.createLinearGradient(0, 0, 0, 170); g.addColorStop(0, th.sky[0]); g.addColorStop(.5, th.sky[1]); g.addColorStop(.52, T.theme === 'market' ? '#8ab04f' : '#2bb5cf'); g.addColorStop(1, T.theme === 'market' ? '#6f9a3c' : '#1b8fb0'); x.fillStyle = g; x.fillRect(0, 0, 240, 170);
    let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9; for (const s of T.segs) { mnx = Math.min(mnx, s.x); mxx = Math.max(mxx, s.x); mnz = Math.min(mnz, s.z); mxz = Math.max(mxz, s.z); }
    const sc = Math.min(180 / (mxx - mnx), 120 / (mxz - mnz)), ox = 120 - (mnx + mxx) / 2 * sc, oz = 96 - (mnz + mxz) / 2 * sc; x.fillStyle = 'rgba(40,110,60,.55)'; x.beginPath(); x.ellipse(120, 96, 96, 64, 0, 0, 7); x.fill();
    x.lineJoin = 'round'; x.lineCap = 'round'; for (const [w, col] of [[11, '#0b2a66'], [8, th.roadTex === 'sand' ? '#f3dc9a' : th.roadTex === 'dirt' ? '#c29a6a' : '#e8d4a8']]) { x.lineWidth = w; x.strokeStyle = col; x.beginPath(); T.segs.forEach((s, i) => { const px = s.x * sc + ox, pz = s.z * sc + oz; i ? x.lineTo(px, pz) : x.moveTo(px, pz); }); x.closePath(); x.stroke(); }
    const s0 = T.segs[0]; x.fillStyle = '#fff'; x.strokeStyle = '#111'; x.lineWidth = 2; x.fillRect(s0.x * sc + ox - 5, s0.z * sc + oz - 5, 10, 10); x.strokeRect(s0.x * sc + ox - 5, s0.z * sc + oz - 5, 10, 10);
    return (trackThumbs[id] = c.toDataURL());
  }

  /* ---------- the screens ---------- */
  const S_ = {
    title() { api.setBackground('fly', { track: 'beach', s0: 20000 }); return `<div class="logo tt"><span class="a">DRIVE</span><span class="b">RACE</span><span class="fl">🏁 🏁</span></div>
      <div class="row-b"><div class="g">${ib('settings', '⚙️', 'Settings')}${ib('help', '❓', 'Get Help')}${ib('champs', '🏆', 'Weekly Board')}</div>${oval('play', 'Play!')}</div>`; },
    main() { api.setBackground('fly', { track: 'harbor', s0: 60000 }); const can = SAVE.daily.last !== day(), tip = TIPS[tipI % TIPS.length];
      return `${topbar(true)}<div class="sign"><div class="art">🏎️</div><div class="note"><b>Pro Tip</b>${esc(tip)}</div></div>
      <button class="side" style="left:@14px" data-act="daily"><span class="r">🎡</span>${can ? '<em class="tt">NEW</em>' : ''}<small>Daily Reward!</small></button>
      <button class="side" style="right:@14px" data-act="challenge"><span class="r">🔥</span><em class="tt">NEW</em><small>Daily Challenge!</small></button>
      <div class="row-b" style="justify-content:center;gap:@26px"><div class="g">${ib('friends', '👥', 'Friends')}${ib('quick', '⚡', 'Quick Race')}${ib('champs', '🏆', 'Championships')}</div>${oval('career', 'Career')}</div>`.replace(/@(\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`); },
    garage() { const c = SAVE.car; api.setBackground('garage', { track: 'harbor', kart: { type: c.type, color: c.color, driver: SAVE.driver }, spin: 0 });
      const can = canUpgrade(); return `${topbar(true)}<div class="row-b"><div class="g">${ib('upgrade', '🔧', 'Upgrade', { bad: can.car })}${ib('powerups', '❓', 'Powerups', { bad: can.pu })}${ib('cars', '🚙', 'Switch Car')}${ib('drivers', '🧑', 'Switch Driver')}</div>${oval('series', 'Choose Series')}</div>`; },
    series() { const idx = ctx.series || 0, s = SERIES[idx]; api.setBackground('fly', { track: ['beach', 'harbor', 'market'][idx % 3], s0: 90000 + idx * 40000 });
      const open = seriesUnlocked(s);
      return `${topbar(true)}<div class="tiles">${s.races.map((r, i) => { const n = starsOf(s.id + i), ok = raceOpen(s, i), need = raceNeed(s, i); return ok ? `<button class="tl" data-act="race" data-v="${i}"><span class="s">${[0, 1, 2].map((k) => (k < n ? STAR : STAR_E)).join('')}</span><span class="n tt">${i + 1}</span></button>` : `<button class="tl lock" data-act="locked" data-v="${i}"><span class="s">${[0, 1, 2].map(() => STAR_E).join('')}</span><span class="n">🔒</span><small class="tt">★${need || s.need}</small></button>`; }).join('')}</div>
      ${idx > 0 ? '<button class="arr" style="left:@34px" data-act="sprev">◀</button>'.replace(/@(\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`) : ''}${idx < SERIES.length - 1 ? '<button class="arr" style="right:@34px" data-act="snext">▶</button>'.replace(/@(\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`) : ''}
      <div class="ban tt"><span>${esc(s.name)}${open ? '' : ' 🔒'}</span><span>${seriesStars(s)}/${s.races.length * 3} ${STAR.replace('class="star"', 'class="star" style="width:calc(var(--u)*40px);height:calc(var(--u)*40px);vertical-align:middle"')}</span></div>`; },
    prerace() { const s = SERIES[ctx.series || 0], i = ctx.race || 0, r = s.races[i], id = s.id + i, T = RT.build(r.track), n = starsOf(id), best = SAVE.best[id], t = tickets(); api.setBackground('fly', { track: r.track, s0: 30000 + i * 20000 });
      return `${topbar(true)}<div class="panel" style="position:absolute;left:@28px;top:@104px;width:@240px;height:@196px;padding:@8px;overflow:hidden"><img src="${thumb(r.track)}" style="width:100%;height:100%;object-fit:cover;border-radius:@14px"></div>
      <div class="panel" style="position:absolute;left:@24px;top:@296px;width:@190px;height:@50px;border-radius:@8px;display:flex;align-items:center;justify-content:center;font-size:@26px" ><span class="tt">${esc(T.name)}</span></div>
      <div class="panel" style="position:absolute;left:@276px;top:@92px;width:@290px;height:@226px;padding:@8px 14px"><div class="tt" style="text-align:center;font-size:@40px;margin-top:@-34px"><span style="display:inline-block;padding:@4px @30px;border:@5px solid #0b2a7a;border-radius:@12px;background:linear-gradient(#2f7cf0,#1247ad)">Race</span></div><div style="margin-top:@20px">${stars3(n)}</div>
        <div style="display:flex;justify-content:space-around;margin-top:@28px;padding:@8px 0;background:rgba(0,20,80,.35);border-radius:@10px;text-align:center"><div><div class="tt" style="font-size:@24px">Goal:</div><div class="tt" style="font-size:@44px">1st</div></div><div><div class="tt" style="font-size:@24px">Reward:</div><div class="tt" style="font-size:@44px">${r.reward}<i class="coin-i" style="vertical-align:middle;margin-left:@6px"></i></div></div></div>
        <div class="tt hint" style="text-align:center;margin-top:@4px;font-size:@14px">${r.laps} laps · ${r.grid} racers · ${['', 'Easy', 'Normal', 'Hard'][r.level]} bots</div></div>
      <div class="panel" style="position:absolute;left:@582px;top:@100px;width:@236px;height:@170px;padding:@12px;text-align:center"><div class="tt" style="font-size:@26px">High Score:</div><div class="tt" style="font-size:@34px;margin-top:@2px">${fmt(best)}</div><div class="tt" style="font-size:@16px;margin-top:@16px;line-height:1.2;font-family:inherit">Race the other drivers to the finish line.</div></div>
      <div class="ban"><span class="tt" style="font-size:@28px">${t > 0 ? 'Entry Fee' : 'No tickets left!'}</span><span class="tt" style="font-size:@34px;margin-right:@170px">${t > 0 ? '1 <i class="tix-i" style="vertical-align:middle"></i>' : ''}</span></div>
      <div style="position:absolute;right:@10px;bottom:@-4px">${oval('startrace', 'Play!')}</div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`); },
    friends() { api.setBackground('fly', { track: 'beach', s0: 50000 }); return `${topbar(true)}<div class="panel" style="position:absolute;left:50%;top:@74px;transform:translateX(-50%);width:@520px;padding:@16px 22px 18px"><h2 class="tt">Race with friends</h2>
      <div style="display:flex;gap:@16px;align-items:stretch"><div style="flex:1"><div class="hint">Make a room, then share the 4-letter code.</div><button class="btn gold" data-act="create" style="width:100%;margin-top:@10px">🏁 Create room</button><button class="btn blue" data-act="practice" style="width:100%;margin-top:@10px">🤖 Race against bots</button></div>
      <div style="flex:1"><div class="hint">Got a code from a friend?</div><input id="drc" maxlength="4" placeholder="CODE" style="width:100%;height:@46px;margin-top:@10px;border-radius:@12px;border:@4px solid #0a2260;background:#0d2f72;color:#fff;text-align:center;font:@26px 'Lilita One',Impact,sans-serif;letter-spacing:.2em;text-transform:uppercase"><button class="btn" data-act="join" style="width:100%;margin-top:@10px">Join</button></div></div><div class="err tt" id="drerr" style="text-align:center;margin-top:@8px;-webkit-text-stroke:0;text-shadow:none">${esc(ctx.msg || '')}</div></div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`); },
    lobby() { const l = api.lobby(); if (!l) return S_.main(); const me = api.me(), host = l.host === me.id, humans = l.players.filter((p) => !p.bot).length; const T = RT.build(l.track || 'harbor');
      const slots = []; for (let i = 0; i < l.max; i++) { const p = l.players[i]; slots.push(p ? `<div class="rr ${p.id === me.id ? 'me' : ''}" style="height:calc(var(--u)*34px);margin:calc(var(--u)*2px) 0;font-size:calc(var(--u)*17px);padding:0 calc(var(--u)*8px);gap:calc(var(--u)*6px)"><i style="width:calc(var(--u)*14px);height:calc(var(--u)*14px);border-radius:50%;background:${esc(p.color)};border:calc(var(--u)*2px) solid #fff"></i><span class="nm tt" style="-webkit-text-stroke:calc(var(--u)*3px) #06163d">${esc(p.name)}</span>${p.id === l.host ? '<span class="ca" style="width:auto;font-size:calc(var(--u)*13px)">HOST</span>' : ''}</div>` : `<div class="rr" style="height:calc(var(--u)*34px);margin:calc(var(--u)*2px) 0;opacity:.4;font-size:calc(var(--u)*14px);padding:0 calc(var(--u)*8px)"><span class="nm">open seat</span></div>`); }
      const seg = (act, list, cur) => `<div class="seg">${list.map(([v, t]) => `<button data-act="${act}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
      return `${topbar(false)}<div class="panel" style="position:absolute;left:@12px;top:@54px;width:@410px;height:@330px;padding:@8px 14px" class2="compact"><div style="display:flex;gap:@10px;align-items:center"><div class="tt" data-act="copy" style="font-size:@44px;letter-spacing:.14em;cursor:pointer;background:rgba(0,20,80,.4);border-radius:@10px;padding:0 @12px;border:@2px dashed #9fc4ff">${esc(l.code)}</div><div class="hint tt" style="font-family:inherit;-webkit-text-stroke:@3px #06163d;font-size:@14px;line-height:1.1">${l.public ? 'Quick race starts <b id="dr-auto"></b>' : 'Tap the code to copy, share it with friends'}</div></div>
        <div style="display:inline-block;margin-top:@6px;padding:@3px @10px;border-radius:@8px;font-size:@14px;background:${humans >= 2 ? 'rgba(43,214,123,.35)' : 'rgba(255,255,255,.14)'};color:${humans >= 2 ? '#8dffc0' : '#dbe6ff'}">${humans >= 2 ? 'RANKED · points count for the weekly board' : 'PRACTICE · race a friend for weekly points'}</div>
        ${host ? `<div style="display:flex;align-items:center;gap:@8px;margin-top:@6px"><button class="btn blue" style="min-width:@44px;padding:0;height:@38px" data-act="trk" data-v="-1">◀</button><div style="flex:1;text-align:center;font-size:@22px" class="tt">${esc(T.name)}</div><button class="btn blue" style="min-width:@44px;padding:0;height:@38px" data-act="trk" data-v="1">▶</button></div>` : `<div class="tt" style="text-align:center;font-size:@22px;margin-top:@6px">${esc(T.name)}</div>`}
        ${host ? `<div class="lab">Laps</div>${seg('laps', [[1, '1'], [2, '2'], [3, '3'], [5, '5']], l.laps)}<div class="lab">Racers (bots fill empty seats)</div>${seg('grid', [[4, '4'], [6, '6'], [8, '8'], [10, '10']], l.grid)}<div class="lab">Bots</div>${seg('level', [[1, 'Easy'], [2, 'Normal'], [3, 'Hard']], l.level || 2)}` : `<div class="hint" style="margin-top:@10px">${l.laps} laps · ${l.grid} racers · the host starts the race</div>`}
        <div class="lab">Steering</div>${seg('steer', [['buttons', 'Buttons'], ['tilt', 'Tilt']], api.pref().steer)}</div>
      <div class="panel" style="position:absolute;right:@12px;top:@54px;width:@400px;height:@326px;padding:@10px 14px"><div class="tt" style="font-size:@22px">Racers ${l.players.length}/${l.max}</div><div style="margin-top:@4px;display:grid;grid-template-columns:1fr 1fr;gap:0 @8px">${slots.join('')}</div>
        <div style="position:absolute;left:@14px;right:@14px;bottom:@10px;display:flex;gap:@10px">${host ? '<button class="btn" data-act="start" style="flex:1">Start race</button>' : '<div class="hint tt" style="flex:1;align-self:center;-webkit-text-stroke:@3px #06163d;font-family:inherit;font-size:@16px">Waiting for the host…</div>'}<button class="btn red" data-act="leave" style="min-width:@90px">Leave</button></div><div class="err" id="drerr" style="position:absolute;left:@14px;bottom:@58px">${esc(ctx.msg || '')}</div></div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`); },
    waiting(msg) { return `${topbar(false)}<div class="wait tt">${esc(msg || 'Finding racers…')}</div>`; },
    result1() { const o = ctx.res, place = o.place, sName = ['Excellent!', 'Great!', 'Good!', 'Try again!'][Math.min(place, 4) - 1] || 'Try again!', st = o.stars;
      return `${topbar(false)}<div class="panel" style="position:absolute;left:@38px;top:@92px;width:@236px;height:@196px;padding:@8px;overflow:hidden"><img src="${thumb(o.track)}" style="width:100%;height:100%;object-fit:cover;border-radius:@14px"></div><div class="panel" style="position:absolute;left:@24px;top:@286px;width:@200px;height:@50px;border-radius:@8px;display:flex;align-items:center;justify-content:center"><span class="tt" style="font-size:@24px">${esc(RT.build(o.track).name)}</span></div>
      <div class="panel" style="position:absolute;left:@270px;top:@96px;width:@304px;height:@232px;padding:@8px 14px"><div class="tt" style="position:absolute;left:@38px;right:@38px;top:@-34px;text-align:center;font-size:@40px;border:@5px solid #0b2a7a;border-radius:@12px;background:linear-gradient(#2f7cf0,#1247ad)">${sName}</div><div style="margin-top:@18px">${stars3(st)}${o.newStar ? `<div class="tt" style="text-align:center;font-size:@20px;margin-top:@2px">+${o.newStar} ${STAR.replace('class="star"', 'class="star" style="width:calc(var(--u)*22px);height:calc(var(--u)*22px);vertical-align:middle"')}</div>` : ''}</div>
        <div style="display:flex;justify-content:space-around;margin-top:@8px;padding:@4px 0;background:rgba(0,20,80,.35);border-radius:@10px;text-align:center"><div><div class="tt" style="font-size:@22px">You Got:</div><div class="tt" style="font-size:@42px">${api.ord(place)}</div></div><div><div class="tt" style="font-size:@22px">Goal:</div><div class="tt" style="font-size:@42px">1st</div></div></div>
        <div class="tt" style="text-align:center;font-size:@24px;margin-top:@2px">+${o.coins}<i class="coin-i" style="vertical-align:middle;margin-left:@6px"></i>${o.gems ? ` &nbsp; +${o.gems}<i class="gem-i" style="vertical-align:middle;margin-left:@6px"></i>` : ''}</div></div>
      <div class="panel" style="position:absolute;left:@590px;top:@108px;width:@236px;height:@236px;padding:@14px;text-align:center"><div class="tt" style="font-size:@24px">Your Score:</div><div class="tt" style="font-size:@40px">${o.timeMs ? fmt(o.timeMs) : 'DNF'}</div><div class="tt" style="font-size:@22px;margin-top:@10px">High Score:</div><div class="tt" style="font-size:@30px">${fmt(o.best)}</div><div class="tt" style="font-size:@16px;margin-top:@22px;font-family:inherit;line-height:1.2">${o.ranked ? 'Ranked race!' : 'Race the other drivers to the finish line.'}</div></div>
      <div style="position:absolute;left:50%;bottom:@6px;transform:translateX(-50%)"><button class="btn blue" data-act="next" style="min-width:@190px;height:@56px;font-size:@30px">Continue</button></div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`); },
    result2() { const o = ctx.res, me = api.me();
      return `${topbar(false)}<div class="panel dark" style="position:absolute;left:@38px;top:@92px;width:@236px;height:@196px;padding:@8px;overflow:hidden"><img src="${thumb(o.track)}" style="width:100%;height:100%;object-fit:cover;border-radius:@14px"></div>
      <div class="panel" style="position:absolute;left:@290px;top:@84px;width:@330px;height:@232px;padding:@8px @10px;overflow:hidden"><div class="tt" style="position:absolute;left:@46px;right:@46px;top:@-32px;text-align:center;font-size:@36px;border:@5px solid #0b2a7a;border-radius:@12px;background:linear-gradient(#2f7cf0,#1247ad);z-index:2">${['Excellent!', 'Great!', 'Good!', 'Try again!'][Math.min(o.place, 4) - 1]}</div><div style="margin-top:@4px">${o.order.slice(0, 6).map((r) => `<div class="rr ${r.id === me.id ? 'me' : ''}" style="height:@34px;font-size:@19px;margin:@2px 0"><b class="tt">${r.place}</b><span class="nm tt" style="-webkit-text-stroke:@3px #06163d">${esc(r.name)}</span><span class="ca" style="width:@70px;font-size:@14px">${esc(r.type === 'buggy' ? 'Buggy' : r.type)}</span><span class="tm tt" style="-webkit-text-stroke:@3px #06163d">${r.dnf ? '-:--.--' : fmt(r.timeMs)}</span></div>`).join('')}</div></div>
      <div class="panel" style="position:absolute;left:@640px;top:@108px;width:@190px;height:@196px;padding:@12px;text-align:center"><div class="tt" style="font-size:@22px">Your Score:</div><div class="tt" style="font-size:@34px">${o.timeMs ? fmt(o.timeMs) : 'DNF'}</div><div class="tt" style="font-size:@18px;margin-top:@8px">High Score:</div><div class="tt" style="font-size:@26px">${fmt(o.best)}</div></div>
      <div style="position:absolute;left:50%;bottom:@6px;transform:translateX(-50%)"><button class="btn blue" data-act="done" style="min-width:@190px;height:@56px;font-size:@30px">Continue</button></div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`); },
    nogl() { return `<div class="modal"><div class="panel" style="width:@420px;text-align:center"><h2 class="tt">3D is not available</h2><div class="hint">Drive Race needs WebGL 2, and this browser does not have it. Try Chrome or Safari on a newer phone.</div><button class="btn red" data-act="exit" style="margin-top:@14px">Close</button></div></div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`); }
  };
  const canUpgrade = () => ({ car: UP.some(([k]) => SAVE.car.up[k] < 5 && SAVE.coins >= UP_COST[SAVE.car.up[k]]), pu: PU.some((k) => SAVE.pu[k] < 5 && SAVE.coins >= PU_COST[SAVE.pu[k] - 1]) });

  /* ---------- modals ---------- */
  const M_ = {
    upgrade() { const u = SAVE.car.up; return `<div class="panel" style="width:@560px"><button class="x" data-act="close">✕</button><h2 class="tt">Upgrade</h2><div style="display:flex;flex-direction:column;gap:@10px">${UP.map(([k, name, ic]) => { const lv = u[k], maxed = lv >= 5, cost = UP_COST[lv]; return `<div class="rr" style="height:@62px;font-size:@24px"><span style="font-size:@34px">${ic}</span><span class="nm tt">${name}</span><div class="pips" style="margin:0 @10px">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>${maxed ? '<span class="ca tt">MAX</span>' : `<button class="btn ${SAVE.coins >= cost ? 'gold' : 'off'}" data-act="buyup" data-v="${k}" style="min-width:@130px;height:@42px">${cost}<i class="coin-i cn"></i></button>`}</div>`; }).join('')}</div><div class="hint tt" style="text-align:center;margin-top:@10px;font-family:inherit;-webkit-text-stroke:@3px #06163d;font-size:@15px">Speed: top speed · Acceleration: a head start on the grid · Handling: tighter turns</div></div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`).replace(/@(-?\d+)/g, (m, n) => `calc(var(--u)*${n}px)`); },
    powerups() { return `<div class="panel" style="width:@740px;padding:@10px 18px 14px"><button class="x" data-act="close">✕</button><h2 class="tt" style="margin-bottom:@6px">Powerups</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:@8px">${PU.map((k) => { const lv = SAVE.pu[k], maxed = lv >= 5, cost = PU_COST[lv - 1], I = api.ITEM[k]; return `<div class="card" style="width:auto;padding:@6px 8px;display:flex;align-items:center;gap:@8px;text-align:left"><div class="ic" style="font-size:@46px;width:@54px;text-align:center">${I[0]}</div><div style="flex:1;min-width:0"><h3 class="tt" style="font-size:@20px;margin:0">${I[1]}</h3><div class="pips" style="justify-content:flex-start;margin:@2px 0">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < lv ? 'on' : ''}" style="width:@14px"></i>`).join('')}</div><div class="hint" style="font-size:@11px;line-height:1.15;min-height:@26px">${esc(I[2])}${lv > 1 ? ` · +${Math.round((lv - 1) * (k === 'oil' || k === 'rocket' ? 10 : 12))}%` : ''}</div>${maxed ? '<div class="tt" style="color:#ffd21f;font-size:@16px">MAX</div>' : `<button class="btn ${SAVE.coins >= cost ? 'gold' : 'off'}" data-act="buypu" data-v="${k}" style="min-width:0;width:100%;height:@32px;font-size:@17px">${cost}<i class="coin-i cn"></i></button>`}</div></div>`; }).join('')}</div></div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`); },
    cars() { const i = ctx.carI || 0, c = CARS[i], own = SAVE.cars.includes(c.id), cur = SAVE.car.type === c.id, tm = api.TYPE_MOD[c.id]; ctx.preview = { type: c.id, color: SAVE.car.color, driver: SAVE.driver };
      return `<div class="panel" style="width:@560px"><button class="x" data-act="close">✕</button><h2 class="tt">Switch Car</h2><div style="display:flex;align-items:center;gap:@10px"><button class="btn blue" style="min-width:@54px;padding:0" data-act="carp">◀</button><div style="flex:1;text-align:center"><div class="tt" style="font-size:@36px">${esc(c.name)}</div><div class="hint">${esc(c.blurb)}</div><div class="hint" style="margin-top:@4px">Top speed ×${tm.spd} · Acceleration ×${tm.acc} · Handling ×${tm.han}</div></div><button class="btn blue" style="min-width:@54px;padding:0" data-act="carn">▶</button></div>
        <div class="lab" style="text-align:center">Colour</div><div class="pickrow">${COLORS.map((col) => `<button class="sw ${SAVE.car.color === col ? 'on' : ''}" style="background:${col}" data-act="color" data-v="${col}" aria-label="Colour"></button>`).join('')}</div>
        <div style="text-align:center">${cur ? '<span class="tt" style="font-size:@24px;color:#9dffb8">Selected</span>' : own ? `<button class="btn" data-act="selcar" data-v="${c.id}">Select</button>` : `<button class="btn ${SAVE.coins >= c.cost ? 'gold' : 'off'}" data-act="buycar" data-v="${c.id}">Buy ${c.cost}<i class="coin-i cn"></i></button>`}</div></div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`).replace(/@(-?\d+)/g, (m, n) => `calc(var(--u)*${n}px)`); },
    drivers() { const D = RACEGFX.DRIVERS, i = ctx.drvI || 0, d = D[i], own = SAVE.drivers.includes(i), cur = SAVE.driver === i; ctx.preview = { type: SAVE.car.type, color: SAVE.car.color, driver: i };
      return `<div class="panel" style="width:@520px"><button class="x" data-act="close">✕</button><h2 class="tt">Switch Driver</h2><div style="display:flex;align-items:center;gap:@10px"><button class="btn blue" style="min-width:@54px;padding:0" data-act="drvp">◀</button><div style="flex:1;text-align:center"><div class="tt" style="font-size:@40px">${esc(d.name)}</div><div class="hint">Driver ${i + 1} of ${D.length}</div></div><button class="btn blue" style="min-width:@54px;padding:0" data-act="drvn">▶</button></div>
        <div style="text-align:center;margin-top:@14px">${cur ? '<span class="tt" style="font-size:@24px;color:#9dffb8">Selected</span>' : own ? `<button class="btn" data-act="seldrv" data-v="${i}">Select</button>` : i === 6 ? '<span class="tt" style="font-size:@20px">Win race 6 of Easy Street to unlock</span>' : `<button class="btn ${SAVE.coins >= DRIVER_COST ? 'gold' : 'off'}" data-act="buydrv" data-v="${i}">Recruit ${DRIVER_COST}<i class="coin-i cn"></i></button>`}</div></div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`).replace(/@(-?\d+)/g, (m, n) => `calc(var(--u)*${n}px)`); },
    settings(inRace) { const p = api.pref(), seg = (act, list, cur) => `<div class="seg">${list.map(([v, t]) => `<button data-act="${act}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
      return `<div class="panel" style="width:@500px"><button class="x" data-act="close">✕</button><h2 class="tt">${inRace ? 'Paused' : 'Settings'}</h2>
        <div class="lab">Steering</div>${seg('steer', [['buttons', 'Buttons'], ['tilt', 'Tilt: turn the phone like a wheel']], p.steer)}
        ${p.steer === 'tilt' ? `<div style="position:relative;height:@10px;background:rgba(0,0,0,.35);border-radius:@5px;margin:@12px @8px"><i id="tm" style="position:absolute;top:@-4px;width:@18px;height:@18px;border-radius:50%;background:#9fe3ff;left:50%;margin-left:@-9px"></i></div><div style="display:flex;gap:@8px"><button class="btn blue" data-act="calib" style="flex:1">Set neutral</button><button class="btn blue" data-act="invert" style="flex:1">${p.invert ? 'Direction: inverted' : 'Direction: normal'}</button></div><div class="hint">Hold the phone like a steering wheel. If it steers the wrong way, press the direction button.</div>` : '<div class="hint">Use the ◀ ▶ buttons, or switch to Tilt.</div>'}
        <div class="lab">Vibration</div>${seg('vib', [['1', 'On'], ['0', 'Off']], p.vib ? '1' : '0')}<div class="lab">Sound</div>${seg('snd', [['1', 'On'], ['0', 'Off']], p.sound ? '1' : '0')}<div class="err" id="drerr">${esc(ctx.msg || '')}</div>
        ${inRace ? '<div style="display:flex;gap:@10px;margin-top:@8px"><button class="btn" data-act="resume" style="flex:1">Resume</button><button class="btn red" data-act="quitrace" style="flex:1">Quit race</button></div><div class="hint">The race keeps going while this is open.</div>' : `<div style="display:flex;gap:@10px;margin-top:@10px"><button class="btn red" data-act="reset" style="flex:1;min-width:0;font-size:@17px">Reset progress</button><button class="btn blue" data-act="close" style="flex:1">Done</button></div>`}</div>`.replace(/@(-?\d+)px/g, (m, n) => `calc(var(--u)*${n}px)`).replace(/@(-?\d+)/g, (m, n) => `calc(var(--u)*${n}px)`); },
    help() { return `<div class="panel" style="width:@560px"><button class="x" data-act="close">✕</button><h2 class="tt">How to play</h2><div class="hint" style="font-size:@16px;line-height:1.45">◀ ▶ steer (or turn the phone, see Settings). The car accelerates by itself.<br>Hold <b>DRIFT</b> in a turn to charge a boost and let go to launch.<br>Drive through the <b>? bubbles</b> for power-ups. You can hold two; tap a round slot to use it.<br>Yellow pads on the road give a free boost.<br>Win races for stars, coins and gems. Spend coins on <b>Upgrade</b>, <b>Powerups</b>, new <b>cars</b> and <b>drivers</b>.<br>Races with 2 or more real players are <b>ranked</b>: the points go on the weekly board.<br><br>Keyboard: arrows or A/D steer · Down brake · Shift drift · Space / Q use power-ups · Esc pause</div></div>`.replace(/@(-?\d+)/g, (m, n) => `calc(var(--u)*${n}px)`); },
    champs() { const b = board; let body = '<div class="hint tt" style="text-align:center">Loading…</div>'; if (b && b.error) body = `<div class="err">${esc(b.error)}</div>`; else if (b) { const rows = b.week.length ? b.week.map((r) => `<tr class="${r.id === api.me().id ? 'me' : ''}"><td class="tt">${r.rank}</td><td class="tt">${esc(r.name)}</td><td class="tt">${r.weekPoints}</td><td class="tt">${r.wins}</td></tr>`).join('') : '<tr><td colspan="4" class="hint">No ranked races this week yet. Race with friends to get on the board!</td></tr>', m = b.me; body = `<div style="max-height:calc(var(--u)*200px);overflow:auto"><table><tr><th>#</th><th>Racer</th><th>Points</th><th>Wins</th></tr>${rows}</table></div><div class="tt" style="font-size:calc(var(--u)*17px);text-align:center;margin-top:calc(var(--u)*8px)">${m ? `You: ${m.weekPoints} pts this week${m.weekRank ? ' (#' + m.weekRank + ')' : ''} · ${m.wins} wins · ${m.races} ranked races` : 'You have no ranked races yet.'}</div>`; }
      return `<div class="panel" style="width:calc(var(--u)*560px)"><button class="x" data-act="close">✕</button><h2 class="tt">Championships</h2><div class="lab tt" style="text-align:center">This week · restarts every Monday</div>${body}</div>`; },
    daily() { const can = SAVE.daily.last !== day(), st = SAVE.daily.streak + (can ? 1 : 0), amount = 100 + Math.min(st, 7) * 50, gem = st % 7 === 0 ? 3 : 0;
      return `<div class="panel" style="width:calc(var(--u)*440px);text-align:center"><button class="x" data-act="close">✕</button><h2 class="tt">Daily Reward</h2><div style="font-size:calc(var(--u)*70px)">🎡</div><div class="tt" style="font-size:calc(var(--u)*28px)">${can ? 'Day ' + st + ': +' + amount + ' coins' + (gem ? ' and +3 gems' : '') : 'Come back tomorrow!'}</div><div class="hint" style="margin:calc(var(--u)*6px) 0 calc(var(--u)*10px)">Play every day: the reward grows for 7 days and the 7th day gives gems.</div>${can ? '<button class="btn gold" data-act="claim">Claim</button>' : ''}</div>`; },
    challenge() { const c = SAVE.chal; if (c.day !== day()) { SAVE.chal = { day: day(), id: (Math.random() * 3) | 0, prog: 0, done: false }; save(); } const k = SAVE.chal, defs = [['Finish 2 races', 2, 150], ['Win a race', 1, 250], ['Finish 3 races', 3, 200]], d = defs[k.id];
      return `<div class="panel" style="width:calc(var(--u)*440px);text-align:center"><button class="x" data-act="close">✕</button><h2 class="tt">Daily Challenge</h2><div style="font-size:calc(var(--u)*70px)">🔥</div><div class="tt" style="font-size:calc(var(--u)*30px)">${d[0]}</div><div class="tt" style="font-size:calc(var(--u)*24px)">${Math.min(k.prog, d[1])} / ${d[1]}</div><div class="hint">Reward: ${d[2]} coins${k.done ? ' · claimed' : ''}</div></div>`; },
    confirm(txt, act) { return `<div class="panel" style="width:calc(var(--u)*400px);text-align:center"><h2 class="tt">${esc(txt)}</h2><div style="display:flex;gap:calc(var(--u)*10px);justify-content:center"><button class="btn red" data-act="${act}">Yes</button><button class="btn blue" data-act="close">No</button></div></div>`; },
    tickets() { return `<div class="panel" style="width:calc(var(--u)*440px);text-align:center"><button class="x" data-act="close">✕</button><h2 class="tt">Out of tickets</h2><div class="hint" style="font-size:calc(var(--u)*17px)">You get a free ticket every 5 minutes (up to 6). Or refill now: 3 gems for 6 tickets.</div><button class="btn ${SAVE.gems >= 3 ? 'gold' : 'off'}" data-act="buytix" style="margin-top:calc(var(--u)*12px)">Refill · 3<i class="gem-i cn"></i></button></div>`; }
  };

  /* ---------- drawing ---------- */
  function paint() { if (!ui) return; const html = !ok3d ? S_.nogl() : S_[screen] ? S_[screen](ctx.arg) : ''; ui.innerHTML = `<div class="scr">${html}</div>${modal ? `<div class="modal" data-act="${modal.lock ? '' : 'mbg'}">${M_[modal.name](modal.arg)}</div>` : ''}${dlg ? dialogHtml() : ''}`; bindTilt(); autoTimer(); }
  function dialogHtml() { return `<div class="dlg">${AVATAR}<div class="bx">${esc(dlg.lines[dlg.i])}</div><button class="nx" data-act="dnext">▶</button></div>`; }
  function go(name, arg, push = true) { if (push && screen && screen !== name) hist.push(screen); screen = name; ctx.arg = arg; modal = null; paint(); }
  function back() { const p = hist.pop(); go(p || 'main', undefined, false); }
  function showModal(name, arg, lock) { modal = { name, arg, lock }; paint(); if (name === 'cars' || name === 'drivers') updatePreview(); }
  function closeModal() { modal = null; if (screen === 'garage') api.setBackground('garage', { track: 'harbor', kart: { type: SAVE.car.type, color: SAVE.car.color, driver: SAVE.driver }, spin: 0 }); paint(); }
  function updatePreview() { if (ctx.preview) api.setBackground('garage', { track: 'harbor', kart: ctx.preview, spin: 0 }); }
  function say(lines, done) { dlg = { lines, i: 0, done }; paint(); }
  let tmT = 0;
  function bindTilt() { clearInterval(tmT); if (ui && ui.querySelector('#tm')) tmT = setInterval(() => { const e = ui && ui.querySelector('#tm'); if (!e) { clearInterval(tmT); return; } e.style.left = (50 + api.tilt.steer() * 45) + '%'; }, 60); }
  function autoTimer() { const a = ui && ui.querySelector('#dr-auto'); if (!a) return; const l = api.lobby(); if (!l || !l.autoAt) return; const tick = () => { if (!a.isConnected) return; a.textContent = 'in ' + Math.max(0, Math.ceil((l.autoAt - l.now - (performance.now() - (ctx.lobbyAt || 0))) / 1000)) + 's'; timers.push(setTimeout(tick, 500)); }; tick(); }

  /* ---------- what the buttons do ---------- */
  function spend(coins) { if (SAVE.coins < coins) return false; SAVE.coins -= coins; save(); return true; }
  const ACT = {
    exit() { api.close(); },
    back() { if (modal) return closeModal(); if (screen === 'lobby') return ACT.leave(); back(); },
    play() { api.beep(600, .1, 'square', .05); go('main'); if (!SAVE.seen.intro) { SAVE.seen.intro = true; save(); say(['Welcome to Drive Race! Race the streets and beaches of Lagos against up to 10 drivers.', 'Collect power-ups from the ? bubbles, drift through turns for a boost and win stars.', 'Spend your coins on upgrades, new cars and new drivers. Good luck!']); } },
    settings() { showModal('settings'); }, help() { showModal('help'); }, daily() { showModal('daily'); }, challenge() { showModal('challenge'); },
    champs() { board = null; showModal('champs'); api.ask('race:board', {}, (r) => { board = r && r.ok ? r : { error: (r && r.error) || 'The leaderboard is not available right now.' }; if (modal && modal.name === 'champs') paint(); }); },
    close() { if (api.phase() === 'race' || api.phase() === 'countdown') api.setPaused(false); closeModal(); }, mbg() { /* a tap outside a panel does nothing */ },
    career() { pushStyle(); go('garage'); },
    upgrade() { showModal('upgrade'); }, powerups() { showModal('powerups'); }, cars() { ctx.carI = Math.max(0, CARS.findIndex((c) => c.id === SAVE.car.type)); showModal('cars'); }, drivers() { ctx.drvI = SAVE.driver; showModal('drivers'); },
    series() { go('series'); }, sprev() { ctx.series = Math.max(0, (ctx.series || 0) - 1); paint(); }, snext() { ctx.series = Math.min(SERIES.length - 1, (ctx.series || 0) + 1); paint(); },
    locked(v) { const s = SERIES[ctx.series || 0]; say([seriesUnlocked(s) ? `Win ${raceNeed(s, +v) - totalStars()} more stars to open this race.` : `This series opens with ${s.need} stars. Keep racing!`]); },
    race(v) { ctx.race = +v; go('prerace'); },
    buyup(k) { const lv = SAVE.car.up[k]; if (lv >= 5) return; if (!spend(UP_COST[lv])) return say(['You need more coins. Win races to earn them!']); SAVE.car.up[k]++; save(); pushStyle(); api.beep(700, .15, 'triangle', .06, 300); paint(); },
    buypu(k) { const lv = SAVE.pu[k]; if (lv >= 5) return; if (!spend(PU_COST[lv - 1])) return say(['You need more coins. Win races to earn them!']); SAVE.pu[k]++; save(); pushStyle(); api.beep(700, .15, 'triangle', .06, 300); paint(); },
    carp() { ctx.carI = (ctx.carI + CARS.length - 1) % CARS.length; showModal('cars'); }, carn() { ctx.carI = (ctx.carI + 1) % CARS.length; showModal('cars'); },
    color(v) { SAVE.car.color = v; save(); pushStyle(); showModal('cars'); },
    selcar(v) { SAVE.car.type = v; save(); pushStyle(); showModal('cars'); }, buycar(v) { const c = CARS.find((x) => x.id === v); if (!spend(c.cost)) return say(['You need more coins for this car.']); SAVE.cars.push(v); SAVE.car.type = v; save(); pushStyle(); api.beep(800, .2, 'triangle', .06, 300); showModal('cars'); },
    drvp() { ctx.drvI = (ctx.drvI + 7) % 8; showModal('drivers'); }, drvn() { ctx.drvI = (ctx.drvI + 1) % 8; showModal('drivers'); },
    seldrv(v) { SAVE.driver = +v; save(); pushStyle(); showModal('drivers'); }, buydrv(v) { if (!spend(DRIVER_COST)) return say(['You need more coins to recruit this driver.']); SAVE.drivers.push(+v); SAVE.driver = +v; save(); pushStyle(); showModal('drivers'); },
    claim() { const can = SAVE.daily.last !== day(); if (!can) return; const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10); SAVE.daily.streak = SAVE.daily.last === yest ? SAVE.daily.streak + 1 : 1; const st = SAVE.daily.streak; SAVE.coins += 100 + Math.min(st, 7) * 50; if (st % 7 === 0) SAVE.gems += 3; SAVE.daily.last = day(); save(); api.beep(900, .25, 'triangle', .07, 400); closeModal(); },
    steer(v) { const p = api.pref(); if (v === 'tilt') api.tilt.start().then((ok) => { p.steer = ok ? 'tilt' : 'buttons'; ctx.msg = ok ? '' : 'Tilt steering is not available on this device.'; api.savePref(); repaintKeep(); }); else { p.steer = 'buttons'; api.tilt.stop(); api.savePref(); repaintKeep(); } },
    invert() { const p = api.pref(); p.invert = !p.invert; api.savePref(); repaintKeep(); }, calib() { api.tilt.calibrate(); ctx.msg = 'Neutral set ✓'; repaintKeep(); },
    vib(v) { const p = api.pref(); p.vib = v === '1'; api.savePref(); if (p.vib) api.buzz(30); repaintKeep(); }, snd(v) { api.sound(v === '1'); repaintKeep(); },
    reset() { showModal('confirm', 'Reset all progress?'); modal.arg = 'Reset all progress?'; modal.confirm = 'doreset'; paint(); }, doreset() { SAVE = fresh(); save(); pushStyle(); closeModal(); go('title', undefined, false); hist = []; },
    buytix() { if (SAVE.gems < 3) return; SAVE.gems -= 3; SAVE.tix.n = 6; SAVE.tix.at = Date.now(); save(); closeModal(); },
    dnext() { if (!dlg) return; if (dlg.i < dlg.lines.length - 1) dlg.i++; else { const d = dlg.done; dlg = null; if (d) d(); } paint(); },
    // racing
    startrace() { const s = SERIES[ctx.series || 0], i = ctx.race || 0, r = s.races[i]; if (tickets() < 1) return showModal('tickets'); pushStyle(); SAVE.tix.n -= 1; if (SAVE.tix.n === TIX_MAX - 1) SAVE.tix.at = Date.now(); save(); ctx.career = { sid: s.id, idx: i, id: s.id + i, def: r }; startRoom({ track: r.track, laps: r.laps, level: r.level, grid: r.grid }, true); },
    friends() { ctx.msg = ''; go('friends'); }, quick() { pushStyle(); ctx.career = null; go('waiting', 'Finding racers…'); api.ask('race:quick', {}, (r) => { if (!r || !r.ok) { ctx.msg = (r && r.error) || 'Could not join a race.'; go('friends', undefined, false); return; } ctx.lobbyAt = performance.now(); api.setStyle({}); go('lobby', undefined, false); }); },
    create() { pushStyle(); ctx.career = null; api.ask('race:create', { laps: 3, grid: 8 }, (r) => { if (!r || !r.ok) { ctx.msg = (r && r.error) || 'Could not create a room.'; paint(); return; } ctx.lobbyAt = performance.now(); api.setStyle({}); go('lobby'); }); },
    practice() { pushStyle(); ctx.career = null; startRoom({ laps: 3, grid: 8, level: 2, track: 'harbor' }, false); },
    join() { const v = (ui.querySelector('#drc') || {}).value; if (!v) { ctx.msg = 'Type the 4-letter room code.'; return paint(); } pushStyle(); ctx.career = null; api.ask('race:join', { code: v }, (r) => { if (!r || !r.ok) { ctx.msg = (r && r.error) || 'No race with that code.'; return paint(); } ctx.lobbyAt = performance.now(); api.setStyle({}); go('lobby'); }); },
    copy() { try { navigator.clipboard.writeText(api.code()); ctx.msg = 'Code copied ✓'; repaintKeep(); } catch (e) { /* clipboard blocked */ } },
    trk(v) { const ids = RT.list().map((t) => t.id), l = api.lobby(); let i = ids.indexOf(l.track || 'harbor'); i = (i + +v + ids.length) % ids.length; api.emit('race:options', { track: ids[i] }); },
    laps(v) { api.emit('race:options', { laps: +v }); }, grid(v) { api.emit('race:options', { grid: +v }); }, level(v) { api.emit('race:options', { level: +v }); },
    start() { api.ask('race:start', {}, (r) => { if (r && !r.ok) { ctx.msg = r.error; repaintKeep(); } }); },
    leave() { api.leave(() => { hist = []; go('main', undefined, false); }); },
    next() { go('result2', undefined, false); },
    done() { const c = ctx.career; ctx.career = null; api.leave(() => { if (c) { go('series', undefined, false); } else go('main', undefined, false); }); },
    resume() { api.setPaused(false); modal = null; paint(); }, quitrace() { api.setPaused(false); modal = null; api.leave(() => { api.hudShow(false); ctx.career = null; go('main', undefined, false); }); }
  };
  function repaintKeep() { paint(); }
  function startRoom(opts, career) {
    go('waiting', 'Getting ready…');
    api.ask('race:create', opts, (r) => { if (!r || !r.ok) { ctx.msg = (r && r.error) || 'Could not start the race.'; go('main', undefined, false); say([ctx.msg]); return; } api.setStyle({}); api.ask('race:start', {}, (x) => { if (x && !x.ok) { go('main', undefined, false); say([x.error || 'Could not start.']); } }); });
  }

  /* ---------- results: stars, coins, gems, best times ---------- */
  function finishRace(res) {
    const me = api.me(), mine = res.order.find((o) => o.id === me.id) || { place: res.order.length, dnf: true, timeMs: 0 }, place = mine.dnf ? Math.max(mine.place, 4) : mine.place, c = ctx.career;
    const o = { place, timeMs: mine.dnf ? 0 : mine.timeMs, order: res.order, ranked: res.ranked, track: (api.lobby() && api.lobby().track) || 'harbor', stars: 0, coins: 0, gems: 0, newStar: 0, best: 0 };
    SAVE.stats.races++; if (place === 1) SAVE.stats.wins++;
    if (c) { const id = c.id; const st = place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0, was = starsOf(id); o.stars = st; if (st > was) { o.newStar = st - was; SAVE.stars[id] = st; if (st === 3) o.gems = 1; } const mult = place === 1 ? 1 : place === 2 ? .6 : place === 3 ? .4 : .2; o.coins = Math.round(c.def.reward * mult * (was >= 3 ? .5 : 1)); if (!mine.dnf && (!SAVE.best[id] || mine.timeMs < SAVE.best[id])) SAVE.best[id] = mine.timeMs; o.best = SAVE.best[id] || 0; o.track = c.def.track; if (c.def.driver != null && place === 1 && !SAVE.drivers.includes(c.def.driver)) { SAVE.drivers.push(c.def.driver); ctx.unlock = RACEGFX.DRIVERS[c.def.driver].name; } }
    else { o.coins = Math.max(20, 70 - place * 6) + (res.ranked ? 20 : 0); o.stars = place <= 3 ? 4 - place : 0; o.best = mine.timeMs || 0; }
    SAVE.coins += o.coins; SAVE.gems += o.gems;
    const k = SAVE.chal; if (k.day === day() && !k.done) { const defs = [['races', 2, 150], ['win', 1, 250], ['races', 3, 200]], d = defs[k.id]; k.prog += d[0] === 'win' ? (place === 1 ? 1 : 0) : 1; if (k.prog >= d[1]) { k.done = true; SAVE.coins += d[2]; } }
    save(); ctx.res = o; api.hudShow(false); go('result1', undefined, false);
    if (res.ranked) api.ask('race:board', {}, () => { /* warms the board for the Championships screen */ });
    if (ctx.unlock) { const n = ctx.unlock; ctx.unlock = null; timers.push(setTimeout(() => say([`You unlocked a new driver: ${n}!`]), 600)); }
  }

  /* ---------- plugged into the race ---------- */
  const menu = {
    open(el, a, ok) { ui = el; api = a; ok3d = ok; load(); tickets(); if (!document.getElementById('drace-menu-css')) { const st = document.createElement('style'); st.id = 'drace-menu-css'; st.textContent = CSS; document.head.appendChild(st); }
      ui.style.pointerEvents = 'none'; ui.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (!t || !ui.contains(t)) return; const act = t.dataset.act; let f = ACT[act]; if (modal && modal.confirm && act === modal.confirm) f = ACT[act]; if (f) { api.beep(520, .05, 'square', .03); f(t.dataset.v); } });
      ui.addEventListener('pointerdown', () => { /* unlock audio on the first touch */ });
      pushStyle(); screen = ''; hist = []; go(ok ? 'title' : 'nogl', undefined, false); timers.push(setInterval(() => { tipI++; if (screen === 'main' && !modal && !dlg) paint(); }, 7000)); },
    on(ev, d) {
      if (ev === 'lobby') { ctx.lobbyAt = performance.now(); if (screen === 'lobby' || screen === 'waiting') go('lobby', undefined, false); }
      else if (ev === 'countdown') { ui.querySelector('.scr') && (ui.innerHTML = ''); modal = null; dlg = null; }
      else if (ev === 'results') finishRace(d);
      else if (ev === 'over') { ctx.msg = (d && d.error) || ''; go('main', undefined, false); }
    },
    pause(on) { if (on) { showModal('settings', true, true); } else { modal = null; paint(); } },
    close() { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = []; clearInterval(tmT); ui = null; }
  };
  // the confirm dialog uses a generic body
  const origShow = showModal; void origShow;
  M_.confirm = function (txt) { return `<div class="panel" style="width:calc(var(--u)*400px);text-align:center"><h2 class="tt">${esc(txt || (modal && modal.arg) || 'Are you sure?')}</h2><div style="display:flex;gap:calc(var(--u)*10px);justify-content:center"><button class="btn red" data-act="${(modal && modal.confirm) || 'close'}">Yes</button><button class="btn blue" data-act="close">No</button></div></div>`; };
  return { menu, _save: () => SAVE, _ctx: () => ctx, _go: go, _show: showModal };
})();
if (typeof DRACE !== 'undefined') DRACE.attachMenu(RACEMENU.menu);
