/**
 * 图片 / 视频 / 扫描版 PDF 的内容识别
 *
 * 为什么单独一个模块：
 *   extract.js 是纯本地的字节解析（零依赖），能拿到 PDF/PPT 里的文字层，
 *   但拿不到「扫描件、截图、视频画面」里的内容 —— 那需要视觉模型。
 *   这里负责把媒体转成图片，再交给 ai.ocrImages 识别。
 *
 * 全部按需调用：只有在视觉模型配置好、且本地解析确实没拿到文字时才跑。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

function run(bin, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, _stdout, stderr) => {
      resolve({ ok: !err, err: err ? String(err.message || err) : '', stderr: String(stderr || '') });
    });
  });
}

async function tmpDir(tag) {
  const d = path.join(os.tmpdir(), `xyocr-${tag}-${crypto.randomBytes(4).toString('hex')}`);
  await fs.mkdir(d, { recursive: true });
  return d;
}

async function filesIn(dir, ext = '') {
  const names = await fs.readdir(dir).catch(() => []);
  const out = [];
  for (const n of names.sort()) {
    if (ext && !n.toLowerCase().endsWith(ext)) continue;
    const p = path.join(dir, n);
    const st = await fs.stat(p).catch(() => null);
    if (st && st.isFile() && st.size > 0) out.push(p);
  }
  return out;
}

async function toDataUrl(p) {
  const buf = await fs.readFile(p);
  // 单张图控制体积，避免请求过大
  if (buf.length > 3 * 1024 * 1024) return '';
  const ext = path.extname(p).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** 视频抽 N 帧（均匀取样），返回图片路径 */
async function videoFrames(filePath, count = 3) {
  const dir = await tmpDir('video');
  const dur = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of',
    'default=noprint_wrappers=1:nokey=1', filePath,
  ], 15000);
  let seconds = Number(String(dur.stderr || '').trim()) || 0;
  if (!seconds) {
    // ffprobe 可能不可用，退回 ffmpeg 的时长输出
    const probe = await run('ffmpeg', ['-i', filePath], 15000);
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe.stderr || '');
    if (m) seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  if (!seconds || !Number.isFinite(seconds)) seconds = 3;

  const points = [];
  for (let i = 0; i < count; i++) {
    points.push(Math.max(0.2, (seconds * (i + 0.5)) / count));
  }
  for (let i = 0; i < points.length; i++) {
    await run('ffmpeg', [
      '-y', '-ss', String(points[i].toFixed(2)), '-i', filePath,
      '-frames:v', '1', '-vf', 'scale=960:-2', path.join(dir, `f${i}.jpg`),
    ], 25000);
  }
  const list = await filesIn(dir, '.jpg');
  return { dir, files: list.slice(0, count), durationSec: seconds };
}

/** 扫描版 PDF：把前 N 页渲染成图片 */
async function pdfPages(filePath, pages = 2) {
  const dir = await tmpDir('pdf');
  await run('pdftoppm', [
    '-png', '-r', '120', '-f', '1', '-l', String(pages), filePath, path.join(dir, 'p'),
  ], 45000);
  const list = await filesIn(dir, '.png');
  return { dir, files: list.slice(0, pages) };
}

/**
 * 识别一个媒体文件的文字内容。
 * @returns {Promise<{text:string, notes:string[]}>}
 */
export async function ocrMedia({ filePath, kind, name = '' }) {
  const notes = [];
  let images = [];
  let cleanupDirs = [];

  try {
    if (kind === 'image') {
      const url = await toDataUrl(filePath);
      if (url) images = [url];
    } else if (kind === 'pdf') {
      const r = await pdfPages(filePath, 2);
      cleanupDirs.push(r.dir);
      for (const p of r.files) {
        const u = await toDataUrl(p);
        if (u) images.push(u);
      }
      if (!images.length) notes.push('扫描件转图片失败，未能识别正文');
    } else if (kind === 'video') {
      const r = await videoFrames(filePath, 3);
      cleanupDirs.push(r.dir);
      for (const p of r.files) {
        const u = await toDataUrl(p);
        if (u) images.push(u);
      }
      if (!images.length) notes.push('视频抽帧失败，未能识别画面');
    }
  } catch (err) {
    notes.push('媒体识别准备失败：' + String(err?.message || err));
  }

  if (!images.length) {
    await Promise.all(cleanupDirs.map((d) => fs.rm(d, { recursive: true, force: true }).catch(() => {})));
    return { text: '', notes };
  }

  let text = '';
  try {
    const ai = (await import('../services/ai.js')).default;
    const r = await ai.ocrImages({
      images,
      prompt:
        '这是' +
        (kind === 'video' ? '视频抽帧画面' : kind === 'pdf' ? '扫描件页面' : '图片') +
        '，请把图中所有可见文字按阅读顺序原样输出，不要翻译、不要总结、不要编造。' +
        '如果图里是表格，用「列名: 值」的纯文本形式列出。',
    });
    if (r && r.ok && r.text) text = String(r.text);
    else notes.push(r?.note || '视觉模型未返回内容');
  } catch (err) {
    notes.push('视觉识别失败：' + String(err?.message || err));
  } finally {
    await Promise.all(cleanupDirs.map((d) => fs.rm(d, { recursive: true, force: true }).catch(() => {})));
  }

  return { text, notes };
}

export default { ocrMedia };
