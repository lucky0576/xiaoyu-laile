/**
 * 元宇宙展厅渲染测试（无浏览器）
 * 校验：页面结构、20 条项目数据、分享/二维码/前进后退、Three.js 本地引用
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-test-'));
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
fs.copyFileSync(path.join(ROOT, 'public', 'static', 'views-metaverse.js'), path.join(tmp, 'views-metaverse.js'));

fs.writeFileSync(
  path.join(tmp, 'ui.js'),
  `
export const esc = (s) => String(s == null ? '' : s);
export const safeUrl = (s) => String(s || '');
export const toast = () => {};
export default {};
`,
  'utf-8',
);

fs.writeFileSync(
  path.join(tmp, 'api.js'),
  `
const items = Array.from({ length: 20 }, (_, i) => ({
  id: 'l_test_' + i,
  title: '测试项目 ' + (i + 1),
  categoryName: '项目',
  typeName: '寻求合作',
  cities: [{ name: '杭州' }],
  industries: [{ name: '光伏' }],
}));
export const service = {
  listings: async (q) => {
    globalThis.__query = q;
    return { items };
  },
};
export default service;
`,
  'utf-8',
);

globalThis.location = { origin: 'https://xiaoyulaile.online' };
const mod = await import(pathToFileURL(path.join(tmp, 'views-metaverse.js')).href);
const view = await mod.renderMetaverse({ state: { user: null }, nav: () => {} });
const html = view.content || '';
const src = fs.readFileSync(path.join(ROOT, 'public', 'static', 'views-metaverse.js'), 'utf-8');
const three = path.join(ROOT, 'public', 'static', 'vendor', 'three.module.js');

const checks = [
  ['标题为产业元宇宙展厅', view.title.includes('元宇宙')],
  ['全屏沉浸模式', view.fullscreen === true && view.noTab === true],
  ['画布存在', html.includes('id="mv-canvas"')],
  ['顶部栏 + 分享', html.includes('mv-topbar') && html.includes('mv-share')],
  ['二维码弹层', html.includes('mv-qr-mask') && src.includes('/api/share/qrcode')],
  ['前进后退按钮', html.includes('mv-up') && html.includes('mv-down')],
  ['请求 20 条项目', globalThis.__query && globalThis.__query.pageSize === 20],
  ['本地 three.js 引用', src.includes('/static/vendor/three.module.js')],
  ['three.js 文件存在且完整', fs.existsSync(three) && fs.statSync(three).size > 500000],
  ['项目展板可点击进详情', src.includes('listingId') && src.includes('#/detail/')],
  ['强脑科技展位', src.includes('#/brainco') && src.includes('BrainCo')],
  ['数字人讲解音频', src.includes('/static/metaverse/mv-voice-1.mp3') && src.includes('voice-3')],
  ['讲解按钮与字幕', html.includes('mv-narrate') && html.includes('mv-subtitle')],
  ['3D 简模（灵巧手/双臂机器人）', src.includes('fingerParts') && src.includes('robotArms')],
  ['数字人讲解员', src.includes('avatarParts') && src.includes('mouth')],
  ['分享海报', src.includes('makePoster') && src.includes('mv-poster')],
  ['VR 模式', src.includes('immersive-vr')],
  ['移动端手势（拖动/缩放）', src.includes('pointermove') && src.includes('pinchDist')],
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(' ', ok ? '✅' : '❌', name);
  if (ok) pass += 1;
}
console.log(`  结果: ${pass}/${checks.length}`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(pass === checks.length ? 0 : 1);
