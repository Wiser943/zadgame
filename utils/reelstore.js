// Video storage for P-Gist reels. Clips are kept in MongoDB GridFS (bucket "reels") so reels work with no extra service.
// Streaming supports HTTP Range requests, which <video> needs for seeking and for iOS/Safari playback.
const mongoose = require('mongoose');

const MAX_BYTES = 25 * 1024 * 1024;           // biggest clip accepted
const MAX_PER_USER = 40;                      // reels kept per player
const MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];

let bucket = null;
const B = () => bucket || (bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'reels' }));
const oid = (id) => new mongoose.mongo.ObjectId(String(id));
const isId = (s) => /^[a-f\d]{24}$/i.test(String(s || ''));

/* Check the real file header, not just the Content-Type the browser claims. */
function sniff(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return buf.slice(8, 12).toString('latin1') === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return '';
}

function save(buf, owner, mime) {
  return new Promise((resolve, reject) => {
    const up = B().openUploadStream('reel-' + Date.now(), { metadata: { owner: String(owner), mime, used: false } });
    up.once('error', reject); up.once('finish', () => resolve(String(up.id)));
    up.end(buf);
  });
}
async function stat(id) { if (!isId(id)) return null; const r = await B().find({ _id: oid(id) }).limit(1).toArray(); return r[0] || null; }
async function remove(id) { if (!isId(id)) return; try { await B().delete(oid(id)); } catch (e) { /* already gone */ } }
async function markUsed(id) { await mongoose.connection.db.collection('reels.files').updateOne({ _id: oid(id) }, { $set: { 'metadata.used': true } }); }
/* uploads that never became a post are tidied away the next time that player uploads */
async function sweep(owner) {
  const old = await mongoose.connection.db.collection('reels.files').find({ 'metadata.owner': String(owner), 'metadata.used': false, uploadDate: { $lt: new Date(Date.now() - 2 * 3600000) } }).project({ _id: 1 }).limit(20).toArray();
  for (const f of old) await remove(f._id);
}
function read(id, start, end) { return B().openDownloadStream(oid(id), { start, end: end + 1 }); }   // end is inclusive here

module.exports = { MAX_BYTES, MAX_PER_USER, MIMES, isId, sniff, save, stat, remove, markUsed, sweep, read };
