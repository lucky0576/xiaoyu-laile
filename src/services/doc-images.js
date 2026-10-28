/**
 * 小鱼来了 — 从 PDF / PPT / Word 里抽出图片当主图
 *
 * 场景：用户只上传了一份招标文件或方案 PPT，没传封面图。
 * 以前只能退回「实景照片 + 标题」的合成封面，
 * 但文件里往往有更贴切的图（现场照片、效果图、产品图）。
 *
 * 做法：
 *   PDF            → pdfimages 直接抽内嵌图片
 *   PPT/Word/Excel → soffice 先转 PDF，再 pdfimages 抽
 *   按面积挑最大的一张横版图（封面适合 16:10 左右）
 *   抽出来的图注册成普通附件，返回 { id, url }
 *
 * 结果按文件 id 缓存，同一个文件不会重复抽。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from '../config.js';
import { previewKind, officeToPdf } from './doc-preview.js';
import { registerStoredFile } from './files.js';

const run = promisify(execFile);

const CACHE_DIR = path.join(DATA_DIR, 'doc-images');
const MAX_PAGES = 20; // 只抽前 20 页，避免超大文件拖垮
const MIN_BYTES = 20 * 1024; // 小于 20KB 的多半是图标 / 分割线

/** soffice 很吃内存，抽图也串行排队 */
let chain = Promise.resolve();
function serialize(fn) {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

function cacheKey(fileId) {
  return path.join(CACHE_DIR, `${String(fileId).replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
}

function readMeta(fileId) {
  try {
    return JSON.parse(fs.readFileSync(cacheKey(fileId), 'utf8'));
  } catch {
    return null;
  }
}

function writeMeta(fileId, meta) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheKey(fileId), JSON.stringify(meta), 'utf8');
  } catch {
    /* ignore */
  }
}

/** 解析 pdfimages -list，拿到每张图的宽高 */
async function listImages(pdfPath) {
  const { stdout } = await run('pdfimages', ['-list', pdfPath], {
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const rows = [];
  for (const line of stdout.split('\n')) {
    // 只看数据行：page num type width height ...
    const m = /^\s*(\d+)\s+(\d+)\s+(\w+)\s+(\d+)\s+(\d+)\s+/.exec(line);
    if (!m) continue;
    rows.push({ page: Number(m[1]), w: Number(m[4]), h: Number(m[5]) });
  }
  return rows;
}

/**
 * 抽一张最合适的图。
 * @returns {Promise<{id:string,url:string,width:number,height:number}|null>}
 */
async function doExtract(file, { ownerId = '' } = {}) {
  const kind = previewKind(file);
  if (!kind) return null;
  if (!file.path || !fs.existsSync(file.path)) return null;

  let tmpDir = '';
  let pdfPath = file.path;
  try {
    if (kind === 'office') {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xyll-docimg-pdf-'));
      pdfPath = await officeToPdf(file.path, tmpDir);
      if (!pdfPath) return null;
    }

    const rows = await listImages(pdfPath);
    if (!rows.length) return null;

    /*
     * 封面要横版：优先宽大于高、面积大的。
     * 全都不合适时退一步，只要够大就行（竖版总比没有强）。
     */
    const indexed = rows.map((r, i) => ({ ...r, idx: i }));
    let cands = indexed
      .filter((r) => r.w >= 500 && r.h >= 300 && r.w >= r.h * 1.1)
      .sort((a, b) => b.w * b.h - a.w * a.h);
    if (!cands.length) {
      cands = indexed.filter((r) => r.w >= 400 && r.h >= 260).sort((a, b) => b.w * b.h - a.w * a.h);
    }
    if (!cands.length) return null;

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xyll-docimg-'));
    const prefix = path.join(outDir, 'img');
    try {
      await run(
        'pdfimages',
        ['-j', '-f', '1', '-l', String(MAX_PAGES), pdfPath, prefix],
        { timeout: 180000, maxBuffer: 16 * 1024 * 1024 },
      );

      const produced = fs
        .readdirSync(outDir)
        .filter((f) => /^img-\d+\.(jpg|jpeg|png|tif|ppm)$/i.test(f))
        .sort();

      for (const c of cands) {
        const fname = produced.find((p) => Number(/(\d+)\./.exec(p)[1]) === c.idx);
        if (!fname) continue;
        const src = path.join(outDir, fname);
        let stat;
        try {
          stat = fs.statSync(src);
        } catch {
          continue;
        }
        if (stat.size < MIN_BYTES) continue; // 图标、分割线

        const ext = path.extname(fname).toLowerCase();
        if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue; // tif/ppm 前端显示不了

        // 复制一份再交给文件服务（registerStoredFile 会把它移走）
        const tmpCopy = path.join(os.tmpdir(), `xyll-docimg-save-${Date.now()}${ext}`);
        fs.copyFileSync(src, tmpCopy);

        const rec = await registerStoredFile({
          srcPath: tmpCopy,
          name: `文档图片-${c.idx + 1}${ext}`,
          mime: ext === '.png' ? 'image/png' : 'image/jpeg',
          opts: { ownerId, role: 'attachment' },
        });

        const meta = { id: rec.id, url: rec.url, width: c.w, height: c.h, at: Date.now() };
        writeMeta(file.id, meta);
        return meta;
      }
      return null;
    } finally {
      try {
        fs.rmSync(outDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error('[doc-images] 抽图失败:', file.name, err.message);
    return null;
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 取这个文档里的「主图」。有缓存直接用。
 * 抽不到图会缓存一个 { none: true }，避免每次都重新跑一遍转换。
 */
export async function extractDocCover(file, opts = {}) {
  if (!file || !file.id) return null;
  const cached = readMeta(file.id);
  if (cached) {
    if (cached.none) return null;
    if (cached.url) return cached;
  }
  return serialize(async () => {
    const again = readMeta(file.id);
    if (again) return again.none ? null : again.url ? again : null;
    const r = await doExtract(file, opts);
    if (!r) writeMeta(file.id, { none: true, at: Date.now() });
    return r;
  });
}

/** 判断这个文件值不值得试着抽图 */
export function canExtractFrom(file) {
  if (!file || !file.path) return false;
  return Boolean(previewKind(file));
}

export default { extractDocCover, canExtractFrom };
