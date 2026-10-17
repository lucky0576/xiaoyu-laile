/**
 * 长文档分块 —— 单元测试
 *
 * 背景：用户反馈「AI 汇总无法提取所有 PDF 内容」。
 * 原因是文本被一路截断：
 *     core.js  aggregateText(files, 14000)
 *     ai.js    fileText.slice(0, 12000)
 * 一份 47 页、30790 字的商业计划书，只有 12000 字进了模型，丢了 61%。
 *
 * 现在改为：短文档单次送全量，长文档按块提炼再合并。
 * 这个测试锁住分块的两个关键性质：
 *   · 不丢内容（拼接回去必须和原文逐字相等）
 *   · 不在句子中间断开（否则模型会读到半句话）
 *
 * 运行：node tests/ai-chunk.test.mjs
 */
import assert from 'node:assert/strict';

process.env.DATA_DIR = 'data-test-chunk';
process.env.NO_SEED = '1';
process.env.SESSION_SECRET = 'x'.repeat(48);
process.env.PUBLIC_BASE_URL = '';

const { splitChunks, CHUNK_CHARS, SINGLE_SHOT_CHARS } = await import('../src/services/ai.js');

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

const strip = (s) => String(s).replace(/\s/g, '');

/* ---------------- 常量合理性 ---------------- */
console.log('\n=== 上限设置 ===');
check('单次上限不低于 2 万字', SINGLE_SHOT_CHARS >= 20000, String(SINGLE_SHOT_CHARS));
check('单次上限覆盖旧值（12000）', SINGLE_SHOT_CHARS > 12000, String(SINGLE_SHOT_CHARS));
check('分块小于单次上限', CHUNK_CHARS < SINGLE_SHOT_CHARS, `${CHUNK_CHARS} < ${SINGLE_SHOT_CHARS}`);

/* ---------------- 基本行为 ---------------- */
console.log('\n=== 基本行为 ===');
check('空字符串返回空数组', splitChunks('').length === 0);
check('null 安全', splitChunks(null).length === 0);
check('undefined 安全', splitChunks(undefined).length === 0);
check('纯空白返回空数组', splitChunks('   \n\n  ').length === 0);
check('短文本不切块', splitChunks('这是一段短文本', 1000).length === 1);

/* ---------------- 不丢内容 ---------------- */
console.log('\n=== 不丢内容（最关键） ===');
const para = Array.from({ length: 300 }, (_, i) =>
  `第${i + 1}段：这是用于验证分块逻辑的测试段落，长度大约四十个字左右，包含逗号、顿号、以及句号。`).join('\n');
const chunks = splitChunks(para, 2000);
check('长文本被切成多块', chunks.length > 1, `切了 ${chunks.length} 块`);
check('拼接后与原文逐字相同（无丢字）', strip(chunks.join('')) === strip(para),
  `${strip(chunks.join('')).length} vs ${strip(para).length}`);

// 真实文档规模：3 万字
const big = Array.from({ length: 800 }, (_, i) =>
  `第${i + 1}节：本节描述项目背景、建设内容、投资规模与实施计划，用于模拟一份三万字左右的项目资料。`).join('\n');
const bigChunks = splitChunks(big);
check('三万字文档能正确分块', bigChunks.length >= 2, `切了 ${bigChunks.length} 块`);
check('三万字文档无内容丢失', strip(bigChunks.join('')) === strip(big),
  `${strip(bigChunks.join('')).length} vs ${strip(big)}`);
check('每块不超过上限', bigChunks.every((c) => c.length <= CHUNK_CHARS + 50),
  `最长 ${Math.max(...bigChunks.map((c) => c.length))}`);

/* ---------------- 不切断句子 ---------------- */
console.log('\n=== 不在句子中间断开 ===');
const sent = Array.from({ length: 200 }, (_, i) =>
  `这是第${i + 1}个句子，它有一定的长度，用来验证分块时不会把一句话劈成两半导致语义断裂。`).join('');
const sentChunks = splitChunks(sent, 500);
check('按句末标点切分', sentChunks.slice(0, -1).every((c) => /[。！？；]$/.test(c.trim())),
  JSON.stringify(sentChunks.map((c) => c.slice(-3))));
check('句子文本无丢失', strip(sentChunks.join('')) === strip(sent));

/* ---------------- 超长单行 ---------------- */
console.log('\n=== 超长单行 ===');
// 一行两万字且没有换行：必须先按句子切，仍超长才硬切
const oneLine = '这是一句没有任何换行的超长文本。'.repeat(1500);
const oneChunks = splitChunks(oneLine, 1000);
check('超长单行能切分', oneChunks.length > 1, `切了 ${oneChunks.length} 块`);
check('超长单行无丢失', strip(oneChunks.join('')) === strip(oneLine));
check('超长单行每块不超上限太多', oneChunks.every((c) => c.length <= 1100),
  `最长 ${Math.max(...oneChunks.map((c) => c.length))}`);

/* ---------------- 边界 ---------------- */
console.log('\n=== 边界 ===');
const exact = '甲'.repeat(1000);
check('恰好等于上限时不切', splitChunks(exact, 1000).length === 1);
check('超出上限 1 个字时切两块', splitChunks('甲'.repeat(1001), 1000).length === 2);
check('保留换行结构（不把行粘死）', splitChunks('第一行内容\n第二行内容', 1000)[0].includes('\n'));

console.log(`\n${'='.repeat(56)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log('='.repeat(56));

// 清理隔离数据目录
const fs = await import('node:fs');
try {
  fs.rmSync('data-test-chunk', { recursive: true, force: true });
} catch { /* ignore */ }

process.exit(failed ? 1 : 0);
