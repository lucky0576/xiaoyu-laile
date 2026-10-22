/**
 * 小鱼来了 — 论坛路由
 *
 * 板块列表 / 帖子列表 / 帖子详情 / 发帖 / 点赞 / 回复 / 删除
 */

import { data, fail, str, num, list, authUser, mustAuth, rateLimit, clientIp } from './_util.js';
import { httpError } from '../http/app.js';
import forumsSvc from '../services/forums.js';
import { saveUploads, filePublic } from '../services/files.js';

export default function registerForumRoutes(app) {
  /* ---------------------------------------------------------------- */
  /* 板块                                                              */
  /* ---------------------------------------------------------------- */
  app.get('/api/forums', (req, res) => {
    return data(res, forumsSvc.listForums());
  });

  app.get('/api/forums/overview', (req, res) => {
    const viewer = authUser(req);
    const ov = forumsSvc.forumOverview();
    return data(res, {
      ...ov,
      recent: ov.recent.map((p) => forumsSvc.postBrief(forumsSvc.getPost(p.id), viewer)),
    });
  });

  /* ---------------------------------------------------------------- */
  /* 帖子列表                                                          */
  /* ---------------------------------------------------------------- */
  app.get('/api/forums/:slug/posts', (req, res) => {
    const viewer = authUser(req);
    const result = forumsSvc.listPosts({
      forumSlug: req.params.slug,
      page: num(req.query.page, 1),
      pageSize: num(req.query.pageSize, 20),
      sort: str(req.query.sort, 10) || 'new',
      viewer,
    });
    if (!result.forum && req.params.slug !== 'all') {
      return fail(res, '板块不存在', 404, 'not_found');
    }
    return data(res, result);
  });

  /* ---------------------------------------------------------------- */
  /* 帖子详情                                                          */
  /* ---------------------------------------------------------------- */
  app.get('/api/posts/:id', (req, res) => {
    const viewer = authUser(req);
    const p = forumsSvc.getPost(req.params.id);
    if (!p || p.status === 'hidden') return fail(res, '帖子不存在', 404, 'not_found');
    forumsSvc.bumpView(p.id);
    return data(res, {
      post: forumsSvc.postDetail(p, viewer),
      comments: forumsSvc.listPostComments(p.id, viewer),
    });
  });

  /* ---------------------------------------------------------------- */
  /* 发帖                                                              */
  /* ---------------------------------------------------------------- */
  app.post('/api/posts', async (req, res) => {
    const user = mustAuth(req);

    const rl = rateLimit(`post:${user.id}`, 10, 60_000);
    if (!rl.ok) return fail(res, `发帖过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const saved = await saveUploads(req, { ownerId: user.id, role: 'post' });
    const b = req.body || {};

    const result = forumsSvc.createPost(user, {
      forumSlug: str(b.forumSlug, 40),
      title: str(b.title, 200),
      body: str(b.body, 24000),
      images: saved.map((f) => f.id),
      tags: list(b.tags),
    });

    return data(res, {
      post: forumsSvc.postDetail(result, user),
      files: saved.map(filePublic),
    }, 201);
  });

  /* ---------------------------------------------------------------- */
  /* 点赞                                                              */
  /* ---------------------------------------------------------------- */
  app.post('/api/posts/:id/like', (req, res) => {
    const user = mustAuth(req);
    const r = forumsSvc.likePost(req.params.id, user);
    if (!r) return fail(res, '帖子不存在', 404, 'not_found');
    return data(res, { liked: r.liked, likeCount: r.likeCount });
  });

  /* ---------------------------------------------------------------- */
  /* 回复                                                              */
  /* ---------------------------------------------------------------- */
  app.get('/api/posts/:id/comments', (req, res) => {
    const viewer = authUser(req);
    const p = forumsSvc.getPost(req.params.id);
    if (!p) return fail(res, '帖子不存在', 404, 'not_found');
    return data(res, { items: forumsSvc.listPostComments(p.id, viewer) });
  });

  app.post('/api/posts/:id/comments', (req, res) => {
    const user = mustAuth(req);
    const rl = rateLimit(`pc:${user.id}:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) return fail(res, `回复过于频繁，请 ${rl.retryAfter} 秒后再试`, 429, 'rate_limited');

    const p = forumsSvc.getPost(req.params.id);
    if (!p) return fail(res, '帖子不存在', 404, 'not_found');

    const saved = forumsSvc.addPostComment(p.id, user, str(req.body?.content, 2000));
    return data(res, { comment: saved }, 201);
  });

  /* ---------------------------------------------------------------- */
  /* 删除                                                              */
  /* ---------------------------------------------------------------- */
  app.del('/api/posts/:id', (req, res) => {
    const user = mustAuth(req);
    try {
      const ok = forumsSvc.deletePost(req.params.id, user);
      if (!ok) return fail(res, '帖子不存在', 404, 'not_found');
      return data(res, { deleted: true });
    } catch (err) {
      if (err.status) return fail(res, err.message, err.status, err.code);
      throw err;
    }
  });

  return app;
}
