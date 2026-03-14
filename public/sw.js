const CACHE_NAME = 'focus-cache-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response; // Cache hit
        }
        return fetch(event.request).then((fetchResponse) => {
          // Additional code could dynamically cache new assets here if we wanted
          return fetchResponse;
        }).catch(() => {
          // For a true offline-first approach:
          // We could return a custom offline page here if the network fails
        });
      })
  );
});
