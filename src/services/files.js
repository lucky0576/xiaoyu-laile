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

const ALLOWED = new Set([...Object.keys(EXT_KIND), '.apk', '.exe', '.psd', '.ai']);

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

  const id = newId('f');
  const dest = storagePath(id, ext);
  await fsp.rename(part.tmpPath, dest);
  part.moved = true;

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
    mime: part.mime || 'application/octet-stream',
    size: stat.size,
    path: dest,
    url: `/files/${id}/${encodeURIComponent(name)}`,
    text,
    meta,
    notes,
    createdAt: new Date().toISOString(),
  });
  // path 属于内部信息，不外发
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

export function getFile(id) {
  return filesCol().get(id);
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

export default { saveUpload, saveUploads, getFile, listFiles, deleteFile, kindOf, extOf, aggregateText, pickCover };
