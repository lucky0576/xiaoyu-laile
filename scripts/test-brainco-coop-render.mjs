/**
 * 产教联合独立专题页渲染测试（无浏览器）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-coop-test-'));
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
fs.copyFileSync(path.join(ROOT, 'public', 'static', 'views-brainco-coop.js'), path.join(tmp, 'views-brainco-coop.js'));

fs.writeFileSync(
  path.join(tmp, 'ui.js'),
  `
export const esc = (s) => String(s == null ? '' : s);
export const safeUrl = (s) => String(s || '');
export const toast = () => {};
export const openSheet = () => {};
export const showLoading = () => {};
export const hideLoading = () => {};
export default {};
`,
  'utf-8',
);
fs.writeFileSync(
  path.join(tmp, 'api.js'),
  `
export const service = { createListing: async () => ({ listing: { id: 'l_test' } }), feedbackSubmit: async () => ({}) };
export const api = { form: (f) => f, uploadFile: async () => ({ files: [{ id: 'f1' }] }) };
export const isLoggedIn = () => false;
export default service;
`,
  'utf-8',
);

const mod = await import(pathToFileURL(path.join(tmp, 'views-brainco-coop.js')).href);
const view = await mod.renderBraincoCoop({ state: { user: null }, nav: () => {} });
const html = view.content || '';

const checks = [
  ['标题含产教联合', view.title.includes('产教联合')],
  ['产业学院板块', html.includes('产业学院') && html.includes('创践中心共建')],
  ['实训基地板块', html.includes('实训基地') && html.includes('产教融合实训基地共建')],
  ['课程板块', html.includes('课程') && html.includes('脑机接口技术与应用实训课程')],
  ['65 万套装', html.includes('65万双臂数采套装') && html.includes('650,000')],
  ['课程价格 100,000', html.includes('¥100,000')],
  ['8 个方案卡片', (html.match(/bcc-card"/g) || []).length >= 8],
  ['申请合作按钮', html.includes('bcc-apply')],
  ['申请参访按钮', html.includes('bcc-visit')],
  ['分享本页按钮', html.includes('bcc-share')],
  ['返回主专题链接', html.includes('href="#/brainco"')],
  ['无下载入口', !html.includes('download')],
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(' ', ok ? '✅' : '❌', name);
  if (ok) pass += 1;
}
console.log(`  结果: ${pass}/${checks.length}`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(pass === checks.length ? 0 : 1);
