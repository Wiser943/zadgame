// AllConnect platform realtime: live online count, shared visit/gem counters, who's on the map.
// Uses the same session/login as GameHub (io.engine already runs the session middleware).
const User = require('../models/User');
const ACStat = require('../models/ACStat');
const { ensureAC } = require('../routes/allconnect');

module.exports = function initAllConnect(io) {
  const nsp = io.of('/ac');
  const online = new Map();                 // socket.id -> { id, name }
  const stats = { visits: 0, gems: 0 };
  ACStat.findById('global').lean().then((d) => { if (d) { stats.visits = d.visits; stats.gems = d.gems; } }).catch(() => {});
  const bump = (f) => ACStat.updateOne({ _id: 'global' }, { $inc: { [f]: 1 } }, { upsert: true }).catch(() => {});
  const snapshot = () => ({ online: new Set([...online.values()].map((v) => v.id)).size, visits: stats.visits, gems: stats.gems });
  const roster = () => [...new Map([...online.values()].map((v) => [v.id, { name: v.name }])).values()].slice(0, 40);
  const push = () => { nsp.emit('stats', snapshot()); nsp.emit('players', roster()); };

  nsp.use((socket, next) => {
    const u = socket.request.user;
    if (!u) return next(new Error('unauthorized'));
    if (u.suspendedUntil && new Date(u.suspendedUntil).getTime() > Date.now()) return next(new Error('account-suspended'));
    next();
  });

  nsp.on('connection', (socket) => {
    const u = socket.request.user;
    online.set(socket.id, { id: u.id, name: u.displayName });
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
    socket.on('disconnect', () => { online.delete(socket.id); push(); });
  });
};
