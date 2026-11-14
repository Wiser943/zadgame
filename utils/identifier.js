// One login box, two possible identifier types. Decide which, and normalize it
// the same way everywhere (registration, login, and linking a Google account).
function normalizeIdentifier(raw) {
  const s = String(raw || '').trim();
  if (s.includes('@')) return { type: 'email', value: s.toLowerCase() };
  return { type: 'phone', value: s.replace(/[^\d+]/g, '') };
}

function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidPhone(v) { return v.replace('+', '').length >= 7; }

module.exports = { normalizeIdentifier, isValidEmail, isValidPhone };
