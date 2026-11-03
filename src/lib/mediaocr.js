/**
 * 图片 / 视频 / 扫描版 PDF 的内容识别
 *
 * 为什么单独一个模块：
 *   extract.js 是纯本地的字节解析（零依赖），能拿到 PDF/PPT 里的文字层，
 *   但拿不到「扫描件、截图、视频画面」里的内容 —— 那需要视觉模型。
 *   这里负责把媒体转成图片，再交给 ai.ocrImages 识别。
 *
 * 全部按需调用：只有本地解析确实没拿到文字时，才走到这里。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

function run(bin, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        err: err ? String(err.message || err) : '',
      });
    });
  });
}

async function tmpDir(tag) {
  const d = path.join(os.tmpdir(), `xyocr-${tag}-${crypto.randomBytes(4).toString('hex')}`);
  await fs.mkdir(d, { recursive: true });
  return d;
}

async function listFiles(dir, ext = '') {
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
  if (buf.length > 3 * 1024 * 1024) return '';
  const ext = path.extname(p).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** 视频元数据：ffprobe 取时长/分辨率（不把整个文件读进内存） */
export async function videoMeta(filePath) {
  const meta = {};
  const r = await run(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=width,height:format=duration,format_name', '-of', 'json', filePath],
    20000,
  );
  if (!r.ok) return meta;
  let out = r.stdout.trim();
  if (!out.startsWith('{')) out = r.stderr.trim();
  const jsonStart = out.indexOf('{');
  if (jsonStart < 0) return meta;
  try {
    const j = JSON.parse(out.slice(jsonStart));
    const st = (j.streams || [])[0] || {};
    if (st.width) meta.width = st.width;
    if (st.height) meta.height = st.height;
    const dur = Number(j.format?.duration);
    if (Number.isFinite(dur) && dur > 0) meta.durationSec = Math.round(dur * 10) / 10;
    if (j.format?.format_name) meta.format = String(j.format.format_name).split(',')[0];
  } catch {
    /* ignore */
  }
  return meta;
}

/** 视频抽 N 帧（均匀取样） */
async function videoFrames(filePath, count = 3) {
  const dir = await tmpDir('video');
  const meta = await videoMeta(filePath);
  let seconds = Number(meta.durationSec) || 0;
  if (!seconds || !Number.isFinite(seconds)) seconds = 3;

  const points = [];
  for (let i = 0; i < count; i++) points.push(Math.max(0.2, (seconds * (i + 0.5)) / count));
  for (let i = 0; i < points.length; i++) {
    await run(
      'ffmpeg',
      ['-y', '-ss', String(points[i].toFixed(2)), '-i', filePath,
        '-frames:v', '1', '-vf', 'scale=960:-2', path.join(dir, `f${i}.jpg`)],
      25000,
    );
  }
  const files = await listFiles(dir, '.jpg');
  return { dir, files: files.slice(0, count) };
}

/** 扫描版 PDF：把前 N 页渲染成图片 */
async function pdfPages(filePath, pages = 2) {
  const dir = await tmpDir('pdf');
  await run('pdftoppm', ['-png', '-r', '120', '-f', '1', '-l', String(pages), filePath, path.join(dir, 'p')], 45000);
  const files = await listFiles(dir, '.png');
  return { dir, files: files.slice(0, pages) };
}

const OCR_PROMPT = (kind) =>
  `这是${kind === 'video' ? '视频抽帧画面' : kind === 'pdf' ? '扫描件页面' : '图片'}，` +
  '请把图中所有可见文字按阅读顺序原样输出，不要翻译、不要总结、不要编造。' +
  '如果图里是表格，用「列名: 值」的纯文本形式列出。';

/**
 * 识别一个媒体文件的文字内容。
 * @returns {Promise<{text:string, notes:string[], meta:object}>}
 */
export async function ocrMedia({ filePath, kind, name = '' }) {
  const notes = [];
  const outMeta = {};
  const images = [];
  const cleanup = [];

  try {
    if (kind === 'image') {
      const url = await toDataUrl(filePath);
      if (url) images.push(url);
    } else if (kind === 'pdf') {
      const r = await pdfPages(filePath, 3);
      cleanup.push(r.dir);
      for (const p of r.files) {
        const u = await toDataUrl(p);
        if (u) images.push(u);
      }
      if (!images.length) notes.push('扫描件转图片失败，未能识别正文');
    } else if (kind === 'video') {
      Object.assign(outMeta, await videoMeta(filePath));
      const r = await videoFrames(filePath, 3);
      cleanup.push(r.dir);
      for (const p of r.files) {
        const u = await toDataUrl(p);
        if (u) images.push(u);
      }
      if (!images.length) notes.push('视频抽帧失败，未能识别画面');
    }
  } catch (err) {
    notes.push('媒体识别准备失败：' + String(err?.message || err));
  }

  let text = '';
  if (images.length) {
    try {
      const aiMod = await import('../services/ai.js');
      const ai = aiMod.default || aiMod;
      const r = await ai.ocrImages({ images, prompt: OCR_PROMPT(kind) });
      if (r && r.ok && r.text) text = String(r.text);
      else notes.push(r?.note || '视觉模型未返回内容');
    } catch (err) {
      notes.push('视觉识别失败：' + String(err?.message || err));
    }
  }

  await Promise.all(cleanup.map((d) => fs.rm(d, { recursive: true, force: true }).catch(() => {})));
  return { text, notes, meta: outMeta };
}

export default { ocrMedia, videoMeta };
