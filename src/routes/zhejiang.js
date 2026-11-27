/**
 * 小鱼来了 — 浙江省政策项目申报接口
 *
 *   GET  /api/zhejiang/meta                 分类/层级/统计（公开）
 *   GET  /api/zhejiang/policies             政策列表（公开，支持 category/level/q）
 *   GET  /api/zhejiang/policies/:id         政策详情（公开，含全文与材料清单）
 *   POST /api/zhejiang/apply                提交申报意向（需登录）
 *   GET  /api/zhejiang/my-applications      我的申报（需登录）
 *
 * 管理端：
 *   GET  /api/admin/zhejiang/applications          全部申报（管理员）
 *   POST /api/admin/zhejiang/applications/:id/status 更新状态（管理员）
 *
 * 数据在代码里（src/data/zhejiang-policies.js），只有"申报"是用户产生的数据。
 */

import { httpError } from '../http/app.js';
import {
  data, fail, str, num, mustAuth, clientIp, rateLimit,
} from './_util.js';
import zjSvc, { POLICY_CATEGORIES, POLICY_LEVELS, APPLY_STATUS } from '../services/zhejiang.js';

function mustAdmin(req) {
  const user = mustAuth(req);
  if (!user.isAdmin) throw httpError(403, '需要管理员权限');
  return user;
}

export default function registerZhejiangRoutes(app) {
  /* ---------------- 元信息 ---------------- */
  app.get('/api/zhejiang/meta', (req, res) => {
    return data(res, {
      categories: POLICY_CATEGORIES,
      levels: POLICY_LEVELS,
      statuses: Object.entries(APPLY_STATUS).map(([id, name]) => ({ id, name })),
      stats: zjSvc.policyStats(),
    });
  });

  /* ---------------- 政策列表 ---------------- */
  app.get('/api/zhejiang/policies', (req, res) => {
    const items = zjSvc.listPolicies({
      category: String(req.query.category || '').trim(),
      level: String(req.query.level || '').trim(),
      q: String(req.query.q || '').trim().slice(0, 60),
    });
    return data(res, { items, total: items.length });
  });

  /* ---------------- 政策详情 ---------------- */
  app.get('/api/zhejiang/policies/:id', (req, res) => {
    const p = zjSvc.getPolicy(req.params.id);
    if (!p) return fail(res, '政策项目不存在', 404, 'not_found');
    return data(res, { policy: p });
  });

  /* ---------------- 提交申报 ---------------- */
  app.post('/api/zhejiang/apply', (req, res) => {
    const user = mustAuth(req);

    // 防刷：同一个人 10 分钟内最多提交 10 次
    const rl = rateLimit(`zj-apply:${user.id || clientIp(req)}`, 10, 600_000);
    if (!rl.ok) {
      return fail(res, `提交太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    }

    const body = req.body || {};
    const policyId = str(body.policyId, 40);
    if (!policyId) return fail(res, '缺少政策项目');

    // 联系方式必填，否则运营方没法跟进
    const contactPhone = String(body.contactPhone || '').replace(/[^\d+]/g, '');
    if (!contactPhone || contactPhone.length < 7) {
      return fail(res, '请填写联系电话', 400, 'phone_required');
    }

    try {
      const record = zjSvc.submitApplication(user, { ...body, policyId });
      return data(res, { application: record }, 201);
    } catch (err) {
      return fail(res, err.message || '提交失败', err.status || 400, err.code || 'apply_failed');
    }
  });

  /* ---------------- 我的申报 ---------------- */
  app.get('/api/zhejiang/my-applications', (req, res) => {
    const user = mustAuth(req);
    const items = zjSvc.listMyApplications(user.id);
    return data(res, { items, total: items.length });
  });

  /* ---------------- 管理端 ---------------- */
  app.get('/api/admin/zhejiang/applications', (req, res) => {
    mustAdmin(req);
    const items = zjSvc.listAllApplications({
      status: String(req.query.status || '').trim(),
      limit: num(req.query.limit, 100),
    });
    return data(res, { items, total: items.length });
  });

  app.post('/api/admin/zhejiang/applications/:id/status', (req, res) => {
    mustAdmin(req);
    const status = str(req.body?.status, 20);
    try {
      const rec = zjSvc.setApplicationStatus(req.params.id, status);
      if (!rec) return fail(res, '申报记录不存在', 404, 'not_found');
      return data(res, { application: rec });
    } catch (err) {
      return fail(res, err.message || '更新失败', err.status || 400, err.code || 'update_failed');
    }
  });

  return app;
}
