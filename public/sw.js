/* 小鱼来了 · Service Worker
 *
 * 目标：保证 PWA 可安装 + 离线兜底，同时**绝不能**让用户卡在旧版前端。
 *
 * 之前的坑：
 *   app.js 用静态 import 加载全部视图模块，只要有一个模块是旧的，
 *   整个 SPA 就会挂掉或行为异常（表现为「按钮没反应」「还是老界面」），
 *   而且几乎没有任何报错提示。
 *
 * 现在的策略：
 *   1. 版本号不再靠人工改常量，而是**问服务端** /api/version 拿 build
 *      （build = static 目录下 js/css 的最新 mtime）
 *   2. 每次导航时比对 build；一旦变化就清空所有业务缓存，
 *      并通知所有打开的页面刷新一次
 *   3. 静态资源网络优先：在线时永远拿最新的，断网才回退缓存
 *   4. SW 自身用 updateViaCache:'none' 注册，改完立刻生效
 */

const VERSION = 'xyll-v3';
const STATIC_CACHE = VERSION + '-static';
const META_CACHE = 'xyll-meta';
const BUILD_KEY = '/__xyll_build';
const CACHE_PREFIX = 'xyll-';

const NET_TIMEOUT = 4500;

const PRECACHE = [
  '/static/manifest.webmanifest',
  '/static/icon-192.png',
  '/static/icon-512.png',
  '/static/icon-180.png',
];

/* ------------------------------------------------------------------ */
/* 安装 / 激活                                                         */
/* ------------------------------------------------------------------ */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清掉所有旧版本的缓存（保留当前版本 + 元信息）
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== STATIC_CACHE && k !== META_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/* ------------------------------------------------------------------ */
/* 版本检测：build 变了就清缓存并通知页面刷新                            */
/* ------------------------------------------------------------------ */

let checking = null;

async function ensureFresh() {
  if (checking) return checking;
  checking = (async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const build = (json && json.data && json.data.build) || '';
      if (!build) return;

      const meta = await caches.open(META_CACHE);
      const old = await meta.match(BUILD_KEY);
      const oldBuild = old ? await old.text() : '';

      if (!oldBuild) {
        await meta.put(BUILD_KEY, new Response(build));
        return;
      }
      if (oldBuild === build) return;

      // 版本变了：清掉业务缓存，只留下最新 build 标记
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== META_CACHE).map((k) => caches.delete(k)),
      );
      const meta2 = await caches.open(META_CACHE);
      await meta2.put(BUILD_KEY, new Response(build));

      // 通知所有打开的页面刷新一次
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientsList.forEach((c) => {
        try {
          c.postMessage({ type: 'build-changed', build });
        } catch (e) {
          /* ignore */
        }
      });
    } catch (e) {
      /* 离线或接口异常：跳过版本检测，不影响正常浏览 */
    } finally {
      checking = null;
    }
  })();
  return checking;
}

/* ------------------------------------------------------------------ */
/* 请求拦截                                                            */
/* ------------------------------------------------------------------ */

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // API、上传文件、SW 自身：一律不缓存，永远走网络
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/files/') ||
    url.pathname === '/sw.js'
  ) {
    return;
  }

  // 导航请求：网络优先（带超时），失败回退缓存首页
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await withTimeout(fetch(req), NET_TIMEOUT);
          return fresh;
        } catch (e) {
          const cached = await caches.match('/');
          return cached || Response.error();
        }
      })(),
    );
    // 顺便检查版本（不阻塞响应）
    event.waitUntil(ensureFresh());
    return;
  }

  // 静态资源：网络优先 + 写缓存 + 断网兜底
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200 && fresh.type === 'basic') {
            const copy = fresh.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return fresh;
        } catch (e) {
          const cached = await caches.match(req);
          if (cached) return cached;
          return new Response('', { status: 504, statusText: 'offline' });
        }
      })(),
    );
  }
});

/* ------------------------------------------------------------------ */
/* 消息：让等待中的新 SW 立即接管                                        */
/* ------------------------------------------------------------------ */

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'skip-waiting') self.skipWaiting();
});
