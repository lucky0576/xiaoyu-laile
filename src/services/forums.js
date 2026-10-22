/**
 * 小鱼来了 — 论坛服务
 *
 * 集合：
 *   forums       板块（由 FORUMS 定义 seeded，存统计字段）
 *   posts        帖子
 *   postComments 帖子回复
 */

import db from '../store/db.js';
import { FORUMS, FORUM_GROUPS, forumBySlug } from '../data/forums.js';
import { hasContact, maskContacts } from '../lib/contact-mask.js';

const POST_TITLE_MAX = 120;
const POST_BODY_MAX = 20000;
const COMMENT_MAX = 2000;

function posts() {
  return db.collection('posts');
}
function postComments() {
  return db.collection('postComments');
}
function forums() {
  return db.collection('forums');
}

/* ------------------------------------------------------------------ */
/* 板块                                                                */
/* ------------------------------------------------------------------ */

/** 幂等初始化：把 FORUMS 写进集合，已有则补字段不覆盖统计 */
export function seedForums() {
  const col = forums();
  let created = 0;
  for (const f of FORUMS) {
    const existing = col.findOne((d) => d.slug === f.slug);
    if (existing) {
      col.update(existing.id, {
        name: f.name,
        icon: f.icon,
        group: f.group,
        order: f.order,
        desc: f.desc,
        tags: f.tags,
      });
    } else {
      col.insert({
        id: db.newId('fm'),
        slug: f.slug,
        name: f.name,
        icon: f.icon,
        group: f.group,
        groupName: FORUM_GROUPS[f.group] || '',
        order: f.order,
        desc: f.desc,
        tags: f.tags || [],
        postCount: 0,
        lastPostAt: '',
        createdAt: new Date().toISOString(),
      });
      created++;
    }
  }
  return created;
}

function recountForum(forumId) {
  const col = forums();
  const f = col.get(forumId);
  if (!f) return null;
  const list = posts().find((p) => p.forumId === forumId && p.status !== 'hidden');
  const latest = list.reduce((acc, p) => (!acc || p.createdAt > acc ? p.createdAt : acc), '');
  return col.update(forumId, {
    postCount: list.length,
    lastPostAt: latest,
  });
}

export function listForums() {
  seedForums();
  const all = forums().all();
  const byOrder = all.slice().sort((a, b) => (a.order || 99) - (b.order || 99));
  const groups = [];
  const seen = {};
  for (const f of byOrder) {
    if (!seen[f.group]) {
      seen[f.group] = {
        key: f.group,
        name: FORUM_GROUPS[f.group] || f.group,
        forums: [],
      };
      groups.push(seen[f.group]);
    }
    seen[f.group].forums.push(publicForum(f));
  }
  return { groups, forums: byOrder.map(publicForum) };
}

export function publicForum(f) {
  if (!f) return null;
  return {
    id: f.id,
    slug: f.slug,
    name: f.name,
    icon: f.icon,
    group: f.group,
    groupName: f.groupName,
    order: f.order,
    desc: f.desc,
    tags: f.tags || [],
    postCount: f.postCount || 0,
    lastPostAt: f.lastPostAt || '',
  };
}

export function getForum(slug) {
  seedForums();
  return forums().findOne((f) => f.slug === String(slug || '').toLowerCase());
}

/* ------------------------------------------------------------------ */
/* 帖子                                                                */
/* ------------------------------------------------------------------ */

function excerpt(text, n = 110) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function postBrief(p, viewer = null) {
  if (!p) return null;
  const masked = maskContacts(`${p.title || ''}\n${p.body || ''}`);
  const showRaw = Boolean(viewer && (viewer.id === p.authorId || viewer.isAdmin));
  return {
    id: p.id,
    forumId: p.forumId,
    forumSlug: p.forumSlug,
    forumName: p.forumName,
    forumIcon: p.forumIcon,
    title: showRaw ? p.title : masked.text.split('\n')[0],
    excerpt: showRaw ? excerpt(p.body) : excerpt(masked.text.split('\n').slice(1).join(' ')),
    authorId: p.authorId,
    authorName: p.authorName,
    authorAvatar: p.authorAvatar || '',
    authorVerified: Boolean(p.authorVerified),
    images: Array.isArray(p.images) ? p.images : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    likeCount: (p.likeUserIds || []).length,
    liked: Boolean(viewer && (p.likeUserIds || []).includes(viewer.id)),
    commentCount: p.commentCount || 0,
    viewCount: p.viewCount || 0,
    pinned: Boolean(p.pinned),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt || p.createdAt,
  };
}

export function postDetail(p, viewer = null) {
  if (!p) return null;
  const masked = maskContacts(p.body || '');
  const showRaw = Boolean(viewer && (viewer.id === p.authorId || viewer.isAdmin));
  const base = postBrief(p, viewer);
  return {
    ...base,
    body: showRaw ? p.body : masked.text,
    contactHidden: !showRaw && masked.count > 0,
  };
}

export function listPosts({ forumSlug, page = 1, pageSize = 20, sort = 'new', viewer = null } = {}) {
  seedForums();
  const f = forumSlug ? getForum(forumSlug) : null;
  if (forumSlug && !f) return { total: 0, page: 1, pageSize, pages: 0, items: [] };

  let list = posts().all().filter((p) => p.status !== 'hidden');
  if (f) list = list.filter((p) => p.forumId === f.id);

  if (sort === 'hot') {
    list.sort((a, b) => {
      const sa = (a.likeUserIds || []).length * 3 + (a.commentCount || 0) * 2 + (a.viewCount || 0);
      const sb = (b.likeUserIds || []).length * 3 + (b.commentCount || 0) * 2 + (b.viewCount || 0);
      return sb - sa;
    });
  } else {
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  const total = list.length;
  const ps = Math.max(1, Math.min(100, Number(pageSize) || 20));
  const pages = Math.ceil(total / ps) || 0;
  const pg = Math.max(1, Math.min(pages || 1, Number(page) || 1));
  const items = list.slice((pg - 1) * ps, pg * ps).map((p) => postBrief(p, viewer));
  return { total, page: pg, pageSize: ps, pages, items, forum: f ? publicForum(f) : null };
}

export function getPost(id) {
  return posts().get(id);
}

export function createPost(user, { forumSlug, title, body, images = [], tags = [] } = {}) {
  seedForums();
  const f = getForum(forumSlug);
  if (!f) {
    const err = new Error('板块不存在');
    err.status = 400;
    err.code = 'bad_forum';
    throw err;
  }
  const t = String(title || '').trim().slice(0, POST_TITLE_MAX);
  const b = String(body || '').trim().slice(0, POST_BODY_MAX);
  if (t.length < 4) {
    const err = new Error('标题至少 4 个字');
    err.status = 400;
    err.code = 'bad_title';
    throw err;
  }
  if (b.length < 4) {
    const err = new Error('内容至少 4 个字');
    err.status = 400;
    err.code = 'bad_body';
    throw err;
  }

  const now = new Date().toISOString();
  const doc = {
    id: db.newId('po'),
    forumId: f.id,
    forumSlug: f.slug,
    forumName: f.name,
    forumIcon: f.icon,
    authorId: user.id,
    authorName: user.nickname || user.realName || '匿名用户',
    authorAvatar: user.avatar || '',
    authorVerified: Boolean(user.verified || (user.verification && user.verification.status === 'approved')),
    title: t,
    body: b,
    images: (Array.isArray(images) ? images : []).slice(0, 9),
    tags: (Array.isArray(tags) ? tags : []).slice(0, 6),
    likeUserIds: [],
    commentCount: 0,
    viewCount: 0,
    pinned: false,
    status: 'published',
    createdAt: now,
    updatedAt: now,
  };
  const saved = posts().insert(doc);
  recountForum(f.id);
  return saved;
}

export function likePost(id, user) {
  const p = posts().get(id);
  if (!p) return null;
  const arr = Array.isArray(p.likeUserIds) ? p.likeUserIds.slice() : [];
  const i = arr.indexOf(user.id);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(user.id);
  const updated = posts().update(id, { likeUserIds: arr });
  return { post: updated, liked: i < 0, likeCount: arr.length };
}

export function bumpView(id) {
  const p = posts().get(id);
  if (!p) return null;
  return posts().bump(id, 'viewCount', 1);
}

export function deletePost(id, user) {
  const p = posts().get(id);
  if (!p) return null;
  if (p.authorId !== user.id && !user.isAdmin) {
    const err = new Error('只能删除自己的帖子');
    err.status = 403;
    err.code = 'forbidden';
    throw err;
  }
  postComments().removeWhere((c) => c.postId === id);
  posts().remove(id);
  recountForum(p.forumId);
  return true;
}

/* ------------------------------------------------------------------ */
/* 回复                                                                */
/* ------------------------------------------------------------------ */

export function listPostComments(postId, viewer = null) {
  return postComments()
    .find((c) => c.postId === postId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((c) => {
      const masked = maskContacts(c.content || '');
      const showRaw = Boolean(viewer && (viewer.id === c.authorId || viewer.isAdmin));
      return {
        id: c.id,
        postId: c.postId,
        authorId: c.authorId,
        authorName: c.authorName,
        authorAvatar: c.authorAvatar || '',
        content: showRaw ? c.content : masked.text,
        createdAt: c.createdAt,
      };
    });
}

export function addPostComment(postId, user, content) {
  const p = posts().get(postId);
  if (!p) return null;
  const text = String(content || '').trim().slice(0, COMMENT_MAX);
  if (text.length < 1) {
    const err = new Error('回复内容不能为空');
    err.status = 400;
    err.code = 'bad_comment';
    throw err;
  }
  const now = new Date().toISOString();
  const doc = {
    id: db.newId('pc'),
    postId,
    authorId: user.id,
    authorName: user.nickname || user.realName || '匿名用户',
    authorAvatar: user.avatar || '',
    content: text,
    createdAt: now,
  };
  const saved = postComments().insert(doc);
  posts().bump(postId, 'commentCount', 1);
  return saved;
}

/** 论坛首页概览：总帖数、今日新帖、活跃板块 */
export function forumOverview() {
  seedForums();
  const all = posts().all().filter((p) => p.status !== 'hidden');
  const today = new Date().toISOString().slice(0, 10);
  const todayPosts = all.filter((p) => String(p.createdAt).slice(0, 10) === today).length;
  const recent = all
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 6)
    .map((p) => postBrief(p));
  return {
    totalPosts: all.length,
    todayPosts,
    totalForums: forums().all().length,
    recent,
  };
}

export default {
  seedForums,
  listForums,
  getForum,
  publicForum,
  listPosts,
  getPost,
  createPost,
  likePost,
  bumpView,
  deletePost,
  listPostComments,
  addPostComment,
  postBrief,
  postDetail,
  forumOverview,
};
