/**
 * 群聊与会议路由
 */
import fs from 'node:fs';
import { httpError } from '../http/app.js';
import { data, fail, num, bool, list, str, baseUrl, authUser, mustAuth } from './_util.js';
import chatSvc from '../services/chat.js';
import hub from '../services/hub.js';
import db from '../store/db.js';
import { saveUploads, filePublic, getFile } from '../services/files.js';
import { config } from '../config.js';

export default function registerChatRoutes(app) {
  /* ================================================================ */
  /* 群聊                                                              */
  /* ================================================================ */
  app.get('/api/chat/rooms', (req, res) => {
    const user = mustAuth(req);
    // 话题群（固定、所有人可见）与会话分开返回
    try {
      chatSvc.ensureTopicRooms();
    } catch {
      /* 初始化失败不影响主流程 */
    }
    return data(res, {
      items: chatSvc.listRooms(user.id),
      topics: chatSvc.listTopicRooms(user.id),
    });
  });

  app.post('/api/chat/rooms', (req, res) => {
    const user = mustAuth(req);
    const type = ['group', 'project', 'direct', 'event'].includes(req.body?.type) ? req.body.type : 'group';
    const memberIds = list(req.body?.memberIds).slice(0, 200);
    const room = chatSvc.ensureRoom({
      type,
      name: str(req.body?.name, 80) || '新群聊',
      ownerId: user.id,
      listingId: str(req.body?.listingId, 60),
      targetId: str(req.body?.targetId, 80),
      memberIds,
    });
    return data(res, { room: chatSvc.roomPublic(room, user.id) }, 201);
  });

  app.get('/api/chat/rooms/:id', (req, res) => {
    const user = authUser(req);
    let room = chatSvc.getRoom(req.params.id);
    if (!room) throw httpError(404, '群聊不存在');

    // 话题群：任何人打开即自动加入
    if (room.type === 'topic' && user) {
      room = chatSvc.joinTopicRoom(room.id, user);
    }

    const isMember = (room.members || []).some((m) => m.userId === user?.id);
    if (!isMember && !user?.isAdmin) throw httpError(403, '您不在该群聊中');
    return data(res, { room: chatSvc.roomPublic(room, user.id) });
  });

  app.get('/api/chat/rooms/:id/messages', (req, res) => {
    const user = mustAuth(req);
    const room = chatSvc.getRoom(req.params.id);
    if (!room) throw httpError(404, '群聊不存在');
    if (!(room.members || []).some((m) => m.userId === user.id) && !user.isAdmin) {
      throw httpError(403, '您不在该群聊中');
    }
    const items = chatSvc.listMessages(req.params.id, {
      since: String(req.query.since || ''),
      before: String(req.query.before || ''),
      limit: Math.min(300, num(req.query.limit, 100)),
    });
    return data(res, { items, room: chatSvc.roomPublic(room, user.id) });
  });

  app.post('/api/chat/rooms/:id/messages', async (req, res) => {
    const user = mustAuth(req);
    const files = await saveUploads(req, { ownerId: user.id, listingId: '', role: 'chat' });
    const msg = chatSvc.sendMessage(req.params.id, user, {
      text: str(req.body?.text || req.body?.content, 4000),
      fileIds: files.map((f) => f.id),
      type: files.length ? 'file' : 'text',
    });
    return data(res, { message: { ...msg, fileList: files.map(filePublic) } }, 201);
  });

  app.post('/api/chat/rooms/:id/members', (req, res) => {
    const user = mustAuth(req);
    const result = chatSvc.addMembers(req.params.id, user, list(req.body?.userIds));
    return data(res, { room: chatSvc.roomPublic(result.room, user.id), added: result.added });
  });

  app.del('/api/chat/rooms/:id/members/:userId', (req, res) => {
    const user = mustAuth(req);
    const room = chatSvc.removeMember(req.params.id, user, req.params.userId);
    return data(res, { room: chatSvc.roomPublic(room, user.id) });
  });

  app.post('/api/chat/rooms/:id/read', (req, res) => {
    const user = mustAuth(req);
    chatSvc.markRoomRead(req.params.id, user.id);
    return data(res, { ok: true });
  });

  /** 群邀请信息（链接 / 二维码 / 分享文案） */
  app.get('/api/chat/rooms/:id/invite', (req, res) => {
    const user = mustAuth(req);
    return data(res, chatSvc.roomInvite(req.params.id, baseUrl(req), user));
  });

  /** 群公告（仅群主） */
  app.post('/api/chat/rooms/:id/announcement', (req, res) => {
    const user = mustAuth(req);
    const room = chatSvc.setAnnouncement(req.params.id, user, str(req.body?.text, 1000));
    return data(res, { room: chatSvc.roomPublic(room, user.id) });
  });

  /* ================================================================ */
  /* 会议                                                              */
  /* ================================================================ */
  app.get('/api/meetings', (req, res) => {
    const user = mustAuth(req);
    return data(res, { items: chatSvc.listMeetings(user.id), provider: config.meeting.provider });
  });

  app.post('/api/meetings', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.createMeeting({
      roomId: str(req.body?.roomId, 60),
      listingId: str(req.body?.listingId, 60),
      host: user,
      title: str(req.body?.title, 120) || '项目对接会议',
      startAt: str(req.body?.startAt, 40) || new Date().toISOString(),
      durationMin: Math.min(
        String(req.body?.mode) === 'live' ? 480 : 60,
        num(req.body?.durationMin, 60),
      ),
      participantIds: list(req.body?.participantIds),
      agenda: str(req.body?.agenda, 1000),
      usePassword: bool(req.body?.usePassword),
      password: str(req.body?.password, 20),
      mode: ['meeting', 'live'].includes(String(req.body?.mode)) ? String(req.body.mode) : 'meeting',
    });
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id) }, 201);
  });

  /** 用会议号查询（加入前的预览页用，不需要登录） */
  app.get('/api/meetings/lookup', (req, res) => {
    const m = chatSvc.getMeetingByNumber(str(req.query.number, 20));
    if (!m) return fail(res, '会议号不存在，请确认后重试', 404, 'meeting_not_found');
    return data(res, {
      number: m.number,
      title: m.title,
      hostName: m.hostName,
      status: m.status,
      startAt: m.startAt,
      hasPassword: Boolean(m.password),
      joinedCount: (m.participants || []).filter((p) => p.joined).length,
      allowGuest: m.settings?.allowGuest !== false,
      locked: Boolean(m.settings?.locked),
      meetingId: m.id,
    });
  });

  /** 用会议号加入：登录用户直接进；未登录需提供昵称（作为临时参会人） */
  app.post('/api/meetings/join', (req, res) => {
    const user = mustAuth(req);
    const number = str(req.body?.number, 20);
    const password = str(req.body?.password, 20);
    const name = str(req.body?.name, 40);
    const { meeting } = chatSvc.joinMeetingByNumber({ number, password, user, name });
    const joined = chatSvc.joinMeeting(meeting.id, user, {
      name,
      muted: req.body?.muted === undefined ? null : bool(req.body.muted),
      cameraOff: req.body?.cameraOff === undefined ? null : bool(req.body.cameraOff),
    });
    return data(res, {
      meeting: chatSvc.meetingPublic(joined, user.id),
      signaling: 'sse',
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
      transcriptProvider: 'browser-speech-recognition',
    });
  });

  app.get('/api/meetings/:id', (req, res) => {
    const user = authUser(req);
    const meeting = chatSvc.getMeeting(req.params.id);
    const isParticipant = (meeting.participants || []).some((p) => p.userId === user?.id);
    if (!isParticipant && !user?.isAdmin && meeting.hostId !== user?.id) {
      // 允许持链接者以访客身份查看基本信息
      return data(res, {
        meeting: {
          id: meeting.id,
          number: meeting.number,
          title: meeting.title,
          status: meeting.status,
          startAt: meeting.startAt,
          hostName: meeting.hostName,
          hasPassword: Boolean(meeting.password),
          participantCount: (meeting.participants || []).length,
          joinedCount: (meeting.participants || []).filter((p) => p.joined).length,
          guest: true,
        },
      });
    }
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user?.id), provider: config.meeting.provider });
  });

  /** 会议邀请信息（链接 / 会议号 / 密码 / 二维码） */
  app.get('/api/meetings/:id/invite', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.getMeeting(req.params.id);
    const isParticipant =
      (meeting.participants || []).some((p) => p.userId === user.id) || meeting.hostId === user.id || user.isAdmin;
    if (!isParticipant) throw httpError(403, '请先加入会议再分享邀请');
    return data(res, chatSvc.meetingInvite(req.params.id, baseUrl(req)));
  });

  app.post('/api/meetings/:id/join', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.joinMeeting(req.params.id, user, {
      name: str(req.body?.name, 40),
      muted: req.body?.muted === undefined ? null : bool(req.body.muted),
      cameraOff: req.body?.cameraOff === undefined ? null : bool(req.body.cameraOff),
    });
    return data(res, {
      meeting: chatSvc.meetingPublic(meeting, user.id),
      signaling: 'sse',
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
      transcriptProvider: 'browser-speech-recognition',
    });
  });

  /* ---------------- 会议内状态 / 主持人控制 ---------------- */
  app.post('/api/meetings/:id/state', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.castState(req.params.id, user, {
      muted: req.body?.muted === undefined ? undefined : bool(req.body.muted),
      cameraOff: req.body?.cameraOff === undefined ? undefined : bool(req.body.cameraOff),
      handUp: req.body?.handUp === undefined ? undefined : bool(req.body.handUp),
      screenSharing: req.body?.screenSharing === undefined ? undefined : bool(req.body.screenSharing),
    });
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id) });
  });

  app.post('/api/meetings/:id/settings', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.updateMeetingSettings(req.params.id, user, req.body || {});
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id) });
  });

  app.post('/api/meetings/:id/mute-all', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.muteAll(req.params.id, user);
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id) });
  });

  app.post('/api/meetings/:id/kick', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.kickFromMeeting(req.params.id, user, str(req.body?.userId, 60));
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id) });
  });

  /* ---------------- 会议内聊天 ---------------- */
  app.get('/api/meetings/:id/chat', (req, res) => {
    mustAuth(req);
    return data(res, { items: chatSvc.listMeetingChat(req.params.id, { since: String(req.query.since || '') }) });
  });

  app.post('/api/meetings/:id/chat', (req, res) => {
    const user = mustAuth(req);
    const entry = chatSvc.sendMeetingChat(req.params.id, user, str(req.body?.text, 1000));
    return data(res, { entry }, 201);
  });

  app.post('/api/meetings/:id/leave', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.leaveMeeting(req.params.id, user);
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id) });
  });

  app.post('/api/meetings/:id/end', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.endMeeting(req.params.id, user);
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id) });
  });

  app.post('/api/meetings/:id/transcript', (req, res) => {
    const user = mustAuth(req);
    const result = chatSvc.appendTranscript(req.params.id, user, req.body?.chunks || req.body || {});
    return data(res, { added: result.added.length, total: (result.meeting.transcript || []).length });
  });

  app.put('/api/meetings/:id/notes', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.getMeeting(req.params.id);
    if (meeting.hostId !== user.id && !user.isAdmin) throw httpError(403, '只有主持人可以编辑');
    const updated = db.collection('meetings').update(req.params.id, { notes: str(req.body?.notes, 20000) });
    return data(res, { meeting: chatSvc.meetingPublic(updated, user.id) });
  });

  app.post('/api/meetings/:id/minutes', async (req, res) => {
    const user = mustAuth(req);
    const meeting = await chatSvc.generateMinutes(req.params.id, user);
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id) });
  });

  app.post('/api/meetings/:id/minutes/confirm', (req, res) => {
    const user = mustAuth(req);
    const meeting = chatSvc.confirmMinutes(req.params.id, user, {
      agree: req.body?.agree === undefined ? true : bool(req.body.agree),
      note: str(req.body?.note, 500),
    });
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id) });
  });

  /** 上传会议录音 */
  app.post('/api/meetings/:id/recording', async (req, res) => {
    const user = mustAuth(req);
    const saved = await saveUploads(req, { ownerId: user.id, role: 'recording' });
    if (!saved.length) return fail(res, '没有收到录音文件');
    const meeting = chatSvc.attachRecording(req.params.id, user, {
      fileId: saved[0].id,
      durationSec: num(req.body?.durationSec, 0),
    });
    return data(res, { meeting: chatSvc.meetingPublic(meeting, user.id), file: filePublic(saved[0]) }, 201);
  });

  /** WebRTC 信令 */
  app.post('/api/meetings/:id/signal', (req, res) => {
    const user = mustAuth(req);
    const signal = chatSvc.relaySignal(req.params.id, user, req.body || {});
    return data(res, { ok: true, signal });
  });

  /** 会议实时事件流（转写 / 信令 / 参会人变化） */
  app.get('/api/meetings/:id/stream', (req, res) => {
    const user = authUser(req);
    const meeting = chatSvc.getMeeting(req.params.id);
    if (!(meeting.participants || []).some((p) => p.userId === user?.id) && !user?.isAdmin) {
      throw httpError(403, '您不是本场会议的参会人');
    }
    const client = hub.subscribe(req, res, { userId: user.id });
    hub.joinRoom(client, `meeting:${req.params.id}`);
    if (meeting.roomId) hub.joinRoom(client, meeting.roomId);
    const sse = { send: client.send };
    sse.send('meeting_state', {
      meetingId: meeting.id,
      status: meeting.status,
      transcript: meeting.transcript || [],
      participants: meeting.participants || [],
    });
  });

  /** 群聊实时事件流 */
  app.get('/api/chat/rooms/:id/stream', (req, res) => {
    const user = mustAuth(req);
    const room = chatSvc.getRoom(req.params.id);
    if (!room) throw httpError(404, '群聊不存在');
    if (!(room.members || []).some((m) => m.userId === user.id) && !user.isAdmin) {
      throw httpError(403, '您不在该群聊中');
    }
    const client = hub.subscribe(req, res, { userId: user.id });
    hub.joinRoom(client, req.params.id);
    client.send('room_state', { roomId: room.id, name: room.name });
  });

  /** 信息留言区实时流 */
  app.get('/api/listings/:id/stream', (req, res) => {
    const user = authUser(req);
    const client = hub.subscribe(req, res, { userId: user?.id || null });
    hub.joinRoom(client, `listing:${req.params.id}`);
    client.send('listing_state', { listingId: req.params.id });
  });

  /** 录音文件下载 */
  app.get('/api/meetings/:id/recording', (req, res) => {
    const meeting = chatSvc.getMeeting(req.params.id);
    if (!meeting.recording?.fileId) throw httpError(404, '暂无录音');
    const f = getFile(meeting.recording.fileId);
    if (!f || !fs.existsSync(f.path)) throw httpError(410, '录音文件已清理');
    res.set('Content-Type', f.mime || 'audio/webm');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    return res.sendFile(f.path, 'stream');
  });
}
