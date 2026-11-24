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
  const roomMap = new Map();                // roomId -> Map(socket.id -> playerState)
  const stats = { visits: 0, gems: 0 };
  ACStat.findById('global').lean().then((d) => { if (d) { stats.visits = d.visits; stats.gems = d.gems; } }).catch(() => {});
  const bump = (f) => {
    ACStat.updateOne({ _id: 'global' }, { $inc: { [f]: 1 } }, { upsert: true }).catch(() => {});
    if (f === 'visits') ACStat.updateOne({ _id: 'day:' + new Date(Date.now() + 3600000).toISOString().slice(0, 10) }, { $inc: { visits: 1 } }, { upsert: true }).catch(() => {});   // visits today (Lagos day) for the public stats page
  };
  const snapshot = () => ({ online: new Set([...online.values()].map((v) => v.id)).size, visits: stats.visits, gems: stats.gems });
  const roster = () => [...new Map([...online.values()].map((v) => [v.id, { id: v.id, name: v.name, g: v.g, l: v.l || undefined, ...publicPos(v) }])).values()].slice(0, 40);
  const push = () => { nsp.emit('stats', snapshot()); nsp.emit('players', roster()); };

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
    socket.join('u:' + u.id); acPresence.connect(u.id);   // private room for DMs, friend events, notifications
    stats.visits++; bump('visits'); push();
    socket.on('pos', (raw) => {
      const p = sanitizePos(raw); if (!p) return;
      const o = online.get(socket.id); if (!o) return;
      const now = Date.now(); if (o.posAt && now - o.posAt < 70) return; o.posAt = now;
      o.x = p.x; o.y = p.y; o.h = p.h; o.st = p.st;
      socket.broadcast.emit('pos', { id: o.id, name: o.name, x: p.x, y: p.y, h: p.h, st: p.st });
      if (!o.saveAt || now - o.saveAt > 8000) {
        o.saveAt = now;
        User.updateOne({ _id: u.id }, { $set: { 'ac.mapPos': { x: p.x, y: p.y, h: p.h } } }).catch(() => {});
      }
    });
    // Room Visit multiplayer presence & live movement tracking
    let activeRoomId = null;
    const leaveActiveRoom = () => {
      if (!activeRoomId) return;
      const rm = roomMap.get(activeRoomId);
      if (rm) {
        rm.delete(socket.id);
        socket.to('room:' + activeRoomId).emit('room:user_left', { id: u.id });
        if (rm.size === 0) roomMap.delete(activeRoomId);
      }
      socket.leave('room:' + activeRoomId);
      activeRoomId = null;
    };

    socket.on('room:join', async (data) => {
      const rid = data && data.roomId;
      if (!rid) return;
      if (activeRoomId && activeRoomId !== rid) leaveActiveRoom();
      activeRoomId = rid;
      socket.join('room:' + rid);
      if (!roomMap.has(rid)) roomMap.set(rid, new Map());
      const rm = roomMap.get(rid);

      let g = (u.ac && (u.ac.gender === 'male' || u.ac.gender === 'female')) ? u.ac.gender : 'male';
      let l = (u.ac && u.ac.render) || null;
      try {
        const entry = await rosterEntry(u.id);
        if (entry) { g = entry.g || g; l = entry.l || l; }
      } catch (e) {}

      const playerState = {
        id: u.id,
        name: u.displayName,
        g,
        l,
        x: Number.isFinite(data.x) ? data.x : -1.0,
        y: 0,
        z: Number.isFinite(data.z) ? data.z : 1.2,
        rot: Number.isFinite(data.rot) ? data.rot : 0,
        moving: !!data.moving,
        anim: data.anim || 'idle',
        area: data.area || 'room'
      };
      rm.set(socket.id, playerState);

      const occupants = [...rm.values()].filter(p => p.id !== u.id);
      socket.emit('room:roster', { roomId: rid, players: occupants });
      socket.to('room:' + rid).emit('room:user_joined', playerState);
    });

    socket.on('room:move', (data) => {
      if (!activeRoomId || !data) return;
      const rm = roomMap.get(activeRoomId);
      if (!rm) return;
      const p = rm.get(socket.id);
      if (!p) return;
      if (Number.isFinite(data.x)) p.x = data.x;
      if (Number.isFinite(data.y)) p.y = data.y;
      if (Number.isFinite(data.z)) p.z = data.z;
      if (Number.isFinite(data.rot)) p.rot = data.rot;
      p.moving = !!data.moving;
      if (data.anim) p.anim = data.anim;
      if (data.area) p.area = data.area;

      socket.to('room:' + activeRoomId).emit('room:user_moved', {
        id: u.id,
        x: p.x,
        y: p.y,
        z: p.z,
        rot: p.rot,
        moving: p.moving,
        anim: p.anim,
        area: p.area
      });
    });

    socket.on('room:emote', (data) => {
      if (!activeRoomId || !data) return;
      socket.to('room:' + activeRoomId).emit('room:user_emote', {
        id: u.id,
        emote: data.emote
      });
    });

    socket.on('room:chat', (data) => {
      if (!activeRoomId || !data || !data.text) return;
      const text = String(data.text).slice(0, 120);
      nsp.to('room:' + activeRoomId).emit('room:user_chat', {
        id: u.id,
        name: u.displayName,
        text
      });
    });

    socket.on('room:leave', leaveActiveRoom);

    // The old tap-to-find gem was replaced by the admin-controlled daily gem hunt (routes/acgem.js).
    socket.on('disconnect', () => {
      leaveActiveRoom();
      online.delete(socket.id);
      acPresence.disconnect(u.id);
      push();
    });
  });

  setInterval(() => { if (online.size) nsp.emit('players', roster()); }, 3500).unref();

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
