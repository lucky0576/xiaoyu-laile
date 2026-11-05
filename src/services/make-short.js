/**
 * 把任意一条信息做成短视频（没有视频也能做）
 *
 * 用户需求：所有项目都可以制作成短视频 —— 但绝大多数信息只有图片和文字。
 * 所以这里用「封面图 + 标题 + 关键信息 + 二维码」合成 15 秒竖版视频：
 *
 *   背景：封面图铺满 720x1280（等比放大 + 裁切），压暗一点让文字看得清
 *   上部：分类 / 城市 / 行业小标签
 *   中部：标题（自动折行，最多 4 行）
 *   下部：二维码 + 「扫码查看项目详情」
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
import { qrToPng } from '../lib/qrcode.js';

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
 * @returns {Promise<{record:object, width:number, height:number, duration:number}|null>}
 */
export async function renderListingVideo({ listing, user, baseUrl = '' }) {
  if (!listing) return null;
  if (!(await ffmpegOk())) throw httpError(500, '服务器缺少 ffmpeg，暂时无法生成视频');
  const font = cjkFont();
  if (!font) throw httpError(500, '服务器缺少中文字体，暂时无法生成视频');

  const title = String(listing.title || '').trim() || '小鱼来了';
  const cover = coverImageOf(listing);
  if (!cover || !cover.path) {
    throw httpError(400, '这条信息还没有封面图，先在发布页上传一张图片再生成短视频');
  }

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tmpTitle = path.join(os.tmpdir(), `mkts-${stamp}.txt`);
  const tmpQr = path.join(os.tmpdir(), `mkts-${stamp}-qr.png`);
  const tmpOut = path.join(os.tmpdir(), `mkts-${stamp}.mp4`);

  try {
    /* 标题分两段：主标题按 46px 折行，最多 4 行 */
    const titleLines = wrapTitle(title, 46, W - 120);
    fs.writeFileSync(tmpTitle, titleLines.join('\n'), 'utf8');

    /* 二维码：指向这条信息的分享页 */
    const qrText = baseUrl ? `${String(baseUrl).replace(/\/+$/, '')}/s/${listing.id}` : `xiaoyulaile.online/s/${listing.id}`;
    const qrBuf = qrToPng(qrText, { ecc: 'M', margin: 2, scale: 10 });
    fs.writeFileSync(tmpQr, qrBuf);

    const cityName = (listing.cities || [])[0];
    const city = typeof cityName === 'string' ? cityName : cityName?.name || '';
    const industry = (listing.industries || [])[0];
    const ind = typeof industry === 'string' ? industry : industry?.name || '';
    const metaLine = [city, ind].filter(Boolean).join(' · ') || '小鱼来了 · 产业信息';

    const filter = [
      // 底图：铺满 + 轻微压暗
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=brightness=-0.08:saturation=0.92[bg]`,
      // 标题（居中偏上）
      `[bg]drawtext=fontfile=${escPath(font)}:textfile=${escPath(tmpTitle)}:fontcolor=white:fontsize=46:line_spacing=16:` +
        `box=1:boxcolor=black@0.42:boxborderw=26:x=(w-text_w)/2:y=h*0.30[withtitle]`,
      // 城市 / 行业 小字
      `[withtitle]drawtext=fontfile=${escPath(font)}:text='${metaLine.replace(/'/g, '')}':fontcolor=white@0.85:fontsize=30:` +
        `x=(w-text_w)/2:y=h*0.30+h*0.20[t2]`,
      // 底部品牌条
      `[t2]drawtext=fontfile=${escPath(font)}:text='小鱼来了 · 免费发布产业需求':fontcolor=white@0.9:fontsize=30:` +
        `box=1:boxcolor=black@0.45:boxborderw=18:x=(w-text_w)/2:y=h-210[t3]`,
      // 二维码缩放后叠加在底部中间
      `[1:v]scale=200:200[qr]`,
      `[t3][qr]overlay=(W-w)/2:H-h-70:format=auto[out]`,
    ].join(';');

    await execFileAsync(
      'ffmpeg',
      [
        '-y', '-loglevel', 'error',
        '-loop', '1', '-i', cover.path,
        '-i', tmpQr,
        '-f', 'lavfi', '-t', String(DURATION), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-filter_complex', filter,
        '-map', '[out]', '-map', '2:a',
        '-t', String(DURATION), '-r', String(FPS),
        '-c:v', 'libx264', '-crf', '27', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-threads', '2',
        '-c:a', 'aac', '-b:a', '96k', '-shortest',
        '-movflags', '+faststart', '-f', 'mp4', tmpOut,
      ],
      { timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
    );

    if (!fs.existsSync(tmpOut)) throw httpError(500, '视频生成失败');
    const st = fs.statSync(tmpOut);
    if (!st.size) throw httpError(500, '视频生成失败（空文件）');

    const record = await registerStoredFile({
      srcPath: tmpOut,
      name: `项目短视频-${listing.id.slice(-6)}.mp4`,
      mime: 'video/mp4',
      opts: { extract: false, ownerId: user?.id || '', listingId: listing.id },
    });

    return { record, width: W, height: H, duration: DURATION };
  } finally {
    for (const p of [tmpTitle, tmpQr, tmpOut]) {
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
 */
export async function makeShortForListing({ listing, user, baseUrl = '' }) {
  const feedsCol = db.collection('feeds');
  const existing = feedsCol.findOne(
    (f) => f.listingId === listing.id && f.type === 'short' && f.autoMade,
  );
  if (existing) {
    return { feed: existing, existed: true };
  }

  const made = await renderListingVideo({ listing, user, baseUrl });
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
  feedsCol.update(feed.id, { autoMade: true, autoMadeAt: new Date().toISOString() });
  return { feed, existed: false };
}

export default { renderListingVideo, makeShortForListing };
