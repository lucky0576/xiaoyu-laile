// xiaoyu-laile/src/lib/extract.js
// 零外部依赖的文档文本 / 元数据提取器（Node 18+ / ESM）。
//
// 原则：健壮性优先。任何输入（空 buffer、截断文件、随机字节）都不允许抛出异常。
// extractText 全程 try/catch 兜底，失败时返回 { text:'', meta:{}, notes:['提取失败: ...'] }。

import { inflateSync, inflateRawSync } from 'node:zlib';
import { extractPdfText } from './pdftext.js';
import { readZip, isZip } from './zip.js';

/** 文本类文件的单次处理上限（64MB） */
const MAX_BUFFER = 64 * 1024 * 1024;
/** 压缩流解压输出上限 */
const INFLATE_OPTIONS = { maxOutputLength: MAX_BUFFER };

// ---------------------------------------------------------------------------
// 扩展名 → 类型
// ---------------------------------------------------------------------------

const KIND_BY_EXT = {
  // 图片
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.jpe': 'image', '.jfif': 'image',
  '.gif': 'image', '.bmp': 'image', '.dib': 'image', '.webp': 'image', '.ico': 'image',
  '.tif': 'image', '.tiff': 'image', '.svg': 'image', '.avif': 'image', '.heic': 'image',
  // 视频
  '.mp4': 'video', '.m4v': 'video', '.mov': 'video', '.qt': 'video', '.mkv': 'video',
  '.webm': 'video', '.avi': 'video', '.wmv': 'video', '.flv': 'video', '.mpg': 'video',
  '.mpeg': 'video', '.3gp': 'video', '.ts': 'video',
  // PDF
  '.pdf': 'pdf',
  // Word
  '.docx': 'word', '.doc': 'word', '.docm': 'word', '.dotx': 'word', '.rtf': 'word', '.odt': 'word',
  // PowerPoint
  '.pptx': 'ppt', '.ppt': 'ppt', '.pptm': 'ppt', '.ppsx': 'ppt', '.odp': 'ppt',
  // Excel
  '.xlsx': 'excel', '.xls': 'excel', '.xlsm': 'excel', '.xlsb': 'excel', '.ods': 'excel',
  // CAD
  '.dxf': 'cad', '.dwg': 'cad',
  // 压缩包
  '.zip': 'archive', '.jar': 'archive', '.rar': 'archive', '.7z': 'archive',
  '.tar': 'archive', '.gz': 'archive', '.tgz': 'archive', '.bz2': 'archive', '.xz': 'archive',
  // 纯文本
  '.txt': 'text', '.md': 'text', '.markdown': 'text', '.csv': 'text', '.tsv': 'text',
  '.json': 'text', '.jsonl': 'text', '.log': 'text', '.xml': 'text', '.html': 'text',
  '.htm': 'text', '.xhtml': 'text', '.yml': 'text', '.yaml': 'text', '.ini': 'text',
  '.cfg': 'text', '.conf': 'text', '.sql': 'text', '.env': 'text', '.toml': 'text',
  '.js': 'text', '.mjs': 'text', '.cjs': 'text', '.jsx': 'text', '.ts': 'text', '.tsx': 'text',
  '.css': 'text', '.scss': 'text', '.less': 'text', '.sh': 'text', '.bat': 'text', '.ps1': 'text',
  '.py': 'text', '.rb': 'text', '.php': 'text', '.java': 'text', '.c': 'text', '.h': 'text',
  '.cpp': 'text', '.hpp': 'text', '.cs': 'text', '.go': 'text', '.rs': 'text', '.kt': 'text',
  '.swift': 'text', '.vue': 'text', '.svelte': 'text', '.srt': 'text', '.vtt': 'text',
};

/** 旧版 OLE 复合文档 magic（.doc/.xls/.ppt 二进制） */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** DXF 中需要统计的实体名 */
const DXF_ENTITIES = [
  'LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'POLYLINE', 'TEXT', 'MTEXT',
  'INSERT', 'DIMENSION', 'HATCH', 'SPLINE', 'ELLIPSE', '3DFACE', 'SOLID',
];

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

/** 错误信息转字符串 */
function msg(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  if (typeof err.message === 'string' && err.message) return err.message;
  try {
    return String(err);
  } catch {
    return 'unknown error';
  }
}

/** 规整为 Buffer */
function toBuffer(input) {
  try {
    if (Buffer.isBuffer(input)) return input;
    if (input instanceof ArrayBuffer) return Buffer.from(input);
    if (ArrayBuffer.isView(input)) {
      return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    }
  } catch {
    return null;
  }
  return null;
}

/** 取小写扩展名（含点）；没有扩展名返回 '' */
function extOf(filename) {
  const s = filename == null ? '' : String(filename);
  const base = s.split(/[\\/]/).pop() || '';
  const i = base.lastIndexOf('.');
  if (i < 0 || i === base.length - 1) return '';
  return base.slice(i).toLowerCase();
}

/**
 * 根据文件名推断类型。
 * @param {string} filename
 * @returns {'image'|'video'|'pdf'|'word'|'ppt'|'excel'|'cad'|'archive'|'text'|'binary'}
 */
export function detectKind(filename) {
  try {
    const ext = extOf(filename);
    if (!ext) return 'binary';
    const kind = KIND_BY_EXT[ext];
    return kind || 'binary';
  } catch {
    return 'binary';
  }
}

/** 解码 XML/HTML 实体：&amp; &lt; &gt; &quot; &apos; &#NN; &#xNN; */
function decodeEntities(s) {
  if (typeof s !== 'string' || s.length === 0) return '';
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body) => {
    if (body.charCodeAt(0) === 35 /* # */) {
      let code;
      if (body[1] === 'x' || body[1] === 'X') code = parseInt(body.slice(2), 16);
      else code = parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    switch (body) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      case 'nbsp': return '\u00a0';
      default: return m;
    }
  });
}

/** 去掉标记并解码实体；块级结束标签转换为换行 */
function stripTags(xml) {
  if (typeof xml !== 'string' || xml.length === 0) return '';
  let s = xml;
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = s.replace(/<\s*(?:br|hr)\s*\/?>/gi, '\n');
  s = s.replace(/<\s*\/\s*(?:p|div|li|tr|h[1-6]|section|article|table|blockquote|pre|ul|ol)\s*>/gi, '\n');
  s = s.replace(/<[^>]*>/g, '');
  return decodeEntities(s);
}

/** 把 slideN.xml 按数字排序（slide2 在 slide10 之前） */
function sortSlideNames(names) {
  const arr = Array.isArray(names) ? names.slice() : [];
  arr.sort((a, b) => {
    const na = slideNumber(a);
    const nb = slideNumber(b);
    if (na !== nb) return na - nb;
    const sa = String(a);
    const sb = String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return arr;
}

/** 从名字里取幻灯片编号 */
function slideNumber(name) {
  const s = String(name == null ? '' : name);
  const m = /slide[_-]?(\d+)\.xml$/i.exec(s) || /(\d+)/.exec(s);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

/** 自然排序（sheet2 在 sheet10 之前） */
function sortNatural(names) {
  return (Array.isArray(names) ? names.slice() : []).sort((a, b) =>
    String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })
  );
}

/** 文本清理：统一换行、去空字节、压缩连续空行 */
function cleanText(s) {
  if (typeof s !== 'string' || s.length === 0) return '';
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/** 判断解码后的文本是否其实是二进制 */
function looksBinary(s) {
  if (typeof s !== 'string' || s.length === 0) return false;
  const n = Math.min(s.length, 65536);
  let nulls = 0;
  for (let i = 0; i < n; i++) {
    if (s.charCodeAt(i) === 0) nulls++;
  }
  return nulls > 4 || (nulls > 0 && nulls / n > 0.005);
}

/** 把 UTF-16BE 缓冲转成字符串 */
function decodeUtf16Be(buf) {
  const n = buf.length - (buf.length % 2);
  const swapped = Buffer.allocUnsafe(Math.max(0, n));
  for (let i = 0; i + 1 < n; i += 2) {
    swapped[i] = buf[i + 1];
    swapped[i + 1] = buf[i];
  }
  return swapped.toString('utf16le');
}

/** 是否为 OLE 复合文档 */
function isOle(buf) {
  if (!buf || buf.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== OLE_MAGIC[i]) return false;
  }
  return true;
}

/** 统计出现次数 */
function countMatches(s, re) {
  if (typeof s !== 'string' || !s) return 0;
  const m = s.match(re);
  return m ? m.length : 0;
}

/** 建立 zip 索引：name(小写、/ 分隔) → entry */
function zipIndex(buf) {
  const entries = readZip(buf);
  const map = new Map();
  for (const e of entries) {
    if (!e || typeof e.name !== 'string') continue;
    const key = e.name.replace(/\\/g, '/').toLowerCase();
    if (!map.has(key)) map.set(key, e);
  }
  return { entries, map };
}

// ---------------------------------------------------------------------------
// 图片尺寸
// ---------------------------------------------------------------------------

function u16be(b, o) {
  return o >= 0 && o + 2 <= b.length ? b.readUInt16BE(o) : 0;
}

function pngSize(buf) {
  if (buf.length < 24) return null;
  if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) return null;
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  try {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < buf.length && buf[j] === 0xff) j++;
    if (j >= buf.length) break;
    const marker = buf[j];
    const segStart = j + 1; // 段长度字段位置
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      i = segStart;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
    if (segStart + 2 > buf.length) break;
    const segLen = buf.readUInt16BE(segStart);
    if (segLen < 2) break;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (segStart + 7 > buf.length) break;
      return {
        format: 'jpeg',
        height: u16be(buf, segStart + 3),
        width: u16be(buf, segStart + 5),
      };
    }
    i = segStart + segLen;
  }
  return null;
}

function gifSize(buf) {
  if (buf.length < 10) return null;
  const h = buf.toString('latin1', 0, 6);
  if (h !== 'GIF87a' && h !== 'GIF89a') return null;
  try {
    return { format: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  } catch {
    return null;
  }
}

function bmpSize(buf) {
  if (buf.length < 26 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null;
  try {
    const dibSize = buf.readUInt32LE(14);
    if (dibSize === 12) {
      // BITMAPCOREHEADER：2 字节宽高
      return { format: 'bmp', width: buf.readUInt16LE(18), height: buf.readUInt16LE(20) };
    }
    return {
      format: 'bmp',
      width: buf.readInt32LE(18),
      height: Math.abs(buf.readInt32LE(22)),
    };
  } catch {
    return null;
  }
}

function webpSize(buf) {
  if (buf.length < 16) return null;
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const type = buf.toString('latin1', 12, 16);
  try {
    if (type === 'VP8 ') {
      if (buf.length < 30) return { format: 'webp' };
      if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return { format: 'webp' };
      return {
        format: 'webp',
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
    if (type === 'VP8L') {
      if (buf.length < 25) return { format: 'webp' };
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      return {
        format: 'webp',
        width: (b0 | ((b1 & 0x3f) << 8)) + 1,
        height: (((b1 >> 6) & 0x03) | (b2 << 2) | ((b3 & 0x0f) << 10)) + 1,
      };
    }
    if (type === 'VP8X') {
      if (buf.length < 30) return { format: 'webp' };
      return {
        format: 'webp',
        width: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
        height: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
      };
    }
    return { format: 'webp' };
  } catch {
    return { format: 'webp' };
  }
}

function svgSize(buf, ext) {
  if (ext !== '.svg') return null;
  const head = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  if (!/<svg[\s>]/i.test(head)) return null;
  const meta = { format: 'svg' };
  const w = /\bwidth\s*=\s*["']?\s*([0-9.]+)/i.exec(head);
  const h = /\bheight\s*=\s*["']?\s*([0-9.]+)/i.exec(head);
  if (w) {
    const v = parseFloat(w[1]);
    if (Number.isFinite(v) && v > 0) meta.width = Math.round(v);
  }
  if (h) {
    const v = parseFloat(h[1]);
    if (Number.isFinite(v) && v > 0) meta.height = Math.round(v);
  }
  if (meta.width === undefined || meta.height === undefined) {
    const vb = /viewBox\s*=\s*["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)/i.exec(head);
    if (vb) {
      const vw = parseFloat(vb[1]);
      const vh = parseFloat(vb[2]);
      if (meta.width === undefined && Number.isFinite(vw) && vw > 0) meta.width = Math.round(vw);
      if (meta.height === undefined && Number.isFinite(vh) && vh > 0) meta.height = Math.round(vh);
    }
  }
  return meta;
}

/** 返回 { width, height, format }，解析不出尺寸时只给 format */
function imageInfo(buf, ext) {
  const found =
    pngSize(buf) || jpegSize(buf) || gifSize(buf) || bmpSize(buf) || webpSize(buf) || svgSize(buf, ext);
  if (found) return found;
  const fmt = ext ? ext.replace('.', '') : 'unknown';
  return { format: fmt || 'unknown' };
}

function extractImage(buf, ext) {
  const notes = [];
  let meta;
  try {
    meta = imageInfo(buf, ext);
    if (!meta || typeof meta !== 'object') meta = { format: 'unknown' };
    if (meta.width === undefined || meta.height === undefined) {
      notes.push('图片: 未能解析出尺寸信息');
    }
  } catch (err) {
    meta = { format: ext ? ext.replace('.', '') : 'unknown' };
    notes.push('图片解析失败: ' + msg(err));
  }
  return { text: '', meta, notes };
}

// ---------------------------------------------------------------------------
// 视频（mp4/mov: moov/mvhd + tkhd）
// ---------------------------------------------------------------------------

function u32be(b, o) {
  return o >= 0 && o + 4 <= b.length ? b.readUInt32BE(o) : 0;
}

function u64be(b, o) {
  if (o < 0 || o + 8 > b.length) return 0;
  try {
    const v = b.readBigUInt64BE(o);
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    return v > max ? Number.MAX_SAFE_INTEGER : Number(v);
  } catch {
    return 0;
  }
}

/** 在 [start, end) 内遍历 box，返回 { type, bodyStart, boxEnd } 列表 */
function listBoxes(buf, start, end) {
  const boxes = [];
  let p = start;
  let guard = 0;
  while (p + 8 <= end && guard < 100000) {
    guard++;
    let size = u32be(buf, p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      size = u64be(buf, p + 8);
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) break;
    boxes.push({ type, bodyStart: p + header, boxEnd: p + size });
    p += size;
  }
  return boxes;
}

/** 解析 mp4/mov 的 moov 元数据 */
function parseMp4(buf) {
  const result = {};
  let moov = null;
  for (const box of listBoxes(buf, 0, buf.length)) {
    if (box.type === 'moov') {
      moov = box;
      break;
    }
  }
  if (!moov) return null;

  for (const box of listBoxes(buf, moov.bodyStart, moov.boxEnd)) {
    if (box.type === 'mvhd') {
      const body = box.bodyStart;
      if (body >= buf.length) continue;
      const version = buf[body];
      if (version === 1) {
        const timescale = u32be(buf, body + 20);
        const duration = u64be(buf, body + 24);
        if (timescale > 0) result.durationSec = Math.round((duration / timescale) * 1000) / 1000;
      } else {
        const timescale = u32be(buf, body + 12);
        const duration = u32be(buf, body + 16);
        if (timescale > 0) result.durationSec = Math.round((duration / timescale) * 1000) / 1000;
      }
    } else if (box.type === 'tkhd') {
      const body = box.bodyStart;
      if (body >= buf.length) continue;
      const version = buf[body];
      const off = version === 1 ? body + 88 : body + 76;
      if (off + 8 <= box.boxEnd && off + 8 <= buf.length) {
        const w = u32be(buf, off) / 65536;
        const h = u32be(buf, off + 4) / 65536;
        if (w > 0 && h > 0 && (!result.width || w > result.width)) {
          result.width = Math.round(w);
          result.height = Math.round(h);
        }
      }
    }
  }
  return result;
}

function extractVideo(buf, ext) {
  const notes = [];
  const meta = { format: ext ? ext.replace('.', '') : 'video' };
  try {
    const info = parseMp4(buf);
    if (info) {
      if (typeof info.durationSec === 'number' && Number.isFinite(info.durationSec)) {
        meta.durationSec = info.durationSec;
      }
      if (typeof info.width === 'number' && info.width > 0) meta.width = info.width;
      if (typeof info.height === 'number' && info.height > 0) meta.height = info.height;
      if (meta.durationSec === undefined) notes.push('视频: 未解析到 mvhd 时长');
    } else {
      notes.push('视频: 未解析到 moov/mvhd 元数据，仅给出格式');
    }
  } catch (err) {
    notes.push('视频解析失败: ' + msg(err));
  }
  return { text: '', meta, notes };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** 解码 PDF 字面量字符串中的转义（\n \r \t \b \f \( \) \\ \ddd） */
function unescapePdfLiteral(s) {
  if (typeof s !== 'string' || s.length === 0) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    i++;
    const n = s[i];
    if (n === undefined) break;
    switch (n) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case '(': out += '('; break;
      case ')': out += ')'; break;
      case '\\': out += '\\'; break;
      case '\n': break; // 行续接
      case '\r':
        if (s[i + 1] === '\n') i++;
        break;
      default:
        if (n >= '0' && n <= '7') {
          let oct = n;
          while (oct.length < 3 && s[i + 1] >= '0' && s[i + 1] <= '7') {
            i++;
            oct += s[i];
          }
          out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        } else {
          out += n;
        }
    }
  }
  return out;
}

/** 解码 PDF 十六进制字符串（含 UTF-16BE/LE BOM 处理） */
function decodePdfHex(hex) {
  const s = String(hex == null ? '' : hex).replace(/[^0-9A-Fa-f]/g, '');
  if (!s) return '';
  const padded = s.length % 2 === 1 ? s + '0' : s;
  let bytes;
  try {
    bytes = Buffer.from(padded, 'hex');
  } catch {
    return '';
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16Be(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.toString('utf16le', 2);
  }
  return bytes.toString('latin1');
}

/** 从解压后的内容流里抓取文本操作符 */
function extractPdfStreamText(content) {
  if (typeof content !== 'string' || content.length === 0) return '';
  let out = '';
  const re =
    /\(((?:\\.|[^\\()]|\((?:[^\\()]|\\.)*\))*)\)|<([0-9A-Fa-f\s]*)>|Td|TD|T\*|ET|TJ|Tj/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const whole = m[0];
    if (whole[0] === '(') {
      out += unescapePdfLiteral(m[1] || '');
    } else if (whole[0] === '<') {
      const hex = (m[2] || '').replace(/\s/g, '');
      if (hex.length >= 2) out += decodePdfHex(hex);
    } else if (whole === 'Td' || whole === 'TD' || whole === 'T*' || whole === 'ET') {
      if (out.length > 0 && !out.endsWith('\n')) out += '\n';
    }
    if (re.lastIndex === m.index) re.lastIndex++; // 防零宽死循环
  }
  return out;
}

function extractPdf(buf) {
  const notes = [];
  const meta = {};
  let src = buf;
  if (buf.length > MAX_BUFFER) {
    src = buf.subarray(0, MAX_BUFFER);
    notes.push('pdf: 文件超过 64MB，仅解析前 64MB');
  }
  // latin1 字符串的下标 == 字节偏移，便于定位流
  const raw = src.toString('latin1');

  // ---- 页面数 ----
  try {
    let maxCount = 0;
    let foundCount = false;
    const treeRe = /\/Type\s*\/Pages\b([\s\S]{0,600}?)(?=\/Type\b|endobj)/g;
    let tm;
    while ((tm = treeRe.exec(raw)) !== null) {
      const cm = /\/Count\s+(\d+)/.exec(tm[1]);
      if (cm) {
        foundCount = true;
        const v = parseInt(cm[1], 10);
        if (Number.isFinite(v) && v > maxCount) maxCount = v;
      }
      if (tm.index === treeRe.lastIndex) treeRe.lastIndex++;
    }
    if (foundCount) {
      meta.pages = maxCount;
      meta.pagesEstimated = false;
    } else {
      meta.pages = countMatches(raw, /\/Type\s*\/Page(?![a-zA-Z])/g);
      meta.pagesEstimated = true;
    }
  } catch {
    meta.pages = 0;
    meta.pagesEstimated = true;
  }

  // ---- Producer ----
  try {
    const lit = /\/Producer\s*\(((?:\\.|[^\\()])*)\)/.exec(raw);
    if (lit) {
      const p = unescapePdfLiteral(lit[1] || '').trim();
      if (p) meta.producer = p.slice(0, 300);
    } else {
      const hex = /\/Producer\s*<([0-9A-Fa-f\s]+)>/.exec(raw);
      if (hex) {
        const p = decodePdfHex(hex[1]).trim();
        if (p) meta.producer = p.slice(0, 300);
      }
    }
  } catch {
    // 忽略
  }

  // ---- 优先走 ToUnicode 解析器 ----
  // 中文 PDF 基本都是 Identity-H 子集字体，内容流里是 CID 而不是码点。
  // 不做 ToUnicode 映射只能读出乱码（下游 AI 汇总会因此残缺），
  // 所以先试这条路径；不可用或结果为空时再回退到下面的通用流扫描。
  try {
    const better = extractPdfText(src);
    if (better.text && better.text.replace(/\s/g, '').length > 50) {
      if (better.note) notes.push(better.note);
      meta.pages = better.pages || meta.pages;
      meta.textMode = better.mode;
      meta.cidHits = better.cidHits;
      return { text: cleanText(better.text), meta, notes };
    }
    if (better.note && better.mode === 'none') notes.push(better.note);
  } catch (err) {
    notes.push('pdf: ToUnicode 解析失败 ' + msg(err));
  }

  // ---- 流扫描 ----
  const decoded = [];
  let failed = 0;
  let scanned = 0;
  let idx = 0;
  const MAX_STREAMS = 5000;
  while (idx < raw.length && scanned < MAX_STREAMS) {
    let s = raw.indexOf('stream', idx);
    if (s < 0) break;
    const dict = raw.slice(Math.max(0, s - 400), s);
    let ds = s + 6;
    if (raw[ds] === '\r' && raw[ds + 1] === '\n') ds += 2;
    else if (raw[ds] === '\n' || raw[ds] === '\r') ds += 1;
    let e = raw.indexOf('endstream', ds);
    if (e < 0) {
      e = raw.length;
    }
    let de = e;
    if (de - 2 >= ds && raw[de - 2] === '\r' && raw[de - 1] === '\n') de -= 2;
    else if (de - 1 >= ds && (raw[de - 1] === '\n' || raw[de - 1] === '\r')) de -= 1;
    scanned++;

    try {
      if (de > ds) {
        const chunk = src.subarray(ds, de);
        if (/\/FlateDecode/.test(dict)) {
          let out = null;
          try {
            out = inflateSync(chunk, INFLATE_OPTIONS);
          } catch {
            try {
              out = inflateRawSync(chunk, INFLATE_OPTIONS);
            } catch {
              out = null;
            }
          }
          if (out) decoded.push(out.toString('latin1'));
          else failed++;
        } else if (/\/Filter/.test(dict)) {
          // 其它过滤器（LZW/DCT 等）不处理
        } else {
          const plain = chunk.toString('latin1');
          if (/\bT[jJ]\b/.test(plain) || /\bTd\b/.test(plain)) decoded.push(plain);
        }
      }
    } catch {
      failed++;
    }

    idx = e >= raw.length ? raw.length : e + 9;
  }

  let text = '';
  try {
    for (const c of decoded) {
      text += extractPdfStreamText(c) + '\n';
    }
    text = cleanText(text);
  } catch (err) {
    notes.push('pdf: 文本抽取失败 ' + msg(err));
    text = '';
  }

  if (failed > 0) notes.push(`pdf: ${failed} 个流解压失败，文本可能不完整`);
  notes.push('pdf: 基于内容流估算，扫描件/图片型 PDF 可能取不到文字');
  if (decoded.length === 0) notes.push('pdf: 未找到可提取文本的内容流');

  return { text, meta, notes };
}

// ---------------------------------------------------------------------------
// Office（OOXML）
// ---------------------------------------------------------------------------

function extractDocx(buf) {
  const notes = [];
  const meta = {};
  if (!isZip(buf)) {
    notes.push('docx: 不是有效的 ZIP 容器（可能为旧版 .doc）');
    return { text: '', meta, notes };
  }
  const { entries, map } = zipIndex(buf);
  if (entries.length === 0) notes.push('docx: ZIP 中央目录解析为空');

  let entry = map.get('word/document.xml');
  if (!entry) {
    const cand = entries.find((e) => /^word\/.*\.xml$/i.test(e.name));
    if (cand) {
      entry = cand;
      notes.push('docx: 未找到 word/document.xml，改用 ' + cand.name);
    }
  }
  if (!entry) {
    notes.push('docx: 未找到正文 XML（word/document.xml）');
    return { text: '', meta, notes };
  }
  if (!entry.data) {
    notes.push('docx: 正文条目无法解压');
    return { text: '', meta, notes };
  }

  let xml = '';
  try {
    xml = entry.data.toString('utf8');
  } catch (err) {
    notes.push('docx: 正文解码失败 ' + msg(err));
    return { text: '', meta, notes };
  }

  meta.paragraphs = countMatches(xml, /<w:p[\s>:]/g);
  let s = xml
    .replace(/<w:tab\b[^>]*>/g, '\t')
    .replace(/<w:br\b[^>]*>/g, '\n')
    .replace(/<w:cr\b[^>]*>/g, '\n')
    .replace(/<\/w:p>/g, '\n');
  let text = '';
  try {
    text = cleanText(stripTags(s));
  } catch (err) {
    notes.push('docx: 文本清洗失败 ' + msg(err));
  }
  if (!text) notes.push('docx: 未提取到文本内容');
  return { text, meta, notes };
}

function extractPptx(buf) {
  const notes = [];
  const meta = {};
  if (!isZip(buf)) {
    notes.push('pptx: 不是有效的 ZIP 容器（可能为旧版 .ppt）');
    return { text: '', meta, notes };
  }
  const { entries } = zipIndex(buf);
  const slides = sortSlideNames(
    entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.name)).map((e) => e.name)
  );
  meta.slides = slides.length;
  if (slides.length === 0) {
    notes.push('pptx: 未找到 ppt/slides/slideN.xml');
    return { text: '', meta, notes };
  }

  const byName = new Map();
  for (const e of entries) {
    const key = e.name.replace(/\\/g, '/').toLowerCase();
    if (!byName.has(key)) byName.set(key, e);
  }

  let text = '';
  let failed = 0;
  for (const name of slides) {
    const entry = byName.get(name.toLowerCase());
    if (!entry || !entry.data) {
      failed++;
      continue;
    }
    const num = slideNumber(name);
    let xml = '';
    try {
      xml = entry.data.toString('utf8');
    } catch {
      failed++;
      continue;
    }
    const s = xml
      .replace(/<a:br\b[^>]*>/g, '\n')
      .replace(/<a:tab\b[^>]*>/g, '\t')
      .replace(/<\/a:p>/g, '\n');
    text += '\n[第 ' + num + ' 页]\n' + cleanText(stripTags(s)) + '\n';
  }
  if (failed > 0) notes.push(`pptx: ${failed} 张幻灯片无法解压`);
  return { text: cleanText(text), meta, notes };
}

/** 解析 xl/sharedStrings.xml，拼接每个 <si> 内的全部 <t> */
function parseSharedStrings(xml) {
  const out = [];
  if (typeof xml !== 'string' || !xml) return out;
  const siRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml)) !== null) {
    const inner = m[1];
    let s = '';
    const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
    let tm;
    while ((tm = tRe.exec(inner)) !== null) {
      if (tm[1] !== undefined) s += decodeEntities(tm[1]);
    }
    out.push(s);
    if (out.length >= 200000) break;
    if (siRe.lastIndex === m.index) siRe.lastIndex++;
  }
  return out;
}

function extractXlsx(buf) {
  const notes = [];
  const meta = {};
  if (!isZip(buf)) {
    notes.push('xlsx: 不是有效的 ZIP 容器（可能为旧版 .xls）');
    return { text: '', meta, notes };
  }
  const { entries, map } = zipIndex(buf);

  const sheetEntries = entries.filter((e) => /^xl\/worksheets\/.*\.xml$/i.test(e.name));
  meta.sheets = sortNatural(sheetEntries.map((e) => e.name));
  if (sheetEntries.length === 0) notes.push('xlsx: 未找到 xl/worksheets/*.xml');

  let shared = [];
  const ss = map.get('xl/sharedstrings.xml');
  if (!ss) {
    notes.push('xlsx: 未找到 xl/sharedStrings.xml（可能使用内联字符串）');
  } else if (!ss.data) {
    notes.push('xlsx: 共享字符串表无法解压');
  } else {
    try {
      shared = parseSharedStrings(ss.data.toString('utf8'));
    } catch (err) {
      notes.push('xlsx: 共享字符串解析失败 ' + msg(err));
    }
  }

  let sheetEntry = map.get('xl/worksheets/sheet1.xml');
  if (!sheetEntry) {
    sheetEntry =
      sheetEntries.find((e) => /sheet1\.xml$/i.test(e.name)) ||
      sheetEntries.find((e) => e.data) ||
      sheetEntries[0];
  }
  if (sheetEntry) {
    if (sheetEntry.data) {
      try {
        const sx = sheetEntry.data.toString('utf8');
        meta.rows = countMatches(sx, /<row[\s>/]/g);
      } catch (err) {
        notes.push('xlsx: 行数统计失败 ' + msg(err));
      }
    } else {
      notes.push('xlsx: ' + sheetEntry.name + ' 无法解压，行数未统计');
    }
  }

  let text = '';
  try {
    text = cleanText(shared.join('\n'));
  } catch {
    text = '';
  }
  return { text, meta, notes };
}

// ---------------------------------------------------------------------------
// CAD
// ---------------------------------------------------------------------------

function extractDxf(buf) {
  const notes = [];
  const meta = {};
  let src = buf;
  if (buf.length > MAX_BUFFER) {
    src = buf.subarray(0, MAX_BUFFER);
    notes.push('dxf: 文件超过 64MB，仅解析前 64MB');
  }

  let lines;
  try {
    lines = src.toString('utf8').split(/\r\n|\r|\n/);
  } catch (err) {
    notes.push('dxf: 解码失败 ' + msg(err));
    return { text: '', meta, notes };
  }

  // ---- $ACADVER ----
  try {
    for (let i = 0; i + 1 < lines.length; i++) {
      if (lines[i].trim() === '$ACADVER') {
        // 标准 DXF 为：9 / $ACADVER / 1 / AC1015 —— 若下一行是组码则再取一行
        let v = lines[i + 1].trim();
        if (/^\d+$/.test(v)) {
          const nv = (lines[i + 2] || '').trim();
          if (nv) v = nv;
        }
        if (v) meta.acadVersion = v;
        break;
      }
    }
    if (!meta.acadVersion) {
      const m = /AC10\d\d/.exec(src.toString('latin1', 0, Math.min(src.length, 256)));
      if (m) meta.acadVersion = m[0];
    }
  } catch {
    // 忽略
  }

  // ---- LAYER 表 ----
  const layers = [];
  try {
    for (let i = 0; i + 1 < lines.length; i++) {
      if (lines[i].trim() !== '0' || lines[i + 1].trim() !== 'LAYER') continue;
      for (let j = i + 2; j + 1 < lines.length; j++) {
        const code = lines[j].trim();
        const val = lines[j + 1].trim();
        if (code === '0' && val === 'ENDTAB') break;
        if (code === '2' && val && !layers.includes(val)) {
          layers.push(val);
          j++;
        }
      }
      break;
    }
  } catch {
    // 忽略
  }
  if (layers.length > 0) meta.layers = layers;

  // ---- 实体统计 ----
  const counts = {};
  try {
    const set = new Set(DXF_ENTITIES);
    let start = -1;
    for (let i = 0; i + 1 < lines.length; i++) {
      if (lines[i].trim() === '2' && lines[i + 1].trim() === 'ENTITIES') {
        start = i + 2;
        break;
      }
    }
    if (start < 0) {
      start = 0;
      notes.push('dxf: 未定位 ENTITIES 段，实体统计基于全文');
    }
    for (let i = start; i + 1 < lines.length; i++) {
      const code = lines[i].trim();
      const val = lines[i + 1].trim();
      if (code === '0' && val === 'ENDSEC') break;
      if (code === '0' && set.has(val)) counts[val] = (counts[val] || 0) + 1;
    }
  } catch {
    // 忽略
  }
  if (Object.keys(counts).length > 0) meta.entityCounts = counts;
  else notes.push('dxf: 未统计到已知实体');

  const text = layers.join('\n');
  return { text, meta, notes };
}

function extractCad(buf, ext) {
  if (ext === '.dwg') {
    const notes = [];
    let magic = '';
    try {
      if (buf.length >= 6) magic = buf.toString('latin1', 0, 6);
    } catch {
      magic = '';
    }
    if (/^AC10\d\d$/.test(magic)) notes.push(`dwg: 二进制 CAD 文件，AutoCAD 版本 ${magic}`);
    else notes.push('dwg: 二进制 CAD 文件，未解析内容');
    return { text: '', meta: { binary: true }, notes };
  }
  return extractDxf(buf);
}

// ---------------------------------------------------------------------------
// 压缩包
// ---------------------------------------------------------------------------

function extractArchive(buf, ext) {
  const notes = [];
  const meta = {};
  const tag = ext ? ext.replace('.', '') : 'archive';

  if (ext === '.zip' || ext === '.jar' || (ext !== '.rar' && ext !== '.7z' && ext !== '.tar' && ext !== '.gz' && ext !== '.tgz' && isZip(buf))) {
    meta.entries = [];
    meta.total = 0;
    if (!isZip(buf)) {
      notes.push(`${tag}: 未检测到 ZIP 签名，无法列出条目`);
      return { text: '', meta, notes };
    }
    try {
      const entries = readZip(buf);
      const names = [];
      for (const e of entries) {
        if (e && typeof e.name === 'string') names.push(e.name);
      }
      meta.entries = names;
      meta.total = names.length;
      if (names.length === 0) notes.push(`${tag}: ZIP 解析未得到条目`);
      return { text: names.join('\n'), meta, notes };
    } catch (err) {
      notes.push(`${tag}: 条目读取失败 ` + msg(err));
      return { text: '', meta, notes };
    }
  }

  notes.push(`${tag}: 仅做类型识别，未解析内容`);
  return { text: '', meta, notes };
}

// ---------------------------------------------------------------------------
// 纯文本
// ---------------------------------------------------------------------------

function extractPlainText(buf, ext) {
  const notes = [];
  let text = '';
  try {
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      text = buf.toString('utf16le', 2);
      notes.push('按 UTF-16LE 解码');
    } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      text = decodeUtf16Be(buf.subarray(2));
      notes.push('按 UTF-16BE 解码');
    } else {
      let src = buf;
      if (buf.length > MAX_BUFFER) {
        src = buf.subarray(0, MAX_BUFFER);
        notes.push('文件超过 64MB，仅解析前 64MB');
      }
      text = src.toString('utf8');
    }
  } catch (err) {
    notes.push('解码失败 ' + msg(err));
    return { text: '', meta: { chars: 0, lines: 0 }, notes };
  }

  text = text.replace(/^\uFEFF/, '');
  if (looksBinary(text)) {
    return {
      kind: 'binary',
      text: '',
      meta: {},
      notes: notes.concat(['内容包含大量空字节，按二进制处理']),
    };
  }
  text = text.replace(/\r\n?/g, '\n');
  return {
    text,
    meta: { chars: text.length, lines: text.length === 0 ? 0 : text.split('\n').length },
    notes,
  };
}

// ---------------------------------------------------------------------------
// Office 分发（旧版二进制给出说明）
// ---------------------------------------------------------------------------

function extractWord(buf, ext) {
  const tag = (ext || '.doc').replace('.', '');
  if (ext === '.docx' || ext === '.docm' || ext === '.dotx' || (isZip(buf) && ext !== '.rtf')) {
    const r = extractDocx(buf);
    if (ext && ext !== '.docx' && isZip(buf)) {
      r.notes = (r.notes || []).concat(['检测到 ZIP 容器，按 .docx 解析']);
    }
    return r;
  }
  const notes = [];
  if (isOle(buf)) notes.push(`${tag}: OLE 复合文档（旧版二进制），未解析`);
  else notes.push(`${tag}: 仅支持 .docx，未解析该格式`);
  return { text: '', meta: {}, notes };
}

function extractPpt(buf, ext) {
  const tag = (ext || '.ppt').replace('.', '');
  if (ext === '.pptx' || ext === '.pptm' || ext === '.ppsx' || isZip(buf)) {
    return extractPptx(buf);
  }
  const notes = [];
  if (isOle(buf)) notes.push(`${tag}: OLE 复合文档（旧版二进制），未解析`);
  else notes.push(`${tag}: 仅支持 .pptx，未解析该格式`);
  return { text: '', meta: {}, notes };
}

function extractExcel(buf, ext) {
  const tag = (ext || '.xls').replace('.', '');
  if (ext === '.xlsx' || ext === '.xlsm' || isZip(buf)) return extractXlsx(buf);
  const notes = [];
  if (isOle(buf)) notes.push(`${tag}: OLE 复合文档（旧版二进制），未解析`);
  else notes.push(`${tag}: 仅支持 .xlsx，未解析该格式`);
  return { text: '', meta: {}, notes };
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 提取文件文本与元数据。任何情况下都不抛异常。
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer 文件字节
 * @param {string} filename 文件名（用于类型判断）
 * @returns {Promise<{kind:string, ext:string, text:string, meta:object, notes:string[]}>}
 */
export async function extractText(buffer, filename) {
  const name = filename == null ? '' : String(filename);
  let ext = '';
  let kind = 'binary';
  try {
    ext = extOf(name);
    kind = detectKind(name);
  } catch {
    ext = '';
    kind = 'binary';
  }

  const notes = [];
  let meta = {};
  let text = '';

  try {
    const buf = toBuffer(buffer);
    if (!buf) {
      notes.push('输入不是 Buffer / Uint8Array');
    } else if (buf.length === 0) {
      notes.push('空文件');
    } else {
      let r = null;
      switch (kind) {
        case 'image':
          r = extractImage(buf, ext);
          break;
        case 'video':
          r = extractVideo(buf, ext);
          break;
        case 'pdf':
          r = extractPdf(buf);
          break;
        case 'word':
          r = extractWord(buf, ext);
          break;
        case 'ppt':
          r = extractPpt(buf, ext);
          break;
        case 'excel':
          r = extractExcel(buf, ext);
          break;
        case 'cad':
          r = extractCad(buf, ext);
          break;
        case 'archive':
          r = extractArchive(buf, ext);
          break;
        case 'text':
          r = extractPlainText(buf, ext);
          break;
        default:
          r = { text: '', meta: {}, notes: [] };
      }

      if (r && typeof r === 'object') {
        if (typeof r.text === 'string') text = r.text;
        if (r.meta && typeof r.meta === 'object') meta = r.meta;
        if (Array.isArray(r.notes)) {
          for (const n of r.notes) {
            if (typeof n === 'string') notes.push(n);
          }
        }
        if (typeof r.kind === 'string' && r.kind) kind = r.kind;
      }
    }
  } catch (err) {
    return { kind, ext, text: '', meta: {}, notes: ['提取失败: ' + msg(err)] };
  }

  return { kind, ext, text, meta, notes };
}

// 便于测试的通用工具（非必需导出）
export { decodeEntities, stripTags, sortSlideNames };
