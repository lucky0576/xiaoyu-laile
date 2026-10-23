#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""固定话题群：服务层 + 路由层"""

import io
import os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ================= 1) 服务层 =================
S = os.path.join(D, "src", "services", "chat.js")
s = io.open(S, "r", encoding="utf-8").read()

# 1.1 导入话题配置
OLD_IMPORT = "export function ensureRoom({"
NEW_IMPORT = """/* ------------------------------------------------------------------ */
/* 固定话题群                                                          */
/* ------------------------------------------------------------------ */

/**
 * 确保话题群存在（幂等）。slug 存 meta.slug，重复调用不会重复创建。
 * 返回 { created, total }
 */
export function ensureTopicRooms() {
  const admin = users().find((u) => u.isAdmin) || users().first();
  let created = 0;
  for (const t of TOPIC_ROOMS) {
    const exist = rooms().findOne((r) => r.type === 'topic' && r.meta && r.meta.slug === t.slug);
    if (exist) continue;
    rooms().insert({
      id: newId('room'),
      type: 'topic',
      name: t.name,
      ownerId: admin ? admin.id : '',
      listingId: '',
      targetId: '',
      members: [],
      meta: { slug: t.slug, icon: t.icon, desc: t.desc, official: true },
      messageCount: 0,
      lastMessage: null,
      createdAt: new Date().toISOString(),
    });
    created++;
  }
  return { created, total: TOPIC_ROOMS.length };
}

/** 所有话题群（带当前用户的成员/未读状态） */
export function listTopicRooms(userId) {
  const all = rooms().find((r) => r.type === 'topic');
  const order = new Map(TOPIC_ROOMS.map((t, i) => [t.slug, i]));
  return all
    .sort((a, b) => {
      const oa = order.has(a.meta && a.meta.slug) ? order.get(a.meta.slug) : 999;
      const ob = order.has(b.meta && b.meta.slug) ? order.get(b.meta.slug) : 999;
      return oa - ob;
    })
    .map((r) => {
      const p = roomPublic(r, userId);
      return {
        id: p.id,
        name: p.name,
        icon: (p.meta && p.meta.icon) || '💬',
        desc: (p.meta && p.meta.desc) || '',
        slug: (p.meta && p.meta.slug) || '',
        isMember: p.isMember,
        unread: p.unread,
        memberCount: p.memberCount,
        messageCount: p.messageCount || 0,
        lastMessage: p.lastMessage ? { text: String(p.lastMessage.text || '').slice(0, 60), at: p.lastMessage.at } : null,
      };
    });
}

/** 加入话题群（幂等）。返回 room */
export function joinTopicRoom(roomId, user) {
  const room = rooms().get(roomId);
  if (!room) throw httpError(404, '群聊不存在');
  if (room.type !== 'topic') throw httpError(400, '只有话题群支持自由加入');
  if (memberOf(room, user.id)) return room;

  const members = [
    ...(room.members || []),
    {
      userId: user.id,
      name: user.nickname || '成员',
      avatar: user.avatar || '',
      role: 'member',
      joinedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    },
  ];
  return rooms().update(roomId, { members });
}

export function ensureRoom({"""

if OLD_IMPORT not in s:
    print("ERROR: 未找到 ensureRoom")
    raise SystemExit(1)
s = s.replace(OLD_IMPORT, NEW_IMPORT, 1)

# 1.2 listRooms 排除话题群（话题群单独一组）
OLD_LIST = """export function listRooms(userId) {
  return rooms()
    .find((r) => memberOf(r, userId))"""
NEW_LIST = """export function listRooms(userId) {
  return rooms()
    .find((r) => memberOf(r, userId) && r.type !== 'topic')"""
if OLD_LIST in s:
    s = s.replace(OLD_LIST, NEW_LIST, 1)
    print("OK listRooms 已排除话题群")

# 1.3 默认导出补充
OLD_EXPORT = "export default {"
NEW_EXPORT = """export default {
  ensureTopicRooms,
  listTopicRooms,
  joinTopicRoom,"""
if OLD_EXPORT in s:
    s = s.replace(OLD_EXPORT, NEW_EXPORT, 1)
    print("OK 默认导出已补充")

io.open(S, "w", encoding="utf-8").write(s)

# 1.4 导入 TOPIC_ROOMS
OLD_I2 = """import { rooms, messages, meetings"""
if OLD_I2 in s or True:
    if "from '../data/topics.js'" not in s:
        # 在第一个 import 之后插入
        idx = s.find("\nimport ")
        if idx > 0:
            nxt = s.find("\n", idx + 1)
            s = s[:nxt] + "\nimport { TOPIC_ROOMS } from '../data/topics.js';" + s[nxt:]
            io.open(S, "w", encoding="utf-8").write(s)
            print("OK 已导入 TOPIC_ROOMS")

# ================= 2) 路由层 =================
R = os.path.join(D, "src", "routes", "chat.js")
r = io.open(R, "r", encoding="utf-8").read()

# 2.1 列表接口返回 topics
OLD_R1 = """  app.get('/api/chat/rooms', (req, res) => {
    const user = mustAuth(req);
    return data(res, { items: chatSvc.listRooms(user.id) });
  });"""
NEW_R1 = """  app.get('/api/chat/rooms', (req, res) => {
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
  });"""

if OLD_R1 not in r:
    print("ERROR: 未找到 /api/chat/rooms")
    raise SystemExit(1)
r = r.replace(OLD_R1, NEW_R1, 1)

# 2.2 话题群自动加入
OLD_R2 = """  app.get('/api/chat/rooms/:id', (req, res) => {
    const user = authUser(req);
    const room = chatSvc.getRoom(req.params.id);
    if (!room) throw httpError(404, '群聊不存在');
    const isMember = (room.members || []).some((m) => m.userId === user?.id);
    if (!isMember && !user?.isAdmin) throw httpError(403, '您不在该群聊中');
    return data(res, { room: chatSvc.roomPublic(room, user.id) });
  });"""
NEW_R2 = """  app.get('/api/chat/rooms/:id', (req, res) => {
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
  });"""

if OLD_R2 in r:
    r = r.replace(OLD_R2, NEW_R2, 1)
    print("OK 话题群自动加入（GET）")

io.open(R, "w", encoding="utf-8").write(r)
print("OK 路由层已改造")
