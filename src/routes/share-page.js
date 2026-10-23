/**
 * 小鱼来了 — 分享短链页面（前置中间件）
 *
 * 问题背景：
 *   站内用的是 hash 路由（/#/detail/xxx），# 后面的内容不会发到服务器，
 *   所以微信/QQ 抓取链接时永远只能拿到 index.html 里那个通用的
 *   「小鱼来了 · AI 信息发布平台」，转发出去不是项目本身。
 *
 * 解决：
 *   提供 /s/:id（信息）与 /v/:id（短视频/直播）两种路径式短链。
 *   服务端能拿到 id，把 index.html 的 title / description / og:* / itemprop:*
 *   换成该条目的真实标题、摘要、封面图再返回。
 *   真实浏览器打开时，页面里一段脚本会跳回 hash 路由。
 *
 * 注意：
 *   必须用 app.use 注册，且要在 registerStatic 之前。
 *   因为静态资源是 preStack 前置中间件，比普通路由更早执行，
 *   用 app.get 注册会被 SPA 的 index.html 兜底截胡。
 */

import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR } from '../config.js';
import listingsSvc from '../services/listings.js';
import feedsSvc from '../services/feeds.js';
import { baseUrl } from './_util.js';

const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

let cache = { mtime: 0, html: '' };

function readIndex() {
  try {
    const st = fs.statSync(INDEX_FILE);
    if (st.mtimeMs !== cache.mtime) {
      cache = { mtime: st.mtimeMs, html: fs.readFileSync(INDEX_FILE, 'utf8') };
    }
    return cache.html;
  } catch {
    return '';
  }
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function renderMeta({ title, desc, image, url, redirectHash }) {
  const html = readIndex();
  if (!html) return '';

  const fullTitle = `${esc(title)} · 小鱼来了`;
  const d = esc(clip(desc, 200));
  const img = esc(image || '');
  const absUrl = esc(url || '');

  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="小鱼来了" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${d}" />`,
    absUrl ? `<meta property="og:url" content="${absUrl}" />` : '',
    img ? `<meta property="og:image" content="${img}" />` : '',
    `<meta itemprop="name" content="${esc(title)}" />`,
    `<meta itemprop="description" content="${d}" />`,
    img ? `<meta itemprop="image" content="${img}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    img ? `<meta name="twitter:image" content="${img}" />` : '',
    // 注意：这里**不能** location.replace 到 hash 路由。
    // 微信转发时抓取的是 # 前面的地址，一旦跳成 / 就只剩通用标题。
    // 正确做法是让前端在渲染时自己补上 hash，路径保持 /s/xxx 不变。
  ]
    .filter(Boolean)
    .join('\n  ');

  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${fullTitle}</title>`);

  // 把 index.html 里原有的通用 description 换掉，
  // 否则页面里会出现两条，微信/QQ 往往取第一条（还是通用的那句）
  out = out.replace(
    /<meta\s+name="description"[^>]*>/i,
    `<meta name="description" content="${d}" />`,
  );

  // 追加 og / itemprop / twitter 标签
  out = out.replace('</head>', `  ${tags}\n</head>`);
  return out;
}

function sendHtml(res, html, code = 200) {
  // 注意：不能用 res.text()，它遇到 __handled 会直接返回空响应，
  // 而且会把 Content-Type 写成 text/plain。这里直接写字节。
  const body = Buffer.from(String(html || ''), 'utf8');
  res.statusCode = code;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Length', body.length);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.__handled = true;
  res.end(body);
}

export default function registerSharePageRoutes(app) {
  app.use(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return;

    const m = /^\/(s|v)\/([A-Za-z0-9_-]{4,80})\/?$/.exec(req.path || '');
    if (!m) return; // 不是分享短链，交给后续中间件与路由

    const kind = m[1];
    const id = m[2];
    const base = baseUrl(req);

    try {
      if (kind === 's') {
        const listing = listingsSvc.getListing(id);
        if (!listing || listing.status === 'draft') {
          return sendHtml(res, '<!doctype html><meta charset="utf-8"><title>内容不存在</title><p style="font-family:-apple-system,sans-serif;padding:48px;text-align:center;color:#666">内容不存在或已下架</p>', 404);
        }

        const pub = listingsSvc.listingPublic(listing, null) || {};
        const title = pub.title || listing.title || '小鱼来了';
        const desc =
          pub.subtitle ||
          (pub.autoInfo && Array.isArray(pub.autoInfo.highlights) ? pub.autoInfo.highlights.join(' · ') : '') ||
          String(pub.text || '').slice(0, 140) ||
          '项目 · 活动 · 贸易信息，尽在小鱼来了';

        // 微信/QQ 的链接卡片不支持 SVG，只认 jpg/png/webp。
        // 所以这里优先挑位图：先看上传的图片附件，再退回封面，
        // 实在只有 SVG 封面就用平台图标兜底，保证卡片不至于没图。
        const isRaster = (u) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(u || ''));
        const abs = (u) => (String(u).startsWith('http') ? String(u) : `${base}${u}`);

        let image = '';
        if (Array.isArray(pub.fileList)) {
          const photo = pub.fileList.find((f) => f && f.kind === 'image' && f.url && isRaster(f.url));
          if (photo) image = abs(photo.url);
        }
        if (!image && pub.coverUrl && isRaster(pub.coverUrl)) image = abs(pub.coverUrl);
        if (!image) image = `${base}/static/icon-512.png`;

        const html = renderMeta({
          title,
          desc,
          image,
          url: `${base}/s/${id}`,
          redirectHash: `#/detail/${id}`,
        });
        return sendHtml(res, html);
      }

      // kind === 'v'：短视频 / 直播
      const feed = feedsSvc.getFeed(id);
      if (!feed) {
        return sendHtml(res, '<!doctype html><meta charset="utf-8"><title>内容不存在</title><p style="font-family:-apple-system,sans-serif;padding:48px;text-align:center;color:#666">内容不存在或已下架</p>', 404);
      }

      const pub = feedsSvc.feedPublic(feed) || {};
      const title = pub.title || '小鱼来了';
      const isRaster2 = (u) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(u || ''));
      let image = '';
      if (pub.coverUrl && isRaster2(pub.coverUrl)) {
        image = String(pub.coverUrl).startsWith('http') ? pub.coverUrl : `${base}${pub.coverUrl}`;
      }
      if (!image && pub.video && pub.video.url) {
        // 没有位图封面时，用视频文件本身也能让卡片出图
        image = '';
      }
      if (!image) image = `${base}/static/icon-512.png`;

      const html = renderMeta({
        title,
        desc: pub.subtitle || pub.description || '短视频 · 直播，尽在小鱼来了',
        image,
        url: `${base}/v/${id}`,
        redirectHash: `#/live/${id}`,
      });
      return sendHtml(res, html);
    } catch {
      // 出错就交给后续流程，保证不至于整站挂掉
    }
  });

  return app;
}
