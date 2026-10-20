// Chat extras: reactions, edit/delete windows, photo link checks (utils/acchat.js) + a render smoke test of public/allconnect/chatx.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('../utils/acchat');

test('photo links: only our storage is accepted', () => {
  assert.ok(C.cleanImage({ url: 'https://i.ibb.co/abc123/photo.jpg', w: 800, h: 600 }));
  assert.ok(C.cleanImage({ url: '/api/ac/photos/raw/0123456789abcdef01234567' }));
  assert.equal(C.cleanImage({ url: 'https://evil.example.com/x.jpg' }), null);
  assert.equal(C.cleanImage({ url: 'https://i.ibb.co.evil.com/x.jpg' }), null);
  assert.equal(C.cleanImage({ url: 'javascript:alert(1)' }), null);
  assert.equal(C.cleanImage({ url: 'https://i.ibb.co/a"onerror="x' }), null);
  assert.equal(C.cleanImage(null), null);
  const ok = C.cleanImage({ url: 'https://i.ibb.co/a/b.jpg', thumb: 'https://evil.example.com/t.jpg', w: -5, h: 'x' });
  assert.equal(ok.thumb, 'https://i.ibb.co/a/b.jpg'); assert.equal(ok.w, undefined); assert.equal(ok.h, undefined);
});
test('reactions: one per person, same emoji removes, different replaces', () => {
  let r = C.toggleReaction([], 'a', '👍'); assert.deepEqual(r, [{ u: 'a', e: '👍' }]);
  r = C.toggleReaction(r, 'b', '❤️'); assert.equal(r.length, 2);
  r = C.toggleReaction(r, 'a', '😂'); assert.deepEqual(r.find((x) => x.u === 'a'), { u: 'a', e: '😂' }); assert.equal(r.length, 2);
  r = C.toggleReaction(r, 'a', '😂'); assert.equal(r.find((x) => x.u === 'a'), undefined);
  r = C.toggleReaction(r, 'b', ''); assert.equal(r.length, 0);
  assert.ok(C.REACTIONS.includes('👍') && !C.REACTIONS.includes('<script>'));
});
test('edit window is 15 minutes and only for the sender', () => {
  const now = Date.now(), m = (ago, o) => ({ from: 'a', kind: 'text', at: new Date(now - ago), ...o });
  assert.ok(C.canEdit(m(60000), 'a', now));
  assert.ok(!C.canEdit(m(16 * 60000), 'a', now));
  assert.ok(!C.canEdit(m(1000), 'b', now));
  assert.ok(!C.canEdit(m(1000, { deleted: true }), 'a', now));
  assert.ok(!C.canEdit(m(1000, { kind: 'money' }), 'a', now));
});
test('delete for everyone: sender only, within 2 days', () => {
  const now = Date.now(), m = (ago, o) => ({ from: 'a', kind: 'text', at: new Date(now - ago), ...o });
  assert.ok(C.canDeleteAll(m(3600e3), 'a', now));
  assert.ok(!C.canDeleteAll(m(49 * 3600e3), 'a', now));
  assert.ok(!C.canDeleteAll(m(1000), 'b', now));
  assert.ok(!C.canDeleteAll(m(1000, { deleted: true }), 'a', now));
});
test('quote text for photos', () => {
  assert.equal(C.quoteText({ text: '', image: { url: 'x' } }), C.PHOTO_LABEL);
  assert.equal(C.quoteText({ text: 'hello' }), 'hello');
});

/* ---- client smoke test: load chatx.js against small stubs and draw every kind of bubble ---- */
function loadClient(view) {
  const els = {};
  const mk = () => ({ children: [], style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild(c) { this.children.push(c) }, remove() {}, querySelector() { return null }, set innerHTML(v) { this._h = v }, get innerHTML() { return this._h || '' } });
  const screen = mk();
  const PH = { view, msgs: [], g: { messages: [], members: [] }, gid: 'g1', chatId: 'u2', peer: { id: 'u2', displayName: 'Ada', username: 'ada' },
    $a: () => screen, name: (p) => p.displayName, gname: (id) => 'Member ' + id, gcolor: () => '#000', time: () => '9:00', sheet() {}, closeSheet() {}, isAdm: () => false,
    on() {}, drawMsgs() {}, gmsgs() {}, push() {}, gpush() {}, send() {}, gSend() {} };
  const sandbox = { window: {}, PH, NET: { user: { id: 'me' }, api: async () => ({}), drop() {}, cache: new Map() }, toast() {}, esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    document: { getElementById: (id) => els[id] || null, createElement: () => mk(), body: mk() }, navigator: {}, Date, Math, setTimeout, clearTimeout, console };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/allconnect/chatx.js'), 'utf8'), sandbox);
  return { PH, CHATX: sandbox.CHATX, els, screen, mk };
}
test('client: bubbles render text, photos, replies, reactions, edits, deletes (and escape HTML)', () => {
  const { PH, CHATX } = loadClient('chat');
  const base = { id: 'm1', from: 'u2', to: 'me', kind: 'text', text: 'hi <b>x</b>', at: new Date().toISOString(), read: true };
  let h = PH.bubble(base, false);
  assert.match(h, /data-id="m1"/); assert.ok(!h.includes('<b>x</b>')); assert.match(h, /&lt;b&gt;/);
  h = PH.bubble({ ...base, text: 'cap', image: { url: 'https://i.ibb.co/a/b.jpg', thumb: 'https://i.ibb.co/a/t.jpg', w: 400, h: 300 }, edited: true, fwd: true,
    reply: { id: 'm0', from: 'me', text: '📷 Photo' }, reactions: [{ u: 'me', e: '👍' }, { u: 'u2', e: '👍' }, { u: 'u2', e: '🔥' }] }, true);
  assert.match(h, /class="mimg"/); assert.match(h, /aspect-ratio:400\/300/); assert.match(h, /Forwarded/); assert.match(h, /edited/); assert.match(h, /class="rx on"/); assert.match(h, /<i>2<\/i>/); assert.match(h, /mrep/);
  h = PH.bubble({ ...base, deleted: true, text: '' }, false); assert.match(h, /This message was deleted/);
  h = PH.bubble({ ...base, from: 'me', deleted: true, text: '' }, false); assert.match(h, /You deleted this message/);
  assert.match(PH.bubble({ ...base, kind: 'money', text: 'Sent ₦100' }, false), /class="sys"/);
});
test('client: group bubbles show the sender and photos', () => {
  const { PH } = loadClient('group');
  const m = { id: 'g9', group: 'g1', from: 'u5', kind: 'text', text: '', image: { url: '/api/ac/photos/raw/0123456789abcdef01234567', thumb: '/api/ac/photos/raw/0123456789abcdef01234567' }, at: new Date().toISOString() };
  const h = PH.gbubble(m); assert.match(h, /Member u5/); assert.match(h, /class="mimg"/);
  assert.match(PH.gbubble({ ...m, deleted: true, image: undefined }), /This message was deleted/);
});
test('client: long-press menu offers the right actions', () => {
  const { PH, screen } = loadClient('chat');
  const now = new Date().toISOString();
  PH.msgs = [{ id: 'a1', from: 'me', to: 'u2', kind: 'text', text: 'mine', at: now }, { id: 'a2', from: 'u2', to: 'me', kind: 'text', text: 'theirs', at: now },
    { id: 'a3', from: 'me', to: 'u2', kind: 'text', text: 'old', at: new Date(Date.now() - 3600e3).toISOString() }];
  // the menu needs the message box to exist (so reply/edit are offered)
  const w = loadClient('chat'); w.els.cinput = {}; w.PH.msgs = PH.msgs;
  const open = (id) => { w.screen.children.length = 0; w.screen.querySelector = () => null; w.CHATX.menu(id); return w.screen.children[0]._h };
  let h = open('a1'); assert.match(h, /Reply/); assert.match(h, /Forward/); assert.match(h, /Copy/); assert.match(h, /Edit/); assert.match(h, /Delete/); assert.match(h, /👍/);
  h = open('a2'); assert.ok(!/Edit/.test(h)); assert.match(h, /Reply/);
  h = open('a3'); assert.ok(!/Edit/.test(h), 'older than 15 minutes cannot be edited');
});
