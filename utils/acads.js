// Advertising rules shared by routes + tests. No database access in here.
const BILLBOARD = { price: 250000, days: 7, slots: 6, perUser: 2 };
const SEA = { price: 500, days: 7, plots: 30, perUser: 10 };
const DAY_MS = 86400000;
const titleError = (t) => (!t || t.length < 2 ? 'Give your ad a title (2+ characters).' : t.length > 40 ? 'Title is 40 characters max.' : null);
// Links must be real https:// addresses so an ad can never run script or open a local/odd scheme.
function cleanUrl(v, max = 400) {
  const s = String(v || '').trim(); if (!s) return '';
  if (s.length > max) return null;
  try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.') ? u.toString() : null; } catch { return null; }
}
const plotList = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n < SEA.plots).sort((a, b) => a - b);
module.exports = { BILLBOARD, SEA, DAY_MS, titleError, cleanUrl, plotList };
