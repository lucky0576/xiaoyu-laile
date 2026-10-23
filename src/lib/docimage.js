/**
 * 小鱼来了 — 从文档里提取图片
 *
 * 背景：
 *   PPT / PDF 里的关键信息常常是截图、图表、扫描件，纯文本抽取会丢掉这些内容。
 *   这里把文档内嵌的图片抠出来，交给视觉模型 OCR，让「PDF / PPT 当图片用」。
 *
 * 实现：
 *   · PPTX：本质是 ZIP，图片都在 ppt/media/ 下，直接解压取二进制
 *   · PDF ：只处理内嵌 JPEG（/Filter /DCTDecode）——这是扫描件、
 *           截图型 PDF 的常见形态，纯 JS 就能抠出来，不需要外部工具
 */

import { readZip, isZip } from './zip.js';

const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const DEFAULT_MAX = 8;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 单张 2MB，太大不适合 base64 直传

function toBuf(b) {
  if (Buffer.isBuffer(b)) return b;
  if (b instanceof Uint8Array) return Buffer.from(b);
  return null;
}

/** PPTX（以及同样是 ZIP 容器的 OOXML）：取 ppt/media/ 下的图片 */
export function extractPptxImages(input, { max = DEFAULT_MAX, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const buf = toBuf(input);
  if (!buf || !isZip(buf)) return [];

  let entries = [];
  try {
    entries = readZip(buf);
  } catch {
    return [];
  }

  const out = [];
  for (const e of entries) {
    if (!e || e.dir || !e.data || !e.data.length) continue;
    const name = String(e.name || '').replace(/\\/g, '/');
    if (!/^ppt\/media\//i.test(name)) continue;
    if (!IMG_EXT.test(name)) continue;
    if (e.data.length > maxBytes) continue;
    const ext = name.split('.').pop().toLowerCase();
    out.push({ name, mime: MIME[ext] || 'image/jpeg', buffer: e.data });
  }

  // 大图通常是主视觉/扫描页，优先给模型看
  return out.sort((a, b) => b.buffer.length - a.buffer.length).slice(0, max);
}

/** PDF：抠出内嵌 JPEG（DCTDecode），足够覆盖扫描件与图片型 PDF */
export function extractPdfImages(input, { max = DEFAULT_MAX, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const buf = toBuf(input);
  if (!buf || buf.length < 100) return [];

  const out = [];
  let s;
  try {
    s = buf.toString('latin1');
  } catch {
    return [];
  }

  let cursor = 0;
  let guard = 0;
  while (out.length < max && guard < 400) {
    guard += 1;

    const imgIdx = s.indexOf('/Subtype', cursor);
    if (imgIdx < 0) break;

    // 确认是 Image 对象
    const headSlice = s.slice(imgIdx, imgIdx + 40);
    if (!/\/Subtype\s*\/Image/.test(headSlice)) {
      cursor = imgIdx + 8;
      continue;
    }

    const streamIdx = s.indexOf('stream', imgIdx);
    if (streamIdx < 0) break;

    const dict = s.slice(imgIdx, streamIdx);
    cursor = streamIdx + 6;

    // 只取 JPEG；FlateDecode 的裸位图需要额外解压+拼像素，暂不处理
    if (!/DCTDecode/.test(dict)) continue;
    if (/\/ImageMask\s+true/.test(dict)) continue;

    let start = streamIdx + 6; // 'stream'
    if (s[start] === '\r') start += 1;
    if (s[start] === '\n') start += 1;

    const endIdx = s.indexOf('endstream', start);
    if (endIdx < 0) break;

    let end = endIdx;
    while (end > start && (s[end - 1] === '\n' || s[end - 1] === '\r')) end -= 1;

    const len = end - start;
    // 太小的多半是图标/蒙版，跳过
    if (len > 8 * 1024 && len <= maxBytes) {
      const data = buf.subarray(start, end);
      // 再校验一次 JPEG 头，避免把别的流当图片
      if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
        out.push({ name: `pdf-page-${out.length + 1}.jpg`, mime: 'image/jpeg', buffer: data });
      }
    }

    cursor = endIdx + 9;
  }

  return out;
}

/** 按文件类型分发 */
export function extractDocImages(buffer, filename, opts = {}) {
  const ext = (String(filename || '').match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (ext === '.pptx' || ext === '.pptm' || ext === '.ppsx' || ext === '.ppsm') {
    return extractPptxImages(buffer, opts);
  }
  if (ext === '.pdf') {
    return extractPdfImages(buffer, opts);
  }
  return [];
}

/** 转成视觉模型能吃的 data URL（太大就不转） */
export function toDataUrl(img, maxBytes = DEFAULT_MAX_BYTES) {
  if (!img || !img.buffer || !img.buffer.length || img.buffer.length > maxBytes) return '';
  return `data:${img.mime || 'image/jpeg'};base64,${img.buffer.toString('base64')}`;
}

export default { extractPptxImages, extractPdfImages, extractDocImages, toDataUrl };
