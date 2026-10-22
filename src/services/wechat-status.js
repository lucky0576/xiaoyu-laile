/**
 * 小鱼来了 — 微信公众号接入状态
 *
 * 目的：公众号 JS-SDK 的代码已经写好，但需要填 AppID/AppSecret 才生效。
 * 这里把「哪些配了、哪些没配、还差什么」如实暴露出来，
 * 方便管理员知道下一步该做什么，而不是「分享卡片怎么没变」。
 */

import { config } from '../config.js';
import wechat from './wechat.js';

const REQUIRED = [
  { key: 'WECHAT_APP_ID', label: '公众号 AppID', desc: '微信公众平台 → 开发 → 基本配置 → AppID' },
  { key: 'WECHAT_APP_SECRET', label: '公众号 AppSecret', desc: '同上，AppSecret（只显示一次，务必保存）' },
  { key: 'WECHAT_TOKEN', label: '服务器 Token', desc: '用于接收微信服务器推送校验，自定义字符串' },
];

function mask(s) {
  const v = String(s || '');
  if (!v) return '';
  if (v.length <= 8) return `${v.slice(0, 2)}****`;
  return `${v.slice(0, 6)}****${v.slice(-2)}`;
}

export function wechatStatus() {
  const appId = config.wechat.appId || '';
  const appSecret = config.wechat.appSecret || '';
  const token = config.wechat.token || '';

  const filled = {
    WECHAT_APP_ID: Boolean(appId),
    WECHAT_APP_SECRET: Boolean(appSecret),
    WECHAT_TOKEN: Boolean(token),
  };

  const missing = REQUIRED.filter((r) => !filled[r.key]).map((r) => r.key);
  const jsSdkReady = Boolean(appId && appSecret);

  return {
    // 公众号 JS-SDK（分享卡片自定义标题/摘要/封面）
    jsSdkReady,
    // 公众号网页授权（微信登录）
    mpReady: Boolean(appId && appSecret),
    // 开放平台扫码登录
    openReady: Boolean(config.wechat.openAppId && config.wechat.openAppSecret),
    // 演示模式（未配置时允许一键演示登录）
    demoMode: Boolean(config.wechat.demoMode),

    filled,
    missing,
    fields: REQUIRED.map((r) => ({ ...r, filled: filled[r.key] })),
    appIdMasked: mask(appId),

    // 已配置但可能还没生效的原因
    notes: jsSdkReady
      ? ['公众号已配置。还需在公众号后台把「JS 接口安全域名」设置为本站域名，否则 wx.config 会报 invalid signature。']
      : [
          '公众号未配置，微信内转发会使用默认标题与封面（功能正常，只是卡片信息不自定义）。',
          '填写 WECHAT_APP_ID / WECHAT_APP_SECRET 后重启服务即可生效。',
        ],
  };
}

export default { wechatStatus };
