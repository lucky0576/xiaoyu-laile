// 造 5 条「科技成果转化」演示数据（必须 UTF-8 保存，可重复执行）
const fs = require('fs');
const P = 'data/collections/listings.json';

const OWNER_ID = 'use_mvjijwrp0sc518';
const OWNER = {
  id: OWNER_ID,
  nickname: '卢云',
  avatar: '',
  company: '授渔算法（上海）科技有限公司',
  verified: true,
  industry: '新能源',
  city: '杭州',
};

const NE = { id: 'new-energy', name: '新能源' };
const HZ = { id: 'hangzhou', name: '杭州市', province: '浙江省' };
const SH = { id: 'shanghai', name: '上海市', province: '上海市' };
const BJ = { id: 'beijing', name: '北京市', province: '北京市' };

const now = Date.now();
const iso = (d) => new Date(now - d * 86400000).toISOString();

const seeds = [
  {
    id: 'l_demo_tech_pv',
    type: 'achievement-publish',
    typeName: '成果发布',
    title: '杭州市·光伏｜钙钛矿/晶硅叠层电池中试线技术成果发布（效率 33.2%）',
    subtitle: '中试效率 33.2%（1cm²）· 已完成 1000 小时光热老化 · 寻求产业化承接方',
    text: `【成果名称】钙钛矿/晶硅叠层电池中试制备技术

【技术指标】
· 小面积（1cm²）认证效率 33.2%，大面积（210×105mm）效率 28.6%
· 1000 小时双 85 老化（85℃/85%RH）衰减 <5%
· 组件级封装方案已打通，可兼容现有晶硅产线改造

【成熟度】
中试阶段（TRL 6），已完成 300mm×300mm 级别样片制备，
具备直接对接 100MW 级中试线的条件。

【合作方式】
· 技术作价入股，评估价待第三方机构出具
· 或专利许可（独占 / 排他可谈），按年付费 + 量产提成
· 可提供工艺包、设备选型清单、技术人员驻场支持

【已有知识产权】
发明专利 12 项（授权 8 项），PCT 3 项，软著 2 项。

【团队】
依托长三角某高校光伏研究中心，核心成员 9 人，
其中教授 2 人、博士 5 人，承担过国家重点研发计划课题。

联系方式通过平台对接，可安排线上路演。`,
    industries: [NE],
    subs: [
      { id: 'pv', name: '光伏', industryId: 'new-energy' },
      { id: 'energy-storage-material', name: '储能材料', industryId: 'new-energy' },
    ],
    cities: [HZ],
    tags: ['钙钛矿', '叠层电池', '中试', '技术作价入股'],
    daysAgo: 2,
    views: 268,
  },
  {
    id: 'l_demo_tech_demand',
    type: 'tech-demand',
    typeName: '技术需求',
    title: '上海市·储能｜储能 PCS 低温工况效率衰减技术难题，寻求高校院所联合攻关',
    subtitle: '-30℃ 工况效率衰减 >8% · 预算 300 万 · 期望 12 个月内出方案',
    text: `【需求背景】
我们在内蒙古、新疆等地部署的工商业储能项目中，
PCS 在 -30℃ 低温启动时效率从 97.5% 掉到 89% 左右，
导致冬季峰谷套利收益下降约 18%，客户投诉较多。

【技术难点】
1. 低温下 IGBT 开关损耗上升，驱动电路参数漂移
2. 电解电容 ESR 增大，纹波抑制能力下降
3. 现有预热策略耗电高（占日发电量 3%），不划算

【期望目标】
· -30℃ 环境下满载效率 ≥ 94%
· 预热能耗 ≤ 日发电量的 1%
· 成本增幅控制在 5% 以内

【合作方式】
· 委托开发：预算 300 万元，分三期支付
· 或联合申报省部级科技项目，我方配套资金
· 成果共享：我方享有优先实施权，贵方保留署名与学术发表权

【我方条件】
年出货 PCS 约 1.2GW，有完整的低温实验室与现场测试条件，
可提供样机、实测数据与工程团队配合。`,
    industries: [NE],
    subs: [
      { id: 'storage', name: '储能', industryId: 'new-energy' },
      { id: 'pv', name: '光伏', industryId: 'new-energy' },
    ],
    cities: [SH],
    tags: ['PCS', '低温', '储能', '委托开发'],
    daysAgo: 4,
    views: 192,
  },
  {
    id: 'l_demo_tech_patent',
    type: 'patent-transfer',
    typeName: '专利转让',
    title: '杭州市·光伏｜水面光伏漂浮基础防腐专利包转让（8 项发明专利）',
    subtitle: '盐碱水域适用 · 已在中广核、三峡等项目应用 · 整体转让或分项许可',
    text: `【专利包概况】
围绕水面光伏漂浮基础的防腐与锚固，共 8 项发明专利 + 4 项实用新型：
1. 浮体表面复合防腐涂层及其制备方法
2. 盐碱水域用高耐蚀铝合金浮体
3. 浮体-锚链连接件的电化学防腐结构
4. 水面光伏阵列锚固系统及施工方法
5-8. 其余为浮体结构、连接件、检测方法相关

【技术效果】
· 盐碱水域（Cl⁻ 浓度 8000mg/L）实测 5 年腐蚀速率 <0.02mm/年
· 相比常规镀锌钢浮体，全生命周期维护成本下降 40%
· 已在中广核、三峡、国家电投等 6 个渔光互补项目应用，累计 320MW

【权利状态】
全部为授权有效专利，无质押、无许可在先，
可提供专利登记簿副本与年费缴纳凭证。

【交易方式】
· 整体转让：报价 800 万元（可谈）
· 分项许可：按单项目许可，30~80 万元/项目
· 可配合完成技术交底、现场指导与后续改进支持`,
    industries: [NE],
    subs: [{ id: 'pv', name: '光伏', industryId: 'new-energy' }],
    cities: [HZ],
    tags: ['专利转让', '水面光伏', '防腐', '渔光互补'],
    daysAgo: 6,
    views: 341,
  },
  {
    id: 'l_demo_tech_equity',
    type: 'tech-equity',
    typeName: '技术作价入股',
    title: '北京市·储能｜退役动力电池梯次利用分选工艺，作价入股寻求产业化合作',
    subtitle: '分选准确率 96.5% · 单线年处理 5000 吨 · 期望占股 15~25%',
    text: `【成果概况】
退役动力电池快速分选与重组工艺，核心是
基于电化学阻抗谱（EIS）+ 机器学习的状态快速评估算法。

【技术指标】
· 单体容量/SOH 评估误差 <2%
· 分选准确率 96.5%（对比传统电压内阻法 78%）
· 单电芯检测耗时 8 秒，单线年处理能力 5000 吨
· 已建成 2000 吨/年产线并稳定运行 14 个月

【产业化需求】
我们掌握工艺与算法，但缺乏规模化产能、渠道与资金。
希望寻找具备以下条件的企业合作：
· 已有电池回收或pack产线
· 有储能集成或两轮车/低速车客户渠道
· 能提供 3000 万元以上产线投入

【合作方式】
· 技术作价入股，期望占新公司 15~25%（估值可谈）
· 我方派出技术负责人，负责工艺落地与迭代
· 亦可先做技术许可 + 对赌，达标后转股权

【知识产权】
发明专利 6 项（授权 4 项），软著 3 项，均为职务发明，权属清晰。`,
    industries: [NE],
    subs: [
      { id: 'storage', name: '储能', industryId: 'new-energy' },
      { id: 'battery', name: '蓄电', industryId: 'new-energy' },
    ],
    cities: [BJ],
    tags: ['梯次利用', '退役电池', '作价入股', '分选'],
    daysAgo: 9,
    views: 415,
  },
  {
    id: 'l_demo_tech_lab',
    type: 'industry-academia',
    typeName: '产学研合作',
    title: '杭州市·光伏｜共建光伏组件可靠性联合实验室，寻求组件企业共同投入',
    subtitle: '已投入 1200 万设备 · 期望企业方配套 500 万 · 共建期 3 年',
    text: `【合作背景】
我方（高校可靠性研究中心）已建成光伏组件加速老化实验平台，
设备投入约 1200 万元，具备：
· 多通道湿热老化箱（DH 1000/2000/4000 小时）
· 紫外老化箱、盐雾箱、机械载荷测试台
· EL/PL 成像、IV 曲线扫描、PID 测试系统
· 户外实证电站 2 个（杭州、银川），装机 800kW

【合作内容】
1. 联合开展组件长期可靠性研究（封装材料、边框、接线盒）
2. 共建数据库，向合作企业开放实测数据
3. 联合申报国家/省部级项目、联合发布白皮书
4. 企业可获得：优先测试通道、失效分析报告、人才联合培养

【企业方投入】
· 3 年共 500 万元（可分期，用于设备扩充与人员）
· 每年提供不少于 200 块试验组件
· 可派驻 1~2 名工程师参与研究

【我方投入】
· 场地、设备、教授团队 6 人、博士/硕士研究生 12 人
· 每年出具不少于 4 份专项研究报告
· 联合署名发表论文不少于 3 篇/年

【已有基础】
近三年承担国家自然科学基金 2 项、省重点研发 1 项，
与 5 家组件企业有过横向合作，累计合同额 2100 万元。`,
    industries: [NE],
    subs: [{ id: 'pv', name: '光伏', industryId: 'new-energy' }],
    cities: [HZ],
    tags: ['产学研', '联合实验室', '可靠性', '组件'],
    daysAgo: 12,
    views: 156,
  },
];

const arr = JSON.parse(fs.readFileSync(P, 'utf8'));
const kept = arr.filter((x) => !String(x.id || '').startsWith('l_demo_tech_'));
const before = arr.length;

for (const s of seeds) {
  if (kept.some((x) => x.id === s.id)) continue;
  kept.push({
    id: s.id,
    category: 'tech',
    type: s.type,
    typeName: s.typeName,
    title: s.title,
    subtitle: s.subtitle,
    text: s.text,
    textFromFiles: '',
    industries: s.industries,
    subs: s.subs,
    cities: s.cities,
    keywords: s.tags,
    tags: s.tags,
    files: [],
    coverId: '',
    coverUrl: '',
    coverFileId: '',
    ownerId: OWNER_ID,
    ownerSnapshot: OWNER,
    company: OWNER.company,
    contact: { name: '卢云', phone: '13456693544', wechat: '', company: OWNER.company },
    hideContact: false,
    status: 'published',
    publishedAt: iso(s.daysAgo),
    createdAt: iso(s.daysAgo),
    updatedAt: iso(s.daysAgo),
    expiresAt: new Date(now - s.daysAgo * 86400000 + 90 * 86400000).toISOString(),
    durationDays: 90,
    views: s.views,
    commentCount: 0,
    followerCount: 0,
    shareCount: 0,
    likeCount: 0,
    likedBy: [],
    ai: {},
    pipeline: {},
    chatRoomId: '',
    meetingIds: [],
    agreements: [],
    followUps: [],
    warnings: [],
    expiryReminded: false,
    autoInfo: {},
  });
}

fs.writeFileSync(P, JSON.stringify(kept, null, 2));
console.log('BEFORE=' + before + ' AFTER=' + kept.length);
for (const k of kept.filter((x) => x.category === 'tech')) {
  console.log('  [' + k.typeName + '] ' + k.title.slice(0, 44));
}
