/**
 * 核心路由：健康检查、字典、文件、分享、二维码、实时事件流、AI 预览
 */
import fs from 'node:fs';
import path from 'node:path';
import db from '../store/db.js';
import { config } from '../config.js';
import { data, fail, mustAuth, authUser, baseUrl, queryOf, rateLimit, clientIp, list } from './_util.js';
import { getFile, filePublic, saveUploads, aggregateText, KIND_LABEL, EXT_KIND } from '../services/files.js';
import listingsSvc from '../services/listings.js';
import wechat from '../services/wechat.js';
import hub from '../services/hub.js';
import ai from '../services/ai.js';
import { httpError } from '../http/app.js';
import { CATEGORIES, INDUSTRIES, CITIES, PIPELINE_STAGES, PROJECT_TYPES, TRADE_TYPES, EVENT_TYPES, QUALIFICATION_TYPES, HELPER, PROJECT_QUALIFICATION_PRESETS, QUALIFICATION_LEVELS, COOPERATION_MODES, PRICE_TYPES, PAYMENT_TERMS, SETTLEMENT_MODES, INVOICE_TYPES, BUSINESS_TERM_FIELDS } from '../data/taxonomy.js';

let qrModule = null;
let qrTried = false;
async function getQr() {
  if (!qrTried) {
    qrTried = true;
    try {
      qrModule = await import('../lib/qrcode.js');
    } catch {
      qrModule = null;
    }
  }
  return qrModule;
}

export default function registerCoreRoutes(app) {
  /* ---------------------------------------------------------------- */
  /* 健康与状态                                                        */
  /* ---------------------------------------------------------------- */
  app.get('/api/health', (req, res) =>
    data(res, {
      ok: true,
      app: config.appName,
      time: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      online: hub.onlineCount(),
      storage: 'json-file',
      ai: ai.aiStatus(),
      wechat: wechat.status(),
      baseUrl: baseUrl(req),
    }),
  );

  app.get('/api/stats', (req, res) => data(res, listingsSvc.platformStats()));

  /* ---------------------------------------------------------------- */
  /* 字典                                                              */
  /* ---------------------------------------------------------------- */
  app.get('/api/taxonomy', (req, res) =>
    data(res, {
      categories: CATEGORIES,
      industries: INDUSTRIES,
      cities: CITIES,
      projectTypes: PROJECT_TYPES,
      tradeTypes: TRADE_TYPES,
      eventTypes: EVENT_TYPES,
      pipelineStages: PIPELINE_STAGES,
      qualificationTypes: QUALIFICATION_TYPES,
      projectQualificationPresets: PROJECT_QUALIFICATION_PRESETS,
      qualificationLevels: QUALIFICATION_LEVELS,
      cooperationModes: COOPERATION_MODES,
      priceTypes: PRICE_TYPES,
      paymentTerms: PAYMENT_TERMS,
      settlementModes: SETTLEMENT_MODES,
      invoiceTypes: INVOICE_TYPES,
      businessTermFields: BUSINESS_TERM_FIELDS,
      durations: listingsSvc.DURATION_OPTIONS,
      fileKinds: KIND_LABEL,
      extensions: Object.keys(EXT_KIND),
    }),
  );

  app.get('/api/taxonomy/search', (req, res) => {
    const kw = String(req.query.q || '').trim();
    if (!kw) return data(res, { industries: [], subs: [], cities: [] });
    const lower = kw.toLowerCase();
    const industries = [];
    const subs = [];
    for (const ind of INDUSTRIES) {
      if (ind.name.includes(kw)) industries.push({ id: ind.id, name: ind.name, icon: ind.icon });
      for (const s of ind.subs || []) {
        if (s.name.includes(kw) || s.id.includes(lower)) subs.push({ ...s, industryId: ind.id, industryName: ind.name });
      }
    }
    const cities = [];
    for (const prov of CITIES) {
      for (const c of prov.cities || []) {
        if (c.name.includes(kw)) cities.push({ ...c, province: prov.name, provinceId: prov.id });
      }
    }
    return data(res, { industries: industries.slice(0, 20), subs: subs.slice(0, 30), cities: cities.slice(0, 30) });
  });

  /* ---------------------------------------------------------------- */
  /* 文件                                                              */
  /* ---------------------------------------------------------------- */
  // 下载 / 预览（图片、视频、PDF 可内联）
  app.get('/files/:id/*', (req, res) => {
    const f = getFile(req.params.id);
    if (!f) throw httpError(404, '文件不存在');
    if (!fs.existsSync(f.path)) throw httpError(410, '文件已被清理');
    const inline = ['image', 'video', 'audio', 'pdf'].includes(f.kind);
    res.set('Content-Type', f.mime || 'application/octet-stream');
    res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Accept-Ranges', 'bytes');
    return res.sendFile(f.path, 'stream');
  });

  app.get('/api/files/:id', (req, res) => {
    const f = getFile(req.params.id);
    if (!f) throw httpError(404, '文件不存在');
    return data(res, filePublic(f));
  });

  app.post('/api/files', async (req, res) => {
    const user = mustAuth(req);
    const saved = await saveUploads(req, { ownerId: user.id });
    return data(res, { files: saved.map(filePublic) }, 201);
  });

  /* ---------------------------------------------------------------- */
  /* 分享与二维码                                                       */
  /* ---------------------------------------------------------------- */
  app.get('/api/share/qrcode', async (req, res) => {
    const text = String(req.query.text || baseUrl(req));
    const size = Math.min(1024, Math.max(120, Number(req.query.size) || 320));
    const qr = await getQr();
    if (!qr) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#fff"/><text x="50%" y="50%" font-size="14" text-anchor="middle" fill="#999">二维码模块未就绪</text></svg>`;
      res.set('Content-Type', 'image/svg+xml');
      return res.end(svg);
    }
    const scale = Math.max(2, Math.floor(size / 33));
    const png = qr.qrToPng(text, { ecc: 'M', margin: 2, scale });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.end(png);
  });

  app.get('/api/share/qrcode.svg', async (req, res) => {
    const text = String(req.query.text || baseUrl(req));
    const qr = await getQr();
    if (!qr) throw httpError(503, '二维码模块未就绪');
    res.set('Content-Type', 'image/svg+xml');
    return res.end(qr.qrToSvg(text, { ecc: 'M', margin: 2, scale: Number(req.query.scale) || 6 }));
  });

  app.get('/api/listings/:id/share', (req, res) => {
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    const payload = wechat.buildSharePayload({ listing, baseUrl: baseUrl(req) });
    return data(res, { ...payload, shareCard: { title: listing.title, subtitle: listing.subtitle } });
  });

  app.post('/api/listings/:id/share', (req, res) => {
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    const user = authUser(req);
    listingsSvc.recordShare(req.params.id, { channel: req.body?.channel || 'link', userId: user?.id || '' });
    return data(res, { ok: true });
  });

  /* ---------------------------------------------------------------- */
  /* 微信 JS-SDK 分享配置                                               */
  /* ---------------------------------------------------------------- */
  app.get('/api/wechat/share-config', async (req, res) => {
    const id = String(req.query.id || '');
    const listing = id ? listingsSvc.getListing(id) : null;
    if (!listing) throw httpError(404, '信息不存在');
    const pageUrl = String(req.query.url || `${baseUrl(req)}/#/detail/${id}`);
    const cfg = await wechat.buildWechatShare({ listing, baseUrl: baseUrl(req), pageUrl });
    return data(res, cfg);
  });

  app.get('/api/wechat/jsconfig', async (req, res) => {
    const url = String(req.query.url || `${baseUrl(req)}/`);
    try {
      const cfg = await wechat.jsSdkConfig(url);
      return data(res, cfg);
    } catch (err) {
      return data(res, { ready: false, reason: err.message });
    }
  });

  /** 微信服务器验证（公众号后台填写 URL 时调用） */
  app.get('/api/wechat/callback', (req, res) => {
    const check = wechat.verifyServerSignature({
      signature: req.query.signature,
      timestamp: req.query.timestamp,
      nonce: req.query.nonce,
      echostr: req.query.echostr,
    });
    if (check.ok && req.query.echostr) return res.text(check.echostr);
    // 没有 echostr 时说明是 OAuth 回跳
    const code = req.query.code;
    if (!code) return res.redirect('/#/login?wechat=missing_code');
    return res.redirect(`/#/login?wechat_code=${encodeURIComponent(code)}&state=${encodeURIComponent(req.query.state || '')}`);
  });

  /* ---------------------------------------------------------------- */
  /* AI 预览（发布前的标题生成 + 可靠性解析）                            */
  /* ---------------------------------------------------------------- */
  app.post('/api/ai/preview', async (req, res) => {
    const user = authUser(req);
    const rl = rateLimit(`ai:${clientIp(req)}`, 60, 60_000);
    if (!rl.ok) return fail(res, `请求过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const body = req.body || {};
    const uploaded = await saveUploads(req, { ownerId: user?.id || 'guest' });
    // 支持复用已上传的文件（前端先上传再请求 AI，避免重复上传）
    const reused = list(body.fileIds).map((fid) => getFile(fid)).filter(Boolean);
    const files = [...reused, ...uploaded];
    const text = String(body.text || '');
    if (!text.trim() && !files.length) return fail(res, '请先输入文字或导入文件');

    const category = ['project', 'event', 'trade'].includes(body.category) ? body.category : 'project';
    const fileText = aggregateText(files, 14000);
    const input = {
      text,
      fileText,
      files: files.map(filePublic),
      filename: files[0]?.name || '',
      category,
      categoryName: listingsSvc.categoryName(category),
      company: user?.company || '',
      hasContact: Boolean(body.phone || body.wechat || user?.phone),
      hasQualification: user?.qualification?.status === 'approved',
    };

    const [titles, analysis] = await Promise.all([ai.generateTitles(input), ai.analyzeProject(input)]);
    return data(res, {
      titles,
      analysis,
      files: files.map(filePublic),
      extracted: {
        chars: fileText.length,
        preview: fileText.slice(0, 600),
        notes: files.flatMap((f) => (f.notes || []).map((n) => `${f.name}: ${n}`)),
      },
    });
  });

  /* ---------------------------------------------------------------- */
  /* 实时事件流（SSE）                                                  */
  /* ---------------------------------------------------------------- */
  app.get('/api/events/stream', (req, res) => {
    const user = authUser(req);
    const client = hub.subscribe(req, res, { userId: user?.id || null });
    if (req.query.rooms) {
      for (const roomId of String(req.query.rooms).split(',').map((s) => s.trim()).filter(Boolean)) {
        hub.joinRoom(client, roomId);
      }
    }
    if (user) hub.joinRoom(client, `user:${user.id}`);
  });

  app.get('/api/events/join', (req, res) => {
    const user = authUser(req);
    const roomId = String(req.query.room || '');
    if (!roomId) return fail(res, '缺少 room 参数');
    for (const c of []) void c;
    // 通过一次长连接注册房间：此处返回 204，实际房间通过 stream 的 rooms 参数加入
    void user;
    return res.json({ ok: true, room: roomId }, 200);
  });

  /* ---------------------------------------------------------------- */
  /* 项目案例                                                          */
  /* ---------------------------------------------------------------- */
  app.get('/api/cases', (req, res) => {
    const q = queryOf(req);
    const cases = db.collection('cases').all();
    const filtered = q.category ? cases.filter((c) => c.category === q.category) : cases;
    return data(res, filtered.slice(0, q.pageSize || 50));
  });

  /* ---------------------------------------------------------------- */
  /* 搜索建议                                                          */
  /* ---------------------------------------------------------------- */
  app.get('/api/search/suggest', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return data(res, { items: [] });
    const items = [];
    for (const ind of INDUSTRIES) {
      if (ind.name.toLowerCase().includes(q)) items.push({ type: 'industry', id: ind.id, label: ind.name, icon: ind.icon });
      for (const s of ind.subs || []) {
        if (s.name.toLowerCase().includes(q)) items.push({ type: 'sub', id: s.id, label: s.name, parent: ind.name });
      }
    }
    for (const prov of CITIES) {
      for (const c of prov.cities || []) {
        if (c.name.toLowerCase().includes(q)) items.push({ type: 'city', id: c.id, label: c.name, parent: prov.name });
      }
      if (items.length > 40) break;
    }
    for (const l of db.collection('listings').all()) {
      if (l.status !== 'published') continue;
      if (String(l.title || '').toLowerCase().includes(q)) items.push({ type: 'listing', id: l.id, label: l.title, category: l.category });
      if (items.length > 60) break;
    }
    return data(res, { items: items.slice(0, 30) });
  });

  /* ---------------------------------------------------------------- */
  /* 公开站点信息                                                      */
  /* ---------------------------------------------------------------- */
  app.get('/api/site', (req, res) =>
    data(res, {
      name: config.appName,
      slogan: config.appSlogan,
      categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon, types: c.types })),
      durations: listingsSvc.DURATION_OPTIONS,
      ai: ai.aiStatus(),
      wechat: wechat.status(),
      loginMethods: ['phone', 'email', 'wechat'],
      baseUrl: baseUrl(req),
      helper: { industries: INDUSTRIES.length, cities: CITIES.reduce((n, p) => n + (p.cities?.length || 1), 0) },
      taxonomyHelperReady: Boolean(HELPER && HELPER.findIndustry),
    }),
  );
}
