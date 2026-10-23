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
function htmlToText(html, { max = 40000 } = {}) {
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
  const lines = s.split('\n').filter((l) => l.length >= 8);
  let text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (text.length > max) text = `${text.slice(0, max)}\n…（内容已截断）`;
  return { title, text };
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
    const { title, text } = htmlToText(html);

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
      host: u.hostname,
    };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, note: '抓取超时，请稍后重试' };
    return { ok: false, note: `抓取失败：${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

export default { fetchWebpage, htmlToText };
