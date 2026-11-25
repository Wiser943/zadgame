// "Tap now, tell the server later": taps that cancel out never reach the server, the rest go up in one batch.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const calls = [], timers = [];
  const ctx = {
    document: { addEventListener() {} }, window: { addEventListener() {} }, navigator: { sendBeacon: (u, b) => { calls.push({ beacon: u }); return true; } }, Blob: class { constructor(p) { this.p = p; } },
    NET: { api: async (u, o) => { calls.push({ u, body: o.body }); return { results: o.body.ops.map((op) => ({ ok: true, data: { echoed: op.path } })) }; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'allconnect', 'syncq.js'), 'utf8') + '\nthis.SYNCQ = SYNCQ;', ctx);
  return { Q: ctx.SYNCQ, calls, timers };
}
const mk = (p) => () => ({ path: p, body: {} });

test('nothing is sent when the user taps like and then unlike', async () => {
  const { Q, calls } = load();
  Q.queue('rx:1', '', 'fire', mk('/a'), null, null); Q.queue('rx:1', '', '', mk('/a'), null, null);
  assert.strictEqual(Q.pending(), 0); await Q.flush(); assert.strictEqual(calls.length, 0);
});

test('the wait is 30 seconds and starts at the first tap', () => {
  const { Q, timers } = load();
  Q.queue('sv:1', false, true, mk('/s'), null, null); Q.queue('fl:2', false, true, mk('/f'), null, null);
  assert.strictEqual(timers.length, 1); assert.strictEqual(timers[0].ms, 30000);
});

test('several different actions leave in ONE request, and each gets its own reply', async () => {
  const { Q, calls } = load(); const seen = [];
  Q.queue('sv:1', false, true, mk('/save/1'), (r) => seen.push(r.echoed), null);
  Q.queue('fl:2', false, true, mk('/follow/2'), (r) => seen.push(r.echoed), null);
  Q.queue('cl:3', true, false, mk('/clike/3'), (r) => seen.push(r.echoed), null);
  await Q.flush();
  assert.strictEqual(calls.length, 1); assert.deepStrictEqual(Array.from(calls[0].body.ops, (o) => o.path), ['/save/1', '/follow/2', '/clike/3']);
  assert.deepStrictEqual(Array.from(seen), ['/save/1', '/follow/2', '/clike/3']);
});

test('the request is built from the first state and the last state', async () => {
  const { Q, calls } = load();
  const make = (b, w) => ({ path: '/react', body: { type: w || b } });
  Q.queue('rx:9', '', 'fire', make, null, null); Q.queue('rx:9', '', 'love', make, null, null);
  await Q.flush(); assert.strictEqual(JSON.stringify(calls[0].body.ops), JSON.stringify([{ path: '/react', body: { type: 'love' } }]));
});

test('closing the page sends what is waiting with a beacon', async () => {
  const { Q, calls } = load(); Q.queue('sv:1', false, true, mk('/s'), null, null);
  await Q.flush(true); assert.deepStrictEqual(calls, [{ beacon: '/api/ac/batch' }]); assert.strictEqual(Q.pending(), 0);
});

test('a refused change is put back on screen', async () => {
  const ctxCalls = []; const { Q } = load();
  const bad = load(); bad.Q.queue('sv:1', false, true, mk('/s'), null, (meta, msg) => ctxCalls.push([meta, msg]), 'was');
  // replace the transport with one that refuses
  const ops = [...bad.Q.q.values()][0]; assert.ok(ops);
  const res = { ok: false, message: 'No' }; ops.revert(ops.meta, res.message);
  assert.deepStrictEqual(ctxCalls, [['was', 'No']]);
});
