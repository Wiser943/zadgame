/* Multi-provider video storage router.
 *
 *   providers[name]   the REGISTRY. Every file in ./adapters is loaded automatically, so adding a provider means:
 *                     1) drop a new adapter file in services/video/adapters (copy any existing one),
 *                     2) restart: its row in the storage_providers collection is created from adapter.defaults (edit it in the admin panel).
 *
 *   An adapter exports: name, label, defaults{priority,maxVideos,maxBytes,maxFileMB}, configured(),
 *                       createUpload({uid,bytes,origin,filename}) -> {ticketId, method:'PUT'|'POST'|'TUS', url, headers?, fields?, fileField?, ext?}
 *                       status(rec, body) -> {state:'pending'|'ready'|'error', assetId, hlsUrl, poster, thumb, dur, bytes, extra?, error?}
 *                       remove(rec), test()
 *
 *   Every ready video is stored with an HLS (.m3u8) playback URL, whichever host keeps the bytes, so the player never changes.
 *   Quotas: a slot (1 video + the file's bytes) is RESERVED when an upload starts, corrected when the video is ready, and FREED when it is deleted.
 */
const fs = require('fs');
const path = require('path');
const StorageProvider = require('../../models/StorageProvider');
const ACVideo = require('../../models/ACVideo');
const { isHls } = require('./util');
const { MUX_MAX_SEC } = require('../../utils/mux');

const providers = {};
for (const f of fs.readdirSync(path.join(__dirname, 'adapters')).sort()) {
  if (!f.endsWith('.js')) continue;
  const a = require('./adapters/' + f);
  if (a && a.name) providers[a.name] = a;
}

const clampNeg = (field, by) => [{ $set: { [field]: { $max: [0, { $add: ['$' + field, by] }] } } }];   // never below zero

async function seed() {
  for (const a of Object.values(providers)) {
    await StorageProvider.updateOne({ name: a.name }, { $setOnInsert: { name: a.name, label: a.label, enabled: true, ...a.defaults } }, { upsert: true });
  }
}
/* take a slot from one provider, only if it still has room (atomic, so two uploads can never both take the last slot) */
async function reserve(name, bytes) {
  return StorageProvider.findOneAndUpdate({
    name, enabled: true,
    $and: [
      { $or: [{ maxVideos: 0 }, { $expr: { $lt: ['$usedVideos', '$maxVideos'] } }] },
      { $or: [{ maxBytes: 0 }, { $expr: { $lte: [{ $add: ['$usedBytes', bytes] }, '$maxBytes'] } }] }
    ]
  }, { $inc: { usedVideos: 1, usedBytes: bytes } }, { new: true });
}
async function release(name, bytes) {
  await StorageProvider.updateOne({ name }, [{ $set: { usedVideos: { $max: [0, { $subtract: ['$usedVideos', 1] }] }, usedBytes: { $max: [0, { $subtract: ['$usedBytes', Math.max(0, bytes || 0)] }] } } }]);
}
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

/* Start an upload on the best provider that has room; falls through to the next one when a provider is full or errors. */
async function createTicket({ uid, bytes = 0, origin = '*', filename = '', only = '', skip = [], abandon = '' }) {
  bytes = Math.max(0, Math.floor(Number(bytes) || 0));
  /* The browser could not reach the host it was given (blocked network, CORS, bad link). Throw that unfinished upload away so its slot is freed,
     and never hand this player the same host again for this post: that is what lets the next host in the list actually get used. */
  if (abandon) { const old = await ACVideo.findOne({ uploadId: String(abandon), user: String(uid), status: 'pending' }).lean(); if (old) await discard(old).catch(() => {}); }
  skip = (Array.isArray(skip) ? skip : []).map(String).slice(0, 12);
  const rows = (await StorageProvider.find({ enabled: true, ...(only ? { name: only } : {}) }).sort({ priority: 1 }).lean()).filter((r) => !skip.includes(r.name));
  let tooBig = 0, tried = 0, lastErr = null, lastLabel = '';
  for (const row of rows) {
    const a = providers[row.name]; if (!a || !a.configured()) continue;
    if (row.maxFileMB && bytes > row.maxFileMB * 1048576) { tooBig = Math.max(tooBig, row.maxFileMB); continue; }
    if (!(await reserve(row.name, bytes))) continue;
    tried++;
    try {
      const t = await a.createUpload({ uid: String(uid), bytes, origin, filename });
      await ACVideo.create({ user: String(uid), uploadId: t.ticketId, status: 'pending', provider: a.name, bytes, quota: true, cc: !!t.cc, ext: t.ext || {} });
      return { provider: a.name, uploadId: t.ticketId, method: t.method, url: t.url, headers: t.headers, fields: t.fields, fileField: t.fileField };
    } catch (e) {
      await release(a.name, bytes); lastErr = e; lastLabel = a.label;
      console.error('[video ' + a.name + ']', e.status || '', e.message);
      StorageProvider.updateOne({ name: a.name }, { $set: { lastError: String(e.message).slice(0, 200), lastErrorAt: new Date() } }).catch(() => {});
    }
  }
  if (lastErr) throw fail(`Could not start the upload (${lastLabel}: ${String(lastErr.message).slice(0, 140)}).`, 502, 'provider_error');
  if (tooBig && !tried) throw fail(`This video is too large. The biggest file we can take is ${tooBig} MB.`, 413, 'too_big');
  throw fail('Video storage is full or not set up right now. Please try again later.', 503, 'no_capacity');
}

/* host said it is bad or never finished: delete what exists there, free the slot, drop the record */
async function discard(rec, assetId) {
  const a = providers[rec.provider || 'mux'];
  if (a && (assetId || rec.assetId)) { try { await a.remove({ ...rec, assetId: assetId || rec.assetId }); } catch (e) { /* the host may never have created it */ } }
  if (rec.quota !== false) await release(rec.provider || 'mux', rec.bytes);
  await ACVideo.deleteOne({ _id: rec._id });
}

/* Check one upload. Returns {ready:true,...} | {ready:false,status} | {error}. Safe to call repeatedly. */
async function settle(rec, body) {
  if (rec.status === 'ready') return { ready: true, provider: rec.provider || 'mux', assetId: rec.assetId, dur: rec.dur || 0 };
  const a = providers[rec.provider || 'mux']; if (!a) return { error: 'This upload belongs to a video host that is no longer available.' };
  let r; try { r = await a.status(rec, body); } catch (e) { console.error('[video status ' + a.name + ']', e.message); return { ready: false, status: 'checking' }; }
  if (r.state === 'pending') return { ready: false, status: 'processing' };
  if (r.state === 'error') { await discard(rec, r.assetId); return { error: r.error || 'That video could not be processed.' }; }
  if (!isHls(r.hlsUrl)) { await discard(rec, r.assetId); return { error: 'The video host did not return a streamable (HLS) video.' }; }
  if ((r.dur || 0) > MUX_MAX_SEC + 1) { await discard(rec, r.assetId); return { error: `Reels can be up to ${MUX_MAX_SEC / 60} minutes.` }; }
  const bytes = r.bytes || rec.bytes || 0, diff = bytes - (rec.bytes || 0), ex = r.extra || {};
  const set = { status: 'ready', assetId: r.assetId, url: r.hlsUrl, poster: r.poster || '', thumb: r.thumb || r.poster || '', dur: r.dur || 0, bytes, ext: { ...(rec.ext || {}), ...ex } };
  if (ex.playbackId) set.playbackId = ex.playbackId; if (ex.signed != null) set.signed = !!ex.signed;
  await ACVideo.updateOne({ _id: rec._id }, { $set: set });
  if (diff && rec.quota !== false) await StorageProvider.updateOne({ name: rec.provider || 'mux' }, clampNeg('usedBytes', diff));
  return { ready: true, provider: rec.provider || 'mux', assetId: r.assetId, dur: r.dur || 0 };
}
async function status(uid, uploadId, body) {
  const rec = await ACVideo.findOne({ uploadId: String(uploadId), user: String(uid) }).lean();
  if (!rec) return { error: 'Upload not found.' };
  return settle(rec, body);
}

/* Delete a video from the host that actually has it, then give its slot back. Throws if the host refuses (so quota stays honest) unless force. */
async function remove(rec, { force = false } = {}) {
  const a = providers[rec.provider || 'mux'];
  if (a && rec.status !== 'pending') { try { await a.remove(rec); } catch (e) { if (!force) throw e; console.error('[video remove ' + a.name + ']', e.message); } }
  else if (a && rec.assetId) { try { await a.remove(rec); } catch (e) { /* nothing to remove yet */ } }
  if (rec.quota !== false) await release(rec.provider || 'mux', rec.bytes);
  await ACVideo.deleteOne({ _id: rec._id });
}

/* Re-count usage from the real records (heals any drift; also counts videos that existed before this router did). */
async function reconcile() {
  const agg = await ACVideo.aggregate([{ $group: { _id: { $ifNull: ['$provider', 'mux'] }, n: { $sum: 1 }, b: { $sum: { $ifNull: ['$bytes', 0] } } } }]);
  const by = Object.fromEntries(agg.map((x) => [x._id, x]));
  for (const name of Object.keys(providers)) await StorageProvider.updateOne({ name }, { $set: { usedVideos: (by[name] && by[name].n) || 0, usedBytes: (by[name] && by[name].b) || 0 } });
}
/* uploads that never finished: complete them if they did, drop them after a day */
async function sweep() {
  const rows = await ACVideo.find({ status: 'pending', createdAt: { $lt: new Date(Date.now() - 3 * 3600000) } }).limit(60).lean();
  for (const r of rows) {
    const out = await settle(r, null).catch(() => null);
    if (out && (out.ready || out.error)) continue;
    if (Date.now() - new Date(r.createdAt).getTime() > 24 * 3600000) await discard(r).catch(() => {});
  }
}
async function syncUser(uid) {                    // the gallery calls this so a finished upload shows up even if the player left early
  const rows = await ACVideo.find({ user: String(uid), status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean();
  await Promise.all(rows.map((r) => settle(r, null).catch(() => null)));
}
async function list() {
  const rows = await StorageProvider.find({}).sort({ priority: 1 }).lean();
  return rows.map((r) => ({ ...r, configured: !!(providers[r.name] && providers[r.name].configured()), known: !!providers[r.name] }));
}
async function update(name, b) {
  if (!providers[name]) throw fail('Unknown provider.', 404);
  const set = {}, num = (k) => { const v = Number(b[k]); if (!Number.isFinite(v) || v < 0) throw fail(k + ' must be 0 or more.', 400); return Math.floor(v); };
  if ('enabled' in b) set.enabled = !!b.enabled;
  for (const k of ['priority', 'maxVideos', 'maxBytes', 'maxFileMB']) if (k in b) set[k] = num(k);
  await StorageProvider.updateOne({ name }, { $set: set });
}
async function test(name) { const a = providers[name]; if (!a) throw fail('Unknown provider.', 404); if (!a.configured()) throw fail('This provider\'s keys are not set on the host.', 400); return a.test(); }
async function boot() {
  await seed(); await reconcile();
  setTimeout(() => sweep().catch(() => {}), 90000).unref();
  setInterval(() => sweep().catch((e) => console.error('[video sweep]', e.message)), 30 * 60000).unref();
  setInterval(() => reconcile().catch(() => {}), 6 * 3600000).unref();
}
module.exports = { providers, syncUser, seed, reserve, release, createTicket, status, settle, remove, reconcile, sweep, list, update, test, boot };
