// 给 5 条实验室成果推介加「平台整理代发」说明（必须 UTF-8 保存，可重复执行）
const fs = require('fs');
const P = 'data/collections/listings.json';

const NOTICE = `【发布说明】
本条由「小鱼来了」平台根据实验室公开资料整理代发，
非实验室官方账号发布，内容以实验室官方口径为准。

如需对接具体成果，请通过平台「项目对接 / 联系我」发起，
我们协助转达至实验室成果转化部门，由双方直接商议合作条款。
平台不参与定价、不收取居间费用。

——————————————————————————
`;

const arr = JSON.parse(fs.readFileSync(P, 'utf8'));
let updated = 0;

for (const x of arr) {
  if (!String(x.id || '').startsWith('l_lab_')) continue;
  const text = String(x.text || '');
  if (text.startsWith('【发布说明】')) continue; // 已加过
  x.text = NOTICE + text;
  // 副标题末尾标注「平台整理」
  if (!String(x.subtitle || '').includes('平台整理')) {
    x.subtitle = `${x.subtitle || ''}（平台整理）`;
  }
  x.updatedAt = new Date().toISOString();
  updated += 1;
}

fs.writeFileSync(P, JSON.stringify(arr, null, 2));
console.log('UPDATED=' + updated);
for (const x of arr.filter((v) => String(v.id || '').startsWith('l_lab_'))) {
  console.log('  ' + x.title);
  console.log('    ' + String(x.subtitle || '').slice(0, 70));
  console.log('    text 开头: ' + String(x.text || '').slice(0, 30).replace(/\n/g, ' '));
}
