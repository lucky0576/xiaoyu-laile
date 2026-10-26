/**
 * 小鱼来了 — 从网址导入短视频
 *
 * 用来支撑「网上获取」这条内容来源：
 *   管理员粘一个视频地址，服务端把文件抓回来，存成本地文件再建 feed。
 *
 * 为什么不做全自动爬取：
 *   抖音、B 站、YouTube 这类平台有反爬与版权限制，直接批量搬运风险高。
 *   这里只做「管理员明确指定一个地址 → 抓这一个」，
 *   责任边界清楚，也让运营自己把关内容来源。
 *
 * 支持：
 *   1. 直链视频：Content-Type 是 video/*，或路径以 .mp4/.mov/.webm 结尾
 *   2. 网页地址：抓 HTML，从 og:video / <video src> / <source src> 里找视频
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { httpError } from '../http/app.js';
import { registerStoredFile } from './files.js';

const MAX_BYTES = 300 * 1024 * 1024; // 300MB
const FETCH_TIMEOUT = 180000; // 3 分钟

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv|3gp|flv|mpeg|mpg|ts)$/i;
const MIME_EXT = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
  'video/3gpp': '.3gp',
};

function absUrl(u, base) {
  try {
    return new URL(u, base).toString();
  } catch {
    return '';
  }
}

/** 从网页 HTML 里找视频地址 */
function findVideoInHtml(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::url)?["']/i,
    /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
    /<video[^>]+src=["']([^"']+)["']/i,
    /<source[^>]+src=["']([^"']+\.(?:mp4|mov|webm|m4v)[^"']*)["']/i,
    /["'](https?:\/\/[^"']+\.(?:mp4|mov|webm|m4v))["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) {
      const u = absUrl(m[1], pageUrl);
      if (u && /^https?:/i.test(u)) return u;
    }
  }
  return '';
}

/**
 * 从网址抓一个视频，返回登记好的文件记录。
 * @param {string} rawUrl
 * @param {{ ownerId?: string }} opts
 */
export async function importVideoFromUrl(rawUrl, opts = {}) {
  const url = String(rawUrl || '').trim();
  if (!/^https?:\/\/[^\s<>"']+$/i.test(url)) {
    throw httpError(400, '请填写以 http:// 或 https:// 开头的视频地址');
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT);

  let res;
  try {
    res = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        // 有些站点会拒绝空 UA
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'video/*,text/html,*/*',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') throw httpError(504, '抓取超时，请稍后重试');
    throw httpError(502, '抓取失败：' + (err.message || '网络错误'));
  }

  try {
    if (!res.ok) throw httpError(502, `对方站点返回 ${res.status}，抓取失败`);

    const ctype = String(res.headers.get('content-type') || '').toLowerCase();
    const finalUrl = res.url || url;

    let videoUrl = '';
    if (ctype.startsWith('video/')) {
      videoUrl = finalUrl;
    } else if (ctype.includes('text/html')) {
      const html = await res.text();
      videoUrl = findVideoInHtml(html, finalUrl);
      if (!videoUrl) {
        throw httpError(422, '这个网页里没找到可下载的视频地址，请改用视频直链（.mp4 等）');
      }
    } else if (VIDEO_EXT.test(finalUrl)) {
      videoUrl = finalUrl;
    } else {
      throw httpError(415, '这个地址不是视频，也不是含视频的网页');
    }

    // 直链视频：流式下载到临时文件
    const tmp = path.join(
      os.tmpdir(),
      `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`,
    );

    let dl;
    if (videoUrl !== finalUrl || ctype.startsWith('video/')) {
      // 已经在第一次请求里拿到了流（只有直链时才复用）
      dl = res;
    } else {
      dl = await fetch(videoUrl, {
        signal: ac.signal,
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'video/*,*/*' },
      });
      if (!dl.ok) throw httpError(502, `下载视频失败（${dl.status}）`);
    }

    const len = Number(dl.headers.get('content-length') || 0);
    if (len > MAX_BYTES) {
      throw httpError(413, `视频太大（${Math.round(len / 1048576)}MB），上限 300MB`);
    }

    const buf = Buffer.from(await dl.arrayBuffer());
    if (!buf.length) throw httpError(502, '下载到的文件是空的');
    if (buf.length > MAX_BYTES) throw httpError(413, '视频超过 300MB 上限');
    fs.writeFileSync(tmp, buf);

    // 扩展名：从 Content-Type 或 URL 推
    const dlType = String(dl.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    let ext = MIME_EXT[dlType] || '';
    if (!ext) {
      const m = VIDEO_EXT.exec(videoUrl);
      ext = m ? m[0].toLowerCase() : '.mp4';
    }
    const finalTmp = tmp.replace(/\.mp4$/, ext);
    if (finalTmp !== tmp) fs.renameSync(tmp, finalTmp);

    const baseName = (() => {
      try {
        const p = new URL(videoUrl).pathname.split('/').pop() || 'video';
        return decodeURIComponent(p).replace(VIDEO_EXT, '') || 'video';
      } catch {
        return 'video';
      }
    })();

    const rec = await registerStoredFile({
      srcPath: finalTmp,
      name: `${baseName}${ext}`,
      mime: dlType.startsWith('video/') ? dlType : `video/${ext.replace('.', '')}`,
      opts: {
        ownerId: opts.ownerId || '',
        listingId: '',
        role: 'feed',
        extract: false,
      },
    });

    return { file: rec, sourceUrl: videoUrl };
  } finally {
    clearTimeout(timer);
  }
}

export default { importVideoFromUrl };
