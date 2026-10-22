const ACUpdate = require('../models/ACUpdate');
const push = require('../services/push');
const view = (u) => ({ id: String(u._id), icon: u.icon, text: u.text, kind: u.kind, ref: u.ref || '', from: u.from || '', at: u.at });
// userId = null -> global post to everyone online. Always also stored, so it shows in Updates later.
async function notify(io, userId, { icon = '🔔', text, kind = 'info', ref = '', from = '' }) {
  const doc = await ACUpdate.create({ user: userId ? String(userId) : null, icon, text: String(text).slice(0, 240), kind, ref: String(ref || ''), from: String(from || '') });
  const v = view(doc);
  if (io) { const nsp = io.of('/ac'); if (userId) nsp.to('u:' + userId).emit('update', v); else nsp.emit('update', v); }
  const payload = { title: 'AllConnect update', body: v.text, icon: v.icon, target: v.ref ? (v.ref.startsWith('u:') ? { type: 'updates' } : { type: 'gist', ref: v.ref }) : { type: 'updates' } };
  (userId ? push.sendToUser(userId, payload) : push.sendGlobal(payload)).catch((e) => console.error('[push notify]', e.message));
  return v;
}
const emitUser = (io, userId, ev, payload) => { if (io) io.of('/ac').to('u:' + String(userId)).emit(ev, payload); };
module.exports = { notify, emitUser, view };
