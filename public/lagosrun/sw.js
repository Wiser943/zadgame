// Lagos Run service worker.
//
// The game is ~15 MB of sprites plus hashed JS bundles, so nothing is
// precached beyond the shell: everything the game actually loads is cached the
// first time it's fetched, which makes the second launch instant and lets the
// game start offline. The leaderboard, analytics and radio always go to the
// network and are never cached.

// Bump VERSION whenever art in /assets or /icons changes: those are served from
// the cache without asking the server, so players only get new art on a bump.
const VERSION = 'lagosrun-ac-v1';
const SHELL = ['/lagosrun/', '/lagosrun/manifest.webmanifest', '/lagosrun/icons/icon-192.png', '/lagosrun/icons/icon-512.png', '/lagosrun/share-bg.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (await cache.match('/lagosrun/')) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (!url.pathname.startsWith('/lagosrun/')) return;                // never touch AllConnect / GameHub
    if (url.pathname.startsWith('/lagosrun/api/')) return;                        // live data only
    if (req.mode === 'navigate') return e.respondWith(networkFirst(req)); // always the newest build
    if (url.pathname.startsWith('/lagosrun/bundle/')) return e.respondWith(cacheFirst(req));   // hashed, immutable
    // game art: straight from the cache after the first load (saves ~45 requests per returning visit)
    if (url.pathname.startsWith('/lagosrun/assets/') || url.pathname.startsWith('/lagosrun/icons/')) return e.respondWith(cacheFirst(req));
    if (url.pathname.startsWith('/lagosrun/fonts/')) return e.respondWith(cacheFirst(req));   // self-hosted fonts
    if (url.pathname === '/lagosrun/share-bg.jpg') return e.respondWith(staleWhileRevalidate(req));
    return;
  }
  // everything else (analytics, radio streams, Radio Browser) goes straight to the network
});
