// Deliberately tiny: this app is real-time (sockets), so we don't want to
// cache game pages or API responses. The service worker's only job is to
// exist — its presence + the manifest is what makes Chrome/Edge/Android
// consider the site "installable" and fire beforeinstallprompt.
const CACHE = 'gamehub-shell-v5';
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icon-192.png', '/pwa-192.png', '/logo.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  const target = data.target || { type: 'updates' };
  const opts = { body: data.body || 'You have a new AllConnect update.', icon: data.icon || '/pwa-192.png', tag: target.type === 'chat' && target.id ? 'chat-' + target.id : (target.type || 'allconnect'), data: target };
  // Chat messages get a Reply button. Chrome on Android shows a text box right in the notification; other browsers open the chat with the reply bar ready.
  if (target.type === 'chat' && target.id) opts.actions = [{ action: 'reply', type: 'text', title: 'Reply', placeholder: 'Type a reply…' }];
  e.waitUntil(self.registration.showNotification(data.title || 'AllConnect', opts));
});

function appUrl(target, reply) {
  const url = new URL('/', self.location.origin);
  url.searchParams.set('open', target.type || 'updates');
  if (target.id) url.searchParams.set('id', target.id);
  if (target.mid) url.searchParams.set('mid', target.mid);
  if (target.ref) url.searchParams.set('ref', target.ref);
  if (reply) url.searchParams.set('reply', '1');
  return url;
}

async function openApp(url) {
  const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const same = list.find((client) => 'focus' in client);
  if (same) { await same.navigate(url.href); return same.focus(); }
  return clients.openWindow(url.href);
}

async function sendInlineReply(target, text) {
  try {
    const r = await fetch('/api/ac/messages/' + encodeURIComponent(target.id), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: String(text).slice(0, 300), replyTo: target.mid || undefined }) });
    if (!r.ok) throw new Error('send failed ' + r.status);
    await self.registration.showNotification('Reply sent ✓', { body: String(text).slice(0, 80), icon: '/pwa-192.png', tag: 'chat-' + target.id, silent: true, data: target });
  } catch {
    // Could not send from the notification (signed out, offline…): open the chat so nothing is lost.
    return openApp(appUrl(target, true));
  }
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data || { type: 'updates' };
  if (e.action === 'reply' && e.reply && target.type === 'chat' && target.id) { e.waitUntil(sendInlineReply(target, e.reply)); return; }
  e.waitUntil(openApp(appUrl(target, e.action === 'reply')));
});

// Network-first for everything (never serve stale game state); fall back to
// the cached shell only when fully offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      // opening the web app with no connection: show the AllConnect offline screen
      if (e.request.mode === 'navigate') return (await caches.match('/offline.html')) || Response.error();
      return Response.error();
    })
  );
});
