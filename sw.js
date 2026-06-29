/* 屁孩偵測器 Service Worker — 離線快取 */
const CACHE = 'pi-hai-v43';
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

/* ---- 本地提醒通知排程 ---- */
let notifyTimers = [];

self.addEventListener('message', e => {
  const data = e.data || {};
  if (data.type !== 'schedule-notify') return;

  // 清除舊排程
  notifyTimers.forEach(t => clearTimeout(t));
  notifyTimers = [];

  const prefs = data.prefs || {};
  if (!prefs.enabled) return;

  const schedule = (key, title, body) => {
    const time = prefs[key];
    if (!time) return;
    const [h, m] = time.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) return;   // 今天這個時間已過就跳過
    const delay = target - now;
    notifyTimers.push(setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: './icon.svg',
        badge: './icon.svg',
        tag: 'pi-hai-' + key,   // 同一個 tag 會覆蓋舊通知
        renotify: false,
        data: { route: 'flows' },
      });
    }, delay));
  };

  schedule('morning', '🌅 晨間提醒', '記得完成早上的流程，開始美好的一天！');
  schedule('night',   '🌙 睡前提醒', '該開始睡前流程囉，準備好好休息 😴');
});

/* ---- 點通知：開 App 並跳到流程頁 ---- */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const route = e.notification.data?.route || 'flows';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // 已有開著的視窗就 focus + 傳訊跳轉
      const w = list.find(c => 'focus' in c);
      if (w) return w.focus().then(() => w.postMessage({ type: 'goto', route }));
      // 沒有就開新分頁
      return clients.openWindow('./#' + route);
    })
  );
});
