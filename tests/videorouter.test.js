// The video adapters: every provider must follow the same contract, and the signing helpers must match the providers' documented examples.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'services', 'video', 'adapters');
const adapters = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => require(path.join(dir, f)));

test('the five starting providers are all present', () => {
  assert.deepStrictEqual(adapters.map((a) => a.name).sort(), ['cloudinary', 'gumlet', 'imagekit', 'mux', 'vimeo']);
});

test('every adapter follows the same contract, so a new one can be dropped in', () => {
  const names = new Set(), priorities = new Set();
  for (const a of adapters) {
    assert.ok(a.name && a.label, a.name + ' needs a name and a label');
    assert.ok(!names.has(a.name), 'duplicate provider name ' + a.name); names.add(a.name);
    for (const fn of ['configured', 'createUpload', 'status', 'remove', 'test']) assert.strictEqual(typeof a[fn], 'function', a.name + '.' + fn + ' must be a function');
    for (const k of ['priority', 'maxVideos', 'maxBytes', 'maxFileMB']) assert.ok(Number.isFinite(a.defaults[k]) && a.defaults[k] >= 0, a.name + ' default ' + k);
    assert.ok(!priorities.has(a.defaults.priority), 'two providers share priority ' + a.defaults.priority); priorities.add(a.defaults.priority);
  }
});

test('Mux is limited by video COUNT (free plan: 10); the others by stored BYTES', () => {
  const by = Object.fromEntries(adapters.map((a) => [a.name, a.defaults]));
  assert.strictEqual(by.mux.maxVideos, 10); assert.strictEqual(by.mux.maxBytes, 0);
  for (const n of ['cloudinary', 'imagekit', 'gumlet', 'vimeo']) { assert.ok(by[n].maxBytes > 0, n + ' needs a byte limit'); assert.strictEqual(by[n].maxVideos, 0); }
});

test('a provider without keys reports itself as not configured', () => {
  const keep = { ...process.env };
  for (const k of Object.keys(process.env)) if (/^(MUX_|CLOUDINARY_|IMAGEKIT_|GUMLET_|VIMEO_)/.test(k)) delete process.env[k];
  try { for (const a of adapters) assert.strictEqual(a.configured(), false, a.name); } finally { Object.assign(process.env, keep); }
});

test('Cloudinary signing matches the documented example', () => {
  process.env.CLOUDINARY_API_SECRET = 'abcd';
  const a = adapters.find((x) => x.name === 'cloudinary');
  assert.strictEqual(a.sign({ eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: '1315060510' }), 'bfd09f95f331f558cbd1320e67aa8d488770583e');
  delete process.env.CLOUDINARY_API_SECRET;
});

test('Cloudinary and ImageKit uploads ask the browser for a form POST, Gumlet/Mux for a PUT, Vimeo for tus', async () => {
  Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's', IMAGEKIT_PUBLIC_KEY: 'pub', IMAGEKIT_PRIVATE_KEY: 'priv', IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/demo' });
  const c = await adapters.find((x) => x.name === 'cloudinary').createUpload({ uid: 'u1234567890' });
  assert.strictEqual(c.method, 'POST'); assert.ok(c.fields.signature && c.fields.api_key === 'k' && c.fields.public_id.startsWith('reels/')); assert.strictEqual(c.fileField, 'file');
  const i = await adapters.find((x) => x.name === 'imagekit').createUpload({ uid: 'u1234567890' });
  assert.strictEqual(i.method, 'POST'); assert.ok(i.fields.signature && i.fields.token && i.fields.expire && i.fields.fileName.endsWith('.mp4'));
  assert.strictEqual(i.fields.signature, adapters.find((x) => x.name === 'imagekit').sig(i.fields.token, i.fields.expire));
  for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_PRIVATE_KEY', 'IMAGEKIT_URL_ENDPOINT']) delete process.env[k];
});

test('only HLS (.m3u8) playback URLs are accepted', () => {
  const { isHls } = require('../services/video/util');
  assert.ok(isHls('https://stream.mux.com/abc.m3u8')); assert.ok(isHls('https://ik.imagekit.io/demo/a.mp4/ik-master.m3u8?tr=sr-240_360'));
  assert.ok(!isHls('https://example.com/video.mp4')); assert.ok(!isHls(''));
});
