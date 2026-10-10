// Shared rules for private chats and group chats: reactions, edits, deletes, photos and forwarding.
// Everything is checked here on the server; the browser only sends ids, text and photo links.

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🎉', '😍', '😭', '🤝'];
const EDIT_MS = 15 * 60 * 1000;          // a message can be edited for 15 minutes
const DELETE_ALL_MS = 48 * 3600 * 1000;  // "delete for everyone" works for 2 days (group admins can always remove)
const PHOTO_LABEL = '📷 Photo';
const isId = (s) => /^[a-f\d]{24}$/i.test(String(s));

// Only photos that WE stored (imgbb link or our own backup route) can be attached to a message.
const IMG_OK = [/^https:\/\/([a-z0-9-]+\.)*ibb\.co\/[\w\-./%~]+$/i, /^\/api\/ac\/photos\/raw\/[a-f\d]{24}$/i];
const okUrl = (u) => typeof u === 'string' && u.length < 400 && IMG_OK.some((r) => r.test(u));
function cleanImage(i) {
  if (!i || typeof i !== 'object' || !okUrl(i.url)) return null;
  const n = (v) => { v = Math.round(Number(v)); return v > 0 && v < 10000 ? v : undefined; };
  return { url: i.url, thumb: okUrl(i.thumb) ? i.thumb : i.url, w: n(i.w), h: n(i.h) };
}
const imageView = (m) => (!m.deleted && m.image && m.image.url ? { url: m.image.url, thumb: m.image.thumb || m.image.url, w: m.image.w || undefined, h: m.image.h || undefined } : undefined);
const reactionsView = (m) => (m.deleted ? [] : (m.reactions || []).map((r) => ({ u: r.u, e: r.e })));

// One reaction per person. Same emoji again removes it; a different emoji replaces it; '' removes it.
function toggleReaction(list, user, emoji) {
  const had = (list || []).find((r) => r.u === user);
  const out = (list || []).filter((r) => r.u !== user).map((r) => ({ u: r.u, e: r.e }));
  if (emoji && !(had && had.e === emoji)) out.push({ u: user, e: emoji });
  return out.slice(-200);
}
const canEdit = (m, me, now = Date.now()) => !!m && m.from === me && !m.deleted && m.kind === 'text' && now - new Date(m.at).getTime() <= EDIT_MS;
const canDeleteAll = (m, me, now = Date.now()) => !!m && m.from === me && !m.deleted && now - new Date(m.at).getTime() <= DELETE_ALL_MS;
const quoteText = (o) => String(o.text || '').slice(0, 120) || (o.image && o.image.url ? PHOTO_LABEL : '');

// Forwarding: the client names the message; the server copies it, so nobody can fake a forwarded message.
async function resolveForward(src, me) {
  const ACMessage = require('../models/ACMessage'), ACGroupMsg = require('../models/ACGroupMsg'), ACGroup = require('../models/ACGroup');   // loaded here so the rules above can be tested without a database
  if (!src || typeof src !== 'object' || !isId(src.id)) return null;
  if (src.kind === 'group') {
    const m = await ACGroupMsg.findOne({ _id: src.id, kind: 'text', deleted: { $ne: true } }).lean();
    if (!m || !(await ACGroup.exists({ _id: m.group, members: me }))) return null;
    return { text: String(m.text || ''), image: cleanImage(m.image) };
  }
  const m = await ACMessage.findOne({ _id: src.id, kind: 'text', deleted: { $ne: true }, $or: [{ from: me }, { to: me }] }).lean();
  return m ? { text: String(m.text || ''), image: cleanImage(m.image) } : null;
}
module.exports = { REACTIONS, EDIT_MS, DELETE_ALL_MS, PHOTO_LABEL, isId, cleanImage, imageView, reactionsView, toggleReaction, canEdit, canDeleteAll, quoteText, resolveForward };
