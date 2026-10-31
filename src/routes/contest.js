/**
 * 小鱼来了 — 创业大赛专题接口
 *
 *   GET  /api/contest/list        赛事 + 政策 + 倒计时（公开）
 *   GET  /api/contest/follows     我关注了哪些（需登录）
 *   POST /api/contest/follow      关注 / 取消关注（需登录）
 *   POST /api/admin/contest/remind 扫描关注并推送截止提醒（管理员 / 定时任务调用）
 */

import db from '../store/db.js';
import {
  data, fail, str, bool, mustAuth, clientIp, rateLimit,
} from './_util.js';
import { UPDATED_AT, listWithCountdown, POLICIES, TALENT, daysLeft, CONTESTS } from '../data/contests.js';
import { FUNDS, UPDATED_AT as FUNDS_UPDATED_AT } from '../data/funds.js';
import notifySvc from '../services/notify.js';
import fundSvc from '../services/fund-collect.js';

const users = () => db.collection('users');

/** 关注列表存在 user.settings.contestFollows，不动集合结构 */
function followsOf(user) {
  const raw = user?.settings?.contestFollows;
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
}

export default function registerContestRoutes(app) {
  app.get('/api/contest/list', (req, res) => {
    return data(res, {
      updatedAt: UPDATED_AT,
      contests: listWithCountdown(),
      policies: POLICIES,
      talent: TALENT,
    });
  });

  /** 各地政府基金动向（与赛事数据分开维护） */
  app.get('/api/funds/list', (req, res) => {
    /*
     * 静态条目（人工核实过的）排在前面，
     * 采集来的「已审核」条目接在后面 —— 采集的字段可能不如人工核实得准。
     */
    /*
     * 采集来的条目要和静态条目去重：
     * 静态那条是人工核实过的，同一个基金两边都有时只留静态的。
     * 用「去掉空格/标点后互相包含」判重，容忍「孚腾 S 基金二期」与「孚腾S基金二期」这种写法差异。
     */
    const norm = (x) => String(x || '').replace(/[\s（）()·、,，\-—_]/g, '').toLowerCase();
    const staticNames = FUNDS.map((f) => norm(f.name));
    const collected = fundSvc.publishedFunds({ limit: 60 }).filter((c) => {
      const cn = norm(c.name);
      if (!cn) return false;
      return !staticNames.some((sn) => sn && (sn.includes(cn) || cn.includes(sn)));
    });
    return data(res, {
      updatedAt: FUNDS_UPDATED_AT,
      funds: [...FUNDS, ...collected],
      staticCount: FUNDS.length,
      collectedCount: collected.length,
    });
  });

  /* ---------------- 基金采集与审核（管理员） ---------------- */

  app.post('/api/admin/funds/collect', async (req, res) => {
    const user = mustAuth(req);
    const key = str(req.headers['x-admin-key'] || req.body?.key, 80);
    const viaKey = Boolean(key && process.env.ADMIN_KEY && key === process.env.ADMIN_KEY);
    if (!user.isAdmin && !viaKey) return fail(res, '需要管理员权限', 403, 'forbidden');

    const rl = rateLimit(`fundcollect:${clientIp(req)}`, 6, 60_000);
    if (!rl.ok) return fail(res, `别太频繁，${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const limit = Math.min(8, Math.max(1, Number(req.body?.limit) || 3));
    const dryRun = String(req.body?.dryRun || '') === '1' || req.body?.dryRun === true;
    const sourceId = str(req.body?.sourceId, 40);

    try {
      const report = await fundSvc.collect({ limit, dryRun, sourceId });
      return data(res, { ...report, dryRun });
    } catch (err) {
      return fail(res, err.message || '采集失败', 500, 'collect_failed');
    }
  });

  app.get('/api/admin/funds/pending', (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '需要管理员权限', 403, 'forbidden');
    const status = str(req.query.status, 20) || 'pending';
    return data(res, { items: fundSvc.listFunds({ reviewStatus: status, limit: 80 }), status });
  });

  app.post('/api/admin/funds/:id/review', (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '需要管理员权限', 403, 'forbidden');
    const action = str(req.body?.action, 20);
    if (!['approve', 'reject'].includes(action)) return fail(res, 'action 只能是 approve 或 reject');
    const f = fundSvc.reviewFund(String(req.params.id || ''), action);
    if (!f) return fail(res, '条目不存在', 404, 'not_found');
    return data(res, { item: f });
  });

  app.get('/api/contest/follows', (req, res) => {
    const user = mustAuth(req);
    return data(res, { ids: followsOf(user) });
  });

  app.post('/api/contest/follow', (req, res) => {
    const user = mustAuth(req);
    const rl = rateLimit(`contest-follow:${clientIp(req)}`, 60, 60_000);
    if (!rl.ok) return fail(res, `操作太频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const id = str(req.body?.id, 60);
    const on = bool(req.body?.on);
    if (!id) return fail(res, '缺少赛事 id');
    if (!CONTESTS.some((c) => c.id === id)) return fail(res, '赛事不存在', 404, 'not_found');

    let list = followsOf(user);
    if (on) {
      if (!list.includes(id)) list = [...list, id];
      if (list.length > 20) list = list.slice(-20);
    } else {
      list = list.filter((x) => x !== id);
    }

    users().update(user.id, {
      settings: { ...(user.settings || {}), contestFollows: list },
    });
    return data(res, { ids: list });
  });

  /**
   * 截止提醒。
   * 每天跑一次：找出「关注了某赛事」且「该赛事还剩 ≤ 7 天（或今天截止）」的用户，
   * 每人每天每条赛事只提醒一次（用 contestReminded 记录最近提醒日期）。
   */
  app.post('/api/admin/contest/remind', (req, res) => {
    const user = mustAuth(req);
    // 允许管理员手动触发；定时任务用 ADMIN_KEY（如果配置了）
    const key = str(req.headers['x-admin-key'] || req.body?.key, 80);
    const viaKey = Boolean(key && process.env.ADMIN_KEY && key === process.env.ADMIN_KEY);
    if (!user.isAdmin && !viaKey) return fail(res, '需要管理员权限', 403, 'forbidden');

    const now = Date.now();
    const today = new Date(now + 8 * 3600_000).toISOString().slice(0, 10); // 按北京时间算「今天」
    const report = { scanned: 0, matched: 0, sent: 0, details: [] };

    /*
     * 正常模式：取 7 天内截止的赛事。
     * 测试模式（overrideId + overrideDays）：把指定赛事当成「还剩 N 天」，
     * 用来验证提醒链路是否能真的发出去 —— 否则一年里大部分时间都没东西可提醒。
     */
    const overrideId = str(req.body?.overrideId, 60);
    const overrideDays = Number(req.body?.overrideDays);
    const useOverride = overrideId && Number.isFinite(overrideDays);

    const upcoming = CONTESTS.filter((c) => {
      if (useOverride) return c.id === overrideId;
      const d = daysLeft(c.deadline, now);
      return d !== null && d >= 0 && d <= 7;
    }).map((c) => (useOverride ? { ...c, daysLeft: overrideDays } : c));
    if (!upcoming.length) return data(res, { ...report, note: '近 7 天内没有即将截止的赛事' });

    for (const u of users().all()) {
      const follows = followsOf(u);
      if (!follows.length) continue;
      report.scanned += 1;

      const hit = upcoming.filter((c) => follows.includes(c.id));
      if (!hit.length) continue;

      const reminded = (u.settings && u.settings.contestReminded) || {};
      for (const c of hit) {
        if (reminded[c.id] === today) continue; // 今天已提醒过
        report.matched += 1;

        try {
          notifySvc.notify({
            userId: u.id,
            type: 'contest_remind',
            title: `报名提醒：${c.name}`,
            body: c.daysLeft === 0 ? '今天报名截止，别错过。' : `报名还剩 ${c.daysLeft} 天。`,
            link: `/#/contest`,
            meta: { contestId: c.id, deadline: c.deadline },
          });
          reminded[c.id] = today;
          report.sent += 1;
          report.details.push({ userId: u.id, contest: c.id });
        } catch (err) {
          report.details.push({ userId: u.id, contest: c.id, error: err.message });
        }
      }

      users().update(u.id, {
        settings: { ...(u.settings || {}), contestReminded: reminded },
      });
    }

    return data(res, { ...report, today });
  });
}
