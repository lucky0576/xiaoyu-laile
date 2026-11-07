/**
 * 短视频页面渲染测试（不依赖浏览器）
 *
 * 做法：把 views-shorts.js 复制到临时目录，配两个 stub（ui.js / api.js），
 * 用假数据调用 renderShorts，检查返回的 HTML 是否包含：
 *   · data-project 按钮（了解项目）
 *   · 联系人（而不是发布者昵称）
 *   · 50 条请求（service.feeds 收到 limit=50）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shorts-test-'));
const src = path.join(ROOT, 'public', 'static', 'views-shorts.js');
fs.copyFileSync(src, path.join(tmp, 'views-shorts.js'));
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }), 'utf-8');

fs.writeFileSync(
  path.join(tmp, 'ui.js'),
  `
export const esc = (s) => String(s == null ? '' : s);
export const safeUrl = (s) => String(s || '');
export const initials = (s) => String(s || 'U').slice(0, 1);
export const toast = () => {};
export const copyText = async () => true;
export const emptyState = (ico, text, extra) => '<div>' + text + (extra || '') + '</div>';
export const fmtDate = (s) => String(s || '');
export const confirmDialog = async () => true;
export const promptDialog = async () => '';
export default {};
`,
  'utf-8',
);

const calls = [];
fs.writeFileSync(
  path.join(tmp, 'api.js'),
  `
const items = [
  {
    id: 'fd_test1',
    type: 'short',
    title: '转让｜杭州上城区东站地铁口商业物业整体出售',
    videoUrl: '/files/test.mp4',
    coverUrl: '/files/test.jpg',
    listingId: 'l_test',
    listing: {
      id: 'l_test',
      title: '转让｜杭州上城区东站地铁口商业物业整体出售',
      categoryName: '项目',
      contact: { name: '彭仁喜', phone: '13900000000', wechat: 'pengwx', hidden: false },
    },
    owner: { nickname: '不该显示的发布者' },
    stats: { views: 1, likes: 2, comments: 3, favorites: 4 },
  },
  { id: 'fd_plain', type: 'short', title: '普通短视频', videoUrl: '/files/a.mp4', owner: { nickname: '张三' }, stats: {} },
];
export const service = {
  feeds: async (q) => {
    globalThis.__feedQuery = q;
    return { items: q && q.type === 'short' ? items : [] };
  },
  dramaEpisodes: async () => ({ items: [] }),
  viewFeed: async () => ({}),
  likeFeed: async () => ({ liked: true }),
  toggleFavorite: async () => ({ favorited: true }),
  feed: async () => ({ feed: items[0] }),
  feedbackSubmit: async () => ({}),
  favorites: async () => ({ items: [] }),
};
export const api = { uploadFile: async () => ({}) };
export const isLoggedIn = () => false;
export default service;
`,
  'utf-8',
);

const mod = await import(pathToFileURL(path.join(tmp, 'views-shorts.js')).href);
const ctx = {
  state: { user: null },
  nav: (u) => calls.push(['nav', u]),
  toast: () => {},
};
const view = await mod.renderShorts(ctx, {});
const html = view.content || '';

const checks = [
  ['页面包含「了解项目」按钮', html.includes('data-project') && html.includes('了解项目')],
  ['页面显示项目联系人', html.includes('彭仁喜')],
  ['页面显示联系电话', html.includes('13900000000')],
  ['项目短视频不显示发布者昵称', !html.includes('不该显示的发布者')],
  ['项目短视频隐藏「联系我」', !/data-contact="0"/.test(html)],
  ['id=fd_test1 的 slide 带 listing-id', html.includes('data-listing-id="l_test"')],
  ['普通短视频仍显示发布者', html.includes('张三')],
  ['请求条数为 50', globalThis.__feedQuery && globalThis.__feedQuery.limit === 50],
  ['页面有 slide 结构', html.includes('short-slide')],
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(' ', ok ? '✅' : '❌', name);
  if (ok) pass += 1;
}
console.log(`  结果: ${pass}/${checks.length}`);

try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* ignore */
}
process.exit(pass === checks.length ? 0 : 1);
