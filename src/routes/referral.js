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

  /* 记录一次分享动作（海报 / 文案 / 链接） */
  app.post('/api/referral/share', (req, res) => {
    const user = mustAuth(req);
    const channel = str(req.body?.channel, 20) || 'text';
    referralSvc.logShare(user, channel);
    return data(res, { ok: true, stats: referralSvc.shareStats(user.id) });
  });

  /* 我的分享数据 */
  app.get('/api/referral/stats', (req, res) => {
    const user = mustAuth(req);
    return data(res, referralSvc.shareStats(user.id));
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
