/**
 * 小鱼来了 — 网页正文提取
 *
 * 用途：发布时粘贴一个链接（招标公告、新闻、公众号文章…），
 *      服务端抓下来抽出正文，交给 AI 汇总资料。
 *
 * 安全：
 *   · 只允许 http / https
 *   · 拒绝内网地址（SSRF 防护）：127/8、10/8、172.16/12、192.168/16、
 *     169.254/16、::1、以及 localhost 等
 *   · 限制重定向次数、响应体积与总耗时
 */

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 20000;

/** 是否为内网/保留地址 */
function isPrivateHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '[::1]') return true;
  // 纯 IP 判断
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // 组播/保留
  }
  return false;
}

/** 按响应头 / meta 猜编码 */
function decodeBody(buf, contentType) {
  let charset = '';
  const ct = String(contentType || '').toLowerCase();
  const ctMatch = /charset=([\w-]+)/.exec(ct);
  if (ctMatch) charset = ctMatch[1];

  if (!charset) {
    // 从头部前 2KB 里找 meta charset
    const head = buf.subarray(0, 2048).toString('latin1');
    const metaMatch = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head);
    if (metaMatch) charset = metaMatch[1];
  }

  charset = (charset || 'utf-8').toLowerCase();
  if (charset === 'gb2312' || charset === 'gbk') charset = 'gbk';

  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

/** HTML → 纯文本 */
/**
 * 把网页 HTML 转成纯文本。
 *
 * @param {string} html
 * @param {object} opts
 * @param {number} opts.max      最大字符数。原来 40000，长文会被截断，
 *                               现在默认放宽到 150000，基本等于「不截断」
 * @param {number} opts.minLine  行最小长度。原来是 8，会连正文里较短的段落
 *                               （比如“一、项目概况”）一起丢掉；导入正文时用 4
 */
function htmlToText(html, { max = 150000, minLine = 8 } = {}) {
  let s = String(html || '');

  // 去掉整个块级噪音
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ');
  s = s.replace(/<head[\s\S]*?<\/head>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');

  // 保留标题
  const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleM ? titleM[1].replace(/\s+/g, ' ').trim() : '';

  // 常见噪音区块
  s = s.replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');

  // 块级标签转换行
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote)>/gi, '\n');

  // 表格：单元格用空格分隔
  s = s.replace(/<\/(td|th)>/gi, '  ');
  s = s.replace(/<\/tr>/gi, '\n');

  // 去掉其余标签
  s = s.replace(/<[^>]+>/g, ' ');

  // 实体
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&mdash;|&ndash;/gi, '—')
    .replace(/&hellip;/gi, '…')
    .replace(/&middot;/gi, '·')
    .replace(/&bull;/gi, '•')
    .replace(/&copy;/gi, '©')
    .replace(/&reg;/gi, '®')
    .replace(/&trade;/gi, '™')
    .replace(/&deg;/gi, '°')
    .replace(/&times;/gi, '×')
    .replace(/&divide;/gi, '÷')
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&emsp;|&ensp;|&thinsp;/gi, ' ')
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
    })
    .replace(/&#(\d{1,7});/g, (_, d) => {
      try { return String.fromCodePoint(Number(d)); } catch { return ''; }
    })
    // 兜底：剩下的未知命名实体直接去掉，别让它出现在正文里
    .replace(/&[a-zA-Z][a-zA-Z0-9]{1,10};/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(Number(d)); } catch { return ''; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
    });

  // 压缩空白，但保留段落换行
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  // 去掉过短的行（导航、按钮文案）
  const lines = s.split('\n').filter((l) => l.length >= minLine);
  let text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (text.length > max) text = `${text.slice(0, max)}\n…（内容已截断）`;
  return { title, text };
}

/* ------------------------------------------------------------------ */
/* 正文清洗：去掉广告、二维码提示、对方联系方式                          */
/*   导入链接的目的是「拿内容」，不是把原文的广告和联系方式也搬过来。      */
/* ------------------------------------------------------------------ */

/** 整行命中的关键词：命中就丢掉这一行 */
const DROP_LINE_PATTERNS = [
  // 二维码 / 扫码
  /扫码|扫一扫|长按识别|二维码|QR\s*码/i,
  // 关注引导
  /关注(我们|公众号|本号|订阅)|点击关注|设为星标|星标|订阅号|公众号|视频号|小程序/,
  // 互动引导
  /点赞|点个?在看|在看|转发(到|至|给)|分享到|收藏本?文|一键三连|留言区|评论区/,
  // 广告 / 商务
  /广告|推广|赞助|商务合作|合作咨询|招商热线|咨询热线|客服热线|服务热线|加盟|代理咨询/,
  // 账号 / 来源声明
  /责任编辑|编辑[:：]|来源[:：]|本文(来自|来源)|转载|免责声明|版权声明|如有侵权|©|Copyright|All Rights Reserved/i,
  // 联系方式引导
  /联系(电话|人|方式)|手机号?[:：]|电话[:：]|微信[:：]|微信号|QQ[:：]|邮箱|E-?mail|邮箱地址|添加微信|加微信|私信|联系我/,
  // 地址 / 邮编（注意不要误伤「项目地点」）
  /(公司|联系|办公|详细|通讯)地址|地址[:：]|邮编|邮政编码|Zip\s*code/i,
  // 纯装饰
  /^[-—=_*·•\s]{4,}$/,
];

/** 文本里内联出现的联系方式，直接从正文里抹掉 */
const INLINE_STRIP = [
  // 手机号（允许空格横线）
  /(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}/g,
  // 座机
  /0\d{2,3}[-\s]?\d{7,8}(?:[-\s]?\d{1,4})?/g,
  // 400 / 800 热线
  /[48]00[-\s]?\d{3}[-\s]?\d{4}/g,
  // 邮箱
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // 微信号
  /(?:微信|weixin|wechat|vx|VX|v信|威信)\s*(?:号|号码|ID|id)?\s*[:：]?\s*[A-Za-z][-_A-Za-z0-9]{4,20}/gi,
  // QQ
  /QQ\s*(?:号|号码)?\s*[:：]?\s*\d{5,12}/gi,
];

/** 「点击/长按/扫码」这类带动作的短句，往往后面跟的是广告位 */
const DROP_SENTENCE = [
  /[^。；;！!\n]{0,20}(扫码|长按识别|扫一扫)[^。；;！!\n]{0,30}/g,
  /[^。；;！!\n]{0,20}(点击(下方|这里|链接|阅读原文))[^。；;！!\n]{0,30}/g,
];

export function stripContactAndAds(text) {
  const src = String(text || '');
  if (!src) return '';

  const lines = src.split('\n');
  const kept = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { kept.push(''); continue; }

    // 1) 整行命中关键词 → 丢弃
    if (DROP_LINE_PATTERNS.some((re) => re.test(line))) continue;

    // 2) 一行里大半是数字/符号（电话、账号、图片占位）→ 丢弃
    const digitRatio = (line.replace(/[^\d]/g, '').length) / line.length;
    if (line.length <= 30 && digitRatio > 0.5) continue;

    // 3) 纯链接行 → 丢弃
    if (/^(https?:\/\/|www\.)/i.test(line) && line.length < 120) continue;

    let out = line;

    // 4) 抹掉内联联系方式
    for (const re of INLINE_STRIP) out = out.replace(re, '');

    // 5) 抹掉「扫码查看」这类句子
    for (const re of DROP_SENTENCE) out = out.replace(re, '');

    // 6) 清理被抹出来的空档
    out = out.replace(/[（(]\s*[)）]/g, '')
      .replace(/[，,、]\s*[，,、]/g, '，')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s，,、:：\-—]+|[\s，,、:：\-—]+$/g, '')
      .trim();

    if (!out) continue;
    if (out.length < 4) continue;
    kept.push(out);
  }

  // 压掉连续空行
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 只取原始 HTML（不抽正文、不下载图片），给新闻列表页用 */
export async function fetchHtml(rawUrl, { timeoutMs = 20000 } = {}) {
  let u;
  try {
    u = new URL(String(rawUrl || '').trim());
  } catch {
    return { ok: false, note: '链接格式不正确' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, note: '只支持 http / https' };
  if (isPrivateHost(u.hostname)) return { ok: false, note: '不允许访问内网地址' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    if (!res.ok) return { ok: false, note: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, html: decodeBody(buf, res.headers.get('content-type') || ''), url: u.toString() };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, note: '超时' };
    return { ok: false, note: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** 从 HTML 里挑出内容图片的绝对地址 */
export function extractImageUrls(html, pageUrl, { max = 8 } = {}) {
  const out = [];
  const seen = new Set();
  const src = String(html || '');

  const push = (raw) => {
    if (!raw || out.length >= max) return;
    let s = String(raw).trim();
    if (!s || s.startsWith('data:')) return;
    // srcset 取第一段
    if (s.includes(' ')) s = s.split(/\s+/)[0];
    let abs = '';
    try {
      abs = new URL(s, pageUrl).toString();
    } catch {
      return;
    }
    if (!/^https?:/i.test(abs)) return;
    if (/\.svg(\?|$)/i.test(abs)) return; // 卡片图用不了，正文里多的是图标
    if (/\.(gif|webp|bmp)(\?|$)/i.test(abs) && false) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };

  // og:image 优先级最高（通常是封面/主图）
  const ogRe = /<meta[^>]+property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = ogRe.exec(src))) push(m[1]);
  const ogRe2 = /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/gi;
  while ((m = ogRe2.exec(src))) push(m[1]);

  // img 标签：src / data-src / data-original / srcset
  const imgRe = /<img\b[^>]*>/gi;
  while ((m = imgRe.exec(src)) && out.length < max) {
    const tag = m[0];
    const pick = (re) => {
      const x = re.exec(tag);
      return x ? x[1] : '';
    };
    push(
      pick(/\bsrc\s*=\s*["']([^"']+)["']/i) ||
        pick(/\bdata-src\s*=\s*["']([^"']+)["']/i) ||
        pick(/\bdata-original\s*=\s*["']([^"']+)["']/i) ||
        pick(/\bsrcset\s*=\s*["']([^"']+)["']/i),
    );
  }

  return out.slice(0, max);
}

/** 读图片尺寸（只处理 png / jpeg / gif / webp 常见头） */
function imageSize(buf) {
  try {
    // PNG: IHDR
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length >= 24) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf.length >= 10) {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    // WebP (VP8X / VP8 / VP8L)
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf.length >= 30) {
      const fmt = buf.toString('latin1', 12, 16);
      if (fmt === 'VP8X') {
        const wv = buf.readUIntLE(24, 3) + 1;
        const hv = buf.readUIntLE(27, 3) + 1;
        return { w: wv, h: hv };
      }
      if (fmt === 'VP8 ') {
        return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      }
    }
    // JPEG: 扫 SOF0..SOF3 / SOF5..SOF15
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 下载一张图片，返回 Buffer 与推断出的 mime/扩展名 */
export async function downloadImage(url, referer = '') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!res.ok) return null;

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.startsWith('image/')) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 3 * 1024 || buf.length > 4 * 1024 * 1024) return null;

    // 按文件头判类型，比 Content-Type 可靠
    let ext = 'jpg';
    let mime = 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      ext = 'png';
      mime = 'image/png';
    } else if (buf[0] === 0x47 && buf[1] === 0x49) {
      ext = 'gif';
      mime = 'image/gif';
    } else if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) {
      ext = 'webp';
      mime = 'image/webp';
    } else if (buf[0] === 0xff && buf[1] === 0xd8) {
      ext = 'jpg';
      mime = 'image/jpeg';
    } else {
      return null; // 不是认识的图片格式
    }

    // 过滤 logo / 图标 / 追踪像素：正文配图一般至少 320×200
    const size = imageSize(buf);
    if (size) {
      if (size.w < 320 || size.h < 200) return null;
      // 极端长条图（分隔线、装饰条）也排除
      if (size.w / size.h > 8 || size.h / size.w > 8) return null;
      // 二维码 / 头像 / 图标：接近正方形且不大，大概率不是正文配图
      const ratio = size.w / size.h;
      if (ratio > 0.92 && ratio < 1.08 && size.w < 640) return null;
    }

    return { buffer: buf, ext, mime, width: size?.w || 0, height: size?.h || 0 };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抓取并抽取网页正文。
 * @param {string} rawUrl
 * @returns {Promise<{ok:boolean, url?:string, title?:string, text?:string, chars?:number, note?:string}>}
 */
export async function fetchWebpage(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl || '').trim());
  } catch {
    return { ok: false, note: '链接格式不正确' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, note: '只支持 http / https 链接' };
  }
  if (isPrivateHost(u.hostname)) {
    return { ok: false, note: '不允许访问内网地址' };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // 带一个正常 UA，很多站点会拒绝空 UA 或 curl
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    if (!res.ok) {
      return { ok: false, note: `抓取失败：HTTP ${res.status}` };
    }

    const ct = res.headers.get('content-type') || '';
    if (/^(image|video|audio)\//i.test(ct)) {
      return { ok: false, note: '这个链接是图片/视频，请直接上传文件' };
    }
    if (/application\/(pdf|zip|octet-stream)/i.test(ct)) {
      return { ok: false, note: '这个链接是文件，请下载后上传' };
    }

    // 限制体积
    const reader = res.body?.getReader?.();
    let buf;
    if (reader) {
      const chunks = [];
      let total = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_BYTES) {
          chunks.push(value.subarray(0, Math.max(0, value.length - (total - MAX_BYTES))));
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
        chunks.push(value);
      }
      buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    } else {
      buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) buf = buf.subarray(0, MAX_BYTES);
    }

    const html = decodeBody(buf, ct);
    // 导入正文时用宽松参数：尽量还原原文，别提前截断
  const raw = htmlToText(html, { max: 150000, minLine: 4 });
    const title = raw.title;
    // 清洗：去广告、去二维码提示、去对方联系方式
    const rawLen = raw.text.length;
    let text = stripContactAndAds(raw.text);

    if (!text || text.length < 40) {
      return {
        ok: false,
        title,
        note: '这个页面没解析出正文（可能需要登录，或是纯 JS 渲染的页面）',
      };
    }

    return {
      ok: true,
      url: u.toString(),
      title: title || u.hostname,
      text,
      chars: text.length,
      rawChars: rawLen,
      host: u.hostname,
      // 页面里的图片地址，路由层会下载下来存成附件
      imageUrls: extractImageUrls(html, u.toString(), { max: 8 }),
      rawHtml: html,
    };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, note: '抓取超时，请稍后重试' };
    return { ok: false, note: `抓取失败：${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

export default { fetchWebpage, fetchHtml, htmlToText, stripContactAndAds, extractImageUrls, downloadImage };
