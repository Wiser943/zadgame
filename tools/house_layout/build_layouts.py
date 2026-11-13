"""Regenerates public/allconnect/layouts.js from public/allconnect/models/layouts/*.json (run from the project root):
    python3 tools/house_layout/build_layouts.py
family_house.json is produced by tools/house_layout/layout.py from the House Interior model; market_shop.json is hand-authored."""
import json, glob
d = 'public/allconnect/models/layouts'
L = {}
for f in sorted(glob.glob(d + '/*.json')):
    j = json.load(open(f)); L[j['id']] = j
HEAD = """/* Generated from models/layouts/*.json by tools/house_layout/build_layouts.py. Room layouts for homes with a fixed floor plan.
   blocked  = cells nobody can stand on or place furniture in (outside the house, walls, built-in furniture)
   walls    = pairs of neighbouring free cells you cannot walk between (a wall with no doorway)
   model    = a 3D house model shown instead of the box room (null = the normal box room)
   fixtures = built-in things you can tap (shop counter, shelves, ...) */
"""
TAIL = """
(function () { for (const id in window.LAYOUTS) { const L = window.LAYOUTS[id]; L.blockedSet = new Set(L.blocked.map(c => c[0] + ',' + c[1])); L.wallSet = new Set(L.walls) } })();
"""
open('public/allconnect/layouts.js', 'w').write(HEAD + 'window.LAYOUTS = ' + json.dumps(L, separators=(',', ':')) + ';' + TAIL)
print('layouts:', list(L))
