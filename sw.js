// Stashimo Service Worker
// Bump CACHE_VERSION on every deploy to GitHub Pages so users pick up new files.
const CACHE_VERSION = 'stashimo-v0.8.0';
const CACHE_NAME = CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first for EVERYTHING (HTML, JS, CSS, manifest). This guarantees the
// HTML, script, and stylesheet always land together as a matched set whenever
// the device is online, avoiding stale-file mismatches (e.g. new HTML paired
// with an old cached script expecting different form fields). Cache is only
// used as an offline fallback.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || (isHTML ? caches.match('./index.html') : undefined)))
  );
});