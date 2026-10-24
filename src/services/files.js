/**
 * 文件服务
 *
 * 支持：图片 / PPT / PDF / Word / Excel / CAD / 压缩包 / 视频 / 音频 / 文本
 * 上传落盘 → 类型识别 → 文本与元数据提取（供 AI 解析与分享卡片使用）
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from '../config.js';
import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';
import { safeFilename } from '../http/multipart.js';

const filesCol = () => db.collection('files');

/* ------------------------------------------------------------------ */
/* 类型表                                                              */
/* ------------------------------------------------------------------ */
export const EXT_KIND = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.svg': 'image',
  '.ico': 'image',
  '.heic': 'image',
  '.mp4': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.mkv': 'video',
  '.webm': 'video',
  '.flv': 'video',
  '.wmv': 'video',
  '.m4v': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.m4a': 'audio',
  '.aac': 'audio',
  '.flac': 'audio',
  '.ogg': 'audio',
  '.pdf': 'pdf',
  '.doc': 'word',
  '.docx': 'word',
  '.wps': 'word',
  '.rtf': 'word',
  '.ppt': 'ppt',
  '.pptx': 'ppt',
  '.dps': 'ppt',
  '.xls': 'excel',
  '.xlsx': 'excel',
  '.csv': 'excel',
  '.et': 'excel',
  '.dwg': 'cad',
  '.dxf': 'cad',
  '.dwf': 'cad',
  '.dgn': 'cad',
  '.step': 'cad',
  '.stp': 'cad',
  '.igs': 'cad',
  '.iges': 'cad',
  '.zip': 'archive',
  '.rar': 'archive',
  '.7z': 'archive',
  '.tar': 'archive',
  '.gz': 'archive',
  '.bz2': 'archive',
  '.xz': 'archive',
  '.txt': 'text',
  '.md': 'text',
  '.json': 'text',
  '.xml': 'text',
  '.log': 'text',
  '.yml': 'text',
  '.yaml': 'text',
};

export const ALLOWED = new Set([...Object.keys(EXT_KIND), '.apk', '.exe', '.psd', '.ai']);

export function extOf(name) {
  return path.extname(String(name || '')).toLowerCase();
}

export function kindOf(name) {
  return EXT_KIND[extOf(name)] || 'binary';
}

export const KIND_LABEL = {
  image: '图片',
  video: '视频',
  audio: '音频',
  pdf: 'PDF',
  word: 'Word 文档',
  ppt: 'PPT 演示',
  excel: 'Excel 表格',
  cad: 'CAD 图纸',
  archive: '压缩包',
  text: '文本',
  binary: '文件',
};

/* ------------------------------------------------------------------ */
/* 提取器（延迟加载，缺失时优雅降级）                                    */
/* ------------------------------------------------------------------ */
let extractorPromise = null;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import('../lib/extract.js').catch(() => ({
      extractText: async (buffer, filename) => ({
        kind: kindOf(filename),
        ext: extOf(filename),
        text: '',
        meta: {},
        notes: ['文本提取模块未安装，已跳过内容解析'],
      }),
    }));
  }
  return extractorPromise;
}

/* ------------------------------------------------------------------ */
/* 保存上传                                                            */
/* ------------------------------------------------------------------ */
function storagePath(fileId, ext) {
  const d = new Date();
  const dir = path.join(UPLOAD_DIR, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${fileId}${ext}`);
}

/**
 * 把 multipart 解析出来的临时文件转正。
 * @param {{tmpPath:string, filename:string, mime:string, size:number, field:string}} part
 * @param {{ownerId?:string, listingId?:string, role?:string, extract?:boolean}} opts
 */
/**
 * 把已经落在 dest 路径上的文件登记为文件记录（含文本解析）。
 *
 * 抽出来是为了让「一次上传」与「分片上传合并后」共用同一段逻辑，
 * 避免两条路径的解析行为/字段不一致。
 */
export async function registerStoredFile({ srcPath, name, mime, opts = {} }) {
  const ext = extOf(name);
  if (!ALLOWED.has(ext)) {
    try {
      fs.unlinkSync(srcPath);
    } catch {
      /* ignore */
    }
    throw httpError(415, `不支持的文件类型：${ext || '未知'}`);
  }

  const id = newId('f');
  const dest = storagePath(id, ext);
  if (srcPath !== dest) await fsp.rename(srcPath, dest);

  const stat = await fsp.stat(dest);
  const kind = kindOf(name);

  let text = '';
  let meta = {};
  let notes = [];
  const wantExtract = opts.extract !== false && kind !== 'video' && kind !== 'audio';
  if (wantExtract) {
    try {
      const buf = await fsp.readFile(dest);
      const { extractText } = await getExtractor();
      const result = await extractText(buf, name);
      text = String(result.text || '').slice(0, 200000);
      meta = result.meta || {};
      notes = result.notes || [];
    } catch (err) {
      notes = [`解析失败: ${err.message}`];
    }
  }

  const record = filesCol().insert({
    id,
    ownerId: opts.ownerId || '',
    listingId: opts.listingId || '',
    role: opts.role || 'attachment',
    name,
    ext,
    kind,
    mime: mime || 'application/octet-stream',
    size: stat.size,
    path: dest,
    url: `/files/${id}/${encodeURIComponent(name)}`,
    text,
    meta,
    notes,
    createdAt: new Date().toISOString(),
  });

  // 视频：上传后异步做 faststart / 降码率，不阻塞上传响应
  if (kind === 'video') {
    optimizeVideoAsync(record).catch(() => {});
  }

  return record;
}

export async function saveUpload(part, opts = {}) {
  const name = safeFilename(part.filename);
  const ext = extOf(name);
  if (!ALLOWED.has(ext)) {
    try {
      fs.unlinkSync(part.tmpPath);
    } catch {
      /* ignore */
    }
    throw httpError(415, `不支持的文件类型：${ext || '未知'}`);
  }
  const record = await registerStoredFile({
    srcPath: part.tmpPath,
    name,
    mime: part.mime,
    opts,
  });
  part.moved = true;
  return record;
}

/** 处理请求里的全部上传文件 */
export async function saveUploads(req, opts = {}) {
  const out = [];
  for (const part of req.files || []) {
    const role = part.field || 'attachment';
    out.push(await saveUpload(part, { ...opts, role }));
  }
  return out;
}

export function filePublic(f) {
  if (!f) return null;
  const { path: _p, ...rest } = f;
  return rest;
}

/**
 * 迁移/搬迁机器后，记录里存的绝对路径会失效。
 * 这里按「id + 扩展名」在 UPLOAD_DIR 下重新定位一次，找到就写回记录，
 * 既修复历史数据，也避免每次请求都重复扫描。
 */
function resolveFilePath(f) {
  if (!f) return null;
  if (f.path && fs.existsSync(f.path)) return f.path;

  const id = f.id;
  const ext = extOf(f.name);
  const found = [];

  // 1) 平铺：uploads/<id><ext>
  found.push(path.join(UPLOAD_DIR, `${id}${ext}`));
  // 2) 目录：uploads/<id>/<原文件名>
  found.push(path.join(UPLOAD_DIR, id, String(f.name || `${id}${ext}`)));

  // 3) 年月结构：uploads/<年>/<月>/<id><ext>
  try {
    for (const y of fs.readdirSync(UPLOAD_DIR)) {
      const yp = path.join(UPLOAD_DIR, y);
      let st;
      try { st = fs.statSync(yp); } catch { continue; }
      if (!st.isDirectory()) continue;

      found.push(path.join(yp, `${id}${ext}`));
      try {
        for (const m of fs.readdirSync(yp)) {
          const mp = path.join(yp, m);
          try { if (!fs.statSync(mp).isDirectory()) continue; } catch { continue; }
          found.push(path.join(mp, `${id}${ext}`));
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  const hit = found.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });
  if (hit) {
    try {
      filesCol().update(id, { path: hit });
    } catch { /* ignore */ }
    return hit;
  }
  return null;
}

export function getFile(id) {
  const f = filesCol().get(id);
  if (!f) return null;
  const p = resolveFilePath(f);
  return p ? { ...f, path: p } : f;
}

export function listFiles(ids = []) {
  return ids.map((id) => filesCol().get(id)).filter(Boolean);
}

export function deleteFile(id) {
  const f = filesCol().get(id);
  if (!f) return false;
  try {
    fs.unlinkSync(f.path);
  } catch {
    /* ignore */
  }
  filesCol().remove(id);
  return true;
}

/** 汇总一组文件的文本，供 AI 使用 */

/* ------------------------------------------------------------------ */
/* 视频优化：faststart + 降码率                                         */
/*                                                                     */
/* 手机拍的视频有两个致命问题：                                         */
/*   1. moov atom 在文件末尾 → 浏览器必须下完整个文件才能起播           */
/*   2. 码率动辄 7~8 Mbps，跨境 1.6 Mbps 带宽根本跟不上，播放一直缓冲   */
/*                                                                     */
/* 这里在上传后异步跑 ffmpeg：                                         */
/*   -c copy -movflags +faststart  只重封装（快、不损质量）              */
/*   码率 >1.8 Mbps 时再转码：宽度≤720 / CRF 26 / AAC 96k 单声道        */
/* 不阻塞上传响应；失败就保留原文件。                                    */
/* ------------------------------------------------------------------ */

let ffmpegOk = null;
async function hasFfmpeg() {
  if (ffmpegOk !== null) return ffmpegOk;
  try {
    const { execFile } = await import('node:child_process');
    ffmpegOk = await new Promise((resolve) => {
      execFile('ffmpeg', ['-version'], { timeout: 5000 }, (err) => resolve(!err));
    });
  } catch {
    ffmpegOk = false;
  }
  return ffmpegOk;
}

function runFfmpeg(args, timeoutMs = 180000) {
  return new Promise(async (resolve) => {
    try {
      const { execFile } = await import('node:child_process');
      execFile('ffmpeg', args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err) => {
        resolve(!err);
      });
    } catch {
      resolve(false);
    }
  });
}

function probeBitrate(file) {
  return new Promise(async (resolve) => {
    try {
      const { execFile } = await import('node:child_process');
      execFile(
        'ffprobe',
        ['-v', 'error', '-select_streams', 'v:0',
         '-show_entries', 'stream=width,height,duration,bit_rate',
         '-of', 'csv=p=0', file],
        { timeout: 15000 },
        (err, stdout) => {
          if (err || !stdout) return resolve(null);
          const p = String(stdout).trim().split(',');
          resolve({
            width: Number(p[0]) || 0,
            height: Number(p[1]) || 0,
            duration: Number(p[2]) || 0,
            bitrate: Number(p[3]) || 0,
          });
        },
      );
    } catch {
      resolve(null);
    }
  });
}

/** 异步优化视频，不阻塞调用方 */
export async function optimizeVideoAsync(record) {
  if (!record || record.kind !== 'video' || !record.path) return;
  let st;
  try {
    st = fs.statSync(record.path);
  } catch {
    return;
  }
  if (st.size < 300 * 1024) return; // 小于 300KB 不用管

  if (!(await hasFfmpeg())) return;

  const tmp = `${record.path}.opt.mp4`;
  try {
    const info = await probeBitrate(record.path);
    const size = st.size;
    // 用大小/时长估算真实码率，取较大值
    let target = info?.bitrate || 0;
    if (info?.duration > 0) {
      const est = Math.round((size * 8) / info.duration);
      if (est > target) target = est;
    }

    let ok = false;
    if (target > 1800000) {
      // 码率过高：转码 + faststart
      ok = await runFfmpeg([
        '-y', '-i', record.path,
        '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast',
        '-profile:v', 'high', '-level', '4.0',
        '-vf', "scale='min(720,iw)':-2",
        '-c:a', 'aac', '-b:a', '96k', '-ac', '1',
        '-movflags', '+faststart', '-f', 'mp4', tmp,
        '-loglevel', 'error', '-nostdin',
      ]);
    } else {
      // 码率够低：只重封装做 faststart
      ok = await runFfmpeg([
        '-y', '-i', record.path,
        '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmp,
        '-loglevel', 'error', '-nostdin',
      ]);
    }

    if (!ok) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      return;
    }
    const newSize = fs.statSync(tmp).size;
    if (!newSize) {
      fs.unlinkSync(tmp);
      return;
    }
    // 转码后反而更大就保留原文件（只接受 faststart 版本的等价大小）
    const isTranscoded = target > 1800000;
    if (isTranscoded && newSize >= size) {
      fs.unlinkSync(tmp);
      return;
    }
    fs.renameSync(tmp, record.path);
    const updated = { size: newSize, mtime: new Date().toISOString() };
    try {
      db.collection('files').update(record.id, updated);
    } catch { /* ignore */ }
    console.log(
      `[video] ${record.name} 已优化 ${Math.round(size / 1024 / 1024)}MB -> ` +
      `${Math.round(newSize / 1024 / 1024)}MB${isTranscoded ? '（转码）' : '（faststart）'}`,
    );
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    console.warn('[video] 优化失败:', record.name, err.message);
  }
}

export function aggregateText(files = [], limit = 12000) {
  const parts = [];
  for (const f of files) {
    if (!f) continue;
    const t = String(f.text || '').trim();
    if (!t) continue;
    parts.push(`【${f.name}】（${KIND_LABEL[f.kind] || f.kind}）\n${t}`);
  }
  const joined = parts.join('\n\n');
  return joined.length > limit ? `${joined.slice(0, limit)}\n…（内容已截断）` : joined;
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 取封面图：优先显式指定，其次第一张图片 */
export function pickCover(files = [], preferredId) {
  if (preferredId) {
    const hit = files.find((f) => f.id === preferredId);
    if (hit) return hit;
  }
  return files.find((f) => f.kind === 'image') || null;
}

export default { optimizeVideoAsync, saveUpload, saveUploads, getFile, listFiles, deleteFile, kindOf, extOf, aggregateText, pickCover };
