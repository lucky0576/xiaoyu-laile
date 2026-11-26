/**
 * 跨端请求封装
 *
 * 为什么要单独一层：
 *   小程序里没有 fetch / XMLHttpRequest，只有 uni.request；
 *   H5 里两者都能用，但统一走 uni.request 才能一套代码两端跑。
 *
 * 两个关键约束（踩过就知道有多疼）：
 *   1. 小程序只能请求「已备案的 https 域名」，且必须在抖音/微信后台
 *      配好 request 合法域名。本地调试要勾「不校验合法域名」。
 *   2. 小程序没有 Cookie，登录态只能放 storage + Authorization 头。
 */

const KEY_BASE = 'xyl_api_base';
const KEY_TOKEN = 'xyl_token';
const KEY_USER = 'xyl_user';

let apiBase = '';

/** 小程序端请在部署后改成你的备案域名 */
const MP_DEFAULT_BASE = 'https://xiaoyulaile.online';

export function initApi() {
  let saved = '';
  try {
    saved = uni.getStorageSync(KEY_BASE) || '';
  } catch {
    saved = '';
  }
  if (saved) {
    apiBase = String(saved);
    return;
  }
  // #ifdef H5
  // H5 与后端同源部署时留空即可；独立部署可改成完整地址
  apiBase = '';
  // #endif
  // #ifndef H5
  apiBase = MP_DEFAULT_BASE;
  // #endif
}

export function getApiBase() {
  return apiBase;
}

export function setApiBase(base) {
  apiBase = String(base || '').replace(/\/+$/, '');
  try {
    uni.setStorageSync(KEY_BASE, apiBase);
  } catch {
    /* ignore */
  }
}

export function getToken() {
  try {
    return uni.getStorageSync(KEY_TOKEN) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    if (token) uni.setStorageSync(KEY_TOKEN, token);
    else uni.removeStorageSync(KEY_TOKEN);
  } catch {
    /* ignore */
  }
}

export function getCachedUser() {
  try {
    return uni.getStorageSync(KEY_USER) || null;
  } catch {
    return null;
  }
}

export function setCachedUser(user) {
  try {
    if (user) uni.setStorageSync(KEY_USER, user);
    else uni.removeStorageSync(KEY_USER);
  } catch {
    /* ignore */
  }
}

function fullUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * 发请求。成功返回后端 data 字段；失败抛 Error（带 status/code）。
 */
export function request(path, { method = 'GET', data, header = {}, timeout = 20000 } = {}) {
  const token = getToken();
  const h = { ...header };
  if (token) h.Authorization = `Bearer ${token}`;
  if (method !== 'GET' && !h['Content-Type']) h['Content-Type'] = 'application/json';

  return new Promise((resolve, reject) => {
    uni.request({
      url: fullUrl(path),
      method,
      data,
      header: h,
      timeout,
      success: (res) => {
        const body = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 后端统一返回 { ok, data }，这里只取 data
          resolve(body && typeof body === 'object' && 'data' in body ? body.data : body);
          return;
        }
        const msg =
          (body && (body.message || body.error || body.msg)) || `请求失败（${res.statusCode}）`;
        const err = new Error(msg);
        err.status = res.statusCode;
        err.code = body && body.code;
        reject(err);
      },
      fail: (e) => {
        const err = new Error(
          (e && e.errMsg) || '网络异常，请检查网络或小程序合法域名配置',
        );
        err.code = 'network_error';
        reject(err);
      },
    });
  });
}

/**
 * 上传文件。小程序必须用 uni.uploadFile，不能用普通请求。
 * 注意：抖音/微信小程序一次只能传一个文件，多文件要循环。
 */
export function uploadFile(filePath, { name = 'file', formData = {}, onProgress } = {}) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    const task = uni.uploadFile({
      url: fullUrl('/api/files'),
      filePath,
      name,
      formData,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        let body = res.data;
        try {
          body = JSON.parse(res.data);
        } catch {
          /* 保持原样 */
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body && 'data' in body ? body.data : body);
          return;
        }
        reject(new Error((body && (body.message || body.error)) || '上传失败'));
      },
      fail: (e) => reject(new Error((e && e.errMsg) || '上传失败')),
    });
    if (onProgress && task && task.onProgressUpdate) {
      task.onProgressUpdate((p) => onProgress(p.progress));
    }
  });
}

export default { initApi, request, uploadFile, getToken, setToken, getApiBase, setApiBase };
