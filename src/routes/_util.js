/**
 * 路由公共工具
 */
import { config } from '../config.js';
import { signToken, currentUser, requireAuth } from '../services/auth.js';
import { serializeCookie } from '../http/app.js';

export function data(res, payload, status = 200) {
  return res.json({ ok: true, data: payload }, status);
}

export function fail(res, message, status = 400, code = 'bad_request') {
  return res.json({ ok: false, error: message, code }, status);
}

export function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function int(v, d = 0) {
  return Math.trunc(num(v, d));
}

export function bool(v) {
  if (typeof v === 'boolean') return v;
  if (v === undefined || v === null || v === '') return false;
  return /^(1|true|yes|on|是)$/i.test(String(v));
}

export function list(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* 逗号分隔 */
    }
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function str(v, max = 5000) {
  return String(v ?? '').slice(0, max);
}

/** 生成对外可访问的根地址（支持反向代理 / 隧道转发头） */
export function baseUrl(req) {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim() || req.headers.host;
  if (proto && host) return `${proto}://${host}`;
  return req.origin || `http://localhost:${config.port}`;
}

export function authUser(req) {
  return currentUser(req);
}

export function mustAuth(req) {
  return requireAuth(req);
}

export function setAuthCookie(res, token, days = config.sessionDays) {
  res.set(
    'Set-Cookie',
    serializeCookie('xyl_token', token, { maxAge: days * 86400, sameSite: 'Lax', path: '/' }),
  );
}

export function clearAuthCookie(res) {
  res.set('Set-Cookie', serializeCookie('xyl_token', '', { maxAge: 0, path: '/' }));
}

export function loginResponse(res, user, extra = {}) {
  const token = signToken({ uid: user.id });
  setAuthCookie(res, token);
  return data(res, { token, user: { ...extra.user }, ...extra });
}

/** 把 snake/camel 混杂的 query 归一化 */
export function queryOf(req) {
  const q = req.query || {};
  return {
    ...q,
    page: int(q.page, 1),
    pageSize: int(q.pageSize || q.limit, 20),
  };
}

/** 简单的内存级限流（按 IP + key） */
const buckets = new Map();
export function rateLimit(key, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  b.count++;
  if (b.count > limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, remaining: limit - b.count };
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
