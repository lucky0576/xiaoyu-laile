/**
 * 小鱼来了 — 联系我 接口
 *
 * 用户：
 *   POST /api/feedback                 提交提问
 *   GET  /api/feedback/mine            我的提问与回复
 *   POST /api/feedback/:id/messages    追加补充说明
 *   GET  /api/feedback/unread          未读回复数
 *
 * 管理端：
 *   GET  /api/admin/feedback           列表（?status=open）
 *   GET  /api/admin/feedback/stats     统计
 *   POST /api/admin/feedback/:id/reply 回复
 *   POST /api/admin/feedback/:id/close 关闭
 *   DELETE /api/admin/feedback/:id     删除
 */

import feedbackSvc from '../services/feedback.js';
import { httpError } from '../http/app.js';
import { data, fail, str, mustAuth, authUser, queryOf } from './_util.js';

function requireAdmin(req) {
  const u = authUser(req);
  if (!u) throw httpError(401, '请先登录', 'login_required');
  if (!u.isAdmin) throw httpError(403, '需要管理员权限', 'forbidden');
  return u;
}

export default function registerFeedbackRoutes(app) {
  /* ---------------- 用户端 ---------------- */

  app.post('/api/feedback', (req, res) => {
    const user = mustAuth(req);
    const item = feedbackSvc.submit(user, {
      text: str(req.body?.text, 2000),
      contact: str(req.body?.contact, 60),
      page: str(req.body?.page, 120),
    });
    return data(res, { item }, 201);
  });

  app.get('/api/feedback/mine', (req, res) => {
    const user = mustAuth(req);
    const items = feedbackSvc.listMine(user.id);
    return data(res, { items, total: items.length });
  });

  app.post('/api/feedback/:id/messages', (req, res) => {
    const user = mustAuth(req);
    const item = feedbackSvc.appendMyMessage(user, req.params.id, str(req.body?.text, 2000));
    return data(res, { item });
  });

  app.get('/api/feedback/unread', (req, res) => {
    const user = authUser(req);
    if (!user) return data(res, { count: 0 });
    return data(res, { count: feedbackSvc.myUnreadCount(user.id) });
  });

  /* ---------------- 管理端 ---------------- */

  app.get('/api/admin/feedback', (req, res) => {
    requireAdmin(req);
    const q = queryOf(req);
    const items = feedbackSvc.adminList({ status: str(q.status, 20) });
    return data(res, { items, total: items.length });
  });

  app.get('/api/admin/feedback/stats', (req, res) => {
    requireAdmin(req);
    return data(res, feedbackSvc.adminStats());
  });

  app.post('/api/admin/feedback/:id/reply', (req, res) => {
    const admin = requireAdmin(req);
    const item = feedbackSvc.adminReply(admin, req.params.id, str(req.body?.text, 2000));
    return data(res, { item });
  });

  app.post('/api/admin/feedback/:id/close', (req, res) => {
    requireAdmin(req);
    const item = feedbackSvc.adminClose(req.params.id);
    return data(res, { item });
  });

  app.delete('/api/admin/feedback/:id', (req, res) => {
    requireAdmin(req);
    return data(res, feedbackSvc.adminRemove(req.params.id));
  });

  void fail;
}
