/**
 * 杭州政策通 — 接口
 *
 * 公开：
 *   GET  /api/hz-policy/meta                 分类/统计/数据来源说明
 *   GET  /api/hz-policy/portals              政府官网导航（8 个部门）
 *   GET  /api/hz-policy/policies             政策补贴列表（q / category）
 *   GET  /api/hz-policy/policies/:id         政策详情（含申报条件）
 *   GET  /api/hz-policy/notices              最新通知文件（q / dept / tag）
 *
 * 管理端：
 *   GET/POST/PUT/DELETE /api/admin/hz-policy/policies[/:id]
 *   GET/POST/PUT/DELETE /api/admin/hz-policy/notices[/:id]
 *   POST /api/admin/hz-policy/import            批量导入
 *   POST /api/admin/hz-policy/clear-imported    删除导入数据
 */

import { httpError } from '../http/app.js';
import { data, fail, str, num, mustAuth } from './_util.js';
import crawl from '../services/hz-crawl.js';
import svc, {
  HZ_PORTALS,
  HZ_POLICY_CATEGORIES,
  HZ_NOTICE_TAGS,
  HZ_SOURCES,
} from '../services/hzpolicy.js';

function mustAdmin(req) {
  const user = mustAuth(req);
  if (!user.isAdmin) throw httpError(403, '需要管理员权限');
  return user;
}

function bizFail(res, err, fallback) {
  return fail(res, err?.message || fallback, err?.status || 400, err?.code || 'bad_request');
}

export default function registerHzPolicyRoutes(app) {
  /* ================================================================ */
  /* 公开                                                              */
  /* ================================================================ */

  app.get('/api/hz-policy/meta', (req, res) => {
    return data(res, {
      categories: HZ_POLICY_CATEGORIES,
      tags: HZ_NOTICE_TAGS,
      sources: HZ_SOURCES,
      stats: svc.policyStats(),
    });
  });

  app.get('/api/hz-policy/portals', (req, res) => {
    return data(res, { items: HZ_PORTALS, total: HZ_PORTALS.length });
  });

  app.get('/api/hz-policy/policies', (req, res) => {
    const items = svc.listPolicies({
      q: String(req.query.q || '').trim().slice(0, 60),
      category: String(req.query.category || '').trim(),
    });
    return data(res, { items, total: items.length });
  });

  app.get('/api/hz-policy/policies/:id', (req, res) => {
    const p = svc.getPolicy(req.params.id);
    if (!p) return fail(res, '政策不存在', 404, 'not_found');
    return data(res, { policy: p });
  });

  app.get('/api/hz-policy/notices', (req, res) => {
    const items = svc.listNotices({
      q: String(req.query.q || '').trim().slice(0, 60),
      dept: String(req.query.dept || '').trim(),
      tag: String(req.query.tag || '').trim(),
      limit: num(req.query.limit, 100),
    });
    return data(res, { items, total: items.length });
  });

  /* ================================================================ */
  /* 管理端：政策                                                      */
  /* ================================================================ */

  app.get('/api/admin/hz-policy/policies', (req, res) => {
    mustAdmin(req);
    const items = svc.listPoliciesAdmin({ q: String(req.query.q || '').trim().slice(0, 60) });
    return data(res, { items, total: items.length });
  });

  app.post('/api/admin/hz-policy/policies', (req, res) => {
    mustAdmin(req);
    try {
      return data(res, { policy: svc.createPolicy(req.body || {}) }, 201);
    } catch (err) {
      return bizFail(res, err, '创建失败');
    }
  });

  app.put('/api/admin/hz-policy/policies/:id', (req, res) => {
    mustAdmin(req);
    try {
      return data(res, { policy: svc.updatePolicy(req.params.id, req.body || {}) });
    } catch (err) {
      return bizFail(res, err, '修改失败');
    }
  });

  app.delete('/api/admin/hz-policy/policies/:id', (req, res) => {
    mustAdmin(req);
    const ok = svc.deletePolicy(req.params.id);
    if (!ok) return fail(res, '政策不存在', 404, 'not_found');
    return data(res, { deleted: true });
  });

  /* ================================================================ */
  /* 管理端：通知                                                      */
  /* ================================================================ */

  app.get('/api/admin/hz-policy/notices', (req, res) => {
    mustAdmin(req);
    const items = svc.listNoticesAdmin({ q: String(req.query.q || '').trim().slice(0, 60) });
    return data(res, { items, total: items.length });
  });

  app.post('/api/admin/hz-policy/notices', (req, res) => {
    mustAdmin(req);
    try {
      return data(res, { notice: svc.createNotice(req.body || {}) }, 201);
    } catch (err) {
      return bizFail(res, err, '创建失败');
    }
  });

  app.put('/api/admin/hz-policy/notices/:id', (req, res) => {
    mustAdmin(req);
    try {
      return data(res, { notice: svc.updateNotice(req.params.id, req.body || {}) });
    } catch (err) {
      return bizFail(res, err, '修改失败');
    }
  });

  app.delete('/api/admin/hz-policy/notices/:id', (req, res) => {
    mustAdmin(req);
    const ok = svc.deleteNotice(req.params.id);
    if (!ok) return fail(res, '通知不存在', 404, 'not_found');
    return data(res, { deleted: true });
  });

  /* ================================================================ */
  /* 管理端：批量导入                                                  */
  /* ================================================================ */

  app.post('/api/admin/hz-policy/import', (req, res) => {
    mustAdmin(req);
    const kind = str(req.body?.kind, 10) === 'notices' ? 'notices' : 'policies';
    const text = String(req.body?.text || '');
    if (text.length > 400_000) return fail(res, '导入内容过大，请分批导入', 413, 'too_large');
    try {
      return data(res, svc.importBatch(kind, text));
    } catch (err) {
      return bizFail(res, err, '导入失败');
    }
  });

  /* ================================================================ */
  /* 管理端：通知自动抓取                                              */
  /* ================================================================ */

  /** 抓取状态（上次抓取时间与结果） */
  app.get('/api/hz-policy/crawl-status', (req, res) => {
    const last = crawl.getLastRun();
    return data(res, { last: last || null, sites: crawl.CRAWL_SITES.map((s) => ({ id: s.id, name: s.name })) });
  });

  /** 立即抓取一次（管理员） */
  app.post('/api/admin/hz-policy/crawl', (req, res) => {
    mustAdmin(req);
    crawl
      .crawlAndSave({ keepDays: 180 })
      .then((r) => {
        try {
          crawl.markRun({ okCount: r.okCount, failCount: r.failCount, added: r.added });
        } catch { /* ignore */ }
        console.log('[hz-crawl] 手动触发完成', { ok: r.okCount, fail: r.failCount, added: r.added });
      })
      .catch((err) => console.warn('[hz-crawl] 手动触发失败', err.message));
    return data(res, { started: true, message: '抓取已在后台启动，约 10 秒后可刷新查看结果' });
  });

  app.post('/api/admin/hz-policy/clear-imported', (req, res) => {
    mustAdmin(req);
    const kind = str(req.body?.kind, 10) === 'notices' ? 'notices' : 'policies';
    const removed = svc.clearImported(kind);
    return data(res, { removed });
  });

  return app;
}
