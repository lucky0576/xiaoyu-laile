/**
 * 小鱼来了 — 公众号文章自动同步
 *
 * 原理：
 *   微信公众号有「发布能力」接口 /cgi-bin/freepublish/batchget，
 *   用公众号自己的 AppID + AppSecret 换 access_token，
 *   就能拉出该号**已发布**的全部图文（标题、正文 HTML、原文链接、封面）。
 *
 * 前提（必须由公众号管理员做两件事）：
 *   1. 在「公众号后台 → 设置与开发 → 基本配置」拿到 AppID / AppSecret；
 *   2. 把本站服务器 IP 加进「IP 白名单」，否则微信会拒绝调用。
 *
 * 边界：
 *   · 只能同步**自己的**公众号。别人的号没有官方接口，任何「自动抓别人公众号」
 *     的方案都是爬搜狗或第三方付费服务，不稳定也不合规。
 *   · 只读取已发布内容，不碰用户消息、不碰后台数据。
 */

import { config } from '../config.js';
import webpage from '../lib/webpage.js';

const { htmlToText } = webpage;

const API = 'https://api.weixin.qq.com';

let tokenCache = { token: '', expiresAt: 0 };

export function mpConfigured() {
  return Boolean(config.wechat?.appId && config.wechat?.appSecret);
}

/** 稳定版 access_token（比 /cgi-bin/token 更适合多实例） */
export async function getAccessToken(force = false) {
  if (!mpConfigured()) throw new Error('还没配置公众号 AppID / AppSecret');
  if (!force && tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;

  const res = await fetch(`${API}/cgi-bin/stable_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid: config.wechat.appId,
      secret: config.wechat.appSecret,
      force_refresh: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await res.json();
  if (!d.access_token) {
    throw new Error(`拿不到 access_token：${d.errmsg || '未知错误'}（检查 AppSecret 与 IP 白名单）`);
  }
  tokenCache = { token: d.access_token, expiresAt: Date.now() + (d.expires_in || 7200) * 1000 };
  return tokenCache.token;
}

/** 拉取已发布图文列表 */
export async function listPublished({ offset = 0, count = 10 } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API}/cgi-bin/freepublish/batchget?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offset, count: Math.min(20, Math.max(1, count)), no_content: 0 }),
    signal: AbortSignal.timeout(20000),
  });
  const d = await res.json();
  if (d.errcode) {
    throw new Error(`拉取失败：${d.errcode} ${d.errmsg || ''}`);
  }

  const out = [];
  for (const item of d.item || []) {
    for (const art of item.content?.news_item || []) {
      out.push({
        title: String(art.title || '').slice(0, 120),
        html: String(art.content || ''),
        url: String(art.url || ''),
        cover: String(art.thumb_url || ''),
        author: String(art.author || ''),
        digest: String(art.digest || ''),
        publishedAt: new Date((item.update_time || 0) * 1000).toISOString(),
      });
    }
  }
  return { total: d.total_count || 0, items: out };
}

/** 标题像不像招标公告 */
export function looksLikeBidding(title) {
  return /(招标|中标|采购公告|磋商|询价|资格预审|成交公告|变更公告|单一来源|比选)/.test(String(title || ''));
}

/**
 * 把一条公众号文章转成平台内容。
 * @returns {{ kind: 'bidding'|'news', title, text, link, cover, summary }}
 */
export function toContent(art) {
  const r = htmlToText(art.html, { max: 150000, minLine: 4 });
  return {
    kind: looksLikeBidding(art.title) ? 'bidding' : 'news',
    title: String(art.title || r.title || '').slice(0, 118),
    text: String(r.text || '').slice(0, 120000),
    link: art.url,
    cover: art.cover || '',
    summary: String(art.digest || r.text || '').replace(/\s+/g, ' ').slice(0, 120),
  };
}

export default { mpConfigured, getAccessToken, listPublished, looksLikeBidding, toContent };
