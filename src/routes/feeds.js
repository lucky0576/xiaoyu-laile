/**
 * 短视频与直播路由
 */
import { data, fail, str, num, bool, authUser, mustAuth, baseUrl, queryOf } from './_util.js';
import { httpError } from '../http/app.js';
import feedsSvc from '../services/feeds.js';
import { importVideoFromUrl } from '../services/video-import.js';
import fs from 'node:fs';
import { saveUploads, filePublic, deleteFile } from '../services/files.js';

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

  /* ---------------- 管理员：从网址导入短视频 ---------------- */

  app.post('/api/admin/feeds/import', async (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '只有管理员可以操作', 403, 'forbidden');

    const url = str(req.body?.url, 2000);
    if (!url) return fail(res, '请填写视频地址', 400, 'empty');

    // 先抓视频并登记成文件
    const { file, sourceUrl } = await importVideoFromUrl(url, { ownerId: user.id });

    // 标题：没填就用文件名，或用 AI 生成
    let title = str(req.body?.title, 80);
    if (!title) {
      try {
        const p = new URL(sourceUrl).pathname.split('/').pop() || '';
        title = decodeURIComponent(p).replace(/\.[^.]+$/, '').slice(0, 60);
      } catch {
        title = '';
      }
    }
    if (!title) title = '网上获取的短视频';

    const feed = await feedsSvc.createFeed({
      user,
      body: {
        type: 'short',
        title,
        subtitle: str(req.body?.subtitle, 120) || '来源：' + (() => {
          try { return new URL(sourceUrl).hostname; } catch { return '网络'; }
        })(),
        description: str(req.body?.description, 2000),
        fileId: file.id,
        coverFileId: '',
        featured: bool(req.body?.featured),
        days: num(req.body?.days, 365),
        source: 'import',
        author: str(req.body?.author, 40) || '小鱼来了',
      },
      files: [file],
    });

    return data(res, { feed: feedsSvc.feedPublic(feed, user.id), sourceUrl }, 201);
  });

  /* ---------------- 管理员：短视频管理 ---------------- */

  app.get('/api/admin/feeds', (req, res) => {
    const user = mustAuth(req);
    if (!user.isAdmin) return fail(res, '只有管理员可以访问', 403, 'forbidden');
    const list = feedsSvc.adminListFeeds({
      type: str(req.query.type, 20),
      q: str(req.query.q, 40),
      limit: num(req.query.limit, 200),
    });
    return data(res, {
      items: list,
      total: list.length,
      removed: list.filter((x) => x.status === 'removed').length,
    });
  });

  app.post('/api/admin/feeds/:id/takedown', (req, res) => {
    const user = mustAuth(req);
    const f = feedsSvc.setFeedStatus(req.params.id, 'removed', user);
    return data(res, { feed: feedsSvc.feedPublic(f, user.id), status: 'removed' });
  });

  app.post('/api/admin/feeds/:id/restore', (req, res) => {
    const user = mustAuth(req);
    const f = feedsSvc.setFeedStatus(req.params.id, 'published', user);
    return data(res, { feed: feedsSvc.feedPublic(f, user.id), status: 'published' });
  });

  app.get('/api/feeds/:id', (req, res) => {
    const viewer = authUser(req);
    const f = feedsSvc.viewFeed(req.params.id, viewer);
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

  /* 收藏 / 取消收藏 */
  app.post('/api/feeds/:id/favorite', (req, res) => {
    const user = mustAuth(req);
    const f = feedsSvc.favoriteFeed(req.params.id, user);
    const favorited = (f.favoritedBy || []).includes(user.id);
    return data(res, {
      favorited,
      count: f.favorites || 0,
      feed: feedsSvc.feedPublic(f, user),
    });
  });

  /* 我收藏的 */
  app.get('/api/favorites', (req, res) => {
    const user = mustAuth(req);
    const q = queryOf(req);
    const list = feedsSvc.listFavorites(user.id, { type: String(q.type || '') });
    return data(res, {
      items: list.map((f) => feedsSvc.feedPublic(f, user)),
      total: list.length,
    });
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

  /** 短视频 / 直播：根据视频元信息 + 用户描述生成标题 */
  app.post('/api/feeds/ai-title', async (req, res) => {
    const user = authUser(req);
    if (!user) return fail(res, '请先登录', 401, 'login_required');

    const filename = str(req.body?.filename, 200);
    const durationSec = Math.max(0, Math.min(36000, num(req.body?.durationSec, 0)));
    const width = Math.max(0, Math.min(20000, num(req.body?.width, 0)));
    const height = Math.max(0, Math.min(20000, num(req.body?.height, 0)));
    const hint = str(req.body?.text, 2000);
    const industry = str(req.body?.industry, 40);
    const kind = String(req.body?.kind) === 'live' ? 'live' : 'short';

    // 前端抽的画面帧（data URL），交给视觉模型识别
    const frames = Array.isArray(req.body?.frames)
      ? req.body.frames.filter((x) => typeof x === 'string' && (x.startsWith('data:image') || x.startsWith('http'))).slice(0, 4)
      : [];
    const transcript = str(req.body?.transcript, 4000);

    // 拼一段「可读的视频描述」给 AI：模型只有文本能力，
    // 所以把能解析到的客观信息 + 用户描述一起交给它
    const parts = [];
    parts.push(kind === 'live' ? '这是一场即将开始的直播。' : '这是一条上传的短视频。');
    if (filename) parts.push(`视频文件名：${filename}`);
    if (durationSec) {
      const m = Math.floor(durationSec / 60);
      const s = Math.round(durationSec % 60);
      parts.push(`视频时长：${m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`}`);
    }
    if (width && height) parts.push(`视频分辨率：${width}×${height}`);
    if (industry) parts.push(`所属行业：${industry}`);
    if (hint) parts.push(`发布者补充说明：${hint}`);
    // 视觉识别：把画面内容也交给 AI
    let visionText = '';
    let visionNote = '';
    if (frames.length) {
      try {
        const aiMod = await import('../services/ai.js');
        const v = await aiMod.visionDescribe({ images: frames });
        if (v.ok) {
          visionText = v.text;
          parts.push(`视频画面内容（视觉识别）：\n${visionText}`);
        } else {
          visionNote = v.note || '';
        }
      } catch (err) {
        visionNote = err.message;
      }
    }
    if (transcript) parts.push(`视频语音内容（转写）：\n${transcript}`);

    const text = parts.join('\n');

    try {
      const ai = (await import('../services/ai.js')).default;
      const out = await ai.generateTitles({
        text,
        filename,
        categoryName: kind === 'live' ? '直播' : '短视频',
      });
      return data(res, {
        title: out.title || '',
        subtitle: out.subtitle || '',
        keywords: out.keywords || [],
        alternatives: out.alternatives || [],
        source: out.source || 'local',
        note: out.note || '',
        parsed: {
          filename,
          durationSec,
          width,
          height,
          frames: frames.length,
          vision: visionText || '',
          visionNote: visionNote || '',
          transcript: transcript || '',
        },
      });
    } catch (err) {
      return fail(res, `标题生成失败：${err.message}`, 500, 'ai_failed');
    }
  });

  /** 短视频音频转文字（硅基流动 SenseVoice） */
  app.post('/api/feeds/transcribe', async (req, res) => {
    const user = authUser(req);
    if (!user) return fail(res, '请先登录', 401, 'login_required');

    const uploaded = await saveUploads(req, { ownerId: user.id });
    if (!uploaded.length) return fail(res, '没有收到音频', 400, 'no_audio');
    const f = uploaded[0];
    if (f.kind !== 'audio' && f.kind !== 'video') {
      return fail(res, '请上传音频文件', 400, 'bad_type');
    }
    let buf;
    try {
      buf = fs.readFileSync(f.path);
    } catch (err) {
      return fail(res, `读取音频失败：${err.message}`, 500, 'read_failed');
    }
    try {
      const aiMod = await import('../services/ai.js');
      const out = await aiMod.speechToText(buf, f.name || 'audio.wav');
      // 转写完就删掉临时音频，不留垃圾
      try { deleteFile(f.id); } catch { /* ignore */ }
      if (!out.ok) return data(res, { text: '', note: out.note || '转写失败' });
      return data(res, { text: out.text });
    } catch (err) {
      return fail(res, `转写失败：${err.message}`, 500, 'asr_failed');
    }
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
