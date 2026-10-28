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
import { data, fail, str, num, authUser, queryOf, mustAuth, clientIp, rateLimit } from './_util.js';

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

  /**
   * 发布新闻资讯：POST /api/news
   *
   * 登录即可发。字段：title / summary / text / coverUrl / sourceName / tags
   * 抓取来的新闻和管理员发的走同一张表，前端不用区分。
   */
  app.post('/api/news', (req, res) => {
    const user = mustAuth(req);

    const title = String(req.body?.title || '').trim();
    const text = String(req.body?.text || '').trim();
    if (title.length < 4) return fail(res, '标题至少 4 个字', 400, 'short_title');
    if (title.length > 200) return fail(res, '标题太长了（上限 200 字）', 400, 'long_title');
    if (text.length < 20) return fail(res, '正文至少 20 个字', 400, 'short_text');

    // 每 IP 10 分钟最多 5 条，避免刷屏
    const rl = rateLimit(`news-create:${clientIp(req)}`, 5, 600_000);
    if (!rl.ok) return fail(res, `发布太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const row = newsSvc.createNews({
      user,
      title,
      summary: req.body?.summary,
      text,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      coverUrl: req.body?.coverUrl,
      sourceName: req.body?.sourceName,
      link: req.body?.link,
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
    });
    return data(res, { id: row.id, title: row.title });
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
