// xiaoyu-laile/tests/lib-extract.test.mjs
// 零依赖自测：node tests/lib-extract.test.mjs
//
// 覆盖：zip.js 的签名识别 / stored+deflate / ZIP64 / 损坏与随机字节降级；
//       extract.js 的 detectKind、各类文件提取、以及“永不抛异常”的边界。

import assert from 'node:assert/strict';
import { deflateSync, deflateRawSync } from 'node:zlib';

import { isZip, readZip } from '../src/lib/zip.js';
import {
  extractText,
  detectKind,
  stripTags,
  decodeEntities,
  sortSlideNames,
} from '../src/lib/extract.js';

// ---------------------------------------------------------------------------
// 微型测试运行器
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ---------------------------------------------------------------------------
// ZIP 构造辅助（测试专用，不依赖任何 npm 包）
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(String(f.name), 'utf8');
    const data = Buffer.isBuffer(f.data)
      ? f.data
      : Buffer.from(f.data == null ? '' : String(f.data), 'utf8');
    const method = typeof f.method === 'number' ? f.method : f.store ? 0 : 8;
    const flags = typeof f.flags === 'number' ? f.flags : 0;
    const comp = method === 0 ? data : deflateRawSync(data);
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    localParts.push(lh, name, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centralParts.push(ch, name);

    offset += lh.length + name.length + comp.length;
  }

  const cd = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat(localParts.concat([cd, eocd]));
}

/** 单条目 ZIP64：中央目录尺寸字段为 0xFFFFFFFF，走 0x0001 extra + EOCD64 */
function buildZip64(name, content) {
  const nameBuf = Buffer.from(name, 'utf8');
  const data = Buffer.from(content, 'utf8');
  const comp = deflateRawSync(data);
  const crc = crc32(data);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(45, 4);
  lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);

  const localPart = Buffer.concat([lh, nameBuf, comp]);
  const cdOffset = localPart.length;

  const extra = Buffer.alloc(20);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(16, 2);
  extra.writeBigUInt64LE(BigInt(data.length), 4);
  extra.writeBigUInt64LE(BigInt(comp.length), 12);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(45, 4);
  ch.writeUInt16LE(45, 6);
  ch.writeUInt16LE(0, 8);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(0xffffffff, 20);
  ch.writeUInt32LE(0xffffffff, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt16LE(extra.length, 30);
  const cd = Buffer.concat([ch, nameBuf, extra]);
  const cdSize = cd.length;

  const z64 = Buffer.alloc(56);
  z64.writeUInt32LE(0x06064b50, 0);
  z64.writeBigUInt64LE(44n, 4);
  z64.writeUInt16LE(45, 12);
  z64.writeUInt16LE(45, 14);
  z64.writeUInt32LE(0, 16);
  z64.writeUInt32LE(0, 20);
  z64.writeBigUInt64LE(1n, 24);
  z64.writeBigUInt64LE(1n, 32);
  z64.writeBigUInt64LE(BigInt(cdSize), 40);
  z64.writeBigUInt64LE(BigInt(cdOffset), 48);

  const loc = Buffer.alloc(20);
  loc.writeUInt32LE(0x07064b50, 0);
  loc.writeUInt32LE(0, 4);
  loc.writeBigUInt64LE(BigInt(cdOffset + cdSize), 8);
  loc.writeUInt32LE(1, 12);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 8);
  eocd.writeUInt16LE(0xffff, 10);
  eocd.writeUInt32LE(0xffffffff, 12);
  eocd.writeUInt32LE(0xffffffff, 16);

  return Buffer.concat([localPart, cd, z64, loc, eocd]);
}

// ---------------------------------------------------------------------------
// 图片字节构造
// ---------------------------------------------------------------------------

function pngBytes(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

function jpegBytes(w, h) {
  const b = Buffer.alloc(20);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xc0; // SOF0
  b.writeUInt16BE(17, 4); // 段长度
  b[6] = 8; // 精度
  b.writeUInt16BE(h, 7);
  b.writeUInt16BE(w, 9);
  return b;
}

function gifBytes(w, h) {
  const b = Buffer.alloc(13);
  b.write('GIF89a', 0, 'latin1');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}

function bmpBytes(w, h) {
  const b = Buffer.alloc(30);
  b.write('BM', 0, 'latin1');
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  return b;
}

function webpVp8xBytes(w, h) {
  const b = Buffer.alloc(32);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(24, 4);
  b.write('WEBP', 8, 'latin1');
  b.write('VP8X', 12, 'latin1');
  b.writeUInt32LE(10, 16);
  const wm = w - 1;
  const hm = h - 1;
  b[24] = wm & 0xff;
  b[25] = (wm >> 8) & 0xff;
  b[26] = (wm >> 16) & 0xff;
  b[27] = hm & 0xff;
  b[28] = (hm >> 8) & 0xff;
  b[29] = (hm >> 16) & 0xff;
  return b;
}

// ---------------------------------------------------------------------------
// zip.js
// ---------------------------------------------------------------------------

test('isZip 识别签名', () => {
  const z = buildZip([{ name: 'a.txt', data: 'hello' }]);
  assert.equal(isZip(z), true);
  assert.equal(isZip(buildZip([])), true); // 空 zip 以 PK\\x05\\x06 开头
  assert.equal(isZip(Buffer.from('not a zip')), false);
  assert.equal(isZip(Buffer.alloc(0)), false);
  assert.equal(isZip(null), false);
  assert.equal(isZip(undefined), false);
  assert.equal(isZip('PK'), false);
});

test('readZip 解析 stored / deflate / 目录条目', () => {
  const zip = buildZip([
    { name: 'hello.txt', data: 'Hello 小鱼', store: true },
    { name: 'nested/deep.txt', data: 'deflated content '.repeat(20) },
    { name: 'folder/', data: Buffer.alloc(0) },
  ]);
  const entries = readZip(zip);
  assert.equal(entries.length, 3);

  const byName = new Map(entries.map((e) => [e.name, e]));
  const a = byName.get('hello.txt');
  assert.ok(a, 'hello.txt 应存在');
  assert.equal(a.method, 0);
  assert.equal(a.dir, false);
  assert.equal(a.data.toString('utf8'), 'Hello 小鱼');
  assert.equal(a.uncompressedSize, Buffer.byteLength('Hello 小鱼', 'utf8'));
  assert.equal(typeof a.crc32, 'number');

  const b = byName.get('nested/deep.txt');
  assert.ok(b, 'nested/deep.txt 应存在');
  assert.equal(b.method, 8);
  assert.equal(b.data.toString('utf8'), 'deflated content '.repeat(20));

  const d = byName.get('folder/');
  assert.ok(d, 'folder/ 应存在');
  assert.equal(d.dir, true);
  assert.equal(d.data, null);
});

test('readZip 支持 ZIP64 字段', () => {
  const zip = buildZip64('big.txt', 'zip64 payload 内容');
  assert.equal(isZip(zip), true);
  const entries = readZip(zip);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'big.txt');
  assert.equal(entries[0].method, 8);
  assert.equal(entries[0].uncompressedSize, Buffer.byteLength('zip64 payload 内容', 'utf8'));
  assert.equal(entries[0].data.toString('utf8'), 'zip64 payload 内容');
});

test('readZip 加密条目与未知压缩方法降级为 data=null', () => {
  const zip = buildZip([
    { name: 'enc.txt', data: 'secret', store: true, flags: 1 },
    { name: 'm12.txt', data: 'xx', method: 12 },
  ]);
  const entries = readZip(zip);
  assert.equal(entries.length, 2);
  for (const e of entries) {
    assert.equal(e.data, null, e.name + ' 应为 null');
    assert.equal(typeof e.name, 'string');
  }
});

test('readZip 对随机/截断/非法数据不抛异常', () => {
  const rand = Buffer.alloc(4096);
  for (let i = 0; i < rand.length; i++) rand[i] = (i * 37 + 11) & 0xff;
  const parsed = readZip(rand);
  assert.ok(Array.isArray(parsed));

  const zip = buildZip([{ name: 'a.txt', data: 'aaaaaaaaaaaaaaaaaaaa' }]);
  assert.doesNotThrow(() => readZip(zip.subarray(0, Math.floor(zip.length / 2))));
  assert.deepEqual(readZip(Buffer.from([1, 2, 3])), []);
  assert.deepEqual(readZip(Buffer.alloc(0)), []);
  assert.deepEqual(readZip(null), []);
  assert.deepEqual(readZip('nope'), []);
  assert.deepEqual(readZip({}), []);
});

// ---------------------------------------------------------------------------
// detectKind
// ---------------------------------------------------------------------------

test('detectKind 基础映射', () => {
  assert.equal(detectKind('a.PNG'), 'image');
  assert.equal(detectKind('dir/sub/b.JpG'), 'image');
  assert.equal(detectKind('x.webp'), 'image');
  assert.equal(detectKind('x.mp4'), 'video');
  assert.equal(detectKind('x.MOV'), 'video');
  assert.equal(detectKind('x.pdf'), 'pdf');
  assert.equal(detectKind('x.docx'), 'word');
  assert.equal(detectKind('x.doc'), 'word');
  assert.equal(detectKind('x.pptx'), 'ppt');
  assert.equal(detectKind('x.xlsx'), 'excel');
  assert.equal(detectKind('x.dxf'), 'cad');
  assert.equal(detectKind('x.dwg'), 'cad');
  assert.equal(detectKind('x.zip'), 'archive');
  assert.equal(detectKind('x.jar'), 'archive');
  assert.equal(detectKind('x.rar'), 'archive');
  assert.equal(detectKind('x.csv'), 'text');
  assert.equal(detectKind('x.md'), 'text');
  assert.equal(detectKind('C:\\tmp\\x.txt'), 'text');
  assert.equal(detectKind('x.unknown'), 'binary');
  assert.equal(detectKind('noext'), 'binary');
  assert.equal(detectKind(''), 'binary');
  assert.equal(detectKind(null), 'binary');
  assert.equal(detectKind(undefined), 'binary');
  assert.equal(detectKind(123), 'binary');
});

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

test('decodeEntities / stripTags / sortSlideNames', () => {
  assert.equal(
    decodeEntities('A&amp;B &lt;x&gt; &quot;q&quot; &apos;s&apos; &#65;&#x42;'),
    'A&B <x> "q" \'s\' AB'
  );
  assert.equal(decodeEntities('&unknown; &#xZZ;'), '&unknown; &#xZZ;');
  assert.equal(decodeEntities(''), '');
  assert.equal(stripTags('<p>Hello</p><w:br/><a href="x">link</a>'), 'Hello\nlink');
  assert.equal(stripTags('a<br>b'), 'a\nb');
  assert.equal(stripTags(''), '');
  assert.deepEqual(
    sortSlideNames(['ppt/slides/slide10.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide1.xml']),
    ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml', 'ppt/slides/slide10.xml']
  );
});

// ---------------------------------------------------------------------------
// extractText —— 文本
// ---------------------------------------------------------------------------

test('extractText 纯文本（BOM + CRLF + 行数）', async () => {
  const r = await extractText(Buffer.from('\uFEFFline1\r\nline2\n'), 'a.txt');
  assert.equal(r.kind, 'text');
  assert.equal(r.ext, '.txt');
  assert.equal(r.text, 'line1\nline2\n');
  assert.equal(r.meta.chars, 'line1\nline2\n'.length);
  assert.equal(r.meta.lines, 3);
  assert.ok(Array.isArray(r.notes));
});

test('extractText 纯文本：大量空字节视为二进制', async () => {
  const buf = Buffer.concat([Buffer.alloc(64), Buffer.from('hello world', 'utf8')]);
  const r = await extractText(buf, 'weird.csv');
  assert.equal(r.kind, 'binary');
  assert.equal(r.text, '');
});

test('extractText 空 / 非法输入不抛异常', async () => {
  for (const input of [null, undefined, Buffer.alloc(0), 42, 'str', {}, []]) {
    const r = await extractText(input, 'x.txt');
    assert.equal(typeof r.text, 'string');
    assert.equal(typeof r.kind, 'string');
    assert.ok(r.meta && typeof r.meta === 'object');
    assert.ok(Array.isArray(r.notes));
  }
  const r2 = await extractText(null, 'unknown.bin');
  assert.equal(r2.kind, 'binary');
  const r3 = await extractText(Buffer.alloc(0), 'e.pdf');
  assert.equal(r3.kind, 'pdf');
  assert.ok(r3.notes.length > 0);
});

test('extractText 对随机字节的所有类型都不抛异常', async () => {
  const rand = Buffer.alloc(2048);
  for (let i = 0; i < rand.length; i++) rand[i] = (i * 131 + 7) & 0xff;
  const names = [
    'a.png', 'a.jpg', 'a.gif', 'a.bmp', 'a.webp', 'a.mp4', 'a.mov', 'a.pdf',
    'a.docx', 'a.doc', 'a.pptx', 'a.ppt', 'a.xlsx', 'a.xls', 'a.dxf', 'a.dwg',
    'a.zip', 'a.jar', 'a.rar', 'a.7z', 'a.tar', 'a.gz', 'a.txt', 'a.json',
    'a.csv', 'a.xml', 'a.html', 'a.unknown', 'noext',
  ];
  for (const n of names) {
    const r = await extractText(rand, n);
    assert.equal(typeof r.text, 'string', n);
    assert.equal(typeof r.kind, 'string', n);
    assert.equal(typeof r.ext, 'string', n);
    assert.ok(r.meta && typeof r.meta === 'object', n);
    assert.ok(Array.isArray(r.notes), n);
  }
});

// ---------------------------------------------------------------------------
// extractText —— 图片 / 视频
// ---------------------------------------------------------------------------

test('extractText 图片尺寸解析', async () => {
  const png = await extractText(pngBytes(800, 600), 'a.png');
  assert.equal(png.kind, 'image');
  assert.deepEqual(png.meta, { format: 'png', width: 800, height: 600 });

  const jpg = await extractText(jpegBytes(3, 2), 'a.jpg');
  assert.equal(jpg.meta.format, 'jpeg');
  assert.equal(jpg.meta.width, 3);
  assert.equal(jpg.meta.height, 2);

  const gif = await extractText(gifBytes(5, 7), 'a.gif');
  assert.equal(gif.meta.format, 'gif');
  assert.equal(gif.meta.width, 5);
  assert.equal(gif.meta.height, 7);

  const bmp = await extractText(bmpBytes(320, 240), 'a.bmp');
  assert.equal(bmp.meta.format, 'bmp');
  assert.equal(bmp.meta.width, 320);
  assert.equal(bmp.meta.height, 240);

  const webp = await extractText(webpVp8xBytes(640, 480), 'a.webp');
  assert.equal(webp.meta.format, 'webp');
  assert.equal(webp.meta.width, 640);
  assert.equal(webp.meta.height, 480);
});

test('extractText 截断图片只给 format，不抛异常', async () => {
  const r = await extractText(pngBytes(10, 10).subarray(0, 12), 'a.png');
  assert.equal(r.kind, 'image');
  assert.equal(r.meta.format, 'png');
  assert.ok(r.notes.length > 0);
});

test('extractText 视频 mp4 解析 mvhd（version 0）', async () => {
  // ftyp + moov(mvhd, tkhd)
  const ftyp = Buffer.alloc(16);
  ftyp.writeUInt32BE(16, 0);
  ftyp.write('ftyp', 4, 'latin1');

  const mvhdBody = Buffer.alloc(100);
  mvhdBody[0] = 0; // version 0
  mvhdBody.writeUInt32BE(1000, 12); // timescale
  mvhdBody.writeUInt32BE(12500, 16); // duration → 12.5s
  const mvhd = Buffer.concat([box('mvhd', mvhdBody)]);

  const tkhdBody = Buffer.alloc(84);
  tkhdBody[0] = 0;
  tkhdBody.writeUInt32BE(1920 * 65536, 76);
  tkhdBody.writeUInt32BE(1080 * 65536, 80);
  const tkhd = Buffer.concat([box('tkhd', tkhdBody)]);

  const moov = Buffer.concat([box('moov', Buffer.concat([mvhd, tkhd]))]);
  const r = await extractText(Buffer.concat([ftyp, moov]), 'v.mp4');
  assert.equal(r.kind, 'video');
  assert.equal(r.meta.format, 'mp4');
  assert.equal(r.meta.durationSec, 12.5);
  assert.equal(r.meta.width, 1920);
  assert.equal(r.meta.height, 1080);
});

function box(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

// ---------------------------------------------------------------------------
// extractText —— PDF
// ---------------------------------------------------------------------------

test('extractText PDF 解压 FlateDecode 并抽取文本', async () => {
  const content = 'BT /F1 12 Tf 72 720 Td (Hello World) Tj ET';
  const compressed = deflateSync(Buffer.from(content, 'latin1'));
  const head = Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 2 >> endobj\n' +
      '3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n' +
      '4 0 obj << /Length ' + compressed.length + ' /Filter /FlateDecode >> stream\n',
    'latin1'
  );
  const tail = Buffer.from(
    '\nendstream\nendobj\ntrailer << /Root 1 0 R /Producer (Test Producer) >>\n%%EOF\n',
    'latin1'
  );
  const pdf = Buffer.concat([head, compressed, tail]);

  const r = await extractText(pdf, 'doc.pdf');
  assert.equal(r.kind, 'pdf');
  assert.equal(r.ext, '.pdf');
  assert.ok(r.text.includes('Hello World'), '应抽到 Hello World，实际: ' + JSON.stringify(r.text));
  assert.equal(r.meta.pages, 2);
  assert.equal(r.meta.pagesEstimated, false);
  assert.equal(r.meta.producer, 'Test Producer');
  assert.ok(!r.notes.some((n) => n.includes('解压失败')));
  assert.ok(r.notes.some((n) => n.startsWith('pdf:')));
});

test('extractText PDF 无 /Count 时按 /Type /Page 估算', async () => {
  const pdf = Buffer.from(
    '%PDF-1.4\n3 0 obj << /Type /Page >> endobj\n5 0 obj << /Type /Page >> endobj\n%%EOF\n',
    'latin1'
  );
  const r = await extractText(pdf, 'c.pdf');
  assert.equal(r.meta.pages, 2);
  assert.equal(r.meta.pagesEstimated, true);
});

test('extractText PDF 损坏流记 notes 不抛异常', async () => {
  const bad = Buffer.concat([
    Buffer.from('%PDF-1.4\n4 0 obj << /Filter /FlateDecode >> stream\n', 'latin1'),
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);
  const r = await extractText(bad, 'b.pdf');
  assert.equal(r.kind, 'pdf');
  assert.ok(r.notes.some((n) => n.includes('解压失败')), 'notes: ' + JSON.stringify(r.notes));
});

test('extractText PDF 十六进制与转义字符串', async () => {
  const content = 'BT (A\\(B\\)C \\101) Tj <48656C6C6F> Tj ET';
  const compressed = deflateSync(Buffer.from(content, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Pages /Count 1 /Filter /FlateDecode >> stream\n',
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);
  const r = await extractText(pdf, 'hex.pdf');
  assert.ok(r.text.includes('A(B)C A'), 'text=' + JSON.stringify(r.text));
  assert.ok(r.text.includes('Hello'), 'text=' + JSON.stringify(r.text));
});

// ---------------------------------------------------------------------------
// extractText —— Office
// ---------------------------------------------------------------------------

test('extractText docx 段落 / 实体 / tab', async () => {
  const docXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="w"><w:body>' +
    '<w:p><w:r><w:t>第一段 &amp; A</w:t></w:r><w:r><w:t xml:space="preserve"> 继续</w:t></w:r>' +
    '<w:tab/><w:r><w:t>B</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>第二段 &lt;x&gt;</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const zip = buildZip([{ name: 'word/document.xml', data: docXml }]);
  const r = await extractText(zip, 'd.docx');
  assert.equal(r.kind, 'word');
  assert.equal(r.meta.paragraphs, 2);
  const flat = r.text.replace(/\n+/g, '\n');
  assert.equal(flat, '第一段 & A 继续\tB\n第二段 <x>', 'text=' + JSON.stringify(r.text));
});

test('extractText pptx 幻灯片按数字排序', async () => {
  const slide = (t) =>
    '<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody>' +
    '<a:p><a:r><a:t>' + t + '</a:t></a:r></a:p>' +
    '</p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
  const zip = buildZip([
    { name: 'ppt/slides/slide10.xml', data: slide('第十页') },
    { name: 'ppt/slides/slide2.xml', data: slide('第二页') },
    { name: 'ppt/slides/slide1.xml', data: slide('第一页') },
    { name: '[Content_Types].xml', data: '<Types/>' },
  ]);
  const r = await extractText(zip, 'd.pptx');
  assert.equal(r.kind, 'ppt');
  assert.equal(r.meta.slides, 3);
  const i1 = r.text.indexOf('第一页');
  const i2 = r.text.indexOf('第二页');
  const i10 = r.text.indexOf('第十页');
  assert.ok(i1 >= 0 && i2 > i1 && i10 > i2, 'text=' + JSON.stringify(r.text));
  assert.ok(r.text.includes('[第 1 页]'));
  assert.ok(r.text.includes('[第 10 页]'));
});

test('extractText xlsx 共享字符串 / sheets / rows', async () => {
  const shared =
    '<?xml version="1.0"?><sst><si><t>姓名</t></si>' +
    '<si><r><t>张</t></r><r><t>三</t></r></si>' +
    '<si><t xml:space="preserve">A &amp; B</t></si></sst>';
  const sheet1 =
    '<worksheet><sheetData>' +
    '<row r="1"><c t="s"><v>0</v></c></row>' +
    '<row r="2"><c t="s"><v>1</v></c></row>' +
    '</sheetData></worksheet>';
  const zip = buildZip([
    { name: 'xl/sharedStrings.xml', data: shared },
    { name: 'xl/worksheets/sheet1.xml', data: sheet1 },
    { name: 'xl/worksheets/sheet2.xml', data: '<worksheet><sheetData/></worksheet>' },
  ]);
  const r = await extractText(zip, 'd.xlsx');
  assert.equal(r.kind, 'excel');
  assert.deepEqual(r.meta.sheets, ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
  assert.equal(r.meta.rows, 2);
  assert.ok(r.text.includes('姓名'));
  assert.ok(r.text.includes('张三'));
  assert.ok(r.text.includes('A & B'));
});

test('extractText 旧版 office 二进制只给说明', async () => {
  const ole = Buffer.alloc(64);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(ole, 0);
  for (const n of ['a.doc', 'a.ppt', 'a.xls']) {
    const r = await extractText(ole, n);
    assert.equal(r.text, '');
    assert.ok(r.notes.length > 0, n);
    assert.ok(r.notes.some((s) => s.includes('OLE')), n + ' notes=' + JSON.stringify(r.notes));
  }
});

// ---------------------------------------------------------------------------
// extractText —— CAD / 压缩包
// ---------------------------------------------------------------------------

test('extractText dxf 版本 / 图层 / 实体统计', async () => {
  const dxf = [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '2',
    '0', 'LAYER', '2', '0', '70', '0',
    '0', 'LAYER', '2', 'Walls', '70', '0',
    '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LINE', '8', 'Walls',
    '0', 'LINE', '8', '0',
    '0', 'CIRCLE', '8', '0',
    '0', 'ENDSEC', '0', 'EOF', '',
  ].join('\n');

  const r = await extractText(Buffer.from(dxf, 'utf8'), 'plan.dxf');
  assert.equal(r.kind, 'cad');
  assert.equal(r.meta.acadVersion, 'AC1015');
  assert.deepEqual(r.meta.layers, ['0', 'Walls']);
  assert.deepEqual(r.meta.entityCounts, { LINE: 2, CIRCLE: 1 });
  assert.ok(r.text.includes('Walls'));
});

test('extractText dwg 只识别 magic', async () => {
  const dwg = Buffer.concat([Buffer.from('AC1027', 'latin1'), Buffer.alloc(32)]);
  const r = await extractText(dwg, 'plan.dwg');
  assert.equal(r.kind, 'cad');
  assert.deepEqual(r.meta, { binary: true });
  assert.ok(r.notes.some((n) => n.includes('AC1027')));
});

test('extractText zip/jar 列出条目', async () => {
  const zip = buildZip([
    { name: 'a.txt', data: 'aaa' },
    { name: 'dir/', data: Buffer.alloc(0) },
    { name: 'dir/b.txt', data: 'bbb' },
  ]);
  const r = await extractText(zip, 'pack.zip');
  assert.equal(r.kind, 'archive');
  assert.deepEqual(r.meta.entries, ['a.txt', 'dir/', 'dir/b.txt']);
  assert.equal(r.meta.total, 3);
  assert.ok(r.text.includes('dir/b.txt'));

  const jar = await extractText(zip, 'pack.jar');
  assert.equal(jar.kind, 'archive');
  assert.equal(jar.meta.total, 3);
});

test('extractText rar/7z 只做类型识别', async () => {
  for (const n of ['a.rar', 'a.7z', 'a.tar', 'a.gz']) {
    const r = await extractText(Buffer.from('Rar!\u0000\u0000', 'latin1'), n);
    assert.equal(r.kind, 'archive');
    assert.equal(r.text, '');
    assert.ok(r.notes.some((s) => s.includes('未解析')), n);
  }
});

// ---------------------------------------------------------------------------
// 运行
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log('ok   ' + t.name);
  } catch (err) {
    failed++;
    console.error('FAIL ' + t.name);
    console.error('     ' + (err && err.stack ? err.stack : String(err)));
  }
}
console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + tests.length + ' total');
if (failed > 0) process.exitCode = 1;
