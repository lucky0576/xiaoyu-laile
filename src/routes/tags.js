/**
 * 小鱼来了 — 用户标签与会员等级
 */

import db from '../store/db.js';
import { data, fail, str, mustAuth, authUser, rateLimit, clientIp } from './_util.js';
import { TAG_CATEGORIES, normalizeTags, emptyTags, TAG_BY_KEY } from '../data/tags.js';
import { LEVELS, LEVEL_BY_KEY, PAID_LEVELS, publicLevel, effectiveLevelKey } from '../data/levels.js';
import notifySvc from '../services/notify.js';

const users = () => db.collection('users');

/** 会员开通记录 */
const levelOrders = () => db.collection('levelOrders');

function pushUnique(arr, v) {
  if (!Array.isArray(arr)) return [v];
  return arr.includes(v) ? arr : [...arr, v];
}

export default function registerTagRoutes(app) {
  /* ---------------------------------------------------------------- */
  /* 标签                                                              */
  /* ---------------------------------------------------------------- */

  /** 标签库 + 会员等级（前端渲染用） */
  app.get('/api/tags/meta', (req, res) => {
    return data(res, {
      categories: TAG_CATEGORIES,
      levels: LEVELS,
    });
  });

  /** 我的标签 */
  app.get('/api/users/me/tags', (req, res) => {
    const user = mustAuth(req);
    return data(res, {
      tags: { ...emptyTags(), ...(user.tags || {}) },
      categories: TAG_CATEGORIES,
    });
  });

  /** 保存我的标签 */
  app.put('/api/users/me/tags', (req, res) => {
    const user = mustAuth(req);
    const b = req.body || {};

    // 支持两种提交：{ tags: {...} } 或直接 {...}
    const incoming = b.tags && typeof b.tags === 'object' ? b.tags : b;
    const tags = normalizeTags(incoming);

    const updated = users().update(user.id, { tags, updatedAt: new Date().toISOString() });
    return data(res, {
      tags: updated.tags,
      filled: TAG_CATEGORIES.filter((c) => (updated.tags?.[c.key] || []).length > 0).length,
    });
  });

  /** 某人公开的标签（用于用户主页猜你喜欢 / 对接前了解） */
  app.get('/api/users/:id/tags', (req, res) => {
    const u = users().get(req.params.id);
    if (!u) return fail(res, '用户不存在', 404, 'not_found');
    return data(res, {
      userId: u.id,
      nickname: u.nickname,
      tags: { ...emptyTags(), ...(u.tags || {}) },
      level: publicLevel(u),
    });
  });

  /* ---------------------------------------------------------------- */
  /* 会员等级                                                          */
  /* ---------------------------------------------------------------- */

  app.get('/api/levels', (req, res) => {
    const viewer = authUser(req);
    return data(res, {
      levels: LEVELS,
      current: viewer ? publicLevel(viewer) : publicLevel(null),
      demoPay: true,
    });
  });

  /**
   * 开通 / 升级会员
   * 当前没有接支付网关，走「演示支付」：直接生效 30 天。
   * 接入微信支付/支付宝后，这里改成「创建订单 → 支付回调 → 生效」。
   */
  app.post('/api/users/me/level', (req, res) => {
    const user = mustAuth(req);
    const key = str(req.body?.level, 20);

    const target = LEVEL_BY_KEY[key];
    if (!target) return fail(res, '会员等级不存在');
    if (target.price === 0) return fail(res, '免费用户无需开通');

    const rl = rateLimit(`level:${user.id}`, 10, 60_000);
    if (!rl.ok) return fail(res, `操作过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const now = new Date();
    const base = user.levelExpiresAt && new Date(user.levelExpiresAt) > now
      ? new Date(user.levelExpiresAt)
      : now;
    const expires = new Date(base.getTime() + 30 * 86400000);

    const updated = users().update(user.id, {
      level: target.key,
      levelExpiresAt: expires.toISOString(),
      levelStartedAt: user.level === target.key && user.levelStartedAt ? user.levelStartedAt : now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const order = levelOrders().insert({
      id: db.newId('lo'),
      userId: user.id,
      level: target.key,
      levelName: target.name,
      price: target.price,
      status: 'paid',
      payMode: 'demo',
      months: 1,
      expiresAt: expires.toISOString(),
      createdAt: now.toISOString(),
    });

    notifySvc.notify({
      userId: user.id,
      type: 'system',
      title: `会员开通成功：${target.name} ${target.icon}`,
      body: `有效期至 ${expires.toISOString().slice(0, 10)}，已解锁 ${target.perks.length} 项权益`,
      link: '#/membership',
    });

    return data(res, {
      user: publicLevel(updated),
      order: { id: order.id, level: order.level, price: order.price, expiresAt: order.expiresAt },
      demoPay: true,
    }, 201);
  });

  /** 取消会员（立即降回免费） */
  app.post('/api/users/me/level/cancel', (req, res) => {
    const user = mustAuth(req);
    if (effectiveLevelKey(user) === 'free') return fail(res, '当前已是免费用户');
    const updated = users().update(user.id, {
      level: 'free',
      levelExpiresAt: '',
      updatedAt: new Date().toISOString(),
    });
    return data(res, { user: publicLevel(updated) });
  });

  /** 我的会员开通记录 */
  app.get('/api/users/me/level/orders', (req, res) => {
    const user = mustAuth(req);
    const items = levelOrders()
      .find((o) => o.userId === user.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((o) => ({
        id: o.id,
        level: o.level,
        levelName: o.levelName,
        price: o.price,
        months: o.months,
        status: o.status,
        expiresAt: o.expiresAt,
        createdAt: o.createdAt,
      }));
    return data(res, { items, current: publicLevel(user) });
  });

  return app;
}
