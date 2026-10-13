/**
 * 小鱼来了 — 首页服务端渲染测试
 *
 * 前端是 SPA，没有浏览器就看不到渲染结果。这个测试用最小 DOM 桩把
 * views-home.js 的 renderHome 真跑一遍：走真实 HTTP 拿数据、拼出完整 HTML、
 * 调用 mount 绑定事件，从而抓出模板里的运行时错误（拼错变量、空指针等）。
 *
 * 运行：node tests/home-render.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const TEST_DATA = path.join(ROOT, 'data-test-home');
fs.rmSync(TEST_DATA, { recursive: true, force: true });
process.env.DATA_DIR = 'data-test-home';
process.env.NO_SEED = '1';
process.env.SESSION_SECRET = 'home-test-'.padEnd(48, 'x');
process.env.PUBLIC_BASE_URL = '';

const { createApp } = await import('../src/http/app.js');
const registerRoutes = (await import('../src/routes/index.js')).default;
const { PUBLIC_DIR } = await import('../src/config.js');
const { seedIfEmpty } = await import('../scripts/seed.js');

const PORT = 8933;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function has(html, needle, label) {
  check(label || `包含 ${needle}`, html.includes(needle));
}

/* ---------------- 最小 DOM 桩 ---------------- */
const listeners = [];
function makeEl(tag = 'div') {
  const el = {
    tagName: tag,
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    children: [],
    innerHTML: '',
    textContent: '',
    addEventListener(...a) { listeners.push(a); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    insertAdjacentHTML() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    scrollIntoView() {},
    focus() {},
    remove() {},
  };
  return el;
}

globalThis.window = {
  location: { hash: '#/home', href: `${BASE}/#/home`, origin: BASE, protocol: 'http:', host: `127.0.0.1:${PORT}` },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  scrollTo() {},
  isSecureContext: false,
  matchMedia: () => ({ matches: false, addEventListener() {} }),
};
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: makeEl,
  addEventListener() {},
  body: makeEl('body'),
  head: makeEl('head'),
  cookie: '',
};
globalThis.navigator = { userAgent: 'node-test', clipboard: null };
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); },
};
globalThis.location = globalThis.window.location;

/* fetch 相对路径补全为本机地址 */
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const u = typeof url === 'string' && url.startsWith('/') ? BASE + url : url;
  return realFetch(u, init);
};

async function main() {
  const app = createApp();
  registerRoutes(app);
  await app.listen(PORT, '127.0.0.1');
  const seeded = await seedIfEmpty();
  check('演示数据就绪', seeded.created && seeded.listings > 0, JSON.stringify(seeded));

  const { service } = await import('../public/static/api.js');
  const viewsHome = await import('../public/static/views-home.js');
  check('views-home 模块可加载', typeof viewsHome.renderHome === 'function');

  const site = await service.site();
  const taxonomy = await service.taxonomy();
  check('站点信息可获取', Boolean(site?.name));
  check('行业字典可获取', (taxonomy?.industries || []).length > 10);

  const makeCtx = (user) => ({
    state: { site, taxonomy, user, unread: 0, taxonomy_: undefined },
    nav() {},
    back() {},
    toast() {},
    requireLogin() { return true; },
    refreshMe() {},
  });

  /* ---------------- 游客渲染 ---------------- */
  console.log('\n=== 游客视角渲染首页 ===');
  const guestCtx = makeCtx(null);
  let view = null;
  try {
    view = await viewsHome.renderHome(guestCtx, {});
  } catch (err) {
    check('renderHome 执行成功', false, `${err.message}\n${String(err.stack).split('\n').slice(0, 4).join('\n')}`);
  }
  check('renderHome 执行成功', Boolean(view));
  if (view) {
    const html = view.content;
    check('返回 HTML 字符串', typeof html === 'string' && html.length > 2000, `长度 ${String(html).length}`);
    check('标题正确', view.title === site.name, String(view.title));
    check('高亮首页 tab', view.activeTab === 'home');

    console.log('  —— 结构检查 ——');
    has(html, 'home-wrap', '含首页容器');
    has(html, 'home-notice', '含顶部消息条');
    has(html, 'home-banner', '含轮播 Banner');
    has(html, 'class="dots"', '含轮播指示点');
    check('轮播已改为视频位（含 slide video）', html.includes('slide video'));
    check('轮播含直播角标', html.includes('LIVE 直播中') || html.includes('live-tag'));
    check('轮播含短视频角标', html.includes('🎬 短视频'));
    check('轮播 slide 使用 data-href 跳转', html.includes('data-href="#/live/'));
    check('轮播保留平台宣传位', html.includes('让每一条好项目'));
    has(html, 'home-grid', '含 2×3 入口网格');
    has(html, 'home-card', '含入口卡片');
    has(html, 'home-panel', '含推荐面板');
    has(html, 'data-rec="project"', '含推荐项目 Tab');
    has(html, 'data-rec="event"', '含推荐活动 Tab');
    has(html, 'data-rec="trade"', '含推荐贸易 Tab');
    has(html, 'home-scroll', '含横滑容器');
    has(html, 'home-tile', '含横滑小卡');
    has(html, 'home-list2', '含两列卡片容器');
    has(html, 'home-item', '含两列内容卡');
    has(html, 'home-stats', '含统计条');
    has(html, 'login-banner', '游客可见登录入口');

    console.log('  —— 六大入口检查 ——');
    for (const [label, href] of [
      ['项目需求', '#/list/project'],
      ['活动赛事', '#/list/event'],
      ['贸易采供', '#/list/trade'],
      ['群聊', '#/chat'],
      ['会议', '#/join'],
      ['通讯录', '#/contacts'],
    ]) {
      check(`入口「${label}」存在且指向 ${href}`, html.includes(`>${label}</div>`) && html.includes(`href="${href}"`));
    }

    console.log('  —— 数据渲染检查 ——');
    const first = (await service.listings({ pageSize: 1 })).items[0];
    if (first) {
      // 页面里文本会经过 HTML 转义，比对时必须用同样的转义
      const esc = (s) => String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      check('消息条渲染了真实信息标题', html.includes(esc(first.title.slice(0, 10))), first.title.slice(0, 20));
    }
    check('轮播含平台宣传页', html.includes('让每一条好项目'));
    check('行业快捷渲染了行业名', taxonomy.industries.slice(0, 5).some((i) => html.includes(i.name)));

    console.log('  —— 未闭合标签粗查 ——');
    const opens = (html.match(/<div\b/g) || []).length;
    const closes = (html.match(/<\/div>/g) || []).length;
    check(`div 标签基本配平（${opens} 开 / ${closes} 闭）`, Math.abs(opens - closes) <= 2, `差 ${opens - closes}`);

    console.log('  —— mount 绑定不抛异常 ——');
    const fakeRoot = {
      querySelector(sel) { return sel === '#home-banner' || sel === '#home-rec' ? null : null; },
      querySelectorAll() { return []; },
      addEventListener() {},
    };
    try {
      await view.mount(fakeRoot);
      check('mount 执行成功（无 DOM 也不崩）', true);
    } catch (err) {
      check('mount 执行成功（无 DOM 也不崩）', false, err.message);
    }
  }

  /* ---------------- 登录态渲染 ---------------- */
  console.log('\n=== 登录用户视角渲染首页 ===');
  const c = await (await fetch(`${BASE}/api/auth/sms/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13500009999', purpose: 'login' }),
  })).json();
  const login = await (await fetch(`${BASE}/api/auth/sms/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13500009999', code: c.data.demoCode, purpose: 'login', nickname: '首页测试用户' }),
  })).json();
  check('测试用户登录成功', Boolean(login.data?.token));

  const userCtx = makeCtx(login.data.user);
  let view2 = null;
  try {
    view2 = await viewsHome.renderHome(userCtx, {});
  } catch (err) {
    check('登录态 renderHome 执行成功', false, err.message);
  }
  check('登录态 renderHome 执行成功', Boolean(view2));
  if (view2) {
    check('登录后不再显示登录横幅', !view2.content.includes('login-banner'));
    check('登录后仍含全部六入口', ['项目需求', '活动赛事', '贸易采供', '群聊', '会议', '通讯录'].every((t) => view2.content.includes(t)));
  }

  /* ---------------- 上传真实短视频后，轮播应渲染 video 与静音开关 ---------------- */
  console.log('\n=== 上传短视频后重新渲染首页 ===');
  const token = login.data.token;
  const fd = new FormData();
  fd.append('type', 'short');
  fd.append('title', '轮播视频位自检：储能产线实拍');
  fd.append('subtitle', '验证首页轮播能播放上传的视频');
  fd.append('file', new Blob([Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex')], { type: 'video/mp4' }), 'clip.mp4');
  const up = await fetch(`${BASE}/api/feeds`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const upJson = await up.json();
  check('上传短视频成功', up.status === 201 && Boolean(upJson.data?.feed?.id), JSON.stringify(upJson).slice(0, 200));
  if (upJson.data?.feed) {
    check('返回的视频地址可访问', String(upJson.data.feed.videoUrl || '').startsWith('/files/'), upJson.data.feed.videoUrl);
    check('短视频标记为精选（进轮播）', upJson.data.feed.featured === true);

    const view3 = await viewsHome.renderHome(makeCtx(login.data.user), {});
    check('轮播里出现 <video> 元素', view3.content.includes('<video'));
    check('轮播里出现静音开关', view3.content.includes('data-mute'));
    check('轮播里出现新上传的视频地址', view3.content.includes(String(upJson.data.feed.videoUrl).slice(0, 20)));
    check('轮播 slide 数量增加', (view3.content.match(/class="slide/g) || []).length >= 2, `slide 数 ${(view3.content.match(/class="slide/g) || []).length}`);
  }

  /* ---------------- 每个页面都能回首页 ---------------- */
  console.log('\n=== 回首页入口 ===');
  try {
    const appMod = await import('../public/static/app.js');
    const shell = appMod.shell;
    check('可调用 shell()', typeof shell === 'function');

    if (typeof shell === 'function') {
      const page = () => '<div class="page">内容</div>';

      const homeHtml = shell({ title: site.name, activeTab: 'home', content: page() });
      check('首页顶栏显示品牌名', homeHtml.includes('小鱼来了'), homeHtml.slice(0, 160));
      check('首页顶栏标题是回首页链接', homeHtml.includes('href="#/home"') && homeHtml.includes('title-link'));
      check('首页不重复显示 🏠', !homeHtml.includes('nav-home'));

      const detailHtml = shell({ title: '项目详情', activeTab: 'project', showBack: true, content: page() });
      check('带返回箭头的页面有 🏠 回首页', detailHtml.includes('nav-home') && detailHtml.includes('🏠'),
        detailHtml.slice(0, 200));
      check('内页标题同样是回首页链接', detailHtml.includes('href="#/home"'));
      check('内页仍保留返回箭头', detailHtml.includes('nav-back'));

      const noticeHtml = shell({ title: '消息通知', noTab: true, showBack: true, content: page() });
      check('无底部导航的页面也有 🏠', noticeHtml.includes('nav-home'));
      check('无底部导航时不渲染 tabbar', !noticeHtml.includes('class="tabbar"'));

      const loginHtml = shell({ title: '登录', noTab: true, showBack: true, content: page() });
      check('登录页也有 🏠（否则登录后无路可走）', loginHtml.includes('nav-home'));

      const listHtml = shell({ title: '项目', activeTab: 'project', content: page() });
      check('有底部导航的页面底部含首页 tab', listHtml.includes('#/home') && listHtml.includes('首页'));
    }
  } catch (err) {
    check('加载 app.js 并检查 shell()', false, err.message);
  }

  await app.close();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`通过 ${passed} 项，失败 ${failed} 项`);
  if (failures.length) {
    console.log('\n失败明细：');
    for (const f of failures) console.log(`  ✗ ${f}`);
  }
  console.log('='.repeat(60));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\n测试异常终止：', err);
  process.exit(1);
});
