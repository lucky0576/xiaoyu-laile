/**
 * 认证与会话
 *
 * - 密码：scrypt + 随机盐
 * - 会话：HMAC-SHA256 签名的无状态 token（可放 Cookie，也可放 Authorization: Bearer）
 * - 验证码：短信 / 邮件，演示模式下直接返回，生产接真实网关
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';

const users = () => db.collection('users');
const otps = () => db.collection('otps');

/* ------------------------------------------------------------------ */
/* 密码                                                                */
/* ------------------------------------------------------------------ */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts[0] !== 'scrypt') return false;
    const [, N, r, p, saltHex, keyHex] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Token                                                               */
/* ------------------------------------------------------------------ */
const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(data) {
  return crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
}

export function signToken(payload, days = config.sessionDays) {
  const body = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + days * 86400,
  };
  const data = b64u(JSON.stringify(body));
  return `${data}.${sign(data)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expect = sign(data);
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export function readToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (req.cookies && req.cookies.xyl_token) return req.cookies.xyl_token;
  if (req.query && req.query.token) return req.query.token;
  return null;
}

/** 解析当前登录用户，未登录返回 null（不抛错） */
export function currentUser(req) {
  if (req.user !== undefined) return req.user;
  const payload = verifyToken(readToken(req));
  if (!payload) {
    req.user = null;
    return null;
  }
  const user = users().get(payload.uid);
  req.user = user && user.status !== 'banned' ? user : null;
  return req.user;
}

/** 必须登录，否则 401 */
export function requireAuth(req) {
  const user = currentUser(req);
  if (!user) throw httpError(401, '请先登录', 'unauthorized');
  return user;
}

export function requireAdmin(req) {
  const user = requireAuth(req);
  if (!user.isAdmin) throw httpError(403, '需要管理员权限', 'forbidden');
  return user;
}

/** 只允许本人或管理员 */
export function requireSelfOrAdmin(req, userId) {
  const user = requireAuth(req);
  if (user.id !== userId && !user.isAdmin) throw httpError(403, '无权操作', 'forbidden');
  return user;
}

/* ------------------------------------------------------------------ */
/* 用户                                                                */
/* ------------------------------------------------------------------ */
export const PUBLIC_USER_FIELDS = [
  'id',
  'nickname',
  'avatar',
  'company',
  'profession',
  'industry',
  'city',
  'bio',
  'logo',
  'website',
  'verified',
  'level',
  'createdAt',
  'stats',
];

export function publicUser(user) {
  if (!user) return null;
  const out = {};
  for (const f of PUBLIC_USER_FIELDS) if (user[f] !== undefined) out[f] = user[f];
  out.verified = Boolean(user.verified || user.qualification?.status === 'approved');
  // 联系方式仅对已登录用户可见（在路由层决定是否补充）
  return out;
}

export function selfUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

export function findByPhone(phone) {
  const p = normalizePhone(phone);
  return users().findOne((u) => u.phone === p);
}

export function findByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return users().findOne((u) => u.email === e);
}

export function findByWechat(openid, unionid) {
  return users().findOne(
    (u) =>
      (openid && u.wechatOpenId === openid) || (unionid && u.wechatUnionId && u.wechatUnionId === unionid),
  );
}

export function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '').replace(/^\+?86/, '');
}

export function ensureNicknameUnique(base) {
  const root = String(base || '用户').trim().slice(0, 20) || '用户';
  let name = root;
  let i = 1;
  while (users().findOne((u) => u.nickname === name)) {
    name = `${root}${++i}`;
    if (i > 9999) break;
  }
  return name;
}

export function createUser(data) {
  const now = new Date().toISOString();
  return users().insert({
    nickname: data.nickname || ensureNicknameUnique('用户'),
    avatar: data.avatar || '',
    phone: data.phone ? normalizePhone(data.phone) : '',
    email: data.email ? String(data.email).trim().toLowerCase() : '',
    wechatOpenId: data.wechatOpenId || '',
    wechatUnionId: data.wechatUnionId || '',
    wechatId: data.wechatId || '',
    passwordHash: data.password || data.passwordHash ? hashPassword(data.password || data.passwordHash) : '',
    company: data.company || '',
    profession: data.profession || '',
    industry: data.industry || '',
    city: data.city || '',
    bio: data.bio || '',
    logo: data.logo || '',
    cards: data.cards || [],
    companyDeck: data.companyDeck || [],
    website: data.website || '',
    status: 'active',
    isAdmin: Boolean(data.isAdmin),
    verified: false,
    level: 'free',
    // 注册时选择的身份类型：personal（个人）/ company（企业）/ ''（未选）
    accountType: data.accountType === 'company' || data.accountType === 'personal' ? data.accountType : '',
    // 实名认证材料与 AI 审核结果（结构见 services/verification.js）
    verification: {
      type: '',
      status: 'none',
      realName: '',
      idNumber: '',
      idFrontFileId: '',
      idBackFileId: '',
      companyName: '',
      creditCode: '',
      legalPerson: '',
      regCapital: '',
      foundedAt: '',
      scope: '',
      address: '',
      licenseFileId: '',
      extra: '',
      aiReview: null,
      submittedAt: null,
      reviewedAt: null,
      reviewerNote: '',
    },
    qualification: { status: 'none', files: [], submittedAt: null, reviewedAt: null, note: '' },
    stats: { listings: 0, followers: 0, following: 0, likes: 0, comments: 0 },
    settings: {
      notifyFollow: true,
      notifyComment: true,
      notifyChat: true,
      wechatBind: false,
      emailNotify: true,
    },
    lastLoginAt: now,
  });
}

export function touchLogin(user) {
  return users().update(user.id, {
    lastLoginAt: new Date().toISOString(),
    loginCount: (user.loginCount || 0) + 1,
  });
}

/* ------------------------------------------------------------------ */
/* 验证码                                                              */
/* ------------------------------------------------------------------ */
export const OTP_PURPOSES = {
  login: '登录',
  register: '注册',
  bind: '绑定',
  reset: '重置密码',
};

export function issueOtp({ target, purpose = 'login', channel = 'sms', ttlSec = 300 }) {
  const code = String(crypto.randomInt(100000, 999999));
  // 同一目标+用途只保留最新一条
  otps().removeWhere((o) => o.target === target && o.purpose === purpose);
  const record = otps().insert({
    id: newId('otp'),
    target,
    channel,
    purpose,
    codeHash: crypto.createHash('sha256').update(code).digest('hex'),
    expiresAt: Date.now() + ttlSec * 1000,
    tries: 0,
    used: false,
  });
  return { record, code };
}

export function verifyOtp({ target, purpose = 'login', code }) {
  const record = otps().findOne(
    (o) => o.target === target && o.purpose === purpose && !o.used,
  );
  if (!record) return { ok: false, reason: '请先获取验证码' };
  if (Date.now() > record.expiresAt) {
    otps().remove(record.id);
    return { ok: false, reason: '验证码已过期，请重新获取' };
  }
  if (record.tries >= 5) {
    otps().remove(record.id);
    return { ok: false, reason: '尝试次数过多，请重新获取' };
  }
  const hash = crypto.createHash('sha256').update(String(code || '')).digest('hex');
  if (hash !== record.codeHash) {
    otps().update(record.id, { tries: record.tries + 1 });
    return { ok: false, reason: '验证码不正确' };
  }
  otps().update(record.id, { used: true, usedAt: new Date().toISOString() });
  return { ok: true, record };
}

/** 清理过期验证码 */
export function sweepOtps() {
  const now = Date.now();
  return otps().removeWhere((o) => o.expiresAt < now - 3600_000);
}
