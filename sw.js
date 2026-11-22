// SLAB/16 offline cache. Plain JS on purpose: it must be served from the site root.
// Strategy: network-first for everything same-origin, falling back to the cache,
// so a deploy is picked up immediately and the app still opens with no connection.
const CACHE = 'slab16-v1';
const SHELL = ['./', './index.html', './styles/app.css', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// The page reports the modules it loaded before this worker took control.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((url) => typeof url === 'string' && url.startsWith(self.location.origin));
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.allSettled(urls.map((url) => cache.add(url)))));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? caches.match('./index.html'))),
  );
});
