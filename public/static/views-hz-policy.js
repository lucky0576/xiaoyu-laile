/**
 * 小鱼来了 — 杭州政策通
 *
 * 路由：#/hz-policy
 *
 * 三个标签页：
 *   政策补贴   杭州企业可申报的补贴项目（金额 + 申报条件）
 *   政府官网   8 个主管部门，一键直达官网与通知公告栏目
 *   最新通知   各主管部门官网发布的通知与政策文件，点击看原文
 *
 * 为什么要单独做这个模块：
 *   用户要的不是「又一份政策列表」，而是「我知道该去哪个部门找最新文件」。
 *   所以这个模块的核心是「官网直达 + 最新通知」，政策列表只作为补充。
 */

import { service, isLoggedIn, store } from './api.js';
import * as ui from './ui.js';

const CAT_ICON = {
  startup: '🚀',
  qualify: '🏅',
  subsidy: '💰',
  rent: '🏢',
  employ: '👥',
  talent: '🎓',
  tax: '📊',
  other: '📌',
};

const LEVEL_NAME = { city: '市级', province: '省级', national: '国家级' };

export async function renderHzPolicy(ctx, query = {}) {
  const [metaRes, polRes, notRes] = await Promise.all([
    service.hzPolicyMeta().catch(() => null),
    service.hzPolicyPolicies().catch(() => ({ items: [] })),
    service.hzPolicyNotices().catch(() => ({ items: [] })),
  ]);

  const meta = metaRes || { categories: [], tags: [], sources: {}, stats: {} };
  const policies = polRes.items || [];
  const notices = notRes.items || [];
  const cats = meta.categories || [];
  const stats = meta.stats || {};
  const portalCount = stats.portals || 8;

  let activeTab = ['notice', 'portal'].includes(query.tab) ? query.tab : 'policy';
  let activeCat = '';
  let keyword = '';

  const catChips = [
    `<a class="hp-chip active" data-cat="">全部 ${policies.length}</a>`,
    ...cats.map((c) => {
      const n = (stats.byCategory || {})[c.id] || 0;
      if (!n) return '';
      return `<a class="hp-chip" data-cat="${ui.esc(c.id)}">${c.icon || ''} ${ui.esc(c.name)} ${n}</a>`;
    }),
  ].join('');

  const html = `
  <div class="page hp-page">
    <div class="hp-hero">
      <div class="hp-hero-badge">🏛 杭州政策通</div>
      <h1 class="hp-hero-t">政策补贴 · 官网直达 · 最新通知</h1>
      <div class="hp-hero-d">
        收录杭州市企业可申报的 ${stats.policies || policies.length} 项政策补贴，
        直达 ${stats.portals || 8} 个主管部门官网，跟踪 ${stats.notices || notices.length} 条最新通知文件。
      </div>
      <div class="hp-hero-stats">
        <div><b>${stats.policies || policies.length}</b><span>政策补贴</span></div>
        <div><b>${stats.portals || 8}</b><span>政府官网</span></div>
        <div><b>${stats.notices || notices.length}</b><span>最新通知</span></div>
      </div>
    </div>

    <div class="hp-tabs">
      <a class="hp-tab ${activeTab === 'policy' ? 'active' : ''}" data-tab="policy">💰 政策补贴 <i>${policies.length}</i></a>
      <a class="hp-tab ${activeTab === 'portal' ? 'active' : ''}" data-tab="portal">🏛 政府官网 <i>${portalCount}</i></a>
      <a class="hp-tab ${activeTab === 'notice' ? 'active' : ''}" data-tab="notice">📢 最新通知 <i>${notices.length}</i></a>
    </div>

    <!-- 政策补贴 -->
    <div class="hp-panel ${activeTab === 'policy' ? '' : 'hide'}" id="hp-panel-policy">
      <input class="input hp-search" id="hp-q" placeholder="搜政策名称 / 部门 / 关键词" autocomplete="off">
      <div class="hp-chips" id="hp-cats">${catChips}</div>
      <div class="hp-count" id="hp-count"></div>
      <div id="hp-list" class="hp-list"></div>
    </div>

    <!-- 政府官网 -->
    <div class="hp-panel ${activeTab === 'portal' ? '' : 'hide'}" id="hp-panel-portal">
      <div class="hp-portal-head">点击卡片直达主管部门官网，<b>「通知公告」</b>按钮直接进栏目页</div>
      <div id="hp-portals" class="hp-portals"></div>
    </div>

    <!-- 最新通知 -->
    <div class="hp-panel ${activeTab === 'notice' ? '' : 'hide'}" id="hp-panel-notice">
      <div class="hp-notice-head">通知来自各主管部门官网公开栏目，点击标题查看原文</div>
      <div id="hp-notices" class="hp-notices"></div>
    </div>

    <div class="hp-foot">
      ${ui.esc(meta.sources?.disclaimer || '政策信息以主管部门当年正式通知为准。')}
    </div>
  </div>`;

  return {
    title: '杭州政策通',
    content: html,
    showBack: true,
    async mount(root) {
      /* 标签切换 */
      root.querySelector('.hp-tabs')?.addEventListener('click', (e) => {
        const a = e.target.closest('[data-tab]');
        if (!a) return;
        activeTab = a.dataset.tab;
        [...root.querySelectorAll('.hp-tab')].forEach((el) => el.classList.toggle('active', el === a));
        ['policy', 'portal', 'notice'].forEach((t) => {
          root.querySelector(`#hp-panel-${t}`)?.classList.toggle('hide', t !== activeTab);
        });
      });

      /* ---------- 政策补贴 ---------- */
      const listEl = root.querySelector('#hp-list');
      const countEl = root.querySelector('#hp-count');

      const renderPolicies = () => {
        const kw = keyword.trim().toLowerCase();
        const list = policies.filter((p) => {
          if (activeCat && p.category !== activeCat) return false;
          if (kw) {
            const hay = `${p.name} ${p.dept} ${p.amount}`.toLowerCase();
            if (!hay.includes(kw)) return false;
          }
          return true;
        });
        countEl.textContent = `共 ${list.length} 项政策补贴`;
        listEl.innerHTML = list.length
          ? list
              .map(
                (p) => `<div class="hp-card" data-id="${ui.esc(p.id)}">
                  <div class="hp-card-top">
                    <span class="hp-seq">${p.seq}</span>
                    <span class="hp-card-name">${ui.esc(p.name)}</span>
                    <span class="hp-more">详情 ›</span>
                  </div>
                  <div class="hp-card-dept">${CAT_ICON[p.category] || '📌'} ${ui.esc(p.categoryName || '')} · ${ui.esc(p.dept || '')}</div>
                  <div class="hp-card-amount">${ui.esc((p.amount || '').slice(0, 90))}${(p.amount || '').length > 90 ? '…' : ''}</div>
                </div>`,
              )
              .join('')
          : ui.emptyState('🔍', '没有匹配的政策', '换个关键词试试');
      };

      root.querySelector('#hp-cats')?.addEventListener('click', (e) => {
        const a = e.target.closest('[data-cat]');
        if (!a) return;
        activeCat = a.dataset.cat || '';
        [...root.querySelectorAll('#hp-cats .hp-chip')].forEach((el) => el.classList.toggle('active', el === a));
        renderPolicies();
      });

      root.querySelector('#hp-q')?.addEventListener(
        'input',
        ui.debounce((e) => {
          keyword = e.target.value || '';
          renderPolicies();
        }, 200),
      );

      listEl.addEventListener('click', async (e) => {
        const card = e.target.closest('.hp-card');
        if (!card) return;
        await openPolicyDetail(card.dataset.id);
      });

      renderPolicies();

      /* ---------- 政府官网 ---------- */
      const portalsEl = root.querySelector('#hp-portals');
      service
        .hzPolicyPortals()
        .then((r) => {
          const list = r.items || [];
          portalsEl.innerHTML = list
            .map(
              (p) => `<div class="hp-portal">
                <div class="hp-portal-top">
                  <span class="hp-portal-lv lv-${p.level}">${LEVEL_NAME[p.level] || ''}</span>
                  <span class="hp-portal-name">${ui.esc(p.name)}</span>
                </div>
                <div class="hp-portal-desc">${ui.esc(p.desc || '')}</div>
                <div class="hp-portal-tags">
                  ${(p.tags || []).slice(0, 5).map((t) => `<span class="hp-tag">${ui.esc(t)}</span>`).join('')}
                </div>
                <div class="hp-portal-actions">
                  <a class="hp-btn-outline" href="${ui.esc(p.url)}" target="_blank" rel="noopener">官网首页 ↗</a>
                  ${p.noticeUrl ? `<a class="hp-btn-solid" href="${ui.esc(p.noticeUrl)}" target="_blank" rel="noopener">通知公告 ↗</a>` : ''}
                </div>
              </div>`,
            )
            .join('');
        })
        .catch(() => {
          portalsEl.innerHTML = ui.emptyState('🏛', '官网列表加载失败', '请稍后重试');
        });

      /* ---------- 最新通知 ---------- */
      const noticesEl = root.querySelector('#hp-notices');
      noticesEl.innerHTML = notices.length
        ? notices
            .map(
              (n) => `<a class="hp-notice" href="${ui.esc(n.url)}" target="_blank" rel="noopener">
                <div class="hp-notice-top">
                  <span class="hp-notice-tag">${ui.esc(n.tag || '通知')}</span>
                  <span class="hp-notice-date">${ui.esc(n.date || '')}</span>
                </div>
                <div class="hp-notice-title">${ui.esc(n.title)}</div>
                <div class="hp-notice-dept">${ui.esc(n.dept || '')} · 点击查看原文 ↗</div>
              </a>`,
            )
            .join('')
        : ui.emptyState('📢', '暂无通知', '管理员可在后台导入最新通知');
    },
  };
}

/* ------------------------------------------------------------------ */
/* 政策详情                                                            */
/* ------------------------------------------------------------------ */
async function openPolicyDetail(id) {
  ui.showLoading('加载中…');
  let p = null;
  try {
    const r = await service.hzPolicyPolicy(id);
    p = r?.policy || null;
  } finally {
    ui.hideLoading();
  }
  if (!p) return ui.toast('政策不存在', 'err');

  const conds = (p.conditions || []).map((c) => `<li>${ui.esc(c)}</li>`).join('');

  ui.openSheet({
    title: '政策详情',
    className: 'sheet-lg',
    content: `
      <div class="hp-detail">
        <div class="hp-detail-name">${ui.esc(p.name)}</div>
        <div class="hp-detail-dept">${CAT_ICON[p.category] || '📌'} ${ui.esc(p.dept || '')}</div>

        <div class="hp-sec">
          <div class="hp-sec-t">💰 补贴内容</div>
          <div class="hp-pre">${ui.esc(p.amount || '')}</div>
        </div>

        <div class="hp-sec">
          <div class="hp-sec-t">📋 申报条件</div>
          ${conds ? `<ul class="hp-conds">${conds}</ul>` : '<div class="dim">暂无</div>'}
        </div>

        ${p.note ? `<div class="hp-sec"><div class="hp-sec-t">💡 提示</div><div class="hp-pre">${ui.esc(p.note)}</div></div>` : ''}

        <div class="hp-detail-foot">
          政策条件与金额以主管部门当年正式发布的通知为准。
        </div>
      </div>`,
  });
}

export default { renderHzPolicy };
