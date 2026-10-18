const CACHE = 'neon-breach-__BUILD_HASH__';
const CORE = ['/', '/manifest.webmanifest', '/icon.svg', '/game.js', '/checkpoint.js', '/mobile-controls.js', '/vehicle-radio.js', '/combat-rules.js', '/accounts.js', '/community.js', '/results.js', '/results.html', '/data.js', '/audio.js', '/scene3d.js', '/render-utils.js', '/combat-presentation.js', '/combat-interface.js', '/vehicle-presentation.js', '/city-life.js', '/vehicle-handling.js', '/vendor/three.module.min.js', '/vendor/three.core.min.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...CORE,'/weapon-cards.js','/weapon-cards.css','/weapon-preview.js'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  let url;
  try { url = new URL(event.request.url); } catch { return; }
  // Only cache same-origin assets — never third-party GETs.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/'))));
});
