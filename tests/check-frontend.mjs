/**
 * 前端静态自检：
 *  1. 所有 import 的具名导出在目标模块中确实存在
 *  2. 所有 service.xxx / ui.xxx 调用都有对应导出（手写前端最容易犯的错）
 *  3. HTML 引用的资源都存在
 *
 * 运行：node tests/check-frontend.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'static');

let errors = 0;
let checks = 0;

function readExports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  // export function / const / let / class / async function
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  // export { a, b as c }
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg) continue;
      const as = /\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(seg);
      names.add(as ? as[1] : seg.split(/\s+/)[0]);
    }
  }
  if (/^export\s+default/m.test(src)) names.add('default');
  return { names, src };
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js'));
const cache = new Map();
for (const f of files) cache.set(f, readExports(path.join(DIR, f)));

console.log(`检查 ${files.length} 个前端模块\n`);

/* ---------------- 1. import 一致性 ---------------- */
for (const f of files) {
  const src = cache.get(f).src;
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const clause = m[1].trim();
    const spec = m[2];
    const target = path.basename(spec);
    const targetExports = cache.get(target);
    if (!targetExports) {
      console.log(`  ✗ ${f}: 无法解析导入目标 ${spec}`);
      errors++;
      continue;
    }
    // 具名导入
    const braced = /\{([^}]*)\}/.exec(clause);
    if (braced) {
      for (const part of braced[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        checks++;
        if (!targetExports.names.has(name)) {
          console.log(`  ✗ ${f}: 从 ${target} 导入的 "${name}" 并不存在`);
          errors++;
        }
      }
    }
    // 默认 / 命名空间导入
    const beforeBrace = clause.split('{')[0].replace(/,\s*$/, '').trim();
    if (beforeBrace && !beforeBrace.startsWith('*')) {
      checks++;
      if (!targetExports.names.has('default')) {
        console.log(`  ✗ ${f}: 从 ${target} 做了默认导入，但该模块没有默认导出`);
        errors++;
      }
    }
  }
}

/* ---------------- 2. service.xxx / ui.xxx 调用 ---------------- */
function collectObjectKeys(names, file) {
  const src = cache.get(file).src;
  const keys = new Set(names);
  // export const X = { a, b, c: ... }
  for (const name of names) {
    const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\{`, 'm');
    const m = re.exec(src);
    if (!m) continue;
    let i = src.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    let end = i;
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++;
      else if (src[end] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = src.slice(i + 1, end);
    // 顶层键：行首标识符后跟 , 或 :
    for (const km of body.matchAll(/(?:^|[\n,{])\s*([A-Za-z_$][\w$]*)\s*(?:[,:])/g)) keys.add(km[1]);
    // 简写属性 a, b, c
    for (const km of body.matchAll(/(?:^|[\n,])\s*([A-Za-z_$][\w$]*)\s*(?=[,\n}])/g)) keys.add(km[1]);
  }
  return keys;
}

const serviceKeys = collectObjectKeys(['service'], 'api.js');
const uiKeys = collectObjectKeys(['store', 'api', 'ApiError', 'service', 'request', 'isLoggedIn'], 'api.js')
  .union
  ? collectObjectKeys(['service'], 'api.js')
  : collectObjectKeys(['service'], 'api.js');

const uiExportNames = cache.get('ui.js').names;
const uiObjKeys = (() => {
  const src = cache.get('ui.js').src;
  const keys = new Set(uiExportNames);
  // 前端通过 import * as ui 使用，实际调用的是模块顶层导出，故直接用导出名集合
  void src;
  return keys;
})();

for (const f of files) {
  const src = cache.get(f).src;
  // 去掉 import 语句，避免把 './ui.js' 这样的路径字符串误当成 ui.js 调用
  const usage = src
    .replace(/^\s*import\s+[\s\S]*?from\s*['"][^'"]+['"]\s*;?/gm, '')
    .replace(/^\s*import\s*['"][^'"]+['"]\s*;?/gm, '');
  for (const m of usage.matchAll(/\bservice\.([A-Za-z_$][\w$]*)/g)) {
    checks++;
    if (!serviceKeys.has(m[1])) {
      console.log(`  ✗ ${f}: service.${m[1]} 在 api.js 的 service 中不存在`);
      errors++;
    }
  }
  for (const m of usage.matchAll(/\bui\.([A-Za-z_$][\w$]*)/g)) {
    checks++;
    if (!uiObjKeys.has(m[1])) {
      console.log(`  ✗ ${f}: ui.${m[1]} 在 ui.js 中未导出`);
      errors++;
    }
  }
  void uiKeys;
}

/* ---------------- 3. HTML 资源 ---------------- */
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="(\/static\/[^"]+)"/g)) {
  checks++;
  const p = path.join(ROOT, 'public', m[1].replace('/static/', 'static/'));
  if (!fs.existsSync(p)) {
    console.log(`  ✗ index.html 引用的 ${m[1]} 不存在`);
    errors++;
  }
}
// app.js 里的动态引用
const appSrc = cache.get('app.js').src;
for (const m of appSrc.matchAll(/import\s+['"]\.\/([^'"]+)['"]/g)) {
  checks++;
  if (!fs.existsSync(path.join(DIR, m[1]))) {
    console.log(`  ✗ app.js 动态导入 ./${m[1]} 不存在`);
    errors++;
  }
}

/* ---------------- 4. 路由覆盖检查 ---------------- */
const viewExports = {
  'views-home.js': ['renderHome', 'renderList', 'renderSearch', 'renderDetail', 'renderCases', 'renderUser'],
  'views-publish.js': ['renderPublish'],
  'views-account.js': ['renderLogin', 'renderRegister', 'renderMe', 'renderMyListings', 'renderMyRegistrations', 'renderProfile', 'renderQualification', 'renderContacts', 'renderNotifications', 'renderFollows', 'renderAdmin'],
  'views-chat.js': ['renderChat', 'renderMeeting'],
};
for (const [file, names] of Object.entries(viewExports)) {
  for (const n of names) {
    checks++;
    if (!cache.get(file)?.names.has(n)) {
      console.log(`  ✗ ${file} 缺少导出的视图函数 ${n}`);
      errors++;
    }
  }
}

console.log(`\n共 ${checks} 项检查，${errors} 个问题`);
process.exit(errors ? 1 : 0);
