/**
 * 小鱼来了 — 服务商入驻
 *
 * 服务商 = 给项目方提供落地能力的一方：EPC、设计、施工、设备、运维、咨询、检测、物流、金融等。
 * 流程：提交申请 → 平台审核 → 通过后进入服务商名录，可被项目方检索与对接。
 */

import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';
import notifySvc from './notify.js';

const providers = () => db.collection('providers');
const users = () => db.collection('users');

/* ------------------------------------------------------------------ */
/* 服务商类型（9 大类，部分带子类型）                                    */
/* ------------------------------------------------------------------ */
export const SERVICE_TYPES = [
  {
    id: 'agent',
    name: '平台代理商',
    subs: [
      { id: 'city', name: '城市' },
      { id: 'industry', name: '行业' },
      { id: 'channel', name: '渠道' },
    ],
  },
  { id: 'trader', name: '贸易商', subs: [] },
  { id: 'investment', name: '投融资', subs: [] },
  {
    id: 'engineering',
    name: '工程',
    subs: [
      { id: 'emc', name: 'EMC' },
      { id: 'epc', name: 'EPC' },
      { id: 'labor', name: '劳务' },
      { id: 'supervision', name: '监理' },
    ],
  },
  { id: 'bidding', name: '招投标公司', subs: [] },
  { id: 'attract', name: '招商引资', subs: [] },
  { id: 'ip', name: '发明、专利、技术支持', subs: [] },
  { id: 'manufacturer', name: '制造商', subs: [] },
  { id: 'ecommerce', name: '电商、直播', subs: [] },
];

/* ------------------------------------------------------------------ */
/* 服务商种类（7 类，部分带子类型）                                      */
/* ------------------------------------------------------------------ */
export const PROVIDER_KINDS = [
  { id: 'government', name: '政府', subs: [] },
  { id: 'firm', name: '事务所', subs: [] },
  {
    id: 'enterprise',
    name: '企业',
    subs: [
      { id: 'private', name: '私企' },
      { id: 'state', name: '国企' },
      { id: 'central', name: '央企' },
    ],
  },
  {
    id: 'fund',
    name: '基金',
    subs: [
      { id: 'private', name: '私募' },
      { id: 'public', name: '公募' },
    ],
  },
  { id: 'nonprofit', name: '公益机构', subs: [] },
  { id: 'association', name: '社团', subs: [] },
  {
    id: 'individual',
    name: '个人',
    subs: [
      { id: 'expert', name: '专家' },
      { id: 'scholar', name: '学者' },
      { id: 'broker', name: '居间' },
      { id: 'other', name: '其他' },
    ],
  },
  { id: 'other', name: '其他', subs: [] },
];

const KIND_BY_ID = Object.fromEntries(PROVIDER_KINDS.map((k) => [k.id, k]));
const TYPE_BY_ID = Object.fromEntries(SERVICE_TYPES.map((t) => [t.id, t]));

/** 服务商种类展示名：企业（国企） */
export function kindLabel(kindId, kindSub) {
  const k = KIND_BY_ID[kindId];
  if (!k) return '';
  const sub = (k.subs || []).find((x) => x.id === kindSub);
  return sub ? `${k.name}（${sub.name}）` : k.name;
}

/** 服务类型展示名：平台代理商（城市） */
export function typeLabel(typeId, subId) {
  const t = TYPE_BY_ID[typeId];
  if (!t) return typeId;
  const sub = (t.subs || []).find((x) => x.id === subId);
  return sub ? `${t.name}（${sub.name}）` : t.name;
}

export const REGIONS = [
  '全国', '华东', '华北', '华南', '华中', '西南', '西北', '东北', '海外',
];

const STATUS = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
};

function toList(v, max = 6) {
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean).slice(0, max);
  return String(v || '')
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function providerPublic(p, viewer = null) {
  if (!p) return null;
  const isOwner = Boolean(viewer && viewer.id === p.ownerId);
  const isAdmin = Boolean(viewer && viewer.isAdmin);
  const base = {
    id: p.id,
    companyName: p.companyName,
    shortName: p.shortName || '',
    /* 种类：企业（国企） */
    kind: p.kind || '',
    kindSub: p.kindSub || '',
    kindName: kindLabel(p.kind, p.kindSub),
    kindLabel: (kindLabel(p.kind, p.kindSub) || '').split('（')[0],
    /* 类型：平台代理商（城市）、工程（EPC）… */
    serviceTypes: (p.serviceTypes || []).map((id) =>
      typeLabel(id, (p.typeSubs || {})[id] || ''),
    ),
    serviceTypeIds: p.serviceTypes || [],
    typeSubs: p.typeSubs || {},
    regions: p.regions || [],
    intro: p.intro || '',
    establishedYear: p.establishedYear || '',
    staffCount: p.staffCount || '',
    website: p.website || '',
    logoUrl: p.logoUrl || '',
    status: p.status,
    statusName: STATUS[p.status] || p.status,
    createdAt: p.createdAt,
    reviewedAt: p.reviewedAt || '',
    reviewNote: p.reviewNote || '',
  };
  /*
   * 联系方式只给本人和管理员看。
   * 之前是「审核通过就公开」，等于把服务商的手机号挂到公开名录上，
   * 容易被爬虫抓走。对外统一走「📮 联系这家服务商」平台留言。
   */
  if (isOwner || isAdmin) {
    base.contactName = p.contactName || '';
    base.contactPhone = p.contactPhone || '';
    base.contactEmail = p.contactEmail || '';
  }
  /* 资质与案例属于公开资料，正常展示 */
  base.creditCode = p.creditCode || '';
  base.cases = p.cases || '';
  base.qualifications = p.qualifications || '';
  return base;
}

/** 我的申请 */
export function myApplication(userId) {
  return providers().findOne((p) => p.ownerId === userId) || null;
}

/** 提交 / 更新申请 */
export function apply(user, body = {}) {
  const companyName = String(body.companyName || '').trim();
  if (!companyName) throw httpError(400, '请填写公司名称');
  if (companyName.length > 60) throw httpError(400, '公司名称过长');

  const serviceTypes = toList(body.serviceTypes, 6).filter((id) => SERVICE_TYPES.some((t) => t.id === id));
  if (!serviceTypes.length) throw httpError(400, '请至少选择一个服务类型');

  const regions = toList(body.regions, 9).filter((r) => REGIONS.includes(r));
  if (!regions.length) regions.push('全国');

  const contactName = String(body.contactName || '').trim();
  const contactPhone = String(body.contactPhone || '').trim();
  if (!contactName) throw httpError(400, '请填写联系人');
  if (!/^1[3-9]\d{9}$/.test(contactPhone)) throw httpError(400, '请填写正确的手机号');

  const existing = myApplication(user.id);

  /* 种类（单选）+ 子类型 */
  const kind = String(body.kind || '').trim();
  const kindSub = String(body.kindSub || '').trim();
  if (!KIND_BY_ID[kind]) throw httpError(400, '请选择服务商种类');
  const kindDef = KIND_BY_ID[kind];
  const kindSubOk = (kindDef.subs || []).some((x) => x.id === kindSub) ? kindSub : '';

  /* 各类型的子类型选择：{ agent: 'city', engineering: 'epc' } */
  const rawSubs = body.typeSubs && typeof body.typeSubs === 'object' ? body.typeSubs : {};
  const typeSubs = {};
  for (const tid of serviceTypes) {
    const t = TYPE_BY_ID[tid];
    if (!t || !(t.subs || []).length) continue;
    const val = String(rawSubs[tid] || '').trim();
    if ((t.subs || []).some((x) => x.id === val)) typeSubs[tid] = val;
  }

  const patch = {
    companyName,
    shortName: String(body.shortName || '').trim().slice(0, 20),
    creditCode: String(body.creditCode || '').trim().slice(0, 30),
    kind,
    kindSub: kindSubOk,
    serviceTypes,
    typeSubs,
    regions,
    intro: String(body.intro || '').trim().slice(0, 1000),
    cases: String(body.cases || '').trim().slice(0, 2000),
    qualifications: String(body.qualifications || '').trim().slice(0, 1000),
    establishedYear: String(body.establishedYear || '').trim().slice(0, 8),
    staffCount: String(body.staffCount || '').trim().slice(0, 20),
    website: String(body.website || '').trim().slice(0, 120),
    contactName: contactName.slice(0, 20),
    contactPhone,
    contactEmail: String(body.contactEmail || '').trim().slice(0, 80),
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    // 被拒后重新提交 → 回到待审核
    const backToPending = existing.status === 'rejected';
    return providers().update(existing.id, {
      ...patch,
      status: backToPending ? 'pending' : existing.status,
      reviewNote: backToPending ? '' : existing.reviewNote,
    });
  }

  return providers().insert({
    id: newId('sp'),
    ownerId: user.id,
    ownerName: user.nickname || '',
    ...patch,
    status: 'pending',
    reviewNote: '',
    createdAt: new Date().toISOString(),
    reviewedAt: '',
    reviewedBy: '',
    viewCount: 0,
  });
}

/** 服务商名录（只列已通过的） */
export function list({ q = '', serviceType = '', region = '', kind = '', page = 1, pageSize = 20 } = {}) {
  const kw = String(q || '').trim().toLowerCase();
  let all = providers().find((p) => p.status === 'approved');

  if (kind) all = all.filter((p) => p.kind === kind);
  if (serviceType) all = all.filter((p) => (p.serviceTypes || []).includes(serviceType));
  if (region) all = all.filter((p) => (p.regions || []).includes(region) || (p.regions || []).includes('全国'));
  if (kw) {
    all = all.filter((p) =>
      [p.companyName, p.shortName, p.intro, p.cases]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(kw)),
    );
  }

  const total = all.length;
  const size = Math.max(1, Math.min(50, Number(pageSize) || 20));
  const p = Math.max(1, Number(page) || 1);
  const items = all
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice((p - 1) * size, p * size)
    .map((x) => providerPublic(x));

  return { items, total, page: p, pageSize: size, hasMore: p * size < total };
}

/** 统计（首页 / 名录页用） */
export function stats() {
  const approved = providers().find((p) => p.status === 'approved');
  const byType = {};
  for (const p of approved) {
    for (const t of p.serviceTypes || []) byType[t] = (byType[t] || 0) + 1;
  }
  const byKind = {};
  for (const p of approved) {
    if (p.kind) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  }
  return {
    total: approved.length,
    byType,
    byKind,
    types: SERVICE_TYPES,
    kinds: PROVIDER_KINDS,
    regions: REGIONS,
  };
}

export function getById(id, viewer = null) {
  const p = providers().get(id);
  if (!p) return null;
  if (p.status !== 'approved') {
    const isOwner = viewer && viewer.id === p.ownerId;
    const isAdmin = viewer && viewer.isAdmin;
    if (!isOwner && !isAdmin) return null;
  } else {
    providers().bump(id, 'viewCount', 1);
  }
  return providerPublic(p, viewer);
}

/** 管理员：待审核列表 */
export function adminList({ status = '', q = '', page = 1, pageSize = 30 } = {}) {
  let all = providers().all();
  if (status) all = all.filter((p) => p.status === status);
  const kw = String(q || '').trim().toLowerCase();
  if (kw) all = all.filter((p) => String(p.companyName || '').toLowerCase().includes(kw));

  const total = all.length;
  const size = Math.max(1, Math.min(100, Number(pageSize) || 30));
  const p = Math.max(1, Number(page) || 1);
  const items = all
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice((p - 1) * size, p * size)
    .map((x) => providerPublic(x, { id: x.ownerId, isAdmin: true }));

  return {
    items,
    total,
    page: p,
    pageSize: size,
    pendingCount: providers().count((x) => x.status === 'pending'),
    approvedCount: providers().count((x) => x.status === 'approved'),
    rejectedCount: providers().count((x) => x.status === 'rejected'),
  };
}

/** 管理员：审核 */
export function review(id, admin, { approve = true, note = '' } = {}) {
  const p = providers().get(id);
  if (!p) throw httpError(404, '申请不存在');

  const status = approve ? 'approved' : 'rejected';
  const updated = providers().update(id, {
    status,
    reviewNote: String(note || '').slice(0, 300),
    reviewedAt: new Date().toISOString(),
    reviewedBy: admin.id,
  });

  if (p.ownerId) {
    notifySvc.notify({
      userId: p.ownerId,
      type: 'system',
      title: approve ? '服务商入驻已通过' : '服务商入驻未通过',
      body: approve
        ? `「${p.companyName}」已通过审核，已进入服务商名录`
        : note || `「${p.companyName}」的入驻申请未通过，可修改后重新提交`,
      link: '#/provider',
    });
  }

  return updated;
}

export default {
  PROVIDER_KINDS,
  kindLabel,
  typeLabel,
  SERVICE_TYPES,
  REGIONS,
  providerPublic,
  myApplication,
  apply,
  list,
  stats,
  getById,
  adminList,
  review,
};
