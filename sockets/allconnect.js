// AllConnect platform realtime: live online count, shared visit/gem counters, who's on the map.
// Uses the same session/login as GameHub (io.engine already runs the session middleware).
const User = require('../models/User');
const ACStat = require('../models/ACStat');
const { ensureAC } = require('../routes/allconnect');
const { rosterEntry } = require('../routes/acstyle');
const acPresence = require('../utils/acpresence');
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
  const snapshot = () => ({ online: new Set([...online.values()].map((v) => v.id)).size, visits: stats.visits, gems: stats.gems });
  const roster = () => [...new Map([...online.values()].map((v) => [v.id, { name: v.name, g: v.g, l: v.l || undefined }])).values()].slice(0, 40);
  const push = () => { nsp.emit('stats', snapshot()); nsp.emit('players', roster()); };

  nsp.use((socket, next) => {
    const u = socket.request.user;
    if (!u) return next(new Error('unauthorized'));
    if (u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now()) return next(new Error('account-suspended'));
    next();
  });

  nsp.on('connection', (socket) => {
    const u = socket.request.user;
    online.set(socket.id, { id: u.id, name: u.displayName, g: (u.ac && (u.ac.gender === 'male' || u.ac.gender === 'female')) ? u.ac.gender : '', l: null });
    // What strangers see on the map follows this player's privacy choices (Style app > Identity). Loaded after connecting so it never delays login.
    const loadLook = () => rosterEntry(u.id).then((e) => { const o = online.get(socket.id); if (o && e) { o.g = e.g; o.l = e.l; push(); } }).catch(() => {});
    loadLook(); socket.on('style', loadLook);
    socket.join('u:' + u.id); acPresence.connect(u.id);   // private room for DMs, friend events, notifications
    stats.visits++; bump('visits'); push();
    let last = 0;
    socket.on('gem', async () => {            // 1 gem / 2s; every 5th pays ₦3,000
      const now = Date.now(); if (now - last < 2000) return; last = now;
      try {
        await ensureAC(u.id);
        const a = await User.findByIdAndUpdate(u.id, { $inc: { 'ac.gemsFound': 1 } }, { new: true });
        const prize = a.ac.gemsFound % 5 === 0 ? 3000 : 0;
        const cash = prize ? (await User.findByIdAndUpdate(u.id, { $inc: { 'ac.cash': prize } }, { new: true })).ac.cash : a.ac.cash;
        stats.gems++; bump('gems');
        socket.emit('gem', { prize, cash, found: a.ac.gemsFound });
        nsp.emit('stats', snapshot());
      } catch (e) { console.error('[ac gem]', e.message); }
    });
    socket.on('disconnect', () => { online.delete(socket.id); acPresence.disconnect(u.id); push(); });
  });

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
