/**
 * lib-qr.test.mjs — 自测脚本（node:assert，零依赖）
 *
 * 运行： node tests/lib-qr.test.mjs
 *
 * 说明：本文件不依赖任何测试框架；用独立的解码/重算逻辑去交叉验证
 * qrcode.js 与 png.js 的输出（格式信息 BCH、版本信息 BCH、校正图案位置、
 * PNG chunk CRC、扫描行滤波解码、容量表边界）。
 */

import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import { qrMatrix, qrToSvg, qrToPng, qrDataUrl } from '../src/lib/qrcode.js';
import { encodePNG, encodePNGGray, pngSize, crc32 } from '../src/lib/png.js';

let failures = 0;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok   - ' + name);
  } catch (err) {
    failures++;
    console.error('FAIL - ' + name);
    console.error((err && err.stack) || String(err));
  }
}

// ---------------------------------------------------------------------------
// 独立重算工具
// ---------------------------------------------------------------------------

const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/** 独立重算 15 位格式信息。 */
function expectedFormatBits(ecc, mask) {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return (((data << 10) | rem) ^ 0x5412) >>> 0;
}

/** 独立重算 18 位版本信息。 */
function expectedVersionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return ((version << 12) | rem) >>> 0;
}

/** 独立重算校正图案中心位置。 */
function expectedAlignmentPositions(version) {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

/** 从矩阵读取第一份格式信息（与 nayuki 的写入位置对应，bit0 = LSB）。 */
function readFormatBitsCopy1(m) {
  let bits = 0;
  const set = (i, v) => {
    if (v) bits |= 1 << i;
  };
  for (let i = 0; i <= 5; i++) set(i, m[i][8]);
  set(6, m[7][8]);
  set(7, m[8][8]);
  set(8, m[8][7]);
  for (let i = 9; i < 15; i++) set(i, m[8][14 - i]);
  return bits >>> 0;
}

/** 从矩阵读取第二份格式信息。 */
function readFormatBitsCopy2(m) {
  const size = m.length;
  let bits = 0;
  const set = (i, v) => {
    if (v) bits |= 1 << i;
  };
  for (let i = 0; i < 8; i++) set(i, m[8][size - 1 - i]);
  for (let i = 8; i < 15; i++) set(i, m[size - 15 + i][8]);
  return bits >>> 0;
}

/** 从矩阵读取版本信息（右上角那一份）。 */
function readVersionBits(m) {
  const size = m.length;
  let bits = 0;
  const set = (i, v) => {
    if (v) bits |= 1 << i;
  };
  for (let i = 0; i < 18; i++) {
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    set(i, m[b][a]);
  }
  return bits >>> 0;
}

/** 从矩阵读取版本信息（左下角那一份），应与上面相同。 */
function readVersionBitsMirror(m) {
  const size = m.length;
  let bits = 0;
  const set = (i, v) => {
    if (v) bits |= 1 << i;
  };
  for (let i = 0; i < 18; i++) {
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    set(i, m[a][b]);
  }
  return bits >>> 0;
}

// ---------------------------------------------------------------------------
// PNG 解析 / 解码工具
// ---------------------------------------------------------------------------

function splitChunks(png) {
  const chunks = [];
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('latin1', off + 4, off + 8);
    const data = Buffer.from(png.subarray(off + 8, off + 8 + len));
    const crc = png.readUInt32BE(off + 8 + len);
    chunks.push({ type, data, crc, crcInput: png.subarray(off + 4, off + 8 + len) });
    off += 12 + len;
  }
  return chunks;
}

/** 解码 PNG（仅支持 bit depth 8、无隔行、filter 0/1/2）为像素字节。 */
function decodePixels(png, bpp, width, height) {
  const chunks = splitChunks(png);
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);
  const stride = width * bpp;
  assert.equal(raw.length, height * (stride + 1), 'scanline byte length');
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter === 0 || filter === 1 || filter === 2, 'filter type ' + filter);
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const left = i >= bpp ? out[y * stride + i - bpp] : 0;
      const above = y > 0 ? out[(y - 1) * stride + i] : 0;
      out[y * stride + i] = filter === 0 ? v : filter === 1 ? (v + left) & 0xff : (v + above) & 0xff;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

test('BCH 参考值: 格式信息 L/mask0 = 0x77C4, 版本信息 v7 = 0x7C94', () => {
  // ISO/IEC 18004 附录 C 中公布的参考值
  assert.equal(expectedFormatBits('L', 0), 0x77c4);
  assert.equal(expectedFormatBits('L', 0).toString(2).padStart(15, '0'), '111011111000100');
  assert.equal(expectedVersionBits(7), 0x7c94);
  assert.equal(expectedVersionBits(7).toString(2).padStart(18, '0'), '000111110010010100');
});

test('qrMatrix: 基本形状与元信息', () => {
  const cases = [
    ['HELLO WORLD', { ecc: 'Q' }],
    ['hello', {}],
    ['https://example.com/hello', { ecc: 'M' }],
    ['12345678901234567890', { ecc: 'L' }],
    ['中文汉字测试', { ecc: 'H' }],
    ['', {}],
  ];
  for (const [text, opts] of cases) {
    const res = qrMatrix(text, opts);
    assert.equal(res.size, res.version * 4 + 17, 'size for ' + JSON.stringify(text));
    assert.ok(res.version >= 1 && res.version <= 40);
    assert.ok(res.mask >= 0 && res.mask <= 7);
    assert.equal(res.ecc, opts.ecc || 'M');
    assert.equal(res.modules.length, res.size);
    for (const row of res.modules) {
      assert.equal(row.length, res.size);
      for (const cell of row) assert.equal(typeof cell, 'boolean');
    }
  }
});

test('qrMatrix: 三个定位图案与分隔符', () => {
  const res = qrMatrix('https://example.com/hello', { ecc: 'M' });
  const m = res.modules;
  const size = res.size;
  const corners = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];
  for (const [ox, oy] of corners) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        assert.equal(m[oy + dy][ox + dx], dist !== 2, `finder (${ox},${oy}) at +${dx},+${dy}`);
      }
    }
    // 分隔符：定位图案外侧一圈必须是浅色（在范围内时）
    for (let k = -1; k <= 7; k++) {
      const positions = [
        [ox + k, oy - 1],
        [ox + k, oy + 7],
        [ox - 1, oy + k],
        [ox + 7, oy + k],
      ];
      for (const [x, y] of positions) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        assert.equal(m[y][x], false, `separator at ${x},${y}`);
      }
    }
  }
});

test('qrMatrix: 时序图案（跳过校正图案覆盖处）', () => {
  for (const version of [1, 2, 5, 7, 10, 20]) {
    // 文本很短，保证 version 作为“最小版本”被真正采纳
    const res = qrMatrix('TIMING', { ecc: 'L', version });
    assert.equal(res.version, version);
    const m = res.modules;
    const size = res.size;
    const centers = expectedAlignmentPositions(version);
    const covered = (i) => centers.some((c) => Math.abs(i - c) <= 2);
    for (let i = 8; i <= size - 9; i++) {
      if (covered(i)) continue;
      assert.equal(m[6][i], i % 2 === 0, `row timing ${i} v${version}`);
      assert.equal(m[i][6], i % 2 === 0, `col timing ${i} v${version}`);
    }
  }
});

test('qrMatrix: 暗模块在 (8, 4*version+9)', () => {
  for (const version of [1, 4, 7, 14, 20]) {
    const res = qrMatrix('DK' + version, { ecc: 'H', version });
    assert.equal(res.version, version);
    assert.equal(res.modules[4 * version + 9][8], true, 'dark module v' + version);
  }
});

test('qrMatrix: 校正图案位置与形态', () => {
  for (const version of [1, 2, 7, 14, 20]) {
    const res = qrMatrix('ALIGN', { ecc: 'M', version });
    assert.equal(res.version, version);
    const m = res.modules;
    const positions = expectedAlignmentPositions(version);
    const n = positions.length;
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const corner = (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
        if (corner) continue;
        drawn++;
        const cx = positions[i];
        const cy = positions[j];
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            assert.equal(
              m[cy + dy][cx + dx],
              dist !== 1,
              `alignment v${version} center ${cx},${cy} offset ${dx},${dy}`,
            );
          }
        }
      }
    }
    const expectedDrawn = n === 0 ? 0 : n * n - 3; // 版本 1 没有校正图案
    assert.equal(drawn, expectedDrawn, 'alignment count v' + version);
  }
});

test('qrMatrix: 格式信息（两副本 + BCH + 掩码号一致性）', () => {
  const inputs = [
    ['HELLO WORLD', { ecc: 'Q' }],
    ['hello world', { ecc: 'L' }],
    ['https://example.com/hello', { ecc: 'M' }],
    ['12345678901234567890', { ecc: 'H' }],
    ['x'.repeat(200), { ecc: 'Q' }],
  ];
  for (const [text, opts] of inputs) {
    const res = qrMatrix(text, opts);
    const expected = expectedFormatBits(res.ecc, res.mask);
    assert.equal(readFormatBitsCopy1(res.modules), expected, 'format copy1 for ' + text.slice(0, 12));
    assert.equal(readFormatBitsCopy2(res.modules), expected, 'format copy2 for ' + text.slice(0, 12));
  }
});

test('qrMatrix: 版本信息（>=7，两副本 + BCH）', () => {
  for (const version of [7, 10, 20, 32, 40]) {
    const res = qrMatrix('version-info-' + version, { ecc: 'L', version });
    assert.equal(res.version, version);
    const expected = expectedVersionBits(version);
    assert.equal(readVersionBits(res.modules), expected, 'version bits v' + version);
    assert.equal(readVersionBitsMirror(res.modules), expected, 'version bits mirror v' + version);
  }
  // 版本 < 7 不应写入版本信息
  const v6 = qrMatrix('v6check', { ecc: 'L' });
  assert.equal(v6.version, 1);
});

test('模式选择: 数字/字母数字/字节', () => {
  // v1-L 容量: 数字 41 字符, 字母数字 25 字符, 字节 17 字符（ISO/IEC 18004 标准表）
  assert.equal(qrMatrix('1'.repeat(41), { ecc: 'L' }).version, 1);
  assert.equal(qrMatrix('1'.repeat(42), { ecc: 'L' }).version, 2);
  assert.equal(qrMatrix('A'.repeat(25), { ecc: 'L' }).version, 1);
  assert.equal(qrMatrix('A'.repeat(26), { ecc: 'L' }).version, 2);
  assert.equal(qrMatrix('a'.repeat(17), { ecc: 'L' }).version, 1);
  assert.equal(qrMatrix('a'.repeat(18), { ecc: 'L' }).version, 2);
  // 小写字母不在字母数字字符集内 -> 必须是 byte 模式
  assert.equal(qrMatrix('a'.repeat(16), { ecc: 'M' }).version, 2);
  // 数字优先于字母数字
  assert.equal(qrMatrix('1'.repeat(30), { ecc: 'M' }).version, 1);
});

test('版本上限与容量边界（v40-H 字节容量 1273）', () => {
  assert.equal(qrMatrix('a'.repeat(1273), { ecc: 'H' }).version, 40);
  assert.throws(() => qrMatrix('a'.repeat(1274), { ecc: 'H' }), /too long/i);
  assert.throws(() => qrMatrix('x'.repeat(5000), { ecc: 'H' }));
});

test('参数校验', () => {
  assert.throws(() => qrMatrix(123), TypeError);
  assert.throws(() => qrMatrix('x', { ecc: 'Z' }), RangeError);
  assert.throws(() => qrMatrix('x', { version: 0 }), RangeError);
  assert.throws(() => qrMatrix('x', { version: 41 }), RangeError);
  assert.equal(qrMatrix('x', { version: 10 }).version, 10); // version 作为最小版本
  assert.equal(qrMatrix('x', { ecc: 'q' }).ecc, 'Q'); // 大小写不敏感
});

test('png: 结构（签名 / chunk 顺序 / CRC / IHDR / zlib 可解）', () => {
  const width = 3;
  const height = 2;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 7 + 3) & 0xff;

  const png = encodePNG({ width, height, rgba });
  assert.ok(Buffer.isBuffer(png));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG signature');
  assert.deepEqual(pngSize(png), { width, height });

  const chunks = splitChunks(png);
  assert.deepEqual(chunks.map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  for (const c of chunks) {
    assert.equal(c.crc, crc32(c.crcInput), 'CRC of ' + c.type);
    // 也验证 CRC 表本身：用独立实现（逐位）重算
    let crc = 0xffffffff;
    for (const b of c.crcInput) {
      crc ^= b;
      for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    assert.equal(c.crc, crc, 'bitwise CRC of ' + c.type);
  }

  const ihdr = chunks[0].data;
  assert.equal(ihdr.length, 13);
  assert.equal(ihdr.readUInt32BE(0), width);
  assert.equal(ihdr.readUInt32BE(4), height);
  assert.equal(ihdr[8], 8, 'bit depth');
  assert.equal(ihdr[9], 6, 'color type RGBA');
  assert.equal(ihdr[10], 0, 'compression');
  assert.equal(ihdr[11], 0, 'filter method');
  assert.equal(ihdr[12], 0, 'interlace');
  assert.equal(chunks[2].data.length, 0, 'IEND empty');

  const raw = zlib.inflateSync(chunks[1].data);
  assert.equal(raw.length, height * (1 + width * 4));

  // CRC32 已知向量
  assert.equal(crc32(Buffer.from('123456789', 'latin1')), 0xcbf43926);
});

test('png: RGBA 像素往返回原', () => {
  const width = 5;
  const height = 4;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37 + 11) & 0xff;
  const png = encodePNG({ width, height, rgba });
  const decoded = decodePixels(png, 4, width, height);
  assert.deepEqual([...decoded], [...rgba]);
});

test('png: 灰度（filter 0/1/2 都要能正确还原）', () => {
  const width = 6;
  const height = 3;
  const gray = Buffer.from([
    0, 0, 0, 128, 128, 255,
    255, 128, 64, 32, 16, 8,
    9, 9, 9, 9, 9, 9,
  ]);
  const png = encodePNGGray({ width, height, gray });
  assert.deepEqual(pngSize(png), { width, height });
  const chunks = splitChunks(png);
  assert.equal(chunks[0].data[9], 0, 'color type grayscale');
  const decoded = decodePixels(png, 1, width, height);
  assert.deepEqual([...decoded], [...gray]);
});

test('png: 非法输入', () => {
  assert.throws(() => encodePNG({ width: 2, height: 2, rgba: Buffer.alloc(3) }), TypeError);
  assert.throws(() => encodePNGGray({ width: 0, height: 2, gray: Buffer.alloc(0) }), TypeError);
  assert.throws(() => encodePNGGray({ width: 2, height: 2 }), TypeError);
  assert.equal(pngSize(Buffer.alloc(0)), null);
  assert.equal(pngSize(Buffer.from('not a png at all!!!!')), null);
  assert.equal(pngSize(Buffer.alloc(64)), null);
});

test('qrToPng: 尺寸、静区与模块颜色', () => {
  const options = { ecc: 'M', scale: 3, margin: 4 };
  const res = qrMatrix('https://example.com/hello', options);
  const png = qrToPng('https://example.com/hello', options);
  const dim = (res.size + 2 * 4) * 3;
  assert.deepEqual(pngSize(png), { width: dim, height: dim });

  const px = decodePixels(png, 1, dim, dim);
  const at = (x, y) => px[y * dim + x];

  // 静区全白
  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      if (x < 12 || y < 12 || x >= dim - 12 || y >= dim - 12) {
        assert.equal(at(x, y), 255, `quiet zone ${x},${y}`);
      }
    }
  }

  // 抽查若干模块（每个模块中心点）
  let darkChecked = 0;
  let lightChecked = 0;
  for (let my = 0; my < res.size; my++) {
    for (let mx = 0; mx < res.size; mx++) {
      if ((mx * 7 + my * 13) % 11 !== 0) continue;
      const cx = (mx + 4) * 3 + 1;
      const cy = (my + 4) * 3 + 1;
      if (res.modules[my][mx]) {
        assert.equal(at(cx, cy), 0, `dark module ${mx},${my}`);
        darkChecked++;
      } else {
        assert.equal(at(cx, cy), 255, `light module ${mx},${my}`);
        lightChecked++;
      }
    }
  }
  assert.ok(darkChecked > 5 && lightChecked > 5, 'sanity: sampled enough modules');
});

test('qrDataUrl: 前缀与可解码', () => {
  const url = qrDataUrl('data-url-test', { scale: 2, margin: 1 });
  assert.ok(url.startsWith('data:image/png;base64,'));
  const png = Buffer.from(url.slice('data:image/png;base64,'.length), 'base64');
  const res = qrMatrix('data-url-test', { scale: 2, margin: 1 });
  assert.deepEqual(pngSize(png), { width: (res.size + 2) * 2, height: (res.size + 2) * 2 });
});

test('qrToSvg: 结构与尺寸', () => {
  const options = { ecc: 'H', margin: 2, scale: 8, dark: '#000000', light: '#ffffff' };
  const res = qrMatrix('svg-test', options);
  const svg = qrToSvg('svg-test', options);
  const dim = (res.size + 4) * 8;
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes(`viewBox="0 0 ${dim} ${dim}"`));
  assert.ok(svg.includes(`width="${dim}" height="${dim}"`));
  assert.ok(svg.includes('fill="#ffffff"'));
  assert.ok(svg.includes('fill="#000000"'));
  assert.ok(svg.includes('<path d="M'));
  assert.ok(svg.endsWith('</svg>'));
  // 深色模块数量应等于 path 中的子路径数量
  let dark = 0;
  for (const row of res.modules) for (const cell of row) if (cell) dark++;
  const segments = svg.split('<path d="')[1].split('"/>')[0].split('M').length - 1;
  assert.equal(segments, dark);
});

test('端到端: 多版本/多等级矩阵均可生成且自洽', () => {
  const eccs = ['L', 'M', 'Q', 'H'];
  for (const ecc of eccs) {
    for (const version of [1, 2, 3, 5, 7, 9, 10, 13, 14, 20, 27, 32, 40]) {
      const text = `ecc=${ecc};version>=${version};` + 'abcdefghij'.repeat(version);
      const res = qrMatrix(text, { ecc, version });
      assert.ok(res.version >= version, 'version floor respected');
      assert.equal(res.size, res.version * 4 + 17);
      const expected = expectedFormatBits(ecc, res.mask);
      assert.equal(readFormatBitsCopy1(res.modules), expected);
      assert.equal(readFormatBitsCopy2(res.modules), expected);
      if (res.version >= 7) {
        assert.equal(readVersionBits(res.modules), expectedVersionBits(res.version));
      }
      // 渲染路径也要能跑通
      const svg = qrToSvg(text, { ecc, version, scale: 1, margin: 0 });
      assert.ok(svg.includes('<svg'));
      const png = qrToPng(text, { ecc, version, scale: 1, margin: 0 });
      assert.deepEqual(pngSize(png), { width: res.size, height: res.size });
    }
  }
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exitCode = 1;
