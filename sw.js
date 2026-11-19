// Strativis web app: keeps every file of the app on the device, so the app
// opens without a connection. build_site.R fills in the version and the list.
const VERSION = '04e151c4d4e9448cae33bec535199c7e';
const FILES = [
  "./",
  "app.js",
  "apple-touch-icon.png",
  "colour.js",
  "engine/engine.js",
  "engine/lg_beds.js",
  "engine/lg_colours.js",
  "engine/lg_column.js",
  "engine/lg_extra.js",
  "engine/lg_grain.js",
  "engine/lg_patterns.js",
  "engine/lg_relief.js",
  "engine/lg_symbols.js",
  "engine/lg_utils.js",
  "engine/metrics.js",
  "engine/rbase.js",
  "engine/rgfx.js",
  "engine/sv_document.js",
  "engine/sv_export.js",
  "engine/sv_project.js",
  "example.strata.json",
  "help.js",
  "i18n.js",
  "icon-192.png",
  "icon-512.png",
  "icon.png",
  "index.html",
  "lang/ar.js",
  "lang/de.js",
  "lang/es.js",
  "lang/fr.js",
  "lang/hi.js",
  "lang/id.js",
  "lang/it.js",
  "lang/ja.js",
  "lang/nl.js",
  "lang/pl.js",
  "lang/pt.js",
  "lang/ru.js",
  "lang/tr.js",
  "lang/ur.js",
  "manifest.webmanifest",
  "minibed.js",
  "pdftext.js",
  "style.css",
  "web.js",
  "zip.js"
];
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
