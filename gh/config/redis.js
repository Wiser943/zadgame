// Optional Redis support. Set REDIS_URL to enable the Socket.io Redis adapter so several app instances can share
// socket broadcasts (invites, tournament notices, presence-style emits). Without REDIS_URL everything runs in-process.
//   npm i redis @socket.io/redis-adapter
// NOTE: active game rooms are still held in each instance's memory, so with more than one instance you MUST use sticky
// sessions (route by the socket.io cookie / room code) until room state itself is moved into Redis.
let pub = null, sub = null;
async function attachRedis(io) {
  const url = process.env.REDIS_URL;
  if (!url) return { enabled: false };
  try {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    pub = createClient({ url }); sub = pub.duplicate();
    pub.on('error', (e) => console.error('[redis]', e.message)); sub.on('error', (e) => console.error('[redis]', e.message));
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    console.log('[redis] Socket.io adapter enabled');
    return { enabled: true };
  } catch (e) {
    console.error('[redis] disabled, running single-process:', e.message);
    pub = sub = null;
    return { enabled: false, error: e.message };
  }
}
async function redisHealth() {
  if (!process.env.REDIS_URL) return { configured: false };
  if (!pub) return { configured: true, ok: false };
  try { await pub.ping(); return { configured: true, ok: true }; } catch { return { configured: true, ok: false }; }
}
async function closeRedis() { await Promise.allSettled([pub && pub.quit(), sub && sub.quit()]); }
module.exports = { attachRedis, redisHealth, closeRedis };
