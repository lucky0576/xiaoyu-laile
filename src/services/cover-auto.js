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
 *   1. 网络图片（photo-cover：Wikimedia 检索 + 排版）—— 好看，但依赖外网
 *   2. 本地渐变卡片（cover.js + ffmpeg）—— 一定成功
 *
 * @param {object} p
 * @param {string} p.title
 * @param {string} [p.category] 用于卡片配色
 * @param {string} [p.city]
 * @param {string} [p.industry]
 * @param {string} [p.kindLabel]
 * @param {string} [p.ownerId]
 * @param {string} [p.refId]   关联 id（listingId / newsId）
 * @returns {Promise<{record:object, path:string}|null>}
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

  /* 1) 先试网络配图 */
  try {
    const photoMod = await import('./photo-cover.js');
    const rec = await photoMod.generatePhotoCover(
      { title: t, category, city, industry, kindLabel, categoryName: '' },
      { ownerId, listingId: refId },
    );
    if (rec && rec.path && fs.existsSync(rec.path)) return { record: rec, path: rec.path };
  } catch {
    /* 网络不通就走本地卡片 */
  }

  /* 2) 本地渐变卡片 */
  try {
    const svg = makeCoverSvg({ title: t, category, city, industry, kindLabel });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const svgPath = path.join(os.tmpdir(), `shortcov-${stamp}.svg`);
    const pngPath = path.join(os.tmpdir(), `shortcov-${stamp}.png`);
    fs.writeFileSync(svgPath, svg, 'utf8');
    let srcPath = svgPath;
    let name = `${t.slice(0, 20)}-配图.png`;
    let mime = 'image/png';
    try {
      await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', svgPath, '-frames:v', '1', pngPath], {
        timeout: 30000,
      });
      if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) srcPath = pngPath;
    } catch {
      name = `${t.slice(0, 20)}-配图.svg`;
      mime = 'image/svg+xml';
    }
    const rec = await registerStoredFile({
      srcPath,
      name,
      mime,
      opts: { ownerId, listingId: refId, role: 'auto-cover', extract: false },
    });
    for (const p of [svgPath, pngPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
    if (rec && rec.path && fs.existsSync(rec.path)) return { record: rec, path: rec.path };
  } catch (err) {
    console.warn('[cover] 短视频配图失败:', err.message);
  }
  return null;
}
