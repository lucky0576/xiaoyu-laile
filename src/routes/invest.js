/**
 * 小鱼来了 — 融资意向登记
 *
 * 注意：这里只做「投资意向登记」，不构成公开募集或要约。
 * 所有金额与股权信息仅用于展示融资方案，实际认购以正式协议为准。
 */

import db from '../store/db.js';
import { data, fail, str, num, authUser, rateLimit, clientIp } from './_util.js';
import notifySvc from '../services/notify.js';

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

export default function registerInvestRoutes(app) {
  /** 融资方案 */
  app.get('/api/invest/plan', (req, res) => {
    return data(res, { plan: FINANCING });
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
    if (!/^1[3-9]\d{9}$/.test(phone.replace(/[-\s]/g, ''))) return fail(res, '请填写正确的手机号');
    if (amount < FINANCING.minInvest) return fail(res, `最低认购金额为 ${FINANCING.minInvest} 万元`);
    if (amount > FINANCING.raiseAmount) return fail(res, `认购金额不能超过本轮融资总额 ${FINANCING.raiseAmount} 万元`);

    const doc = interests().insert({
      id: db.newId('iv'),
      userId: user?.id || '',
      name,
      phone,
      amount,
      shares: amount * 10000 / FINANCING.pricePerShare, // 股数
      note,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    // 通知管理员
    for (const admin of db.collection('users').find((u) => u.isAdmin)) {
      notifySvc.notify({
        userId: admin.id,
        type: 'system',
        title: `新的投资意向：${name}`,
        body: `认购 ${amount} 万元（${doc.shares} 股），电话 ${phone}`,
        link: '#/admin',
      });
    }

    return data(res, {
      ok: true,
      interest: {
        id: doc.id,
        name: doc.name,
        amount: doc.amount,
        shares: doc.shares,
        createdAt: doc.createdAt,
      },
    }, 201);
  });

  /** 我的意向 */
  app.get('/api/invest/my', (req, res) => {
    const user = authUser(req);
    if (!user) return data(res, { items: [] });
    const items = interests()
      .find((i) => i.userId === user.id)
      .map((i) => ({ id: i.id, amount: i.amount, shares: i.shares, status: i.status, createdAt: i.createdAt }));
    return data(res, { items });
  });

  return app;
}
