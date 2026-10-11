/**
 * png.js — 零依赖 PNG 编码器（ESM / Node 18+）
 *
 * 只使用 Node 内置模块 `node:zlib`。不依赖任何 npm 包。
 *
 * 支持：
 *   - color type 6 (RGBA, bit depth 8)  -> encodePNG
 *   - color type 0 (grayscale, bit depth 8) -> encodePNGGray
 *   - 扫描行滤波：自适应选择 None(0) / Sub(1) / Up(2)
 *     （标准的最小绝对差启发式，byte 按有符号解释后取绝对值求和）
 *
 * PNG 结构：签名 + IHDR + IDAT + IEND，每个 chunk 带 CRC32。
 */

import zlib from 'node:zlib';

/** 8 字节 PNG 文件签名。 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC-32 (IEEE 802.3, 反射多项式 0xEDB88320) 查找表。 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * 计算 CRC-32。
 * @param {Uint8Array|Buffer} buffer
 * @returns {number} 无符号 32 位整数
 */
export function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 读取大端 32 位无符号整数。
 * @param {Uint8Array|Buffer} buffer
 * @param {number} offset
 * @returns {number}
 */
function readUint32BE(buffer, offset) {
  return (
    ((buffer[offset] << 24) |
      (buffer[offset + 1] << 16) |
      (buffer[offset + 2] << 8) |
      buffer[offset + 3]) >>>
    0
  );
}

/**
 * 构造一个 PNG chunk：length(4) + type(4) + data + crc(4)。
 * @param {string} type 4 个 ASCII 字符
 * @param {Buffer} data
 * @returns {Buffer}
 */
function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'latin1');
  if (typeBuffer.length !== 4) throw new Error(`chunk type must be 4 chars: ${type}`);
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * 构造 IHDR chunk（13 字节数据）。
 * @param {number} width
 * @param {number} height
 * @param {number} colorType 0=grayscale, 6=RGBA
 * @returns {Buffer}
 */
function makeIhdr(width, height, colorType) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8; // bit depth
  data[9] = colorType;
  data[10] = 0; // compression method: deflate
  data[11] = 0; // filter method: adaptive
  data[12] = 0; // interlace: none
  return data;
}

/**
 * 把像素数据转换成带滤波字节的扫描行序列。
 * @param {Uint8Array|Buffer} pixels 原始像素（未滤波），长度 width*height*bpp
 * @param {number} width
 * @param {number} height
 * @param {number} bpp 每像素字节数（灰度 1，RGBA 4）
 * @returns {Buffer} 长度 height*(width*bpp+1)
 */
function buildRawScanlines(pixels, width, height, bpp) {
  const stride = width * bpp;
  const raw = Buffer.allocUnsafe(height * (stride + 1));

  /** 上一行的**原始**（未滤波）字节，滤波类型 2 (Up) 的参考行。 */
  let prev = null;
  const cur = Buffer.allocUnsafe(stride);
  // 滤波候选缓冲区，只分配一次
  const none = Buffer.allocUnsafe(stride);
  const sub = Buffer.allocUnsafe(stride);
  const up = Buffer.allocUnsafe(stride);

  for (let y = 0; y < height; y++) {
    const base = y * stride;
    for (let i = 0; i < stride; i++) cur[i] = pixels[base + i];

    let scoreNone = 0;
    let scoreSub = 0;
    let scoreUp = 0;
    for (let i = 0; i < stride; i++) {
      const rawByte = cur[i];
      const left = i >= bpp ? cur[i - bpp] : 0;
      const above = prev !== null ? prev[i] : 0;

      none[i] = rawByte;
      sub[i] = (rawByte - left) & 0xff;
      up[i] = (rawByte - above) & 0xff;

      // 标准启发式：byte 按有符号解释后取绝对值
      scoreNone += rawByte < 128 ? rawByte : 256 - rawByte;
      scoreSub += sub[i] < 128 ? sub[i] : 256 - sub[i];
      scoreUp += up[i] < 128 ? up[i] : 256 - up[i];
    }

    let filter = 0;
    let best = scoreNone;
    let chosen = none;
    if (scoreSub < best) {
      filter = 1;
      best = scoreSub;
      chosen = sub;
    }
    if (scoreUp < best) {
      filter = 2;
      chosen = up;
    }

    const rowStart = y * (stride + 1);
    raw[rowStart] = filter;
    chosen.copy(raw, rowStart + 1);
    prev = Buffer.from(cur); // 必须复制：cur 下一轮会被覆写
  }
  return raw;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} colorType
 * @param {Uint8Array|Buffer} pixels
 * @param {number} bpp
 * @returns {Buffer}
 */
function encodeImage(width, height, colorType, pixels, bpp) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError('width and height must be positive integers');
  }
  if (width > 0x7fffffff || height > 0x7fffffff) {
    throw new RangeError('width and height must fit in 31 bits');
  }
  const expected = width * height * bpp;
  if (!pixels || typeof pixels.length !== 'number') {
    throw new TypeError('pixel buffer is required');
  }
  if (pixels.length !== expected) {
    throw new TypeError(`pixel buffer must have length ${expected}, got ${pixels.length}`);
  }

  const raw = buildRawScanlines(pixels, width, height, bpp);
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', makeIhdr(width, height, colorType)),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * 编码 8 位 RGBA（color type 6）PNG。
 * @param {{ width: number, height: number, rgba: Uint8Array|Buffer }} params
 * @returns {Buffer}
 */
export function encodePNG({ width, height, rgba } = {}) {
  return encodeImage(width, height, 6, rgba, 4);
}

/**
 * 编码 8 位灰度（color type 0）PNG。0 = 黑，255 = 白。
 * @param {{ width: number, height: number, gray: Uint8Array|Buffer }} params
 * @returns {Buffer}
 */
export function encodePNGGray({ width, height, gray } = {}) {
  return encodeImage(width, height, 0, gray, 1);
}

/**
 * 从 IHDR 读取尺寸。不是有效 PNG（或不是以 IHDR 开头）时返回 null。
 * @param {Uint8Array|Buffer} buffer
 * @returns {{ width: number, height: number } | null}
 */
export function pngSize(buffer) {
  if (!buffer || typeof buffer.length !== 'number' || buffer.length < 24) return null;
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== PNG_SIGNATURE[i]) return null;
  }
  if (
    buffer[12] !== 0x49 || // 'I'
    buffer[13] !== 0x48 || // 'H'
    buffer[14] !== 0x44 || // 'D'
    buffer[15] !== 0x52 //   'R'
  ) {
    return null;
  }
  return { width: readUint32BE(buffer, 16), height: readUint32BE(buffer, 20) };
}

export default { encodePNG, encodePNGGray, pngSize, crc32 };
