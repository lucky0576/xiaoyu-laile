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

export const FEED_TYPES = { short: '短视频', live: '直播' };

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
    stats: { views: f.views || 0, likes: f.likes || 0, comments: f.commentCount || 0 },
    liked: viewerId ? (f.likedBy || []).includes(viewerId) : false,
    createdAt: f.createdAt,
    expiresAt: f.expiresAt || '',
  };
}

export function listFeeds({ type = '', featured = false, ownerId = '', listingId = '', limit = 20, viewerId = null } = {}) {
  let list = feeds().all();
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

export function getFeed(id) {
  const f = feeds().get(id);
  if (!f) throw httpError(404, '内容不存在');
  return f;
}

/* ------------------------------------------------------------------ */
/* 创建 / 修改                                                         */
/* ------------------------------------------------------------------ */
export async function createFeed({ user, body = {}, files: uploaded = [] }) {
  const type = body.type === 'live' ? 'live' : 'short';
  if (!String(body.title || '').trim()) throw httpError(400, '请填写标题');

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

  if (type === 'short' && !fileId) throw httpError(400, '请上传短视频文件（支持 MP4 / MOV / WebM）');
  const video = fileId ? files().get(fileId) : null;
  if (type === 'short' && video && video.kind !== 'video') {
    throw httpError(400, '短视频必须是视频文件');
  }
  if (type === 'short' && video) files().update(fileId, { listingId: '' });

  const days = Number(body.days) || 90;

  const feed = feeds().insert({
    id: newId('fd'),
    type,
    title: String(body.title).slice(0, 80),
    subtitle: String(body.subtitle || '').slice(0, 120),
    description: String(body.description || '').slice(0, 2000),
    fileId,
    coverFileId,
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

export function viewFeed(id) {
  getFeed(id); // 不存在则抛 404
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
  listFeeds,
  getFeed,
  feedPublic,
  createFeed,
  updateFeed,
  removeFeed,
  likeFeed,
  viewFeed,
  startLive,
  endLive,
  liveInfo,
  liveHeartbeat,
  statsFor,
  FEED_TYPES,
};
