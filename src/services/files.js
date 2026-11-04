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
import os from 'node:os';
import { UPLOAD_DIR } from '../config.js';
import db, { newId } from '../store/db.js';
import { httpError } from '../http/app.js';
import { safeFilename } from '../http/multipart.js';
import { enqueueExtract, EXTRACT_MAX_BYTES } from '../lib/extract-queue.js';

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

  /*
   * 解析不能在这条请求里同步做。
   * extract.js 全是 inflateSync / 自研 PDF、DOC 解析的同步 CPU 活，
   * 一份 21MB 的 Word 能把 Node 主线程卡住好几秒 ——
   * 期间整个服务不响应，前端所有上传请求都挂住，看着就是「0% 没反应」。
   *
   * 现在：≤ 24MB 丢给 worker 线程异步解析；
   *       PDF / 图片超过 24MB 不读全文，改走「渲染前两页 + 视觉识别」。
   */
  let parsing = false;
  let heavyMedia = false; // 超大 PDF / 图片：只做 OCR，不做全文解析
  if (wantExtract) {
    if (stat.size > EXTRACT_MAX_BYTES) {
      if (kind === 'pdf' || kind === 'image') {
        heavyMedia = true;
        parsing = true;
      } else {
        notes = [
          `文件 ${(stat.size / 1048576).toFixed(1)}MB，超过 24MB 未解析正文；` +
            '内容检索不会包含这份文件的文字，但仍可正常下载与展示。',
        ];
      }
    } else {
      parsing = true;
    }
  }

  /*
   * 视频单独一条路：不把几十 MB 的视频读进内存，
   * 只用 ffprobe 取时长/分辨率、ffmpeg 抽 3 帧交给视觉模型。
   * 体积不设小文件限制（视频本来就大），但超大视频跳过抽帧。
   */
  const videoParse = opts.extract !== false && kind === 'video' && stat.size <= 512 * 1024 * 1024;
  if (videoParse) parsing = true;

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
    parsing,
    createdAt: new Date().toISOString(),
  });

  // 排队解析（worker 线程，不阻塞主线程，也不阻塞本次响应）
  if (parsing && !videoParse && !heavyMedia) {
    const queued = enqueueExtract({
      filePath: dest,
      name,
      size: stat.size,
      onDone: async (r) => {
        try {
          const patch = { parsing: false };
          if (r.ok) {
            patch.text = String(r.text || '').slice(0, 200000);
            patch.meta = r.meta || {};
            patch.notes = r.notes || [];
          } else {
            patch.notes = [`解析失败: ${r.error || '未知错误'}`];
          }

          /*
           * 本地解析拿不到文字时，再试视觉识别：
           *   · 图片（截图 / 照片 / 扫描件）
           *   · 扫描版 PDF（没有文本层，或文本层是乱码）
           *   · 视频（抽 3 帧看画面里有什么，同时补时长/分辨率）
           */
          const textNow = String(patch.text || '');
          /*
           * PDF 文本层可能「有字但全是乱码」（字体没有 ToUnicode 映射时常见）。
           * 判断标准：CJK + 字母数字占比太低，就当没解析出来，走 OCR。
           */
          const readable = (() => {
            const s = textNow.trim();
            if (!s) return false;
            if (s.length < 12) return false;
            const good = (s.match(/[\u4e00-\u9fa5A-Za-z0-9]/g) || []).length;
            return good / s.length >= 0.35;
          })();
          const noText = !readable;
          const mediaKind = ['image', 'pdf', 'video'].includes(kind);
          if (noText && mediaKind) {
            let visionReady = false;
            try {
              const aiMod = await import('./ai.js');
              const ai = aiMod.default || aiMod;
              visionReady = Boolean(ai.visionConfigured && ai.visionConfigured());
            } catch {
              visionReady = false;
            }
            if (visionReady) {
              try {
                const { ocrMedia } = await import('../lib/mediaocr.js');
                const ocr = await ocrMedia({ filePath: dest, kind, name });
                if (ocr.meta && Object.keys(ocr.meta).length) {
                  patch.meta = { ...(patch.meta || {}), ...ocr.meta };
                }
                if (ocr.text) {
                  patch.text = String(ocr.text).slice(0, 200000);
                  patch.notes = [...(patch.notes || []), '正文由视觉模型识别'];
                }
                if (ocr.notes && ocr.notes.length) {
                  patch.notes = [...(patch.notes || []), ...ocr.notes];
                }
              } catch (err) {
                patch.notes = [...(patch.notes || []), '视觉识别失败: ' + String(err?.message || err)];
              }
            } else {
              patch.notes = [
                ...(patch.notes || []),
                kind === 'video'
                  ? '已取到视频时长与分辨率；画面内容识别需配置视觉模型'
                  : '已取到尺寸等基础信息；图中文字识别需配置视觉模型',
              ];
            }
          } else if (kind === 'video') {
            // 视频本来就不读字节，元数据单独用 ffprobe 补
            try {
              const { videoMeta } = await import('../lib/mediaocr.js');
              const m = await videoMeta(dest);
              if (m && Object.keys(m).length) patch.meta = { ...(patch.meta || {}), ...m };
            } catch {
              /* ignore */
            }
          }

          filesCol().update(id, patch);
          record.parsing = false;
          if (patch.text !== undefined) record.text = patch.text;
          if (patch.notes) record.notes = patch.notes;
        } catch {
          /* 记录更新失败不影响文件可用性 */
        }
      },
    });
    if (!queued) {
      filesCol().update(id, { parsing: false, notes: ['解析队列繁忙，已跳过正文'] });
      record.parsing = false;
    }
  }

  /*
   * 超大 PDF / 图片（>24MB）：不读全文，直接渲染页面前 2 页做视觉识别。
   * 13.7MB 的扫描件 PDF 就属于这一类 —— 以前会被直接跳过，
   * 用户看到的就是「AI 汇总失败」。
   */
  if (heavyMedia) {
    setImmediate(async () => {
      const patch = { parsing: false };
      try {
        let visionReady = false;
        try {
          const aiMod = await import('./ai.js');
          const ai = aiMod.default || aiMod;
          visionReady = Boolean(ai.visionConfigured && ai.visionConfigured());
        } catch {
          visionReady = false;
        }

        if (visionReady) {
          const { ocrMedia } = await import('../lib/mediaocr.js');
          const ocr = await ocrMedia({ filePath: dest, kind, name });
          if (ocr.meta && Object.keys(ocr.meta).length) patch.meta = ocr.meta;
          if (ocr.text) {
            patch.text = String(ocr.text).slice(0, 200000);
            patch.notes = ['超大文件，已用视觉模型识别前 2 页文字'];
          } else {
            patch.notes = ['超大文件，视觉识别未取到文字', ...(ocr.notes || [])];
          }
        } else {
          patch.notes = ['超大文件（>24MB）未解析正文；识别需配置视觉模型'];
        }
      } catch (err) {
        patch.notes = ['超大文件解析失败: ' + String(err?.message || err)];
      }
      try {
        filesCol().update(id, patch);
        record.parsing = false;
        if (patch.text !== undefined) record.text = patch.text;
        if (patch.meta) record.meta = patch.meta;
        if (patch.notes) record.notes = patch.notes;
      } catch {
        /* ignore */
      }
    });
  }

  /*
   * 视频：单独走一条异步链路（不进 worker，避免把几十 MB 读进内存）：
   *   ffprobe 取时长/分辨率 → ffmpeg 抽 3 帧 → 视觉模型识别画面文字。
   * 全程异步，不影响上传响应，也不卡主线程。
   */
  if (videoParse) {
    setImmediate(async () => {
      const patch = { parsing: false };
      try {
        let visionReady = false;
        try {
          const aiMod = await import('./ai.js');
          const ai = aiMod.default || aiMod;
          visionReady = Boolean(ai.visionConfigured && ai.visionConfigured());
        } catch {
          visionReady = false;
        }

        const { ocrMedia, videoMeta } = await import('../lib/mediaocr.js');
        const m = await videoMeta(dest);
        if (m && Object.keys(m).length) patch.meta = m;

        if (visionReady) {
          const ocr = await ocrMedia({ filePath: dest, kind: 'video', name });
          if (ocr.meta && Object.keys(ocr.meta).length) patch.meta = { ...(patch.meta || {}), ...ocr.meta };
          if (ocr.text) {
            patch.text = String(ocr.text).slice(0, 200000);
            patch.notes = ['正文由视觉模型识别（视频画面）'];
          }
          if (ocr.notes && ocr.notes.length) patch.notes = [...(patch.notes || []), ...ocr.notes];
        } else {
          patch.notes = ['已取到视频时长与分辨率；画面内容识别需配置视觉模型'];
        }
      } catch (err) {
        patch.notes = ['视频解析失败: ' + String(err?.message || err)];
      }
      try {
        filesCol().update(id, patch);
        record.parsing = false;
        if (patch.text !== undefined) record.text = patch.text;
        if (patch.meta) record.meta = patch.meta;
        if (patch.notes) record.notes = patch.notes;
      } catch {
        /* ignore */
      }
    });
  }

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

/**
 * 等第一次调用时才去找中文字体（服务器上可能是文泉驿，也可能没装）。
 * 返回 null 表示没有可用中文字体，调用方就不要硬烧字了。
 */
let cjkFontCache = '';

function cjkFont() {
  if (cjkFontCache !== '') return cjkFontCache || null;
  const candidates = [
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/arphic/uming.ttc',
    'C:\\Windows\\Fonts\\msyh.ttc',
    'C:\\Windows\\Fonts\\simhei.ttf',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        cjkFontCache = p;
        return p;
      }
    } catch {
      /* ignore */
    }
  }
  cjkFontCache = null;
  return null;
}

/**
 * 把标题烧进视频（左上角/顶部，前 8 秒显示）。
 *
 * 为什么用 textfile 而不是直接写 text=：
 *   drawtext 的 text 参数需要转义 : ' \ % 等字符，
 *   标题里几乎一定会有中文引号、冒号、百分号，手写转义迟早出错。
 *   写成临时文件让 ffmpeg 自己读，稳。
 *
 * @returns {Promise<object|null>} 新的文件记录；失败返回 null（不影响原视频）
 */
export async function burnVideoTitle(record, title) {
  if (!record || record.kind !== 'video') return null;
  const text = String(title || '').trim().slice(0, 60);
  if (!text) return null;
  if (!record.path) return null;
  try {
    if (!fs.statSync(record.path).size) return null;
  } catch {
    return null;
  }
  if (!(await hasFfmpeg())) return null;
  const font = cjkFont();
  if (!font) return null;

  const tmpText = path.join(os.tmpdir(), `vtitle-${Date.now()}.txt`);
  const tmpOut = path.join(os.tmpdir(), `vtitle-${Date.now()}.mp4`);
  try {
    fs.writeFileSync(tmpText, text, 'utf8');
    /*
     * 字号按高度算（h/18），保证不同分辨率下观感一致；
     * 位置放在安全区内（y = h*0.10），不会被手机顶部菜单条挡住。
     */
    const draw =
      `drawtext=fontfile=${font.replace(/\\/g, '/').replace(/:/g, '\\:')}` +
      `:textfile=${tmpText.replace(/\\/g, '/').replace(/:/g, '\\:')}` +
      `:fontcolor=white:fontsize=h/18:line_spacing=8` +
      /*
       * boxborderw 只接受数字，不接受 h/90 这种表达式
       * （踩过一次：报 "Unable to parse option value h/90"，
       *   整条 drawtext 初始化失败，标题一张都没烧上去）。
       */
      `:box=1:boxcolor=black@0.5:boxborderw=14` +
      `:x=(w-text_w)/2:y=h*0.10:enable='lt(t,8)'`;

    const ok = await runFfmpeg([
      '-y', '-i', record.path,
      '-vf', draw,
      '-c:v', 'libx264', '-crf', '25', '-preset', 'veryfast',
      '-profile:v', 'high', '-level', '4.0',
      '-c:a', 'copy',
      '-movflags', '+faststart', '-f', 'mp4', tmpOut,
      '-loglevel', 'error', '-nostdin',
    ]);
    if (!ok) return null;
    const st = fs.statSync(tmpOut);
    if (!st.size) return null;

    const outName = `${String(record.name || 'video').replace(/\.[^.]+$/, '')}-标题版.mp4`;
    const created = await registerStoredFile({
      srcPath: tmpOut,
      name: outName,
      mime: 'video/mp4',
      opts: {
        // 标题版不需要再解析一遍（抽帧 OCR 很费 CPU），只是换了个画面上传
        extract: false,
        titleBurned: true,
        sourceFileId: record.id,
      },
    });
    return created || null;
  } catch (err) {
    console.warn('[video] 烧标题失败:', record.name, err.message);
    return null;
  } finally {
    try { fs.unlinkSync(tmpText); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
  }
}

/**
 * 等待文件正文解析完成。
 *
 * 背景：解析改成 worker 线程异步跑之后，上传接口会立刻返回（parsing=true），
 * 此时记录里的 text 还是空的。如果前端紧接着调 AI 汇总，
 * 拿到的就是「有文件、没内容」—— AI 只能说「资料不足」。
 *
 * 这里在服务端等一小会儿（默认最多 15 秒），
 * 解析完的立刻返回，超时的就先按空正文处理（AI 会提示资料不足）。
 *
 * @param {Array} files 文件记录数组
 * @returns {Promise<Array>} 补全 text 之后的记录
 */
export async function waitForParsing(files = [], { timeoutMs = 25000, pollMs = 300 } = {}) {
  const list = (files || []).filter(Boolean);
  const pending = list.filter((f) => f && f.parsing);
  if (!pending.length) return list;

  const deadline = Date.now() + timeoutMs;
  const latest = new Map(list.map((f) => [f.id, f]));

  while (Date.now() < deadline) {
    let stillParsing = 0;
    for (const f of pending) {
      const fresh = filesCol().get(f.id) || f;
      latest.set(f.id, fresh);
      if (fresh.parsing) stillParsing += 1;
    }
    if (!stillParsing) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }

  return list.map((f) => latest.get(f.id) || f);
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

/**
 * 证件 / 材料类图片的关键词。
 *
 * 为什么需要：营业执照、身份证、备案证、批复、合同附件这些「证明材料」
 * 上传后会被当成第一张图片，结果项目封面变成了营业执照 ——
 * 既难看，也把证照信息暴露在公开列表里。
 */
const DOC_IMAGE_KW = [
  '营业执照', '执照', '身份证', '证件', '证照', '证书', '认证', '资质',
  '许可证', '批复', '备案', '核准', '证明', '合同', '协议', '授权书',
  '承诺书', '申请表', '报告', '批复文件', '扫描件', '回执', '发票', '收据',
];

/** 文件名看起来像「证明材料」吗 */
export function looksLikeDocImage(file) {
  const n = String(file?.name || '').toLowerCase();
  if (!n) return false;
  return DOC_IMAGE_KW.some((kw) => n.includes(kw.toLowerCase()));
}

/**
 * 取封面图：
 *   1. 显式指定（body.coverId）优先 —— 用户选了就尊重
 *   2. 否则取第一张「不是证明材料」的图片
 *   3. 全是证明材料时返回 null，交给前端用默认封面
 */
export function pickCover(files = [], preferredId) {
  if (preferredId) {
    const hit = files.find((f) => f.id === preferredId);
    if (hit) return hit;
  }
  const images = files.filter((f) => f && f.kind === 'image');
  const normal = images.find((f) => !looksLikeDocImage(f));
  if (normal) return normal;
  // 没有可用图就返回 null（前端会用生成的默认封面，而不是把执照贴上去）
  return null;
}

export default { optimizeVideoAsync, saveUpload, saveUploads, getFile, listFiles, deleteFile, kindOf, extOf, aggregateText, pickCover, waitForParsing };
