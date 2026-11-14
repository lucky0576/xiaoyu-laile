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
  /* 其他地级市 */
  { id: '宁波市', name: '宁波市' },
  { id: '温州市', name: '温州市' },
  { id: '嘉兴市', name: '嘉兴市' },
  { id: '湖州市', name: '湖州市' },
  { id: '绍兴市', name: '绍兴市' },
  { id: '金华市', name: '金华市' },
  { id: '衢州市', name: '衢州市' },
  { id: '舟山市', name: '舟山市' },
  { id: '台州市', name: '台州市' },
  { id: '丽水市', name: '丽水市' },
];

const ZJ_REGIONS = new Set(REGIONS.map((r) => r.id).filter(Boolean));
/* 杭州区县单列，其他 10 个地级市单列，避免长横条里找不到 */
const HZ_REGION_IDS = new Set(['', '浙江省级', '上城区', '西湖区', '萧山区', '余杭区', '临平区', '富阳区', '桐庐县', '淳安县', '建德市']);
const HZ_REGIONS = REGIONS.filter((r) => HZ_REGION_IDS.has(r.id));
const CITY_REGIONS = REGIONS.filter((r) => r.id && !HZ_REGION_IDS.has(r.id));

/* 每个区县对应的公共资源交易官网（点击新窗口打开） */
const REGION_SITES = {
  '浙江省级': 'https://zfcg.czt.zj.gov.cn/site/category?parentId=600007&childrenCode=ZcyAnnouncement',
  上城区: 'https://www.hzscsxy.com:8443/#/JYlist',
  西湖区: 'https://www.zhaobide.com/Web/Partner_index?pid=a8b557ad-9cf8-4f67-bf3e-7cf5337c2166',
  萧山区: 'https://www.xiaoshan.gov.cn/col/col1229181634/',
  余杭区: 'https://www.yuhang.gov.cn/col/col1229374049/index.html',
  临平区: 'https://xehome.lpqfpt.cn/jy?transactionMethod=0',
  富阳区: 'https://www.fuyang.gov.cn/col/col1229429575/index.html',
  桐庐县: 'https://tlztb.tonglu.gov.cn:18090/#/home_infolist?id=1011312667018792960',
  淳安县: 'https://www.qdh.gov.cn/col/col1229356921/index.html',
  建德市: 'https://www.jiande.gov.cn/col/col1229418005/zbggygdbzlm175/index.html',
  宁波市: 'https://ygcg.nbcqjy.org/list?type=2&class=2&noticeType=21',
  温州市: 'https://ggzyjy-eweb.wenzhou.gov.cn/col/col1229696276/index.html',
  嘉兴市: 'https://jxszwsjb.jiaxing.gov.cn/col/col1229743506/index.html',
  湖州市: 'https://ggzyjy.huzhou.gov.cn/jydtx/gcjs/zbgg/index.html',
  绍兴市: 'https://ggb.sx.gov.cn/col/col1518854/index.html',
  金华市: 'https://ggzyjy.jinhua.gov.cn/',
  衢州市: 'https://ggzy.qz.gov.cn/col/col1229683626/index.html',
  舟山市: 'https://zsztb.zhoushan.gov.cn/col/col1229679798/index.html',
  台州市: 'https://ggzy.tzztb.zjtz.gov.cn/jyxx/trade_infor.html',
  丽水市: 'https://lssggzy.lishui.gov.cn/col/col1229661790/index.html',
};

function looksOld(x) {
  const text = `${x.bidding?.publishAt || ''} ${x.title || ''}`;
  const years = text.match(/20\d{2}/g) || [];
  const nowYear = new Date().getFullYear();
  return years.some((y) => Number(y) < nowYear - 1);
}

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
  { id: '装修', name: '装修' },
  { id: '货物采购', name: '货物采购' },
  { id: '服务采购', name: '服务采购' },
  { id: '信息服务', name: '信息服务' },
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
  /* 其他地级市：已接入 6 个，其余待接入 */
  { name: '温州市公共资源交易', region: '温州市', url: 'https://ggzyjy-eweb.wenzhou.gov.cn/col/col1229696276/index.html', status: '已接入' },
  { name: '嘉兴市公共资源交易', region: '嘉兴市', url: 'https://jxszwsjb.jiaxing.gov.cn/col/col1229743506/index.html', status: '已接入' },
  { name: '绍兴市公共资源交易', region: '绍兴市', url: 'https://ggb.sx.gov.cn/col/col1518854/index.html', status: '已接入' },
  { name: '衢州市公共资源交易', region: '衢州市', url: 'https://ggzy.qz.gov.cn/col/col1229683626/index.html', status: '已接入' },
  { name: '舟山市公共资源交易', region: '舟山市', url: 'https://zsztb.zhoushan.gov.cn/col/col1229679798/index.html', status: '已接入' },
  { name: '丽水市公共资源交易', region: '丽水市', url: 'https://lssggzy.lishui.gov.cn/col/col1229661790/index.html', status: '已接入' },
  { name: '宁波市阳光采购服务平台', region: '宁波市', url: 'https://ygcg.nbcqjy.org/list?type=2&class=2&noticeType=21', status: '已接入' },
  { name: '湖州市公共资源交易', region: '湖州市', url: 'https://ggzyjy.huzhou.gov.cn/jydtx/gcjs/zbgg/index.html', status: '已接入' },
  { name: '金华市公共资源交易', region: '金华市', url: 'https://ggzyjy.jinhua.gov.cn/', status: '待接入', note: '原域名返回 410，需新入口' },
  { name: '台州市公共资源交易', region: '台州市', url: 'https://ggzy.tzztb.zjtz.gov.cn/jyxx/trade_infor.html', status: '待接入', note: '境外服务器访问该子域超时；主站请手动查看' },
  { name: '浙江省公共资源交易服务平台', region: '浙江省级', url: 'https://ggzy.zj.gov.cn/', status: '待接入', note: '全省汇聚入口，反爬 405' },
];

function inferType(x) {
  const t = `${x.title || ''} ${x.subtitle || ''}`;
  if (/产权|出让|转让|出租|拍卖|土地|房产|资产处置/.test(t)) return '产权交易';
  // 装修类：优先于「工程建设」，避免被“改造/修缮/建设”吸走
  if (/装修|装饰|室内装修|外立面|翻新|修缮工程|改造装修/.test(t)) return '装修';
  // 信息服务类：系统/数据/软件/平台/网络/数字化服务
  if (/信息服务|信息化|数据服务|软件开发|软件采购|平台运营|平台服务|网络服务|系统集成|数字化服务|信息系统/.test(t)) return '信息服务';
  if (/工程|施工|监理|勘察|设计|改造|修缮|道路|水利|市政|绿化|建设|安装/.test(t)) return '工程建设';
  if (/采购|货物|设备|仪器|车辆|家具|食材|服装|物资|耗材/.test(t)) return '货物采购';
  if (/服务|物业|保洁|安保|运维|咨询|检测|评估|培训|活动|运营|维保/.test(t)) return '服务采购';
  return '其他';
}

function regionOf(x) {
  return x.bidding?.region || (x.cities && (x.cities[0]?.name || x.cities[0])) || x.sourceName || '';
}

function typeOf(x) {
  // 新增「装修 / 信息服务」后，旧数据里可能仍写着「工程建设 / 服务采购」；
  // 标题能明确判断时优先用标题，老公告也能自动归到新分类。
  const inferred = inferType(x);
  if (inferred === '装修' || inferred === '信息服务') return inferred;
  return x.bidding?.projectType || inferred;
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
  const date = b.publishAt || x.publishedAt || x.createdAt;
  const budget = b.budget || '';
  const deadline = b.bidDeadline || '';
  return `<a class="bz-card" href="#/detail/${ui.esc(x.id)}">
    <div class="bz-card-top">
      <span class="bz-tag">${ui.esc(type)}</span>
      ${region ? `<span class="bz-region">${ui.esc(region)}</span>` : ''}
      <span class="bz-date">${ui.esc(fmtShort(date))}</span>
      <span class="bz-card-share" role="button" tabindex="0" data-share-id="${ui.esc(x.id)}" title="分享这条公告到微信" aria-label="分享到微信"><span class="wx-ic" aria-hidden="true"><i></i><i></i><i></i></span>微信</span>
    </div>
    ${x.shortVideoUrl ? '<div class="bz-video-tag">🎬 新闻播报</div>' : ''}
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
  const order = ['工程建设', '装修', '货物采购', '服务采购', '信息服务', '产权交易', '其他'];
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
    (x) => x && x.category === 'bidding' && ZJ_REGIONS.has(regionOf(x)) && !looksOld(x),
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
  const lastTs = all
    .map((x) => Date.parse(x.bidding?.publishAt || x.publishedAt || x.createdAt || ''))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  const lastAt = lastTs ? new Date(lastTs).toISOString() : '';

  const html = `<div class="bz-page">
    <div class="bz-hero">
      <div class="bz-hero-badge">🏛 浙江招投标 · 专题</div>
      <h1 class="bz-hero-t">浙江招投标公告，按项目分类看</h1>
      <div class="bz-hero-subrow">
        <div class="bz-hero-d">覆盖杭州 7 个区县，以及宁波、温州、嘉兴、湖州、绍兴、金华、衢州、舟山、台州、丽水 10 个地级市；每周一、周四自动采集更新。</div>
        <button class="bz-share-btn bz-share-hero" id="bz-share-topic" type="button"><span class="wx-ic" aria-hidden="true"><i></i><i></i><i></i></span>微信分享专题</button>
      </div>
      <div class="bz-stats">
        <div class="bz-stat"><b>${all.length}</b><span>已收录公告</span></div>
        <div class="bz-stat"><b>${Object.keys(regionCounts).length}</b><span>覆盖区域</span></div>
        <div class="bz-stat"><b>${recent}</b><span>近 7 天更新</span></div>
        <div class="bz-stat"><b>2 次/周</b><span>更新频率</span></div>
      </div>
      <div class="bz-hero-foot">最近更新：${ui.esc(lastAt ? fmtFull(lastAt) : '待采集')} · 来源：浙江各区县公共资源交易平台（公开公告）</div>
    </div>

    <form class="bz-ai-search card" id="bz-ai-form">
      <div class="bz-ai-title">🤖 AI 搜索招投标</div>
      <div class="row gap8">
        <input class="input grow" id="bz-ai-q" maxlength="80" placeholder="例如：淳安 道路工程 预算 500 万以上 / 余杭 医院 采购">
        <button class="btn btn-primary" id="bz-ai-btn" type="submit" style="flex:none">AI 搜索</button>
      </div>
      <div class="tiny dim mt6" id="bz-ai-tip">用自然语言找公告；AI 不可用时自动退回关键词匹配</div>
    </form>

    <div class="bz-filter card">
      <div class="bz-filter-row"><span class="bz-label">区域</span>
        <div class="chips scroll">
          ${HZ_REGIONS.map((r) => `<a class="chip ${activeRegion === r.id ? 'active' : ''}" href="${queryLink(r.id, activeType)}">${r.name}${r.id && regionCounts[r.id] ? ` (${regionCounts[r.id]})` : ''}</a>`).join('')}
        </div>
      </div>
      <div class="bz-filter-row"><span class="bz-label">地市</span>
        <div class="chips scroll">
          ${CITY_REGIONS.map((r) => `<a class="chip ${activeRegion === r.id ? 'active' : ''}" href="${queryLink(r.id, activeType)}">${r.name}${regionCounts[r.id] ? ` (${regionCounts[r.id]})` : ''}</a>`).join('')}
        </div>
      </div>
      <div class="bz-filter-row"><span class="bz-label">项目类型</span>
        <div class="chips scroll">
          ${TYPES.map((t) => `<a class="chip ${activeType === t.id ? 'active' : ''}" href="${queryLink(activeRegion, t.id)}">${t.name}</a>`).join('')}
        </div>
      </div>
    </div>

    <div class="bz-region-sites">
      <span class="bz-region-sites-label">各地官网</span>
      ${REGIONS.filter((r) => r.id && REGION_SITES[r.id]).map((r) => `<a href="${REGION_SITES[r.id]}" target="_blank" rel="noopener">${r.name} ↗</a>`).join('')}
    </div>

    <div class="bz-result-head">
      <div class="strong">${activeRegion ? ui.esc(activeRegion) : '浙江全省'} · ${activeType ? ui.esc(activeType) : '按项目分类'}</div>
      <span class="tiny dim" id="bz-count">${items.length} 条</span>
    </div>
    <div id="bz-results">${groupHtml(items, activeType)}</div>

    <div class="bz-sources card">
      <div class="row between mb8">
        <div class="strong">📡 数据来源（${SOURCES.length} 个）</div>
        <span class="tiny dim">已接入 ${SOURCES.filter((x) => x.status === '已接入').length} 个 · 待接入 ${SOURCES.filter((x) => x.status === '待接入').length} 个 · 仅通知 ${SOURCES.filter((x) => x.status === '仅通知').length} 个</span>
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
    async mount(root) {
      const form = root.querySelector('#bz-ai-form');
      const input = root.querySelector('#bz-ai-q');
      const btn = root.querySelector('#bz-ai-btn');
      const tip = root.querySelector('#bz-ai-tip');
      const results = root.querySelector('#bz-results');
      const count = root.querySelector('#bz-count');

      // 微信/朋友圈分享：专题页和每条公告都走统一的「文字+链接 / 图片+文字」
      try {
        document.title = '浙江招投标 · 7 区县公告 | 小鱼来了';
        let meta = document.querySelector('meta[name="description"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'description';
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', '浙江 7 个区县公共资源交易公告，按项目分类，每周一/周四更新，支持 AI 搜索与分享。');
      } catch { /* ignore */ }

      const shareMod = await import('./share.js').catch(() => null);
      // 微信内浏览器：配置右上角原生分享卡片（未接公众号时静默跳过）
      shareMod?.setupWechatTopicShare?.({
        title: '浙江招投标 · 7 区县公告',
        desc: `已收录 ${all.length} 条公告，覆盖杭州 7 个区县，每周一/周四更新。`,
        url: location.href,
        image: '/static/logo@2x.png',
      }).catch(() => {});
      const byId = new Map(all.map((x) => [x.id, x]));
      const shareTopic = () => {
        shareMod?.openQuickShare({
          title: '浙江招投标 · 7 区县公告',
          desc: `已收录 ${all.length} 条公告，覆盖上城、西湖、余杭、富阳、桐庐、淳安、建德等区县；每周一/周四更新。`,
          url: location.href,
          image: '/static/logo@2x.png',
          tag: '浙江招投标',
        });
      };
      const shareItem = (x) => {
        if (!x) return;
        const b = x.bidding || {};
        const desc = [regionOf(x), typeOf(x), b.budget ? `预算 ${b.budget}` : '', b.bidDeadline ? `截止 ${b.bidDeadline}` : '']
          .filter(Boolean)
          .join(' · ');
        shareMod?.openQuickShare({
          title: `【浙江招投标】${x.title || '公告'}`,
          desc: desc || '浙江公共资源交易公告',
          url: `${location.origin}/#/detail/${x.id}`,
          image: x.coverUrl || '/static/logo@2x.png',
          tag: '招投标',
        });
      };
      root.querySelector('#bz-share-topic')?.addEventListener('click', (e) => {
        e.preventDefault();
        shareTopic();
      });
      root.addEventListener('click', (e) => {
        const el = e.target.closest('[data-share-id]');
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        shareItem(byId.get(String(el.dataset.shareId || '')));
      });

      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = String(input?.value || '').trim();
        if (!q) return;
        btn.disabled = true;
        btn.textContent = 'AI 搜索中…';
        tip.textContent = '正在检索全库招投标公告…';
        try {
          const r = await service.listingsAiSearch({ query: q, category: 'bidding' });
          let list = (r.items || []).filter(
            (x) => x && x.category === 'bidding' && ZJ_REGIONS.has(regionOf(x)) && !looksOld(x),
          );
          if (activeRegion) list = list.filter((x) => regionOf(x).includes(activeRegion));
          if (activeType) list = list.filter((x) => typeOf(x) === activeType);
          results.innerHTML = groupHtml(list, activeType);
          count.textContent = `${list.length} 条`;
          tip.textContent = `AI 搜索「${q}」：${list.length} 条` +
            (r.mode === 'ai' ? ' · AI 语义匹配' : ' · 关键词匹配（AI 暂不可用）');
        } catch (err) {
          tip.textContent = err.message || 'AI 搜索失败，请稍后再试';
        } finally {
          btn.disabled = false;
          btn.textContent = 'AI 搜索';
        }
      });
    },
  };
}
