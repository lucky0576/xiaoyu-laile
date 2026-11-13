/**
 * 招投标专题页（#/bidding）
 *
 * 浙江区域聚合：按区域 / 项目类型筛选，按项目类型分组展示。
 * 数据由 scripts/zj-bidding-collect.py 每周两次采集（周一、周四）。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const REGIONS = [
  { id: '', name: '全部' },
  { id: '浙江省级', name: '浙江省级' },
  { id: '上城区', name: '上城区' },
  { id: '西湖区', name: '西湖区' },
  { id: '萧山区', name: '萧山区' },
  { id: '余杭区', name: '余杭区' },
  { id: '临平区', name: '临平区' },
  { id: '富阳区', name: '富阳区' },
  { id: '桐庐县', name: '桐庐县' },
  { id: '淳安县', name: '淳安县' },
  { id: '建德市', name: '建德市' },
];

const ZJ_REGIONS = new Set(REGIONS.map((r) => r.id).filter(Boolean));

function fmtShort(v) {
  if (!v) return '';
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  const m = String(v).match(/(\d{1,2})[-/.月](\d{1,2})/);
  return m ? `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : String(v).slice(0, 10);
}

function fmtFull(v) {
  if (!v) return '';
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return String(v).slice(0, 16);
}

const TYPES = [
  { id: '', name: '全部' },
  { id: '工程建设', name: '工程建设' },
  { id: '货物采购', name: '货物采购' },
  { id: '服务采购', name: '服务采购' },
  { id: '产权交易', name: '产权交易' },
  { id: '其他', name: '其他' },
];

const SOURCES = [
  { name: '浙江政府采购网', region: '浙江省级', url: 'https://zfcg.czt.zj.gov.cn/site/category?parentId=600007&childrenCode=ZcyAnnouncement', status: '待接入', note: 'JS 渲染，境外抓取超时' },
  { name: '上城区公共资源交易', region: '上城区', url: 'https://www.hzscsxy.com:8443/#/JYlist', status: '已接入' },
  { name: '西湖区公共资源交易（建易）', region: '西湖区', url: 'https://www.zhaobide.com/Web/Partner_index?pid=a8b557ad-9cf8-4f67-bf3e-7cf5337c2166', status: '已接入' },
  { name: '萧山区公共资源交易', region: '萧山区', url: 'https://www.xiaoshan.gov.cn/col/col1229181634/', status: '仅通知', note: '该栏目是通知公告，交易公告在另一平台' },
  { name: '余杭区公共资源交易', region: '余杭区', url: 'https://www.yuhang.gov.cn/col/col1229374049/index.html', status: '已接入' },
  { name: '临平区公共资源交易', region: '临平区', url: 'https://xehome.lpqfpt.cn/jy?transactionMethod=0', status: '待接入', note: '境外服务器不可达' },
  { name: '富阳区公共资源交易', region: '富阳区', url: 'https://www.fuyang.gov.cn/col/col1229429575/index.html', status: '已接入' },
  { name: '桐庐县公共资源交易', region: '桐庐县', url: 'https://tlztb.tonglu.gov.cn:18090/#/home_infolist?id=1011312667018792960', status: '已接入' },
  { name: '淳安县公共资源交易', region: '淳安县', url: 'https://www.qdh.gov.cn/col/col1229356921/index.html', status: '已接入' },
  { name: '建德市公共资源交易', region: '建德市', url: 'https://www.jiande.gov.cn/col/col1229418005/zbggygdbzlm175/index.html', status: '已接入' },
];

function inferType(x) {
  const t = `${x.title || ''} ${x.subtitle || ''}`;
  if (/产权|出让|转让|出租|拍卖|土地|房产|资产处置/.test(t)) return '产权交易';
  if (/工程|施工|监理|勘察|设计|改造|修缮|装修|道路|水利|市政|绿化|建设|安装/.test(t)) return '工程建设';
  if (/采购|货物|设备|仪器|车辆|家具|食材|服装|物资|耗材/.test(t)) return '货物采购';
  if (/服务|物业|保洁|安保|运维|咨询|检测|评估|培训|活动|运营|维保/.test(t)) return '服务采购';
  return '其他';
}

function regionOf(x) {
  return x.bidding?.region || (x.cities && (x.cities[0]?.name || x.cities[0])) || x.sourceName || '';
}

function typeOf(x) {
  return x.bidding?.projectType || inferType(x);
}

function fmtDate(v) {
  if (!v) return '';
  try {
    return ui.fmtDate ? ui.fmtDate(v) : String(v).slice(0, 10);
  } catch {
    return String(v).slice(0, 10);
  }
}

function cardHtml(x) {
  const b = x.bidding || {};
  const region = regionOf(x);
  const type = typeOf(x);
  const date = b.publishAt || x.publishedAt;
  const budget = b.budget || '';
  const deadline = b.bidDeadline || '';
  return `<a class="bz-card" href="#/detail/${ui.esc(x.id)}">
    <div class="bz-card-top">
      <span class="bz-tag">${ui.esc(type)}</span>
      ${region ? `<span class="bz-region">${ui.esc(region)}</span>` : ''}
      <span class="bz-date">${ui.esc(fmtShort(date))}</span>
    </div>
    <div class="bz-card-title">${ui.esc(x.title || '')}</div>
    <div class="bz-card-meta">
      ${budget ? `<span class="bz-budget">预算 ${ui.esc(budget)}</span>` : ''}
      ${deadline ? `<span>截止 ${ui.esc(deadline)}</span>` : ''}
      ${b.sourceSite || x.sourceName ? `<span class="dim">${ui.esc(b.sourceSite || x.sourceName)}</span>` : ''}
    </div>
  </a>`;
}

function groupHtml(items, activeType) {
  if (!items.length) return ui.emptyState('📭', '该筛选下暂无公告', '<div class="tiny dim mt8">每周一、周四自动更新；也可先看其他区域/类型</div>');
  if (activeType) return `<div class="bz-list">${items.map(cardHtml).join('')}</div>`;
  const groups = {};
  for (const x of items) {
    const t = typeOf(x);
    (groups[t] = groups[t] || []).push(x);
  }
  const order = ['工程建设', '货物采购', '服务采购', '产权交易', '其他'];
  return order
    .filter((t) => groups[t]?.length)
    .map(
      (t) => `<section class="bz-group">
        <div class="bz-group-head">
          <span class="bz-group-t">${ui.esc(t)}</span>
          <span class="bz-group-n">${groups[t].length} 条</span>
        </div>
        <div class="bz-list">${groups[t].map(cardHtml).join('')}</div>
      </section>`,
    )
    .join('');
}

function queryLink(region, type) {
  const q = [];
  if (region) q.push(`region=${encodeURIComponent(region)}`);
  if (type) q.push(`type=${encodeURIComponent(type)}`);
  return `#/bidding${q.length ? '?' + q.join('&') : ''}`;
}

export async function renderBidding(ctx, query = {}) {
  const res = await service.listings({ category: 'bidding', pageSize: 100, sort: 'latest' }).catch(() => ({ items: [] }));
  const all = (res.items || []).filter(
    (x) => x && x.category === 'bidding' && ZJ_REGIONS.has(regionOf(x)),
  );
  const activeRegion = String(query.region || '');
  const activeType = String(query.type || '');

  let items = all.slice();
  if (activeRegion) items = items.filter((x) => regionOf(x).includes(activeRegion));
  if (activeType) items = items.filter((x) => typeOf(x) === activeType);

  const regionCounts = {};
  for (const x of all) {
    const r = regionOf(x);
    if (r) regionCounts[r] = (regionCounts[r] || 0) + 1;
  }
  const weekAgo = Date.now() - 7 * 86400_000;
  const recent = all.filter((x) => {
    const t = Date.parse(x.createdAt || x.publishedAt || '');
    return Number.isFinite(t) && t >= weekAgo;
  }).length;
  const lastAt = all
    .map((x) => x.bidding?.publishAt || x.publishedAt || x.createdAt || '')
    .filter(Boolean)
    .sort()
    .slice(-1)[0];

  const html = `<div class="bz-page">
    <div class="bz-hero">
      <div class="bz-hero-badge">🏛 浙江招投标 · 专题</div>
      <h1 class="bz-hero-t">浙江招投标公告，按项目分类看</h1>
      <div class="bz-hero-d">覆盖杭州上城、西湖、余杭、富阳、桐庐、淳安、建德等区县；每周一、周四自动采集更新。</div>
      <div class="bz-stats">
        <div class="bz-stat"><b>${all.length}</b><span>已收录公告</span></div>
        <div class="bz-stat"><b>${Object.keys(regionCounts).length}</b><span>覆盖区域</span></div>
        <div class="bz-stat"><b>${recent}</b><span>近 7 天新增</span></div>
        <div class="bz-stat"><b>2 次/周</b><span>更新频率</span></div>
      </div>
      <div class="bz-hero-foot">最近更新：${ui.esc(lastAt ? fmtFull(lastAt) : '待采集')} · 来源：浙江各区县公共资源交易平台（公开公告）</div>
    </div>

    <div class="bz-filter card">
      <div class="bz-filter-row"><span class="bz-label">区域</span>
        <div class="chips scroll">
          ${REGIONS.map((r) => `<a class="chip ${activeRegion === r.id ? 'active' : ''}" href="${queryLink(r.id, activeType)}">${r.name}${r.id && regionCounts[r.id] ? ` (${regionCounts[r.id]})` : ''}</a>`).join('')}
        </div>
      </div>
      <div class="bz-filter-row"><span class="bz-label">项目类型</span>
        <div class="chips scroll">
          ${TYPES.map((t) => `<a class="chip ${activeType === t.id ? 'active' : ''}" href="${queryLink(activeRegion, t.id)}">${t.name}</a>`).join('')}
        </div>
      </div>
    </div>

    <div class="bz-result-head">
      <div class="strong">${activeRegion ? ui.esc(activeRegion) : '浙江全省'} · ${activeType ? ui.esc(activeType) : '按项目分类'}</div>
      <span class="tiny dim">${items.length} 条</span>
    </div>
    ${groupHtml(items, activeType)}

    <div class="bz-sources card">
      <div class="row between mb8">
        <div class="strong">📡 数据来源（10 个）</div>
        <span class="tiny dim">已接入 7 个 · 待接入 2 个 · 仅通知 1 个</span>
      </div>
      <div class="bz-source-grid">
        ${SOURCES.map((s) => `<a class="bz-source" href="${ui.esc(s.url)}" target="_blank" rel="noopener">
          <div class="bz-source-top"><span>${ui.esc(s.region)}</span><span class="bz-source-status ${s.status === '已接入' ? 'ok' : 'wait'}">${ui.esc(s.status)}</span></div>
          <div class="bz-source-name">${ui.esc(s.name)}</div>
          ${s.note ? `<div class="bz-source-note">${ui.esc(s.note)}</div>` : ''}
        </a>`).join('')}
      </div>
      <div class="tiny dim mt8">采集范围：公开招标公告/交易公告；不含登录区、个人数据；原文链接可回源核对。</div>
    </div>
  </div>`;

  return {
    title: '浙江招投标',
    content: html,
    activeTab: '',
    showBack: true,
    noTab: true,
  };
}
