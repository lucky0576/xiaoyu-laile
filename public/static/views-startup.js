/**
 * 创业服务聚合专区：#/startup
 *
 * 把「创业补贴 / 辅导 / 赛事」三个发布分类整合到一个页面：
 *   · 顶部三个分类说明与数量
 *   · 全部 / 补贴 / 辅导 / 赛事 切换
 *   · 关键词搜索
 *   · 最新内容聚合流
 *   · 三个分类的发布入口
 */

import * as ui from './ui.js';
import { service } from './api.js';

const CATS = [
  {
    id: 'subsidy',
    name: '创业补贴',
    icon: '💰',
    desc: '创业启动、场地、人才、研发补贴',
    color: '#B45309',
    bg: '#FFF4DB',
  },
  {
    id: 'coach',
    name: '创业辅导',
    icon: '🧑‍🏫',
    desc: '商业模式、融资、申报、市场辅导',
    color: '#0B74FF',
    bg: '#EAF2FF',
  },
  {
    id: 'contest',
    name: '创业赛事',
    icon: '🏆',
    desc: '创业大赛、创新赛、项目路演',
    color: '#7C3AED',
    bg: '#F4F0FF',
  },
];

const CAT_MAP = Object.fromEntries(CATS.map((c) => [c.id, c]));

function fmtDate(v) {
  if (!v) return '';
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return String(v).slice(0, 10);
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function cardHtml(x) {
  const cat = CAT_MAP[x.category] || CATS[0];
  const meta = [
    ...(x.cities || []).map((c) => c.name),
    ...(x.industries || []).map((i) => i.name),
  ].filter(Boolean);
  const summary = x.subtitle || x.summary || '';
  return `<a class="startup-card" href="#/detail/${ui.esc(x.id)}">
    <div class="startup-card-top">
      <span class="startup-badge" style="color:${cat.color};background:${cat.bg}">${cat.icon} ${cat.name}</span>
      <span class="startup-date">${ui.esc(fmtDate(x.createdAt || x.publishedAt))}</span>
    </div>
    <div class="startup-card-t">${ui.esc(x.title || '')}</div>
    ${summary ? `<div class="startup-card-d">${ui.esc(summary)}</div>` : ''}
    <div class="startup-card-meta">
      ${x.typeName ? `<span>${ui.esc(x.typeName)}</span>` : ''}
      ${meta.length ? `<span>${ui.esc(meta.slice(0, 2).join(' · '))}</span>` : ''}
      ${x.contactName ? `<span>${ui.esc(x.contactName)}</span>` : ''}
    </div>
  </a>`;
}

function queryLink(tab, q) {
  const parts = [];
  if (tab) parts.push(`tab=${encodeURIComponent(tab)}`);
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  return `#/startup${parts.length ? `?${parts.join('&')}` : ''}`;
}

export async function renderStartup(ctx, query = {}) {
  const activeTab = String(query.tab || '');
  const q = String(query.q || '').trim();

  const results = await Promise.all(
    CATS.map((c) =>
      service
        .listings({ category: c.id, pageSize: 50, sort: 'latest' })
        .catch(() => ({ items: [], total: 0 })),
    ),
  );

  const pools = {};
  const counts = {};
  CATS.forEach((c, i) => {
    pools[c.id] = results[i]?.items || [];
    counts[c.id] = results[i]?.total ?? pools[c.id].length;
  });

  let items = [];
  for (const c of CATS) {
    items.push(...pools[c.id].map((x) => ({ ...x, category: c.id })));
  }
  items.sort((a, b) => {
    const ta = Date.parse(a.createdAt || a.publishedAt || '') || 0;
    const tb = Date.parse(b.createdAt || b.publishedAt || '') || 0;
    return tb - ta;
  });

  if (activeTab) items = items.filter((x) => x.category === activeTab);
  if (q) {
    const k = q.toLowerCase();
    items = items.filter((x) =>
      `${x.title || ''} ${x.subtitle || ''} ${x.summary || ''} ${x.typeName || ''}`
        .toLowerCase()
        .includes(k),
    );
  }

  const total = Object.values(counts).reduce((n, x) => n + Number(x || 0), 0);

  const catTabs = [
    `<a class="startup-tab ${!activeTab ? 'active' : ''}" href="${queryLink('', q)}">全部 <i>${total}</i></a>`,
    ...CATS.map(
      (c) =>
        `<a class="startup-tab ${activeTab === c.id ? 'active' : ''}" href="${queryLink(c.id, q)}">${c.icon} ${c.name} <i>${counts[c.id] || 0}</i></a>`,
    ),
  ].join('');

  const statCards = CATS.map(
    (c) => `<a class="startup-stat" href="${queryLink(c.id, '')}">
      <span class="startup-stat-ico" style="background:${c.bg};color:${c.color}">${c.icon}</span>
      <span class="startup-stat-n">${counts[c.id] || 0}</span>
      <span class="startup-stat-name">${c.name}</span>
      <span class="startup-stat-d">${c.desc}</span>
    </a>`,
  ).join('');

  const listHtml = items.length
    ? `<div class="startup-list">${items.map(cardHtml).join('')}</div>`
    : `<div class="card card-pad startup-empty">
        <div class="startup-empty-ico">📮</div>
        <div class="strong">这个分类还没有内容</div>
        <div class="tiny dim mt6">发布第一条创业补贴 / 辅导 / 赛事信息，即可在这里展示</div>
        <div class="row gap8 mt12" style="justify-content:center;flex-wrap:wrap">
          ${CATS.map((c) => `<a class="btn btn-sm btn-primary" href="#/publish?category=${c.id}">＋ 发布${c.name}</a>`).join('')}
        </div>
      </div>`;

  const html = `<div class="page startup-page">
    <section class="startup-hero">
      <div class="startup-hero-badge">🚀 创业服务 · 专区</div>
      <h1 class="startup-hero-t">创业补贴 · 辅导 · 赛事，一站看全</h1>
      <div class="startup-hero-d">把能拿的钱、能找的人、能报的赛放在一起；发布后按分类归档，支持搜索与转发。</div>
      <div class="startup-hero-stats">
        <div><b>${total}</b><span>条内容</span></div>
        <div><b>${counts.subsidy || 0}</b><span>创业补贴</span></div>
        <div><b>${counts.coach || 0}</b><span>辅导</span></div>
        <div><b>${counts.contest || 0}</b><span>赛事</span></div>
      </div>
      <div class="startup-hero-actions">
        ${CATS.map((c) => `<a class="startup-pub" href="#/publish?category=${c.id}">＋ 发布${c.name}</a>`).join('')}
      </div>
    </section>

    <div class="startup-stats">${statCards}</div>

    <div class="startup-toolbar">
      <div class="startup-tabs">${catTabs}</div>
      <form class="startup-search" id="startup-search-form">
        <input class="input" id="startup-q" maxlength="60" placeholder="搜索补贴 / 辅导 / 赛事，如「场地补贴」" value="${ui.esc(q)}">
        <button class="btn btn-primary" type="submit">搜索</button>
        ${q ? `<a class="btn btn-sm" href="${queryLink(activeTab, '')}">清除</a>` : ''}
      </form>
    </div>

    ${listHtml}

    <div class="startup-guide">
      <div class="startup-guide-title">怎么用这个专区</div>
      <div class="startup-guide-list">
        <div><b>① 找钱</b><span>看「创业补贴」里的启动、场地、人才、研发补贴</span></div>
        <div><b>② 找人</b><span>看「辅导」里的商业模式、融资、申报、市场导师</span></div>
        <div><b>③ 找机会</b><span>看「赛事」里的创业大赛、创新赛、路演</span></div>
      </div>
    </div>
  </div>`;

  return {
    title: '创业服务专区',
    content: html,
    activeTab: '',
    showBack: true,
    noTab: true,
    mount(root) {
      root.querySelector('#startup-search-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = String(root.querySelector('#startup-q')?.value || '').trim();
        location.hash = queryLink(activeTab, v);
      });
    },
  };
}

export default { renderStartup };
