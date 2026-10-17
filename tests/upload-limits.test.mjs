/**
 * 上传的健壮性 —— 单元测试
 *
 * 背景：用户反馈「文件上传 100%，无反应」。
 * 根因是 multipart 解析失败时直接 req.destroy() 掐断 socket，
 * 客户端拿不到准备好的错误响应，只能等到超时 —— 表现为卡在 100%。
 *
 * 这里锁住四件事：
 *   · 超限要返回 413（客户端错误），不是 500（服务端故障）
 *   · 提示里的容量要可读（512MB / 20KB），不能出现「0MB」
 *   · 超限与畸形请求都必须拿到明确的错误响应，不能是空响应/断连
 *   · 正常上传不受影响
 *
 * 运行：node tests/upload-limits.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 必须在导入 config 之前设置
process.env.DATA_DIR = 'data-test-upload';
process.env.NO_SEED = '1';
process.env.SESSION_SECRET = 'x'.repeat(48);
process.env.PUBLIC_BASE_URL = '';
process.env.MAX_UPLOAD_BYTES = '20000'; // 20KB，方便测超限

fs.rmSync('data-test-upload', { recursive: true, force: true });

const { createApp } = await import('../src/http/app.js');
const registerRoutes = (await import('../src/routes/index.js')).default;
const { formatBytes } = await import('../src/http/multipart.js');

const PORT = 8991;
const BASE = `http://127.0.0.1:${PORT}`;

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

async function call(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, text };
}

/* ---------------- formatBytes ---------------- */
console.log('\n=== 容量显示 ===');
check('小于 1KB 显示 B', formatBytes(800) === '800B', formatBytes(800));
check('KB 级别正确', formatBytes(20000) === '20KB', formatBytes(20000));
check('正好 1KB', formatBytes(1024) === '1KB', formatBytes(1024));
check('MB 级别正确', formatBytes(5 * 1024 * 1024) === '5.0MB', formatBytes(5 * 1024 * 1024));
check('512MB 不带小数', formatBytes(512 * 1024 * 1024) === '512MB', formatBytes(512 * 1024 * 1024));
check('GB 级别正确', formatBytes(2 * 1024 * 1024 * 1024) === '2.0GB', formatBytes(2 * 1024 * 1024 * 1024));
check('0 字节安全', formatBytes(0) === '0B', formatBytes(0));
check('null 安全', formatBytes(null) === '0B', formatBytes(null));
check('不会出现 0MB', !formatBytes(20000).includes('0MB'), formatBytes(20000));

/* ---------------- 服务 ---------------- */
const app = createApp();
registerRoutes(app);
await app.listen(PORT, '127.0.0.1');

const sms = await call('POST', '/api/auth/sms/send', { body: { phone: '13966667777', purpose: 'login' } });
const login = await call('POST', '/api/auth/sms/login', {
  body: { phone: '13966667777', code: sms.json.data.demoCode, purpose: 'login', nickname: '上传测试' },
});
const token = login.json.data.token;
check('测试账号就绪', Boolean(token));

function fileForm(size, name) {
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.alloc(size, 65)], { type: 'text/plain' }), name);
  return fd;
}

console.log('\n=== 正常上传 ===');
const okRes = await call('POST', '/api/files', { token, form: fileForm(5000, '正常文件.txt') });
check('小文件上传成功', okRes.status === 201, String(okRes.status));
check('返回文件记录', (okRes.json?.data?.files || []).length === 1);

console.log('\n=== 超出上限（关键） ===');
const t0 = Date.now();
const bigRes = await call('POST', '/api/files', { token, form: fileForm(60000, '超大文件.txt') });
const ms = Date.now() - t0;
check('超限返回 413 而非 500', bigRes.status === 413, String(bigRes.status));
check('超限返回明确的错误文案', Boolean(bigRes.json?.error), JSON.stringify(bigRes.json).slice(0, 120));
check('错误文案包含可读容量', /20KB/.test(bigRes.json?.error || ''), String(bigRes.json?.error));
check('错误文案不出现 0MB', !/0MB/.test(bigRes.json?.error || ''), String(bigRes.json?.error));
check('错误码为 payload_too_large', bigRes.json?.code === 'payload_too_large', String(bigRes.json?.code));
// 最关键的一条：必须有响应，而不是断连等超时
check('超限时立即拿到响应（不挂起）', ms < 5000, `${ms}ms`);
check('响应体是合法 JSON（不是空响应）', bigRes.json !== null, bigRes.text.slice(0, 80));

console.log('\n=== 畸形请求 ===');
const noBoundary = await fetch(`${BASE}/api/files`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
  body: 'x',
});
const nbText = await noBoundary.text();
check('缺少 boundary 返回 400', noBoundary.status === 400, String(noBoundary.status));
check('缺少 boundary 有错误信息', nbText.includes('boundary'), nbText.slice(0, 100));

console.log('\n=== 超限后服务仍正常 ===');
const afterRes = await call('POST', '/api/files', { token, form: fileForm(3000, '之后正常.txt') });
check('超限之后仍可正常上传', afterRes.status === 201, String(afterRes.status));
const health = await call('GET', '/api/health');
check('服务健康', health.status === 200, String(health.status));

await app.close();
const db = (await import('../src/store/db.js')).default;
db.flush();
fs.rmSync('data-test-upload', { recursive: true, force: true });

console.log(`\n${'='.repeat(56)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log('='.repeat(56));
process.exit(failed ? 1 : 0);
