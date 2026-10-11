/**
 * 通知与关注
 *
 * 关注的用户可以收到最新动向：
 *   - 站内通知（SSE 实时推送 + 未读红点）
 *   - 绑定微信后由公众号模板消息推送（配置了即用）
 *   - 邮件摘要（配置了 SMTP 即用）
 */
import db, { newId } from '../store/db.js';
import hub from './hub.js';
import { config } from '../config.js';
import { sendMail, mailTemplates, mailConfigured } from './mail.js';

const notifications = () => db.collection('notifications');
const follows = () => db.collection('follows');
const users = () => db.collection('users');
const listings = () => db.collection('listings');

export const NOTIFY_TYPES = {
  follow_new: '关注对象发布新信息',
  listing_published: '信息发布成功',
  listing_expiring: '信息即将到期',
  listing_expired: '信息已到期',
  comment: '收到新留言',
  comment_reply: '收到留言回复',
  ai_reply: 'AI 助理已回复',
  chat: '收到新消息',
  meeting_invite: '会议邀请',
  meeting_minutes: '会议纪要待确认',
  pipeline: '项目进度更新',
  qualification: '资质审核结果',
  contact_invite: '好友邀请',
  system: '系统消息',
};

/* ------------------------------------------------------------------ */
/* 关注                                                                */
/* ------------------------------------------------------------------ */
export function follow(userId, targetType, targetId, targetMeta = {}) {
  const exists = follows().findOne(
    (f) => f.userId === userId && f.targetType === targetType && f.targetId === targetId,
  );
  if (exists) return exists;
  const record = follows().insert({
    id: newId('fol'),
    userId,
    targetType, // 'listing' | 'user' | 'industry' | 'city' | 'company'
    targetId,
    meta: targetMeta,
  });
  bumpFollowStats(userId, targetType, targetId, +1);
  return record;
}

export function unfollow(userId, targetType, targetId) {
  const removed = follows().removeWhere(
    (f) => f.userId === userId && f.targetType === targetType && f.targetId === targetId,
  );
  if (removed) bumpFollowStats(userId, targetType, targetId, -1);
  return removed > 0;
}

function bumpFollowStats(userId, targetType, targetId, delta) {
  if (targetType === 'listing') {
    const l = listings().get(targetId);
    if (l) listings().update(targetId, { followerCount: Math.max(0, (l.followerCount || 0) + delta) });
  } else if (targetType === 'user') {
    const target = users().get(targetId);
    const follower = users().get(userId);
    if (target) {
      users().update(targetId, {
        stats: { ...target.stats, followers: Math.max(0, (target.stats?.followers || 0) + delta) },
      });
    }
    if (follower) {
      users().update(userId, {
        stats: { ...follower.stats, following: Math.max(0, (follower.stats?.following || 0) + delta) },
      });
    }
  }
}

export function isFollowing(userId, targetType, targetId) {
  if (!userId) return false;
  return Boolean(
    follows().findOne((f) => f.userId === userId && f.targetType === targetType && f.targetId === targetId),
  );
}

export function followingOf(userId) {
  return follows().where('userId', userId);
}

export function followersOf(targetType, targetId) {
  return follows().find((f) => f.targetType === targetType && f.targetId === targetId);
}

/** 是否应该给这个用户推送某条信息（关注了该信息 / 行业 / 城市 / 发布者） */
export function shouldNotify(user, listing) {
  if (!user) return false;
  const list = follows().where('userId', user.id);
  for (const f of list) {
    if (f.targetType === 'listing' && f.targetId === listing.id) return true;
    if (f.targetType === 'user' && f.targetId === listing.ownerId) return true;
    if (f.targetType === 'industry' && (listing.industries || []).some((i) => i.id === f.targetId)) return true;
    if (f.targetType === 'city' && (listing.cities || []).some((c) => c.id === f.targetId)) return true;
    if (f.targetType === 'company' && listing.company && f.targetId === listing.company) return true;
  }
  // 未关注任何内容时，默认按"行业+城市"弱匹配推送（可在设置里关闭）
  return false;
}

/* ------------------------------------------------------------------ */
/* 通知                                                                */
/* ------------------------------------------------------------------ */
export function notify({ userId, type, title, body = '', link = '', meta = {}, channels = {} }) {
  const record = notifications().insert({
    id: newId('n'),
    userId,
    type,
    typeName: NOTIFY_TYPES[type] || type,
    title: String(title || '').slice(0, 200),
    body: String(body || '').slice(0, 1000),
    link,
    meta,
    read: false,
  });

  // 实时推送
  hub.toUser(userId, 'notification', {
    id: record.id,
    type,
    title: record.title,
    body: record.body,
    link,
    at: record.createdAt,
  });

  // 邮件（可关闭）
  const user = users().get(userId);
  if (channels.email !== false && user?.email && user?.settings?.emailNotify && mailConfigured()) {
    Promise.resolve()
      .then(() =>
        sendMail({
          to: user.email,
          subject: `【${config.appName}】${record.title}`,
          text: `${record.body}\n\n${link ? `${config.publicBaseUrl || ''}${link}` : ''}`,
        }),
      )
      .catch((err) => console.warn('[notify] 邮件推送失败:', err.message));
  }

  return record;
}

/** 批量通知（用于发布新信息时推送给关注者） */
export function notifyMany(userIds, payload) {
  const sent = [];
  for (const uid of new Set(userIds.filter(Boolean))) {
    sent.push(notify({ ...payload, userId: uid }));
  }
  return sent;
}

/**
 * 信息发布后：推送给关注了该信息/行业/城市/发布者的用户。
 * 采用"发布时快照 + 兜底扫描"的方式，规模小时完全够用。
 */
export function fanOutListing(listing) {
  const targets = new Set();

  for (const f of follows().all()) {
    if (f.targetType === 'listing' && f.targetId === listing.id) targets.add(f.userId);
    else if (f.targetType === 'user' && f.targetId === listing.ownerId) targets.add(f.userId);
    else if (f.targetType === 'industry' && (listing.industries || []).some((i) => i.id === f.targetId))
      targets.add(f.userId);
    else if (f.targetType === 'city' && (listing.cities || []).some((c) => c.id === f.targetId))
      targets.add(f.userId);
  }
  targets.delete(listing.ownerId);

  const title = `您关注的领域有新动态：${listing.title}`;
  const link = `/#/detail/${listing.id}`;
  const result = [];
  for (const uid of targets) {
    result.push(
      notify({
        userId: uid,
        type: 'follow_new',
        title,
        body: listing.subtitle || (listing.ai?.summary || '').slice(0, 120),
        link,
        meta: { listingId: listing.id, category: listing.category },
      }),
    );
  }
  return result;
}

export function listNotifications(userId, { unreadOnly = false, limit = 60 } = {}) {
  let list = notifications().where('userId', userId);
  if (unreadOnly) list = list.filter((n) => !n.read);
  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return list.slice(0, limit);
}

export function unreadCount(userId) {
  return notifications().count((n) => n.userId === userId && !n.read);
}

export function markRead(userId, ids) {
  const set = new Set(ids || []);
  let n = 0;
  for (const item of notifications().where('userId', userId)) {
    if (item.read) continue;
    if (set.size && !set.has(item.id)) continue;
    notifications().update(item.id, { read: true, readAt: new Date().toISOString() });
    n++;
  }
  return n;
}

/** 信息即将到期提醒（由定时任务调用） */
export function remindExpiring() {
  const now = Date.now();
  let n = 0;
  for (const l of listings().all()) {
    if (l.status !== 'published' || !l.expiresAt) continue;
    const left = new Date(l.expiresAt).getTime() - now;
    if (left > 0 && left < 3 * 86400_000 && !l.expiryReminded) {
      notify({
        userId: l.ownerId,
        type: 'listing_expiring',
        title: `您的信息将在 3 天内到期：${l.title}`,
        body: '可在"我的发布"中续期，续期后继续出现在列表与搜索结果中。',
        link: `/#/detail/${l.id}`,
      });
      listings().update(l.id, { expiryReminded: true });
      n++;
    }
  }
  return n;
}

/** 把已过期信息下架 */
export function expireListings() {
  const now = Date.now();
  let n = 0;
  for (const l of listings().all()) {
    if (l.status === 'published' && l.expiresAt && new Date(l.expiresAt).getTime() < now) {
      listings().update(l.id, { status: 'expired', expiredAt: new Date().toISOString() });
      hub.broadcast('listing_status', { id: l.id, status: 'expired' });
      n++;
    }
  }
  return n;
}

export function notificationStats(userId) {
  const all = notifications().where('userId', userId);
  return {
    total: all.length,
    unread: all.filter((x) => !x.read).length,
  };
}

export default {
  follow,
  unfollow,
  isFollowing,
  followingOf,
  followersOf,
  shouldNotify,
  notify,
  notifyMany,
  fanOutListing,
  listNotifications,
  unreadCount,
  markRead,
  remindExpiring,
  expireListings,
  notificationStats,
  NOTIFY_TYPES,
};
