'use strict';

const PLAYBACK_ID = /^[A-Za-z0-9_-]{6,128}$/;

function muxPlaybackUrl(playbackId) {
  const id = String(playbackId || '').trim();
  return PLAYBACK_ID.test(id) ? `https://stream.mux.com/${id}.m3u8` : '';
}

module.exports = { muxPlaybackUrl };
