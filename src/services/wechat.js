/**
 * 微信集成
 *
 * 覆盖三类能力，全部支持"未配置即降级"：
 *   1. 公众号网页授权登录（snsapi_userinfo）—— 微信内打开直接登录
 *   2. 开放平台扫码登录（snsapi_login）—— PC 端扫码
 *   3. JS-SDK 分享 —— 分享到微信好友 / 朋友圈，支持
 *        · 图片 + 文字 + 二维码（海报分享）
 *        · 链接 + 标题文字（标准 JSSDK 分享）
 *
 * 未配置 AppID 时：/api/auth/wechat/* 走演示模式，直接创建/登录演示账号，
 * 保证平台功能可以完整走通。
 */
import crypto from 'node:crypto';
import { config, wechatConfigured } from '../config.js';
import { httpError } from '../http/app.js';

const API = 'https://api.weixin.qq.com';

/* ------------------------------------------------------------------ */
/* 缓存：access_token / jsapi_ticket                                    */
/* ------------------------------------------------------------------ */
const cache = new Map();

function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/* ------------------------------------------------------------------ */
/* OAuth                                                              */
/* ------------------------------------------------------------------ */
export function isWechatReady() {
  return wechatConfigured();
}

export function isOpenPlatformReady() {
  return Boolean(config.wechat.openAppId && config.wechat.openAppSecret);
}

/** 微信公众号网页授权地址（微信内浏览器） */
export function mpOAuthUrl(redirectUri, state = '', scope = 'snsapi_userinfo') {
  if (!config.wechat.appId) return null;
  const q = new URLSearchParams({
    appid: config.wechat.appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
  });
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${q.toString()}#wechat_redirect`;
}

/** 开放平台扫码登录地址（PC） */
export function qrConnectUrl(redirectUri, state = '') {
  if (!isOpenPlatformReady()) return null;
  const q = new URLSearchParams({
    appid: config.wechat.openAppId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${q.toString()}#wechat_redirect`;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw httpError(502, `微信接口返回 ${res.status}`);
  return res.json();
}

export async function exchangeMpCode(code) {
  if (!wechatConfigured()) throw httpError(400, '未配置微信公众号，无法使用微信登录');
  const url = `${API}/sns/oauth2/access_token?appid=${config.wechat.appId}&secret=${config.wechat.appSecret}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const data = await getJson(url);
  if (data.errcode) throw httpError(400, `微信授权失败：${data.errmsg}`, 'wechat_auth_failed');
  return {
    accessToken: data.access_token,
    openid: data.openid,
    unionid: data.unionid || '',
    scope: data.scope,
  };
}

export async function exchangeOpenCode(code) {
  if (!isOpenPlatformReady()) throw httpError(400, '未配置微信开放平台，无法扫码登录');
  const url = `${API}/sns/oauth2/access_token?appid=${config.wechat.openAppId}&secret=${config.wechat.openAppSecret}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const data = await getJson(url);
  if (data.errcode) throw httpError(400, `微信授权失败：${data.errmsg}`, 'wechat_auth_failed');
  return { accessToken: data.access_token, openid: data.openid, unionid: data.unionid || '' };
}

export async function fetchWechatUser(accessToken, openid) {
  const url = `${API}/sns/userinfo?access_token=${accessToken}&openid=${openid}&lang=zh_CN`;
  const data = await getJson(url);
  if (data.errcode) return null;
  return {
    openid: data.openid,
    nickname: data.nickname,
    avatar: data.headimgurl,
    sex: data.sex,
    city: data.city,
    province: data.province,
    unionid: data.unionid || '',
  };
}

/* ------------------------------------------------------------------ */
/* access_token / jsapi_ticket                                         */
/* ------------------------------------------------------------------ */
export async function getAccessToken() {
  if (!wechatConfigured()) throw httpError(400, '未配置微信公众号');
  const key = 'mp_access_token';
  const cached = cacheGet(key);
  if (cached) return cached;
  const url = `${API}/cgi-bin/token?grant_type=client_credential&appid=${config.wechat.appId}&secret=${config.wechat.appSecret}`;
  const data = await getJson(url);
  if (data.errcode) throw httpError(502, `获取 access_token 失败：${data.errmsg}`);
  cacheSet(key, data.access_token, Math.max(60, (data.expires_in - 300) * 1000));
  return data.access_token;
}

export async function getJsapiTicket() {
  const key = 'jsapi_ticket';
  const cached = cacheGet(key);
  if (cached) return cached;
  const token = await getAccessToken();
  const data = await getJson(`${API}/cgi-bin/ticket/getticket?access_token=${token}&type=jsapi`);
  if (data.errcode) throw httpError(502, `获取 jsapi_ticket 失败：${data.errmsg}`);
  cacheSet(key, data.ticket, Math.max(60, (data.expires_in - 300) * 1000));
  return data.ticket;
}

/** JS-SDK config（wx.config 所需） */
export async function jsSdkConfig(url) {
  if (!wechatConfigured()) return null;
  const ticket = await getJsapiTicket();
  const nonceStr = crypto.randomBytes(8).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = crypto.createHash('sha1').update(raw).digest('hex');
  return { appId: config.wechat.appId, timestamp, nonceStr, signature };
}

/** 校验微信服务器推送签名 */
export function verifyServerSignature({ signature, timestamp, nonce, echostr }) {
  if (!config.wechat.token) return { ok: false, reason: '未配置 WECHAT_TOKEN' };
  const arr = [config.wechat.token, timestamp, nonce].sort();
  const hash = crypto.createHash('sha1').update(arr.join('')).digest('hex');
  const ok = hash === signature;
  return { ok, echostr: ok ? echostr : '' };
}

/* ------------------------------------------------------------------ */
/* 分享                                                                */
/* ------------------------------------------------------------------ */
/**
 * 生成分享所需的两套信息：
 *  - image：图片 + 文字 + 二维码（前端用 Canvas 合成海报）
 *  - link ：链接 + 标题文字（JS-SDK / 直接复制）
 */
export function buildSharePayload({ listing, baseUrl }) {
  const url = listing.shareUrl || `${baseUrl}/#/detail/${listing.id}`;
  const title = listing.shareTitle || listing.title || '小鱼来了';
  const desc =
    listing.shareDesc ||
    listing.subtitle ||
    listing?.ai?.summary?.slice(0, 60) ||
    '项目 / 活动 / 贸易信息，尽在小鱼来了';

  const coverFile = (listing.files || []).find((f) => f.id === listing.coverId) ||
    (listing.files || []).find((f) => f.kind === 'image');
  const imgUrl = coverFile ? `${baseUrl}${coverFile.url}` : `${baseUrl}/static/share-default.png`;

  return {
    url,
    title,
    desc,
    imgUrl,
    qr: `${baseUrl}/api/share/qrcode?text=${encodeURIComponent(url)}`,
    modes: [
      {
        id: 'image',
        name: '图片 + 文字 + 二维码',
        desc: '生成带二维码的海报图，适合发朋友圈、微信群',
        text: `${title}\n${desc}\n长按识别二维码查看详情 →`,
      },
      {
        id: 'link',
        name: '链接 + 标题文字',
        desc: '直接分享网页链接，微信内自动展示标题、摘要与封面图',
        text: `${title}\n${desc}\n${url}`,
      },
    ],
  };
}

/**
 * 微信内分享的配置：JS-SDK ready 之后调用 wx.updateAppMessageShareData /
 * wx.updateTimelineShareData。
 */
export async function buildWechatShare({ listing, baseUrl, pageUrl }) {
  const payload = buildSharePayload({ listing, baseUrl });
  const jsSdk = await jsSdkConfig(pageUrl).catch(() => null);
  return {
    ...payload,
    jsSdk,
    ready: Boolean(jsSdk),
    hint: jsSdk
      ? '微信内将自动调用 JS-SDK 完成分享'
      : '未配置公众号 JS-SDK，请使用"图片+二维码"海报方式分享',
    timeline: { title: payload.title, query: '' },
    appMessage: {
      title: payload.title,
      desc: payload.desc,
      link: payload.url,
      imgUrl: payload.imgUrl,
    },
  };
}

export function status() {
  return {
    mp: wechatConfigured(),
    open: isOpenPlatformReady(),
    demoMode: config.wechat.demoMode,
    appId: config.wechat.appId ? `${config.wechat.appId.slice(0, 6)}****` : '',
  };
}

export default {
  mpOAuthUrl,
  qrConnectUrl,
  exchangeMpCode,
  exchangeOpenCode,
  fetchWechatUser,
  jsSdkConfig,
  verifyServerSignature,
  buildSharePayload,
  buildWechatShare,
  status,
  isWechatReady,
};
