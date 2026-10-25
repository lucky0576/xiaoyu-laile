/**
 * 小鱼来了 — 联系我（用户提问 / 管理员回复）
 *
 * 一个用户一个会话线程，双方往来消息都存在 replies 里。
 * 新提问通知管理员，管理员回复通知用户。
 *
 * 设计取舍：
 *   · 不做多轮工单状态机，就 open / replied / closed 三态，够用
 *   · 用户能看到自己全部历史提问和回复
 *   · 管理员一次性看到所有人的待回复，按最后更新时间排序
 */

import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';
import notifySvc from './notify.js';

const col = () => db.collection('feedback');
const users = () => db.collection('users');

const MAX_LEN = 2000;

/* 联系我：可多选的话题 */
export const CONTACT_TOPICS = [
  { id: 'invest', name: '投资 小鱼来了' },
  { id: 'system', name: '系统定制' },
  { id: 'event', name: '活动赛事策划' },
  { id: 'consult', name: '咨询' },
  { id: 'other', name: '其他' },
  { id: 'agency', name: '代理合作商' },
  { id: 'ad', name: '广告' },
  { id: 'promo', name: '宣传(全国行)' },
];
const TOPIC_BY_ID = Object.fromEntries(CONTACT_TOPICS.map((t) => [t.id, t]));

function clean(v, n = MAX_LEN) {
  return String(v || '').trim().slice(0, n);
}

/** 话题展示名拼接：投资 / 广告 */
function topicsText(item) {
  return (item.topics || [])
    .map((id) => (TOPIC_BY_ID[id] || {}).name)
    .filter(Boolean)
    .join(' / ');
}

/** 通知被联系的发布者（「联系我」来自短视频等场景） */
function notifyTarget(item, user) {
  if (!item.toUserId || item.toUserId === user.id) return;
  try {
    notifySvc.notify({
      userId: item.toUserId,
      type: 'feedback',
      title: `\u{1F4EE} ${user?.nickname || '\u7528\u6237'} \u60f3\u8054\u7cfb\u4f60`,
      body: clean(item.text, 80),
      link: '#/contact-us',
      meta: { feedbackId: item.id, feedId: item.feedId },
    });
  } catch {
    /* ignore */
  }
}

/** 通知所有管理员有新留言 */
function notifyAdmins(item, user) {
  try {
    const admins = users().find((u) => u && u.isAdmin && !u.disabled && !u.banned);
    if (!admins.length) return;
    notifySvc.notifyMany(
      admins.map((a) => a.id),
      {
        type: 'feedback',
        title: `📮 ${user?.nickname || '用户'} 留言了${topicsText(item) ? '（' + topicsText(item) + '）' : ''}`,
        body: clean(item.text, 80),
        link: '#/admin-feedback',
        meta: { feedbackId: item.id },
      },
    );
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* 用户端                                                              */
/* ------------------------------------------------------------------ */

/** 提交一条提问 */
export function submit(user, { text = '', contact = '', page = '', feedId = '', toUserId = '', toName = '', topics = [] } = {}) {
  const body = clean(text);
  if (!body) throw httpError(400, '请先写下你的问题');
  if (body.length < 2) throw httpError(400, '问题太短了，多写几个字吧');

  const item = col().insert({
    id: newId('fb'),
    userId: user.id,
    userName: user.nickname || '',
    userAvatar: user.avatar || '',
    contact: clean(contact, 60),
    page: clean(page, 120),
    topics: (Array.isArray(topics) ? topics : []).filter((t) => TOPIC_BY_ID[t]).slice(0, 8),
    feedId: clean(feedId, 60),
    toUserId: clean(toUserId, 60),
    toName: clean(toName, 60),
    text: body,
    status: 'open',
    replies: [],
    readByUser: true,
    readByAdmin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  notifyAdmins(item, user);
  notifyTarget(item, user);
  return item;
}

/** 我的提问列表（含回复） */
export function listMine(userId) {
  const items = col()
    .where('userId', userId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  // 用户查看后标记已读
  for (const it of items) {
    if (!it.readByUser) {
      try {
        col().update(it.id, { readByUser: true });
      } catch {
        /* ignore */
      }
    }
  }
  return items;
}

/** 用户追加一条补充说明 */
export function appendMyMessage(user, id, text) {
  const item = col().get(id);
  if (!item) throw httpError(404, '会话不存在');
  if (item.userId !== user.id) throw httpError(403, '无权操作');
  const body = clean(text);
  if (!body) throw httpError(400, '内容不能为空');

  const replies = [
    ...(item.replies || []),
    {
      id: newId('fr'),
      by: 'user',
      userId: user.id,
      name: user.nickname || '我',
      text: body,
      at: new Date().toISOString(),
    },
  ];
  const updated = col().update(id, {
    replies,
    status: 'open',
    readByAdmin: false,
    updatedAt: new Date().toISOString(),
  });
  notifyAdmins(updated, user);
  return updated;
}

/** 我的未读回复数（顶栏红点用） */
export function myUnreadCount(userId) {
  return col()
    .where('userId', userId)
    .filter((it) => it.status === 'replied' && !it.readByUser).length;
}

/* ------------------------------------------------------------------ */
/* 管理端                                                              */
/* ------------------------------------------------------------------ */

export function adminList({ status = '' } = {}) {
  let items = col().all();
  if (status) items = items.filter((i) => i.status === status);
  return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function adminStats() {
  const all = col().all();
  return {
    total: all.length,
    open: all.filter((i) => i.status === 'open').length,
    replied: all.filter((i) => i.status === 'replied').length,
    closed: all.filter((i) => i.status === 'closed').length,
    unread: all.filter((i) => !i.readByAdmin).length,
  };
}

export function adminReply(admin, id, text) {
  const item = col().get(id);
  if (!item) throw httpError(404, '会话不存在');
  const body = clean(text);
  if (!body) throw httpError(400, '回复内容不能为空');

  const replies = [
    ...(item.replies || []),
    {
      id: newId('fr'),
      by: 'admin',
      userId: admin.id,
      name: admin.nickname || '管理员',
      text: body,
      at: new Date().toISOString(),
    },
  ];
  const updated = col().update(id, {
    replies,
    status: 'replied',
    readByAdmin: true,
    readByUser: false,
    updatedAt: new Date().toISOString(),
  });

  // 通知提问人
  try {
    notifySvc.notify({
      userId: item.userId,
      type: 'feedback',
      title: '💬 你的留言有回复了',
      body: clean(body, 80),
      link: '#/contact-us',
      meta: { feedbackId: id },
    });
  } catch {
    /* ignore */
  }
  return updated;
}

export function adminClose(id) {
  const item = col().get(id);
  if (!item) throw httpError(404, '会话不存在');
  return col().update(id, { status: 'closed', updatedAt: new Date().toISOString() });
}

export function adminRemove(id) {
  const item = col().get(id);
  if (!item) throw httpError(404, '会话不存在');
  col().remove(id);
  return { deleted: true, id };
}

export default {
  CONTACT_TOPICS,
  submit,
  listMine,
  appendMyMessage,
  myUnreadCount,
  adminList,
  adminStats,
  adminReply,
  adminClose,
  adminRemove,
};
