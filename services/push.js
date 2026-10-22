'use strict';

let webpush = null;
try { webpush = require('web-push'); } catch { console.warn('[push] web-push is not installed: push notifications are disabled.'); }
const PushSubscription = require('../models/PushSubscription');

const config = () => ({
  publicKey: String(process.env.VAPID_PUBLIC_KEY || '').trim(),
  privateKey: String(process.env.VAPID_PRIVATE_KEY || '').trim(),
  subject: String(process.env.VAPID_SUBJECT || 'mailto:admin@example.com').trim()
});

function configured() { const c = config(); return !!(webpush && c.publicKey && c.privateKey); }
function setup() { const c = config(); if (c.publicKey && c.privateKey) webpush.setVapidDetails(c.subject, c.publicKey, c.privateKey); }

async function sendToUser(userId, payload) {
  if (!configured()) return { sent: 0, skipped: true };
  setup();
  const rows = await PushSubscription.find({ user: String(userId) }).lean();
  let sent = 0;
  for (const row of rows) {
    try { await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, JSON.stringify(payload)); sent++; }
    catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) await PushSubscription.deleteOne({ _id: row._id }).catch(() => {});
      else console.error('[push]', error.message);
    }
  }
  return { sent };
}

async function sendGlobal(payload) {
  if (!configured()) return { sent: 0, skipped: true };
  setup();
  const rows = await PushSubscription.find({}).lean();
  let sent = 0;
  for (const row of rows) {
    try { await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, JSON.stringify(payload)); sent++; }
    catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) await PushSubscription.deleteOne({ _id: row._id }).catch(() => {});
      else console.error('[push]', error.message);
    }
  }
  return { sent };
}

module.exports = { config, configured, sendToUser, sendGlobal };
