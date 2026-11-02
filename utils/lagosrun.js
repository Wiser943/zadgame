// Drive on the main server. No database in this file: everything here is a pure function so it can be tested.
// The game no longer has its own accounts. A player is whoever is signed in to AllConnect (the same session cookie).
const crypto = require('crypto');

const WALLET_KEYS = ['bank', 'tyre', 'shield', 'magnet'];
const BOARDS = ['day', 'week', 'all'];
const LAGOS_OFFSET = 3600e3;                      // Africa/Lagos is UTC+1, no daylight saving
const RUN_TTL = 20 * 60e3;                        // a run token is good for 20 minutes (the client keeps a spare ready)
const LIMITS = { score: 5e6, metres: 2e5, secs: 3600, bankGainPerSync: 250000, boostGainPerSync: 50, saveBytes: 24000 };

const secret = () => process.env.SESSION_SECRET || 'dev_secret_change_me';
const b64 = (s) => Buffer.from(s).toString('base64url');
const num = (v, lo, hi, d = 0) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ---- leaderboard periods (Lagos time) ----
function periodKeys(now = Date.now()) {
  const d = new Date(now + LAGOS_OFFSET);                         // shift so the UTC getters read Lagos time
  const day = d.toISOString().slice(0, 10);
  const dow = (d.getUTCDay() + 6) % 7;                            // Monday = 0
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
  return { day, week: mon.toISOString().slice(0, 10), all: 'all' };
}

// ---- run tokens: proves a score came from a run that was started on this server, for this user ----
function signRun(uid, now = Date.now()) {
  const body = b64(JSON.stringify({ u: String(uid), t: now, n: crypto.randomBytes(8).toString('hex') }));
  return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}
function verifyRun(token, uid, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
  if (!p || p.u !== String(uid) || !Number.isFinite(p.t) || now - p.t > RUN_TTL * 3 || p.t > now + 5000) return null;
  return p;                                                       // { u, t, n }
}

// ---- a finished run ----
// Returns { ok, score, metres, secs, area } or { ok: false, error }. `issuedAt` is when the run token was made.
function cleanRun(body, issuedAt, now = Date.now()) {
  const score = Math.floor(num(body && body.score, 0, Infinity)), metres = Math.round(num(body && body.metres, 0, Infinity));
  const secs = num(body && body.secs, 0, Infinity);
  if (score <= 0) return { ok: false, error: 'no score' };
  if (score > LIMITS.score || metres > LIMITS.metres || secs > LIMITS.secs) return { ok: false, error: 'out of range' };
  if (secs < 1) return { ok: false, error: 'too short' };
  if ((now - issuedAt) / 1000 + 5 < secs) return { ok: false, error: 'too fast' };   // cannot run for longer than the token has existed
  const area = typeof (body && body.area) === 'string' ? body.area.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) : '';
  return { ok: true, score, metres, secs: Math.round(secs * 10) / 10, area };
}

// ---- save blob (the game's own { v, progress, streak, bag, settings, seen, at } shape) ----
const mapNum = (o, hi = 1e9) => { const r = {}; if (isObj(o)) for (const k of Object.keys(o).slice(0, 80)) { const n = Number(o[k]); if (/^[\w.-]{1,40}$/.test(k) && Number.isFinite(n)) r[k] = Math.min(hi, Math.max(0, n)); } return r; };
const strList = (a, max = 60) => [...new Set((Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && x.length <= 40).slice(0, max))];
const short = (v, n = 60) => (typeof v === 'string' && v.length && v.length <= n ? v : null);

function emptySave() {
  return { v: 1, progress: { level: 1, missions: null, totals: {}, owned: { paint: [], horn: [], sticker: [], bus: [] }, equip: {}, upgrades: {}, best: 0, bests: {} },
    streak: { last: null, count: 0, best: 0, shieldAt: null, days: [], shields: [] }, bag: { next: 0 }, settings: {}, seen: {}, at: { equip: 0, settings: 0 } };
}

function cleanSave(raw) {
  const t = isObj(raw) ? raw : {}, p = isObj(t.progress) ? t.progress : {}, s = isObj(t.streak) ? t.streak : {}, st = isObj(t.settings) ? t.settings : {};
  const out = emptySave();
  out.progress.level = Math.floor(num(p.level, 1, 1e4, 1));
  out.progress.missions = Array.isArray(p.missions) ? JSON.parse(JSON.stringify(p.missions.filter(isObj).slice(0, 3))) : null;
  out.progress.totals = mapNum(p.totals);
  for (const k of ['paint', 'horn', 'sticker', 'bus']) out.progress.owned[k] = strList(p.owned && p.owned[k]);
  for (const k of ['paint', 'horn', 'sticker', 'bus']) { const v = short(p.equip && p.equip[k]); if (v) out.progress.equip[k] = v; }
  out.progress.upgrades = mapNum(p.upgrades, 50);
  out.progress.best = Math.floor(num(p.best, 0, LIMITS.score));
  out.progress.bests = mapNum(p.bests, LIMITS.score);
  if (short(p.area, 16)) out.progress.area = p.area;
  out.streak = { last: short(s.last, 20), count: Math.floor(num(s.count, 0, 1e5)), best: Math.floor(num(s.best, 0, 1e5)), shieldAt: short(s.shieldAt, 20),
    days: (Array.isArray(s.days) ? s.days : []).filter((x) => typeof x === 'string' && x.length <= 20).slice(-14),
    shields: (Array.isArray(s.shields) ? s.shields : []).filter((x) => typeof x === 'string' && x.length <= 20).slice(-8) };
  out.bag.next = num(t.bag && t.bag.next, 0, 1e9);
  if (typeof st.lefty === 'boolean') out.settings.lefty = st.lefty;
  if (typeof st.muted === 'boolean') out.settings.muted = st.muted;
  if (st.sfx != null && Number.isFinite(Number(st.sfx))) out.settings.sfx = num(st.sfx, 0, 1);
  if (st.radio != null && Number.isFinite(Number(st.radio))) out.settings.radio = num(st.radio, 0, 1);
  if (short(st.station, 60)) out.settings.station = st.station;
  out.seen = mapNum(t.seen, 1e9);
  out.at = { equip: num(t.at && t.at.equip, 0, 4e12), settings: num(t.at && t.at.settings, 0, 4e12) };
  if (Buffer.byteLength(JSON.stringify(out)) > LIMITS.saveBytes) return emptySave();
  return out;
}

const maxMap = (a, b) => { const r = { ...a }; for (const [k, v] of Object.entries(b || {})) r[k] = Math.max(r[k] || 0, v); return r; };
const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];

// Merge the phone's save with the one on the server. Progress only ever goes up; equipment and settings follow whoever changed them last.
function mergeSave(serverRaw, clientRaw) {
  const a = cleanSave(serverRaw), b = cleanSave(clientRaw), out = emptySave();
  out.progress.level = Math.max(a.progress.level, b.progress.level);
  out.progress.best = Math.max(a.progress.best, b.progress.best);
  out.progress.bests = maxMap(a.progress.bests, b.progress.bests);
  out.progress.totals = maxMap(a.progress.totals, b.progress.totals);
  out.progress.upgrades = maxMap(a.progress.upgrades, b.progress.upgrades);
  for (const k of ['paint', 'horn', 'sticker', 'bus']) out.progress.owned[k] = union(a.progress.owned[k], b.progress.owned[k]).slice(0, 60);
  out.progress.missions = b.progress.missions || a.progress.missions;
  const clientNewer = b.at.equip >= a.at.equip, setNewer = b.at.settings >= a.at.settings;
  out.progress.equip = clientNewer ? { ...a.progress.equip, ...b.progress.equip } : { ...b.progress.equip, ...a.progress.equip };
  const area = clientNewer ? (b.progress.area || a.progress.area) : (a.progress.area || b.progress.area);
  if (area) out.progress.area = area;
  out.settings = setNewer ? { ...a.settings, ...b.settings } : { ...b.settings, ...a.settings };
  out.at = { equip: Math.max(a.at.equip, b.at.equip), settings: Math.max(a.at.settings, b.at.settings) };
  const sa = a.streak, sb = b.streak, ahead = (sb.last || '') > (sa.last || '') || ((sb.last || '') === (sa.last || '') && sb.count >= sa.count) ? sb : sa;
  out.streak = { ...ahead, best: Math.max(sa.best, sb.best), days: union(sa.days, sb.days).sort().slice(-14), shields: union(sa.shields, sb.shields).sort().slice(-8) };
  out.bag.next = Math.max(a.bag.next, b.bag.next);
  out.seen = maxMap(a.seen, b.seen);
  return out;
}

// ---- wallet: coins and boosts. The server holds the truth, the phone only sends changes (deltas) ----
function cleanWallet(w) { const r = {}; for (const k of WALLET_KEYS) r[k] = Math.max(0, Math.trunc(num(w && w[k], 0, 1e12))); return r; }

// Applies a delta from the phone. Gains are capped per sync (a typical run earns far less); the balance can never go below zero.
function applyDelta(wallet, delta) {
  const w = cleanWallet(wallet), out = { ...w };
  for (const k of WALLET_KEYS) {
    let d = Math.trunc(num(delta && delta[k], -1e12, 1e12));
    const cap = k === 'bank' ? LIMITS.bankGainPerSync : LIMITS.boostGainPerSync;
    if (d > cap) d = cap;
    out[k] = Math.max(0, w[k] + d);
  }
  return out;
}

module.exports = { WALLET_KEYS, BOARDS, LIMITS, RUN_TTL, periodKeys, signRun, verifyRun, cleanRun, cleanSave, emptySave, mergeSave, cleanWallet, applyDelta };
