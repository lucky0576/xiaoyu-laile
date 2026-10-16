/**
 * 保密文件：查看密码 + 短时效访问令牌
 *
 * ⚠️ 必须说清楚的边界（界面与文档里也会写明）：
 *   浏览器里**无法真正阻止下载**。任何能在页面上看到的内容，
 *   用户都能通过截图、录屏、开发者工具或系统级方式保存下来。
 *
 *   本模块能做到的是把「随手下载」这条路堵住，并留下访问痕迹：
 *     · 没有密码，服务端根本不下发文件字节（不是前端遮罩）
 *     · 响应头强制 inline，不提供 attachment 附件下载
 *     · 令牌短时效（1–12 小时，由发布者选择），过期即失效
 *     · 访问留痕（谁在什么时候取过哪个文件）
 *
 *   不用「绝对防下载」误导用户 —— 那做不到。
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { httpError } from '../http/app.js';

/** 密码有效期范围（小时），由发布者在 1–12 之间选择 */
export const TTL_MIN = 1;
export const TTL_MAX = 12;
export const TTL_DEFAULT = 6;

const PBKDF2_ROUNDS = 120000;
const KEY_LEN = 32;

function truthy(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return true;
}

export function clampTtl(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return TTL_DEFAULT;
  return Math.min(TTL_MAX, Math.max(TTL_MIN, n));
}

function hashPassword(plain, salt) {
  return crypto
    .pbkdf2Sync(String(plain), String(salt), PBKDF2_ROUNDS, KEY_LEN, 'sha256')
    .toString('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ------------------------------------------------------------------ */
/* 规格化                                                              */
/* ------------------------------------------------------------------ */

/** multipart 传上来的对象字段是 JSON 字符串，要兼容 */
function parseMaybeJson(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return v;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * 规格化「文件保密」配置。
 * 明文密码只在此处出现一次，落库只存 PBKDF2 哈希 + 盐。
 *
 * @param {object|string} input 前端提交的 { enabled, password, ttlHours }（multipart 时是 JSON 字符串）
 * @param {object} base  原有配置（编辑时保留密码用）
 */
export function normalizeFileSecret(input, base = {}) {
  const parsed = parseMaybeJson(input);
  const src = parsed && typeof parsed === 'object' ? parsed : {};
  const b = base && typeof base === 'object' ? base : {};

  const out = {
    enabled: src.enabled === undefined ? Boolean(b.enabled) : truthy(src.enabled),
    ttlHours: clampTtl(src.ttlHours === undefined ? b.ttlHours : src.ttlHours),
    passHash: String(b.passHash || ''),
    salt: String(b.salt || ''),
    setAt: String(b.setAt || ''),
  };

  const plain = String(src.password ?? '').trim();
  if (plain) {
    if (plain.length < 4) throw httpError(400, '查看密码至少 4 位');
    if (plain.length > 32) throw httpError(400, '查看密码最多 32 位');
    out.salt = crypto.randomBytes(12).toString('hex');
    out.passHash = hashPassword(plain, out.salt);
    out.setAt = new Date().toISOString();
  }

  // 没有密码就不能启用保密，否则文件永远打不开
  if (out.enabled && !out.passHash) {
    throw httpError(400, '启用文件保密需要设置查看密码');
  }

  return out;
}

/** 对外可见的配置（绝不返回哈希与盐） */
export function fileSecretPublic(listing, { isOwner = false, unlocked = false } = {}) {
  const s = listing?.fileSecret || {};
  const enabled = Boolean(s.enabled && s.passHash);
  return {
    enabled,
    ttlHours: enabled ? clampTtl(s.ttlHours) : 0,
    setAt: s.setAt || '',
    // 只有发布方能看到自己设过密码（用于核对），且仍不返回密码本身
    hasPassword: Boolean(s.passHash),
    unlocked: !enabled || isOwner || Boolean(unlocked),
    canViewPassword: false,
  };
}

/* ------------------------------------------------------------------ */
/* 令牌                                                                */
/* ------------------------------------------------------------------ */

function sign(listingId, exp) {
  return crypto
    .createHmac('sha256', String(config.sessionSecret))
    .update(`${listingId}.${exp}`)
    .digest('base64url');
}

/** 签发访问令牌；有效期由发布者选择的 ttlHours 决定 */
export function issueToken(listingId, ttlHours) {
  const hours = clampTtl(ttlHours);
  const exp = Date.now() + hours * 3600_000;
  return { token: `${exp}.${sign(listingId, exp)}`, expiresAt: new Date(exp).toISOString(), ttlHours: hours };
}

/** 校验令牌：必须未过期且签名匹配 */
export function verifyToken(listingId, token) {
  const raw = String(token || '');
  const idx = raw.indexOf('.');
  if (idx <= 0) return false;
  const exp = Number(raw.slice(0, idx));
  const sig = raw.slice(idx + 1);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(sig, sign(listingId, exp));
}

/** 用密码换取令牌 */
export function unlock(listing, password) {
  const s = listing?.fileSecret || {};
  if (!s.enabled || !s.passHash) throw httpError(400, '该信息未启用文件保密');
  const plain = String(password ?? '');
  if (!plain) throw httpError(400, '请输入查看密码');
  const hash = hashPassword(plain, s.salt);
  if (!safeEqual(hash, s.passHash)) {
    // 不透露是密码错还是别的，避免探测
    throw httpError(403, '密码不正确', 'bad_password');
  }
  return issueToken(listing.id, s.ttlHours);
}

/**
 * 判断某次请求能否取到该文件的字节。
 * 返回 { allowed, reason }
 */
export function canAccessFile(listing, { viewer = null, token = '' } = {}) {
  const s = listing?.fileSecret || {};
  const enabled = Boolean(s.enabled && s.passHash);
  if (!enabled) return { allowed: true, reason: 'open' };
  if (viewer && viewer.id === listing.ownerId) return { allowed: true, reason: 'owner' };
  if (viewer && viewer.isAdmin) return { allowed: true, reason: 'admin' };
  if (token && verifyToken(listing.id, token)) return { allowed: true, reason: 'token' };
  return { allowed: false, reason: 'locked' };
}

/** 记录一次访问（谁、何时、哪个文件） */
export function accessRecord(listingId, fileId, viewer, reason) {
  return {
    listingId,
    fileId,
    userId: viewer?.id || '',
    userName: viewer?.nickname || '',
    reason,
    at: new Date().toISOString(),
  };
}

export default {
  TTL_MIN,
  TTL_MAX,
  TTL_DEFAULT,
  clampTtl,
  normalizeFileSecret,
  fileSecretPublic,
  issueToken,
  verifyToken,
  unlock,
  canAccessFile,
  accessRecord,
};
