/**
 * 小鱼来了 — 前端应用外壳（路由 + 布局 + 实时通道）
 */
import { service, store, isLoggedIn } from './api.js';
import * as ui from './ui.js';
import * as viewsHome from './views-home.js';
import * as viewsPublish from './views-publish.js';
import * as viewsAccount from './views-account.js';
import * as viewsChat from './views-chat.js';
import * as viewsMeeting from './views-meeting.js';
import * as viewsLive from './views-live.js';
import * as viewsShorts from './views-shorts.js';
import * as viewsProvider from './views-provider.js';
import * as viewsAdminShorts from './views-admin-shorts.js';
import * as viewsAdminCovers from './views-admin-covers.js';
import * as viewsForum from './views-forum.js';
import * as viewsBindings from './views-bindings.js';
import * as viewsInvest from './views-invest.js';
import * as viewsAdminInvest from './views-admin-invest.js';
import * as viewsTags from './views-tags.js';
import * as viewsWechatSetup from './views-wechat-setup.js';
import * as viewsNews from './views-news.js';
import * as viewsReferral from './views-referral.js';
import * as viewsFeedback from './views-feedback.js';
import * as viewsLevelAdmin from './views-level-admin.js';

const appEl = document.getElementById('app');

/* ------------------------------------------------------------------ */
/* 全局状态                                                            */
/* ------------------------------------------------------------------ */
export const state = {
  user: store.user,
  unread: 0,
  site: null,
  taxonomy: null,
  sse: null,
  online: false,
};

const TABS = [
  { id: 'home', icon: '🏠', name: '首页', href: '#/home' },
  { id: 'project', icon: '📁', name: '项目', href: '#/list/project' },
  { id: 'publish', icon: '＋', name: '发布', href: '#/publish', center: true },
  { id: 'contacts', icon: '📇', name: '通讯录', href: '#/contacts' },
  { id: 'me', icon: '👤', name: '我的', href: '#/me' },
];

/* ------------------------------------------------------------------ */
/* 路由工具                                                            */
/* ------------------------------------------------------------------ */
function parseHash() {
  const raw = (location.hash || '').replace(/^#/, '') || '/home';
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  let query = {};
  try {
    query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  } catch { /* ignore */ }
  return { segs, query, raw };
}

export function nav(hash) {
  const next = hash.startsWith('#') ? hash : `#${hash}`;

  // 从分享短链 /s/:id、/v/:id 进来的页面，路径要一直保持原样，
  // 这样微信转发时的卡片信息才对得上（微信只抓 # 前面的地址）。
  // 用户在站内跳转到别的页面时，才把路径还原成 /。
  if (location.pathname && location.pathname !== '/') {
    try {
      history.replaceState(null, '', `/${next}`);
      return render();
    } catch {
      /* 失败就走下面常规流程 */
    }
  }

  if (location.hash === next) {
    render();
  } else {
    location.hash = next;
  }
}

export function back(fallback = '#/home') {
  if (history.length > 1) history.back();
  else nav(fallback);
}

/* ------------------------------------------------------------------ */
/* 页面外壳                                                            */
/* ------------------------------------------------------------------ */
/** 顶栏右侧：未登录显示「登录 / 注册」，已登录显示消息铃铛与头像 */
function topbarAuth() {
  if (!isLoggedIn() || !state.user) {
    return `<a class="btn btn-sm btn-primary" href="#/login" style="flex:none">登录 / 注册</a>`;
  }
  const unread = state.unread > 0
    ? `<span class="badge danger" style="position:absolute;transform:translate(12px,-12px)">${state.unread > 99 ? '99+' : state.unread}</span>`
    : '';
  return `<button class="icon-btn" id="topbar-share" type="button" aria-label="分享给微信好友" title="分享给微信好友">📤</button>
    <a class="icon-btn" href="#/notifications" aria-label="消息通知" title="消息通知" style="position:relative">🔔${unread}</a>
    <a href="#/me" aria-label="我的" style="flex:none">${ui.avatarHtml(state.user, 'sm')}</a>`;
}

/* ------------------------------------------------------------------ */
/* 横向栏：滑到最右时去掉渐隐提示                                        */
/* ------------------------------------------------------------------ */
export function bindHScroll(root = document) {
  const els = root.querySelectorAll('.hscroll, .home-scroll, .chips.scroll');
  els.forEach((el) => {
    const sync = () => {
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.classList.toggle('at-end', atEnd);
    };
    if (el.scrollWidth <= el.clientWidth + 4) {
      el.classList.add('at-end');
    }
    el.addEventListener('scroll', sync, { passive: true });
    // 内容异步渲染后再同步一次
    setTimeout(sync, 300);
  });
}

/* 底部导航项过多时改为可横向滑动 */
function syncTabbar() {
  const bar = document.querySelector('.tabbar');
  if (!bar) return;
  const links = bar.querySelectorAll('a');
  bar.style.gridTemplateColumns = '';
  if (links.length > 5) {
    bar.classList.add('scrollable');
  } else {
    bar.classList.remove('scrollable');
  }
}

export function shell({ title = '', content = '', activeTab = '', showBack = false, actions = '', noTab = false, fullscreen = false, cls = '' } = {}) {
  const isHome = activeTab === 'home';
  const titleText = title || state.site?.name || '小鱼来了';

  // 回首页入口，两种都给上：
  //   1) 标题本身可点（点「小鱼来了」回首页）
  //   2) 带返回箭头的页面在箭头旁再放一个明确的 🏠，
  //      以及没有底部导航的页面（noTab：登录/注册/通知/后台等）
  //      也要有，否则用户会卡在那些页面上出不来。
  const needHomeBtn = !isHome && (showBack || noTab);
  const homeBtn = needHomeBtn
    ? '<a class="icon-btn" href="#/home" id="nav-home" aria-label="回到首页" title="回到首页">🏠</a>'
    : '';

  // 标题做成回首页的链接：
  //   · 首页显示「🐟 小鱼来了」品牌
  //   · 其他页显示页面名，同样点得回首页（满足"点击标题回首页"的预期）
  //   · 没有底部导航的页面（noTab：登录/注册/通知/后台等）再额外给一个 🏠，
  //     那些页面没有 tabbar，不放按钮用户会卡住
  const titleEl = `<a class="title title-link" href="#/home" aria-label="回到首页" title="回到首页">${
    isHome ? '🐟 ' : ''
  }${ui.esc(titleText)}</a>`;

  const topbar = fullscreen ? '' : `<div class="topbar">
    ${showBack ? '<button class="icon-btn" id="nav-back" aria-label="返回">←</button>' : ''}
    ${homeBtn}
    <div class="topbar-brand">
      ${titleEl}
      ${isHome ? '<a class="invest-pill" href="#/invest" title="小鱼来了 种子轮融资中">💰 融资</a>' : ''}
      <a class="contact-pill" href="#/contact-us" title="有问题？点这里给管理员留言">📮 联系我</a>
    </div>
    <span class="topbar-spacer"></span>
    ${actions}${actions ? '' : topbarAuth()}
  </div>`;

  const tabbar = noTab || fullscreen ? '' : `<nav class="tabbar" style="grid-template-columns:repeat(${TABS.length},1fr)">
    ${TABS.map((t) => {
      const on = activeTab === t.id ? 'active' : '';
      if (t.center) {
        return `<a href="${t.href}" class="tab-center ${on}" aria-label="${t.name}">
          <span class="fab-inline">${t.icon}</span><span class="lbl">${t.name}</span>
        </a>`;
      }
      return `<a href="${t.href}" class="${on}">
        <span class="ico">${t.icon}</span><span>${t.name}</span>
        ${t.id === 'me' && state.unread > 0 ? '<span class="badge danger" style="position:absolute;transform:translate(14px,-14px)">' + (state.unread > 99 ? '99+' : state.unread) + '</span>' : ''}
      </a>`;
    }).join('')}
  </nav>`;

  // 发布入口已移到导航栏中间，不再需要右下角悬浮按钮
  const fab = '';

  return `<div class="shell ${cls}">${topbar}${content}${fab}${tabbar}</div>`;
}

/* ------------------------------------------------------------------ */
/* 交互绑定                                                            */
/* ------------------------------------------------------------------ */
function bindShell(root) {
  try { bindHScroll(root); syncTabbar(); } catch { /* ignore */ }
  root.querySelector('#nav-back')?.addEventListener('click', () => back());
  root.querySelector('#topbar-share')?.addEventListener('click', async () => {
    const m = await import('./share.js');
    /*
     * 顶栏图标按当前页面决定分享什么：
     *   在融资页 → 分享融资方案（发投资人）
     *   其它页面 → 分享邀请（拉新）
     */
    if (location.hash.startsWith('#/invest')) {
      const r = await service.investPlan().catch(() => null);
      m.openInvestShare(r?.plan || {}, r?.quota || {}).catch(() => ui.toast('生成分享内容失败', 'err'));
      return;
    }
    m.openInviteShare().catch(() => ui.toast('生成分享内容失败', 'err'));
  });
}

export function requireLogin(message = '请先登录后再操作') {
  if (isLoggedIn() && state.user) return true;
  ui.toast(message, 'err');
  nav(`#/login?redirect=${encodeURIComponent(location.hash)}`);
  return false;
}

export async function refreshMe() {
  try {
    const res = await service.me();
    state.user = res.user;
    store.user = res.user;
    state.unread = res.unread || 0;
    updateBadge();
  } catch {
    state.user = null;
    store.clear();
  }
  return state.user;
}

function updateBadge() {
  const meTab = document.querySelector('.tabbar a[href="#/me"]');
  if (!meTab) return;
  let badge = meTab.querySelector('.badge');
  if (state.unread > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'badge danger';
      badge.style.position = 'absolute';
      badge.style.transform = 'translate(14px,-14px)';
      meTab.appendChild(badge);
    }
    badge.textContent = state.unread > 99 ? '99+' : String(state.unread);
  } else if (badge) {
    badge.remove();
  }
}

/* ------------------------------------------------------------------ */
/* 实时通道                                                            */
/* ------------------------------------------------------------------ */
function connectSSE() {
  if (state.sse) {
    state.sse.close();
    state.sse = null;
  }
  if (!isLoggedIn()) return;
  try {
    const es = new EventSource(`/api/events/stream?token=${encodeURIComponent(store.token)}`);
    state.sse = es;
    es.addEventListener('notification', (e) => {
      try {
        const n = JSON.parse(e.data);
        state.unread++;
        updateBadge();
        ui.toast(n.title || '收到新通知', 'ok');
      } catch { /* ignore */ }
    });
    es.addEventListener('open', () => { state.online = true; });
    es.addEventListener('error', () => { state.online = false; });
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* 视图分发                                                            */
/* ------------------------------------------------------------------ */
const ctx = {
  state,
  nav,
  back,
  shell,
  refreshMe,
  requireLogin,
  bindShell,
  toast: ui.toast,
};

async function resolveView({ segs, query }) {
  const [head, p1, p2] = segs;

  switch (head) {
    case undefined:
    case '':
    case 'home':
      return viewsHome.renderHome(ctx, query);
    case 'list':
      return viewsHome.renderList(ctx, { category: p1 || 'project', ...query });
    case 'search':
      return viewsHome.renderSearch(ctx, query);
    case 'detail':
      return viewsHome.renderDetail(ctx, { id: p1, ...query });
    case 'cases':
      return viewsHome.renderCases(ctx, query);
    case 'referral':
      return viewsReferral.renderReferral(ctx);
    case 'favorites':
      return viewsShorts.renderFavorites(ctx);
    case 'contact-us':
      return viewsFeedback.renderContactUs(ctx);
    case 'admin-feedback':
      return viewsFeedback.renderAdminFeedback(ctx);
    case 'admin-level-orders':
      return viewsLevelAdmin.renderAdminLevelOrders(ctx);
    case 'news':
      return p1
        ? viewsNews.renderNewsDetail(ctx, { id: p1 })
        : viewsNews.renderNews(ctx, query);
    case 'user':
      return viewsHome.renderUser(ctx, { id: p1 });
    case 'publish':
      return viewsPublish.renderPublish(ctx, { category: query.category || p1 || 'project', edit: query.edit, ...query });
    case 'login':
      return viewsAccount.renderLogin(ctx, query);
    case 'register':
      return viewsAccount.renderRegister(ctx, query);
    case 'verify':
      return viewsAccount.renderVerify(ctx, query);
    case 'bind-wechat':
      return viewsAccount.renderBindWechat(ctx, query);
    case 'me':
      return viewsAccount.renderMe(ctx, query);
    case 'my-listings':
      return viewsAccount.renderMyListings(ctx, query);
    case 'my-registrations':
      return viewsAccount.renderMyRegistrations(ctx, query);
    case 'profile':
      return viewsAccount.renderProfile(ctx, query);
    case 'qualification':
      return viewsAccount.renderQualification(ctx, query);
    case 'bindings':
      return viewsBindings.renderBindings(ctx, query);
    case 'wechat-setup':
      return viewsWechatSetup.renderWechatSetup(ctx, query);
    case 'tags':
      return viewsTags.renderTags(ctx, query);
    case 'membership':
      return viewsTags.renderMembership(ctx, query);
    case 'invest':
      if (!p1) return viewsInvest.renderInvest(ctx, query);
      if (p1 === 'mine') return viewsInvest.renderMyInvest(ctx, query);
      if (p2 === 'agreement') return viewsInvest.renderAgreement(ctx, { id: p1 });
      if (p2 === 'cert') return viewsInvest.renderCertificate(ctx, { id: p1 });
      return viewsInvest.renderInvestDetail(ctx, { id: p1 });
    case 'contacts':
      return viewsAccount.renderContacts(ctx, query);
    case 'notifications':
      return viewsAccount.renderNotifications(ctx, query);
    case 'follows':
      return viewsAccount.renderFollows(ctx, query);
    case 'admin':
      return viewsAccount.renderAdmin(ctx, query);
    case 'admin-ai':
      return viewsAccount.renderAdminAi(ctx, query);
    case 'admin-invest':
      return viewsAdminInvest.renderAdminInvest(ctx, query);
    case 'chat':
      return viewsChat.renderChat(ctx, { roomId: p1, ...query });
    case 'join':
      return viewsMeeting.renderJoin(ctx, { ...query, n: p1 || query.n });
    case 'meeting':
      return viewsMeeting.renderMeeting(ctx, { id: p1, ...query });
    case 'provider':
      // #/provider          入驻申请
      // #/provider?tab=list 服务商名录
      // #/provider/:id      服务商详情
      if (p1 && p1 !== 'list') return viewsProvider.renderProviderDetail(ctx, { id: p1 });
      return viewsProvider.renderProvider(ctx, { tab: p1 === 'list' ? 'list' : (query.tab || '') });
    case 'admin-shorts':
      return viewsAdminShorts.renderAdminShorts(ctx);
    case 'admin-covers':
      return viewsAdminCovers.renderAdminCovers(ctx);
    case 'admin-providers':
      return viewsProvider.renderAdminProviders(ctx, { status: query.status === undefined ? 'pending' : query.status });
    case 'shorts':
      return viewsShorts.renderShorts(ctx, { id: p1 || query.id || '' });
    case 'feeds':
      return viewsLive.renderFeeds(ctx, { type: query.type || '' });
    case 'live':
      return viewsLive.renderLive(ctx, { id: p1, ...query });
    case 'feed':
      return p1 === 'new'
        ? viewsLive.renderFeedNew(ctx, query)
        : viewsLive.renderLive(ctx, { id: p1, ...query });
    case 'forums':
      return viewsForum.renderForums(ctx, query);
    case 'forum':
      return viewsForum.renderForum(ctx, { slug: p1, page: query.page, sort: query.sort });
    case 'post':
      return p1 === 'new'
        ? viewsForum.renderPostNew(ctx, { forum: query.forum })
        : viewsForum.renderPost(ctx, { id: p1 });
    default:
      return {
        title: '页面不存在',
        content: ui.emptyState('🧭', '页面不存在或已下线', '<a class="btn btn-primary mt16" href="#/home">回到首页</a>'),
        noTab: false,
      };
  }
}

let rendering = false;

/* ------------------------------------------------------------------ */
/* 邀请引导：从 /r/CODE 进来，逛 10 秒后再问要不要注册                    */
/* ------------------------------------------------------------------ */

const INVITE_GATE_DELAY = 30000; // 扫码进主页后 30 秒再弹登录/注册

let inviteGateTimer = null;

function pendingRefCode() {
  try {
    return String(localStorage.getItem('xyl_pending_ref') || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

function inviteGateSkippedRecently() {
  try {
    const at = Number(localStorage.getItem('xyl_pending_ref_skip') || 0);
    // 点过「再看看」之后 24 小时内不再打扰
    return Boolean(at) && Date.now() - at < 86400_000;
  } catch {
    return false;
  }
}

function markInviteGateSkipped() {
  try {
    localStorage.setItem('xyl_pending_ref_skip', String(Date.now()));
  } catch { /* ignore */ }
}

function clearPendingRef() {
  try {
    localStorage.removeItem('xyl_pending_ref');
    localStorage.removeItem('xyl_pending_ref_skip');
    localStorage.removeItem('xyl_pending_ref_skip_code');
  } catch { /* ignore */ }
}

/** 每次渲染后调用：只在首页、未登录、有待用推荐码时排一个 10 秒定时器 */
function scheduleInviteGate(route) {
  if (inviteGateTimer) {
    clearTimeout(inviteGateTimer);
    inviteGateTimer = null;
  }
  // parseHash 返回的是 segs，没有 name 字段；首页就是 segs 为空或 ['home']
  const routeName = (route && route.segs && route.segs[0]) || 'home';
  if (routeName !== 'home') return;
  if (isLoggedIn()) return;
  if (!pendingRefCode()) return;
  if (inviteGateSkippedRecently()) return;
  if (document.querySelector('.invite-gate')) return;

  inviteGateTimer = setTimeout(() => {
    inviteGateTimer = null;
    showInviteGate().catch(() => {});
  }, INVITE_GATE_DELAY);
}

async function showInviteGate() {
  const code = pendingRefCode();
  if (!code || isLoggedIn()) return;
  if (document.querySelector('.invite-gate')) return;
  // 期间用户可能已经跳到别的页面了
  const cur = parseHash();
  if (((cur.segs && cur.segs[0]) || 'home') !== 'home') return;

  let inviterName = '';
  try {
    const r = await service.referralCheck(code);
    inviterName = (r && r.inviter && r.inviter.nickname) || '';
  } catch { /* 拿不到就用通用文案 */ }

  const title = inviterName ? `${inviterName} 邀请你加入小鱼来了` : '你被邀请加入小鱼来了';

  const wrap = document.createElement('div');
  wrap.className = 'invite-gate';
  wrap.innerHTML = `<div class="invite-gate-card">
    <div class="invite-gate-ico">🎁</div>
    <div class="invite-gate-t">${ui.esc(title)}</div>
    <div class="invite-gate-d">免费发布项目需求、活动赛事、贸易采供、科技成果转化<br>AI 自动生成标题与解析，按行业和城市推给对口的人</div>
    <button class="btn btn-primary btn-block" id="ig-go" type="button">立即免费注册</button>
    <button class="btn btn-outline btn-block mt8" id="ig-login-btn" type="button">已有账号，直接登录</button>
    <button class="invite-gate-skip" id="ig-skip" type="button">先随便看看</button>
  </div>`;

  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));

  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 220);
  };

  wrap.querySelector('#ig-go').addEventListener('click', () => {
    close();
    // 推荐码已经存在 localStorage，注册页会自动带上
    nav(`#/register?ref=${encodeURIComponent(code)}`);
  });
  wrap.querySelector('#ig-skip').addEventListener('click', () => {
    markInviteGateSkipped();
    close();
  });
  wrap.querySelector('#ig-login-btn')?.addEventListener('click', () => {
    close();
    nav(`#/login?redirect=${encodeURIComponent('#/home')}`);
  });
  wrap.addEventListener('click', (ev) => {
    if (ev.target === wrap) close();
  });
}

async function render() {
  if (rendering) return;
  rendering = true;
  const route = parseHash();
  // 让顶部标题先出来，避免白屏
  if (!appEl.querySelector('.shell') || !document.querySelector('.topbar')) {
    appEl.innerHTML = shell({ title: state.site?.name || '小鱼来了', content: '<div class="page">' + ui.skeletonList(4) + '</div>' });
  }

  try {
    const view = await resolveView(route);
    const html = shell({
      title: view.title,
      content: view.content,
      activeTab: view.activeTab,
      showBack: view.showBack !== undefined ? view.showBack : route.segs.length > 1,
      actions: view.actions || '',
      noTab: view.noTab,
      fullscreen: view.fullscreen,
      cls: view.cls || '',
    });
    appEl.innerHTML = html;
    bindShell(appEl);
    if (view.mount) await view.mount(appEl, route);
    scheduleInviteGate(route);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  } catch (err) {
    const msg = (err && err.message) || '页面加载失败';
    // 别再把所有错误都说成「网络问题」——
    // 权限不足、未登录、内容不存在都各有各的原因
    const hint = (() => {
      const st = err && err.status;
      const code = (err && err.code) || '';
      if (code === 'network') return '网络连接失败，请检查网络后重试';
      if (code === 'timeout') return '请求超时，请稍后重试';
      if (st === 401) return '登录状态已失效，请重新登录';
      if (st === 403) return '当前账号没有访问权限';
      if (st === 404) return '内容不存在或已被删除';
      if (st >= 500) return '服务器开小差了，请稍后再试';
      return '如果反复出现，请联系平台管理员';
    })();
    appEl.innerHTML = shell({
      title: '出错了',
      content: `<div class="page"><div class="card card-pad center">
        <div style="font-size:40px">😵</div>
        <div class="strong mt8">${ui.esc(msg)}</div>
        <div class="small muted mt8">\</div>
        <button class="btn btn-primary mt16" onclick="location.reload()">重新加载</button>
      </div></div>`,
      showBack: true,
    });
    bindShell(appEl);
  } finally {
    rendering = false;
  }
}

/* ------------------------------------------------------------------ */
/* 全局事件                                                            */
/* ------------------------------------------------------------------ */
window.addEventListener('hashchange', render);

window.addEventListener('xyl:unauthorized', () => {
  state.user = null;
  state.unread = 0;
  connectSSE();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isLoggedIn()) {
    service.unread().then((r) => {
      state.unread = r.unread || 0;
      updateBadge();
    }).catch(() => {});
  }
});

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

/**
 * 全局错误上报。
 *
 * 之前出过「点发布没反应」但页面上没有任何提示的情况 ——
 * 错误只在控制台里，用户看不到，也就无法反馈具体原因。
 * 这里把未捕获的错误与 Promise 异常显式提示出来，方便定位。
 */
function setupErrorReporting() {
  const shown = new Set();
  const report = (label, detail) => {
    const msg = `${label}：${detail}`;
    if (shown.has(msg)) return;
    shown.add(msg);
    // 去重后最多提示 3 条，避免报错风暴刷屏
    if (shown.size > 3) return;
    console.error('[xiaoyu]', label, detail);
    try {
      ui.toast(`页面出错：${String(detail).slice(0, 120)}`, 'err');
    } catch {
      /* toast 本身异常时不再递归 */
    }
  };

  window.addEventListener('error', (e) => {
    // 资源加载失败（img/script）也会走这里，target 不是 window
    if (e.target && e.target !== window && e.target.tagName) {
      report('资源加载失败', `${e.target.tagName} ${e.target.src || e.target.href || ''}`);
      return;
    }
    report('脚本错误', e.message || '未知错误');
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report('未处理的异常', (r && r.message) || String(r));
  });
}

async function boot() {
  setupErrorReporting();
  try {
    const [site, taxonomy] = await Promise.all([service.site(), service.taxonomy()]);
    state.site = site;
    state.taxonomy = taxonomy;
    // 把版本号记下来，排查「浏览器用的是不是旧版前端」时一眼可见
    service.version?.().then((v) => { state.build = v?.build || ''; }).catch(() => {});
  } catch (err) {
    appEl.innerHTML = `<div class="page"><div class="card card-pad center mt24">
      <div style="font-size:44px">🔌</div>
      <div class="strong mt12">无法连接服务器</div>
      <div class="small muted mt8">${ui.esc(err.message)}</div>
      <button class="btn btn-primary mt16" onclick="location.reload()">重试</button>
    </div></div>`;
    return;
  }

  if (isLoggedIn()) {
    await refreshMe();
    connectSSE();
  } else {
    store.clear();
    state.user = null;
  }

  // 从分享短链 /s/:id、/v/:id 进来时，路径保留不动（微信靠它抓卡片信息），
  // 这里只把内部 hash 路由对齐到对应页面。
  const shareMatch = /^\/(s|v)\/([A-Za-z0-9_-]{4,80})\/?$/.exec(location.pathname || '');
  if (shareMatch && !location.hash) {
    location.hash = shareMatch[1] === 's'
      ? `#/detail/${shareMatch[2]}`
      : `#/live/${shareMatch[2]}`;
  }

  /*
   * 邀请短链 /r/:code
   *
   * 不再直接甩进注册页 —— 一进来就要注册，转化率反而低。
   * 改成：先落主页看内容，把推荐码存下来，10 秒后再弹注册引导，
   * 用户可以选「立即注册」或「再看看」。
   */
  const refMatch = /^\/r\/([A-Za-z0-9_-]{4,40})\/?$/.exec(location.pathname || '');
  if (refMatch && !location.hash) {
    const code = refMatch[1].toUpperCase();
    try {
      localStorage.setItem('xyl_pending_ref', code);
      // 换了新邀请码就重置「已取消」标记，重新给一次机会
      if (localStorage.getItem('xyl_pending_ref_skip_code') !== code) {
        localStorage.removeItem('xyl_pending_ref_skip');
        localStorage.setItem('xyl_pending_ref_skip_code', code);
      }
    } catch { /* 隐私模式忽略 */ }
    location.hash = '#/home';
  }

  await render();
}

boot();
