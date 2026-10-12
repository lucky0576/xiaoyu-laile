/**
 * 信息路由：项目 / 活动 / 贸易 的发布、对接、留言、流程、报名
 */
import { httpError } from '../http/app.js';
import {
  data, fail, num, bool, list, str, baseUrl, authUser, mustAuth, queryOf,
} from './_util.js';
import listingsSvc from '../services/listings.js';
import { saveUploads, filePublic, getFile } from '../services/files.js';
import notifySvc from '../services/notify.js';
import ai from '../services/ai.js';
import db from '../store/db.js';
import { buildDocument } from '../services/documents.js';

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
    agenda: str(body.agenda, 4000),
  };
}

function buildTrade(body) {
  return {
    tradeType: str(body.tradeType || body.type, 40),
    quantity: str(body.quantity, 60),
    unit: str(body.unit, 20),
    price: str(body.price, 60),
    payment: str(body.payment, 100),
    delivery: str(body.delivery, 100),
    deadline: str(body.deadline, 40),
    destination: str(body.destination, 100),
  };
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
    const uploaded = await saveUploads(req, { ownerId: user.id, listingId: '' });
    // 复用前端预先上传的文件（配合 /api/files）
    const reused = list(body.fileIds).map((fid) => getFile(fid)).filter(Boolean);
    const files = [...reused, ...uploaded];

    const category = ['project', 'event', 'trade'].includes(body.category) ? body.category : 'project';
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
    if (Object.keys(patch).length) listings().update(doc.id, patch);

    // 回填文件的归属
    for (const f of files) db.collection('files').update(f.id, { listingId: doc.id });

    const created = listings().get(doc.id);
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
      pipeline: listingsSvc.pipelineOf(listing),
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
    });
    return data(res, result, 201);
  });

  app.get('/api/listings/:id/registrations', (req, res) => {
    const user = mustAuth(req);
    return data(res, { items: listingsSvc.listRegistrations(req.params.id, user) });
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
}
