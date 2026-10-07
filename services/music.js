'use strict';

const JIOSAAVN_SEARCH_URL = 'https://saavn.dev/api/search/songs';
const DEFAULT_AUDIOMACK_SEARCH_URL = 'https://api.audiomack.com/v1/music/search';
const REQUEST_TIMEOUT_MS = 9000;

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function firstUrl(value) {
  if (Array.isArray(value)) return value.map((v) => firstUrl(v)).find(Boolean) || '';
  if (value && typeof value === 'object') return firstUrl(value.url || value.link || value.src || value.href);
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

function imageUrl(song) {
  const urls = song?.image || song?.images || song?.albumArt || song?.album_art || song?.artwork;
  if (Array.isArray(urls)) return firstUrl(urls[urls.length - 1]) || firstUrl(urls[0]);
  return firstUrl(urls) || text(song?.thumbnail || song?.cover);
}

function artistName(song) {
  if (typeof song?.artist === 'string') return song.artist;
  if (typeof song?.artists?.primary === 'string') return song.artists.primary;
  const list = song?.artists?.primary || song?.artists?.all || song?.artists;
  if (Array.isArray(list)) return list.map((a) => text(a?.name || a?.artist || a)).filter(Boolean).join(', ');
  return text(song?.artist_name || song?.author || song?.uploader, 'Unknown artist');
}

function normalizeSong(song, provider) {
  if (!song || typeof song !== 'object') return null;
  const downloads = song.downloadUrl || song.download_url || song.downloads;
  // JioSaavn returns quality variants in ascending order; last is the best available.
  const streamUrl = provider === 'jiosaavn'
    ? firstUrl(Array.isArray(downloads) ? downloads[downloads.length - 1] : downloads) || firstUrl(song.streamUrl || song.stream_url)
    : firstUrl(song.streamUrl || song.stream_url || song.stream || song.audio || song.audio_url || song.url || song.downloadUrl);
  const title = text(song.name || song.title || song.track || song.track_name);
  if (!title || !streamUrl) return null;
  return {
    title,
    artist: artistName(song),
    albumArt: imageUrl(song),
    streamUrl,
    provider
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchJioSaavn(query) {
  const data = await fetchJson(`${JIOSAAVN_SEARCH_URL}?query=${encodeURIComponent(query)}`);
  const songs = Array.isArray(data?.data?.results) ? data.data.results : Array.isArray(data?.results) ? data.results : [];
  return songs.map((song) => normalizeSong(song, 'jiosaavn')).filter(Boolean);
}

async function searchAudiomack(query) {
  const base = process.env.AUDIOMACK_SEARCH_URL || DEFAULT_AUDIOMACK_SEARCH_URL;
  const url = new URL(base);
  url.searchParams.set('q', query);
  const key = process.env.AUDIOMACK_API_KEY || process.env.AUDIOMACK_APIKEY || process.env.AUDIOMACK_KEY;
  const headers = key ? { Authorization: `Bearer ${key}`, 'X-API-Key': key } : {};
  const data = await fetchJson(url, { headers });
  const candidates = data?.results || data?.tracks || data?.data?.results || data?.data || [];
  return (Array.isArray(candidates) ? candidates : []).map((song) => normalizeSong(song, 'audiomack')).filter(Boolean);
}

async function searchMusic(query) {
  const clean = text(query);
  if (clean.length < 2) return { provider: null, results: [], errors: ['Enter at least 2 characters to search.'] };
  const errors = [];
  try {
    const results = await searchJioSaavn(clean);
    if (results.length) return { provider: 'jiosaavn', results, errors };
  } catch (error) {
    errors.push('JioSaavn search was unavailable.');
  }
  try {
    const results = await searchAudiomack(clean);
    if (results.length) return { provider: 'audiomack', results, errors };
  } catch (error) {
    errors.push(process.env.AUDIOMACK_API_KEY || process.env.AUDIOMACK_APIKEY || process.env.AUDIOMACK_KEY ? 'Audiomack search was unavailable.' : 'Audiomack fallback is not configured on the server.');
  }
  return { provider: null, results: [], errors };
}

module.exports = { searchMusic, normalizeSong, searchJioSaavn, searchAudiomack };
