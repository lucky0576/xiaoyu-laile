/**
 * 塔建集团专题页渲染测试（无浏览器）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-test-'));
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
fs.copyFileSync(path.join(ROOT, 'public', 'static', 'views-tajian.js'), path.join(tmp, 'views-tajian.js'));
fs.writeFileSync(
  path.join(tmp, 'ui.js'),
  `export const esc = (s) => String(s == null ? '' : s);
export const toast = () => {};
export const openSheet = () => {};
export default {};`,
  'utf-8',
);
fs.writeFileSync(
  path.join(tmp, 'api.js'),
  `export const service = { createListing: async () => ({ listing: { id: 'l_test' } }) };
export const api = { form: (f) => f, uploadFile: async () => ({ files: [{ id: 'f1' }] }) };
export const isLoggedIn = () => false;
export default service;`,
  'utf-8',
);

globalThis.location = { origin: 'https://xiaoyulaile.online' };
const mod = await import(pathToFileURL(path.join(tmp, 'views-tajian.js')).href);
const view = await mod.renderTajian({ state: { user: null }, nav: () => {} });
const html = view.content || '';
const src = fs.readFileSync(path.join(ROOT, 'public', 'static', 'views-tajian.js'), 'utf-8');
const assets = path.join(ROOT, 'public', 'static', 'tajian');

const checks = [
  ['标题含塔建集团', view.title.includes('塔建集团')],
  ['hero 标题', html.includes('工商业光伏 + 储能')],
  ['公司简介', html.includes('杭州塔建新能源科技集团有限公司') && html.includes('91330106MADQAN0JXU1P')],
  ['法定代表人蒋立风', html.includes('蒋立风')],
  ['三大业务', html.includes('整镇整村能源') && html.includes('工商业光伏') && html.includes('工商业储能')],
  ['源网荷储充', html.includes('9.36MW') && html.includes('2MW/4MWh')],
  ['三泉王村案例', html.includes('三泉王村') && html.includes('263.03')],
  ['整村案例', html.includes('群力村') && html.includes('湘南村') && html.includes('官一村')],
  ['合作模式', html.includes('零投资') && html.includes('免运维')],
  ['服务流程', html.includes('现场踏勘') && html.includes('智能运维')],
  ['资料预览入口', html.includes('tj-doc-profile') && html.includes('tj-doc-ppt')],
  ['申请合作按钮', html.includes('tj-apply') && html.includes('tj-apply2')],
  ['分享按钮', html.includes('tj-share')],
  ['图片资源存在', fs.existsSync(path.join(assets, 'company-cover.jpg')) && fs.existsSync(path.join(assets, 'village.jpg'))],
  ['萧山案例地图', html.includes('tj-map') && html.includes('钱塘江') && html.includes('所前镇 · 三泉王村')],
  ['营业执照资料', html.includes('tj-doc-license') && html.includes('营业执照')],
  ['战略合作生态', html.includes('华为技术') && html.includes('隆基绿能') && html.includes('国家电投')],
  ['营业执照图片存在', fs.existsSync(path.join(assets, 'license.jpg'))],
  ['hero 中间 logo', html.includes('tj-hero-logo') && fs.existsSync(path.join(assets, 'tajian-logo.png'))],
  ['无下载入口', !/download=|下载资料/.test(html)],
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
