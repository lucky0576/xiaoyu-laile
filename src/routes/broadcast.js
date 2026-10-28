/**
 * 小鱼来了 — 多选项目 / 信息批量群发
 *
 * 场景：把几条项目整理成一段话，发到微信群或朋友圈。
 *
 * 微信没有开放「给任意群发消息」的接口，所以这里给两条路：
 *   1. 生成文案 → 前端一键复制 → 用户自己粘贴到微信（任何微信都能用）
 *   2. 企业微信群机器人 webhook → 服务端直接推到群里（真·自动，但只限企业微信内部群）
 *      在 .env 里配 WECOM_WEBHOOK 即可启用，不配就只有复制这一条路。
 */

import { data, fail, baseUrl, mustAuth, clientIp, rateLimit } from './_util.js';
import { requireAdmin } from '../services/auth.js';
import db from '../store/db.js';
import { listingPublic } from '../services/listings.js';

/** 取一条信息的「城市 · 行业 · 类型」小标签 */
function tagsOf(l) {
  const bits = [];
  const city = (l.cities || [])[0]?.name;
  if (city) bits.push(city);
  const ind = (l.industries || [])[0]?.name;
  if (ind) bits.push(ind);
  const sub = (l.subs || [])[0]?.name;
  if (sub && sub !== ind) bits.push(sub);
  /*
   * typeName 有时没解析出来，会退化成英文分类 id（project / trade / event），
   * 那种就别放进文案里了，看着像 bug。
   */
  const type = String(l.typeName || '').trim();
  if (type && !/^[a-z_]+$/.test(type)) bits.push(type);

  // 去重后再拼，避免「光伏 · 光伏」这种
  return [...new Set(bits.filter(Boolean))].join(' · ');
}

/** 短链：/s/<id> 是路径式短链，点开就是详情页，比 /#/detail/xxx 干净 */
function shortLink(req, id) {
  return `${baseUrl(req)}/s/${id}`;
}

/**
 * 把选中的几条信息拼成一段群发文案。
 *
 * @param {object[]} items   已过滤的 listing 数组
 * @param {object} opts
 * @param {boolean} opts.includeSummary  是否带副标题
 * @param {boolean} opts.includeMeta     是否带城市·行业
 * @param {boolean} opts.includeContact  是否带联系方式（默认不带）
 * @param {string}  opts.footer          结尾语，空则用默认
 */
function buildText(req, items, opts = {}) {
  const includeSummary = opts.includeSummary !== false;
  const includeMeta = opts.includeMeta !== false;
  const includeContact = Boolean(opts.includeContact);
  const footer = String(opts.footer || '').trim();

  const lines = [];
  lines.push(`【小鱼来了 · ${items.length} 条精选信息】`);
  lines.push('');

  items.forEach((l, i) => {
    const no = i + 1;
    lines.push(`${no}. ${String(l.title || '').trim()}`);
    if (includeSummary) {
      const sub = String(l.subtitle || l.summary || '').trim();
      if (sub) lines.push(`   ${sub}`);
    }
    if (includeMeta) {
      const tags = tagsOf(l);
      if (tags) lines.push(`   ${tags}`);
    }
    if (includeContact) {
      const c = l.contact || {};
      const bits = [];
      if (c.name) bits.push(c.name);
      if (c.phone) bits.push(c.phone);
      if (c.wechat) bits.push(`微信 ${c.wechat}`);
      if (bits.length) lines.push(`   📞 ${bits.join('  ')}`);
    }
    lines.push(`   ${shortLink(req, l.id)}`);
    if (i < items.length - 1) lines.push('');
  });

  lines.push('');
  lines.push('——');
  lines.push(
    footer ||
      '以上信息来自「小鱼来了」\nAI 驱动的产业互联网 B2B 电商平台\n让「非标、低频、高客单」的产业交易，也能像电商一样在线完成',
  );
  lines.push(baseUrl(req));

  return lines.join('\n');
}

export default function registerBroadcastRoutes(app) {
  /**
   * 生成群发文案：POST /api/broadcast/text  { ids: [] }
   * 登录即可用（只能拿公开字段，联系方式单独控制）
   */
  app.post('/api/broadcast/text', (req, res) => {
    const user = mustAuth(req);
    const rl = rateLimit(`broadcast:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) return fail(res, `操作太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 20) : [];
    if (!ids.length) return fail(res, '请先选择要群发的信息', 400, 'no_ids');
    if (ids.length > 20) return fail(res, '一次最多选 20 条', 400, 'too_many');

    const col = db.collection('listings');
    const items = [];
    const missing = [];
    for (const id of ids) {
      const l = col.get(String(id));
      if (!l || l.status !== 'published') {
        missing.push(String(id));
        continue;
      }
      items.push(listingPublic(l, user));
    }
    if (!items.length) return fail(res, '选中的信息都不存在或已下架', 404, 'not_found');

    const text = buildText(req, items, {
      includeSummary: req.body?.includeSummary !== false,
      includeMeta: req.body?.includeMeta !== false,
      includeContact: Boolean(req.body?.includeContact),
      footer: req.body?.footer,
    });

    return data(res, {
      text,
      count: items.length,
      missing,
      items: items.map((l) => ({ id: l.id, title: l.title, url: shortLink(req, l.id) })),
    });
  });

  /** 企业微信群机器人是否已配置（前端据此决定要不要显示「推送到群」按钮） */
  app.get('/api/broadcast/wecom', (req, res) => {
    mustAuth(req);
    return data(res, { configured: Boolean(String(process.env.WECOM_WEBHOOK || '').trim()) });
  });

  /**
   * 推送到企业微信群：POST /api/broadcast/wecom  { text } 或 { ids: [] }
   * 只有管理员能推，避免被当成广告机。
   */
  app.post('/api/broadcast/wecom', async (req, res) => {
    requireAdmin(req);
    const hook = String(process.env.WECOM_WEBHOOK || '').trim();
    if (!hook) {
      return fail(res, '还没配置企业微信群机器人 webhook，请在服务器 .env 里加 WECOM_WEBHOOK', 400, 'no_webhook');
    }

    let text = String(req.body?.text || '').trim();
    if (!text && Array.isArray(req.body?.ids)) {
      const col = db.collection('listings');
      const items = req.body.ids
        .map((id) => col.get(String(id)))
        .filter((l) => l && l.status === 'published')
        .map((l) => listingPublic(l, req.user));
      if (!items.length) return fail(res, '选中的信息都不存在或已下架', 404, 'not_found');
      text = buildText(req, items, {});
    }
    if (!text) return fail(res, '没有可推送的内容', 400, 'empty');

    // 企业微信单条文本上限约 2048 字节，超了会被拒
    if (Buffer.byteLength(text, 'utf8') > 2048) {
      return fail(res, '内容超过 2048 字节，企业微信会拒收，请减少条数', 400, 'too_long');
    }

    try {
      const resp = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
      });
      const j = await resp.json().catch(() => ({}));
      if (j.errcode && j.errcode !== 0) {
        return fail(res, `企业微信返回错误：${j.errmsg || j.errcode}`, 400, 'wecom_error');
      }
      return data(res, { sent: true });
    } catch (err) {
      return fail(res, `推送失败：${err.message}`, 502, 'push_failed');
    }
  });
}
