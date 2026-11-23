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
  listing_new: '新项目上线（全体会员）',
  listing_update: '关注的信息有变更',
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
  news: '新闻资讯',
  feedback: '留言',

};

/** 信息里哪些字段变了值得通知关注人（键 → 中文名） */
export const CHANGE_LABELS = {
  title: '标题',
  subtitle: '副标题',
  text: '正文内容',
  type: '信息类型',
  company: '企业主体',
  durationDays: '有效期限',
  industries: '所属行业',
  cities: '所在城市',
  project: '项目信息',
  event: '活动信息',
  trade: '供需信息',
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

/** 会员是否接收「新项目上线」通知（默认接收，可在设置里关闭） */
export function wantsNewProjectNotice(u) {
  if (!u) return false;
  if (u.disabled || u.banned) return false;
  if (u.settings?.notifyNewProjects === false) return false;
  return true;
}

/** 是否接收「关注对象有新动态 / 有变更」通知（默认接收，可在设置里关闭） */
export function wantsFollowNotice(u) {
  if (!u) return false;
  if (u.disabled || u.banned) return false;
  if (u.settings?.notifyFollow === false) return false;
  return true;
}

/**
 * 新信息上线时应该收到通知的人 = 精准关注者 ∪ 全体会员。
 *   - 精准关注者：关注了该信息 / 发布者 / 行业 / 城市的人（fanOutListing 原有逻辑）
 *   - 全体会员：平台所有正常账号（会员可在设置里关闭）
 * 两者取并集，同一个人只收到一条，避免重复打扰。
 */
/**
 * 用户设过的兴趣：行业 id + 城市 id。
 * 兼容两套字段名（industryIds 是资料页的，followTags 是早期版本用过的）。
 */
function userInterests(u) {
  const inds = new Set([...(u.industryIds || []), ...(u.followTags || [])]);
  const cities = new Set([...(u.cityIds || []), ...(u.followCities || [])]);
  return { inds, cities };
}

/**
 * 这条信息是否命中用户的兴趣。
 * 行业命中或城市命中任意一个就算命中。
 */
function listingMatchesInterests(u, listing) {
  const { inds, cities } = userInterests(u);
  if (!inds.size && !cities.size) return false; // 没设兴趣 → 不推（避免全员轰炸）
  const lInds = (listing.industries || []).map((i) => i && i.id).filter(Boolean);
  const lCities = (listing.cities || []).map((c) => c && c.id).filter(Boolean);
  if (lInds.some((id) => inds.has(id))) return true;
  if (lCities.some((id) => cities.has(id))) return true;
  return false;
}

/**
 * 新信息上线时应该收到通知的人。
 *
 * 2026-11 改造前：精准关注者 ∪ **全体会员**
 *   → 919 条信息 × 329 用户，30 天产生 235,130 条通知。
 *
 * 改造后：精准关注者 ∪ 兴趣匹配的会员
 *   - 关注者：关注了该信息 / 发布者 / 行业 / 城市的人（明确表达过兴趣）
 *   - 兴趣会员：profile 里设了行业或城市的，且与本条信息匹配
 *   - 没设兴趣的会员：不再收到单条项目推送（可去「项目」页浏览，
 *     或在资料页设置关注的行业/地区）
 */
export function newListingAudience(listing) {
  const followers = new Set();
  for (const f of follows().all()) {
    if (f.targetType === 'listing' && f.targetId === listing.id) followers.add(f.userId);
    else if (f.targetType === 'user' && f.targetId === listing.ownerId) followers.add(f.userId);
    else if (f.targetType === 'industry' && (listing.industries || []).some((i) => i.id === f.targetId))
      followers.add(f.userId);
    else if (f.targetType === 'city' && (listing.cities || []).some((c) => c.id === f.targetId))
      followers.add(f.userId);
  }
  followers.delete(listing.ownerId);
  for (const uid of [...followers]) {
    if (!wantsFollowNotice(users().get(uid))) followers.delete(uid);
  }

  const members = new Set();
  for (const u of users().all()) {
    if (!u || !wantsNewProjectNotice(u)) continue;
    if (u.id === listing.ownerId) continue;
    if (!listingMatchesInterests(u, listing)) continue;
    members.add(u.id);
  }

  // 关注者已经在 followers 里了，members 去掉重复
  for (const uid of followers) members.delete(uid);

  return { followers, members, all: new Set([...followers, ...members]) };
}

/**
 * 信息发布后立即推送：
 *   - 关注者收到「您关注的领域有新动态」
 *   - 其他会员收到「新项目上线」
 * 采用"发布时扫描"的方式，规模小时完全够用。
 */
export function fanOutListing(listing) {
  const { followers, all } = newListingAudience(listing);
  const link = `/#/detail/${listing.id}`;
  const summary = (listing.subtitle || listing.ai?.summary || '').slice(0, 120);
  const result = [];

  for (const uid of all) {
    const isFollower = followers.has(uid);
    result.push(
      notify({
        userId: uid,
        type: isFollower ? 'follow_new' : 'listing_new',
        title: isFollower ? `您关注的领域有新动态：${listing.title}` : `新项目上线：${listing.title}`,
        body: summary || '平台有新信息发布，点击查看详情',
        link,
        meta: { listingId: listing.id, category: listing.category, via: isFollower ? 'follow' : 'member' },
      }),
    );
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* 信息变更：通知关注人                                                 */
/* ------------------------------------------------------------------ */

/** 稳定的 JSON 序列化（对象键排序），避免同内容因键顺序不同被误判为变更 */
function stableStr(v) {
  if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStr).join(',')}]`;
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStr(v[k])}`)
    .join(',')}}`;
}

/** 比较改动前后的信息，返回发生变化的中文字段名列表 */
export function diffListing(before, after) {
  if (!before || !after) return [];
  const out = [];
  for (const [k, label] of Object.entries(CHANGE_LABELS)) {
    if (after[k] === undefined) continue;
    if (stableStr(before[k]) !== stableStr(after[k])) out.push(label);
  }
  return out;
}

/**
 * 信息内容变更后，通知关注了该信息 / 发布者的人，以及项目成员。
 * 发布方本人不会收到自己的变更通知。
 */
export function notifyListingUpdate(listing, changes, { exclude = [] } = {}) {
  if (!listing || !changes || !changes.length) return [];
  const skip = new Set([listing.ownerId, ...exclude].filter(Boolean));

  const targets = new Set();
  for (const f of follows().all()) {
    if (f.targetType === 'listing' && f.targetId === listing.id) targets.add(f.userId);
    else if (f.targetType === 'user' && f.targetId === listing.ownerId) targets.add(f.userId);
  }
  // 项目成员（已对接）属于强相关，不受「关注动态」开关限制
  const members = new Set(listing.memberIds || []);
  for (const uid of [...targets]) {
    if (members.has(uid)) continue;
    if (!wantsFollowNotice(users().get(uid))) targets.delete(uid);
  }
  for (const uid of members) targets.add(uid);
  for (const uid of skip) targets.delete(uid);

  return notifyMany([...targets], {
    type: 'listing_update',
    title: `您关注的信息有更新：${listing.title}`,
    body: `变更内容：${changes.join('、')}`,
    link: `/#/detail/${listing.id}`,
    meta: { listingId: listing.id, changes },
  });
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

/**
 * 清理旧通知 —— 防止无界增长。
 *
 * 背景：2026-11 发现 notifications.json 涨到 268MB / 50.7 万条，
 * Node 常驻内存 462MB，服务被 OOM 反复杀掉重启（7 天 32 次）。
 * 根因是「每条新闻 / 每个新项目都推给全体 322 个用户」，且没有任何保留策略。
 *
 * 策略：保留最近 keepDays 天，且每个用户最多 perUser 条（默认 30 天 / 200 条）。
 * 每天跑一次，内存占用就有上界了。
 */
export function pruneNotifications({ keepDays = 30, perUser = 200 } = {}) {
  const all = notifications().all();
  if (!all.length) return { before: 0, after: 0, removed: 0 };

  const cutoff = Date.now() - keepDays * 86400_000;

  // 先按时间过滤，再按用户截断，最后得到要保留的 id 集合
  const grouped = new Map();
  for (const n of all) {
    const t = Date.parse(n.createdAt || 0) || 0;
    if (t < cutoff) continue;
    if (!grouped.has(n.userId)) grouped.set(n.userId, []);
    grouped.get(n.userId).push(n);
  }

  const keep = new Set();
  for (const arr of grouped.values()) {
    arr.sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0));
    for (const n of arr.slice(0, perUser)) keep.add(n.id);
  }

  // 先收集再删除，避免边遍历边改数组
  const doomed = all.filter((n) => !keep.has(n.id)).map((n) => n.id);
  for (const id of doomed) {
    try { notifications().remove(id); } catch { /* 单条失败不影响整体 */ }
  }

  return { before: all.length, after: all.length - doomed.length, removed: doomed.length };
}

export function notificationStats(userId) {
  const all = notifications().where('userId', userId);
  return {
    total: all.length,
    unread: all.filter((x) => !x.read).length,
  };
}

/**
 * 给「没设置兴趣」的用户发新项目周报
 *
 * 为什么需要它：改成按兴趣过滤后，没设兴趣的用户会完全收不到新项目推送
 * （实测 330 个用户里 0 个设过兴趣，等于新项目通知直接断掉）。
 * 所以给这部分人一周发一条精选摘要，既不轰炸也不失联。
 *
 * 已经设了兴趣的人不在这里发 —— 他们走 fanOutListing 的精确推送。
 */
export function pushListingDigest({ days = 7, topN = 6, minGapHours = 160 } = {}) {
  const settings = db.collection('settings');
  const STATE_ID = 'listing_digest';
  const state = settings.get(STATE_ID);
  if (state && state.lastAt) {
    const gap = Date.now() - Date.parse(state.lastAt);
    if (gap < minGapHours * 3600_000) return 0; // 还没到一周
  }

  const since = Date.now() - days * 86400_000;
  const recent = listings()
    .all()
    .filter((l) => l.status === 'published')
    .filter((l) => {
      const t = Date.parse(l.publishedAt || l.createdAt || 0) || 0;
      return t >= since;
    })
    .sort((a, b) => (Date.parse(b.publishedAt || b.createdAt || 0) || 0) - (Date.parse(a.publishedAt || a.createdAt || 0) || 0));

  if (!recent.length) return 0;

  const list = recent.slice(0, topN);

  // 只发给「没设兴趣」的正常用户
  const targets = [];
  for (const u of users().all()) {
    if (!u || u.disabled || u.banned) continue;
    if (!wantsNewProjectNotice(u)) continue;
    const has = (u.industryIds || []).length || (u.followTags || []).length
      || (u.cityIds || []).length || (u.followCities || []).length;
    if (has) continue; // 设了兴趣的人走精确推送
    targets.push(u.id);
  }
  if (!targets.length) return 0;

  const lines = list.map((l, i) => `${i + 1}. ${String(l.title || '').slice(0, 50)}`).join('\n');
  notifyMany(targets, {
    type: 'listing_new',
    title: `📌 本周新增 ${recent.length} 个项目，${String(list[0].title || '').slice(0, 24)} 等`,
    body: `${lines}${recent.length > list.length ? `\n…共 ${recent.length} 个` : ''}\n\n点进去看看有没有适合你的`,
    link: '#/list?category=project',
    meta: { digest: true, total: recent.length, shown: list.length },
  });

  const next = { id: STATE_ID, lastAt: new Date().toISOString(), total: recent.length, sent: targets.length };
  if (settings.get(STATE_ID)) settings.update(STATE_ID, next);
  else settings.insert(next);

  return targets.length;
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
  newListingAudience,
  wantsNewProjectNotice,
  diffListing,
  notifyListingUpdate,
  listNotifications,
  unreadCount,
  markRead,
  pruneNotifications,
  pushListingDigest,
  remindExpiring,
  expireListings,
  notificationStats,
  NOTIFY_TYPES,
  CHANGE_LABELS,
};
