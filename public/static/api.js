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

  /** 带进度的文件上传 */
  upload(path, formData, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', path, true);
      xhr.withCredentials = true;
      const t = store.token;
      if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let json = null;
        try { json = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300 && json && json.ok !== false) {
          resolve(json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json);
        } else {
          const msg = (json && json.error) || `上传失败（${xhr.status}）`;
          if (xhr.status === 401) store.clear();
          reject(new ApiError(msg, xhr.status, json && json.code));
        }
      };
      xhr.onerror = () => reject(new ApiError('上传失败，请检查网络', 0, 'network'));
      xhr.send(formData);
    });
  },

  /** 把对象转成 FormData（数组自动 JSON 化，文件单独 append） */
  form(fields = {}, files = []) {
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

  smsSend: (phone, purpose) => api.post('/api/auth/sms/send', { phone, purpose }),
  smsLogin: (body) => api.post('/api/auth/sms/login', body),
  mailSend: (email, purpose) => api.post('/api/auth/email/send-code', { email, purpose }),
  mailRegister: (body) => api.post('/api/auth/email/register', body),
  mailLogin: (body) => api.post('/api/auth/email/login', body),
  wechatUrl: (mode) => api.get('/api/auth/wechat/url', { mode }),
  wechatLogin: (body) => api.post('/api/auth/wechat/login', body),
  wechatDemo: (body) => api.post('/api/auth/wechat/demo', body),
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
