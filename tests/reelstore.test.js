const test = require('node:test');
const assert = require('node:assert');
const rs = require('../utils/reelstore');

test('sniff recognises mp4, mov and webm and rejects other files', () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(8)]);
  const mov = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypqt  '), Buffer.alloc(8)]);
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]);
  assert.strictEqual(rs.sniff(mp4), 'video/mp4');
  assert.strictEqual(rs.sniff(mov), 'video/quicktime');
  assert.strictEqual(rs.sniff(webm), 'video/webm');
  assert.strictEqual(rs.sniff(Buffer.from('<html>not a video at all</html>')), '');
  assert.strictEqual(rs.sniff(Buffer.alloc(3)), '');
});
