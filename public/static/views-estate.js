/**
 * 地产（#/estate）
 *
 * 出售 / 转让 / 融资 三类地产信息聚合页。
 * 不新增分类：用关键词检索现有项目/贸易信息，再按标题/类型归类。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const KW = ['地产', '房产', '商业地产', '写字楼', '商业综合体', '公寓', '土地', '住宅', '商铺', '酒店物业', '物业', '园区', '综合体'];

const ESTATE = [
  '地产', '房产', '楼盘', '住宅', '写字楼', '商业', '综合体', '公寓', '别墅', '商铺', '土地',
  '酒店', '物业', '园区', '厂房', '仓库', '车位', '大厦', '广场', 'TOD', '商圈', 'mall',
];

const TABS = [
  { id: 'all', name: '全部' },
  { id: 'sale', name: '出售' },
  { id: 'transfer', name: '转让' },
  { id: 'financing', name: '融资' },
];

function classify(x) {
  const t = `${x.title || ''} ${x.subtitle || ''} ${x.typeName || ''}`;
  const tags = [];
  if (/融资|投资|资金|寻资|股权|募资/.test(t)) tags.push('financing');
  if (/转让/.test(t)) tags.push('transfer');
  if (/出售|拍卖|售卖|出让|挂牌/.test(t)) tags.push('sale');
  if (!tags.length) tags.push('sale');
  return tags;
}

function priceText(x) {
  const p = x.project?.investAmount || x.trade?.price || '';
  if (!p) return '';
  if (typeof p === 'number') return p >= 10000 ? `${(p / 10000).toFixed(p % 10000 ? 1 : 0)} 亿元` : `${p} 万元`;
  return String(p);
}

const TYPE_LABEL = {
  asset_sale: '出售',
  asset_transfer: '转让',
  asset_financing: '融资',
  transfer: '转让',
  sale: '出售',
  financing: '融资',
};

function cardHtml(x) {
  const city = (x.cities || [])[0];
  const typeName = TYPE_LABEL[x.typeName] || x.typeName || '';
  const meta = [city && (city.name || city), typeName].filter(Boolean).join(' · ');
  const price = priceText(x);
  return `<a class="es-card" href="#/detail/${ui.esc(x.id)}">
    <div class="es-card-t">${ui.esc(x.title || '')}</div>
    ${x.subtitle ? `<div class="es-card-d">${ui.esc(x.subtitle)}</div>` : ''}
    <div class="es-card-m">
      <span>${ui.esc(meta)}</span>
      ${price ? `<span class="es-price">${ui.esc(price)}</span>` : ''}
    </div>
  </a>`;
}

export async function renderEstate(ctx) {
  const results = await Promise.all(
    KW.map((q) =>
      service
        .listings({ q, pageSize: 8, sort: 'latest' })
        .then((r) => r.items || [])
        .catch(() => []),
    ),
  );
  const seen = new Set();
  const all = [];
  results.flat().forEach((x) => {
    if (!x || !x.id || seen.has(x.id)) return;
    const hay = `${x.title || ''} ${x.subtitle || ''}`;
    if (!ESTATE.some((k) => hay.includes(k))) return;
    seen.add(x.id);
    x.__tags = classify(x);
    all.push(x);
  });
  all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const items = all.slice(0, 40);

  const count = (id) => (id === 'all' ? items.length : items.filter((x) => x.__tags.includes(id)).length);

  const html = `<div class="page es-page">
    <div class="es-hero">
      <div class="es-badge">🏠 地产 · 出售 / 转让 / 融资</div>
      <div class="es-hero-t">地产项目<br>出售 · 转让 · 融资</div>
      <div class="es-hero-d">商业综合体 · 写字楼 · 酒店 · 园区 · 土地 · 住宅</div>
      <div class="es-stats">
        <div><b>${count('all')}</b><span>条地产信息</span></div>
        <div><b>${count('sale')}</b><span>出售</span></div>
        <div><b>${count('transfer')}</b><span>转让</span></div>
        <div><b>${count('financing')}</b><span>融资</span></div>
      </div>
      <div class="row gap8 mt14" style="flex-wrap:wrap">
        <a class="btn btn-primary" href="#/publish?category=project" style="flex:1;min-width:120px;text-align:center">发布地产项目</a>
        <a class="btn btn-outline" href="#/provider" style="flex:1;min-width:120px;text-align:center">找地产服务商</a>
      </div>
    </div>

    <div class="es-tabs" id="es-tabs">
      ${TABS.map((t, i) => `<button class="es-tab ${i === 0 ? 'active' : ''}" type="button" data-tab="${t.id}">${ui.esc(t.name)} <i>${count(t.id)}</i></button>`).join('')}
    </div>

    <div class="es-list" id="es-list">
      ${items.length ? items.map(cardHtml).join('') : ui.emptyState('🏠', '暂无地产项目，发布一条试试')}
    </div>

    <div class="es-note">
      <div class="strong mb6">说明</div>
      <div class="small muted" style="line-height:1.9">
        · 出售：整体出售 / 拍卖 / 出让的地产项目<br>
        · 转让：产权 / 股权 / 经营权转让<br>
        · 融资：地产项目融资、寻资金、股权合作
      </div>
    </div>
  </div>`;

  return {
    title: '地产 · 出售 / 转让 / 融资',
    content: html,
    activeTab: 'home',
    showBack: true,
    mount(root) {
      const list = root.querySelector('#es-list');
      const paint = (tab) => {
        const rows = tab === 'all' ? items : items.filter((x) => x.__tags.includes(tab));
        list.innerHTML = rows.length ? rows.map(cardHtml).join('') : ui.emptyState('🏠', '这个分类下暂时没有项目');
      };
      root.querySelector('#es-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tab]');
        if (!btn) return;
        root.querySelectorAll('.es-tab').forEach((b) => b.classList.toggle('active', b === btn));
        paint(btn.dataset.tab);
      });
    },
  };
}

export default { renderEstate };
