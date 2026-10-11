// xiaoyu-laile/src/lib/zip.js
// 零外部依赖的 ZIP 读取器（Node 18+ / ESM）。
//
// 设计目标：只读、够用、绝不抛异常。
//   * 支持 stored(0) 与 deflate(8)
//   * 支持 ZIP64（EOCD64 locator + EOCD64 record + 0x0001 extra field）
//   * 加密、未知压缩方法、越界、截断 —— 一律优雅降级（data: null）
//   * 中央目录损坏时回退到扫描 local file header

import { inflateRawSync } from 'node:zlib';

/** local file header 签名 */
const SIG_LOCAL = 0x04034b50;
/** central directory file header 签名 */
const SIG_CENTRAL = 0x02014b50;
/** end of central directory 签名 */
const SIG_EOCD = 0x06054b50;
/** ZIP64 end of central directory record 签名 */
const SIG_EOCD64 = 0x06064b50;
/** ZIP64 end of central directory locator 签名 */
const SIG_EOCD64_LOCATOR = 0x07064b50;

/** EOCD 最大回退字节数：22 字节定长 + 最多 65535 字节注释 */
const EOCD_SEARCH = 65557;
/** 防御性条目数量上限 */
const MAX_ENTRIES = 200000;
/** 单条目解压上限（64MB），超过则不解压 */
const MAX_UNCOMPRESSED = 64 * 1024 * 1024;
/** inflate 输出上限，防止 zip bomb */
const INFLATE_OPTIONS = { maxOutputLength: MAX_UNCOMPRESSED };

/**
 * 把任意输入规整为 Buffer。
 * @param {any} input
 * @returns {Buffer|null}
 */
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

/** 越界安全的 u16le */
function u16(b, o) {
  return o >= 0 && o + 2 <= b.length ? b.readUInt16LE(o) : 0;
}

/** 越界安全的 u32le */
function u32(b, o) {
  return o >= 0 && o + 4 <= b.length ? b.readUInt32LE(o) : 0;
}

/** 越界安全的 u64le（超过 MAX_SAFE_INTEGER 时钳制） */
function u64(b, o) {
  if (o < 0 || o + 8 > b.length) return 0;
  let v;
  try {
    v = b.readBigUInt64LE(o);
  } catch {
    return 0;
  }
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  return v > max ? Number.MAX_SAFE_INTEGER : Number(v);
}

/** 解码条目名：优先 UTF-8，出现替换字符时退回 latin1（GBK 名字至少不丢字节） */
function decodeName(b, start, len) {
  if (len <= 0 || start < 0 || start >= b.length) return '';
  const end = Math.min(b.length, start + len);
  let s = b.toString('utf8', start, end);
  if (s.indexOf('\uFFFD') >= 0) s = b.toString('latin1', start, end);
  return s.replace(/\u0000/g, '');
}

/**
 * 检查是否是 ZIP（PK\x03\x04 或 PK\x05\x06）。
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer
 * @returns {boolean}
 */
export function isZip(buffer) {
  try {
    const b = toBuffer(buffer);
    if (!b || b.length < 4) return false;
    if (b[0] !== 0x50 || b[1] !== 0x4b) return false;
    const sig = b.readUInt32LE(0);
    return sig === SIG_LOCAL || sig === SIG_EOCD;
  } catch {
    return false;
  }
}

/**
 * 从尾部向前查找 EOCD。
 * @returns {number} EOCD 偏移，找不到返回 -1
 */
function findEocd(b) {
  const len = b.length;
  if (len < 22) return -1;
  const start = Math.max(0, len - EOCD_SEARCH);
  let fallback = -1;
  for (let i = len - 22; i >= start; i--) {
    if (b[i] !== 0x50 || b[i + 1] !== 0x4b || b[i + 2] !== 0x05 || b[i + 3] !== 0x06) continue;
    const commentLen = u16(b, i + 20);
    if (i + 22 + commentLen === len) return i; // 完全自洽
    if (fallback < 0) fallback = i;
  }
  return fallback;
}

/**
 * 读取 EOCD（必要时升级到 ZIP64）。
 * @returns {{total:number, cdSize:number, cdOffset:number, zip64:boolean}}
 */
function readEocdInfo(b, eocd) {
  let total = u16(b, eocd + 10);
  let cdSize = u32(b, eocd + 12);
  let cdOffset = u32(b, eocd + 16);
  let zip64 = false;

  if (eocd >= 20 && u32(b, eocd - 20) === SIG_EOCD64_LOCATOR) {
    const loc = eocd - 20;
    const recordOffset = u64(b, loc + 8);
    if (
      recordOffset > 0 &&
      recordOffset + 56 <= b.length &&
      u32(b, recordOffset) === SIG_EOCD64
    ) {
      total = u64(b, recordOffset + 32);
      cdSize = u64(b, recordOffset + 40);
      cdOffset = u64(b, recordOffset + 48);
      zip64 = true;
    }
  }

  // 注意：若 32 位字段全是哨兵值但 ZIP64 记录不可用，则保持原值，
  // 由 readZip 通过 locateCentralStart 的全量扫描来降级。
  return { total, cdSize, cdOffset, zip64 };
}

/** 定位中央目录起点，必要时全量扫描 */
function locateCentralStart(b, cdOffset) {
  if (
    cdOffset > 0 &&
    cdOffset + 46 <= b.length &&
    u32(b, cdOffset) === SIG_CENTRAL
  ) {
    return cdOffset;
  }
  if (cdOffset === 0 && b.length >= 46 && u32(b, 0) === SIG_CENTRAL) return 0;
  for (let i = 0; i + 46 <= b.length; i++) {
    if (b[i] !== 0x50 || b[i + 1] !== 0x4b) continue;
    if (u32(b, i) === SIG_CENTRAL) return i;
  }
  return -1;
}

/** 解析 ZIP64 extra field（0x0001），只读取值为 0xFFFFFFFF 的字段 */
function readZip64Extra(b, start, end, cur) {
  let q = start;
  while (q + 4 <= end) {
    const id = u16(b, q);
    const size = u16(b, q + 2);
    const hs = q + 4;
    const he = Math.min(end, hs + size);
    if (id === 0x0001) {
      let r = hs;
      let uncompressedSize = cur.uncompressedSize;
      let compressedSize = cur.compressedSize;
      let localOffset = cur.localOffset;
      if (uncompressedSize === 0xffffffff && r + 8 <= he) {
        uncompressedSize = u64(b, r);
        r += 8;
      }
      if (compressedSize === 0xffffffff && r + 8 <= he) {
        compressedSize = u64(b, r);
        r += 8;
      }
      if (localOffset === 0xffffffff && r + 8 <= he) {
        localOffset = u64(b, r);
        r += 8;
      }
      return { uncompressedSize, compressedSize, localOffset };
    }
    if (size <= 0) break;
    q = hs + size;
  }
  return cur;
}

/**
 * 读取单个条目的内容。
 * @returns {Buffer|null} 无法安全解压时返回 null
 */
function readEntryData(b, localOffset, compressedSize, uncompressedSize, method, flags) {
  try {
    if (flags & 0x0001) return null; // 加密
    if (method !== 0 && method !== 8) return null; // 不支持的压缩方法（9/12/14...）
    if (uncompressedSize > MAX_UNCOMPRESSED) return null; // 过大，不解压
    if (localOffset < 0 || localOffset + 30 > b.length) return null;
    if (u32(b, localOffset) !== SIG_LOCAL) return null;

    // 关键：local header 的 name/extra 长度可能与中央目录不同，必须用 local 的
    const nameLen = u16(b, localOffset + 26);
    const extraLen = u16(b, localOffset + 28);
    const start = localOffset + 30 + nameLen + extraLen;
    if (start < 0 || start > b.length) return null;

    let end = start + Math.max(0, compressedSize);
    if (end > b.length || end < start) end = b.length;
    const raw = b.subarray(start, end);

    if (method === 0) {
      let out = raw;
      if (uncompressedSize > 0 && uncompressedSize <= raw.length) {
        out = raw.subarray(0, uncompressedSize);
      }
      return Buffer.from(out);
    }

    return inflateRawSync(raw, INFLATE_OPTIONS);
  } catch {
    return null;
  }
}

/** 解析中央目录主循环 */
function parseCentralEntries(b, start, info, out) {
  const limit = info.total > 0 ? Math.min(info.total, MAX_ENTRIES) : MAX_ENTRIES;
  let p = start;
  let count = 0;

  while (count < limit && p + 46 <= b.length) {
    if (u32(b, p) !== SIG_CENTRAL) break;

    const flags = u16(b, p + 8);
    const method = u16(b, p + 10);
    const crc32 = u32(b, p + 16);
    let compressedSize = u32(b, p + 20);
    let uncompressedSize = u32(b, p + 24);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    let localOffset = u32(b, p + 42);

    const nameStart = p + 46;
    const extraStart = Math.min(b.length, nameStart + nameLen);
    const extraEnd = Math.min(b.length, extraStart + extraLen);

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      const z = readZip64Extra(b, extraStart, extraEnd, {
        uncompressedSize,
        compressedSize,
        localOffset,
      });
      uncompressedSize = z.uncompressedSize;
      compressedSize = z.compressedSize;
      localOffset = z.localOffset;
    }

    const name = decodeName(b, nameStart, nameLen);
    const dir = name.endsWith('/') || name.endsWith('\\');

    out.push({
      name,
      dir,
      method,
      compressedSize,
      uncompressedSize,
      crc32: crc32 >>> 0,
      data: dir
        ? null
        : readEntryData(b, localOffset, compressedSize, uncompressedSize, method, flags),
    });

    count++;
    const next = extraEnd + commentLen;
    if (next <= p) break;
    p = next;
  }
}

/**
 * 没有可用中央目录时的回退：扫描 local file header。
 * deflate 数据交由 zlib 自行判断流结束位置。
 */
function readLocalOnly(b) {
  const out = [];
  try {
    let p = 0;
    let guard = 0;
    while (p + 30 <= b.length && guard < MAX_ENTRIES) {
      if (u32(b, p) !== SIG_LOCAL) {
        p++;
        continue;
      }
      guard++;
      const flags = u16(b, p + 6);
      const method = u16(b, p + 8);
      const crc32 = u32(b, p + 14);
      let compressedSize = u32(b, p + 18);
      let uncompressedSize = u32(b, p + 22);
      const nameLen = u16(b, p + 26);
      const extraLen = u16(b, p + 28);
      const name = decodeName(b, p + 30, nameLen);
      const dataStart = p + 30 + nameLen + extraLen;
      const dir = name.endsWith('/');

      const entry = {
        name,
        dir,
        method,
        compressedSize,
        uncompressedSize,
        crc32: crc32 >>> 0,
        data: null,
      };

      if (
        !dir &&
        (flags & 0x0001) === 0 &&
        dataStart >= 0 &&
        dataStart <= b.length &&
        (method === 0 || method === 8) &&
        uncompressedSize <= MAX_UNCOMPRESSED
      ) {
        if (method === 8) {
          const stop = compressedSize > 0 ? Math.min(b.length, dataStart + compressedSize) : b.length;
          const raw = b.subarray(dataStart, stop);
          try {
            entry.data = inflateRawSync(raw, INFLATE_OPTIONS);
            if (uncompressedSize === 0 && entry.data) {
              uncompressedSize = entry.data.length;
              entry.uncompressedSize = uncompressedSize;
              entry.compressedSize = raw.length;
              compressedSize = raw.length;
            }
          } catch {
            entry.data = null;
          }
        } else if (uncompressedSize > 0) {
          const end = Math.min(b.length, dataStart + uncompressedSize);
          entry.data = Buffer.from(b.subarray(dataStart, end));
          entry.compressedSize = end - dataStart;
          compressedSize = entry.compressedSize;
        }
      }

      out.push(entry);

      const advance = dataStart + (compressedSize > 0 ? compressedSize : 0);
      p = advance > p ? advance : p + 30;
    }
  } catch {
    // 忽略，返回已解析部分
  }
  return out;
}

/**
 * 读取 ZIP 内容。
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer ZIP 字节
 * @returns {Array<{name:string, dir:boolean, method:number, compressedSize:number,
 *   uncompressedSize:number, crc32:number, data:Buffer|null}>}
 */
export function readZip(buffer) {
  const entries = [];
  try {
    const b = toBuffer(buffer);
    if (!b || b.length < 4) return entries;

    const eocd = findEocd(b);
    if (eocd < 0) return readLocalOnly(b);

    const info = readEocdInfo(b, eocd);
    const start = locateCentralStart(b, info.cdOffset);
    if (start < 0) return readLocalOnly(b);

    parseCentralEntries(b, start, info, entries);
    if (entries.length === 0) return readLocalOnly(b);
  } catch {
    // 优雅降级：返回已经解析出的条目
  }
  return entries;
}
