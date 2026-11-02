/**
 * 小鱼来了 — 企业服务（#/services）
 *
 * 给政府、园区、产业基金、企业看的服务页：
 * 私有化部署 / 区域产业数据库 / 信息代运营 / AI 尽调报告。
 *
 * 联系路径：全部引导到站内「联系我」表单（topic=system/consult），
 * 提交后由管理员（平台负责人）接收并回复，不暴露其他人的联系方式。
 */

import * as ui from './ui.js';

const PLANS = [
  {
    id: 'deploy',
    priceValue: 38000,
    icon: '🏛️',
    name: '私有化部署',
    tag: '最推荐 · 政府 / 园区 / 国企',
    price: '3.8 万 / 年',
    priceNote: '首年含部署 5 万',
    desc: '把整套平台装到你自己机房，数据不出内网。',
    includes: [
      '全部功能：信息发布、检索、AI 解析、招投标采集、会员管理',
      '部署到客户服务器（2 核 2G 即可运行，无需另购数据库）',
      '5 个工作日交付 + 2 小时培训 + 3 个月免费运维',
      '可按需接入本地数据源与内部系统',
    ],
    topic: 'system',
    about: '我想了解【私有化部署】方案',
  },
  {
    id: 'data',
    priceValue: 18000,
    icon: '📊',
    name: '区域产业数据库',
    tag: '招商部门 / 产业基金 / 投行',
    price: '1.8 万 / 年',
    priceNote: '按城市订阅',
    desc: '指定区域的产业项目库，结构化字段，每日更新。',
    includes: [
      '项目 / 贸易供需 / 招投标 / 政策 / 基金动向',
      '每日自动更新 + 人工核验',
      '网页账号 + 每周 Excel 导出',
      '增值项：指定行业 +3000/年，数据 API +8000/年',
    ],
    topic: 'consult',
    about: '我想了解【区域产业数据库】订阅',
  },
  {
    id: 'operate',
    priceValue: 28000,
    icon: '📝',
    name: '信息代运营',
    tag: '中小企业 / 工程项目方',
    price: '3,000 元 / 月',
    priceNote: '年付 2.8 万',
    desc: '你只管把资料丢过来，整理发布和转发我们做。',
    includes: [
      '每月 20 条信息整理与发布',
      '每周 1 次定向转发到合作渠道',
      '对接线索反馈（谁看了、谁问了）',
      '信息字段规范化，提高被搜到的概率',
    ],
    topic: 'consult',
    about: '我想了解【信息代运营】服务',
  },
  {
    id: 'report',
    priceValue: 800,
    icon: '🔍',
    name: 'AI 项目尽调报告',
    tag: '投资机构 / 需要评估项目的企业',
    price: '800 元 / 份',
    priceNote: '10 份起 6000 元',
    desc: '单项目分析报告，2 个工作日交付。',
    includes: [
      '项目要素梳理 + 结构化字段',
      '工商与资质核验、行业对标',
      '风险提示与可信度评分',
      'PDF 交付，8~12 页',
    ],
    topic: 'consult',
    about: '我想了解【AI 尽调报告】',
  },
];

/**
 * 大额合作档位（几十万 ~ 几百万）。
 * 这类不是「买软件」，是「一起做一件事」，所以按项目报，
 * 但必须给出起价区间 —— 否则对方不知道要不要谈。
 */
const BIG_PLANS = [
  {
    id: 'gov',
    priceValue: 200000,
    icon: '🏛️',
    name: '政府招商线索服务',
    tag: '区县招商部门 / 园区 / 国资平台',
    price: '20 万起 / 年',
    priceNote: '按服务范围确定，不含落地奖励',
    desc: '不承诺帮你招到企业，而是把「该找谁」这件事做扎实。',
    includes: [
      '按本地产业定位，整理目标企业清单（含迁址意向、扩产计划）',
      '每月提供 10–20 家匹配企业线索，附企业情况与决策人岗位',
      '协助对接联络（邮件 / 电话 / 引荐），跟进结果如实反馈',
      '协助组织招商推介会或企业考察（每年 2 场）',
      '线索跟进台账，全过程留痕，可随时查看进度',
      '输出年度招商分析报告（产业分布、竞品区域、政策对比）',
    ],
    topic: 'consult',
    about: '我想了解【政府招商线索服务】',
    note: '本服务交付的是线索与对接协助，不对企业最终是否落地作承诺；落地奖励与后续服务另行协商。',
  },
  {
    id: 'region',
    priceValue: 300000,
    icon: '🤝',
    name: '区域独家合作',
    tag: '一个市 / 一个区县，独占运营',
    price: '30 万起 / 年',
    priceNote: '按区域人口与产业规模浮动',
    desc: '你出本地资源，我们出平台与运营体系，收益分成。',
    includes: [
      '指定区域独家使用权，不再授权第二家',
      '平台本地化部署 + 本地数据源接入',
      '联合品牌运营（「XX 市产业信息平台」）',
      '我们负责产品迭代与技术支持，你负责本地渠道',
      '收益分成比例按投入协商，一般 6:4 到 7:3',
    ],
    topic: 'agency',
    about: '我想聊【区域独家合作】',
  },
  {
    id: 'industry',
    priceValue: 1000000,
    icon: '🏗️',
    name: '产业级整体解决方案',
    tag: '政府平台 / 产业基金 / 园区集团',
    price: '100 万起 / 年',
    priceNote: '含定制开发、数据治理与驻场服务',
    desc: '不是一个网站，是一套区域产业信息基础设施。',
    includes: [
      '区域产业数据库建设（项目 / 企业 / 政策 / 基金）',
      '定制开发：与本地政务系统、招商系统对接',
      '数据治理：清洗、去重、字段标准化、质量监控',
      '专属项目组：产品 + 开发 + 数据 + 实施',
      '驻场服务与年度运营报告',
      '可按需扩展至多区县、多业务线',
    ],
    topic: 'system',
    about: '我想聊【产业级整体解决方案】（百万级项目）',
  },
  {
    id: 'capital',
    priceValue: 3000000,
    icon: '💼',
    name: '产业资本合作',
    tag: '产业基金 / 国资平台 / 上市公司',
    price: '300 万起',
    priceNote: '股权投资或联合设立专项基金',
    desc: '不只是服务采购 —— 我们也在寻找长期资本合作方。',
    includes: [
      '股权投资：本轮种子轮 / 天使轮开放',
      '联合设立产业信息专项基金',
      '我们提供平台能力与数据资产，对方提供资金与产业资源',
      '可签对赌：约定用户规模、区域覆盖、收入里程碑',
      '尽调材料齐全：软著、财务、代码可审计',
    ],
    topic: 'invest',
    about: '我想聊【产业资本合作】（投资 / 联合基金）',
  },
];

export function renderServices(ctx) {
  /* 按年化价格从低到高排：客户从上往下看，是「从小到大」的采购阶梯 */
  const byPrice = (a, b) => (a.priceValue || 0) - (b.priceValue || 0);
  const sortedPlans = [...PLANS].sort(byPrice);
  const sortedBig = [...BIG_PLANS].sort(byPrice);

  const html = `<div class="page svc-page">
    <div class="svc-hero">
      <div class="svc-hero-t">🏛️ 企业服务</div>
      <div class="svc-hero-d">
        给政府、园区、产业基金和企业提供产业信息的
        <b>部署、数据、运营与分析</b>服务。
      </div>
      <div class="svc-hero-tags">
        <span>零第三方依赖</span><span>可部署内网</span><span>数据不出本地</span>
      </div>
    </div>

    <div class="svc-section-sub" style="margin:2px 2px 10px">↓ 按价格从低到高排列</div>
    ${sortedPlans.map(
      (p) => `<div class="svc-card" id="svc-${ui.esc(p.id)}">
        <div class="svc-head">
          <div class="svc-ico">${p.icon}</div>
          <div class="svc-title">
            <div class="svc-name">${ui.esc(p.name)}</div>
            <div class="svc-tag">${ui.esc(p.tag)}</div>
          </div>
        </div>
        <div class="svc-price">
          <b>${ui.esc(p.price)}</b>
          <span>${ui.esc(p.priceNote)}</span>
        </div>
        <div class="svc-desc">${ui.esc(p.desc)}</div>
        <div class="svc-list">
          ${p.includes.map((x) => `<div class="svc-li"><span class="svc-dot">✓</span>${ui.esc(x)}</div>`).join('')}
        </div>
        <a class="btn btn-primary btn-block mt12"
           href="#/contact-us?topic=${encodeURIComponent(p.topic)}&about=${encodeURIComponent(p.about)}">
          咨询这个方案
        </a>
      </div>`,
    ).join('')}

    <div class="svc-section-title">💼 大额合作（几十万 ~ 几百万）</div>
    <div class="svc-section-sub">
      下面这几档不是「买一套软件」，是「一起做一件事」。
      按项目报，但给起价 —— 免得双方浪费时间。按价格从低到高排列。
    </div>

    ${sortedBig.map(
      (p) => `<div class="svc-card svc-card-big" id="svc-${ui.esc(p.id)}">
        <div class="svc-head">
          <div class="svc-ico">${p.icon}</div>
          <div class="svc-title">
            <div class="svc-name">${ui.esc(p.name)}</div>
            <div class="svc-tag">${ui.esc(p.tag)}</div>
          </div>
        </div>
        <div class="svc-price">
          <b>${ui.esc(p.price)}</b>
          <span>${ui.esc(p.priceNote)}</span>
        </div>
        <div class="svc-desc">${ui.esc(p.desc)}</div>
        <div class="svc-list">
          ${p.includes.map((x) => `<div class="svc-li"><span class="svc-dot">✓</span>${ui.esc(x)}</div>`).join('')}
        </div>
        ${p.note ? `<div class="svc-note">⚠️ ${ui.esc(p.note)}</div>` : ''}
        ${
          p.id === 'industry'
            ? `<a class="btn btn-outline btn-block mt12" href="/docs/region-industry-info-plan.pptx" download>
                 ⬇️ 下载方案 PPT（11 页）
               </a>`
            : ''
        }
        <a class="btn btn-primary btn-block mt12"
           href="#/contact-us?topic=${encodeURIComponent(p.topic)}&about=${encodeURIComponent(p.about)}">
          咨询这个合作
        </a>
      </div>`,
    ).join('')}

    <div class="card card-pad mt12">
      <div class="strong mb8">📋 服务流程</div>
      <div class="small muted" style="line-height:2">
        1. 你在下方点「咨询这个方案」，留下需求与联系方式<br>
        2. 我们 1 个工作日内联系你，确认范围与报价<br>
        3. 签订合同，付 50% 首款<br>
        4. 交付并验收，付尾款，开增值税发票<br>
        5. 进入服务期，含 3 个月免费运维
      </div>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">🤝 其他合作方式</div>
      <div class="small muted" style="line-height:1.9">
        · <b>联合运营</b>：区域独家合作，你出资源我们出平台<br>
        · <b>渠道代理</b>：帮你所在地区的客户做部署与代运营<br>
        · <b>定制开发</b>：按你的业务场景扩展功能
      </div>
      <a class="btn btn-outline btn-block mt12" href="#/contact-us?topic=agency&about=我想聊【联合运营 / 渠道代理】合作">
        聊聊合作
      </a>
    </div>

    <div class="card card-pad mt12">
      <div class="strong mb8">📥 方案材料</div>
      <div class="small muted" style="line-height:1.9">
        百万级项目需要正式方案。可以先把材料下载下来，内部讨论后再约沟通。
      </div>
      <a class="btn btn-outline btn-block mt12" href="/docs/region-industry-info-plan.pptx" download>
        ⬇️ 区域产业信息基础设施建设方案（PPT，11 页）
      </a>
    </div>

    <div class="svc-contact">
      <div class="svc-contact-t">联系谁</div>
      <div class="svc-contact-d">
        以上服务由平台负责人直接对接，站内提交后由他本人回复。<br>
        <b>电话 / 微信：13456693544</b><br>
        工作时间：周一至周六 9:00–21:00
      </div>
    </div>

    <div class="tiny dim center mt16" style="padding-bottom:24px">
      小鱼来了 · 让每一条好项目，都被对的人看见
    </div>
  </div>`;

  return {
    title: '企业服务',
    content: html,
    showBack: true,
    activeTab: '',
    mount(root) {
      /* 咨询按钮已经是指向 #/contact-us 的链接，这里不用额外处理；
         但为了移动端点击更明显，滚动到方案卡时给个轻微高亮 */
      if (location.hash.includes('#')) return;
    },
  };
}

export default { renderServices };
