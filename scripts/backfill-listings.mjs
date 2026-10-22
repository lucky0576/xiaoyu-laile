/**
 * 批量补全已有项目的自动封面与补充信息要素
 *
 * 用法（在 /opt/xiaoyu-laile 下，需先停服务）：
 *   node scripts/backfill-listings.mjs [--force]
 *
 * 默认只处理缺失的；--force 会全部重做。
 */

import db from '../src/store/db.js';
import { generateCoverFile } from '../src/services/cover.js';
import { generateAutoInfo } from '../src/services/auto-info.js';

const FORCE = process.argv.includes('--force');
const col = db.collection('listings');
const all = col.all();

console.log(`  共 ${all.length} 条，模式：${FORCE ? '全部重做' : '仅补缺失'}`);

let covers = 0;
let infos = 0;
let skipped = 0;

for (let n = 0; n < all.length; n++) {
  const l = all[n];
  const patch = {};

  if (FORCE || !l.coverUrl) {
    const cover = await generateCoverFile(
      {
        title: l.title,
        category: l.category,
        city: l.cities && l.cities[0] ? l.cities[0].name : '',
        industry: l.industries && l.industries[0] ? l.industries[0].name : '',
        kindLabel: l.typeName || '',
      },
      { ownerId: l.ownerId || '', listingId: l.id }
    );
    if (cover) {
      patch.coverUrl = cover.url;
      patch.coverFileId = cover.id;
      covers++;
    }
  }

  if (FORCE || !l.autoInfo) {
    patch.autoInfo = await generateAutoInfo(l);
    infos++;
  }

  if (Object.keys(patch).length) {
    col.update(l.id, patch);
    console.log(`  [${n + 1}/${all.length}] ${String(l.title || '').slice(0, 28)}  ${Object.keys(patch).join(',')}`);
  } else {
    skipped++;
  }

  // 每条落盘一次，中途中断也不会全丢
  db.flush();
}

console.log('');
console.log(`  封面生成 ${covers} 条`);
console.log(`  要素生成 ${infos} 条`);
console.log(`  跳过     ${skipped} 条`);
console.log('  完成');
