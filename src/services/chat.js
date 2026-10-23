/**
 * 群聊与线上会议（会议部分对齐腾讯会议的常用交互）
 *
 * 群聊：项目群 / 活动群 / 通讯录好友群 / 一对一；支持邀请链接与二维码、群公告、@提及
 * 会议：内置房间（WebRTC 信令走 SSE + POST），支持
 *   - 9 位会议号 + 入会密码，可通过会议号或邀请链接加入
 *   - 会前预览（昵称、摄像头、麦克风）
 *   - 会议内成员列表、会议聊天、举手、共享屏幕
 *   - 主持人控制：全体静音、锁定会议、移除成员、结束会议
 *   - 实时语音转写（浏览器 SpeechRecognition）逐句入库
 *   - 录音上传归档
 *   - AI 自动生成会议纪要与双方后续跟进事项，并发送双方确认
 */
import crypto from 'node:crypto';
import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';
import hub from './hub.js';
import notifySvc from './notify.js';
import ai from './ai.js';
import { config } from '../config.js';
import { filePublic } from './files.js';
import * as listings from './listings.js';

const rooms = () => db.collection('chatRooms');
const messages = () => db.collection('messages');
const meetings = () => db.collection('meetings');
const users = () => db.collection('users');
const listingsCol = () => db.collection('listings');

/* ------------------------------------------------------------------ */
/* 房间                                                                */
/* ------------------------------------------------------------------ */
function memberOf(room, userId) {
  return (room.members || []).find((m) => m.userId === userId);
}

export function ensureRoom({ type = 'group', name, ownerId, listingId = '', targetId = '', memberIds = [], meta = {} }) {
  if (targetId) {
    const found = rooms().findOne((r) => r.type === type && r.targetId === targetId);
    if (found) return found;
  }
  const owner = users().get(ownerId);
  const memberList = [];
  const push = (uid, role) => {
    if (!uid || memberList.some((m) => m.userId === uid)) return;
    const u = users().get(uid);
    memberList.push({
      userId: uid,
      name: u?.nickname || (uid === ownerId ? owner?.nickname : '成员') || '成员',
      avatar: u?.avatar || '',
      role,
      joinedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    });
  };
  push(ownerId, 'owner');
  for (const uid of memberIds) push(uid, 'member');

  return rooms().insert({
    id: newId('room'),
    type,
    name: String(name || '群聊').slice(0, 80),
    ownerId,
    listingId,
    targetId,
    members: memberList,
    meta,
    messageCount: 0,
    lastMessage: null,
    createdAt: new Date().toISOString(),
  });
}

export function getRoom(id) {
  return rooms().get(id);
}

export function roomPublic(room, viewerId) {
  if (!room) return null;
  const me = memberOf(room, viewerId);
  return {
    ...room,
    isMember: Boolean(me),
    unread: countUnread(room, viewerId),
    memberCount: (room.members || []).length,
    members: (room.members || []).map((m) => ({ ...m, online: false })),
  };
}

export function listRooms(userId) {
  return rooms()
    .find((r) => memberOf(r, userId))
    .sort((a, b) =>
      String(b.lastMessage?.at || b.createdAt).localeCompare(String(a.lastMessage?.at || a.createdAt)),
    )
    .map((r) => roomPublic(r, userId));
}

export function countUnread(room, userId) {
  const me = memberOf(room, userId);
  if (!me) return 0;
  const last = me.lastReadAt || '1970-01-01T00:00:00.000Z';
  return messages().count((m) => m.roomId === room.id && m.at > last && m.userId !== userId);
}

export function markRoomRead(roomId, userId) {
  const room = rooms().get(roomId);
  if (!room) throw httpError(404, '群聊不存在');
  const members = (room.members || []).map((m) =>
    m.userId === userId ? { ...m, lastReadAt: new Date().toISOString() } : m,
  );
  return rooms().update(roomId, { members });
}

export function addMembers(roomId, actor, userIds = []) {
  const room = rooms().get(roomId);
  if (!room) throw httpError(404, '群聊不存在');
  if (!memberOf(room, actor.id) && !actor.isAdmin) throw httpError(403, '您不在该群聊中');
  const members = [...(room.members || [])];
  const added = [];
  for (const uid of userIds) {
    if (members.some((m) => m.userId === uid)) continue;
    const u = users().get(uid);
    members.push({
      userId: uid,
      name: u?.nickname || '成员',
      avatar: u?.avatar || '',
      role: 'member',
      joinedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    });
    added.push(uid);
  }
  const updated = rooms().update(roomId, { members });
  for (const uid of added) {
    notifySvc.notify({
      userId: uid,
      type: 'chat',
      title: `您被加入群聊「${room.name}」`,
      body: `${actor.nickname} 邀请您加入`,
      link: `/#/chat/${roomId}`,
    });
  }
  return { room: updated, added };
}

export function removeMember(roomId, actor, userId) {
  const room = rooms().get(roomId);
  if (!room) throw httpError(404, '群聊不存在');
  const isOwner = room.ownerId === actor.id || actor.isAdmin;
  if (userId !== actor.id && !isOwner) throw httpError(403, '只有群主可以移除成员');
  const members = (room.members || []).filter((m) => m.userId !== userId);
  return rooms().update(roomId, { members });
}

/* ------------------------------------------------------------------ */
/* 消息                                                                */
/* ------------------------------------------------------------------ */
export function listMessages(roomId, { since = '', limit = 100, before = '' } = {}) {
  const room = rooms().get(roomId);
  if (!room) throw httpError(404, '群聊不存在');
  let list = messages().where('roomId', roomId);
  if (since) list = list.filter((m) => m.at > since);
  if (before) list = list.filter((m) => m.at < before);
  list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (list.length > limit) list = list.slice(-limit);
  return list.map((m) => ({ ...m, fileList: (m.files || []).map((fid) => filePublic(db.collection('files').get(fid))).filter(Boolean) }));
}

export function sendMessage(roomId, user, { text = '', fileIds = [], type = 'text', silent = false } = {}) {
  const room = rooms().get(roomId);
  if (!room) throw httpError(404, '群聊不存在');
  if (!memberOf(room, user.id) && !user.isAdmin) throw httpError(403, '您不在该群聊中');
  const content = String(text || '').trim();
  if (!content && !fileIds.length) throw httpError(400, '消息不能为空');

  const msg = messages().insert({
    id: newId('msg'),
    roomId,
    userId: user.id,
    authorName: user.nickname || '用户',
    authorAvatar: user.avatar || '',
    type,
    text: content.slice(0, 4000),
    files: fileIds,
    at: new Date().toISOString(),
  });

  rooms().update(roomId, {
    lastMessage: { text: content.slice(0, 80) || '[文件]', at: msg.at, byName: user.nickname },
    messageCount: (room.messageCount || 0) + 1,
  });
  markRoomRead(roomId, user.id);

  hub.toRoom(roomId, 'message', { roomId, message: msg });

  if (!silent) {
    for (const m of room.members || []) {
      if (m.userId === user.id) continue;
      notifySvc.notify({
        userId: m.userId,
        type: 'chat',
        title: `「${room.name}」新消息`,
        body: `${user.nickname}：${content.slice(0, 100)}`,
        link: `/#/chat/${roomId}`,
        channels: { email: false },
      });
    }
  }
  return msg;
}

export function systemMessage(roomId, text) {
  const room = rooms().get(roomId);
  if (!room) return null;
  const msg = messages().insert({
    id: newId('msg'),
    roomId,
    userId: 'system',
    authorName: '系统',
    type: 'system',
    text: String(text).slice(0, 1000),
    files: [],
    at: new Date().toISOString(),
  });
  hub.toRoom(roomId, 'message', { roomId, message: msg });
  return msg;
}

/* ------------------------------------------------------------------ */
/* 项目对接：建群 + 推进流程                                             */
/* ------------------------------------------------------------------ */
export function startDocking(listingId, user, { note = '' } = {}) {
  const listing = listingsCol().get(listingId);
  if (!listing) throw httpError(404, '信息不存在');
  if (listing.ownerId === user.id) throw httpError(400, '不能对自己发布的信息发起对接');

  const existing = rooms().findOne((r) => r.type === 'project' && r.targetId === listingId);
  let room = existing;
  if (!room) {
    room = ensureRoom({
      type: 'project',
      name: `${listing.title.slice(0, 30)} · 项目对接群`,
      ownerId: listing.ownerId,
      listingId,
      targetId: listingId,
      memberIds: [user.id],
      meta: { listingTitle: listing.title, category: listing.category },
    });
    systemMessage(room.id, `${user.nickname} 发起了项目对接，双方可在本群沟通并推进流程。`);
  } else {
    room = addMembers(room.id, user, [user.id]).room;
  }

  const memberIds = [...new Set([...(listing.memberIds || []), user.id, listing.ownerId])];

  // 先把对接方登记为项目成员，再做流程推进（advancePipeline 会校验成员身份）
  listingsCol().update(listingId, {
    memberIds,
    chatRoomId: room.id,
    dockingCount: (listing.dockingCount || 0) + 1,
  });

  // 对接本身不再直接推进流程：7 步流程里没有「项目对接」这一步，
  // 对接只是建立群聊 + 登记成员（成员才能在详情页看到联系方式）。
  // 流程推进交给详情页的「当前环节」面板按真实进度走。
  let updated = listingsCol().get(listingId);

  // 把对接动作记进流程历史，便于追溯，但不改变当前阶段
  try {
    const history = [
      ...(updated.pipeline?.history || []),
      {
        stage: updated.pipeline?.stage || 'publish',
        name: `项目对接：${user.nickname}`,
        at: new Date().toISOString(),
        by: user.id,
        byName: user.nickname,
        note: note || '发起项目对接',
        kind: 'dock',
      },
    ];
    updated = listingsCol().update(listingId, { pipeline: { ...updated.pipeline, history } });
  } catch (err) {
    console.warn('[chat] 记录对接历史失败:', err.message);
  }

  notifySvc.notify({
    userId: listing.ownerId,
    type: 'chat',
    title: `「${listing.title}」有新的对接请求`,
    body: `${user.nickname}${user.company ? `（${user.company}）` : ''} 发起了项目对接${note ? `：${note}` : ''}`,
    link: `/#/chat/${room.id}`,
    meta: { listingId, roomId: room.id },
  });

  return { room: rooms().get(room.id), listing: updated };
}

/** 信息页留言区转成群聊 */
export function ensureListingCommentRoom(listingId, user) {
  const listing = listingsCol().get(listingId);
  if (!listing) throw httpError(404, '信息不存在');
  return ensureRoom({
    type: 'group',
    name: `${listing.title.slice(0, 30)} · 讨论群`,
    ownerId: listing.ownerId,
    listingId,
    targetId: `discuss:${listingId}`,
    memberIds: [user.id],
  });
}

/* ------------------------------------------------------------------ */
/* 会议                                                                */
/* ------------------------------------------------------------------ */
/** 生成 9 位会议号（仿腾讯会议），保证全局唯一 */
export function genMeetingNumber() {
  for (let i = 0; i < 200; i++) {
    const n = String(crypto.randomInt(100_000_000, 1_000_000_000));
    if (!meetings().findOne((m) => m.number === n)) return n;
  }
  return String(Date.now()).slice(-9);
}

/** 生成 6 位入会密码 */
function genMeetingPassword() {
  return String(crypto.randomInt(100_000, 1_000_000));
}

export function createMeeting({
  roomId,
  listingId = '',
  host,
  title,
  startAt,
  durationMin = 60,
  participantIds = [],
  agenda = '',
  password = '',
  usePassword = false,
  mode = 'meeting',
}) {
  // 会议时长上限：普通会议最长 60 分钟，直播不受此限（统一夹取，不抛错）
  const maxMin = mode === 'live' ? 480 : 60;
  const safeDuration = Math.max(5, Math.min(maxMin, Number(durationMin) || 60));


  let room = roomId ? rooms().get(roomId) : null;
  if (roomId && !room) throw httpError(404, '群聊不存在');

  if (!room && listingId) {
    const listing = listingsCol().get(listingId);
    if (!listing) throw httpError(404, '信息不存在');
    room = ensureRoom({
      type: 'project',
      name: `${listing.title.slice(0, 30)} · 项目对接群`,
      ownerId: listing.ownerId,
      listingId,
      targetId: listingId,
      memberIds: [host.id],
    });
    roomId = room.id;
  }

  const ids = new Set([host.id, ...(room?.members || []).map((m) => m.userId), ...participantIds]);
  const participants = [...ids].map((uid) => {
    const u = users().get(uid);
    return {
      userId: uid,
      name: u?.nickname || '参会人',
      avatar: u?.avatar || '',
      role: uid === host.id ? 'host' : 'attendee',
      joined: false,
      joinedAt: null,
      muted: false,
      cameraOff: false,
      handUp: false,
      viaNumber: false,
    };
  });

  const meeting = meetings().insert({
    id: newId('mt'),
    number: genMeetingNumber(),
    password: usePassword ? String(password || genMeetingPassword()).slice(0, 20) : '',
    roomId: roomId || '',
    listingId,
    mode,
    title: String(title || '项目对接会议').slice(0, 120),
    agenda: String(agenda).slice(0, 1000),
    hostId: host.id,
    hostName: host.nickname,
    startAt: startAt || new Date().toISOString(),
    // 会议时长上限 60 分钟（直播模式不受此限）
    durationMin: safeDuration,
    status: 'scheduled',
    provider: config.meeting.provider,
    joinUrl: '',
    settings: {
      muteOnJoin: true,
      cameraOffOnJoin: true,
      allowChat: true,
      locked: false,
      allowGuest: true,
    },
    participants,
    chat: [],
    transcript: [],
    keyPoints: [],
    decisions: [],
    actions: [],
    minutes: null,
    minutesConfirmed: [],
    recording: null,
    signals: [],
    createdAt: new Date().toISOString(),
  });

  meetings().update(meeting.id, { joinUrl: `${config.publicBaseUrl || ''}/#/join?n=${meeting.number}` });

  for (const p of participants) {
    if (p.userId === host.id) continue;
    notifySvc.notify({
      userId: p.userId,
      type: 'meeting_invite',
      title: `会议邀请：${meeting.title}`,
      body: `${host.nickname} 邀请您参加，会议号 ${meeting.number}${meeting.password ? `（密码 ${meeting.password}）` : ''}`,
      link: `/#/meeting/${meeting.id}`,
      meta: { meetingId: meeting.id, number: meeting.number },
    });
  }
  if (roomId) systemMessage(roomId, `${host.nickname} 发起了会议「${meeting.title}」，会议号 ${meeting.number}`);
  return meetings().get(meeting.id);
}

/* ------------------------------------------------------------------ */
/* 会议号加入 / 邀请 / 主持人控制                                        */
/* ------------------------------------------------------------------ */
export function getMeetingByNumber(number) {
  const n = String(number || '').replace(/\D/g, '');
  if (!n) return null;
  return meetings().findOne((m) => String(m.number) === n) || null;
}

/**
 * 通过会议号加入。未注册的人需要提供昵称，会作为临时参会者加入。
 * @returns {{ meeting: object, participant: object }}
 */
export function joinMeetingByNumber({ number, password = '', user, name = '' }) {
  const m = getMeetingByNumber(number);
  if (!m) throw httpError(404, '会议号不存在，请确认后重试', 'meeting_not_found');
  if (m.status === 'ended') throw httpError(410, '会议已结束', 'meeting_ended');
  if (m.password && String(password) !== String(m.password)) {
    throw httpError(403, '入会密码不正确', 'bad_password');
  }
  if (m.settings?.locked && !(m.participants || []).some((p) => p.userId === user?.id)) {
    throw httpError(403, '会议已锁定，无法加入', 'meeting_locked');
  }
  if (!user && !m.settings?.allowGuest) {
    throw httpError(403, '本场会议仅限受邀用户参加', 'guest_not_allowed');
  }

  return { meeting: m, participant: null, displayName: name };
}

export function updateMeetingSettings(id, actor, patch = {}) {
  const m = getMeeting(id);
  if (m.hostId !== actor.id && !actor.isAdmin) throw httpError(403, '只有主持人可以修改会议设置');
  const settings = { ...(m.settings || {}) };
  for (const k of ['muteOnJoin', 'cameraOffOnJoin', 'allowChat', 'locked', 'allowGuest']) {
    if (patch[k] !== undefined) settings[k] = Boolean(patch[k]);
  }
  const next = { settings };
  if (patch.password !== undefined) next.password = String(patch.password || '').slice(0, 20);
  if (patch.title !== undefined) next.title = String(patch.title).slice(0, 120);
  const updated = meetings().update(id, next);
  hub.toRoom(`meeting:${id}`, 'meeting_settings', { meetingId: id, settings: updated.settings, title: updated.title });
  if (updated.settings.locked !== m.settings?.locked) {
    hub.toRoom(`meeting:${id}`, 'meeting_lock', { meetingId: id, locked: updated.settings.locked });
  }
  return updated;
}

/** 主持人：全体静音 */
export function muteAll(id, actor) {
  const m = getMeeting(id);
  if (m.hostId !== actor.id && !actor.isAdmin) throw httpError(403, '只有主持人可以全体静音');
  const participants = (m.participants || []).map((p) =>
    p.userId === actor.id || !p.joined ? p : { ...p, muted: true },
  );
  const updated = meetings().update(id, { participants });
  hub.toRoom(`meeting:${id}`, 'meeting_mute_all', { meetingId: id, by: actor.nickname });
  for (const p of participants) {
    if (p.userId !== actor.id && p.joined) hub.toUser(p.userId, 'force_mute', { meetingId: id });
  }
  return updated;
}

/** 参会人同步自身的麦克风/摄像头/举手状态 */
export function castState(id, user, patch = {}) {
  const m = getMeeting(id);
  const participants = (m.participants || []).map((p) =>
    p.userId === user.id
      ? {
          ...p,
          muted: patch.muted !== undefined ? Boolean(patch.muted) : p.muted,
          cameraOff: patch.cameraOff !== undefined ? Boolean(patch.cameraOff) : p.cameraOff,
          handUp: patch.handUp !== undefined ? Boolean(patch.handUp) : p.handUp,
          screenSharing: patch.screenSharing !== undefined ? Boolean(patch.screenSharing) : p.screenSharing,
        }
      : p,
  );
  const updated = meetings().update(id, { participants });
  hub.toRoom(`meeting:${id}`, 'meeting_participants', { meetingId: id, participants: updated.participants });
  return updated;
}

/** 主持人：移出成员 */
export function kickFromMeeting(id, actor, userId) {
  const m = getMeeting(id);
  if (m.hostId !== actor.id && !actor.isAdmin) throw httpError(403, '只有主持人可以移除成员');
  if (userId === m.hostId) throw httpError(400, '不能移除主持人');
  const participants = (m.participants || []).filter((p) => p.userId !== userId);
  const updated = meetings().update(id, { participants });
  hub.toUser(userId, 'meeting_kicked', { meetingId: id, title: m.title });
  hub.toRoom(`meeting:${id}`, 'meeting_participants', { meetingId: id, participants });
  systemMeetingChat(id, `${actor.nickname} 将一位成员移出了会议`);
  return updated;
}

/* ------------------------------------------------------------------ */
/* 会议内聊天                                                          */
/* ------------------------------------------------------------------ */
export function listMeetingChat(id, { since = '' } = {}) {
  const m = getMeeting(id);
  let list = m.chat || [];
  if (since) list = list.filter((c) => c.at > since);
  return list.slice(-200);
}

export function sendMeetingChat(id, user, text) {
  const m = getMeeting(id);
  if (m.settings?.allowChat === false && m.hostId !== user.id) {
    throw httpError(403, '主持人已关闭会议聊天');
  }
  const content = String(text || '').trim();
  if (!content) throw httpError(400, '消息不能为空');
  const entry = {
    id: newId('mc'),
    userId: user.id,
    name: user.nickname || '参会人',
    avatar: user.avatar || '',
    text: content.slice(0, 1000),
    at: new Date().toISOString(),
  };
  meetings().update(id, { chat: [...(m.chat || []), entry].slice(-500) });
  hub.toRoom(`meeting:${id}`, 'meeting_chat', { meetingId: id, entry });
  return entry;
}

export function systemMeetingChat(id, text) {
  const m = meetings().get(id);
  if (!m) return null;
  const entry = {
    id: newId('mc'),
    userId: 'system',
    name: '系统',
    system: true,
    text: String(text).slice(0, 500),
    at: new Date().toISOString(),
  };
  meetings().update(id, { chat: [...(m.chat || []), entry].slice(-500) });
  hub.toRoom(`meeting:${id}`, 'meeting_chat', { meetingId: id, entry });
  return entry;
}

/* ------------------------------------------------------------------ */
/* 邀请分享                                                            */
/* ------------------------------------------------------------------ */
function qrUrl(baseUrl, text, size = 320) {
  return `${baseUrl}/api/share/qrcode?text=${encodeURIComponent(text)}&size=${size}`;
}

/** 会议邀请信息（邀请链接 / 会议号 / 密码 / 二维码 / 分享文案） */
export function meetingInvite(id, baseUrl) {
  const m = getMeeting(id);
  const url = `${baseUrl}/#/join?n=${m.number}`;
  const passLine = m.password ? `\n入会密码：${m.password}` : '';
  return {
    kind: 'meeting',
    meetingId: m.id,
    title: m.title,
    number: m.number,
    password: m.password,
    hostName: m.hostName,
    startAt: m.startAt,
    status: m.status,
    url,
    qr: qrUrl(baseUrl, url, 360),
    modes: [
      {
        id: 'image',
        name: '邀请卡（图片 + 文字 + 二维码）',
        desc: '生成带会议号的邀请卡，适合发微信群、朋友圈',
        text: `【${m.title}】\n${m.hostName} 邀请你参加会议\n会议号：${m.number}${passLine}\n点击链接或扫码入会：${url}`,
      },
      {
        id: 'link',
        name: '链接 + 会议号',
        desc: '直接转发链接，微信内自动展示标题与摘要',
        text: `【${m.title}】会议号 ${m.number}${passLine}\n${url}`,
      },
      {
        id: 'number',
        name: '仅会议号',
        desc: '对方在小鱼来了首页输入会议号即可加入',
        text: `会议号：${m.number}${passLine}`,
      },
    ],
  };
}

/** 群聊邀请信息 */
export function roomInvite(roomId, baseUrl, actor) {
  const room = getRoom(roomId);
  if (!room) throw httpError(404, '群聊不存在');
  if (!memberOf(room, actor.id) && !actor.isAdmin) throw httpError(403, '您不在该群聊中');
  const url = `${baseUrl}/#/chat/${room.id}`;
  return {
    kind: 'group',
    roomId: room.id,
    name: room.name,
    memberCount: (room.members || []).length,
    url,
    qr: qrUrl(baseUrl, url, 360),
    modes: [
      {
        id: 'image',
        name: '群邀请卡（图片 + 文字 + 二维码）',
        desc: '生成带二维码的邀请卡，适合发微信群',
        text: `【${room.name}】\n${actor.nickname} 邀请你加入群聊\n长按识别二维码或点击链接加入：${url}`,
      },
      {
        id: 'link',
        name: '链接 + 群名',
        desc: '直接转发链接给好友',
        text: `【${room.name}】${actor.nickname} 邀请你加入群聊\n${url}`,
      },
    ],
  };
}

/** 群公告 */
export function setAnnouncement(roomId, actor, text) {
  const room = getRoom(roomId);
  if (!room) throw httpError(404, '群聊不存在');
  if (room.ownerId !== actor.id && !actor.isAdmin) throw httpError(403, '只有群主可以发布群公告');
  const announcement = {
    text: String(text || '').slice(0, 1000),
    by: actor.nickname,
    at: new Date().toISOString(),
  };
  const updated = rooms().update(roomId, { announcement });
  systemMessage(roomId, `群公告：${announcement.text}`);
  return updated;
}

export function listMeetings(userId) {
  return meetings()
    .find((m) => (m.participants || []).some((p) => p.userId === userId))
    .sort((a, b) => String(b.startAt).localeCompare(String(a.startAt)))
    .map((m) => ({
      ...m,
      transcript: undefined,
      myRole: (m.participants || []).find((p) => p.userId === userId)?.role || 'attendee',
      participantCount: (m.participants || []).length,
    }));
}

export function getMeeting(id) {
  const m = meetings().get(id);
  if (!m) throw httpError(404, '会议不存在');
  return m;
}

export function joinMeeting(id, user, { name = '', muted = null, cameraOff = null } = {}) {
  const m = getMeeting(id);
  if (m.status === 'ended') throw httpError(410, '会议已结束', 'meeting_ended');
  const settings = m.settings || {};
  const isHost = m.hostId === user.id;
  const already = (m.participants || []).some((p) => p.userId === user.id);
  if (settings.locked && !already) throw httpError(403, '会议已锁定，无法加入', 'meeting_locked');

  const nowIso = new Date().toISOString();
  let participants = (m.participants || []).map((p) =>
    p.userId === user.id
      ? {
          ...p,
          name: name || p.name,
          joined: true,
          joinedAt: p.joinedAt || nowIso,
          muted: muted !== null ? muted : (p.muted ?? settings.muteOnJoin ?? true),
          cameraOff: cameraOff !== null ? cameraOff : (p.cameraOff ?? settings.cameraOffOnJoin ?? true),
        }
      : p,
  );
  if (!participants.some((p) => p.userId === user.id)) {
    participants.push({
      userId: user.id,
      name: name || user.nickname,
      avatar: user.avatar,
      role: 'attendee',
      joined: true,
      joinedAt: nowIso,
      muted: muted !== null ? muted : (settings.muteOnJoin ?? true),
      cameraOff: cameraOff !== null ? cameraOff : (settings.cameraOffOnJoin ?? true),
      handUp: false,
    });
  }
  const updated = meetings().update(id, { participants, status: m.status === 'scheduled' ? 'live' : m.status });
  hub.toRoom(`meeting:${id}`, 'meeting_participants', { meetingId: id, participants });
  systemMeetingChat(id, `${name || user.nickname} 加入了会议`);
  void isHost;
  return updated;
}

export function leaveMeeting(id, user) {
  const m = getMeeting(id);
  const participants = (m.participants || []).map((p) =>
    p.userId === user.id ? { ...p, joined: false, handUp: false, screenSharing: false } : p,
  );
  const updated = meetings().update(id, { participants });
  hub.toRoom(`meeting:${id}`, 'meeting_participants', { meetingId: id, participants });
  systemMeetingChat(id, `${user.nickname || '一位参会人'} 离开了会议`);
  return updated;
}

export function endMeeting(id, user) {
  const m = getMeeting(id);
  if (m.hostId !== user.id && !user.isAdmin) throw httpError(403, '只有主持人可以结束会议');
  const updated = meetings().update(id, {
    status: 'ended',
    endedAt: new Date().toISOString(),
    participants: (m.participants || []).map((p) => ({ ...p, joined: false, handUp: false })),
  });
  hub.toRoom(`meeting:${id}`, 'meeting_ended', { meetingId: id, by: user.nickname });
  return updated;
}

/** 实时转写：逐句追加并广播 */
export function appendTranscript(id, user, chunks) {
  const m = getMeeting(id);
  const list = Array.isArray(chunks) ? chunks : [chunks];
  const transcript = [...(m.transcript || [])];
  const added = [];
  for (const c of list) {
    const entry = {
      id: newId('tr'),
      speaker: String(c?.speaker || user.nickname || '参会人').slice(0, 40),
      userId: c?.userId || user.id,
      text: String(c?.text || '').slice(0, 2000),
      at: c?.at || new Date().toISOString(),
      final: c?.final !== false,
    };
    if (!entry.text.trim()) continue;
    transcript.push(entry);
    added.push(entry);
  }
  const updated = meetings().update(id, { transcript });
  for (const entry of added) hub.toRoom(`meeting:${id}`, 'transcript', { meetingId: id, entry });
  return { meeting: updated, added };
}

export async function generateMinutes(id, user) {
  const m = getMeeting(id);
  if ((m.transcript || []).length === 0 && !m.notes) {
    throw httpError(400, '还没有转写内容，无法生成纪要');
  }
  const listing = m.listingId ? listingsCol().get(m.listingId) : null;
  const result = await ai.meetingMinutes({
    meeting: m,
    transcript: m.transcript || [],
    participants: m.participants || [],
    listing: listing ? listings.listingBrief(listing) : null,
    notes: m.notes || '',
  });

  const updated = meetings().update(id, {
    minutes: { ...result, generatedAt: new Date().toISOString(), generatedBy: user.id, confirmedBy: [] },
  });

  // 发送给双方确认
  for (const p of m.participants || []) {
    if (p.userId === user.id) continue;
    notifySvc.notify({
      userId: p.userId,
      type: 'meeting_minutes',
      title: `会议纪要待确认：${m.title}`,
      body: String(result.summary || '').slice(0, 150),
      link: `/#/meeting/${id}`,
      meta: { meetingId: id },
    });
  }
  hub.toRoom(`meeting:${id}`, 'minutes', { meetingId: id, minutes: updated.minutes });
  return updated;
}

export function confirmMinutes(id, user, { agree = true, note = '' } = {}) {
  const m = getMeeting(id);
  if (!m.minutes) throw httpError(400, '纪要尚未生成');
  const confirmed = [...(m.minutes.confirmedBy || []).filter((c) => c.userId !== user.id)];
  confirmed.push({ userId: user.id, name: user.nickname, agree, note: String(note).slice(0, 500), at: new Date().toISOString() });
  const updated = meetings().update(id, { minutes: { ...m.minutes, confirmedBy: confirmed } });

  // 双方都确认后，写入项目跟进记录
  const others = (m.participants || []).filter((p) => p.userId !== user.id);
  const allConfirmed =
    confirmed.filter((c) => c.agree).length >= 2 || others.every((p) => confirmed.some((c) => c.userId === p.userId && c.agree));

  if (allConfirmed && m.listingId) {
    const listing = listingsCol().get(m.listingId);
    if (listing) {
      const entry = {
        id: newId('fu'),
        text: `【会议纪要已双方确认】${m.title}\n${String(m.minutes.followUp || m.minutes.summary || '').slice(0, 3000)}`,
        files: [],
        by: user.id,
        byName: user.nickname,
        at: new Date().toISOString(),
        kind: 'meeting_minutes',
        meetingId: id,
      };
      listingsCol().update(m.listingId, { followUps: [...(listing.followUps || []), entry] });
    }
  }
  return updated;
}

export function attachRecording(id, user, { fileId, durationSec = 0 }) {
  getMeeting(id);
  return meetings().update(id, {
    recording: { fileId, durationSec: Number(durationSec) || 0, by: user.id, at: new Date().toISOString() },
  });
}

/** WebRTC 信令转发 */
export function relaySignal(id, user, payload = {}) {
  const m = getMeeting(id);
  if (!(m.participants || []).some((p) => p.userId === user.id) && !user.isAdmin) {
    throw httpError(403, '您不是本场会议的参会人');
  }
  const signal = {
    id: newId('sig'),
    from: user.id,
    fromName: user.nickname,
    to: payload.to || '',
    kind: payload.kind || 'offer',
    data: payload.data || null,
    at: Date.now(),
  };
  hub.toRoom(`meeting:${id}`, 'signal', { meetingId: id, signal });
  if (signal.to) hub.toUser(signal.to, 'signal', { meetingId: id, signal });
  return signal;
}

export function meetingPublic(m, viewerId) {
  if (!m) return null;
  const mine = (m.participants || []).find((p) => p.userId === viewerId);
  const isParticipant = Boolean(mine) || m.hostId === viewerId;
  return {
    ...m,
    // 密码只给到会的人看，方便转发邀请
    password: isParticipant ? m.password : '',
    hasPassword: Boolean(m.password),
    isHost: m.hostId === viewerId,
    myRole: mine?.role || (m.hostId === viewerId ? 'host' : 'guest'),
    canManage: m.hostId === viewerId,
    myState: mine
      ? { muted: Boolean(mine.muted), cameraOff: Boolean(mine.cameraOff), handUp: Boolean(mine.handUp) }
      : null,
    joinedCount: (m.participants || []).filter((p) => p.joined).length,
    participantCount: (m.participants || []).length,
    transcript: m.transcript || [],
    transcriptCount: (m.transcript || []).length,
    chatCount: (m.chat || []).length,
  };
}

/* ------------------------------------------------------------------ */
/* 通讯录                                                              */
/* ------------------------------------------------------------------ */
export function importContacts(userId, { source = 'phone', contacts = [] } = {}) {
  const col = db.collection('contacts');
  const created = [];
  const matched = [];
  let skipped = 0;
  for (const raw of contacts.slice(0, 2000)) {
    const name = String(raw?.name || '').slice(0, 60);
    const phone = String(raw?.phone || '').replace(/[^\d+]/g, '');
    const wechat = String(raw?.wechat || '').slice(0, 60);
    const company = String(raw?.company || '').slice(0, 100);
    if (!name && !phone && !wechat) {
      skipped++;
      continue;
    }
    const exists = col.findOne(
      (c) => c.ownerId === userId && ((phone && c.phone === phone) || (name && c.name === name && c.source === source)),
    );
    if (exists) {
      skipped++;
      continue;
    }
    const registered = phone ? users().findOne((u) => u.phone === phone) : null;
    if (registered) matched.push({ userId: registered.id, nickname: registered.nickname, name, phone });
    created.push(
      col.insert({
        id: newId('ct'),
        ownerId: userId,
        source,
        name,
        phone,
        wechat,
        company,
        note: String(raw?.note || '').slice(0, 200),
        registeredUserId: registered?.id || '',
        invited: false,
      }),
    );
  }
  return { imported: created.length, skipped, matched, contacts: created.slice(0, 200) };
}

export function listContacts(userId, { q = '' } = {}) {
  let list = db.collection('contacts').where('ownerId', userId);
  if (q) {
    const kw = String(q).toLowerCase();
    list = list.filter((c) =>
      [c.name, c.phone, c.wechat, c.company].filter(Boolean).join(' ').toLowerCase().includes(kw),
    );
  }
  return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
}

export function inviteContact(userId, contactId, { message = '' } = {}) {
  const c = db.collection('contacts').get(contactId);
  if (!c || c.ownerId !== userId) throw httpError(404, '联系人不存在');
  const inviter = users().get(userId);
  const link = `${config.publicBaseUrl || ''}/#/register?invite=${userId}`;

  if (c.registeredUserId) {
    try {
      ensureRoom({
        type: 'direct',
        name: '好友会话',
        ownerId: userId,
        targetId: [userId, c.registeredUserId].sort().join(':'),
        memberIds: [c.registeredUserId],
      });
    } catch {
      /* ignore */
    }
    notifySvc.notify({
      userId: c.registeredUserId,
      type: 'contact_invite',
      title: `${inviter?.nickname || '好友'} 邀请您加入小鱼来了`,
      body: message || '点击查看他的项目与动态',
      link: `/#/user/${userId}`,
    });
  }
  db.collection('contacts').update(contactId, { invited: true, invitedAt: new Date().toISOString() });
  return { ok: true, link, registered: Boolean(c.registeredUserId), contact: db.collection('contacts').get(contactId) };
}

export default {
  ensureRoom,
  getRoom,
  listRooms,
  markRoomRead,
  addMembers,
  removeMember,
  listMessages,
  sendMessage,
  systemMessage,
  startDocking,
  // 会议
  createMeeting,
  listMeetings,
  getMeeting,
  getMeetingByNumber,
  joinMeeting,
  joinMeetingByNumber,
  leaveMeeting,
  endMeeting,
  updateMeetingSettings,
  muteAll,
  castState,
  kickFromMeeting,
  listMeetingChat,
  sendMeetingChat,
  systemMeetingChat,
  meetingInvite,
  appendTranscript,
  generateMinutes,
  confirmMinutes,
  attachRecording,
  relaySignal,
  meetingPublic,
  genMeetingNumber,
  // 群聊
  roomInvite,
  setAnnouncement,
  // 通讯录
  importContacts,
  listContacts,
  inviteContact,
  roomPublic,
};