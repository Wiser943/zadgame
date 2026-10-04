// Configurable chat filter. Extend with CHAT_BLOCKLIST="word1,word2" (comma separated) in your environment.
const DEFAULT = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'cunt', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard'];
const extra = String(process.env.CHAT_BLOCKLIST || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
const WORDS = [...new Set([...DEFAULT, ...extra])];
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Match each word with optional repeated letters and separators between letters (f.u.c.k, fuuuck).
// Whole-word only (plus common endings) so words like "Scunthorpe" or "assassin" are not flagged.
const RES = WORDS.map((w) => new RegExp('(?<![a-z])' + w.split('').map((ch) => esc(ch) + '+').join('[\\s._*-]*') + '(?:s|es|ing|ed|er|ers|y|ier)?(?![a-z])', 'gi'));
function clean(text) {
  let t = String(text);
  const norm = t.replace(/[01345 7@$]/g, (c) => LEET[c] || c); // same length, so indexes line up
  let out = t.split('');
  for (const re of RES) { re.lastIndex = 0; let m; while ((m = re.exec(norm))) { for (let k = m.index; k < m.index + m[0].length; k++) if (/\S/.test(out[k])) out[k] = '*'; if (!m[0].length) re.lastIndex++; } }
  return out.join('');
}
const isDirty = (text) => clean(text) !== String(text);
module.exports = { clean, isDirty, WORDS };
