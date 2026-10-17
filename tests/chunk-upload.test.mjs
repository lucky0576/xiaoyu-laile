/**
 * 分片上传 —— 单元测试
 *
 * 背景：用户上传 3 个 12MB 的 PDF 全部失败，报 HTTP 524。
 * 524 是 Cloudflare 的单请求 100 秒超时，不是解析慢（实测解析只要 1 秒）——
 * 是 12MB 在慢速上行下传输本身就超时了。
 * 解法是切成 2MB 一块逐个传，再合并。
 *
 * 这里锁住分片的关键性质：
 *   · 合并后的字节与源文件**完全一致**
 *   · 序号越界 / 缺块 / 超限 / 过期都要明确报错
 *   · 同一块重传不会让进度重复累加
 *   · 成功后分片目录必须清理干净
 *
 * 运行：node tests/chunk-upload.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.DATA_DIR = 'data-test-chunkup';
process.env.NO_SEED = '1';
process.env.SESSION_SECRET = 'x'.repeat(48);
process.env.PUBLIC_BASE_URL = '';

fs.rmSync('data-test-chunkup', { recursive: true, force: true });

const chunksSvc = (await import('../src/services/chunks.js')).default;
const filesSvc = (await import('../src/services/files.js')).default;

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const CHUNK = chunksSvc.CHUNK_SIZE;
const CHUNK_ROOT = path.join(process.env.DATA_DIR, 'tmp', 'chunks');

/** 造一份确定性的二进制内容，便于逐字节比对 */
function makePayload(size) {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = (i * 31 + 7) % 256;
  return buf;
}

async function expectThrow(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

/* ---------------- 常量 ---------------- */
console.log('\n=== 分片参数 ===');
check('分片大小 2MB', CHUNK === 2 * 1024 * 1024, String(CHUNK));
check('分片远小于 Cloudflare 100 秒上限对应的体积', CHUNK <= 8 * 1024 * 1024);
check('阈值大于分片', chunksSvc.CHUNK_THRESHOLD > CHUNK, String(chunksSvc.CHUNK_THRESHOLD));

/* ---------------- init 校验 ---------------- */
console.log('\n=== 初始化校验 ===');
const noName = await expectThrow(() => chunksSvc.initUpload({ size: 100 }));
check('缺少文件名报错', Boolean(noName), noName && noName.message);
const noSize = await expectThrow(() => chunksSvc.initUpload({ name: 'a.pdf', size: 0 }));
check('缺少大小报错', Boolean(noSize), noSize && noSize.message);
const badType = await expectThrow(() => chunksSvc.initUpload({ name: 'a.xyzabc', size: 100 }));
check('不支持的类型提前拒绝', badType && badType.status === 415, badType && badType.message);
const tooBig = await expectThrow(() => chunksSvc.initUpload({ name: 'a.pdf', size: 900 * 1024 * 1024 }));
check('超过总大小限制返回 413', tooBig && tooBig.status === 413, tooBig && tooBig.message);

const init = chunksSvc.initUpload({ name: '测试资料.pdf', size: 5 * 1024 * 1024 + 123, mime: 'application/pdf' });
check('初始化成功', Boolean(init.uploadId && init.chunkSize));
check('返回分片大小', init.chunkSize === CHUNK, String(init.chunkSize));

/* ---------------- 分片写入与校验 ---------------- */
console.log('\n=== 分片写入 ===');
const total = Math.ceil((5 * 1024 * 1024 + 123) / CHUNK);
const payload = makePayload(5 * 1024 * 1024 + 123);

const badIndex = await expectThrow(() => chunksSvc.appendChunk(init.uploadId, 999, Buffer.from('x')));
check('序号越界报错', badIndex && badIndex.status === 400, badIndex && badIndex.message);
const negIndex = await expectThrow(() => chunksSvc.appendChunk(init.uploadId, -1, Buffer.from('x')));
check('负数序号报错', Boolean(negIndex));
const badId = await expectThrow(() => chunksSvc.appendChunk('../../etc', 0, Buffer.from('x')));
check('非法会话 ID 报错', Boolean(badId));
const noSession = await expectThrow(() => chunksSvc.appendChunk('deadbeefdeadbeef', 0, Buffer.from('x')));
check('不存在的会话报 404', noSession && noSession.status === 404, noSession && noSession.message);
const emptyChunk = await expectThrow(() => chunksSvc.appendChunk(init.uploadId, 0, Buffer.alloc(0)));
check('空分片报错', Boolean(emptyChunk));

// 缺块时不能合并
const missing = await expectThrow(() => chunksSvc.completeUpload(init.uploadId));
check('缺块时合并报错', missing && missing.status === 400, missing && missing.message);
check('缺块错误码正确', missing && missing.code === 'chunks_missing', missing && missing.code);

// 逐块上传
let lastPct = 0;
for (let i = 0; i < total; i++) {
  const start = i * CHUNK;
  const part = payload.subarray(start, Math.min(start + CHUNK, payload.length));
  const r = await chunksSvc.appendChunk(init.uploadId, i, part);
  check(`第 ${i + 1}/${total} 块写入成功且进度递增`, r.percent >= lastPct,
    `percent=${r.percent} lastPct=${lastPct}`);
  lastPct = r.percent;
}
check('最后一块后进度为 100%', lastPct === 100, String(lastPct));

// 重传同一块不应让进度超过 100%
const redo = await chunksSvc.appendChunk(init.uploadId, 0, payload.subarray(0, CHUNK));
check('重传同一块进度仍为 100%', redo.percent === 100, String(redo.percent));

// 状态查询
const st = await chunksSvc.uploadStatus(init.uploadId);
check('状态返回总块数', st.totalChunks === total, String(st.totalChunks));
check('状态返回已收字节', st.received === payload.length, `${st.received} vs ${payload.length}`);

/* ---------------- 合并 ---------------- */
console.log('\n=== 合并（字节必须完全一致） ===');
const record = await chunksSvc.completeUpload(init.uploadId);
check('合并成功返回文件记录', Boolean(record && record.id), JSON.stringify(record).slice(0, 120));
check('文件名保持原样', record.name === '测试资料.pdf', record.name);
check('大小与源文件一致', record.size === payload.length, `${record.size} vs ${payload.length}`);

const stored = fs.readFileSync(record.path);
check('落盘字节数与源一致', stored.length === payload.length, `${stored.length} vs ${payload.length}`);
check('落盘内容逐字节相同（关键）', stored.equals(payload), '内容不一致');
check('SHA256 相同', crypto.createHash('sha256').update(stored).digest('hex')
  === crypto.createHash('sha256').update(payload).digest('hex'));

check('合并后分片目录已清理', !fs.existsSync(path.join(CHUNK_ROOT, init.uploadId)));
check('文件可通过 URL 访问路径格式正确', record.url.startsWith('/files/'), record.url);

/* ---------------- 中止与清扫 ---------------- */
console.log('\n=== 中止与过期清扫 ===');
const s2 = chunksSvc.initUpload({ name: '待中止.pdf', size: 3 * 1024 * 1024 });
await chunksSvc.appendChunk(s2.uploadId, 0, Buffer.alloc(CHUNK, 1));
check('中止前分片目录存在', fs.existsSync(path.join(CHUNK_ROOT, s2.uploadId)));
const aborted = await chunksSvc.abortUpload(s2.uploadId);
check('中止成功', aborted === true);
check('中止后分片目录已删', !fs.existsSync(path.join(CHUNK_ROOT, s2.uploadId)));
const abortedStatus = await expectThrow(() => chunksSvc.uploadStatus(s2.uploadId));
check('中止后会话不可用', Boolean(abortedStatus));

// 过期会话清扫
const s3 = chunksSvc.initUpload({ name: '过期.pdf', size: 1024 });
const metaFile = path.join(CHUNK_ROOT, s3.uploadId, 'meta.json');
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
meta.expiresAt = new Date(Date.now() - 1000).toISOString();
fs.writeFileSync(metaFile, JSON.stringify(meta));
const swept = await chunksSvc.sweepStale();
check('清扫能删掉过期会话', swept >= 1, String(swept));
check('过期会话目录已删', !fs.existsSync(path.join(CHUNK_ROOT, s3.uploadId)));

// 过期后写入应报 410
const s4 = chunksSvc.initUpload({ name: '再过期.pdf', size: 1024 });
const m4 = path.join(CHUNK_ROOT, s4.uploadId, 'meta.json');
const meta4 = JSON.parse(fs.readFileSync(m4, 'utf8'));
meta4.expiresAt = new Date(Date.now() - 1000).toISOString();
fs.writeFileSync(m4, JSON.stringify(meta4));
const expiredWrite = await expectThrow(() => chunksSvc.appendChunk(s4.uploadId, 0, Buffer.from('abc')));
check('过期会话写入返回 410', expiredWrite && expiredWrite.status === 410, expiredWrite && expiredWrite.message);

/* ---------------- 清理 ---------------- */
// 先 flush 再删目录：反过来的话 db 会把数据写回已删除的路径而报错
const db = (await import('../src/store/db.js')).default;
try {
  db.flush();
} catch {
  /* ignore */
}
fs.rmSync('data-test-chunkup', { recursive: true, force: true });

console.log(`\n${'='.repeat(56)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log('='.repeat(56));
process.exit(failed ? 1 : 0);
