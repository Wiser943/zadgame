// Originality / copyright check for reels. Runs when a reel is posted; the result decides whether it goes live or is held for appeal.
// It FAILS OPEN: if a check cannot run (no key, timeout, network error) the reel is allowed, so uploads never break.
//
// Signals, cheapest first:
//   1. Re-upload: another creator already posted a reel with the same file fingerprint.
//   2. Caption says it is a repost / not the poster's own content.
//   3. Copyrighted music (optional): set AUDD_API_TOKEN (https://audd.io) and the soundtrack is matched against known songs.
//      It reads  https://stream.mux.com/<playbackId>/low.mp4  so MP4 renditions must be enabled on the Mux asset; if not, this step is skipped.
// A flag is not a punishment: the reel is hidden from others and the creator can appeal; an admin makes the final call.
const GistPost = require('../models/Gist');

const REPOST_WORDS = /\b(tiktok|repost(?:ed)?|re-?upload(?:ed)?|not my (?:own )?(?:video|content|clip)|i (?:do not|don'?t) own|no copyright intended|all rights (?:go )?to)\b/i;

async function musicMatch(playbackId) {
  const token = process.env.AUDD_API_TOKEN; if (!token || !playbackId || typeof fetch !== 'function') return null;
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 9000);
  try {
    const body = new URLSearchParams({ api_token: token, url: `https://stream.mux.com/${playbackId}/low.mp4` });
    const r = await fetch('https://api.audd.io/', { method: 'POST', body, signal: ac.signal });
    const j = await r.json().catch(() => null);
    const hit = j && j.status === 'success' && j.result;
    return hit && hit.title ? { title: String(hit.title).slice(0, 80), artist: String(hit.artist || '').slice(0, 80) } : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function checkReel({ uid, text, fingerprint, playbackId }) {
  try {
    if (/^[a-f0-9]{16,64}$/i.test(fingerprint || '')) {
      const dup = await GistPost.findOne({ fingerprint, author: { $ne: uid }, 'moderation.status': { $nin: ['flagged', 'appealed', 'rejected'] } }).select('_id').lean();
      if (dup) return { flagged: true, source: 'duplicate', reason: 'This video matches a reel another creator already posted.' };
    }
    if (REPOST_WORDS.test(String(text || ''))) return { flagged: true, source: 'caption', reason: 'The caption suggests this video is a repost or not your own content.' };
    const m = await musicMatch(playbackId);
    if (m) return { flagged: true, source: 'music', reason: `Copyrighted music detected: "${m.title}"${m.artist ? ' by ' + m.artist : ''}.` };
  } catch (e) { console.error('[contentCheck]', e.message); }
  return { flagged: false };
}
module.exports = { checkReel };
