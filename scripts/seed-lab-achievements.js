// 5 个重点实验室的成果推介（必须 UTF-8 保存，可重复执行）
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

const now = Date.now();
const iso = (d) => new Date(now - d * 86400000).toISOString();

const seeds = [
  {
    id: 'l_lab_zhijiang',
    title: '成果推介：之江实验室',
    subtitle: '智能计算 · 智能感知 · 智能网络 · 智能系统｜智能计算浙江省实验室',
    text: `【实验室概况】
之江实验室是智能计算浙江省实验室，位于杭州余杭，聚焦智能计算方向，
是国内最早以大科学装置思路做智能计算的科研机构之一。

【主攻方向】
1. 智能计算 —— 高效能计算架构、异构算力调度、存算一体、光电融合计算
2. 智能感知 —— 多模态感知、智能成像、传感芯片
3. 智能网络 —— 确定性网络、卫星互联网、天地一体化
4. 智能系统 —— 科学大模型、智能体、AI for Science

【可对外转化方向】
· 高性能算力调度与调度算法（适合智算中心、IDC 运营商）
· 多模态感知与智能成像算法（适合工业质检、无人系统）
· 科学计算大模型与行业微调方案（适合能源、材料、生物医药研发）
· 卫星互联网与确定性网络关键技术（适合通信设备商、运营商）

【合作方式】
· 联合实验室 / 联合研究中心共建
· 技术委托开发、技术许可、作价入股
· 优先面向有真实场景与数据的企业（能源、制造、医疗）

【对接说明】
科技成果转化需经实验室成果转化部门评估，
平台可协助对接初步沟通，具体条款由双方直接商定。`,
    subs: [
      { id: 'intelligent-computing', name: '智算中心', industryId: 'computing-power' },
      { id: 'model-training', name: '大模型训练', industryId: 'computing-power' },
    ],
    industries: [{ id: 'computing-power', name: '算力' }],
    tags: ['之江实验室', '智能计算', '成果推介', '杭州'],
    daysAgo: 1,
    views: 128,
  },
  {
    id: 'l_lab_liangzhu',
    title: '成果推介：良渚实验室',
    subtitle: '系统医学 · 精准诊治 · 遗传与系统性疾病｜生命健康浙江省实验室',
    text: `【实验室概况】
良渚实验室（系统医学与精准诊治浙江省实验室）依托浙江大学建设，
位于杭州余杭，聚焦生命健康领域的基础研究与临床转化。

【主攻方向】
1. 遗传与系统性疾病 —— 罕见病、遗传病致病机制与诊断
2. 精准诊治 —— 分子分型、伴随诊断、个体化用药
3. 生物医学大数据 —— 多组学整合、疾病队列、AI 辅助诊断
4. 创新药物与器械 —— 靶点发现、成药性评价、医疗器械工程化

【可对外转化方向】
· 疾病早筛与伴随诊断试剂盒（需与 IVD 企业合作）
· AI 辅助影像 / 病理诊断算法（需标注数据与临床验证）
· 药物靶点与先导化合物（适合药企、CRO）
· 多组学数据平台与生物信息分析服务

【合作方式】
· 技术转让 / 专利许可（诊断试剂、算法、靶点）
· 联合开发（与企业共建临床验证与产业化路径）
· 作价入股成立公司（需完成成果评估与合规审批）

【对接说明】
涉及医疗健康，需严格遵守伦理、临床与注册路径。
平台可先做需求匹配，具体合作由实验室与合作方直接推进。`,
    industries: [{ id: 'life-health', name: '生命健康' }],
    subs: [],
    tags: ['良渚实验室', '生命健康', '精准医疗', '成果推介'],
    daysAgo: 2,
    views: 96,
  },
  {
    id: 'l_lab_tianmushan',
    title: '成果推介：天目山实验室',
    subtitle: '超声速绿色民机 · 低空经济 · 航空材料｜航空浙江省实验室',
    text: `【实验室概况】
天目山实验室聚焦超声速绿色民机新原理与基础前沿技术研究，
位于杭州余杭瓶窑，围绕航空领域开展应用基础研究与工程化验证。

【主攻方向】
1. 超声速绿色民机智能设计
2. 绿色民用航空发动机一体化设计
3. 高性能航空材料与先进制造
4. 智能飞行管理与高效机载能量综合
5. 低空经济 —— 无人机运营与监管、低空飞控

【已公开的代表性成果】
· 「天目山一号」无人机及 2.0 版本
· 天目低空无人机运营与监管平台（已完成演示验证）
· αLiDAR 激光雷达（智能感知方向）
· 天目综合热管理 —— 把航发冷却技术用于 5G 基站散热
· 天目能源 —— 面向无人机超长续航的能源方案

【可对外转化方向】
· 低空无人机整机 / 飞控 / 监管平台（适合低空经济运营商、地方政府）
· 激光雷达与智能感知模组（适合自动驾驶、安防、测绘）
· 高效热管理方案（适合通信基站、储能、数据中心）
· 航空级轻量化材料与先进制造工艺

【合作方式】
· 技术许可 / 技术转让
· 联合研发与场景验证（有真实场地的企业优先）
· 低空经济示范项目共建（与地方政府、园区）`,
    industries: [
      { id: 'aerospace', name: '航空航天' },
      { id: 'new-energy', name: '新能源' },
    ],
    subs: [
      { id: 'uav', name: '无人机', industryId: 'aerospace' },
      { id: 'low-altitude', name: '低空经济', industryId: 'aerospace' },
    ],
    tags: ['天目山实验室', '低空经济', '无人机', '航空材料', '成果推介'],
    daysAgo: 3,
    views: 214,
  },
  {
    id: 'l_lab_baimahu',
    title: '成果推介：白马湖实验室',
    subtitle: '太阳转化与催化 · 零碳能源存储 · 多能耦合｜能源与碳中和浙江省实验室',
    text: `【实验室概况】
白马湖实验室（能源与碳中和浙江省实验室）由浙江省能源集团牵头，
联合浙江大学、西湖大学共建，总部位于杭州滨江白马湖畔。

【主攻方向】
1. 太阳能转化与催化 —— 高效光伏、光催化制氢
2. 零碳能源转化与存储 —— 新型储能、氢能、碳捕集利用
3. 能源低碳转化与多能耦合 —— 综合能源系统、虚拟电厂

【平台条件】
· 仪器平台对外开放（材料表征、电化学测试、催化评价）
· 概念验证中心 —— 支持早期成果做工程化验证
· 与浙能集团旗下电厂、新能源电站有真实应用场景

【可对外转化方向】
· 光伏电池新材料与工艺（钙钛矿、叠层、钝化材料）
· 长时储能与新型电池体系（液流、钠离子、固态）
· 绿氢制备与加氢站关键技术
· 综合能源系统优化与虚拟电厂调度算法
· 碳捕集、利用与封存（CCUS）工艺包

【合作方式】
· 技术许可 / 转让 / 作价入股
· 概念验证合作（适合有早期技术、缺验证条件的团队）
· 与浙能集团产业方联合示范（有真实电站场景）

【对接说明】
实验室明确把「科技成果转化孵化」列为定位之一，
对接意愿较强，可安排实地考察仪器平台与概念验证中心。`,
    industries: [NE],
    subs: [
      { id: 'pv', name: '光伏', industryId: 'new-energy' },
      { id: 'storage', name: '储能', industryId: 'new-energy' },
      { id: 'hydrogen', name: '氢能', industryId: 'new-energy' },
    ],
    tags: ['白马湖实验室', '碳中和', '储能', '氢能', '概念验证', '成果推介'],
    daysAgo: 4,
    views: 187,
  },
  {
    id: 'l_lab_beihang',
    title: '成果推介：北航杭研院',
    subtitle: '航空航天 · 微电子 · 智能感知｜北京航空航天大学杭州创新研究院',
    text: `【机构概况】
北京航空航天大学杭州创新研究院（北航杭研院）是北航与杭州市共建的
新型研发机构，聚焦航空航天与信息技术交叉领域，开展应用研究与成果转化。

【主攻方向】
1. 航空航天 —— 飞行器设计、飞控、结构与材料
2. 微电子与集成电路 —— 专用芯片、射频、MEMS
3. 智能感知与导航 —— 惯性导航、组合导航、智能传感
4. 人工智能与工业软件 —— 数字孪生、仿真优化

【可对外转化方向】
· 惯性 / 组合导航模组（适合无人机、无人车、工程机械）
· 专用芯片与 MEMS 器件（适合工业、汽车电子）
· 飞行器总体设计与气动优化服务
· 数字孪生与仿真优化平台（适合制造企业）

【合作方式】
· 技术开发 / 技术咨询 / 技术服务（横向课题）
· 专利许可与转让
· 联合培养与人才合作（硕士、博士、博士后）
· 作价入股成立学科性公司

【平台条件】
依托北航学科与实验室资源，具备从原理样机到工程样机的完整验证能力，
与杭州本地航空航天、低空经济产业链企业合作较多。`,
    industries: [
      { id: 'aerospace', name: '航空航天' },
      { id: 'computing-power', name: '算力' },
    ],
    subs: [
      { id: 'uav', name: '无人机', industryId: 'aerospace' },
      { id: 'sensor', name: '传感器', industryId: 'robotics' },
    ],
    tags: ['北航杭研院', '航空航天', '导航', '芯片', '成果推介'],
    daysAgo: 5,
    views: 162,
  },
];

const arr = JSON.parse(fs.readFileSync(P, 'utf8'));
const kept = arr.filter((x) => !String(x.id || '').startsWith('l_lab_'));
const before = arr.length;

for (const s of seeds) {
  if (kept.some((x) => x.id === s.id)) continue;
  kept.push({
    id: s.id,
    category: 'tech',
    type: 'achievement-publish',
    typeName: '成果发布',
    title: s.title,
    subtitle: s.subtitle,
    text: s.text,
    textFromFiles: '',
    industries: s.industries,
    subs: s.subs,
    cities: [HZ],
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
    expiresAt: new Date(now - s.daysAgo * 86400000 + 180 * 86400000).toISOString(),
    durationDays: 180,
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
for (const k of kept.filter((x) => x.id.startsWith('l_lab_'))) {
  console.log('  ' + k.title);
}
