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
import { aggregateText, pickCover, filePublic, listFiles } from './files.js';
import { CATEGORIES, PIPELINE_STAGES, PROJECT_TYPES, TRADE_TYPES, EVENT_TYPES, BUSINESS_TERM_FIELDS } from '../data/taxonomy.js';

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
  const isOwner = Boolean(viewer && viewer.id === l.ownerId);
  const isAdmin = Boolean(viewer && viewer.isAdmin);
  const signedIn = Boolean(viewer);
  // 已对接的项目成员（含发布方 / 管理员）
  const isMember = Boolean(
    isOwner || isAdmin || opts.unlocked || (viewer && (l.memberIds || []).includes(viewer.id)),
  );

  const contact = l.contact || {};

  // 规则 1：分享出去的链接，访客必须先登录注册才能查看正文与操作。
  //        未登录只给一段摘要做预览，正文、附件、商务条件、资质要求一律不下发。
  const gated = !signedIn;

  // 规则 2：AI 可靠性分析是发布方的内部参考，只有发布方和管理员可见。
  //        其他人（包括已登录用户）只能看到 AI 生成的主副标题。
  const aiVisible = isOwner || isAdmin;
  const ai = aiVisible ? l.ai : (signedIn && l.ai ? { titles: l.ai.titles, source: l.ai.source } : null);

  // 规则 3：联系方式只有发布方 / 管理员 / 已对接成为项目成员的人可见。
  const canSeeContact = isOwner || isAdmin || opts.unlocked;

  const summary = String(l.ai?.summary || l.text || '').replace(/\s+/g, ' ').trim();

  return {
    ...l,
    categoryName: categoryName(l.category),
    typeName: l.typeName || typeNameOf(l.category, l.type),

    // 未登录访客拿不到任何附件
    // l.files 存的是文件 ID 数组，必须解析成记录，否则 filePublic(字符串)
    // 会对字符串做解构，产出 {"0":"f","1":"_",...} 这种垃圾对象，前端渲染不出来
    fileList: signedIn ? listFiles(l.files || []).map(filePublic) : [],

    // 未登录只下发摘要级别的正文
    text: signedIn ? l.text : summary.slice(0, 80),
    gated,
    loginRequired: gated,

    // 商务条件与资质要求属于「对接后才展开」的信息
    project: l.project
      ? {
          ...l.project,
          businessTerms: signedIn ? (l.project.businessTerms || {}) : {},
          qualifications: signedIn ? (l.project.qualifications || []) : [],
          target: signedIn ? l.project.target : '',
        }
      : null,

    // 后续跟进、协议、他人资质提交都属于项目内部信息
    followUps: isMember ? (l.followUps || []) : [],
    agreements: isMember ? (l.agreements || []) : [],
    qualificationSubmissions: [], // 统一走 /qualification 接口按权限返回

    ai,
    aiVisible,

    contact: canSeeContact
      ? contact
      : {
          hidden: true,
          tip: signedIn
            ? '发起项目对接、成为项目成员后，才能查看完整联系方式'
            : '登录后可发起项目对接，对接成功后查看完整联系方式',
        },
    contactVisible: canSeeContact,

    isOwner,
    isMember,
    following: viewer ? notifySvc.isFollowing(viewer.id, 'listing', l.id) : false,
    ownerFollowing: viewer && l.ownerId ? notifySvc.isFollowing(viewer.id, 'user', l.ownerId) : false,
  };
}

export function listingBrief(l) {
  if (!l) return null;
  // l.files 存的是文件 ID 数组，必须先解析成文件记录再判断
  const fileRecords = listFiles(l.files || []);
  const cover = fileRecords.find((f) => f.id === l.coverId) || fileRecords.find((f) => f.kind === 'image');
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

/* ------------------------------------------------------------------ */
/* 项目资质要求 与 商务条件 的规范化                                     */
/* ------------------------------------------------------------------ */

/** 兼容 multipart 传上来的 JSON 字符串 与 真正的数组/对象 */
function parseMaybeJson(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return undefined;
  if (s[0] !== '[' && s[0] !== '{') return v;
  try { return JSON.parse(s); } catch { return undefined; }
}

/** 兼容 '1' / '0' / 'true' / 'false' / '' 等表单值 */
function truthy(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (['0', 'false', 'no', 'off', 'null', 'undefined'].includes(s)) return false;
  return true;
}

/**
 * 发布方勾选/填写的「对方需要具备哪些资质」。
 * 支持多项，每项含名称、等级、是否必需、备注。
 */
export function normalizeQualifications(input) {
  const arr = parseMaybeJson(input);
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(0, 40)
    .map((q) => ({
      name: String(q?.name || '').trim().slice(0, 80),
      level: String(q?.level || '').trim().slice(0, 20),
      required: truthy(q?.required, true),
      note: String(q?.note || '').trim().slice(0, 200),
    }))
    .filter((q) => q.name);
}

/** 商务条件：只保留 taxonomy 里定义过的字段，避免脏数据 */
export function normalizeBusinessTerms(input) {
  const src = parseMaybeJson(input);
  if (!src || typeof src !== 'object') return {};
  const plain = {};
  try {
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (typeof v === 'string' || typeof v === 'number') plain[k] = String(v).trim().slice(0, 500);
    }
  } catch {
    return {};
  }
  const out = {};
  for (const f of BUSINESS_TERM_FIELDS) {
    const v = plain[f.key];
    if (v) out[f.key] = v;
  }
  return out;
}

/** 合并项目字段：编辑时保留旧值，只覆盖提交上来的部分 */
export function normalizeProject(body = {}, prev = null) {
  const base = prev || {};
  const project = {
    investAmount: String(body.investAmount ?? base.investAmount ?? '').trim().slice(0, 80),
    stage: String(body.stage ?? base.stage ?? '').trim().slice(0, 80),
    cooperation: String(body.cooperation ?? base.cooperation ?? '').trim().slice(0, 120),
    period: String(body.period ?? base.period ?? '').trim().slice(0, 80),
    target: String(body.target ?? base.target ?? '').trim().slice(0, 500),

    // 是否需要资质 + 具体资质清单
    needQualification: truthy(body.needQualification, Boolean(base.needQualification)),
    qualifications:
      body.qualifications === undefined
        ? normalizeQualifications(base.qualifications)
        : normalizeQualifications(body.qualifications),

    // 商务条件
    businessTerms:
      body.businessTerms === undefined
        ? normalizeBusinessTerms(base.businessTerms)
        : normalizeBusinessTerms(body.businessTerms),
  };
  return project;
}

/* ------------------------------------------------------------------ */
/* 资质审核：AI 初审 + 发布方确认                                        */
/* ------------------------------------------------------------------ */

/**
 * AI 按项目资质要求逐项核对意向方提交的材料。
 * 本地引擎也能给出结论（关键词匹配 + 覆盖度评分）。
 */
export function evaluateQualification(listing, submitted = {}) {
  const required = (listing?.project?.qualifications || []).filter((q) => q.required);
  const optional = (listing?.project?.qualifications || []).filter((q) => !q.required);
  const have = (submitted.items || []).map((x) => ({
    name: String(x?.name || '').trim(),
    level: String(x?.level || '').trim(),
    fileIds: Array.isArray(x?.fileIds) ? x.fileIds : [],
    note: String(x?.note || '').trim(),
  })).filter((x) => x.name);

  const norm = (s) => String(s || '').replace(/[\s（）()·、,，-]/g, '').toLowerCase();
  const matched = [];
  const missing = [];
  for (const q of required) {
    const hit = have.find((h) => {
      const a = norm(h.name);
      const b = norm(q.name);
      return a && b && (a.includes(b) || b.includes(a));
    });
    if (hit) matched.push({ ...q, submittedAs: hit.name, level: hit.level || q.level, fileIds: hit.fileIds });
    else missing.push(q);
  }
  const optionalHit = optional.filter((q) => have.some((h) => {
    const a = norm(h.name);
    const b = norm(q.name);
    return a && b && (a.includes(b) || b.includes(a));
  }));

  const noFiles = matched.filter((m) => !m.fileIds.length);
  const score = required.length === 0
    ? 100
    : Math.round((matched.length / required.length) * 100);

  const findings = [];
  if (!listing?.project?.needQualification) {
    findings.push({ level: 'info', text: '发布方未要求资质，本环节可直接确认通过。' });
  }
  if (required.length) {
    findings.push({ level: 'ok', text: `必需资质 ${required.length} 项，已提交并匹配 ${matched.length} 项。` });
  }
  for (const m of missing) findings.push({ level: 'risk', text: `缺少必需资质：${m.name}${m.level && m.level !== '不要求' ? `（要求 ${m.level}）` : ''}` });
  for (const n of noFiles) findings.push({ level: 'warn', text: `${n.name} 未上传证明文件，仅有文字声明。` });
  if (optionalHit.length) findings.push({ level: 'ok', text: `额外提供了 ${optionalHit.length} 项加分资质。` });
  if (have.length === 0 && required.length) findings.push({ level: 'risk', text: '尚未提交任何资质材料。' });

  const pass = missing.length === 0 && have.length > 0 && noFiles.length === 0;
  return {
    score,
    pass,
    matchedCount: matched.length,
    requiredCount: required.length,
    missing: missing.map((m) => m.name),
    matched,
    noFiles: noFiles.map((m) => m.name),
    optionalCount: optionalHit.length,
    findings,
    evaluatedAt: new Date().toISOString(),
  };
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
    // 平台规则：联系方式一律不对公众展示，发布方也无法关闭这个保护。
    // 提交上来的 hideContact 忽略，强制为 true。
    hideContact: true,

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

    project: category === 'project' ? normalizeProject(body) : null,

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
    // hideContact 不开放修改：平台强制隐藏联系方式
    'company',
    'coverId',
    'event',
    'trade',
    'project',
    'durationDays',
  ];
  const next = {};
  for (const k of allowed) if (patch[k] !== undefined) next[k] = patch[k];
  // 项目字段要与原值合并，避免编辑时把未提交的资质/商务条件清空
  if (next.project && l.category === 'project') next.project = normalizeProject(next.project, l.project);
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
/* 阶段 2：上传资质审核                                                 */
/*   意向方提交资质  ->  AI 逐项核对  ->  发布方确认是否通过              */
/* ------------------------------------------------------------------ */

function requireProject(l) {
  if (!l) throw httpError(404, '信息不存在');
  if (l.category !== 'project') throw httpError(400, '只有项目类信息需要资质审核');
}

/** 意向方提交企业资质（多项），提交后立即跑一次 AI 初审 */
export function submitQualification(listingId, user, { items = [], note = '' } = {}) {
  const l = listings().get(listingId);
  requireProject(l);
  if (l.ownerId === user.id) throw httpError(400, '发布方无需提交资质，请等待意向方提交');

  const cleanItems = (Array.isArray(items) ? items : [])
    .slice(0, 40)
    .map((x) => ({
      name: String(x?.name || '').trim().slice(0, 80),
      level: String(x?.level || '').trim().slice(0, 20),
      fileIds: (Array.isArray(x?.fileIds) ? x.fileIds : []).slice(0, 20).map(String),
      note: String(x?.note || '').trim().slice(0, 300),
    }))
    .filter((x) => x.name);
  if (!cleanItems.length) throw httpError(400, '请至少填写一项资质');

  const submission = {
    userId: user.id,
    userName: user.nickname,
    company: user.company || '',
    items: cleanItems,
    note: String(note || '').slice(0, 1000),
    submittedAt: new Date().toISOString(),
    aiReview: evaluateQualification(l, { items: cleanItems }),
    status: 'pending',
    decidedAt: '',
    decidedBy: '',
    decisionNote: '',
  };

  const subs = [...(l.qualificationSubmissions || []).filter((s) => s.userId !== user.id), submission];
  const updated = listings().update(listingId, { qualificationSubmissions: subs });
  hub.toRoom(`listing:${listingId}`, 'qualification', { listingId, submission });
  notifySvc.notify({
    userId: l.ownerId,
    type: 'pipeline',
    title: `收到资质提交：${user.nickname}`,
    body: `AI 初审${submission.aiReview.pass ? '通过' : '有缺项'}，评分 ${submission.aiReview.score} 分，请确认`,
    link: `/#/detail/${listingId}`,
    meta: { listingId, stage: 'qualification-review' },
  });
  return { submission, listing: updated, aiReview: submission.aiReview };
}

/** 发布方对某份资质提交做确认（同意 / 驳回） */
export function reviewQualification(listingId, user, { userId, agree = true, note = '' } = {}) {
  const l = listings().get(listingId);
  requireProject(l);
  if (l.ownerId !== user.id && !user.isAdmin) throw httpError(403, '只有发布方可以确认资质');

  const subs = [...(l.qualificationSubmissions || [])];
  const idx = subs.findIndex((s) => s.userId === userId);
  if (idx < 0) throw httpError(404, '没有找到该用户的资质提交');

  subs[idx] = {
    ...subs[idx],
    status: agree ? 'approved' : 'rejected',
    decidedAt: new Date().toISOString(),
    decidedBy: user.id,
    decidedByName: user.nickname,
    decisionNote: String(note || '').slice(0, 500),
  };
  const updated = listings().update(listingId, { qualificationSubmissions: subs });

  const history = [
    ...(l.pipeline?.history || []),
    {
      stage: 'qualification-review',
      name: `资质审核：${subs[idx].userName}`,
      at: new Date().toISOString(),
      by: user.id,
      byName: user.nickname,
      note: `${agree ? '通过' : '驳回'}${note ? ` · ${note}` : ''}`,
      kind: 'qualification',
    },
  ];
  const final = listings().update(listingId, {
    pipeline: { ...updated.pipeline, history },
    awaitingConfirm: false,
  });

  notifySvc.notify({
    userId,
    type: 'pipeline',
    title: agree ? '资质审核已通过' : '资质审核未通过',
    body: note || (agree ? '发布方已确认你的资质，可以进入下一步' : '请补充材料后重新提交'),
    link: `/#/detail/${listingId}`,
    meta: { listingId, stage: 'qualification-review' },
  });
  return { listing: final, submission: subs[idx], stages: pipelineOf(final) };
}

/** 当前用户在该项目里的资质提交（没有则 null） */
export function myQualification(l, userId) {
  return (l?.qualificationSubmissions || []).find((s) => s.userId === userId) || null;
}

/** 项目当前的资质审核概况（前端展示用） */
export function qualificationSummary(l, userId) {
  const need = Boolean(l?.project?.needQualification);
  const required = (l?.project?.qualifications || []).filter((q) => q.required);
  const subs = l?.qualificationSubmissions || [];
  const mine = myQualification(l, userId);
  const approved = subs.filter((s) => s.status === 'approved');
  return {
    needQualification: need,
    requirements: l?.project?.qualifications || [],
    requiredCount: required.length,
    submissions: subs.map((s) => ({
      userId: s.userId,
      userName: s.userName,
      company: s.company,
      itemCount: s.items.length,
      status: s.status,
      score: s.aiReview?.score || 0,
      pass: Boolean(s.aiReview?.pass),
      missing: s.aiReview?.missing || [],
      submittedAt: s.submittedAt,
      decidedAt: s.decidedAt,
      decisionNote: s.decisionNote,
      isMine: s.userId === userId,
    })),
    mine,
    approvedCount: approved.length,
    canSubmit: Boolean(userId) && l?.ownerId !== userId,
    canReview: Boolean(userId) && (l?.ownerId === userId || false),
  };
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
  submitQualification,
  reviewQualification,
  myQualification,
  qualificationSummary,
  evaluateQualification,
  normalizeQualifications,
  normalizeBusinessTerms,
  normalizeProject,
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
