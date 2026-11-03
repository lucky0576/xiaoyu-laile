/**
 * 主理人相关接口
 *
 *   GET  /api/stewards                 已通过的主理人列表（按类型/城市筛）
 *   GET  /api/stewards/meta            三类主理人定义 + 数量
 *   GET  /api/stewards/mine            我的申请（含审核状态）
 *   POST /api/stewards/apply           提交申请
 *   GET  /api/admin/stewards           后台列表
 *   POST /api/admin/stewards/:id/review 审核
 */

import stewardSvc from '../services/stewards.js';
import { data, fail, str, authUser, mustAuth, queryOf } from './_util.js';
import { httpError } from '../http/app.js';

export default function registerStewardRoutes(app) {
  app.get('/api/stewards/meta', (req, res) => {
    const all = stewardSvc.listStewards({});
    const counts = {};
    for (const k of stewardSvc.STEWARD_KINDS) counts[k.id] = all.filter((s) => s.kind === k.id).length;
    return data(res, { kinds: stewardSvc.STEWARD_KINDS, counts, total: all.length });
  });

  app.get('/api/stewards', (req, res) => {
    const q = queryOf(req);
    const rows = stewardSvc.listStewards({
      kind: str(q.kind, 20),
      city: str(q.city, 40),
    });
    return data(res, {
      items: rows.map((s) => ({
        id: s.id,
        kind: s.kind,
        kindName: s.kindName,
        name: s.name,
        city: s.city,
        province: s.province,
        industry: s.industry,
        channel: s.channel,
        intro: s.intro,
        approvedAt: s.approvedAt || s.createdAt,
        // 联系方式不公开：列表只显示「有联系方式」，具体走留言对接
        hasContact: Boolean(s.phone || s.wechat),
      })),
      total: rows.length,
    });
  });

  app.get('/api/stewards/mine', (req, res) => {
    const user = mustAuth(req);
    return data(res, { items: stewardSvc.myApplication(user.id) });
  });

  app.post('/api/stewards/apply', (req, res) => {
    const user = mustAuth(req);
    try {
      const rec = stewardSvc.apply(user, req.body || {});
      return data(res, { application: rec }, 201);
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, 'apply_failed');
      throw err;
    }
  });

  /* ---------------- 管理端 ---------------- */

  app.get('/api/admin/stewards', (req, res) => {
    const user = authUser(req);
    if (!user || !user.isAdmin) return fail(res, '需要管理员权限', 403, 'forbidden');
    const q = queryOf(req);
    const status = str(q.status, 20) || 'pending';
    const items = stewardSvc
      .listStewards({ status, kind: str(q.kind, 20) })
      .slice(0, 200);
    return data(res, { items, total: items.length, status });
  });

  app.post('/api/admin/stewards/:id/review', (req, res) => {
    const user = authUser(req);
    if (!user || !user.isAdmin) return fail(res, '需要管理员权限', 403, 'forbidden');
    const b = req.body || {};
    const rec = stewardSvc.review(user, req.params.id, {
      status: str(b.status, 20) || 'approved',
      reason: str(b.reason, 200),
    });
    return data(res, { application: rec });
  });
}
