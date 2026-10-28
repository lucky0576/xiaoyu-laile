/**
 * 小鱼来了 — 种子轮融资：意向 / 确认 / 打款 / 凭证 / 股权证
 *
 * 状态流转：
 *   pending          已提交意向，等待用户确认
 *   confirmed        已确认，投资协议书已生成，等待打款
 *   proof_uploaded   已上传打款凭证，等待核验
 *   verified         核验通过，股权证已生成
 *   rejected         已驳回
 *
 * 注意：收款账户只从 .env 读取，绝不写进代码或仓库。
 * 所有金额与股权信息仅用于展示融资方案，实际认购以正式协议为准。
 */

import db from '../store/db.js';
import { config } from '../config.js';
import { data, fail, str, num, authUser, mustAuth, rateLimit, clientIp } from './_util.js';
import notifySvc from '../services/notify.js';
import { saveUploads, filePublic, getFile } from '../services/files.js';

const interests = () => db.collection('investInterests');

/** 融资方案（集中配置，改这里全站同步） */
export const FINANCING = {
  round: '种子轮',
  raiseAmount: 100, // 万元
  valuation: 1000, // 万元（投后）
  stake: 10, // %
  pricePerShare: 1, // 元
  minInvest: 5, // 万元
  minShares: 5, // 万股（= 5 万元 / 1 元）
  totalShares: 1000, // 万股
  rights: '仅享有收益权，不享有投票权与经营权',
  usage: [
    { name: '平台建设', amount: 40, note: '产品迭代、服务器与带宽、AI 能力接入' },
    { name: '模式验证', amount: 35, note: '首批产业资源人招募与分佣体系跑通' },
    { name: '运维与合规', amount: 25, note: '日常运营、资质与合规投入' },
  ],
};

export const INVEST_STATUS = {
  pending: '待确认',
  confirmed: '待打款',
  proof_uploaded: '待核验',
  verified: '已完成',
  rejected: '已驳回',
};

/* ------------------------------------------------------------------ */
/* 额度                                                                */
/* ------------------------------------------------------------------ */

/**
 * 本轮额度占用情况。
 * 「已占额度」把待确认/待打款/待核验/已完成都算进去（驳回的不算），
 * 避免用户先占坑再拖，导致实际能募到的钱和承诺的对不上。
 */
export function quotaOf() {
  const all = interests().all();
  const active = all.filter((i) => i.status !== 'rejected');
  const used = active.reduce((s, i) => s + Number(i.amount || 0), 0);
  const verified = all
    .filter((i) => i.status === 'verified')
    .reduce((s, i) => s + Number(i.amount || 0), 0);
  const total = Number(FINANCING.raiseAmount);
  const remaining = Math.max(0, total - used);
  const closed = remaining < Number(FINANCING.minInvest);

  return {
    total,
    used: Math.round(used * 100) / 100,
    verified: Math.round(verified * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    percent: Math.min(100, Math.round((used / total) * 100)),
    closed,
    investors: new Set(active.map((i) => i.phone)).size,
  };
}

/* ------------------------------------------------------------------ */
/* 编号                                                                */
/* ------------------------------------------------------------------ */

function pad(n, len = 4) {
  return String(n).padStart(len, '0');
}

function nextSeq(prefix) {
  const year = new Date().getFullYear();
  const count = interests().count((i) => String(i.agreementNo || i.certNo || '').includes(`${prefix}-${year}-`));
  return `${prefix}-${year}-${pad(count + 1)}`;
}

/* ------------------------------------------------------------------ */
/* 视图                                                                */
/* ------------------------------------------------------------------ */

/** 打款账户（仅在已确认后返回给本人） */
function bankInfo() {
  return {
    name: config.invest.bankName || '（未配置）',
    card: config.invest.bankCard || '（未配置）',
    branch: config.invest.branch || config.invest.bankBranch || '（未配置）',
  };
}

export function interestView(i, { withBank = false } = {}) {
  if (!i) return null;
  return {
    id: i.id,
    name: i.name,
    phone: i.phone,
    amount: i.amount,
    shares: i.shares,
    status: i.status,
    statusName: INVEST_STATUS[i.status] || i.status,
    note: i.note || '',
    agreementNo: i.agreementNo || '',
    agreedAt: i.agreedAt || '',
    proof: i.proof
      ? { url: i.proof.url, name: i.proof.name, uploadedAt: i.proof.uploadedAt, note: i.proof.note || '' }
      : null,
    certNo: i.certNo || '',
    certIssuedAt: i.certIssuedAt || '',
    rejectReason: i.rejectReason || '',
    createdAt: i.createdAt,
    ...(withBank && ['confirmed', 'proof_uploaded', 'verified'].includes(i.status) ? { bank: bankInfo() } : {}),
  };
}

function ownedOrFail(req, id) {
  const user = mustAuth(req);
  const i = interests().get(id);
  if (!i) {
    const e = new Error('投资意向不存在');
    e.status = 404;
    e.code = 'not_found';
    throw e;
  }
  if (i.userId !== user.id && !user.isAdmin) {
    const e = new Error('无权查看该记录');
    e.status = 403;
    e.code = 'forbidden';
    throw e;
  }
  return { user, interest: i };
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */
export default function registerInvestRoutes(app) {
  /** 融资方案 */
  app.get('/api/invest/plan', (req, res) => {
    return data(res, { plan: FINANCING, quota: quotaOf() });
  });

  /** 提交投资意向 */
  app.post('/api/invest/interest', (req, res) => {
    const user = authUser(req);
    const rl = rateLimit(`invest:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return fail(res, `提交过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const name = str(req.body?.name, 40).trim();
    const phone = str(req.body?.phone, 30).trim();
    const amount = num(req.body?.amount, 0);
    const note = str(req.body?.note, 500).trim();

    if (!name) return fail(res, '请填写姓名');
    if (!/^\d{11}$/.test(phone.replace(/[-\s]/g, ''))) return fail(res, '请填写 11 位手机号');
    if (amount < FINANCING.minInvest) return fail(res, `最低认购金额为 ${FINANCING.minInvest} 万元`);

    const q = quotaOf();
    if (q.closed) {
      return fail(res, '本轮融资额度已认购完毕，暂不再接受新的投资意向', 409, 'round_closed');
    }
    if (amount > q.remaining) {
      return fail(res, `剩余可认购额度仅 ${q.remaining} 万元`, 400, 'over_quota');
    }

    const now = new Date().toISOString();
    const doc = interests().insert({
      id: db.newId('iv'),
      userId: user?.id || '',
      name,
      phone,
      amount,
      shares: (amount * 10000) / FINANCING.pricePerShare,
      note,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    for (const admin of db.collection('users').find((u) => u.isAdmin)) {
      notifySvc.notify({
        userId: admin.id,
        type: 'system',
        title: `新的投资意向：${name}`,
        body: `认购 ${amount} 万元（${doc.shares} 股），电话 ${phone}`,
        link: '#/admin',
      });
    }

    return data(res, { ok: true, interest: interestView(doc) }, 201);
  });

  /** 我的投资列表 */
  app.get('/api/invest/my', (req, res) => {
    const user = mustAuth(req);
    const items = interests()
      .find((i) => i.userId === user.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((i) => interestView(i));
    return data(res, { items });
  });

  /** 投资详情（含打款账户） */
  app.get('/api/invest/:id', (req, res) => {
    try {
      const { interest } = ownedOrFail(req, req.params.id);
      return data(res, { interest: interestView(interest, { withBank: true }), plan: FINANCING });
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
  });

  /** 用户确认投资意向 → 生成投资协议书编号 */
  app.post('/api/invest/:id/confirm', (req, res) => {
    try {
      const { user, interest } = ownedOrFail(req, req.params.id);
      if (interest.status !== 'pending') {
        return fail(res, `当前状态（${INVEST_STATUS[interest.status] || interest.status}）无法确认`, 409, 'bad_status');
      }
      const now = new Date().toISOString();
      const updated = interests().update(interest.id, {
        status: 'confirmed',
        agreementNo: interest.agreementNo || nextSeq('XY'),
        agreedAt: now,
        agreedIp: clientIp(req),
        updatedAt: now,
      });

      for (const admin of db.collection('users').find((u) => u.isAdmin)) {
        notifySvc.notify({
          userId: admin.id,
          type: 'system',
          title: `投资意向已确认：${updated.name}`,
          body: `协议编号 ${updated.agreementNo}，认购 ${updated.amount} 万元，等待打款`,
          link: '#/admin',
        });
      }
      return data(res, { interest: interestView(updated, { withBank: true }) });
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
  });

  /** 上传打款凭证 */
  app.post('/api/invest/:id/proof', async (req, res) => {
    let target;
    try {
      target = ownedOrFail(req, req.params.id);
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
    const { user, interest } = target;
    if (!['confirmed', 'proof_uploaded'].includes(interest.status)) {
      return fail(res, `当前状态（${INVEST_STATUS[interest.status] || interest.status}）无法上传凭证`, 409, 'bad_status');
    }

    const saved = await saveUploads(req, { ownerId: user.id, role: 'invest-proof' });
    if (!saved.length) return fail(res, '请上传打款凭证截图');

    const f = saved[0];
    const now = new Date().toISOString();
    const updated = interests().update(interest.id, {
      status: 'proof_uploaded',
      proof: {
        fileId: f.id,
        url: f.url,
        name: f.name,
        note: str(req.body?.note, 200).trim(),
        uploadedAt: now,
      },
      updatedAt: now,
    });

    for (const admin of db.collection('users').find((u) => u.isAdmin)) {
      notifySvc.notify({
        userId: admin.id,
        type: 'system',
        title: `打款凭证待核验：${updated.name}`,
        body: `协议 ${updated.agreementNo}，${updated.amount} 万元`,
        link: '#/admin',
      });
    }

    return data(res, { interest: interestView(updated), file: filePublic(f) }, 201);
  });

  /* ---------------- 管理端 ---------------- */

  app.get('/api/admin/invest', (req, res) => {
    const admin = mustAuth(req);
    if (!admin.isAdmin) return fail(res, '需要管理员权限', 403, 'forbidden');
    const status = str(req.query.status, 20);
    let list = interests().all();
    if (status && status !== 'all') list = list.filter((i) => i.status === status);
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return data(res, {
      total: list.length,
      items: list.map((i) => ({
        ...interestView(i),
        userId: i.userId,
        bank: undefined,
      })),
    });
  });

  /** 管理员核验打款凭证 → 通过后签发股权证 */
  app.post('/api/admin/invest/:id/verify', (req, res) => {
    const admin = mustAuth(req);
    if (!admin.isAdmin) return fail(res, '需要管理员权限', 403, 'forbidden');

    const i = interests().get(req.params.id);
    if (!i) return fail(res, '投资意向不存在', 404, 'not_found');
    if (i.status !== 'proof_uploaded') {
      return fail(res, `当前状态（${INVEST_STATUS[i.status] || i.status}）无法核验`, 409, 'bad_status');
    }

    const agree = Boolean(req.body?.agree);
    const note = str(req.body?.note, 300).trim();
    const now = new Date().toISOString();

    if (!agree) {
      const updated = interests().update(i.id, {
        status: Math.random() < 0 ? 'rejected' : 'rejected',
        rejectReason: note || '打款凭证未能核验',
        reviewedAt: now,
        reviewedBy: admin.id,
        updatedAt: now,
      });
      notifySvc.notify({
        userId: i.userId,
        type: 'system',
        title: '打款凭证核验未通过',
        body: note || '请核对打款金额与账户后重新上传凭证',
        link: `#/invest/${i.id}`,
      });
      return data(res, { interest: interestView(updated) });
    }

    const updated = interests().update(i.id, {
      status: 'verified',
      certNo: i.certNo || nextSeq('XYGQ'),
      certIssuedAt: now,
      reviewedAt: now,
      reviewedBy: admin.id,
      rejectReason: '',
      updatedAt: now,
    });

    notifySvc.notify({
      userId: i.userId,
      type: 'system',
      title: '投资完成，股权证已签发',
      body: `股权证编号 ${updated.certNo}，认购 ${updated.amount} 万元（${updated.shares} 股）`,
      link: `#/invest/${i.id}/cert`,
    });

    return data(res, { interest: interestView(updated) });
  });
}
