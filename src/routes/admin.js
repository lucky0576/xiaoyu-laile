/**
 * 管理后台路由
 */
import db from '../store/db.js';
import { data, fail, str, bool, num, queryOf, rateLimit, clientIp } from './_util.js';
import { publicUser, requireAdmin } from '../services/auth.js';
import listingsSvc from '../services/listings.js';
import notifySvc from '../services/notify.js';
import hub from '../services/hub.js';
import settingsSvc from '../services/settings.js';
import { httpError } from '../http/app.js';

const users = () => db.collection('users');
const listings = () => db.collection('listings');

export default function registerAdminRoutes(app) {
  app.get('/api/admin/overview', (req, res) => {
    requireAdmin(req);
    const stats = listingsSvc.platformStats();
    const allUsers = users().all();
    return data(res, {
      stats: {
        ...stats,
        users: allUsers.length,
        verifiedUsers: allUsers.filter((u) => u.verified || u.qualification?.status === 'approved').length,
        pendingVerifications: allUsers.filter((u) => u.qualification?.status === 'pending').length,
        online: hub.onlineCount(),
      },
      recentUsers: allUsers
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 10)
        .map(publicUser),
      recentListings: listingsSvc.queryListings({ status: 'all', pageSize: 10 }).items,
      collections: db.stats(),
    });
  });

  app.get('/api/admin/qualifications', (req, res) => {
    requireAdmin(req);
    const status = String(req.query.status || 'pending');
    const items = users()
      .all()
      .filter((u) => (status === 'all' ? u.qualification?.status && u.qualification.status !== 'none' : u.qualification?.status === status))
      .map((u) => ({
        userId: u.id,
        nickname: u.nickname,
        company: u.company,
        phone: u.phone,
        email: u.email,
        qualification: u.qualification,
        verified: Boolean(u.verified),
      }));
    return data(res, { items, total: items.length });
  });

  app.post('/api/admin/qualifications/:userId', (req, res) => {
    const admin = requireAdmin(req);
    const user = users().get(req.params.userId);
    if (!user) throw httpError(404, '用户不存在');
    const approve = req.body?.approve === undefined ? true : bool(req.body.approve);
    const note = str(req.body?.note, 500);
    const qualification = {
      ...(user.qualification || {}),
      status: approve ? 'approved' : 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewerId: admin.id,
      reviewerNote: note,
    };
    const updated = users().update(user.id, { qualification, verified: approve });
    notifySvc.notify({
      userId: user.id,
      type: 'qualification',
      title: approve ? '企业资质认证已通过' : '企业资质认证未通过',
      body: approve ? '您的主页已展示认证标识，对接成功率将显著提升。' : note || '请补充材料后重新提交。',
      link: '/#/profile',
    });
    return data(res, { user: publicUser(updated), qualification });
  });

  app.get('/api/admin/users', (req, res) => {
    requireAdmin(req);
    const q = queryOf(req);
    const kw = String(q.q || '').toLowerCase();
    let items = users().all();
    if (kw) {
      items = items.filter((u) => [u.nickname, u.phone, u.email, u.company].filter(Boolean).join(' ').toLowerCase().includes(kw));
    }
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const total = items.length;
    const page = q.page;
    const pageSize = Math.min(100, q.pageSize);
    return data(res, {
      total,
      page,
      pages: Math.ceil(total / pageSize) || 1,
      items: items.slice((page - 1) * pageSize, page * pageSize).map((u) => ({ ...publicUser(u), phone: u.phone, email: u.email, status: u.status, isAdmin: Boolean(u.isAdmin) })),
    });
  });

  app.post('/api/admin/users/:id/status', (req, res) => {
    requireAdmin(req);
    const user = users().get(req.params.id);
    if (!user) throw httpError(404, '用户不存在');
    const status = ['active', 'banned'].includes(req.body?.status) ? req.body.status : 'active';
    const updated = users().update(user.id, { status });
    return data(res, { user: publicUser(updated), status });
  });

  app.post('/api/admin/users/:id/admin', (req, res) => {
    requireAdmin(req);
    const user = users().get(req.params.id);
    if (!user) throw httpError(404, '用户不存在');
    const updated = users().update(user.id, { isAdmin: bool(req.body?.isAdmin) });
    return data(res, { user: publicUser(updated), isAdmin: Boolean(updated.isAdmin) });
  });

  app.get('/api/admin/listings', (req, res) => {
    requireAdmin(req);
    const q = queryOf(req);
    const result = listingsSvc.queryListings({
      status: String(q.status || 'all'),
      category: String(q.category || ''),
      q: String(q.q || ''),
      page: q.page,
      pageSize: q.pageSize,
    });
    return data(res, result);
  });

  app.post('/api/admin/listings/:id/moderate', (req, res) => {
    requireAdmin(req);
    const l = listings().get(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    const action = String(req.body?.action || '');
    const patch = { moderatedAt: new Date().toISOString(), moderatorNote: str(req.body?.note, 500) };
    if (action === 'offline') patch.status = 'closed';
    else if (action === 'online') patch.status = 'published';
    else if (action === 'feature') patch.featured = bool(req.body?.featured ?? true);
    else return fail(res, '未知操作');
    const updated = listings().update(l.id, patch);
    if (l.ownerId) {
      notifySvc.notify({
        userId: l.ownerId,
        type: 'system',
        title: `您的信息「${l.title}」被平台处理`,
        body: `${action}${patch.moderatorNote ? ` · ${patch.moderatorNote}` : ''}`,
        link: `/#/detail/${l.id}`,
      });
    }
    return data(res, { listing: listingsSvc.listingBrief(updated) });
  });

  app.post('/api/admin/maintenance', (req, res) => {
    requireAdmin(req);
    const action = String(req.body?.action || '');
    let result = {};
    if (action === 'expire') result = { expired: notifySvc.expireListings() };
    else if (action === 'remind') result = { reminded: notifySvc.remindExpiring() };
    else if (action === 'flush') {
      db.flush();
      result = { flushed: true };
    } else return fail(res, '未知操作');
    return data(res, result);
  });

  /* ---------------------------------------------------------------- */
  /* AI 设置：管理端在线配置，不用改 .env 也不用重启                    */
  /* ---------------------------------------------------------------- */

  app.get('/api/admin/ai', (req, res) => {
    requireAdmin(req);
    return data(res, settingsSvc.aiSettingsPublic());
  });

  app.put('/api/admin/ai', (req, res) => {
    requireAdmin(req);
    const b = req.body || {};
    // apiKey 传空表示「不改动」，传 '-' 表示清除
    return data(res, settingsSvc.saveAiSettings({
      baseUrl: b.baseUrl,
      model: b.model,
      apiKey: b.apiKey,
    }));
  });

  app.del('/api/admin/ai', (req, res) => {
    requireAdmin(req);
    return data(res, settingsSvc.clearAiSettings());
  });

  /** 真实调一次验证 key（只发极小请求，几乎不产生费用） */
  app.post('/api/admin/ai/test', async (req, res) => {
    requireAdmin(req);
    const rl = rateLimit(`aitest:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return fail(res, `测试过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    const b = req.body || {};
    return data(res, await settingsSvc.testAiConnection({
      baseUrl: b.baseUrl,
      model: b.model,
      apiKey: b.apiKey,
    }));
  });

  /* 视觉 / 语音：管理端在线配置 */
  app.get('/api/admin/vision', (req, res) => {
    requireAdmin(req);
    return data(res, settingsSvc.visionSettingsPublic());
  });

  app.put('/api/admin/vision', (req, res) => {
    requireAdmin(req);
    const b = req.body || {};
    return data(res, settingsSvc.saveVisionSettings({ baseUrl: b.baseUrl, model: b.model, apiKey: b.apiKey }));
  });

  app.post('/api/admin/vision/test', async (req, res) => {
    requireAdmin(req);
    const rl = rateLimit(`vtest:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return fail(res, `测试过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    const b = req.body || {};
    return data(res, await settingsSvc.testVisionConnection({ baseUrl: b.baseUrl, model: b.model, apiKey: b.apiKey }));
  });

  app.get('/api/admin/asr', (req, res) => {
    requireAdmin(req);
    return data(res, settingsSvc.asrSettingsPublic());
  });

  app.put('/api/admin/asr', (req, res) => {
    requireAdmin(req);
    const b = req.body || {};
    return data(res, settingsSvc.saveAsrSettings({ baseUrl: b.baseUrl, model: b.model, apiKey: b.apiKey }));
  });

  app.post('/api/admin/asr/test', async (req, res) => {
    requireAdmin(req);
    const rl = rateLimit(`atest:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return fail(res, `测试过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    const b = req.body || {};
    return data(res, await settingsSvc.testAsrConnection({ baseUrl: b.baseUrl, model: b.model, apiKey: b.apiKey }));
  });
}
