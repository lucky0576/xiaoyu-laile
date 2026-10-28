/**
 * 小鱼来了 — 图片缩略图
 *
 * 问题：列表卡片只显示 150~350px 宽，却直接加载上传原图
 * （实测有 900×1600 / 232KB 的），首页 30 多张图加起来 1MB+。
 * 跨境到香港的带宽只有 1.6Mbps，用户看到的就是「能打开但特别慢」。
 *
 * 做法：按需用 ffmpeg 缩一张出来，落盘缓存，之后同尺寸直接读文件。
 * 零依赖 —— ffmpeg 系统自带，不引 npm 包。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from '../config.js';

const run = promisify(execFile);

const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
const ALLOWED_WIDTHS = [200, 320, 400, 600, 800];

export function normalizeWidth(w) {
  const n = Number(w) || 400;
  // 只接受白名单尺寸，避免被刷出无数种尺寸把磁盘写满
  let best = ALLOWED_WIDTHS[0];
  for (const x of ALLOWED_WIDTHS) {
    if (Math.abs(x - n) < Math.abs(best - n)) best = x;
  }
  return best;
}

export function thumbPath(fileId, width) {
  return path.join(THUMB_DIR, `${String(fileId).replace(/[^a-zA-Z0-9_-]/g, '')}-${width}.jpg`);
}

/**
 * 取缩略图；没有就现生成。
 * @param {object} file 文件记录（需要 path / mime / kind）
 * @param {number} width 目标宽度
 * @returns {Promise<string|null>} 缩略图路径
 */
export async function ensureThumb(file, width) {
  if (!file || !file.path) return null;
  const w = normalizeWidth(width);
  const dest = thumbPath(file.id, w);

  try {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  } catch {
    /* 继续生成 */
  }

  // 只处理位图；SVG / GIF 之类直接交给原图
  const mime = String(file.mime || '');
  if (!/^image\/(jpeg|png|webp|bmp)$/i.test(mime)) return null;
  try {
    if (!fs.existsSync(file.path)) return null;
  } catch {
    return null;
  }

  try {
    fs.mkdirSync(THUMB_DIR, { recursive: true });
    const tmp = `${dest}.${process.pid}.${Date.now()}.tmp.jpg`;
    await run(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        file.path,
        // 宽度固定，高度按比例；-2 保证是偶数（ffmpeg 要求）
        '-vf',
        `scale=${w}:-2`,
        '-q:v',
        '6',
        '-frames:v',
        '1',
        tmp,
      ],
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
    );
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 500) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      return null;
    }
    fs.renameSync(tmp, dest);
    return dest;
  } catch (err) {
    console.error('[thumb] 生成失败:', err.message);
    return null;
  }
}

/** 清掉某张图的全部缩略图（原图删除时调用） */
export function dropThumbs(fileId) {
  try {
    const prefix = `${String(fileId).replace(/[^a-zA-Z0-9_-]/g, '')}-`;
    for (const f of fs.readdirSync(THUMB_DIR)) {
      if (f.startsWith(prefix)) {
        try {
          fs.unlinkSync(path.join(THUMB_DIR, f));
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* 没有目录就算了 */
  }
}

export default { ensureThumb, thumbPath, normalizeWidth, dropThumbs };
