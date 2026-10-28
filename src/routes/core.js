/**
 * 核心路由：健康检查、字典、文件、分享、二维码、实时事件流、AI 预览
 */
import fs from 'node:fs';
import path from 'node:path';
import db from '../store/db.js';
import { config, PUBLIC_DIR } from '../config.js';
import { data, fail, str, num, mustAuth, authUser, baseUrl, queryOf, rateLimit, clientIp, list } from './_util.js';
import { getFile, filePublic, saveUploads, aggregateText, KIND_LABEL, EXT_KIND } from '../services/files.js';
import filesecure from '../services/filesecure.js';
import chunksSvc from '../services/chunks.js';
import listingsSvc from '../services/listings.js';
import wechat from '../services/wechat.js';
import wechatStatusSvc from '../services/wechat-status.js';
import hub from '../services/hub.js';
import ai from '../services/ai.js';
import { httpError } from '../http/app.js';
import { CATEGORIES, INDUSTRIES, CITIES, PIPELINE_STAGES, PROJECT_TYPES, TRADE_TYPES, EVENT_TYPES, BOUNTY_TYPES, BOUNTY_SETTLE_MODES, BOUNTY_ELIGIBILITY, QUALIFICATION_TYPES, HELPER, PROJECT_QUALIFICATION_PRESETS, QUALIFICATION_LEVELS, COOPERATION_MODES, PRICE_TYPES, PAYMENT_TERMS, SETTLEMENT_MODES, INVOICE_TYPES, BUSINESS_TERM_FIELDS } from '../data/taxonomy.js';
import { FEED_TYPES } from '../services/feeds.js';
import { geocodeAddress, reverseGeocode, amapEnabled, fetchStaticMap, amapUsage } from '../services/geocode.js';
import { ensureThumb } from '../services/thumb.js';
import { ensurePreview, previewPagePath, previewKind } from '../services/doc-preview.js';

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

  /**
   * 前端版本号：取所有前端文件的最近修改时间。
   *
   * 用途是排查「浏览器跑的是旧版前端」这类问题 ——
   * 之前出现过部署后浏览器仍用缓存的新旧混合模块，导致点发布没反应，
   * 但页面上看不出任何线索。有了这个接口就能一眼比对。
   */
  app.get('/api/version', (req, res) => {
    const dir = path.join(PUBLIC_DIR, 'static');
    let newest = 0;
    const files = [];
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!/\.(js|css)$/.test(f)) continue;
        const st = fs.statSync(path.join(dir, f));
        files.push({ file: f, mtime: st.mtime.toISOString(), size: st.size });
        if (st.mtimeMs > newest) newest = st.mtimeMs;
      }
    } catch {
      /* 目录不可读时返回空列表即可 */
    }
    files.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
    return data(res, {
      // 前端用它做缓存比对
      build: new Date(newest).toISOString(),
      fileCount: files.length,
      files: files.slice(0, 30),
    });
  });

  /**
   * CSS 合并：/static/bundle.css
   *
   * 原来 index.html 引了 8 个 CSS，跨境访问时每个都要一次往返，
   * 光 CSS 就吃掉十几轮 RTT。这里在服务端拼成一个文件，
   * 按 mtime 生成 ETag，内容没变就 304，变了自动失效。
   */
  app.get('/static/bundle.css', (req, res) => {
    const dir = path.join(PUBLIC_DIR, 'static');
    // 顺序就是层叠顺序，跟原来 index.html 里一致
    const ORDER = [
      'styles.css',
      'home.css',
      'live.css',
      'meeting.css',
      'forum.css',
      'bindings.css',
      'invest.css',
      'tags.css',
    ];
    let etag = '';
    const parts = [];
    try {
      for (const name of ORDER) {
        const p = path.join(dir, name);
        if (!fs.existsSync(p)) continue;
        const st = fs.statSync(p);
        etag += `${name}:${st.size}:${st.mtimeMs};`;
        parts.push(fs.readFileSync(p, 'utf8'));
      }
    } catch {
      return fail(res, '样式合并失败', 500, 'bundle_failed');
    }
    const tag = `"${Buffer.from(etag).toString('base64').slice(0, 32)}"`;
    if (String(req.headers['if-none-match'] || '') === tag) {
      res.statusCode = 304;
      return res.end();
    }
    const body = parts.join('\n');
    res.set('Content-Type', 'text/css; charset=utf-8');
    res.set('ETag', tag);
    res.set('Cache-Control', 'public, max-age=300');
    return res.end(body);
  });

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
      bountyTypes: BOUNTY_TYPES,
      bountySettleModes: BOUNTY_SETTLE_MODES,
      bountyEligibility: BOUNTY_ELIGIBILITY,
      feedTypes: FEED_TYPES,
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

    const ownerListing = f.listingId ? db.collection('listings').get(f.listingId) : null;
    const viewer = authUser(req);

    /*
     * 预览 vs 下载。
     *   默认（预览）：所有人都能看
     *   ?dl=1（下载）：需要发布者或管理员同意
     * 之前两者共用一道门，导致「看」也要授权，很难用。
     */
    const wantDownload = String(req.query.dl || '') === '1';
    if (wantDownload) {
      const dlPerm = listingsSvc.canDownloadFile(f, viewer);
      if (!dlPerm.allowed) {
        if (dlPerm.reason === 'login_required') {
          throw httpError(401, '登录后可申请下载该文件', 'login_required');
        }
        throw httpError(403, '下载需要发布方或管理员同意', 'file_need_approval');
      }
    }

    // 保密文件：服务端拦截，没有密码根本不下发字节（不是前端遮罩）
    const access = filesecure.canAccessFile(ownerListing, { viewer, token: String(req.query.t || '') });
    if (!access.allowed) {
      throw httpError(403, '该文件已加密，请输入查看密码', 'file_locked');
    }

    const locked = Boolean(ownerListing?.fileSecret?.enabled && ownerListing?.fileSecret?.passHash);
    const inline = ['image', 'video', 'audio', 'pdf'].includes(f.kind);
    res.set('Content-Type', f.mime || 'application/octet-stream');
    if (locked) {
      // 保密文件一律 inline：不提供「另存为」入口；同时禁缓存，
      // 避免令牌过期后浏览器仍能拿旧缓存继续看
      res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`);
      res.set('Cache-Control', 'private, no-store');
      res.set('X-Robots-Tag', 'noindex, nofollow');
    } else {
      // 只有明确要下载（?dl=1 且已授权）才用 attachment 触发「另存为」；
      // 其余一律 inline，让浏览器就地预览。
      const asAttachment = wantDownload;
      res.set('Content-Disposition', `${asAttachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
      res.set('Cache-Control', asAttachment ? 'private, no-store' : 'public, max-age=86400');
    }
    res.set('Accept-Ranges', 'bytes');
    return res.sendFile(f.path, 'stream');
  });

  /**
   * 文档预览：/api/preview/:id
   *
   * 首次调用会触发转换（Office 要先用 soffice 转 PDF，再渲染成图），
   * 慢的话 5~15 秒；转换结果落盘，第二次就是秒开。
   * 返回 { ok, pages, kind, note }
   */
  app.get('/api/preview/:id', async (req, res) => {
    const user = mustAuth(req);
    const f = getFile(req.params.id);
    if (!f) return fail(res, '文件不存在', 404, 'not_found');
    if (!previewKind(f)) return fail(res, '该文件不支持在线预览', 400, 'not_supported');

    // 权限跟浏览附件一致：需要登录；保密文件要过密码
    const ownerListing = f.listingId ? db.collection('listings').get(f.listingId) : null;
    const access = filesecure.canAccessFile(ownerListing, { viewer: user, token: String(req.query.t || '') });
    if (!access.allowed) return fail(res, '该文件已加密，请输入查看密码', 403, 'file_locked');

    // 每个 IP 每分钟最多 10 次转换，防止被刷着转大文件
    const rl = rateLimit(`preview:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return fail(res, `转换请求太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const r = await ensurePreview(f);
    if (!r.pages) return data(res, { ok: false, pages: 0, kind: r.kind || '', note: r.note || '无法预览' });
    return data(res, { ok: true, pages: r.pages, kind: r.kind, note: '' });
  });

  /** 文档预览的第 N 页图片 */
  app.get('/api/preview/:id/:page', (req, res) => {
    const user = mustAuth(req);
    const f = getFile(req.params.id);
    if (!f) return fail(res, '文件不存在', 404, 'not_found');
    const ownerListing = f.listingId ? db.collection('listings').get(f.listingId) : null;
    const access = filesecure.canAccessFile(ownerListing, { viewer: user, token: String(req.query.t || '') });
    if (!access.allowed) return fail(res, '该文件已加密，请输入查看密码', 403, 'file_locked');

    const p = previewPagePath(f.id, req.params.page);
    if (!p) return fail(res, '这一页还没生成', 404, 'no_page');
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    return res.sendFile(p, 'stream');
  });

  /**
   * 图片缩略图：/api/img/:id?w=400
   *
   * 列表卡片只显示一百多像素宽，没必要下 900×1600 的原图。
   * 服务端按需用 ffmpeg 缩一张并缓存，跨境流量能省掉 80% 以上。
   */
  app.get('/api/img/:id', async (req, res) => {
    const f = getFile(req.params.id);
    if (!f) return fail(res, '图片不存在', 404, 'not_found');
    if (!/^image\//i.test(String(f.mime || ''))) return fail(res, '不是图片', 400, 'not_image');

    // 权限跟原图一致：预览不限，但要过保密密码
    const ownerListing = f.listingId ? db.collection('listings').get(f.listingId) : null;
    const viewer = authUser(req);
    const access = filesecure.canAccessFile(ownerListing, { viewer, token: String(req.query.t || '') });
    if (!access.allowed) return fail(res, '该文件已加密，请输入查看密码', 403, 'file_locked');

    const p = await ensureThumb(f, req.query.w);
    if (!p) {
      // 缩不了（SVG 等）就 302 回原图，前端不用改逻辑
      return res.redirect(f.url);
    }
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=604800');
    return res.sendFile(p, 'stream');
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
  /* 分片上传                                                          */
  /*                                                                  */
  /* Cloudflare 隧道对单个请求有 100 秒上限（超时回报 524）。          */
  /* 12MB 的资料在 1Mbps 上行下正好约 100 秒 —— 用户看到的就是         */
  /* 「进度 100%，上传失败（524）」。切成 2MB 一块即可绕过。           */
  /* ---------------------------------------------------------------- */

  app.post('/api/files/chunk/init', (req, res) => {
    const user = mustAuth(req);
    const rl = rateLimit(`chunk-init:${clientIp(req)}`, 60, 60_000);
    if (!rl.ok) return fail(res, `操作过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    const b = req.body || {};
    return data(res, chunksSvc.initUpload({
      name: str(b.name, 200),
      size: num(b.size, 0),
      mime: str(b.mime, 120),
      ownerId: user.id,
    }));
  });

  // 合并必须在写分片的路由**之前**注册，
  // 否则 /chunk/:id/complete 会被 /chunk/:id/:index 抢先匹配（index='complete'）。
  app.post('/api/files/chunk/:id/complete', async (req, res) => {
    const user = mustAuth(req);
    const record = await chunksSvc.completeUpload(req.params.id, { ownerId: user.id });
    return data(res, { files: [filePublic(record)] }, 201);
  });

  app.get('/api/files/chunk/:id', async (req, res) => {
    mustAuth(req);
    return data(res, await chunksSvc.uploadStatus(req.params.id));
  });

  app.del('/api/files/chunk/:id', async (req, res) => {
    mustAuth(req);
    return data(res, { aborted: await chunksSvc.abortUpload(req.params.id) });
  });

  // 分片本体用原始二进制提交（application/octet-stream），
  // 走的是已有的 req.rawBody，单块 2MB 远低于 JSON 上限。
  app.post('/api/files/chunk/:id/:index', async (req, res) => {
    mustAuth(req);
    const buf = req.rawBody;
    if (!buf || !buf.length) return fail(res, '分片内容为空', 400);
    return data(res, await chunksSvc.appendChunk(req.params.id, req.params.index, buf));
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
    const raw = id ? listingsSvc.getListing(id) : null;
    if (!raw) throw httpError(404, '信息不存在');
    // 用 listingPublic 视图：typeName 已解析成中文，autoInfo 也在里面
    const listing = listingsSvc.listingPublic(raw, authUser(req));
    const pageUrl = String(req.query.url || `${baseUrl(req)}/#/detail/${id}`);
    const cfg = await wechat.buildWechatShare({ listing, baseUrl: baseUrl(req), pageUrl });
    return data(res, cfg);
  });

  /** 公众号接入状态（前端分享面板 / 后台配置页用） */
  app.get('/api/wechat/status', (req, res) => {
    return data(res, wechatStatusSvc.wechatStatus());
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
  /** 组装 AI 输入（/ai/summarize 与 /ai/preview 共用） */
  async function buildAiInput(req, body = {}) {
    const user = authUser(req);
    const uploaded = await saveUploads(req, { ownerId: user?.id || 'guest' });
    // 支持复用已上传的文件（前端先上传再请求 AI，避免重复上传）
    const reused = list(body.fileIds).map((fid) => getFile(fid)).filter(Boolean);
    const files = [...reused, ...uploaded];
    const text = String(body.text || '');
    const category = ['project', 'bounty', 'event', 'trade'].includes(body.category) ? body.category : 'project';
    // 附件正文要尽量完整地交给 AI：长文档由 summarizeProject 分块处理，
    // 这里不要先截断（旧值 14000 会把 3 万字的 PDF 砍掉一半以上）
    let fileText = aggregateText(files, 200000);

    // 把要交给视觉模型的图片收集起来：
    //   1) 直接上传的图片（微信截图 / 照片）
    //   2) PPT / PDF 里内嵌的图片（截图、图表、扫描页）
    // 两者合并，最多 6 张，避免费用和时间失控。
    const fsMod0 = await import('node:fs');
    const docImgMod = await import('../lib/docimage.js');

    const visualQueue = []; // { label, dataUrl }

    // 1) 直接上传的图片
    for (const f of files) {
      if (!f || f.kind !== 'image' || !f.url) continue;
      try {
        const st = fsMod0.statSync(f.path);
        if (st.size <= 2 * 1024 * 1024) {
          const buf = fsMod0.readFileSync(f.path);
          visualQueue.push({
            label: f.name || '图片',
            dataUrl: `data:${f.mime || 'image/jpeg'};base64,${buf.toString('base64')}`,
          });
        } else {
          visualQueue.push({ label: f.name || '图片', dataUrl: `${baseUrl(req)}${f.url}` });
        }
      } catch {
        visualQueue.push({ label: f.name || '图片', dataUrl: `${baseUrl(req)}${f.url}` });
      }
    }

    // 2) PPT / PDF 内嵌图片
    let docImgCount = 0;
    for (const f of files) {
      const ext = String(f && f.name || '').toLowerCase();
      if (!/\.(pptx|pptm|ppsx|ppsm|pdf)$/.test(ext)) continue;
      try {
        const buf = fsMod0.readFileSync(f.path);
        const imgs = docImgMod.extractDocImages(buf, f.name, { max: 6 });
        for (const im of imgs) {
          const dataUrl = docImgMod.toDataUrl(im);
          if (dataUrl) {
            visualQueue.push({ label: `${f.name} · ${im.name}`, dataUrl });
            docImgCount += 1;
          }
        }
      } catch {
        /* 抠图失败不影响文本解析 */
      }
    }

    const images = visualQueue.slice(0, 6);
    if (images.length && fileText.trim().length < 4000) {
      try {
        const aiMod = await import('../services/ai.js');
        const ocr = await aiMod.ocrImages({ images: images.map((x) => x.dataUrl) });
        if (ocr.ok && ocr.text) {
          const from = docImgCount ? `，其中 ${docImgCount} 张来自 PPT/PDF` : '';
          fileText = `${fileText ? fileText + '\n\n' : ''}【图片文字识别（共 ${ocr.count} 张${from}）】\n${ocr.text}`;
        }
      } catch {
        /* OCR 失败不影响主流程 */
      }
    }

    return {
      user,
      files,
      fileText,
      input: {
        text,
        fileText,
        files: files.map(filePublic),
        filename: files[0]?.name || '',
        category,
        categoryName: listingsSvc.categoryName(category),
        company: user?.company || '',
        hasContact: Boolean(body.phone || body.wechat || user?.phone),
        hasQualification: user?.qualification?.status === 'approved',
        // 第一步的汇总结果（第二步生成时优先以此为准）
        digest: String(body.digest || '').slice(0, 4000),
        points: list(body.points).slice(0, 20),
      },
    };
  }

  const aiExtracted = (fileText, files) => ({
    chars: fileText.length,
    preview: fileText.slice(0, 600),
    notes: files.flatMap((f) => (f.notes || []).map((n) => `${f.name}: ${n}`)),
  });

  /**
   * 第一步：AI 汇总资料
   * 先把用户填写的文字与附件解析文本汇总成结构化摘要，
   * 再交给 /ai/preview 生成主副标题与可靠性分析。
   */
  app.post('/api/ai/summarize', async (req, res) => {
    const rl = rateLimit(`ai:${clientIp(req)}`, 60, 60_000);
    if (!rl.ok) return fail(res, `请求过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const { input, files, fileText } = await buildAiInput(req, req.body || {});
    if (!input.text.trim() && !files.length) return fail(res, '请先输入文字或导入文件');

    const summary = await ai.summarizeProject(input);
    return data(res, {
      summary,
      files: files.map(filePublic),
      extracted: aiExtracted(fileText, files),
    });
  });

  /**
   * 第二步：生成主副标题与可靠性分析
   * 若带上第一步的 digest，则以汇总内容为主输入。
   */
  app.post('/api/ai/preview', async (req, res) => {
    const rl = rateLimit(`ai:${clientIp(req)}`, 60, 60_000);
    if (!rl.ok) return fail(res, `请求过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const { input, files, fileText } = await buildAiInput(req, req.body || {});
    if (!input.text.trim() && !input.digest.trim() && !files.length) {
      return fail(res, '请先输入文字或导入文件');
    }

    const [titles, analysis] = await Promise.all([ai.generateTitles(input), ai.analyzeProject(input)]);
    return data(res, {
      titles,
      analysis,
      files: files.map(filePublic),
      extracted: aiExtracted(fileText, files),
    });
  });

  /** 贸易：把多条供应/采购汇总成物资明细表 */
  app.post('/api/ai/trade-items', async (req, res) => {
    const rl = rateLimit(`tri:${clientIp(req)}`, 30, 60_000);
    if (!rl.ok) return fail(res, `请求过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const { input, files } = await buildAiInput(req, req.body || {});
    if (!input.text.trim() && !files.length) {
      return data(res, { ok: false, items: [], note: '请先输入文字或导入文件' });
    }

    const r = await ai.extractTradeItems({ text: input.text, fileText: input.fileText });
    return data(res, r);
  });

  /** 判断资料里包含几个独立条目，需要时返回拆分结果 */
  app.post('/api/ai/split', async (req, res) => {
    const rl = rateLimit(`spl:${clientIp(req)}`, 30, 60_000);
    if (!rl.ok) return fail(res, `请求过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const { input, files } = await buildAiInput(req, req.body || {});
    if (!input.text.trim() && !files.length) {
      return data(res, { ok: false, count: 0, items: [], note: '没有可分析的内容' });
    }

    const r = await ai.splitItems({
      text: input.text,
      fileText: input.fileText,
      category: input.category,
    });
    return data(res, r);
  });

  /** 导入链接：抓取网页并抽出正文 */
  app.post('/api/ai/fetch-url', async (req, res) => {
    const rl = rateLimit(`url:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) return fail(res, `请求过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const user = authUser(req);
    const url = str(req.body?.url, 800);
    if (!url.trim()) return fail(res, '请填写链接', 400, 'empty');

    const webMod = await import('../lib/webpage.js');
    // 导入链接的目的是「原文照抄」，所以走 keepAll，不做广告过滤
    const r = await webMod.fetchWebpage(url, { keepAll: true });
    if (!r.ok) return data(res, r);

    // 把页面里的图片下载下来，注册成普通附件，
    // 前端拿到 fileIds 直接当作「已上传的图片」用
    const fsMod = await import('node:fs');
    const osMod = await import('node:os');
    const pathMod = await import('node:path');
    const filesMod = await import('../services/files.js');

    const saved = [];
    // 原文配图全量保存（最多 24 张），前端会按顺序铺在正文里
    const urls = Array.isArray(r.imageUrls) ? r.imageUrls.slice(0, 24) : [];
    for (let i = 0; i < urls.length; i++) {
      const img = await webMod.downloadImage(urls[i], r.url);
      if (!img) continue;
      let tmp = '';
      try {
        tmp = pathMod.join(osMod.tmpdir(), 'xyll-url-' + Date.now() + '-' + i + '.' + img.ext);
        fsMod.writeFileSync(tmp, img.buffer);
        const rec = await filesMod.registerStoredFile({
          srcPath: tmp,
          name: '网页图片-' + (i + 1) + '.' + img.ext,
          mime: img.mime,
          opts: { ownerId: user?.id || 'guest', role: 'attachment' },
        });
        saved.push(filesMod.filePublic(rec));
      } catch (err) {
        console.error('[fetch-url] 保存网页图片失败:', urls[i], err && err.message);
        try { if (tmp) fsMod.unlinkSync(tmp); } catch { /* ignore */ }
      }
    }

    const raw = String(r.rawHtml || '');
    const out = { ...r };
    delete out.rawHtml;
    delete out.imageUrls;
    out.files = saved;
    out.imageCount = saved.length;
    void raw;
    return data(res, out);
  });

  /** AI 帮写资讯：给素材，出标题 / 摘要 / 正文 */
  app.post('/api/ai/news-write', async (req, res) => {
    const user = mustAuth(req);
    const rl = rateLimit(`newswrite:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return fail(res, `操作太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const source = str(req.body?.source, 12000);
    if (!source.trim()) return fail(res, '请先把素材贴进来', 400, 'empty');

    const aiMod = await import('../services/ai.js');
    const r = await aiMod.writeNews({
      source,
      hint: str(req.body?.hint, 300),
      sourceName: str(req.body?.sourceName, 60),
    });
    if (!r.ok) return data(res, { ok: false, note: r.note });
    return data(res, { ok: true, title: r.title, summary: r.summary, text: r.text, chars: r.text.length });
  });

  /** 从一段文字里识别联系人 / 电话 / 微信 / 企业名 */
  app.post('/api/ai/contact', async (req, res) => {
    const rl = rateLimit(`aic:${clientIp(req)}`, 30, 60_000);
    if (!rl.ok) return fail(res, `请求过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const text = str(req.body?.text, 2000);
    if (!text.trim()) return fail(res, '请先粘贴一段包含联系方式的文字', 400, 'empty');

    const r = await ai.extractContactInfo({ text });
    return data(res, r);
  });

  /* ---------------------------------------------------------------- */
  /* 实时事件流（SSE）                                                  */
  /* ---------------------------------------------------------------- */
  /* AI 搜索：把一句话需求解析成条件，再按条件检索 */
  app.post('/api/ai/search', async (req, res) => {
    const q = str(req.body?.q, 200);
    if (!q) return fail(res, '请输入搜索内容', 400, 'empty_query');
    // 每个 IP 每分钟最多 20 次 AI 搜索
    const rl = rateLimit(`ai-search:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) return fail(res, `搜索太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    const parsed = await ai.parseSearchIntent(q);
    const result = listingsSvc.searchWithIntent(parsed, { limit: 40 });
    return data(res, {
      parsed,
      items: result.items,
      total: result.total,
    });
  });

  /* ---------------------------------------------------------------- */
  /* 地址定位                                                          */
  /* ---------------------------------------------------------------- */

  /** 高德今日用量（管理员看配额） */
  app.get('/api/admin/geo/usage', (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '只有管理员可以操作', 403, 'forbidden');
    return data(res, { amapEnabled: amapEnabled(), ...amapUsage() });
  });

  /** 地址 → 经纬度候选（发布信息时用） */
  app.get('/api/geo/search', async (req, res) => {
    const q = str(req.query.q, 120).trim();
    if (!q) return fail(res, '请输入地址', 400, 'empty_query');
    // 每个 IP 每分钟最多 20 次地址解析，防止有人刷高德配额
    const rl = rateLimit(`geo-search:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) return fail(res, `操作太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    const items = await geocodeAddress(q);
    return data(res, { items });
  });

  /** 经纬度 → 地址（点了「获取当前位置」之后反查） */
  app.get('/api/geo/reverse', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail(res, '坐标不合法', 400, 'bad_request');
    }
    const address = await reverseGeocode(lat, lng);
    return data(res, { address });
  });

  /**
   * 高德静态地图代理。
   *
   * 为什么不直接把高德的 URL 给前端：
   * Key 是「Web服务」类型，暴露在前端等于公开，容易被刷额度。
   * 走服务端代理，Key 只在服务器上，前端只看到 /api/geo/staticmap。
   */
  app.get('/api/geo/staticmap', async (req, res) => {
    if (!amapEnabled()) return fail(res, '未配置高德 Key', 503, 'no_amap');
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail(res, '坐标不合法', 400, 'bad_request');
    }
    // 每个 IP 每分钟最多 40 次地图请求（图有磁盘缓存，正常浏览远低于这个数）
    const rl = rateLimit(`geo-map:${clientIp(req)}`, 40, 60_000);
    if (!rl.ok) return fail(res, `请求太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    const zoom = Math.min(18, Math.max(10, Number(req.query.zoom) || 15));
    const img = await fetchStaticMap({ lat, lng, zoom, width: 690, height: 300 });
    if (!img) return fail(res, '地图生成失败', 502, 'map_failed');
    res.set('Content-Type', img.contentType || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.end(img.body);
  });

  /* 名片 / 截图 → 联系信息（视觉模型） */
  app.post('/api/ai/contact-image', async (req, res) => {
    const user = mustAuth(req);
    const images = Array.isArray(req.body?.images) ? req.body.images.filter((x) => typeof x === 'string' && x.startsWith('data:image/')) : [];
    if (!images.length) return fail(res, '请上传一张名片或截图', 400, 'no_image');
    // 单张别超过 4MB，避免把视觉接口打爆
    if (images.some((x) => x.length > 5.5 * 1024 * 1024)) {
      return fail(res, '图片太大，请压缩后再传', 400, 'too_large');
    }
    // 每个 IP 每分钟最多 15 次名片识别
    const rl = rateLimit(`ai-card:${clientIp(req)}`, 15, 60_000);
    if (!rl.ok) return fail(res, `识别太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    const r = await ai.extractContactFromImages({ images });
    return data(res, r);
  });

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