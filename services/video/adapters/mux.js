// Mux: the first-class host. Wraps utils/mux.js so the rest of the app talks to it exactly like every other provider.
const M = require('../../../utils/mux');
module.exports = {
  name: 'mux', label: 'Mux',
  defaults: { priority: 1, maxVideos: 10, maxBytes: 0, maxFileMB: M.MUX_MAX_MB || 0 },     // Mux's free plan holds 10 videos
  configured: () => M.muxOn(),
  async createUpload({ uid, origin }) {
    const { d, cc } = await M.createUpload(uid, origin || '*');
    return { ticketId: d.id, method: 'PUT', url: d.url, cc, ext: {} };
  },
  async status(rec) {
    const u = await M.mux('GET', '/video/v1/uploads/' + rec.uploadId);
    if (['errored', 'cancelled', 'timed_out'].includes(u.status)) return { state: 'error', error: 'The upload did not finish. Please try again.' };
    if (!u.asset_id) return { state: 'pending' };
    const a = await M.mux('GET', '/video/v1/assets/' + u.asset_id);
    if (a.passthrough !== String(rec.user)) return { state: 'error', error: 'That upload is not yours.' };
    if (a.status === 'errored') return { state: 'error', error: 'That video could not be processed. Try an MP4 (H.264).', assetId: a.id };
    if (a.status !== 'ready') return { state: 'pending' };
    if ((a.duration || 0) > M.MUX_MAX_SEC + 1) return { state: 'error', error: `Reels can be up to ${M.MUX_MAX_SEC / 60} minutes.`, assetId: a.id };
    const v = M.muxVideo(a); if (!v) return { state: 'pending' };
    return { state: 'ready', assetId: a.id, hlsUrl: v.url, poster: v.poster.url, thumb: v.poster.thumb, dur: v.dur, bytes: 0, extra: { playbackId: v.mux.playbackId, signed: v.mux.signed } };
  },
  async remove(rec) { if (rec.assetId) await M.mux('DELETE', '/video/v1/assets/' + rec.assetId); },
  async test() { await M.mux('GET', '/video/v1/uploads?limit=1'); const u = await M.createUpload('admin-test', '*'); try { await M.mux('PUT', '/video/v1/uploads/' + u.d.id + '/cancel'); } catch (e) { /* expires by itself */ } return 'Mux accepted the keys and created a test upload.'; }
};
