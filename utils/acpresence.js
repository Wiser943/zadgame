// Which users currently have the AllConnect platform open (in-memory, single process).
const counts = new Map();
module.exports = {
  connect(id) { id = String(id); counts.set(id, (counts.get(id) || 0) + 1); },
  disconnect(id) { id = String(id); const n = (counts.get(id) || 0) - 1; if (n <= 0) counts.delete(id); else counts.set(id, n); },
  isOnline(id) { return counts.has(String(id)); }
};
