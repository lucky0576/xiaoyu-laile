/**
 * 出海 / 海外项目（#/overseas）
 *
 * 聚合平台内与「出海、海外、跨境、国际」相关的项目/贸易/活动信息。
 * 数据不用另建分类：用关键词检索现有信息，按时间排序去重。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const KEYWORDS = ['出海', '海外', '跨境', '国际市场', '东南亚', '中东', '一带一路', '海外仓'];

const QUICK = [
  { name: '海外项目', q: '海外' },
  { name: '出海服务', q: '出海' },
  { name: '跨境贸易', q: '跨境' },
  { name: '东南亚', q: '东南亚' },
  { name: '中东', q: '中东' },
  { name: '一带一路', q: '一带一路' },
  { name: '海外仓', q: '海外仓' },
];

function money(n) {
  if (!n) return '';
  return n >= 10000 ? `${(n / 10000).toFixed(n % 10000 ? 1 : 0)} 万` : String(n);
}

function cardHtml(x) {
  const city = (x.cities || [])[0];
  const ind = (x.industries || [])[0];
  const meta = [city && (city.name || city), ind && (ind.name || ind), x.typeName].filter(Boolean).join(' · ');
  const price = x.project?.investAmount || x.trade?.price || '';
  return `<a class="os-card" href="#/detail/${ui.esc(x.id)}">
    <div class="os-card-t">${ui.esc(x.title || '')}</div>
    ${x.subtitle ? `<div class="os-card-d">${ui.esc(x.subtitle)}</div>` : ''}
    <div class="os-card-m">
      <span>${ui.esc(meta)}</span>
      ${price ? `<span class="os-card-price">${ui.esc(String(money(price)))}${typeof price === 'string' ? '' : ' 万元'}</span>` : ''}
    </div>
  </a>`;
}

export async function renderOverseas(ctx) {
  const results = await Promise.all(
    KEYWORDS.map((q) =>
      service
        .listings({ q, pageSize: 8, sort: 'latest' })
        .then((r) => r.items || [])
        .catch(() => []),
    ),
  );
  const seen = new Set();
  const items = [];
  results.flat().forEach((x) => {
    if (!x || !x.id || seen.has(x.id)) return;
    seen.add(x.id);
    items.push(x);
  });
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const list = items.slice(0, 30);

  const html = `<div class="page os-page">
    <div class="os-hero">
      <div class="os-badge">🌏 出海 / 海外项目</div>
      <div class="os-hero-t">把中国产业能力<br>带到全球市场</div>
      <div class="os-hero-d">海外项目 · 跨境贸易 · 出海服务 · 海外仓 · 一带一路</div>
      <div class="os-hero-stats">
        <div><b>${list.length}</b><span>条出海相关信息</span></div>
        <div><b>${KEYWORDS.length}</b><span>个方向聚合</span></div>
      </div>
      <div class="row gap8 mt14" style="flex-wrap:wrap">
        <a class="btn btn-primary" href="#/publish?category=project">发布出海项目</a>
        <a class="btn btn-outline" href="#/list/project?q=海外">看全部海外项目</a>
        <a class="btn btn-outline" href="#/provider">成为出海服务商</a>
      </div>
    </div>

    <div class="chips scroll" style="margin:14px 0 10px">
      ${QUICK.map((k) => `<a class="chip" href="#/list/project?q=${encodeURIComponent(k.q)}">${ui.esc(k.name)}</a>`).join('')}
    </div>

    <div class="os-sec-head">
      <div class="os-sec-t">最新出海 / 海外信息</div>
      <a class="tiny" href="#/list/project?q=海外">更多 ›</a>
    </div>

    <div class="os-grid">
      ${list.length ? list.map(cardHtml).join('') : ui.emptyState('🌏', '暂无出海项目，发布一条试试')}
    </div>

    <div class="os-note">
      <div class="strong mb6">怎么用</div>
      <div class="small muted" style="line-height:1.9">
        · 项目方：发布海外 / 出海项目，平台按关键词归类，客户可直接搜到<br>
        · 服务商：成为服务商，接出海项目（EPC / 设备 / 认证 / 物流 / 海外仓 / 法律）<br>
        · 采购方：在「出海 / 海外」聚合页按方向筛选，直接联系发布方
      </div>
    </div>
  </div>`;

  return {
    title: '出海 / 海外项目',
    content: html,
    activeTab: 'home',
    showBack: true,
  };
}

export default { renderOverseas };
