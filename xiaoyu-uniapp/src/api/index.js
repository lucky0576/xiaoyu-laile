/**
 * 后端接口封装
 *
 * 与主站（public/static/api.js）保持同一套路径，方便对照排查。
 * 只封装多端页面真正会用到的部分，不做无意义的全量镜像。
 */
import { request, uploadFile } from './client.js';

/** 把对象转成 query string，自动丢掉空值 */
function qs(obj = {}) {
  const s = Object.entries(obj)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return s ? `?${s}` : '';
}

export const api = {
  /* ---------------- 公共 ---------------- */
  health: () => request('/api/health'),
  stats: () => request('/api/stats'),
  taxonomy: () => request('/api/taxonomy'),
  version: () => request('/api/version'),
  site: () => request('/api/site'),

  /* ---------------- 信息 ---------------- */
  /** 列表：category / type / industry / city / q / sort / page / pageSize */
  listings: (query = {}) => {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return request(`/api/listings${qs ? `?${qs}` : ''}`);
  },
  listing: (id) => request(`/api/listings/${encodeURIComponent(id)}`),
  comments: (id) => request(`/api/listings/${encodeURIComponent(id)}/comments`),
  share: (id) => request(`/api/listings/${encodeURIComponent(id)}/share`),
  /** 我的发布：ownerId 用当前登录用户 id */
  myListings: (ownerId, query = {}) => {
    const merged = { ownerId, status: 'all', sort: 'latest', pageSize: 20, ...query };
    const qs = Object.entries(merged)
      .filter(([, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return request(`/api/listings?${qs}`);
  },
  searchSuggest: (q) => request(`/api/search/suggest?q=${encodeURIComponent(q)}`),

  /* ---------------- 登录 / 注册 ---------------- */
  smsSend: (body) => request('/api/auth/sms/send', { method: 'POST', data: body }),
  smsLogin: (body) => request('/api/auth/sms/login', { method: 'POST', data: body }),
  emailSendCode: (body) => request('/api/auth/email/send-code', { method: 'POST', data: body }),
  emailLogin: (body) => request('/api/auth/email/login', { method: 'POST', data: body }),
  me: () => request('/api/auth/me'),

  /* ---------------- 资讯 / 短剧 / 短视频 / 资金 / 大赛 ---------------- */
  news: (query = {}) => request(`/api/news${qs(query)}`),
  newsMeta: () => request('/api/news/meta'),
  newsDetail: (id) => request(`/api/news/${encodeURIComponent(id)}`),
  dramas: (query = {}) => request(`/api/dramas${qs(query)}`),
  dramaMeta: () => request('/api/dramas/meta'),
  feeds: (query = {}) => request(`/api/feeds${qs(query)}`),
  feed: (id) => request(`/api/feeds/${encodeURIComponent(id)}`),
  fundsList: (query = {}) => request(`/api/funds/list${qs(query)}`),
  contestList: () => request('/api/contest/list'),

  /* ---------------- 我的 / 业务 ---------------- */
  favorites: (query = {}) => request(`/api/favorites${qs(query)}`),
  contacts: (query = {}) => request(`/api/contacts${qs(query)}`),
  myTags: () => request('/api/users/me/tags'),
  levels: () => request('/api/levels'),
  referralMe: () => request('/api/referral/me'),
  investPlan: (query = {}) => request(`/api/invest/plan${qs(query)}`),
  forums: () => request('/api/forums'),
  forumOverview: () => request('/api/forums/overview'),
  forumPosts: (slug, query = {}) => request(`/api/forums/${encodeURIComponent(slug)}/posts${qs(query)}`),
  providers: (query = {}) => request(`/api/providers${qs(query)}`),
  providersMeta: () => request('/api/providers/meta'),
  stewardMeta: () => request('/api/stewards/meta'),
  stewards: (query = {}) => request(`/api/stewards${qs(query)}`),
  feedbackTopics: () => request('/api/feedback/topics'),
  feedbackSubmit: (body) => request('/api/feedback', { method: 'POST', data: body }),

  bindings: () => request('/api/users/me/bindings'),
  chatRooms: () => request('/api/chat/rooms'),
  meetings: (query = {}) => request(`/api/meetings${qs(query)}`),

  /* ---------------- 通知 ---------------- */
  notifications: (query = {}) => {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return request(`/api/notifications${qs ? `?${qs}` : ''}`);
  },
  notificationsUnread: () => request('/api/notifications/unread'),
  notificationsRead: (ids) => request('/api/notifications/read', { method: 'POST', data: { ids: ids || [] } }),

  /* ---------------- 抖音登录 ---------------- */
  douyinUrl: () => request('/api/auth/douyin/url'),
  douyinLogin: (body) => request('/api/auth/douyin/login', { method: 'POST', data: body }),
  douyinDemo: (body) => request('/api/auth/douyin/demo', { method: 'POST', data: body }),

  /* ---------------- 发布 ---------------- */
  createListing: (filePath, formData) => uploadFile(filePath, { formData }),
};

export { uploadFile };
export default api;
