/**
 * 注册链路冒烟测试。
 *
 * 为什么要有它：
 *   2026-10-26 那次提交把注册页的 ref 改成了未定义的变量，
 *   手机注册坏了整整两天，页面只显示「注册失败」，直到有用户反馈才发现。
 *   现在每次部署（重启之后）都跑一遍，任何一项不过就非零退出。
 *
 * 关于图形验证码：
 *   验证码已经改成服务端渲染 PNG，答案不再随图片下发，
 *   所以这里没法「解出来」再去注册手机号。
 *   改成两侧断言更有价值：
 *     1. 验证码接口必须返回 PNG，且不能附带 SVG（否则答案可被提取）
 *     2. 手机注册不带验证码必须被拒（证明接口活着、校验生效）
 *   真正跑通注册流程用邮箱那条路（不需要图形验证码）。
 *
 * 用法：node scripts/smoke-register.mjs [baseUrl]
 */

const BASE = (process.argv[2] || 'https://xiaoyulaile.online').replace(/\/$/, '');

let failed = 0;

function ok(name, extra = '') {
  console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? '  ' + extra : ''}`);
}

function bad(name, detail) {
  failed += 1;
  console.log(`  \x1b[31m✗\x1b[0m ${name}`);
  if (detail) console.log(`      ${detail}`);
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function getJson(path) {
  const res = await fetch(BASE + path);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function randomPhone() {
  const head = ['130', '131', '132', '155', '156', '185', '186', '188', '199'][Math.floor(Math.random() * 9)];
  const tail = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return head + tail;
}

async function testPages() {
  for (const p of ['/', '/#/register', '/#/login']) {
    try {
      const res = await fetch(BASE + p, { redirect: 'follow' });
      if (res.status === 200) ok(`页面可访问 ${p}`);
      else bad(`页面可访问 ${p}`, `status=${res.status}`);
    } catch (err) {
      bad(`页面可访问 ${p}`, err.message);
    }
  }
}

async function testCaptchaHardening() {
  const cap = await getJson('/api/auth/captcha');
  const d = (cap.json && cap.json.data) || {};

  if (typeof d.image === 'string' && d.image.startsWith('data:image/png;base64,')) {
    ok('图形验证码返回 PNG');
  } else {
    bad('图形验证码返回 PNG', `拿到的字段：${Object.keys(d).join(',')}`);
  }

  if (d.svg) {
    bad('验证码不应附带 SVG', 'SVG 里字符可被正则提取，等于验证码失效');
  } else {
    ok('验证码不附带 SVG（答案不可提取）');
  }

  if (!d.id) bad('验证码缺少 id');
}

async function testPhoneRegisterGuarded() {
  // 不带验证码必须被拒
  const r = await post('/api/auth/phone/register', {
    phone: randomPhone(),
    password: 'smoke123456',
    nickname: '冒烟测试',
  });
  const code = r.json && r.json.code;
  if (r.status === 400 && code === 'bad_captcha') {
    ok('手机注册必须过图形验证码');
  } else {
    bad('手机注册必须过图形验证码', `status=${r.status} code=${code}`);
  }
}

async function testEmailRegister() {
  const email = `smoke${Date.now()}@example.com`;
  const send = await post('/api/auth/email/send-code', { email, purpose: 'register' });
  const code = send.json && send.json.data && (send.json.data.demoCode || send.json.data.code);
  if (!code) {
    bad('邮箱注册：验证码没返回', `status=${send.status} ${JSON.stringify(send.json).slice(0, 160)}`);
    return;
  }

  const r = await post('/api/auth/email/register', {
    email,
    password: 'smoke123456',
    code,
    nickname: '冒烟测试邮箱',
  });

  if (r.json && r.json.ok && r.json.data && r.json.data.token) {
    ok('邮箱注册（完整流程）', email);
  } else {
    bad('邮箱注册（完整流程）', `status=${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  }
}

async function testLogin() {
  const r = await post('/api/auth/login', { account: '13800001234', password: 'demo123456' });
  if (r.json && r.json.ok && r.json.data && r.json.data.token) {
    ok('演示账号登录');
  } else {
    bad('演示账号登录', `status=${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  }
}

console.log(`\n注册冒烟测试 → ${BASE}\n`);
await testPages();
await testCaptchaHardening();
await testPhoneRegisterGuarded();
await testEmailRegister();
await testLogin();

console.log('');
if (failed) {
  console.log(`\x1b[31m失败 ${failed} 项 —— 注册链路有问题，别上线\x1b[0m\n`);
  process.exit(1);
}
console.log('\x1b[32m全部通过\x1b[0m\n');
process.exit(0);
