'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const music = require('../services/music');

test('YouTube search uses the official API, asks only for embeddable music videos, and caches results', async () => {
  const oldKey = process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY = 'server-test-key';
  music.clearCache();
  let calls = 0, seenUrl = '';
  music.setFetch(async (url) => {
    calls += 1; seenUrl = String(url);
    return { ok: true, json: async () => ({ items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'Fresh single', channelTitle: 'Artist channel', thumbnails: { high: { url: 'https://img.example/cover.jpg' } } } }] }) };
  });
  try {
    const first = await music.searchMusic('play Fresh single');
    assert.equal(first.provider, 'youtube');
    assert.equal(first.results[0].videoId, 'abcdefghijk');
    assert.equal(first.results[0].streamUrl, 'https://www.youtube.com/watch?v=abcdefghijk');
    assert.equal(first.results[0].artist, 'Artist channel');
    assert.match(seenUrl, /^https:\/\/www\.googleapis\.com\/youtube\/v3\/search\?/);
    const params = new URL(seenUrl).searchParams;
    assert.equal(params.get('q'), 'Fresh single');
    assert.equal(params.get('part'), 'snippet');
    assert.equal(params.get('type'), 'video');
    assert.equal(params.get('videoEmbeddable'), 'true');
    assert.equal(params.get('key'), 'server-test-key');
    assert.doesNotMatch(JSON.stringify(first), /server-test-key/);
    await music.searchMusic('Fresh single');
    assert.equal(calls, 1, 'matching query should be served from the short cache');
  } finally {
    music.setFetch((...args) => fetch(...args)); music.clearCache();
    if (oldKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = oldKey;
  }
});

test('YouTube normalization rejects missing or malformed video IDs', () => {
  assert.equal(music.normalizeYouTube({ id: { videoId: 'bad' }, snippet: { title: 'Nope' } }), null);
  assert.equal(music.normalizeYouTube({ id: { videoId: 'abcdefghijk' }, snippet: { title: 'OK &amp; new' } }).title, 'OK & new');
});

test('Songify “play …” search starts the first result through the official embed path', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../public/allconnect/songify.js'), 'utf8');
  class FakeAudio {
    constructor() { this.paused = true; this.playCalls = 0; this.src = ''; }
    addEventListener() {}
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {}
    play() { this.playCalls += 1; this.paused = false; return Promise.resolve(); }
  }
  const local = new Map();
  const context = {
    window: {}, NET: { user: { id: 'test' } }, Audio: FakeAudio,
    localStorage: { getItem: (k) => local.get(k) || null, setItem: (k, v) => local.set(k, v) },
    document: { getElementById: () => null, querySelector: () => null }, location: { origin: 'https://allconnect.example' },
    console, setTimeout, clearTimeout, URLSearchParams, fetch, Promise
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const player = context.window.SONGIFY;
  player.repaint = () => {}; player.paintResults = () => {};
  player.fetchSongs = async (query) => ({ label: 'YouTube', errors: [], list: [{ title: 'Fresh single', artist: 'Artist', streamUrl: 'https://www.youtube.com/watch?v=abcdefghijk', provider: 'youtube', videoId: 'abcdefghijk' }] });
  player.q = 'play Fresh single';
  await player.search();
  assert.equal(player.current.title, 'Fresh single');
  assert.equal(player.np, true);
  assert.equal(player.ytPlaying, true);
  assert.equal(player.audio.playCalls, 0, 'YouTube items must not be downloaded or played through the HTMLAudioElement');
  assert.equal(player.youtubeId(player.current), 'abcdefghijk');
});
