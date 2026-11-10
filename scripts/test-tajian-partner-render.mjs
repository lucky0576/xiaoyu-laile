/**
 * 塔建集团合伙人计划页渲染测试（无浏览器）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tjp-test-'));
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
fs.copyFileSync(path.join(ROOT, 'public', 'static', 'views-tajian-partner.js'), path.join(tmp, 'views-tajian-partner.js'));
fs.writeFileSync(path.join(tmp, 'ui.js'), `export const esc = (s) => String(s == null ? '' : s);
export const toast = () => {};
export const openSheet = () => {};
export default {};`, 'utf-8');
fs.writeFileSync(path.join(tmp, 'api.js'), `export const service = { createListing: async () => ({ listing: { id: 'l_test' } }) };
export const api = { form: (f) => f, uploadFile: async () => ({ files: [{ id: 'f1' }] }) };
export const isLoggedIn = () => false;
export default service;`, 'utf-8');

globalThis.location = { origin: 'https://xiaoyulaile.online' };
const mod = await import(pathToFileURL(path.join(tmp, 'views-tajian-partner.js')).href);
const view = await mod.renderTajianPartner({ state: { user: null }, nav: () => {} });
const html = view.content || '';
const src = fs.readFileSync(path.join(ROOT, 'public', 'static', 'views-tajian-partner.js'), 'utf-8');

const checks = [
  ['标题含合伙人计划', view.title.includes('合伙人')],
  ['hero 标题', html.includes('有资源，一起做')],
  ['四类合伙人', html.includes('城市合伙人') && html.includes('行业合伙人') && html.includes('项目合伙人') && html.includes('渠道合伙人')],
  ['收益说明', html.includes('项目居间费') && html.includes('投资分成') && html.includes('EPC / 施工分成')],
  ['资源说明', html.includes('品牌授权') && html.includes('方案支持') && html.includes('培训与陪跑')],
  ['分成说明', html.includes('25 年电站收益') && html.includes('合伙人合作协议')],
  ['合作流程', html.includes('提交申请') && html.includes('收益结算')],
  ['常见问题', html.includes('需要合伙人先投资吗')],
  ['申请按钮', html.includes('tjp-apply') && html.includes('tjp-apply2')],
  ['分享按钮', html.includes('tjp-share')],
  ['返回专题', html.includes('href="#/tajian"')],
  ['未承诺固定收益', html.includes('不构成收益承诺') || html.includes('不承诺固定收益')],
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(' ', ok ? '✅' : '❌', name);
  if (ok) pass += 1;
}
console.log(`  结果: ${pass}/${checks.length}`);
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {}
process.exit(pass === checks.length ? 0 : 1);
