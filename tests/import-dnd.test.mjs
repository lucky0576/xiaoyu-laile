/**
 * 导入（拖拽 / 文件夹）单元测试
 *
 * 这两块逻辑纯前端，但**算法部分可以脱离浏览器验证**：
 *   · filterImportable —— 过滤系统文件、空文件、不支持类型、超量截断
 *   · filesFromDataTransfer —— 递归展开文件夹（webkitGetAsEntry）
 *
 * 文件夹展开最容易出错的地方是 readEntries 一次只返回 100 条，
 * 不反复读就会静默漏文件 —— 这里用 250 个文件的多层目录把它锁住。
 *
 * 运行：node tests/import-dnd.test.mjs
 */
import assert from 'node:assert/strict';

/* ---------------- 浏览器最小桩 ---------------- */
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = globalThis.location || { hash: '', origin: 'http://test', href: 'http://test' };
globalThis.document = globalThis.document || {
  querySelector: () => null,
  createElement: () => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {},
  }),
};

const { filterImportable, filesFromDataTransfer } = await import('../public/static/views-publish.js');

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

const fake = (name, size = 100) => ({ name, size });

/* ---------------- filterImportable ---------------- */
console.log('\n=== 导入文件过滤 ===');

const normal = filterImportable([fake('方案.pdf'), fake('预算.xlsx'), fake('现场照片.jpg')]);
check('常规文件全部保留', normal.files.length === 3 && normal.skipped === 0,
  JSON.stringify({ kept: normal.files.length, skipped: normal.skipped }));

const junk = filterImportable([
  fake('方案.pdf'),
  fake('.DS_Store'),
  fake('~$预算.xlsx'),
  fake('._resource.pdf'),
  fake('空文件.txt', 0),
]);
check('过滤系统文件与空文件', junk.files.length === 1 && junk.skipped === 4,
  JSON.stringify({ kept: junk.files.length, skipped: junk.skipped }));
check('保留的是正常文件', junk.files[0]?.name === '方案.pdf', junk.files[0]?.name);

const unsupported = filterImportable([fake('方案.pdf'), fake('木马.exe'), fake('脚本.sh'), fake('无扩展名')]);
check('过滤不支持的类型', unsupported.files.length === 2, JSON.stringify(unsupported.files.map((f) => f.name)));
check('无扩展名文件按放行处理（可能是 CAD 等）',
  unsupported.files.some((f) => f.name === '无扩展名'), JSON.stringify(unsupported.files.map((f) => f.name)));

const many = filterImportable(Array.from({ length: 400 }, (_, i) => fake(`f${i}.pdf`)));
check('超量截断到 300', many.files.length === 300, String(many.files.length));
check('超量部分计入跳过', many.skipped === 100, String(many.skipped));

const empty = filterImportable([]);
check('空输入安全', empty.files.length === 0 && empty.skipped === 0);
const nul = filterImportable(null);
check('null 输入不抛异常', Array.isArray(nul.files) && nul.files.length === 0);
const bad = filterImportable([null, undefined, {}, fake('ok.pdf')]);
check('脏元素安全跳过', bad.files.length === 1 && bad.files[0].name === 'ok.pdf',
  JSON.stringify(bad.files.map((f) => f.name)));

/* ---------------- filesFromDataTransfer ---------------- */
console.log('\n=== 拖拽 / 文件夹展开 ===');

/** 造一个假的 FileSystemEntry 树 */
function dir(name, children) {
  return {
    isDirectory: true, isFile: false, name,
    createReader() {
      let served = 0;
      return {
        // 模拟浏览器行为：一次最多给 100 条
        readEntries(cb) {
          const slice = children.slice(served, served + 100);
          served += slice.length;
          cb(slice);
        },
      };
    },
  };
}
function file(name) {
  return {
    isFile: true, isDirectory: false, name,
    file(cb) { cb(fake(name)); },
  };
}

const dt = (entries) => ({
  items: entries.map((en) => ({ kind: 'file', webkitGetAsEntry: () => en })),
  files: [],
});

// 没有 webkitGetAsEntry 时退回 files
const noApi = await filesFromDataTransfer({ items: [], files: [fake('a.pdf'), fake('b.pdf')] });
check('不支持 Entry API 时退回 files', noApi.length === 2, String(noApi.length));

// 单个文件夹
const one = await filesFromDataTransfer(dt([dir('项目资料', [file('可研.pdf'), file('预算.xlsx')])]));
check('可展开单个文件夹', one.length === 2, JSON.stringify(one.map((f) => f.name)));

// 多层嵌套
const nested = await filesFromDataTransfer(dt([
  dir('项目', [
    file('封面.jpg'),
    dir('技术', [file('方案.pdf'), dir('图纸', [file('总图.dwg')])]),
    dir('商务', [file('报价.xlsx')]),
  ]),
]));
check('可展开多层嵌套目录', nested.length === 4, JSON.stringify(nested.map((f) => f.name)));
check('深层文件也被找到', nested.some((f) => f.name === '总图.dwg'), JSON.stringify(nested.map((f) => f.name)));

// 关键：一次 readEntries 只给 100 条，250 个文件必须全部拿到
const bigFiles = Array.from({ length: 250 }, (_, i) => file(`f${i}.pdf`));
const big = await filesFromDataTransfer(dt([dir('大目录', bigFiles)]));
check('超过 100 个文件不会漏（readEntries 需反复读）', big.length === 250, `实际 ${big.length}`);

// 混合拖入
const mixed = await filesFromDataTransfer(dt([
  file('散装文件.pdf'),
  dir('文件夹', [file('里面.pdf')]),
]));
check('文件与文件夹混合拖入都处理', mixed.length === 2, JSON.stringify(mixed.map((f) => f.name)));

// 上限
const huge = await filesFromDataTransfer(dt([dir('超大目录', Array.from({ length: 400 }, (_, i) => file(`g${i}.pdf`)))]));
check('展开结果受 300 上限约束', huge.length === 300, `实际 ${huge.length}`);

// 空文件夹
const emptyDir = await filesFromDataTransfer(dt([dir('空目录', [])]));
check('空文件夹返回空数组', emptyDir.length === 0);

console.log(`\n${'='.repeat(56)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log('='.repeat(56));
process.exit(failed ? 1 : 0);
