/**
 * 小鱼来了 — 政府基金动向页（#/funds）
 *
 * 数据来自 /api/funds/list（src/data/funds.js 是唯一数据源）。
 */

import * as ui from './ui.js';
import { service, isLoggedIn } from './api.js';
import { copyText } from './clipboard.js';

const REGION_COLOR = {
  上海: '#0b74ff',
  江苏: '#e07c1c',
  浙江: '#0e8f7a',
  全国: '#7c3aed',
  其他地区: '#7c3aed',
};

const REGION_ORDER = ['上海', '江苏', '浙江'];

function fundCard(f) {
  const color = REGION_COLOR[f.province] || REGION_COLOR['全国'];
  const where = f.city && f.city !== '市级' && f.city !== '省级' ? `${f.province} · ${f.city}` : f.province;
  return `<div class="fd-card">
    <div class="fd-head" style="border-left:4px solid ${color}">
      <div class="row between" style="align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="fd-where" style="color:${color}">${ui.esc(where)}</div>
          <div class="fd-name">${ui.esc(f.name)}</div>
        </div>
        <div class="fd-scale">${ui.esc(f.scale || '')}</div>
      </div>
      <div class="fd-meta">
        <span class="fd-tag">${ui.esc(f.status || '')}</span>
        <span class="fd-date">${ui.esc(f.date || '')}</span>
      </div>
    </div>
    <div class="fd-body">
      ${f.manager ? `<div class="fd-row"><span class="fd-k">管理 / 出资</span><span class="fd-v">${ui.esc(f.manager)}</span></div>` : ''}
      ${
        (f.focus || []).length
          ? `<div class="fd-row"><span class="fd-k">投向</span><span class="fd-v">${f.focus
              .map((x) => `<span class="fd-focus">${ui.esc(x)}</span>`)
              .join('')}</span></div>`
          : ''
      }
      ${f.note ? `<div class="fd-note">${ui.esc(f.note)}</div>` : ''}
    </div>
    <div class="fd-links">
      ${(f.links || [])
        .map(
          (l) =>
            `<a class="tp-link" href="${ui.esc(l.url)}" target="_blank" rel="noopener">${ui.esc(l.text)} ↗</a>`,
        )
        .join('')}
    </div>
  </div>`;
}

export async function renderFunds(ctx, query) {
  let payload = null;
  try {
    payload = await service.fundsList();
  } catch {
    payload = null;
  }

  if (!payload || !(payload.funds || []).length) {
    return {
      title: '政府基金动向',
      content: '<div class="page"><div class="empty">基金动向加载失败，请稍后重试</div></div>',
      showBack: true,
    };
  }

  const funds = payload.funds;
  /* 按地区分组，上海/江苏/浙江 在前，其余归「全国」 */
  const groups = new Map();
  for (const f of funds) {
    const key = REGION_ORDER.includes(f.province) ? f.province : '全国';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const otherKey = groups.has('全国') ? '全国' : groups.has('其他地区') ? '其他地区' : '';
  const orderedKeys = [...REGION_ORDER.filter((k) => groups.has(k)), ...(otherKey ? [otherKey] : [])];

  const totalCount = funds.length;

  const html = `<div class="page tp-page fd-page">
    <div class="tp-hero">
      <div class="tp-hero-t">💰 各地政府投资基金动向</div>
      <div class="tp-hero-d">新设、增资、投向与落地进展 · ${totalCount} 条 · 更新于 ${ui.esc(payload.updatedAt || '')}</div>
      <div class="row gap8 mt12" style="justify-content:center">
        <a class="btn btn-sm" href="#/contest">🏆 看创业大赛</a>
        <button class="btn btn-sm btn-primary" id="fd-share" type="button">🔗 分享这一页</button>
      </div>
    </div>

    ${orderedKeys
      .map(
        (k) => `<div class="fd-group">
          <div class="tp-sec-title">${ui.esc(k)}<span class="fd-count">${groups.get(k).length} 条</span></div>
          ${groups.get(k).map(fundCard).join('')}
        </div>`,
      )
      .join('')}

    <div class="tp-note">
      以上均为公开报道的信息，具体申报条件、返投比例与出资节奏以基金官方公告为准。
      政府引导基金通常要求「返投本地」，接洽前先确认落地要求。
    </div>

    <div class="tp-sec-title">四、想对接资金？</div>
    <div class="card card-pad">
      <div class="small muted" style="line-height:1.8">
        把你的项目、融资需求或货源发到平台上，<br>
        投资机构和产业方会主动来找你。
      </div>
      <div class="row gap8 mt12">
        <a class="btn btn-sm btn-primary grow" href="#/publish?category=project">发布项目 / 融资需求</a>
        <a class="btn btn-sm grow" href="#/list/project">看看别人的项目</a>
      </div>
    </div>

    <div class="center tiny dim mt16" style="padding-bottom:24px">
      小鱼来了 · 让每一条好项目，都被对的人看见
    </div>
  </div>`;

  return {
    title: '政府基金动向',
    content: html,
    showBack: true,
    activeTab: '',
    mount(root) {
      const url = `${location.origin}/#/funds`;
      root.querySelector('#fd-share')?.addEventListener('click', async () => {
        if (navigator.share) {
          try {
            await navigator.share({
              title: '各地政府投资基金动向',
              text: '江浙沪新设政府基金、规模与投向速查',
              url,
            });
            return;
          } catch (err) {
            if (err && err.name === 'AbortError') return;
          }
        }
        const r = await copyText(`各地政府投资基金动向\n${url}`);
        ui.toast(r === 'ok' ? '链接已复制' : '复制失败，请长按地址手动复制', r === 'ok' ? 'ok' : 'err');
      });
    },
  };
}

export default { renderFunds };
