/**
 * 保证「每条已发布信息都有配图」
 *
 * 背景：用户要求「项目所有发布后都要配图」。
 *   现状是三道：
 *     1) 发布页有图就用图（最好）
 *     2) 没图时前端调 AI 生成配图（依赖网络/接口，会失败）
 *     3) 再不行就没有封面 —— 列表里是空白占位，观感差
 *
 * 这里补第 4 道，也是最后一道：**本地合成**。
 *   · 用 cover.js 的渐变卡片 SVG（标题 + 分类 + 城市/行业 + 品牌）
 *   · ffmpeg 渲染成 PNG（不依赖任何外部服务，不会失败）
 *   · 登记为文件记录，回写 listing.coverUrl / coverFileId
 *
 * 调用时机：
 *   · 发布成功后异步跑一次（不阻塞发布）
 *   · 后台批量补图接口（历史数据）
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db from '../store/db.js';
import { makeCoverSvg } from './cover.js';
import { registerStoredFile } from './files.js';
import listingsSvc from './listings.js';

const execFileAsync = promisify(execFile);

const listings = () => db.collection('listings');

function hasCover(l) {
  if (!l) return true;
  if (l.coverUrl) return true;
  // 有真实图片附件也算有封面（列表会回落到第一张图）
  try {
    const recs = (l.files || []).map((id) => db.collection('files').get(id)).filter(Boolean);
    return recs.some((f) => f.kind === 'image');
  } catch {
    return false;
  }
}

/**
 * 给一条信息生成并写入本地合成封面。
 * @returns {Promise<{ok:boolean, coverUrl?:string, reason?:string}>}
 */
export async function ensureCover(listing, { force = false } = {}) {
  try {
    if (!listing || !listing.id) return { ok: false, reason: 'no_listing' };
    if (!force && hasCover(listing)) return { ok: true, skipped: true };

    const city = (listing.cities || [])[0];
    const industry = (listing.industries || [])[0];
    const svg = makeCoverSvg({
      title: listing.title || '小鱼来了',
      category: listing.category,
      city: typeof city === 'string' ? city : city?.name || '',
      industry: typeof industry === 'string' ? industry : industry?.name || '',
      kindLabel: listing.typeName || '',
    });

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const svgPath = path.join(os.tmpdir(), `cover-${stamp}.svg`);
    const pngPath = path.join(os.tmpdir(), `cover-${stamp}.png`);
    fs.writeFileSync(svgPath, svg, 'utf8');

    let srcPath = svgPath;
    let name = `${String(listing.title || '封面').slice(0, 20)}-封面.png`;
    let mime = 'image/png';
    try {
      await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', svgPath, '-frames:v', '1', pngPath], {
        timeout: 30000,
      });
      if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
        srcPath = pngPath;
      } else {
        // 渲染失败就用 SVG 兜底（浏览器能显示）
        name = `${String(listing.title || '封面').slice(0, 20)}-封面.svg`;
        mime = 'image/svg+xml';
      }
    } catch {
      name = `${String(listing.title || '封面').slice(0, 20)}-封面.svg`;
      mime = 'image/svg+xml';
    }

    const rec = await registerStoredFile({
      srcPath,
      name,
      mime,
      opts: {
        ownerId: listing.ownerId || '',
        listingId: listing.id,
        role: 'auto-cover',
        extract: false,
      },
    });
    // registerStoredFile 会把文件移走，临时文件可能已不存在，忽略清理错误
    for (const p of [svgPath, pngPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }

    listings().update(listing.id, { coverUrl: rec.url, coverFileId: rec.id });
    db.collection('files').update(rec.id, { listingId: listing.id });
    return { ok: true, coverUrl: rec.url, coverFileId: rec.id, kind: mime };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * 批量补图：给没有封面的已发布信息生成。
 * @param {{limit?:number}} opts
 */
export async function ensureAllCovers({ limit = 50 } = {}) {
  const all = listings().all().filter((l) => l.status === 'published');
  const need = all.filter((l) => !hasCover(l)).slice(0, limit);
  let ok = 0;
  const fails = [];
  for (const l of need) {
    const r = await ensureCover(l);
    if (r.ok) ok += 1;
    else fails.push({ id: l.id, reason: r.reason });
  }
  return {
    total: all.length,
    missingBefore: need.length,
    filled: ok,
    failed: fails.slice(0, 5),
    remaining: Math.max(0, all.filter((l) => !hasCover(l)).length),
  };
}

export default { ensureCover, ensureAllCovers, ensureCoverForShort, resolveCoverPath };

/* ================================================================== */
/* 短视频用：没封面时自动配一张                                        */
/* ================================================================== */

/**
 * 从 coverUrl / coverFileId 找到磁盘上的真实路径。
 * 列表/资讯里存的是 URL，用 ffmpeg 当底图需要绝对路径。
 */
export function resolveCoverPath(coverUrl, coverFileId) {
  try {
    const files = db.collection('files');
    if (coverFileId) {
      const rec = files.get(coverFileId);
      if (rec && rec.path && fs.existsSync(rec.path)) return rec.path;
    }
    const url = String(coverUrl || '').trim();
    if (url) {
      const rec = files.findOne((f) => f && f.url === url);
      if (rec && rec.path && fs.existsSync(rec.path)) return rec.path;
    }
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * 给「没有封面」的内容自动配一张图，用于生成短视频。
 *
 * 顺序：
 *   1. 网络图片（photo-cover 的 plain 模式：只有干净照片，不烧文字）
 *   2. 本地渐变卡片（cover.js + ffmpeg）—— 一定成功
 *
 * 为什么短视频要 plain 版：
 *   普通封面会把标题烧进图里，视频自己又画一遍标题 → 满屏重复的字。
 *   所以配图分两份：
 *     · record  —— 存成内容的封面（带标题，列表/详情好看）
 *     · videoPath —— 视频底图（无字的照片，或纯色底板），已被转成 720×1280 竖版
 *
 * @returns {Promise<{record:object, path:string, videoPath:string, cleanup:string[]}|null>}
 */
export async function ensureCoverForShort({
  title,
  category = 'project',
  city = '',
  industry = '',
  kindLabel = '',
  ownerId = '',
  refId = '',
} = {}) {
  const t = String(title || '').trim();
  if (!t) return null;

  const cleanup = [];
  const W = 720;
  const H = 1280;

  /* 把任意图转成竖版底图：铺满裁切（不留大块模糊带），并统一色调 */
  const toPortrait = async (srcPath) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const out = path.join(os.tmpdir(), `shortbg-${stamp}.png`);
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-loglevel',
          'error',
          '-i',
          srcPath,
          '-vf',
          `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},eq=saturation=0.92:contrast=1.04`,
          '-frames:v',
          '1',
          out,
        ],
        { timeout: 45000 },
      );
      if (fs.existsSync(out) && fs.statSync(out).size > 3000) {
        cleanup.push(out);
        return out;
      }
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(out);
    } catch {
      /* ignore */
    }
    return '';
  };

  /* 1) 网络配图（plain，不带字） */
  try {
    const photoMod = await import('./photo-cover.js');
    const rec = await photoMod.generatePhotoCover(
      { title: t, category, city, industry, kindLabel, categoryName: '' },
      { ownerId, listingId: refId, plain: true },
    );
    if (rec && rec.path && fs.existsSync(rec.path)) {
      const videoPath = (await toPortrait(rec.path)) || rec.path;
      return { record: rec, path: rec.path, videoPath, cleanup };
    }
  } catch {
    /* 网络不通就走本地卡片 */
  }

  /* 2) 本地渐变卡片（带标题，作为封面） */
  let record = null;
  let coverPath = '';
  try {
    const svg = makeCoverSvg({ title: t, category, city, industry, kindLabel });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const svgPath = path.join(os.tmpdir(), `shortcov-${stamp}.svg`);
    const pngPath = path.join(os.tmpdir(), `shortcov-${stamp}.png`);
    fs.writeFileSync(svgPath, svg, 'utf8');
    try {
      await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', svgPath, '-frames:v', '1', pngPath], {
        timeout: 30000,
      });
    } catch {
      /* ignore */
    }
    const srcPath = fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0 ? pngPath : svgPath;
    record = await registerStoredFile({
      srcPath,
      name: `${t.slice(0, 20)}-配图${srcPath.endsWith('.svg') ? '.svg' : '.png'}`,
      mime: srcPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
      opts: { ownerId, listingId: refId, role: 'auto-cover', extract: false },
    });
    coverPath = record?.path || '';
    for (const p of [svgPath, pngPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn('[cover] 短视频配图失败:', err.message);
  }

  /* 3) 视频底图：卡片带标题会重复，改用纯品牌色底板 */
  let videoPath = '';
  try {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const bg = path.join(os.tmpdir(), `shortplain-${stamp}.png`);
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x0B2A4A:s=${W}x${H}`,
        '-frames:v',
        '1',
        bg,
      ],
      { timeout: 30000 },
    );
    if (fs.existsSync(bg) && fs.statSync(bg).size > 1000) {
      cleanup.push(bg);
      videoPath = bg;
    }
  } catch {
    /* ignore */
  }

  if (record && record.path) {
    return { record, path: record.path, videoPath: videoPath || record.path, cleanup };
  }
  return null;
}
