/**
 * 小鱼来了 — 首页 / 列表 / 详情 / 案例 / 用户主页
 */
import { api, service, isLoggedIn } from './api.js';
import * as ui from './ui.js';
import {
  itemHtml, aiCardHtml, filesHtml, fileCardHtml, pipelineHtml, commentHtml, userCardHtml,
  sortBarHtml, categoryIcon, categoryName,
} from './components.js';
import { openShareSheet, setupWechatShare } from './share.js';
import { applyAutoCover, drawProjectCover } from './cover.js';

/**
 * 保密附件解锁令牌的本地存储。
 *
 * 令牌只放 sessionStorage：关掉标签页即失效，
 * 不落到 localStorage 长期留存 —— 保密内容不该被长期记着。
 */
const ListingFileTokens = {
  key: (listingId) => `xyll_ft_${listingId}`,
  get(listingId) {
    try {
      return sessionStorage.getItem(this.key(listingId)) || '';
    } catch {
      return '';
    }
  },
  set(listingId, token) {
    try {
      sessionStorage.setItem(this.key(listingId), token);
    } catch {
      /* 隐私模式下 sessionStorage 可能不可用，忽略即可 */
    }
  },
  clear(listingId) {
    try {
      sessionStorage.removeItem(this.key(listingId));
    } catch {
      /* 同上 */
    }
  },
};

/* ================================================================== */
/* 首页                                                                */
/* ================================================================== */
export async function renderHome(ctx, query) {
  void query;
  const [stats, latest, hotProjects, hotEvents, hotTrades, cases, feedsRes] = await Promise.all([
    service.stats().catch(() => ({})),
    service.listings({ status: 'published', pageSize: 8, sort: 'latest' }).catch(() => ({ items: [] })),
    service.listings({ category: 'project', status: 'published', pageSize: 8, sort: 'hot' }).catch(() => ({ items: [] })),
    service.listings({ category: 'event', status: 'published', pageSize: 8, sort: 'hot' }).catch(() => ({ items: [] })),
    service.listings({ category: 'trade', status: 'published', pageSize: 8, sort: 'hot' }).catch(() => ({ items: [] })),
    service.cases().catch(() => []),
    service.feeds({ featured: true, limit: 6 }).catch(() => ({ items: [] })),
  ]);

  // 短视频单独拉一组（首页「短视频」横滑区）
  const shortsRes = await service.feeds({ type: 'short', limit: 10 }).catch(() => ({ items: [] }));
  const shorts = shortsRes.items || [];

  const tax = ctx.state.taxonomy || {};
  const industries = (tax.industries || []).slice(0, 12);
  const logged = Boolean(ctx.state.user);
  const recent = latest.items || [];

  const clip = (s, n) => {
    const t = String(s || '').trim();
    return t.length > n ? `${t.slice(0, n)}…` : t;
  };
  const GRAD = [
    'linear-gradient(135deg,#dbeafe,#bfdbfe)',
    'linear-gradient(135deg,#ffedd5,#fed7aa)',
    'linear-gradient(135deg,#dcfce7,#bbf7d0)',
    'linear-gradient(135deg,#ede9fe,#ddd6fe)',
    'linear-gradient(135deg,#cffafe,#a5f3fc)',
    'linear-gradient(135deg,#fce7f3,#fbcfe8)',
  ];
  const SOLID = ['#2f7bff', '#f08a2d', '#12a05a', '#7c5cf0', '#0ea5b7', '#e0518f'];

  /* ---------------- 顶部消息条 ---------------- */
  const notice = recent[0];
  const noticeHtml = `<a class="home-notice" href="${notice ? `#/detail/${ui.esc(notice.id)}` : '#/list/project'}">
    <div class="thumbs">
      ${recent.slice(0, 3).map((l, i) => `<i style="background:${SOLID[i % SOLID.length]}">${categoryIcon(l.category)}</i>`).join('')}
    </div>
    <div class="body">
      <div class="a">${ui.esc(notice ? clip(notice.title, 20) : '小鱼来了 · AI 信息发布平台')}</div>
      <div class="b">${ui.esc(notice ? clip(`${notice.owner?.nickname || '平台'}：${notice.subtitle || notice.summary || ''}`, 26) : '发布项目、活动、贸易信息，AI 自动生成标题与解析')}</div>
    </div>
    <span class="dim">›</span>
  </a>`;

  /* ---------------- 轮播：短视频 + 直播 ---------------- */
  const feedItems = (feedsRes.items || []).slice(0, 6);
  const SLIDE_BG = [
    'linear-gradient(135deg,#1e6bff 0%,#12c2b2 100%)',
    'linear-gradient(135deg,#2b3a9e 0%,#5b6ee1 55%,#8f6cf0 100%)',
    'linear-gradient(135deg,#e2351f 0%,#f0603a 55%,#ff9a3d 100%)',
    'linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)',
  ];
  const feedSlide = (f, i) => {
    const isLive = f.type === 'live' && f.liveStatus === 'live';
    const bg = SLIDE_BG[i % SLIDE_BG.length];
    const media = f.videoUrl && !isLive
      ? `<video src="${ui.esc(ui.safeUrl(f.videoUrl))}" muted loop playsinline preload="metadata"
           ${f.coverUrl ? `poster="${ui.esc(ui.safeUrl(f.coverUrl))}"` : ''}></video>`
      : f.coverUrl
        ? `<img src="${ui.esc(ui.safeUrl(f.coverUrl))}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
        : '';
    return `<div class="slide video ${i === 0 ? 'on' : ''}" data-href="#/live/${ui.esc(f.id)}"
        ${media ? '' : `style="background:${bg}"`}>
      ${media}
      <div class="veil"></div>
      ${isLive
        ? '<span class="live-tag">● LIVE 直播中</span>'
        : '<span class="short-tag">🎬 短视频</span>'}
      <div class="cap">
        <div class="t">${ui.esc(clip(f.title, 22))}</div>
        <div class="s">${ui.esc(f.owner?.nickname || '')}${isLive ? ' 正在直播' : ''} · 👁 ${f.stats.views} · ❤ ${f.stats.likes}</div>
      </div>
      ${f.videoUrl && !isLive ? '<button class="mute-btn" data-mute type="button" aria-label="声音">🔇</button>' : ''}
    </div>`;
  };

  const promoSlide = (i) => `<div class="slide ${i === 0 ? 'on' : ''}" data-href="#/feeds"
      style="background:linear-gradient(135deg,#1e6bff 0%,#12c2b2 100%)">
    <div class="txt">
      <span class="tag">${ui.esc(ctx.state.site?.name || '小鱼来了')} · 短视频与直播</span>
      <h2>让每一条好项目<br>都被对的人看见</h2>
      <p>项目 · 活动 · 贸易　AI 生成标题 · 智能解析 · 精准分发</p>
      <span class="pill">已收录 ${stats.published || 0} 条在线信息</span>
    </div>
    <div class="art">🐟</div>
  </div>`;

  const slidesHtml = feedItems.map(feedSlide).join('') + promoSlide(feedItems.length);
  const slideCount = feedItems.length + 1;
  const bannerHtml = `<div class="home-banner" id="home-banner">
    ${slidesHtml}
    <div class="dots">${Array.from({ length: slideCount }, (_, i) => `<i class="${i === 0 ? 'on' : ''}" data-dot="${i}"></i>`).join('')}</div>
  </div>`;

  /* ---------------- 2×3 主入口 ---------------- */
  const entries = [
    { t: '项目需求', d: '对接真实好项目', art: '📁', href: '#/list/project', i: 0 },
    { t: '活动赛事', d: '报名 · 赛事 · 课程', art: '🎪', href: '#/list/event', i: 1 },
    { t: '贸易采供', d: '采购 · 供应 · 委托加工', art: '🤝', href: '#/list/trade', i: 2 },
    { t: '群聊', d: '项目群 · 讨论群', art: '💬', href: '#/chat', i: 3, auth: true },
    { t: '会议', d: '9 位会议号入会', art: '📹', href: '#/join', i: 4 },
    { t: '通讯录', d: '导入并邀请好友', art: '📇', href: '#/contacts', i: 5, auth: true },
    { t: '短视频', d: '上下滑动 · 沉浸观看', art: '🎬', href: '#/shorts', i: 6 },
    { t: '行业论坛', d: '光伏 · 储能 · 算力 · AI', art: '🗣️', href: '#/forums', i: 7 },
  ];
  const gridHtml = `<div class="home-grid">
    ${entries.map((e) => `<a class="home-card" href="${e.href}" data-auth="${e.auth ? '1' : ''}">
      <div class="txt"><div class="t">${e.t}</div><div class="d">${ui.esc(e.d)}</div></div>
      <div class="art" style="background:${GRAD[e.i % GRAD.length]}">${e.art}</div>
    </a>`).join('')}
  </div>`;

  /* ---------------- 推荐 Tab ---------------- */
  const recPools = {
    project: hotProjects.items || [],
    event: hotEvents.items || [],
    trade: hotTrades.items || [],
  };
  const recHtml = `<div class="home-panel">
    <div class="home-panel-head">
      <div class="home-tab on" data-rec="project">推荐项目</div>
      <div class="home-tab" data-rec="event">推荐活动</div>
      <div class="home-tab" data-rec="trade">推荐贸易</div>
    </div>
    <div class="home-scroll" id="home-rec"></div>
  </div>`;

  /* ---------------- 短视频 ---------------- */
  const shortCard = (v) => `<a class="short-card" href="#/shorts/${ui.esc(v.id)}">
    <div class="short-thumb">
      ${v.coverUrl
        ? `<img src="${ui.esc(ui.safeUrl(v.coverUrl))}" alt="" loading="lazy">`
        : `<div class="short-ph">🎬</div>`}
      <span class="short-play">▶</span>
      <span class="short-tag">短视频</span>
    </div>
    <div class="short-t">${ui.esc(v.title || '')}</div>
    <div class="short-m">
      <span>👁 ${v.stats?.views || 0}</span>
      <span>❤ ${v.stats?.likes || 0}</span>
    </div>
  </a>`;

  const shortHtml = shorts.length ? `<div class="home-sec-head">
      <h2>🎬 短视频</h2>
      <a href="#/shorts">刷起来 ›</a>
    </div>
    <div class="home-scroll home-shorts">
      ${shorts.map(shortCard).join('')}
    </div>` : '';

  /* ---------------- 热门行业 ---------------- */
  const industryHtml = `<div class="home-sec-head"><h2>热门行业</h2><a href="#/list/project">全部 ›</a></div>
    <div class="home-panel" style="padding:0">
      <div class="home-scroll">
        ${industries.map((ind, i) => `<a class="home-tile" href="#/list/project?industry=${encodeURIComponent(ind.id)}">
          <div class="art" style="background:${GRAD[i % GRAD.length]}">${ind.icon || '🏷️'}</div>
          <div class="t">${ui.esc(ind.name)}</div>
          <div class="d">${ui.esc((ind.subs || [])[0]?.name || '查看项目')}</div>
        </a>`).join('')}
      </div>
    </div>`;

  /* ---------------- 最新发布（两列） ---------------- */
  const itemCard = (l) => {
    const hasImg = Boolean(l.coverUrl);
    return `<a class="home-item" href="#/detail/${ui.esc(l.id)}">
      <div class="cover">
        ${hasImg
          ? `<img src="${ui.esc(ui.safeUrl(l.coverUrl))}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy">`
          : categoryIcon(l.category)}
        ${l.reliability?.score >= 80 ? '<span class="badge2">AI 优质</span>' : ''}
      </div>
      <div class="body">
        <div class="t">${ui.esc(l.title)}</div>
        <div class="m">
          <span>${ui.esc(l.cities?.[0]?.name || l.categoryName || '')}</span>
          <span>${ui.esc((l.typeName || '') || ui.fmtRelative(l.publishedAt))}</span>
        </div>
      </div>
    </a>`;
  };
  const latestHtml = `<div class="home-sec-head"><h2>最新发布</h2><a href="#/list/project?sort=latest">更多 ›</a></div>
    <div class="home-list2">
      ${recent.slice(0, 6).map(itemCard).join('') || ui.emptyState('📭', '还没有发布的信息')}
    </div>`;

  /* ---------------- 项目案例 ---------------- */
  const casesHtml = (cases || []).length ? `<div class="home-sec-head"><h2>项目案例</h2><a href="#/cases">更多 ›</a></div>
    <div class="home-list2">
      ${cases.slice(0, 4).map((c, i) => `<a class="home-item" href="#/cases">
        <div class="cover" style="background:${GRAD[i % GRAD.length]}">${categoryIcon(c.category)}</div>
        <div class="body">
          <div class="t">${ui.esc(clip(c.title, 24))}</div>
          <div class="m"><span>${ui.esc(c.city || '')}</span><span>${ui.esc(c.amount || c.industry || '')}</span></div>
        </div>
      </a>`).join('')}
    </div>` : '';

  /* ---------------- 统计 ---------------- */
  /* 平台统计只对管理员展示（运营数据不外露） */
  const isAdminViewer = Boolean(ctx.state.user?.isAdmin);
  const statsHtml = isAdminViewer ? `<div class="home-stats">
    <div><div class="n">${stats.published || 0}</div><div class="l">在线信息</div></div>
    <div><div class="n">${stats.users || 0}</div><div class="l">注册用户</div></div>
    <div><div class="n">${(tax.industries || []).length}</div><div class="l">细分行业</div></div>
    <div><div class="n">${ctx.state.site?.helper?.cities || 0}</div><div class="l">覆盖城市</div></div>
  </div>` : '';

  const loginStrip = logged ? '' : `<a class="login-banner mt12" href="#/login">
    <div class="grow">
      <div class="strong" style="font-size:14px">登录后即可发布项目、建群开会</div>
      <div class="tiny dim">支持手机号、邮箱、微信登录</div>
    </div>
    <span class="btn btn-sm btn-primary">登录 / 注册</span>
  </a>`;

  const html = `<div class="home-wrap">
    ${noticeHtml}
    ${bannerHtml}
    ${gridHtml}
    ${loginStrip}
    ${recHtml}
    ${shortHtml}
    ${industryHtml}
    ${latestHtml}
    ${casesHtml}
    ${statsHtml}
  </div>`;

  const CAT_GRAD = { project: 0, event: 1, trade: 2 };
  const recTile = (l) => {
    const gi = CAT_GRAD[l.category] ?? 0;
    return `<a class="home-tile" href="#/detail/${ui.esc(l.id)}">
      <div class="art" style="background:${GRAD[gi]}">
        ${l.coverUrl ? `<img src="${ui.esc(ui.safeUrl(l.coverUrl))}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:14px" loading="lazy">` : categoryIcon(l.category)}
      </div>
      <div class="t">${ui.esc(clip(l.title, 12))}</div>
      <div class="d">${ui.esc(l.cities?.[0]?.name || l.typeName || '查看详情')}</div>
    </a>`;
  };

  return {
    title: ctx.state.site?.name || '小鱼来了',
    content: html,
    activeTab: 'home',
    showBack: false,
    noTab: false,
    async mount(root) {
      /* 轮播：短视频 / 直播 */
      const banner = root.querySelector('#home-banner');
      if (banner) {
        const all = [...banner.querySelectorAll('.slide')];
        const dots = [...banner.querySelectorAll('.dots i')];
        let cur = 0;
        let timer = null;

        // 只播放当前这一位的视频，其余暂停并归零
        const syncVideo = () => {
          all.forEach((el, i) => {
            const v = el.querySelector('video');
            if (!v) return;
            if (i === cur) v.play().catch(() => {});
            else {
              v.pause();
              try { v.currentTime = 0; } catch { /* ignore */ }
            }
          });
        };
        const go = (n) => {
          cur = (n + all.length) % all.length;
          all.forEach((el, i) => el.classList.toggle('on', i === cur));
          dots.forEach((el, i) => el.classList.toggle('on', i === cur));
          syncVideo();
        };
        const start = () => {
          if (all.length < 2) return;
          timer = setInterval(() => go(cur + 1), 5000);
        };

        dots.forEach((d) => d.addEventListener('click', (e) => {
          e.stopPropagation();
          clearInterval(timer);
          go(Number(d.dataset.dot));
          start();
        }));

        all.forEach((el) => el.addEventListener('click', (e) => {
          const mute = e.target.closest('[data-mute]');
          if (mute) {
            e.stopPropagation();
            const v = el.querySelector('video');
            if (v) {
              v.muted = !v.muted;
              if (!v.muted) v.play().catch(() => {});
              mute.textContent = v.muted ? '🔇' : '🔊';
            }
            return;
          }
          if (el.dataset.href) ctx.nav(el.dataset.href);
        }));

        banner.addEventListener('mouseenter', () => clearInterval(timer));
        banner.addEventListener('mouseleave', start);
        // 标签页切到后台时暂停视频
        const onVis = () => {
          all.forEach((el) => {
            const v = el.querySelector('video');
            if (!v) return;
            if (document.hidden) v.pause();
          });
          if (!document.hidden) syncVideo();
        };
        document.addEventListener('visibilitychange', onVis);
        syncVideo();
        start();
      }

      /* 推荐 Tab */
      const recBox = root.querySelector('#home-rec');
      const renderRec = (cat) => {
        if (!recBox) return;
        const list = recPools[cat] || [];
        recBox.innerHTML = list.length
          ? list.slice(0, 10).map(recTile).join('')
          : '<div class="tiny dim" style="padding:12px 4px">暂无推荐内容</div>';
      };
      root.querySelectorAll('[data-rec]').forEach((tab) => {
        tab.addEventListener('click', () => {
          root.querySelectorAll('[data-rec]').forEach((el) => el.classList.toggle('on', el === tab));
          renderRec(tab.dataset.rec);
        });
      });
      renderRec('project');

      /* 群聊 / 通讯录需要登录 */
      root.querySelectorAll('.home-card[data-auth="1"]').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (isLoggedIn()) return;
          e.preventDefault();
          ui.toast('请先登录后再使用', 'err');
          ctx.nav(`#/login?redirect=${encodeURIComponent(card.getAttribute('href'))}`);
        });
      });
    },
  };
}

/* ================================================================== */
/* 列表页                                                              */
/* ================================================================== */
export async function renderList(ctx, params) {
  const category = params.category || 'project';
  const query = {
    category,
    industry: params.industry || '',
    city: params.city || '',
    type: params.type || '',
    q: params.q || '',
    sort: params.sort || 'latest',
    followedBy: params.followedBy || '',
    page: 1,
    pageSize: 20,
  };

  const res = await service.listings(query);
  const name = categoryName(category);
  const types = (ctx.state.taxonomy?.categories || []).find((c) => c.id === category)?.types || [];

  const build = (extra = {}) => {
    const q = { ...query, ...extra };
    const parts = Object.entries(q)
      .filter(([k, v]) => v && !['page', 'pageSize'].includes(k) && !(k === 'sort' && v === 'latest') && !(k === 'category'))
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return `#/list/${category}${parts.length ? `?${parts.join('&')}` : ''}`;
  };

  const html = `<div class="page">
    <div class="row between mb12">
      <h2 style="font-size:19px">${ui.esc(ctx.state.site?.categories?.find((c) => c.id === category)?.icon || '')} ${ui.esc(name)}信息</h2>
      <span class="tiny dim">共 ${res.total} 条</span>
    </div>

    <div class="chips scroll mb8">
      <a class="chip ${!query.industry && !query.city && !query.type && !query.followedBy ? 'active' : ''}" href="${build({ industry: '', city: '', type: '', followedBy: '' })}">全部</a>
      ${isLoggedIn() ? `<a class="chip ${query.followedBy ? 'active' : ''}" href="${build({ followedBy: query.followedBy ? '' : ctx.state.user?.id || 'me' })}">⭐ 我关注的</a>` : ''}
      ${types.slice(0, 10).map((t) => `<a class="chip ${query.type === t.id ? 'active' : ''}" href="${build({ type: query.type === t.id ? '' : t.id })}">${ui.esc(t.name)}</a>`).join('')}
    </div>

    ${(res.facets?.industries || []).length ? `<div class="chips scroll mb8">
      ${res.facets.industries.slice(0, 14).map((i) => `<a class="chip soft ${query.industry === i.id ? 'active' : ''}" href="${build({ industry: query.industry === i.id ? '' : i.id })}">${ui.esc(i.name)} ${i.count}</a>`).join('')}
    </div>` : ''}

    ${(res.facets?.cities || []).length ? `<div class="chips scroll mb8">
      ${res.facets.cities.slice(0, 14).map((c) => `<a class="chip ${query.city === c.id ? 'active' : ''}" href="${build({ city: query.city === c.id ? '' : c.id })}">📍${ui.esc(c.name)} ${c.count}</a>`).join('')}
    </div>` : ''}

    ${sortBarHtml(query).replace(/data-sort="([^"]+)"/g, (m, s) => `href="${build({ sort: s })}" data-sort="${s}"`)}

    <div class="card list-grid" id="list-box" style="overflow:hidden">
      ${(res.items || []).length ? res.items.map(itemHtml).join('') : ui.emptyState('🔍', '没有符合条件的信息，换个筛选试试')}
    </div>

    ${res.pages > 1 ? `<div class="load-more" id="load-more" data-page="${res.page}" data-pages="${res.pages}">加载更多</div>` : ''}
  </div>`;

  return {
    title: `${name}信息`,
    content: html,
    activeTab: category,
    showBack: false,
    async mount(root) {
      const more = root.querySelector('#load-more');
      if (!more) return;
      let page = 1;
      more.addEventListener('click', async () => {
        page++;
        more.textContent = '加载中…';
        try {
          const next = await service.listings({ ...query, page });
          const box = root.querySelector('#list-box');
          box.insertAdjacentHTML('beforeend', (next.items || []).map(itemHtml).join(''));
          if (page >= next.pages) more.remove();
          else more.textContent = '加载更多';
        } catch (err) {
          more.textContent = '加载失败，点击重试';
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}

/* ================================================================== */
/* 搜索                                                                */
/* ================================================================== */
export async function renderSearch(ctx, query) {
  const q = query.q || '';
  let res = { items: [], total: 0 };
  if (q) res = await service.listings({ status: 'published', q, pageSize: 30 }).catch(() => ({ items: [], total: 0 }));
  const taxonomy = ctx.state.taxonomy || {};
  const hot = ['光伏', '储能', 'EPC', '融资租赁', '算力', '机器人', '无人机', '招投标'];

  const html = `<div class="page">
    <div class="input-group mb16">
      <input class="input input-lg" id="search-input" placeholder="搜索项目 / 活动 / 贸易 / 企业" value="${ui.esc(q)}">
      <button class="btn btn-primary" id="search-btn" style="height:48px">搜索</button>
    </div>

    ${!q ? `
      <div class="section-head"><h2>热门搜索</h2></div>
      <div class="chips">${hot.map((h) => `<a class="chip" href="#/search?q=${encodeURIComponent(h)}">${ui.esc(h)}</a>`).join('')}</div>
      <div class="section-head mt24"><h2>按行业浏览</h2></div>
      <div class="chips">
        ${(taxonomy.industries || []).map((i) => `<a class="chip" href="#/list/project?industry=${encodeURIComponent(i.id)}">${i.icon || ''} ${ui.esc(i.name)}</a>`).join('')}
      </div>
    ` : `
      <div class="row between mb12"><span class="small muted">找到 ${res.total} 条结果</span></div>
      <div class="card list-grid" style="overflow:hidden">
        ${(res.items || []).length ? res.items.map(itemHtml).join('') : ui.emptyState('🤷', `没有找到与"${q}"相关的内容`)}
      </div>
    `}
  </div>`;

  return {
    title: '搜索',
    content: html,
    showBack: true,
    noTab: false,
    mount(root) {
      const input = root.querySelector('#search-input');
      const go = () => {
        const v = input.value.trim();
        if (v) ctx.nav(`#/search?q=${encodeURIComponent(v)}`);
      };
      root.querySelector('#search-btn')?.addEventListener('click', go);
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    },
  };
}

/* ================================================================== */
/* 详情页                                                              */
/* ================================================================== */
/* 内容更新里的附件：优先用后端解析好的 fileList，兼容只有 id 的旧数据 */
function fuFilesOf(fu) {
  if (Array.isArray(fu.fileList) && fu.fileList.length) return fu.fileList;
  return [];
}

export async function renderDetail(ctx, params) {
  const id = params.id;
  if (!id) return { title: '信息不存在', content: ui.emptyState('🧭', '信息不存在'), showBack: true };

  const [{ listing, pipeline, isOwner }, comments, qualRes, casesRes] = await Promise.all([
    service.listing(id),
    service.comments(id).catch(() => ({ tree: [] })),
    service.listingQualification(id).catch(() => null),
    // 案例参考：未登录访客不请求，省一次检索
    service.listingCases(id).catch(() => null),
  ]);

  const cases = casesRes?.cases || null;

  // 权限判断：isOwner 来自接口返回，isAdmin 从当前登录用户取
  const isAdmin = Boolean(ctx.state.user?.isAdmin);


  // 本地已有解锁令牌时先验证一次，避免每次刷新都重输密码。
  // 令牌过期或无效就清掉，让用户重新输入。
  if (listing.fileSecret?.enabled && !listing.fileSecret.unlocked) {
    const saved = ListingFileTokens.get(id);
    if (saved) {
      try {
        const acc = await api.get(`/api/listings/${id}/files/access?t=${encodeURIComponent(saved)}`);
        if (acc?.unlocked) listing.fileSecret.unlocked = true;
        else ListingFileTokens.clear(id);
      } catch {
        ListingFileTokens.clear(id);
      }
    }
  }

  const qual = qualRes?.qualification || null;
  const proj = listing.project || {};
  const terms = proj.businessTerms || {};
  const termDefs = ctx.state.taxonomy?.businessTermFields || [];
  const termRows = termDefs
    .map((f) => ({ label: f.label, value: terms[f.key] }))
    .filter((r) => r.value);
  const currentStage = (pipeline || []).find((s) => s.current) || (pipeline || [])[0] || null;

  /* ---------------- 商务条件卡片 ---------------- */
  /* AI 自动补充的信息要素 */
  const autoInfoCard = (ai) => {
    if (!ai) return '';
    const hl = Array.isArray(ai.highlights) ? ai.highlights : [];
    const facts = Array.isArray(ai.keyFacts) ? ai.keyFacts : [];
    const tags = Array.isArray(ai.tags) ? ai.tags : [];
    if (!hl.length && !facts.length) return '';
    return `<div class="card card-pad mb12" id="auto-info">
      <div class="row between mb8">
        <div class="strong">🧩 补充信息要素</div>
        <span class="tiny dim">${ai.source === 'ai' ? 'AI 自动提炼' : '自动提取'}</span>
      </div>
      ${hl.length ? `<div class="auto-hl">${hl.map((h) => `<div class="auto-hl-item"><i>·</i>${ui.esc(h)}</div>`).join('')}</div>` : ''}
      ${facts.length ? `<div class="auto-facts">${facts.map((f) => `<div class="auto-fact"><span>${ui.esc(f.label)}</span><b>${ui.esc(f.value)}</b></div>`).join('')}</div>` : ''}
      ${tags.length ? `<div class="chips mt10">${tags.map((t) => `<span class="chip soft">${ui.esc(t)}</span>`).join('')}</div>` : ''}
    </div>`;
  };

  const termsCard = termRows.length ? `<div class="card card-pad mb12">
    <div class="strong mb8">💰 商务条件</div>
    <div class="kv-table">
      ${termRows.map((r) => `<div class="kv"><span class="k">${ui.esc(r.label)}</span><span class="v">${ui.esc(r.value)}</span></div>`).join('')}
    </div>
  </div>` : '';

  /* ---------------- 案例参考 ---------------- */
  const caseItemHtml = (c) => {
    if (c.kind === 'benchmark') {
      return `<div class="case-item">
        <div class="row between mb4">
          <span class="case-title">${ui.esc(c.title)}</span>
          <span class="badge gray">行业基准</span>
        </div>
        ${c.cost ? `<div class="kv"><span class="k">造价参考</span><span class="v">${ui.esc(c.cost)}</span></div>` : ''}
        ${c.period ? `<div class="kv"><span class="k">工期参考</span><span class="v">${ui.esc(c.period)}</span></div>` : ''}
        ${c.yieldNote ? `<div class="kv"><span class="k">收益参考</span><span class="v">${ui.esc(c.yieldNote)}</span></div>` : ''}
        ${(c.keyPoints || []).length ? `<div class="tiny dim mt6">关注要点：${c.keyPoints.map(ui.esc).join('；')}</div>` : ''}
      </div>`;
    }
    const facts = [c.location, c.scale, c.amount, c.period].filter(Boolean).map(ui.esc);
    return `<div class="case-item">
      <div class="row between mb4">
        <span class="case-title">${ui.esc(c.title)}</span>
        ${c.url ? `<a class="tiny" href="${ui.esc(ui.safeUrl(c.url))}" target="_blank" rel="noopener">来源 ›</a>` : ''}
      </div>
      ${facts.length ? `<div class="kv"><span class="k">项目信息</span><span class="v">${facts.join(' · ')}</span></div>` : ''}
      ${c.parties ? `<div class="kv"><span class="k">参与方</span><span class="v">${ui.esc(c.parties)}</span></div>` : ''}
      ${c.note ? `<div class="tiny dim mt4">${ui.esc(c.note)}</div>` : ''}
    </div>`;
  };

  const casesCard = cases && (cases.items || []).length ? `<div class="card card-pad mb12">
    <div class="row between mb8">
      <div class="strong">📚 同类案例参考（${cases.items.length}）</div>
      <span class="badge ${cases.source === 'web' ? 'ok' : 'gray'}">${ui.esc(cases.sourceName)}</span>
    </div>
    <div class="tiny dim mb12">${ui.esc(cases.note)}${cases.query ? `<br>检索词：${ui.esc(cases.query)}` : ''}${cases.at ? `<br>更新于 ${ui.esc(ui.fmtDate(cases.at, true))}` : ''}</div>
    ${(cases.items || []).map(caseItemHtml).join('')}
    <div class="row gap8 mt8" style="flex-wrap:wrap">
      ${isOwner ? '<button class="btn btn-sm btn-outline" id="btn-refresh-cases">🔄 重新检索</button>' : ''}
      ${isOwner ? '<button class="btn btn-sm" id="btn-gen-cover">🎨 生成项目配图</button>' : ''}
    </div>
  </div>` : '';

  /* ---------------- 资质要求卡片 ---------------- */
  const reqQuals = proj.qualifications || [];
  const qualCard = (proj.needQualification || reqQuals.length) ? `<div class="card card-pad mb12">
    <div class="row between mb8">
      <div class="strong">📑 需要的资质</div>
      ${qual ? `<span class="badge ${qual.approvedCount ? 'ok' : 'warn'}">${qual.approvedCount ? `已通过 ${qual.approvedCount} 家` : '待提交'}</span>` : ''}
    </div>
    ${reqQuals.length ? `<div class="qual-list">${reqQuals.map((q) => `<div class="qual-item">
      <div class="row between">
        <span class="qual-item-name">${ui.esc(q.name)}</span>
        <span class="row gap8">
          ${q.level && q.level !== '不要求' ? `<span class="badge gray">${ui.esc(q.level)}</span>` : ''}
          ${q.required ? '<span class="badge danger">必需</span>' : '<span class="badge gray">加分</span>'}
        </span>
      </div>
      ${q.note ? `<div class="tiny dim mt4">${ui.esc(q.note)}</div>` : ''}
    </div>`).join('')}</div>` : '<div class="small muted">未列明具体资质，以双方确认为准。</div>'}
  </div>` : '';

  /* ---------------- 当前环节操作面板 ---------------- */
  const stageStatusBadge = (s) => {
    if (s === 'approved') return '<span class="badge ok">已通过</span>';
    if (s === 'rejected') return '<span class="badge danger">已驳回</span>';
    return '<span class="badge warn">待确认</span>';
  };

  const stagePanel = (() => {
    if (!currentStage || listing.category !== 'project') return '';
    const sid = currentStage.id;
    const total = (pipeline || []).length;
    const docBtns = `<div class="row gap8" style="flex-wrap:wrap">
      <button class="btn btn-sm btn-primary" id="btn-doc-invitation">✉️ 邀请函</button>
      <button class="btn btn-sm" id="btn-doc-brokerage">🤝 居间协议</button>
      <button class="btn btn-sm" id="btn-doc-contract">📜 合同要点</button>
    </div>`;
    let body = '';

    if (sid === 'publish') {
      body = `<div class="small muted">项目已发布，等待意向方查看并提交资质。你也可以主动邀请对方。</div>
        <div class="row gap8 mt12">
          <button class="btn btn-sm" id="btn-stage-share">🔗 分享项目</button>
        </div>`;
    } else if (sid === 'qualification-review') {
      const mine = qual?.mine;
      const subs = qual?.submissions || [];
      body = `
        ${mine ? `<div class="stage-note">
          <div class="row between">
            <span class="small">我的资质提交</span>${stageStatusBadge(mine.status)}
          </div>
          <div class="tiny dim mt4">共 ${mine.itemCount} 项 · AI 初审 ${mine.score} 分${mine.pass ? ' · 无缺项' : ' · 有缺项'}</div>
          ${(mine.missing || []).length ? `<div class="tiny mt4" style="color:var(--danger)">缺少：${mine.missing.map(ui.esc).join('、')}</div>` : ''}
          ${mine.decisionNote ? `<div class="tiny dim mt4">发布方意见：${ui.esc(mine.decisionNote)}</div>` : ''}
        </div>` : ''}
        ${isOwner && subs.length ? `<div class="mt8">${subs.map((s) => `<div class="stage-note">
          <div class="row between"><span class="small">${ui.esc(s.userName)}${s.company ? ` · ${ui.esc(s.company)}` : ''}</span>${stageStatusBadge(s.status)}</div>
          <div class="tiny dim mt4">共 ${s.itemCount} 项 · AI 初审 ${s.score} 分${s.pass ? ' · 无缺项' : ' · 有缺项'}</div>
          ${(s.missing || []).length ? `<div class="tiny mt4" style="color:var(--danger)">缺少：${s.missing.map(ui.esc).join('、')}</div>` : ''}
          ${s.status === 'pending' ? `<div class="row gap8 mt8">
            <button class="btn btn-sm btn-primary" data-qual-approve="${ui.esc(s.userId)}">确认通过</button>
            <button class="btn btn-sm" data-qual-reject="${ui.esc(s.userId)}" style="color:var(--danger)">驳回</button>
          </div>` : ''}
          ${s.decisionNote ? `<div class="tiny dim mt4">意见：${ui.esc(s.decisionNote)}</div>` : ''}
        </div>`).join('')}</div>` : ''}
        ${!isOwner && !subs.length ? '<div class="small muted">还没有人提交资质。如果你有意向，可以直接上传。</div>' : ''}
        ${qual?.canSubmit ? `<button class="btn btn-primary btn-block mt12" id="btn-qual-submit">${mine ? '重新提交资质' : '📤 上传企业资质'}</button>` : ''}
        ${isOwner && !subs.length ? '<div class="small muted mt8">等待意向方提交资质。</div>' : ''}`;
    } else if (sid === 'group-meeting') {
      body = `<div class="small muted">建立项目专属群聊并召开线上会议，AI 会实时记录并生成双方后续跟进。</div>
        <div class="row gap8 mt12">
          <button class="btn btn-primary" id="btn-stage-chat">💬 打开项目群聊</button>
          <button class="btn" id="btn-stage-meeting">📹 发起线上会议</button>
        </div>`;
    } else if (sid === 'invitation') {
      body = `<div class="small muted">生成正式邀请函，可打印成 PDF 或复制文案发给对方。</div>
        <div class="mt12">${docBtns}</div>`;
    } else if (sid === 'brokerage') {
      body = `<div class="small muted">签订居间协议，明确居间费比例与支付节点。协议内容会自动带入本项目已填写的商务条件。</div>
        <div class="mt12">${docBtns}</div>`;
    } else if (sid === 'offline-meeting') {
      body = `<div class="small muted">线下会面洽谈细节，上传会谈记录、现场照片或会议签到表。</div>
        <div class="row gap8 mt12">
          <button class="btn btn-sm" id="btn-stage-upload">📎 上传会谈记录</button>
        </div>`;
    } else if (sid === 'contract') {
      body = `<div class="small muted">核对合同要点、上传正式合同并支付居间费。</div>
        <div class="mt12">${docBtns}</div>
        <div class="row gap8 mt8">
          <button class="btn btn-sm" id="btn-stage-upload">📎 上传正式合同</button>
        </div>`;
    }

    const canAdvance = isOwner && currentStage.order < total;
    return `<div class="card card-pad mb12 stage-panel">
      <div class="row between mb8">
        <div class="strong">${currentStage.icon || '▶'} 当前环节：${ui.esc(currentStage.name)}</div>
        <span class="badge">第 ${currentStage.order} / ${total} 步</span>
      </div>
      <div class="small muted mb12">${ui.esc(currentStage.desc)}</div>
      ${body}
      ${canAdvance ? `<button class="btn btn-primary btn-block mt12" id="btn-stage-advance">完成本环节，进入下一步</button>` : ''}
    </div>`;
  })();

  const files = listing.fileList || [];

  /* ---------------- 文件保密 ---------------- */
  const fs2 = listing.fileSecret || {};
  const fileSecretOn = Boolean(fs2.enabled);
  const fileLocked = fileSecretOn && !fs2.unlocked;

  const tokenKey = ListingFileTokens.key(listing.id);
  const withFileToken = (url) => {
    const t = sessionStorage.getItem(tokenKey) || '';
    if (!t || !url) return url;
    return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(t)}`;
  };

  const images = files.filter((f) => f.kind === 'image');
  // 没有上传图片时，用发布时自动生成的封面兜底
  const heroSrc = images[0] && images[0].url ? images[0].url : listing.coverUrl || '';
  const others = files.filter((f) => f.kind !== 'image');
  const dec = files.filter((f) => ['pdf', 'word', 'ppt', 'excel', 'cad', 'archive'].includes(f.kind));

  // 标记自己的留言
  const me = ctx.state.user?.id;
  const markMine = (list) => list.map((c) => ({ ...c, mine: c.userId === me, replies: markMine(c.replies || []) }));
  const tree = markMine(comments.tree || []);

  const statusBadge = {
    published: '<span class="badge ok">已发布</span>',
    draft: '<span class="badge warn">草稿</span>',
    expired: '<span class="badge gray">已过期</span>',
    closed: '<span class="badge gray">已下架</span>',
    pending: '<span class="badge warn">待审核</span>',
  }[listing.status] || '';

  const left = ui.daysLeft(listing.expiresAt);

  const eventBlock = listing.category === 'event' && listing.event
    ? `<div class="card card-pad">
        <div class="strong mb8">🎪 活动信息</div>
        <div class="small muted">
          ${listing.event.startAt ? `<div>⏰ 开始：${ui.esc(ui.fmtDate(listing.event.startAt, true))}</div>` : ''}
          ${listing.event.endAt ? `<div>⏱ 结束：${ui.esc(ui.fmtDate(listing.event.endAt, true))}</div>` : ''}
          ${listing.event.address ? `<div>📍 地点：${ui.esc(listing.event.address)}${listing.event.online ? '（线上）' : ''}</div>` : ''}
          ${listing.event.organizer ? `<div>🏢 主办：${ui.esc(listing.event.organizer)}</div>` : ''}
          ${listing.event.capacity ? `<div>👥 名额：${listing.event.capacity} 人（已报名 ${listing.event.registered || 0}）</div>` : ''}
          <div>💰 费用：${listing.event.needPay ? `<b style="color:var(--danger)">${listing.event.fee} 元 / 人</b>（需在线支付）` : '免费'}</div>
          ${listing.event.registerDeadline ? `<div>📅 报名截止：${ui.esc(ui.fmtDate(listing.event.registerDeadline))}</div>` : ''}
        </div>
        ${isOwner
          ? `<button class="btn btn-block mt12" id="btn-registrations">查看报名名单</button>`
          : `<button class="btn btn-primary btn-block mt12" id="btn-register">立即报名${listing.event.needPay ? ` · ${listing.event.fee} 元` : '（免费）'}</button>`}
      </div>`
    : '';

  /* 物资明细：2 条以上用表格，1 条并入普通字段展示 */
  const tradeItems = (listing.trade && listing.trade.items) || [];
  const itemsTable = tradeItems.length >= 2
    ? `<div class="strong mb8 mt12">📋 物资明细（${tradeItems.length} 条）</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:38px">#</th>
                <th>品名</th>
                <th>规格型号</th>
                <th class="num">数量</th>
                <th>单位</th>
                <th class="num">单价</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              ${tradeItems.map((it, i) => `<tr>
                <td class="dim">${i + 1}</td>
                <td class="strong">${ui.esc(it.name || '—')}</td>
                <td>${ui.esc(it.spec || '—')}</td>
                <td class="num">${ui.esc(it.quantity || '—')}</td>
                <td>${ui.esc(it.unit || '—')}</td>
                <td class="num">${ui.esc(it.price || '—')}</td>
                <td class="tiny">${ui.esc(it.note || '')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="tiny dim mt8">共 ${tradeItems.length} 条物资，数量与单价以双方最终确认为准。</div>`
    : '';

  const singleItem = tradeItems.length === 1
    ? `<div class="small muted mt8">
        <div>品名：${ui.esc(tradeItems[0].name || '—')}</div>
        ${tradeItems[0].spec ? `<div>规格：${ui.esc(tradeItems[0].spec)}</div>` : ''}
        ${tradeItems[0].quantity ? `<div>数量：${ui.esc(tradeItems[0].quantity)} ${ui.esc(tradeItems[0].unit || '')}</div>` : ''}
        ${tradeItems[0].price ? `<div>单价：${ui.esc(tradeItems[0].price)}</div>` : ''}
        ${tradeItems[0].note ? `<div>备注：${ui.esc(tradeItems[0].note)}</div>` : ''}
      </div>`
    : '';

  /* ---------------- 悬赏 ---------------- */
  const bountyBlock = listing.category === 'bounty' && listing.bounty && Object.values(listing.bounty).some(Boolean)
    ? (() => {
        const b = listing.bounty;
        const types = ctx.state.taxonomy?.bountyTypes || [];
        const t = types.find((x) => x.id === b.bountyType || x.name === b.bountyType);
        const rows = [
          ['悬赏类型', t ? t.name : b.bountyType],
          ['结算方式', b.settleMode],
          ['参与资格', b.eligibility],
          ['中赏人数', b.winnerCount ? `${b.winnerCount} 名` : ''],
          ['截止时间', b.deadline ? ui.fmtDate(b.deadline) : ''],
        ].filter(([, v]) => v);
        return `<div class="card card-pad bounty-card">
          <div class="row between mb8">
            <div class="strong">🎯 悬赏信息</div>
            ${b.reward ? `<span class="bounty-reward">赏金 ${ui.esc(b.reward)}${ui.esc(b.rewardUnit || '元')}</span>` : ''}
          </div>
          ${b.bountyType ? `<div class="small muted mb8">${ui.esc(t ? t.desc : '')}</div>` : ''}
          ${rows.length ? `<div class="kv-table">${rows.map(([k, v]) => `<div class="kv"><span class="k">${ui.esc(k)}</span><span class="v">${ui.esc(v)}</span></div>`).join('')}</div>` : ''}
          ${b.deliverable ? `<div class="mt12"><div class="small strong mb4">交付要求</div>
            <div class="small" style="white-space:pre-wrap;color:var(--text-2)">${ui.esc(b.deliverable)}</div></div>` : ''}
          ${b.extra ? `<div class="mt8 tiny dim" style="white-space:pre-wrap">${ui.esc(b.extra)}</div>` : ''}
        </div>`;
      })()
    : '';

  const tradeBlock = listing.category === 'trade' && listing.trade
    ? `<div class="card card-pad">
        <div class="strong mb8">🤝 供需信息</div>
        <div class="small muted">
          ${listing.trade.tradeType ? `<div>类型：${ui.esc(listing.trade.tradeType)}</div>` : ''}
          ${listing.trade.quantity ? `<div>数量：${ui.esc(listing.trade.quantity)} ${ui.esc(listing.trade.unit || '')}</div>` : ''}
          ${listing.trade.price ? `<div>价格：${ui.esc(listing.trade.price)}</div>` : ''}
          ${listing.trade.payment ? `<div>付款：${ui.esc(listing.trade.payment)}</div>` : ''}
          ${listing.trade.delivery ? `<div>交付：${ui.esc(listing.trade.delivery)}</div>` : ''}
          ${listing.trade.destination ? `<div>地点：${ui.esc(listing.trade.destination)}</div>` : ''}
          ${listing.trade.deadline ? `<div>截止：${ui.esc(ui.fmtDate(listing.trade.deadline))}</div>` : ''}
        </div>
        ${singleItem}
        ${itemsTable}
      </div>`
    : '';

  const projectBlock = listing.category === 'project' && listing.project && Object.values(listing.project).some(Boolean)
    ? `<div class="card card-pad">
        <div class="strong mb8">📁 项目要素</div>
        <div class="small muted">
          ${listing.project.investAmount ? `<div>金额：${ui.esc(listing.project.investAmount)}</div>` : ''}
          ${listing.project.stage ? `<div>阶段：${ui.esc(listing.project.stage)}</div>` : ''}
          ${listing.project.cooperation ? `<div>合作方式：${ui.esc(listing.project.cooperation)}</div>` : ''}
          ${listing.project.period ? `<div>周期：${ui.esc(listing.project.period)}</div>` : ''}
          ${listing.project.target ? `<div>对象要求：${ui.esc(listing.project.target)}</div>` : ''}
        </div>
      </div>`
    : '';

  const contactBlock = `<div class="card card-pad">
    <div class="strong mb8">📞 联系方式</div>
    ${listing.contact?.hidden
      ? `<div class="small muted">${ui.esc(listing.contact.tip)}</div>`
      : `<div class="small muted">
          ${listing.contact?.name ? `<div>联系人：${ui.esc(listing.contact.name)}</div>` : ''}
          ${listing.contact?.phone ? `<div>电话：<a href="tel:${ui.esc(listing.contact.phone)}">${ui.esc(listing.contact.phone)}</a></div>` : ''}
          ${listing.contact?.wechat ? `<div>微信：${ui.esc(listing.contact.wechat)}</div>` : ''}
          ${listing.contact?.email ? `<div>邮箱：${ui.esc(listing.contact.email)}</div>` : ''}
          ${!listing.contact?.phone && !listing.contact?.wechat && !listing.contact?.email ? '<div>发布方未填写联系方式，可通过留言或项目对接联系</div>' : ''}
        </div>`}
  </div>`;

  const html = `<div class="page flush">
    ${heroSrc ? `
      <div class="hero"><img id="hero-img" src="${ui.esc(ui.safeUrl(heroSrc))}" alt=""></div>
      ${images.length > 1 ? `<div class="gallery">${images.map((f, i) => `<img src="${ui.esc(ui.safeUrl(f.url))}" data-idx="${i}" class="${i === 0 ? 'active' : ''}" alt="">`).join('')}</div>` : ''}
    ` : `<div class="hero hero-empty">
      <div style="font-size:46px">${categoryIcon(listing.category)}</div>
      ${isOwner ? `<button class="btn btn-sm mt8" id="btn-gen-cover-from-hero">🎨 自动生成配图</button>` : ''}
    </div>`}

    <div class="page">
      <div class="detail-layout">
        <div>
          <div class="row gap6 mb8" style="flex-wrap:wrap">
            ${statusBadge}
            <span class="badge">${ui.esc(listing.categoryName)}</span>
            ${listing.typeName ? `<span class="badge gray">${ui.esc(listing.typeName)}</span>` : ''}
            ${(listing.subs || []).map((s) => `<span class="badge accent">${ui.esc(s.name)}</span>`).join('')}
            ${(listing.cities || []).map((c) => `<span class="badge gray">📍${ui.esc(c.name)}</span>`).join('')}
            ${listing.expiresAt ? `<span class="badge ${left > 0 ? 'warn' : 'gray'}">${left > 0 ? `有效期还剩 ${left} 天` : '已到期'}</span>` : ''}
          </div>

          <h1 class="detail-title">${ui.esc(listing.title)}</h1>
          ${listing.subtitle ? `<div class="detail-sub">${ui.esc(listing.subtitle)}</div>` : ''}

          ${listing.location && (listing.location.address || listing.location.lat) ? `<div class="detail-loc mt8">
            <span class="detail-loc-ico">📍</span>
            <span>${ui.esc(listing.location.address || `${listing.location.lat.toFixed(4)}, ${listing.location.lng.toFixed(4)}`)}</span>
            ${listing.location.lat ? `<a class="tiny" href="https://uri.amap.com/marker?position=${listing.location.lng},${listing.location.lat}&name=${encodeURIComponent(listing.title || '')}" target="_blank" rel="noopener">在地图中查看</a>` : ''}
            ${!listing.locationPublic ? '<span class="badge gray">仅自己可见</span>' : ''}
          </div>` : ''}

          <div class="row gap12 mt12 tiny dim" style="flex-wrap:wrap">
            <span>👁 ${listing.views || 0} 浏览</span>
            <span>💬 ${listing.commentCount || 0} 留言</span>
            <span>⭐ ${listing.followerCount || 0} 关注</span>
            <span>🔗 ${listing.shareCount || 0} 分享</span>
            <span>${ui.esc(ui.fmtRelative(listing.publishedAt || listing.createdAt))}</span>
          </div>

          ${listing.gated ? `<div class="card card-pad gate-card">
            <div style="font-size:34px">🔐</div>
            <div class="strong mt8" style="font-size:16px">登录后查看完整项目信息</div>
            <div class="small muted mt8" style="line-height:1.8">
              为了保护项目方隐私，分享出去的链接打开后需要先<b>登录或注册</b>，才能查看正文、附件、商务条件、资质要求，并进行项目对接、留言等操作。
            </div>
            <div class="row gap8 mt12">
              <a class="btn btn-primary grow" href="#/login?redirect=${encodeURIComponent(`#/detail/${listing.id}`)}">登录</a>
              <a class="btn grow" href="#/register?redirect=${encodeURIComponent(`#/detail/${listing.id}`)}">免费注册</a>
            </div>
            <div class="tiny dim center mt8">当前仅展示摘要：${ui.esc(listing.subtitle || '')}</div>
          </div>` : ''}

          ${listing.aiVisible && listing.ai ? aiCardHtml(listing.ai) : ''}
          ${!listing.aiVisible && listing.aiLocked ? `<div class="card card-pad mb12 ai-locked" id="ai-locked">
            <div class="row between mb8">
              <div class="strong">🤖 AI 项目解析</div>
              <span class="badge gray">需发布方授权</span>
            </div>
            <div class="small muted" style="line-height:1.8">
              发布方对该项目做了 AI 解析（可靠性评分、项目要素、风险提示、建议补充），
              默认仅发布方可见。如需查看，可向发布方申请。
            </div>
            <div class="row gap8 mt12">
              <button class="btn btn-primary grow" id="ai-req">申请查看解析</button>
            </div>
            <div class="tiny dim center mt8" id="ai-req-hint"></div>
          </div>` : ''}

          ${(isOwner || isAdmin) ? '<div id="file-access-panel"></div>' : ''}
          ${(isOwner || isAdmin) ? '<div id="ai-access-panel"></div>' : ''}

          ${listing.gated ? '' : autoInfoCard(listing.autoInfo)}

          ${projectBlock}
          ${eventBlock}
          ${tradeBlock}
          ${bountyBlock}
          ${contactBlock}

          <div class="card card-pad">
            <div class="strong mb8">📄 详细信息</div>
            <div class="small" style="white-space:pre-wrap;word-break:break-word;color:var(--text-2)">${ui.esc(listing.text || '（发布方未填写正文）')}</div>
          </div>

          ${(listing.blocks || []).length ? `<div class="card card-pad">
            <div class="strong mb8">📝 内容段落（${listing.blocks.length}）</div>
            ${listing.blocks.map((b, i) => `<div class="detail-block">
              <div class="detail-block-t">段落 ${i + 1}</div>
              ${b.text ? `<div class="detail-block-b">${ui.nl2br(ui.esc(b.text))}</div>` : ''}
              ${(b.files || b.images || []).length ? `<div class="detail-block-imgs">
                ${(b.files || b.images || []).map((fid) => {
                  const rec = (listing.fileList || []).find((x) => x.id === fid);
                  const isImg = rec ? rec.kind === 'image' : true;
                  const url = rec ? ui.safeUrl(rec.url) : `/files/${ui.esc(fid)}/view`;
                  if (!isImg) {
                    return `<a class="chip" href="${ui.esc(url)}" target="_blank" rel="noopener">📎 ${ui.esc((rec && rec.name) || '附件')}</a>`;
                  }
                  return `<img src="${ui.esc(url)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
                }).join('')}
              </div>` : ''}
            </div>`).join('')}
          </div>` : ''}

          ${listing.fileLocked ? `<div class="card card-pad" id="project-files">
            <div class="file-locked">
              <div class="file-locked-ico">🔐</div>
              <div class="file-locked-txt">
                <div class="strong">项目文件（${listing.fileCount || 0} 个）· 需发布方授权</div>
                <div class="tiny dim mt4">项目资料默认仅发布方可见。管理员可直接查看；其他用户需向发布方申请，通过后才能打开。</div>
              </div>
            </div>
            <div class="row gap8 mt12">
              <button class="btn btn-primary grow" id="file-req" ${listing.fileRequested ? 'disabled' : ''}>${listing.fileRequested ? '已申请，等待发布方处理' : '申请查看文件'}</button>
            </div>
            <div class="tiny dim center mt8" id="file-req-hint">${listing.fileRequested ? '发布方处理后会通知你' : ''}</div>
          </div>` : files.length ? (fileLocked ? `<div class="card card-pad" id="project-files">
            <div class="file-locked">
              <div class="file-locked-ico">🔒</div>
              <div class="file-locked-txt">
                <div class="strong">附件已加密（${files.length} 个）</div>
                <div class="tiny dim mt4">发布方设置了查看密码。输入后可在 <b>${ui.esc(String(fs2.ttlHours || 6))} 小时</b>内在线查看。</div>
              </div>
            </div>
            <div class="row gap8 mt12">
              <input class="input" id="file-pwd" type="password" maxlength="32" placeholder="请输入查看密码" style="flex:1">
              <button class="btn btn-primary" id="file-unlock">查看</button>
            </div>
            <div class="tiny dim mt8">🔐 仅供在线查看，页面不提供下载入口。但请注意：能看到的内容仍可能被截图或录屏保存。</div>
          </div>` : `<div class="card card-pad" id="project-files">
            <div class="row between mb8">
              <div class="strong">📁 项目文件（${files.length}）</div>
              <span class="tiny dim">点击文件即可在线查看${fileSecretOn ? '' : '或下载'}</span>
            </div>
            ${fileSecretOn ? '<div class="file-unlocked-tip mb8">🔓 密码已验证 <span id="file-countdown" class="file-countdown"></span></div>' : ''}
            <div class="row wrap gap8">
              ${files.map((f) => fileCardHtml({ ...f, url: withFileToken(f.url) })).join('')}
            </div>
            <div class="tiny dim mt8">发布方上传的项目资料，${listing.isOwner ? '其他人需登录后才能看到。' : '已登录用户均可查看。'}</div>
          </div>`) : (listing.gated ? `<div class="card card-pad center">
            <div class="strong">📁 项目文件</div>
            <div class="small muted mt4">发布方上传了项目资料，登录后可查看。</div>
            <a class="btn btn-primary btn-sm mt12" href="#/login?redirect=${encodeURIComponent(`#/detail/${listing.id}`)}">登录后查看</a>
          </div>` : '')}

          ${listing.followUps?.length ? `<div class="card card-pad">
            <div class="strong mb8">📌 内容更新（${listing.followUps.length}）</div>
            ${listing.followUps.slice().reverse().map((f) => `<div style="border-bottom:1px dashed var(--line);padding:8px 0">
              <div class="tiny dim">${ui.esc(f.byName || '')} · ${ui.esc(ui.fmtDate(f.at, true))}</div>
              <div class="small" style="white-space:pre-wrap">${ui.esc(f.text || '')}</div>
              ${(f.files || []).length ? `<div class="row wrap gap8 mt8">
                ${fuFilesOf(f).map((rec) => {
                  if (rec.kind === 'image') {
                    return `<a href="${ui.esc(ui.safeUrl(rec.url))}" target="_blank" rel="noopener">
                      <img src="${ui.esc(ui.safeUrl(rec.url))}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">
                    </a>`;
                  }
                  return `<a class="chip" href="${ui.esc(ui.safeUrl(rec.url))}" target="_blank" rel="noopener">📎 ${ui.esc(rec.name || '附件')}</a>`;
                }).join('')}
              </div>` : ''}
            </div>`).join('')}
            ${isOwner || isAdmin ? '<button class="btn btn-sm btn-outline mt8" id="btn-add-followup">+ 追加内容（文字 + 文件）</button>' : ''}
          </div>` : ''}

          ${termsCard}
          ${qualCard}
          ${pipeline && pipeline.length ? pipelineHtml(pipeline, listing.pipeline?.history || []) : ''}
          ${stagePanel}
          ${casesCard}

          <div class="card card-pad">
            <div class="row between mb8">
              <div class="strong">💬 留言与 AI 回复（${listing.commentCount || 0}）</div>
              <span class="tiny dim">AI 会结合项目资料自动回复</span>
            </div>
            <div id="comment-list">
              ${tree.length ? tree.map((c) => commentHtml(c)).join('') : ui.emptyState('💭', '还没有留言，来做第一个提问的人')}
            </div>
            <div class="mt12" id="comment-form">
              <textarea class="textarea" id="comment-input" placeholder="想问点什么？例如：对承接方有什么资质要求？" style="min-height:76px"></textarea>
              <div class="row between mt8">
                <label class="checkbox small"><input type="checkbox" id="comment-ai" checked> 让 AI 助理自动回复</label>
                <button class="btn btn-primary btn-sm" id="comment-submit">发表留言</button>
              </div>
            </div>
          </div>
        </div>

        <aside class="detail-side">
          <div class="card card-pad">
            <div class="row gap12">
              ${ui.avatarHtml(listing.ownerSnapshot || { nickname: '发布方' }, 'lg')}
              <div class="grow">
                <div class="strong">${ui.esc(listing.ownerSnapshot?.nickname || '发布方')}
                  ${listing.ownerSnapshot?.verified ? '<span class="badge ok">已认证</span>' : ''}</div>
                <div class="tiny dim">${ui.esc(listing.company || '未填写企业')}</div>
              </div>
            </div>
            <div class="row gap8 mt12">
              <button class="btn btn-sm grow ${listing.ownerFollowing ? 'btn-outline' : ''}" id="btn-follow-owner">${listing.ownerFollowing ? '已关注' : '关注发布方'}</button>
              <button class="btn btn-sm grow ${listing.following ? 'btn-outline' : ''}" id="btn-follow">${listing.following ? '已关注信息' : '关注信息'}</button>
            </div>
            <button class="btn btn-primary btn-block mt8" id="btn-dock">🤝 项目对接</button>
            <div class="btn-group mt8">
              <button class="btn" id="btn-share">🔗 分享</button>
              <button class="btn" id="btn-chat">💬 群聊</button>
              <button class="btn" id="btn-meeting">📹 会议</button>
            </div>
            ${isOwner ? `<div class="btn-group mt8">
              <button class="btn" id="btn-edit">编辑</button>
              <button class="btn" id="btn-renew">续期</button>
              <button class="btn" id="btn-close">下架</button>
            </div>` : ''}
          </div>
          ${isOwner && listing.pipeline ? `<div class="card card-pad mt12">
            <div class="strong mb8">🔧 发布方操作</div>
            <button class="btn btn-sm btn-block" id="btn-advance">推进流程到下一步</button>
          </div>` : ''}
        </aside>
      </div>
    </div>
  </div>`;

  return {
    title: listing.title,
    content: html,
    showBack: true,
    noTab: false,
    activeTab: listing.category,
    async mount(root) {
      const $ = (s) => root.querySelector(s);

      /* ---------------- 附件查看授权 ---------------- */
      const fileReqBtn = root.querySelector('#file-req');
      if (fileReqBtn && !fileReqBtn.disabled) {
        fileReqBtn.addEventListener('click', async () => {
          fileReqBtn.disabled = true;
          fileReqBtn.textContent = '提交中…';
          try {
            const r = await api.post(`/api/listings/${listing.id}/file-access/request`, {});
            if (r.status === 'granted') {
              ui.toast('你已有查看权限，刷新即可', 'ok');
              setTimeout(() => ctx.nav(`#/detail/${listing.id}`, { replace: true }), 800);
              return;
            }
            fileReqBtn.textContent = '已申请，等待发布方处理';
            const hint = root.querySelector('#file-req-hint');
            if (hint) hint.textContent = '发布方处理后会通知你';
            ui.toast('申请已提交，等待发布方同意', 'ok');
          } catch (err) {
            ui.toast(err.message || '申请失败', 'err');
            fileReqBtn.disabled = false;
            fileReqBtn.textContent = '申请查看文件';
          }
        });
      }

      // 发布方：待处理附件申请
      const filePanel = root.querySelector('#file-access-panel');
      if (filePanel && (isOwner || isAdmin)) {
        try {
          const rr = await api.get(`/api/listings/${listing.id}/file-access/requests`);
          const items = rr.items || [];
          if (items.length) {
            filePanel.innerHTML = `<div class="card card-pad mb12">
              <div class="row between mb8">
                <div class="strong">📁 附件查看权限</div>
                <span class="badge ${rr.pendingCount ? 'warn' : 'gray'}">待处理 ${rr.pendingCount} / 已授权 ${rr.grantedCount}</span>
              </div>
              ${items.map((it) => `<div class="ai-grant-row">
                <div>
                  <div class="ai-grant-name">${ui.esc(it.name)}${it.company ? ` <span class="tiny dim">${ui.esc(it.company)}</span>` : ''}</div>
                  <div class="tiny dim">${it.status === 'pending' ? '申请中' : it.status === 'approved' ? '已授权' : '已拒绝'} · ${String(it.at || '').slice(0, 16).replace('T', ' ')}</div>
                </div>
                <div class="row gap6">
                  ${it.granted
                    ? `<button class="btn btn-sm" data-frevoke="${ui.esc(it.userId)}">撤销</button>`
                    : `<button class="btn btn-sm btn-primary" data-fallow="${ui.esc(it.userId)}">同意</button>
                       <button class="btn btn-sm" data-fdeny="${ui.esc(it.userId)}">拒绝</button>`}
                </div>
              </div>`).join('')}
            </div>`;

            const frespond = async (userId, agree) => {
              try {
                await api.post(`/api/listings/${listing.id}/file-access/${encodeURIComponent(userId)}/respond`, { agree });
                ui.toast(agree ? '已同意' : '已拒绝', 'ok');
                ctx.nav(`#/detail/${listing.id}`, { replace: true });
              } catch (err) {
                ui.toast(err.message || '操作失败', 'err');
              }
            };
            filePanel.querySelectorAll('[data-fallow]').forEach((b) => b.addEventListener('click', () => frespond(b.dataset.fallow, true)));
            filePanel.querySelectorAll('[data-fdeny]').forEach((b) => b.addEventListener('click', () => frespond(b.dataset.fdeny, false)));
            filePanel.querySelectorAll('[data-frevoke]').forEach((b) =>
              b.addEventListener('click', async () => {
                const ok = await ui.confirmDialog({ title: '撤销权限', message: '撤销后对方将不能查看项目文件', danger: true, okText: '撤销' });
                if (!ok) return;
                try {
                  await api.post(`/api/listings/${listing.id}/file-access/${encodeURIComponent(b.dataset.frevoke)}/revoke`, {});
                  ui.toast('已撤销', 'ok');
                  ctx.nav(`#/detail/${listing.id}`, { replace: true });
                } catch (err) {
                  ui.toast(err.message || '操作失败', 'err');
                }
              })
            );
          }
        } catch {
          /* 忽略 */
        }
      }

      /* ---------------- AI 解析授权 ---------------- */
      const aiReqBtn = root.querySelector('#ai-req');
      if (aiReqBtn) {
        if (listing.aiRequested) {
          aiReqBtn.disabled = true;
          aiReqBtn.textContent = '已申请，等待发布方处理';
          const hint = root.querySelector('#ai-req-hint');
          if (hint) hint.textContent = '发布方处理后你会收到通知';
        }
        aiReqBtn.addEventListener('click', async () => {
          aiReqBtn.disabled = true;
          aiReqBtn.textContent = '提交中…';
          try {
            const r = await api.post(`/api/listings/${listing.id}/ai-access/request`, {});
            if (r.status === 'granted') {
              ui.toast('你已有查看权限，刷新即可', 'ok');
              setTimeout(() => ctx.nav(`#/detail/${listing.id}`, { replace: true }), 800);
              return;
            }
            aiReqBtn.textContent = '已申请，等待发布方处理';
            const hint = root.querySelector('#ai-req-hint');
            if (hint) hint.textContent = '发布方处理后你会收到通知';
            ui.toast('申请已提交，等待发布方同意', 'ok');
          } catch (err) {
            ui.toast(err.message || '申请失败', 'err');
            aiReqBtn.disabled = false;
            aiReqBtn.textContent = '申请查看解析';
          }
        });
      }

      // 发布方：待处理申请
      const panel = root.querySelector('#ai-access-panel');
      if (panel && (isOwner || isAdmin)) {
        try {
          const rr = await api.get(`/api/listings/${listing.id}/ai-access/requests`);
          const items = rr.items || [];
          if (items.length) {
            panel.innerHTML = `<div class="card card-pad mb12">
              <div class="row between mb8">
                <div class="strong">🔐 AI 解析查看权限</div>
                <span class="badge ${rr.pendingCount ? 'warn' : 'gray'}">待处理 ${rr.pendingCount} / 已授权 ${rr.grantedCount}</span>
              </div>
              ${items.map((it) => `<div class="ai-grant-row">
                <div>
                  <div class="ai-grant-name">${ui.esc(it.name)}${it.company ? ` <span class="tiny dim">${ui.esc(it.company)}</span>` : ''}</div>
                  <div class="tiny dim">${it.status === 'pending' ? '申请中' : it.status === 'approved' ? '已授权' : '已拒绝'} · ${String(it.at || '').slice(0, 16).replace('T', ' ')}</div>
                </div>
                <div class="row gap6">
                  ${it.granted
                    ? `<button class="btn btn-sm" data-revoke="${ui.esc(it.userId)}">撤销</button>`
                    : `<button class="btn btn-sm btn-primary" data-allow="${ui.esc(it.userId)}">同意</button>
                       <button class="btn btn-sm" data-deny="${ui.esc(it.userId)}">拒绝</button>`}
                </div>
              </div>`).join('')}
            </div>`;

            const respond = async (userId, agree) => {
              try {
                await api.post(`/api/listings/${listing.id}/ai-access/${encodeURIComponent(userId)}/respond`, { agree });
                ui.toast(agree ? '已同意' : '已拒绝', 'ok');
                ctx.nav(`#/detail/${listing.id}`, { replace: true });
              } catch (err) {
                ui.toast(err.message || '操作失败', 'err');
              }
            };
            panel.querySelectorAll('[data-allow]').forEach((b) => b.addEventListener('click', () => respond(b.dataset.allow, true)));
            panel.querySelectorAll('[data-deny]').forEach((b) => b.addEventListener('click', () => respond(b.dataset.deny, false)));
            panel.querySelectorAll('[data-revoke]').forEach((b) =>
              b.addEventListener('click', async () => {
                const ok = await ui.confirmDialog({ title: '撤销权限', message: '撤销后对方将看不到 AI 解析', danger: true, okText: '撤销' });
                if (!ok) return;
                try {
                  await api.post(`/api/listings/${listing.id}/ai-access/${encodeURIComponent(b.dataset.revoke)}/revoke`, {});
                  ui.toast('已撤销', 'ok');
                  ctx.nav(`#/detail/${listing.id}`, { replace: true });
                } catch (err) {
                  ui.toast(err.message || '操作失败', 'err');
                }
              })
            );
          }
        } catch {
          /* 忽略：拿不到就显示原有内容 */
        }
      }

      root.querySelector('.gallery')?.addEventListener('click', (e) => {
        const img = e.target.closest('img[data-idx]');
        if (!img) return;
        const src = img.src;
        const hero = root.querySelector('#hero-img');
        if (hero) hero.src = src;
        root.querySelectorAll('.gallery img').forEach((el) => el.classList.toggle('active', el === img));
      });

      /* 关注 */
      const toggleFollow = async (btn, targetType, targetId, key) => {
        if (!ctx.requireLogin()) return;
        const on = btn.classList.contains('btn-outline');
        try {
          if (on) await service.unfollow(targetType, targetId);
          else await service.follow(targetType, targetId, { name: listing.title });
          btn.classList.toggle('btn-outline', !on);
          btn.textContent = btn.textContent.includes('发布方')
            ? (on ? '关注发布方' : '已关注')
            : (on ? '关注信息' : '已关注信息');
          ui.toast(on ? '已取消关注' : '关注成功，有新动态会通知你', 'ok');
          void key;
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      };
      root.querySelector('#btn-follow')?.addEventListener('click', (e) => toggleFollow(e.currentTarget, 'listing', listing.id));
      root.querySelector('#btn-follow-owner')?.addEventListener('click', (e) => toggleFollow(e.currentTarget, 'user', listing.ownerId));

      /* 分享 */
      root.querySelector('#btn-share')?.addEventListener('click', () => openShareSheet({ ...listing, summary: listing.ai?.summary }));

      /* 项目对接 */
      // 资质上传表单：在下面的「当前环节」块里赋值，但对接按钮也要用，
      // 所以先在挂载作用域声明（点击发生在 mount 结束之后，赋值一定已完成）
      let openQualificationForm = () => {};

      root.querySelector('#btn-dock')?.addEventListener('click', async () => {
        if (!ctx.requireLogin()) return;
        if (isOwner) return ui.toast('这是你自己发布的信息', 'err');
        const note = await ui.promptDialog({ title: '发起项目对接', label: '简单说明你的合作意向（选填）', placeholder: '例如：我方具备电力工程施工总承包一级资质，希望参与 EPC 投标', multiline: true, okText: '发起对接' });
        if (note === null) return;
        ui.showLoading('正在建立项目群…');
        try {
          const res = await service.dock(listing.id, note || '');
          ui.hideLoading();

          // 对接后如果项目要求资质，立刻引导上传 → AI 审核 → 发布方确认
          const needQual = listing.category === 'project'
            && proj.needQualification
            && (proj.qualifications || []).length > 0;
          if (needQual) {
            const go = await ui.confirmDialog({
              title: '已建立项目对接群',
              message: '本项目需要提供企业资质。现在上传吗？提交后 AI 会先逐项核对，再由发布方确认。',
              okText: '现在上传资质',
              cancelText: '稍后再说',
            });
            if (go) {
              openQualificationForm();
              return;
            }
          }
          ui.toast('已建立项目对接群', 'ok');
          ctx.nav(`#/chat/${res.room.id}`);
        } catch (err) {
          ui.hideLoading();
          ui.toast(err.message, 'err');
        }
      });

      /* 群聊 */
      root.querySelector('#btn-chat')?.addEventListener('click', async () => {
        if (!ctx.requireLogin()) return;
        try {
          const res = await service.createRoom({
            type: 'group',
            name: `${listing.title.slice(0, 24)} · 讨论群`,
            listingId: listing.id,
            targetId: `discuss:${listing.id}`,
            memberIds: [listing.ownerId],
          });
          ctx.nav(`#/chat/${res.room.id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      /* 发起会议 */
      root.querySelector('#btn-meeting')?.addEventListener('click', async () => {
        if (!ctx.requireLogin()) return;
        const title = await ui.promptDialog({ title: '发起线上会议', label: '会议主题', value: `${listing.title.slice(0, 24)} · 项目沟通会`, okText: '创建会议' });
        if (!title) return;
        try {
          let roomId = listing.chatRoomId;
          if (!roomId) {
            const room = await service.createRoom({ type: 'group', name: `${listing.title.slice(0, 24)} · 讨论群`, listingId: listing.id, targetId: `discuss:${listing.id}`, memberIds: [listing.ownerId] });
            roomId = room.room.id;
          }
          const res = await service.createMeeting({ roomId, listingId: listing.id, title, durationMin: 60 });
          ctx.nav(`#/meeting/${res.meeting.id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      /* 报名 */
      root.querySelector('#btn-register')?.addEventListener('click', async () => {
        if (!ctx.requireLogin()) return;
        const name = await ui.promptDialog({ title: '活动报名', label: '您的姓名', value: ctx.state.user?.nickname || '', okText: '下一步' });
        if (!name) return;
        const phone = await ui.promptDialog({ title: '活动报名', label: '联系电话', value: ctx.state.user?.phone || '', okText: '提交报名' });
        if (!phone) return;
        try {
          const res = await service.registerEvent(listing.id, { name, phone });
          if (res.needPay) {
            const ok = await ui.confirmDialog({
              title: '确认支付报名费',
              message: `本次报名需在线支付 ${listing.event.fee} 元。\n（演示环境不会真实扣款，正式环境将接入微信支付）`,
              okText: `支付 ${listing.event.fee} 元`,
            });
            if (ok) ui.toast('支付成功（演示），名额已锁定', 'ok');
            else ui.toast('已登记报名，请在截止前完成支付', '');
          } else {
            ui.toast('报名成功！', 'ok');
          }
          await ctx.refreshMe();
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      root.querySelector('#btn-registrations')?.addEventListener('click', async () => {
        try {
          const res = await service.registrations(listing.id);
          ui.openSheet({
            title: `报名名单（${res.items.length}）`,
            content: res.items.length
              ? `<table class="table"><thead><tr><th>姓名</th><th>电话</th><th>状态</th></tr></thead><tbody>
                  ${res.items.map((r) => `<tr><td>${ui.esc(r.name)}</td><td>${ui.esc(r.phone)}</td><td>${r.payStatus === 'free' ? '免费' : r.payStatus === 'paid' ? '已支付' : '待支付'}</td></tr>`).join('')}
                </tbody></table>`
              : '<div class="small muted">暂无报名</div>',
          });
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      /* 发布方操作 */
      root.querySelector('#btn-edit')?.addEventListener('click', () => ctx.nav(`#/publish?edit=${listing.id}&category=${listing.category}`));
      root.querySelector('#btn-renew')?.addEventListener('click', async () => {
        const days = await ui.promptDialog({ title: '续期', label: '延长天数（7 / 15 / 30 / 90 / 180 / 365）', value: '30', okText: '续期' });
        if (!days) return;
        try {
          await service.renewListing(listing.id, Number(days));
          ui.toast('续期成功', 'ok');
          ctx.nav(`#/detail/${listing.id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
      root.querySelector('#btn-close')?.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({ title: '下架信息', message: '下架后信息将不再出现在列表与搜索结果中，可随时重新发布。', danger: true, okText: '确认下架' });
        if (!ok) return;
        try {
          await service.closeListing(listing.id, '发布方下架');
          ui.toast('已下架', 'ok');
          ctx.nav('#/me');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
      root.querySelector('#btn-advance')?.addEventListener('click', async () => {
        const note = await ui.promptDialog({ title: '推进项目流程', label: '本步骤说明 / 备注（选填）', multiline: true, okText: '推进到下一步' });
        if (note === null) return;
        try {
          const fd = new FormData();
          fd.append('stage', 'next');
          fd.append('note', note || '');
          const res = await service.advancePipeline(listing.id, fd);
          ui.toast(`已推进到：${res.stage?.name || '下一步'}`, 'ok');
          ctx.nav(`#/detail/${listing.id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });

      /* 新增后续 */
      root.querySelector('#btn-add-followup')?.addEventListener('click', async () => {
        if (!ctx.requireLogin()) return;

        await new Promise((resolve) => {
          ui.openSheet({
            title: '追加内容更新',
            content: `<div class="field">
                <label>文字内容</label>
                <textarea class="input" id="fu-text" rows="5" maxlength="4000" placeholder="补充说明、进展、变更事项等"></textarea>
              </div>
              <div class="field">
                <label>导入文件 / 图片（可多选）</label>
                <input type="file" id="fu-files" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.dwg">
                <div class="tiny dim mt6">支持图片、PDF、Word、Excel、PPT、CAD 等，单个不超过 50MB</div>
              </div>
              <button class="btn btn-primary btn-block mt12" id="fu-submit">发布更新</button>`,
            onMount(sheet, close) {
              const btn = sheet.querySelector('#fu-submit');
              btn.addEventListener('click', async () => {
                const text = (sheet.querySelector('#fu-text').value || '').trim();
                const files = [...(sheet.querySelector('#fu-files').files || [])];
                if (!text && !files.length) return ui.toast('请填写文字或选择文件', 'err');
                btn.disabled = true;
                btn.textContent = '上传中…';
                try {
                  const fd = new FormData();
                  fd.append('text', text);
                  for (const f of files) fd.append('file', f, f.name);
                  await service.addFollowUp(listing.id, fd);
                  ui.toast('已发布更新', 'ok');
                  close();
                  ctx.nav(`#/detail/${listing.id}`, { replace: true });
                  resolve();
                } catch (err) {
                  ui.toast(err.message || '发布失败', 'err');
                  btn.disabled = false;
                  btn.textContent = '发布更新';
                }
              });
            },
          });
        });
      });

      /* ---------------- 案例参考 + 自动配图 ---------------- */
      root.querySelector('#file-unlock')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const pwd = root.querySelector('#file-pwd')?.value || '';
        if (!pwd) return ui.toast('请输入查看密码', 'err');
        btn.disabled = true;
        btn.textContent = '验证中…';
        try {
          const r = await service.unlockFiles(listing.id, pwd);
          ListingFileTokens.set(listing.id, r.token);
          const mins = Math.round(Number(r.ttlHours || 0) * 60);
          ui.toast(`密码正确，${r.ttlHours} 小时内可查看`, 'ok');
          void mins;
          // 重新渲染详情页，让附件区切换成可查看状态
          ctx.refresh ? ctx.refresh() : window.location.reload();
        } catch (err) {
          ui.toast(err.message || '密码不正确', 'err');
          btn.disabled = false;
          btn.textContent = '查看';
        }
      });

      // 倒计时：让用户知道令牌什么时候过期
      const cd = root.querySelector('#file-countdown');
      if (cd && fileSecretOn) {
        const tick = () => {
          const t = ListingFileTokens.get(listing.id);
          if (!t) { cd.textContent = ''; return; }
          const exp = Number(String(t).split('.')[0]);
          const ms = exp - Date.now();
          if (ms <= 0) { cd.textContent = '（已过期，请重新输入密码）'; return; }
          const h = Math.floor(ms / 3600000);
          const m = Math.floor((ms % 3600000) / 60000);
          cd.textContent = h > 0 ? `剩余 ${h} 小时 ${m} 分` : `剩余 ${m} 分钟`;
        };
        tick();
        const timer = setInterval(tick, 30000);
        // 页面切走时清掉定时器，避免堆积
        window.addEventListener('hashchange', () => clearInterval(timer), { once: true });
      }

      root.querySelector('#btn-refresh-cases')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '正在检索…';
        try {
          await service.refreshCases(listing.id);
          ui.toast('已重新检索', 'ok');
          ctx.nav(`#/detail/${listing.id}`);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '🔄 重新检索';
          ui.toast(err.message, 'err');
        }
      });

      root.querySelector('#btn-gen-cover')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '正在生成配图…';
        try {
          await applyAutoCover(listing.id, listing);
          ui.toast('项目配图已生成并设为封面', 'ok');
          ctx.nav(`#/detail/${listing.id}`);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '🎨 生成项目配图';
          ui.toast(err.message, 'err');
        }
      });

      // 发布方且当前没有封面图时，给一个明显的生成入口
      root.querySelector('#btn-gen-cover-from-hero')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '正在生成配图…';
        try {
          await applyAutoCover(listing.id, listing);
          ui.toast('项目配图已生成', 'ok');
          ctx.nav(`#/detail/${listing.id}`);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = '🎨 自动生成配图';
          ui.toast(err.message, 'err');
        }
      });

      /* ---------------- 当前环节操作面板 ---------------- */
      if (listing.category === 'project' && currentStage) {
        const reload = () => ctx.nav(`#/detail/${listing.id}`);

        const printDoc = (doc) => {
          const w = window.open('', '_blank');
          if (!w) return ui.toast('请允许弹出窗口后再打印', 'err');
          const e = ui.esc;
          const rows = (doc.sections || []).map((s) => `
            <h3>${e(s.heading)}</h3>
            ${(s.rows || []).map((r) => `<div class="row"><b>${e(r[0])}</b>：${e(r[1])}</div>`).join('')}
            ${(s.bullets || []).map((b) => `<div class="row">· ${e(b)}</div>`).join('')}
            ${(s.paragraphs || []).map((p) => `<p>${e(p)}</p>`).join('')}`).join('');
          w.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${e(doc.title)}</title>
<style>
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;padding:48px;color:#111;line-height:1.9;max-width:760px;margin:0 auto}
h2{text-align:center;letter-spacing:8px;font-size:24px;margin:0 0 4px}
.sub{text-align:center;color:#666;margin-bottom:24px}
.meta{border:1px solid #ddd;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:14px}
h3{font-size:16px;margin:22px 0 8px}
.row,p{font-size:14px;margin:4px 0}
.foot{margin-top:28px;color:#888;font-size:12px;border-top:1px solid #eee;padding-top:12px}
@media print{body{padding:0}}
</style></head><body>
<h2>${e(doc.title)}</h2>
<div class="sub">${e(doc.subtitle || '')}</div>
<div class="meta">${(doc.meta || []).map((m) => `<div><b>${e(m.label)}</b>：${e(m.value)}</div>`).join('')}</div>
${(doc.body || []).map((p) => `<p>${e(p)}</p>`).join('')}
${rows}
<div class="foot">${e(doc.footer || '')}</div>
<script>setTimeout(function(){window.print()},350)<\/script>
</body></html>`);
          w.document.close();
        };

        const showDocSheet = (doc) => {
          ui.openSheet({
            title: doc.title,
            content: `<div class="doc-view">
              <h2 class="doc-h2">${ui.esc(doc.title)}</h2>
              <div class="doc-sub">${ui.esc(doc.subtitle || '')}</div>
              <div class="doc-meta">${(doc.meta || []).map((m) => `<div><b>${ui.esc(m.label)}</b>：${ui.esc(m.value)}</div>`).join('')}</div>
              ${(doc.body || []).map((p) => `<p>${ui.esc(p)}</p>`).join('')}
              ${(doc.sections || []).map((s) => `
                <h3 class="doc-h3">${ui.esc(s.heading)}</h3>
                ${(s.rows || []).map((r) => `<div class="doc-row"><b>${ui.esc(r[0])}</b>：${ui.esc(r[1])}</div>`).join('')}
                ${(s.bullets || []).map((b) => `<div class="doc-row">· ${ui.esc(b)}</div>`).join('')}
                ${(s.paragraphs || []).map((p) => `<p>${ui.esc(p)}</p>`).join('')}`).join('')}
              <div class="doc-foot">${ui.esc(doc.footer || '')}</div>
            </div>
            <div class="row gap8 mt12">
              <button class="btn btn-primary grow" id="doc-copy">复制文案</button>
              <button class="btn grow" id="doc-print">打印 / 存 PDF</button>
            </div>
            <div class="tiny dim mt8">复制后可直接粘贴到微信发给对方；打印时选「另存为 PDF」即可归档。</div>`,
            onMount(sheet) {
              sheet.querySelector('#doc-copy').addEventListener('click', async () => {
                const ok = await ui.copyText(doc.plain);
                ui.toast(ok ? '文案已复制' : '复制失败', ok ? 'ok' : 'err');
              });
              sheet.querySelector('#doc-print').addEventListener('click', () => printDoc(doc));
            },
          });
        };

        const openDoc = async (kind) => {
          const query = {};
          if (kind === 'invitation') {
            const to = await ui.promptDialog({ title: '生成邀请函', label: '收件单位 / 联系人', placeholder: '如 山东电力建设集团 李经理', okText: '下一步' });
            if (to === null || to === undefined) return;
            const date = await ui.promptDialog({ title: '洽谈时间', label: '时间（选填）', placeholder: '如 2026-11-01 14:00', okText: '下一步' });
            if (date === null || date === undefined) return;
            const place = await ui.promptDialog({ title: '洽谈地点', label: '地点（选填）', placeholder: '如 山东省东营市广饶县项目现场', okText: '下一步' });
            if (place === null || place === undefined) return;
            const agenda = await ui.promptDialog({ title: '洽谈议题', label: '议题（选填）', multiline: true, okText: '生成' });
            Object.assign(query, { to: to || '', date: date || '', place: place || '', agenda: agenda || '' });
          }
          ui.showLoading('生成中…');
          try {
            const res = await service.document(listing.id, kind, query);
            ui.hideLoading();
            showDocSheet(res.doc);
          } catch (err) {
            ui.hideLoading();
            ui.toast(err.message, 'err');
          }
        };

        openQualificationForm = () => {
          const reqs = (proj.qualifications || []);
          const mine = qual?.mine;
          const rows = reqs.length ? reqs : [{ name: '', level: '', required: true }];
          const levels = ctx.state.taxonomy?.qualificationLevels || ['不要求'];
          ui.openSheet({
            title: '上传企业资质',
            content: `<div class="tiny dim mb12">按发布方的要求逐项填写并上传证书扫描件。提交后 AI 会先核对一遍，再由发布方确认。</div>
              ${rows.map((q, i) => `<div class="qual-upload-row" data-i="${i}">
                <div class="row between mb4">
                  <span class="small strong">${ui.esc(q.name || '自定义资质')}</span>
                  ${q.required ? '<span class="badge danger">必需</span>' : '<span class="badge gray">加分</span>'}
                </div>
                <input class="input" data-q-name value="${ui.esc(q.name || '')}" placeholder="资质名称" ${q.name ? 'readonly' : ''}>
                <div class="row gap8 mt4">
                  <select class="select" data-q-level>${levels.map((l) => `<option ${q.level === l ? 'selected' : ''}>${ui.esc(l)}</option>`).join('')}</select>
                  <input class="input" data-q-note placeholder="证书编号 / 备注（选填）">
                </div>
                <input type="file" class="input mt4" data-q-file multiple>
              </div>`).join('')}
              <div class="field mt12"><label>补充说明（选填）</label><textarea class="input" id="q-note" rows="2" placeholder="如：某证书正在办理中"></textarea></div>
              <button class="btn btn-primary btn-block" id="q-submit">提交并送 AI 审核</button>`,
            onMount(sheet, close) {
              sheet.querySelector('#q-submit').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const rowEls = [...sheet.querySelectorAll('.qual-upload-row')];
                const items = [];
                const fileList = [];
                const itemIndexes = [];
                rowEls.forEach((row, i) => {
                  const name = row.querySelector('[data-q-name]').value.trim();
                  if (!name) return;
                  const idx = items.length;
                  items.push({
                    name,
                    level: row.querySelector('[data-q-level]').value,
                    note: row.querySelector('[data-q-note]').value.trim(),
                    fileIds: [],
                  });
                  for (const f of (row.querySelector('[data-q-file]').files || [])) {
                    fileList.push(f);
                    itemIndexes.push(idx);
                  }
                });
                if (!items.length) return ui.toast('请至少填写一项资质名称', 'err');

                btn.disabled = true;
                btn.textContent = '提交中…';
                try {
                  const fd = new FormData();
                  fd.append('items', JSON.stringify(items));
                  fd.append('itemIndexes', JSON.stringify(itemIndexes));
                  fd.append('note', sheet.querySelector('#q-note').value.trim());
                  for (const f of fileList) fd.append('file', f, f.name);
                  const res = await service.submitListingQualification(listing.id, fd);
                  close();
                  const rev = res.aiReview || {};
                  ui.toast(rev.pass ? `AI 初审通过（${rev.score} 分），等待发布方确认` : `已提交，AI 初审发现 ${(rev.missing || []).length} 项缺项`, rev.pass ? 'ok' : '');
                  reload();
                } catch (err) {
                  btn.disabled = false;
                  btn.textContent = '提交并送 AI 审核';
                  ui.toast(err.message, 'err');
                }
              });
            },
          });
          void mine;
        };

        const decideQual = async (userId, agree) => {
          let note = '';
          if (!agree) {
            note = await ui.promptDialog({ title: '驳回资质', label: '说明原因（会通知对方）', multiline: true, okText: '确认驳回' });
            if (note === null || note === undefined) return;
          } else {
            const ok = await ui.confirmDialog({ title: '确认资质通过？', message: '通过后对方可进入下一环节。', okText: '确认通过' });
            if (!ok) return;
          }
          try {
            await service.reviewListingQualification(listing.id, { userId, agree, note: note || '' });
            ui.toast(agree ? '已确认通过' : '已驳回', 'ok');
            reload();
          } catch (err) {
            ui.toast(err.message, 'err');
          }
        };

        root.querySelector('#btn-stage-advance')?.addEventListener('click', async () => {
          const ok = await ui.confirmDialog({
            title: `完成「${currentStage.name}」`,
            message: '确认后项目将进入下一环节。',
            okText: '进入下一步',
          });
          if (!ok) return;
          ui.showLoading('推进中…');
          try {
            const fd = api.form({ stage: 'next', note: '' });
            await service.advancePipeline(listing.id, fd);
            ui.hideLoading();
            ui.toast('已进入下一环节', 'ok');
            reload();
          } catch (err) {
            ui.hideLoading();
            ui.toast(err.message, 'err');
          }
        });

        root.querySelector('#btn-stage-share')?.addEventListener('click', () => root.querySelector('#btn-share')?.click());
        root.querySelector('#btn-stage-chat')?.addEventListener('click', () => root.querySelector('#btn-chat')?.click());
        root.querySelector('#btn-stage-meeting')?.addEventListener('click', () => root.querySelector('#btn-meeting')?.click());
        root.querySelector('#btn-stage-upload')?.addEventListener('click', () => root.querySelector('#btn-share')?.scrollIntoView({ block: 'center' }));

        root.querySelector('#btn-qual-submit')?.addEventListener('click', () => {
          if (!ctx.requireLogin()) return;
          openQualificationForm();
        });
        root.querySelectorAll('[data-qual-approve]').forEach((b) => {
          b.addEventListener('click', () => decideQual(b.dataset.qualApprove, true));
        });
        root.querySelectorAll('[data-qual-reject]').forEach((b) => {
          b.addEventListener('click', () => decideQual(b.dataset.qualReject, false));
        });
        for (const kind of ['invitation', 'brokerage', 'contract']) {
          root.querySelector(`#btn-doc-${kind}`)?.addEventListener('click', () => openDoc(kind));
        }
      }

      /* 留言 */
      let replyTo = '';
      root.querySelector('#comment-list')?.addEventListener('click', async (e) => {
        const replyEl = e.target.closest('[data-reply]');
        if (replyEl) {
          replyTo = replyEl.dataset.reply;
          const input = root.querySelector('#comment-input');
          input.focus();
          input.placeholder = `回复 ${replyEl.dataset.name}：`;
          return;
        }
        const delEl = e.target.closest('[data-del]');
        if (delEl) {
          const ok = await ui.confirmDialog({ title: '删除留言', message: '删除后无法恢复。', danger: true });
          if (!ok) return;
          try {
            await service.deleteComment(delEl.dataset.del);
            ui.toast('已删除', 'ok');
            ctx.nav(`#/detail/${listing.id}`);
          } catch (err) {
            ui.toast(err.message, 'err');
          }
        }
      });

      root.querySelector('#comment-submit')?.addEventListener('click', async () => {
        if (!ctx.requireLogin()) return;
        const input = root.querySelector('#comment-input');
        const content = input.value.trim();
        if (!content) return ui.toast('请先输入留言内容', 'err');
        const aiReply = root.querySelector('#comment-ai').checked;
        const btn = root.querySelector('#comment-submit');
        btn.disabled = true;
        btn.textContent = '发送中…';
        try {
          const fd = new FormData();
          fd.append('content', content);
          fd.append('parentId', replyTo);
          fd.append('aiReply', aiReply ? '1' : '0');
          const res = await service.addComment(listing.id, fd);
          input.value = '';
          replyTo = '';
          input.placeholder = '想问点什么？例如：对承接方有什么资质要求？';
          const list = root.querySelector('#comment-list');
          if (list.querySelector('.empty')) list.innerHTML = '';
          list.insertAdjacentHTML('beforeend', commentHtml({ ...res.comment, mine: true }, {}) );
          if (res.aiComment) {
            setTimeout(() => {
              list.insertAdjacentHTML('beforeend', commentHtml({ ...res.aiComment, mine: false, replies: [] }));
              root.querySelector('#comment-list').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 400);
          }
          ui.toast(aiReply ? '已发表，AI 助理正在回复…' : '已发表', 'ok');
        } catch (err) {
          ui.toast(err.message, 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = '发表留言';
        }
      });

      /* 微信内自动配置分享 */
      try { setupWechatShare(listing); } catch { /* ignore */ }
    },
  };
}

/* ================================================================== */
/* 项目案例                                                            */
/* ================================================================== */
export async function renderCases(ctx, query) {
  const cases = await service.cases().catch(() => []);
  const cat = query.category || '';
  const list = cat ? cases.filter((c) => c.category === cat) : cases;

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="strong mb8">🏆 真实成交案例（已脱敏）</div>
      <div class="small muted">以下案例来自平台在新能源、算力、机器人、无人机、房产、制造业等领域的真实对接，展示了从发布到签约的完整链路。</div>
    </div>
    <div class="chips scroll mt12 mb12">
      <a class="chip ${!cat ? 'active' : ''}" href="#/cases">全部</a>
      <a class="chip ${cat === 'project' ? 'active' : ''}" href="#/cases?category=project">项目</a>
      <a class="chip ${cat === 'event' ? 'active' : ''}" href="#/cases?category=event">活动</a>
      <a class="chip ${cat === 'trade' ? 'active' : ''}" href="#/cases?category=trade">贸易</a>
    </div>
    <div class="list-grid">
      ${list.map((c) => `<div class="card card-pad">
        <div class="row gap6 mb8" style="flex-wrap:wrap">
          <span class="badge">${ui.esc(categoryName(c.category))}</span>
          <span class="badge gray">${ui.esc(c.industry || '')}</span>
          <span class="badge gray">📍${ui.esc(c.city || '')}</span>
          ${c.amount ? `<span class="badge accent">${ui.esc(c.amount)}</span>` : ''}
        </div>
        <div class="strong" style="font-size:16px">${ui.esc(c.title)}</div>
        <div class="small muted mt8">${ui.esc(c.subtitle || '')}</div>
        <div class="card card-pad mt12" style="background:var(--brand-050);border:none">
          <div class="tiny" style="color:var(--brand-600)">💡 ${ui.esc(c.highlight || '')}</div>
        </div>
        <div class="small muted mt8">🔗 成交路径：${ui.esc(c.result || '')}</div>
        <div class="chips mt8">${(c.tags || []).map((t) => `<span class="chip soft">${ui.esc(t)}</span>`).join('')}</div>
      </div>`).join('') || ui.emptyState('🏆', '暂无案例')}
    </div>
  </div>`;

  return { title: '项目案例', content: html, showBack: true, noTab: false };
}

/* ================================================================== */
/* 用户主页                                                            */
/* ================================================================== */
export async function renderUser(ctx, params) {
  const { user } = await service.user(params.id);
  const isSelf = ctx.state.user?.id === user.id;

  const html = `<div class="page">
    <div class="card card-pad">
      <div class="row gap12">
        ${ui.avatarHtml(user, 'lg')}
        <div class="grow">
          <div class="strong" style="font-size:17px">${ui.esc(user.nickname)} ${user.verified ? '<span class="badge ok">已认证</span>' : ''}</div>
          <div class="small muted">${ui.esc([user.company, user.profession].filter(Boolean).join(' · ') || '未填写')}</div>
          <div class="row gap6 mt8" style="flex-wrap:wrap">
            ${user.industry ? `<span class="badge gray">${ui.esc(user.industry)}</span>` : ''}
            ${user.city ? `<span class="badge gray">📍${ui.esc(user.city)}</span>` : ''}
            <span class="badge">${user.followers || 0} 粉丝</span>
          </div>
        </div>
      </div>
      ${user.bio ? `<div class="small muted mt12">${ui.esc(user.bio)}</div>` : ''}
      ${user.contact ? `<div class="small mt8" style="color:var(--text-2)">
        ${user.contact.phone ? `<div>📞 ${ui.esc(user.contact.phone)}</div>` : ''}
        ${user.contact.wechat ? `<div>💬 微信 ${ui.esc(user.contact.wechat)}</div>` : ''}
        ${user.contact.email ? `<div>✉️ ${ui.esc(user.contact.email)}</div>` : ''}
      </div>` : ''}
      <div class="row gap8 mt12">
        ${!isSelf ? `<button class="btn btn-primary grow" id="btn-follow-user">${user.following ? '已关注' : '关注'}</button>` : ''}
        ${!isSelf ? `<button class="btn grow" id="btn-message">发消息</button>` : `<button class="btn btn-primary grow" onclick="location.hash='#/profile'">编辑资料</button>`}
      </div>
    </div>

    ${(user.cards || []).length ? `<div class="card card-pad mt12">
      <div class="strong mb8">💼 名片与企业介绍</div>
      <div class="row wrap gap8">${(user.cards || []).map((c) => `<a href="${ui.esc(ui.safeUrl(c.url))}" target="_blank" rel="noopener" class="small">${ui.esc(c.name)}</a>`).join('')}</div>
    </div>` : ''}

    ${(user.companyDeck || []).length ? `<div class="card card-pad mt12">
      <div class="strong mb8">📊 企业介绍资料</div>
      ${(user.companyDeck || []).map((d) => `<a href="${ui.esc(ui.safeUrl(d.url))}" target="_blank" rel="noopener" class="file-card mb8">
        <div class="fico">${ui.KIND_ICON[d.kind] || '📎'}</div>
        <div class="grow"><div class="fname ellipsis">${ui.esc(d.name)}</div><div class="fmeta">${ui.esc(ui.KIND_LABEL[d.kind] || '')}</div></div>
      </a>`).join('')}
    </div>` : ''}

    ${user.qualification ? `<div class="card card-pad mt12">
      <div class="strong mb8">🛡️ 企业资质认证</div>
      <div class="small muted">
        <div>企业名称：${ui.esc(user.qualification.companyName || '—')}</div>
        <div>状态：<span class="badge ${user.qualification.status === 'approved' ? 'ok' : user.qualification.status === 'rejected' ? 'danger' : 'warn'}">${user.qualification.status === 'approved' ? '已认证' : user.qualification.status === 'rejected' ? '未通过' : '审核中'}</span></div>
        ${(user.qualification.types || []).length ? `<div class="mt8">${user.qualification.types.map((t) => `<span class="chip soft">${ui.esc(t)}</span>`).join('')}</div>` : ''}
      </div>
    </div>` : ''}

    <div class="section-head mt16"><h2>他的发布（${(user.listings || []).length}）</h2></div>
    <div class="card list-grid" style="overflow:hidden">
      ${(user.listings || []).length ? user.listings.map(itemHtml).join('') : ui.emptyState('📭', '还没有公开的信息')}
    </div>
  </div>`;

  return {
    title: user.nickname,
    content: html,
    showBack: true,
    noTab: false,
    activeTab: 'me',
    async mount(root) {
      root.querySelector('#btn-follow-user')?.addEventListener('click', async (e) => {
        if (!ctx.requireLogin()) return;
        const btn = e.currentTarget;
        const on = btn.textContent.includes('已关注');
        try {
          if (on) await service.unfollow('user', user.id);
          else await service.follow('user', user.id, { name: user.nickname });
          btn.textContent = on ? '关注' : '已关注';
          ui.toast(on ? '已取消关注' : '关注成功', 'ok');
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
      root.querySelector('#btn-message')?.addEventListener('click', async () => {
        if (!ctx.requireLogin()) return;
        try {
          const res = await service.createRoom({ type: 'direct', name: user.nickname, targetId: `direct:${[ctx.state.user.id, user.id].sort().join(':')}`, memberIds: [user.id] });
          ctx.nav(`#/chat/${res.room.id}`);
        } catch (err) {
          ui.toast(err.message, 'err');
        }
      });
    },
  };
}