/* Small read-through cache. Uses Redis when REDIS_URL is set and connected (shared by every server instance), and an in-memory
   map otherwise, so the same code runs on a laptop and in production.  wrap(key, seconds, fn): the first caller does the work,
   everyone else in that window gets the stored answer, and callers that arrive while it is being computed share one computation. */
const redis = require('../config/redis');
const mem = new Map(), inflight = new Map();
const MAX = 500;
async function get(key) {
  const c = redis.client();
  if (c) { try { const s = await c.get('cache:' + key); return s == null ? undefined : JSON.parse(s); } catch (e) { /* fall through to memory */ } }
  const m = mem.get(key); if (m && m.exp > Date.now()) return m.v; mem.delete(key); return undefined;
}
async function set(key, v, seconds) {
  const c = redis.client();
  if (c) { try { await c.set('cache:' + key, JSON.stringify(v), { EX: Math.max(1, Math.floor(seconds)) }); return; } catch (e) { /* use memory */ } }
  if (mem.size >= MAX) mem.delete(mem.keys().next().value);
  mem.set(key, { v, exp: Date.now() + seconds * 1000 });
}
async function wrap(key, seconds, fn) {
  const hit = await get(key); if (hit !== undefined) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => { try { const v = await fn(); await set(key, v, seconds); return v; } finally { inflight.delete(key); } })();
  inflight.set(key, p); return p;
}
async function del(key) { mem.delete(key); const c = redis.client(); if (c) { try { await c.del('cache:' + key); } catch (e) { /* ignore */ } } }
module.exports = { get, set, wrap, del };
