// Tracks which users currently have at least one open socket (in-memory; single-process like the rooms).
const counts = new Map();
module.exports = {
  connect(uid) { counts.set(uid, (counts.get(uid) || 0) + 1); },
  disconnect(uid) { const n = (counts.get(uid) || 0) - 1; if (n <= 0) counts.delete(uid); else counts.set(uid, n); },
  count() { return counts.size; },
  isOnline(uid) { return counts.has(String(uid)); }
};
