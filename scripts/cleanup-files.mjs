/**
 * 手动跑一次孤儿文件清理（可加 --dry-run 只看不动）
 *
 * 用法：
 *   node scripts/cleanup-files.mjs --dry-run
 *   node scripts/cleanup-files.mjs
 *   node scripts/cleanup-files.mjs --hours=48
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

/*
 * 清理逻辑依赖项目的 config / db（它们会读 data 目录），
 * 所以必须在本进程内 import 项目模块，而不是另起一个进程去删文件。
 */
process.chdir(root);
const { default: db } = await import(path.join(root, 'src/store/db.js'));
const { cleanupOrphanFiles } = await import(path.join(root, 'src/services/file-cleanup.js'));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const hoursArg = args.find((a) => a.startsWith('--hours='));
const minAgeHours = hoursArg ? Number(hoursArg.split('=')[1]) || 24 : 24;

const before = dirSize(path.join(root, 'data/uploads'));
const r = cleanupOrphanFiles({ minAgeHours, dryRun });
const after = dirSize(path.join(root, 'data/uploads'));

console.log(`扫描记录 ${r.scannedRecords} 条，被引用 id ${r.referenced} 个`);
console.log(`${dryRun ? '[试运行] 将删除' : '已删除'}记录 ${r.removedRecords} 条、文件 ${r.removedFiles} 个，释放 ${r.mb} MB`);
if (r.sample.length) console.log('  样例：' + r.sample.join(' | '));
console.log(`上传目录：${fmt(before)} → ${fmt(after)}`);

if (!dryRun) {
  db.flush?.();
}
process.exit(0);

function dirSize(dir) {
  let total = 0;
  const walk = (d, depth) => {
    if (depth > 3) return;
    let names = [];
    try {
      names = fs.readdirSync(d);
    } catch {
      return;
    }
    for (const name of names) {
      const p = path.join(d, name);
      let st = null;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p, depth + 1);
      else total += st.size;
    }
  };
  walk(dir, 0);
  return total;
}

function fmt(bytes) {
  if (bytes > 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}
