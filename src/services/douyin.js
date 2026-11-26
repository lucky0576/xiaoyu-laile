/**
 * 抖音开放平台 OAuth（登录 / 注册）
 *
 * 和微信一样，抖音网页授权是标准 OAuth 2.0 三步：
 *   1. 跳转授权页，用户同意后带 code 回到 redirect_uri
 *   2. 用 code 换 access_token + open_id
 *   3. 用 access_token + open_id 拉用户信息（昵称、头像）
 *
 * 接口文档口径（2026）：
 *   授权页   GET  https://open.douyin.com/platform/oauth/connect/
 *   换 token POST https://open.douyin.com/oauth/access_token/
 *   用户信息 POST https://open.douyin.com/oauth/userinfo/
 *
 * 抖音的返回体是 { data: {...}, message: '...' }，业务错误放在
 * data.error_code / data.description 里，HTTP 状态码仍是 200。
 * 所以必须看 error_code，不能只看 status —— 这是最容易踩的坑。
 *
 * 未配置 clientKey/Secret 时不发任何网络请求，前端走演示登录。
 */

import config from '../config.js';

const OAUTH_BASE = 'https://open.douyin.com';

/** 是否已配置抖音开放平台应用 */
export function isDouyinReady() {
  return Boolean(config.douyin?.clientKey && config.douyin?.clientSecret);
}

/** 授权页地址。未配置返回 null。 */
export function oauthUrl(redirectUri, state = '', scope = 'user_info') {
  if (!isDouyinReady()) return null;
  const q = new URLSearchParams({
    client_key: config.douyin.clientKey,
    response_type: 'code',
    scope,
    redirect_uri: redirectUri,
    state,
  });
  return `${OAUTH_BASE}/platform/oauth/connect/?${q.toString()}`;
}

/** 抖音统一响应解包：业务错误在 data.error_code 里。 */
function unwrap(payload, what) {
  const d = payload?.data || {};
  if (d.error_code) {
    throw new Error(`${what}失败（${d.error_code}）：${d.description || '抖音开放平台返回错误'}`);
  }
  if (payload?.message && payload.message !== 'success' && !d.open_id && !d.access_token) {
    throw new Error(`${what}失败：${payload.message}`);
  }
  return d;
}

async function postJson(path, body) {
  const res = await fetch(`${OAUTH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`抖音接口返回的不是 JSON（HTTP ${res.status}）`);
  }
  return unwrap(payload, '抖音授权');
}

/**
 * 用授权 code 换 access_token。
 * @returns {{ accessToken, openId, unionId, scope, expiresIn, refreshToken }}
 */
export async function exchangeCode(code) {
  if (!isDouyinReady()) throw new Error('抖音登录未配置');
  const d = await postJson('/oauth/access_token/', {
    client_key: config.douyin.clientKey,
    client_secret: config.douyin.clientSecret,
    code: String(code || ''),
    grant_type: 'authorization_code',
  });
  if (!d.access_token || !d.open_id) {
    throw new Error('抖音授权失败：未拿到 access_token');
  }
  return {
    accessToken: d.access_token,
    openId: d.open_id,
    unionId: d.union_id || '',
    scope: d.scope || '',
    expiresIn: Number(d.expires_in) || 0,
    refreshToken: d.refresh_token || '',
  };
}

/**
 * 拉抖音用户信息。
 * @returns {{ openId, unionId, nickname, avatar, douyinId, city, province }}
 */
export async function fetchUser(accessToken, openId) {
  const d = await postJson('/oauth/userinfo/', { access_token: accessToken, open_id: openId });
  return {
    openId: d.open_id || openId,
    unionId: d.union_id || '',
    nickname: String(d.nickname || '').slice(0, 40),
    avatar: String(d.avatar || ''),
    // 抖音号（部分应用有「抖音号」字段，取不到就留空）
    douyinId: String(d.douyin_id || d.unique_id || '').slice(0, 60),
    city: String(d.city || '').slice(0, 40),
    province: String(d.province || '').slice(0, 40),
  };
}

/** 给前端看的配置状态（不泄露 secret） */
export function status() {
  const key = config.douyin?.clientKey || '';
  return {
    configured: isDouyinReady(),
    demoMode: Boolean(config.douyin?.demoMode),
    clientKey: key ? `${key.slice(0, 6)}****` : '',
  };
}

export default { isDouyinReady, oauthUrl, exchangeCode, fetchUser, status };
