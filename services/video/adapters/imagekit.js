// ImageKit: signed browser upload (multipart POST), adaptive HLS through "ik-master.m3u8".
// Env: IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT (for example https://ik.imagekit.io/yourid)
const crypto = require('crypto');
const { env, b64, GB, call } = require('../util');
const cfg = () => ({ pub: env('IMAGEKIT_PUBLIC_KEY'), priv: env('IMAGEKIT_PRIVATE_KEY'), end: env('IMAGEKIT_URL_ENDPOINT').replace(/\/$/, '') });
const auth = () => ({ Authorization: 'Basic ' + b64(cfg().priv + ':') });
const sig = (token, expire) => crypto.createHmac('sha1', cfg().priv).update(token + expire).digest('hex');
module.exports = {
  name: 'imagekit', label: 'ImageKit', sig,
  defaults: { priority: 3, maxVideos: 0, maxBytes: 20 * GB, maxFileMB: 300 },
  configured() { const c = cfg(); return !!(c.pub && c.priv && c.end); },
  async createUpload({ uid }) {
    const c = cfg(), token = crypto.randomUUID(), expire = Math.floor(Date.now() / 1000) + 1800, fileName = 'r' + String(uid).slice(-6) + '_' + crypto.randomBytes(8).toString('hex') + '.mp4';
    return { ticketId: token, method: 'POST', url: 'https://upload.imagekit.io/api/v1/files/upload', fileField: 'file',
      fields: { publicKey: c.pub, signature: sig(token, expire), expire: String(expire), token, fileName, folder: '/reels', useUniqueFileName: 'false' }, ext: { fileName } };
  },
  // The browser may send the upload result as a hint ({fileId}); we never trust it: the file name must be the one WE chose.
  async status(rec, body) {
    const name = rec.ext && rec.ext.fileName; if (!name) return { state: 'error', error: 'Upload record is incomplete.' };
    let f = null;
    const hint = body && body.result && body.result.fileId;
    if (hint) { try { f = await call(`https://api.imagekit.io/v1/files/${encodeURIComponent(hint)}/details`, { headers: auth() }); } catch (e) { f = null; } if (f && f.name !== name) f = null; }
    if (!f) { const l = await call('https://api.imagekit.io/v1/files?limit=1&searchQuery=' + encodeURIComponent(`name="${name}"`), { headers: auth() }); f = Array.isArray(l) ? l[0] : null; }
    if (!f) return { state: 'pending' };
    const c = cfg(), path = f.filePath;
    return { state: 'ready', assetId: f.fileId, hlsUrl: `${c.end}${path}/ik-master.m3u8?tr=sr-240_360_480_720_1080`, poster: `${c.end}${path}/ik-thumbnail.jpg`, thumb: `${c.end}${path}/ik-thumbnail.jpg?tr=w-480`, dur: Math.round(f.duration || 0), bytes: f.size || 0, extra: { fileId: f.fileId } };
  },
  async remove(rec) { const id = rec.assetId || (rec.ext && rec.ext.fileId); if (!id) return; try { await call(`https://api.imagekit.io/v1/files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth() }); } catch (e) { if (e.status !== 404) throw e; } },
  async test() { await call('https://api.imagekit.io/v1/files?limit=1', { headers: auth() }); return 'ImageKit accepted the keys.'; }
};
