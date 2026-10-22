// Short-lived signed tokens that let a Socket.io connection prove who the user is
// when the session cookie can't be sent (frontend and backend on different sites,
// e.g. Netlify + Render, where browsers block third-party cookies).
const crypto = require('crypto');

const key = () => 'socket:' + (process.env.SESSION_SECRET || 'dev_secret_change_me');
const mac = (body) => crypto.createHmac('sha256', key()).update(body).digest('base64url');

function sign(uid, ttlMs = 2 * 60 * 1000) {
  const body = Buffer.from(JSON.stringify({ u: String(uid), e: Date.now() + ttlMs })).toString('base64url');
  return body + '.' + mac(body);
}

function verify(token) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = mac(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.e > Date.now() ? p.u : null; } catch { return null; }
}

// Socket.io middleware: if the cookie session didn't identify the user, try the token.
async function attachUser(socket, next) {
  try {
    if (!socket.request.user) {
      const uid = verify(socket.handshake && socket.handshake.auth && socket.handshake.auth.token);
      if (uid) { const u = await require('../models/User').findById(uid); if (u) socket.request.user = u; }
    }
  } catch { /* fall through: the normal "unauthorized" check decides */ }
  next();
}

module.exports = { sign, verify, attachUser };
