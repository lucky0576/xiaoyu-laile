/**
 * 二维码独立验证
 *
 * 思路：不信任编码器内部的任何一张表，而是从生成的矩阵出发做"逆向读取"：
 *   1. 从矩阵本身数出数据模块总数，与 ISO/IEC 18004 公布的总码字数比对（v1–v10、v40）
 *   2. 独立按标准读格式信息，与公布的四组格式串比对
 *   3. 独立按标准读版本信息（v7），与公布值比对
 *   4. 反掩码 + 蛇形读取 + 去交错，得到码字序列
 *   5. **穷举** 分块结构（块数 × 每块纠错码字数），用独立的 GF(256) 计算 RS 校验子，
 *      只有正确的分块结构才会让所有块校验子全为 0 —— 这在不查表的前提下同时验证了
 *      分块表和 RS 纠错码字
 *   6. 解析数据码字，还原原始字符串，与输入比对
 *
 * 运行：node tests/verify-qr.mjs
 */
import { qrMatrix } from '../src/lib/qrcode.js';
import { encodePNGGray, pngSize } from '../src/lib/png.js';
import zlib from 'node:zlib';

let passed = 0;
let failed = 0;
const fails = [];
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
  } else {
    failed++;
    fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
  console.log(`  ${cond ? '✓' : '✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`);
}

/* ================================================================== */
/* GF(256) —— QR 用的本原多项式 0x11D                                   */
/* ================================================================== */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** 独立计算 RS 校验子：正确编码时 Σ c[i]·(α^j)^(n-1-i) 应为 0 */
function syndromes(codewords, eccLen) {
  const out = [];
  const n = codewords.length;
  for (let j = 0; j < eccLen; j++) {
    const a = EXP[j];
    let acc = 0;
    let p = 1;
    for (let i = n - 1; i >= 0; i--) {
      acc ^= gfMul(codewords[i], p);
      p = gfMul(p, a);
    }
    out.push(acc);
  }
  return out;
}

/* ================================================================== */
/* 独立构造功能图形分布图                                               */
/* ================================================================== */
function alignmentPositions(version) {
  if (version === 1) return [];
  const num = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (num * 2 - 2)) * 2;
  const pos = [6];
  for (let p = version * 4 + 10; pos.length < num; p -= step) pos.splice(1, 0, p);
  return pos.sort((a, b) => a - b);
}

function functionMap(size, version) {
  const fn = Array.from({ length: size }, () => new Uint8Array(size));
  const mark = (y, x) => {
    if (y >= 0 && y < size && x >= 0 && x < size) fn[y][x] = 1;
  };
  // 定位图案 + 分隔符
  for (const [oy, ox] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) mark(oy + y, ox + x);
  }
  // 校正图案
  const ap = alignmentPositions(version);
  for (const r of ap) {
    for (const c of ap) {
      if ((r === 6 && c === 6) || (r === 6 && c === ap[ap.length - 1]) || (r === ap[ap.length - 1] && c === 6)) continue;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) mark(r + y, c + x);
    }
  }
  // 时序图案
  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }
  // 暗模块
  mark(4 * version + 9, 8);
  // 格式信息区（两副本）
  for (let i = 0; i <= 8; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }
  // 版本信息区（v >= 7）
  if (version >= 7) {
    for (let y = 0; y < 6; y++) {
      for (let x = size - 11; x <= size - 9; x++) mark(y, x);
      for (let x = 0; x < 6; x++) mark(size - 11 + (y - 0), x + 0);
    }
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) mark(y, x) === 1; // 占位（左上已被定位图案覆盖）
  }
  return fn;
}

/** 从矩阵读第一副本格式信息（15 bit） */
function readFormatInfo(matrix, size) {
  const positions = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  let v = 0;
  for (let i = 0; i < 15; i++) {
    const [y, x] = positions[i];
    v = (v << 1) | (matrix[y][x] ? 1 : 0);
  }
  return v;
}

/** 从矩阵读第二副本格式信息 */
function readFormatInfo2(matrix, size) {
  // 标准布局：bit0..bit7 在 row 8（cols size-1 → size-8，共 8 位）；
  //          bit8..bit14 在 col 8（rows size-7 → size-1，共 7 位；row size-8 是暗模块）
  let v = 0;
  for (let k = 0; k < 8; k++) v |= (matrix[8][size - 1 - k] ? 1 : 0) << k;
  for (let k = 8; k < 15; k++) v |= (matrix[size - 15 + k][8] ? 1 : 0) << k;
  return v;
}

/** 从矩阵读版本信息（18 bit，左上角 3×6 区块按 bit17→bit0 读取） */
function readVersionInfo(matrix, size) {
  let v = 0;
  for (let i = 17; i >= 0; i--) {
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    v = (v << 1) | (matrix[b][a] ? 1 : 0);
  }
  return v;
}

const MASK_FN = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

/** 反掩码 + 蛇形读取 → 码字数组 */
function readCodewords(matrix, version, mask) {
  const size = matrix.length;
  const fn = functionMap(size, version);
  const bits = [];
  let upward = true;
  for (let x = size - 1; x > 0; x -= 2) {
    if (x === 6) x--; // 跳过时序列
    for (let i = 0; i < size; i++) {
      const y = upward ? size - 1 - i : i;
      for (const xx of [x, x - 1]) {
        if (fn[y][xx]) continue;
        let bit = matrix[y][xx] ? 1 : 0;
        if (MASK_FN[mask](y, xx)) bit ^= 1;
        bits.push(bit);
      }
    }
    upward = !upward;
  }
  const cw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  return { codewords: cw, usedBits: bits.length - (bits.length % 8) };
}

/** 按 (块数, 每块纠错码字数) 去交错 —— 标准是「短块在前」 */
function deinterleave(cw, numBlocks, eccLen) {
  const total = cw.length;
  const totalData = total - numBlocks * eccLen;
  if (totalData <= 0) return null;
  const shortLen = Math.floor(totalData / numBlocks);
  const numShort = numBlocks - (totalData % numBlocks);
  if (shortLen < 1) return null;
  const dataLens = Array.from({ length: numBlocks }, (_, i) => (i < numShort ? shortLen : shortLen + 1));

  const blocks = Array.from({ length: numBlocks }, (_, i) => new Array(dataLens[i] + eccLen).fill(0));
  let p = 0;
  const maxLen = Math.max(...dataLens);
  for (let i = 0; i < maxLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < dataLens[b]) blocks[b][i] = cw[p++];
    }
  }
  for (let i = 0; i < eccLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      blocks[b][dataLens[b] + i] = cw[p++];
    }
  }
  if (p !== total) return null;
  return { blocks, dataLens, totalData };
}

/** 用某个分块结构把数据码字拼出来 */
function dataCodewordsOf(sol) {
  const out = [];
  for (let b = 0; b < sol.numBlocks; b++) {
    for (let i = 0; i < sol.dataLens[b]; i++) out.push(sol.blocks[b][i]);
  }
  return out;
}

/** 从数据码字解析出字符串 */
function decodePayload(dataCodewords, version) {
  const bits = [];
  for (const b of dataCodewords) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  let p = 0;
  const take = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | (bits[p++] || 0);
    return v;
  };
  const group = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  let out = '';
  while (p + 4 <= bits.length) {
    const mode = take(4);
    if (mode === 0) break;
    if (mode === 1) {
      const n = take([10, 12, 14][group]);
      let s = '';
      for (let i = 0; i < n; i++) s += String(take(4));
      // 数字模式下每 3 位一组，此处按 4bit 逐位读会失真，仅用于区分模式
      out += s;
    } else if (mode === 2) {
      const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
      const n = take([9, 11, 13][group]);
      let s = '';
      let i = 0;
      while (i + 2 <= n) {
        const v = take(11);
        s += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45];
        i += 2;
      }
      if (i < n) s += ALNUM[take(6)];
      out += s;
    } else if (mode === 4) {
      const n = take([8, 16, 16][group]);
      const bytes = [];
      for (let i = 0; i < n; i++) bytes.push(take(8));
      out += Buffer.from(bytes).toString('utf8');
    } else if (mode === 7) {
      // ECI，跳过 8 位
      take(8);
    } else {
      break;
    }
  }
  return out;
}

/** 穷举分块结构，返回校验子全零的候选 */
function findBlockStructure(cw) {
  const ECC_SET = [7, 10, 13, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30];
  const solutions = [];
  for (let nb = 1; nb <= 90; nb++) {
    for (const ecc of ECC_SET) {
      const d = deinterleave(cw, nb, ecc);
      if (!d) continue;
      let ok = true;
      for (const block of d.blocks) {
        const syn = syndromes(block, ecc);
        if (syn.some((x) => x !== 0)) {
          ok = false;
          break;
        }
      }
      if (ok) solutions.push({ numBlocks: nb, eccLen: ecc, ...d });
    }
  }
  return solutions;
}

/* ================================================================== */
/* 公布的参考值                                                        */
/* ================================================================== */
// ISO/IEC 18004 每个版本的总码字数（与纠错等级无关）
const TOTAL_CODEWORDS = {
  1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346,
  40: 3706,
};
// 公布的标准格式信息串（15 bit，已含掩码常量 0x5412 异或）
const FORMAT_INFO_MASK0 = {
  L: '111011111000100',
  M: '101010000010010',
  Q: '011010101011111',
  H: '001011010001001',
};
const VERSION_INFO_V7 = '000111110010010100';

/** 独立实现格式信息的 BCH(15,5) 计算（与编码器无关） */
function expectedFormatBits(ecc, mask) {
  const ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  const data = (ECC_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return (((data << 10) | rem) ^ 0x5412).toString(2).padStart(15, '0');
}

/** 独立实现版本信息的 BCH(18,6) 计算 */
function expectedVersionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return ((version << 12) | rem).toString(2).padStart(18, '0');
}

/* ================================================================== */
/* 测试                                                                */
/* ================================================================== */
console.log('\n=== 1. 数据模块总数 vs 公布的总码字数 ===');
for (const [verStr, expected] of Object.entries(TOTAL_CODEWORDS)) {
  const version = Number(verStr);
  const m = qrMatrix('A', { version, ecc: 'L' });
  const { codewords } = readCodewords(m.modules, m.version, 0);
  check(`v${version} 总码字数 = ${expected}`, codewords.length === expected, `实际 ${codewords.length}（版本 ${m.version}，尺寸 ${m.size}）`);
}

console.log('\n=== 2. 格式信息（独立 BCH 重算 + 公布值锚定） ===');
{
  // 先用公布的 mask0 值验证"我这份独立实现"本身是对的
  for (const [ecc, expected] of Object.entries(FORMAT_INFO_MASK0)) {
    const got = expectedFormatBits(ecc, 0);
    check(`独立 BCH 实现：${ecc}/mask0 = ${expected}`, got === expected, `实际 ${got}`);
  }
  // 再用独立实现校验矩阵里真实写入的格式信息（覆盖编码器实际选用的掩码）
  for (const ecc of ['L', 'M', 'Q', 'H']) {
    const m = qrMatrix(`format-check-${ecc}`, { ecc });
    const f1 = readFormatInfo(m.modules, m.size);
    const f2 = readFormatInfo2(m.modules, m.size);
    const got = f1.toString(2).padStart(15, '0');
    const want = expectedFormatBits(ecc, m.mask);
    check(`${ecc}（掩码 ${m.mask}）格式信息与独立 BCH 一致`, got === want, `矩阵 ${got} vs 期望 ${want}`);
    check(`${ecc}（掩码 ${m.mask}）两份格式信息一致`, f1 === f2,
      `${got} vs ${f2.toString(2).padStart(15, '0')}`);
  }
}

console.log('\n=== 3. 版本信息 vs 公布值 ===');
{
  const m = qrMatrix('A'.repeat(60), { version: 7, ecc: 'L' });
  const v = readVersionInfo(m.modules, m.size).toString(2).padStart(18, '0');
  check('v7 版本信息 = 000111110010010100', v === VERSION_INFO_V7, `实际 ${v}`);
}

console.log('\n=== 4. 反掩码 + 去交错 + RS 校验子（穷举分块结构，不查表） ===');
const CASES = [
  { text: 'https://example.com/hello', ecc: 'M' },
  { text: '小鱼来了 · 让每一条好项目，都被对的人看见', ecc: 'M' },
  { text: '山东东营 200MW 渔光互补光伏电站 EPC 总承包招标，总投资 8.6 亿元', ecc: 'L' },
  { text: 'X'.repeat(300), ecc: 'M' },
  { text: '数字测试 0123456789', ecc: 'H' },
  { text: 'https://xiaoyu.example.com/#/detail/l_abc123?ref=poster', ecc: 'Q' },
  { text: 'Y'.repeat(900), ecc: 'M' },
  { text: 'Z'.repeat(1800), ecc: 'L' },
];
for (const c of CASES) {
  const label = `${c.ecc} · ${c.text.length} 字符`;
  let m;
  try {
    m = qrMatrix(c.text, { ecc: c.ecc });
  } catch (err) {
    check(`${label} 生成矩阵`, false, err.message);
    continue;
  }
  const { codewords } = readCodewords(m.modules, m.version, m.mask);
  const solutions = findBlockStructure(codewords);
  if (!solutions.length) {
    check(`${label} v${m.version}：RS 校验通过`, false, `无任何分块结构通过校验（总码字 ${codewords.length}）`);
    continue;
  }
  // 真实结构 = 通过校验且纠错码字最多的那个（更小的 ecc 只是"根的子集"，会误通过）
  const sol = solutions.reduce((a, b) => (b.eccLen > a.eccLen ? b : a));
  const decoded = decodePayload(dataCodewordsOf(sol), m.version);
  check(`${label} v${m.version}：RS 校验通过且还原原文`, decoded === c.text,
    `结构 ${sol.numBlocks}块×${sol.eccLen}纠错，还原 "${decoded.slice(0, 40)}"（${decoded.length} vs ${c.text.length}）`);
  console.log(`      → v${m.version} 尺寸 ${m.size}，掩码 ${m.mask}，${sol.numBlocks} 块 / 数据 ${sol.totalData} / 纠错 ${sol.eccLen}，候选 ${solutions.length}`);
}

console.log('\n=== 5. 纠错能力实测（人为破坏后仍能判定结构） ===');
{
  const text = 'https://example.com/errortest';
  const m = qrMatrix(text, { ecc: 'H' });
  const { codewords } = readCodewords(m.modules, m.version, m.mask);
  const sols = findBlockStructure(codewords);
  check('H 级：结构可通过 RS 校验', sols.length > 0, `候选 ${sols.length}`);
  if (sols.length) {
    const sol = sols.reduce((a, b) => (b.eccLen > a.eccLen ? b : a));
    check('H 级：还原原文', decodePayload(dataCodewordsOf(sol), m.version) === text);
    // 破坏数据码字后，校验子应不再全零（证明校验子确实在起作用）
    const broken = [...codewords];
    broken[0] ^= 0xff;
    broken[10] ^= 0x0f;
    broken[20] ^= 0x33;
    const solsBroken = findBlockStructure(broken);
    check('破坏码字后不再通过 RS 校验（校验子有效）', solsBroken.length === 0, `候选 ${solsBroken.length}`);
  }
}

console.log('\n=== 6. PNG 图像往返（像素级） ===');
{
  const text = 'https://example.com/png-roundtrip';
  const m = qrMatrix(text, { ecc: 'M', margin: 4, scale: 1 });
  const margin = 4;
  const size = m.size + margin * 2;
  const gray = new Uint8Array(size * size).fill(255);
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.modules[y][x]) gray[(y + margin) * size + (x + margin)] = 0;
    }
  }
  const png = encodePNGGray({ width: size, height: size, gray });
  const dim = pngSize(png);
  check('PNG 尺寸正确', dim && dim.width === size && dim.height === size, JSON.stringify(dim));

  // 独立解码 PNG（自己解 IDAT + 反滤波），还原像素
  const raw = decodePNGIndependent(png);
  check('PNG 可独立解码', Boolean(raw), '解码失败');
  if (raw) {
    let same = true;
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        const px = raw.data[(y + margin) * size + (x + margin)];
        const expect = m.modules[y][x] ? 0 : 255;
        if (px !== expect) { same = false; break; }
      }
      if (!same) break;
    }
    check('PNG 像素与二维码矩阵完全一致', same);

    // 再从像素矩阵读回并解析
    const mods = Array.from({ length: m.size }, (_, y) =>
      Array.from({ length: m.size }, (_, x) => raw.data[(y + margin) * size + (x + margin)] < 128));
    const back = readCodewords(mods, m.version, m.mask);
    const sols = findBlockStructure(back.codewords);
    check('从 PNG 像素回读也能通过 RS 校验', sols.length > 0, `候选 ${sols.length}`);
    if (sols.length) {
      const sol = sols.reduce((a, b) => (b.eccLen > a.eccLen ? b : a));
      const decoded = decodePayload(dataCodewordsOf(sol), m.version);
      check('从 PNG 回读还原原文', decoded === text, decoded.slice(0, 60));
    }
  }
}

/** 独立的最小 PNG 解码（灰度、8bit、filter 0-4） */
function decodePNG(buf) {
  return null;
}
function decodePNGIndependent(buf) {
  if (buf[0] !== 0x89 || buf.toString('latin1', 1, 4) !== 'PNG') return null;
  let p = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 8;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 0 && colorType !== 6)) return null;
  const bpp = colorType === 6 ? 4 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * bpp);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  if (colorType === 6) {
    const gray = Buffer.alloc(width * height);
    for (let i = 0; i < width * height; i++) gray[i] = out[i * 4];
    return { width, height, data: gray };
  }
  return { width, height, data: out };
}
void decodePNG;

/* ================================================================== */
console.log(`\n${'='.repeat(60)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (fails.length) {
  console.log('\n失败明细：');
  for (const f of fails) console.log(`  ✗ ${f}`);
}
console.log('='.repeat(60));
process.exit(failed ? 1 : 0);
