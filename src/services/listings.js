/**
 * 信息（项目 / 活动 / 贸易）领域服务
 *
 * 一条信息从「草稿 → AI 解析 → 发布 → 对接 → 结束」的全生命周期都在这里。
 */
import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';
import ai from './ai.js';
import notifySvc from './notify.js';
import hub from './hub.js';
import { aggregateText, pickCover, filePublic } from './files.js';
import { CATEGORIES, PIPELINE_STAGES, PROJECT_TYPES, TRADE_TYPES, EVENT_TYPES } from '../data/taxonomy.js';

const listings = () => db.collection('listings');
const comments = () => db.collection('comments');
const shares = () => db.collection('shares');
const registrations = () => db.collection('registrations');
const users = () => db.collection('users');

export const CATEGORY_IDS = ['project', 'event', 'trade'];

export function categoryName(id) {
  return CATEGORIES.find((c) => c.id === id)?.name || '信息';
}

const TYPE_POOLS = { project: PROJECT_TYPES, trade: TRADE_TYPES, event: EVENT_TYPES };

/**
 * 解析类型：先按 id 精确匹配，再按中文名匹配，最后原样保留。
 * 这样即使前端传了中文名（或历史数据里存了别名）也能正确显示。
 */
export function resolveType(category, value) {
  if (!value) return { id: '', name: '' };
  const pool = TYPE_POOLS[category] || PROJECT_TYPES;
  const byId = pool.find((t) => t.id === value);
  if (byId) return { id: byId.id, name: byId.name };
  const byName = pool.find((t) => t.name === value);
  if (byName) return { id: byName.id, name: byName.name };
  return { id: String(value), name: '' };
}

export function typeNameOf(category, typeId) {
  const r = resolveType(category, typeId);
  return r.name || r.id || '';
}

/* ------------------------------------------------------------------ */
/* 有效期                                                              */
/* ------------------------------------------------------------------ */
export const DURATION_OPTIONS = [
  { days: 7, label: '7 天', desc: '短期急寻' },
  { days: 15, label: '15 天', desc: '常规对接' },
  { days: 30, label: '30 天', desc: '推荐' },
  { days: 90, label: '90 天', desc: '长周期项目' },
  { days: 180, label: '180 天', desc: '招投标 / 工程' },
  { days: 365, label: '365 天', desc: '常年招商' },
];

function computeExpiry(days, from = Date.now()) {
  const d = Number(days) || 30;
  return new Date(from + d * 86400_000).toISOString();
}

/* ------------------------------------------------------------------ */
/* 视图                                                                */
/* ------------------------------------------------------------------ */
export function listingPublic(l, viewer = null, opts = {}) {
  if (!l) return null;
  const isOwner = viewer && viewer.id === l.ownerId;
  const contact = l.contact || {};
  const hideContact = l.hideContact && !isOwner && !opts.unlocked;
  return {
    ...l,
    categoryName: categoryName(l.category),
    typeName: l.typeName || typeNameOf(l.category, l.type),
    fileList: (l.files || []).map(filePublic).filter(Boolean),
    contact: hideContact
      ? { hidden: true, tip: '发起项目对接后可查看完整联系方式' }
      : contact,
    isOwner: Boolean(isOwner),
    following: viewer ? notifySvc.isFollowing(viewer.id, 'listing', l.id) : false,
    ownerFollowing: viewer && l.ownerId ? notifySvc.isFollowing(viewer.id, 'user', l.ownerId) : false,
  };
}

export function listingBrief(l) {
  if (!l) return null;
  const cover = (l.files || []).find((f) => f.id === l.coverId) || (l.files || []).find((f) => f.kind === 'image');
  return {
    id: l.id,
    category: l.category,
    categoryName: categoryName(l.category),
    type: l.type,
    typeName: l.typeName || typeNameOf(l.category, l.type),
    title: l.title,
    subtitle: l.subtitle,
    summary: (l.ai?.summary || l.text || '').slice(0, 120),
    industries: l.industries || [],
    subs: l.subs || [],
    cities: l.cities || [],
    cover: cover ? filePublic(cover) : null,
    coverUrl: cover ? cover.url : '',
    ownerId: l.ownerId,
    owner: l.ownerSnapshot || null,
    status: l.status,
    publishedAt: l.publishedAt,
    expiresAt: l.expiresAt,
    createdAt: l.createdAt,
    stats: {
      views: l.views || 0,
      comments: l.commentCount || 0,
      followers: l.followerCount || 0,
      shares: l.shareCount || 0,
      likes: l.likeCount || 0,
    },
    reliability: l.ai?.reliability ? { score: l.ai.reliability.score, level: l.ai.reliability.level, label: l.ai.reliability.label } : null,
    event: l.event || null,
    trade: l.trade || null,
    project: l.project || null,
    pipeline: l.pipeline ? { stageIndex: l.pipeline.stageIndex, stage: l.pipeline.stage } : null,
    tags: l.tags || [],
  };
}

/* ------------------------------------------------------------------ */
/* 创建 / 更新                                                         */
/* ------------------------------------------------------------------ */
function nums(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 创建信息。会自动跑 AI：生成主副标题 + 可靠性与风险解析 + 行业/城市归类。
 * @param {{user:object, body:object, files:Array}} args
 */
export async function createListing({ user, body = {}, files = [] }) {
  const category = CATEGORY_IDS.includes(body.category) ? body.category : 'project';
  const text = String(body.text || body.content || '').trim();
  const fileText = aggregateText(files, 14000);
  if (!text && !files.length) {
    throw httpError(400, '请先输入文字内容或导入文件');
  }

  const input = {
    text,
    fileText,
    files: files.map(filePublic),
    filename: files[0]?.name || '',
    category,
    categoryName: categoryName(category),
    company: user.company,
    hasContact: Boolean(body.phone || body.wechat || user.phone),
    hasQualification: user.qualification?.status === 'approved',
  };

  const [titles, analysis] = await Promise.all([ai.generateTitles(input), ai.analyzeProject(input)]);

  const type = body.type || analysis.types?.[0]?.id || '';
  const cover = pickCover(files.map(filePublic), body.coverId);

  const warnings = [];
  const clean = (v) => (typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, 4000) : v);

  const doc = {
    id: newId('l'),
    category,
    type,
    typeName: typeNameOf(category, type),
    title: String(body.title || titles.title || '').slice(0, 120),
    subtitle: String(body.subtitle || titles.subtitle || '').slice(0, 200),
    text,
    textFromFiles: fileText.slice(0, 40000),
    industries: (analysis.industries || []).slice(0, 5),
    subs: (analysis.subs || []).slice(0, 8),
    cities: (analysis.cities || []).slice(0, 5),
    keywords: [...(titles.keywords || []), ...(analysis.keywords || [])].slice(0, 15),
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 12) : [],

    files: files.map((f) => f.id),
    coverId: cover?.id || '',

    ownerId: user.id,
    ownerSnapshot: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      company: user.company,
      verified: Boolean(user.verified || user.qualification?.status === 'approved'),
      industry: user.industry,
      city: user.city,
    },
    company: clean(body.company || user.company || ''),

    contact: {
      name: clean(body.contactName || user.nickname || ''),
      phone: clean(body.phone || user.phone || ''),
      wechat: clean(body.wechat || user.wechatId || ''),
      email: clean(body.email || user.email || ''),
      company: clean(body.company || user.company || ''),
    },
    hideContact: Boolean(body.hideContact),

    status: 'draft',
    publishedAt: null,
    expiresAt: null,
    durationDays: nums(body.durationDays) || 30,

    views: 0,
    commentCount: 0,
    followerCount: 0,
    shareCount: 0,
    likeCount: 0,
    likedBy: [],

    ai: {
      titles: { main: titles.title, subtitle: titles.subtitle, alternatives: titles.alternatives || [], source: titles.source },
      analysis,
      summary: analysis.summary,
      reliability: analysis.reliability,
      source: analysis.source,
      generatedAt: new Date().toISOString(),
    },

    event:
      category === 'event'
        ? {
            startAt: clean(body.startAt || ''),
            endAt: clean(body.endAt || ''),
            address: clean(body.address || ''),
            online: Boolean(body.online),
            capacity: nums(body.capacity),
            fee: nums(body.fee),
            needPay: Boolean(body.needPay) && nums(body.fee) > 0,
            registerDeadline: clean(body.registerDeadline || ''),
            organizer: clean(body.organizer || user.company || ''),
            agenda: clean(body.agenda || ''),
            registered: 0,
          }
        : null,

    trade:
      category === 'trade'
        ? {
            tradeType: clean(body.tradeType || ''),
            quantity: clean(body.quantity || ''),
            unit: clean(body.unit || ''),
            price: clean(body.price || ''),
            payment: clean(body.payment || ''),
            delivery: clean(body.delivery || ''),
            deadline: clean(body.deadline || ''),
            destination: clean(body.destination || ''),
          }
        : null,

    project:
      category === 'project'
        ? {
            investAmount: clean(body.investAmount || ''),
            stage: clean(body.stage || ''),
            cooperation: clean(body.cooperation || ''),
            period: clean(body.period || ''),
            target: clean(body.target || ''),
          }
        : null,

    pipeline: {
      stageIndex: 0,
      stage: PIPELINE_STAGES[0]?.id || 'publish',
      history: [{ stage: PIPELINE_STAGES[0]?.id || 'publish', name: PIPELINE_STAGES[0]?.name || '发布项目', at: new Date().toISOString(), by: user.id, note: '信息创建' }],
    },
    chatRoomId: '',
    meetingIds: [],
    agreements: [],
    followUps: [],
    warnings,
  };

  const created = listings().insert(doc);
  users().update(user.id, {
    stats: { ...user.stats, listings: (user.stats?.listings || 0) + 1 },
  });
  return created;
}

export async function updateListing(id, user, patch = {}) {
  const l = listings().get(id);
  if (!l) throw httpError(404, '信息不存在');
  if (l.ownerId !== user.id && !user.isAdmin) throw httpError(403, '只能编辑自己发布的信息');

  const allowed = [
    'title',
    'subtitle',
    'text',
    'type',
    'industries',
    'subs',
    'cities',
    'tags',
    'keywords',
    'contact',
    'hideContact',
    'company',
    'coverId',
    'event',
    'trade',
    'project',
    'durationDays',
  ];
  const next = {};
  for (const k of allowed) if (patch[k] !== undefined) next[k] = patch[k];
  if (next.type) next.typeName = typeNameOf(l.category, next.type);
  if (next.durationDays && l.status === 'published') {
    next.expiresAt = computeExpiry(next.durationDays, new Date(l.publishedAt || Date.now()).getTime());
    next.expiryReminded = false;
  }
  return listings().update(id, next);
}

export async function regenerateAI(id, user, { text, files } = {}) {
  const l = listings().get(id);
  if (!l) throw httpError(404, '信息不存在');
  if (l.ownerId !== user.id && !user.isAdmin) throw httpError(403, '无权操作');

  const fileRecords = (l.files || []).map((fid) => db.collection('files').get(fid)).filter(Boolean);
  const input = {
    text: text ?? l.text,
    fileText: aggregateText(fileRecords, 14000),
    files: fileRecords.map(filePublic),
    filename: fileRecords[0]?.name || '',
    category: l.category,
    categoryName: categoryName(l.category),
    company: l.company,
    hasContact: Boolean(l.contact?.phone || l.contact?.wechat),
    hasQualification: user.qualification?.status === 'approved',
    extraText: '',
  };
  const [titles, analysis] = await Promise.all([ai.generateTitles(input), ai.analyzeProject(input)]);
  return listings().update(id, {
    ai: {
      titles: { main: titles.title, subtitle: titles.subtitle, alternatives: titles.alternatives || [], source: titles.source },
      analysis,
      summary: analysis.summary,
      reliability: analysis.reliability,
      source: analysis.source,
      generatedAt: new Date().toISOString(),
    },
    keywords: [...(titles.keywords || []), ...(analysis.keywords || [])].slice(0, 15),
    industries: analysis.industries?.length ? analysis.industries : l.industries,
    subs: analysis.subs?.length ? analysis.subs : l.subs,
    cities: analysis.cities?.length ? analysis.cities : l.cities,
  });
}

/* ------------------------------------------------------------------ */
/* 发布 / 续期 / 下架                                                   */
/* ------------------------------------------------------------------ */
export async function publishListing(id, user, { days } = {}) {
  const l = listings().get(id);
  if (!l) throw httpError(404, '信息不存在');
  if (l.ownerId !== user.id && !user.isAdmin) throw httpError(403, '无权发布');
  if (!String(l.text || '').trim() && !(l.files || []).length) {
    throw httpError(400, '请先补充正文内容或上传附件');
  }

  const durationDays = Number(days) || l.durationDays || 30;
  const publishedAt = l.publishedAt || new Date().toISOString();
  const updated = listings().update(id, {
    status: 'published',
    publishedAt,
    expiresAt: computeExpiry(durationDays, new Date(publishedAt).getTime()),
    durationDays,
    expiryReminded: false,
  });

  notifySvc.notify({
    userId: user.id,
    type: 'listing_published',
    title: `发布成功：${updated.title}`,
    body: `有效期 ${durationDays} 天，平台已按「${(updated.industries || []).map((i) => i.name).join('/') || '未分类'}」与「${(updated.cities || []).map((c) => c.name).join('/') || '全国'}」推送。`,
    link: `/#/detail/${id}`,
  });

  try {
    notifySvc.fanOutListing(updated);
  } catch (err) {
    console.warn('[listings] 关注者推送失败:', err.message);
  }
  hub.broadcast('listing_new', listingBrief(updated));
  return updated;
}

export function renewListing(id, user, days) {
  const l = listings().get(id);
  if (!l) throw httpError(404, '信息不存在');
  if (l.ownerId !== user.id && !user.isAdmin) throw httpError(403, '无权操作');
  const durationDays = Number(days) || l.durationDays || 30;
  const base = Math.max(Date.now(), new Date(l.expiresAt || Date.now()).getTime());
  return listings().update(id, {
    status: 'published',
    expiresAt: computeExpiry(durationDays, base),
    durationDays,
    expiryReminded: false,
  });
}

export function closeListing(id, user, reason = '') {
  const l = listings().get(id);
  if (!l) throw httpError(404, '信息不存在');
  if (l.ownerId !== user.id && !user.isAdmin) throw httpError(403, '无权操作');
  return listings().update(id, { status: 'closed', closedAt: new Date().toISOString(), closeReason: reason });
}

export function removeListing(id, user) {
  const l = listings().get(id);
  if (!l) throw httpError(404, '信息不存在');
  if (l.ownerId !== user.id && !user.isAdmin) throw httpError(403, '无权操作');
  comments().removeWhere((c) => c.listingId === id);
  return listings().remove(id);
}

/* ------------------------------------------------------------------ */
/* 浏览 / 点赞 / 分享                                                   */
/* ------------------------------------------------------------------ */
export function viewListing(id, viewer) {
  const l = listings().get(id);
  if (!l) throw httpError(404, '信息不存在');
  if (!viewer || viewer.id !== l.ownerId) listings().bump(id, 'views', 1);
  return listings().get(id);
}

export function toggleLike(id, user) {
  const l = listings().get(id);
  if (!l) throw httpError(404, '信息不存在');
  const liked = (l.likedBy || []).includes(user.id);
  const likedBy = liked ? l.likedBy.filter((x) => x !== user.id) : [...(l.likedBy || []), user.id];
  return listings().update(id, { likedBy, likeCount: likedBy.length });
}

export function recordShare(id, { channel = 'link', userId = '' } = {}) {
  const l = listings().get(id);
  if (!l) throw httpError(404, '信息不存在');
  shares().insert({ id: newId('sh'), listingId: id, channel, userId });
  return listings().bump(id, 'shareCount', 1);
}

/* ------------------------------------------------------------------ */
/* 留言 + AI 自动回复                                                   */
/* ------------------------------------------------------------------ */
export function listComments(listingId, { limit = 200, includeInternal = false } = {}) {
  let list = comments().where('listingId', listingId);
  if (!includeInternal) list = list.filter((c) => !c.internal);
  list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const roots = list.filter((c) => !c.parentId);
  const byParent = new Map();
  for (const c of list) {
    if (!c.parentId) continue;
    if (!byParent.has(c.parentId)) byParent.set(c.parentId, []);
    byParent.get(c.parentId).push(c);
  }
  return {
    total: list.length,
    flat: list.slice(-limit),
    tree: roots.map((r) => ({ ...r, replies: byParent.get(r.id) || [] })),
  };
}

export async function addComment(listingId, user, content, { parentId = '', files = [], aiReply = true } = {}) {
  const l = listings().get(listingId);
  if (!l) throw httpError(404, '信息不存在');
  const text = String(content || '').trim();
  if (!text && !files.length) throw httpError(400, '留言内容不能为空');

  const comment = comments().insert({
    id: newId('c'),
    listingId,
    parentId: parentId || '',
    userId: user.id,
    authorName: user.nickname || '用户',
    authorAvatar: user.avatar || '',
    authorCompany: user.company || '',
    authorVerified: Boolean(user.verified || user.qualification?.status === 'approved'),
    content: text.slice(0, 2000),
    files: files.map((f) => f.id),
    isAI: false,
    isOwner: l.ownerId === user.id,
    likes: 0,
    createdAt: new Date().toISOString(),
  });
  listings().bump(listingId, 'commentCount', 1);

  // 通知发布方
  if (l.ownerId && l.ownerId !== user.id) {
    notifySvc.notify({
      userId: l.ownerId,
      type: 'comment',
      title: `「${l.title}」收到新留言`,
      body: `${user.nickname}：${text.slice(0, 120)}`,
      link: `/#/detail/${listingId}`,
      meta: { listingId, commentId: comment.id },
    });
  }
  // 通知被回复者
  if (parentId) {
    const parent = comments().get(parentId);
    if (parent && parent.userId !== user.id) {
      notifySvc.notify({
        userId: parent.userId,
        type: 'comment_reply',
        title: `您的留言收到回复`,
        body: `${user.nickname}：${text.slice(0, 120)}`,
        link: `/#/detail/${listingId}`,
        meta: { listingId, commentId: comment.id },
      });
    }
  }

  hub.toRoom(`listing:${listingId}`, 'comment', { listingId, comment });
  notifySvc.notifyMany([], {}); // no-op，保持接口一致性

  // AI 根据上下文自动回复
  let aiComment = null;
  if (aiReply && text) {
    aiComment = await generateAiReply(l, comment);
  }
  return { comment, aiComment };
}

export async function generateAiReply(l, triggerComment) {
  const history = comments()
    .where('listingId', l.id)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(-10);

  const files = (l.files || []).map((fid) => db.collection('files').get(fid)).filter(Boolean);
  const payload = {
    listing: {
      ...listingBrief(l),
      text: l.text,
      fileText: aggregateText(files, 3000),
      ai: l.ai,
      expiresAt: l.expiresAt,
      event: l.event,
      contact: l.hideContact ? {} : l.contact,
      files: files.map(filePublic),
    },
    comment: triggerComment,
    history: history.map((c) => ({ authorName: c.authorName, content: c.content, isAI: c.isAI })),
  };

  let result;
  try {
    result = await ai.replyComment(payload);
  } catch (err) {
    console.warn('[listings] AI 自动回复失败:', err.message);
    return null;
  }
  if (!result?.reply) return null;

  const aiComment = comments().insert({
    id: newId('c'),
    listingId: l.id,
    parentId: triggerComment.id,
    userId: 'ai',
    authorName: '小鱼 AI 助理',
    authorAvatar: '',
    content: String(result.reply).slice(0, 2000),
    files: [],
    isAI: true,
    aiSource: result.source,
    replyTo: triggerComment.id,
    createdAt: new Date().toISOString(),
  });
  listings().bump(l.id, 'commentCount', 1);

  // 提问者本人如果登录了，也能收到 AI 回复通知
  if (triggerComment.userId && triggerComment.userId !== 'ai') {
    notifySvc.notify({
      userId: triggerComment.userId,
      type: 'ai_reply',
      title: `AI 助理回复了您的留言`,
      body: String(result.reply).slice(0, 120),
      link: `/#/detail/${l.id}`,
      meta: { listingId: l.id, commentId: aiComment.id },
    });
  }
  hub.toRoom(`listing:${l.id}`, 'comment', { listingId: l.id, comment: aiComment });
  return aiComment;
}

export function deleteComment(commentId, user) {
  const c = comments().get(commentId);
  if (!c) throw httpError(404, '留言不存在');
  if (c.userId !== user.id && !user.isAdmin) throw httpError(403, '无权删除');
  comments().remove(commentId);
  comments().removeWhere((x) => x.parentId === commentId);
  const l = listings().get(c.listingId);
  if (l) listings().update(l.id, { commentCount: Math.max(0, (l.commentCount || 0) - 1) });
  return true;
}

/* ------------------------------------------------------------------ */
/* 现场文字播报（留言区/对接动态）                                       */
/* ------------------------------------------------------------------ */
export function addFollowUp(listingId, user, { text = '', fileIds = [] } = {}) {
  const l = listings().get(listingId);
  if (!l) throw httpError(404, '信息不存在');
  if (!String(text).trim() && !fileIds.length) throw httpError(400, '后续内容不能为空');
  const entry = {
    id: newId('fu'),
    text: String(text).slice(0, 4000),
    files: fileIds,
    by: user.id,
    byName: user.nickname,
    at: new Date().toISOString(),
  };
  const followUps = [...(l.followUps || []), entry];
  listings().update(listingId, { followUps });
  hub.toRoom(`listing:${listingId}`, 'followup', { listingId, entry });
  if (l.ownerId && l.ownerId !== user.id) {
    notifySvc.notify({
      userId: l.ownerId,
      type: 'pipeline',
      title: `「${l.title}」有新的跟进记录`,
      body: entry.text.slice(0, 120),
      link: `/#/detail/${listingId}`,
    });
  }
  return entry;
}

/* ------------------------------------------------------------------ */
/* 项目对接流程（14 步）                                                */
/* ------------------------------------------------------------------ */
export function pipelineOf(l) {
  const idx = l?.pipeline?.stageIndex || 0;
  return PIPELINE_STAGES.map((s, i) => ({
    ...s,
    index: i,
    done: i < idx,
    current: i === idx,
  }));
}

export function advancePipeline(listingId, user, { stageId, note = '', fileIds = [], toUserId = '' } = {}) {
  const l = listings().get(listingId);
  if (!l) throw httpError(404, '信息不存在');
  if (l.ownerId !== user.id && !user.isAdmin && toUserId !== user.id) {
    // 对接方也可以推进（成为项目成员后）
    const isMember = (l.memberIds || []).includes(user.id);
    if (!isMember) throw httpError(403, '只有发布方或已对接成员可以推进项目');
  }
  let index = PIPELINE_STAGES.findIndex((s) => s.id === stageId);
  if (stageId === 'next') index = Math.min(PIPELINE_STAGES.length - 1, (l.pipeline?.stageIndex || 0) + 1);
  if (index < 0) throw httpError(400, '未知的项目阶段');

  const stage = PIPELINE_STAGES[index];
  const entry = {
    stage: stage.id,
    name: stage.name,
    at: new Date().toISOString(),
    by: user.id,
    byName: user.nickname,
    note: String(note || '').slice(0, 1000),
    files: fileIds,
  };
  const history = [...(l.pipeline?.history || []), entry];
  const patch = { pipeline: { stageIndex: index, stage: stage.id, history } };

  if (fileIds.length) {
    const key =
      stage.id === 'qualification'
        ? 'agreements'
        : stage.id === 'contract'
          ? 'agreements'
          : 'agreements';
    patch[key] = [...(l[key] || []), ...fileIds];
  }
  if (stage.requires?.includes('confirm')) patch.awaitingConfirm = true;

  const updated = listings().update(listingId, patch);
  notifySvc.notify({
    userId: l.ownerId,
    type: 'pipeline',
    title: `项目进度更新：${stage.name}`,
    body: entry.note || `已推进到「${stage.name}」`,
    link: `/#/detail/${listingId}`,
    meta: { listingId, stage: stage.id },
  });
  hub.toRoom(`listing:${listingId}`, 'pipeline', { listingId, stage, entry });
  return { listing: updated, stage, entry, stages: pipelineOf(updated) };
}

export function confirmStage(listingId, user, { stageId, agree = true, note = '' } = {}) {
  const l = listings().get(listingId);
  if (!l) throw httpError(404, '信息不存在');
  const history = [
    ...(l.pipeline?.history || []),
    {
      stage: stageId || l.pipeline?.stage || 'confirm',
      name: `确认：${stageId || l.pipeline?.stage || ''}`,
      at: new Date().toISOString(),
      by: user.id,
      byName: user.nickname,
      note: `${agree ? '同意' : '不同意'}${note ? ` · ${note}` : ''}`,
      kind: 'confirm',
    },
  ];
  return listings().update(listingId, {
    pipeline: { ...l.pipeline, history },
    awaitingConfirm: false,
    lastConfirm: { by: user.id, at: new Date().toISOString(), agree, stage: stageId || l.pipeline?.stage },
  });
}

/* ------------------------------------------------------------------ */
/* 活动报名                                                            */
/* ------------------------------------------------------------------ */
export function registerForEvent(listingId, user, { name, phone, remark = '', payMethod = '' } = {}) {
  const l = listings().get(listingId);
  if (!l) throw httpError(404, '活动不存在');
  if (l.category !== 'event') throw httpError(400, '该信息不是活动');

  const exists = registrations().findOne((r) => r.listingId === listingId && r.userId === user.id);
  if (exists) return { registration: exists, duplicated: true };

  const needPay = Boolean(l.event?.needPay) && Number(l.event?.fee) > 0;
  const reg = registrations().insert({
    id: newId('reg'),
    listingId,
    userId: user.id,
    name: String(name || user.nickname || '').slice(0, 60),
    phone: String(phone || user.phone || '').slice(0, 30),
    remark: String(remark).slice(0, 500),
    fee: needPay ? Number(l.event.fee) : 0,
    payStatus: needPay ? 'pending' : 'free',
    payMethod,
    status: 'registered',
  });

  listings().update(listingId, {
    event: { ...l.event, registered: (l.event?.registered || 0) + 1 },
  });
  if (l.ownerId) {
    notifySvc.notify({
      userId: l.ownerId,
      type: 'system',
      title: `「${l.title}」有新报名`,
      body: `${reg.name} ${reg.phone}`,
      link: `/#/detail/${listingId}`,
    });
  }
  return { registration: reg, needPay };
}

export function listRegistrations(listingId, user) {
  const l = listings().get(listingId);
  if (!l) throw httpError(404, '活动不存在');
  if (l.ownerId !== user.id && !user.isAdmin) throw httpError(403, '只有主办方可以查看报名名单');
  return registrations().where('listingId', listingId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function myRegistrations(userId) {
  return registrations()
    .where('userId', userId)
    .map((r) => {
      const l = listings().get(r.listingId);
      return l ? { registration: r, listing: listingBrief(l) } : null;
    })
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* 查询                                                                */
/* ------------------------------------------------------------------ */
function hotScore(l) {
  return (
    (l.views || 0) * 1 +
    (l.commentCount || 0) * 5 +
    (l.followerCount || 0) * 8 +
    (l.shareCount || 0) * 4 +
    (l.likeCount || 0) * 3
  );
}

export function queryListings(params = {}) {
  const {
    category = '',
    type = '',
    industry = '',
    sub = '',
    city = '',
    q = '',
    status = 'published',
    ownerId = '',
    sort = 'latest',
    page = 1,
    pageSize = 20,
    followedBy = '',
  } = params;

  let list = listings().all();

  if (status && status !== 'all') list = list.filter((l) => l.status === status);
  if (category) list = list.filter((l) => l.category === category);
  if (type) list = list.filter((l) => l.type === type);
  if (industry) list = list.filter((l) => (l.industries || []).some((i) => i.id === industry));
  if (sub) list = list.filter((l) => (l.subs || []).some((s) => s.id === sub));
  if (city) list = list.filter((l) => (l.cities || []).some((c) => c.id === city));
  if (ownerId) list = list.filter((l) => l.ownerId === ownerId);
  if (followedBy) {
    const set = new Set(
      notifySvc
        .followingOf(followedBy)
        .filter((f) => f.targetType === 'listing')
        .map((f) => f.targetId),
    );
    list = list.filter((l) => set.has(l.id));
  }

  if (q) {
    const kw = String(q).toLowerCase().trim();
    list = list.filter((l) => {
      const hay = [
        l.title,
        l.subtitle,
        l.text,
        l.company,
        ...(l.keywords || []),
        ...(l.industries || []).map((i) => i.name),
        ...(l.subs || []).map((i) => i.name),
        ...(l.cities || []).map((c) => c.name),
        l.typeName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return kw.split(/\s+/).every((w) => hay.includes(w));
    });
  }

  if (sort === 'hot') list.sort((a, b) => hotScore(b) - hotScore(a));
  else if (sort === 'expiring')
    list.sort((a, b) => String(a.expiresAt || '').localeCompare(String(b.expiresAt || '')));
  else if (sort === 'reliability')
    list.sort((a, b) => (b.ai?.reliability?.score || 0) - (a.ai?.reliability?.score || 0));
  else list.sort((a, b) => String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt)));

  const total = list.length;
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const p = Math.max(1, Number(page) || 1);
  const items = list.slice((p - 1) * ps, p * ps).map(listingBrief);

  // 聚合维度，用于筛选栏
  const facets = {
    industries: countBy(list, (l) => l.industries || []),
    cities: countBy(list, (l) => l.cities || []),
    types: countBy(list, (l) => (l.type ? [{ id: l.type, name: typeNameOf(l.category, l.type) }] : [])),
  };

  return { total, page: p, pageSize: ps, pages: Math.ceil(total / ps) || 1, items, facets };
}

function countBy(list, pick) {
  const map = new Map();
  for (const l of list) {
    for (const item of pick(l) || []) {
      if (!item || !item.id) continue;
      const cur = map.get(item.id) || { id: item.id, name: item.name, count: 0 };
      cur.count++;
      map.set(item.id, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 30);
}

export function getListing(id) {
  return listings().get(id);
}

export function statsFor(userId) {
  const mine = listings().where('ownerId', userId);
  const byStatus = {};
  for (const l of mine) byStatus[l.status] = (byStatus[l.status] || 0) + 1;
  return {
    total: mine.length,
    byStatus,
    views: mine.reduce((s, l) => s + (l.views || 0), 0),
    comments: mine.reduce((s, l) => s + (l.commentCount || 0), 0),
    followers: mine.reduce((s, l) => s + (l.followerCount || 0), 0),
    shares: mine.reduce((s, l) => s + (l.shareCount || 0), 0),
  };
}

export function platformStats() {
  const all = listings().all();
  return {
    listings: all.length,
    published: all.filter((l) => l.status === 'published').length,
    byCategory: CATEGORY_IDS.reduce((acc, c) => {
      acc[c] = all.filter((l) => l.category === c).length;
      return acc;
    }, {}),
    users: users().count(),
    comments: comments().count(),
    shares: shares().count(),
    chats: db.collection('chatRooms').count(),
    meetings: db.collection('meetings').count(),
  };
}

export default {
  createListing,
  updateListing,
  regenerateAI,
  publishListing,
  renewListing,
  closeListing,
  removeListing,
  viewListing,
  toggleLike,
  recordShare,
  listComments,
  addComment,
  generateAiReply,
  deleteComment,
  addFollowUp,
  pipelineOf,
  advancePipeline,
  confirmStage,
  registerForEvent,
  listRegistrations,
  myRegistrations,
  queryListings,
  getListing,
  listingPublic,
  listingBrief,
  statsFor,
  platformStats,
  DURATION_OPTIONS,
  categoryName,
};
