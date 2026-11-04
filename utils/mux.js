// Mux (video storage + streaming). Set MUX_TOKEN_ID and MUX_TOKEN_SECRET on the server. Videos go from the phone straight to Mux.
// Optional extras (all server env vars):
//   MUX_SIGNING_KEY_ID + MUX_SIGNING_PRIVATE_KEY  -> playback for existing signed assets (new Reels are public)
//   MUX_WEBHOOK_SECRET                            -> Mux tells us when a video is ready (instead of only polling)
//   MUX_DATA_ENV_KEY                              -> Mux Data playback quality monitoring (public key, sent to the browser)
//   MUX_CAPTIONS=true                             -> auto-generated English captions (billed by Mux per minute)
const crypto = require('crypto');
const env = (n) => String(process.env[n] || '').trim();
const muxKeys = () => ({ id: env('MUX_TOKEN_ID'), sec: env('MUX_TOKEN_SECRET') });
const muxOn = () => { const k = muxKeys(); return !!(k.id && k.sec); };
const MUX_MAX_MB = 500, MUX_MAX_SEC = 600, DAILY_UPLOADS = 10;

async function mux(method, path, body) {
  const k = muxKeys(), ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch('https://api.mux.com' + path, { method, signal: ctl.signal, headers: { Authorization: 'Basic ' + Buffer.from(k.id + ':' + k.sec).toString('base64'), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && (j.error.messages || [j.error.type]).join(' ')) || 'Mux error ' + r.status);
    return j.data;
  } finally { clearTimeout(t); }
}

/* ---------- signed playback (RS256 JWT, no extra packages) ---------- */
const signingOn = () => !!(env('MUX_SIGNING_KEY_ID') && env('MUX_SIGNING_PRIVATE_KEY'));
const b64u = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function sign(pid, aud, claims, ttl = 6 * 3600) {
  const kid = env('MUX_SIGNING_KEY_ID'); let pem = env('MUX_SIGNING_PRIVATE_KEY'); if (!/^-----/.test(pem)) pem = Buffer.from(pem, 'base64').toString('utf8');
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })), body = b64u(JSON.stringify({ sub: pid, aud, exp: Math.floor(Date.now() / 1000) + ttl, kid, ...claims }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(pem);
  return `${head}.${body}.${b64u(sig)}`;
}
/* fresh stream / cover / animated-preview URLs for a stored video (signed ones are made on the fly because they expire) */
function playback(v) {
  if (!v || !v.mux || !v.mux.playbackId) return { url: (v && v.url) || '', poster: (v && v.poster && (v.poster.thumb || v.poster.url)) || '', preview: '' };
  const pid = v.mux.playbackId;
  if (v.mux.signed && signingOn()) {
    try {
      return { url: `https://stream.mux.com/${pid}.m3u8?token=${sign(pid, 'v')}`,
        poster: `https://image.mux.com/${pid}/thumbnail.jpg?token=${sign(pid, 't', { width: 480, time: 1 })}`,
        preview: `https://image.mux.com/${pid}/animated.webp?token=${sign(pid, 'g', { width: 320, fps: 10, start: 0, end: 4 })}` };
    } catch (e) { console.error('[mux sign]', e.message); }
  }
  return { url: `https://stream.mux.com/${pid}.m3u8`, poster: `https://image.mux.com/${pid}/thumbnail.jpg?width=480&time=1`, preview: `https://image.mux.com/${pid}/animated.webp?width=320&fps=10&start=0&end=4` };
}

/* what we store about a processed asset (URLs here are only a fallback; playback() builds the real ones) */
function muxVideo(a) {
  const pb = a.playback_ids && a.playback_ids[0]; if (!pb || !pb.id) return null; const pid = pb.id;
  return { kind: 'mux', mux: { assetId: a.id, playbackId: pid, signed: pb.policy === 'signed' }, url: `https://stream.mux.com/${pid}.m3u8`, mime: 'application/x-mpegURL', size: 0, dur: Math.min(600, Math.round(a.duration || 0)),
    poster: { url: `https://image.mux.com/${pid}/thumbnail.jpg?time=1`, thumb: `https://image.mux.com/${pid}/thumbnail.jpg?width=480&time=1` } };
}

/* settings for a new direct upload, cheapest sensible defaults first; mux.js retries with the bare minimum if Mux rejects an option */
async function createUpload(uid, origin) {
  // Match the known-working P-Gist uploader: public playback avoids signed-token configuration
  // turning an otherwise successful upload into an unplayable Reel. Existing signed assets still
  // use playback() above, but all newly uploaded Reels are public.
  const policy = 'public', cc = env('MUX_CAPTIONS') === 'true';
  const full = { playback_policy: [policy], passthrough: String(uid), video_quality: 'basic', max_resolution_tier: '1080p' };
  if (cc) full.input = [{ generated_subtitles: [{ language_code: 'en', name: 'English (auto)' }] }];
  try { return { d: await mux('POST', '/video/v1/uploads', { cors_origin: origin, new_asset_settings: full }), cc }; }
  catch (e) { console.error('[mux upload: retrying with minimal settings]', e.message); return { d: await mux('POST', '/video/v1/uploads', { cors_origin: origin, new_asset_settings: { playback_policy: [policy], passthrough: String(uid) } }), cc: false }; }
}

/* ---------- webhook signature (Mux-Signature: t=...,v1=...) ---------- */
function verifyWebhook(raw, header, secret) {
  try {
    const parts = Object.fromEntries(String(header || '').split(',').map((s) => s.trim().split('=')));
    if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
    const mac = crypto.createHmac('sha256', secret).update(parts.t + '.' + raw.toString('utf8')).digest('hex');
    const a = Buffer.from(mac), b = Buffer.from(String(parts.v1)); return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

const fill = (v, extra) => ({ assetId: v.mux.assetId, status: 'ready', playbackId: v.mux.playbackId, signed: v.mux.signed, url: v.url, poster: v.poster.url, thumb: v.poster.thumb, dur: v.dur, ...extra });

/* Finish uploads that were still processing when the player left. Runs when the gallery loads (webhooks do the same if configured). */
async function syncPending(uid) {
  if (!muxOn()) return;
  const ACVideo = require('../models/ACVideo');
  const rows = await ACVideo.find({ user: String(uid), status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean();
  await Promise.all(rows.map((r) => settle(ACVideo, r)));
}
async function settle(ACVideo, r) {
  try {
    const old = Date.now() - new Date(r.createdAt).getTime() > 24 * 3600000;
    const u = await mux('GET', '/video/v1/uploads/' + r.uploadId);
    if (['errored', 'cancelled', 'timed_out'].includes(u.status) || (old && !u.asset_id)) return void (await ACVideo.deleteOne({ _id: r._id }));
    if (!u.asset_id) return;
    const a = await mux('GET', '/video/v1/assets/' + u.asset_id);
    if (a.status === 'errored') { mux('DELETE', '/video/v1/assets/' + a.id).catch(() => {}); return void (await ACVideo.deleteOne({ _id: r._id })); }
    if (a.status !== 'ready') return;
    const v = muxVideo(a); if (!v) return;
    await ACVideo.updateOne({ _id: r._id }, { $set: fill(v) });
  } catch (e) { /* try again later */ }
}

/* cost control: every few hours tidy uploads that never finished, for everybody */
function startSweep() {
  if (!muxOn()) return;
  const ACVideo = require('../models/ACVideo');
  const run = async () => { const rows = await ACVideo.find({ status: 'pending', createdAt: { $lt: new Date(Date.now() - 3600000) } }).limit(40).lean(); for (const r of rows) await settle(ACVideo, r); };
  setTimeout(() => run().catch(() => {}), 60000).unref(); setInterval(() => run().catch((e) => console.error('[mux sweep]', e.message)), 6 * 3600000).unref();
}

/* account deletion: remove every video (and the posts using them) a player ever uploaded */
async function removeUserVideos(uid) {
  const ACVideo = require('../models/ACVideo'), gist = require('../routes/acgist');
  const rows = await ACVideo.find({ user: String(uid) }).lean(); let n = 0;
  for (const v of rows) { if (v.assetId) { await gist.removeVideoPosts(v.assetId).catch(() => 0); if (muxOn()) await mux('DELETE', '/video/v1/assets/' + v.assetId).catch(() => {}); } await ACVideo.deleteOne({ _id: v._id }); n++; }
  return n;
}

module.exports = { muxOn, mux, muxVideo, playback, signingOn, createUpload, verifyWebhook, fill, syncPending, startSweep, removeUserVideos, env, MUX_MAX_MB, MUX_MAX_SEC, DAILY_UPLOADS };
