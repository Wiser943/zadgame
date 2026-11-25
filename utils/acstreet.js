// Street rides: the fare in naira for `dist` metres. A taxi is quick and pricey, a bus is slow and cheap. Pure function, used by the route and the tests.
const fare = (mode, dist) => { const d = Math.max(0, Math.min(1600, Number(dist) || 0)), taxi = Math.min(8000, Math.max(300, Math.round(d * 1.6 / 50) * 50)); return mode === 'bus' ? Math.max(150, Math.round(taxi * 0.4 / 50) * 50) : taxi; };
module.exports = { fare };
