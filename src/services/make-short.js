/**
 * 把任意一条信息做成短视频（没有视频也能做）
 *
 * 用户需求：所有项目都可以制作成短视频 —— 但绝大多数信息只有图片和文字。
 * 所以这里用「封面图 + 标题 + 关键信息」合成竖版视频（不含二维码/联系电话）：
 *
 *   背景：封面图铺满 720x1280（等比放大 + 裁切），压暗一点让文字看得清
 *   上部：分类 / 城市 / 行业小标签
 *   中部：标题（自动折行，最多 4 行）
 *   下部：品牌条「小鱼来了 · 免费发布产业需求」
 *
 * 有视频的信息不走这里（那条路已经在 publish 时自动生成并烧好标题）。
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db from '../store/db.js';
import { config } from '../config.js';
import { httpError } from '../http/app.js';
import { listFiles, looksLikeDocImage, registerStoredFile } from './files.js';
import { ensureCoverForShort, resolveCoverPath } from './cover-auto.js';

const execFileAsync = promisify(execFile);

const W = 720;
const H = 1280;
const DURATION = 12; // 秒（12 秒够看完标题+扫码，编码时间也短）
const FPS = 20;

const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  'C:\\Windows\\Fonts\\msyh.ttc',
];

function cjkFont() {
  for (const p of FONT_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** drawtext 参数里的路径要转义冒号与反斜杠 */
function escPath(p) {
  return String(p).replace(/\\/g, '/').replace(/:/g, '\\:');
}

/** 按字符宽度折行（CJK 算 1 个全宽，英文数字算 0.55） */
function wrapTitle(text, size, maxWidth) {
  const lines = [];
  let cur = '';
  let w = 0;
  for (const ch of String(text || '')) {
    const code = ch.codePointAt(0);
    const cw = code >= 0x2e80 ? size : /[A-Za-z0-9]/.test(ch) ? size * 0.56 : size * 0.34;
    if (w + cw > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
      w = cw;
    } else {
      cur += ch;
      w += cw;
    }
    if (lines.length >= 4) break;
  }
  if (cur && lines.length < 4) lines.push(cur);
  return lines.length ? lines : ['（无标题）'];
}

async function ffmpegOk() {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 找到这条信息能用作底图的图片（跳过证件/名片/营业执照）
 */
function coverImageOf(listing) {
  const records = listFiles(listing.files || []);
  const images = records.filter((f) => f && f.kind === 'image' && !looksLikeDocImage(f));
  const chosen = images[0] || records.find((f) => f && f.kind === 'image');
  return chosen || null;
}

/**
 * 生成视频文件并登记为附件
 * @param {object} p
 * @param {object} p.listing 信息（新闻也能传：只要有 id/title/subtitle/text）
 * @param {object} p.user 发布者
 * @param {string} p.baseUrl 站点地址（保留参数，视频已不含二维码）
 * @param {number} p.seconds 目标时长：5 / 10 / 30（默认 12）
 * @param {boolean} p.voice 是否配旁白（默认 true）
 * @param {string} [p.coverPathOverride] 指定底图本地路径（新闻用封面图时传）
 * @returns {Promise<{record:object, width:number, height:number, duration:number, voiceApplied:boolean}|null>}
 */
export async function renderListingVideo({
  listing,
  user,
  baseUrl = '',
  seconds = DURATION,
  voice = true,
  coverPathOverride = '',
}) {
  if (!listing) return null;
  if (!(await ffmpegOk())) throw httpError(500, '服务器缺少 ffmpeg，暂时无法生成视频');
  const font = cjkFont();
  if (!font) throw httpError(500, '服务器缺少中文字体，暂时无法生成视频');

  const title = String(listing.title || '').trim() || '小鱼来了';
  const cover = coverPathOverride ? { path: coverPathOverride } : coverImageOf(listing);
  if (!cover || !cover.path) {
    throw httpError(400, '这条信息还没有封面图，先在发布页上传一张图片再生成短视频');
  }

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tmpTitle = path.join(os.tmpdir(), `mkts-${stamp}.txt`);
  const tmpOut = path.join(os.tmpdir(), `mkts-${stamp}.mp4`);
  let ttsFile = null;

  /*
   * 视频里不出现联系方式 / 二维码（用户 2026-11 要求）
   *   · 标题、城市行业行、旁白里如果带手机号，统一抹掉
   *   · 不再生成和叠加二维码
   *   · 旁白不再提「扫码」
   */
  const sanitize = (s) =>
    String(s || '')
      .replace(/1[3-9]\d{9}/g, '')
      .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, '')
      .replace(/\b\d{3,4}[-—]\d{7,8}\b/g, '')
      .replace(/扫码[^，。；、]*[，。；、]?/g, '')
      .replace(/二维码[^，。；、]*[，。；、]?/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

  try {
    /* 标题分两段：主标题按 46px 折行，最多 4 行 */
    const videoTitle = sanitize(title) || '小鱼来了';
    const titleLines = wrapTitle(videoTitle, 46, W - 120);
    fs.writeFileSync(tmpTitle, titleLines.join('\n'), 'utf8');

    const cityName = (listing.cities || [])[0];
    const city = typeof cityName === 'string' ? cityName : cityName?.name || '';
    const industry = (listing.industries || [])[0];
    const ind = typeof industry === 'string' ? industry : industry?.name || '';
    const metaLine = sanitize([city, ind].filter(Boolean).join(' · ')) || '小鱼来了 · 产业信息';

    /* ---------- 旁白（不提扫码，不带电话） ---------- */
    let audioDuration = 0;
    let voiceApplied = false;
    if (voice) {
      try {
        const ttsMod = await import('./tts.js');
        const narration = sanitize(
          [videoTitle, metaLine, '上小鱼来了，免费发布产业需求。'].filter(Boolean).join('。'),
        ).replace(/。+/g, '。');
        const t = await ttsMod.synthesize(narration);
        if (t && t.path) {
          ttsFile = t.path;
          audioDuration = t.duration || 0;
          voiceApplied = true;
        }
      } catch {
        /* TTS 不可用就退化成无声视频 */
      }
    }

    /*
     * 时长：至少是用户选的秒数；如果旁白更长，就顺延到旁白结束 +1 秒，
     * 否则语音会被硬切掉半句。
     */
    const target = Math.max(Number(seconds) || DURATION, voiceApplied ? Math.ceil(audioDuration) + 1 : 0);
    const total = Math.min(Math.max(target, 5), 90);

    const filter = [
      // 底图：铺满 + 轻微压暗
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=brightness=-0.08:saturation=0.92[bg]`,
      // 标题（居中偏上）
      `[bg]drawtext=fontfile=${escPath(font)}:textfile=${escPath(tmpTitle)}:fontcolor=white:fontsize=46:line_spacing=16:` +
        `box=1:boxcolor=black@0.42:boxborderw=26:x=(w-text_w)/2:y=h*0.30[withtitle]`,
      // 城市 / 行业 小字
      `[withtitle]drawtext=fontfile=${escPath(font)}:text='${metaLine.replace(/'/g, '')}':fontcolor=white@0.85:fontsize=30:` +
        `x=(w-text_w)/2:y=h*0.30+h*0.20[t2]`,
      // 底部品牌条（无二维码、无联系方式）
      `[t2]drawtext=fontfile=${escPath(font)}:text='小鱼来了 · 免费发布产业需求':fontcolor=white@0.92:fontsize=28:` +
        `box=1:boxcolor=black@0.5:boxborderw=16:x=(w-text_w)/2:y=h-220[out]`,
    ].join(';');

    const args = [
      '-y', '-loglevel', 'error',
      '-loop', '1', '-i', cover.path,
    ];
    if (voiceApplied && ttsFile) {
      args.push('-i', ttsFile);
    } else {
      args.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    }
    args.push(
      '-filter_complex', filter,
      '-map', '[out]', '-map', '1:a',
      '-t', String(total), '-r', String(FPS),
      '-c:v', 'libx264', '-crf', '27', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-threads', '2',
      '-c:a', 'aac', '-b:a', '96k', '-shortest',
      '-movflags', '+faststart', '-f', 'mp4', tmpOut,
    );
    await execFileAsync('ffmpeg', args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });

    if (!fs.existsSync(tmpOut)) throw httpError(500, '视频生成失败');
    const st = fs.statSync(tmpOut);
    if (!st.size) throw httpError(500, '视频生成失败（空文件）');

    const record = await registerStoredFile({
      srcPath: tmpOut,
      name: `项目短视频-${listing.id.slice(-6)}.mp4`,
      mime: 'video/mp4',
      opts: { extract: false, ownerId: user?.id || '', listingId: listing.id },
    });

    return { record, width: W, height: H, duration: total, voiceApplied };
  } finally {
    for (const p of [tmpTitle, tmpOut, ttsFile]) {
      if (!p) continue;
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 给信息生成短视频并创建 feed（同一信息只保留一条自动短视频）
 * @param {object} p
 * @param {object} p.listing
 * @param {object} p.user
 * @param {string} p.baseUrl
 * @param {number} p.seconds 5 / 10 / 30
 * @param {boolean} p.voice 是否配旁白
 */
export async function makeShortForListing({ listing, user, baseUrl = '', seconds = DURATION, voice = true }) {
  const feedsCol = db.collection('feeds');
  const existing = feedsCol.findOne(
    (f) => f.listingId === listing.id && f.type === 'short' && f.autoMade,
  );
  if (existing) {
    return { feed: existing, existed: true, voiceApplied: Boolean(existing.voiceApplied) };
  }

  /*
   * 没有封面就自动配一张 —— 用户要求「生成短视频，如果没有封面，自动配图」。
   * 顺序：已有图片附件 → 已有 coverUrl 对应的本地文件 → 自动配图（网络图 → 本地卡片）
   * 配好后回写 listing.coverUrl / coverFileId，列表页也能看到。
   */
  let coverPath = '';
  const coverCleanup = [];
  const imgRecs = [];
  try {
    for (const id of listing.files || []) {
      const rec = db.collection('files').get(id);
      if (rec && (rec.kind === 'image' || looksLikeDocImage(rec)) && rec.path) imgRecs.push(rec);
    }
  } catch {
    /* ignore */
  }
  if (!imgRecs.length) coverPath = resolveCoverPath(listing.coverUrl, listing.coverFileId);
  if (!coverPath && !imgRecs.length) {
    const gen = await ensureCoverForShort({
      title: listing.title,
      category: listing.category || 'project',
      city: (listing.cities || [])[0] || '',
      industry: (listing.industries || [])[0] || '',
      kindLabel: '',
      ownerId: listing.ownerId,
      refId: listing.id,
    });
    if (gen) {
      // 视频用「无字底图」，封面存「带标题的图」
      coverPath = gen.videoPath || gen.path;
      coverCleanup.push(...(gen.cleanup || []));
      try {
        db.collection('listings').update(listing.id, {
          coverUrl: gen.record.url,
          coverFileId: gen.record.id,
        });
        listing.coverUrl = gen.record.url;
        listing.coverFileId = gen.record.id;
      } catch {
        /* ignore */
      }
    }
  }

  let made = null;
  try {
    made = await renderListingVideo({
      listing,
      user,
      baseUrl,
      seconds,
      voice,
      coverPathOverride: coverPath,
    });
  } finally {
    for (const p of coverCleanup) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
  if (!made) throw httpError(500, '视频生成失败');

  const feedsSvc = await import('./feeds.js');
  const feed = await feedsSvc.createFeed({
    user,
    body: {
      type: 'short',
      title: String(listing.title || '').slice(0, 80) || '项目短视频',
      subtitle: String(listing.subtitle || '').slice(0, 120),
      description: String(listing.text || '').slice(0, 300),
      listingId: listing.id,
      coverFileId: '',
      tags: ['项目视频', 'AI生成'],
      featured: true,
    },
    files: [made.record],
  });
  feedsCol.update(feed.id, {
    autoMade: true,
    autoMadeAt: new Date().toISOString(),
    voiceApplied: Boolean(made.voiceApplied),
    durationSec: made.duration,
  });
  return { feed, existed: false, voiceApplied: Boolean(made.voiceApplied), duration: made.duration };
}

/**
 * 新闻资讯 → 短视频
 *
 * 和项目的区别：
 *   · 素材是 news（title/summary/text/coverUrl/attachments）
 *   · 视频里不出现二维码和联系方式
 *   · 封面优先用资讯自己的封面图；没有就本地生成一张资讯卡片
 */
export async function makeShortFromNews({ news, user, baseUrl = '', seconds = 10, voice = true }) {
  if (!news) throw httpError(404, '资讯不存在');
  const feedsCol = db.collection('feeds');
  const existing = feedsCol.findOne((f) => f.newsId === news.id && f.type === 'short' && f.autoMade);
  if (existing) return { feed: existing, existed: true, voiceApplied: Boolean(existing.voiceApplied) };

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let coverPath = '';
  const tmpCover = [];
  try {
    /* 1. 资讯自己的封面图（本地文件或外链） */
    coverPath = resolveCoverPath(news.coverUrl, '');
    const coverUrl = String(news.coverUrl || '').trim();
    if (!coverPath && coverUrl && /^https?:\/\//i.test(coverUrl)) {
      // 外链封面：下载到临时文件
      try {
        const res = await fetch(coverUrl, { signal: AbortSignal.timeout(20000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const p = path.join(os.tmpdir(), `newscov-${stamp}.img`);
          fs.writeFileSync(p, buf);
          coverPath = p;
          tmpCover.push(p);
        }
      } catch {
        /* ignore */
      }
    }

    /*
     * 2. 没有封面：自动配图（网络图优先，失败用本地卡片）
     *    配好的图会登记为文件并回写 news.coverUrl，资讯列表/详情也能看到。
     */
    if (!coverPath) {
      const gen = await ensureCoverForShort({
        title: news.title,
        category: 'news',
        city: '',
        industry: '',
        kindLabel: '资讯',
        ownerId: news.authorId || '',
        refId: news.id,
      });
      if (gen) {
        coverPath = gen.videoPath || gen.path;
        tmpCover.push(...(gen.cleanup || []));
        try {
          db.collection('news').update(news.id, {
            coverUrl: gen.record.url,
            coverFileId: gen.record.id,
          });
          news.coverUrl = gen.record.url;
        } catch {
          /* ignore */
        }
      }
    }
    if (!coverPath) throw httpError(500, '没有可用封面，自动配图也失败了');

    const qrText = `${String(baseUrl || 'https://xiaoyulaile.online').replace(/\/+$/, '')}/#/news/${news.id}`;
    const made = await renderListingVideo({
      listing: {
        id: news.id,
        title: news.title,
        subtitle: news.summary || '',
        text: news.text || '',
        files: [],
      },
      user,
      baseUrl,
      seconds,
      voice,
      coverPathOverride: coverPath,
    });
    if (!made) throw httpError(500, '视频生成失败');

    const feedsSvc = await import('./feeds.js');
    const feed = await feedsSvc.createFeed({
      user,
      body: {
        type: 'short',
        title: String(news.title || '').slice(0, 80) || '资讯短视频',
        subtitle: String(news.summary || '').slice(0, 120),
        description: String(news.text || '').slice(0, 300),
        coverFileId: '',
        tags: ['资讯视频', 'AI生成'],
        featured: true,
      },
      files: [made.record],
    });
    feedsCol.update(feed.id, {
      autoMade: true,
      autoMadeAt: new Date().toISOString(),
      newsId: news.id,
      voiceApplied: Boolean(made.voiceApplied),
      durationSec: made.duration,
    });
    return { feed, existed: false, voiceApplied: Boolean(made.voiceApplied), duration: made.duration };
  } finally {
    for (const p of tmpCover) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

export default { renderListingVideo, makeShortForListing, makeShortFromNews };
