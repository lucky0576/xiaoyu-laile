/**
 * 短视频与直播路由
 */
import { data, fail, str, num, bool, authUser, mustAuth, baseUrl } from './_util.js';
import { httpError } from '../http/app.js';
import feedsSvc from '../services/feeds.js';
import { saveUploads, filePublic } from '../services/files.js';

export default function registerFeedRoutes(app) {
  /* ---------------------------------------------------------------- */
  /* 列表 / 详情                                                       */
  /* ---------------------------------------------------------------- */
  app.get('/api/feeds', (req, res) => {
    const viewer = authUser(req);
    return data(res, {
      items: feedsSvc.listFeeds({
        type: str(req.query.type, 20),
        featured: bool(req.query.featured),
        ownerId: str(req.query.ownerId, 60),
        listingId: str(req.query.listingId, 60),
        limit: num(req.query.limit, 20),
        viewerId: viewer?.id || null,
      }),
    });
  });

  app.get('/api/my/feeds', (req, res) => {
    const user = mustAuth(req);
    return data(res, {
      items: feedsSvc.listFeeds({ ownerId: user.id, limit: 100, viewerId: user.id }),
      stats: feedsSvc.statsFor(user.id),
    });
  });

  app.get('/api/feeds/:id', (req, res) => {
    const viewer = authUser(req);
    const f = feedsSvc.viewFeed(req.params.id);
    return data(res, { feed: feedsSvc.feedPublic(f, viewer?.id || null) });
  });

  /* ---------------------------------------------------------------- */
  /* 发布 / 修改                                                       */
  /* ---------------------------------------------------------------- */
  app.post('/api/feeds', async (req, res) => {
    const user = mustAuth(req);
    const uploaded = await saveUploads(req, { ownerId: user.id, role: 'feed' });
    const feed = await feedsSvc.createFeed({
      user,
      body: {
        type: str(req.body?.type, 20) || 'short',
        title: str(req.body?.title, 80),
        subtitle: str(req.body?.subtitle, 120),
        description: str(req.body?.description, 2000),
        listingId: str(req.body?.listingId, 60),
        fileId: str(req.body?.fileId, 60),
        coverFileId: str(req.body?.coverFileId, 60),
        featured: req.body?.featured === undefined ? true : bool(req.body.featured),
        days: num(req.body?.days, 90),
        // 动态 / 新闻的附加字段
        source: str(req.body?.source, 80),
        author: str(req.body?.author, 40),
        location: str(req.body?.location, 60),
        tags: req.body?.tags,
      },
      files: uploaded,
    });
    return data(res, { feed: feedsSvc.feedPublic(feed, user.id), files: uploaded.map(filePublic) }, 201);
  });

  app.put('/api/feeds/:id', (req, res) => {
    const user = mustAuth(req);
    const feed = feedsSvc.updateFeed(req.params.id, user, req.body || {});
    return data(res, { feed: feedsSvc.feedPublic(feed, user.id) });
  });

  app.del('/api/feeds/:id', (req, res) => {
    const user = mustAuth(req);
    feedsSvc.removeFeed(req.params.id, user);
    return data(res, { ok: true });
  });

  app.post('/api/feeds/:id/like', (req, res) => {
    const user = mustAuth(req);
    const f = feedsSvc.likeFeed(req.params.id, user);
    return data(res, { likes: f.likes, liked: (f.likedBy || []).includes(user.id) });
  });

  app.post('/api/feeds/:id/view', (req, res) => {
    feedsSvc.viewFeed(req.params.id);
    return data(res, { ok: true });
  });

  /* ---------------------------------------------------------------- */
  /* 直播                                                              */
  /* ---------------------------------------------------------------- */
  app.get('/api/feeds/:id/live', async (req, res) => {
    const user = authUser(req);
    return data(res, await feedsSvc.liveInfo(req.params.id, user));
  });

  app.post('/api/feeds/:id/live/start', async (req, res) => {
    const user = mustAuth(req);
    const { feed, meeting } = await feedsSvc.startLive(req.params.id, user, {
      title: str(req.body?.title, 120),
      usePassword: bool(req.body?.usePassword),
    });
    const chatSvc = (await import('../services/chat.js')).default;
    return data(res, {
      feed: feedsSvc.feedPublic(feed, user.id),
      meeting: chatSvc.meetingPublic(meeting, user.id),
    }, 201);
  });

  app.post('/api/feeds/:id/live/end', (req, res) => {
    const user = mustAuth(req);
    const feed = feedsSvc.endLive(req.params.id, user);
    return data(res, { feed: feedsSvc.feedPublic(feed, user.id) });
  });

  app.get('/api/feeds/:id/live/heartbeat', (req, res) => {
    const r = feedsSvc.liveHeartbeat(req.params.id);
    if (!r) throw httpError(404, '内容不存在');
    return data(res, r);
  });

  /* ---------------------------------------------------------------- */
  /* 分享                                                              */
  /* ---------------------------------------------------------------- */
  app.get('/api/feeds/:id/share', (req, res) => {
    const viewer = authUser(req);
    const f = feedsSvc.getFeed(req.params.id);
    const pub = feedsSvc.feedPublic(f, viewer?.id || null);
    const url = `${baseUrl(req)}/#/live/${f.id}`;
    const qr = `${baseUrl(req)}/api/share/qrcode?text=${encodeURIComponent(url)}&size=360`;
    const isLive = f.type === 'live';
    return data(res, {
      kind: isLive ? 'live' : 'short',
      title: f.title,
      desc: f.subtitle || f.description.slice(0, 60),
      url,
      qr,
      imgUrl: pub.coverUrl ? `${baseUrl(req)}${pub.coverUrl}` : `${baseUrl(req)}/static/share-default.png`,
      modes: [
        {
          id: 'image',
          name: '图片 + 文字 + 二维码',
          desc: `生成${isLive ? '直播' : '视频'}邀请卡，适合发微信群、朋友圈`,
          text: `${isLive ? '【直播】' : ''}${f.title}\n${f.subtitle || ''}\n${isLive ? '点击或扫码进入直播间：' : '点击或扫码观看：'}${url}`,
        },
        {
          id: 'link',
          name: '链接 + 标题文字',
          desc: '直接转发链接，微信内自动展示标题与封面',
          text: `${isLive ? '【直播】' : ''}${f.title}\n${f.subtitle || ''}\n${url}`,
        },
      ],
    });
  });
}
