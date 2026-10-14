const CACHE = 'buraimi-roads-touch-v1';
const FILES = ['./', './index.html', './assets/styles.css', './assets/app.js', './assets/map-reference.jpg', './assets/road-icon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('buraimi-roads-touch-') && k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => { if(event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return; event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))); });
