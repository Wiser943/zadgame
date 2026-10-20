const test = require('node:test');
const assert = require('node:assert/strict');
const { muxPlaybackUrl } = require('../utils/gistVideo');

test('Mux playback URLs use the official HTTPS stream host for valid IDs', () => {
  assert.equal(muxPlaybackUrl('aBc123_XyZ-9'), 'https://stream.mux.com/aBc123_XyZ-9.m3u8');
});

test('invalid playback IDs cannot inject a host, path, or query string', () => {
  for (const id of ['', 'short', 'https://evil.example/video', '../asset', 'abcdef?host=evil', 'x'.repeat(129)]) {
    assert.equal(muxPlaybackUrl(id), '');
  }
});
