/**
 * 塔建集团 专题页（#/tajian）
 *
 * 专注浙江工商业光伏及储能：
 *   · 整镇整村能源（公建 + 微电网）
 *   · 工商业光伏（区域分层 / 投资分层双轨）
 *   · 工商业储能（华为 EMS / 双产品线）
 *
 * 资料来自塔建集团提供：企业简介 PDF + 三泉王村源网荷储充方案 PPT
 */

import * as ui from './ui.js';
import { api, service, isLoggedIn } from './api.js';

const PROFILE_DOC = [
  ['/static/tajian/company-cover.jpg', '企业简介 · 封面'],
  ['/static/tajian/company-intro.jpg', '集团介绍'],
  ['/static/tajian/map.jpg', '立足杭州 · 辐射华东'],
  ['/static/tajian/business.jpg', '三大核心业务'],
  ['/static/tajian/microgrid.jpg', '源网荷储充一体化'],
  ['/static/tajian/case-qunli.jpg', '案例 · 瓜沥镇群力村 1500kW'],
  ['/static/tajian/case-xiangnan.jpg', '案例 · 义桥镇湘南村 2000kW'],
  ['/static/tajian/case-guanyi.jpg', '案例 · 瓜沥镇官一村 2000kW'],
  ['/static/tajian/case-pv1.jpg', '工商业光伏 · 胜思诚讯 1799.655kWp'],
  ['/static/tajian/case-pv2.jpg', '工商业光伏 · 简康新材料 928.26kWp'],
];

const LICENSE_DOC = [['/static/tajian/license.jpg', '营业执照']];

const BRANDS = [
  '华为技术', '隆基绿能', '正泰集团', '天合富家', '晶澳光伏', '通威集团', '锦浪科技', '阳光能源',
  '国家电投', '华能集团', '大唐集团', '中国电建', '中国能建', '中国交建', '物产中大', '新奥集团',
  '西安热工', '海康威视', '杭州可再生能源行业协会',
];

const PPT_DOC = [
  ['/static/tajian/hero-poster.jpg', '塔建集团 & 新能源投资规划'],
  ['/static/tajian/village.jpg', '三泉王村 · 项目概况'],
  ['/static/tajian/system.jpg', '源网荷储充 · 总体架构'],
  ['/static/tajian/invest.jpg', '光伏投资与收益测算'],
  ['/static/tajian/coop.jpg', '村集体与投资方投入产出'],
  ['/static/tajian/render-coffee.jpg', '效果示意 · 五舍咖啡'],
  ['/static/tajian/render-hall.jpg', '效果示意 · 文化礼堂'],
  ['/static/tajian/render-plant.jpg', '效果示意 · 村委东南角个人厂房'],
  ['/static/tajian/render-basketball.jpg', '效果示意 · 篮球场'],
  ['/static/tajian/render-parking.jpg', '效果示意 · 停车场'],
  ['/static/tajian/process.jpg', '项目建设周期与流程'],
];

const BUSINESS = [
  {
    icon: '🏘️',
    name: '整镇整村能源',
    sub: '公建 + 微电网 · 分级开发',
    img: '/static/tajian/village.jpg',
    points: ['以镇 / 街道为整体开发单元，按用电负荷分级施策', '高负荷村镇落地村级微电网；低负荷村镇做公建集中光伏', '整村统一规划、集中汇流，破解变压器并网容量瓶颈'],
  },
  {
    icon: '☀️',
    name: '工商业光伏',
    sub: '区域分层 · 投资分层 · 双轨开发',
    img: '/static/tajian/case-pv1.jpg',
    points: ['自有资金，决策快、落地快、合作灵活', '外拓市场：江浙沪皖全域，依托交投平台合作投资', '属地市场：萧山及周边，低谷电价低至 0.31 元/度'],
  },
  {
    icon: '🔋',
    name: '工商业储能',
    sub: '华为 EMS · 双产品线',
    img: '/static/tajian/system.jpg',
    points: ['华为全套 EMS 系统、智能调度、原厂质保', '精准匹配杭绍甬温高端需求：大型工厂、上市公司、园区', '一充一放稳健收益 + 预留两充两放智能切换'],
  },
];

const CASES = [
  {
    name: '三泉王村 · 源网荷储充一体化智慧微电网',
    tag: '村级微电网 · 萧山所前镇',
    img: '/static/tajian/village.jpg',
    desc: '浙江省未来乡村、AAA 级景区村，全村约 3.2 平方公里，450 户村民。建设 9.36MW 分布式光伏 + 2MW/4MWh 储能 + 23 台充电桩 + AI 能源调度平台。',
    stats: [
      ['9.36MW', '分布式光伏'],
      ['2MW/4MWh', '集中式储能'],
      ['3026.06 万元', '光伏总投资'],
      ['263.03 万元', '年节约电费'],
    ],
  },
  {
    name: '瓜沥镇群力村 · 整村光伏示范',
    tag: '整村光伏',
    img: '/static/tajian/case-qunli.jpg',
    desc: '萧山区整村光伏示范村，装机 1500kW，盘活村集体与村民闲置屋顶资源。',
    stats: [
      ['1500kW', '装机容量'],
      ['整村示范', '项目类型'],
    ],
  },
  {
    name: '义桥镇湘南村 · 整村光伏示范',
    tag: '整村光伏',
    img: '/static/tajian/case-xiangnan.jpg',
    desc: '萧山区整村光伏示范村，装机 2000kW，统一规划、集中汇流。',
    stats: [
      ['2000kW', '装机容量'],
      ['整村示范', '项目类型'],
    ],
  },
  {
    name: '瓜沥镇官一村 · 整村光伏示范',
    tag: '整村光伏',
    img: '/static/tajian/case-guanyi.jpg',
    desc: '萧山区整村光伏示范村，装机 2000kW，村集体与农户共享绿色收益。',
    stats: [
      ['2000kW', '装机容量'],
      ['整村示范', '项目类型'],
    ],
  },
  {
    name: '杭州胜思诚讯 · 工商业光伏',
    tag: '工商业光伏 · 业主电费打折',
    img: '/static/tajian/case-pv1.jpg',
    desc: '萧山阳光房案例，装机 1799.655kWp，采用业主电费打折模式。',
    stats: [
      ['1799.655kWp', '装机容量'],
      ['电费打折', '合作模式'],
    ],
  },
  {
    name: '杭州简康新材料 · EPC 项目',
    tag: '工商业光伏 · EPC',
    img: '/static/tajian/case-pv2.jpg',
    desc: '萧山阳光房案例，装机 928.26kWp，EPC 总承包模式交付。',
    stats: [
      ['928.26kWp', '装机容量'],
      ['EPC', '合作模式'],
    ],
  },
];

const COOP_POINTS = [
  ['零投资', '塔建集团投资采购能源设备', '🤝'],
  ['免运维', '全生命周期运维保养', '🛠️'],
  ['得设备', '合同期满设备归客户所有', '🎁'],
  ['降能耗', '大幅降低能源消耗与人力成本', '📉'],
  ['增收益', '余电上网 / 政府补贴 / 峰谷套利', '📈'],
  ['保供电', '保障供电稳定安全，扼杀隐患', '🛡️'],
];

const FLOW = [
  ['01', '现场踏勘', '屋顶 / 场地 / 负荷 / 电价测算'],
  ['02', '方案设计', '光伏 + 储能 + 充电桩配置与收益测算'],
  ['03', '备案并网', '发改备案、电网接入、政策申报'],
  ['04', '投资建设', '自有资金投资，标准化施工交付'],
  ['05', '智能运维', 'AI 平台 7×24 监控，2 小时响应'],
];

const DIRECTIONS = ['工商业光伏', '工商业储能', '整村 / 整镇微电网', 'EPC 总包', '合同能源管理（EMC）', '其他'];

function licenseRow(k, v) {
  return `<div class="tj-kv"><span class="k">${ui.esc(k)}</span><span class="v">${ui.esc(v)}</span></div>`;
}

export async function renderTajian(ctx) {
  const html = `<div class="page tj-page">
    <div class="tj-hero">
      <div class="tj-hero-left">
        <div class="tj-badge">🌞 战略合作伙伴 · 塔建集团</div>
        <div class="tj-logo">塔建集团 <span>TAJIAN GROUP</span></div>
        <div class="tj-hero-t">工商业光伏 + 储能<br>浙江全链路新能源服务商</div>
        <div class="tj-hero-d">整镇整村能源 · 工商业光伏 · 工商业储能 · 源网荷储充一体化微电网</div>
        <div class="tj-hero-points">
          <span>70+ 整村光伏项目</span><span>9.36MW 村级微电网</span><span>2MW/4MWh 储能</span><span>华为 EMS</span>
        </div>
        <div class="row gap8 mt16" style="flex-wrap:wrap">
          <a class="btn btn-primary" href="#tj-business">看业务与合作</a>
          <button class="btn btn-outline" id="tj-apply" type="button">🤝 申请合作 / 报价</button>
          <button class="btn btn-outline" id="tj-share" type="button">↗ 分享专题</button>
        </div>
      </div>
      <div class="tj-hero-right">
        <img src="/static/tajian/company-cover.jpg" alt="塔建集团">
      </div>
    </div>

    <!-- 01 公司简介 -->
    <div class="tj-section" id="tj-about">
      <div class="tj-sec-head">
        <div class="tj-sec-t">01 公司简介</div>
        <div class="tj-sec-d">杭州塔建新能源科技集团有限公司 · 全链路新能源综合集成服务商</div>
      </div>
      <div class="tj-card">
        <p>塔建集团聚焦乡村能源革新与工商业新能源，具备从<b>规划设计、投资建设到运营维护</b>的全产业链服务能力。以整村光伏开发为重要抓手，已成功落地 <b>70 余个</b>整村光伏示范项目，形成标准化、可快速复制的成熟运营模式。</p>
        <p>集团紧扣国家双碳战略与乡村振兴政策，立足整村微电网建设，构建「整镇整村能源、工商业光伏、工商业储能」三大主营业务，打造集新能源投资、建设、运营、低碳管理于一体的综合能源服务商。</p>
        <p class="tj-mission">追光建网，自强笃行 · 塔建致远，共建共赢</p>
        <div class="tj-stats">
          <div><b>70+</b><span>整村光伏项目</span></div>
          <div><b>2024</b><span>成立年份</span></div>
          <div><b>1000 万</b><span>注册资本</span></div>
          <div><b>江浙沪皖</b><span>业务覆盖</span></div>
        </div>
        <div class="tj-license">
          <div class="tj-license-t">工商登记信息</div>
          ${licenseRow('公司名称', '杭州塔建新能源科技集团有限公司')}
          ${licenseRow('统一社会信用代码', '91330106MADQAN0JXU1P')}
          ${licenseRow('类型', '其他有限责任公司')}
          ${licenseRow('法定代表人', '蒋立风')}
          ${licenseRow('注册资本', '壹仟万元整')}
          ${licenseRow('成立日期', '2024 年 07 月 12 日')}
          ${licenseRow('住所', '浙江省杭州市西湖区古荡街道西斗门路 20 号第四层 4437 室')}
          ${licenseRow('经营范围', '太阳能发电技术服务 · 储能技术服务 · 工程管理服务 · 光伏设备及元器件销售 · 光伏发电设备租赁 · 合同能源管理 · 节能管理服务 · 智能控制系统集成 · 电动汽车充电基础设施运营 · 集中式快速充电站 · 充电桩销售 · 风力发电技术服务 · 新兴能源技术研发 · 发电 / 输电 / 供（配）电业务（许可）等')}
        </div>
        <div class="tiny dim mt8">以上信息以营业执照及企业提供资料为准；合作前可核验证照原件。</div>
      </div>
    </div>

    <!-- 02 核心业务 -->
    <div class="tj-section" id="tj-business">
      <div class="tj-sec-head">
        <div class="tj-sec-t">02 三大核心业务</div>
        <div class="tj-sec-d">分级开发 · 双模式拓展 · 双产品适配</div>
      </div>
      <div class="tj-grid3">
        ${BUSINESS.map(
          (b) => `<div class="tj-biz">
            <img class="tj-biz-img" src="${ui.esc(b.img)}" alt="" loading="lazy">
            <div class="tj-biz-body">
              <div class="tj-biz-t">${b.icon} ${ui.esc(b.name)}</div>
              <div class="tj-biz-s">${ui.esc(b.sub)}</div>
              <ul class="tj-list">${b.points.map((p) => `<li>${ui.esc(p)}</li>`).join('')}</ul>
            </div>
          </div>`,
        ).join('')}
      </div>
    </div>

    <!-- 03 源网荷储充 -->
    <div class="tj-section" id="tj-microgrid">
      <div class="tj-sec-head">
        <div class="tj-sec-t">03 源网荷储充一体化微电网</div>
        <div class="tj-sec-d">村级智慧微电网 · 虚拟电厂底层单元</div>
      </div>
      <div class="tj-card">
        <img class="tj-wide-img" src="/static/tajian/microgrid.jpg" alt="源网荷储充" loading="lazy">
        <div class="tj-five">
          <div><b>源</b><span>9.36MW 分布式光伏</span></div>
          <div><b>网</b><span>智能配电网 + 调度平台</span></div>
          <div><b>荷</b><span>公共 / 产业 / 文旅 / 居民负荷</span></div>
          <div><b>储</b><span>2MW/4MWh 集装箱式储能</span></div>
          <div><b>充</b><span>8 台直流快充 + 15 台交流慢充</span></div>
        </div>
        <div class="tj-benefits">
          <div><b>99.8%</b><span>供电可靠率</span></div>
          <div><b>72%~90%</b><span>绿电就地消纳率</span></div>
          <div><b>21.78%</b><span>项目综合成本降低</span></div>
          <div><b>5%~12%</b><span>额外收益增量</span></div>
        </div>
        <div class="tiny dim mt8">数据来自塔建集团三泉王村建设方案；实际以项目勘测与电网批复为准。</div>
      </div>
    </div>

    <!-- 04 项目案例 -->
    <div class="tj-section" id="tj-cases">
      <div class="tj-sec-head">
        <div class="tj-sec-t">04 项目案例</div>
        <div class="tj-sec-d">整村光伏 · 村级微电网 · 工商业光伏 / 储能</div>
      </div>
      <div class="tj-grid2">
        ${CASES.map(
          (c) => `<div class="tj-case">
            <img class="tj-case-img" src="${ui.esc(c.img)}" alt="" loading="lazy">
            <div class="tj-case-body">
              <div class="tj-case-tag">${ui.esc(c.tag)}</div>
              <div class="tj-case-t">${ui.esc(c.name)}</div>
              <div class="tj-case-d">${ui.esc(c.desc)}</div>
              <div class="tj-case-stats">
                ${(c.stats || []).map(([n, l]) => `<div><b>${ui.esc(n)}</b><span>${ui.esc(l)}</span></div>`).join('')}
              </div>
            </div>
          </div>`,
        ).join('')}
      </div>

      <div class="tj-subhead">方案效果示意</div>
      <div class="tj-gallery">
        ${[
          ['/static/tajian/render-coffee.jpg', '五舍咖啡'],
          ['/static/tajian/render-hall.jpg', '文化礼堂'],
          ['/static/tajian/render-plant.jpg', '个人厂房'],
          ['/static/tajian/render-basketball.jpg', '篮球场'],
          ['/static/tajian/render-parking.jpg', '停车场'],
        ]
          .map(
            ([img, name]) =>
              `<button class="tj-g-item" type="button" data-tj-img="${ui.esc(img)}" data-tj-name="${ui.esc(name)}">
                <img src="${ui.esc(img)}" alt="${ui.esc(name)}" loading="lazy"><span>${ui.esc(name)}</span>
              </button>`,
          )
          .join('')}
      </div>
      <div class="tiny dim mt8">以上为三泉王村项目效果示意，具体以最终设计施工图为准。</div>
    </div>

    <!-- 05 合作模式 -->
    <div class="tj-section" id="tj-coop">
      <div class="tj-sec-head">
        <div class="tj-sec-t">05 合作模式</div>
        <div class="tj-sec-d">「政府 + 企业 + 农户」多方共建共享</div>
      </div>
      <div class="tj-card">
        <img class="tj-wide-img" src="/static/tajian/coop.jpg" alt="合作模式" loading="lazy">
        <div class="tj-coop6">
          ${COOP_POINTS.map(
            ([t, d, ico]) => `<div class="tj-coop-item"><div class="ico">${ico}</div><div class="t">${ui.esc(t)}</div><div class="d">${ui.esc(d)}</div></div>`,
          ).join('')}
        </div>
        <div class="tj-coop-note">
          <b>村集体 / 业主：零资金投入</b>，提供屋顶、场地等空间资源，即可获得固定租金 + 绿电分红 + 碳资产 + 充电服务等综合收益；
          以三泉王村测算，村集体年综合收益约 <b>100.6 万元</b>，25 年累计约 <b>2515 万元</b>。
        </div>
        <div class="tiny dim mt8">收益为方案测算值，实际以项目条件、电价政策与合同约定为准。</div>
      </div>
    </div>

    <!-- 06 服务流程 -->
    <div class="tj-section" id="tj-flow">
      <div class="tj-sec-head">
        <div class="tj-sec-t">06 服务流程</div>
        <div class="tj-sec-d">从踏勘到运维，全生命周期服务</div>
      </div>
      <div class="tj-flow">
        ${FLOW.map(
          ([n, t, d]) => `<div class="tj-flow-item"><div class="n">${ui.esc(n)}</div><div class="t">${ui.esc(t)}</div><div class="d">${ui.esc(d)}</div></div>`,
        ).join('')}
      </div>
    </div>

    <!-- 06.5 萧山项目案例地图 -->
    <div class="tj-section" id="tj-map">
      <div class="tj-sec-head">
        <div class="tj-sec-t">萧山项目案例分布</div>
        <div class="tj-sec-d">整村光伏 · 村级微电网 · 工商业光伏 / 储能（示意图，非精确地理坐标）</div>
      </div>
      <div class="tj-card tj-map-card">
        <svg class="tj-map" viewBox="0 0 460 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="萧山项目案例分布示意图">
          <defs>
            <linearGradient id="tjmapbg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#f2fbf7"/><stop offset="1" stop-color="#eaf3ff"/>
            </linearGradient>
          </defs>
          <rect width="460" height="380" fill="url(#tjmapbg)" rx="14"/>
          <path d="M70 110 Q110 44 205 40 Q310 34 372 100 Q416 150 395 232 Q372 322 258 338 Q146 352 90 280 Q50 222 70 110 Z"
                fill="#dff2e8" stroke="#8fd5b6" stroke-width="2" stroke-dasharray="6 4"/>
          <path d="M70 150 Q170 196 268 176 Q350 160 392 128" fill="none" stroke="#9cc7ea" stroke-width="6" opacity="0.7"/>
          <text x="74" y="136" font-size="10.5" fill="#7d94ad">钱塘江</text>
          <text x="200" y="58" font-size="12" fill="#6b859c">萧山区（示意）</text>

          <!-- 萧山城区：工商业光伏 / 储能 -->
          <a href="#tj-cases"><circle cx="126" cy="150" r="9" fill="#0b74ff" stroke="#fff" stroke-width="3"/></a>
          <text x="142" y="142" font-size="12" font-weight="700" fill="#1d1d1f">萧山城区 · 工商业光伏/储能</text>
          <text x="142" y="158" font-size="10.5" fill="#6b7a90">胜思诚讯 1799.655kWp</text>
          <text x="142" y="172" font-size="10.5" fill="#6b7a90">简康新材料 928.26kWp</text>

          <!-- 瓜沥镇 官一村 -->
          <a href="#tj-cases"><circle cx="330" cy="112" r="9" fill="#0e8f5f" stroke="#fff" stroke-width="3"/></a>
          <text x="230" y="86" font-size="12" font-weight="700" fill="#1d1d1f">瓜沥镇 · 官一村</text>
          <text x="230" y="102" font-size="10.5" fill="#6b7a90">整村光伏 2000kW</text>

          <!-- 瓜沥镇 群力村 -->
          <a href="#tj-cases"><circle cx="286" cy="208" r="9" fill="#0e8f5f" stroke="#fff" stroke-width="3"/></a>
          <text x="302" y="200" font-size="12" font-weight="700" fill="#1d1d1f">群力村</text>
          <text x="302" y="216" font-size="10.5" fill="#6b7a90">整村光伏 1500kW</text>

          <!-- 义桥镇 湘南村 -->
          <a href="#tj-cases"><circle cx="104" cy="302" r="9" fill="#0e8f5f" stroke="#fff" stroke-width="3"/></a>
          <text x="36" y="272" font-size="12" font-weight="700" fill="#1d1d1f">义桥镇 · 湘南村</text>
          <text x="36" y="288" font-size="10.5" fill="#6b7a90">整村光伏 2000kW</text>

          <!-- 所前镇 三泉王村 -->
          <a href="#tj-cases"><circle cx="238" cy="300" r="11" fill="#b45309" stroke="#fff" stroke-width="3"/></a>
          <text x="120" y="334" font-size="12" font-weight="700" fill="#b45309">所前镇 · 三泉王村</text>
          <text x="120" y="350" font-size="10.5" fill="#6b7a90">9.36MW 光伏 + 2MW/4MWh 储能 + 23 台充电桩</text>
        </svg>
        <div class="tj-map-legend">
          <span><i style="background:#0b74ff"></i>工商业光伏 / 储能</span>
          <span><i style="background:#0e8f5f"></i>整村光伏示范</span>
          <span><i style="background:#b45309"></i>村级源网荷储充微电网</span>
        </div>
      </div>
    </div>

    <!-- 07 资料查看 -->
    <div class="tj-section" id="tj-docs">
      <div class="tj-sec-head">
        <div class="tj-sec-t">07 企业资料</div>
        <div class="tj-sec-d">点击查看（仅预览，不提供下载）</div>
      </div>
      <div class="tj-docs">
        <button class="tj-doc" type="button" id="tj-doc-license">
          <div class="tj-doc-ico">🪪</div>
          <div class="tj-doc-body"><div class="tj-doc-t">营业执照</div><div class="tj-doc-d">杭州塔建新能源科技集团有限公司 · 可预览</div></div>
          <span class="tj-doc-go">查看 ›</span>
        </button>
        <button class="tj-doc" type="button" id="tj-doc-profile">
          <div class="tj-doc-ico">📘</div>
          <div class="tj-doc-body"><div class="tj-doc-t">塔建集团企业简介</div><div class="tj-doc-d">2026.10 版 · ${PROFILE_DOC.length} 页</div></div>
          <span class="tj-doc-go">查看 ›</span>
        </button>
        <button class="tj-doc" type="button" id="tj-doc-ppt">
          <div class="tj-doc-ico">📊</div>
          <div class="tj-doc-body"><div class="tj-doc-t">三泉王村源网荷储充一体化智慧微电网建设方案</div><div class="tj-doc-d">${PPT_DOC.length} 页 · 项目方案</div></div>
          <span class="tj-doc-go">查看 ›</span>
        </button>
      </div>
    </div>

    <div class="tj-section" id="tj-brands">
      <div class="tj-sec-head">
        <div class="tj-sec-t">战略合作生态</div>
        <div class="tj-sec-d">设备、投资、施工、运维等合作方（资料提供）</div>
      </div>
      <div class="tj-card">
        <div class="tj-brands">
          ${BRANDS.map((b) => `<span class="tj-brand">${ui.esc(b)}</span>`).join('')}
        </div>
        <div class="tiny dim mt8">以上合作方名单来自塔建集团企业简介；具体合作关系以各方协议为准。</div>
      </div>
    </div>

    <!-- 08 申请合作 -->
    <div class="tj-section" id="tj-contact">
      <div class="tj-sec-head">
        <div class="tj-sec-t">08 申请合作 / 报价</div>
        <div class="tj-sec-d">工商业光伏、储能、整村微电网均可提交需求</div>
      </div>
      <button class="btn btn-primary btn-block" id="tj-apply2" type="button" style="height:46px">提交合作需求</button>
      <div class="tiny dim center mt8">提交后平台与塔建集团商务对接，提供踏勘与方案测算</div>
    </div>

    <div class="bc-foot">
      <div>塔建集团 · 工商业光伏 + 储能 专题</div>
      <div class="tiny dim mt6">资料由塔建集团提供；设备与价格以合同及官方报价为准。</div>
    </div>
  </div>`;

  return {
    title: '塔建集团 · 工商业光伏与储能',
    content: html,
    activeTab: 'home',
    showBack: true,
    mount(root) {
      const SHARE_URL = `${location.origin}/#/tajian`;

      /* 分享 */
      root.querySelector('#tj-share')?.addEventListener('click', async () => {
        const m = await import('./share.js');
        await m.openQuickShare({
          title: '塔建集团 · 工商业光伏与储能（浙江）',
          desc: '整镇整村能源 · 工商业光伏 · 工商业储能 · 源网荷储充一体化微电网',
          url: SHARE_URL,
          image: '/static/tajian/company-cover.jpg',
          tag: '塔建集团',
        });
      });

      /* 资料预览 */
      const openDoc = (doc, startTitle) => {
        let idx = 0;
        const mask = document.createElement('div');
        mask.className = 'tj-viewer-mask';
        mask.innerHTML = `<div class="tj-viewer">
          <div class="tj-viewer-head"><span id="tj-v-title">${ui.esc(startTitle)}</span><button class="tj-viewer-x" type="button">✕</button></div>
          <div class="tj-viewer-img-wrap"><img id="tj-v-img" src="${ui.esc(doc[0][0])}" alt=""></div>
          <div class="tj-viewer-foot">
            <button class="btn btn-sm" type="button" id="tj-v-prev">‹ 上一页</button>
            <span class="tiny dim" id="tj-v-idx">1 / ${doc.length}</span>
            <button class="btn btn-sm" type="button" id="tj-v-next">下一页 ›</button>
          </div>
        </div>`;
        document.body.appendChild(mask);
        const img = mask.querySelector('#tj-v-img');
        const idxEl = mask.querySelector('#tj-v-idx');
        const titleEl = mask.querySelector('#tj-v-title');
        const paint = () => {
          img.src = doc[idx][0];
          idxEl.textContent = `${idx + 1} / ${doc.length}`;
          titleEl.textContent = doc[idx][1] || startTitle;
          mask.querySelector('#tj-v-prev').disabled = idx === 0;
          mask.querySelector('#tj-v-next').disabled = idx === doc.length - 1;
        };
        mask.querySelector('#tj-v-prev').addEventListener('click', () => {
          if (idx > 0) {
            idx -= 1;
            paint();
          }
        });
        mask.querySelector('#tj-v-next').addEventListener('click', () => {
          if (idx < doc.length - 1) {
            idx += 1;
            paint();
          }
        });
        const close = () => mask.remove();
        mask.querySelector('.tj-viewer-x').addEventListener('click', close);
        mask.addEventListener('click', (e) => {
          if (e.target === mask) close();
        });
        paint();
      };
      root.querySelector('#tj-doc-license')?.addEventListener('click', () => openDoc(LICENSE_DOC, '营业执照'));
      root.querySelector('#tj-doc-profile')?.addEventListener('click', () => openDoc(PROFILE_DOC, '塔建集团企业简介'));
      root.querySelector('#tj-doc-ppt')?.addEventListener('click', () => openDoc(PPT_DOC, '三泉河村微电网方案'));
      root.querySelectorAll('[data-tj-img]').forEach((btn) => {
        btn.addEventListener('click', () => openDoc([[btn.dataset.tjImg, btn.dataset.tjName]], btn.dataset.tjName));
      });

      /* 申请合作表单 */
      const openApply = (preset) => {
        if (!isLoggedIn()) {
          ui.toast('登录后才能提交合作需求', 'err');
          ctx.nav('#/login');
          return;
        }
        const picked = new Set(preset ? [preset] : ['工商业光伏']);
        ui.openSheet({
          title: '申请合作 / 报价',
          content: `<div class="tiny dim mb8">提交后平台与塔建集团商务会联系您，安排踏勘与方案测算。</div>
            <div class="field"><label>姓名 <span style="color:#e74c3c">*</span></label><input class="input" id="tj-name" maxlength="30" placeholder="您的姓名"></div>
            <div class="field"><label>单位 / 公司 <span style="color:#e74c3c">*</span></label><input class="input" id="tj-org" maxlength="80" placeholder="公司或单位名称"></div>
            <div class="field"><label>电话 <span style="color:#e74c3c">*</span></label><input class="input" id="tj-phone" maxlength="20" placeholder="手机号"></div>
            <div class="field"><label>项目地址 / 城市 <span style="color:#e74c3c">*</span></label><input class="input" id="tj-city" maxlength="60" placeholder="如：杭州市萧山区某镇"></div>
            <div class="field"><label>合作方向 <span class="tiny dim">（可多选）</span></label>
              <div class="chips" id="tj-dirs">${DIRECTIONS.map((d) => `<a class="chip ${picked.has(d) ? 'active' : ''}" data-dir="${d}" href="javascript:;">${d}</a>`).join('')}</div>
            </div>
            <div class="field"><label>屋顶面积 / 用电量 <span class="tiny dim">（选填）</span></label>
              <input class="input" id="tj-scale" maxlength="60" placeholder="如：屋顶 1 万㎡ / 年用电 600 万度"></div>
            <div class="field"><label>需求说明</label><textarea class="textarea" id="tj-note" rows="3" maxlength="1000" placeholder="如：工厂屋顶想装光伏 + 储能，希望了解投资模式与收益"></textarea></div>
            <div class="field"><label>补充资料 <span class="tiny dim">（选填，可多选）</span></label>
              <input type="file" id="tj-files" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*">
              <div class="tiny dim mt6">可上传屋顶照片、电费单、场地图纸等</div>
            </div>
            <button class="btn btn-primary btn-block mt8" id="tj-submit">提交合作需求</button>`,
          onMount(sheet, close) {
            sheet.querySelector('#tj-dirs')?.addEventListener('click', (ev) => {
              const chip = ev.target.closest('[data-dir]');
              if (!chip) return;
              ev.preventDefault();
              const d = chip.dataset.dir;
              if (picked.has(d)) picked.delete(d);
              else picked.add(d);
              chip.classList.toggle('active', picked.has(d));
            });
            sheet.querySelector('#tj-submit').addEventListener('click', async (e) => {
              const btn = e.currentTarget;
              const name = String(sheet.querySelector('#tj-name').value || '').trim();
              const org = String(sheet.querySelector('#tj-org').value || '').trim();
              const phone = String(sheet.querySelector('#tj-phone').value || '').trim();
              const city = String(sheet.querySelector('#tj-city').value || '').trim();
              const scale = String(sheet.querySelector('#tj-scale').value || '').trim();
              const note = String(sheet.querySelector('#tj-note').value || '').trim();
              const files = Array.from(sheet.querySelector('#tj-files')?.files || []);
              if (!name) return ui.toast('请填写姓名', 'err');
              if (!org) return ui.toast('请填写单位', 'err');
              if (!phone) return ui.toast('请填写电话', 'err');
              if (!city) return ui.toast('请填写项目地址 / 城市', 'err');
              btn.disabled = true;
              const oldText = btn.textContent;
              try {
                const fileIds = [];
                for (let k = 0; k < files.length; k += 1) {
                  btn.textContent = `上传资料 ${k + 1}/${files.length}…`;
                  try {
                    const up = await api.uploadFile(files[k]);
                    const rec = (up && up.files && up.files[0]) || up;
                    if (rec && rec.id) fileIds.push(rec.id);
                  } catch {
                    /* 单个失败不影响 */
                  }
                }
                btn.textContent = '提交中…';
                const dirText = [...picked].join('、') || '工商业光伏';
                const text = `【塔建集团 · 新能源合作】杭州塔建新能源科技集团有限公司

合作单位：${org}
联系人：${name}
电话：${phone}
项目地址 / 城市：${city}
合作方向：${dirText}
屋顶面积 / 用电量：${scale || '（未填写）'}

需求说明：
${note || '（未填写，可由商务电话沟通）'}

可合作内容：
· 工商业光伏（业主电费打折 / EPC / 合同能源管理）
· 工商业储能（华为 EMS，一充一放 / 两充两放）
· 整镇整村能源 / 村级微电网（源网荷储充一体化）
· 项目投资、建设、运维全流程服务

（补充资料 ${fileIds.length} 个，见附件）`;
                const res = await service.createListing(
                  api.form({
                    category: 'project',
                    title: `寻求合作｜${org} · 塔建集团新能源`.slice(0, 80),
                    subtitle: `${city} · ${org} · 工商业光伏 / 储能合作需求`,
                    text,
                    type: '寻求合作',
                    durationDays: 180,
                    contactName: name,
                    phone,
                    company: org,
                    publish: '1',
                    fileIds,
                  }),
                );
                close();
                ui.toast('已提交，商务会尽快联系您', 'ok');
                ctx.nav(`#/detail/${res.listing.id}`);
              } catch (err) {
                btn.disabled = false;
                btn.textContent = oldText;
                ui.toast(err.message || '提交失败', 'err');
              }
            });
          },
        });
      };
      root.querySelector('#tj-apply')?.addEventListener('click', () => openApply('工商业光伏'));
      root.querySelector('#tj-apply2')?.addEventListener('click', () => openApply('工商业光伏'));
    },
  };
}

export default { renderTajian };
