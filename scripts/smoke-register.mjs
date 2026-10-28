/**
 * 注册冒烟测试。
 *
 * 为什么要有它：
 *   2026-10-26 那次提交把注册页的 ref 改成了未定义的变量，
 *   手机注册坏了整整两天，页面只显示「注册失败」，
 *   直到有用户反馈才发现。
 *   这个脚本走真实 HTTP 接口跑一遍手机注册和邮箱注册，
 *   任何一步失败就非零退出，让「注册坏了」在部署当时就暴露。
 *
 * 用法：node scripts/smoke-register.mjs [baseUrl]
 * 默认打线上 https://xiaoyulaile.online
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

/** 从图形验证码的 SVG 里取出字符（服务端把字直接画成 text，只能这样读） */
function captchaAnswer(svg) {
  const m = String(svg || '').match(/>([^<>]{1,3})<\/text>/g) || [];
  return m
    .map((x) => x.replace(/^>/, '').replace(/<\/text>$/, ''))
    .join('')
    .trim();
}

function randomPhone() {
  // 11 位数字，避开已注册的常见号段
  const head = ['130', '131', '132', '155', '156', '185', '186', '188', '199'][Math.floor(Math.random() * 9)];
  const tail = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return head + tail;
}

async function testPhoneRegister() {
  const cap = await getJson('/api/auth/captcha');
  const id = cap.json && cap.json.data && cap.json.data.id;
  const answer = captchaAnswer(cap.json && cap.json.data && cap.json.data.svg);
  if (!id || !answer) {
    bad('手机注册：拿不到图形验证码', `status=${cap.status}`);
    return;
  }

  const phone = randomPhone();
  const r = await post('/api/auth/phone/register', {
    phone,
    password: 'smoke123456',
    captchaId: id,
    captchaCode: answer,
    nickname: `冒烟测试${phone.slice(-4)}`,
  });

  if (r.json && r.json.ok && r.json.data && r.json.data.token) {
    ok('手机注册', `11 位号码 ${phone}`);
  } else {
    bad('手机注册', `status=${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
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
    ok('邮箱注册', email);
  } else {
    bad('邮箱注册', `status=${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  }
}

async function testPageLoads() {
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

console.log(`\n注册冒烟测试 → ${BASE}\n`);
await testPageLoads();
await testPhoneRegister();
await testEmailRegister();

console.log('');
if (failed) {
  console.log(`\x1b[31m失败 ${failed} 项 —— 注册链路有问题，别上线\x1b[0m\n`);
  process.exit(1);
}
console.log('\x1b[32m全部通过\x1b[0m\n');
process.exit(0);
