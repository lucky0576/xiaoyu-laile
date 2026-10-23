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

export const SERVICE_TYPES = [
  { id: 'epc', name: 'EPC 总包' },
  { id: 'design', name: '设计院 / 咨询' },
  { id: 'construction', name: '施工 / 安装' },
  { id: 'equipment', name: '设备 / 材料供应' },
  { id: 'om', name: '运维 / 检修' },
  { id: 'testing', name: '检测 / 认证' },
  { id: 'logistics', name: '物流 / 仓储' },
  { id: 'finance', name: '金融 / 保理' },
  { id: 'software', name: '软件 / 数字化' },
  { id: 'other', name: '其他服务' },
];

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
    serviceTypes: (p.serviceTypes || []).map((id) => (SERVICE_TYPES.find((t) => t.id === id) || { name: id }).name),
    serviceTypeIds: p.serviceTypes || [],
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
  // 联系方式只对本人 / 管理员 / 已通过的服务商公开
  if (isOwner || isAdmin || p.status === 'approved') {
    base.contactName = p.contactName || '';
    base.contactPhone = p.contactPhone || '';
    base.contactEmail = p.contactEmail || '';
    base.creditCode = p.creditCode || '';
    base.cases = p.cases || '';
    base.qualifications = p.qualifications || '';
  }
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

  const patch = {
    companyName,
    shortName: String(body.shortName || '').trim().slice(0, 20),
    creditCode: String(body.creditCode || '').trim().slice(0, 30),
    serviceTypes,
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
export function list({ q = '', serviceType = '', region = '', page = 1, pageSize = 20 } = {}) {
  const kw = String(q || '').trim().toLowerCase();
  let all = providers().find((p) => p.status === 'approved');

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
  return {
    total: approved.length,
    byType,
    types: SERVICE_TYPES,
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
