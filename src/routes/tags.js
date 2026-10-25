/**
 * 小鱼来了 — 用户标签与会员等级
 */

import db from '../store/db.js';
import { data, fail, str, mustAuth, authUser, rateLimit, clientIp } from './_util.js';
import { httpError } from '../http/app.js';
import { TAG_CATEGORIES, normalizeTags, emptyTags, TAG_BY_KEY } from '../data/tags.js';
import { LEVELS, LEVEL_BY_KEY, PAID_LEVELS, publicLevel, effectiveLevelKey } from '../data/levels.js';
import notifySvc from '../services/notify.js';
import paymentSvc from '../services/payment.js';

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
      demoPay: false,
      payment: paymentSvc.publicPaymentConfig(),
    });
  });

  /**
   * 开通 / 升级会员
   * 当前没有接支付网关，走「演示支付」：直接生效 30 天。
   * 接入微信支付/支付宝后，这里改成「创建订单 → 支付回调 → 生效」。
   */
  app.post('/api/users/me/level', (req, res) => {
    const user = mustAuth(req);
    /* 真实支付走下面的 /order 流程；这个直接生效的接口只给管理员用 */
    if (!user.isAdmin) {
      return fail(res, '请通过扫码或银行转账付款，然后提交订单等待确认', 403, 'need_payment');
    }
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

  /**
   * 提交付款订单（用户已扫码/转账后点「我已付款」）
   * 不会立刻生效，等管理员确认到账再激活。
   */
  app.post('/api/users/me/level/order', (req, res) => {
    const user = mustAuth(req);
    const key = str(req.body?.level, 20);
    const payMode = str(req.body?.payMode, 20) || 'wechat';
    const payerNote = str(req.body?.payerNote, 120);

    const target = LEVEL_BY_KEY[key];
    if (!target) return fail(res, '会员等级不存在');
    if (target.price === 0) return fail(res, '免费用户无需开通');
    if (!['wechat', 'alipay', 'bank'].includes(payMode)) return fail(res, '请选择付款方式');

    const rl = rateLimit(`lvorder:${user.id}`, 6, 60_000);
    if (!rl.ok) return fail(res, `操作过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    // 已有待确认的同等级订单就复用，避免重复堆积
    const pending = levelOrders().findOne(
      (o) => o.userId === user.id && o.status === 'pending' && o.level === target.key,
    );
    if (pending) {
      return data(res, { order: pending, reused: true }, 200);
    }

    const now = new Date();
    const order = levelOrders().insert({
      id: db.newId('lo'),
      userId: user.id,
      userName: user.nickname || '',
      userPhone: user.phone || '',
      level: target.key,
      levelName: target.name,
      price: target.price,
      months: 1,
      status: 'pending',
      payMode,
      payerNote,
      expiresAt: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    // 通知所有管理员
    try {
      const admins = users().find((u) => u && u.isAdmin && !u.disabled && !u.banned);
      const modeName = { wechat: '微信', alipay: '支付宝', bank: '银行卡' }[payMode] || payMode;
      notifySvc.notifyMany(
        admins.map((a) => a.id),
        {
          type: 'system',
          title: `💰 新的会员付款待确认`,
          body: `${user.nickname || '用户'} 开通${target.name} ¥${target.price}（${modeName}）`,
          link: '#/admin-level-orders',
        },
      );
    } catch {
      /* ignore */
    }

    return data(res, { order }, 201);
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

  /* ---------------- 管理端：会员订单 ---------------- */

  const requireAdmin = (req) => {
    const u = authUser(req);
    if (!u) throw httpError(401, '请先登录', 'login_required');
    if (!u.isAdmin) throw httpError(403, '需要管理员权限', 'forbidden');
    return u;
  };

  app.get('/api/admin/level-orders', (req, res) => {
    requireAdmin(req);
    const status = str(req.query?.status, 20);
    let items = levelOrders().all();
    if (status) items = items.filter((o) => o.status === status);
    items = items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const stats = {
      pending: levelOrders().find((o) => o.status === 'pending').length,
      paid: levelOrders().find((o) => o.status === 'paid').length,
      rejected: levelOrders().find((o) => o.status === 'rejected').length,
    };
    return data(res, { items, stats });
  });

  /** 确认到账 → 激活会员 */
  app.post('/api/admin/level-orders/:id/confirm', (req, res) => {
    const admin = requireAdmin(req);
    const order = levelOrders().get(req.params.id);
    if (!order) return fail(res, '订单不存在', 404, 'not_found');
    if (order.status === 'paid') return fail(res, '该订单已确认过');

    const target = LEVEL_BY_KEY[order.level];
    if (!target) return fail(res, '会员等级不存在');

    const user = users().get(order.userId);
    if (!user) return fail(res, '下单用户不存在', 404, 'not_found');

    const now = new Date();
    const base = user.levelExpiresAt && new Date(user.levelExpiresAt) > now
      ? new Date(user.levelExpiresAt)
      : now;
    const expires = new Date(base.getTime() + (order.months || 1) * 30 * 86400000);

    users().update(user.id, {
      level: target.key,
      levelExpiresAt: expires.toISOString(),
      levelStartedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const updated = levelOrders().update(order.id, {
      status: 'paid',
      payMode: order.payMode || 'wechat',
      confirmedBy: admin.id,
      confirmedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    });

    notifySvc.notify({
      userId: user.id,
      type: 'system',
      title: `会员开通成功：${target.name} ${target.icon}`,
      body: `已确认到账，有效期至 ${expires.toISOString().slice(0, 10)}，已解锁 ${target.perks.length} 项权益`,
      link: '#/membership',
    });

    return data(res, { order: updated });
  });

  /** 驳回订单 */
  app.post('/api/admin/level-orders/:id/reject', (req, res) => {
    requireAdmin(req);
    const order = levelOrders().get(req.params.id);
    if (!order) return fail(res, '订单不存在', 404, 'not_found');
    const reason = str(req.body?.reason, 200);
    const updated = levelOrders().update(order.id, {
      status: 'rejected',
      rejectReason: reason,
      updatedAt: new Date().toISOString(),
    });
    try {
      notifySvc.notify({
        userId: order.userId,
        type: 'system',
        title: '付款订单未通过',
        body: reason || '未收到对应款项，请核对后重新提交或联系管理员',
        link: '#/membership',
      });
    } catch {
      /* ignore */
    }
    return data(res, { order: updated });
  });

  /* ---------------- 管理端：收款配置 ---------------- */

  app.get('/api/admin/payment', (req, res) => {
    requireAdmin(req);
    return data(res, paymentSvc.getPaymentConfig());
  });

  app.put('/api/admin/payment', (req, res) => {
    requireAdmin(req);
    const next = paymentSvc.setPaymentConfig(req.body || {});
    return data(res, next);
  });

  return app;
}
