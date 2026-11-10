/**
 * 全部最新发布（#/latest）
 *
 * 首页「最新发布」的「更多」入口：跨分类（项目/贸易/活动/科技/招投标…）
 * 按发布时间倒序展示。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const PAGE_SIZE = 40;

export async function renderLatest(ctx) {
  let items = [];
  let total = 0;
  try {
    const r = await service.listings({ pageSize: PAGE_SIZE, sort: 'latest' });
    items = r.items || [];
    total = r.total || items.length;
  } catch {
    items = [];
  }

  const row = (x) => `<a class="lt-row" href="#/detail/${ui.esc(x.id)}">
    <span class="lt-cat">${ui.esc(x.categoryName || '信息')}</span>
    <span class="lt-title">${ui.esc(x.title || '')}</span>
    <span class="lt-time">${ui.esc(ui.fmtRelative ? ui.fmtRelative(x.publishedAt || x.createdAt) : '')}</span>
  </a>`;

  const html = `<div class="page lt-page">
    <div class="lt-head">
      <div>
        <div class="lt-t">🔥 最新发布</div>
        <div class="lt-d">项目 · 贸易 · 活动 · 科技 · 招投标，按发布时间倒序</div>
      </div>
      <span class="tiny dim">共 ${total} 条</span>
    </div>
    <div class="lt-list">
      ${items.length ? items.map(row).join('') : ui.emptyState('📭', '还没有发布的信息')}
    </div>
    ${total > items.length ? `<div class="tiny dim center mt16">仅展示最近 ${items.length} 条，更多请按分类浏览</div>` : ''}
  </div>`;

  return { title: '最新发布', content: html, activeTab: 'home', showBack: true };
}

export default { renderLatest };
