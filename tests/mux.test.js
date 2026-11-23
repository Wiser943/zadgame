const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

function load(env) { Object.assign(process.env, env); delete require.cache[require.resolve('../utils/mux')]; return require('../utils/mux'); }

test('public playback urls when no signing key', () => {
  delete process.env.MUX_SIGNING_KEY_ID; delete process.env.MUX_SIGNING_PRIVATE_KEY;
  const m = load({});
  const p = m.playback({ mux: { playbackId: 'abc', signed: false } });
  assert.strictEqual(p.url, 'https://stream.mux.com/abc.m3u8');
  assert.ok(p.poster.includes('image.mux.com/abc/thumbnail.jpg'));
  assert.ok(p.preview.includes('animated.webp'));
});

test('signed playback builds a verifiable RS256 token', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const m = load({ MUX_SIGNING_KEY_ID: 'kid1', MUX_SIGNING_PRIVATE_KEY: Buffer.from(pem).toString('base64') });
  const p = m.playback({ mux: { playbackId: 'abc', signed: true } });
  const tok = new URL(p.url).searchParams.get('token'); const [h, b, s] = tok.split('.');
  const ok = crypto.createVerify('RSA-SHA256').update(h + '.' + b).verify(publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  assert.ok(ok);
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  assert.strictEqual(claims.sub, 'abc'); assert.strictEqual(claims.aud, 'v'); assert.ok(claims.exp > Date.now() / 1000);
  const tt = JSON.parse(Buffer.from(new URL(p.poster).searchParams.get('token').split('.')[1], 'base64url').toString());
  assert.strictEqual(tt.aud, 't'); assert.strictEqual(tt.width, 480);
});

test('webhook signature check accepts good and rejects bad or old', () => {
  const m = load({});
  const raw = Buffer.from('{"type":"video.asset.ready"}'), secret = 's3cret', t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(t + '.' + raw.toString()).digest('hex');
  assert.ok(m.verifyWebhook(raw, `t=${t},v1=${v1}`, secret));
  assert.ok(!m.verifyWebhook(raw, `t=${t},v1=${v1}`, 'other'));
  assert.ok(!m.verifyWebhook(raw, `t=${t - 4000},v1=${v1}`, secret));
  assert.ok(!m.verifyWebhook(raw, 'garbage', secret));
});

test('new uploads keep public playback even when optional signing keys are configured', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const priorFetch = global.fetch; let body;
  global.fetch = async (url, opts) => {
    body = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ data: { id: 'upload123456', url: 'https://mux.example/upload' } }) };
  };
  try {
    const m = load({ MUX_TOKEN_ID: 'token', MUX_TOKEN_SECRET: 'secret', MUX_SIGNING_KEY_ID: 'kid1', MUX_SIGNING_PRIVATE_KEY: Buffer.from(pem).toString('base64') });
    const result = await m.createUpload('user123', 'https://app.example');
    assert.strictEqual(result.d.id, 'upload123456');
    assert.deepStrictEqual(body.new_asset_settings.playback_policy, ['public']);
    assert.strictEqual(m.MUX_MAX_MB, 500);
    assert.strictEqual(m.MUX_MAX_SEC, 600);
  } finally { global.fetch = priorFetch }
});
