'use strict';
/* Shared client API for the feature rollout. Existing screens can opt in without duplicating
   auth, validation, or endpoint conventions. The server remains authoritative. */
(function () {
  const base = '/api/ac/features';
  const call = (path, options = {}) => {
    if (typeof NET !== 'undefined' && NET.api) return NET.api(base + path, options);
    return fetch(base + path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || 'Could not save this feature.'); return d; });
  };
  window.ACFeatures = {
    list(kind) { return call(kind ? '?kind=' + encodeURIComponent(kind) : ''); },
    create(kind, payload, options = {}) { return call('/' + encodeURIComponent(kind), { method: 'POST', body: { payload, ...options } }); },
    update(id, patch) { return call('/' + encodeURIComponent(id), { method: 'PATCH', body: patch }); },
    remove(id) { return call('/' + encodeURIComponent(id), { method: 'DELETE' }); },
    savedSearches() { return call('/by-kind/song-search'); },
    playlists() { return call('/by-kind/song-playlist'); },
    queues() { return call('/by-kind/song-queue'); },
    reminders() { return call('/by-kind/pet-reminder'); },
    savedPlaces() { return call('/by-kind/city-place'); },
    routes() { return call('/by-kind/city-route'); }
  };
})();
