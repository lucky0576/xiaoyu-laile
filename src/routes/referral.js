/**
 * 小鱼来了 — 推荐码接口
 *
 *   GET  /api/referral/me      我的推荐码 / 二维码 / 已推荐用户
 *   GET  /api/referral/check   校验某个推荐码是否有效（注册页用）
 */

import referralSvc from '../services/referral.js';
import { data, fail, str, mustAuth, baseUrl } from './_util.js';

export default function registerReferralRoutes(app) {
  app.get('/api/referral/me', (req, res) => {
    const user = mustAuth(req);
    return data(res, referralSvc.myReferral(user, baseUrl(req)));
  });

  app.get('/api/referral/check', (req, res) => {
    const code = str(req.query.code, 20).trim().toUpperCase();
    if (!code) return fail(res, '请填写推荐码', 400, 'empty');
    const u = referralSvc.findByRefCode(code);
    if (!u) return data(res, { valid: false, code });
    return data(res, {
      valid: true,
      code,
      inviter: { nickname: u.nickname || '', company: u.company || '' },
    });
  });
}
