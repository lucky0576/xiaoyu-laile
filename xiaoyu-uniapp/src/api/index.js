/**
 * 后端接口封装
 *
 * 与主站（public/static/api.js）保持同一套路径，方便对照排查。
 * 只封装多端页面真正会用到的部分，不做无意义的全量镜像。
 */
import { request, uploadFile } from './client.js';

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

  /* ---------------- 登录 / 注册 ---------------- */
  smsSend: (body) => request('/api/auth/sms/send', { method: 'POST', data: body }),
  smsLogin: (body) => request('/api/auth/sms/login', { method: 'POST', data: body }),
  emailSendCode: (body) => request('/api/auth/email/send-code', { method: 'POST', data: body }),
  emailLogin: (body) => request('/api/auth/email/login', { method: 'POST', data: body }),
  me: () => request('/api/auth/me'),

  /* ---------------- 抖音登录 ---------------- */
  douyinUrl: () => request('/api/auth/douyin/url'),
  douyinLogin: (body) => request('/api/auth/douyin/login', { method: 'POST', data: body }),
  douyinDemo: (body) => request('/api/auth/douyin/demo', { method: 'POST', data: body }),

  /* ---------------- 发布 ---------------- */
  createListing: (filePath, formData) => uploadFile(filePath, { formData }),
};

export { uploadFile };
export default api;
