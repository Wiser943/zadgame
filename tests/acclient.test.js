// Browser-side logic (furniture rules, house layout, 3D-model hooks, tap-to-use actions) run in a Node vm with stubs.
// The scripts print "ok" / "FAIL" lines and set a non-zero exit code on failure.
const test = require('node:test'), assert = require('node:assert'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
for (const f of ['client_smoke_basic.js', 'client_smoke_room.js']) {
  test('client smoke: ' + f, () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'helpers', f)], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(!/FAIL/.test(r.stdout), r.stdout); assert.ok(/ok /.test(r.stdout));
  });
}
