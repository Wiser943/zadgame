// AllConnect platform realtime: live online count, shared visit/gem counters, who's on the map.
// Uses the same session/login as GameHub (io.engine already runs the session middleware).
const User = require('../models/User');
const ACStat = require('../models/ACStat');
const { ensureAC } = require('../routes/allconnect');
const { rosterEntry } = require('../routes/acstyle');
const acPresence = require('../utils/acpresence');
const { sanitizePos, publicPos } = require('../utils/acmappos');
const { notify } = require('../utils/acnotify');

module.exports = function initAllConnect(io) {
  const nsp = io.of('/ac');
  const online = new Map();                 // socket.id -> { id, name }
  const stats = { visits: 0, gems: 0 };
  ACStat.findById('global').lean().then((d) => { if (d) { stats.visits = d.visits; stats.gems = d.gems; } }).catch(() => {});
  const bump = (f) => {
    ACStat.updateOne({ _id: 'global' }, { $inc: { [f]: 1 } }, { upsert: true }).catch(() => {});
    if (f === 'visits') ACStat.updateOne({ _id: 'day:' + new Date(Date.now() + 3600000).toISOString().slice(0, 10) }, { $inc: { visits: 1 } }, { upsert: true }).catch(() => {});   // visits today (Lagos day) for the public stats page
  };
  /* ---------- nearby-only street (interest management) ----------
     Everybody used to receive everybody's position. Now a coarse grid (200 m cells) tracks where each socket is, and a position / chat / emote
     only goes to sockets in the 3x3 cells around the sender. Cheap, and it keeps phones fast when the street fills up. */
  const CELL = 200, NEAR = 330, ROSTER = 700, SAY = 70, grid = new Map(), cellOf = new Map();
  const ckey = (x, y) => Math.floor(x / CELL) + ',' + Math.floor(y / CELL);
  const gridSet = (sid, x, y) => {
    const k = ckey(x, y), old = cellOf.get(sid); if (old === k) return;
    if (old) { const s0 = grid.get(old); if (s0) { s0.delete(sid); if (!s0.size) grid.delete(old); } }
    if (!grid.has(k)) grid.set(k, new Set()); grid.get(k).add(sid); cellOf.set(sid, k);
  };
  const gridDel = (sid) => { const old = cellOf.get(sid); if (old) { const s0 = grid.get(old); if (s0) { s0.delete(sid); if (!s0.size) grid.delete(old); } cellOf.delete(sid); } };
  const nearIds = (x, y) => { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), out = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const s0 = grid.get((cx + i) + ',' + (cy + j)); if (s0) s0.forEach((sid) => out.push(sid)); } return out; };
  const toNear = (o, sid, ev, payload, maxD) => { for (const id of nearIds(o.x, o.y)) { const t = online.get(id); if (!t || (id === sid && ev !== 'world:said')) continue; if (maxD && Math.hypot(t.x - o.x, t.y - o.y) > maxD) continue; nsp.to(id).emit(ev, payload); } };
  const snapshot = () => ({ online: new Set([...online.values()].map((v) => v.id)).size, visits: stats.visits, gems: stats.gems });
  // the 40 closest players to this socket (everyone with no position yet is skipped)
  const rosterFor = (sid) => {
    const me = online.get(sid), out = new Map(); if (!me) return [];
    const have = Number.isFinite(me.x) && Number.isFinite(me.y);
    for (const [id, v] of online) { if (id === sid || out.has(v.id)) continue; if (have && Number.isFinite(v.x) && Math.hypot(v.x - me.x, v.y - me.y) > ROSTER) continue; out.set(v.id, { d: have && Number.isFinite(v.x) ? Math.hypot(v.x - me.x, v.y - me.y) : 1e9, e: { id: v.id, name: v.name, g: v.g, l: v.l || undefined, ...publicPos(v) } }); }
    return [...out.values()].sort((a, b) => a.d - b.d).slice(0, 40).map((x) => x.e);
  };
  const pushPlayers = () => { for (const sid of online.keys()) nsp.to(sid).emit('players', rosterFor(sid)); };
  const push = () => { nsp.emit('stats', snapshot()); pushPlayers(); };

  nsp.use(require('../utils/socketToken').attachUser);
  nsp.use((socket, next) => {
    const u = socket.request.user;
    if (!u) return next(new Error('unauthorized'));
    if (u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now()) return next(new Error('account-suspended'));
    next();
  });

  nsp.on('connection', (socket) => {
    const u = socket.request.user;
    const last = sanitizePos(u.ac && u.ac.mapPos);
    online.set(socket.id, { id: u.id, name: u.displayName, g: (u.ac && (u.ac.gender === 'male' || u.ac.gender === 'female')) ? u.ac.gender : '', l: null, ...(last ? { x: last.x, y: last.y, h: last.h, st: 'idle' } : {}) });
    // What strangers see on the map follows this player's privacy choices (Style app > Identity). Loaded after connecting so it never delays login.
    const loadLook = () => rosterEntry(u.id).then((e) => { const o = online.get(socket.id); if (o && e) { o.g = e.g; o.l = e.l; push(); } }).catch(() => {});
    loadLook(); socket.on('style', loadLook);
    { const me0 = online.get(socket.id); if (me0 && Number.isFinite(me0.x)) gridSet(socket.id, me0.x, me0.y); }
    socket.join('u:' + u.id); acPresence.connect(u.id);   // private room for DMs, friend events, notifications
    stats.visits++; bump('visits'); push();
    socket.on('pos', (raw) => {
      const p = sanitizePos(raw); if (!p) return;
      const o = online.get(socket.id); if (!o) return;
      const now = Date.now(); if (o.posAt && now - o.posAt < 70) return; o.posAt = now;
      o.x = p.x; o.y = p.y; o.h = p.h; o.st = p.st; o.v = p.v; o.sp = p.sp; o.job = p.job; o.c = p.c;
      gridSet(socket.id, p.x, p.y);
      toNear(o, socket.id, 'pos', { id: o.id, name: o.name, x: p.x, y: p.y, h: p.h, st: p.st, v: p.v, sp: p.sp, job: p.job, c: p.c }, NEAR);
      if (!p.c && (!o.saveAt || now - o.saveAt > 8000)) {
        o.saveAt = now;
        User.updateOne({ _id: u.id }, { $set: { 'ac.mapPos': { x: p.x, y: p.y, h: p.h } } }).catch(() => {});
      }
    });
    // Workplace scenes: everyone with the same job who has their workplace open sees each other (room 'work:<job>', max 24).
    let wk = '';
    const wkInfo = () => { const o = online.get(socket.id) || {}; return { id: u.id, name: u.displayName, g: o.g || '', t: o.wt || '', x: o.wx || 0, z: o.wz || 0, h: o.wh || 0 }; };
    const wkLeave = () => { if (!wk) return; socket.to('work:' + wk).emit('work:leave', { id: u.id }); socket.leave('work:' + wk); wk = ''; const o = online.get(socket.id); if (o) o.wk = ''; };
    socket.on('work:enter', async (raw) => {
      const job = String((raw && raw.job) || '').replace(/[^a-z0-9_]/gi, '').slice(0, 20); if (!job) return;
      wkLeave();
      const room = 'work:' + job, inRoom = await nsp.in(room).fetchSockets().catch(() => []);
      if (inRoom.length >= 24) return;
      wk = job; socket.join(room); const o = online.get(socket.id); if (o) { o.wk = job; o.wt = String((raw && raw.title) || '').replace(/[^\w &'.-]/g, '').slice(0, 30); o.wx = 4.9; o.wz = 3; o.wh = 0; }
      const seen = new Set([u.id]), list = [];
      for (const [sid, v] of online) { if (v.wk === job && !seen.has(v.id)) { seen.add(v.id); list.push({ id: v.id, name: v.name, g: v.g || '', t: v.wt || '', x: v.wx || 0, z: v.wz || 0, h: v.wh || 0 }); } }
      socket.emit('work:roster', list);
      socket.to(room).emit('work:join', wkInfo());
    });
    socket.on('work:move', (raw) => {
      if (!wk) return; const o = online.get(socket.id); if (!o) return;
      const now = Date.now(); if (o.wkAt && now - o.wkAt < 90) return; o.wkAt = now;
      const n = (v, lim) => { v = Number(v); return Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0; };
      o.wx = n(raw && raw.x, 7); o.wz = n(raw && raw.z, 6); o.wh = n(raw && raw.h, 7); o.ws = (raw && raw.s) === 'work' ? 'work' : (raw && raw.s) === 'walk' ? 'walk' : 'idle';
      socket.to('work:' + wk).emit('work:pos', { id: u.id, x: o.wx, z: o.wz, h: o.wh, s: o.ws });
    });
    // Talk and emote to everyone within ~70 m in the street. Filtered, short, rate-limited, never stored.
    const STREET_EMOTES = ['wave', 'laugh', 'dance', 'abeg', 'hiss', 'clap'];
    socket.on('world:say', (raw) => {
      const o = online.get(socket.id); if (!o || !Number.isFinite(o.x)) return; const now = Date.now(); if (o.wsayAt && now - o.wsayAt < 1200) return; o.wsayAt = now;
      const text = require('../utils/profanity').clean(String((raw && raw.text) || '').replace(/\s+/g, ' ').trim().slice(0, 140)); if (!text) return;
      toNear(o, socket.id, 'world:said', { id: u.id, name: u.displayName, text, at: now }, SAY);
      nsp.to(socket.id).emit('world:said', { id: u.id, name: u.displayName, text, at: now });
    });
    socket.on('world:emote', (raw) => {
      const o = online.get(socket.id); if (!o || !Number.isFinite(o.x)) return; const now = Date.now(); if (o.wemAt && now - o.wemAt < 800) return; o.wemAt = now;
      const e = String((raw && raw.e) || ''); if (!STREET_EMOTES.includes(e)) return;
      toNear(o, socket.id, 'world:emoted', { id: u.id, name: u.displayName, e }, SAY);
    });
    // Talk and emote to everyone in the same workplace. Short, filtered, rate-limited; nothing is stored.
    const EMOTES = ['wave', 'laugh', 'dance', 'abeg', 'hiss', 'clap'];
    socket.on('work:say', (raw) => {
      if (!wk) return; const o = online.get(socket.id); if (!o) return; const now = Date.now(); if (o.sayAt && now - o.sayAt < 1200) return; o.sayAt = now;
      const text = require('../utils/profanity').clean(String((raw && raw.text) || '').replace(/\s+/g, ' ').trim().slice(0, 140)); if (!text) return;
      nsp.to('work:' + wk).emit('work:said', { id: u.id, name: u.displayName, text, at: now });
    });
    socket.on('work:emote', (raw) => {
      if (!wk) return; const o = online.get(socket.id); if (!o) return; const now = Date.now(); if (o.emAt && now - o.emAt < 800) return; o.emAt = now;
      const e = String((raw && raw.e) || ''); if (!EMOTES.includes(e)) return;
      socket.to('work:' + wk).emit('work:emoted', { id: u.id, name: u.displayName, e });
    });
    socket.on('work:leave', wkLeave);
    // The old tap-to-find gem was replaced by the admin-controlled daily gem hunt (routes/acgem.js).
    socket.on('disconnect', () => { wkLeave(); online.delete(socket.id); gridDel(socket.id); acPresence.disconnect(u.id); push(); });
  });

  setInterval(() => { if (online.size) pushPlayers(); }, 3500).unref();

  // Leaderboard news: whenever a different player becomes #1 by balance, post it to everyone's Updates.
  const watch = async () => {
    try {
      const top = await User.findOne({ 'ac.cash': { $gt: 0 } }).sort({ 'ac.cash': -1, _id: 1 }).select('displayName acUsername');
      if (!top) return;
      const prev = await ACStat.findById('global').lean();
      if (prev && prev.topUser === String(top._id)) return;
      await ACStat.updateOne({ _id: 'global' }, { $set: { topUser: String(top._id) } }, { upsert: true });
      if (prev && prev.topUser) await notify(io, null, { icon: '👑', text: `${top.acUsername ? '@' + top.acUsername : top.displayName} just topped the GameHub leaderboard`, kind: 'good' });
    } catch (e) { /* ignore */ }
  };
  setTimeout(watch, 15000); setInterval(watch, 60000).unref();
};
