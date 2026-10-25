/**
 * 小鱼来了 — 服务商路由
 */
import { data, fail, str, num, bool, authUser, mustAuth } from './_util.js';
import { httpError } from '../http/app.js';
import providerSvc from '../services/provider.js';

function requireAdmin(req) {
  const user = mustAuth(req);
  if (!user.isAdmin) throw httpError(403, '需要管理员权限');
  return user;
}

export default function registerProviderRoutes(app) {
  /* ---------------- 名录（公开） ---------------- */

  app.get('/api/providers', (req, res) => {
    const viewer = authUser(req);
    void viewer;
    return data(res, providerSvc.list({
      q: str(req.query.q, 60),
      serviceType: str(req.query.serviceType, 30),
      kind: str(req.query.kind, 30),
      region: str(req.query.region, 20),
      page: num(req.query.page, 1),
      pageSize: num(req.query.pageSize, 20),
    }));
  });

  app.get('/api/providers/meta', (req, res) => {
    return data(res, providerSvc.stats());
  });

  app.get('/api/providers/me', (req, res) => {
    const user = authUser(req);
    if (!user) return data(res, { application: null });
    const p = providerSvc.myApplication(user.id);
    return data(res, { application: p ? providerSvc.providerPublic(p, user) : null });
  });

  app.get('/api/providers/:id', (req, res) => {
    const viewer = authUser(req);
    const p = providerSvc.getById(req.params.id, viewer);
    if (!p) throw httpError(404, '服务商不存在或未通过审核');
    return data(res, { provider: p });
  });

  /* ---------------- 申请 ---------------- */

  app.post('/api/providers/apply', (req, res) => {
    const user = mustAuth(req);
    const saved = providerSvc.apply(user, req.body || {});
    return data(res, { application: providerSvc.providerPublic(saved, user) }, 201);
  });

  /* ---------------- 管理端 ---------------- */

  app.get('/api/admin/providers', (req, res) => {
    requireAdmin(req);
    return data(res, providerSvc.adminList({
      status: str(req.query.status, 20),
      q: str(req.query.q, 60),
      page: num(req.query.page, 1),
      pageSize: num(req.query.pageSize, 30),
    }));
  });

  app.post('/api/admin/providers/:id/review', (req, res) => {
    const admin = requireAdmin(req);
    const updated = providerSvc.review(req.params.id, admin, {
      approve: req.body?.approve === undefined ? true : bool(req.body.approve),
      note: str(req.body?.note, 300),
    });
    return data(res, { provider: providerSvc.providerPublic(updated, admin) });
  });
}
