/* 營隊報名管理系統　© 2026 Daniel GUO. All rights reserved. */
/* 桌面應用程式（PWA）用的 service worker。
 * 只處理同網站的畫面檔案：先抓最新版，連不上才用快取，所以更新程式後不會卡在舊版。
 * 呼叫 Apps Script 的 API 不經過這裡，資料一律即時讀取。 */
var CACHE = 'camp-admin-v5';
var SHELL = [
  './', 'index.html', 'register.html', 'menu.html', 'students.html', 'newproject.html', 'admin.html', 'logs.html', 'checkin.html',
  'assets/style.css', 'assets/app.js', 'assets/export.js', 'assets/config.js', 'assets/settings-form.js', 'assets/loading.js', 'assets/jsqr.min.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || new Response('目前離線，請連上網路後再試。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    });
  }));
});
