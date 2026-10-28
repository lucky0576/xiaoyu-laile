/**
 * 信息路由：项目 / 活动 / 贸易 的发布、对接、留言、流程、报名
 */
import { httpError } from '../http/app.js';
import {
  data, fail, num, bool, list, str, baseUrl, authUser, mustAuth, queryOf,
  rateLimit, clientIp,
} from './_util.js';
import listingsSvc, { CATEGORY_IDS } from '../services/listings.js';
import { saveUploads, filePublic, getFile } from '../services/files.js';
import { generateCoverFile } from '../services/cover.js';
import { generatePhotoCover, PHOTO_QUERIES, warmPhotoCache } from '../services/photo-cover.js';
import { extractDocCover, canExtractFrom } from '../services/doc-images.js';
import { generateAutoInfo } from '../services/auto-info.js';
import notifySvc from '../services/notify.js';
import ai from '../services/ai.js';
import db from '../store/db.js';
import { buildDocument } from '../services/documents.js';
import casesSvc from '../services/cases.js';
import filesecure from '../services/filesecure.js';

const listings = () => db.collection('listings');

function buildEvent(body) {
  return {
    startAt: str(body.startAt, 40),
    endAt: str(body.endAt, 40),
    address: str(body.address, 200),
    online: bool(body.online),
    capacity: num(body.capacity),
    fee: num(body.fee),
    needPay: bool(body.needPay) && num(body.fee) > 0,
    registerDeadline: str(body.registerDeadline, 40),
    organizer: str(body.organizer, 120),
    // 外部报名链接：主办方有自己报名系统时直接填，详情页按钮跳过去
    registerUrl: str(body.registerUrl, 500),
    agenda: str(body.agenda, 4000),
  };
}

function buildTrade(body) {
  const out = {
    tradeType: str(body.tradeType || body.type, 40),
    quantity: str(body.quantity, 60),
    unit: str(body.unit, 20),
    price: str(body.price, 60),
    payment: str(body.payment, 100),
    delivery: str(body.delivery, 100),
    deadline: str(body.deadline, 40),
    destination: str(body.destination, 100),
  };
  // 物资明细：只有前端真的提交了这个字段才覆盖，
  // 否则编辑其它字段时会把已有的明细冲掉
  if (body.items !== undefined) {
    out.items = listingsSvc.normalizeTradeItems(body.items);
  }
  return out;
}

function buildBounty(body) {
  const out = {};
  if (body.bounty !== undefined) return body.bounty;
  // 也支持字段平铺提交
  for (const k of ['bountyType', 'reward', 'rewardUnit', 'settleMode', 'deadline', 'deliverable', 'eligibility', 'winnerCount', 'extra']) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

function buildProject(body) {
  return {
    investAmount: str(body.investAmount, 60),
    stage: str(body.stage, 60),
    cooperation: str(body.cooperation, 120),
    period: str(body.period, 60),
    target: str(body.target, 200),
  };
}

export default function registerListingRoutes(app) {
  /* ---------------------------------------------------------------- */
  /* 列表                                                              */
  /* ---------------------------------------------------------------- */
  app.get('/api/listings', (req, res) => {
    const q = queryOf(req);
    const viewer = authUser(req);
    const result = listingsSvc.queryListings({
      category: String(q.category || ''),
      type: String(q.type || ''),
      industry: String(q.industry || ''),
      sub: String(q.sub || ''),
      city: String(q.city || ''),
      q: String(q.q || ''),
      status: String(q.status || 'published'),
      ownerId: String(q.ownerId || ''),
      sort: String(q.sort || 'latest'),
      page: q.page,
      pageSize: q.pageSize,
      followedBy: String(q.followedBy || (q.mine === 'followed' && viewer ? viewer.id : '')),
    });
    return data(res, result);
  });

  app.get('/api/my/listings', (req, res) => {
    const user = mustAuth(req);
    const q = queryOf(req);
    const result = listingsSvc.queryListings({
      status: String(q.status || 'all'),
      ownerId: user.id,
      page: q.page,
      pageSize: q.pageSize,
      sort: String(q.sort || 'latest'),
    });
    return data(res, { ...result, stats: listingsSvc.statsFor(user.id) });
  });

  app.get('/api/my/registrations', (req, res) => {
    const user = mustAuth(req);
    return data(res, { items: listingsSvc.myRegistrations(user.id) });
  });

  app.get('/api/my/overview', (req, res) => {
    const user = mustAuth(req);
    return data(res, {
      stats: listingsSvc.statsFor(user.id),
      unread: notifySvc.unreadCount(user.id),
      following: notifySvc.followingOf(user.id).length,
      recent: listingsSvc.queryListings({ ownerId: user.id, status: 'all', pageSize: 5 }).items,
    });
  });

  /* ---------------------------------------------------------------- */
  /* 创建                                                              */
  /* ---------------------------------------------------------------- */
  app.post('/api/listings', async (req, res) => {
    const user = mustAuth(req);
    const body = req.body || {};

    // 链接先校验，别等 createListing 落库了才抛错（会留下孤儿记录）
    if (body.link !== undefined) {
      const raw = String(body.link || '').trim().slice(0, 500);
      if (raw && !/^https?:\/\/[^\s<>"']+$/i.test(raw)) {
        throw httpError(400, '链接必须以 http:// 或 https:// 开头');
      }
    }

    const uploaded = await saveUploads(req, { ownerId: user.id, listingId: '' });
    // 复用前端预先上传的文件（配合 /api/files）
    const reused = list(body.fileIds).map((fid) => getFile(fid)).filter(Boolean);
    const files = [...reused, ...uploaded];

    // 分类白名单直接用 taxonomy 里的定义，别在这里再抄一份
    // （之前抄了一份忘了同步，悬赏会被回落成 project）
    const category = CATEGORY_IDS.includes(body.category) ? body.category : 'project';
    const doc = await listingsSvc.createListing({
      user,
      body: {
        ...body,
        text: str(body.text || body.content, 40000),
        durationDays: num(body.durationDays, 30),
        hideContact: bool(body.hideContact),
      },
      files,
    });

    // 活动 / 贸易 / 项目 的结构化字段在创建后补写（避免 createListing 变复杂）
    const patch = {};
    if (category === 'event') patch.event = { ...doc.event, ...buildEvent(body), registered: 0 };
    if (category === 'trade') patch.trade = { ...doc.trade, ...buildTrade(body) };
    if (category === 'project') patch.project = { ...doc.project, ...buildProject(body) };
    if (category === 'bounty') patch.bounty = { ...doc.bounty, ...buildBounty(body) };
    // 相关链接（可选）：外部网页 / 官网 / 网盘等
    // 合法性已在入口校验过，这里只做落库
    if (body.link !== undefined) {
      patch.link = String(body.link || '').trim().slice(0, 500);
    }

    // 内容段落（可选）：发布时可以加多段文字 + 图片
    if (body.blocks) {
      try {
        const raw = typeof body.blocks === 'string' ? JSON.parse(body.blocks) : body.blocks;
        if (Array.isArray(raw)) {
          const now = new Date().toISOString();
          patch.blocks = raw
            .slice(0, 20)
            .map((b) => {
              // 兼容两种字段名：files 优先，旧数据用 images
              const list = Array.isArray(b && b.files)
                ? b.files
                : Array.isArray(b && b.images)
                  ? b.images
                  : [];
              return {
                id: `bk_${Math.random().toString(36).slice(2, 10)}`,
                text: String(b && b.text ? b.text : '').slice(0, 4000),
                files: list.slice(0, 20).map(String),
                at: now,
              };
            })
            .filter((b) => b.text || b.files.length);
        }
      } catch {
        /* 段落格式错误不影响发布 */
      }
    }

    // 发布位置（可选）：用户勾选才收录，public 决定是否对其他人可见
    if (body.location) {
      try {
        const loc = typeof body.location === 'string' ? JSON.parse(body.location) : body.location;
        if (loc && (loc.lat || loc.address)) {
          patch.location = {
            public: Boolean(loc.public),
            lat: Number(loc.lat) || 0,
            lng: Number(loc.lng) || 0,
            address: String(loc.address || '').slice(0, 200),
          };
        }
      } catch {
        /* 位置解析失败不影响发布 */
      }
    }

    if (Object.keys(patch).length) listings().update(doc.id, patch);

    // 回填文件的归属
    for (const f of files) db.collection('files').update(f.id, { listingId: doc.id });

    const created = listings().get(doc.id);

      // 发布时自动补全：无图生成封面 + AI 提炼补充信息要素
      if (bool(body.publish) && !bool(body.skipAuto)) {
        try {
          const fresh = listings().get(created.id);
          const autoPatch = {};
          if (!fresh.coverUrl) {
            /*
             * 第一优先：附件里 PDF / PPT / Word 内嵌的图片。
             * 用户只传了招标文件或方案 PPT 时，文件里的现场照 / 效果图
             * 比合成封面贴切得多。
             */
            // 最多试 2 个文件、每个 10 秒：发布不能被抽图拖太久
            const docCandidates = (files || []).filter(canExtractFrom).slice(0, 2);
            for (const df of docCandidates) {
              const docCover = await Promise.race([
                extractDocCover(df, { ownerId: user.id }).catch(() => null),
                new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
              ]);
              if (docCover && docCover.url) {
                autoPatch.coverUrl = docCover.url;
                autoPatch.coverFileId = docCover.id;
                autoPatch.coverFrom = 'document';
                db.collection('files').update(docCover.id, { listingId: fresh.id });
                console.log('[listings] 用文档内图片作封面:', df.name, '→', docCover.url);
                break;
              }
            }

            /*
             * 没有可用文档图片时，退回「实景照片 + 标题 + 城市徽标」的封面：
             * 按标题推断行业，去 Wikimedia Commons 找一张对口照片，
             * 用 ffmpeg 压上文字。找不到图或合成失败，再退回渐变 SVG。
             */
            /*
             * 加超时保护：跨境下载图片可能慢到二三十秒，
             * 不能让「发布」按钮干等着。12 秒内没拿到就直接退回渐变封面，
             * 用户先把信息发出去要紧。
             */
            const photoCover = autoPatch.coverUrl
              ? null
              : await Promise.race([
              generatePhotoCover(
                {
                  title: fresh.title,
                  subtitle: fresh.subtitle || "",
                  category: fresh.category,
                  categoryName: listingsSvc.categoryName(fresh.category),
                  city: fresh.cities && fresh.cities[0] ? fresh.cities[0].name : "",
                  industry: fresh.industries && fresh.industries[0] ? fresh.industries[0].name : "",
                  kindLabel: fresh.typeName || "",
                },
                { ownerId: user.id, listingId: fresh.id }
              ).catch(() => null),
              new Promise((resolve) => setTimeout(() => resolve(null), 12000)),
            ]);
            if (photoCover) {
              autoPatch.coverUrl = photoCover.url;
              autoPatch.coverFileId = photoCover.id;
              db.collection("files").update(photoCover.id, { listingId: fresh.id });
            }
          }
          if (!autoPatch.coverUrl && !fresh.coverUrl) {
            const cover = await generateCoverFile(
              {
                title: fresh.title,
                category: fresh.category,
                city: fresh.cities && fresh.cities[0] ? fresh.cities[0].name : "",
                industry: fresh.industries && fresh.industries[0] ? fresh.industries[0].name : "",
                kindLabel: fresh.typeName || "",
              },
              { ownerId: user.id, listingId: fresh.id }
            );
            if (cover) {
              autoPatch.coverUrl = cover.url;
              autoPatch.coverFileId = cover.id;
              db.collection("files").update(cover.id, { listingId: fresh.id });
            }
          }
          autoPatch.autoInfo = await generateAutoInfo(fresh);
          listings().update(fresh.id, autoPatch);
        } catch (err) {
          console.error("[listings] 自动补全失败:", err.message);
        }
      }

    // 允许创建即发布
    if (bool(body.publish)) {
      const published = await listingsSvc.publishListing(created.id, user, { days: num(body.durationDays, 30) });
      return data(res, { listing: listingsSvc.listingPublic(published, user), published: true }, 201);
    }
    return data(res, { listing: listingsSvc.listingPublic(created, user), published: false }, 201);
  });

  /* ---------------------------------------------------------------- */
  /* 详情                                                              */
  /* ---------------------------------------------------------------- */
  app.get('/api/listings/:id', (req, res) => {
    const viewer = authUser(req);
    let listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');

    const isOwner = viewer && viewer.id === listing.ownerId;
    if (listing.status === 'draft' && !isOwner && !viewer?.isAdmin) {
      throw httpError(403, '该信息尚未发布');
    }
    // 已下架 / 已隐藏的信息必须真的不可见：
    // 列表接口默认只查 published，但分享出去的链接能直接打开详情，
    // 这里补上，否则"隐藏"形同虚设。
    if (['closed', 'hidden', 'removed'].includes(listing.status) && !isOwner && !viewer?.isAdmin) {
      throw httpError(410, '该信息已下架');
    }
    const unlocked =
      isOwner ||
      Boolean(viewer && ((listing.memberIds || []).includes(viewer.id) || viewer.isAdmin));
    listing = listingsSvc.viewListing(listing.id, viewer);
    return data(res, {
      listing: listingsSvc.listingPublic(listing, viewer, { unlocked }),
      // 项目推进流程只对「项目」有意义；活动/贸易/悬赏/成果一律不返回，
      // 否则活动详情页会冒出一个「项目推进流程」板块
      pipeline: listing.category === 'project' ? listingsSvc.pipelineOf(listing) : [],
      chatRoomId: listing.chatRoomId || '',
      isOwner: Boolean(isOwner),
    });
  });

  app.put('/api/listings/:id', async (req, res) => {
    const user = mustAuth(req);
    const b = req.body || {};
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    const patch = { ...b };
    if (l.category === 'event' && (b.startAt !== undefined || b.fee !== undefined)) {
      patch.event = { ...l.event, ...buildEvent(b) };
    }
    if (l.category === 'trade' && (b.quantity !== undefined || b.price !== undefined)) {
      patch.trade = { ...l.trade, ...buildTrade(b) };
    }
    if (l.category === 'project' && (b.investAmount !== undefined || b.stage !== undefined)) {
      patch.project = { ...l.project, ...buildProject(b) };
    }
    if (l.category === 'bounty' && (b.reward !== undefined || b.bountyType !== undefined || b.bounty !== undefined)) {
      patch.bounty = { ...l.bounty, ...buildBounty(b) };
    }
    // updateListing 是 async 的：必须 await，否则拿到的是 Promise，
    // listingPublic 会把 Promise 当对象展开，响应里返回一个空壳
    const updated = await listingsSvc.updateListing(req.params.id, user, patch);
    return data(res, { listing: listingsSvc.listingPublic(updated, user) });
  });

  app.del('/api/listings/:id', (req, res) => {
    const user = mustAuth(req);
    listingsSvc.removeListing(req.params.id, user);
    return data(res, { ok: true });
  });

  /* ---------------------------------------------------------------- */
  /* 管理员：批量补封面                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * 给还没有封面的信息生成品牌色封面。
   *
   * 用法：POST /api/admin/covers/backfill  { category?: 'ecommerce'|'project'|..., limit?: 50 }
   * 生成的是品牌色 + 标题的 SVG 封面，不依赖外部图片。
   */
  /**
   * 给单条信息生成「实景照片 + 标题 + 城市徽标」封面。
   *
   * 用法：POST /api/admin/covers/photo  { listingId, force? }
   * 会覆盖已有封面；生成失败返回 ok:false，由前端决定是否退回 SVG。
   */
  /**
   * 后台批量换封面用：返回「可以换」的信息列表。
   * 已经上传过实拍图的信息会跳过，绝不覆盖用户内容。
   */
  app.get('/api/admin/covers/candidates', (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '只有管理员可以操作', 403, 'forbidden');
    const all = listingsSvc.queryListings({ status: 'published', pageSize: 500 }).items;
    const items = [];
    let skipped = 0;
    for (const it of all) {
      const raw = listings().get(it.id);
      if (!raw) continue;
      // 用户自己传过图片的不动
      const rawFiles = (raw.files || []).map((id) => db.collection('files').get(id)).filter(Boolean);
      const hasUserImage = rawFiles.some((f) => f.kind === 'image');
      if (hasUserImage) {
        skipped += 1;
        continue;
      }
      items.push({ id: raw.id, title: raw.title, coverUrl: raw.coverUrl || '' });
    }
    return data(res, { items, skipped, total: all.length });
  });

  /** 后台预热图片缓存：返回全部搜索词 */
  app.get('/api/admin/covers/queries', (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '只有管理员可以操作', 403, 'forbidden');
    return data(res, { queries: PHOTO_QUERIES });
  });

  /** 后台预热图片缓存：预热单个搜索词（前端逐个调，避免一次请求太久） */
  app.post('/api/admin/covers/warm', async (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '只有管理员可以操作', 403, 'forbidden');
    const q = str(req.body?.query, 120);
    if (!q) return fail(res, '缺少 query', 400, 'bad_request');
    const r = await warmPhotoCache(q);
    return data(res, r);
  });

  app.post('/api/admin/covers/photo', async (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '只有管理员可以操作', 403, 'forbidden');
    const raw = listings().get(str(req.body?.listingId, 40));
    if (!raw) return fail(res, '信息不存在', 404, 'not_found');
    if (raw.coverUrl && !bool(req.body?.force)) {
      return data(res, { ok: false, note: '已有封面，加 force=true 可覆盖', coverUrl: raw.coverUrl });
    }
    const cover = await generatePhotoCover(
      {
        title: raw.title,
        subtitle: raw.subtitle || '',
        category: raw.category,
        categoryName: listingsSvc.categoryName(raw.category),
        city: raw.cities && raw.cities[0] ? raw.cities[0].name : '',
        industry: raw.industries && raw.industries[0] ? raw.industries[0].name : '',
        kindLabel: raw.typeName || '',
      },
      { ownerId: raw.ownerId || user.id, listingId: raw.id },
    );
    if (!cover) return data(res, { ok: false, note: '没找到合适的图片或合成失败' });
    listings().update(raw.id, { coverUrl: cover.url, coverFileId: cover.id });
    db.collection('files').update(cover.id, { listingId: raw.id });
    return data(res, { ok: true, coverUrl: cover.url });
  });

  app.post('/api/admin/covers/backfill', async (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '只有管理员可以操作', 403, 'forbidden');

    const category = str(req.body?.category, 20);
    const limit = Math.min(100, num(req.body?.limit, 50));

    // 电商是聚合视图，要按归集规则挑
    let target;
    if (category === 'ecommerce') {
      target = listingsSvc
        .queryListings({ status: 'published', pageSize: 500 })
        .items.filter((x) => x.isEcommerce || (x.category === 'trade' && x.type === 'supply') || (x.category === 'project' && ['transfer', 'acquisition'].includes(x.type)));
    } else if (category) {
      target = listingsSvc.queryListings({ category, status: 'published', pageSize: 500 }).items;
    } else {
      target = listingsSvc.queryListings({ status: 'published', pageSize: 500 }).items;
    }

    // force=true 时连已有封面的一起重做（换样式或修文案后用）
    const force = bool(req.body?.force);
    const need = (force ? target : target.filter((x) => !x.coverUrl)).slice(0, limit);

    let ok = 0;
    let fail = 0;
    for (const item of need) {
      try {
        const raw = listingsSvc.getListing(item.id);
        if (!raw) continue;
        const cover = await generateCoverFile(
          {
            title: raw.title,
            category: raw.category,
            city: raw.cities && raw.cities[0] ? raw.cities[0].name : '',
            industry: raw.industries && raw.industries[0] ? raw.industries[0].name : '',
            kindLabel: raw.typeName || '',
          },
          { ownerId: user.id, listingId: raw.id },
        );
        if (!cover) {
          fail += 1;
          continue;
        }
        // 这里要绕过 updateListing 的白名单，直接写库
        listings().update(raw.id, {
          coverUrl: cover.url,
          coverFileId: cover.id,
          updatedAt: new Date().toISOString(),
        });
        db.collection('files').update(cover.id, { listingId: raw.id });
        ok += 1;
      } catch {
        fail += 1;
      }
    }

    return data(res, { total: need.length, ok, fail });
  });

  app.post('/api/listings/:id/regenerate', async (req, res) => {
    const user = mustAuth(req);
    const updated = await listingsSvc.regenerateAI(req.params.id, user, req.body || {});
    return data(res, { listing: listingsSvc.listingPublic(updated, user) });
  });

  /* ---------------------------------------------------------------- */
  /* 发布 / 续期 / 下架                                                 */
  /* ---------------------------------------------------------------- */
  app.post('/api/listings/:id/publish', (req, res) => {
    const user = mustAuth(req);
    const updated = listingsSvc.publishListing(req.params.id, user, { days: num(req.body?.days, 30) });
    return data(res, { listing: listingsSvc.listingPublic(updated, user) });
  });

  app.post('/api/listings/:id/renew', (req, res) => {
    const user = mustAuth(req);
    const updated = listingsSvc.renewListing(req.params.id, user, num(req.body?.days, 30));
    return data(res, { listing: listingsSvc.listingPublic(updated, user) });
  });

  app.post('/api/listings/:id/close', (req, res) => {
    const user = mustAuth(req);
    const updated = listingsSvc.closeListing(req.params.id, user, str(req.body?.reason, 300));
    return data(res, { listing: listingsSvc.listingPublic(updated, user) });
  });

  app.post('/api/listings/:id/like', (req, res) => {
    const user = mustAuth(req);
    const updated = listingsSvc.toggleLike(req.params.id, user);
    return data(res, { likeCount: updated.likeCount, liked: (updated.likedBy || []).includes(user.id) });
  });

  /* ---------------------------------------------------------------- */
  /* 留言                                                              */
  /* ---------------------------------------------------------------- */
  app.get('/api/listings/:id/comments', (req, res) => {
    const viewer = authUser(req);
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    const result = listingsSvc.listComments(req.params.id, {
      limit: num(req.query.limit, 300),
      includeInternal: Boolean(viewer && (viewer.id === listing.ownerId || viewer.isAdmin)),
    });
    return data(res, { ...result, total: result.tree.length || result.total });
  });

  app.post('/api/listings/:id/comments', async (req, res) => {
    const user = mustAuth(req);
    const files = await saveUploads(req, { ownerId: user.id, listingId: req.params.id, role: 'comment' });
    const wantReply = req.body?.aiReply === undefined ? true : bool(req.body.aiReply);
    const { comment, aiComment } = await listingsSvc.addComment(
      req.params.id,
      user,
      str(req.body?.content, 2000),
      { parentId: str(req.body?.parentId, 60), files, aiReply: wantReply },
    );
    return data(res, { comment, aiComment }, 201);
  });

  app.del('/api/comments/:id', (req, res) => {
    const user = mustAuth(req);
    listingsSvc.deleteComment(req.params.id, user);
    return data(res, { ok: true });
  });

  /** 让 AI 对某条留言生成回复（不落库，仅预览/重试） */
  app.post('/api/listings/:id/ai-reply', async (req, res) => {
    mustAuth(req);
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    const files = (listing.files || []).map((fid) => db.collection('files').get(fid)).filter(Boolean);
    const result = await ai.replyComment({
      listing: { ...listing, fileText: files.map((f) => f.text || '').join('\n').slice(0, 3000) },
      comment: { content: str(req.body?.content, 1000) },
      history: [],
    });
    return data(res, result);
  });

  /* ---------------------------------------------------------------- */
  /* 后续跟进                                                          */
  /* ---------------------------------------------------------------- */
  app.post('/api/listings/:id/follow-ups', async (req, res) => {
    const user = mustAuth(req);
    // 内容更新只允许发布方（管理员可代操作）追加
    const target = listingsSvc.getListing(req.params.id);
    if (!target) throw httpError(404, '信息不存在');
    if (target.ownerId !== user.id && !user.isAdmin) {
      return fail(res, '只有发布方可以追加内容更新', 403, 'forbidden');
    }
    const files = await saveUploads(req, { ownerId: user.id, listingId: req.params.id, role: 'followup' });
    const entry = listingsSvc.addFollowUp(req.params.id, user, {
      text: str(req.body?.text || req.body?.content, 4000),
      fileIds: files.map((f) => f.id),
    });
    return data(res, { entry, files: files.map(filePublic) }, 201);
  });

  /* ---------------------------------------------------------------- */
  /* 项目流程（14 步）                                                  */
  /* ---------------------------------------------------------------- */
  app.get('/api/listings/:id/pipeline', (req, res) => {
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    return data(res, {
      stages: listingsSvc.pipelineOf(listing),
      history: listing.pipeline?.history || [],
      current: listing.pipeline?.stage,
      awaitingConfirm: Boolean(listing.awaitingConfirm),
      agreements: (listing.agreements || []).map((fid) => filePublic(db.collection('files').get(fid))).filter(Boolean),
      followUps: listing.followUps || [],
    });
  });

  app.post('/api/listings/:id/pipeline', async (req, res) => {
    const user = mustAuth(req);
    const files = await saveUploads(req, { ownerId: user.id, listingId: req.params.id, role: 'pipeline' });
    const result = listingsSvc.advancePipeline(req.params.id, user, {
      stageId: str(req.body?.stage || req.body?.stageId || 'next', 60),
      note: str(req.body?.note, 1000),
      fileIds: files.map((f) => f.id),
      toUserId: str(req.body?.toUserId, 60),
    });
    return data(res, { ...result, stages: result.stages, files: files.map(filePublic) });
  });

  app.post('/api/listings/:id/pipeline/confirm', (req, res) => {
    const user = mustAuth(req);
    const updated = listingsSvc.confirmStage(req.params.id, user, {
      stageId: str(req.body?.stage, 60),
      agree: req.body?.agree === undefined ? true : bool(req.body.agree),
      note: str(req.body?.note, 500),
    });
    return data(res, { listing: listingsSvc.listingPublic(updated, user) });
  });

  /* ---------------------------------------------------------------- */
  /* 阶段 2：上传资质审核                                              */
  /*   意向方提交资质 -> AI 逐项核对 -> 发布方确认                       */
  /* ---------------------------------------------------------------- */
  app.get('/api/listings/:id/qualification', (req, res) => {
    const user = authUser(req);
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    return data(res, {
      qualification: listingsSvc.qualificationSummary(listing, user?.id || ''),
      isOwner: user ? listing.ownerId === user.id : false,
    });
  });

  app.post('/api/listings/:id/qualification', async (req, res) => {
    const user = mustAuth(req);
    const files = await saveUploads(req, { ownerId: user.id, listingId: req.params.id, role: 'qualification' });

    let items = req.body?.items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    if (!Array.isArray(items)) items = [];

    let indexes = req.body?.itemIndexes;
    if (typeof indexes === 'string') {
      try { indexes = JSON.parse(indexes); } catch { indexes = []; }
    }
    if (!Array.isArray(indexes)) indexes = [];

    const uploadedIds = files.map((f) => f.id);
    if (uploadedIds.length) {
      if (items.length) {
        // 每个上传文件按 itemIndexes 归到对应的资质条目上
        items = items.map((it) => ({ ...it, fileIds: Array.isArray(it?.fileIds) ? [...it.fileIds] : [] }));
        uploadedIds.forEach((fid, i) => {
          const target = Number(indexes[i]);
          const idx = Number.isInteger(target) && target >= 0 && target < items.length ? target : 0;
          items[idx].fileIds.push(fid);
        });
      } else {
        items = [{ name: str(req.body?.name, 80) || '资质文件', fileIds: uploadedIds }];
      }
    }

    const result = listingsSvc.submitQualification(req.params.id, user, {
      items,
      note: str(req.body?.note, 1000),
    });
    return data(res, { ...result, files: files.map(filePublic) }, 201);
  });

  app.post('/api/listings/:id/qualification/review', (req, res) => {
    const user = mustAuth(req);
    const result = listingsSvc.reviewQualification(req.params.id, user, {
      userId: str(req.body?.userId, 60),
      agree: req.body?.agree === undefined ? true : bool(req.body.agree),
      note: str(req.body?.note, 500),
    });
    return data(res, { listing: listingsSvc.listingPublic(result.listing, user), submission: result.submission });
  });

  /* ---------------------------------------------------------------- */
  /* 阶段 4/5/7：邀请函、居间协议、正式合约（文档生成）                  */
  /* ---------------------------------------------------------------- */
  app.get('/api/listings/:id/document/:kind', (req, res) => {
    const user = authUser(req);
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    const kind = str(req.params.kind, 30);
    if (!['invitation', 'brokerage', 'contract'].includes(kind)) throw httpError(400, '未知的文书类型');
    return data(res, { doc: buildDocument(kind, listing, user, baseUrl(req), queryOf(req)) });
  });

  /* ---------------------------------------------------------------- */
  /* 案例参考：联网检索同类项目（未配置检索时回退内置行业基准）             */
  /* ---------------------------------------------------------------- */

  /** 检索服务状态：前端据此决定是否展示"实时检索"字样 */
  app.get('/api/search-status', (req, res) => {
    return data(res, casesSvc.searchStatus());
  });

  app.get('/api/listings/:id/cases', async (req, res) => {
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    const payload = await casesSvc.collectCases(listing, { save: true });
    return data(res, { cases: casesSvc.casesPublic(payload) });
  });

  /** 强制重新检索（发布方或管理员） */
  app.post('/api/listings/:id/cases/refresh', async (req, res) => {
    const user = mustAuth(req);
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    if (listing.ownerId !== user.id && !user.isAdmin) throw httpError(403, '只能刷新自己发布的信息');
    const payload = await casesSvc.collectCases(listing, { force: true, save: true });
    return data(res, { cases: casesSvc.casesPublic(payload) });
  });

  /* ---------------------------------------------------------------- */
  /* 文件保密：密码解锁                                                */
  /* ---------------------------------------------------------------- */

  /**
   * 用查看密码换取访问令牌。
   * 加限流：密码短，必须防暴力尝试。
   */
  app.post('/api/listings/:id/files/unlock', (req, res) => {
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    const rl = rateLimit(`unlock:${clientIp(req)}:${req.params.id}`, 10, 60_000);
    if (!rl.ok) return fail(res, `尝试过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');
    const result = filesecure.unlock(listing, req.body?.password);
    return data(res, result);
  });

  /** 当前访问者对该信息附件的权限状态 */
  app.get('/api/listings/:id/files/access', (req, res) => {
    const listing = listingsSvc.getListing(req.params.id);
    if (!listing) throw httpError(404, '信息不存在');
    const viewer = authUser(req);
    const access = filesecure.canAccessFile(listing, { viewer, token: String(req.query.t || '') });
    return data(res, {
      ...filesecure.fileSecretPublic(listing, {
        isOwner: Boolean(viewer && viewer.id === listing.ownerId),
        unlocked: access.allowed,
      }),
      reason: access.reason,
      ttlMin: filesecure.TTL_MIN,
      ttlMax: filesecure.TTL_MAX,
    });
  });

  /* ---------------------------------------------------------------- */
  /* 项目对接                                                          */
  /* ---------------------------------------------------------------- */
  app.post('/api/listings/:id/dock', async (req, res) => {
    const user = mustAuth(req);
    const { startDocking } = await import('../services/chat.js');
    const result = startDocking(req.params.id, user, { note: str(req.body?.note, 500) });
    return data(res, result, 201);
  });

  /* ---------------------------------------------------------------- */
  /* 活动报名                                                          */
  /* ---------------------------------------------------------------- */
  app.post('/api/listings/:id/register', async (req, res) => {
    const user = mustAuth(req);
    const result = listingsSvc.registerForEvent(req.params.id, user, {
      name: str(req.body?.name, 60),
      phone: str(req.body?.phone, 30),
      remark: str(req.body?.remark, 500),
      payMethod: str(req.body?.payMethod, 40),
      company: str(req.body?.company, 100),
      projectName: str(req.body?.projectName, 120),
      fileIds: Array.isArray(req.body?.fileIds) ? req.body.fileIds.slice(0, 10) : [],
    });
    return data(res, result, 201);
  });

  app.get('/api/listings/:id/registrations', (req, res) => {
    const user = mustAuth(req);
    return data(res, { items: listingsSvc.listRegistrations(req.params.id, user) });
  });

  /* 主办方审核报名：action = approved / rejected */
  app.post('/api/listings/:id/registrations/:regId/audit', (req, res) => {
    const user = mustAuth(req);
    return data(
      res,
      listingsSvc.auditRegistration(
        req.params.id,
        req.params.regId,
        user,
        str(req.body?.action, 20),
        str(req.body?.note, 200),
      ),
    );
  });

  /* ---------------------------------------------------------------- */
  /* 我的信息（按状态分组）                                             */
  /* ---------------------------------------------------------------- */
  app.get('/api/my/listings/summary', (req, res) => {
    const user = mustAuth(req);
    const mine = listings().where('ownerId', user.id);
    return data(res, {
      total: mine.length,
      draft: mine.filter((l) => l.status === 'draft').length,
      published: mine.filter((l) => l.status === 'published').length,
      expired: mine.filter((l) => l.status === 'expired').length,
      closed: mine.filter((l) => l.status === 'closed').length,
      expiringSoon: mine.filter((l) => {
        if (l.status !== 'published' || !l.expiresAt) return false;
        const left = new Date(l.expiresAt).getTime() - Date.now();
        return left > 0 && left < 3 * 86400_000;
      }).length,
    });
  });

  /* ---------------------------------------------------------------- */
  /* AI 解析授权                                                       */
  /*   默认只有发布方可见；其他人申请后由发布方决定是否开放              */
  /* ---------------------------------------------------------------- */

  /** 申请查看 AI 解析 */
  app.post('/api/listings/:id/ai-access/request', (req, res) => {
    const user = mustAuth(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');

    const r = listingsSvc.requestAiAccess(l.id, user);
    if (!r) throw httpError(404, '信息不存在');

    // 首次申请时通知发布方
    if (r.first && l.ownerId && l.ownerId !== user.id) {
      notifySvc.notify({
        userId: l.ownerId,
        type: 'system',
        title: `有人申请查看 AI 解析：${String(l.title).slice(0, 20)}`,
        body: `${user.nickname || '某位用户'} 申请查看该信息的 AI 项目解析，请到详情页处理。`,
        link: `#/detail/${l.id}`,
      });
    }

    return data(res, { status: r.status, repeat: Boolean(r.repeat) });
  });

  /** 我的 AI 解析授权状态 */
  app.get('/api/listings/:id/ai-access', (req, res) => {
    const user = authUser(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    const isOwner = Boolean(user && user.id === l.ownerId);
    const isAdmin = Boolean(user && user.isAdmin);
    const granted = Boolean(user && (l.aiGrants || []).includes(user.id));
    const pending = Boolean(
      user && (l.aiRequests || []).some((x) => x.userId === user.id && x.status === 'pending')
    );
    return data(res, { isOwner, isAdmin, granted, pending, visible: isOwner || isAdmin || granted });
  });

  /** 发布方：查看申请列表 */
  app.get('/api/listings/:id/ai-access/requests', (req, res) => {
    const user = mustAuth(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    if (l.ownerId !== user.id && !user.isAdmin) return fail(res, '只有发布方可以查看', 403, 'forbidden');

    const reqs = (l.aiRequests || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const grants = l.aiGrants || [];
    return data(res, {
      items: reqs.map((r) => ({
        userId: r.userId,
        name: r.name || '用户',
        company: r.company || '',
        status: r.status,
        at: r.at,
        respondedAt: r.respondedAt || '',
        note: r.note || '',
        granted: grants.includes(r.userId),
      })),
      pendingCount: reqs.filter((r) => r.status === 'pending').length,
      grantedCount: grants.length,
    });
  });

  /** 发布方：同意 / 拒绝某个申请 */
  app.post('/api/listings/:id/ai-access/:userId/respond', (req, res) => {
    const user = mustAuth(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    if (l.ownerId !== user.id && !user.isAdmin) return fail(res, '只有发布方可以操作', 403, 'forbidden');

    const agree = bool(req.body?.agree);
    const note = str(req.body?.note, 200);
    const r = listingsSvc.respondAiAccess(l.id, req.params.userId, agree, note);
    if (!r || !r.ok) return fail(res, (r && r.reason) || '操作失败', 400, 'bad_request');

    notifySvc.notify({
      userId: req.params.userId,
      type: 'system',
      title: agree ? 'AI 解析查看申请已通过' : 'AI 解析查看申请未通过',
      body: agree
        ? `发布方已同意你查看「${String(l.title).slice(0, 20)}」的 AI 项目解析`
        : note || '发布方暂未同意你查看该项目的 AI 解析',
      link: `#/detail/${l.id}`,
    });

    return data(res, { ok: true, agree });
  });


  /* ---------------------------------------------------------------- */
  /* 附件查看授权                                                      */
  /*   默认只有发布方和管理员能看；其他人申请后由发布方决定              */
  /* ---------------------------------------------------------------- */

  /** 申请查看附件 */
  app.post('/api/listings/:id/file-access/request', (req, res) => {
    const user = mustAuth(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');

    const r = listingsSvc.requestFileAccess(l.id, user);
    if (!r) throw httpError(404, '信息不存在');

    if (r.first && l.ownerId && l.ownerId !== user.id) {
      notifySvc.notify({
        userId: l.ownerId,
        type: 'system',
        title: `有人申请查看项目附件：${String(l.title).slice(0, 20)}`,
        body: `${user.nickname || '某位用户'} 申请查看该信息的附件，请到详情页处理。`,
        link: `#/detail/${l.id}`,
      });
    }

    return data(res, { status: r.status, repeat: Boolean(r.repeat) });
  });

  /** 我的附件授权状态 */
  app.get('/api/listings/:id/file-access', (req, res) => {
    const user = authUser(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    const isOwner = Boolean(user && user.id === l.ownerId);
    const isAdmin = Boolean(user && user.isAdmin);
    const granted = Boolean(user && (l.fileGrants || []).includes(user.id));
    const pending = Boolean(
      user && (l.fileRequests || []).some((x) => x.userId === user.id && x.status === 'pending')
    );
    return data(res, { isOwner, isAdmin, granted, pending, visible: isOwner || isAdmin || granted });
  });

  /** 发布方：附件申请列表 */
  app.get('/api/listings/:id/file-access/requests', (req, res) => {
    const user = mustAuth(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    if (l.ownerId !== user.id && !user.isAdmin) return fail(res, '只有发布方可以查看', 403, 'forbidden');

    const reqs = (l.fileRequests || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const grants = l.fileGrants || [];
    return data(res, {
      items: reqs.map((r) => ({
        userId: r.userId,
        name: r.name || '用户',
        company: r.company || '',
        status: r.status,
        at: r.at,
        respondedAt: r.respondedAt || '',
        note: r.note || '',
        granted: grants.includes(r.userId),
      })),
      pendingCount: reqs.filter((r) => r.status === 'pending').length,
      grantedCount: grants.length,
    });
  });

  /** 发布方：同意 / 拒绝 */
  app.post('/api/listings/:id/file-access/:userId/respond', (req, res) => {
    const user = mustAuth(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    if (l.ownerId !== user.id && !user.isAdmin) return fail(res, '只有发布方可以操作', 403, 'forbidden');

    const agree = bool(req.body?.agree);
    const note = str(req.body?.note, 200);
    const r = listingsSvc.respondFileAccess(l.id, req.params.userId, agree, note);
    if (!r || !r.ok) return fail(res, (r && r.reason) || '操作失败', 400, 'bad_request');

    notifySvc.notify({
      userId: req.params.userId,
      type: 'system',
      title: agree ? '附件查看申请已通过' : '附件查看申请未通过',
      body: agree
        ? `发布方已同意你查看「${String(l.title).slice(0, 20)}」的项目附件`
        : note || '发布方暂未同意你查看该项目的附件',
      link: `#/detail/${l.id}`,
    });

    return data(res, { ok: true, agree });
  });

  /** 发布方：撤销权限 */
  app.post('/api/listings/:id/file-access/:userId/revoke', (req, res) => {
    const user = mustAuth(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    if (l.ownerId !== user.id && !user.isAdmin) return fail(res, '只有发布方可以操作', 403, 'forbidden');
    listingsSvc.revokeFileAccess(l.id, req.params.userId);
    return data(res, { ok: true });
  });

  /** 发布方：撤销某人的查看权限 */
  app.post('/api/listings/:id/ai-access/:userId/revoke', (req, res) => {
    const user = mustAuth(req);
    const l = listingsSvc.getListing(req.params.id);
    if (!l) throw httpError(404, '信息不存在');
    if (l.ownerId !== user.id && !user.isAdmin) return fail(res, '只有发布方可以操作', 403, 'forbidden');
    listingsSvc.revokeAiAccess(l.id, req.params.userId);
    return data(res, { ok: true });
  });
}
