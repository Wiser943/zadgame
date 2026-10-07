// Deliberately tiny: this app is real-time (sockets), so we don't want to
// cache game pages or API responses. The service worker's only job is to
// exist — its presence + the manifest is what makes Chrome/Edge/Android
// consider the site "installable" and fire beforeinstallprompt.
const CACHE = 'gamehub-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/pwa-192.png', '/logo.png'];

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
  e.waitUntil(self.registration.showNotification(data.title || 'AllConnect', {
    body: data.body || 'You have a new AllConnect update.', icon: data.icon || '/pwa-192.png', tag: target.type || 'allconnect', data: target
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data || { type: 'updates' };
  const url = new URL('/', self.location.origin);
  url.searchParams.set('open', target.type || 'updates');
  if (target.id) url.searchParams.set('id', target.id);
  if (target.ref) url.searchParams.set('ref', target.ref);
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const same = list.find((client) => 'focus' in client);
    if (same) { same.navigate(url.href); return same.focus(); }
    return clients.openWindow(url.href);
  }));
});

// Network-first for everything (never serve stale game state); fall back to
// the cached shell only when fully offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});
