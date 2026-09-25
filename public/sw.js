// Deliberately tiny: this app is real-time (sockets), so we don't want to
// cache game pages or API responses. The service worker's only job is to
// exist — its presence + the manifest is what makes Chrome/Edge/Android
// consider the site "installable" and fire beforeinstallprompt.
const CACHE = 'gamehub-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

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

// Network-first for everything (never serve stale game state); fall back to
// the cached shell only when fully offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});
