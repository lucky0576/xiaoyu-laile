/**
 * 实时通道（Server-Sent Events）
 *
 * 用于：私信/群聊消息、会议实时转写、关注动态通知、系统广播。
 * 选 SSE 而不是 WebSocket：浏览器原生支持、走标准 HTTP、
 * 部署到 CDN/Nginx 后面零配置，对移动端也更省电。
 */
const clients = new Set();
let seq = 0;

export function subscribe(req, res, meta = {}) {
  const sse = res.sse();
  const client = {
    id: `c${++seq}`,
    userId: meta.userId || null,
    rooms: new Set(meta.rooms || []),
    send: sse.send,
    close: sse.close,
    at: Date.now(),
  };
  clients.add(client);
  sse.send('hello', { clientId: client.id, at: client.at });
  res.on('close', () => clients.delete(client));
  return client;
}

export function joinRoom(client, roomId) {
  if (client) client.rooms.add(roomId);
}

export function onlineCount() {
  return clients.size;
}

/** 广播给所有在线连接 */
export function broadcast(event, data) {
  for (const c of clients) c.send(event, data);
}

/** 发给某个用户的所有连接 */
export function toUser(userId, event, data) {
  if (!userId) return 0;
  let n = 0;
  for (const c of clients) {
    if (c.userId === userId) {
      c.send(event, data);
      n++;
    }
  }
  return n;
}

export function toUsers(userIds, event, data) {
  let n = 0;
  const set = new Set(userIds.filter(Boolean));
  for (const uid of set) n += toUser(uid, event, data);
  return n;
}

/** 发给指定房间（聊天室 / 会议）内的连接 */
export function toRoom(roomId, event, data, exceptClientId) {
  let n = 0;
  for (const c of clients) {
    if (c.id === exceptClientId) continue;
    if (c.rooms.has(roomId)) {
      c.send(event, data);
      n++;
    }
  }
  return n;
}

export default { subscribe, broadcast, toUser, toUsers, toRoom, joinRoom, onlineCount };
