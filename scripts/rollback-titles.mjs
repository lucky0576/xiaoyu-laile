/**
 * 标题回滚：把项目标题恢复成批量改写之前的版本
 *
 * 用法（服务器 /opt/xiaoyu-laile 下）：
 *   node scripts/rollback-titles.mjs                 # 用最新一次备份回滚
 *   node scripts/rollback-titles.mjs --dry-run       # 只预览
 *   node scripts/rollback-titles.mjs data/backups/titles-2026-11-07T05-04-09-071Z.json
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DRY = process.argv.includes('--dry-run');
const BASE = process.env.API_BASE || 'http://127.0.0.1:8787';
const ACCOUNT = process.env.RETITLE_ACCOUNT || '13456693544';
const PASSWORD = process.env.RETITLE_PASSWORD || 'weilan0576';

function latestBackup() {
  const dir = path.join(ROOT, 'data', 'backups');
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^titles-\d/.test(f) && f.endsWith('.json'))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : '';
}

async function main() {
  const arg = process.argv.find((a) => a.endsWith('.json'));
  const file = arg ? path.resolve(ROOT, arg) : latestBackup();
  if (!file || !fs.existsSync(file)) {
    console.error('  找不到备份文件');
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf-8'));
  console.log('  备份文件:', file, '| 条数:', rows.length);
  if (DRY) {
    for (const r of rows.slice(0, 5)) console.log('   ', r.id, '->', String(r.title).slice(0, 40));
    console.log('  （dry-run，不写库）');
    return;
  }
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
    signal: AbortSignal.timeout(30000),
  }).then((r) => r.json());
  const token = (login?.data || {}).token;
  if (!token) throw new Error('管理员登录失败');
  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    try {
      const res = await fetch(`${BASE}/api/admin/listings/${r.id}/title`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: r.title }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) ok += 1;
      else fail += 1;
    } catch {
      fail += 1;
    }
  }
  console.log(`  已回滚: ${ok} 条 | 失败: ${fail} 条`);
}

main().catch((e) => {
  console.error('  失败:', e);
  process.exit(1);
});
