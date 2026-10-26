/**
 * 小鱼来了 — 短视频与直播
 *
 * 首页轮播位由「图文 Banner」升级为「短视频 + 直播」：
 *   - 短视频：上传的视频（复用 files 服务），首页静音自动播放，进入详情页可带声播放
 *   - 直播：复用会议那套 WebRTC 信令，但拓扑是「主播 → 观众」星形
 *     （主播推流给每个观众，观众之间不互联），因此并发观众数受主播上行带宽限制
 *
 * 直播的会议记录挂在 meetings 集合上，`mode: 'live'` 区分于普通会议，
 * 这样直播天然获得：会议号入会、邀请分享、实时聊天、成员列表、AI 纪要。
 */
import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';
import { config } from '../config.js';
import hub from './hub.js';
import notifySvc from './notify.js';
import { filePublic } from './files.js';

const feeds = () => db.collection('feeds');
const files = () => db.collection('files');
const users = () => db.collection('users');

export const FEED_TYPES = {
  short: '短视频',
  live: '直播',
  moment: '动态',
  news: '新闻',
};

/**
 * 创建时**必须**带视频文件的类型。
 * 直播不算：直播间是先建号后开播，开播时才有媒体流，创建时不该要求上传视频。
 */
export const REQUIRE_VIDEO_TYPES = ['short'];

/** 属于视频形态的内容类型 */
export const VIDEO_FEED_TYPES = ['short', 'live'];

/* ------------------------------------------------------------------ */
/* 查询                                                                */
/* ------------------------------------------------------------------ */
export function feedPublic(f, viewerId = null) {
  if (!f) return null;
  const video = f.fileId ? files().get(f.fileId) : null;
  const cover = f.coverFileId ? files().get(f.coverFileId) : null;
  const owner = users().get(f.ownerId);
  return {
    id: f.id,
    type: f.type,
    typeName: FEED_TYPES[f.type] || f.type,
    title: f.title,
    subtitle: f.subtitle || '',
    description: f.description || '',
    source: f.source || '',
    author: f.author || '',
    tags: f.tags || [],
    location: f.location || '',
    video: video ? filePublic(video) : null,
    videoUrl: video ? video.url : '',
    cover: cover ? filePublic(cover) : null,
    coverUrl: cover ? cover.url : '',
    ownerId: f.ownerId,
    owner: f.ownerSnapshot || (owner ? { id: owner.id, nickname: owner.nickname, avatar: owner.avatar } : null),
    listingId: f.listingId || '',
    liveMeetingId: f.liveMeetingId || '',
    liveStatus: f.liveStatus || 'off',
    liveStartedAt: f.liveStartedAt || '',
    liveViewers: hub.onlineCount(),
    featured: Boolean(f.featured),
    stats: {
      views: f.views || 0,
      likes: f.likes || 0,
      comments: f.commentCount || 0,
      favorites: f.favorites || 0,
    },
    liked: viewerId ? (f.likedBy || []).includes(viewerId) : false,
    favorited: viewerId ? (f.favoritedBy || []).includes(viewerId) : false,
    createdAt: f.createdAt,
    expiresAt: f.expiresAt || '',
  };
}

export function listFeeds({ type = '', featured = false, ownerId = '', listingId = '', limit = 20, viewerId = null } = {}) {
  let list = feeds().all();
  // 已下架的不出现在公开列表
  list = list.filter((f) => f.status !== 'removed');
  if (type) list = list.filter((f) => f.type === type);
  if (featured) list = list.filter((f) => f.featured);
  if (ownerId) list = list.filter((f) => f.ownerId === ownerId);
  if (listingId) list = list.filter((f) => f.listingId === listingId);
  // 直播中排最前，其余按时间倒序
  list.sort((a, b) => {
    const al = a.type === 'live' && a.liveStatus === 'live' ? 1 : 0;
    const bl = b.type === 'live' && b.liveStatus === 'live' ? 1 : 0;
    if (al !== bl) return bl - al;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return list.slice(0, Math.min(100, limit)).map((f) => feedPublic(f, viewerId));
}


/* ------------------------------------------------------------------ */
/* 管理员：短视频管理                                                  */
/* ------------------------------------------------------------------ */

/** 管理员看全部（含已下架），支持按类型与关键词过滤 */
export function adminListFeeds({ type = '', q = '', limit = 200 } = {}) {
  let list = feeds().all();
  if (type) list = list.filter((f) => f.type === type);
  const kw = String(q || '').trim();
  if (kw) list = list.filter((f) => String(f.title || '').includes(kw) || String(f.subtitle || '').includes(kw));
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return list.slice(0, Math.min(500, limit)).map((f) => {
    const pub = feedPublic(f, null);
    return { ...pub, status: f.status || 'published' };
  });
}

/** 下架 / 恢复。下架后前台列表与详情都不再出现 */
export function setFeedStatus(id, status, admin) {
  if (!admin || !admin.isAdmin) throw httpError(403, '只有管理员可以操作');
  const f = feeds().get(id);
  if (!f) throw httpError(404, '内容不存在');
  const next = status === 'removed' ? 'removed' : 'published';
  feeds().update(id, { status: next, statusUpdatedAt: new Date().toISOString() });
  return feeds().get(id);
}

export function getFeed(id) {
  const f = feeds().get(id);
  if (!f) throw httpError(404, '内容不存在');
  return f;
}

/** 取详情时带上下架判断：已下架的只有管理员/本人能看 */
export function getFeedForViewer(id, viewer) {
  const f = feeds().get(id);
  if (!f) throw httpError(404, '内容不存在');
  if (f.status === 'removed') {
    const allowed = viewer && (viewer.isAdmin || viewer.id === f.ownerId);
    if (!allowed) throw httpError(404, '内容已下架');
  }
  return f;
}

/* ------------------------------------------------------------------ */
/* 创建 / 修改                                                         */
/* ------------------------------------------------------------------ */

/** 话题标签：兼容数组与 JSON 字符串（multipart 传上来是字符串） */
function toTags(v) {
  let arr = v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) {
      try { arr = JSON.parse(s); } catch { arr = s.split(/[,，\s#]+/); }
    } else {
      arr = s.split(/[,，\s#]+/);
    }
  }
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((t) => String(t).trim().slice(0, 20)).filter(Boolean))].slice(0, 8);
}

export async function createFeed({ user, body = {}, files: uploaded = [] }) {
  const type = FEED_TYPES[body.type] ? body.type : 'short';
  const needVideo = REQUIRE_VIDEO_TYPES.includes(type);
  if (!String(body.title || '').trim()) throw httpError(400, '请填写标题');
  // 动态 / 新闻是图文内容，光有标题没有意义
  if (!needVideo && !String(body.description || body.subtitle || '').trim()) {
    throw httpError(400, type === 'news' ? '请填写新闻正文' : '请填写动态内容');
  }

  let fileId = '';
  let coverFileId = '';
  for (const f of uploaded) {
    if (f.kind === 'video' && !fileId) fileId = f.id;
    else if (f.kind === 'image' && !coverFileId) coverFileId = f.id;
    else if (!fileId) fileId = f.id;
  }
  // 也允许直接引用已上传的视频
  if (!fileId && body.fileId) fileId = String(body.fileId);
  if (!coverFileId && body.coverFileId) coverFileId = String(body.coverFileId);

  if (needVideo && !fileId) throw httpError(400, '请上传短视频文件（支持 MP4 / MOV / WebM）');
  const video = fileId ? files().get(fileId) : null;
  if (needVideo && video && video.kind !== 'video') {
    throw httpError(400, '短视频必须是视频文件');
  }
  if (needVideo && video) files().update(fileId, { listingId: '' });

  const days = Number(body.days) || 90;

  const feed = feeds().insert({
    id: newId('fd'),
    type,
    title: String(body.title).slice(0, 80),
    subtitle: String(body.subtitle || '').slice(0, 120),
    description: String(body.description || '').slice(0, 2000),
    fileId,
    coverFileId,
    // 新闻可标注来源与作者，动态可带话题标签
    source: String(body.source || '').slice(0, 80),
    author: String(body.author || '').slice(0, 40),
    tags: toTags(body.tags),
    location: String(body.location || '').slice(0, 60),
    ownerId: user.id,
    ownerSnapshot: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      company: user.company,
      verified: Boolean(user.verified || user.qualification?.status === 'approved'),
    },
    listingId: String(body.listingId || '').slice(0, 60),
    liveMeetingId: '',
    liveStatus: 'off',
    liveStartedAt: '',
    featured: body.featured === undefined ? true : Boolean(body.featured),
    sort: Number(body.sort) || 0,
    views: 0,
    likes: 0,
    likedBy: [],
    favorites: 0,
    favoritedBy: [],
    commentCount: 0,
    expiresAt: new Date(Date.now() + days * 86400_000).toISOString(),
  });
  hub.broadcast('feed_new', feedPublic(feed));
  return feed;
}

export function updateFeed(id, user, patch = {}) {
  const f = getFeed(id);
  if (f.ownerId !== user.id && !user.isAdmin) throw httpError(403, '只能修改自己发布的内容');
  const next = {};
  for (const k of ['title', 'subtitle', 'description', 'listingId', 'coverFileId', 'fileId']) {
    if (patch[k] !== undefined) next[k] = String(patch[k]).slice(0, 2000);
  }
  if (patch.featured !== undefined) next.featured = Boolean(patch.featured);
  if (patch.sort !== undefined) next.sort = Number(patch.sort) || 0;
  return feeds().update(id, next);
}

export function removeFeed(id, user) {
  const f = getFeed(id);
  if (f.ownerId !== user.id && !user.isAdmin) throw httpError(403, '只能删除自己发布的内容');
  feeds().remove(id);
  return true;
}

export function likeFeed(id, user) {
  const f = getFeed(id);
  const liked = (f.likedBy || []).includes(user.id);
  const likedBy = liked ? f.likedBy.filter((x) => x !== user.id) : [...(f.likedBy || []), user.id];
  return feeds().update(id, { likedBy, likes: likedBy.length });
}

/** 收藏 / 取消收藏（toggle），返回最新记录 */
export function favoriteFeed(id, user) {
  const f = getFeed(id);
  const has = (f.favoritedBy || []).includes(user.id);
  const favoritedBy = has
    ? f.favoritedBy.filter((x) => x !== user.id)
    : [...(f.favoritedBy || []), user.id];
  return feeds().update(id, { favoritedBy, favorites: favoritedBy.length });
}

/** 我收藏的短视频，按收藏时间倒序 */
export function listFavorites(userId, { type = '' } = {}) {
  let list = feeds().all().filter((f) => (f.favoritedBy || []).includes(userId));
  if (type) list = list.filter((f) => f.type === type);
  // 按收藏顺序不好拿（数组里没记时间），用更新时间倒序兜底
  list = list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return list;
}

export function viewFeed(id, viewer = null) {
  // 已下架的内容：除管理员与发布者外，一律当作不存在
  const f0 = feeds().get(id);
  if (!f0) throw httpError(404, '内容不存在');
  if (f0.status === 'removed') {
    const allowed = viewer && (viewer.isAdmin || viewer.id === f0.ownerId);
    if (!allowed) throw httpError(404, '内容已下架');
  }
  // 注意：必须返回自增后的记录，否则详情接口会少算一次播放
  return feeds().bump(id, 'views', 1);
}

/* ------------------------------------------------------------------ */
/* 直播                                                                */
/* ------------------------------------------------------------------ */
/** 开播：为该 feed 建一个 mode=live 的会议（复用会议号 / 邀请 / 聊天 / 纪要） */
export async function startLive(id, user, { title, usePassword = false } = {}) {
  const f = getFeed(id);
  if (f.ownerId !== user.id && !user.isAdmin) throw httpError(403, '只有发布者可以开播');
  const { default: chatSvc } = await import('./chat.js');

  let meeting = f.liveMeetingId ? db.collection('meetings').get(f.liveMeetingId) : null;
  if (!meeting || meeting.status === 'ended') {
    meeting = chatSvc.createMeeting({
      roomId: '',
      listingId: f.listingId || '',
      host: user,
      title: title || f.title,
      durationMin: 240,
      usePassword,
      mode: 'live',
    });
  }
  const updated = feeds().update(id, {
    liveMeetingId: meeting.id,
    liveStatus: 'live',
    liveStartedAt: new Date().toISOString(),
  });
  hub.broadcast('live_started', { feedId: id, meetingId: meeting.id, title: updated.title });

  // 通知关注者
  try {
    const followers = notifySvc.followersOf('user', user.id);
    for (const fo of followers) {
      notifySvc.notify({
        userId: fo.userId,
        type: 'system',
        title: `${user.nickname} 正在直播：${updated.title}`,
        body: '点击进入直播间',
        link: `/#/live/${id}`,
      });
    }
  } catch { /* ignore */ }
  return { feed: feeds().get(id), meeting };
}

export function endLive(id, user) {
  const f = getFeed(id);
  if (f.ownerId !== user.id && !user.isAdmin) throw httpError(403, '只有主播可以结束直播');
  const updated = feeds().update(id, { liveStatus: 'ended', liveEndedAt: new Date().toISOString() });
  hub.broadcast('live_ended', { feedId: id });
  return updated;
}

/** 直播间信息（观看页用） */
export async function liveInfo(id, viewer) {
  const f = getFeed(id);
  const chatSvc = (await import('./chat.js')).default;
  let meeting = null;
  if (f.liveMeetingId) {
    meeting = db.collection('meetings').get(f.liveMeetingId);
  }
  return {
    feed: feedPublic(f, viewer?.id),
    meeting: meeting ? chatSvc.meetingPublic(meeting, viewer?.id) : null,
    isHost: viewer ? f.ownerId === viewer.id : false,
    canBroadcast: viewer ? f.ownerId === viewer.id || Boolean(viewer.isAdmin) : false,
  };
}

/** 直播观看/开播的心跳（用于人数统计） */
export function liveHeartbeat(id) {
  const f = feeds().get(id);
  if (!f) return null;
  return { live: f.liveStatus === 'live', at: Date.now() };
}

export function statsFor(userId) {
  const mine = feeds().where('ownerId', userId);
  return {
    total: mine.length,
    short: mine.filter((f) => f.type === 'short').length,
    live: mine.filter((f) => f.type === 'live').length,
    views: mine.reduce((s, f) => s + (f.views || 0), 0),
    likes: mine.reduce((s, f) => s + (f.likes || 0), 0),
  };
}

export function baseUrlOf() {
  return config.publicBaseUrl || '';
}

export default {
  adminListFeeds,
  setFeedStatus,
  getFeedForViewer,
  listFeeds,
  getFeed,
  feedPublic,
  createFeed,
  updateFeed,
  removeFeed,
  likeFeed,
  favoriteFeed,
  listFavorites,
  viewFeed,
  startLive,
  endLive,
  liveInfo,
  liveHeartbeat,
  statsFor,
  FEED_TYPES,
};
