// Gumlet: the server creates the asset and gets a one-time upload URL; the browser PUTs the file to it. HLS comes from video.gumlet.io.
// Env: GUMLET_API_KEY, GUMLET_COLLECTION_ID
const { env, GB, call, isHls } = require('../util');
const key = () => env('GUMLET_API_KEY'), col = () => env('GUMLET_COLLECTION_ID');
const H = () => ({ Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json' });
module.exports = {
  name: 'gumlet', label: 'Gumlet',
  defaults: { priority: 4, maxVideos: 0, maxBytes: 10 * GB, maxFileMB: 1024 },
  configured: () => !!(key() && col()),
  async createUpload({ uid }) {
    const j = await call('https://api.gumlet.com/v1/video/assets/upload', { method: 'POST', headers: H(), body: JSON.stringify({ collection_id: col(), format: 'HLS', title: 'reel-' + String(uid).slice(-6) }) });
    if (!j.asset_id || !j.upload_url) throw new Error('Gumlet did not return an upload URL.');
    return { ticketId: j.asset_id, method: 'PUT', url: j.upload_url, headers: { 'Content-Type': 'video/mp4' }, ext: { assetId: j.asset_id } };
  },
  async status(rec) {
    const id = rec.ext && rec.ext.assetId || rec.uploadId, j = await call('https://api.gumlet.com/v1/video/assets/' + encodeURIComponent(id), { headers: H() }), st = String(j.status || '').toLowerCase();
    if (['errored', 'error', 'failed'].includes(st)) return { state: 'error', error: 'That video could not be processed. Try an MP4 (H.264).', assetId: id };
    if (st !== 'ready') return { state: 'pending' };
    const o = j.output || {}, hls = isHls(o.playback_url) ? o.playback_url : `https://video.gumlet.io/${id}/main.m3u8`, poster = o.thumbnail_url || `https://video.gumlet.io/${id}/thumbnail-1-0.png`;
    return { state: 'ready', assetId: id, hlsUrl: hls, poster, thumb: poster, dur: Math.round(o.duration || (j.input && j.input.duration) || 0), bytes: (j.input && j.input.size) || 0 };
  },
  async remove(rec) { const id = rec.assetId || rec.uploadId; if (!id) return; try { await call('https://api.gumlet.com/v1/video/assets/' + encodeURIComponent(id), { method: 'DELETE', headers: H() }); } catch (e) { if (e.status !== 404) throw e; } },
  async test() { await call('https://api.gumlet.com/v1/video/assets?page_size=1', { headers: H() }); return 'Gumlet accepted the key.'; }
};
