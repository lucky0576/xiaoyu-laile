/**
 * 浙江省政策项目申报 — 服务层
 *
 * 数据流：
 *   首次访问时把 src/data/zhejiang-policies.js 的静态数据**播种**到
 *   数据库集合 zhejiang_policies，之后一切读写都走数据库。
 *   这样后台改了政策（改文字、上下架、补通知链接）不用发版。
 *
 * 为什么还要保留静态数据：它是「出厂默认值」。数据库被清空后能自动恢复，
 * 新部署的机器也不用单独导入。
 *
 * 三个能力：
 *   1. 政策 CRUD（后台可编辑）
 *   2. 申报提交（用户）
 *   3. 资格自测（按用户填的企业情况给政策打分排序）
 */

import db, { newId } from '../store/db.js';
import {
  ZHEJIANG_POLICIES,
  POLICY_CATEGORIES,
  POLICY_LEVELS,
  OFFICIAL_PORTALS,
} from '../data/zhejiang-policies.js';

const policies = () => db.collection('zhejiang_policies');
const applications = () => db.collection('zhejiang_applications');

export { POLICY_CATEGORIES, POLICY_LEVELS, OFFICIAL_PORTALS };

/** 申报状态 */
export const APPLY_STATUS = {
  submitted: '已提交',
  reviewing: '资格核对中',
  matched: '已匹配服务',
  closed: '已结束',
};

/* ------------------------------------------------------------------ */
/* 播种                                                                */
/* ------------------------------------------------------------------ */
let seedChecked = false;

/**
 * 把静态政策写入数据库（只做一次，且只在集合为空时）。
 * 每台机器首次启动会自动完成，不需要手动跑脚本。
 */
export function ensureSeeded() {
  if (seedChecked) return;
  seedChecked = true;
  try {
    const col = policies();
    if (col.count() > 0) return;
    const now = new Date().toISOString();
    for (const p of ZHEJIANG_POLICIES) {
      col.insert({
        ...p,
        enabled: true,
        noticeUrl: '',          // 当年的申报通知链接（后台补）
        criteria: extractCriteria(p),
        source: 'seed',
        createdAt: now,
        updatedAt: now,
      });
    }
    db.flush();
  } catch {
    // 播种失败不阻塞读取：下面会回退到静态数据
  }
}

/* ------------------------------------------------------------------ */
/* 资格条件提取（用于自测打分）                                        */
/* ------------------------------------------------------------------ */

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function toNum(s) {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  if (s.length === 1 && CN_NUM[s]) return CN_NUM[s];
  if (s.length === 2 && s[0] === '十' && CN_NUM[s[1]]) return 10 + CN_NUM[s[1]];
  if (s.length === 2 && s[1] === '十' && CN_NUM[s[0]]) return CN_NUM[s[0]] * 10;
  return 0;
}

/**
 * 从政策原文里提取可判定的硬条件。
 * 只提取**明确写了**的条件，不猜——提取不到就不参与打分，
 * 避免给出错误结论误导用户。
 */
function extractCriteria(p) {
  const text = `${p.name}\n${p.policy || ''}`;
  const c = {
    needsTalent: p.category === 'talent',
    needsIp: false,
    maxAge: 0,       // 成立年限上限（超过不能报），0 表示没写
    minAge: 0,       // 成立年限下限（不满不能报），0 表示没写
    minStaff: 0,
    industries: [],
  };

  /*
   * 成立年限：必须区分「上限」和「下限」，两者含义相反，判错会直接误伤用户。
   *   上限："成立时间≤2年" / "成立 3 年以内" → 超过就不能报
   *   下限："成立满 1 年" / "成立 2 年以上"   → 不满就不能报
   * 只认写清楚的量词，抓不准就留空不参与打分。
   */
  const NUM = '([0-9一二三四五六七八九十]+)';
  // 上限：出现 ≤ < 不超过 以内 / 内
  const maxPatterns = [
    new RegExp(`(?:成立|注册)(?:时间|年限)?\\s*(?:≤|<|不超过|不超)\\s*${NUM}\\s*年`),
    new RegExp(`(?:成立|注册)(?:时间|年限)?\\s*${NUM}\\s*年(?:以内|内)`),
  ];
  for (const re of maxPatterns) {
    const m = text.match(re);
    if (m) {
      const n = toNum(m[1]);
      if (n > 0 && n <= 10) { c.maxAge = n; break; }
    }
  }
  // 下限：出现 满 / 以上 / 及以上
  const minPatterns = [
    new RegExp(`(?:成立|注册)(?:时间|年限)?\\s*(?:满|不少于|不低于)\\s*${NUM}\\s*年`),
    new RegExp(`(?:成立|注册)(?:时间|年限)?\\s*${NUM}\\s*年(?:以上|及以上)`),
    new RegExp(`(?:成立|注册)(?:时间|年限)?\\s*${NUM}\\s*年[，,；;、\\s]`),
  ];
  for (const re of minPatterns) {
    const m = text.match(re);
    if (m) {
      const n = toNum(m[1]);
      if (n > 0 && n <= 30) { c.minAge = n; break; }
    }
  }

  // 知识产权：正文明确要求专利 / 软著 / 知识产权
  if (/需?拥有.{0,6}(专利|软件著作权|知识产权)|知识产权.{0,8}(要求|不少于|至少)/.test(text)) {
    c.needsIp = true;
  }

  // 行业关键词（用于粗略行业匹配）
  const INDUSTRY_WORDS = [
    '人工智能', '具身智能', '机器人', '新能源', '光伏', '储能', '新材料',
    '生物医药', '医疗器械', '集成电路', '软件', '工业设计', '智能制造',
    '节能环保', '低空经济', '算力', '数据中心',
  ];
  for (const w of INDUSTRY_WORDS) {
    if (text.includes(w)) c.industries.push(w);
  }

  return c;
}

/* ------------------------------------------------------------------ */
/* 读取                                                                */
/* ------------------------------------------------------------------ */

function allDocs() {
  ensureSeeded();
  let list = policies().all();
  // 播种异常时回退到静态数据，保证页面永远有内容
  if (!list.length) {
    return ZHEJIANG_POLICIES.map((p) => ({ ...p, enabled: true, criteria: extractCriteria(p) }));
  }
  return list;
}

/** 列表用精简字段：不含政策全文，避免首屏过大 */
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
    noticeUrl: p.noticeUrl || '',
  };
}

/** 政策列表（前台：只返回已上架的） */
export function listPolicies({ category = '', level = '', q = '' } = {}) {
  let list = allDocs().filter((p) => p.enabled !== false);
  if (category) list = list.filter((p) => p.category === category);
  if (level) list = list.filter((p) => p.level === level);
  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    list = list.filter(
      (p) =>
        String(p.name || '').toLowerCase().includes(kw) ||
        String(p.dept || '').toLowerCase().includes(kw) ||
        String(p.policy || '').toLowerCase().includes(kw),
    );
  }
  list.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  return list.map(brief);
}

/** 详情（前台） */
export function getPolicy(id) {
  const doc = allDocs().find((p) => p.id === String(id || ''));
  if (!doc || doc.enabled === false) return null;
  return doc;
}

/** 详情（后台：含下架） */
export function getPolicyAdmin(id) {
  return allDocs().find((p) => p.id === String(id || '')) || null;
}

/** 后台列表（含下架） */
export function listPoliciesAdmin({ category = '', q = '' } = {}) {
  let list = allDocs().slice();
  if (category) list = list.filter((p) => p.category === category);
  const kw = String(q || '').trim().toLowerCase();
  if (kw) list = list.filter((p) => `${p.name} ${p.dept}`.toLowerCase().includes(kw));
  list.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  return list.map((p) => ({
    ...brief(p),
    enabled: p.enabled !== false,
    hasNotice: Boolean(p.noticeUrl),
    updatedAt: p.updatedAt || p.createdAt || '',
  }));
}

/** 统计（前台） */
export function policyStats() {
  const list = allDocs().filter((p) => p.enabled !== false);
  const byCategory = {};
  const byLevel = {};
  for (const p of list) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
    byLevel[p.level] = (byLevel[p.level] || 0) + 1;
  }
  return { total: list.length, byCategory, byLevel };
}

/* ------------------------------------------------------------------ */
/* 后台 CRUD                                                           */
/* ------------------------------------------------------------------ */

const EDITABLE = [
  'name', 'dept', 'cycle', 'category', 'level', 'amount',
  'policy', 'materials', 'portal', 'portalName', 'portalUrl',
  'noticeUrl', 'enabled', 'seq',
];

export function createPolicy(body = {}) {
  ensureSeeded();
  const maxSeq = allDocs().reduce((m, p) => Math.max(m, Number(p.seq) || 0), 0);
  const now = new Date().toISOString();
  const doc = {
    id: newId('zjp'),
    seq: Number(body.seq) || maxSeq + 1,
    name: String(body.name || '').trim().slice(0, 200),
    dept: String(body.dept || '').trim().slice(0, 100),
    cycle: String(body.cycle || '').trim().slice(0, 200),
    category: String(body.category || 'other').trim(),
    level: String(body.level || 'province').trim(),
    amount: String(body.amount || '').trim().slice(0, 2000),
    policy: String(body.policy || '').trim().slice(0, 20000),
    materials: String(body.materials || '').trim().slice(0, 10000),
    portal: String(body.portal || 'zwfw').trim(),
    portalName: String(body.portalName || '浙江政务服务网').trim(),
    portalUrl: String(body.portalUrl || 'https://www.zjzwfw.gov.cn').trim(),
    noticeUrl: String(body.noticeUrl || '').trim().slice(0, 500),
    enabled: body.enabled !== false,
    criteria: extractCriteria({ name: body.name || '', policy: body.policy || '', category: body.category || '' }),
    source: 'admin',
    createdAt: now,
    updatedAt: now,
  };
  if (!doc.name) {
    const err = new Error('政策名称不能为空');
    err.status = 400;
    err.code = 'name_required';
    throw err;
  }
  const saved = policies().insert(doc);
  db.flush();
  return saved;
}

export function updatePolicy(id, patch = {}) {
  ensureSeeded();
  const cur = getPolicyAdmin(id);
  if (!cur) {
    const err = new Error('政策不存在');
    err.status = 404;
    err.code = 'not_found';
    throw err;
  }
  const next = {};
  for (const k of EDITABLE) {
    if (patch[k] === undefined) continue;
    if (k === 'enabled') next[k] = Boolean(patch[k]);
    else if (k === 'seq') next[k] = Number(patch[k]) || cur.seq;
    else next[k] = String(patch[k]).slice(0, 20000);
  }
  next.updatedAt = new Date().toISOString();
  // 关键字段变了就重算资格条件
  if (next.name || next.policy || next.category) {
    next.criteria = extractCriteria({
      name: next.name || cur.name,
      policy: next.policy || cur.policy,
      category: next.category || cur.category,
    });
  }
  const saved = policies().update(id, next);
  db.flush();
  return saved;
}

export function deletePolicy(id) {
  ensureSeeded();
  const ok = policies().remove(id);
  if (ok) db.flush();
  return ok;
}

/** 重置为出厂数据（删掉后台改过的全部，重新播种） */
export function resetPolicies() {
  const col = policies();
  for (const p of col.all()) col.remove(p.id);
  seedChecked = false;
  ensureSeeded();
  return col.count();
}

/* ------------------------------------------------------------------ */
/* 资格自测                                                            */
/* ------------------------------------------------------------------ */

/**
 * 按用户填的企业情况给政策打分并排序。
 *
 * 打分规则（透明可解释，页面上会说明为什么推荐）：
 *   +3  人才类政策且用户勾选了人才身份
 *   -100 硬条件不满足（如成立年限超过上限）→ 直接排除
 *   +2  要求知识产权且用户有
 *   +1  行业关键词命中
 *   +0  其他（基础分，保证列表不为空）
 *
 * 为什么不用 AI：政策匹配需要**可解释、可复现**，
 * 用户会问「凭什么说我能报」，规则能直接答上来。
 */
export function matchPolicies(profile = {}) {
  const list = allDocs().filter((p) => p.enabled !== false);
  const age = Number(profile.companyAge);
  const hasAge = Number.isFinite(age) && age >= 0;
  const isTalent = Boolean(profile.isTalent);
  const hasIp = Boolean(profile.hasIp);
  const industry = String(profile.industry || '').trim();
  const city = String(profile.city || '').trim();

  const results = [];
  for (const p of list) {
    const c = p.criteria || {};
    const reasons = [];
    const warnings = [];
    let score = 0;

    // 硬条件：成立年限上限（超龄直接排除）
    if (c.maxAge && hasAge && age > c.maxAge) {
      continue;
    }
    if (c.maxAge && hasAge) {
      score += 2;
      reasons.push(`要求成立 ${c.maxAge} 年内，你目前 ${age} 年，符合`);
    }

    // 硬条件：成立年限下限（未满直接排除）
    if (c.minAge && hasAge && age < c.minAge) {
      continue;
    }
    if (c.minAge && hasAge) {
      score += 1;
      reasons.push(`要求成立满 ${c.minAge} 年，你目前 ${age} 年，符合`);
    }

    // 人才身份
    if (c.needsTalent) {
      if (!isTalent) continue; // 人才类没勾人才身份就不推
      score += 3;
      reasons.push('人才类项目，你已标记为人才身份');
    }

    // 知识产权
    if (c.needsIp) {
      if (hasIp) {
        score += 2;
        reasons.push('要求知识产权，你已有专利/软著');
      } else {
        warnings.push('申报条件提到知识产权，建议先补齐专利或软著');
      }
    }

    // 行业命中
    if (industry && (c.industries || []).some((w) => industry.includes(w) || w.includes(industry))) {
      score += 1;
      reasons.push(`行业方向匹配（${industry}）`);
    }

    // 地域：区县级项目优先推本地
    if (city && p.level === 'district' && String(p.name).includes(city.slice(0, 2))) {
      score += 1;
      reasons.push('区县级项目，与你所在城市一致');
    }

    results.push({
      ...brief(p),
      score,
      matchLevel: score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low',
      reasons,
      warnings,
    });
  }

  results.sort((a, b) => b.score - a.score || Number(a.seq) - Number(b.seq));
  return {
    total: results.length,
    high: results.filter((r) => r.matchLevel === 'high').length,
    items: results,
  };
}

/* ------------------------------------------------------------------ */
/* 申报                                                                */
/* ------------------------------------------------------------------ */

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
  return applications().insert({
    id: newId('zja'),
    userId: user.id,
    policyId,
    policyName: policy.name,
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
}

export function listMyApplications(userId) {
  return applications()
    .where('userId', userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((a) => ({ ...a, statusName: APPLY_STATUS[a.status] || a.status }));
}

export function listAllApplications({ status = '', limit = 100 } = {}) {
  let list = applications().all();
  if (status) list = list.filter((a) => a.status === status);
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return list.slice(0, limit).map((a) => ({ ...a, statusName: APPLY_STATUS[a.status] || a.status }));
}

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
  OFFICIAL_PORTALS,
  APPLY_STATUS,
  ensureSeeded,
  listPolicies,
  getPolicy,
  getPolicyAdmin,
  listPoliciesAdmin,
  policyStats,
  createPolicy,
  updatePolicy,
  deletePolicy,
  resetPolicies,
  matchPolicies,
  submitApplication,
  listMyApplications,
  listAllApplications,
  setApplicationStatus,
};
