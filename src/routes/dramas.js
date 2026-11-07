/**
 * 短剧路由
 *
 * 公开：
 *   GET  /api/dramas                 频道列表
 *   GET  /api/dramas/meta            分类
 *   GET  /api/dramas/:id             剧详情 + 集列表
 *
 * 管理端（需要管理员）：
 *   GET    /api/admin/dramas                 列表（可按状态）
 *   POST   /api/admin/dramas                 创建（draft）
 *   PUT    /api/admin/dramas/:id             编辑
 *   POST   /api/admin/dramas/:id/episodes    添加一集 {fileId, episodeNo, title}
 *   POST   /api/admin/dramas/:id/review      审核 {action: approve|reject, reason}
 *   POST   /api/admin/dramas/:id/offline     下架
 *   POST   /api/admin/dramas/:id/slices      自动切片投放短视频流
 *   DELETE /api/admin/dramas/:id             删除（软删）
 */

import dramasSvc from '../services/dramas.js';
import { data, fail, mustAuth, queryOf, num, clientIp, rateLimit } from './_util.js';

function mustAdmin(req) {
  const user = mustAuth(req);
  if (!user.isAdmin) {
    const err = new Error('需要管理员权限');
    err.status = 403;
    err.code = 'forbidden';
    throw err;
  }
  return user;
}

export default function registerDramaRoutes(app) {
  /* ---------------- 公开 ---------------- */
  app.get('/api/dramas/meta', (req, res) => data(res, { categories: dramasSvc.DRAMA_CATEGORIES }));

  app.get('/api/dramas', (req, res) => {
    const q = queryOf(req);
    const r = dramasSvc.listDramas({
      category: String(q.category || '').trim(),
      q: String(q.q || '').trim().slice(0, 40),
      page: num(q.page, 1),
      size: Math.min(30, Math.max(1, num(q.size, 12))),
      featured: q.featured ? true : undefined,
    });
    return data(res, r);
  });

  /** 最新短剧集（短视频流穿插用） */
  app.get('/api/dramas/episodes', (req, res) => {
    const q = queryOf(req);
    return data(res, dramasSvc.listLatestEpisodes({ limit: Math.min(40, Math.max(1, num(q.limit, 20))) }));
  });

  app.get('/api/dramas/:id', (req, res) => {
    const r = dramasSvc.getDrama(req.params.id);
    if (!r || r.drama.status !== 'published') return fail(res, '短剧不存在或已下架', 404, 'not_found');
    return data(res, r);
  });

  /* ---------------- 管理端 ---------------- */
  app.get('/api/admin/dramas', (req, res) => {
    mustAdmin(req);
    const q = queryOf(req);
    return data(res, dramasSvc.adminListDramas({ status: String(q.status || ''), page: num(q.page, 1), size: Math.min(50, num(q.size, 20)) }));
  });

  /** 一次上传：同时发布短视频 + 短剧（管理员） */
  app.post('/api/admin/dramas/from-videos', async (req, res) => {
    const admin = mustAdmin(req);
    try {
      const r = await dramasSvc.createFromVideos({
        admin,
        title: String(req.body?.title || ''),
        category: String(req.body?.category || 'business'),
        intro: String(req.body?.intro || ''),
        provider: String(req.body?.provider || ''),
        licenseNote: String(req.body?.licenseNote || ''),
        freeEpisodes: Number(req.body?.freeEpisodes) || 1,
        fileIds: Array.isArray(req.body?.fileIds) ? req.body.fileIds : [],
        slices: req.body?.slices !== false,
      });
      return data(res, r, 201);
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
  });

  app.post('/api/admin/dramas', (req, res) => {
    const admin = mustAdmin(req);
    const row = dramasSvc.createDrama({ user: admin, body: req.body || {} });
    return data(res, { drama: row }, 201);
  });

  app.put('/api/admin/dramas/:id', (req, res) => {
    const admin = mustAdmin(req);
    const row = dramasSvc.updateDrama(req.params.id, { user: admin, body: req.body || {} });
    return data(res, { drama: row });
  });

  app.post('/api/admin/dramas/:id/episodes', async (req, res) => {
    mustAdmin(req);
    const rl = rateLimit(`drama-ep:${clientIp(req)}`, 60, 60_000);
    if (!rl.ok) return fail(res, `操作太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    try {
      const row = await dramasSvc.addEpisode({
        dramaId: req.params.id,
        fileId: String(req.body?.fileId || ''),
        episodeNo: req.body?.episodeNo,
        title: String(req.body?.title || ''),
        free: req.body?.free,
      });
      return data(res, { episode: dramasSvc.episodePublic(row) }, 201);
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
  });

  app.post('/api/admin/dramas/:id/review', (req, res) => {
    const admin = mustAdmin(req);
    try {
      const row = dramasSvc.reviewDrama(req.params.id, {
        action: String(req.body?.action || ''),
        reason: String(req.body?.reason || ''),
        admin,
      });
      return data(res, { drama: row });
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
  });

  app.post('/api/admin/dramas/:id/offline', (req, res) => {
    mustAdmin(req);
    try {
      return data(res, { drama: dramasSvc.offlineDrama(req.params.id) });
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
  });

  app.post('/api/admin/dramas/:id/slices', async (req, res) => {
    const admin = mustAdmin(req);
    try {
      const r = await dramasSvc.generateSlices({ dramaId: req.params.id, admin });
      return data(res, r);
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
  });

  app.delete('/api/admin/dramas/:id', (req, res) => {
    mustAdmin(req);
    try {
      dramasSvc.deleteDrama(req.params.id);
      return data(res, { ok: true });
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
  });
}
