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

export default { ensureCover, ensureAllCovers };
