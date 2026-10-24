/**
 * 小鱼来了 — 新闻资讯接口
 *
 * 公开：
 *   GET  /api/news            列表（?tag= &q= &page= &size=）
 *   GET  /api/news/meta       标签与统计
 *   GET  /api/news/:id        详情
 * 管理：
 *   POST /api/admin/news/refresh  立即抓取一轮
 *   DELETE /api/admin/news/:id    删除
 */

import newsSvc from '../services/news.js';
import { httpError } from '../http/app.js';
import { data, fail, str, num, authUser, queryOf } from './_util.js';

/** 管理端校验 */
function requireAdmin(req) {
  const u = authUser(req);
  if (!u) throw httpError(401, '请先登录', 'login_required');
  if (!u.isAdmin) throw httpError(403, '需要管理员权限', 'forbidden');
  return u;
}

export default function registerNewsRoutes(app) {
  app.get('/api/news', (req, res) => {
    const q = queryOf(req);
    const r = newsSvc.listNews({
      tag: str(q.tag, 40),
      q: str(q.q, 60),
      page: num(q.page, 1),
      size: num(q.size, 20),
    });
    return data(res, r);
  });

  app.get('/api/news/meta', (req, res) => {
    return data(res, newsSvc.newsStats());
  });

  app.get('/api/news/:id', (req, res) => {
    const item = newsSvc.getNews(req.params.id);
    if (!item) return fail(res, '资讯不存在', 404, 'not_found');
    return data(res, item);
  });

  /* ---------------- 管理端 ---------------- */

  app.post('/api/admin/news/refresh', async (req, res) => {
    requireAdmin(req);
    const r = await newsSvc.refresh({ maxPerSource: num(req.body?.maxPerSource, 6) || 6 });
    return data(res, r);
  });

  app.delete('/api/admin/news/:id', (req, res) => {
    requireAdmin(req);
    const ok = newsSvc.deleteNews(req.params.id);
    if (!ok) return fail(res, '资讯不存在', 404, 'not_found');
    return data(res, { deleted: true, id: req.params.id });
  });

}
