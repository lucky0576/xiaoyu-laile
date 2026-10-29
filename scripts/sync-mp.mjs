/**
 * 公众号文章同步（跑在服务器上，可配 cron）。
 *
 * 用法：
 *   node scripts/sync-mp.mjs [count] [--dry]
 *
 * 依赖服务器 .env：
 *   WECHAT_APP_ID=公众号 AppID
 *   WECHAT_APP_SECRET=公众号 AppSecret
 * 并且公众号后台「IP 白名单」里要有本机公网 IP。
 */

const BASE = process.argv.find((x) => x.startsWith('http')) || 'https://xiaoyulaile.online';
const DRY = process.argv.includes('--dry');
const COUNT = Number(process.argv[2]) || 5;

const ADMIN = { account: '13456693544', password: 'weilan0576' };

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const login = await post('/api/auth/login', ADMIN);
if (!login.json?.data?.token) {
  console.error('登录失败：', JSON.stringify(login.json).slice(0, 200));
  process.exit(1);
}

const r = await post('/api/admin/mp/sync', { count: COUNT, dryRun: DRY }, login.json.data.token);

if (!r.json?.ok) {
  console.error('同步失败：', r.json?.error || r.status);
  process.exit(1);
}

const d = r.json.data;
console.log(`公众号文章：共 ${d.total} 篇，本次取 ${d.fetched} 篇`);
console.log(`  新建 ${d.created}（招投标 ${d.bidding} / 资讯 ${d.news}），跳过 ${d.skipped}`);
for (const it of d.items || []) {
  console.log(`  · [${it.kind === 'bidding' ? '招投标' : '资讯'}] ${String(it.title).slice(0, 40)}`);
}
if ((d.errors || []).length) {
  console.log('  错误：');
  for (const e of d.errors.slice(0, 5)) console.log('    ' + e);
}
