/* 小鱼来了 · Service Worker
   作用：让浏览器认定本站"可安装"（安卓 Chrome 的硬性要求）
   策略：静态资源网络优先 + 缓存兜底；API 一律不缓存，永远走网络。 */

const VERSION = 'xyll-v2';
const STATIC_CACHE = VERSION + '-static';
const PRECACHE = [
  '/?v=2',
  '/static/manifest.webmanifest',
  '/static/icon-192.png',
  '/static/icon-512.png',
  '/static/icon-180.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // API 与上传接口永不缓存
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) return;

  // 导航请求：网络优先，失败回退到缓存的首页
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  // 静态资源：网络优先 + 缓存写入 + 离线兜底
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || Response.error()))
    );
  }
});
