/**
 * 小鱼来了 — 推荐码
 *
 * 每个用户有专属推荐码与二维码。
 * 被邀请人通过推荐链接注册后：
 *   1. 记录 invitedBy
 *   2. **自动出现在推荐人的通讯录里**（source='referral'，带基础信息）
 *   3. 推荐人收到通知
 *
 * 推荐码设计：
 *   · 6 位，字符集去掉容易混淆的 0/O/1/I/L，方便口头和手输
 *   · 大小写不敏感，统一大写存储
 *   · 懒生成：用户第一次访问推荐页时创建，避免给所有历史用户补字段
 */

import db, { newId } from '../store/db.js';
import notifySvc from './notify.js';

const users = () => db.collection('users');
const contacts = () => db.collection('contacts');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 6;

/** 随机生成一个码（不用 crypto，够用且更快） */
function randomCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

/** 生成一个全站唯一的推荐码 */
function uniqueCode() {
  for (let i = 0; i < 40; i++) {
    const code = randomCode();
    const taken = users().findOne((u) => String(u.refCode || '').toUpperCase() === code);
    if (!taken) return code;
  }
  // 极低概率：退化成时间戳后缀
  return randomCode() + Date.now().toString(36).slice(-2).toUpperCase();
}

/** 确保用户有推荐码，没有就生成并落库 */
export function ensureRefCode(userOrId) {
  const user = typeof userOrId === 'string' ? users().get(userOrId) : userOrId;
  if (!user) return '';
  const cur = String(user.refCode || '').trim().toUpperCase();
  if (cur) return cur;
  const code = uniqueCode();
  users().update(user.id, { refCode: code, refCodeAt: new Date().toISOString() });
  return code;
}

/** 按推荐码找用户（大小写不敏感） */
export function findByRefCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{4,10}$/.test(code)) return null;
  return users().findOne((u) => String(u.refCode || '').toUpperCase() === code) || null;
}

/** 用户公开的基础信息（给推荐人看） */
function basicInfo(u) {
  if (!u) return null;
  return {
    id: u.id,
    nickname: u.nickname || '',
    avatar: u.avatar || '',
    company: u.company || '',
    profession: u.profession || '',
    industry: u.industry || '',
    city: u.city || '',
    accountType: u.accountType || '',
    createdAt: u.createdAt || '',
    // 手机号打码，只露后四位
    phoneTail: String(u.phone || '').slice(-4),
  };
}

/**
 * 新用户通过推荐码注册后的处理。
 * 返回推荐人 id（没有推荐人时返回空串）。
 */
export function bindReferral(newUser, refCode) {
  if (!newUser || !refCode) return '';
  const inviter = findByRefCode(refCode);
  if (!inviter || inviter.id === newUser.id) return '';

  // 已经绑过就不再重复处理
  if (newUser.invitedBy) return newUser.invitedBy;

  users().update(newUser.id, {
    invitedBy: inviter.id,
    invitedByCode: String(refCode).toUpperCase(),
    invitedAt: new Date().toISOString(),
  });

  // ---- 关键：把新用户自动加进推荐人的通讯录 ----
  try {
    const col = contacts();
    const dup = col.findOne(
      (c) => c.ownerId === inviter.id && c.registeredUserId === newUser.id,
    );
    if (!dup) {
      col.insert({
        id: newId('ct'),
        ownerId: inviter.id,
        source: 'referral',
        name: newUser.nickname || `用户${String(newUser.phone || '').slice(-4)}`,
        phone: newUser.phone || '',
        wechat: newUser.wechatId || '',
        company: newUser.company || '',
        note: [newUser.industry, newUser.city].filter(Boolean).join(' · ').slice(0, 200),
        registeredUserId: newUser.id,
        invited: true,
        invitedAt: new Date().toISOString(),
        refCode: String(refCode).toUpperCase(),
      });
    }
  } catch {
    /* 通讯录写入失败不影响注册主流程 */
  }

  // 通知推荐人
  try {
    notifySvc.notify({
      userId: inviter.id,
      type: 'contact_invite',
      title: `${newUser.nickname || '新用户'} 通过您的推荐码入驻了`,
      body: [newUser.company, newUser.industry, newUser.city].filter(Boolean).join(' · ') || '已自动加入您的通讯录',
      link: `#/user/${newUser.id}`,
    });
  } catch {
    /* ignore */
  }

  return inviter.id;
}

/** 我的推荐信息：码、二维码文案、邀请人数、被邀请人列表 */
export function myReferral(user, baseUrl = '') {
  const code = ensureRefCode(user);
  const base = String(baseUrl || '').replace(/\/+$/, '');
  /*
   * 用路径式短链 /r/CODE，而不是 /#/register?ref=CODE。
   * 原因：# 后面的内容不会发到服务器，二维码扫描器、部分安卓浏览器、
   * 微信二次转发时会丢掉 # 之后的部分，对方点开只看到首页。
   */
  const url = `${base}/r/${code}`;

  // 被邀请人（按注册时间倒序）
  const invited = users()
    .find((u) => u.invitedBy === user.id)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(basicInfo);

  // 通讯录里通过推荐码进来的
  const fromContacts = contacts()
    .where('ownerId', user.id)
    .filter((c) => c.source === 'referral');

  return {
    code,
    url,
    qrText: url,
    registerUrl: `${base}/#/register?ref=${code}`,
    shareStats: shareStats(user.id),
    invitedCount: invited.length,
    invited: invited.slice(0, 100),
    contactCount: fromContacts.length,
  };
}

/** 某用户是否已通过推荐码进来（给前端展示来源用） */

/* ------------------------------------------------------------------ */
/* 分享统计                                                            */
/* ------------------------------------------------------------------ */

const shareLogs = () => db.collection('referralShares');

const CHANNEL_NAME = { poster: '海报', text: '文案', link: '链接' };

/** 记一次分享动作（海报 / 文案 / 链接） */
export function logShare(user, channel = 'text') {
  const ch = CHANNEL_NAME[channel] ? channel : 'text';
  return shareLogs().insert({
    id: db.newId('rs'),
    userId: user.id,
    channel: ch,
    at: new Date().toISOString(),
  });
}

/** 我的分享数据 */
export function shareStats(userId) {
  const all = shareLogs().where('userId', userId);
  const now = Date.now();
  const dayAgo = now - 86400_000;
  const weekAgo = now - 7 * 86400_000;

  const byChannel = { poster: 0, text: 0, link: 0 };
  let today = 0;
  let week = 0;
  for (const r of all) {
    byChannel[r.channel] = (byChannel[r.channel] || 0) + 1;
    const t = Date.parse(r.at || '');
    if (Number.isFinite(t)) {
      if (t >= dayAgo) today += 1;
      if (t >= weekAgo) week += 1;
    }
  }

  const invited = users().find((u) => u.invitedBy === userId);
  const total = all.length;

  return {
    total,
    today,
    week,
    byChannel,
    invitedCount: invited.length,
    // 每分享 1 次平均带来几个注册（保留 2 位）
    conversion: total ? Math.round((invited.length / total) * 100) / 100 : 0,
    lastAt: total
      ? all.map((r) => r.at).sort((a, b) => String(b).localeCompare(String(a)))[0]
      : '',
  };
}

export function referralSourceOf(user) {
  if (!user || !user.invitedBy) return null;
  const inviter = users().get(user.invitedBy);
  return {
    inviterId: user.invitedBy,
    inviterName: inviter ? inviter.nickname : '',
    code: user.invitedByCode || '',
    at: user.invitedAt || '',
  };
}

export default { ensureRefCode, findByRefCode, bindReferral, myReferral, referralSourceOf, logShare, shareStats };
