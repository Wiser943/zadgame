// Cloudinary: signed browser upload (multipart POST), HLS through the "sp_auto" adaptive streaming profile.
// Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
const crypto = require('crypto');
const { env, b64, GB, call, pathEnc } = require('../util');
const cfg = () => ({ cloud: env('CLOUDINARY_CLOUD_NAME'), key: env('CLOUDINARY_API_KEY'), secret: env('CLOUDINARY_API_SECRET') });
const auth = () => ({ Authorization: 'Basic ' + b64(cfg().key + ':' + cfg().secret) });
const sign = (params) => crypto.createHash('sha1').update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&') + cfg().secret).digest('hex');
const base = () => `https://res.cloudinary.com/${cfg().cloud}/video/upload`;
module.exports = {
  name: 'cloudinary', label: 'Cloudinary', sign,
  defaults: { priority: 2, maxVideos: 0, maxBytes: 20 * GB, maxFileMB: 100 },
  configured() { const c = cfg(); return !!(c.cloud && c.key && c.secret); },
  async createUpload({ uid }) {
    const c = cfg(), publicId = 'reels/' + String(uid).slice(-8) + '_' + crypto.randomBytes(8).toString('hex'), p = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000) };
    return { ticketId: publicId, method: 'POST', url: `https://api.cloudinary.com/v1_1/${c.cloud}/video/upload`, fileField: 'file', fields: { ...p, api_key: c.key, signature: sign(p) }, ext: { publicId } };
  },
  async status(rec) {
    const id = rec.ext && rec.ext.publicId; if (!id) return { state: 'error', error: 'Upload record is incomplete.' };
    let j; try { j = await call(`https://api.cloudinary.com/v1_1/${cfg().cloud}/resources/video/upload/${pathEnc(id)}`, { headers: auth() }); }
    catch (e) { if (e.status === 404) return { state: 'pending' }; throw e; }
    return { state: 'ready', assetId: j.public_id, hlsUrl: `${base()}/sp_auto/${pathEnc(j.public_id)}.m3u8`, poster: `${base()}/so_1/${pathEnc(j.public_id)}.jpg`, thumb: `${base()}/w_480,so_1/${pathEnc(j.public_id)}.jpg`, dur: Math.round(j.duration || 0), bytes: j.bytes || 0 };
  },
  async remove(rec) {
    const id = rec.assetId || (rec.ext && rec.ext.publicId); if (!id) return;
    try { await call(`https://api.cloudinary.com/v1_1/${cfg().cloud}/resources/video/upload?public_ids[]=${encodeURIComponent(id)}&invalidate=true`, { method: 'DELETE', headers: auth() }); }
    catch (e) { if (e.status !== 404) throw e; }
  },
  async test() { await call(`https://api.cloudinary.com/v1_1/${cfg().cloud}/ping`, { headers: auth() }); return 'Cloudinary accepted the keys.'; }
};
