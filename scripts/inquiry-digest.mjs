/**
 * 商务询价每日汇总（服务器 cron 用）
 *
 * 用途：把「还没回复的商务询价」每天汇总一次，推给管理员。
 *   · 站内通知：一定发
 *   · 企业微信群：如果配了 WECOM_WEBHOOK 就发（更醒目）
 *
 * 用法：node scripts/inquiry-digest.mjs
 */

const BASE = process.argv.find((x) => x.startsWith('http')) || 'https://xiaoyulaile.online';
const ADMIN = { account: '13456693544', password: 'weilan0576' };
const WECOM_WEBHOOK = process.env.WECOM_WEBHOOK || '';

async function req(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const login = await req('/api/auth/login', { method: 'POST', body: ADMIN });
const token = login.json?.data?.token;
if (!token) {
  console.error('登录失败：', JSON.stringify(login.json).slice(0, 200));
  process.exit(1);
}

const r = await req('/api/admin/alerts', { token });
const d = r.json?.data || {};
const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

if (!d.businessUnread) {
  console.log(`[${ts}] 商务询价：无待回复`);
  process.exit(0);
}

console.log(`[${ts}] 商务询价待回复 ${d.businessUnread} 条（累计未关闭 ${d.businessOpen} 条）`);
for (const it of d.latest || []) {
  console.log(`  · ${it.userName}${it.contact ? ' / ' + it.contact : ''}：${it.text}`);
}

/* 企业微信机器人：配了才推 */
if (WECOM_WEBHOOK) {
  const lines = [
    `### 🔔 商务询价待回复 ${d.businessUnread} 条`,
    ...(d.latest || []).map((it) => `- ${it.userName}${it.contact ? '（' + it.contact + '）' : ''}：${it.text}`),
    '',
    `[去后台处理](${BASE}/#/admin-feedback)`,
  ];
  try {
    const res = await fetch(WECOM_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content: lines.join('\n') } }),
    });
    console.log(`  企业微信推送：HTTP ${res.status}`);
  } catch (err) {
    console.log(`  企业微信推送失败：${err.message}`);
  }
}
