/**
 * 实名认证（个人 / 企业）
 *
 * 注册时选择身份类型，之后完成对应认证：
 *   - 个人：姓名 + 身份证号 + 身份证正反面照片
 *   - 企业：营业执照 + 企业信息，通过 AI 征信审核
 *
 * 关于"AI 征信审核"的边界（很重要）：
 *   本模块的审核依据是**用户提交的材料本身**，包括：
 *     · 统一社会信用代码的校验位是否合法（GB 32100-2015）
 *     · 企业名称、注册资本、成立日期、经营范围等字段是否完整、是否自相矛盾
 *     · 经营范围与拟发布品类是否匹配
 *     · 材料中的风险关键词（经营异常、失信被执行、吊销、注销等）
 *   它**不是**向央行征信 / 企查查 / 天眼查等外部数据源发起的真实征信查询。
 *   要接真实征信，在 `fetchExternalCredit()` 里接入对应服务即可。
 */
import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';
import ai from './ai.js';
import { config } from '../config.js';

const users = () => db.collection('users');

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

export const ACCOUNT_TYPES = {
  personal: '个人',
  company: '企业',
};

export const VERIFY_STATUS = {
  none: '未认证',
  pending: '审核中',
  approved: '已认证',
  rejected: '未通过',
};

/** 审核方式：AI 自动通过 / 转人工 / AI 拒绝 */
export const REVIEW_MODES = {
  auto: 'AI 自动通过',
  manual: '转人工复核',
  reject: 'AI 判定不通过',
};

/** 风险等级 */
export const RISK_LEVELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

/** 材料里出现这些词，属于明确的风险信号 */
const RISK_KEYWORDS = [
  { re: /失信被执行|失信人/, level: 'high', label: '涉及失信被执行' },
  { re: /经营异常|异常名录/, level: 'high', label: '被列入经营异常名录' },
  { re: /吊销|已注销|注销中/, level: 'high', label: '营业执照已吊销或注销' },
  { re: /破产|清算/, level: 'high', label: '涉及破产或清算' },
  { re: /限制高消费|限高/, level: 'medium', label: '涉及限制高消费' },
  { re: /被执行人|强制执行/, level: 'medium', label: '涉及被执行' },
  { re: /诉讼|起诉|涉诉|仲裁/, level: 'medium', label: '涉及诉讼或仲裁' },
  { re: /行政处罚|罚款|处罚/, level: 'medium', label: '有行政处罚记录' },
  { re: /欠税|欠缴|逾期/, level: 'medium', label: '存在欠税或逾期' },
  { re: /资金盘|保本保息|高额返利|虚拟币|代币/, level: 'high', label: '材料含高风险金融话术' },
];

/** 身份证校验位（GB 11643-1999） */
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK_CODES = '10X98765432';

/** 统一社会信用代码（GB 32100-2015），31 个字符，不含 I O S V Z */
const CREDIT_CHARSET = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const CREDIT_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28, 14];

/* ------------------------------------------------------------------ */
/* 基础校验                                                            */
/* ------------------------------------------------------------------ */

export function checkIdCard(raw) {
  const id = String(raw || '').trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(id)) return { ok: false, reason: '身份证号应为 18 位（最后一位可为 X）' };

  const birth = id.slice(6, 14);
  const y = Number(birth.slice(0, 4));
  const m = Number(birth.slice(4, 6));
  const d = Number(birth.slice(6, 8));
  const now = new Date();
  if (y < 1900 || y > now.getFullYear()) return { ok: false, reason: '身份证号中的出生年份不合理' };
  if (m < 1 || m > 12) return { ok: false, reason: '身份证号中的出生月份不合理' };
  // 校验日期是否真实存在（例如 2 月 30 日）
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { ok: false, reason: '身份证号中的出生日期不存在' };
  }

  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * ID_WEIGHTS[i];
  const expect = ID_CHECK_CODES[sum % 11];
  if (expect !== id[17]) return { ok: false, reason: '身份证号校验位不正确，请核对' };

  return {
    ok: true,
    id,
    birth: `${birth.slice(0, 4)}-${birth.slice(4, 6)}-${birth.slice(6, 8)}`,
    gender: Number(id[16]) % 2 === 1 ? '男' : '女',
    masked: `${id.slice(0, 6)}********${id.slice(-4)}`,
  };
}

export function checkCreditCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{18}$/.test(code)) return { ok: false, reason: '统一社会信用代码应为 18 位字母数字' };
  for (const ch of code) {
    if (!CREDIT_CHARSET.includes(ch)) return { ok: false, reason: `统一社会信用代码含非法字符 ${ch}（不含 I O S V Z）` };
  }
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += CREDIT_CHARSET.indexOf(code[i]) * CREDIT_WEIGHTS[i];
  const check = 31 - (sum % 31);
  const expect = CREDIT_CHARSET[check === 31 ? 0 : check];
  if (expect !== code[17]) return { ok: false, reason: '统一社会信用代码校验位不正确，请核对' };

  return {
    ok: true,
    code,
    // 第 1 位是登记管理部门，第 2 位是机构类别
    authority: code[0],
    category: code[1],
    region: code.slice(2, 8),
  };
}

/** 营业执照上常见的企业名称规范 */
export function checkCompanyName(name) {
  const n = String(name || '').trim();
  if (n.length < 4) return { ok: false, reason: '企业名称过短' };
  if (n.length > 60) return { ok: false, reason: '企业名称过长' };
  if (/[<>{}[\]\\]/.test(n)) return { ok: false, reason: '企业名称含非法字符' };
  const looksLegal = /(有限公司|股份有限公司|有限责任公司|集团|合伙企业|个体工商户|事务所|中心|研究院|合作社|厂|店)/.test(n);
  return { ok: true, looksLegal, reason: looksLegal ? '' : '企业名称不含常见组织形式（如「有限公司」），请确认填写正确' };
}

function scanRisk(text) {
  const hits = [];
  const t = String(text || '');
  for (const k of RISK_KEYWORDS) if (k.re.test(t)) hits.push({ label: k.label, level: k.level });
  return hits;
}

/* ------------------------------------------------------------------ */
/* 外部征信（预留）                                                     */
/* ------------------------------------------------------------------ */

/**
 * 预留的外部征信查询入口。目前直接返回 null（不发起外部请求）。
 * 接入企查查 / 天眼查 / 央行征信等以后，在这里调用并把结果返回，
 * aiReviewCompany 会自动把外部结果纳入评分。
 */
export async function fetchExternalCredit() {
  return null;
}

/* ------------------------------------------------------------------ */
/* AI 征信审核                                                         */
/* ------------------------------------------------------------------ */

const SYSTEM_HINT =
  '你是企业信用审核助手。只依据用户提交的材料做判断，不要臆造未提供的信息，也不要做法律结论。';

export async function aiReviewCompany(input) {
  const materials = [
    `企业名称：${input.companyName || '（未填）'}`,
    `统一社会信用代码：${input.creditCode || '（未填）'}`,
    `法定代表人：${input.legalPerson || '（未填）'}`,
    `注册资本：${input.regCapital || '（未填）'}`,
    `成立日期：${input.foundedAt || '（未填）'}`,
    `注册地址：${input.address || '（未填）'}`,
    `经营范围：${input.scope || '（未填）'}`,
    input.extra ? `补充材料：${input.extra}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const local = localReviewCompany(input, materials);
  const external = await fetchExternalCredit(input).catch(() => null);
  if (external) {
    local.external = external;
    local.findings.push(`已获取外部征信数据：${external.summary || '见详情'}`);
  }

  if (!ai.aiStatus().enabled) return local;

  try {
    const raw = await ai.chat(
      [
        { role: 'system', content: SYSTEM_HINT },
        {
          role: 'user',
          content: `请审核下面这家企业的注册材料，判断其作为平台会员的风险等级。

${materials}
${input.licenseText ? `\n营业执照 OCR 文本：\n"""${String(input.licenseText).slice(0, 3000)}"""` : ''}
${external ? `\n外部征信结果：${JSON.stringify(external)}` : ''}

评估维度：
1. 材料完整性与一致性（名称 / 代码 / 法人 / 地址是否互相吻合，有无矛盾）
2. 经营范围是否清晰、是否含需要前置审批的项目
3. 成立时间与注册资本是否与其声称的业务规模相称
4. 是否存在经营异常、失信、涉诉、处罚等风险信号
5. 是否为典型的空壳或高风险主体（如刚成立即承接超大额项目）

只输出 JSON：
{"riskLevel":"low|medium|high","score":0-100,"summary":"一段不超过120字的结论","findings":["发现项"],"missing":["缺失材料"],"advice":"给平台运营的处理建议"}`,
        },
      ],
      { json: true, temperature: 0.2 },
    );
    const parsed = ai.extractJson(raw);
    if (!parsed || parsed.score === undefined) return local;

    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    const risk = ['low', 'medium', 'high'].includes(parsed.riskLevel) ? parsed.riskLevel : local.riskLevel;
    return {
      ...local,
      riskLevel: risk,
      score,
      summary: String(parsed.summary || local.summary).slice(0, 300),
      findings: Array.isArray(parsed.findings) && parsed.findings.length
        ? parsed.findings.map((f) => String(f).slice(0, 200)).slice(0, 12)
        : local.findings,
      missing: Array.isArray(parsed.missing) && parsed.missing.length
        ? parsed.missing.map((m) => String(m).slice(0, 100)).slice(0, 12)
        : local.missing,
      advice: String(parsed.advice || local.advice).slice(0, 300),
      source: 'ai',
      at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[verification] AI 征信审核失败，回退规则引擎:', err.message);
    return { ...local, note: `AI 调用失败：${err.message}` };
  }
}

/** 规则引擎版企业审核：字段完整性 + 代码校验位 + 风险关键词 */
export function localReviewCompany(input, materials = '') {
  const findings = [];
  const missing = [];
  let score = 100;

  const code = checkCreditCode(input.creditCode);
  let hardFail = false;
  if (!input.creditCode) {
    missing.push('统一社会信用代码');
    score -= 25;
  } else if (!code.ok) {
    // 统一社会信用代码是企业唯一的身份标识，校验位不通过属于硬伤：
    // 要么填错了，要么执照本身有问题，不能靠其他字段补齐。
    findings.push(code.reason);
    score -= 45;
    hardFail = true;
  } else {
    findings.push('统一社会信用代码校验位正确');
  }

  const name = checkCompanyName(input.companyName);
  if (!input.companyName) {
    missing.push('企业名称');
    score -= 20;
  } else if (!name.ok) {
    findings.push(name.reason);
    score -= 20;
  } else if (!name.looksLegal) {
    findings.push(name.reason);
    score -= 8;
  }

  for (const [key, label] of [
    ['legalPerson', '法定代表人'],
    ['regCapital', '注册资本'],
    ['foundedAt', '成立日期'],
    ['scope', '经营范围'],
  ]) {
    if (!String(input[key] || '').trim()) {
      missing.push(label);
      score -= key === 'scope' ? 10 : 6;
    }
  }

  if (!input.licenseFileId) {
    missing.push('营业执照照片');
    score -= 25;
  } else {
    findings.push('已上传营业执照');
  }

  // 成立时间与规模是否相称
  if (input.foundedAt) {
    const t = Date.parse(input.foundedAt);
    if (!Number.isNaN(t)) {
      const months = (Date.now() - t) / (1000 * 60 * 60 * 24 * 30);
      if (months < 6) {
        findings.push('企业成立不足 6 个月，建议核实经营实力');
        score -= 15;
      } else if (months < 12) {
        findings.push('企业成立不足 1 年');
        score -= 6;
      }
    } else {
      findings.push('成立日期格式无法识别');
      score -= 5;
    }
  }

  const riskHits = scanRisk(`${materials} ${input.scope || ''} ${input.extra || ''}`);
  for (const h of riskHits) {
    findings.push(`风险信号：${h.label}`);
    score -= h.level === 'high' ? 35 : 18;
  }

  score = Math.max(0, Math.min(100, score));
  const hasHigh = riskHits.some((h) => h.level === 'high');
  // 阈值与自动通过线（80 分）对齐，避免出现「低风险但要转人工」这种自相矛盾的标签
  const riskLevel = hasHigh || hardFail || score < 45 ? 'high' : score < 80 ? 'medium' : 'low';

  const summary =
    riskLevel === 'low'
      ? '材料完整、代码校验通过，未发现明显风险信号。'
      : riskLevel === 'medium'
        ? `材料基本齐全，但存在需人工确认的点：${findings.filter((f) => /不足|未|风险|错误|不正确|非法/.test(f)).slice(0, 3).join('；') || '部分字段缺失'}。`
        : `发现明确风险信号：${riskHits.map((h) => h.label).join('；') || '关键材料缺失或校验不通过'}。`;

  return {
    riskLevel,
    score,
    summary,
    findings,
    missing,
    advice:
      riskLevel === 'low'
        ? '可自动通过，正常开展业务。'
        : riskLevel === 'medium'
          ? '建议转人工复核，重点核对营业执照照片与填写信息是否一致。'
          : '建议拒绝或要求补充材料后重新提交。',
    materials,
    source: 'local',
    at: new Date().toISOString(),
  };
}

/** 个人身份材料审核 */
export function reviewPersonal(input) {
  const findings = [];
  const missing = [];
  let score = 100;

  const id = checkIdCard(input.idNumber);
  if (!input.realName) {
    missing.push('真实姓名');
    score -= 25;
  } else if (String(input.realName).trim().length < 2) {
    findings.push('姓名过短，请填写身份证上的完整姓名');
    score -= 15;
  }
  if (!input.idNumber) {
    missing.push('身份证号');
    score -= 35;
  } else if (!id.ok) {
    findings.push(id.reason);
    score -= 35;
  } else {
    findings.push('身份证号校验位正确');
  }
  if (!input.idFrontFileId) {
    missing.push('身份证人像面照片');
    score -= 20;
  }
  if (!input.idBackFileId) {
    missing.push('身份证国徽面照片');
    score -= 15;
  }

  score = Math.max(0, Math.min(100, score));
  const ok = missing.length === 0 && score >= 80;
  return {
    ok,
    score,
    findings,
    missing,
    summary: ok
      ? '身份信息与证件照片齐全，身份证号校验通过。'
      : `资料不完整或校验未通过：${missing.join('、') || findings.join('；')}。`,
    source: 'local',
    note: '当前未对接公安实名核验接口，仅做证件格式与校验位核对。',
    at: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* 提交与审核                                                          */
/* ------------------------------------------------------------------ */

export function emptyVerification() {
  return {
    type: '',
    status: 'none',
    realName: '',
    idNumber: '',
    idFrontFileId: '',
    idBackFileId: '',
    companyName: '',
    creditCode: '',
    legalPerson: '',
    regCapital: '',
    foundedAt: '',
    scope: '',
    address: '',
    licenseFileId: '',
    extra: '',
    aiReview: null,
    submittedAt: null,
    reviewedAt: null,
    reviewerNote: '',
  };
}

/**
 * 提交实名认证。
 * 个人：格式与材料齐全即自动通过（未接公安核验接口，已在结论里注明）。
 * 企业：由 AI 征信审核打分——低风险自动通过，中风险转人工，高风险拒绝。
 */
export async function submitVerification(user, { type, data = {}, files = {} } = {}) {
  const t = ACCOUNT_TYPES[type] ? type : '';
  if (!t) throw httpError(400, '请选择认证类型（个人 / 企业）');

  const prev = user.verification || emptyVerification();
  const base = {
    ...emptyVerification(),
    ...prev,
    type: t,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewerNote: '',
  };

  if (t === 'personal') {
    const payload = {
      realName: String(data.realName || '').trim().slice(0, 40),
      idNumber: String(data.idNumber || '').trim().toUpperCase().slice(0, 20),
      idFrontFileId: files.idFront || prev.idFrontFileId || '',
      idBackFileId: files.idBack || prev.idBackFileId || '',
    };
    const review = reviewPersonal(payload);
    const next = {
      ...base,
      ...payload,
      companyName: '',
      creditCode: '',
      licenseFileId: '',
      aiReview: review,
      status: review.ok ? 'approved' : 'rejected',
      reviewedAt: review.ok ? new Date().toISOString() : null,
      reviewerNote: review.ok ? '' : review.summary,
    };
    const updated = users().update(user.id, {
      verification: next,
      accountType: 'personal',
      verified: review.ok,
      realName: payload.realName,
    });
    return { user: updated, verification: next, review };
  }

  // 企业
  const payload = {
    companyName: String(data.companyName || '').trim().slice(0, 80),
    creditCode: String(data.creditCode || '').trim().toUpperCase().slice(0, 20),
    legalPerson: String(data.legalPerson || '').trim().slice(0, 40),
    regCapital: String(data.regCapital || '').trim().slice(0, 40),
    foundedAt: String(data.foundedAt || '').trim().slice(0, 20),
    scope: String(data.scope || '').trim().slice(0, 600),
    address: String(data.address || '').trim().slice(0, 200),
    extra: String(data.extra || '').trim().slice(0, 600),
    licenseFileId: files.license || prev.licenseFileId || '',
  };

  const review = await aiReviewCompany({ ...payload, licenseText: data.licenseText || '' });

  // 审核策略：低风险自动通过；中风险转人工；高风险拒绝
  const mode = review.riskLevel === 'low' && review.score >= 80
    ? 'auto'
    : review.riskLevel === 'high'
      ? 'reject'
      : 'manual';
  const status = mode === 'auto' ? 'approved' : mode === 'reject' ? 'rejected' : 'pending';

  const next = {
    ...base,
    ...payload,
    realName: '',
    idNumber: '',
    idFrontFileId: '',
    idBackFileId: '',
    aiReview: review,
    reviewMode: mode,
    status,
    reviewedAt: mode === 'auto' ? new Date().toISOString() : null,
    reviewerNote: mode === 'auto' ? 'AI 征信审核通过' : review.summary,
  };

  const updated = users().update(user.id, {
    verification: next,
    accountType: 'company',
    verified: mode === 'auto',
    company: payload.companyName || user.company || '',
  });

  return { user: updated, verification: next, review, mode };
}

/** 管理员人工复核 */
export function reviewVerification(userId, { agree, note = '' } = {}, admin) {
  const target = users().get(userId);
  if (!target) throw httpError(404, '用户不存在');
  if (!target.verification || target.verification.status === 'none') {
    throw httpError(400, '该用户尚未提交认证材料');
  }
  const status = agree ? 'approved' : 'rejected';
  const next = {
    ...target.verification,
    status,
    reviewedAt: new Date().toISOString(),
    reviewerNote: String(note || '').slice(0, 500),
    reviewedBy: admin?.id || '',
  };
  const patch = {
    verification: next,
    verified: Boolean(agree),
  };
  if (agree && next.type === 'company' && next.companyName) patch.company = next.companyName;
  const updated = users().update(userId, patch);
  return { user: updated, verification: next };
}

/** 认证状态摘要（给前端用） */
export function verificationSummary(user) {
  const v = user?.verification || emptyVerification();
  return {
    accountType: user?.accountType || '',
    accountTypeName: ACCOUNT_TYPES[user?.accountType] || '',
    type: v.type,
    typeName: ACCOUNT_TYPES[v.type] || '',
    status: v.status,
    statusName: VERIFY_STATUS[v.status] || v.status,
    verified: Boolean(user?.verified || v.status === 'approved'),
    reviewMode: v.reviewMode || '',
    reviewModeName: REVIEW_MODES[v.reviewMode] || '',
    riskLevel: v.aiReview?.riskLevel || '',
    riskLevelName: RISK_LEVELS[v.aiReview?.riskLevel] || '',
    score: v.aiReview?.score ?? null,
    summary: v.aiReview?.summary || '',
    findings: v.aiReview?.findings || [],
    missing: v.aiReview?.missing || [],
    advice: v.aiReview?.advice || '',
    source: v.aiReview?.source || '',
    note: v.aiReview?.note || '',
    submittedAt: v.submittedAt,
    reviewedAt: v.reviewedAt,
    reviewerNote: v.reviewerNote,
    realName: v.realName || '',
    idNumberMasked: v.idNumber ? `${v.idNumber.slice(0, 6)}********${v.idNumber.slice(-4)}` : '',
    companyName: v.companyName || '',
    creditCode: v.creditCode || '',
    legalPerson: v.legalPerson || '',
    regCapital: v.regCapital || '',
    foundedAt: v.foundedAt || '',
    scope: v.scope || '',
    address: v.address || '',
  };
}

export default {
  ACCOUNT_TYPES,
  VERIFY_STATUS,
  REVIEW_MODES,
  RISK_LEVELS,
  checkIdCard,
  checkCreditCode,
  checkCompanyName,
  reviewPersonal,
  aiReviewCompany,
  localReviewCompany,
  fetchExternalCredit,
  submitVerification,
  reviewVerification,
  verificationSummary,
  emptyVerification,
  newId,
};
