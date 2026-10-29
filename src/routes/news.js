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
import ai from '../services/ai.js';
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
    if (text.length > 200000) return fail(res, '正文太长了（上限 20 万字）', 400, 'long_text');

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

  /**
   * 新闻 AI 搜索：一句话找资讯。
   *
   * 和关键词搜索的区别：用户想的是「江浙沪的储能政策」「最近的光伏补贴」，
   * 这种描述跟标题字面未必对得上，关键词搜不到。先关键词兜底，再 AI 精排。
   */
  app.post('/api/news/ai-search', async (req, res) => {
    const rl = rateLimit(`nsearch:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) return fail(res, `搜索太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const query = String(req.body?.query || '').trim().slice(0, 120);
    if (!query) return fail(res, '说说想找什么资讯', 400, 'no_query');

    /*
     * 全量扫描：listNews 的 size 上限是 50，不能靠它拿全量，
     * 所以直接翻页取完（资讯量级几百条，翻几页就够）。
     */
    let pool = [];
    for (let page = 1; page <= 20; page++) {
      const r = newsSvc.listNews({ page, size: 50 }) || {};
      const got = r.items || [];
      pool = pool.concat(got);
      if (!r.hasMore || !got.length) break;
    }
    pool = pool.filter((x) => x && !x.deletedAt);
    if (!pool.length) return data(res, { ids: [], items: [], mode: 'none', scanned: 0 });

    const tokens = query.split(/[\s,，、;；/]+/).filter(Boolean);
    const hayOf = (x) =>
      [x.title, x.summary, x.text, x.sourceName, ...(x.tags || [])].filter(Boolean).join(' ');

    const scored = pool.map((x) => {
      const hay = hayOf(x);
      let score = 0;
      if (hay.includes(query)) score += 30;
      for (const t of tokens) if (t && hay.includes(t)) score += 10;
      if (x.title && x.title.includes(query)) score += 25;
      return { x, score };
    });

    let candidates = scored.filter((v) => v.score > 0).sort((a, b) => b.score - a.score).map((v) => v.x);
    const keywordIds = candidates.slice(0, 30).map((x) => x.id);

    // 关键词一条没命中：给 AI 最近的 40 条自己判断
    if (!candidates.length) {
      candidates = [...pool]
        .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
        .slice(0, 40);
    }
    const aiPool = candidates.slice(0, 40);

    let aiIds = [];
    let mode = 'keyword';
    let note = '';
    try {
      if (ai.aiStatus && ai.aiStatus().mode === 'ai') {
        const lines = aiPool.map((x, i) => `${i + 1}. [${x.id}] ${String(x.title || '').slice(0, 60)}`);
        const out = await ai.chat(
          [
            {
              role: 'system',
              content:
                '你是资讯检索助手。用户给一个查找需求，从候选标题里挑出真正相关的。' +
                '宁可少挑不要凑数。只输出 JSON：{"ids":["id1","id2"]}，按相关度排序，最多 20 条。' +
                '没有相关的输出 {"ids":[]}。不要解释。',
            },
            { role: 'user', content: `查找需求：${query}\n\n候选标题：\n${lines.join('\n')}` },
          ],
          { temperature: 0.1, maxTokens: 600 },
        );
        const j = ai.extractJson ? ai.extractJson(out) : null;
        const arr = (j && j.ids) || [];
        const valid = new Set(aiPool.map((x) => x.id));
        aiIds = arr.map(String).filter((v) => valid.has(v)).slice(0, 20);
        if (aiIds.length) mode = 'ai';
        else note = 'AI 没找到相关的，下面是关键词结果';
      }
    } catch (err) {
      console.warn('[news/ai-search] AI 精排失败:', err.message);
      note = 'AI 暂时不可用，下面是关键词结果';
    }

    const finalIds = mode === 'ai' ? aiIds : keywordIds;
    const byId = new Map(pool.map((x) => [x.id, x]));
    const items = finalIds.map((id) => byId.get(id)).filter(Boolean).map((x) => newsSvc.newsPublic(x));

    return data(res, { ids: finalIds, items, mode, note, scanned: pool.length });
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

  /** 回收站 */
  app.get('/api/admin/news/deleted', (req, res) => {
    requireAdmin(req);
    const q = queryOf(req);
    return data(res, newsSvc.listDeletedNews({ page: num(q.page, 1), size: num(q.size, 20) }));
  });

  /**
   * 批量重抓正文（管理员）。
   * 一次只处理一小批，前端循环调用，避免单请求超时。
   */
  app.post('/api/admin/news/refetch', async (req, res) => {
    requireAdmin(req);
    const limit = Math.min(15, Math.max(1, num(req.body?.limit, 8)));
    const offset = Math.max(0, num(req.body?.offset, 0));
    const force = Boolean(req.body?.force);
    const r = await newsSvc.refetchBodies({ limit, offset, force });
    return data(res, r);
  });

  /** 从回收站恢复 */
  app.post('/api/admin/news/:id/restore', (req, res) => {
    requireAdmin(req);
    const ok = newsSvc.restoreNews(req.params.id);
    if (!ok) return fail(res, '资讯不存在或未删除', 404, 'not_found');
    return data(res, { restored: true, id: req.params.id });
  });

  /**
   * 删除资讯（软删除）。
   * 误删可以 POST /api/admin/news/:id/restore 恢复。
   */
  app.delete('/api/admin/news/:id', (req, res) => {
    const admin = requireAdmin(req);
    const ok = newsSvc.deleteNews(req.params.id, admin);
    if (!ok) return fail(res, '资讯不存在', 404, 'not_found');
    return data(res, { deleted: true, id: req.params.id, recoverable: true });
  });

}
