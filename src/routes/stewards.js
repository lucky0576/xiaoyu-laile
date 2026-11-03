/**
 * 主理人相关接口
 *
 *   GET  /api/stewards/meta                三类定义 + 人数 + 年费
 *   GET  /api/stewards                     已开通（审核通过 + 年费有效）的主理人
 *   GET  /api/stewards/mine                我的申请（含审核/缴费状态）
 *   POST /api/stewards/apply               提交申请（含年费金额）
 *   POST /api/stewards/:id/paid-claim      我点了「我已付款」，等管理员核对
 *
 *   GET  /api/admin/stewards               后台列表（按审核状态 / 缴费状态筛）
 *   POST /api/admin/stewards/:id/review    审核通过 / 驳回
 *   POST /api/admin/stewards/:id/pay       确认到账 / 撤销
 */

import stewardSvc from '../services/stewards.js';
import { data, fail, str, authUser, mustAuth, queryOf } from './_util.js';

export default function registerStewardRoutes(app) {
  app.get('/api/stewards/meta', (req, res) => {
    const all = stewardSvc.listStewards({ activeOnly: false });
    const counts = {};
    for (const k of stewardSvc.STEWARD_KINDS) counts[k.id] = all.filter((s) => s.kind === k.id).length;
    return data(res, {
      kinds: stewardSvc.STEWARD_KINDS,
      fees: stewardSvc.FEES,
      counts,
      total: all.length,
    });
  });

  app.get('/api/stewards', (req, res) => {
    const q = queryOf(req);
    const rows = stewardSvc.listStewards({
      kind: str(q.kind, 20),
      city: str(q.city, 40),
    });
    return data(res, { items: rows, total: rows.length });
  });

  app.get('/api/stewards/mine', (req, res) => {
    const user = mustAuth(req);
    return data(res, { items: stewardSvc.myApplication(user.id) });
  });

  app.post('/api/stewards/apply', (req, res) => {
    const user = mustAuth(req);
    try {
      const rec = stewardSvc.apply(user, req.body || {});
      return data(res, { application: rec, fee: rec.fee }, 201);
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, 'apply_failed');
      throw err;
    }
  });

  /** 用户声明已付款（转账/扫码后），等管理员核对到账 */
  app.post('/api/stewards/:id/paid-claim', (req, res) => {
    const user = mustAuth(req);
    try {
      const rec = stewardSvc.claimPaid(user, req.params.id);
      return data(res, { application: rec });
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, 'claim_failed');
      throw err;
    }
  });

  /* ---------------- 管理端 ---------------- */

  app.get('/api/admin/stewards', (req, res) => {
    const user = authUser(req);
    if (!user || !user.isAdmin) return fail(res, '需要管理员权限', 403, 'forbidden');
    const q = queryOf(req);
    const status = str(q.status, 20) || 'pending';
    const items = stewardSvc.adminList({ status, kind: str(q.kind, 20) });
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

  app.post('/api/admin/stewards/:id/pay', (req, res) => {
    const user = authUser(req);
    if (!user || !user.isAdmin) return fail(res, '需要管理员权限', 403, 'forbidden');
    const b = req.body || {};
    const rec = stewardSvc.confirmPayment(user, req.params.id, {
      status: str(b.status, 20) || 'paid',
      months: Number(b.months) || 12,
    });
    return data(res, { application: rec });
  });
}
