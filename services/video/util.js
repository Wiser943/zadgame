// Small helpers shared by the video adapters. No database access here, so they are easy to unit test.
const env = (k) => String(process.env[k] || '').trim();
const b64 = (s) => Buffer.from(s).toString('base64');
const GB = 1024 * 1024 * 1024;
const isHls = (u) => /\.m3u8(\?|$)/i.test(String(u || ''));
// fetch with a timeout; throws an Error that carries .status for non-2xx replies
async function call(url, opt = {}, ms = 20000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...opt, signal: ac.signal });
    const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = { raw: txt.slice(0, 200) }; }
    if (!r.ok) { const er = new Error((j && (j.message || (j.error && (j.error.message || j.error)) || j.raw)) || 'HTTP ' + r.status); er.status = r.status; throw er; }
    return j;
  } finally { clearTimeout(t); }
}
const pathEnc = (p) => String(p).split('/').map(encodeURIComponent).join('/');
module.exports = { env, b64, GB, isHls, call, pathEnc };
