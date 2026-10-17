/**
 * 小鱼来了 — 前端 API 客户端
 */
const TOKEN_KEY = 'xyl_token';
const USER_KEY = 'xyl_user';

export const store = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  },
  set token(v) {
    try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  },
  set user(v) {
    try { v ? localStorage.setItem(USER_KEY, JSON.stringify(v)) : localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
  },
  clear() {
    this.token = '';
    this.user = null;
  },
};

export function isLoggedIn() {
  return Boolean(store.token);
}

function authHeaders() {
  const t = store.token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function qs(query) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function request(method, path, opts = {}) {
  const { body, form, query, headers = {}, signal } = opts;
  const init = {
    method,
    headers: { ...authHeaders(), ...headers },
    credentials: 'same-origin',
    signal,
  };
  if (form) init.body = form;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path + qs(query), init);
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError('网络连接失败，请检查网络后重试', 0, 'network');
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  const failed = !res.ok || (json && json.ok === false);
  if (failed) {
    const message = (json && (json.error || json.message)) || `请求失败（${res.status}）`;
    const err = new ApiError(message, res.status, json && json.code);
    if (res.status === 401) {
      store.clear();
      window.dispatchEvent(new CustomEvent('xyl:unauthorized', { detail: err }));
    }
    throw err;
  }
  return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
}

export const api = {
  get: (path, query, opts) => request('GET', path, { ...opts, query }),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  del: (path, query, opts) => request('DELETE', path, { ...opts, query }),

  /**
   * 带进度的文件上传。
   *
   * 关键：必须保证 Promise **一定会 settle**。
   * 原来没有 timeout、没有 onabort / ontimeout，服务端一旦不响应
   * （例如超限时直接掐断连接），这个 Promise 就永远挂着 ——
   * 用户看到的现象就是「上传 100% 后无反应」。
   *
   * @param {number} timeoutMs 从「字节发完」开始算的等待上限
   */
  upload(path, formData, { onProgress, onPhase, timeoutMs = 180000 } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      let sent = false;
      let timer = null;

      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        fn(arg);
      };
      const arm = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            xhr.abort();
          } catch {
            /* ignore */
          }
          finish(reject, new ApiError('服务端处理超时，请重试或换小一点的文件', 0, 'timeout'));
        }, timeoutMs);
      };

      xhr.open('POST', path, true);
      xhr.withCredentials = true;
      const t = store.token;
      if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        if (onProgress) onProgress(pct);
        // 字节发完了，但服务端还要解析文档（PDF/Word 提取文字），
        // 这段时间界面不能只停在 100% 不动 —— 会让人以为卡死
        if (pct >= 100 && !sent) {
          sent = true;
          if (onPhase) onPhase('parsing');
        }
      };
      xhr.upload.onload = () => {
        if (!sent) {
          sent = true;
          if (onPhase) onPhase('parsing');
        }
        arm();
      };

      xhr.onload = () => {
        let json = null;
        try {
          json = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status >= 200 && xhr.status < 300 && json && json.ok !== false) {
          finish(resolve, json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json);
        } else {
          const msg = (json && json.error) || `上传失败（${xhr.status}）`;
          if (xhr.status === 401) store.clear();
          finish(reject, new ApiError(msg, xhr.status, json && json.code));
        }
      };
      xhr.onerror = () => finish(reject, new ApiError('上传失败，请检查网络', 0, 'network'));
      xhr.ontimeout = () => finish(reject, new ApiError('上传超时', 0, 'timeout'));
      xhr.onabort = () => finish(reject, new ApiError('上传已取消', 0, 'aborted'));

      // 兜底：连 onload 都没触发时也不能永远挂着
      arm();
      xhr.send(formData);
    });
  },

  /* ---------------------------------------------------------------- */
  /* 上传单个文件：小文件一次传，大文件自动分片                          */
  /* ---------------------------------------------------------------- */

  /**
   * Cloudflare 隧道对单个请求有 100 秒等待上限，超时回报 524。
   * 12MB 的资料在 1Mbps 上行下正好约 100 秒 —— 用户看到的就是
   * 「进度 100%，上传失败（524）」。
   * 超过阈值的文件自动切成 2MB 分片，每片远低于上限。
   */
  CHUNK_THRESHOLD: 4 * 1024 * 1024,

  /** 上传一个分片（原始二进制），带进度 */
  _putChunk(uploadId, index, blob, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      const done = (fn, arg) => {
        if (settled) return;
        settled = true;
        fn(arg);
      };
      xhr.open('POST', `/api/files/chunk/${uploadId}/${index}`, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      const t = store.token;
      if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let json = null;
        try {
          json = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status >= 200 && xhr.status < 300 && json && json.ok !== false) {
          done(resolve, json.data || json);
        } else {
          done(reject, new ApiError((json && json.error) || `分片上传失败（${xhr.status}）`, xhr.status, json && json.code));
        }
      };
      xhr.onerror = () => done(reject, new ApiError('分片上传失败，请检查网络', 0, 'network'));
      xhr.ontimeout = () => done(reject, new ApiError('分片上传超时', 0, 'timeout'));
      xhr.onabort = () => done(reject, new ApiError('分片上传已取消', 0, 'aborted'));
      xhr.send(blob);
    });
  },

  /**
   * 上传单个文件（自动选择直传或分片）。
   * @returns {Promise<{files:Array}>} 与 /api/files 一致
   */
  async uploadFile(file, { onProgress, onPhase } = {}) {
    const threshold = this.CHUNK_THRESHOLD;
    if (!file || file.size <= threshold) {
      const fd = new FormData();
      fd.append('file', file, file.name);
      return this.upload('/api/files', fd, { onProgress, onPhase });
    }

    // ---- 分片 ----
    let init = null;
    try {
      init = await this.post('/api/files/chunk/init', {
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
      });
    } catch (err) {
      // 服务端不支持分片时退回直传，别让用户卡死
      const fd = new FormData();
      fd.append('file', file, file.name);
      return this.upload('/api/files', fd, { onProgress, onPhase });
    }

    const { uploadId, chunkSize } = init;
    const total = Math.max(1, Math.ceil(file.size / chunkSize));
    let sent = 0;

    try {
      for (let i = 0; i < total; i++) {
        const start = i * chunkSize;
        const blob = file.slice(start, Math.min(start + chunkSize, file.size));
        // 单片失败自动重试 3 次（网络抖动很常见，不能让用户重传整个文件）
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await this._putChunk(uploadId, i, blob, (pct) => {
              if (!onProgress) return;
              const overall = Math.round(((sent + (blob.size * pct) / 100) / file.size) * 100);
              onProgress(Math.min(99, overall));
            });
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          }
        }
        if (lastErr) throw lastErr;
        sent += blob.size;
        if (onProgress) onProgress(Math.min(99, Math.round((sent / file.size) * 100)));
      }

      // 字节都到了，接下来是服务端合并 + 解析
      if (onPhase) onPhase('parsing');
      const res = await this.post(`/api/files/chunk/${uploadId}/complete`, {});
      if (onProgress) onProgress(100);
      return res;
    } catch (err) {
      // 失败就清掉服务端分片，避免残留占空间
      try {
        await this.del(`/api/files/chunk/${uploadId}`);
      } catch {
        /* ignore */
      }
      throw err;
    }
  },

  /** 把对象转成 FormData（数组自动 JSON 化，文件单独 append） */  form(fields = {}, files = []) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v) || typeof v === 'object') fd.append(k, JSON.stringify(v));
      else fd.append(k, String(v));
    }
    for (const f of files) {
      if (!f) continue;
      if (f.file) fd.append(f.field || 'file', f.file, f.file.name);
      else fd.append(f.field || 'file', f);
    }
    return fd;
  },
};

/* ------------------------------------------------------------------ */
/* 业务接口封装                                                        */
/* ------------------------------------------------------------------ */
export const service = {
  health: () => api.get('/api/health'),
  site: () => api.get('/api/site'),
  stats: () => api.get('/api/stats'),
  taxonomy: () => api.get('/api/taxonomy'),
  taxonomySearch: (q) => api.get('/api/taxonomy/search', { q }),
  suggest: (q) => api.get('/api/search/suggest', { q }),
  cases: () => api.get('/api/cases'),

  me: () => api.get('/api/auth/me'),
  myProfile: () => api.get('/api/users/me'),
  updateProfile: (body) => api.put('/api/users/me', body),
  user: (id) => api.get(`/api/users/${encodeURIComponent(id)}`),
  users: (query) => api.get('/api/users', query),
  uploadAssets: (fd, opts) => api.upload('/api/users/me/assets', fd, opts),
  submitQualification: (fd, opts) => api.upload('/api/users/me/qualification', fd, opts),
  qualification: () => api.get('/api/users/me/qualification'),

  // 实名认证：个人身份证 / 企业营业执照 + AI 征信审核
  verificationMeta: () => api.get('/api/verification/meta'),
  myVerification: () => api.get('/api/users/me/verification'),
  submitVerification: (fd, opts) => api.upload('/api/users/me/verification', fd, opts),
  reviewVerification: (userId, body) => api.post(`/api/users/${userId}/verification/review`, body),
  adminVerifications: (status) => api.get('/api/admin/verifications', { status }),

  smsSend: (phone, purpose) => api.post('/api/auth/sms/send', { phone, purpose }),
  smsLogin: (body) => api.post('/api/auth/sms/login', body),
  mailSend: (email, purpose) => api.post('/api/auth/email/send-code', { email, purpose }),
  mailRegister: (body) => api.post('/api/auth/email/register', body),
  mailLogin: (body) => api.post('/api/auth/email/login', body),
  wechatUrl: (mode) => api.get('/api/auth/wechat/url', { mode }),
  wechatLogin: (body) => api.post('/api/auth/wechat/login', body),
  wechatDemo: (body) => api.post('/api/auth/wechat/demo', body),

  // 绑定微信（已有账号挂上微信，不用重新注册）
  wechatBindStatus: () => api.get('/api/users/me/wechat'),
  wechatBindUrl: (mode, redirect) => api.get('/api/auth/wechat/bind/url', { mode, redirect }),
  wechatBind: (body) => api.post('/api/auth/wechat/bind', body),
  wechatBindDemo: (body) => api.post('/api/auth/wechat/bind/demo', body),
  wechatUnbind: () => api.post('/api/auth/wechat/unbind', {}),
  logout: () => api.post('/api/auth/logout', {}),

  listings: (query) => api.get('/api/listings', query),
  listing: (id) => api.get(`/api/listings/${id}`),
  myListings: (query) => api.get('/api/my/listings', query),
  mySummary: () => api.get('/api/my/listings/summary'),
  myOverview: () => api.get('/api/my/overview'),
  myRegistrations: () => api.get('/api/my/registrations'),
  createListing: (fd, opts) => api.upload('/api/listings', fd, opts),
  updateListing: (id, body) => api.put(`/api/listings/${id}`, body),
  deleteListing: (id) => api.del(`/api/listings/${id}`),
  publishListing: (id, days) => api.post(`/api/listings/${id}/publish`, { days }),
  renewListing: (id, days) => api.post(`/api/listings/${id}/renew`, { days }),
  closeListing: (id, reason) => api.post(`/api/listings/${id}/close`, { reason }),
  likeListing: (id) => api.post(`/api/listings/${id}/like`, {}),
  regenerate: (id, body) => api.post(`/api/listings/${id}/regenerate`, body || {}),
  aiSummarize: (fd, opts) => api.upload('/api/ai/summarize', fd, opts),
  aiPreview: (fd, opts) => api.upload('/api/ai/preview', fd, opts),

  comments: (id, query) => api.get(`/api/listings/${id}/comments`, query),
  addComment: (id, fd, opts) => api.upload(`/api/listings/${id}/comments`, fd, opts),
  deleteComment: (id) => api.del(`/api/comments/${id}`),
  addFollowUp: (id, fd, opts) => api.upload(`/api/listings/${id}/follow-ups`, fd, opts),
  pipeline: (id) => api.get(`/api/listings/${id}/pipeline`),
  advancePipeline: (id, fd, opts) => api.upload(`/api/listings/${id}/pipeline`, fd, opts),
  confirmStage: (id, body) => api.post(`/api/listings/${id}/pipeline/confirm`, body),

  // 阶段 2：上传资质审核
  qualification: (id) => api.get(`/api/listings/${id}/qualification`),
  submitQualification: (id, fd, opts) => api.upload(`/api/listings/${id}/qualification`, fd, opts),
  reviewQualification: (id, body) => api.post(`/api/listings/${id}/qualification/review`, body),

  // 阶段 4/5/7：邀请函 / 居间协议 / 合同要点
  document: (id, kind, query) => api.get(`/api/listings/${id}/document/${kind}`, query),

  // 案例参考（联网检索，未配置时回退内置行业基准）
  cases: (id) => api.get(`/api/listings/${id}/cases`),
  refreshCases: (id) => api.post(`/api/listings/${id}/cases/refresh`, {}),
  searchStatus: () => api.get('/api/search-status'),
  // 前端版本号（排查浏览器是否在用旧缓存）
  version: () => api.get('/api/version'),
  // AI 设置（管理端在线配置 DeepSeek 等）
  adminAi: () => api.get('/api/admin/ai'),
  saveAdminAi: (body) => api.put('/api/admin/ai', body),
  clearAdminAi: () => api.del('/api/admin/ai'),
  testAdminAi: (body) => api.post('/api/admin/ai/test', body),
  // 保密附件：用查看密码换取短时效令牌
  unlockFiles: (id, password) => api.post(`/api/listings/${id}/files/unlock`, { password }),
  fileAccess: (id, token) => api.get(`/api/listings/${id}/files/access`, token ? { t: token } : undefined),
  dock: (id, note) => api.post(`/api/listings/${id}/dock`, { note }),
  registerEvent: (id, body) => api.post(`/api/listings/${id}/register`, body),
  registrations: (id) => api.get(`/api/listings/${id}/registrations`),
  share: (id) => api.get(`/api/listings/${id}/share`),
  recordShare: (id, channel) => api.post(`/api/listings/${id}/share`, { channel }),
  wechatShare: (id, url) => api.get('/api/wechat/share-config', { id, url }),
  qrUrl: (text, size) => `/api/share/qrcode?text=${encodeURIComponent(text)}&size=${size || 320}`,

  follow: (targetType, targetId, meta) => api.post('/api/follow', { targetType, targetId, meta }),
  unfollow: (targetType, targetId) => api.del('/api/follow', { targetType, targetId }),
  follows: (type) => api.get('/api/follows', { type }),
  notifications: (query) => api.get('/api/notifications', query),
  unread: () => api.get('/api/notifications/unread'),
  readNotifications: (ids) => api.post('/api/notifications/read', { ids }),

  contacts: (query) => api.get('/api/contacts', query),
  importContacts: (source, contacts) => api.post('/api/contacts/import', { source, contacts }),
  inviteContact: (id, message) => api.post(`/api/contacts/${id}/invite`, { message }),
  inviteBatch: (ids, message) => api.post('/api/contacts/invite-batch', { ids, message }),
  deleteContact: (id) => api.del(`/api/contacts/${id}`),

  rooms: () => api.get('/api/chat/rooms'),
  room: (id) => api.get(`/api/chat/rooms/${id}`),
  createRoom: (body) => api.post('/api/chat/rooms', body),
  messages: (id, query) => api.get(`/api/chat/rooms/${id}/messages`, query),
  sendMessage: (id, fd, opts) => api.upload(`/api/chat/rooms/${id}/messages`, fd, opts),
  addMembers: (id, userIds) => api.post(`/api/chat/rooms/${id}/members`, { userIds }),
  readRoom: (id) => api.post(`/api/chat/rooms/${id}/read`, {}),

  meetings: () => api.get('/api/meetings'),
  createMeeting: (body) => api.post('/api/meetings', body),
  meeting: (id) => api.get(`/api/meetings/${id}`),
  joinMeeting: (id, body) => api.post(`/api/meetings/${id}/join`, body || {}),
  leaveMeeting: (id) => api.post(`/api/meetings/${id}/leave`, {}),
  endMeeting: (id) => api.post(`/api/meetings/${id}/end`, {}),
  transcript: (id, chunks) => api.post(`/api/meetings/${id}/transcript`, { chunks }),
  minutes: (id) => api.post(`/api/meetings/${id}/minutes`, {}),
  confirmMinutes: (id, body) => api.post(`/api/meetings/${id}/minutes/confirm`, body),
  signal: (id, payload) => api.post(`/api/meetings/${id}/signal`, payload),
  uploadRecording: (id, fd, opts) => api.upload(`/api/meetings/${id}/recording`, fd, opts),

  // --- 会议号 / 邀请 / 主持人控制 ---
  lookupMeeting: (number) => api.get('/api/meetings/lookup', { number }),
  joinByNumber: (body) => api.post('/api/meetings/join', body),
  meetingInvite: (id) => api.get(`/api/meetings/${id}/invite`),
  meetingState: (id, patch) => api.post(`/api/meetings/${id}/state`, patch),
  meetingSettings: (id, patch) => api.post(`/api/meetings/${id}/settings`, patch),
  meetingMuteAll: (id) => api.post(`/api/meetings/${id}/mute-all`, {}),
  meetingKick: (id, userId) => api.post(`/api/meetings/${id}/kick`, { userId }),
  meetingChat: (id, query) => api.get(`/api/meetings/${id}/chat`, query),
  sendMeetingChat: (id, text) => api.post(`/api/meetings/${id}/chat`, { text }),

  // --- 群聊邀请 / 公告 ---
  roomInvite: (id) => api.get(`/api/chat/rooms/${id}/invite`),
  setAnnouncement: (id, text) => api.post(`/api/chat/rooms/${id}/announcement`, { text }),

  // --- 短视频 / 直播 ---
  feeds: (query) => api.get('/api/feeds', query),
  myFeeds: () => api.get('/api/my/feeds'),
  feed: (id) => api.get(`/api/feeds/${id}`),
  createFeed: (fd, opts) => api.upload('/api/feeds', fd, opts),
  updateFeed: (id, body) => api.put(`/api/feeds/${id}`, body),
  removeFeed: (id) => api.del(`/api/feeds/${id}`),
  likeFeed: (id) => api.post(`/api/feeds/${id}/like`, {}),
  viewFeed: (id) => api.post(`/api/feeds/${id}/view`, {}),
  liveInfo: (id) => api.get(`/api/feeds/${id}/live`),
  liveHeartbeat: (id) => api.get(`/api/feeds/${id}/live/heartbeat`),
  startLive: (id, body) => api.post(`/api/feeds/${id}/live/start`, body || {}),
  endLive: (id) => api.post(`/api/feeds/${id}/live/end`, {}),
  feedShare: (id) => api.get(`/api/feeds/${id}/share`),

  adminOverview: () => api.get('/api/admin/overview'),
  adminQualifications: (status) => api.get('/api/admin/qualifications', { status }),
  reviewQualification: (userId, body) => api.post(`/api/admin/qualifications/${userId}`, body),
  adminUsers: (query) => api.get('/api/admin/users', query),
  adminSetUserStatus: (id, status) => api.post(`/api/admin/users/${id}/status`, { status }),
  adminListings: (query) => api.get('/api/admin/listings', query),
  adminModerate: (id, action, note) => api.post(`/api/admin/listings/${id}/moderate`, { action, note }),
};

export default api;
