/**
 * 强脑科技专题页渲染测试（无浏览器）
 * 校验：四大板块、27 个产品、价格、采购按钮、自动发布按钮
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brainco-test-'));
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
fs.copyFileSync(path.join(ROOT, 'public', 'static', 'views-brainco.js'), path.join(tmp, 'views-brainco.js'));

fs.writeFileSync(
  path.join(tmp, 'ui.js'),
  `
export const esc = (s) => String(s == null ? '' : s);
export const safeUrl = (s) => String(s || '');
export const initials = (s) => String(s || 'U').slice(0, 1);
export const toast = () => {};
export const copyText = async () => true;
export const emptyState = (a, b) => '<div>' + b + '</div>';
export const openSheet = () => {};
export const showLoading = () => {};
export const hideLoading = () => {};
export const confirmDialog = async () => true;
export const promptDialog = async () => '';
export const fmtDate = (s) => String(s || '');
export default {};
`,
  'utf-8',
);

fs.writeFileSync(
  path.join(tmp, 'api.js'),
  `
export const service = {
  createListing: async () => ({ listing: { id: 'l_test' } }),
  feedbackSubmit: async () => ({}),
};
export const api = { form: (f) => f };
export const isLoggedIn = () => false;
export default service;
`,
  'utf-8',
);

const mod = await import(pathToFileURL(path.join(tmp, 'views-brainco.js')).href);
const ctx = { state: { user: null }, nav: () => {}, requireLogin: () => true };
const view = await mod.renderBrainco(ctx);
const html = view.content || '';

const checks = [
  ['标题正确', view.title.includes('BrainCo')],
  ['公司简介板块', html.includes('01 公司简介') && html.includes('2015')],
  ['产品板块', html.includes('02 合作项目及产品介绍')],
  ['采购板块（电商模式）', html.includes('03 产品报价采购')],
  ['寻求合作/发布板块', html.includes('04 寻求合作')],
  ['RevoTron 报价', html.includes('¥560,000') && html.includes('¥695,000')],
  ['Revo2 报价', html.includes('¥19,999') && html.includes('¥34,999')],
  ['Revo3 报价', html.includes('¥100,000') && html.includes('¥200,000')],
  ['BCIGo 32 通道', html.includes('BCIGo') && html.includes('¥250,000')],
  ['脑控机器人套件 649000', html.includes('¥649,000')],
  ['加入采购单按钮', (html.match(/data-bc-add=/g) || []).length >= 20],
  ['咨询报价按钮（面议产品）', html.includes('data-bc-inquiry')],
  ['寻求合作按钮', html.includes('bc-coop-open')],
  ['一键发布贸易按钮', html.includes('bc-publish-trade')],
  ['采购单底部栏', html.includes('bc-cart-bar')],
  ['寻求合作入口（不是一键发布合作）', html.includes('bc-coop-open') && !html.includes('bc-publish-project')],
  ['合作方向包含产教联合', html.includes('产教联合')],
  ['补充资料板块', html.includes('补充资料') && html.includes('brainco-revo3-spec.xlsx')],
  ['RevoHuman 产品', html.includes('RevoHuman')],
  ['视频区 11 条视频', (html.match(/bc-video-card/g) || []).length >= 11],
  ['视频含 RevoHuman 标签', html.includes('RevoHuman') && html.includes('bc-video-tag')],
  ['没有销售话术资料', !html.includes('销售端话术') && !html.includes('sales wording')],
  ['Revo2 海报图', html.includes('/static/brainco/revo2-poster.jpg')],
  ['Revo3 海报图', html.includes('/static/brainco/revo3-poster.jpg')],
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(' ', ok ? '✅' : '❌', name);
  if (ok) pass += 1;
}
console.log(`  结果: ${pass}/${checks.length}`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(pass === checks.length ? 0 : 1);
