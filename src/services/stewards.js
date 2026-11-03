/**
 * 主理人（城市 / 行业 / 渠道）
 *
 * 为什么单独一套数据：
 *   服务商是「能干活的公司」（EPC、设计、施工…），
 *   主理人是「帮平台在一个城市/一个行业/一条渠道里张罗事的人」。
 *   两件事的评价标准、权益、审核方式都不一样，混在一张表会互相干扰。
 *
 * 流程（2026-11 起收年费）：
 *   提交申请 → 管理员审核 → 审核通过 → 付年费 → 管理员确认到账 → 开通一年
 *
 * 字段含义：
 *   status         pending / approved / rejected   ← 审核状态
 *   paymentStatus  ''(未到付款环节) / unpaid / claimed(已点"我已付款") / paid / expired
 *   paidAt         到账时间
 *   expiresAt      到期时间（paidAt + 1 年）
 *   active         是否「审核通过 + 年费在有效期内」—— 只有 active 才进公开列表
 */

import db, { newId } from '../store/db.js';

/**
 * 年费（元/年）。
 * 想调价只改这里，前端会自动读到（meta 接口会下发）。
 */
export const FEES = {
  city: 9800,
  industry: 4800,
  channel: 2980,
};

const KINDS = {
  city: { id: 'city', name: '城市主理人', icon: '🏙️', fee: FEES.city },
  industry: { id: 'industry', name: '行业主理人', icon: '🏭', fee: FEES.industry },
  channel: { id: 'channel', name: '渠道主理人', icon: '🔗', fee: FEES.channel },
};

const col = () => db.collection('stewards');

function clean(v, n = 80) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
}

/** 年费是否在有效期内 */
export function isPaid(s) {
  if (!s || s.paymentStatus !== 'paid') return false;
  const t = Date.parse(s.expiresAt || '');
  return Number.isFinite(t) && t > Date.now();
}

/** 是否算「生效的主理人」：审核通过 + 年费有效 */
export function isActive(s) {
  return Boolean(s) && s.status === 'approved' && isPaid(s);
}

/**
 * 对外展示的字段（不暴露手机号）
 */
function publicSteward(s) {
  return {
    id: s.id,
    kind: s.kind,
    kindName: s.kindName,
    name: s.name,
    city: s.city,
    province: s.province,
    industry: s.industry,
    channel: s.channel,
    intro: s.intro,
    fee: s.fee,
    approvedAt: s.approvedAt || s.createdAt,
    expiresAt: s.expiresAt || '',
    hasContact: Boolean(s.phone || s.wechat),
  };
}

export function listStewards({ kind = '', city = '', activeOnly = true } = {}) {
  let rows = col().all().filter((s) => s.status === 'approved');
  if (activeOnly) rows = rows.filter(isActive);
  if (kind && KINDS[kind]) rows = rows.filter((s) => s.kind === kind);
  if (city) {
    const kw = city.toLowerCase();
    rows = rows.filter((s) => String(s.city || '').toLowerCase().includes(kw));
  }
  rows.sort((a, b) => String(b.approvedAt || b.createdAt).localeCompare(String(a.approvedAt || a.createdAt)));
  return rows.map(publicSteward);
}

/** 后台列表：带手机号、缴费状态，可按审核状态筛 */
export function adminList({ status = 'pending', kind = '' } = {}) {
  let rows = col().all();
  if (status && status !== 'all') rows = rows.filter((s) => s.status === status);
  if (kind && KINDS[kind]) rows = rows.filter((s) => s.kind === kind);
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return rows.slice(0, 200).map((s) => ({
    ...s,
    active: isActive(s),
    feeDue: s.status === 'approved' && !isPaid(s),
  }));
}

export function myApplication(userId) {
  const rows = col()
    .where('userId', userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return rows.map((s) => ({
    ...s,
    active: isActive(s),
    feeDue: s.status === 'approved' && !isPaid(s),
  }));
}

export function apply(user, body = {}) {
  const kind = KINDS[String(body.kind || '')] ? String(body.kind) : '';
  if (!kind) {
    const e = new Error('请选择主理人类型（城市 / 行业 / 渠道）');
    e.status = 400;
    throw e;
  }
  const name = clean(body.name || user.nickname, 40);
  if (!name) {
    const e = new Error('请填写联系人姓名');
    e.status = 400;
    throw e;
  }
  const phone = String(body.phone || '').replace(/[^\d+]/g, '').slice(0, 20);
  const wechat = clean(body.wechat, 40);
  if (!phone && !wechat) {
    const e = new Error('请留一个联系方式（手机号或微信）');
    e.status = 400;
    throw e;
  }

  // 同一类型只允许一条进行中的申请，避免刷
  const exist = col().findOne((s) => s.userId === user.id && s.kind === kind && s.status === 'pending');
  if (exist) {
    const e = new Error('这类主理人你已经提交过申请，正在审核中');
    e.status = 409;
    throw e;
  }

  /* 先校验必填定位信息，别先写库再回滚 —— 失败会留下一条 rejected 记录 */
  const city = kind === 'city' ? clean(body.city, 40) : '';
  const industry = kind === 'industry' ? clean(body.industry, 40) : '';
  if (kind === 'city' && !city) {
    const e = new Error('城市主理人必须填写城市');
    e.status = 400;
    throw e;
  }
  if (kind === 'industry' && !industry) {
    const e = new Error('行业主理人必须填写行业');
    e.status = 400;
    throw e;
  }

  const rec = col().insert({
    id: newId('st'),
    userId: user.id,
    kind,
    kindName: KINDS[kind].name,
    name,
    phone,
    wechat,
    city,
    province: kind === 'city' ? clean(body.province, 40) : '',
    industry,
    channel: kind === 'channel' ? clean(body.channel, 60) : '',
    resources: clean(body.resources, 800),
    intro: clean(body.intro, 800),
    status: 'pending',
    reason: '',
    // 年费
    fee: KINDS[kind].fee,
    feeAgreedAt: new Date().toISOString(),
    paymentStatus: 'unpaid',
    paymentClaimedAt: '',
    paidAt: '',
    expiresAt: '',
    createdAt: new Date().toISOString(),
  });

  return rec;
}

export function review(admin, id, { status = 'approved', reason = '' } = {}) {
  const rec = col().get(id);
  if (!rec) {
    const e = new Error('申请不存在');
    e.status = 404;
    throw e;
  }
  const next = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';
  return col().update(id, {
    status: next,
    reason: clean(reason, 200),
    reviewedAt: new Date().toISOString(),
    reviewerId: admin.id,
    approvedAt: next === 'approved' ? new Date().toISOString() : '',
  });
}

/** 用户点「我已付款」——只是声明，等管理员核对到账 */
export function claimPaid(user, id) {
  const rec = col().get(id);
  if (!rec) {
    const e = new Error('申请不存在');
    e.status = 404;
    throw e;
  }
  if (rec.userId !== user.id) {
    const e = new Error('只能操作自己的申请');
    e.status = 403;
    throw e;
  }
  if (rec.status !== 'approved') {
    const e = new Error('审核通过后才能付年费');
    e.status = 400;
    throw e;
  }
  if (isPaid(rec)) return rec;
  return col().update(id, {
    paymentStatus: 'claimed',
    paymentClaimedAt: new Date().toISOString(),
  });
}

/**
 * 管理员确认到账 → 开通一年
 * @param {{status?:'paid'|'unpaid', months?:number}} opts
 */
export function confirmPayment(admin, id, { status = 'paid', months = 12 } = {}) {
  const rec = col().get(id);
  if (!rec) {
    const e = new Error('申请不存在');
    e.status = 404;
    throw e;
  }
  if (status !== 'paid') {
    return col().update(id, { paymentStatus: 'unpaid', paidAt: '', expiresAt: '' });
  }
  const now = new Date();
  const base = (() => {
    // 续费：从原到期日续；首次：从现在算
    const cur = Date.parse(rec.expiresAt || '');
    return Number.isFinite(cur) && cur > now.getTime() ? new Date(cur) : now;
  })();
  const exp = new Date(base);
  exp.setMonth(exp.getMonth() + Number(months || 12));
  return col().update(id, {
    paymentStatus: 'paid',
    paidAt: now.toISOString(),
    expiresAt: exp.toISOString(),
    reviewedById: admin.id,
  });
}

export const STEWARD_KINDS = Object.values(KINDS);

export default {
  listStewards,
  adminList,
  myApplication,
  apply,
  review,
  claimPaid,
  confirmPayment,
  isPaid,
  isActive,
  STEWARD_KINDS,
  FEES,
};
