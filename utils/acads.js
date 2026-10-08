// Advertising rules shared by routes + tests. No database access in here.
const BILLBOARD = { price: 250000, days: 7, slots: 6, perUser: 2 };
const SEA = { price: 500, days: 7, plots: 30, perUser: 10 };
// Phone apps: an advertiser's own platform (name + logo + website) shown on every player's phone, running their site inside it.
const APP = { price: 100000, days: 1, slots: 12, perUser: 3 };
const DAY_MS = 86400000;
const appNameError = (t) => (!t || t.length < 2 ? 'Give your app a name (2+ characters).' : t.length > 16 ? 'App name is 16 characters max.' : null);
// A logo emoji: '' (none), the emoji itself, or null when it is not a real emoji.
function cleanEmoji(v) {
  const s = String(v || '').trim(); if (!s) return '';
  if ([...s].length > 8 || /[<>&"'`]/.test(s)) return null;
  return /\p{Extended_Pictographic}/u.test(s) ? s : null;
}
const titleError = (t) => (!t || t.length < 2 ? 'Give your ad a title (2+ characters).' : t.length > 40 ? 'Title is 40 characters max.' : null);
// Links must be real https:// addresses so an ad can never run script or open a local/odd scheme.
function cleanUrl(v, max = 400) {
  const s = String(v || '').trim(); if (!s) return '';
  if (s.length > max) return null;
  try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.') ? u.toString() : null; } catch { return null; }
}
const plotList = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n < SEA.plots).sort((a, b) => a - b);
module.exports = { BILLBOARD, SEA, APP, DAY_MS, titleError, appNameError, cleanEmoji, cleanUrl, plotList };
