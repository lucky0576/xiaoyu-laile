// 清理测试服务商（必须 UTF-8 保存，否则中文字面量会变问号）
const fs = require('fs');
const P = 'data/collections/providers.json';
const PREFIX = '测试新能源';

const arr = JSON.parse(fs.readFileSync(P, 'utf8'));
const before = arr.length;
const kept = arr.filter((x) => !String(x.companyName || '').startsWith(PREFIX));
fs.writeFileSync(P, JSON.stringify(kept, null, 2));

console.log('BEFORE=' + before + ' AFTER=' + kept.length);
for (const x of kept) console.log('  kept: ' + x.companyName + '  kind=' + (x.kind || '-'));
