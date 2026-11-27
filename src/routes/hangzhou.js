/**
 * 小鱼来了 — 杭州「AI+X」场景供需对接接口
 *
 * 公开：
 *   GET  /api/hangzhou/meta                 统计 + 分类 + 官方联系方式
 *   GET  /api/hangzhou/needs                场景需求清单（10 条）
 *   GET  /api/hangzhou/needs/:id            需求详情
 *   GET  /api/hangzhou/caps                 场景能力清单（20 家）
 *   GET  /api/hangzhou/caps/:id             能力详情
 *   GET  /api/hangzhou/needs/:id/match      给需求推荐能力方
 *   GET  /api/hangzhou/caps/:id/match       给能力方推荐可对接需求
 *
 * 需登录：
 *   POST /api/hangzhou/intent               提交对接意向
 *   GET  /api/hangzhou/my-intents           我的对接
 *
 * 管理端：
 *   GET  /api/admin/hangzhou/intents        全部对接意向
 *   POST /api/admin/hangzhou/intents/:id/status  更新状态
 */

import { httpError } from '../http/app.js';
import {
  data, fail, str, num, mustAuth, clientIp, rateLimit,
} from './_util.js';
import hzSvc, {
  HZ_CATEGORIES,
  HZ_CONTACT,
  INTENT_STATUS,
} from '../services/hangzhou.js';

function mustAdmin(req) {
  const user = mustAuth(req);
  if (!user.isAdmin) throw httpError(403, '需要管理员权限');
  return user;
}

function bizFail(res, err, fallback) {
  return fail(res, err?.message || fallback, err?.status || 400, err?.code || 'bad_request');
}

export default function registerHangzhouRoutes(app) {
  /* ---------------- 元信息 ---------------- */
  app.get('/api/hangzhou/meta', (req, res) => {
    return data(res, {
      categories: HZ_CATEGORIES,
      contact: HZ_CONTACT,
      statuses: Object.entries(INTENT_STATUS).map(([id, name]) => ({ id, name })),
      stats: hzSvc.sceneStats(),
    });
  });

  /* ---------------- 需求 ---------------- */
  app.get('/api/hangzhou/needs', (req, res) => {
    const items = hzSvc.listNeeds({
      q: String(req.query.q || '').trim().slice(0, 60),
      type: String(req.query.type || '').trim(),
    });
    return data(res, { items, total: items.length });
  });

  app.get('/api/hangzhou/needs/:id', (req, res) => {
    const n = hzSvc.getNeed(req.params.id);
    if (!n) return fail(res, '需求不存在', 404, 'not_found');
    return data(res, { need: n });
  });

  app.get('/api/hangzhou/needs/:id/match', (req, res) => {
    const r = hzSvc.matchCapsForNeed(req.params.id, Math.min(20, num(req.query.limit, 6)));
    if (!r) return fail(res, '需求不存在', 404, 'not_found');
    return data(res, r);
  });

  /* ---------------- 能力 ---------------- */
  app.get('/api/hangzhou/caps', (req, res) => {
    const items = hzSvc.listCaps({
      q: String(req.query.q || '').trim().slice(0, 60),
      category: String(req.query.category || '').trim(),
    });
    return data(res, { items, total: items.length });
  });

  app.get('/api/hangzhou/caps/:id', (req, res) => {
    const c = hzSvc.getCap(req.params.id);
    if (!c) return fail(res, '能力方不存在', 404, 'not_found');
    return data(res, { cap: c });
  });

  app.get('/api/hangzhou/caps/:id/match', (req, res) => {
    const r = hzSvc.matchNeedsForCap(req.params.id, Math.min(20, num(req.query.limit, 6)));
    if (!r) return fail(res, '能力方不存在', 404, 'not_found');
    return data(res, r);
  });

  /* ---------------- 对接意向 ---------------- */
  app.post('/api/hangzhou/intent', (req, res) => {
    const user = mustAuth(req);
    const rl = rateLimit(`hz-intent:${user.id || clientIp(req)}`, 10, 600_000);
    if (!rl.ok) return fail(res, `提交太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const body = req.body || {};
    if (!body.targetId) return fail(res, '缺少对接对象');
    const phone = String(body.contactPhone || '').replace(/[^\d+]/g, '');
    if (!phone || phone.length < 7) return fail(res, '请填写联系电话', 400, 'phone_required');

    try {
      const rec = hzSvc.submitIntent(user, body);
      return data(res, { intent: rec }, 201);
    } catch (err) {
      return bizFail(res, err, '提交失败');
    }
  });

  app.get('/api/hangzhou/my-intents', (req, res) => {
    const user = mustAuth(req);
    const items = hzSvc.listMyIntents(user.id);
    return data(res, { items, total: items.length });
  });

  /* ---------------- 管理端 ---------------- */
  app.get('/api/admin/hangzhou/intents', (req, res) => {
    mustAdmin(req);
    const items = hzSvc.listAllIntents({
      status: str(req.query.status, 20),
      limit: num(req.query.limit, 100),
    });
    return data(res, { items, total: items.length });
  });

  app.post('/api/admin/hangzhou/intents/:id/status', (req, res) => {
    mustAdmin(req);
    try {
      const rec = hzSvc.setIntentStatus(req.params.id, str(req.body?.status, 20));
      if (!rec) return fail(res, '记录不存在', 404, 'not_found');
      return data(res, { intent: rec });
    } catch (err) {
      return bizFail(res, err, '更新失败');
    }
  });

  return app;
}
