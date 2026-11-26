/**
 * OPC 服务专区
 * 路由：#/opc
 *
 * 定位：把平台真实项目，拆成 OPC/超级个体可接的服务包。
 * 注意：页面展示“可拆解方向”，不承诺项目方一定外包；接单前需项目方确认。
 */

import * as ui from './ui.js';
import { service, isLoggedIn } from './api.js';
import { cardShareHtml } from './components.js';

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
    ${cardShareHtml(x)}
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

/* 流程与政策详情数据：只做信息摘要，具体以合作社区/主管部门正式文件为准 */
const STEP_DETAILS = {
  '项目初审': {
    desc: '评估项目合规性、商业模式与生态适配度，判断是否适合进入合作社区孵化。',
    conditions: ['有明确的主体或创业团队', '业务方向与人工智能、数字科技、AIGC、软件或科技创新相关', '项目资料真实、可核验'],
    materials: ['项目介绍 / BP', '营业执照或主体证明（如有）', '法人/联系人信息', '已有产品、客户或案例材料'],
    flow: ['提交项目资料', '社区初审', '反馈初审意见与入驻建议'],
    time: '以合作社区排期为准',
    output: '初审意见 / 入驻方案建议',
  },
  '挑选位置': {
    desc: '根据团队规模、预算和注册需求，选择工位、独立空间或注册地址方案。',
    conditions: ['已通过项目初审', '有办公、注册或迁址需求'],
    materials: ['场地需求说明', '团队人数与预算', '注册/迁址时间计划'],
    flow: ['看场', '选择工位/独立空间', '确认入驻方案'],
    time: '以合作社区排期为准',
    output: '场地与入驻方案',
  },
  '注册公司': {
    desc: '协助注册数字科技类市场主体，办理营业执照；具体名称、经营范围以登记机关核定为准。',
    conditions: ['已确定注册地址/工位方案', '股东、法人、注册资本已确认'],
    materials: ['公司名称备选', '经营范围', '股东/法人身份证明', '注册地址证明'],
    flow: ['名称核准', '提交注册材料', '领取营业执照'],
    time: '以市场监管部门办理时限为准',
    output: '营业执照',
  },
  '准备资料': {
    desc: '归集营业执照、法人资料、项目方案与入驻协议，形成完整入驻档案。',
    conditions: ['已完成公司注册或已有主体', '已确认入驻方案'],
    materials: ['营业执照', '法人/联系人资料', '项目方案', '入驻协议'],
    flow: ['资料清单核对', '补齐材料', '归档并提交社区'],
    time: '以社区资料审核为准',
    output: '完整入驻档案',
  },
  '入库科技局': {
    desc: '辅导整理材料，完成科技主管部门项目库登记，便于后续政策申报。',
    conditions: ['已完成注册并入驻', '项目符合科技型企业/项目库方向'],
    materials: ['企业基本信息', '项目/研发材料', '知识产权、研发投入等证明'],
    flow: ['材料辅导', '系统填报', '主管部门审核入库'],
    time: '以科技主管部门通知为准',
    output: '项目库登记',
  },
  '政策补贴': {
    desc: '匹配科创、人才、模型服务、智能体等政策，辅导申报并跟进扶持资金。',
    conditions: ['已完成入驻/入库（按具体政策）', '符合对应政策的申报条件'],
    materials: ['申报书', '合同/发票/付款凭证', '社保/人才/研发等证明', '验收/落地材料'],
    flow: ['政策匹配', '材料准备', '提交申报', '跟进评审与拨付'],
    time: '以各政策申报通知为准',
    output: '申报受理 / 扶持资金',
  },
  '订单撮合': {
    desc: '接入算力、政企项目池、海内外订单与合伙人体系，优先推荐匹配的 OPC。',
    conditions: ['已入驻/入库', '能力与项目需求匹配', '可按时交付'],
    materials: ['能力介绍', '案例/作品', '报价与交付周期'],
    flow: ['需求拆包', '能力匹配', '对接项目方', '签约交付'],
    time: '持续对接',
    output: '订单/需求对接',
  },
  '陪跑孵化': {
    desc: 'AI 培训、项目打磨、路演与投融资对接，持续赋能 OPC 成长。',
    conditions: ['已入驻合作社区', '有明确阶段目标'],
    materials: ['项目计划', '阶段目标', '融资/路演材料（如有）'],
    flow: ['制定陪跑计划', '培训/打磨', '路演/资本对接', '复盘迭代'],
    time: '按社区陪跑周期',
    output: '培训 / 路演 / 融资对接',
  },
};

const POLICY_DETAILS = {
  '工位补贴': {
    standard: '每个工位最高补贴 8000 元',
    conditions: ['企业需为 OPC 企业', '所属社区需进入社区创建名单', '通过所在 OPC 社区申请'],
    materials: ['营业执照', '入驻协议/工位合同', '工位费用付款凭证', '社区推荐/创建名单证明'],
    deadline: '以合作社区及主管部门申报通知为准',
    note: '补贴额度、名额和拨付方式以正式文件为准。',
  },
  '人才住房支持': {
    standard: '人才租房补贴 + 人才公寓',
    conditions: ['符合当地人才政策', '人才公寓需通过 OPC 社区推荐'],
    materials: ['人才认定/学历等证明', '社保或个税记录', '租赁合同', '社区推荐材料'],
    deadline: '以人才部门申报通知为准',
    note: '人才认定标准和补贴额度以当地政策为准。',
  },
  '人才公寓': {
    standard: '约 100 套人才公寓资源，约按市场租金 50% 提供',
    conditions: ['符合人才公寓申请条件', '所在创建名单 OPC 社区有推荐名额'],
    materials: ['人才证明', '劳动合同/社保', '无房证明（如需）', '社区推荐材料'],
    deadline: '以公寓运营方/主管部门通知为准',
    note: '每个创建名单 OPC 社区 3 个人才推荐名额；房源以实际为准。',
  },
  '模型服务采购补贴': {
    standard: '按采购金额 60% 补贴，企业年度最高 100 万元',
    conditions: ['企业需建设 OPC 入库', '采购服务需来自人工智能产业创新生态伙伴', '需提供合同或付款凭证'],
    materials: ['采购合同', '发票/付款凭证', '模型服务清单', '入库/生态伙伴证明'],
    deadline: '分批申报，以主管部门通知为准',
    note: '补贴比例和上限以正式申报指南为准。',
  },
  '模型服务额度支持': {
    standard: '最高 100 万元/企业，分阶段释放',
    conditions: ['企业需接受阶段性核查', '核查内容包括模型使用情况、业务进展等'],
    materials: ['模型使用记录', '业务进展材料', '阶段验收材料', '企业主体资料'],
    deadline: '按阶段申请，以主管部门通知为准',
    note: '额度不是现金补贴，具体使用方式以政策文件为准。',
  },
  '智能体采购补贴': {
    standard: '按采购价格 35% 补贴，单家最高 300 万元',
    conditions: ['用于研发、测试、部署运营、商业化推广', '不支持转售型采购'],
    materials: ['采购合同', '发票/付款凭证', '验收/部署证明', '企业主体资料'],
    deadline: '以主管部门申报通知为准',
    note: '采购标的和补贴范围以正式文件为准。',
  },
  'AI 场景创新支持': {
    standard: '需求方、解决方各最高 10 万元',
    conditions: ['企业参与官方发布的 AI 场景榜单', '通过评审并完成项目落地'],
    materials: ['场景方案', '榜单/评审材料', '合同/验收材料', '落地证明'],
    deadline: '以榜单/评审通知为准',
    note: '需完成落地，不以单纯申报为支持依据。',
  },
  '特色产品项目支持': {
    standard: '按核定研发费用 30% 支持，单项目最高 300 万元',
    conditions: ['适用于技术创新型项目', '重点支持研发突破和产品形成'],
    materials: ['研发项目计划', '研发费用专项审计/归集表', '知识产权/检测报告', '产品/样机证明'],
    deadline: '以主管部门申报通知为准',
    note: '研发费用口径和审计要求以正式指南为准。',
  },
  '超级个体奖励': {
    standard: '超级个体最高 30 万元；精英 20 万元；新锐 10 万元',
    conditions: ['根据技术、产品力、经营力、附加赋能等综合评审'],
    materials: ['技术与产品材料', '经营数据', '案例/客户证明', '附加赋能材料'],
    deadline: '以评审通知为准',
    note: '奖励为评审制，不承诺入选。',
  },
  '专业培训券': {
    standard: '培训费用 60% 补贴，每家最高 1 万元',
    conditions: ['参加科技部门主办或指导的专业培训'],
    materials: ['培训通知/报名记录', '培训发票/付款凭证', '培训证书/签到记录', '企业主体资料'],
    deadline: '以培训通知/申报通知为准',
    note: '仅限符合条件的培训项目。',
  },
  '金融服务支持': {
    standard: '对接区级专项基金及金融资源',
    conditions: ['具备融资需求的优秀 OPC 企业', '可申请科创集团对接'],
    materials: ['商业计划书/融资计划', '财务资料', '股权/主体资料', '项目进展材料'],
    deadline: '持续对接，以金融机构审核为准',
    note: '平台仅提供对接，不承诺融资结果。',
  },
};

export async function renderOpc(ctx, query = {}) {
  const active = String(query.s || '');
  const q = String(query.q || '').trim();
  const [projectRes, biddingRes] = await Promise.all([
    service.listings({ category: 'project', pageSize: 10, sort: 'latest' }).catch(() => ({ items: [], total: 0 })),
    service.listings({ category: 'bidding', pageSize: 10, sort: 'latest' }).catch(() => ({ items: [], total: 0 })),
  ]);
  const all = [...(projectRes.items || []), ...(biddingRes.items || [])]
    .filter((x) => x && x.id)
    .sort((a, b) => String(dateOf(b)).localeCompare(String(dateOf(a))));
  let filtered = all;
  if (active) filtered = filtered.filter((x) => directionsFor(x).includes(active));
  if (q) {
    const kw = q.toLowerCase();
    filtered = filtered.filter((x) => `${x.title || ''} ${x.subtitle || ''} ${regionOf(x)}`.toLowerCase().includes(kw));
  }
  const visible = filtered.slice(0, 8);
  const totalProjects = projectRes.total || (projectRes.items || []).length;
  const totalBids = biddingRes.total || (biddingRes.items || []).length;

  const joinForm = isLoggedIn()
    ? `<form class="opc-join-form" id="opc-join-form">
        <div class="opc2-form-title">填写 OPC 入驻申请</div>
        <div class="opc2-form-sub">1 个工作日内联系 · 不收入驻费</div>
        <div class="opc-join-grid">
          <label>姓名 / 花名<input name="name" maxlength="30" required placeholder="怎么称呼你"></label>
          <label>手机 / 微信<input name="contact" maxlength="60" required placeholder="方便联系的号码或微信"></label>
          <label>所在城市<input name="city" maxlength="20" placeholder="杭州 / 上海 / 深圳"></label>
          <label>案例 / 作品链接<input name="portfolio" maxlength="160" placeholder="视频号、作品集、GitHub、店铺链接"></label>
        </div>
        <div class="opc-join-label">可接服务方向（可多选）</div>
        <div class="opc-join-svcs">
          ${SERVICES.map((x) => `<label class="opc-join-check"><input type="checkbox" name="opc-svc" value="${ui.esc(x.id)}"><span>${ui.esc(x.name)}</span></label>`).join('')}
        </div>
        <label class="opc-join-intro">自我介绍 / 交付能力<textarea name="intro" rows="3" maxlength="800" required placeholder="做过什么、擅长什么、可交付周期，例如：3 年短视频编导，擅长产业项目宣传片，7 天交付"></textarea></label>
        <div class="opc-join-foot">
          <span>提交后由平台负责人审核，不承诺订单。</span>
          <button class="opc2-primary" type="submit">提交入驻申请</button>
        </div>
      </form>`
    : `<div class="opc2-guest">
        <div class="opc2-guest-icon">鱼</div>
        <div class="opc2-guest-title">先注册，再申请入驻</div>
        <div class="opc2-guest-sub">已有账号直接登录；注册后填写能力与案例，进入 OPC 服务网络。</div>
        <div class="opc2-guest-actions">
          <a class="opc2-primary" href="#/register">注册账号</a>
          <a class="opc2-ghost" href="#/login?redirect=${encodeURIComponent('#/opc')}">登录后申请</a>
        </div>
      </div>`;

  const districtCards = [
    ['上城区', '每年 1 亿元专项 · 最长 3 年免费工位', 'https://www.hzsc.gov.cn/col/col1229249070/art/2026/art_223a023aee6543e7855f7c8cc826a0a4.html'],
    ['滨江区', 'OPC“护航十条” · 1 亿元 Token 券', 'https://cxjw.hangzhou.gov.cn/col/col1229792646/art/2026/art_e7575a6c4868192ea6e638669a6988de.html'],
    ['余杭区', '“AI+OPC”生态建设行动计划（2026—2028）', 'https://www.cnfin.com/hg-lb/detail/20261013/4480006_1.html'],
    ['拱墅区', 'OPC 社区 · 按月 / 按工位租赁', 'https://gsb.qybk.cn/resfile/2026-03-20/03/jrgs-20260320-003.pdf'],
  ];

  const html = `<div class="page opc2-page">
    <header class="opc2-top">
      <a class="opc2-brand" href="#/opc">
        <span class="opc2-brand-mark">O</span>
        <span class="opc2-brand-text">OPC 服务<em>by 小鱼来了</em></span>
      </a>
      <nav class="opc2-nav" aria-label="OPC 页面导航">
        <a class="active" href="#/opc">需求广场</a>
        <button type="button" data-scroll="opc2-services">服务能力</button>
        <button type="button" data-scroll="opc2-pioneers">优秀 OPC</button>
        <button type="button" data-scroll="opc2-policy">优惠政策</button>
        <button type="button" data-scroll="opc-join">入驻申请</button>
      </nav>
      <a class="opc2-top-cta" href="#/opc?join=1">申请入驻 <span>↗</span></a>
    </header>

    <section class="opc2-hero">
      <div class="opc2-hero-copy">
        <div class="opc2-eyebrow"><span class="opc2-live"></span> OPC · AI 时代的产业服务网络</div>
        <h1>让每一个 OPC，<br><em>接到真实的产业项目</em></h1>
        <p>项目、政策、算力、订单与社区资源，放在一个入口。你负责专业交付，小鱼来了负责把需求拆清楚、把资源接上。</p>
        <form class="opc2-search" id="opc2-search-form">
          <span class="opc2-search-ico">⌕</span>
          <input id="opc2-q" value="${ui.esc(q)}" maxlength="60" placeholder="搜项目、服务或城市，例如：光伏 EPC / 短视频 / 杭州" autocomplete="off">
          <button type="submit">搜索</button>
        </form>
        <div class="opc2-hero-actions">
          <a class="opc2-primary" href="#/opc?join=1">入驻 OPC</a>
          <a class="opc2-ghost" href="#/register">注册 / 申请</a>
          <a class="opc2-link" href="#/publish?category=project">发布项目需求 <span>›</span></a>
        </div>
        <div class="opc2-stats">
          <div><b>${totalProjects}</b><span>个产业项目</span></div>
          <div><b>${totalBids}</b><span>条招投标</span></div>
          <div><b>${SERVICES.length}</b><span>类 OPC 服务</span></div>
          <div><b>24</b><span>家真实企业</span></div>
        </div>
      </div>
      <div class="opc2-hero-panel" aria-label="OPC 匹配示意">
        <div class="opc2-panel-head"><span>OPC MATCH</span><i>示意</i></div>
        <div class="opc2-panel-kicker">一条需求，拆成可接的服务</div>
        <div class="opc2-panel-row">
          <span class="opc2-panel-tag">光伏 EPC</span>
          <div><b>项目宣传 + 收益测算</b><small>短视频 / 3D / 咨询</small></div>
          <em>3 类</em>
        </div>
        <div class="opc2-panel-row">
          <span class="opc2-panel-tag blue">AI 产品</span>
          <div><b>发布会内容 + 获客页</b><small>短视频 / 落地页 / AI 工具</small></div>
          <em>3 类</em>
        </div>
        <div class="opc2-panel-row">
          <span class="opc2-panel-tag gold">招投标</span>
          <div><b>标书排版 + 资质清单</b><small>投标服务 / 资料整理</small></div>
          <em>2 类</em>
        </div>
        <div class="opc2-panel-foot"><span></span> 真实项目 · 先确认可拆包，再对接</div>
      </div>
    </section>

    <section class="opc2-section" id="opc2-services">
      <div class="opc2-sec-head">
        <div><div class="opc2-sec-eyebrow">01 / 服务能力</div><h2>先选你能接的方向</h2></div>
        <a class="opc2-sec-more" href="#/opc?s=">全部服务 <span>›</span></a>
      </div>
      <div class="opc2-service-grid">
        ${SERVICES.map((x, i) => `<a class="opc2-service ${active === x.id ? 'active' : ''}" href="#/opc?s=${x.id}">
          <span class="opc2-service-no">${String(i + 1).padStart(2, '0')}</span>
          <span class="opc2-service-icon">${['影', 'AI', '数', '研', '3D', '光', '标'][i] || 'OPC'}</span>
          <b>${ui.esc(x.name)}</b>
          <small>${ui.esc(x.desc)}</small>
          <i>看匹配项目 <span>›</span></i>
        </a>`).join('')}
      </div>
    </section>

    <section class="opc2-section" id="opc2-projects">
      <div class="opc2-sec-head">
        <div><div class="opc2-sec-eyebrow">02 / 需求广场</div><h2>${q ? `搜索：${ui.esc(q)}` : active ? `${ui.esc(SERVICE_MAP[active]?.name || '')}相关需求` : '最新真实需求'}</h2></div>
        <a class="opc2-sec-more" href="${active ? '#/opc' : '#/list/project'}">${active ? '看全部方向' : '更多项目'} <span>›</span></a>
      </div>
      <div class="opc2-filter">
        <a class="opc2-chip ${!active && !q ? 'active' : ''}" href="#/opc">全部</a>
        ${SERVICES.map((x) => `<a class="opc2-chip ${active === x.id ? 'active' : ''}" href="#/opc?s=${x.id}">${ui.esc(x.name)}</a>`).join('')}
        ${q ? `<a class="opc2-chip active" href="#/opc">搜索：${ui.esc(q)} ×</a>` : ''}
      </div>
      <div class="opc2-disclaimer">以下为平台真实项目/公告；“可拆解方向”是平台建议，是否外包以项目方确认为准。</div>
      <div class="opc2-project-grid">
        ${visible.length ? visible.map(cardHtml).join('') : `<div class="opc2-empty">这个方向暂时没有匹配项目。先登记能力，有匹配项目优先联系。<a class="opc2-primary" href="#/opc?join=1">登记 OPC 能力</a></div>`}
      </div>
    </section>

    <section class="opc2-section" id="opc2-pioneers">
      <div class="opc2-sec-head">
        <div><div class="opc2-sec-eyebrow">03 / 优秀 OPC</div><h2>优秀 OPC 展示</h2></div>
        <a class="opc2-sec-more" href="#/contact-us?topic=consult&about=优秀OPC展示推荐">推荐 / 自荐 <span>›</span></a>
      </div>
      <p class="opc2-pioneer-lead">首批 12 个展示位开放，按“真实案例 + 交付能力 + 项目方评价”审核上墙。展示位不收入驻费，优先获得需求推荐。</p>
      <div class="opc2-pioneer-grid">
        ${[
          ['01', '产业短视频', '短视频 / 短剧', '产业项目宣传片、企业家 IP、账号代运营、项目路演视频'],
          ['02', 'AI 应用交付', 'AI 工具 / Agent', '企业知识库、自动化工作流、数据看板、AI 应用原型'],
          ['03', '光储方案', '光伏 / 储能', '工商业光储测算、备案材料、EPC 协同、项目尽调'],
        ].map(([n, name, tag, desc]) => `<a class="opc2-pioneer" href="#/contact-us?topic=consult&about=${encodeURIComponent('OPC展示位申请：' + name)}">
          <span class="opc2-pioneer-no">展示位 ${n}</span>
          <span class="opc2-pioneer-tag">${ui.esc(tag)}</span>
          <b>${ui.esc(name)}</b>
          <p>${ui.esc(desc)}</p>
          <i>招募中 · 申请展示 <span>›</span></i>
        </a>`).join('')}
      </div>
      <div class="opc2-pioneer-foot">已入驻的 OPC 可提交案例、报价区间与可交付周期；平台审核后按行业/城市展示。</div>
    </section>

    <section class="opc2-section" id="opc2-policy">
      <div class="opc2-sec-head">
        <div><div class="opc2-sec-eyebrow">04 / 优惠政策</div><h2>杭州 OPC 政策，一张图看懂</h2></div>
        <a class="opc2-sec-more" href="#/opc?section=policy">全部政策 <span>›</span></a>
      </div>
      <div class="opc2-policy-banner">
        <div>
          <div class="opc2-policy-kicker">合作社区入驻孵化</div>
          <h3>从项目初审，到订单撮合、陪跑孵化</h3>
          <p>8 步入驻流程 · 11 项政策支持 · 以合作社区及主管部门最新通知为准</p>
        </div>
        <a class="opc2-policy-cta" href="#/opc/s/项目初审">查看入驻流程 <span>›</span></a>
      </div>
      <div class="opc2-district-grid">
        ${districtCards.map(([name, desc, href]) => `<a class="opc2-district" href="${href}" target="_blank" rel="noopener">
          <b>${ui.esc(name)}</b><span>${ui.esc(desc)}</span><i>查看政策来源 ↗</i>
        </a>`).join('')}
        <a class="opc2-district is-more" href="#/contact-us?topic=consult&about=补充杭州各区OPC政策">
          <b>其他区</b><span>萧山 / 临平 / 钱塘 / 富阳 / 临安 / 桐庐 / 淳安 / 建德</span><i>补充 / 咨询 ›</i>
        </a>
      </div>
    </section>

    <section class="opc2-join" id="opc-join">
      <div class="opc2-join-left">
        <div class="opc2-sec-eyebrow light">00 / OPC 入驻</div>
        <h2>把你的能力，<br>放进真实的产业现场</h2>
        <p>不收入驻费，不卖接单资格。填写能力与案例，审核通过后，项目方有匹配需求时优先联系。</p>
        <div class="opc2-join-steps">
          <div><b>01</b><span>注册账号</span></div>
          <div><b>02</b><span>填写能力</span></div>
          <div><b>03</b><span>审核入池</span></div>
          <div><b>04</b><span>项目匹配</span></div>
        </div>
        <a class="opc2-link light" href="#/opc?join=1">查看入驻说明 <span>›</span></a>
      </div>
      <div class="opc2-join-right" id="opc-join-card">${joinForm}</div>
    </section>

    <section class="opc2-community">
      <div>
        <div class="opc2-sec-eyebrow light">05 / 社区合作</div>
        <h2>社区有“人”，平台有“单”</h2>
        <p>面向 OPC 社区运营方：联合招募、项目拆包、能力曝光、跨区域交付网络。首期建议选 AI 短剧 / 数字营销 / 产业数字化，30 天跑通 3 个付费案例。</p>
      </div>
      <div class="opc2-community-actions">
        <a class="opc2-primary" href="#/contact-us?topic=consult&about=OPC社区合作">申请社区合作</a>
        <a class="opc2-ghost dark" href="/docs/OPC-cooperation-2026.pdf" download="小鱼来了-OPC社区合作方案.pdf">下载合作方案</a>
      </div>
    </section>

    <div class="opc2-legal">杭州硕鱼科技有限公司 · 小鱼来了 · OPC 服务专区</div>
  </div>`;

  return {
    title: 'OPC 服务 · 小鱼来了',
    content: html,
    activeTab: '',
    showBack: true,
    noTab: true,
    mount(root) {
      if (String(query.join || '') === '1' || String(query.section || '') === 'join') {
        setTimeout(() => root.querySelector('#opc-join')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      } else if (String(query.section || '') === 'policy') {
        setTimeout(() => root.querySelector('#opc2-policy')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
      root.querySelectorAll('[data-scroll]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = root.querySelector(`#${btn.dataset.scroll}`);
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      root.querySelector('#opc2-search-form')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const kw = String(root.querySelector('#opc2-q')?.value || '').trim();
        ctx.nav(kw ? `#/opc?q=${encodeURIComponent(kw)}` : '#/opc');
      });
      const form = root.querySelector('#opc-join-form');
      if (!form) return;
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const name = String(fd.get('name') || '').trim();
        const contact = String(fd.get('contact') || '').trim();
        const city = String(fd.get('city') || '').trim();
        const portfolio = String(fd.get('portfolio') || '').trim();
        const intro = String(fd.get('intro') || '').trim();
        const svcs = [...form.querySelectorAll('input[name="opc-svc"]:checked')].map((x) => x.value);
        if (!name || !contact || !intro || !svcs.length) {
          ui.toast('请填写姓名、联系方式、能力和自我介绍', 'err');
          return;
        }
        const labels = svcs.map((id) => SERVICE_MAP[id]?.name || id).join('、');
        const text = [
          '【OPC 入驻申请】',
          `姓名/花名：${name}`,
          `联系方式：${contact}`,
          `城市：${city || '未填写'}`,
          `服务方向：${labels}`,
          `案例/作品：${portfolio || '未填写'}`,
          `自我介绍/交付能力：${intro}`,
        ].join('\n');
        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }
        try {
          await service.feedbackSubmit({ text, contact, topics: ['consult'], page: '#/opc' });
          ui.toast('入驻申请已提交，负责人会尽快联系你', 'ok');
          form.reset();
        } catch (err) {
          ui.toast(err.message || '提交失败，请稍后再试', 'err');
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = '提交入驻申请'; }
        }
      });
    },
  };
}

export function renderOpcDetail(ctx, kind, name) {
  const key = String(name || '');
  const isPolicy = kind === 'policy';
  const item = isPolicy ? POLICY_DETAILS[key] : STEP_DETAILS[key];
  if (!item) {
    return {
      title: 'OPC 详情',
      content: `<div class="page"><div class="card card-pad mt20"><div class="strong mb8">没有找到这个条目</div><a class="btn btn-sm btn-primary" href="#/opc">返回 OPC 服务专区</a></div></div>`,
      showBack: true,
      noTab: true,
    };
  }
  const apply = `#/contact-us?topic=consult&about=${encodeURIComponent((isPolicy ? 'OPC政策申请：' : 'OPC入驻申请：') + key)}`;
  const title = isPolicy ? `${key} · 政策详情` : `${key} · 入驻流程`;
  const mainTitle = isPolicy ? '支持标准' : '流程说明';
  const mainValue = isPolicy ? item.standard : item.desc;
  const list = (arr) => `<ul class="opc-detail-list">${arr.map((x) => `<li>${ui.esc(x)}</li>`).join('')}</ul>`;
  const html = `<div class="page opc-detail-page">
    <a class="opc-detail-back" href="#/opc">‹ 返回 OPC 服务专区</a>
    <section class="opc-detail-hero">
      <div class="opc-detail-badge">${isPolicy ? 'OPC 政策支持' : 'OPC 入驻流程'}</div>
      <h1>${ui.esc(title)}</h1>
      <div class="opc-detail-main">${ui.esc(mainValue)}</div>
      <div class="opc-detail-meta">合作社区政策摘要 · 具体以社区及主管部门正式文件为准</div>
    </section>
    <div class="opc-detail-grid">
      <div class="opc-detail-body">
        <section class="opc-detail-card">
          <h2>${isPolicy ? '适用条件' : '适用对象与条件'}</h2>
          ${list(item.conditions)}
        </section>
        <section class="opc-detail-card">
          <h2>所需材料</h2>
          ${list(item.materials)}
        </section>
        <section class="opc-detail-card">
          <h2>${mainTitle}</h2>
          ${isPolicy ? `<div class="opc-detail-note">${ui.esc(item.standard)}</div>` : list(item.flow)}
        </section>
        <section class="opc-detail-card">
          <h2>截止 / 时间</h2>
          <div class="opc-detail-note">${ui.esc(isPolicy ? item.deadline : item.time)}</div>
          <p class="opc-detail-disclaimer">${ui.esc(item.note || '材料清单为一般性提示，具体以正式申报指南为准。')}</p>
        </section>
      </div>
      <aside class="opc-detail-aside">
        <div class="opc-detail-aside-t">${isPolicy ? '查询 / 申请这项政策' : '咨询 / 申请这个流程'}</div>
        <p>提交后由平台与合作社区跟进；不收入驻费，不承诺结果。</p>
        <a class="opc-btn opc-btn-main" href="${apply}">填写查询 / 申请</a>
        <a class="opc-btn" href="#/opc">返回 OPC 服务专区</a>
        <div class="opc-detail-aside-note">登录后可提交；未登录会先跳转登录。</div>
      </aside>
    </div>
  </div>`;
  return {
    title,
    content: html,
    showBack: true,
    noTab: true,
    activeTab: '',
  };
}

export default { renderOpc, renderOpcDetail };
