/**
 * qrcode.js — 零依赖二维码编码器（ESM / Node 18+）
 *
 * 从零实现 ISO/IEC 18004 二维码编码：
 *   - 模式：numeric(0001) / alphanumeric(0010) / byte(0100, UTF-8)
 *   - 版本 1..40（容量不足时自动选择最小可容纳版本）
 *   - GF(256) / 本原多项式 0x11D 上的 Reed-Solomon 纠错
 *   - 分块 + 数据/纠错码字轮转交错
 *   - 功能图形：定位图案、分隔符、校正图案、时序图案、暗模块
 *   - 版本信息 BCH(18,6) 0x1F25（版本 >= 7），格式信息 BCH(15,5) 0x537 ^ 0x5412
 *   - 8 种掩码 + 4 条惩罚规则，选择最低分掩码
 *
 * 仅使用 Node 内置能力（TextEncoder / Buffer），PNG 输出复用同目录的 png.js。
 */

import { encodePNGGray } from './png.js';

/** 支持的最大版本。 */
const MAX_VERSION = 40;

/** 每版本 / 每纠错等级的「每块纠错码字数」。索引 0 是占位（-1）。 */
const ECC_CODEWORDS_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

/** 每版本 / 每纠错等级的「RS 块数量」。索引 0 是占位（-1）。 */
const NUM_ERROR_CORRECTION_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

/** 格式信息中的纠错等级编码（2 bit）。 */
const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/** 模式指示符。 */
const MODE_INDICATOR = { numeric: 0b0001, alphanumeric: 0b0010, byte: 0b0100 };

/** 字母数字模式的字符集（值即索引）。 */
const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

// ---------------------------------------------------------------------------
// GF(256) — 本原多项式 0x11D
// ---------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  // GF_LOG[0] 未定义（0 没有对数），乘法里单独处理。
})();

/**
 * GF(256) 乘法。
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/**
 * RS 生成多项式，系数按「从最高次到最低次、去掉首项 1」排列。
 * 即 (x - α^0)(x - α^1)...(x - α^(degree-1)) 去掉 x^degree。
 * @param {number} degree
 * @returns {Uint8Array} 长度 degree
 */
function reedSolomonComputeDivisor(degree) {
  if (degree < 1 || degree > 255) throw new RangeError('RS degree out of range: ' + degree);
  const result = new Uint8Array(degree);
  result[degree - 1] = 1; // 从单项式 x^0 开始

  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/**
 * 计算 data 对 divisor 取模的 RS 余数（即纠错码字）。
 * @param {Uint8Array|number[]} data
 * @param {Uint8Array} divisor
 * @returns {Uint8Array} 长度 = divisor.length
 */
function reedSolomonComputeRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (let k = 0; k < data.length; k++) {
    const factor = data[k] ^ result[0];
    // 左移一位
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 容量 / 尺寸计算
// ---------------------------------------------------------------------------

/**
 * 版本 ver 的原始数据模块数（含纠错，未扣除功能图形占用的比特）。
 * @param {number} ver
 * @returns {number}
 */
function getNumRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/**
 * 总码字数（数据 + 纠错）。
 * @param {number} ver
 * @returns {number}
 */
function getTotalCodewords(ver) {
  return Math.floor(getNumRawDataModules(ver) / 8);
}

/**
 * 数据码字数。
 * @param {number} ver
 * @param {string} ecc
 * @returns {number}
 */
function getNumDataCodewords(ver, ecc) {
  return (
    getTotalCodewords(ver) -
    ECC_CODEWORDS_PER_BLOCK[ecc][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecc][ver]
  );
}

/**
 * 校正图案中心坐标表。
 * @param {number} ver
 * @returns {number[]}
 */
function getAlignmentPatternPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

/**
 * 字符计数指示符的比特数。
 * @param {string} mode
 * @param {number} ver
 * @returns {number}
 */
function numCharCountBits(mode, ver) {
  const idx = ver <= 9 ? 0 : ver <= 26 ? 1 : 2;
  if (mode === 'numeric') return [10, 12, 14][idx];
  if (mode === 'alphanumeric') return [9, 11, 13][idx];
  return [8, 16, 16][idx]; // byte
}

// ---------------------------------------------------------------------------
// 文本 -> 比特流
// ---------------------------------------------------------------------------

/**
 * @param {string} text
 * @returns {string}
 */
function chooseMode(text) {
  if (/^[0-9]+$/.test(text)) return 'numeric';
  if (/^[0-9A-Z $%*+\-.\/:]+$/.test(text)) return 'alphanumeric';
  return 'byte';
}

/**
 * @param {string} text
 * @returns {Uint8Array}
 */
function toUtf8Bytes(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

/**
 * 数字模式：3 位 -> 10 bit，2 位 -> 7 bit，1 位 -> 4 bit。
 * @param {string} text
 * @returns {number[]} 0/1 数组
 */
function encodeNumericPayload(text) {
  const bits = [];
  for (let i = 0; i < text.length; i += 3) {
    const chunk = text.substring(i, i + 3);
    const value = parseInt(chunk, 10);
    const len = chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4;
    for (let j = len - 1; j >= 0; j--) bits.push((value >>> j) & 1);
  }
  return bits;
}

/**
 * 字母数字模式：2 个字符 -> 11 bit，1 个字符 -> 6 bit。
 * @param {string} text
 * @returns {number[]}
 */
function encodeAlphanumericPayload(text) {
  const bits = [];
  let i = 0;
  for (; i + 1 < text.length; i += 2) {
    const value =
      ALPHANUMERIC_CHARSET.indexOf(text[i]) * 45 + ALPHANUMERIC_CHARSET.indexOf(text[i + 1]);
    for (let j = 10; j >= 0; j--) bits.push((value >>> j) & 1);
  }
  if (i < text.length) {
    const value = ALPHANUMERIC_CHARSET.indexOf(text[i]);
    for (let j = 5; j >= 0; j--) bits.push((value >>> j) & 1);
  }
  return bits;
}

/**
 * 字节模式：每字节 8 bit（MSB 优先）。
 * @param {Uint8Array} bytes
 * @returns {number[]}
 */
function encodeBytePayload(bytes) {
  const bits = [];
  for (let k = 0; k < bytes.length; k++) {
    const b = bytes[k];
    for (let j = 7; j >= 0; j--) bits.push((b >>> j) & 1);
  }
  return bits;
}

/**
 * 构造最终数据码字序列（含模式指示符、字符计数、终止符、填充）。
 * @param {string} text
 * @param {string} ecc
 * @param {number} minVersion
 * @returns {{ version: number, codewords: Uint8Array }}
 */
function buildDataCodewords(text, ecc, minVersion) {
  const mode = chooseMode(text);
  const bytes = mode === 'byte' ? toUtf8Bytes(text) : null;
  const payloadBits =
    mode === 'numeric'
      ? encodeNumericPayload(text)
      : mode === 'alphanumeric'
        ? encodeAlphanumericPayload(text)
        : encodeBytePayload(bytes);
  const charCount = mode === 'byte' ? bytes.length : text.length;

  let version = minVersion;
  for (; version <= MAX_VERSION; version++) {
    const capacityBits = getNumDataCodewords(version, ecc) * 8;
    if (4 + numCharCountBits(mode, version) + payloadBits.length <= capacityBits) break;
  }
  if (version > MAX_VERSION) {
    throw new RangeError(
      `data too long for QR version ${MAX_VERSION} at ECC level ${ecc} (mode=${mode}, chars=${charCount})`,
    );
  }

  const capacityBits = getNumDataCodewords(version, ecc) * 8;
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(MODE_INDICATOR[mode], 4);
  push(charCount, numCharCountBits(mode, version));
  for (let i = 0; i < payloadBits.length; i++) bits.push(payloadBits[i]);

  // 终止符（最多 4 个 0）
  const terminator = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminator; i++) bits.push(0);
  // 补齐到字节边界
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(capacityBits / 8);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords[i / 8] = byte;
  }
  // 填充码字 0xEC / 0x11 交替
  for (let i = bits.length / 8, pad = 0xec; i < codewords.length; i++, pad ^= 0xec ^ 0x11) {
    codewords[i] = pad;
  }

  return { version, codewords };
}

/**
 * 分块 + RS 纠错 + 交错。
 * @param {Uint8Array} data 数据码字
 * @param {number} version
 * @param {string} ecc
 * @returns {Uint8Array} 交错后的完整码字序列
 */
function addEccAndInterleave(data, version, ecc) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version];
  const totalCodewords = getTotalCodewords(version);
  const totalDataCodewords = totalCodewords - numBlocks * blockEccLen;

  const shortBlockDataLen = Math.floor(totalDataCodewords / numBlocks);
  const numShortBlocks = numBlocks - (totalDataCodewords % numBlocks);
  const numLongBlocks = numBlocks - numShortBlocks;

  const divisor = reedSolomonComputeDivisor(blockEccLen);

  const blocks = [];
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const len = shortBlockDataLen + (i < numShortBlocks ? 0 : 1);
    const blockData = data.subarray(k, k + len);
    k += len;
    blocks.push({ data: blockData, ecc: reedSolomonComputeRemainder(blockData, divisor) });
  }
  if (k !== totalDataCodewords) throw new Error('internal: block split mismatch');

  const result = new Uint8Array(totalCodewords);
  let out = 0;
  const maxDataLen = shortBlockDataLen + (numLongBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < blocks[b].data.length) result[out++] = blocks[b].data[i];
    }
  }
  for (let i = 0; i < blockEccLen; i++) {
    for (let b = 0; b < blocks.length; b++) result[out++] = blocks[b].ecc[i];
  }
  if (out !== totalCodewords) throw new Error('internal: interleave mismatch');
  return result;
}

// ---------------------------------------------------------------------------
// 掩码与惩罚
// ---------------------------------------------------------------------------

/**
 * 掩码条件：返回 true 表示该 (x, y) 需要翻转。
 * @param {number} mask 0..7
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function maskCondition(mask, x, y) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new RangeError('invalid mask: ' + mask);
  }
}

/**
 * @param {number} currentRunLength
 * @param {number[]} runHistory 长度 7
 * @param {number} size
 */
function finderPenaltyAddHistory(currentRunLength, runHistory, size) {
  if (runHistory[0] === 0) currentRunLength += size; // 给起始游程加上浅色边界
  runHistory.pop();
  runHistory.unshift(currentRunLength);
}

/**
 * @param {number[]} runHistory
 * @returns {number}
 */
function finderPenaltyCountPatterns(runHistory) {
  const n = runHistory[1];
  const core =
    n > 0 &&
    runHistory[2] === n &&
    runHistory[3] === n * 3 &&
    runHistory[4] === n &&
    runHistory[5] === n;
  return (
    (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
    (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
  );
}

/**
 * @param {boolean} currentRunColor
 * @param {number} currentRunLength
 * @param {number[]} runHistory
 * @param {number} size
 * @returns {number}
 */
function finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory, size) {
  if (currentRunColor) {
    finderPenaltyAddHistory(currentRunLength, runHistory, size);
    currentRunLength = 0;
  }
  currentRunLength += size; // 末尾加上浅色边界
  finderPenaltyAddHistory(currentRunLength, runHistory, size);
  return finderPenaltyCountPatterns(runHistory);
}

/**
 * 四条惩罚规则的总分。
 * @param {boolean[][]} modules
 * @returns {number}
 */
function getPenaltyScore(modules) {
  const size = modules.length;
  let result = 0;

  // 规则 1（行）+ 规则 3（行内 1:1:3:1:1 类定位图案）
  for (let y = 0; y < size; y++) {
    let runColor = false;
    let runX = 0;
    const runHistory = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      if (modules[y][x] === runColor) {
        runX++;
        if (runX === 5) result += PENALTY_N1;
        else if (runX > 5) result++;
      } else {
        finderPenaltyAddHistory(runX, runHistory, size);
        if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
        runColor = modules[y][x];
        runX = 1;
      }
    }
    result += finderPenaltyTerminateAndCount(runColor, runX, runHistory, size) * PENALTY_N3;
  }

  // 规则 1（列）+ 规则 3（列内）
  for (let x = 0; x < size; x++) {
    let runColor = false;
    let runY = 0;
    const runHistory = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      if (modules[y][x] === runColor) {
        runY++;
        if (runY === 5) result += PENALTY_N1;
        else if (runY > 5) result++;
      } else {
        finderPenaltyAddHistory(runY, runHistory, size);
        if (!runColor) result += finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
        runColor = modules[y][x];
        runY = 1;
      }
    }
    result += finderPenaltyTerminateAndCount(runColor, runY, runHistory, size) * PENALTY_N3;
  }

  // 规则 2：2x2 同色块
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  // 规则 4：深浅比例偏离 50%
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
  }
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;

  return result;
}

// ---------------------------------------------------------------------------
// 主编码流程
// ---------------------------------------------------------------------------

/**
 * @param {string} text
 * @param {object} [options]
 * @returns {{ size: number, modules: boolean[][], version: number, ecc: string, mask: number }}
 */
function encodeMatrix(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');

  const ecc = normalizeEcc(options.ecc);
  const minVersion = normalizeVersion(options.version);

  const { version, codewords } = buildDataCodewords(text, ecc, minVersion);
  const allCodewords = addEccAndInterleave(codewords, version, ecc);

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunctionModule = (x, y, isDark) => {
    modules[y][x] = isDark;
    isFunction[y][x] = true;
  };

  const drawFinderPattern = (x, y) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) {
          setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };

  const drawAlignmentPattern = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  const drawFormatBits = (mask) => {
    const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    if (bits >>> 15 !== 0) throw new Error('internal: format bits overflow');

    // 第一副本
    for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getBit(bits, i));
    setFunctionModule(8, 7, getBit(bits, 6));
    setFunctionModule(8, 8, getBit(bits, 7));
    setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getBit(bits, i));

    // 第二副本
    for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, getBit(bits, i));

    // 暗模块
    setFunctionModule(8, size - 8, true);
  };

  const drawVersionBits = () => {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    if (bits >>> 18 !== 0) throw new Error('internal: version bits overflow');
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(a, b, color);
      setFunctionModule(b, a, color);
    }
  };

  // --- 功能图形 ---
  // 时序图案
  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }
  // 定位图案（含分隔符：dist == 4 的浅色外框）
  drawFinderPattern(3, 3);
  drawFinderPattern(size - 4, 3);
  drawFinderPattern(3, size - 4);
  // 校正图案
  const alignPos = getAlignmentPatternPositions(version);
  const numAlign = alignPos.length;
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      const corner =
        (i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0);
      if (!corner) drawAlignmentPattern(alignPos[i], alignPos[j]);
    }
  }
  // 先用 mask=0 占位，稍后重写
  drawFormatBits(0);
  drawVersionBits();

  // --- 数据放置（右下角起，两列一组蛇形）---
  let bitIndex = 0;
  const totalBits = allCodewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // 跳过竖直时序图案列
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < totalBits) {
          modules[y][x] = getBit(allCodewords[bitIndex >>> 3], 7 - (bitIndex & 7));
          bitIndex++;
        }
      }
    }
  }
  if (bitIndex !== totalBits) throw new Error('internal: not all codeword bits placed');

  // --- 选择掩码 ---
  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!isFunction[y][x] && maskCondition(mask, x, y)) modules[y][x] = !modules[y][x];
      }
    }
  };

  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormatBits(mask);
    const score = getPenaltyScore(modules);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
    applyMask(mask); // 再异或一次即还原（功能模块不受影响）
  }
  applyMask(bestMask);
  drawFormatBits(bestMask);

  return { size, modules, version, ecc, mask: bestMask };
}

/**
 * @param {number} x
 * @param {number} i
 * @returns {boolean}
 */
function getBit(x, i) {
  return ((x >>> i) & 1) !== 0;
}

/**
 * @param {*} ecc
 * @returns {string}
 */
function normalizeEcc(ecc) {
  if (ecc === undefined || ecc === null) return 'M';
  const value = String(ecc).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(ECC_FORMAT_BITS, value)) {
    throw new RangeError(`invalid ecc level: ${ecc} (expected L, M, Q or H)`);
  }
  return value;
}

/**
 * @param {*} version
 * @returns {number}
 */
function normalizeVersion(version) {
  if (version === undefined || version === null) return 1;
  if (!Number.isInteger(version) || version < 1 || version > MAX_VERSION) {
    throw new RangeError(`invalid version: ${version} (expected integer 1..${MAX_VERSION})`);
  }
  return version;
}

/**
 * @param {*} value
 * @param {number} fallback
 * @param {string} name
 * @returns {number}
 */
function normalizePositiveInt(value, fallback, name) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 生成二维码模块矩阵。
 *
 * @param {string} text
 * @param {{ ecc?: 'L'|'M'|'Q'|'H', version?: number, margin?: number, scale?: number }} [options]
 *   `version` 作为**最小版本**，容量不足时自动升到能容纳的最小版本。
 * @returns {{ size: number, modules: boolean[][], version: number, ecc: string, mask: number }}
 *   `modules[y][x] === true` 表示深色。
 */
export function qrMatrix(text, options = {}) {
  return encodeMatrix(text, options);
}

/**
 * 生成 SVG 字符串。
 * @param {string} text
 * @param {{ ecc?: string, version?: number, margin?: number, scale?: number, dark?: string, light?: string }} [options]
 * @returns {string}
 */
export function qrToSvg(text, options = {}) {
  const { margin = 2, scale = 8, dark = '#000000', light = '#ffffff' } = options;
  const safeMargin = normalizePositiveInt(margin, 2, 'margin');
  const safeScale = normalizePositiveInt(scale, 8, 'scale');
  if (safeScale < 1) throw new RangeError('scale must be >= 1');

  const { size, modules } = encodeMatrix(text, options);
  const dim = (size + safeMargin * 2) * safeScale;

  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) {
        const px = (x + safeMargin) * safeScale;
        const py = (y + safeMargin) * safeScale;
        path += `M${px} ${py}h${safeScale}v${safeScale}h-${safeScale}z`;
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ` +
    `viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="${light}"/>` +
    (path ? `<path d="${path}" fill="${dark}"/>` : '') +
    `</svg>`
  );
}

/**
 * 生成灰度 PNG（Buffer）。`dark` / `light` 颜色选项对灰度 PNG 不适用。
 * @param {string} text
 * @param {{ ecc?: string, version?: number, margin?: number, scale?: number }} [options]
 * @returns {Buffer}
 */
export function qrToPng(text, options = {}) {
  const { margin = 2, scale = 8 } = options;
  const safeMargin = normalizePositiveInt(margin, 2, 'margin');
  const safeScale = normalizePositiveInt(scale, 8, 'scale');
  if (safeScale < 1) throw new RangeError('scale must be >= 1');

  const { size, modules } = encodeMatrix(text, options);
  const dim = (size + safeMargin * 2) * safeScale;
  const gray = new Uint8Array(dim * dim).fill(255);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y][x]) continue;
      const x0 = (x + safeMargin) * safeScale;
      const y0 = (y + safeMargin) * safeScale;
      for (let dy = 0; dy < safeScale; dy++) {
        const rowStart = (y0 + dy) * dim;
        gray.fill(0, rowStart + x0, rowStart + x0 + safeScale);
      }
    }
  }

  return encodePNGGray({ width: dim, height: dim, gray });
}

/**
 * 生成 data URL。
 * @param {string} text
 * @param {{ ecc?: string, version?: number, margin?: number, scale?: number }} [options]
 * @returns {string} `data:image/png;base64,...`
 */
export function qrDataUrl(text, options = {}) {
  return 'data:image/png;base64,' + qrToPng(text, options).toString('base64');
}

export default { qrMatrix, qrToSvg, qrToPng, qrDataUrl };
