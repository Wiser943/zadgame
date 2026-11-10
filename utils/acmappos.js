// Live map coordinates from the client. Clamp to the playable 1000×1000 world and drop junk.
const W = 1000;
// drive = in a vehicle, work = doing a job shift on the street (3D outdoor world)
const STATES = new Set(['idle', 'walk', 'run', 'dance', 'wave', 'drive', 'work']);
const VEHICLE_KINDS = new Set(['bicycle', 'motorcycle', 'car', 'bus', 'van']);
const TAU = Math.PI * 2;
// which city map a player is standing in (Lagos is the default and is left out of the message)
const CITY_KEYS = new Set(['abuja', 'ph', 'abia']);

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function sanitizePos(p) {
  if (!p || typeof p !== 'object') return null;
  const x = Number(p.x), y = Number(p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const h = Number(p.h);
  const st = STATES.has(p.st) ? p.st : 'idle';
  const out = {
    x: clamp(x, 0, W),
    y: clamp(y, 0, W),
    h: Number.isFinite(h) ? ((h % TAU) + TAU) % TAU : 0,
    st
  };
  // optional extras used by the 3D street world: which vehicle the player is in, how fast, what job they are doing
  if (typeof p.v === 'string' && VEHICLE_KINDS.has(p.v)) out.v = p.v;
  if (typeof p.c === 'string' && CITY_KEYS.has(p.c)) out.c = p.c;
  const sp = Number(p.sp);
  if (out.v && Number.isFinite(sp)) out.sp = clamp(Math.round(sp * 10) / 10, 0, 90);
  if (typeof p.job === 'string') { const j = p.job.replace(/[^\w .&'-]/g, '').trim().slice(0, 24); if (j) out.job = j; }
  return out;
}

function publicPos(o) {
  if (!o || o.x == null) return {};
  const out = { x: o.x, y: o.y, h: o.h || 0, st: o.st || 'idle' };
  if (o.v) out.v = o.v;
  if (o.v && o.sp) out.sp = o.sp;
  if (o.job) out.job = o.job;
  if (o.c) out.c = o.c;
  return out;
}

module.exports = { W, sanitizePos, publicPos, STATES, VEHICLE_KINDS, CITY_KEYS };
