/**
 * 把 8 个 CSS 合并成一个 bundle.css。
 *
 * 为什么是「部署时生成真实文件」而不是「服务端动态拼」：
 *   server.js 里 registerStatic 注册在 registerRoutes 之前，
 *   /static/* 会被静态中间件先接住，动态路由拿不到请求
 *   （实测会回退成 index.html，导致整站没样式）。
 *   生成真实文件就绕开了路由顺序问题，静态服务天然支持 ETag。
 *
 * 改动任何一个 CSS 后都要重新跑一次：node scripts/build-css.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'public', 'static');

// 顺序即层叠顺序，与原来 index.html 里的引用顺序一致
const ORDER = [
  'styles.css',
  'home.css',
  'live.css',
  'meeting.css',
  'forum.css',
  'bindings.css',
  'invest.css',
  'tags.css',
];

const parts = [];
let total = 0;
for (const name of ORDER) {
  const p = path.join(DIR, name);
  if (!fs.existsSync(p)) {
    console.warn('  跳过（不存在）:', name);
    continue;
  }
  const css = fs.readFileSync(p, 'utf8');
  total += css.length;
  parts.push(`/* ==== ${name} ==== */\n${css}`);
}

const out = path.join(DIR, 'bundle.css');
fs.writeFileSync(out, parts.join('\n'), 'utf8');
const size = fs.statSync(out).size;
console.log(`  已生成 bundle.css：${ORDER.length} 个文件，${(size / 1024).toFixed(1)} KB`);
