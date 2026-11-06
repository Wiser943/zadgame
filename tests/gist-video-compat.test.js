'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeVideo } = require('../utils/gistVideo');

test('legacy P-Gist playbackId/duration records hydrate as public Mux reels', () => {
  const out = normalizeVideo({ playbackId: 'Abc_123xyz', assetId: 'asset-1', duration: 17 }, () => ({}));
  assert.equal(out.kind, 'mux');
  assert.equal(out.url, 'https://stream.mux.com/Abc_123xyz.m3u8');
  assert.equal(out.dur, 17);
});

test('current signed Mux records use fresh playback URLs and poster metadata', () => {
  const out = normalizeVideo({ kind: 'mux', mux: { playbackId: 'Signed123', signed: true, captions: true }, url: 'fallback' }, () => ({ url: 'https://stream.mux.com/Signed123.m3u8?token=fresh', poster: 'https://image.mux.com/Signed123.jpg', preview: 'preview' }));
  assert.equal(out.url, 'https://stream.mux.com/Signed123.m3u8?token=fresh');
  assert.equal(out.poster, 'https://image.mux.com/Signed123.jpg');
  assert.equal(out.preview, 'preview');
  assert.equal(out.cc, true);
});

test('raw video records preserve their URL and media type', () => {
  const out = normalizeVideo({ kind: 'db', url: '/api/ac/gist/reels/raw/abc', mime: 'video/webm', dur: 4 });
  assert.equal(out.kind, 'db');
  assert.equal(out.url, '/api/ac/gist/reels/raw/abc');
  assert.equal(out.mime, 'video/webm');
});

test('invalid legacy playback IDs are not turned into URLs', () => {
  assert.equal(normalizeVideo({ playbackId: 'bad id', duration: 12 }), null);
  assert.equal(normalizeVideo({}), null);
});
