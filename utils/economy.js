// The single wallet. Everything that moves money for a player (games, shop, invest, ads, bank) ends up on User.ac.cash.
// debit() never lets a balance go below zero and credit()/debit() push the new balance to every open screen of that player.
const User = require('../models/User');

let ioRef = null;
const setIO = (io) => { ioRef = io; };
const ensure = (id) => require('../routes/allconnect').ensureAC(id);   // lazy: routes/allconnect also needs models only

// Tell every open screen (platform HUD + GameHub) the new balance.
function announce(id, cash) {
  if (!ioRef || typeof cash !== 'number') return;
  try { ioRef.to('user:' + id).emit('balance', { cash }); ioRef.of('/ac').to('u:' + id).emit('cash', { cash }); } catch (e) { /* ignore */ }
}

// Take `amt` (>0) off the balance only if there is enough. Returns the new balance, or null when they can't afford it.
async function debit(id, amt) {
  amt = Math.floor(Number(amt));
  if (!(amt > 0)) return (await balance(id));
  const q = () => User.findOneAndUpdate({ _id: id, 'ac.cash': { $gte: amt } }, { $inc: { 'ac.cash': -amt } }, { new: true }).select('ac.cash');
  let u = await q();
  if (!u) { await ensure(id); u = await q(); }          // account created before AllConnect: give it its starting balance, then retry once
  if (!u) return null;
  announce(String(id), u.ac.cash);
  return u.ac.cash;
}
async function credit(id, amt) {
  amt = Math.floor(Number(amt));
  if (!(amt > 0)) return balance(id);
  await ensure(id);
  const u = await User.findByIdAndUpdate(id, { $inc: { 'ac.cash': amt } }, { new: true }).select('ac.cash');
  if (!u) return null;
  announce(String(id), u.ac.cash);
  return u.ac.cash;
}
// Can add or take (negative) without a floor check, but the result is clamped at 0. Used by admin penalties and trailer repair bills.
async function adjust(id, delta) {
  delta = Math.trunc(Number(delta)) || 0;
  if (!delta) return balance(id);
  await ensure(id);
  const u = await User.findByIdAndUpdate(id, [{ $set: { 'ac.cash': { $max: [0, { $add: [{ $ifNull: ['$ac.cash', 0] }, delta] }] } } }], { new: true }).select('ac.cash');
  if (!u) return null;
  announce(String(id), u.ac.cash);
  return u.ac.cash;
}
async function balance(id) {
  const u = await User.findById(id).select('ac.cash').lean();
  if (u && u.ac && typeof u.ac.cash === 'number') return u.ac.cash;
  await ensure(id);
  const v = await User.findById(id).select('ac.cash').lean();
  return v && v.ac ? v.ac.cash : 0;
}
const canAfford = async (id, amt) => (await balance(id)) >= amt;
const cashOf = (u) => (u && u.ac && typeof u.ac.cash === 'number' ? u.ac.cash : 0);

module.exports = { setIO, announce, debit, credit, adjust, balance, canAfford, cashOf };
