'use strict';

const JIOSAAVN_SEARCH_URL = process.env.JIOSAAVN_SEARCH_URL || 'https://saavn.dev/api/search/songs';
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
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; AllConnect/1.0)', ...(options.headers || {}) } });
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

// Audius: free, open music network (full-length tracks, lots of Afrobeats). No key needed, just an app name.
const AUDIUS_APP = process.env.AUDIUS_APP_NAME || 'allconnect';
let audiusHost = { url: '', at: 0 };
async function audiusBase() {
  if (audiusHost.url && Date.now() - audiusHost.at < 10 * 60 * 1000) return audiusHost.url;
  const data = await fetchJson('https://api.audius.co');
  const hosts = Array.isArray(data?.data) ? data.data.filter((h) => typeof h === 'string' && /^https:\/\//.test(h)) : [];
  if (!hosts.length) throw new Error('No Audius host available');
  audiusHost = { url: hosts[Math.floor(Math.random() * hosts.length)], at: Date.now() };
  return audiusHost.url;
}

function normalizeAudius(track, base) {
  if (!track?.id || !track.title) return null;
  if (track.is_streamable === false || track.is_stream_gated || track.is_unlisted) return null;
  const art = track.artwork || {};
  return {
    title: text(track.title),
    artist: text(track.user?.name, 'Unknown artist'),
    albumArt: firstUrl(art['480x480'] || art['150x150'] || art['1000x1000']),
    streamUrl: `${base}/v1/tracks/${encodeURIComponent(track.id)}/stream?app_name=${encodeURIComponent(AUDIUS_APP)}`,
    provider: 'audius'
  };
}

async function searchAudius(query) {
  const base = await audiusBase();
  const data = await fetchJson(`${base}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${encodeURIComponent(AUDIUS_APP)}`);
  return (Array.isArray(data?.data) ? data.data : []).map((t) => normalizeAudius(t, base)).filter(Boolean).slice(0, 20);
}

// iTunes Search: free, no key. Gives 30-second previews, so it is only the last resort.
function normalizeItunes(song) {
  const streamUrl = firstUrl(song?.previewUrl);
  const title = text(song?.trackName);
  if (!title || !streamUrl) return null;
  return { title, artist: text(song.artistName, 'Unknown artist'), albumArt: firstUrl((song.artworkUrl100 || '').replace('100x100', '300x300')), streamUrl, provider: 'itunes preview' };
}

async function searchItunes(query) {
  const data = await fetchJson(`https://itunes.apple.com/search?media=music&entity=song&limit=20&term=${encodeURIComponent(query)}`);
  return (Array.isArray(data?.results) ? data.results : []).map(normalizeItunes).filter(Boolean);
}

const reason = (error) => (error.name === 'AbortError' ? 'timed out' : error.message);

async function searchMusic(query) {
  const clean = text(query).replace(/^\.?play\s+/i, '').trim(); // "play rema calm down" works too
  if (clean.length < 2) return { provider: null, results: [], errors: ['Enter at least 2 characters to search.'] };
  const errors = [];
  const chain = [['audius', 'Audius', searchAudius], ['jiosaavn', 'JioSaavn', searchJioSaavn], ['itunes', 'iTunes preview', searchItunes]];
  for (const [id, label, fn] of chain) {
    try {
      const results = await fn(clean);
      if (results.length) return { provider: id, results, errors };
      errors.push(`${label} had no matches.`);
    } catch (error) {
      console.error(`[music] ${label} failed:`, reason(error), error.cause?.code || '');
      errors.push(`${label} was unavailable (${reason(error)}).`);
    }
  }
  return { provider: null, results: [], errors };
}

module.exports = { searchMusic, normalizeSong, searchJioSaavn, searchAudius, searchItunes, normalizeAudius, normalizeItunes };
