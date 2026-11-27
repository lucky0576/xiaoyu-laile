/**
 * 需求广场（#/latest）
 *
 * 两部分：
 *   1. 杭州「AI+X」官方场景需求对接 —— 政府征集的需求 + 能力方，可直接匹配对接
 *   2. 平台最新发布 —— 跨分类（项目/贸易/活动/科技/招投标）按时间倒序
 *
 * 为什么把官方场景放最上面：
 *   它是**有官方背景、有明确对接电话**的需求，撮合成功率远高于普通帖子，
 *   放在最前面能给用户"这里真的能接到活"的第一印象。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const PAGE_SIZE = 40;

export async function renderLatest(ctx) {
  const [listRes, hzMetaRes, hzNeedRes] = await Promise.all([
    service.listings({ pageSize: PAGE_SIZE, sort: 'latest' }).catch(() => ({ items: [], total: 0 })),
    service.hangzhouMeta().catch(() => null),
    service.hangzhouNeeds().catch(() => ({ items: [] })),
  ]);

  const items = listRes.items || [];
  const total = listRes.total || items.length;

  const hzMeta = hzMetaRes || { stats: {}, contact: { phones: [] } };
  const hzStats = hzMeta.stats || {};
  const hzNeeds = (hzNeedRes.items || []).slice(0, 3);
  const phones = (hzMeta.contact && hzMeta.contact.phones) || [];

  const row = (x) => `<a class="lt-row" href="#/detail/${ui.esc(x.id)}">
    <span class="lt-cat">${ui.esc(x.categoryName || '信息')}</span>
    <span class="lt-title">${ui.esc(x.title || '')}</span>
    <span class="lt-time">${ui.esc(ui.fmtRelative ? ui.fmtRelative(x.publishedAt || x.createdAt) : '')}</span>
  </a>`;

  const hzBlock = `
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
    </section>`;

  const html = `<div class="page lt-page">
    <div class="lt-head">
      <div>
        <div class="lt-t">🔥 需求广场</div>
        <div class="lt-d">官方场景需求 + 平台最新发布（项目 · 贸易 · 活动 · 科技 · 招投标）</div>
      </div>
      <span class="tiny dim">共 ${total} 条</span>
    </div>

    ${hzBlock}

    <div class="lt-sec-head">最新发布 <span class="tiny dim">${total} 条</span></div>
    <div class="lt-list">
      ${items.length ? items.map(row).join('') : ui.emptyState('📭', '还没有发布的信息')}
    </div>
    ${total > items.length ? `<div class="tiny dim center mt16">仅展示最近 ${items.length} 条，更多请按分类浏览</div>` : ''}
  </div>`;

  return { title: '需求广场', content: html, activeTab: 'home', showBack: true };
}

export default { renderLatest };
