// Greek Vocab PWA update fix: HTML is network-first, with offline fallback.
const CACHE = 'greek-vocab-v6-2-fresh-html-20261113';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './favicon.png'];
const APP_ROOT = new URL('./', self.registration.scope).pathname;
const INDEX_URL = new URL('./index.html', self.registration.scope);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldCaches = keys.filter(key => key.startsWith('greek-vocab-') && key !== CACHE);
    await Promise.all(oldCaches.map(key => caches.delete(key)));
    await self.clients.claim();
    // Refresh already-open app pages once after an actual version upgrade.
    if (oldCaches.length) {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(clients.filter(client => {
        try {
          const u = new URL(client.url);
          return u.origin === self.location.origin && u.pathname.startsWith(APP_ROOT);
        } catch { return false; }
      }).map(client => client.navigate(client.url).catch(() => {})));
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT)) return;

  const isHTML = request.mode === 'navigate' || url.pathname === APP_ROOT || url.pathname === APP_ROOT + 'index.html';
  if (isHTML) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) await cache.put(INDEX_URL, response.clone());
        return response;
      } catch {
        return (await cache.match(INDEX_URL)) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.includes('/illustrations/')) {
    event.respondWith(fetch(request, { cache: 'no-cache' }).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return response;
    }).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  })));
});
