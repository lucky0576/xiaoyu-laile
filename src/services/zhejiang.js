/**
 * 浙江省政策项目申报
 *
 * 数据来源：用户提供的《浙江省政策项目申报计划表（全项目）新.xlsx》
 * 共 40 个项目，每个项目一条独立记录（见 src/data/zhejiang-policies.js）。
 *
 * 三件事：
 *   1. 列表 / 详情 —— 纯读，数据在代码里，不落库
 *   2. 申报提交 —— 落库到 zhejiang_applications，供后台跟进
 *   3. 我的申报 —— 按用户查自己的提交记录
 *
 * 为什么申报要落库而不是直接跳官方系统：
 *   表里没有各项目的官方申报网址，而政策申报通常需要先做资格匹配和
 *   材料准备。所以平台先收「申报意向」，由运营方核对后再指导用户
 *   去对应主管部门系统提交。页面上会同时给出官方入口说明。
 */

import db from '../store/db.js';
import { newId } from '../store/db.js';
import {
  ZHEJIANG_POLICIES,
  POLICY_MAP,
  POLICY_CATEGORIES,
  POLICY_LEVELS,
  OFFICIAL_PORTALS,
} from '../data/zhejiang-policies.js';

const applications = () => db.collection('zhejiang_applications');

export { POLICY_CATEGORIES, POLICY_LEVELS, OFFICIAL_PORTALS };

/** 允许的申报状态 */
export const APPLY_STATUS = {
  submitted: '已提交',
  reviewing: '资格核对中',
  matched: '已匹配服务',
  closed: '已结束',
};

/** 列表用的精简字段：不含政策全文和材料清单，避免首屏过大 */
function brief(p) {
  return {
    id: p.id,
    seq: p.seq,
    name: p.name,
    dept: p.dept,
    cycle: p.cycle,
    category: p.category,
    level: p.level,
    amount: p.amount,
    portalName: p.portalName,
    portalUrl: p.portalUrl,
  };
}

/** 政策列表。支持按分类、层级、关键词过滤 */
export function listPolicies({ category = '', level = '', q = '' } = {}) {
  let list = ZHEJIANG_POLICIES;
  if (category) list = list.filter((p) => p.category === category);
  if (level) list = list.filter((p) => p.level === level);
  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.dept.toLowerCase().includes(kw) ||
        p.policy.toLowerCase().includes(kw),
    );
  }
  return list.map(brief);
}

/** 单个项目详情（含政策全文与材料清单） */
export function getPolicy(id) {
  return POLICY_MAP[String(id || '')] || null;
}

/** 各分类 / 各层级数量，用于列表页显示筛选角标 */
export function policyStats() {
  const byCategory = {};
  const byLevel = {};
  for (const p of ZHEJIANG_POLICIES) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
    byLevel[p.level] = (byLevel[p.level] || 0) + 1;
  }
  return { total: ZHEJIANG_POLICIES.length, byCategory, byLevel };
}

/**
 * 提交申报意向。
 * 同一用户对同一政策只保留一条未结束的申报，避免重复提交刷屏。
 */
export function submitApplication(user, body = {}) {
  const policyId = String(body.policyId || '').trim();
  const policy = getPolicy(policyId);
  if (!policy) {
    const err = new Error('政策项目不存在');
    err.status = 404;
    err.code = 'policy_not_found';
    throw err;
  }

  const existing = applications().findOne(
    (a) => a.userId === user.id && a.policyId === policyId && a.status !== 'closed',
  );
  if (existing) {
    const err = new Error(`你已提交过「${policy.name}」的申报，请等待跟进`);
    err.status = 409;
    err.code = 'duplicate_apply';
    throw err;
  }

  const now = new Date().toISOString();
  const record = applications().insert({
    id: newId('zja'),
    userId: user.id,
    policyId,
    policyName: policy.name,
    // 申报主体信息（用户填写）
    companyName: String(body.companyName || '').trim().slice(0, 120),
    contactName: String(body.contactName || '').trim().slice(0, 40),
    contactPhone: String(body.contactPhone || '').replace(/[^\d+]/g, '').slice(0, 20),
    industry: String(body.industry || '').trim().slice(0, 60),
    city: String(body.city || '').trim().slice(0, 60),
    note: String(body.note || '').trim().slice(0, 1000),
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  });

  return record;
}

/** 我的申报记录（按时间倒序） */
export function listMyApplications(userId) {
  return applications()
    .where('userId', userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((a) => ({
      ...a,
      statusName: APPLY_STATUS[a.status] || a.status,
    }));
}

/** 后台：全部申报 */
export function listAllApplications({ status = '', limit = 100 } = {}) {
  let list = applications().all();
  if (status) list = list.filter((a) => a.status === status);
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return list.slice(0, limit).map((a) => ({
    ...a,
    statusName: APPLY_STATUS[a.status] || a.status,
  }));
}

/** 后台：更新申报状态 */
export function setApplicationStatus(id, status) {
  if (!APPLY_STATUS[status]) {
    const err = new Error('状态不合法');
    err.status = 400;
    err.code = 'bad_status';
    throw err;
  }
  return applications().update(id, { status });
}

export default {
  POLICY_CATEGORIES,
  POLICY_LEVELS,
  APPLY_STATUS,
  listPolicies,
  getPolicy,
  policyStats,
  submitApplication,
  listMyApplications,
  listAllApplications,
  setApplicationStatus,
};
