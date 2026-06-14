/* 屁孩偵測器 Service Worker — 離線快取 */
const CACHE = 'pi-hai-v8';
const ASSETS = [
  './', './index.html', './styles.css', './data.js', './weather.js', './app.js',
  './manifest.json', './icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// network-first：有網路就拿最新版並更新快取，離線時才用快取。
// 這樣每次部署新版本，使用者一開 App 就會拿到更新。
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
