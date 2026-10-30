/**
 * 政府基金动向采集（服务器 cron 每天跑一次）
 *
 * 用法：node scripts/fund-collect.mjs [limit]
 *
 * 采到的条目进「待审核」，不会直接上前台：
 *   GET  /api/admin/funds/pending         看有哪些待审核
 *   POST /api/admin/funds/:id/review      {"action":"approve"} 或 {"action":"reject"}
 */

const BASE = process.argv.find((x) => x.startsWith('http')) || 'https://xiaoyulaile.online';
const LIMIT = Number(process.argv[2]) || 6;
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

const r = await post('/api/admin/funds/collect', { limit: LIMIT }, login.json.data.token);
const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

if (!r.json?.ok) {
  console.error(`[${ts}] 基金采集失败：`, r.json?.error || r.status);
  process.exit(1);
}

const d = r.json.data;
console.log(
  `[${ts}] 基金采集：扫描 ${d.scanned}，成功 ${d.created}，跳过 ${d.skipped}，失败 ${d.failed}` +
    (d.pendingAfter !== undefined ? `，待审核累计 ${d.pendingAfter} 条` : ''),
);
if (d.note) console.log(`  提示：${d.note}`);
for (const it of d.items || []) {
  console.log(`  · [${it.province}] ${it.name} ${it.scale || ''}${it.split ? ' (拆条)' : ''}`);
}
if (d.errors?.length) {
  for (const e of d.errors.slice(0, 5)) console.log(`  ! ${e}`);
}
