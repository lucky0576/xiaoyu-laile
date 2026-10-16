/**
 * 联系方式自动隐藏 —— 单元测试
 *
 * 重点是两头都不能出错：
 *   · 漏：手机号变体（+86 / 空格 / 短横线 / 全角）绕过识别
 *   · 误伤：金额、日期、项目编号被当成联系方式隐掉
 *
 * 运行：node tests/contact-mask.test.mjs
 */
import assert from 'node:assert/strict';
import { scanContacts, maskContacts, hasContact, normalizeFullWidth, MASK } from '../src/lib/contact-mask.js';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ---------------- 应当识别并隐藏 ---------------- */
console.log('\n=== 应当隐藏 ===');

const phones = [
  ['裸手机号', '联系电话13812345678'],
  ['带空格', '手机 138 1234 5678'],
  ['带短横线', '138-1234-5678'],
  ['带 +86', '联系人 +8613812345678'],
  ['86 前缀空格', '86 13812345678'],
  ['全角数字', '电话１３８１２３４５６７８'],
];
for (const [label, text] of phones) {
  const r = maskContacts(text);
  check(`隐藏手机号：${label}`, r.count >= 1, JSON.stringify({ text: r.text, count: r.count }));
  // 隐藏后连数字都不该剩，否则说明只遮了一部分
  check(`  手机号已不可读：${label}`, !/1[3-9]\d{9}/.test(r.text.replace(/\D/g, '')), r.text);
}

const email = maskContacts('商务邮箱 zhang.san@example.com 欢迎联系');
check('隐藏邮箱', email.count === 1 && !email.text.includes('@'), email.text);

const wechat = [
  ['微信前缀', '微信 zhangsan2026'],
  ['加号前缀', '微信：zhang_san-01'],
  ['vx 简写', 'vx:hello12345'],
  ['QQ 号', 'QQ 87654321'],
];
for (const [label, text] of wechat) {
  const r = maskContacts(text);
  check(`隐藏社交账号：${label}`, r.count >= 1 && r.text.includes(MASK), JSON.stringify({ text: r.text, count: r.count }));
}

const landline = maskContacts('座机 010-88886666 转 802');
check('隐藏固定电话', landline.count === 1, JSON.stringify(landline.text));

const service = maskContacts('服务热线 400-123-4567');
check('隐藏 400 服务电话', service.count === 1, JSON.stringify(service.text));

const mixed = maskContacts('张工 13812345678，邮箱 a@b.com，微信 zhanggong2026，座机 010-88886666');
check('一条文本里多处联系方式全部隐藏', mixed.count >= 4, `实际 ${mixed.count}`);
check('混合文本已无手机号', !/1[3-9]\d{9}/.test(mixed.text.replace(/[\s-]/g, '')), mixed.text);
check('混合文本已无邮箱', !mixed.text.includes('@'), mixed.text);
check('混合文本已无微信号', !mixed.text.includes('zhanggong2026'), mixed.text);
check('混合文本统计出类型', mixed.kinds.length >= 3, JSON.stringify(mixed.kinds));

/* ---------------- 不应误伤 ---------------- */
console.log('\n=== 不应误伤 ===');

const safe = [
  ['金额', '项目总投资 50 亿元，融资 6 亿元'],
  ['金额带逗号', '总投资 1,235,000 元'],
  ['日期', '截止时间 2026-12-31'],
  ['日期紧排', '20261231 截止'],
  ['百分比', '绿电占比 85%，PUE 1.25'],
  ['规模数字', '规划 3000 个机柜，IT 负载 175MW'],
  ['项目编号', '项目编号 PRJ2026001'],
  ['普通叙述', '本项目采用 EPC 总承包模式，工期 12 个月。'],
  ['无联系方式', '需要电力工程施工总承包一级资质'],
];
for (const [label, text] of safe) {
  const r = maskContacts(text);
  check(`不误伤：${label}`, r.count === 0, `被隐藏了 ${r.count} 处 → ${r.text}`);
}

// 边界：金额里出现 11 位数字但不是手机号
const notPhone = maskContacts('合同金额 23456789012 元');
check('不以 1[3-9] 开头的长数字不算手机号', notPhone.count === 0, notPhone.text);

/* ---------------- 边界与健壮性 ---------------- */
console.log('\n=== 边界 ===');

check('空字符串安全', maskContacts('').count === 0);
check('null 安全', maskContacts(null).count === 0);
check('undefined 安全', maskContacts(undefined).count === 0);
check('纯 null 不抛异常', maskContacts(null).text === '');
check('数字入参不抛异常', typeof maskContacts(12345).text === 'string');

const noHit = maskContacts('这是一段没有联系方式的普通文本');
check('无命中时原样返回', noHit.text === '这是一段没有联系方式的普通文本' && noHit.count === 0);

check('hasContact 能发现手机号', hasContact('打 13900001111') === true);
check('hasContact 对纯文本返回 false', hasContact('这是普通文本') === false);

const full = normalizeFullWidth('１２３４５');
check('全角数字归一化', full === '12345', full);

// 同一号码重复出现
const twice = maskContacts('13812345678 或 13812345678');
check('重复号码都被隐藏', twice.count === 2, `实际 ${twice.count}`);

// 隐藏后不残留任何原始号码片段
const long = maskContacts('中间号码 13812345678 结尾');
check('隐藏后无残留片段', !long.text.includes('1381') && !long.text.includes('5678'), long.text);
check('隐藏占位符已插入', long.text.includes(MASK), long.text);

// scanContacts 返回位置信息
const scanned = scanContacts('电话 13812345678 结束');
check('scanContacts 返回命中位置', scanned.length === 1 && scanned[0].index === 3,
  JSON.stringify(scanned));
check('scanContacts 标注类型', scanned[0]?.kind === '手机号', scanned[0]?.kind);

console.log(`\n${'='.repeat(56)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log('='.repeat(56));
process.exit(failed ? 1 : 0);
