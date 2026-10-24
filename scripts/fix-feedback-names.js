// 一次性修复：把历史留言里损坏的 '??' 名字改回正确值
// 注意：本文件必须保存为 UTF-8（无 BOM），否则中文会再次变成 ??
const fs = require('fs');

const P = process.argv[2] || 'data/collections/feedback.json';
const arr = JSON.parse(fs.readFileSync(P, 'utf8'));

const BAD = '??';
const ADMIN_NAME = '卢云';
const USER_FALLBACK = '用户';

let fixed = 0;
for (const f of arr) {
  if (f.userName === BAD) {
    f.userName = f.userId ? USER_FALLBACK : ADMIN_NAME;
    fixed++;
  }
  for (const r of f.replies || []) {
    if (r.name === BAD || !r.name) {
      r.name = r.by === 'admin' ? ADMIN_NAME : (f.userName || USER_FALLBACK);
      fixed++;
    }
  }
  // 顺带把顶层 userName 也补一下
  if (!f.userName) {
    f.userName = USER_FALLBACK;
    fixed++;
  }
}

fs.writeFileSync(P, JSON.stringify(arr, null, 2));

// 用字节码输出，避免终端编码干扰
for (const f of arr) {
  console.log('提问人: ' + f.userName + '  codes=' + [...f.userName].map((c) => c.codePointAt(0)).join(','));
  for (const r of f.replies || []) {
    console.log('  回复[' + r.by + '] ' + r.name + '  codes=' + [...r.name].map((c) => c.codePointAt(0)).join(','));
  }
}
console.log('FIXED=' + fixed);
