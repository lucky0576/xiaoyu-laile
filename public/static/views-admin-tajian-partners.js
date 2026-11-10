/**
 * 后台：塔建集团合伙人申请 / 合作需求
 *
 * 数据来源同项目需求（category=project），按标题关键词筛选：
 *   申请合伙人｜…（合伙人页提交）
 *   寻求合作｜…塔建集团…（专题页报价/合作提交）
 */

import * as ui from './ui.js';
import { service } from './api.js';

export async function renderAdminTajianPartners(ctx) {
  if (!ctx.requireLogin || !ctx.requireLogin()) return { title: '合伙人申请', content: '', showBack: true };
  if (!ctx.state.user?.isAdmin) {
    return { title: '合伙人申请', content: ui.emptyState('🔒', '仅管理员可查看'), showBack: true };
  }

  let items = [];
  let error = '';
  try {
    const r = await service.adminListings({ status: 'all', pageSize: 80 });
    items = (r.items || []).filter((x) => /申请合伙人|塔建集团/.test(`${x.title || ''} ${x.company || ''}`));
  } catch (err) {
    error = err.message || '读取失败';
  }

  const row = (x) => `<a class="atp-row" href="#/detail/${ui.esc(x.id)}">
    <div class="atp-main">
      <div class="atp-t">${ui.esc(x.title || '')}</div>
      <div class="atp-m">${ui.esc([x.company, x.contactName, x.phone].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="atp-side">
      <span class="atp-time">${ui.esc(ui.fmtRelative ? ui.fmtRelative(x.createdAt) : '')}</span>
      <span class="atp-go">›</span>
    </div>
  </a>`;

  const html = `<div class="page atp-page">
    <div class="card card-pad mb12">
      <div class="strong">塔建集团 · 合伙人申请 / 合作需求</div>
      <div class="tiny dim mt4">来自合伙人计划页与专题页提交的需求，共 ${items.length} 条；点条目查看详情并联系。</div>
    </div>
    ${error ? ui.emptyState('⚠️', error) : ''}
    <div class="atp-list">
      ${items.length ? items.map(row).join('') : ui.emptyState('📭', '暂无合伙人申请')}
    </div>
  </div>`;

  return { title: '合伙人申请', content: html, showBack: true };
}

export default { renderAdminTajianPartners };
