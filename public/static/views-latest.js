/**
 * 需求广场（#/latest）
 *
 * 三部分：
 *   1. 杭州「AI+X」官方场景需求对接 —— 政府征集的需求 + 能力方（仅「全部」页显示）
 *   2. 分类 Tab —— 项目 / 创业补贴 / 辅导 / 赛事 / 悬赏 / 活动 / 贸易 / 科技成果转化 / 招投标
 *   3. 该分类下的最新发布
 *
 * 分类数据从 /api/taxonomy 取，不在前端写死，避免后端加了分类这里漏掉。
 * 每个分类的数量用 pageSize=1 只取 total，不拉全量数据。
 *
 * 支持深链：#/latest?cat=trade
 */

import * as ui from './ui.js';
import { service } from './api.js';

const PAGE_SIZE = 40;
const PER_CAT = 20;

export async function renderLatest(ctx, query = {}) {
  /* ---------- ① 先拿分类定义 ---------- */
  const taxRes = await service.taxonomy().catch(() => null);
  const cats = (taxRes && taxRes.categories ? taxRes.categories : [])
    .filter((c) => c && c.id)
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon || '📌' }));

  /* ---------- ③ 取当前分类（先定下来，好决定要不要多拉一次） ---------- */
  const wanted = String(query.cat || '').trim();
  const activeCat = cats.some((c) => c.id === wanted) ? wanted : '';

  /* ---------- ④ 并行拉数据 ----------
   * 分类数量走 /api/listings/category-counts 一次拿完，
   * 不再为 9 个分类各发一次请求（原来要 13 个请求，现在 5 个）。 */
  const [countRes, allRes, hzMetaRes, hzNeedRes, catRes] = await Promise.all([
    service.listingsCategoryCounts().catch(() => null),
    activeCat
      ? Promise.resolve({ items: [], total: 0 })
      : service.listings({ pageSize: PAGE_SIZE, sort: 'latest' }).catch(() => ({ items: [], total: 0 })),
    activeCat ? Promise.resolve(null) : service.hangzhouMeta().catch(() => null),
    activeCat ? Promise.resolve({ items: [] }) : service.hangzhouNeeds().catch(() => ({ items: [] })),
    activeCat
      ? service
          .listings({ category: activeCat, pageSize: PAGE_SIZE, sort: 'latest' })
          .catch(() => ({ items: [], total: 0 }))
      : Promise.resolve({ items: [], total: 0 }),
  ]);

  const byCategory = (countRes && countRes.byCategory) || {};
  const grandTotal = (countRes && countRes.total) || 0;

  const allItems = allRes.items || [];
  const allTotal = allRes.total || allItems.length;

  /** 每个分类：{ items, total } —— items 只有当前分类才拉 */
  const pool = {};
  cats.forEach((c) => {
    pool[c.id] = {
      items: activeCat === c.id ? catRes.items || [] : [],
      total: byCategory[c.id] || 0,
    };
  });

  const hzMeta = hzMetaRes || { stats: {}, contact: { phones: [] } };
  const hzStats = hzMeta.stats || {};
  const hzNeeds = (hzNeedRes.items || []).slice(0, 3);
  const phones = (hzMeta.contact && hzMeta.contact.phones) || [];

  /* ---------- ⑤ 分类 Tab ---------- */
  /* 0 条的分类仍然显示（告诉用户可以往这里发），但弱化处理 */
  const catTab = (id, name, icon, count, active) =>
    `<a class="lt-cat-tab ${active ? 'active' : ''} ${!count && !active ? 'zero' : ''}" data-cat="${ui.esc(id)}">${
      icon ? `<span class="lt-cat-ico">${icon}</span>` : ''
    }${ui.esc(name)} <i>${count}</i></a>`;

  const catTabs = [
    catTab('', '全部', '', grandTotal || allTotal, !activeCat),
    ...cats.map((c) =>
      catTab(c.id, c.name, c.icon, (pool[c.id] && pool[c.id].total) || 0, activeCat === c.id),
    ),
  ].join('');

  /* ---------- ⑤ 列表 ---------- */
  const row = (x) => `<a class="lt-row" href="#/detail/${ui.esc(x.id)}">
    <span class="lt-cat">${ui.esc(x.categoryName || '信息')}</span>
    <span class="lt-title">${ui.esc(x.title || '')}</span>
    <span class="lt-time">${ui.esc(ui.fmtRelative ? ui.fmtRelative(x.publishedAt || x.createdAt) : '')}</span>
  </a>`;

  const activePool = activeCat ? pool[activeCat] || { items: [] } : { items: allItems };
  const shown = activePool.items || [];
  const shownTotal = activeCat ? activePool.total || shown.length : allTotal;
  const activeCatName = activeCat ? (cats.find((c) => c.id === activeCat) || {}).name || '' : '';

  /* ---------- ⑥ 杭州场景区块（只在「全部」显示） ---------- */
  const hzBlock =
    !activeCat && (hzStats.needs || hzNeeds.length)
      ? `
    <section class="lt-hz">
      <div class="lt-hz-head">
        <div>
          <div class="lt-hz-badge">🤖 杭州官方 · AI+X 场景对接</div>
          <div class="lt-hz-t">政府征集的场景需求，直接找技术能力方</div>
        </div>
        <a class="lt-hz-more" href="#/hangzhou">全部 ›</a>
      </div>

      <div class="lt-hz-stats">
        <div><b>${hzStats.needs || 0}</b><span>场景需求</span></div>
        <div><b>${hzStats.caps || 0}</b><span>能力企业</span></div>
        <div><b>${phones.length}</b><span>官方电话</span></div>
      </div>

      ${hzNeeds
        .map(
          (n) => `<a class="lt-hz-need" href="#/hangzhou">
            <div class="lt-hz-need-scene">${ui.esc(n.scene)}</div>
            <div class="lt-hz-need-org">${ui.esc(n.org)}</div>
            <div class="lt-hz-need-sum">${ui.esc(n.summary)}</div>
          </a>`,
        )
        .join('')}

      <div class="lt-hz-actions">
        <a class="lt-hz-btn" href="#/hangzhou">进入场景对接专区 ›</a>
        ${phones.length ? `<a class="lt-hz-phone" href="tel:${ui.esc(phones[0].replace(/[^\d]/g, ''))}">📞 ${ui.esc(phones[0])}</a>` : ''}
      </div>
    </section>`
      : '';

  const html = `<div class="page lt-page">
    <div class="lt-head">
      <div>
        <div class="lt-t">🔥 需求广场</div>
        <div class="lt-d">${
          activeCat
            ? `正在浏览「${ui.esc(activeCatName)}」分类`
            : '按分类浏览：项目 · 贸易 · 活动 · 科技 · 招投标 · 补贴…'
        }</div>
      </div>
      <span class="tiny dim">${activeCat ? shownTotal : grandTotal || allTotal} 条</span>
    </div>

    ${hzBlock}

    <div class="lt-cats" id="lt-cats">${catTabs}</div>

    <div class="lt-list">
      ${
        shown.length
          ? shown.map(row).join('')
          : ui.emptyState(
              '📭',
              activeCat ? `「${activeCatName}」还没有发布` : '还没有发布的信息',
              activeCat ? '换个分类看看，或去发布一条' : '',
            )
      }
    </div>

    ${
      shownTotal > shown.length
        ? `<div class="tiny dim center mt16">仅展示最近 ${shown.length} 条${
            activeCat ? `，该分类共 ${shownTotal} 条` : ''
          }</div>`
        : ''
    }
  </div>`;

  return {
    title: '需求广场',
    content: html,
    activeTab: 'home',
    showBack: true,
    async mount(root) {
      root.querySelector('#lt-cats')?.addEventListener('click', (e) => {
        const a = e.target.closest('[data-cat]');
        if (!a) return;
        const cat = a.dataset.cat || '';
        // 切换分类走路由，保证可前进/后退、可分享
        if (typeof location !== 'undefined') {
          location.hash = cat ? `#/latest?cat=${encodeURIComponent(cat)}` : '#/latest';
        }
      });
    },
  };
}

export default { renderLatest };
