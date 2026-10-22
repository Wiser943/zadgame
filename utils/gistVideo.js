'use strict';

/* Convert current and pre-Reels P-Gist video records into one safe client shape. */
function normalizeVideo(video, makePlayback) {
  if (!video || typeof video !== 'object') return null;
  if (typeof video.toObject === 'function') video = video.toObject();
  const legacyId = String(video.playbackId || '').trim();
  const mux = video.mux && video.mux.playbackId
    ? video.mux
    : (/^[A-Za-z0-9_-]{6,}$/.test(legacyId)
      ? { assetId: String(video.assetId || ''), playbackId: legacyId, signed: false, captions: false }
      : null);
  const isMux = video.kind === 'mux' || !!mux;
  let pb = null;
  if (isMux && mux && typeof makePlayback === 'function') {
    try { pb = makePlayback({ ...video, kind: 'mux', mux }) || null } catch (e) { pb = null }
  }
  const url = (pb && pb.url) || video.url || (mux && !mux.signed ? `https://stream.mux.com/${mux.playbackId}.m3u8` : '');
  if (!url) return null;
  const poster = (pb && pb.poster) || (video.poster && (video.poster.thumb || video.poster.url)) || '';
  return {
    kind: isMux ? 'mux' : (video.kind || 'db'),
    url,
    mime: video.mime || (isMux ? 'application/x-mpegURL' : 'video/mp4'),
    dur: Number(video.dur || video.duration || 0),
    poster,
    preview: (pb && pb.preview) || '',
    cc: !!((mux && mux.captions) || video.cc),
  };
}

module.exports = { normalizeVideo };
