// Room layouts for homes that are built from a 3D house model (see tools/house_layout).
// The same JSON is shipped to the browser (public/allconnect/layouts.js mirrors it; a test keeps them equal).
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'public', 'allconnect', 'models', 'layouts');
const cache = new Map();
// -> { id, w, d, blocked: Set('x,z'), walls: Set('ax,az|bx,bz'), start: [x, z], model } or null
function layoutFor(id) {
  if (!/^[a-z0-9_]+$/.test(String(id || ''))) return null;
  if (cache.has(id)) return cache.get(id);
  let out = null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8'));
    out = { id: j.id, w: j.w, d: j.d, blocked: new Set(j.blocked.map((c) => c[0] + ',' + c[1])), walls: new Set(j.walls), start: j.start, model: j.model };
  } catch (e) { out = null; }
  cache.set(id, out); return out;
}
module.exports = { layoutFor };
