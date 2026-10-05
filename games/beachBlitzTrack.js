const TRACK = [
  { x: 0, y: -560 }, { x: 260, y: -520 }, { x: 500, y: -340 }, { x: 610, y: -40 },
  { x: 540, y: 260 }, { x: 300, y: 440 }, { x: 0, y: 520 }, { x: -320, y: 470 },
  { x: -560, y: 270 }, { x: -620, y: -30 }, { x: -500, y: -330 }, { x: -250, y: -520 }
];
const TRACK_WIDTH = 220;
const START = { x: 0, y: -575, angle: Math.PI / 2 };

function sample(t) {
  const n = TRACK.length;
  const u = ((t % 1) + 1) % 1 * n;
  const i = Math.floor(u), f = u - i;
  const a = TRACK[i % n], b = TRACK[(i + 1) % n];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function nearestProgress(x, y) {
  let best = { d: Infinity, t: 0 };
  for (let i = 0; i < TRACK.length; i++) {
    const a = TRACK[i], b = TRACK[(i + 1) % TRACK.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + dx * f, py = a.y + dy * f;
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < best.d) best = { d, t: (i + f) / TRACK.length };
  }
  return best;
}

module.exports = { TRACK, TRACK_WIDTH, START, sample, nearestProgress };
