/* App shell cache only; external live OpenStreetMap/terrain requests must stay network-based. */
const CACHE = 'buraimi-roads-osm-3d-v2';
const FILES = ['./index.html', './assets/styles.css', './assets/app.js', './assets/road-icon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('buraimi-roads-touch-') || key.startsWith('buraimi-roads-osm-3d-')) && key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin || event.request.mode === 'navigate') return;
  event.respondWith(fetch(event.request).then(resp => {
    if(resp.ok && FILES.some(p=>new URL(p,self.registration.scope).href===event.request.url)){
      const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
    }
    return resp;
  }).catch(()=>caches.match(event.request)));
});
