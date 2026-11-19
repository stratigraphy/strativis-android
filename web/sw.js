// Strativis web app: keeps every file of the app on the device, so the app
// opens without a connection. build_site.R fills in the version and the list.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'strativis-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

// A new version waits until the app is closed, then replaces the old one.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((k) => k.startsWith('strativis-') && k !== CACHE)
      .map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) { return; }
  event.respondWith(caches.open(CACHE)
    .then((cache) => cache.match(event.request, { ignoreSearch: true }))
    .then((hit) => hit || fetch(event.request)));
});
