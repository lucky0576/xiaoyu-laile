/**
 * OPC 商机专区
 * 路由：#/opc
 *
 * 定位：把平台真实项目，拆成 OPC/超级个体可接的服务包。
 * 注意：页面展示“可拆解方向”，不承诺项目方一定外包；接单前需项目方确认。
 */

import * as ui from './ui.js';
import { service } from './api.js';

const SERVICES = [
  { id: 'shortvideo', name: '短视频 / 短剧', desc: '脚本、拍摄、剪辑、账号代运营' },
  { id: 'ai', name: 'AI 工具 / Agent', desc: '知识库、自动化流程、数据看板' },
  { id: 'data', name: '数据标注 / 清洗', desc: '标注、结构化、行业数据库' },
  { id: 'research', name: '行业研究 / 招商材料', desc: '行业报告、招商 PPT、路演材料' },
  { id: 'design3d', name: 'BIM / 3D / 数字人', desc: '3D 展厅、数字人讲解、BIM 轻量化' },
  { id: 'pv', name: '光伏 / 储能测算', desc: '选址、收益测算、方案材料' },
  { id: 'bid', name: '投标服务包', desc: '标书排版、资料清单、投标咨询' },
];

const SERVICE_MAP = Object.fromEntries(SERVICES.map((s) => [s.id, s]));

function regionOf(x) {
  return x.region || x.project?.region || x.bidding?.region || (x.cities && (x.cities[0]?.name || x.cities[0])) || x.sourceName || '浙江';
}

function budgetsOf(x) {
  return x.project?.budget || x.bidding?.budget || x.budget || '';
}

function dateOf(x) {
  const v = x.publishedAt || x.createdAt || x.bidding?.publishAt || x.project?.publishAt || '';
  return String(v).slice(0, 10);
}

function directionsFor(x) {
  const t = `${x.title || ''} ${x.subtitle || ''} ${x.text || ''}`.slice(0, 1200);
  const out = new Set();
  if (/光伏|储能|风电|风电|水电|EPC|新能源|充电/.test(t)) {
    out.add('pv'); out.add('shortvideo'); out.add('design3d'); out.add('research');
  }
  if (/机器人|脑机|具身|人工智能|AI|数字人|科技/.test(t)) {
    out.add('shortvideo'); out.add('design3d'); out.add('research'); out.add('ai');
  }
  if (/工程|施工|市政|道路|桥梁|改造|装修|水利/.test(t)) {
    out.add('shortvideo'); out.add('design3d'); out.add('bid');
  }
  if (/活动|会议|论坛|赛事|发布会|展会/.test(t)) {
    out.add('shortvideo'); out.add('research');
  }
  if (/采购|设备|货物|供应|贸易|订单/.test(t)) {
    out.add('data'); out.add('bid'); out.add('research');
  }
  if (/招投标|招标|中标|采购公告|投标/.test(t)) {
    out.add('bid'); out.add('research');
  }
  if (!out.size) {
    out.add('shortvideo'); out.add('research');
  }
  return [...out];
}

function serviceChips(dirs) {
  return dirs.map((id) => `<span class="opc-svc-chip">${ui.esc(SERVICE_MAP[id]?.name || id)}</span>`).join('');
}

function cardHtml(x) {
  const dirs = directionsFor(x);
  const region = regionOf(x);
  const budget = budgetsOf(x);
  const date = dateOf(x);
  const contact = `#/contact-us?topic=consult&about=${encodeURIComponent('我想接单：' + (x.title || '平台项目'))}`;
  return `<div class="opc-opp">
    <div class="opc-opp-top">
      <span class="opc-opp-type">${ui.esc(x.category === 'bidding' ? '招投标' : '产业项目')}</span>
      <span class="opc-opp-region">${ui.esc(region)}</span>
      <span class="opc-opp-date">${ui.esc(date)}</span>
    </div>
    <a class="opc-opp-title" href="#/detail/${ui.esc(x.id)}">${ui.esc(x.title || '平台真实项目')}</a>
    <div class="opc-opp-meta">
      ${budget ? `<span>预算/限价：${ui.esc(budget)}</span>` : ''}
      <span>${ui.esc(x.sourceName || '小鱼来了')}</span>
    </div>
    <div class="opc-opp-svcs"><span class="opc-opp-label">可拆解方向</span>${serviceChips(dirs)}</div>
    <div class="opc-opp-foot">
      <a href="#/detail/${ui.esc(x.id)}">看项目详情 ›</a>
      <a class="opc-opp-take" href="${contact}">我能接这个服务 ›</a>
    </div>
  </div>`;
}

export async function renderOpc(ctx, query = {}) {
  const active = String(query.s || '');
  const [projectRes, biddingRes] = await Promise.all([
    service.listings({ category: 'project', pageSize: 10, sort: 'latest' }).catch(() => ({ items: [], total: 0 })),
    service.listings({ category: 'bidding', pageSize: 10, sort: 'latest' }).catch(() => ({ items: [], total: 0 })),
  ]);
  const all = [...(projectRes.items || []), ...(biddingRes.items || [])]
    .filter((x) => x && x.id)
    .sort((a, b) => String(dateOf(b)).localeCompare(String(dateOf(a))));
  const visible = (active ? all.filter((x) => directionsFor(x).includes(active)) : all).slice(0, 8);
  const totalProjects = projectRes.total || (projectRes.items || []).length;
  const totalBids = biddingRes.total || (biddingRes.items || []).length;

  const html = `<div class="page opc-page">
    <section class="opc-hero">
      <div class="opc-hero-badge">🧩 OPC 商机专区 · 真实项目拆解</div>
      <h1>把大项目，拆成超级个体能接的服务包</h1>
      <p>小鱼来了提供真实产业项目、招投标信息和项目方需求；OPC 社区提供 AI 时代的执行能力。先选服务方向，再看项目，最后对接项目方确认。</p>
      <div class="opc-hero-actions">
        <a class="opc-btn opc-btn-main" href="#/contact-us?topic=consult&about=OPC能力登记">登记 OPC 能力</a>
        <a class="opc-btn" href="#/publish?category=project">发布项目需求</a>
        <a class="opc-btn" href="/docs/OPC-cooperation-2026.pdf" download="小鱼来了-OPC社区合作方案.pdf">社区合作方案 PDF</a>
      </div>
      <div class="opc-stats">
        <div><b>${totalProjects}</b><span>个产业项目</span></div>
        <div><b>${totalBids}</b><span>条招投标</span></div>
        <div><b>${SERVICES.length}</b><span>类 OPC 服务包</span></div>
        <div><b>24</b><span>家真实企业</span></div>
      </div>
    </section>

    <section class="opc-section">
      <div class="opc-section-head">
        <div><div class="opc-eyebrow">01 / 先选方向</div><h2>你能接哪一类？</h2></div>
        <div class="opc-section-note">不收入驻费、不卖接单资格</div>
      </div>
      <div class="opc-services">
        ${SERVICES.map((s) => `<a class="opc-service ${active === s.id ? 'active' : ''}" href="#/opc?s=${s.id}">
          <div class="opc-service-name">${ui.esc(s.name)}</div>
          <div class="opc-service-desc">${ui.esc(s.desc)}</div>
          <div class="opc-service-cta">看匹配项目 ›</div>
        </a>`).join('')}
      </div>
    </section>

    <section class="opc-section">
      <div class="opc-section-head">
        <div><div class="opc-eyebrow">02 / 真实项目池</div><h2>${active ? `${ui.esc(SERVICE_MAP[active]?.name || '')}相关项目` : '最新项目'}</h2></div>
        <a class="opc-more" href="${active ? '#/opc' : '#/list/project'}">${active ? '看全部方向 ›' : '更多项目 ›'}</a>
      </div>
      <div class="opc-disclaimer">以下为平台真实项目/公告；“可拆解方向”是平台基于项目内容的建议，是否外包、由谁承接，以项目方确认和三方协议为准。</div>
      ${visible.length ? `<div class="opc-grid">${visible.map(cardHtml).join('')}</div>` : `<div class="opc-empty">这个方向暂时没有匹配项目。你可以先登记能力，有匹配项目时优先联系。<div class="mt10"><a class="opc-btn opc-btn-main" href="#/contact-us?topic=consult&about=OPC能力登记">登记 OPC 能力</a></div></div>`}
    </section>

    <section class="opc-section opc-how">
      <div><div class="opc-eyebrow">03 / 怎么接单</div><h2>三步走，不跳步</h2></div>
      <div class="opc-steps">
        <div><b>01</b><strong>登记能力</strong><span>服务方向、案例、报价区间、可交付周期</span></div>
        <div><b>02</b><strong>平台匹配</strong><span>项目方确认可拆包后，平台/社区推荐候选</span></div>
        <div><b>03</b><strong>签约交付</strong><span>范围、里程碑、验收、结算写进协议</span></div>
      </div>
      <div class="opc-how-note">平台不承诺订单、不承诺中标、不承诺融资；OPC 需以个体户/公司等合规主体签约、开票。</div>
    </section>

    <section class="opc-section opc-community">
      <div>
        <div class="opc-eyebrow">04 / 社区合作</div>
        <h2>社区有“人”，平台有“单”</h2>
        <p>面向 OPC 社区运营方：项目拆包、能力曝光、投融资活动、跨区域交付网络。首期建议选 AI 短剧 / 数字营销 / 产业数字化服务，30 天跑通 3 个付费案例。</p>
      </div>
      <div class="opc-community-actions">
        <a class="opc-btn opc-btn-main" href="#/contact-us?topic=consult&about=OPC社区合作">申请社区合作</a>
        <a class="opc-btn" href="/docs/OPC-cooperation-2026.pdf" download="小鱼来了-OPC社区合作方案.pdf">下载合作方案</a>
      </div>
    </section>
  </div>`;

  return {
    title: 'OPC 商机专区',
    content: html,
    activeTab: '',
    showBack: true,
    noTab: true,
  };
}

export default { renderOpc };
