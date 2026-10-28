/**
 * 批量重抓资讯正文。
 *
 * 2026-10 之前抽取器会把表格拍平成文字，历史资讯的正文都是糊在一起的一行行文字。
 * 抽取器修好后，已入库的内容不会自动更新，用这个脚本重抓一遍。
 *
 * 用法：
 *   node scripts/refetch-news-bodies.mjs [baseUrl] [--force]
 *
 * 服务端按 bodyVersion 断点续跑，已经抓过的会跳过，可以随时中断再跑。
 */

const BASE = (process.argv[2] || 'https://xiaoyulaile.online').replace(/\/$/, '');
const FORCE = process.argv.includes('--force');

const ADMIN_ACCOUNT = '13456693544';
const ADMIN_PASSWORD = 'weilan0576';

let token = '';

async function api(path, body, method = 'POST') {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function login() {
  const r = await api('/api/auth/login', { account: ADMIN_ACCOUNT, password: ADMIN_PASSWORD });
  if (!r.json || !r.json.ok || !r.json.data || !r.json.data.token) {
    throw new Error('管理员登录失败：' + JSON.stringify(r.json).slice(0, 200));
  }
  token = r.json.data.token;
}

async function main() {
  console.log(`\n批量重抓资讯正文 → ${BASE}${FORCE ? '（强制全部重抓）' : ''}\n`);
  await login();

  let updatedTotal = 0;
  let failedTotal = 0;
  let round = 0;

  for (;;) {
    round += 1;
    const r = await api('/api/admin/news/refetch', { limit: 8, offset: 0, force: FORCE });
    if (!r.json || !r.json.ok) {
      console.log('  接口返回异常：', JSON.stringify(r.json).slice(0, 200));
      break;
    }
    const d = r.json.data;

    updatedTotal += d.updated;
    failedTotal += d.failed;

    // 服务端每次都从头过滤（已抓过的被 bodyVersion 排除），所以进度直接用 remaining 反推
    const done = d.total - d.remaining;
    const pct = d.total ? Math.min(100, Math.round((done / d.total) * 100)) : 100;
    console.log(
      `  第 ${round} 轮：处理 ${d.processed} 条 | 更新 ${d.updated} | 失败 ${d.failed} | ` +
        `剩余 ${d.remaining} | 进度 ${pct}%`,
    );
    if (d.errors && d.errors.length) {
      for (const e of d.errors.slice(0, 3)) console.log('     - ' + e);
    }

    /*
     * 注意：这里每次 offset 都传 0 —— 服务端会把已抓过的（bodyVersion=2）过滤掉，
     * 所以「没抓过的」永远排在最前面，不需要自己维护游标。
     */
    if (d.processed === 0 || d.remaining === 0) break;
    if (round > 60) {
      console.log('  轮次过多，先停下');
      break;
    }
  }

  console.log('');
  console.log(`完成：更新 ${updatedTotal} 条，失败 ${failedTotal} 条`);
}

main().catch((err) => {
  console.error('失败：', err.message);
  process.exit(1);
});
