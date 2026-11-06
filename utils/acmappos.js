// Live map coordinates from the client. Clamp to the playable 1000×1000 world and drop junk.
const W = 1000;
const STATES = new Set(['idle', 'walk', 'run', 'dance', 'wave']);
const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function sanitizePos(p) {
  if (!p || typeof p !== 'object') return null;
  const x = Number(p.x), y = Number(p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const h = Number(p.h);
  const st = STATES.has(p.st) ? p.st : 'idle';
  return {
    x: clamp(x, 0, W),
    y: clamp(y, 0, W),
    h: Number.isFinite(h) ? ((h % TAU) + TAU) % TAU : 0,
    st
  };
}

function publicPos(o) {
  if (!o || o.x == null) return {};
  return { x: o.x, y: o.y, h: o.h || 0, st: o.st || 'idle' };
}

module.exports = { W, sanitizePos, publicPos, STATES };
