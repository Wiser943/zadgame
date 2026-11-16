// Vimeo: the server creates the video and gets a tus upload link; the browser uploads with the tus protocol (PATCH).
// HLS comes from the "files" list, which Vimeo only returns for plans that include file access. Without it the adapter says so.
// Env: VIMEO_ACCESS_TOKEN (scopes: private, upload, edit, delete)
const { env, GB, call, isHls } = require('../util');
const tok = () => env('VIMEO_ACCESS_TOKEN');
const H = () => ({ Authorization: 'bearer ' + tok(), 'Content-Type': 'application/json', Accept: 'application/vnd.vimeo.*+json;version=3.4' });
const idOf = (uri) => String(uri || '').split('/').pop();
module.exports = {
  name: 'vimeo', label: 'Vimeo',
  defaults: { priority: 5, maxVideos: 0, maxBytes: 5 * GB, maxFileMB: 500 },
  configured: () => !!tok(),
  async createUpload({ uid, bytes }) {
    const j = await call('https://api.vimeo.com/me/videos', { method: 'POST', headers: H(), body: JSON.stringify({ upload: { approach: 'tus', size: bytes }, name: 'reel-' + String(uid).slice(-6), privacy: { view: 'anybody', embed: 'public', download: false } }) });
    if (!j.uri || !j.upload || !j.upload.upload_link) throw new Error('Vimeo did not return an upload link.');
    return { ticketId: idOf(j.uri), method: 'TUS', url: j.upload.upload_link, ext: { uri: j.uri } };
  },
  async status(rec) {
    const id = idOf(rec.ext && rec.ext.uri || rec.uploadId);
    const j = await call(`https://api.vimeo.com/videos/${id}?fields=uri,duration,transcode.status,upload.status,files,pictures.sizes`, { headers: H() });
    if ((j.upload && j.upload.status === 'error') || (j.transcode && j.transcode.status === 'error')) return { state: 'error', error: 'That video could not be processed. Try an MP4 (H.264).', assetId: id };
    if (!j.transcode || j.transcode.status !== 'complete') return { state: 'pending' };
    const f = (j.files || []).find((x) => x.quality === 'hls' && isHls(x.link)) || (j.files || []).find((x) => isHls(x.link));
    if (!f) return { state: 'error', error: 'Vimeo did not give an HLS link. Your Vimeo plan needs file access for streaming.', assetId: id };
    const sizes = (j.pictures && j.pictures.sizes) || [], pic = sizes.find((s) => s.width >= 640) || sizes[sizes.length - 1] || {};
    return { state: 'ready', assetId: id, hlsUrl: f.link, poster: pic.link || '', thumb: (sizes.find((s) => s.width >= 295) || pic).link || '', dur: Math.round(j.duration || 0), bytes: 0 };
  },
  async remove(rec) { const id = idOf(rec.assetId || (rec.ext && rec.ext.uri)); if (!id) return; try { await call('https://api.vimeo.com/videos/' + id, { method: 'DELETE', headers: H() }); } catch (e) { if (e.status !== 404) throw e; } },
  async test() { const j = await call('https://api.vimeo.com/me?fields=name,upload_quota', { headers: H() }); const free = j.upload_quota && j.upload_quota.space && j.upload_quota.space.free; return 'Vimeo accepted the token' + (free != null ? ` (${Math.round(free / 1048576)} MB free)` : '') + '.'; }
};
