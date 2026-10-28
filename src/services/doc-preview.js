/**
 * 小鱼来了 — 文档在线预览
 *
 * 目标：项目文件里的 PDF / PPT / Word / Excel 直接在平台内翻页看，
 * 而不是点了之后被浏览器下载走。
 *
 * 做法：
 *   PDF            → pdftoppm 直接渲染成图片
 *   Office 系列    → soffice 先转 PDF，再交给 pdftoppm
 *   每页一张 JPEG，缓存在 data/previews/<fileId>/
 *
 * 为什么要转成图片而不是丢个 iframe 给浏览器：
 *   · 手机浏览器对 PDF 的 iframe 支持一塌糊涂，Android 经常直接下载
 *   · PPT / Word 浏览器根本不会渲染
 *   图片是唯一「所有设备表现一致」的方案。
 *
 * 并发与内存：这台机器只有 2G 内存，soffice 一次要吃 300MB 左右，
 * 所以转换任务串行排队，一次只跑一个。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from '../config.js';

const run = promisify(execFile);

const PREVIEW_DIR = path.join(DATA_DIR, 'previews');
const MAX_PAGES = 40; // 超大文档只渲染前 40 页
const RENDER_DPI = 96;
const RENDER_WIDTH = 1200;

/** 串行队列：soffice 太吃内存，一次只跑一个 */
let chain = Promise.resolve();
function serialize(fn) {
  const next = chain.then(fn, fn);
  // 无论成败都不让链条断掉
  chain = next.catch(() => {});
  return next;
}

/** 判断这个文件能不能预览 */
export function previewKind(file) {
  if (!file) return '';
  const mime = String(file.mime || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  const ext = (name.split('.').pop() || '').toLowerCase();

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    ['ppt', 'pptx', 'pps', 'ppsx', 'doc', 'docx', 'xls', 'xlsx', 'odp', 'odt', 'ods'].includes(ext) ||
    mime.includes('officedocument') ||
    mime.includes('ms-powerpoint') ||
    mime.includes('ms-word') ||
    mime.includes('ms-excel') ||
    mime === 'application/msword'
  ) {
    return 'office';
  }
  return '';
}

function dirOf(fileId) {
  return path.join(PREVIEW_DIR, String(fileId).replace(/[^a-zA-Z0-9_-]/g, ''));
}

function readMeta(fileId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dirOf(fileId), 'meta.json'), 'utf8'));
  } catch {
    return null;
  }
}

function writeMeta(fileId, meta) {
  try {
    fs.mkdirSync(dirOf(fileId), { recursive: true });
    fs.writeFileSync(path.join(dirOf(fileId), 'meta.json'), JSON.stringify(meta), 'utf8');
  } catch {
    /* ignore */
  }
}

/** PDF → 每页 JPEG */
async function pdfToImages(pdfPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  // pdftoppm 输出 page-1.jpg / page-2.jpg …
  await run(
    'pdftoppm',
    [
      '-jpeg',
      '-r',
      String(RENDER_DPI),
      '-scale-to',
      String(RENDER_WIDTH),
      '-f',
      '1',
      '-l',
      String(MAX_PAGES),
      pdfPath,
      path.join(outDir, 'page'),
    ],
    { timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
  );
  const files = fs
    .readdirSync(outDir)
    .filter((f) => /^page-\d+\.jpg$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  return files.length;
}

/** Office → PDF（soffice），返回临时 PDF 路径 */
export async function officeToPdf(srcPath, tmpDir) {
  fs.mkdirSync(tmpDir, { recursive: true });
  await run(
    'soffice',
    [
      '--headless',
      '--norestore',
      '--invisible',
      '--nolockcheck',
      '--nodefault',
      '--convert-to',
      'pdf',
      '--outdir',
      tmpDir,
      srcPath,
    ],
    {
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, HOME: os.tmpdir() },
    },
  );
  const pdf = fs.readdirSync(tmpDir).find((f) => f.toLowerCase().endsWith('.pdf'));
  return pdf ? path.join(tmpDir, pdf) : null;
}

/**
 * 确保某文件已生成预览图；返回 { pages, kind } 或 { pages: 0, note }
 * 已经生成过就直接读 meta，不重复转换。
 */
export async function ensurePreview(file) {
  const kind = previewKind(file);
  if (!kind) return { pages: 0, kind: '', note: '该文件不支持预览' };
  if (!file.path || !fs.existsSync(file.path)) return { pages: 0, kind, note: '文件已被清理' };

  const cached = readMeta(file.id);
  if (cached && cached.pages > 0) return { pages: cached.pages, kind: cached.kind, cached: true };

  return serialize(async () => {
    // 排队期间可能已经被别的请求生成好了
    const again = readMeta(file.id);
    if (again && again.pages > 0) return { pages: again.pages, kind: again.kind, cached: true };

    const out = dirOf(file.id);
    try {
      fs.rmSync(out, { recursive: true, force: true });
      fs.mkdirSync(out, { recursive: true });
    } catch {
      /* ignore */
    }

    let tmpDir = '';
    try {
      let pdfPath = file.path;
      if (kind === 'office') {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xyll-doc-'));
        pdfPath = await officeToPdf(file.path, tmpDir);
        if (!pdfPath) {
          return { pages: 0, kind, note: '文档转换失败（可能已损坏或加密）' };
        }
      }
      const pages = await pdfToImages(pdfPath, out);
      if (!pages) return { pages: 0, kind, note: '没能渲染出页面' };
      writeMeta(file.id, { pages, kind, at: Date.now() });
      return { pages, kind };
    } catch (err) {
      console.error('[preview] 转换失败:', err.message);
      return { pages: 0, kind, note: `转换失败：${String(err.message).slice(0, 60)}` };
    } finally {
      if (tmpDir) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  });
}

/** 取某页图片路径；没有返回 null */
export function previewPagePath(fileId, page) {
  const n = Number(page) || 1;
  if (n < 1 || n > MAX_PAGES) return null;
  const dir = dirOf(fileId);
  if (!fs.existsSync(dir)) return null;

  /*
   * pdftoppm 的补零位数不固定：
   *   9 页以内 → page-1.jpg
   *   40 页    → page-001.jpg（实测是 3 位）
   * 所以不能猜位数，直接扫目录按数字比对，稳。
   */
  const hit = fs
    .readdirSync(dir)
    .filter((f) => /^page-\d+\.jpg$/.test(f))
    .find((f) => Number(f.match(/\d+/)[0]) === n);
  return hit ? path.join(dir, hit) : null;
}

/** 删掉某文件的预览（原文件删除时调用） */
export function dropPreview(fileId) {
  try {
    fs.rmSync(dirOf(fileId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export default { ensurePreview, previewPagePath, previewKind, dropPreview };
