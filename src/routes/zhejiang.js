/**
 * 小鱼来了 — 浙江省政策项目申报接口
 *
 * 前台：
 *   GET  /api/zhejiang/meta                 分类/层级/官方入口/统计（公开）
 *   GET  /api/zhejiang/policies             政策列表（公开，category/level/q）
 *   GET  /api/zhejiang/policies/:id         政策详情（公开）
 *   POST /api/zhejiang/match                资格自测（公开，按企业情况打分排序）
 *   POST /api/zhejiang/apply                提交申报意向（需登录）
 *   GET  /api/zhejiang/my-applications      我的申报（需登录）
 *
 * 后台（管理员）：
 *   GET    /api/admin/zhejiang/policies              政策列表（含下架）
 *   GET    /api/admin/zhejiang/policies/:id          政策详情
 *   POST   /api/admin/zhejiang/policies              新建政策
 *   PUT    /api/admin/zhejiang/policies/:id          修改政策
 *   DELETE /api/admin/zhejiang/policies/:id          删除政策
 *   POST   /api/admin/zhejiang/policies/:id/toggle   上架 / 下架
 *   POST   /api/admin/zhejiang/reset                 重置为出厂数据
 *   GET    /api/admin/zhejiang/applications          全部申报
 *   POST   /api/admin/zhejiang/applications/:id/status 更新申报状态
 */

import { httpError } from '../http/app.js';
import {
  data, fail, str, num, mustAuth, clientIp, rateLimit,
} from './_util.js';
import zjSvc, {
  POLICY_CATEGORIES,
  POLICY_LEVELS,
  APPLY_STATUS,
  OFFICIAL_PORTALS,
} from '../services/zhejiang.js';

function mustAdmin(req) {
  const user = mustAuth(req);
  if (!user.isAdmin) throw httpError(403, '需要管理员权限');
  return user;
}

/** 统一把 service 抛出的业务错误转成响应 */
function bizFail(res, err, fallbackMsg) {
  return fail(
    res,
    err?.message || fallbackMsg,
    err?.status || 400,
    err?.code || 'bad_request',
  );
}

export default function registerZhejiangRoutes(app) {
  /* ================================================================ */
  /* 前台                                                              */
  /* ================================================================ */

  app.get('/api/zhejiang/meta', (req, res) => {
    return data(res, {
      categories: POLICY_CATEGORIES,
      levels: POLICY_LEVELS,
      statuses: Object.entries(APPLY_STATUS).map(([id, name]) => ({ id, name })),
      portals: OFFICIAL_PORTALS,
      stats: zjSvc.policyStats(),
    });
  });

  app.get('/api/zhejiang/policies', (req, res) => {
    const items = zjSvc.listPolicies({
      category: String(req.query.category || '').trim(),
      level: String(req.query.level || '').trim(),
      q: String(req.query.q || '').trim().slice(0, 60),
    });
    return data(res, { items, total: items.length });
  });

  app.get('/api/zhejiang/policies/:id', (req, res) => {
    const p = zjSvc.getPolicy(req.params.id);
    if (!p) return fail(res, '政策项目不存在', 404, 'not_found');
    return data(res, { policy: p });
  });

  /** 资格自测：填企业情况，返回按匹配度排序的政策列表 */
  app.post('/api/zhejiang/match', (req, res) => {
    const rl = rateLimit(`zj-match:${clientIp(req)}`, 30, 600_000);
    if (!rl.ok) return fail(res, `请求太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const b = req.body || {};
    const result = zjSvc.matchPolicies({
      companyAge: b.companyAge === undefined || b.companyAge === '' ? NaN : Number(b.companyAge),
      isTalent: Boolean(b.isTalent),
      hasIp: Boolean(b.hasIp),
      industry: str(b.industry, 40),
      city: str(b.city, 40),
    });
    return data(res, result);
  });

  app.post('/api/zhejiang/apply', (req, res) => {
    const user = mustAuth(req);
    const rl = rateLimit(`zj-apply:${user.id || clientIp(req)}`, 10, 600_000);
    if (!rl.ok) {
      return fail(res, `提交太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    }
    const body = req.body || {};
    const policyId = str(body.policyId, 40);
    if (!policyId) return fail(res, '缺少政策项目');

    const contactPhone = String(body.contactPhone || '').replace(/[^\d+]/g, '');
    if (!contactPhone || contactPhone.length < 7) {
      return fail(res, '请填写联系电话', 400, 'phone_required');
    }
    try {
      const record = zjSvc.submitApplication(user, { ...body, policyId });
      return data(res, { application: record }, 201);
    } catch (err) {
      return bizFail(res, err, '提交失败');
    }
  });

  app.get('/api/zhejiang/my-applications', (req, res) => {
    const user = mustAuth(req);
    const items = zjSvc.listMyApplications(user.id);
    return data(res, { items, total: items.length });
  });

  /* ================================================================ */
  /* 后台：政策 CRUD                                                   */
  /* ================================================================ */

  app.get('/api/admin/zhejiang/policies', (req, res) => {
    mustAdmin(req);
    const items = zjSvc.listPoliciesAdmin({
      category: String(req.query.category || '').trim(),
      q: String(req.query.q || '').trim().slice(0, 60),
    });
    return data(res, { items, total: items.length });
  });

  app.get('/api/admin/zhejiang/policies/:id', (req, res) => {
    mustAdmin(req);
    const p = zjSvc.getPolicyAdmin(req.params.id);
    if (!p) return fail(res, '政策不存在', 404, 'not_found');
    return data(res, { policy: p });
  });

  app.post('/api/admin/zhejiang/policies', (req, res) => {
    mustAdmin(req);
    try {
      const p = zjSvc.createPolicy(req.body || {});
      return data(res, { policy: p }, 201);
    } catch (err) {
      return bizFail(res, err, '创建失败');
    }
  });

  app.put('/api/admin/zhejiang/policies/:id', (req, res) => {
    mustAdmin(req);
    try {
      const p = zjSvc.updatePolicy(req.params.id, req.body || {});
      if (!p) return fail(res, '政策不存在', 404, 'not_found');
      return data(res, { policy: p });
    } catch (err) {
      return bizFail(res, err, '修改失败');
    }
  });

  app.delete('/api/admin/zhejiang/policies/:id', (req, res) => {
    mustAdmin(req);
    const ok = zjSvc.deletePolicy(req.params.id);
    if (!ok) return fail(res, '政策不存在', 404, 'not_found');
    return data(res, { deleted: true });
  });

  app.post('/api/admin/zhejiang/policies/:id/toggle', (req, res) => {
    mustAdmin(req);
    const cur = zjSvc.getPolicyAdmin(req.params.id);
    if (!cur) return fail(res, '政策不存在', 404, 'not_found');
    const want = req.body?.enabled === undefined ? cur.enabled === false : Boolean(req.body.enabled);
    try {
      const p = zjSvc.updatePolicy(req.params.id, { enabled: want });
      return data(res, { policy: p });
    } catch (err) {
      return bizFail(res, err, '操作失败');
    }
  });

  app.post('/api/admin/zhejiang/reset', (req, res) => {
    mustAdmin(req);
    const n = zjSvc.resetPolicies();
    return data(res, { restored: n });
  });

  /* ================================================================ */
  /* 后台：申报管理                                                    */
  /* ================================================================ */

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
      return bizFail(res, err, '更新失败');
    }
  });

  return app;
}
