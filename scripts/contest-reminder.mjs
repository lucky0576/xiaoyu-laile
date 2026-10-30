/**
 * 创业大赛截止提醒（服务器 cron 每天跑一次）。
 *
 * 用法：node scripts/contest-reminder.mjs
 *
 * 逻辑：调 /api/admin/contest/remind，服务端扫描「关注了赛事」的用户，
 * 对 7 天内截止的赛事每人每天提醒一次。
 */

const BASE = process.argv.find((x) => x.startsWith('http')) || 'https://xiaoyulaile.online';
const ADMIN = { account: '13456693544', password: 'weilan0576' };

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const login = await post('/api/auth/login', ADMIN);
if (!login.json?.data?.token) {
  console.error('登录失败：', JSON.stringify(login.json).slice(0, 200));
  process.exit(1);
}

const r = await post('/api/admin/contest/remind', {}, login.json.data.token);
if (!r.json?.ok) {
  console.error('提醒失败：', r.json?.error || r.status);
  process.exit(1);
}

const d = r.json.data;
const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
console.log(`[${ts}] 赛事提醒：扫描关注用户 ${d.scanned}，命中 ${d.matched}，已发 ${d.sent}${d.note ? '（' + d.note + '）' : ''}`);
