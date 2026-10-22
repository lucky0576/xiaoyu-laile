/**
 * 小鱼来了 — 账号绑定与通讯地址
 *
 * 管理：邮箱绑定、通讯地址（快递）、微信公众号绑定、抖音绑定、个人微信绑定状态汇总。
 *
 * 存储位置（都在 users 记录上）：
 *   email / emailVerified / emailVerifiedAt
 *   address      { receiver, phone, province, city, district, detail, zip, updatedAt }
 *   bindings.mp  { openId, nickname, avatar, subscribed, boundAt, mode }
 *   bindings.douyin { openId, nickname, avatar, douyinId, boundAt, mode }
 *   wechatOpenId / wechatUnionId / wechatId（个人微信，沿用已有字段）
 */

import db from '../store/db.js';

const users = () => db.collection('users');

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

export function maskPhone(p) {
  const s = String(p || '');
  return /^\d{11}$/.test(s) ? `${s.slice(0, 3)}****${s.slice(-4)}` : s;
}

export function maskEmail(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at <= 0) return s;
  const name = s.slice(0, at);
  const domain = s.slice(at);
  if (name.length <= 2) return `${name[0] || ''}***${domain}`;
  return `${name.slice(0, 2)}***${domain}`;
}

function emptyAddress() {
  return {
    receiver: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    zip: '',
    updatedAt: '',
  };
}

function normalizeAddress(user) {
  const a = user?.address || {};
  const base = emptyAddress();
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (k === 'updatedAt') out[k] = String(a[k] || '');
    else out[k] = String(a[k] || '').slice(0, k === 'detail' ? 300 : 60);
  }
  return out;
}

/** 地址是否填完整（收件人 + 电话 + 详细地址） */
export function addressComplete(a) {
  return Boolean(a && a.receiver && a.phone && a.detail);
}

/** 汇总当前用户的所有绑定状态 */
export function bindingsOf(user) {
  const u = user || {};
  const b = u.bindings || {};
  const mp = b.mp || {};
  const dy = b.douyin || {};
  const addr = normalizeAddress(u);

  return {
    phone: {
      bound: Boolean(u.phone),
      value: maskPhone(u.phone),
    },
    email: {
      bound: Boolean(u.email),
      value: maskEmail(u.email),
      verified: Boolean(u.emailVerified),
      verifiedAt: u.emailVerifiedAt || '',
    },
    wechat: {
      bound: Boolean(u.wechatOpenId || u.wechatUnionId),
      nickname: u.wechatNickname || '',
      id: u.wechatId || '',
      boundAt: u.wechatBoundAt || '',
    },
    mp: {
      bound: Boolean(mp.openId),
      nickname: mp.nickname || '',
      subscribed: Boolean(mp.subscribed),
      boundAt: mp.boundAt || '',
      mode: mp.mode || '',
    },
    douyin: {
      bound: Boolean(dy.douyinId || dy.openId),
      nickname: dy.nickname || '',
      douyinId: dy.douyinId || '',
      boundAt: dy.boundAt || '',
      mode: dy.mode || '',
    },
    address: {
      ...addr,
      filled: addressComplete(addr),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 邮箱绑定                                                            */
/* ------------------------------------------------------------------ */

export function emailTakenByOther(email, selfId) {
  const e = String(email || '').trim().toLowerCase();
  return users().findOne((u) => u.email === e && u.id !== selfId) || null;
}

export function setEmailVerified(userId, email) {
  const now = new Date().toISOString();
  return users().update(userId, {
    email: String(email).trim().toLowerCase(),
    emailVerified: true,
    emailVerifiedAt: now,
  });
}

export function unbindEmail(userId) {
  return users().update(userId, {
    email: '',
    emailVerified: false,
    emailVerifiedAt: '',
  });
}

/* ------------------------------------------------------------------ */
/* 通讯地址                                                            */
/* ------------------------------------------------------------------ */

export function setAddress(userId, data = {}) {
  const fail = (msg) => {
    const e = new Error(msg);
    e.status = 400;
    e.code = 'bad_address';
    throw e;
  };

  const receiver = String(data.receiver || '').trim().slice(0, 40);
  const phone = String(data.phone || '').trim().slice(0, 20);
  const detail = String(data.detail || '').trim().slice(0, 300);

  if (!receiver) fail('请填写收件人');
  if (!/^\d{6,20}$/.test(phone.replace(/[-\s]/g, ''))) fail('请填写正确的联系电话');

  const address = {
    receiver,
    phone,
    province: String(data.province || '').trim().slice(0, 40),
    city: String(data.city || '').trim().slice(0, 40),
    district: String(data.district || '').trim().slice(0, 40),
    detail,
    zip: String(data.zip || '').trim().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
  const updated = users().update(userId, { address });
  return normalizeAddress(updated);
}

export function clearAddress(userId) {
  const updated = users().update(userId, { address: emptyAddress() });
  return normalizeAddress(updated);
}

/* ------------------------------------------------------------------ */
/* 公众号绑定                                                          */
/* ------------------------------------------------------------------ */

/**
 * 绑定微信公众号。
 * 已配置公众号（WECHAT_APP_ID）时走真实 OAuth；否则以演示模式绑定。
 */
export function bindMp(userId, { openId, nickname, avatar, subscribed, mode } = {}) {
  const now = new Date().toISOString();
  const oid = String(openId || '').trim() || `mp_demo_${userId.slice(-8)}`;
  const bindings = { ...(users().get(userId)?.bindings || {}) };
  bindings.mp = {
    openId: oid.slice(0, 80),
    nickname: String(nickname || '公众号用户').slice(0, 40),
    avatar: String(avatar || '').slice(0, 500),
    subscribed: Boolean(subscribed),
    boundAt: now,
    mode: mode || 'demo',
  };
  const updated = users().update(userId, { bindings });
  return bindingsOf(updated).mp;
}

/* ------------------------------------------------------------------ */
/* 抖音绑定                                                            */
/* ------------------------------------------------------------------ */

/**
 * 绑定抖音。
 * 已配置抖音开放平台时走 OAuth；未配置时按「抖音号」手工绑定。
 */
export function bindDouyin(userId, { openId, nickname, avatar, douyinId, mode } = {}) {
  const did = String(douyinId || '').trim().slice(0, 60);
  if (!did && !openId) {
    const e = new Error('请填写抖音号');
    e.status = 400;
    e.code = 'bad_douyin';
    throw e;
  }
  const now = new Date().toISOString();
  const bindings = { ...(users().get(userId)?.bindings || {}) };
  bindings.douyin = {
    openId: String(openId || '').slice(0, 80),
    nickname: String(nickname || '抖音用户').slice(0, 40),
    avatar: String(avatar || '').slice(0, 500),
    douyinId: did,
    boundAt: now,
    mode: mode || 'manual',
  };
  const updated = users().update(userId, { bindings });
  return bindingsOf(updated).douyin;
}

/* ------------------------------------------------------------------ */
/* 解绑                                                                */
/* ------------------------------------------------------------------ */

export const UNBINDABLE = ['email', 'mp', 'douyin'];

export function unbind(userId, type) {
  const u = users().get(userId);
  if (!u) return null;

  if (type === 'email') return unbindEmail(userId);

  if (type === 'mp' || type === 'douyin') {
    const bindings = { ...(u.bindings || {}) };
    delete bindings[type];
    return users().update(userId, { bindings });
  }

  const e = new Error('不支持解绑该类型');
  e.status = 400;
  e.code = 'bad_type';
  throw e;
}

export default {
  bindingsOf,
  addressComplete,
  emailTakenByOther,
  setEmailVerified,
  unbindEmail,
  setAddress,
  clearAddress,
  bindMp,
  bindDouyin,
  unbind,
  maskPhone,
  maskEmail,
  UNBINDABLE,
};
